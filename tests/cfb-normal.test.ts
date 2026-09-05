import { describe, expect, it } from "vitest";
import { normCdf, normInv, normPdf } from "@/lib/cfb/normal";

/**
 * THE NORMAL MODEL'S TWO PRIMITIVES (INSTRUCTION 38, 2026-09-05). Every CFB row's fair
 * probability goes through Φ and every book's implied margin goes through Φ⁻¹, so both are
 * pinned against closed-form references. The Φ table below was produced independently by
 * Python's `math.erfc` (0.5·erfc(−z/√2)) — a different implementation from the Hart
 * rational approximation under test — so agreement is evidence, not tautology.
 */

const PHI_REF: Array<[number, number]> = [
  [-6, 9.865876450377014e-10],
  [-3, 0.0013498980316300957],
  [-2.5, 0.0062096653257761375],
  [-1.96, 0.02499789514822043],
  [-1, 0.15865525393145705],
  [-0.5, 0.30853753872598694],
  [-0.1, 0.460172162722971],
  [0, 0.5],
  [0.1, 0.539827837277029],
  [0.5, 0.691462461274013],
  [1, 0.8413447460685429],
  [1.5, 0.9331927987311419],
  [1.96, 0.9750021048517795],
  [2, 0.9772498680518208],
  [2.5, 0.9937903346742238],
  [3, 0.9986501019683699],
  [4, 0.9999683287581669],
  [6, 0.9999999990134123],
  [8, 0.9999999999999993],
];

describe("normCdf — Φ against an independent erfc reference", () => {
  it("normCdf(0) is exactly 0.5 and normCdf(1.96) ≈ 0.975", () => {
    expect(normCdf(0)).toBe(0.5);
    expect(Math.abs(normCdf(1.96) - 0.975)).toBeLessThan(1e-5);
  });
  it.each(PHI_REF)("Φ(%f) within 1e-12 of the erfc reference", (z, ref) => {
    expect(Math.abs(normCdf(z) - ref)).toBeLessThan(1e-12);
  });
  it("is symmetric, monotone and bounded", () => {
    for (let z = -8; z <= 8; z += 0.37) {
      expect(Math.abs(normCdf(z) + normCdf(-z) - 1)).toBeLessThan(1e-14);
      expect(normCdf(z)).toBeGreaterThanOrEqual(0);
      expect(normCdf(z)).toBeLessThanOrEqual(1);
      expect(normCdf(z + 0.01)).toBeGreaterThanOrEqual(normCdf(z));
    }
    expect(normCdf(40)).toBe(1);
    expect(normCdf(-40)).toBe(0);
    expect(Number.isNaN(normCdf(Number.NaN))).toBe(true);
  });
  it("normPdf is the standard density", () => {
    expect(Math.abs(normPdf(0) - 0.3989422804014327)).toBeLessThan(1e-15);
    expect(Math.abs(normPdf(1) - 0.24197072451914337)).toBeLessThan(1e-15);
  });
});

describe("normInv — Φ⁻¹ is the exact inverse", () => {
  it("normInv(normCdf(x)) ≈ x across the usable range", () => {
    for (let x = -5.5; x <= 5.5; x += 0.113) {
      expect(Math.abs(normInv(normCdf(x)) - x)).toBeLessThan(1e-9);
    }
  });
  it("normCdf(normInv(p)) ≈ p including both tails", () => {
    for (const p of [1e-9, 1e-6, 0.001, 0.02, 0.02425, 0.1, 0.25, 0.5, 0.75, 0.9, 0.97575, 0.98, 0.999, 1 - 1e-6, 1 - 1e-9]) {
      expect(Math.abs(normCdf(normInv(p)) - p)).toBeLessThan(1e-13);
    }
  });
  it("the textbook quantiles", () => {
    expect(normInv(0.5)).toBe(0);
    expect(Math.abs(normInv(0.975) - 1.959963984540054)).toBeLessThan(1e-12);
    expect(Math.abs(normInv(0.025) + 1.959963984540054)).toBeLessThan(1e-12);
    expect(Math.abs(normInv(0.8413447460685429) - 1)).toBeLessThan(1e-12);
  });
  it("impossible probabilities are ±∞ / NaN, never a finite invention", () => {
    expect(normInv(0)).toBe(Number.NEGATIVE_INFINITY);
    expect(normInv(1)).toBe(Number.POSITIVE_INFINITY);
    expect(normInv(-0.1)).toBe(Number.NEGATIVE_INFINITY);
    expect(Number.isNaN(normInv(Number.NaN))).toBe(true);
  });
});
