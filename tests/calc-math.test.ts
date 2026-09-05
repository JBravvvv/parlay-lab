import { describe, expect, it } from "vitest";
import {
  activeLegs,
  americanToDecimal,
  decimalToAmerican,
  evPct,
  fmtAmericanOdds,
  fmtCents,
  fmtDecimal,
  impliedProb,
  impliedProbAmerican,
  jointProb,
  ladder,
  parlayDecimal,
  parseConfidence,
  parseOdds,
  payout,
  profit,
  summaryText,
} from "@/lib/calc-math";

/**
 * PARLAY CALC MATH (INSTRUCTION 40, 2026-09-05) — the pure module behind app/calc.
 * Anchors are the book conventions the older parlay-calc tests already pin: two -110
 * legs on $10 pay $36.45 (+264), and -200 × -300 lands exactly +100.
 */

describe("americanToDecimal / decimalToAmerican — the ±100 seam", () => {
  it("+100 and -100 are both exactly 2.00", () => {
    expect(americanToDecimal(100)).toBe(2);
    expect(americanToDecimal(-100)).toBe(2);
  });
  it("2.00 comes back as +100 (never -100)", () => {
    expect(decimalToAmerican(2)).toBe(100);
  });
  it("round-trips the common prices", () => {
    for (const am of [-110, -150, -200, -300, 120, 150, 250, 1500]) {
      expect(decimalToAmerican(americanToDecimal(am))).toBeCloseTo(am, 9);
    }
    expect(americanToDecimal(150)).toBe(2.5);
    expect(americanToDecimal(-110)).toBeCloseTo(1.9091, 4);
  });
  it("junk in → NaN, never a number that looks real", () => {
    expect(americanToDecimal(0)).toBeNaN();
    expect(americanToDecimal(NaN)).toBeNaN();
    expect(decimalToAmerican(1)).toBeNaN();
    expect(decimalToAmerican(0.5)).toBeNaN();
    expect(decimalToAmerican(Infinity)).toBeNaN();
  });
});

describe("parlayDecimal / activeLegs — pushes are removed, not multiplied", () => {
  it("a pushed leg (decimal 1.00) drops out and the ticket pays on the rest", () => {
    expect(activeLegs([1.9, 1, 2.5])).toEqual([1.9, 2.5]);
    expect(parlayDecimal([1.9, 1, 2.5])).toBeCloseTo(1.9 * 2.5, 12);
  });
  it("non-finite and sub-1 values are dropped too", () => {
    expect(activeLegs([NaN, 0.8, 2, Infinity])).toEqual([2]);
  });
  it("empty legs → 1 (stake back), one leg → that leg", () => {
    expect(parlayDecimal([])).toBe(1);
    expect(parlayDecimal([2.5])).toBe(2.5);
  });
  it("-200 × -300 = 2.00 exactly (even money)", () => {
    expect(parlayDecimal([americanToDecimal(-200), americanToDecimal(-300)])).toBeCloseTo(2, 12);
  });
});

describe("impliedProb / payout / profit", () => {
  it("implied: -110 → 52.4%, +150 → 40%, +100 → 50%", () => {
    expect(impliedProbAmerican(-110)).toBeCloseTo(0.5238, 4);
    expect(impliedProbAmerican(150)).toBeCloseTo(0.4, 12);
    expect(impliedProbAmerican(100)).toBe(0.5);
    expect(impliedProb(0)).toBeNaN();
  });
  it("the classic two-teamer: $10 on -110/-110 pays $36.45, wins $26.45", () => {
    const dec = parlayDecimal([americanToDecimal(-110), americanToDecimal(-110)]);
    expect(payout(10, dec)).toBe(36.45);
    expect(profit(10, dec)).toBe(26.45);
    expect(Math.round(decimalToAmerican(dec))).toBe(264);
  });
  it("one leg round-trips its own price: $25 at +150 wins $37.50, pays $62.50", () => {
    expect(payout(25, 2.5)).toBe(62.5);
    expect(profit(25, 2.5)).toBe(37.5);
  });
  it("no stake or a bad decimal → 0, never NaN", () => {
    expect(payout(0, 2)).toBe(0);
    expect(payout(-5, 2)).toBe(0);
    expect(payout(10, NaN)).toBe(0);
    expect(profit(10, 0.5)).toBe(0);
  });
  it("cents round once at the end", () => {
    // 3 × -110 on $10: 10 × (21/11)^3 = 69.579… → $69.58 (per-leg rounding would drift)
    const dec = parlayDecimal([-110, -110, -110].map(americanToDecimal));
    expect(payout(10, dec)).toBe(69.58);
    expect(profit(10, dec)).toBe(59.58);
  });
});

describe("evPct / jointProb — the user's own read vs the line", () => {
  it("rating the ticket exactly at the implied line is 0% EV", () => {
    expect(evPct(1 / 2.5, 2.5)).toBeCloseTo(0, 12);
  });
  it("55% on a +100 ticket is +10% EV; 45% is -10%", () => {
    expect(evPct(0.55, 2)).toBeCloseTo(10, 12);
    expect(evPct(0.45, 2)).toBeCloseTo(-10, 12);
  });
  it("joint probability multiplies; empty or out-of-range → NaN", () => {
    expect(jointProb([0.5, 0.5])).toBe(0.25);
    expect(jointProb([])).toBeNaN();
    expect(jointProb([0.5, 1.2])).toBeNaN();
    expect(evPct(1.5, 2)).toBeNaN();
    expect(evPct(0.5, 0)).toBeNaN();
  });
});

