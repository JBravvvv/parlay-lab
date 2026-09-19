import { describe, expect, it } from "vitest";
import { decodeSetup, encodeSetup } from "@/lib/parlay-gen-setup";
import type { GenSpec } from "@/lib/parlay-gen";
const spec: GenSpec = { market: "anytime_td", legs: 3, legMinAm: -230, legMaxAm: 200,
  payout: null, sides: "o", onePerGame: true, onePerTeam: true, czOnly: false, modelOnly: false, includeStarted: false,
  pinned: ["old-player", null, null] };
describe("saved generator setup", () => {
  it("restores supported position filters and rejects positions this desk does not support", () => {
    const raw = encodeSetup({ ...spec, positions: ["WR", "RB"] });
    expect(decodeSetup(raw, ["anytime_td"], ["QB", "WR", "RB", "TE"])?.positions).toEqual(["RB", "WR"]);
    expect(decodeSetup(raw, ["anytime_td"])).toBeNull();
    expect(decodeSetup(encodeSetup({ ...spec, positions: ["???"] }), ["anytime_td"], ["WR", "RB"])).toBeNull();
  });
  it("restores boundaries without carrying stale player pins, and writes version 2", () => {
    expect(encodeSetup(spec)).not.toContain("old-player");
    expect(JSON.parse(encodeSetup(spec)).version).toBe(2);
    expect(decodeSetup(encodeSetup(spec), ["anytime_td"])).toEqual({ ...spec, pinned: [null, null, null] });
  });
  it("2026-09-18: several categories, the spread rule and the hit-rate floor round-trip; the games filter does not", () => {
    const multi: GenSpec = { ...spec, market: "pass_yds", markets: ["pass_yds", "anytime_td"], spread: false, minHit: 0.6, games: ["g1"] };
    const back = decodeSetup(encodeSetup(multi), ["anytime_td", "pass_yds"]);
    expect(back?.markets).toEqual(["pass_yds", "anytime_td"]);
    expect(back?.spread).toBe(false);
    expect(back?.minHit).toBe(0.6);
    expect(back?.games).toBeUndefined(); // a game key is one board's; it never survives to another day
    expect(encodeSetup(multi)).not.toContain("g1");
    /* a category this desk does not know voids the recipe; a duplicate is folded; the primary is kept first */
    expect(decodeSetup(encodeSetup(multi), ["anytime_td"])).toBeNull();
    expect(decodeSetup(encodeSetup({ ...multi, markets: ["anytime_td", "pass_yds", "anytime_td"] }), ["anytime_td", "pass_yds"])?.markets).toEqual(["pass_yds", "anytime_td"]);
    expect(decodeSetup(JSON.stringify({ version: 2, settings: { ...spec, minHit: 1.5 } }), ["anytime_td"])).toBeNull();
    expect(decodeSetup(JSON.stringify({ version: 2, settings: { ...spec, spread: "yes" } }), ["anytime_td"])).toBeNull();
  });
  it("a version-1 recipe (with a build style) still loads — the style is dropped, nothing else changes", () => {
    const v1 = JSON.stringify({ version: 1, settings: { ...spec, style: "safer", pinned: undefined } });
    expect(decodeSetup(v1, ["anytime_td"])).toEqual({ ...spec, pinned: [null, null, null] });
    expect(decodeSetup(JSON.stringify({ version: 1, settings: { ...spec, style: "guaranteed" } }), ["anytime_td"])).toBeNull();
  });
  it("R2b (2026-09-18): the team rule round-trips; a recipe saved before it existed loads with it ON; a non-boolean voids the recipe", () => {
    expect(decodeSetup(encodeSetup({ ...spec, onePerTeam: false }), ["anytime_td"])?.onePerTeam).toBe(false);
    expect(decodeSetup(encodeSetup(spec), ["anytime_td"])?.onePerTeam).toBe(true);
    const { onePerTeam: _drop, pinned: _pins, ...legacy } = spec;
    expect(decodeSetup(JSON.stringify({ version: 2, settings: legacy }), ["anytime_td"])?.onePerTeam).toBe(true);
    expect(decodeSetup(JSON.stringify({ version: 1, settings: { ...legacy, style: "safer" } }), ["anytime_td"])?.onePerTeam).toBe(true);
    expect(decodeSetup(JSON.stringify({ version: 2, settings: { ...spec, onePerTeam: "no" } }), ["anytime_td"])).toBeNull();
  });
  it("rejects corruption, unknown sports and invalid odds or leg counts", () => {
    expect(decodeSetup("broken", ["anytime_td"])).toBeNull();
    expect(decodeSetup(encodeSetup(spec), ["batter_hits"])).toBeNull();
    for (const patch of [{ legs: 99 }, { legs: 2.5 }, { legMaxAm: 0 }, { legMinAm: Infinity }, { payout: { minAm: 5, maxAm: 900 } }, { sides: "yes" }]) {
      expect(decodeSetup(JSON.stringify({ version: 2, settings: { ...spec, ...patch } }), ["anytime_td"])).toBeNull();
    }
  });
});
