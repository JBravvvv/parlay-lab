/**
 * THE PAPER EPOCH (2026-08-15, Josh's word, verbatim):
 *   "Unsuspend H+R+RBI and other props on tickets; Clear the ledger and start betting a
 *    hypothetical $150 every single day no matter what on the ticket to track over a
 *    couple weeks. I will not be taking ANY of the bets so its all hypothetical money
 *    to track. Do $25 in fun money every day as well."
 *
 * Pure constants + one cfg mutator, shared by the server cron and the browser engine so
 * there is exactly one copy of the numbers. Nothing here (or in its consumers) edits the
 * eval'd engine string — SH_CFG is runtime config, read at analyze time; the cfSel
 * counterfactual module proved this override pattern in production.
 */

import { SHAPE_TICKETS } from "@/lib/core-shapes";

export const PAPER = {
  since: "2026-08-15",
  /** hypothetical core deployed every day, no matter what */
  daily: 150,
  /** hypothetical fun-money longshot(s), every day */
  fun: 25,
} as const;

/** "It can be anywhere from 3-10 tickets for the $150 per day" — Josh, 2026-08-15.
    RESHAPED 2026-08-22 (Josh's word, verbatim: "It should also be doing a max of 7 tickets
    for the daily core card. anywhere from 3-7 tickets"). The 08-22 card hit 14 tickets
    because only the forced pass honored the ceiling — see lock-card.ts buildModeCard.
    DERIVED since 2026-09-08 (INSTRUCTION 46, "Parlay Lab Baseball 1"): the count is no
    longer a rule of its own — the day runs one of Josh's six CORE_SHAPES (core-shapes.ts)
    and the ticket count IS the shape's slot count. min/max here are the fewest/most slots
    on the menu (3 and 5 at this writing), read off the menu so they cannot drift from it. */
export const PAPER_TICKETS = { min: SHAPE_TICKETS.min, max: SHAPE_TICKETS.max } as const;

/**
 * TOP-UP SWEEPS (2026-08-19, Josh's word after the 08-19 card deployed $49 of $150:
 * "I said $150 every day no matter what so we could track and calibrate off of it").
 * When every block has fired or died and the day is still short, the scheduler may buy
 * up to this many extra generate runs (fresh prices — evening props post late, which is
 * exactly when the earlier fires found a thin pool). Each run costs ~120 Odds credits;
 * the cap bounds the spend, and the generate route's own registry enforces it.
 */
export const TOPUP_MAX = 2;

/**
 * The day-level 3–10 window, expressed per allocation call. `blockBudget` is the money
 * this fire deploys (the whole $150 single-block, or the block's splitBudget share);
 * `carriedCount` is how many core tickets the day already locked. Pro-rata by budget
 * share so a Sunday's blocks divide the window the way they divide the money; every
 * live block keeps at least 1; the ceiling is HARD (a full day admits nothing more).
 * The floor is best-effort by construction — a pool with fewer disjoint tickets than
 * the floor deploys what exists and the entry's note says so.
 */
export function ticketWindow(blockBudget: number, carriedCount: number): { maxNew: number; minNew: number } {
  const allowance = Math.max(0, PAPER_TICKETS.max - carriedCount);
  if (allowance === 0) return { maxNew: 0, minNew: 0 };
  const share = Math.max(0, Math.min(1, blockBudget / PAPER.daily));
  const maxNew = Math.min(allowance, Math.max(1, Math.round(PAPER_TICKETS.max * share)));
  const minNew = Math.min(maxNew, Math.max(1, Math.ceil(PAPER_TICKETS.min * share)));
  return { maxNew, minNew };
}

/**
 * The suspension lift (Josh's word, same message). hrrAltMax:-1 suspended EVERY H+R+RBI
 * line; outsSusp:true suspended pitcher_outs whole. 99 clears every real alt ladder line.
 * The data at lift time, for the record: HRR ran 58.5% vs 57.2% implied over 1,010 graded
 * picks; outs 49.8% vs 49.2% over 554 — neither market was underwater when unsuspended.
 */
export const SUSPENSIONS_LIFTED = {
  hrrAltMax: 99,
  outsSusp: false,
  since: "2026-08-15",
} as const;

export function applySuspensionLift(cfg: Record<string, unknown> | null | undefined): void {
  if (!cfg) return;
  cfg.hrrAltMax = SUSPENSIONS_LIFTED.hrrAltMax;
  cfg.outsSusp = SUSPENSIONS_LIFTED.outsSusp;
}

