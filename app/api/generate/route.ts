import { NextRequest, NextResponse } from "next/server";
import { createEngine, type BoardData } from "@/engine";
import { boardToPredictions, mergeDayBlob, type DayBlob, type GenStamp } from "@/lib/pred-serialize";
import { computeCfSel, type CfSelResult } from "@/lib/cfsel";
import { buildEcho, sha256Text } from "@/lib/engine-echo";
import { effectiveCalibration, type CalibrationSummary, type WeightState } from "@/engine2/calibration";
import { cronHeaderAuthed, redis, redisGetJson, redisSetJson, storeEnv, syncAuthed } from "@/lib/server/store";
import { achievableCoverage, liveCoverageOf, pricedGames } from "@/lib/board-coverage";
import { BOARD_GEN_KEY, BOARD_GENS_KEY, BOARD_KEY, decodeBoard, encodeBoard, liveCoverage, mergeGenIndex, type GenIndexEntry } from "@/lib/server/board-store";
import { ptToday } from "@/lib/server/pt-date";
import { slateScope } from "@/lib/server/slate";
import { buildLockEntry, writeLock } from "@/lib/server/lock-card";

/**
 * Vercel-side daily board generation (calibration 3A, self-driving): the SAME
 * sandboxed engine the app runs in the browser executes here on a morning
 * cron, so every slate's full board is logged and graded even on days the
 * app is never opened. Josh's on-device generates still upsert on top (the
 * last pre-start statement per pick wins; the merge rules in pred-serialize
 * freeze anything graded or already past first pitch).
 *
 * Costs real Odds API credits per run, so the gate is strict: the sync
 * phrase always works; otherwise only Vercel's cron user-agent inside the
 * pre-slate window, with a 45-minute rate cap.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** docs/collection-period.md, frozen row "selection mode default". The cron has no
    localStorage to read pl_selmode from, so the frozen default is stated here. */
const CRON_SEL_MODE = "ev_gated";

const K_LASTGEN = "pl:gen:lastRun";
const K_RUNS = "pl:gen:runs:";
/** 114-150 Odds credits a run (measured), so a leaked secret costs at most ~450 in a
    day. Lowered 4 → 3 on 2026-07-25: a normal day under the day-of-week split is 2
    (the cron, plus one lock-guard regenerate), so 3 leaves room for one mistake while
    keeping a leak nearer the plan. NOTE: this bounds SERVER runs only — an in-app
    regenerate executes in the browser and never reaches this route, so the cap does
    not bound the spend most likely to run away. See docs/credit-budget.md. */
const MAX_RUNS_PER_DATE = 3;
const DAYS_SET = "pl:pred:days";
const dayKey = (d: string) => `pl:pred:${d}`;
const MAX_BYTES = 3_000_000;

function selfBase(): string {
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return prod ? `https://${prod}` : "https://parlay-lab-six.vercel.app";
}

/** The engine's network layer on the server: odds direct with the server key. */
async function serverFetchJson(url: string): Promise<{ ok: boolean; body: unknown }> {
  try {
    let target = url;
    try {
      const u = new URL(url);
      if (u.hostname === "api.the-odds-api.com") {
        const key = process.env.ODDS_API_KEY;
        if (!key) return { ok: false, body: {} };
        u.searchParams.set("apiKey", key);
        target = u.toString();
      }
    } catch {
      /* relative URL — fetch as-is */
    }
    const r = await fetch(target, { cache: "no-store" });
    const body = await r.json().catch(() => null);
    return { ok: r.ok && body != null, body: body ?? {} };
  } catch {
    return { ok: false, body: {} };
  }
}

/** First-pitch times for a date, straight from statsapi. Keyless and free — it
    spends no Odds credits, which is the point: the check that prevents a wasted
    ~120-credit run must never cost credits itself. Empty on any failure, which
    degrades to the previous behaviour (run). */
