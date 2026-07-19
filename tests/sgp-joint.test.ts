import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FROZEN_NOW, TODAY, fixtureFetchJson } from "./helpers/fixture-env";
import { createEngine, type BoardData, type Engine, type Ticket } from "@/engine";

/* Upgrade 02 — same-game parlays priced from joint sim paths (armed only).
   shSimGames records per-leg hit bitsets across sims and exposes jointAll(keys);
   build() scales each same-game group's blended product by the sim's dependence
   ratio (joint / product of sim marginals, clamped 0.25-4x). Cross-game
   independence stands; the dormant path is byte-identical (parity suite). */

type Sim = {
  n: number;
  legP: Record<string, number>;
  legIdx: Record<string, number>;
  corr: (a: string, b: string) => number | null;
  jointAll?: (keys: string[]) => number | null;
};

let eng: Engine;
let d: BoardData;
let slate: unknown;
const sims: Sim[] = [];

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FROZEN_NOW);
  eng = createEngine({ fetchJson: fixtureFetchJson, today: TODAY });
  const orig = eng.get<(c: unknown, n: number, s: number) => Sim>("shSimGames");
  eng.set("shSimGames", (c: unknown, n: number, s: number) => {
    const r = orig(c, n, s);
    sims.push(r);
    return r;
  });
  eng.set("SH_V2", { sim: true, simN: 4000 });
  slate = await eng.collectSlate();
  d = eng.analyze(slate) as BoardData;
}, 120_000);
afterAll(() => vi.useRealTimers());

const tickets = () => [...d.parlays, ...d.parlaysMixed] as (Ticket & { legs: { gkey?: string | null; prob?: unknown }[] })[];

describe("jointAll — the per-sim leg-hit matrix (spec test 1)", () => {
  it("positively-correlated same-game pairs co-hit MORE than independence predicts; negative pairs less", () => {
    let pos = 0;
    let neg = 0;
    for (const sm of sims) {
      if (!sm.jointAll) continue;
      const keys = Object.keys(sm.legP);
      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
          const c = sm.corr(keys[i], keys[j]);
          if (c == null) continue;
          const joint = sm.jointAll([keys[i], keys[j]])!;
          const prod = sm.legP[keys[i]] * sm.legP[keys[j]];
          if (c >= 0.08) {
            expect(joint).toBeGreaterThan(prod);
            pos++;
          } else if (c <= -0.08) {
            expect(joint).toBeLessThan(prod);
            neg++;
          }
        }
      }
    }
    // ml_home vs ml_away in the same sim guarantees negative pairs exist; sims
    // routinely confirm positive stacks (batter hits + team ML, TB + HR, ...)
    expect(pos).toBeGreaterThan(0);
    expect(neg).toBeGreaterThan(0);
  });

  it("degenerate inputs: single key returns the marginal, unknown keys return null", () => {
    const sm = sims.find((s) => s.jointAll && Object.keys(s.legP).length > 2)!;
    const k = Object.keys(sm.legP)[0];
    expect(sm.jointAll!([k])).toBeCloseTo(sm.legP[k], 12);
    expect(sm.jointAll!([k, "nobody|batter_hits|9.5"])).toBeNull();
    // ml_home & ml_away can never both hit: joint is exactly zero
    expect(sm.jointAll!(["ml_home", "ml_away"])).toBe(0);
  });
});

describe("ticket repricing (spec test 2)", () => {
  it("same-game tickets carry the sim-joint tag with both numbers; EV flows from the joint prob", () => {
    const joint = tickets().filter((t) => t.simJoint);
    expect(joint.length).toBeGreaterThan(0);
    for (const t of joint) {
      expect(t.probNaive).not.toBeNull();
      if (t.czDec != null && Number(t.prob) > 0) {
        // czEv was computed from the UNROUNDED corrected probability; the stored prob is
        // rounded to 0.1pp, so the reconstruction can drift by up to 0.05pp x czDec
        const expected = ((Number(t.prob) / 100) * t.czDec - 1) * 100;
        expect(Math.abs(Number(t.czEv) - expected)).toBeLessThanOrEqual(0.05 * t.czDec + 0.15);
      }
    }
    // repricing moves real numbers, both directions across the board
    expect(joint.some((t) => Number(t.prob) !== Number(t.probNaive))).toBe(true);
  });

  it("cross-game tickets are untouched: probability is still the product of marginals, no tag", () => {
    const crossOnly = tickets().filter((t) => {
      const gs = t.legs.map((l) => l.gkey).filter(Boolean);
      return gs.length === t.legs.length && new Set(gs).size === t.legs.length;
    });
    expect(crossOnly.length).toBeGreaterThan(0);
    for (const t of crossOnly) {
      expect(t.simJoint).toBe(false);
      expect(t.probNaive).toBeNull();
      const prod = t.legs.reduce((a, l) => a * (Number(l.prob) / 100), 1);
      expect(Number(t.prob)).toBe(Math.round(prod * 1000) / 10);
    }
  });
});

describe("determinism + path count (spec tests 3-4; parity has its own suite)", () => {
  it("same seed, same joint numbers: re-analyzing reproduces every ticket probability", () => {
    const again = eng.analyze(slate) as BoardData;
    const a = tickets().map((t) => [t.name, t.prob, t.probNaive]);
    const b = [...again.parlays, ...again.parlaysMixed].map((t) => [t.name, t.prob, (t as Ticket).probNaive]);
    expect(b).toEqual(a);
  });

  it("SH_V2.simNHR doubles the paths only for games carrying sub-5% (HR) legs", async () => {
    const eng2 = createEngine({ fetchJson: fixtureFetchJson, today: TODAY });
    const captured: Sim[] = [];
    const orig = eng2.get<(c: unknown, n: number, s: number) => Sim>("shSimGames");
    eng2.set("shSimGames", (c: unknown, n: number, s: number) => {
      const r = orig(c, n, s);
      captured.push(r);
      return r;
    });
    eng2.set("SH_V2", { sim: true, simN: 3000, simNHR: 6000 });
    eng2.analyze(slate);
    expect(captured.length).toBeGreaterThan(0);
    for (const sm of captured) {
      const hasHR = Object.keys(sm.legIdx).some((k) => k.includes("|batter_home_runs|"));
      expect(sm.n).toBe(hasHR ? 6000 : 3000);
    }
  }, 120_000);
});
