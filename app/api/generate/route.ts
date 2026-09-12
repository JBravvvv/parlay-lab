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
import { REFILL_SLOTS_PT } from "@/lib/server/grading-progress";
import { slateScope, slateStarts } from "@/lib/server/slate";
import { buildLockEntry, getLockEntry, readShapeCalibration, writeLock } from "@/lib/server/lock-card";
import { PAPER, TOPUP_MAX, applySuspensionLift } from "@/lib/paper-mode";
import { applyEnvClosedForm } from "@/lib/env-adjust";
import { BLOCKS_KEY, dayConsumed, effectiveBlockBudget, partitionBlocks, type BlockRegistry } from "@/lib/server/blocks";
import { buildReadingSafe, writeReading, CHECKLIST } from "@/lib/server/self-reading";

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
/* FLIPPED ev_gated → dk_fd 2026-08-21 (Josh's word, verbatim: "Change it to 'DK/FD' basis
   but track bets for both internally so it can calibrate either selection.") The primary
   locked card now selects and gates on the DK/FD basis price; buildLockEntry records the
   other disciplined mode's card on the same entry as `alt`. MIRROR: lock-card.ts
   LOCK_SEL_MODE. Market/side calibration is unaffected — the fit trains on graded board
   ROWS, which are written and graded regardless of selection mode. */
const CRON_SEL_MODE = "dk_fd";

const K_LASTGEN = "pl:gen:lastRun";
const K_RUNS = "pl:gen:runs:";
/** 114-150 Odds credits a run (measured), so a leaked secret costs at most ~450 in a
    day. Lowered 4 → 3 on 2026-07-25: a normal day under the day-of-week split is 2
    (the cron, plus one lock-guard regenerate), so 3 leaves room for one mistake while
    keeping a leak nearer the plan. NOTE: this bounds SERVER runs only — an in-app
    regenerate executes in the browser and never reaches this route, so the cap does
    not bound the spend most likely to run away. See docs/credit-budget.md.
    Hard ceiling since 2026-09-09 (INSTRUCTION 49): MAX_RUNS_PER_DATE 4 + TOPUP_MAX 6 = 10
    spending runs a day, 1,140-1,500 credits at the measured 114-150 (INSTRUCTION 48 had 8). */
/* raised 3 → 4 (2026-08-08, per-block locking): the season's observed maximum is 4
   start-blocks/day at the derived 90-min partition (§12Z.15) — the cap = blocks-observed,
   and partitionBlocks coalesces beyond it so the cap keeps meaning */
const MAX_RUNS_PER_DATE = 4;
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

/* slateStarts now comes from src/lib/server/slate.ts (2026-08-08) — the ONE copy, which
   also filters Postponed/Cancelled. That filter is load-bearing here now: the scheduler
   and this route both partition the slate into blocks, and the partitions must agree on
   the population or the block keys diverge between the decision and the fire. */

