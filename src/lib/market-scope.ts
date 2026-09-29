/** Sport-scoped menus and the owner's default football board, September 26. */
export const FOOTBALL_DEFAULT_MARKETS = ["ml", "spread", "total", "ml_1h", "spread_1h", "total_1h", "anytime_td", "pass_yds", "pass_tds", "rec_yds", "rush_yds"] as const;
const FOOTBALL = new Set([...FOOTBALL_DEFAULT_MARKETS, "receptions", "receptions_alt", "pass_tds_alt", "rush_yds_alt", "rec_yds_alt", "first_td", "tds_over"]);
export function marketInSports(key: string, sports: readonly string[]): boolean {
  return sports.some(s => s === "mlb" ? ["ml", "rl", "total"].includes(key) || key.startsWith("batter_") || key.startsWith("pitcher_") : (s === "nfl" || s === "cfb") && FOOTBALL.has(key));
}
export function scopedMarkets<T extends {key:string}>(markets: readonly T[], sports: readonly string[]): T[] {
  return markets.filter(m => marketInSports(m.key, sports));
}
export function defaultMarkets(markets: readonly {key:string}[], sports: readonly string[]): string[] {
  return scopedMarkets(markets, sports).filter(m => sports.includes("mlb") && marketInSports(m.key,["mlb"]) || (FOOTBALL_DEFAULT_MARKETS as readonly string[]).includes(m.key)).map(m => m.key);
}
/** whether a market set is exactly the sports' default board, in any order */
export function isDefaultMarkets(selected: readonly string[], markets: readonly {key:string}[], sports: readonly string[]): boolean {
  const defs = defaultMarkets(markets, sports);
  return selected.length === defs.length && selected.every(m => defs.includes(m));
}
/**
 * The football Board's category select (2026-09-28, review): a category, "all" on the default board, or "custom" when a
 * Customize change left a market set that is neither one category nor the default board. It read "Sides & Props" over a
 * spread + total list, and that radio, already checked, could not be tapped to go back to the default board.
 */
export function boardCategoryValue(cat: string, selected: readonly string[], markets: readonly {key:string}[], sports: readonly string[]): string {
  return cat === "all" && !isDefaultMarkets(selected, markets, sports) ? "custom" : cat;
}
/** Preserve explicit selections, remove unavailable sports, add defaults only for newly added sports. */
export function marketsAfterSportChange(selected: readonly string[], before: readonly string[], after: readonly string[], all: readonly {key:string}[]): string[] {
  return [...new Set([...selected.filter(m => marketInSports(m, after)), ...defaultMarkets(all, after.filter(s => !before.includes(s)))])];
}
