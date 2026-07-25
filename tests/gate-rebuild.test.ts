import { describe, expect, it } from "vitest";
import { gateRebuild, rebuildCounts, rebuildSentence, REBUILD_WINDOW_DAYS } from "@/lib/gate-rebuild";
import { CAL_START } from "@/engine2/calibration";

/**
 * PHASE 1 — the selection-tightening notice. The 0.5 cutoff restarts every
 * market's graded count, mktN feeds the small-sample consensus gate, so for a
 * few days the card is quieter for a reason that is not edge. The failure mode
 * this guards is human: reading the quiet card as the model going cold,
 * overriding, and booking creep into the Discipline report that isn't creep.
 */

const N = (o: Record<string, number>) => o;

describe("gateRebuild", () => {
  it("fires for markets under the gate's threshold, richest first", () => {
    const r = gateRebuild(N({ batter_hits: 51, batter_hits_runs_rbis: 34, batter_total_bases: 140 }), 100, "2026-07-26", [
      "batter_hits",
      "batter_hits_runs_rbis",
      "batter_total_bases",
    ]);
    expect(r.rebuilding).toBe(true);
    expect(r.rows.map((x) => x.market)).toEqual(["batter_hits", "batter_hits_runs_rbis"]);
    expect(rebuildCounts(r.rows)).toBe("Hits 51/100 · H+R+RBI 34/100");
  });

  it("says nothing once every market has refilled", () => {
    const full = Object.fromEntries(
      ["ml", "rl", "batter_hits", "batter_total_bases", "batter_home_runs", "batter_hits_runs_rbis", "pitcher_strikeouts", "pitcher_outs"].map(
        (m) => [m, 250],
      ),
    );
    expect(gateRebuild(full, 100, "2026-07-30").rebuilding).toBe(false);
  });

  it("treats a missing market as zero, not as unknown — the engine does too", () => {
    const r = gateRebuild(N({ batter_hits: 120 }), 100, "2026-07-26", ["batter_hits", "pitcher_outs"]);
    expect(r.rows).toEqual([{ market: "pitcher_outs", n: 0, need: 100 }]);
  });

  it("with no calibration store at all, every card market is reported", () => {
    const r = gateRebuild(null, 100, "2026-07-26", ["ml", "batter_hits"]);
    expect(r.rows.map((x) => x.n)).toEqual([0, 0]);
    expect(r.rebuilding).toBe(true);
  });

  it("scopes to the card's markets when given, else reports every market", () => {
    const thin = N({});
    expect(gateRebuild(thin, 100, "2026-07-26", ["ml"]).rows).toHaveLength(1);
    expect(gateRebuild(thin, 100, "2026-07-26").rows).toHaveLength(8);
  });

  it("dedupes repeated markets from a multi-leg card", () => {
    const r = gateRebuild(N({}), 100, "2026-07-26", ["batter_hits", "batter_hits", "batter_hits"]);
    expect(r.rows).toHaveLength(1);
  });

  it("never fires before the restart date", () => {
    expect(gateRebuild(N({}), 100, "2026-07-24").rebuilding).toBe(false);
    expect(gateRebuild(N({}), 100, CAL_START).rebuilding).toBe(true);
  });

  it("stops claiming 'rebuilding' once the rolling window holds no pre-restart data", () => {
    const day = (n: number) => new Date(Date.parse(`${CAL_START}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
    expect(gateRebuild(N({}), 100, day(REBUILD_WINDOW_DAYS)).rebuilding).toBe(true);
    // past the window a thin market is just a thin market — a different statement
    expect(gateRebuild(N({}), 100, day(REBUILD_WINDOW_DAYS + 1)).rebuilding).toBe(false);
  });

  it("counts days from the restart for the 'day N' line", () => {
    expect(gateRebuild(N({}), 100, "2026-07-25").daysIn).toBe(0);
    expect(gateRebuild(N({}), 100, "2026-07-28").daysIn).toBe(3);
  });

  it("states plainly that it is not a model signal", () => {
    const s = rebuildSentence(gateRebuild(N({ batter_hits_runs_rbis: 34 }), 100, "2026-07-26", ["batter_hits_runs_rbis"]).rows);
    expect(s).toContain("H+R+RBI 34/100");
    expect(s).toContain("not a model signal");
  });
});