async function slateStarts(date: string): Promise<number[]> {
  try {
    const r = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`, { cache: "no-store" });
    if (!r.ok) return [];
    const j = (await r.json()) as { dates?: { games?: { gameDate?: string }[] }[] };
    return (j.dates?.[0]?.games ?? [])
      .map((g) => (g.gameDate ? Date.parse(g.gameDate) : NaN))
      .filter((n) => isFinite(n));
  } catch {
    return [];
  }
}

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

export async function GET(req: NextRequest) {
  if (!storeEnv()) return NextResponse.json({ error: "sync-not-configured" }, { status: 503 });
  const manual = syncAuthed(req);
  // Phase 1a: an external scheduler (cron-job.org) drives the second, post-lineup
  // pass — Vercel Hobby allows only 2 crons and both are spoken for. The secret
  // travels in a HEADER, never the query string: this route spends money.
  const scheduled = !manual && cronHeaderAuthed(req);
  if (!manual && !scheduled) {
    const ua = req.headers.get("user-agent") ?? "";
    const hour = new Date().getUTCHours();
    if (!ua.startsWith("vercel-cron") || hour < 12 || hour >= 21) {
      // (c) leave a trail a probe would show up in — this endpoint spends quota,
      // so repeated 401s here are worth noticing in the Vercel logs
      console.warn(
        `[generate] unauthorized attempt ua=${JSON.stringify(ua.slice(0, 80))} hour=${hour}UTC ` +
          `key=${req.headers.get("x-cron-key") ? "header-bad" : req.nextUrl.searchParams.get("key") ? "query-attempt" : "none"} ` +
          `ip=${req.headers.get("x-forwarded-for") ?? "?"}`,
      );
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  if (!process.env.ODDS_API_KEY) return NextResponse.json({ error: "no ODDS_API_KEY" }, { status: 503 });

  try {
    const now = Date.now();
    const lastRun = Number(await redis(["GET", K_LASTGEN])) || 0;
    const force = manual && req.nextUrl.searchParams.get("force") === "1";
    if (!force && now - lastRun < 45 * 60_000) {
      return NextResponse.json({ ok: true, skipped: "ran recently" });
    }
    /* PACIFIC, not server-local. On a UTC host every run after 00:00 UTC used to key
       the run cap, the stored board and the prediction rows to TOMORROW — so a Pacific
       client asking /api/board for today got a miss and paid to generate its own. */
    const dateNow = ptToday();
    const runsKey = `${K_RUNS}${dateNow}`;
    /* CONDITIONAL SKIP: a good board for this date already exists, so don't buy a
       second one. Coverage is measured over games that have NOT started — a morning
       board can read high coverage with all of it already underway. Manual callers
       with ?force=1 bypass this; the cron never does.

       THIS NOW RUNS BEFORE THE RUN CAP (2026-07-27). It used to run after, so a skipped
       fire spent budget it had not spent a credit of. With four scheduler entries live
       that was already wrong today, with no redundancy needed to trigger it: a day with
       two skips — a dead slate and a covered slate — plus one manual regenerate leaves
       the third legitimate fire hitting 429 and no board getting built. A cap named for
       spend must count spend. Everything below this point is free: `slateStarts` is
       keyless statsapi and the stored-board read is Redis. */
    if (!force) {
      const existing = decodeBoard((await redis(["GET", BOARD_KEY(dateNow)])) as string | null);
      /* The schedule is consulted INDEPENDENTLY of any stored board, because an empty
         store would otherwise always mean "run" — and on a Sunday at 22:00, with the
         whole early slate long since started, that buys ~120 Odds credits of nothing.
         statsapi is keyless and free, so the emptiest case is the cheapest to answer. */
      const starts = await slateStarts(dateNow);
      const cov = liveCoverage(existing, now, starts);
      if (cov.skip) {
        return NextResponse.json({
          ok: true,
          skipped: cov.reason,
          live: cov.live,
          confirmed: cov.confirmed,
          pct: cov.pct,
        });
      }
    }

    /* (b) PER-DATE RUN CAP — the real protection. The secret stops a stranger; this
       stops a LEAK from draining the month: each run costs ~120 Odds credits, so a
       hard ceiling of MAX_RUNS_PER_DATE bounds the damage at ~480 no matter how hard
       the endpoint is hit. Expires with the date.

       COUNTED HERE, AT THE POINT OF COMMITMENT — past every free exit, immediately
       before the work that spends. Not *after* `collectSlate()`, which is the reading
       "count spend" invites: `collectSlate()` fetches for ~15 games × 6 markets against
       a 60 s `maxDuration`, so a timeout or an upstream 5xx spends the credits and
       throws. Incrementing afterwards would count zero for every such run and leave the
       ceiling unbounded exactly when it is needed. `K_LASTGEN` (the 45-minute limiter)
       is set on the same line for the same reason — both are pessimistic on purpose. */
    const runs = Number(await redis(["INCR", runsKey])) || 0;
    if (runs === 1) await redis(["EXPIRE", runsKey, String(3 * 86_400)]);
    if (runs > MAX_RUNS_PER_DATE) {
      console.warn(`[generate] run cap hit: ${runs} spending runs on ${dateNow} (cap ${MAX_RUNS_PER_DATE})`);
      return NextResponse.json(
        { error: "run cap reached for this date", runs, cap: MAX_RUNS_PER_DATE },
        { status: 429 },
      );
    }
    await redis(["SET", K_LASTGEN, String(now)]);

    // arm the same v2 stack the app arms (armV2 in engine-client)
    const base = selfBase();
    /* echo (2026-07-29): the two model artifacts are fetched as TEXT so their content
       hashes can be echoed — parse semantics unchanged (JSON.parse === r.json(), same
       null-on-failure path as the old grab). */
    const grabText = (u: string) =>
      fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.text() : null)).catch(() => null);
    const [priorsText, ctxText, summary, weights, auto] = await Promise.all([
      grabText(`${base}/model/priors.json`),
      grabText(`${base}/model/context.json`),
      redisGetJson<CalibrationSummary>("pl:cal:summary"),
      redisGetJson<WeightState>("pl:cal:weights"),
      redis(["GET", "pl:cal:auto"]).catch(() => null),
    ]);
    const parseOrNull = (t: string | null) => {
      if (t == null) return null;
      try {
        return JSON.parse(t);
      } catch {
        return null;
      }
    };
    const priors = parseOrNull(priorsText);
    const ctx = parseOrNull(ctxText);
    // identical computation to the one the app receives from /api/calibration
    const armed = effectiveCalibration(summary, weights, auto === "off" ? "off" : "on");

    /* `today` pins the engine's own shToday() to the Pacific date, so the schedule
       pull, slate.date and every downstream key agree with the ledger's basis. Safe
       now that the engine no longer calls obSameDay (which this option also stubs). */
    const eng = createEngine({ fetchJson: serverFetchJson, storage: memoryStorage(), today: dateNow });
    eng.set("SH_PRIORS", priors);
    eng.set("SH_CTX", ctx);
    eng.set("SH_V2", {
      priors: !!priors,
      ctx: !!ctx,
      shin: true,
      sharpW: true,
      regions: "us,eu",
      sim: true,
      // sim DEPTH is deliberately LOWER here than in the app, and that is settled
      // (Josh, 2026-07-24): this run's sims only ever produce leg-level marginals
      // for the prediction log — it never allocates, so its joints price nothing —
      // and at 16:00 UTC almost no lineup is posted, so the sim path barely engages
      // at all. Measured across 10k→50k, marginals move nothing past 0.10pp (the
      // storage rounding grain). Do not "converge" this to the app's 50k.
      simN: 10000,
      simNHR: 20000,
      projLineup: true,
      /* ARMED ONLY HERE (2026-07-27), not in the app. These are the boards the archive
         keeps, and `data.clampActivity` is what makes the 20-board clamp comparison a
         MEASUREMENT instead of a reconstruction from `case` strings — 25 of 25 sites
         instead of the 1 an archived board could otherwise support. Additive: the clamp
         return value is untouched, proven byte-for-byte against both baselines by
         tests/clamp-instrumentation.test.ts. Leaving the app off keeps its board
         identical to today's. */
      clampLog: true,
      calW: armed.mults,
      calG: armed.globalS,
    });
    /* SH_CFG has no engine-side selMode default and every disciplined branch tests
       it by exact string, so an unset value silently ran the LEGACY board here:
       overs-only hitter props, no HRR suspension tags. docs/collection-period.md
       freezes the selection mode at ev_gated; this restores compliance on the
       surface the drift table never covered. If the app's mode is ever changed,
       this constant moves with it — the arming table is what catches a mismatch. */
    const cfg = eng.get<Record<string, unknown>>("SH_CFG");
    if (cfg) {
      cfg.selMode = CRON_SEL_MODE;
      cfg.mktN = armed.mktN;
    }

    const slate = await eng.collectSlate();
    const data = eng.analyze(slate) as BoardData;
    const date = dateNow;

    /* Persist the BOARD, not just the prediction records. Until this, the cron's work
       could only ever be logged, never bet — the client had no way to load it and paid
       ~120 credits to rebuild the same day. Storing it is what makes retiming the cron
       a saving instead of a doubling. Best-effort: a failure here must never cost the
       run, because the records below are the part that cannot be regenerated later. */
    /* GENERATION-TIME STANDING (2026-07-26). /api/clv refuses to sight a started game;
       this route had no equivalent, so a DELAYED fire built a board that priced games
       already underway and looked completely normal — the silent-no-op shape, traceable
       only by re-deriving coverage from `at` after the fact. GitHub Actions delayed the
       props sweep by up to 8.75h for fifteen days before anyone noticed; cron-job.org's
       punctuality at these hours is unverified (docs/cron-jobs.md), so the first delayed
       fire must produce a LABELLED board rather than a quietly wrong one.
       Recorded, never enforced: the board is still written. Refusing here would trade a
       visible defect for an invisible one. */
    const stampGi = (data.gameInfo ?? {}) as Record<string, { start?: string | null; lu?: boolean }>;
    const stampCov = liveCoverageOf(stampGi, now);
    const startsAll = Object.values(stampGi)
      .map((g) => (g?.start ? Date.parse(g.start) : NaN))
      .filter((t) => isFinite(t));
    const started = startsAll.filter((t) => t <= now);
    /* trigger mark (2026-07-30, owner's ship order): provenance from the route's own
       auth state. On gen, so it rides the board KV + archive (data.gen), the
       prediction store (mergeDayBlob's gens[] spreads gen), and the response — with
       no further plumbing. Guard: tests/trigger-mark.test.ts (observed red first). */
    const trigger = manual
      ? (force ? "manual-forced" as const : "manual" as const)
      : scheduled
        ? ("header" as const)
        : ("cron-ua" as const);
    const gen = {
      at: now,
      trigger,
      /* how far past the EARLIEST first pitch this fire landed. Positive = the board
         priced a slate already underway; that is the number a delay makes move. */
      lateMs: startsAll.length ? now - Math.min(...startsAll) : null,
      /* ...and how close to the NEXT one, which is what lineup coverage turns on */
      leadMs: startsAll.some((t) => t > now) ? Math.min(...startsAll.filter((t) => t > now)) - now : null,
      games: startsAll.length,
      started: started.length,
      live: stampCov.live,
      luConfirmed: stampCov.confirmed,
      luPct: stampCov.pct,
      achievable: achievableCoverage(startsAll, now),
      /* SCOPE STAMP (2026-08-06, operator item 3). games/started above count gameInfo —
         the ENGINE's population (what the odds feed returned). On the 08-06 getaway day
         three games were underway before the scheduler's first poke; a board that never
         saw them would record nothing about them. slate carries the FULL day from
         statsapi (total/started/ready — the standing three-number rule), so the artifact
         itself says why absent games are absent. NULL = the read failed, never a fake 0. */
      slate: await slateScope(date, now),
    };
    if (gen.live === 0) {
      console.warn(`[generate] board built with NO unstarted games — every row is post-start. at=${new Date(now).toISOString()}`);
    } else if (gen.leadMs != null && gen.leadMs > 6 * 3600_000) {
      console.warn(`[generate] board built ${(gen.leadMs / 3600_000).toFixed(1)}h before the next first pitch — lineups likely unposted`);
    }
    (data as Record<string, unknown>).gen = gen;
    /* sha+config ECHO (2026-07-29, owner's authorization) — attached BEFORE the encode
       so it rides the board KV and the archive; also returned in the response body
       below. WRITE-ONLY: this assignment and the response field are the only two
       appearances of `echo` in this route — nothing branches on it and no code path
       reads it back (enforced: tests/engine-echo.test.ts source scan). */
    const cfSelEnabled = process.env.PL_CFSEL !== "off";
    const echo = buildEcho(eng.get<Record<string, unknown>>("SH_CFG") ?? null, {
      priorsSha: priorsText != null ? sha256Text(priorsText) : null,
      ctxSha: ctxText != null ? sha256Text(ctxText) : null,
      cfSelEnabled,
    });
    (data as Record<string, unknown>).echo = echo;
    const enc = encodeBoard({ date, at: now, data });
    if ("error" in enc) {
      console.warn(`[generate] board not stored: ${enc.error}`);
    } else {
      try {
        const TTL = String(3 * 86_400);
        /* per-generation copy FIRST: if the process dies between these writes the day
           keeps the new board under its own key and the old `latest` intact. Writing
           `latest` first would leave a window where the fat board is already gone. */
        await redis(["SET", BOARD_GEN_KEY(date, now), enc.blob, "EX", TTL]);
        const priced = pricedGames(
          data.categories as unknown as Record<string, { gkey?: string | null }[]>,
          stampGi,
          now,
        );
        const prevIdx =
          ((await redisGetJson<GenIndexEntry[]>(BOARD_GENS_KEY(date))) ?? []).filter(
            (g) => g && isFinite(g.at),
          );
        const idx = mergeGenIndex(prevIdx, {
          at: now, priced, live: gen.live, luPct: gen.luPct, bytes: enc.bytes,
        });
        await redisSetJson(BOARD_GENS_KEY(date), idx);
        await redis(["EXPIRE", BOARD_GENS_KEY(date), TTL]);
        /* drop generations that fell off the cap, so they expire with their key rather
           than lingering unreferenced for the full TTL */
        for (const g of prevIdx) {
          if (!idx.some((k) => k.at === g.at)) await redis(["DEL", BOARD_GEN_KEY(date, g.at)]).catch(() => null);
        }
        // `latest` last — the read path and the client are unchanged
        await redis(["SET", BOARD_KEY(date), enc.blob, "EX", TTL]);
      } catch (e) {
        console.warn(`[generate] board store failed: ${(e as Error).message}`);
      }
    }
    /* LOCK-AT-GENERATION (2026-08-05, operator requirement: every day produces a locked card).
       The run that builds the board writes the locked card — picks, prices, stakes, lockedAt,
       trigger, placed:null throughout — as ONE artifact of the run, not a separate step that
       can silently not ship again (it was authorized 08-02 and carried as an asterisk through
       three dark days; that is the defect this block removes). Empty-gate days lock a
       zero-ticket decision record with the blocked-reason histogram. Best-effort with a LOUD
       failure: a lock error rides the response and the log, and the scheduler's self-check
       backfills from the stored board on its next poke, so a transient failure here cannot
       cost the day. Refusal status, printed per the first-live-lock reading: lockMaxAgeMin is
       NOT APPLICABLE on this path (prices were fetched by this same run — fresh by
       construction); the exposure cap IS the daily ceiling the allocator sized under. */
    let lock: Record<string, unknown> | null = null;
    try {
      const entry = buildLockEntry({ eng, data: data as unknown as Record<string, unknown>, date, now, trigger });
      const w = await writeLock(entry);
      lock = {
        tickets: (entry.core as unknown[]).length,
        allocSum: entry.allocSum ?? 0,
        daily: entry.daily,
        emptyGate: (entry.core as unknown[]).length === 0,
        blockedReasons: entry.blockedReasons ?? {},
        existedBefore: w.existedBefore,
        refusals: { lockMaxAgeMin: "n/a — prices fresh by construction", exposureCap: `daily $${entry.daily}` },
      };
      console.log(`[generate] LOCKED ${date}: ${(entry.core as unknown[]).length} tickets, $${entry.allocSum ?? 0} of $${entry.daily}${(entry.core as unknown[]).length === 0 ? " (zero-ticket decision record)" : ""}`);
    } catch (e) {
      lock = { error: (e as Error).message };
      console.warn(`[generate] LOCK FAILED — the self-check will backfill: ${(e as Error).message}`);
    }
    /* cfSel (2026-07-29, owner sign-off): counterfactual selection under a lifted HRR
       bar. Runs AFTER the board KV writes above (the board blob `enc` was encoded at
       its line and is already persisted), on a DEEP-COPIED slate with a REPLACED
       SH_CFG binding restored in `finally` — the live cfg object is never mutated.
       Nothing in the live path reads its output: it feeds only the additive `cfSel`
       field stamped on suspended prediction rows below. Byte-identity of the live
       board and live card, flag on/off, is enforced by tests/cfsel-guard.test.ts.
       Kill switch: PL_CFSEL=off. Zero credits — CPU only (one extra analyze). */
    let cfSel: CfSelResult | null = null;
    if (process.env.PL_CFSEL !== "off") {
      try {
        cfSel = computeCfSel(eng, slate);
        console.log(
          `[generate] cfSel: cf tickets carry ${cfSel.cfHrrTicketLegs} HRR legs; pool ${cfSel.cfPoolTickets} tickets (${cfSel.cfHrrPoolLegs} HRR legs), card ${cfSel.cfCardTickets}`,
        );
      } catch (e) {
        console.warn(`[generate] cfSel failed — stamps skipped, live path unaffected: ${(e as Error).message}`);
      }
    }
    const { records, parlays, games } = boardToPredictions(data, { src: "cron", selMode: CRON_SEL_MODE });
    if (cfSel) {
      for (const r of records) {
        if (r.susp) r.cfSel = cfSel.stamps.get(`${r.gkey}|${r.lkey}`) ?? { pool: false, card: false };
      }
    }
    if (!records.length) {
      return NextResponse.json({ ok: true, date, logged: 0, note: "no pregame picks (off day or slate underway)", lock });
    }

    const cur = await redisGetJson<DayBlob>(dayKey(date));
    const { blob, written } = mergeDayBlob(cur, date, records, parlays, games, now, { ...gen, src: "cron" });
    if (JSON.stringify(blob).length > MAX_BYTES) {
      return NextResponse.json({ error: "day blob too large" }, { status: 413 });
    }
    await redisSetJson(dayKey(date), blob);
    await redis(["SADD", DAYS_SET, date]);

    return NextResponse.json({
      ok: true,
      date,
      priced: records.length,
      parlays: parlays.length,
      written,
      total: Object.keys(blob.records).length,
      overview: String(data.overview ?? "").slice(0, 160),
      gen,
      /* additive (2026-07-29): the field's own landing evidence — created ≠ fires ≠
         landed; the reading is on the persisted records, this is the fires-half */
      cfSel: cfSel
        ? { poolTickets: cfSel.cfPoolTickets, cardTickets: cfSel.cfCardTickets, hrrTicketLegs: cfSel.cfHrrTicketLegs }
        : null,
      /* the sha+config echo, additive and write-only — the same object attached to the
         board before encode; the first response body carrying this IS the
         deployed-with-cfSel discriminator (no zero-credit probe exists) */
      echo,
      /* lock-at-generation (2026-08-05): the locked card is part of the run's own artifact */
      lock,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