function memoryStorage(seed: Record<string, string> = {}) {
  const m = new Map<string, string>(Object.entries(seed));
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
    /* NO USER-AGENT FALLBACK (INSTRUCTION 49 fix round, 2026-09-09). This branch used to admit a
       keyless request whose user-agent started with "vercel-cron" during UTC 12-20. vercel.json's
       two crons target /api/scheduler (never this route) and Vercel authenticates them with
       `Authorization: Bearer <CRON_SECRET>`, which cronHeaderAuthed already accepts — so the
       fallback served no legitimate caller, only a forged header, and with the top-up limiter
       bypass below it would have turned a curl into a fast credit burn. Unauthenticated is 401. */
    const ua = req.headers.get("user-agent") ?? "";
    // (c) leave a trail a probe would show up in — this endpoint spends quota,
    // so repeated 401s here are worth noticing in the Vercel logs
    console.warn(
      `[generate] unauthorized attempt ua=${JSON.stringify(ua.slice(0, 80))} ` +
        `key=${req.headers.get("x-cron-key") ? "header-bad" : req.nextUrl.searchParams.get("key") ? "query-attempt" : "none"} ` +
        `ip=${req.headers.get("x-forwarded-for") ?? "?"}`,
    );
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.ODDS_API_KEY) return NextResponse.json({ error: "no ODDS_API_KEY" }, { status: 503 });

  try {
    const now = Date.now();
    const lastRun = Number(await redis(["GET", K_LASTGEN])) || 0;
    const force = manual && req.nextUrl.searchParams.get("force") === "1";
    const blockKey = req.nextUrl.searchParams.get("block");
    /* TOP-UP SWEEP (2026-08-19, Josh: "$150 every day no matter what"): a topup fire
       buys FRESH prices for a day whose fires left it short — evening props post late,
       which is exactly when the earlier fires found a thin pool. It bypasses the
       good-board skip (the stored board's staleness is the problem being solved) but is
       bounded by its own registry cap and the run-cap headroom.
       INSTRUCTION 49 (2026-09-09): a top-up also bypasses the 45-min K_LASTGEN limiter —
       the slot calendar (decideRefillTick) and decideTopUp's same-slot refusal are its
       pacing, and Josh's manual Refresh right after a slot must be honoured. K_LASTGEN is
       still SET below, so plain browser generates stay limited as before.
       CRON PATH ONLY (fix round, 2026-09-09): `topup` — and with it the limiter bypass and the
       TOPUP_MAX run-cap headroom — is honoured only for a cron-keyed caller. Josh's own Refresh
       reaches it through POST /api/refill, which runs decideTopUp first and forwards with
       x-cron-key; a sync-phrase GET ?topup=1 is a plain generate and stays 45-min limited. */
    const topup = !blockKey && scheduled && req.nextUrl.searchParams.get("topup") === "1";
    /* BOARD-ONLY MODE — `?live=1` (2026-09-12, "the LIVE pill and the LIVE parlays are empty").
       WHAT WAS BROKEN: app/board/page.tsx shows the LIVE pill only when `d.categoriesLive` is
       non-empty, and `categoriesLive` is whatever the run that built the board computed. Every
       automatic route to a run taken WHILE games are in play is refused: a plain generate is refused
       by liveCoverage as `dead-slate` / `low-ceiling` (src/lib/server/board-store.ts), and the top-up
       ladder refuses with "day fully deployed" / "every game started" (src/lib/server/blocks.ts). So
       the live pool was whatever the last PREGAME pass computed — i.e. nothing — INCLUDING when Josh
       tapped Refresh himself.

       WHAT THIS MODE IS: a board WITHOUT a card. It does three things and is defined by what it
       does NOT do:
         (a) it bypasses the conditional-skip branch below, exactly as `?topup=1` already does — the
             in-play slate the skip refuses is the whole point of the pass;
         (b) it builds and PERSISTS the board (the `categoriesLive` the LIVE pill and the LIVE
             parlays read);
         (c) it NEVER ENTERS src/lib/server/blocks.ts. No claim row, no allocation, no append, no
             `buildLockEntry`, no `writeLock`, no reading. INSTRUCTION 48's append-only card is
             therefore untouched BY CONSTRUCTION rather than by a guard that could be got round, and
             INSTRUCTION 49's slot ladder never sees this pass at all. The owed-below-zero and "every
             game started" refusals in blocks.ts are NOT relaxed — they are never reached.

       WHAT STILL BINDS IT: the 45-minute K_LASTGEN limiter (this mode is deliberately NOT in the
       bypass list above), the per-date run cap with NO top-up headroom, and the same auth as every
       other caller. It costs a full generate (114-150 Odds credits measured), so it is JOSH'S TAP,
       and INSTRUCTION 50 already prints that cost under the Board's Refresh button — the count of
       these passes included, not just the browser ones (src/lib/mlb/live-board-client.ts).

       AND THE PART THAT IS NOT FLATTERING: this pass shares MAX_RUNS_PER_DATE with the block locks
       instead of having headroom of its own, so on a day that has already used its four runs the tap
       is refused outright — checked for free below, before the counter is touched, so the refusal
       costs the block ladder nothing. On such a night Josh still gets a device re-price and the note
       says the server did not buy one. Widening the ceiling for this mode would raise the day's
       credit bill, which is Josh's call.

       DELIBERATELY NOT SCHEDULED. No scheduler code sends `live=1` and none was added: a recurring
       evening board-only pass is 114-150 NEW credits a day and that is Josh's decision to make, not
       ours. See the task report's decisionsLeftToJosh. */
    const boardOnly = !blockKey && !topup && req.nextUrl.searchParams.get("live") === "1";
    const slotRaw = req.nextUrl.searchParams.get("slot");
    const slot: string | undefined = slotRaw ?? undefined;
    if (topup && slot !== undefined && slot !== "manual" && !(REFILL_SLOTS_PT as readonly string[]).includes(slot)) {
      return NextResponse.json({ ok: false, error: "bad slot" }, { status: 400 });
    }
    if (!force && !topup && now - lastRun < 45 * 60_000) {
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
    /* PER-BLOCK FIRES (2026-08-08): the scheduler forwards ?block=<key>. The skip
       becomes good-BLOCK-skip — a block that already fired never fires again (the
       registry is the record), and the day-level good-board skip must NOT block a second
       block's fire (that is exactly the one-shot-per-day defect this ship removes). */
    let topupKey: string | null = null;
    if (blockKey) {
      const reg = ((await redisGetJson<BlockRegistry>(BLOCKS_KEY(dateNow))) ?? {}) as BlockRegistry;
      if (reg[blockKey]?.firedAt) {
        return NextResponse.json({ ok: true, skipped: "block-already-locked", block: blockKey });
      }
    } else if (topup) {
      const reg = ((await redisGetJson<BlockRegistry>(BLOCKS_KEY(dateNow))) ?? {}) as BlockRegistry;
      const used = Object.keys(reg).filter((k) => k.startsWith("topup-")).length;
      if (used >= TOPUP_MAX) {
        return NextResponse.json({ ok: true, skipped: "topup-cap", used, cap: TOPUP_MAX });
      }
      topupKey = `topup-${used + 1}`;
      /* CLAIM BEFORE SPEND (INSTRUCTION 49 fix round, 2026-09-09): football writes its claim row
         before it pulls; MLB wrote the `topup-N` row only AFTER collectSlate (~60 s, 114-150
         credits), so a second poke inside the same slot window — a ticker re-poke on the
         scheduler's 90 s timeout, or Josh's click — found no row, passed decideTopUp again and
         bought a second board. Record the attempt NOW, slot-stamped, as an in-flight row: it
         counts toward `used` and the same-slot refusal from this instant; the success path and
         the catch below overwrite the same key with the real outcome. A key that already holds
         an in-flight row younger than the generate budget is another caller's claim — yield.
         Not atomic (GET + SET), but the window shrinks from ~60 s to one round trip. */
      const inflight = reg[topupKey];
      if (inflight && inflight.reason === "in flight" && typeof inflight.at === "number" && now - inflight.at < 5 * 60_000) {
        return NextResponse.json({ ok: true, skipped: "topup-claimed", key: topupKey, at: inflight.at });
      }
      reg[topupKey] = { at: now, tickets: 0, reason: "in flight", ...(slot ? { slot } : {}) };
      await redisSetJson(BLOCKS_KEY(dateNow), reg);
    } else if (!force && !boardOnly) {
      /* `boardOnly` skips this branch for the same reason `topup` does: the refusals it prints
         (dead-slate, low-ceiling, no-games-left) are all "the slate is already under way", which is
         precisely the state this pass exists to price. */
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

    /* THE BOARD-ONLY TAP TAKES A NUMBER ONLY IF THERE IS ONE LEFT (review round, 2026-09-12).
       The INCR below is pessimistic on purpose — it counts a run at the point of commitment so a
       timeout cannot leave the ceiling unbounded — but that also makes a REFUSED run cost a unit of
       the day's headroom, and this mode is the one caller a human can fire at will. Four taps on a
       busy day and the 429s themselves would have eaten the four runs INSTRUCTION 48's block locks
       need, so the evening's locked card could be refused "run cap reached" without a credit having
       been spent on it. So: a read-only GET first. At the cap this tap is refused for FREE — the
       counter is not touched, K_LASTGEN is not re-stamped, and the browser falls back to its own
       re-price, so the tap still puts fresh numbers in front of Josh.

       SPELLED `boardOnly && ...` AND NOT AS ITS OWN `if (boardOnly) {` BLOCK, deliberately:
       tests/live-board-only.test.ts locates the CARD region — the one its proof shows `?live=1` can
       never enter — by that exact line, and a second one earlier in the file would silently widen the
       region that proof trusts.

       The cap itself is UNCHANGED and an ALLOWED board-only pass still counts against it, because it
       really does spend a full generate. The honest consequence: on a day that has already used all
       four runs this tap cannot buy a stored re-price at all. Giving the mode its own headroom would
       raise the day's credit ceiling, which is Josh's money call and not ours — it is in the report. */
    const runsUsed = boardOnly ? Number(await redis(["GET", runsKey])) || 0 : 0;
    if (boardOnly && runsUsed >= MAX_RUNS_PER_DATE) {
      return NextResponse.json({
        ok: true,
        skipped: `today's ${MAX_RUNS_PER_DATE} server board runs are already used`,
        runs: runsUsed,
        cap: MAX_RUNS_PER_DATE,
      });
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
    /* top-up fires get TOPUP_MAX headroom above the cap (the block fires can lawfully
       spend all four runs); their own registry cap above bounds them at TOPUP_MAX, so
       the hard ceiling is MAX_RUNS_PER_DATE + TOPUP_MAX runs a day, leak or no leak.
       TOPUP_MAX headroom is 6 since INSTRUCTION 49 (2026-09-09) — hard ceiling 10 spending
       runs a day, 1,140-1,500 credits at the measured 114-150. */
    if (runs > MAX_RUNS_PER_DATE + (topup ? TOPUP_MAX : 0)) {
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
    /* INSTRUCTION 46b (2026-09-08): the engine reads SH.bankroll from LS "pl_bankroll" at
       boot (legacy L1065, JSON-parsed) and the allocator's Kelly ceiling is
       kellyStakeMult x 1/4-Kelly x SH.bankroll — an empty storage meant the legacy $750
       default sized every server ticket. Seed the paper bankroll so the lock prices off it. */
    const eng = createEngine({
      fetchJson: serverFetchJson,
      storage: memoryStorage({ pl_bankroll: JSON.stringify(PAPER.bankroll) }),
      today: dateNow,
    });
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
      /* PAPER EPOCH (2026-08-15, Josh's word): H+R+RBI and pitcher_outs return to the
         ticket pool — hrrAltMax/outsSusp are runtime config, not an engine-hash move */
      applySuspensionLift(cfg);
      applyEnvClosedForm(cfg); // park/weather -> closed form (2026-08-27, Josh's word)
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
    let lockedEntry: ReturnType<typeof buildLockEntry> | null = null;
    /* THE ONE LINE THAT MAKES BOARD-ONLY MODE SAFE BY CONSTRUCTION (2026-09-12). Everything that
       can touch the day's money — `getLockEntry`, `partitionBlocks`, `dayConsumed`,
       `effectiveBlockBudget`, `buildLockEntry`, `writeLock`, and the BLOCKS_KEY registry write — is
       inside this block and nowhere else in the route, so not entering it is not a guard that can be
       got round: there is no code path from `?live=1` to src/lib/server/blocks.ts or to
       src/lib/append-only.ts at all. A pass that cannot append cannot break INSTRUCTION 48. */
    if (boardOnly) {
      lock = {
        skipped: "board-only pass — the board and its live pool were re-priced; the locked card was not touched",
      };
    } else try {
      /* BLOCK SCOPE (2026-08-08): on a ?block fire the card draws only from that block's
         games, sized to the block's pro-rata share of the day ceiling; the date's entry
         APPENDS across fires (carry). Partition recomputed here from the same feed the
         scheduler read — deterministic, same keys. */
      let blockGkeys: Set<string> | undefined;
      let blockBudget: number | undefined;
      /* CARRY ALWAYS (2026-08-19): every lock fire appends to the date's entry. A plain
         or top-up fire on an already-locked day used to build a competing whole-slate
         entry and leave the outcome to richer-day-wins merging; now it tops the day up. */
      const carry = await getLockEntry(date);
      const bStarts = await slateStarts(date);
      const bs = partitionBlocks(bStarts);
      const reg0 = ((await redisGetJson<BlockRegistry>(BLOCKS_KEY(date))) ?? {}) as BlockRegistry;
      const allocSoFar = dayConsumed(carry as Record<string, unknown> | null); // allocSum + slotUnderSum: seated slots are spent even where Kelly sized under them
      if (blockKey) {
        const blk = bs.find((b) => b.key === blockKey);
        if (blk) {
          const win = new Set(blk.starts);
          const giAll = (data.gameInfo ?? {}) as Record<string, { start?: string | null }>;
          blockGkeys = new Set(
            Object.entries(giAll)
              .filter(([, g]) => g?.start && win.has(Date.parse(g.start)))
              .map(([k]) => k),
          );
          /* DEFICIT CARRY-FORWARD (2026-08-19, Josh: "$150 every day no matter what"):
             the fire's budget is everything the day still owes minus the shares reserved
             for blocks that can still fire on their own — an earlier fire's shortfall
             flows here instead of stranding (the 08-19 $49-of-$150 day). */
          blockBudget = effectiveBlockBudget({ daily: PAPER.daily, blocks: bs, currentKey: blockKey, registry: reg0, now, allocSoFar }).budget;
        } else {
          console.warn(`[generate] block ${blockKey} not found in today's partition — locking whole-slate instead`);
        }
      }
      if (!blockGkeys && carry) {
        /* top-up, plain re-fire, or partition-mismatch fallback on a locked day: the
           day's remainder, still reserving any block that can fire for itself */
        blockBudget = effectiveBlockBudget({ daily: PAPER.daily, blocks: bs, currentKey: "", registry: reg0, now, allocSoFar }).budget;
      }
      /* INSTRUCTION 46 self-calibration (wired fix round 2026-09-08 — readShapeCalibration
         existed but nothing called it): the realized 2-leg vs 3+-leg record the shape picker
         tilts on. Fail-safe: readShapeCalibration never throws (an unreadable store is null),
         and null means the plain rotation. Ignored by buildLockEntry when `carry` already
         holds the day's shape. */
      const shapeCal = await readShapeCalibration(date).catch(() => null);
      const entry = buildLockEntry({
        eng,
        data: data as unknown as Record<string, unknown>,
        date,
        now,
        trigger,
        shapeCal,
        ...(carry ? { carry } : {}),
        ...(blockBudget != null ? { dailyOverride: blockBudget } : {}),
        ...(blockGkeys ? { blockKey: blockKey as string, blockGkeys } : topupKey ? { blockKey: topupKey } : {}),
      });
      const w = await writeLock(entry);
      if ((blockKey && blockGkeys) || topupKey) {
        const k = topupKey ?? (blockKey as string);
        const reg = ((await redisGetJson<BlockRegistry>(BLOCKS_KEY(date))) ?? {}) as BlockRegistry;
        reg[k] = { firedAt: now, tickets: (entry.blocks?.[k]?.tickets ?? 0), budget: blockBudget, at: now, ...(topup && slot ? { slot } : {}) };
        await redisSetJson(BLOCKS_KEY(date), reg);
      }
      lockedEntry = entry;
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
      /* A FAILED SWEEP STILL SPENT (INSTRUCTION 48 fix round, 2026-09-09, defect 6). The credits
         went at collectSlate() and K_RUNS was INCR'd at the point of commitment, but the
         `topup-N` registry row was only written on success — so a sweep whose lock threw
         (OVER THE DAY, TWO ALLOCATORS, validateLedger, and now APPEND ONLY) neither counted
         against TOPUP_MAX nor armed TOPUP_EMPTY_RETRY_MS (the cooldown; unwired since
         INSTRUCTION 49 — the row now carries `slot` so the same-slot refusal holds instead),
         and the next poke bought another full board. Mirror football's claim-before-spend: record the
         attempt as an empty fire so it counts and cools down. Best-effort — a store error
         here must not mask the lock error already reported. */
      if (topupKey) {
        try {
          const reg = ((await redisGetJson<BlockRegistry>(BLOCKS_KEY(dateNow))) ?? {}) as BlockRegistry;
          reg[topupKey] = { firedAt: now, tickets: 0, reason: `lock failed: ${(e as Error).message}`, at: now, ...(slot ? { slot } : {}) };
          await redisSetJson(BLOCKS_KEY(dateNow), reg);
        } catch (e2) {
          console.warn(`[generate] could not record the failed top-up ${topupKey}: ${(e2 as Error).message}`);
        }
      }
    }
    /* SELF-READING (2026-08-06, operator: nothing waits on a human paste). The same run
       writes the card's READING to pl:reading:{date}, served by /api/board beside the
       card. Best-effort, fully caught — a reading failure must never cost the board or
       the lock; the scheduler's self-check repairs a missing reading on its next poke. */
    let reading: Record<string, unknown> | null = null;
    /* THE READING IS THE CARD'S READING, so a board-only pass writes none (2026-09-12). Without this
       guard `lockedEntry` is null here and the fallback below would persist a record saying "lock
       failed before the reading could run" on a pass that never attempted a lock — a false red in the
       one artifact whose job is to say what actually happened. */
    if (boardOnly) {
      reading = { skipped: "board-only pass — no card was locked, so there is no card reading to write" };
    } else try {
      const r = lockedEntry
        ? buildReadingSafe({ entry: lockedEntry, gen: gen as never, date, now, kind: "fire" })
        : ({
            date, at: now, kind: "fire" as const, partial: true,
            error: `lock failed before the reading could run: ${String(lock?.error ?? "?")}`,
            continuation: "the next scheduler poke's self-check backfills the lock and rebuilds this reading",
            checklist: CHECKLIST,
          } as unknown as Parameters<typeof writeReading>[0]);
      await writeReading(r as Parameters<typeof writeReading>[0]);
      reading = { written: true, partial: !!(r as { partial?: boolean }).partial };
    } catch (e) {
      reading = { error: (e as Error).message };
      console.warn(`[generate] READING write failed — the self-check will repair: ${(e as Error).message}`);
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
      /* A BOARD-ONLY PASS REACHES HERE ON PURPOSE, and the board is already persisted above. On a
         fully in-play slate there are no PREGAME rows to log, which is not a failure of this pass —
         `categoriesLive` is what it was bought for and it is in the stored blob. Saying "no pregame
         picks" without saying the board was written would read as "nothing happened". */
      return NextResponse.json({
        ok: true, date, logged: 0,
        note: boardOnly
          ? "board re-priced and stored (including its live pool); no pregame rows to log — every game has started"
          : "no pregame picks (off day or slate underway)",
        lock, reading, ...(boardOnly ? { boardOnly: true } : {}),
      });
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
      reading,
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
      /* board-only (2026-09-12): the caller — the Board's Refresh tap — needs to be able to say in
         plain English that it re-priced the board and did not touch the card */
      ...(boardOnly ? { boardOnly: true } : {}),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
