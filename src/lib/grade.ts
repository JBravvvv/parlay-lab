/**
 * Letter grades (2026-08-10, Josh's ask). A grade is a LABEL ON A NUMBER THE
 * ENGINE ALREADY COMPUTED — never a new model, never a prediction. Board rows
 * grade on the same EV% the row displays (czEv at Caesars, bsEv in dk_fd basis
 * mode); prop picks grade on model−implied edge in percentage points.
 *
 * Cutoffs are FIXED so a grade means the same thing everywhere, every day:
 *   S ≥ +6 · A ≥ +3 · B ≥ +1 · C ≥ −1 (about fair) · D ≥ −3 · F below −3.
 * S (INSTRUCTION 32, 2026-09-04, Josh: "'S' grade will now be the highest possible grade
 * right above 'A' grade") is double the A bar — the same number, one more label.
 * A's are rare by construction — most of a retail board is −EV, and the grade
 * says so instead of curving. No number → no grade (nothing is fabricated).
 */

export type Grade = "S" | "A" | "B" | "C" | "D" | "F";

export const GRADE_CUTS = { S: 6, A: 3, B: 1, C: -1, D: -3 } as const;

export function gradeFromEv(ev: number | null | undefined): Grade | null {
  if (ev == null) return null;
  const v = Number(ev);
  if (!Number.isFinite(v)) return null;
  if (v >= GRADE_CUTS.S) return "S";
  if (v >= GRADE_CUTS.A) return "A";
  if (v >= GRADE_CUTS.B) return "B";
  if (v >= GRADE_CUTS.C) return "C";
  if (v >= GRADE_CUTS.D) return "D";
  return "F";
}

/** Sort key: S first. Ungraded (null) sorts last. */
export function gradeRank(g: Grade | null): number {
  return g === "S" ? 6 : g === "A" ? 5 : g === "B" ? 4 : g === "C" ? 3 : g === "D" ? 2 : g === "F" ? 1 : 0;
}

/**
 * THE GRADE COLUMN'S SORT KEY (INSTRUCTION 69, 2026-09-17, Josh's word, verbatim: "When sorting by
 * column on board or any other page, it needs to function correctly. On board tab, when switching
 * from 'Top 50' to 'ALL' then selecting a prop, it does not sort from highest grade to lowest grade
 * when you press on the grade column enough times to have it going top to bottom").
 *
 * WHAT WAS WRONG (reproduced on prod 2026-09-17): the letter band sorted correctly, but the key was
 * the band ALONE. Every row without a letter — an in-play row priced off a market fair, an unpriced
 * row — keyed to 0 no matter what its own figure said, so a day-time board's bottom half ("+3.1% vs
 * market", "−2.0% vs market", "+5.5% vs market"…) stayed in arrival order under the ▼ arrow and read
 * as unsorted; rows sharing a letter did the same. The key is now the band × 1000 plus the row's
 * own EV (clamped to ±499 so a figure can never cross into the next band): S → F by letter, by EV
 * inside a letter, the unlettered by their live figure below F, and a settled leg below everything
 * (SETTLED_SINK). One direction is now a true highest → lowest, top to bottom.
 */
export const GRADE_BAND = 1000;
export const SETTLED_SINK = GRADE_BAND;
export function gradeSortKey(rank: number, ev: number | null | undefined): number {
  const v = ev == null ? NaN : Number(ev);
  const e = Number.isFinite(v) ? Math.max(-(GRADE_BAND / 2 - 1), Math.min(GRADE_BAND / 2 - 1, v)) : 0;
  return rank * GRADE_BAND + e;
}
