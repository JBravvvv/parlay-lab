/**
 * FIRST-HALF (1H) MARKETS — the football side-market vocabulary (2026-09-19, Josh, verbatim:
 * "1H bets should be included on NFL & CFB").
 *
 * Three full-game side markets ("ml" / "spread" / "total") and their first-half twins
 * ("ml_1h" / "spread_1h" / "total_1h"). A 1H market prices the FIRST HALF only: the half-time
 * score settles it, through the same normal margin model as the full game with the half's own
 * σ (below). The Odds API sells the first-half lines as per-event "additional markets"
 * (`h2h_h1` / `spreads_h1` / `totals_h1`); they ride the same per-event call the player props
 * already make (props-types.ts CFB_PROPS_ODDS_MARKETS), so no new pull and no new cadence.
 *
 * THE HALF-GAME σ (documented assumption): the two halves are treated as independent with equal
 * variance, so the first-half margin has HALF the full-game variance — σ₁ₕ = σ / √2 (CFB 16.5 →
 * ≈ 11.67, NFL 13.5 → ≈ 9.55), the same scale on the total. No 1H number is fabricated: a 1H row
 * exists only when the books posted that half's line, and its fair price comes off those posted
 * lines through this σ.
 *
 * This module has NO imports on purpose — types.ts, props-types.ts and every component read it.
 */

export type CfbFullMarketKey = "ml" | "spread" | "total";
export type CfbH1MarketKey = "ml_1h" | "spread_1h" | "total_1h";
type SideMarket = CfbFullMarketKey | CfbH1MarketKey;

export const FULL_MARKETS = ["ml", "spread", "total"] as const;
export const H1_MARKETS = ["ml_1h", "spread_1h", "total_1h"] as const;
/** every side market, full game first then the first half — the Board / ranked-list category order */
export const SIDE_MARKETS = [...FULL_MARKETS, ...H1_MARKETS] as const;

/** the Odds API per-event market keys that carry the first-half lines, in market order */
export const H1_ODDS_MARKET_KEYS = ["h2h_h1", "spreads_h1", "totals_h1"] as const;
export const H1_ODDS_MARKETS: string = H1_ODDS_MARKET_KEYS.join(",");
/** the per-event key of each 1H market's full-game twin */
export const H1_ODDS_KEY_OF: Record<CfbFullMarketKey, string> = { ml: "h2h_h1", spread: "spreads_h1", total: "totals_h1" };

/** σ₁ₕ / σ — half the variance, see the header */
export const H1_SIGMA_SCALE = Math.SQRT1_2;

export function isH1Market(m: string): m is CfbH1MarketKey {
  return m === "ml_1h" || m === "spread_1h" || m === "total_1h";
}

/** "spread_1h" → "spread"; a full-game key (or any prop market id) reads as itself */
export function baseMarketOf(m: SideMarket): CfbFullMarketKey;
export function baseMarketOf(m: string): string;
export function baseMarketOf(m: string): string {
  return isH1Market(m) ? m.slice(0, -3) : m;
}

/** the market word a ticket / slip prints beside a side leg */
export const MARKET_WORDS: Readonly<Record<SideMarket, string>> = {
  ml: "ML",
  spread: "Spread",
  total: "Total",
  ml_1h: "1H ML",
  spread_1h: "1H Spread",
  total_1h: "1H Total",
};
export function marketWord(m: string): string {
  return (MARKET_WORDS as Record<string, string>)[m] ?? m;
}
