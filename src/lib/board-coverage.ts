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

/** MLB posts lineups roughly this far ahead of first pitch. */
export const LINEUP_LEAD_MS = 3 * 3600_000;

/**
 * ACHIEVABLE coverage at a moment, from the SCHEDULE alone — of the games STILL
 * BETTABLE, the share that are also past their lineup-posting window. It needs no
 * board and no odds call, so it can be asked before deciding to spend.
 *
 * This is the guard against a mis-scheduled pass: a 16:00 UTC run on a Monday can
 * reach ~1% of the slate no matter how well the engine works, because nothing is
 * posted yet. Independent of whether the day-of-week split is right.
 *
 * DENOMINATOR IS UNSTARTED GAMES, NOT THE WHOLE DAY (fixed 2026-07-26).
 * It used to divide by every game on the schedule, which is the exact whole-day
 * denominator failure this file's own header warns about for `luCoverage.pct` — left
 * unfixed one function below it. The cost was concrete: on Sunday 2026-07-26 a 22:30
 * pass could reach the ONE remaining game (the 23:20 national game, lineup long since
 * posted) and scored 1/15 = 0.067, so it was refused as "low-ceiling". That game
 * carried 11 of the 17 closed-form H+R+RBI rows — 65% of the ladder-defect exposure
 * the retime exists to remove (docs/hrr-recalibration.md).
 *
 * Dividing by unstarted games asks the question the guard was always for — "of what I
 * can still price, how much is ready?" — and the guard it was protecting is unchanged:
 * a 16:00 Monday still has ~15 unstarted games and ~0 ready, so it still reads ~0.
 */
export function achievableCoverage(starts: number[], now: number): number {
  const valid = starts.filter((s) => isFinite(s));
  const unstarted = valid.filter((s) => s > now);
  if (!unstarted.length) return 0;
  const ready = unstarted.filter((s) => s - LINEUP_LEAD_MS <= now).length;
  return Math.round((ready / unstarted.length) * 1000) / 1000;
}

/**
 * COMPLETENESS — how many still-bettable games the board actually PRICED.
 *
 * Coverage is a lineup metric and is computed from the schedule, so it is blind to
 * whether a game carries odds at all: a board that lost a quarter of the slate can
 * still score 82%. That is not hypothetical — a calendar-day filter did exactly that
 * to every server board for a week, and a mid-chain API failure or an unposted market
 * produces the identical shape with no timezone bug involved.
 *
 * So the source comparison asks this FIRST: never take a board that prices fewer of
 * the games you can still bet, however well-covered it looks.
 */
export type PricedRow = { gkey?: string | null };

export function pricedGames(
  categories: Record<string, PricedRow[]> | null | undefined,
  gi: GameInfoLike,
  now: number,
): number {
  const upcoming = new Set(
    Object.entries(gi ?? {})
      .filter(([, g]) => {
        const t = g?.start ? Date.parse(g.start) : NaN;
        return isFinite(t) && t > now;
      })
      .map(([k]) => k),
  );
  const seen = new Set<string>();
  for (const rows of Object.values(categories ?? {})) {
    for (const r of rows ?? []) {
      const k = r?.gkey;
      if (k && upcoming.has(k)) seen.add(k);
    }
  }
  return seen.size;
}