/**
 * INSTRUCTION 18 — THE CORE RULE SET (2026-09-03, Josh's word, verbatim: "I would say
 * change everything that you think is necessary to optimize this engine/website and get
 * it on track to start making theoretical money. ... Lets make this app an UNSTOPPABLE
 * theoretical money makin' machine").
 *
 * A PAPER-ERA RULE CHANGE, dated, so the record splits cleanly before/after 2026-09-03.
 * Every number below is motivated by the 19 paper days 2026-08-15..09-02 (129 core
 * tickets):
 *   shrinkW 0.5   — model said 56.0 wins, 46 landed; HRR calibration: edge 5-10 bucket
 *                   predicted .634 → actual .571, edge 10-20 predicted .671 → actual .443.
 *                   Every leg prob is blended halfway to the de-vigged consensus (shrink.ts).
 *   maxLegs 2     — 1-leg 25-22-6 (−15% ROI), 2-leg 18-32 (−18%), 3-leg 3-23 (−53%).
 *   maxDec 2.6    — tickets settling above decimal 2.6 went 11-38 (−42%).
 *   forcedMaxDec 1.75 — the forced pass ($915 at −27% under caesars_ev) now only tops
 *                   up with short-priced tickets, selected by true probability.
 *   maxStake 25   — stakes ≥ $20 ran −33..−36% ROI; stakes < $10 ran −2%. No core
 *                   ticket, top-up included, may carry more than $25.
 *   noHrrOver     — H+R+RBI OVER legs were 121 of 231 core legs and hit 54% vs 61%
 *                   market-implied; they leave core (blockedReasons.hrr_over_suspended).
 *                   HRR unders (63% vs 60%), TB unders (70% vs 63%), hits, ML, RL stay.
 * The dk_fd basis stays: the alt ev_gated selection was worse (−35% vs −26%).
 *
 * INSTRUCTION 46 OVERRIDE (2026-09-08, "Parlay Lab Baseball 1", Josh's word, verbatim:
 * "Core Money should be calibrating itself more often. It is doing horrible. Should
 * consider doing some higher $ 2 team parlays. Hypothetically could be 2 $60 2 leg parlays
 * one day w/ 3 $10 3-4 leg parlays one day, 5 $30 2 leg parlays the next, …"). The core is
 * now SHAPED (core-shapes.ts): a day is a list of slots, each a stake and a leg range.
 *   maxLegs 2 / maxStake 25 — NO LONGER BIND the core. Kept on the record (and on every
 *                   entry's coreRules stamp) so the 09-03..09-07 days still read under the
 *                   rules they were locked under; `shapedSince` marks the split. A slot's
 *                   leg range and stake are the binding limits now: a ticket never carries
 *                   more than its slot, a day never carries more than $150.
 *   maxDec 2.6    — STAYS for 2-leg slots (tickets settling above 2.6 went 11-38).
 *   longLegDec 1.75 — 3+-leg slots use the PRODUCT ceiling implied by ≤ 1.75 per leg
 *                   over the slot's longest allowed ticket: 1.75^3 = 5.36 (3-leg),
 *                   1.75^4 = 9.38 (4-leg), 1.75^5 = 16.41 (5-leg) — see slotMaxDec. The
 *                   09-03 diagnosis had no clean 3+-leg price read (3-leg went 3-23 under a
 *                   dec-15 ceiling), so the ceiling is the forced-pass per-leg price
 *                   compounded, not a fitted number; the shaped record will fit one.
 *   forcedMaxDec 1.75 — STAYS as the 2-leg forced ceiling; for 3+-leg slots the forced
 *                   pass uses the same slotMaxDec product (a 3-leg ticket under 1.75 total
 *                   does not exist at book prices).
 *   shrinkW / noHrrOver / forcedSelMode — unchanged.
 */
export const CORE_RULES = {
  since: "2026-09-03",
  shrinkW: 0.5,
  maxLegs: 2,
  maxDec: 2.6,
  forcedMaxDec: 1.75,
  maxStake: 25,
  noHrrOver: true,
  /** the forced top-up selects/weights by true probability alone — not caesars_ev */
  forcedSelMode: "probability",
  /** INSTRUCTION 46: the day maxLegs/maxStake stopped binding; slots bind instead */
  shapedSince: "2026-09-08",
  /** per-leg price the 3+-leg slot ceiling compounds from (INSTRUCTION 46) */
  longLegDec: 1.75,
} as const;

/**
 * The settling-price ceiling for a slot (INSTRUCTION 46, 2026-09-08): 2-leg slots keep
 * the 2.6 rule; 3+-leg slots get 1.75 compounded over the slot's longest allowed ticket,
 * rounded to cents. Gated and forced passes share it for 3+-leg slots; the 2-leg forced
 * pass keeps its tighter 1.75. Pure; pinned in tests/core-shapes.test.ts.
 */
export function slotMaxDec(legs: { min: number; max: number }, pass: "gated" | "forced" = "gated"): number {
  if (legs.max <= 2) return pass === "forced" ? CORE_RULES.forcedMaxDec : CORE_RULES.maxDec;
  return Math.round(Math.pow(CORE_RULES.longLegDec, legs.max) * 100) / 100;
}
