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
/** Preserve explicit selections, remove unavailable sports, add defaults only for newly added sports. */
export function marketsAfterSportChange(selected: readonly string[], before: readonly string[], after: readonly string[], all: readonly {key:string}[]): string[] {
  return [...new Set([...selected.filter(m => marketInSports(m, after)), ...defaultMarkets(all, after.filter(s => !before.includes(s)))])];
}
