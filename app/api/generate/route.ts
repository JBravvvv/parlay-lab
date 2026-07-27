import { NextRequest, NextResponse } from "next/server";
import { createEngine, type BoardData } from "@/engine";
import { boardToPredictions, mergeDayBlob, type DayBlob, type GenStamp } from "@/lib/pred-serialize";
import { effectiveCalibration, type CalibrationSummary, type WeightState } from "@/engine2/calibration";
import { cronHeaderAuthed, redis, redisGetJson, redisSetJson, storeEnv, syncAuthed } from "@/lib/server/store";
import { achievableCoverage, liveCoverageOf } from "@/lib/board-coverage";
import { BOARD_KEY, decodeBoard, encodeBoard, liveCoverage } from "@/lib/server/board-store";
import { ptToday } from "@/lib/server/pt-date";

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
    /* (b) PER-DATE RUN CAP — the real protection. The secret stops a stranger; this
       stops a LEAK from draining the month: each run costs ~120 Odds credits, so a
       hard ceiling of MAX_RUNS_PER_DATE bounds the damage at ~480 no matter how hard
       the endpoint is hit. Counted BEFORE the work, incremented for every authorized
       caller (scheduled and manual alike), expires with the date. */
    /* PACIFIC, not server-local. On a UTC host every run after 00:00 UTC used to key
       the run cap, the stored board and the prediction rows to TOMORROW — so a Pacific
       client asking /api/board for today got a miss and paid to generate its own. */
    const dateNow = ptToday();
    const runsKey = `${K_RUNS}${dateNow}`;
    const runs = Number(await redis(["INCR", runsKey])) || 0;
    if (runs === 1) await redis(["EXPIRE", runsKey, String(3 * 86_400)]);
    if (runs > MAX_RUNS_PER_DATE) {
      console.warn(`[generate] run cap hit: ${runs} attempts on ${dateNow} (cap ${MAX_RUNS_PER_DATE})`);
      return NextResponse.json(
        { error: "run cap reached for this date", runs, cap: MAX_RUNS_PER_DATE },
        { status: 429 },
      );
    }
    /* CONDITIONAL SKIP: a good board for this date already exists, so don't buy a
       second one. Coverage is measured over games that have NOT started — a morning
       board can read high coverage with all of it already underway. Manual callers
       with ?force=1 bypass this; the cron never does. */
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
    await redis(["SET", K_LASTGEN, String(now)]);

    // arm the same v2 stack the app arms (armV2 in engine-client)
    const base = selfBase();
    const grab = (u: string) =>
      fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [priors, ctx, summary, weights, auto] = await Promise.all([
      grab(`${base}/model/priors.json`),
      grab(`${base}/model/context.json`),
      redisGetJson<CalibrationSummary>("pl:cal:summary"),
      redisGetJson<WeightState>("pl:cal:weights"),
      redis(["GET", "pl:cal:auto"]).catch(() => null),
    ]);
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
    const gen = {
      at: now,
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
    };
    if (gen.live === 0) {
      console.warn(`[generate] board built with NO unstarted games — every row is post-start. at=${new Date(now).toISOString()}`);
    } else if (gen.leadMs != null && gen.leadMs > 6 * 3600_000) {
      console.warn(`[generate] board built ${(gen.leadMs / 3600_000).toFixed(1)}h before the next first pitch — lineups likely unposted`);
    }
    (data as Record<string, unknown>).gen = gen;
    const enc = encodeBoard({ date, at: now, data });
    if ("error" in enc) {
      console.warn(`[generate] board not stored: ${enc.error}`);
    } else {
      try {
        await redis(["SET", BOARD_KEY(date), enc.blob, "EX", String(3 * 86_400)]);
      } catch (e) {
        console.warn(`[generate] board store failed: ${(e as Error).message}`);
      }
    }
    const { records, parlays, games } = boardToPredictions(data, { src: "cron", selMode: CRON_SEL_MODE });
    if (!records.length) {
      return NextResponse.json({ ok: true, date, logged: 0, note: "no pregame picks (off day or slate underway)" });
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
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
