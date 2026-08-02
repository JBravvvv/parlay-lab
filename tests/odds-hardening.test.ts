import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shapeAllowed } from "@/lib/server/odds-shape";
import { stripComments } from "./helpers/source";

/**
 * POLLER CONTINGENCY A + B (2026-08-02, §12Z shipped on the owner's word — public repo,
 * ungated /api/odds, unchanged priority).
 *
 * A — FIX THE FALLTHROUGH: an unauthenticated `fresh=1` serves CACHE instead of 401.
 *     Closes the billed surface: an unauthenticated caller can never force an upstream fetch.
 *     The 401 was also the mechanism that would KILL THE MORNING BATCH if APP_PASSCODE were
 *     ever set (snapshot_props retries 3x and returns empty — the Josh-block env-var warning);
 *     with A, setting the passcode later degrades unauthenticated fresh to cache instead of
 *     breaking collection. The degraded response carries `x-pl-stale: true` so a legitimate
 *     caller that silently lost freshness has a signal.
 * B — SHAPE ALLOW-LIST: the `markets × regions` product is validated against the two shapes
 *     this product actually uses. Bounds the cache-key attack (§3: ~34,000 credits/day
 *     admissible through arbitrary event ids × market products). B does not stop a caller
 *     using OUR exact shape — stated, not hidden; that is what C is for.
 *
 * OBSERVED RED 2026-08-02: this file ran against the route as it stood — the 401 branch
 * present, no allow-list, no odds-shape module — and failed on module-not-found first, then
 * the source assertions were checked against the pre-fix route text to confirm they would
 * have fired (the 401-absence case reds on the old text).
 */

const ev = (markets: string, regions: string) =>
  `https://api.the-odds-api.com/v4/sports/baseball_mlb/events/abc123/odds?markets=${markets}&regions=${regions}&oddsFormat=american`;

describe("B — the shape allow-list", () => {
  it("allows OUR props shape: six markets x regions=us", () => {
    expect(shapeAllowed(new URL(ev("batter_hits,batter_total_bases,batter_home_runs,batter_hits_runs_rbis,pitcher_strikeouts,pitcher_outs", "us")))).toBe(true);
    // subsets of the shape are the same billed product or less — allowed
    expect(shapeAllowed(new URL(ev("pitcher_outs", "us")))).toBe(true);
  });

  it("allows the SharpDesk shape: h2h/spreads/totals x regions=us,eu", () => {
    expect(shapeAllowed(new URL(ev("h2h,spreads,totals", "us,eu")))).toBe(true);
  });

  it("allows the events LIST (no markets param) — the 1-credit class", () => {
    expect(shapeAllowed(new URL("https://api.the-odds-api.com/v4/sports/baseball_mlb/events?dateFormat=iso"))).toBe(true);
  });

  it("rejects a foreign market product — the cache-key attack surface", () => {
    expect(shapeAllowed(new URL(ev("player_points,player_rebounds", "us")))).toBe(false);
    // our markets on a widened region product = a different (larger) bill — rejected
    expect(shapeAllowed(new URL(ev("pitcher_outs", "us,eu,uk,au")))).toBe(false);
    // cross-pairing the two allowed shapes is neither shape
    expect(shapeAllowed(new URL(ev("h2h,spreads,totals", "us")))).toBe(false);
    expect(shapeAllowed(new URL(ev("batter_hits", "us,eu")))).toBe(false);
  });

  it("PLANT (invalid-by-value): a permissive list would pass the widened region", () => {
    expect(shapeAllowed(new URL(ev("pitcher_outs", "us,eu,uk,au"))), "the allow-list admits a widened region product").toBe(false);
  });
});

describe("A — the fallthrough, on the comment-stripped route", () => {
  const src = stripComments(readFileSync("app/api/odds/route.ts", "utf8"));

  it("the unauthenticated-fresh 401 is GONE — cache is served instead", () => {
    expect(
      /passcode required/.test(src),
      "the 401-on-fresh branch is back: an unauthenticated fresh=1 errors instead of degrading " +
        "to cache, and setting APP_PASSCODE would kill the morning batch again (the Josh-block " +
        "mechanism this ship removed)",
    ).toBe(false);
  });

  it("the degraded response is marked stale", () => {
    expect(/x-pl-stale/.test(src), "the silent-freshness-loss signal is gone").toBe(true);
  });

  it("the allow-list actually gates the route", () => {
    expect(/shapeAllowed/.test(src), "the route no longer consults the shape allow-list").toBe(true);
    expect(/shape not allowed|market shape/.test(src)).toBe(true);
  });

  it("the host pin and key handling are untouched", () => {
    expect(/api\.the-odds-api\.com/.test(src)).toBe(true);
    expect(/ODDS_API_KEY/.test(src)).toBe(true);
  });
});
