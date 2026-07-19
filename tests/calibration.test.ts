import { describe, expect, it } from "vitest";
import {
  applyWeeklyAdjustment,
  calibrationLine,
  computeCalibration,
  tierFor,
  wilson,
  WEEK_MS,
  type GradedPick,
  type WeightState,
} from "../src/engine2/calibration";
import { gradePrediction, starterInfo, type Boxscore } from "../src/engine2/grade";

const pick = (market: string, p: number, res: "won" | "lost", edge = 5, lu: "confirmed" | "projected" = "confirmed"): GradedPick => ({
  market,
  p,
  edge,
  lu,
  res,
});

/** n picks stated at p%, hitting at actualRate. */
const batch = (market: string, n: number, p: number, actualRate: number, edge = 5): GradedPick[] =>
  Array.from({ length: n }, (_, i) => pick(market, p, i < Math.round(n * actualRate) ? "won" : "lost", edge));

describe("tiers + Wilson CI", () => {
  it("graduated tiers by sample size", () => {
    expect(tierFor(49)).toBe("MONITOR");
    expect(tierFor(50)).toBe("SOFT");
    expect(tierFor(99)).toBe("SOFT");
    expect(tierFor(100)).toBe("HARD");
    expect(tierFor(150)).toBe("ADJUST");
  });
  it("Wilson interval behaves (tighter with n, contains the point rate)", () => {
    const small = wilson(6, 10);
    const big = wilson(600, 1000);
    expect(big.hi - big.lo).toBeLessThan(small.hi - small.lo);
    expect(big.lo).toBeLessThan(0.6);
    expect(big.hi).toBeGreaterThan(0.6);
  });
});

describe("computeCalibration", () => {
  it("a well-calibrated market shows no significance", () => {
    const s = computeCalibration(batch("batter_hits", 200, 57, 0.57));
    expect(s.perMarket.batter_hits.significant).toBe(false);
    expect(s.perMarket.batter_hits.tier).toBe("ADJUST");
  });
  it("the spec's own example flags: predicted 62%, actual 49% over n=214 = OVERCONFIDENT", () => {
    const s = computeCalibration(batch("batter_hits_runs_rbis", 214, 62, 0.49, 22));
    const pm = s.perMarket.batter_hits_runs_rbis;
    expect(pm.significant).toBe(true);
    expect(pm.direction).toBe("hot");
  });
  it("a real gap under n=50 stays MONITOR — pure variance takes no action", () => {
    const s = computeCalibration(batch("pitcher_strikeouts", 40, 60, 0.40));
    expect(s.perMarket.pitcher_strikeouts.tier).toBe("MONITOR");
  });
  it("sanity breaker: 30%+ stated edge hitting below half the predicted rate over n>=30 → quarantine", () => {
    const s = computeCalibration(batch("batter_home_runs", 35, 60, 0.25, 35));
    expect(s.quarantine).toContain("batter_home_runs");
    const ok = computeCalibration(batch("batter_home_runs", 35, 60, 0.55, 35));
    expect(ok.quarantine).not.toContain("batter_home_runs");
  });
  it("brier is honest: perfect confidence wins score near 0, coin-flip claims near 0.25", () => {
    const sure = computeCalibration(batch("ml", 100, 99, 0.99));
    const coin = computeCalibration(batch("rl", 100, 50, 0.5));
    expect(sure.perMarket.ml.brier).toBeLessThan(0.05);
    expect(coin.perMarket.rl.brier).toBeGreaterThan(0.2);
    expect(coin.perMarket.rl.brier).toBeLessThan(0.3);
  });
});

