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
 * INSTRUCTION 51 SHIPPED `tickMode: "slots"` — automatic passes on the five PT stake slots — and
 * that is exactly the defect the paragraph above describes: four of those five see no baseball. IT
 * WAS CHANGED ON 2026-09-12 to `"ticker"` with `liveSlotsPT` populated (see both fields below for
 * the seven times, the reason for each, and the full credit arithmetic). `slots` still points at the
 * SAME ARRAY OBJECT as `REFILL_SLOTS_PT` (`src/lib/server/grading-progress.ts:116`), never a literal
 * copy, so INSTRUCTION 49's stake calendar is untouched and the two can never drift apart;
 * `tests/mlb-live-rules.test.ts` asserts that by reference.
 *
 * Josh's own tap remains the primary vehicle and his stated contract (2026-09-09, verbatim: "I can
 * manually do it and it can function the same way whether I manually refresh it or it refreshes
 * itself automatically") — a tap while he is staring at a row is exactly when an in-play price is
 * worth money. The seven automatic passes exist so the board is not frozen when he opens it.
 *
 * ZERO NEW CRON EXECUTIONS: the ticker mode rides the EXISTING cron-job.org scheduler row — stated
 * in-tree at `src/lib/server/grading-progress.ts:50-53` as every 15 min, UTC hours 15-23 and 0-2,
 * which in PDT is 08:00-19:45 PT — and every one of the seven times lands inside it in both
 * offsets. No cron row is added or edited and `vercel.json` is untouched. The ticker dies before
 * 22:01 PT, when the in-play span actually ends; widening it is JOSH'S cron account, not ours.
 *
 * ── THE SPEND, AND WHAT IT DOES NOT TOUCH ───────────────────────────────────────────────────────
 * CORRECTED 2026-09-12. The table that stood here costed every pass at 9-12 event-pulls, and no
 * pass can make more than THREE: `src/lib/server/mlb-live-quote.ts` reads
 * `probing = !cfg.rateMeasured || spentNow === 0`, `rateMeasured` is false, so `allowed` is
 * `min(affordable, probeEvents)` on EVERY pass, not just the day's first. Every figure below that
 * line was therefore 3-4x too high — an over-count, which is the safe direction, but it is not the
 * number. One pass costs, as the route actually bills it:
 *
 *     MLB_LIST_CALL_CREDITS (the flat events list, 1-credit class)        1
 *     probeEvents (3) x measuredCreditsPerEvent (6)                     18
 *                                                          ONE PASS  =  19 credits
 *
 * and RAIL 1b NX-stamps each automatic slot for the Pacific day, so each slot buys at most one pass:
 *
 *     the seven liveSlotsPT times (2026-09-12)        7 passes   133 credits
 *     + 5 manual Refresh taps                        5 passes    95 credits
 *                                                              228 of 600
 *
 * `dailyBudget: 600` therefore holds with a 2.6x cushion over a heavy day. IT IS STILL A CEILING,
 * NOT A FORECAST, and it is also the thing that makes the UNMEASURED rate safe: if MLB bills like
 * CFB's 31 an event, a pass is 1 + 3 x 31 = 94 and twelve passes would be 1,128 — but the rail
 * counts the REAL x-requests-used delta, so it refuses the tail of the pass that would cross 600
 * instead of spending past it. Worst case the day stops around 600 + one pass of overshoot, which is
 * the pre-existing property of a read-modify-write rail and not something this change introduced.
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
  /**
   * THE INSTRUCTION 49 CALENDAR — the same array object, never a copy.
   *
   * STILL POINTED AT `REFILL_SLOTS_PT` AFTER THE 2026-09-12 CHANGE BELOW, deliberately: this field
   * is INSTRUCTION 49's stake calendar and nothing about the money ladder moves. `tickMode` is now
   * "ticker", so the LIVE pull reads `liveSlotsPT` instead of this array — but the reference is kept
   * so the two calendars still cannot silently drift, and flipping `tickMode` back restores the
   * shipped-51 behaviour exactly.
   */
  slots: REFILL_SLOTS_PT,
  /**
   * THE LIVE CALENDAR (2026-09-12) — seven Pacific times, and the reason each one is there.
   *
   * THE DEFECT: INSTRUCTION 51 shipped `tickMode: "slots"`, which made the live in-play pull ride
   * `REFILL_SLOTS_PT`. This file's own cadence finding (just above) already said what that means:
   * 08:00 / 09:30 / 12:00 / 15:00 PT see ZERO live baseball, and 16:45 PT is ~31 minutes BEFORE the
   * 12-of-15 concurrency peak. So four of the five automatic passes bought in-play prices for
   * nothing at all, and the five hours of baseball after the fifth got no pass. The in-play span on
   * a real slate is 15:41 PT -> 22:01 PT.
   *
   * WHY BOTH CONSTANTS HAD TO MOVE TOGETHER: populating this array alone does nothing — the
   * scheduler only consults it when `tickMode` is "ticker" (app/api/scheduler/route.ts, the `lt`
   * line). And flipping `tickMode` REPLACES the five slots for the live decision rather than adding
   * to it, so this array has to carry the daytime times still worth pulling. 12:00 and 15:00 are
   * kept for exactly that reason: a getaway day or a doubleheader can be in play then, and an early
   * pass also lands the first real `x-requests-used` reading of the day, which is the measurement
   * `rateMeasured` is waiting on. 08:00 and 09:30 are dropped — no MLB game has ever been in play
   * at 08:00 Pacific.
   *
   * 16:45 -> 18:45 at 30 minutes covers the peak and the long middle of the span. It stops at 18:45
   * because the existing cron-job.org ticker stops: every one of the seven lands inside its window
   * (every 15 min, UTC hours 15-23 and 0-2) in BOTH offsets — 18:45 PT is 01:45 UTC in PDT and
   * 02:45 UTC in PST, the ticker's last pulse. The 19:45 PT -> 22:01 PT tail of the in-play span
   * therefore still gets no automatic pass, and widening the ticker is JOSH'S OWN cron account.
   * No cron row is added by this change and vercel.json is untouched.
   *
   * WHAT THE SEVEN ACTUALLY COST, computed off this file's own numbers and the route's code:
   * `rateMeasured` is false, and src/lib/server/mlb-live-quote.ts reads
   * `probing = !cfg.rateMeasured || spentNow === 0` -> so EVERY pass is capped at `probeEvents` (3),
   * never `liveMaxEvents` (12). One pass is therefore `MLB_LIST_CALL_CREDITS` (1, the flat events
   * list) + 3 x `measuredCreditsPerEvent` (6) = 19 credits, not 72. And RAIL 1b stamps each slot
   * with an NX key for the Pacific day, so each of the seven buys AT MOST ONE pass:
   *
   *     7 slots x 19 = 133 credits a day, against the route's own 600 rail — 22% of it.
   *
   * THE UNMEASURED CASE, stated rather than buried: if MLB in fact bills like CFB's 31 an event, a
   * pass is 1 + 3 x 31 = 94 and seven would be 658 — past 600. That is what `probeEvents` and
   * `rateMeasured: false` exist for, and the rail counts the REAL x-requests-used delta, so the
   * route refuses the tail of the pass that would cross 600 rather than spending past it. It is
   * also why 12:00 is kept: the sooner a real reading lands, the sooner this stops being a band.
   */
  liveSlotsPT: ["12:00", "15:00", "16:45", "17:15", "17:45", "18:15", "18:45"] as readonly string[],
  /** "ticker" since 2026-09-12 — the live pull reads `liveSlotsPT`, not the five stake slots */
  tickMode: "ticker" as "slots" | "ticker",
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
