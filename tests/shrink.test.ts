/**
 * MARKET SHRINK (INSTRUCTION 18, 2026-09-03, operator Josh, verbatim: "I would say change
 * everything that you think is necessary to optimize this engine/website and get it on
 * track to start making theoretical money. ... Lets make this app an UNSTOPPABLE
 * theoretical money makin' machine").
 *
 * The diagnosis behind shrinkTicket (19 paper days 2026-08-15..09-02, 129 core tickets):
 * the model said 56.0 wins and 46 landed; the HRR calibration buckets hit WORSE the more
 * edge the model claimed (edge 5-10: pred .634 act .571; edge 10-20: pred .671 act .443).
 * Every leg prob is blended toward the de-vigged consensus `imp`; the ticket prob scales
 * by the ratio of leg products so the engine's simJoint number survives; EVs recompute.
 * OBSERVED RED 2026-09-03 before src/lib/shrink.ts existed (module not found).
 */
import { describe, expect, it } from "vitest";
import { evAt, shrinkTicket } from "@/lib/shrink";

const leg = (prob: number, imp: number | null, extra: Record<string, unknown> = {}) => ({ prob, imp, lkey: "x|batter_hits|0.5", ...extra });

describe("shrinkTicket — pure market blend", () => {
  it("blends every leg halfway to imp at w=0.5 and keeps probRaw on the leg", () => {
    const pl = { prob: 60, czDec: 2, bsDec: 2.1, czEv: 20, bsEv: 26, legs: [leg(60, 50)] };
    const out = shrinkTicket(pl, 0.5);
    expect(out.legs[0].prob).toBe(55);
    expect(out.legs[0].probRaw).toBe(60);
    expect(out.prob).toBeCloseTo(55, 6);
    expect(out.probRaw).toBe(60);
    expect(out.shrinkW).toBe(0.5);
  });

  it("w=1 is the identity on probabilities; w=0 is the market", () => {
    const pl = { prob: 60, czDec: 2, legs: [leg(60, 50)] };
    expect(shrinkTicket(pl, 1).prob).toBeCloseTo(60, 6);
    expect(shrinkTicket(pl, 0).prob).toBeCloseTo(50, 6);
  });

  it("a leg with no finite imp > 0 is left alone (never fabricated toward a market that was not quoted)", () => {
    const pl = { prob: 30, czDec: 3, legs: [leg(60, null), leg(50, 0), leg(50, Number.NaN as unknown as number), leg(50, 40)] };
    const out = shrinkTicket(pl, 0.5);
    expect(out.legs[0].prob).toBe(60);
    expect(out.legs[1].prob).toBe(50);
    expect(out.legs[2].prob).toBe(50);
    expect(out.legs[3].prob).toBe(45);
    /* only the fourth leg moved: ratio = 45/50 */
    expect(out.prob).toBeCloseTo(30 * (45 / 50), 6);
  });

  it("preserves the engine's simJoint adjustment: the ticket prob scales by ∏legP'/∏legP, not to the naive product", () => {
    /* naive product 60%·50% = 30%, engine's joint says 36% (positive correlation) */
    const pl = { prob: 36, probNaive: 30, simJoint: true, czDec: 4, legs: [leg(60, 50), leg(50, 40)] };
    const out = shrinkTicket(pl, 0.5);
    const ratio = (55 / 100) * (45 / 100) / ((60 / 100) * (50 / 100));
    expect(out.prob).toBeCloseTo(36 * ratio, 6);
    expect(out.prob).toBeGreaterThan(55 * 0.45); // the joint uplift is still in the number
    expect(out.simJoint).toBe(true);
  });

  it("recomputes czEv / bsEv / ev from the shrunk prob at the ticket's own prices and keeps the raw EVs", () => {
    const pl = { prob: 60, czDec: 2, bsDec: 2.2, dec: 2.1, czEv: 20, bsEv: 32, ev: 26, legs: [leg(60, 50)] };
    const out = shrinkTicket(pl, 0.5);
    expect(out.czEv).toBeCloseTo((0.55 * 2 - 1) * 100, 6);
    expect(out.bsEv).toBeCloseTo((0.55 * 2.2 - 1) * 100, 6);
    expect(out.ev).toBeCloseTo((0.55 * 2.1 - 1) * 100, 6);
    expect(out.czEvRaw).toBe(20);
    expect(out.bsEvRaw).toBe(32);
    expect(out.evRaw).toBe(26);
    expect(evAt(50, 2)).toBe(0);
    expect(evAt(null, 2)).toBeNull();
    expect(evAt(50, null)).toBeNull();
  });

  it("a null price stays null-EV (no price is never invented)", () => {
    const pl = { prob: 60, czDec: 2, bsDec: null, czEv: 20, bsEv: null, legs: [leg(60, 50)] };
    const out = shrinkTicket(pl, 0.5);
    expect(out.bsEv).toBeNull();
    expect(out.czEv).toBeCloseTo(10, 6);
  });

  it("clamps to 0..100 and NEVER mutates the input", () => {
    const legs = [leg(60, 50)];
    const pl = { prob: 60, czDec: 2, czEv: 20, legs };
    const snap = JSON.stringify(pl);
    const out = shrinkTicket(pl, 0.5);
    expect(JSON.stringify(pl)).toBe(snap);
    expect(out.legs).not.toBe(legs);
    expect(out.legs[0]).not.toBe(legs[0]);
    expect(shrinkTicket({ prob: 100, czDec: 1.5, legs: [leg(50, 90)] }, 0.5).prob).toBeLessThanOrEqual(100);
    expect(shrinkTicket({ prob: 0, czDec: 1.5, legs: [leg(50, 90)] }, 0.5).prob).toBe(0);
  });
});
