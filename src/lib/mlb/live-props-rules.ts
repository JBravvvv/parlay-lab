import { REFILL_SLOTS_PT } from "@/lib/server/grading-progress";

/**
 * THE MLB LIVE IN-PLAY ODDS PULL — CONSTANTS AND THE CREDIT RAIL (INSTRUCTION 51, 2026-09-11).
 *
 * JOSH'S ORDER, VERBATIM (2026-09-11): "Authorize the live in-play odds pull for MLB".
 *
 * This is the second half of INSTRUCTION 50 item 2. Item 2 shipped the honest half: a prop whose
 * line the live game state has already cleared loses its grade / EV / Kelly and carries a SETTLED
 * tag (`src/lib/leg-settled.ts`). It could not print "over 3.5 at -145" because that needs a PAID
 * per-event in-play re-pull — see the module note at `src/lib/leg-settled.ts:30-34`, which says in
 * as many words "until Josh authorises that spend". He has now authorised it, for MLB only.
 *
 * ── WHAT A PULL COSTS, AND WHY `probeEvents` EXISTS ──────────────────────────────────────────
 * MLB's per-event cost is a MEASURED BAND, not a constant: `docs/board-open-experiment.md:115-125`
 * measures 339 credits / 58 event-fetches = 5.845 on one window, then STRIKES the inference that
 * this confirms a 6-per-event constant — a second window (641 spent, 123 event-fetches) bounds
 * c <= 5.114 by `residual >= 0`. The honest statement there is a band, c in [5.114, 5.845], with
 * the per-event cost NOT constant across windows. `measuredCreditsPerEvent: 6` below is that band
 * rounded UP.
 *
 * CFB measures 31 on the SAME nominal shape — `src/lib/cfb/rules.ts:371-373`: x-requests-used
 * 2428 -> 3187 across a 24-event pull. That 5.3x gap is UNEXPLAINED. Nothing in this tree accounts
 * for it, and if MLB in fact bills like CFB, an estimate of 6 lets ~5x too many events through
 * before the first `addSpend` lands. Hence `probeEvents: 3`: the day's FIRST pull is capped that
 * small until a real `x-requests-used` delta is recorded for that Pacific day. Worst case the
 * estimate is wrong by 5x and the day's first mistake costs ~93 credits, not ~550.
 *
 * ── THE CADENCE FINDING (computed from `tests/fixtures/fix39/events.json`, 15 real first pitches,
 * 165-minute games) ─────────────────────────────────────────────────────────────────────────────
 * The in-play span is 15:41 PT -> 22:01 PT (6.33 h), with a peak of 12 of 15 games concurrent at
 * about 17:16 PT. Against the five INSTRUCTION 49 refill slots:
 *
 *     08:00 / 09:30 / 12:00 / 15:00   ->  0 live games
 *     16:45                           -> ~9 live games (31 minutes BEFORE the peak)
 *
 * FOUR OF THE FIVE SLOTS SEE ZERO BASEBALL, and after the fifth there are five hours of in-play
 * baseball with no automatic pass at all. That is stated here rather than papered over, because a
 * board that LOOKS live and is not is exactly the dishonesty INSTRUCTION 50 existed to remove.
 *
 * So `tickMode` ships "slots": automatic passes fire only on the first scheduler tick inside each
 * of the five PT slots, through `decideSlotTick` reusing `slots` below — which is the SAME ARRAY
 * OBJECT as `REFILL_SLOTS_PT` (`src/lib/server/grading-progress.ts:116`), never a literal copy, so
 * the two calendars can never drift apart. `tests/mlb-live-rules.test.ts` asserts that by reference.
 * The primary vehicle is Josh's own tap, which is his stated contract (2026-09-09, verbatim: "I can
 * manually do it and it can function the same way whether I manually refresh it or it refreshes
 * itself automatically") — and a tap while he is staring at a row is exactly when an in-play price
 * is worth money.
 *
 * `liveSlotsPT` is the opt-in, SHIPPED EMPTY. Populating it (e.g. ["17:00","17:30","18:00","18:30"])
 * rides the EXISTING cron-job.org scheduler ticker — stated in-tree at
 * `src/lib/server/grading-progress.ts:50-53` as every 15 min, UTC hours 15-23 and 0-2, which in PDT
 * is 08:00-19:00 PT — so it costs ZERO new cron-job.org executions and covers the concurrency peak.
 * It dies at 19:00 PT; past that is Josh's cron account and we do not touch it. It does not alter
 * `REFILL_SLOTS_PT`, so the generate/refill spend INSTRUCTION 49 was about is untouched. FLIPPING
 * IT IS JOSH'S WORD, NOT OURS.
 *
 * ── THE SPEND, AND WHAT IT DOES NOT TOUCH ───────────────────────────────────────────────────────
 * Event-pull counts computed from the real 15-game slate, costed at the measured 6:
 *
 *     16:45 slot alone (THE SHIPPED DEFAULT)          9 pulls    54 credits
 *     + ~4 manual Refreshes at >= 30-min spacing    ~40 pulls   ~240 credits
 *     30-min, every live game, whole span (ungated)  86 pulls   516 credits
 *     30-min, divergence-gated (~1/3 of games)       29 pulls   174 credits
 *     opt-in ticker window (22:41Z-02:45Z), 30-min   66 pulls   396 credits
 *
 * `dailyBudget: 600` is the worst realistic day (the ungated whole-span pass, 516 on 15 games,
 * x16/15 = 550 on a September slate) plus ~9% cushion. IT IS A CEILING, NOT A FORECAST: the
 * shipped default spends ~54 automatic plus taps, and the expected gated spend is ~174.
 *
 * NO EXISTING BUDGET, CAP, SLOT OR ALLOTMENT IS LOWERED BY THIS BUILD. `CFB_PROPS.dailyBudget`
 * stays 2500 (`src/lib/cfb/rules.ts:475`), `NFL_PROPS.dailyBudget` stays 1000
 * (`src/lib/nfl/rules.ts:194`), and this spend lives under its own Redis prefix
 * (`MLB_LIVE_REDIS.spend`) so it cannot touch `pl:cfb:props:spend:v1:` or `pl:nfl:props:spend:v1:`.
 * Josh, 2026-09-09, verbatim: "I can purchase more credits. Don't lower any budgets."
 *
 * ── THE FREE GATE THIS PAYS FOR ─────────────────────────────────────────────────────────────────
 * MLB live game state arrives FREE from statsapi, so `src/lib/mlb/live-divergence.ts` decides WHICH
 * games are worth paying for before a single credit is spent. `driftMin` is the size of sim-vs-
 * pregame probability move worth buying; a line the live tally has already CLEARED bypasses it,
 * because that is proof rather than an estimate and is literally Josh's complaint.
 */
