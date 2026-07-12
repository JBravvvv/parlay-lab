import { describe, it, expect } from "vitest";
import {
  impliedFromAmerican,
  devigProportional,
  devigPower,
  devigShin,
  consensusProb,
  weightedMedian,
  americanFromProb,
} from "@/engine2/devig";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("engine2 devig", () => {
  it("implied prob basics", () => {
    expect(impliedFromAmerican(-110)).toBeCloseTo(110 / 210, 10);
    expect(impliedFromAmerican(+200)).toBeCloseTo(1 / 3, 10);
  });

  it("symmetric -110/-110 → exactly 50/50 under every method", () => {
    const imps = [impliedFromAmerican(-110), impliedFromAmerican(-110)];
    for (const q of [devigProportional(imps), devigPower(imps), devigShin(imps)]) {
      expect(q[0]).toBeCloseTo(0.5, 6);
      expect(sum(q)).toBeCloseTo(1, 6);
    }
  });

  it("all methods sum to 1 on a juiced favorite-longshot pair", () => {
    const imps = [impliedFromAmerican(-950), impliedFromAmerican(+500)]; // heavy vig
    for (const q of [devigProportional(imps), devigPower(imps), devigShin(imps)]) {
      expect(sum(q)).toBeCloseTo(1, 6);
    }
  });

  it("power and Shin correct favorite-longshot bias vs proportional", () => {
    const imps = [impliedFromAmerican(-950), impliedFromAmerican(+500)];
    const prop = devigProportional(imps);
    const pow = devigPower(imps);
    const shin = devigShin(imps);
    // bias correction ⇒ longshot gets LESS true probability than proportional says
    expect(pow[1]).toBeLessThan(prop[1]);
    expect(shin[1]).toBeLessThan(prop[1]);
    // and the favorite correspondingly more
    expect(pow[0]).toBeGreaterThan(prop[0]);
    expect(shin[0]).toBeGreaterThan(prop[0]);
  });

  it("no-vig book passes through untouched", () => {
    const imps = [0.6, 0.4];
    expect(devigShin(imps)[0]).toBeCloseTo(0.6, 4);
    expect(devigPower(imps)[0]).toBeCloseTo(0.6, 4);
  });

  it("weighted median resists a single outlier", () => {
    // four books at ~57%, one stale outlier at 80% — median stays home
    expect(weightedMedian([0.57, 0.565, 0.575, 0.57, 0.8], [1, 1, 1, 1, 1])).toBeCloseTo(0.57, 3);
  });

  it("consensus weights the sharp book", () => {
    // retail says 55%, pinnacle says 60% (both no-vig for test isolation)
    const books = [
      { key: "fanduel", a: americanFromProb(0.55), b: americanFromProb(0.45) },
      { key: "draftkings", a: americanFromProb(0.55), b: americanFromProb(0.45) },
      { key: "pinnacle", a: americanFromProb(0.6), b: americanFromProb(0.4) },
    ];
    const c = consensusProb(books, "shin")!;
    // pinnacle weight 3 vs 1+1 ⇒ weighted median lands on the sharp number
    expect(c.p).toBeGreaterThan(0.57);
    expect(c.n).toBe(3);
  });
});
