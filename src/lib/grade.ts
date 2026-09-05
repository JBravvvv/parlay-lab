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
