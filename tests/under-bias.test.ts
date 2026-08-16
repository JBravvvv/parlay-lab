import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { UNDER_BIAS, legSide, pruneOutsUnder, underStats, type BiasTicket } from "@/lib/under-bias";

/**
 * THE UNDER BIAS (2026-08-16, Josh's word: "I would prefer them [pitcher-outs unders]
 * not to be included very often & would also like overs to have a 75% bias for use vs
 * 25% bias to unders for use in parlays. I don't want as many unders").
 *
 * THE DATA THAT PROMPTED IT (3 served days, 619 graded picks, read 2026-08-16 from
 * /api/picks): outs unders 20-28 (41.7% vs 49.6% model, −8.0) and they were 48 of 58
 * outs picks; unders as a CLASS run 5–9 points below model (hits u −7.4, TB u −8.6)
 * while overs run at/above. The weekly calibration fit is PER-MARKET and cannot see
 * side — outs already carries the maximum shrink (mult 0.143) and unders still leaked
 * through. This layer is side-aware where the fit is not.
 *
 * Two rules, both in the paper pool (lock-card), both deterministic:
 *   1. OUTS-UNDER RARE: tickets carrying a pitcher_outs UNDER leg leave the pool;
 *      they are re-admitted (least-under-heavy first) ONLY if the remainder cannot
 *      seat the day's minimum tickets — "not included very often", literally.
 *   2. 75/25 QUOTA: the staked card's prop legs may be at most 25% unders — enforced
 *      by a bounded re-run loop that evicts the most under-heavy picked ticket and
 *      re-allocates. ML/RL legs have no side and stay out of the denominator.
 */

const L = (prop: string, market = "batter_hits", player = "px") => ({
  lkey: `${player}|${market}|1.5`,
  prop,
  label: player,
});
const ML = { lkey: "ml_home", prop: "ML vs X", label: "team" };
const T = (name: string, legs: { lkey: string | null; prop: string }[], czEv: number | null = 0): BiasTicket => ({
  name,
  czEv,
  legs,
});

describe("legSide — the production vocabulary, sided props only", () => {
  it("U/O extract from the prop text; ML/RL and sideless rows are null", () => {
    expect(legSide(L("Hits U 1.5"))).toBe("u");
    expect(legSide(L("Hits O 1.5"))).toBe("o");
    expect(legSide(L("Pitcher Outs U 15", "pitcher_outs"))).toBe("u");
    expect(legSide(L("HR O 0.5", "batter_home_runs"))).toBe("o");
    expect(legSide(ML)).toBe(null); // 1-part lkey — not a prop
    expect(legSide({ lkey: "p|rl|1.5", prop: "RL +1.5 vs X", label: "t" })).toBe(null); // no O/U token
  });
});

describe("underStats — the quota's denominator is PROP legs only", () => {
  it("counts unders over sided prop legs; ML/RL never dilute the share", () => {
    const s = underStats([
      T("a", [L("Hits U 1.5"), L("Hits O 1.5"), ML]),
      T("b", [L("TB O 1.5", "batter_total_bases"), ML]),
    ]);
    expect(s.propLegs).toBe(3);
    expect(s.underLegs).toBe(1);
    expect(s.share).toBeCloseTo(1 / 3, 9);
  });
  it("vacuity: an ML/RL-only card has share 0, not NaN", () => {
    const s = underStats([T("a", [ML, ML])]);
    expect(s.share).toBe(0);
  });
});

describe("pruneOutsUnder — rare means LAST RESORT, not never", () => {
  const OU = (n: string, unders: number) =>
    T(n, [
      ...Array.from({ length: unders }, (_, i) => L(`Pitcher Outs U 1${i}`, "pitcher_outs", `p${n}${i}`)),
      L("Hits O 1.5", "batter_hits", `h${n}`),
    ]);
  const CLEAN = (n: string) => T(n, [L("Hits O 1.5", "batter_hits", `h${n}`), ML]);

  it("PLANT: with a healthy pool, every outs-under ticket is dropped", () => {
    const pool = [OU("x", 1), CLEAN("a"), CLEAN("b"), CLEAN("c"), OU("y", 2)];
    const out = pruneOutsUnder(pool, 3);
    expect(out.pool.map((t) => t.name)).toEqual(["a", "b", "c"]);
    expect(out.readmitted).toBe(0);
    expect(out.dropped).toBe(2);
  });
  it("SEATABILITY FALLBACK: a pool that cannot seat the minimum re-admits least-under-heavy first", () => {
    const pool = [OU("x", 2), OU("y", 1), CLEAN("a"), CLEAN("b")];
    const out = pruneOutsUnder(pool, 3);
    expect(out.pool.map((t) => t.name).sort()).toEqual(["a", "b", "y"]); // y (1 under) before x (2)
    expect(out.readmitted).toBe(1);
  });
  it("deterministic: same pool, same result", () => {
    const pool = [OU("x", 2), OU("y", 1), CLEAN("a")];
    expect(JSON.stringify(pruneOutsUnder(pool, 2))).toBe(JSON.stringify(pruneOutsUnder([...pool], 2)));
  });
});

describe("the constant is Josh's number", () => {
  it("75% overs / 25% unders", () => {
    expect(UNDER_BIAS.overShare).toBe(0.75);
  });
});

describe("wired — source scans, comment-stripped", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const read = (p: string) => strip(fs.readFileSync(path.join(process.cwd(), p), "utf8"));

  it("lock-card prunes outs-unders from the paper pool and enforces the quota with a bounded re-run loop", () => {
    const src = read("src/lib/server/lock-card.ts");
    expect(src).toMatch(/pruneOutsUnder\(/);
    expect(src).toMatch(/underStats\(/);
    expect(src).toMatch(/UNDER_BIAS/);
    expect(src).toMatch(/underShare/); // stamped on the entry — the share is never a mystery
  });
});