export const MLB_LIVE_PROPS = {
  /** in-play events one pull may re-price — measured peak concurrency on a real 15-game slate */
  liveMaxEvents: 12,
  /** a live game re-prices once its OWN pricedAt is older than this (s) */
  liveRevalidateSec: 1800,
  /** THE EMPTY-EVENT RULE: a live game whose last pull returned zero usable quotes is held this long (s) */
  emptyHoldSec: 7200,
  /** a stored quote past this age (s) is DISCARDED AT RENDER, however fresh Redis still thinks it is */
  quoteMaxAgeSec: 1800,
  /** how long the overlay stays in Redis past its own window — the stale fallback */
  boardRetainSec: 36 * 3600,
  /**
   * |legP - pregame prob| worth paying for.
   *
   * INERT UNTIL THE SIM SOCKET IS WIRED, stated rather than implied: `legP` comes from
   * `MlbLivePropsDeps.legPOf`, and `app/api/mlb/live-props/route.ts` supplies only `storeKeys`
   * today, because the engine's per-game sim context is not recoverable from a stored board
   * (`src/lib/server/mlb-live-quote.ts`'s module note). So `legP` is `{}` in production, drift is
   * always 0, and the shipped gate is really THREE rungs — cleared / unpriced / expired — not
   * four. Every expected-spend figure below and in `docs/credit-budget.md` is derived without the
   * drift rung for exactly that reason.
   */
  driftMin: 0.15,
  /** the day's FIRST pull is capped this small until a real x-requests-used delta lands */
  probeEvents: 3,
  /**
   * HAS THE 3-EVENT PROBE ACTUALLY BEEN RUN? Shipped FALSE, and it gates the probe cap.
   *
   * The fix pass (2026-09-11) found the original gate too weak: `probing = spent === 0` held the
   * cap for the day's FIRST pass only, so the second pass of the day could take twelve events at a
   * rate nobody has measured. CFB bills 31 on the same nominal shape and nothing in this tree
   * explains the 5.3x gap, so until a real `x-requests-used` delta is written into
   * `docs/credit-budget.md` AND this flag flipped, EVERY pass is capped at `probeEvents`. That
   * bounds a single mistaken pass at 3 x 31 = 93 credits instead of 12 x 31 = 372.
   *
   * Flip it in the same commit that records the measurement, and replace
   * `measuredCreditsPerEvent` with the measured number in that same pass.
   */
  rateMeasured: false,
  /** a 429 suspends the fast cadence for the rest of the Pacific day */
  cooldownDay: true,
  regions: "us",
  /** a lone book's in-play line is not a market */
  minBooks: 2,
  settleBook: "williamhill_us",
  /** credits this route may spend per Pacific day — NEW, its own counter, lowers nothing */
  dailyBudget: 600,
  /** the MLB band 5.114-5.845 rounded UP. NOT CFB's 31. */
  measuredCreditsPerEvent: 6,
  /** THE INSTRUCTION 49 CALENDAR — the same array object, never a copy */
  slots: REFILL_SLOTS_PT,
  /** the opt-in extra calendar, SHIPPED EMPTY pending Josh's word */
  liveSlotsPT: [] as readonly string[],
  tickMode: "slots" as "slots" | "ticker",
} as const;

