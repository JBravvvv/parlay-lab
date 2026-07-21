import { describe, expect, it } from "vitest";
import {
  fitGlobalShrink,
  fitReliability,
  pooledSlopeAt,
  shrunkP,
  slopeMults,
  wilson,
  type GradedPick,
} from "@/engine2/calibration";
import { createEngine } from "@/engine";

/* Prop over-confidence diagnosis (2026-07-20): reliability slopes fitted from the
   graded record, per-market slope-driven calW shrink, and the global model-
   confidence factor backtested until pooled slopes approach 1.0. All synthetic
   fixtures are DETERMINISTIC — exact win counts, no RNG. */

/** n legs stated at p% with exactly `won` winners; consensus pMkt logged. */
function batch(market: string, p: number, pMkt: number, n: number, won: number): GradedPick[] {
  const out: GradedPick[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ market, p, edge: null, lu: "confirmed", res: i < won ? "won" : "lost", pMkt });
  }
  return out;
}

/* Overconfident fixture: the model states 30/50/70 but reality is 40/50/60 —
   stated deviations are exactly 2x the real ones (true slope 0.5). Consensus
   (pMkt) sits at the realized rate. */
function overconfident(market: string): GradedPick[] {
  return [
    ...batch(market, 30, 40, 200, 80), // realized 40%
    ...batch(market, 50, 50, 200, 100), // realized 50%
    ...batch(market, 70, 60, 200, 120), // realized 60%
  ];
}

/* Calibrated fixture: stated rate = realized rate at every level. */
function calibrated(market: string): GradedPick[] {
  return [
    ...batch(market, 40, 40, 200, 80),
    ...batch(market, 55, 55, 200, 110),
    ...batch(market, 70, 70, 200, 140),
  ];
}

describe("fitReliability — per-market predicted-vs-realized slope", () => {
  it("a calibrated market fits slope ≈ 1", () => {
    const rel = fitReliability(calibrated("batter_hits"));
    expect(rel.batter_hits.n).toBe(600);
    expect(rel.batter_hits.slope).toBeCloseTo(1.0, 6);
  });
  it("the overconfident market fits its true slope (0.5) with a tight CI", () => {
    const rel = fitReliability(overconfident("batter_hits"));
    expect(rel.batter_hits.slope).toBeCloseTo(0.5, 6);
    expect(rel.batter_hits.se).not.toBeNull();
    expect(rel.batter_hits.slope! + 1.96 * rel.batter_hits.se!).toBeLessThan(1);
  });
  it("pooled 'all' row covers every leg; a single-probability market is unfittable, not faked", () => {
    const picks = [...overconfident("batter_hits"), ...batch("ml", 55, 55, 100, 55)];
    const rel = fitReliability(picks);
    expect(rel.all.n).toBe(700);
    expect(rel.ml.slope).toBeNull(); // zero spread in predictions — no slope to fit
  });
});

describe("fitGlobalShrink — backtested model-confidence factor", () => {
  it("finds the shrink that restores the pooled slope toward 1.0 on the overconfident record", () => {
    const g = fitGlobalShrink(overconfident("batter_hits"));
    expect(g.slopeBefore).toBeCloseTo(0.5, 6);
    expect(g.s).toBeLessThan(1);
    expect(g.slopeAfter).not.toBeNull();
    expect(g.slopeAfter!).toBeGreaterThanOrEqual(0.85);
    expect(g.slopeAfter!).toBeLessThanOrEqual(1.15);
  });
  it("post-shrink predicted rates track realized within the 95% confidence interval (the spec's test)", () => {
    const picks = overconfident("batter_hits");
    const g = fitGlobalShrink(picks);
    // group the fixture by stated level and check each level's replayed prediction
    for (const p of [30, 50, 70]) {
      const sel = picks.filter((x) => x.p === p);
      const won = sel.filter((x) => x.res === "won").length;
      const ci = wilson(won, sel.length);
      const post = shrunkP(p, sel[0].pMkt as number, g.s) / 100;
      expect(post).toBeGreaterThanOrEqual(ci.lo);
      expect(post).toBeLessThanOrEqual(ci.hi);
    }
  });
  it("a calibrated record gets NO shrink (least intervention wins)", () => {
    const g = fitGlobalShrink(calibrated("batter_hits"));
    expect(g.s).toBe(1);
    expect(g.slopeBefore).toBeCloseTo(1.0, 6);
  });
  it("refuses to act below 150 consensus-logged legs", () => {
    const thin = overconfident("batter_hits").slice(0, 100);
    expect(fitGlobalShrink(thin).s).toBe(1);
  });
  it("never shrinks past the floor, even on a pathological record", () => {
    // stated deviations 10x reality — wants s≈0.1, floor holds at 0.15
    const patho = [
      ...batch("batter_hits", 30, 49, 300, 147),
      ...batch("batter_hits", 70, 51, 300, 153),
    ];
    const g = fitGlobalShrink(patho);
    expect(g.s).toBeGreaterThanOrEqual(0.15);
    const replay = pooledSlopeAt(patho, g.s);
    expect(Math.abs(replay.slope! - 1)).toBeLessThan(Math.abs(g.slopeBefore! - 1)); // strictly better than doing nothing
  });
});

describe("slopeMults — nightly per-market calW from the slope fit", () => {
  it("an overconfident market gets pulled by exactly its slope; calibrated and thin markets are untouched", () => {
    const rel = fitReliability([
      ...overconfident("batter_hits"),
      ...calibrated("batter_total_bases"),
      ...overconfident("pitcher_strikeouts").slice(0, 60), // under SLOPE_MIN_N
    ]);
    const m = slopeMults(rel);
    expect(m.batter_hits).toBeCloseTo(0.5, 3);
    expect(m.batter_total_bases).toBeUndefined();
    expect(m.pitcher_strikeouts).toBeUndefined();
    expect(m.all).toBeUndefined(); // the pooled row never becomes a market mult
  });
});

describe("engine shWm — calG global confidence shrink", () => {
  const stubFetch = () => Promise.resolve({ ok: false, body: {} });
  it("dormant (no SH_V2) → shipped blend weight, untouched (parity guarantee)", () => {
    const e = createEngine({ fetchJson: stubFetch, today: "2026-07-20" });
    expect(e.get<(b: number, m: string) => number>("shWm")(0.35, "batter_hits")).toBe(0.35);
  });
  it("calG shrinks every market; combines multiplicatively with per-market calW; 5% absolute floor holds", () => {
    const e = createEngine({ fetchJson: stubFetch, today: "2026-07-20" });
    e.set("SH_V2", { calW: { batter_hits: 0.5 }, calG: 0.6 });
    const wm = e.get<(b: number, m: string) => number>("shWm");
    expect(wm(0.35, "batter_hits")).toBeCloseTo(0.35 * 0.5 * 0.6, 10);
    expect(wm(0.35, "batter_total_bases")).toBeCloseTo(0.35 * 0.6, 10);
    e.set("SH_V2", { calG: 0.05 });
    expect(wm(0.35, "batter_hits")).toBe(0.05); // absolute floor
    e.set("SH_V2", { calG: 1 });
    expect(wm(0.35, "batter_hits")).toBe(0.35);
    e.set("SH_V2", { calG: -2 }); // garbage in → neutral, never amplified
    expect(wm(0.35, "batter_hits")).toBe(0.35);
  });
});
