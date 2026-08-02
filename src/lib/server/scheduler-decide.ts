import { achievableCoverage, LINEUP_LEAD_MS } from "@/lib/board-coverage";

/**
 * THE TWO-CONDITION FIRE DECISION (2026-08-02) — pure, so the guard exercises every branch
 * without a server. `/api/scheduler` is a thin shell over this; `tools/board_window.py` (the
 * retired GitHub carrier) holds the same logic in Python and its derivation record.
 *
 * FIRE when   achievable >= SCHED_T   AND   ready >= MIN_READY   AND   no board exists.
 *
 * WHY TWO CONDITIONS AND NOT THE RATIO ALONE — the §12Z.3 defect class, encoded:
 * `achievable = ready / unstarted` and a started game leaves the DENOMINATOR, so the ratio
 * RISES as the slate burns down. On 2026-08-02 at 20:22Z the live slate read achievable 1.000
 * over ONE unstarted game — a perfect score on a one-game board. MIN_READY is the floor that
 * refuses it. Both values print in every response; neither is reported without the other.
 */

/** The operator's board-quality bar (T=0.80) — NOT board-store's MIN_ACHIEVABLE=0.15 refusal floor. */
export const SCHED_T = 0.8;
/** Floor on the priceable population, so a burned-down 1-of-1 at ratio 1.000 cannot fire. */
export const MIN_READY = 4;

export type Decision = {
  fire: boolean;
  reason: string;
  /** BOTH conditions, always populated — the standing rule from the 2026-08-02 derivation defect. */
  ready: number;
  unstarted: number;
  started: number;
  achievable: number;
  costEstimate: number;
};

export function decide(args: { starts: number[]; now: number; boardExists: boolean }): Decision {
  const { starts, now, boardExists } = args;
  const valid = starts.filter((s) => isFinite(s));
  const unstartedArr = valid.filter((s) => s > now);
  const ready = unstartedArr.filter((s) => s - LINEUP_LEAD_MS <= now).length;
  const unstarted = unstartedArr.length;
  const started = valid.length - unstarted;
  const achievable = achievableCoverage(valid, now);
  const base = { ready, unstarted, started, achievable, costEstimate: unstarted ? 1 + 6 * unstarted : 0 };

  if (!valid.length) return { fire: false, reason: "empty schedule — no games today; VACUOUS, not a clean zero", ...base };
  // Idempotence outranks the conditions: a date that has a board never buys a second one here.
  if (boardExists) return { fire: false, reason: "board-exists", ...base };
  if (!unstarted) return { fire: false, reason: "dead-slate", ...base };
  if (achievable >= SCHED_T && ready >= MIN_READY) return { fire: true, reason: "both conditions hold", ...base };
  if (ready < MIN_READY && achievable >= SCHED_T) {
    return { fire: false, reason: `ready ${ready} < MIN_READY ${MIN_READY} — the ratio is high only because the slate burned down`, ...base };
  }
  if (ready < MIN_READY) return { fire: false, reason: `achievable ${achievable} < ${SCHED_T} AND ready ${ready} < MIN_READY ${MIN_READY}`, ...base };
  return { fire: false, reason: `achievable ${achievable} < ${SCHED_T} — lineups not posted for enough of what is left`, ...base };
}
