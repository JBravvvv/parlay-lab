/**
 * PROP HIT RATES (2026-09-18, Josh's word, verbatim: "incorporate analytics on how often players
 * are achieving the selected prop we are viewing over the last 7, 15, 30 60 & 120 games").
 *
 * PURE. The inputs are a player's per-game lines from MLB's free statsapi game log (fetched by
 * app/api/mlb/hit-rates/route.ts, never the Odds API) and the prop the board is showing —
 * market, line and side. The output is "he cleared this line in N of the last M games he
 * appeared in". Nothing here is a projection, a price or a model number: it is a count over
 * games that already happened, and the UI labels it as exactly that.
 *
 * A game counts only if the player had a real chance at the prop: a hitter needs at least one
 * at-bat (a defensive sub or pinch-runner appearance is not a chance at a hit), a pitcher's
 * game must be a START for the starter markets (a relief cameo says nothing about his K line as
 * a starter). Newest game first in every array.
 */

/** one hitter game: [hits, runs, rbi, homeRuns, totalBases, atBats] */
export type BatGame = readonly [number, number, number, number, number, number];
/** one pitcher game: [strikeOuts, outs, gamesStarted] */
export type PitGame = readonly [number, number, number];

export type PlayerLog = {
  id: number;
  /** MLB's primary position abbreviation ("RF", "P", "TWP") */
  pos: string | null;
  /** hitting game log, newest first (empty for a pure pitcher) */
  bat: readonly BatGame[];
  /** pitching game log, newest first (empty for a hitter) */
  pit: readonly PitGame[];
};

export const HIT_WINDOWS = [7, 15, 30, 60, 120] as const;
export type HitWindow = (typeof HIT_WINDOWS)[number];
export const DEFAULT_HIT_WINDOW: HitWindow = 15;
export const isHitWindow = (n: unknown): n is HitWindow => HIT_WINDOWS.includes(n as HitWindow);

export type HitStat = {
  /** games in the window the player had a chance at the prop */
  n: number;
  /** games he cleared the line on the asked side */
  hits: number;
  /** hits / n, 0..1 */
  rate: number;
  /** average of the stat per game over the window */
  avg: number;
  /** the window that was asked for (n can be smaller when he has played fewer games) */
  window: number;
};

const PITCHER_MARKETS = new Set(["pitcher_strikeouts", "pitcher_outs"]);
export const isPitcherMarket = (market: string) => PITCHER_MARKETS.has(market);

/** the stat the market settles on, for one game; null when this market has no game-log stat */
export function batStat(market: string, g: BatGame): number | null {
  switch (market) {
    case "batter_hits": return g[0];
    case "batter_runs_scored": return g[1];
    case "batter_rbis": return g[2];
    case "batter_home_runs": return g[3];
    case "batter_total_bases": return g[4];
    case "batter_hits_runs_rbis": return g[0] + g[1] + g[2];
    default: return null;
  }
}

export function pitStat(market: string, g: PitGame): number | null {
  switch (market) {
    case "pitcher_strikeouts": return g[0];
    case "pitcher_outs": return g[1];
    default: return null;
  }
}

/** the per-game stat values for this market, newest first, only games that count */
export function statSeries(log: PlayerLog | null | undefined, market: string): number[] {
  if (!log) return [];
  if (isPitcherMarket(market)) {
    const out: number[] = [];
    for (const g of log.pit) {
      if (!(g[2] > 0)) continue; // starts only
      const v = pitStat(market, g);
      if (v != null) out.push(v);
    }
    return out;
  }
  const out: number[] = [];
  for (const g of log.bat) {
    if (!(g[5] > 0)) continue; // at least one at-bat
    const v = batStat(market, g);
    if (v != null) out.push(v);
  }
  return out;
}

/** did this game clear the line on that side? (a push on an integer line is not a hit either way) */
export const cleared = (v: number, line: number, side: "o" | "u") => (side === "o" ? v > line : v < line);

/**
 * "Cleared the line in `hits` of the last `n` games." `n` is min(window, games that count); null
 * when the player has no counting game at all (a hitter's pitching prop, an unresolved name).
 */
export function hitRate(log: PlayerLog | null | undefined, market: string, line: number, side: "o" | "u", window: number): HitStat | null {
  const series = statSeries(log, market).slice(0, Math.max(0, window));
  if (!series.length) return null;
  let hits = 0;
  let sum = 0;
  for (const v of series) {
    if (cleared(v, line, side)) hits++;
    sum += v;
  }
  return { n: series.length, hits, rate: hits / series.length, avg: sum / series.length, window };
}

/** the last `count` games as hit/miss booleans, OLDEST FIRST (so a strip reads left→right in time) */
export function hitDots(log: PlayerLog | null | undefined, market: string, line: number, side: "o" | "u", count = 10): boolean[] {
  return statSeries(log, market).slice(0, count).map((v) => cleared(v, line, side)).reverse();
}

export type HitTone = "pos" | "gold" | "neg";
/** the colour the UI gives a rate: cerulean from 60%, gold from 45%, red below */
export const hitTone = (rate: number): HitTone => (rate >= 0.6 ? "pos" : rate >= 0.45 ? "gold" : "neg");

/** "L15" */
export const windowLabel = (w: number) => `L${w}`;

/** the key the client map is stored under: the board's spelling of the name, accent- and case-folded */
export function hitKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, "");
}
