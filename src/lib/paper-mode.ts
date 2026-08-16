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

export const PAPER = {
  since: "2026-08-15",
  /** hypothetical core deployed every day, no matter what */
  daily: 150,
  /** hypothetical fun-money longshot(s), every day */
  fun: 25,
} as const;

/** "It can be anywhere from 3-10 tickets for the $150 per day" — Josh, 2026-08-15. */
export const PAPER_TICKETS = { min: 3, max: 10 } as const;

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
