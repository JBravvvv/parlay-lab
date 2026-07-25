/**
 * LIVE lineup coverage — the only coverage basis anything should compare on.
 *
 * `luCoverage.pct` on the board is a WHOLE-DAY aggregate, and whole-day coverage
 * lies in one specific direction: a Sunday board built at 16:00 UTC reads 71%
 * confirmed, and by 22:00 nearly every one of those games has started. High
 * coverage, entirely in the past, useless for anything still bettable.
 *
 * The conditional skip already measures over unstarted games only. This module is
 * that same computation, pure and client-safe, so the board-source comparison uses
 * it too — otherwise a 9am board could beat the evening board on whole-day coverage
 * while being worthless for the games that are actually still open.
 */

export type GameInfoLike = Record<string, { start?: string | null; lu?: boolean }> | null | undefined;
export type LiveCov = {
  live: number; // games not yet started
  confirmed: number; // ...of those, with both lineups posted when the board was built
  pct: number; // confirmed / live, or 0 when nothing is left
  /** false when the board predates the per-game `lu` flag: 0% would be a claim the
      data can't support, and "unknown" and "none confirmed" deserve different answers */
  known: boolean;
};

export function liveCoverageOf(gi: GameInfoLike, now: number): LiveCov {
  const all = Object.values(gi ?? {});
  const known = all.some((g) => typeof g?.lu === "boolean");
  const upcoming = all.filter((g) => {
    const t = g?.start ? Date.parse(g.start) : NaN;
    return isFinite(t) && t > now;
  });
  if (!upcoming.length) return { live: 0, confirmed: 0, pct: 0, known };
  const confirmed = upcoming.filter((g) => g?.lu === true).length;
  return {
    live: upcoming.length,
    confirmed,
    pct: Math.round((confirmed / upcoming.length) * 1000) / 1000,
    known,
  };
}

/** No game left to price today: nothing a fresh board could add. */
export function deadSlate(starts: number[], now: number): boolean {
  return !starts.some((s) => isFinite(s) && s > now);
}
