import { describe, expect, it } from "vitest";
import { gateRebuild, rebuildCounts, rebuildSentence, reopenDays, REBUILD_WINDOW_DAYS } from "@/lib/gate-rebuild";
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

/**
 * THE REOPENING DATE IS THE DATE BETTING RESUMES — so it is measured, not projected once.
 *
 * Under `consMinN` a market's tickets must ALSO clear the de-vigged consensus, which is what
 * blocked all 18 tickets on 2026-07-26. The docs carried "Total Bases ~08-06, hits ~08-09",
 * projected once from an assumed rate. Measured against the real per-date counts on
 * 2026-07-27 (graded=70 over two complete dates) those are 08-17 and 08-23 — **eleven to
 * fourteen days optimistic**. A projection that cannot move is a stale number wearing a
 * commitment's clothes, so `/api/calibrate` now recomputes it nightly and the drift check
 * prints it with its denominator.
 */
describe("reopenDays — the consMinN projection", () => {
  it("returns 0 when the market is already open", () => {
    expect(reopenDays(100, 3, 100)).toBe(0);
    expect(reopenDays(140, 0, 100)).toBe(0); // open, and the rate is then irrelevant
  });

  it("returns null — not Infinity, not a huge number — when nothing is accruing", () => {
    // a market at 0.0/day is a BROKEN LOGGING PATH, not a distant date. Rendering it as
    // "2049-03-11" would read as a schedule; null forces the drift check to say "never".
    expect(reopenDays(7, 0, 100)).toBeNull();
    expect(reopenDays(7, -1, 100)).toBeNull();
  });

  it("rounds UP: a partial day is a day the gate is still shut", () => {
    expect(reopenDays(99, 2, 100)).toBe(1);
    expect(reopenDays(90, 3, 100)).toBe(4); // 10/3 = 3.33 -> 4
  });

  it("reproduces the measured 2026-07-27 accrual, and the docs' dates were optimistic", () => {
    // n over two complete dates -> rate = n/2
    expect(reopenDays(9, 4.5, 100)).toBe(21); // Total Bases: 07-27 + 21 = 2026-08-17
    expect(reopenDays(7, 3.5, 100)).toBe(27); // Hits:        07-27 + 27 = 2026-08-23
    expect(reopenDays(15, 7.5, 100)).toBe(12); // ML/RL:      07-27 + 12 = 2026-08-08
    expect(reopenDays(5, 2.5, 100)).toBe(38); // K's / Outs:  07-27 + 38 = 2026-09-03
    // the doc said 08-06 for Total Bases: 10 days of accrual, i.e. ~9.1/day — double the
    // measured rate. That is the failure mode the nightly recompute exists to end.
    expect(reopenDays(9, 9.1, 100)).toBe(10);
  });
});
