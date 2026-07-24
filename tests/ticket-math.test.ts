import { describe, expect, it } from "vitest";
import { amFmt, amToDec, combineTicket, decToAm } from "@/lib/ticket-math";

/* Parlay Builder sandbox: pure ticket math. Prices real (CZ quotes), combined
   true % deliberately naive (no correlation) — the page discloses both. */

describe("sandbox ticket math", () => {
  it("american ↔ decimal round-trips on both sides of the seam", () => {
    expect(amToDec(100)).toBeCloseTo(2);
    expect(amToDec(-110)).toBeCloseTo(1.9091, 3);
    expect(amToDec(250)).toBeCloseTo(3.5);
    expect(decToAm(2.5)).toBe(150);
    expect(decToAm(1.5)).toBe(-200);
    expect(amFmt(decToAm(amToDec(-135)))).toBe("-135");
    expect(amFmt(decToAm(amToDec(220)))).toBe("+220");
  });

  it("combines legs: product odds, naive product true %, EV at the combined price", () => {
    const t = combineTicket([
      { cz: -110, prob: 60 },
      { cz: 150, prob: 40 },
    ])!;
    expect(t.n).toBe(2);
    expect(t.dec).toBeCloseTo((21 / 11) * 2.5, 4);
    expect(t.trueProb).toBeCloseTo(0.24);
    expect(t.impProb).toBeCloseTo(1 / t.dec);
    expect(t.ev).toBeCloseTo(0.24 * t.dec - 1);
    expect(t.payout(10)).toBeCloseTo(10 * t.dec);
    expect(combineTicket([])).toBeNull();
  });

  it("a fair single (price = probability) is exactly 0 EV", () => {
    const t = combineTicket([{ cz: 100, prob: 50 }])!;
    expect(t.ev).toBeCloseTo(0);
    expect(t.am).toBe(100);
  });
});