describe("ladder — cumulative payout at 2 … N legs, pushes removed", () => {
  const legs = [-110, -110, 150, 200].map(americanToDecimal);
  it("has one rung per leg from 2 to N, in entry order", () => {
    const l = ladder(10, legs);
    expect(l.map((r) => r.legs)).toEqual([2, 3, 4]);
    expect(l[0].pays).toBe(36.45);
    expect(l[0].wins).toBe(26.45);
    expect(l[1].decimal).toBeCloseTo(legs[0] * legs[1] * legs[2], 12);
    expect(l[2].pays).toBe(payout(10, parlayDecimal(legs)));
  });
  it("1 leg → empty at the default minLegs, one rung when minLegs is 1", () => {
    expect(ladder(10, [2.5])).toEqual([]);
    expect(ladder(10, [2.5], 1)).toEqual([{ legs: 1, decimal: 2.5, american: 150, pays: 25, wins: 15 }]);
  });
  it("empty legs → empty ladder; a push in the middle shortens it", () => {
    expect(ladder(10, [])).toEqual([]);
    expect(ladder(10, [1.9, 1, 2.5]).map((r) => r.legs)).toEqual([2]);
  });
});

describe("parseOdds — one box, either spelling", () => {
  it("American: sign or signless whole number ≥ 100", () => {
    expect(parseOdds("+150")).toEqual({ american: 150, decimal: 2.5, kind: "american" });
    expect(parseOdds("150")?.american).toBe(150);
    expect(parseOdds(" -110 ")?.american).toBe(-110);
    expect(parseOdds("-100")?.decimal).toBe(2);
    expect(parseOdds("+100")?.decimal).toBe(2);
  });
  it("decimal: anything with a point, > 1.00", () => {
    expect(parseOdds("2.50")).toEqual({ american: 150, decimal: 2.5, kind: "decimal" });
    expect(parseOdds("1.91")?.american).toBeCloseTo(-109.89, 2);
    expect(parseOdds("2.")?.decimal).toBe(2);
    expect(parseOdds("1.0")).toBeNull();
    expect(parseOdds("1.")).toBeNull();
    expect(parseOdds("0.5")).toBeNull();
    expect(parseOdds("1001.5")).toBeNull();
  });
  it("rejects the ±100 dead zone, mid-typing integers, and junk", () => {
    for (const bad of ["", "abc", "+50", "-99", "15", "0", "+-110", "--110", "1.5.5", "-2.5"]) {
      expect(parseOdds(bad), `"${bad}" should not parse`).toBeNull();
    }
  });
});

describe("parseConfidence — '55', '55%', '0.55' all mean 0.55", () => {
  it("accepts the three spellings and clamps the meaning", () => {
    expect(parseConfidence("55")).toBe(0.55);
    expect(parseConfidence("55%")).toBe(0.55);
    expect(parseConfidence("0.55")).toBe(0.55);
    expect(parseConfidence(".55")).toBe(0.55);
    expect(parseConfidence("100")).toBe(1);
    expect(parseConfidence("0")).toBe(0);
  });
  it("a whole number is ALWAYS a percent — '1' is 1 %, never a certainty (2026-09-05 review fix)", () => {
    expect(parseConfidence("1")).toBe(0.01);
    expect(parseConfidence("2")).toBe(0.02);
    expect(parseConfidence("1.5")).toBe(0.015);
    expect(parseConfidence("1.0")).toBe(0.01);
    // only the explicit fraction spelling is taken as-is
    expect(parseConfidence("0.5")).toBe(0.5);
    expect(parseConfidence("0.01")).toBe(0.01);
  });
  it("rejects out-of-range and junk", () => {
    for (const bad of ["", "abc", "101", "-5", "55%%"]) expect(parseConfidence(bad), bad).toBeNull();
  });
});

describe("formatters + summary text", () => {
  it("fmtCents / fmtDecimal / fmtAmericanOdds", () => {
    expect(fmtCents(36.45)).toBe("$36.45");
    expect(fmtCents(1234.5)).toBe("$1,234.50");
    expect(fmtCents(-3)).toBe("-$3.00");
    expect(fmtCents(NaN)).toBe("—");
    expect(fmtDecimal(2.5)).toBe("2.50");
    expect(fmtDecimal(NaN)).toBe("—");
    expect(fmtAmericanOdds(264.46)).toBe("+264");
    expect(fmtAmericanOdds(-110)).toBe("-110");
    expect(fmtAmericanOdds(NaN)).toBe("—");
  });
  it("summaryText is plain text with only the user's numbers", () => {
    const t = summaryText({
      stake: 10,
      legs: [
        { label: "", american: -110 },
        { label: "", american: -110 },
      ],
      decimal: 3.6446,
      american: 264.46,
      pays: 36.45,
      wins: 26.45,
      impliedProb: 0.2744,
    });
    expect(t.split("\n")).toEqual([
      "Parlay Lab · 2-leg parlay",
      "Leg 1: -110",
      "Leg 2: -110",
      "Odds: +264 (3.64x) · implied 27.4%",
      "Stake $10.00 → pays $36.45 (wins $26.45)",
    ]);
    expect(t).not.toMatch(/https?:\/\//);
  });
});
