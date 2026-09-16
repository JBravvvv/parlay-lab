/** Browse-only markets. They never enter the parity-locked model or paper allocator. */
export const MLB_BROWSE_MARKETS = {
  batter_hits: "Hits", batter_home_runs: "HR", batter_total_bases: "Total Bases",
  batter_rbis: "RBI", batter_runs_scored: "Runs", batter_hits_runs_rbis: "H+R+RBI",
  pitcher_strikeouts: "Strikeouts", pitcher_outs: "Outs",
} as const;
export const EXTRA_BATTER_MARKETS = ["batter_rbis", "batter_runs_scored"] as const;
/** Add the two requested markets to existing event pulls, never an extra request. */
export function browseOddsUrl(raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { return raw; }
  const markets = url.searchParams.get("markets")?.split(",") ?? [];
  if (!url.pathname.includes("/baseball_mlb/events/") || !markets.includes("batter_hits")) return raw;
  url.searchParams.set("markets", [...new Set([...markets, ...EXTRA_BATTER_MARKETS])].join(","));
  return url.toString();
}
