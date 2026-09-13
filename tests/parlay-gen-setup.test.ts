import { describe, expect, it } from "vitest";
import { decodeSetup, encodeSetup } from "@/lib/parlay-gen-setup";
import type { GenSpec } from "@/lib/parlay-gen";
const spec: GenSpec = { style: "safer", market: "anytime_td", legs: 3, legMinAm: -230, legMaxAm: 200,
  payout: null, sides: "o", onePerGame: true, czOnly: false, modelOnly: false, includeStarted: false,
  pinned: ["old-player", null, null] };
describe("saved generator setup", () => {
  it("restores supported position filters and rejects positions this desk does not support", () => {
    const raw = encodeSetup({ ...spec, positions: ["WR", "RB"] });
    expect(decodeSetup(raw, ["anytime_td"], ["QB", "WR", "RB", "TE"])?.positions).toEqual(["RB", "WR"]);
    expect(decodeSetup(raw, ["anytime_td"])).toBeNull();
    expect(decodeSetup(encodeSetup({ ...spec, positions: ["???"] }), ["anytime_td"], ["WR", "RB"])).toBeNull();
  });
  it("restores boundaries and style without carrying stale player pins", () => {
    expect(encodeSetup(spec)).not.toContain("old-player");
    expect(decodeSetup(encodeSetup(spec), ["anytime_td"])).toEqual({ ...spec, pinned: [null, null, null] });
  });
  it("rejects corruption, unknown sports and invalid odds or leg counts", () => {
    expect(decodeSetup("broken", ["anytime_td"])).toBeNull();
    expect(decodeSetup(encodeSetup(spec), ["batter_hits"])).toBeNull();
    for (const patch of [{ legs: 99 }, { legs: 2.5 }, { legMaxAm: 0 }, { legMinAm: Infinity }, { payout: { minAm: 5, maxAm: 900 } }, { sides: "yes" }, { style: "guaranteed" }]) {
      expect(decodeSetup(JSON.stringify({ version: 1, settings: { ...spec, ...patch } }), ["anytime_td"])).toBeNull();
    }
  });
});
