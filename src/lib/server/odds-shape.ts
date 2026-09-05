/**
 * THE SHAPE ALLOW-LIST — poller contingency B (2026-08-02, §12Z, shipped on the owner's word).
 *
 * The Odds API bills per request as a `markets × regions` PRODUCT, and `/api/odds` lets the
 * caller supply the whole upstream URL — so before this file, any caller could mint arbitrary
 * cache keys (event ids × market products) at ~6 credits each, ~34,000 credits/day admissible
 * (§3's arithmetic). This validates the product against the ONLY two shapes this product uses:
 *
 *   OURS       six player-prop markets            × regions=us       (~6 credits/event call)
 *   SharpDesk  h2h / spreads / totals             × regions=us,eu    (~6 credits/call)
 *
 * A SUBSET of a shape's markets is the same billed product or smaller — allowed. A widened
 * region on our markets is a LARGER product — rejected. A URL with no `markets` param (the
 * events list) is the 1-credit class — allowed.
 *
 * STATED, NOT HIDDEN: this does not stop a caller using OUR exact shape. That is option C's
 * job (authenticated fresh pulls). B bounds the surface; it does not close it.
 */

const PROP_MARKETS = new Set([
  "batter_hits",
  "batter_total_bases",
  "batter_home_runs",
  "batter_hits_runs_rbis",
  "pitcher_strikeouts",
  "pitcher_outs",
  /* INSTRUCTION 34 (2026-09-04, Josh: "Prop bets still aren't pulling up on 'Parlay
     Builder'. Daily odds should generate along with the 'Board' generating"). The engine's
     per-event props call has ALWAYS asked for SH_PROP_MARKETS + SH_PROP_ALT (the Caesars
     milestone ladders — legacy @~132260), and the server generate sends that URL to the
     Odds API directly. Through THIS proxy the same URL was 403 "market shape not allowed"
     since the 08-02 hardening, so every device Refresh built a board with ZERO prop rows
     and no propBoard (observed live 2026-09-05 01:05 UTC: 16/16 props calls 403, every
     batter/pitcher category 0, propBoard 0 games) — the fresher props-less board then won
     bestBoard and the Parlay Builder went empty. The three ladders are our own shape. */
  "batter_hits_alternate",
  "pitcher_strikeouts_alternate",
  "batter_home_runs_alternate",
]);
const SHARP_MARKETS = new Set(["h2h", "spreads", "totals"]);

const SHAPES: { markets: Set<string>; regions: string }[] = [
  { markets: PROP_MARKETS, regions: "us" },
  { markets: SHARP_MARKETS, regions: "us,eu" },
];

export function shapeAllowed(url: URL): boolean {
  const m = url.searchParams.get("markets");
  if (!m) return true; // events list / scores: no market product, the 1-credit class
  const requested = m.split(",").map((s) => s.trim()).filter(Boolean);
  if (!requested.length) return true;
  const regions = url.searchParams.get("regions") ?? "";
  return SHAPES.some((s) => regions === s.regions && requested.every((x) => s.markets.has(x)));
}
