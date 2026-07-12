import { describe, it, expect, beforeAll } from "vitest";
import { createEngine, type Engine } from "@/engine";
import { devigShin, impliedFromAmerican } from "@/engine2/devig";

/* The v2 kernel lives INSIDE the verbatim engine (gated by SH_V2). These tests
   boot the real sandboxed engine and exercise the kernel directly:
   - dormant by default (parity with baseline43 is covered by parity.test.ts)
   - Shin inside the engine matches the TS reference implementation
   - skill priors replace league means only when armed and data exists */

let eng: Engine;
beforeAll(() => {
  eng = createEngine({
    fetchJson: async () => ({ ok: false, status: 0, body: null }),
    storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  });
});

describe("engine v2 integration kernel", () => {
  it("is dormant by default (SH_V2 null)", () => {
    expect(eng.get("SH_V2")).toBeNull();
    // devigPair falls back to proportional when off
    const pair = eng.get<(a: number, b: number) => number>("shDevigPair")!;
    expect(pair(0.6, 0.6)).toBeCloseTo(0.5, 10);
  });

  it("engine shShin2 matches the TS reference (Shin)", () => {
    const shin = eng.get<(a: number, b: number) => number>("shShin2")!;
    const i1 = impliedFromAmerican(-950);
    const i2 = impliedFromAmerican(+500);
    const ref = devigShin([i1, i2])[0];
    expect(shin(i1, i2)).toBeCloseTo(ref, 6);
  });

  it("armed: devigPair uses Shin, weighted median leans sharp", () => {
    eng.set("SH_V2", { shin: true, sharpW: true });
    const pair = eng.get<(a: number, b: number) => number>("shDevigPair")!;
    const i1 = impliedFromAmerican(-950);
    const i2 = impliedFromAmerican(+500);
    expect(pair(i1, i2)).toBeCloseTo(devigShin([i1, i2])[0], 6);

    const wmed = eng.get<(l: { v: number; w: number }[]) => number>("shMedianW")!;
    // two retail books at 55%, pinnacle-weighted 60% wins the median
    expect(wmed([{ v: 0.55, w: 1 }, { v: 0.55, w: 1 }, { v: 0.6, w: 3 }])).toBeCloseTo(0.6, 10);
    eng.set("SH_V2", null);
  });

  it("skill priors replace league means only when armed AND known", () => {
    const priorH = eng.get<(st: unknown, L: number) => number>("shPriorH")!;
    const priorHR = eng.get<(st: unknown, L: number) => number>("shPriorHR")!;
    const st = { id: 42 };

    // dormant → league mean
    expect(priorH(st, 0.244)).toBeCloseTo(0.244, 10);

    eng.set("SH_V2", { priors: true });
    eng.set("SH_PRIORS", {
      league: { xba: 0.2447, xslg: 0.4003, barrel_pct: 8.3 },
      batters: { 42: { xba: 0.281, xslg: 0.62, barrel_pct: 22.8 } },
      pitchers: {},
    });
    // hits prior = player's xBA
    expect(priorH(st, 0.244)).toBeCloseTo(0.281, 10);
    // HR prior scales league mean up for an elite barrel/ISO profile, capped
    const hr = priorHR(st, 0.037);
    expect(hr).toBeGreaterThan(0.037);
    expect(hr).toBeLessThanOrEqual(0.037 * 2.8 + 1e-9);
    // unknown player → league mean unchanged
    expect(priorH({ id: 999 }, 0.244)).toBeCloseTo(0.244, 10);
    eng.set("SH_V2", null);
    eng.set("SH_PRIORS", null);
  });

  it("context factors are capped and default to 1", () => {
    const tempF = eng.get<(g: unknown) => number>("shTempF")!;
    eng.set("SH_V2", { ctx: true });
    expect(tempF({ weather: { temp: "95" } })).toBeCloseTo(1.12, 4); // hits the cap
    expect(tempF({ weather: { temp: "70" } })).toBeCloseTo(1, 6);
    expect(tempF({})).toBe(1);
    eng.set("SH_V2", null);
    expect(tempF({ weather: { temp: "95" } })).toBe(1); // dormant
  });
});