describe("applyWeeklyAdjustment (3D guardrails)", () => {
  const fresh: WeightState = { mults: {}, lastAdjust: 0, log: [] };
  it("shrinks a significantly hot ADJUST-tier market by exactly 10%, and logs it", () => {
    const s = computeCalibration(batch("batter_hits_runs_rbis", 214, 62, 0.49));
    const next = applyWeeklyAdjustment(s, fresh, WEEK_MS + 1);
    expect(next.mults.batter_hits_runs_rbis).toBeCloseTo(0.9, 10);
    expect(next.log).toHaveLength(1);
    expect(next.log[0].before).toBe(1);
    expect(next.log[0].after).toBeCloseTo(0.9, 10);
  });
  it("never adjusts more than once per week", () => {
    const s = computeCalibration(batch("batter_hits_runs_rbis", 214, 62, 0.49));
    const first = applyWeeklyAdjustment(s, fresh, WEEK_MS + 1);
    const second = applyWeeklyAdjustment(s, first, WEEK_MS + 1000); // 999ms later
    expect(second).toBe(first);
  });
  it("takes no action below ADJUST tier or without significance", () => {
    const soft = computeCalibration(batch("pitcher_strikeouts", 80, 60, 0.40)); // n=80 = SOFT
    expect(applyWeeklyAdjustment(soft, fresh, WEEK_MS + 1).mults.pitcher_strikeouts).toBeUndefined();
    const fine = computeCalibration(batch("batter_hits", 300, 57, 0.57));
    expect(applyWeeklyAdjustment(fine, fresh, WEEK_MS + 1).mults.batter_hits).toBeUndefined();
  });
  it("drifts a shrunk-but-now-calibrated market back toward 1.0, never past it", () => {
    const fine = computeCalibration(batch("batter_hits", 300, 57, 0.57));
    const state: WeightState = { mults: { batter_hits: 0.9 }, lastAdjust: 0, log: [] };
    const next = applyWeeklyAdjustment(fine, state, WEEK_MS + 1);
    expect(next.mults.batter_hits).toBeCloseTo(0.99, 10);
    const capped = applyWeeklyAdjustment(fine, { ...next, lastAdjust: 0 }, 2 * WEEK_MS + 2);
    expect(capped.mults.batter_hits).toBeLessThanOrEqual(1);
  });
  it("floors: repeated shrinks never push the model weight below 5% absolute", () => {
    let state: WeightState = { mults: {}, lastAdjust: 0, log: [] };
    const hot = computeCalibration(batch("batter_hits_runs_rbis", 214, 62, 0.30));
    for (let wk = 1; wk <= 40; wk++) {
      state = applyWeeklyAdjustment(hot, { ...state, lastAdjust: 0 }, wk * (WEEK_MS + 1));
    }
    // props default weight 0.35 × mult must stay >= 0.05
    expect(0.35 * state.mults.batter_hits_runs_rbis).toBeGreaterThanOrEqual(0.05 - 1e-9);
  });
});

describe("calibration line (3E)", () => {
  it("reads like the spec example and skips tiny samples", () => {
    const picks = [...batch("pitcher_strikeouts", 412, 55, 0.55), ...batch("batter_hits_runs_rbis", 188, 58, 0.47)];
    const line = calibrationLine(computeCalibration(picks));
    expect(line).toContain("K props well-calibrated (n=412)");
    expect(line).toContain("H+R+RBI running");
    expect(line).toContain("n=188");
    expect(calibrationLine(null)).toBeNull();
  });
});

