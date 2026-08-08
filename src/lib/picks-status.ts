/**
 * PICK STATUS (2026-08-08, board-page picks ship) — pure and client-safe.
 *
 * res DOMINATES: a settled grade is a fact regardless of clocks. Without a grade the
 * clock decides: start in the future = upcoming, start passed = live. A row with no
 * start and no grade reads "upcoming" — stamped picks are pregame statements by
 * construction (boardToPredictions skips live rows), so the unknown-start default
 * matches the population's own definition rather than guessing "live".
 */

export type PickStatus = "upcoming" | "live" | "won" | "lost" | "void" | "ungradable";

export function pickStatus(
  start: string | null | undefined,
  res: string | null | undefined,
  now: number,
): PickStatus {
  if (res === "won" || res === "lost" || res === "void" || res === "ungradable") return res;
  if (!start) return "upcoming";
  const t = Date.parse(start);
  if (!isFinite(t)) return "upcoming";
  return t > now ? "upcoming" : "live";
}

export const STATUS_LABEL: Record<PickStatus, string> = {
  upcoming: "upcoming",
  live: "in-progress",
  won: "✓ won",
  lost: "✗ lost",
  void: "void",
  ungradable: "ungradable",
};