/**
 * The six CORE in-play markets — NO `_alternate` ladders.
 *
 * The three ladders in `PROP_MARKETS` (`src/lib/server/odds-shape.ts:20-53`) are pre-kick Caesars
 * milestone products that only fill `row.cz` and the DK/FD basis; nine markets against six is +50%
 * spend for nothing this feature reads, and six keeps the request byte-identical to the shape the
 * ~5.8-credit MLB measurement was taken on. This string is a strict SUBSET of `PROP_MARKETS` and
 * `regions` is byte-equal "us", so `shapeAllowed` passes on the first shape with NO EDIT to
 * `src/lib/server/odds-shape.ts` — that file's own docblock: a subset of a shape's markets is the
 * same billed product or smaller, allowed.
 */
export const MLB_LIVE_MARKETS =
  "batter_hits,batter_total_bases,batter_home_runs,batter_hits_runs_rbis,pitcher_strikeouts,pitcher_outs";

/** The events list — no `markets` param, so the 1-credit class (`src/lib/server/odds-shape.ts:49`). */
export const MLB_LIVE_EVENTS_URL = "https://api.the-odds-api.com/v4/sports/baseball_mlb/events";

/** The per-event in-play re-price: one call per selected live game, the six core markets, regions=us. */
export function mlbLiveEventUrl(eventId: string, apiKey: string): string {
  return `${MLB_LIVE_EVENTS_URL}/${encodeURIComponent(eventId)}/odds?apiKey=${apiKey}&regions=${MLB_LIVE_PROPS.regions}&markets=${MLB_LIVE_MARKETS}&oddsFormat=american`;
}

/**
 * The overlay's OWN Redis prefixes. Nothing here is a board / picks / ledger / CLV key: the live
 * quotes are a SIDECAR joined at render, never written into `pl:board:<date>` (which is the
 * stamped, graded population — writing a live line into it would re-grade a bet Josh never placed).
 */
export const MLB_LIVE_REDIS = {
  board: "pl:mlb:liveprops:v1:",
  spend: "pl:mlb:liveprops:spend:v1:",
  cooldown: "pl:mlb:liveprops:429:",
} as const;
