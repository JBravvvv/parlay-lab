/**
 * BOARD STALENESS GATE (Phase 1c, 2026-07-25)
 *
 * `cachedBoard()` short-circuits a fresh run for the whole day, so opening the app
 * and locking without tapping regenerate can lock a card priced off PROJECTED
 * lineups — the closed-form path, carrying the documented H+R+RBI PA-conditioning
 * weakness. This decides when a cached board is stale enough that the app should
 * pay for a new one.
 *
 * All three must hold (the spec's conditions):
 *   1. the cached board's lineup coverage is under half,
 *   2. we are within 4 hours of the earliest remaining first pitch,
 *   3. the cache is older than 30 minutes.
 *
 * Plus one the spec did not ask for and the credit budget demands: a per-day cap on
 * automatic regenerates. A generate costs ~120 Odds credits; conditions 1–3 can be
 * true on every app open all evening, so an uncapped gate turns five app opens into
 * ~600 credits. The cap makes the worst case bounded and predictable. Manual
 * regeneration is never blocked — this governs only the automatic path.
 *
 * Pure module: no fetch, no DOM, no engine.
 */

export type StaleInputs = {
  /** the cached board's luCoverage.pct (0–1); undefined on boards generated before 1b */
  pct: number | null | undefined;
  /** when the cached board was generated (ms) */
  at: number;
  /** first-pitch times of the day's games (ms), any order */
  starts: number[];
  /** automatic regenerates already spent today */
  autoRuns: number;
  now: number;
};

export type StaleVerdict = {
  stale: boolean;
  /** why not, for the log — a silent "no" is indistinguishable from a broken gate */
  reason:
    | "stale"
    | "coverage-ok"
    | "too-early"
    | "cache-fresh"
    | "no-games-left"
    | "no-new-lineups"
    | "cap"
    | "unknown-coverage";
};

export const LU_PCT_FLOOR = 0.5;
export const NEAR_FIRST_PITCH_MS = 4 * 3600_000;
export const MIN_CACHE_AGE_MS = 30 * 60_000;
/** MLB posts lineups roughly this far ahead of first pitch. */
export const LINEUP_LEAD_MS = 3 * 3600_000;
/** ~120 Odds credits each; the monthly budget is the binding constraint, not the clock. */
export const MAX_AUTO_RUNS_PER_DAY = 1;

export function boardStale(i: StaleInputs): StaleVerdict {
  // a board from before luCoverage existed can't be judged on coverage; treat it as
  // acceptable rather than burning credits on an assumption
  if (i.pct == null) return { stale: false, reason: "unknown-coverage" };
  if (i.pct >= LU_PCT_FLOOR) return { stale: false, reason: "coverage-ok" };
  if (i.now - i.at < MIN_CACHE_AGE_MS) return { stale: false, reason: "cache-fresh" };
  const upcoming = i.starts.filter((s) => s > i.now);
  if (!upcoming.length) return { stale: false, reason: "no-games-left" };
  const soonest = Math.min(...upcoming);
  if (soonest - i.now > NEAR_FIRST_PITCH_MS) return { stale: false, reason: "too-early" };
  /* Low coverage is not by itself a reason to spend: at 9:30am PT nothing is posted
     for the evening slate, so a fresh board would be just as projected as the cached
     one and the gate would burn ~120 credits to change nothing. Only regenerate when
     a lineup that was NOT available when this board was built should be available
     now — i.e. some upcoming game's posting window opened after the board was made. */
  const improvable = upcoming.some((s) => i.at < s - LINEUP_LEAD_MS && i.now >= s - LINEUP_LEAD_MS);
  if (!improvable) return { stale: false, reason: "no-new-lineups" };
  if (i.autoRuns >= MAX_AUTO_RUNS_PER_DAY) return { stale: false, reason: "cap" };
  return { stale: true, reason: "stale" };
}