describe("server grading port (matches the engine's void rules)", () => {
  const box: Boxscore = {
    teams: {
      away: {
        players: {
          p1: {
            person: { fullName: "Ryan McMahon" },
            battingOrder: "300",
            stats: { batting: { hits: 2, doubles: 1, triples: 0, homeRuns: 1, runs: 1, rbi: 2 } },
          },
          p2: {
            person: { fullName: "Richie Palacios" },
            gameStatus: { isSubstitute: true },
            battingOrder: "901",
            stats: { batting: { hits: 1 } },
          },
          p3: {
            person: { fullName: "Paul Blackburn" },
            stats: { pitching: { gamesStarted: 1, strikeOuts: 3, outs: 16 } },
          },
        },
      },
      home: { players: {} },
    },
  };
  const finalSt = { state: "Final", away: 4, home: 6 };

  it("grades hits / TB / HR / H+R+RBI with pushes on integers", () => {
    expect(gradePrediction("ryanmcmahon|batter_hits|1.5", "Hits O 1.5", finalSt, box).result).toBe("won");
    expect(gradePrediction("ryanmcmahon|batter_total_bases|4.5", "TB O 4.5", finalSt, box).result).toBe("won"); // 2H=1s+1d? H2 D1 HR1 → TB = 2+1+3? hits incl HR: TB = H + D + 2T + 3HR = 2+1+0+3 = 6
    expect(gradePrediction("ryanmcmahon|batter_hits|2", "Hits O 2", finalSt, box).result).toBe("push");
    expect(gradePrediction("ryanmcmahon|batter_hits_runs_rbis|4.5", "H+R+RBI O 4.5", finalSt, box).result).toBe("won");
  });
  it("voids substitutes and non-starting pitchers; grades starters", () => {
    expect(gradePrediction("richiepalacios|batter_hits|0.5", "Hits O 0.5", finalSt, box).result).toBe("void");
    expect(gradePrediction("paulblackburn|pitcher_strikeouts|2.5", "Ks O 2.5", finalSt, box).result).toBe("won");
    expect(gradePrediction("paulblackburn|pitcher_strikeouts|3.5", "Ks O 3.5", finalSt, box).result).toBe("lost");
  });
  it("ML/RL from the final; postponed voids; pending until final", () => {
    expect(gradePrediction("ml_home", "ML vs X", finalSt, null).result).toBe("won");
    expect(gradePrediction("ml_away", "ML vs X", finalSt, null).result).toBe("lost");
    expect(gradePrediction("rl_away", "RL +1.5 vs X", finalSt, null).result).toBe("lost");
    expect(gradePrediction("ml_home", "ML vs X", { state: "Postponed", away: null, home: null }, null).result).toBe("void");
    expect(gradePrediction("ml_home", "ML vs X", { state: "In Progress", away: 1, home: 0 }, null).result).toBe("pending");
  });
  it("lineup reconciliation: starter info from the boxscore", () => {
    expect(starterInfo(box, "ryanmcmahon")).toEqual({ started: true, order: 3 });
    expect(starterInfo(box, "richiepalacios").started).toBe(false);
    expect(starterInfo(box, "nobody").started).toBe(false);
  });
});

describe("upgrade 03: model vs consensus Brier over the same records (mktCmp)", () => {
  it("hand-computed: model beats the consensus when its probabilities are sharper", () => {
    const picks = [
      // model said 70, consensus 55, it won: model sq (.3)^2=.09, consensus (.45)^2=.2025
      { market: "batter_hits", p: 70, edge: 5, lu: "confirmed" as const, res: "won" as const, pMkt: 55 },
      // model said 60, consensus 50, it lost: model .36, consensus .25
      { market: "batter_hits", p: 60, edge: 3, lu: "confirmed" as const, res: "lost" as const, pMkt: 50 },
      // no pMkt: excluded from the comparison but still in the market rollup
      { market: "batter_hits", p: 65, edge: 2, lu: "confirmed" as const, res: "won" as const, pMkt: null },
    ];
    const s = computeCalibration(picks);
    const pm = s.perMarket.batter_hits;
    expect(pm.n).toBe(3);
    expect(pm.mktCmp).not.toBeNull();
    expect(pm.mktCmp!.n).toBe(2);
    expect(pm.mktCmp!.model).toBeCloseTo((0.09 + 0.36) / 2, 10);
    expect(pm.mktCmp!.consensus).toBeCloseTo((0.2025 + 0.25) / 2, 10);
  });
  it("no consensus anywhere -> mktCmp null, everything else unchanged", () => {
    const s = computeCalibration([{ market: "ml", p: 60, edge: 1, lu: "confirmed" as const, res: "won" as const }]);
    expect(s.perMarket.ml.mktCmp).toBeNull();
    expect(s.perMarket.ml.n).toBe(1);
  });
});
