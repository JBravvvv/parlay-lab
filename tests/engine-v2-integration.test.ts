import { describe, it, expect, beforeAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createEngine, type Engine } from "@/engine";
import { devigShin, impliedFromAmerican } from "@/engine2/devig";
import { FROZEN_NOW, digest, fixtureEngine, readBaseline } from "./helpers/fixture-env";

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

  it("Savant percentile factors: right direction, hard caps, dormant = 1", () => {
    const pitF = eng.get<(pst: unknown) => number>("shPitPctF")!;
    const oppF = eng.get<(l: unknown[]) => number>("shOppWhiffF")!;

    // dormant → neutral
    expect(pitF({ id: 7 })).toBe(1);

    eng.set("SH_V2", { priors: true });
    eng.set("SH_PRIORS", {
      league: {},
      batters: {
        1: { pct: { whiff_percent: 90 } }, 2: { pct: { whiff_percent: 90 } }, 3: { pct: { whiff_percent: 90 } },
        4: { pct: { whiff_percent: 90 } }, 5: { pct: { whiff_percent: 90 } },
        11: { pct: { whiff_percent: 10 } }, 12: { pct: { whiff_percent: 10 } }, 13: { pct: { whiff_percent: 10 } },
        14: { pct: { whiff_percent: 10 } }, 15: { pct: { whiff_percent: 10 } },
      },
      pitchers: { 7: { pct: { xwoba: 100 } }, 8: { pct: { xwoba: 1 } } },
    });

    // elite pitcher (100th pct run prevention) suppresses opposing offense, capped at 0.94
    expect(pitF({ id: 7 })).toBeCloseTo(0.94, 6);
    // batting-practice arm boosts it, capped at 1.06
    expect(pitF({ id: 8 })).toBeGreaterThan(1);
    expect(pitF({ id: 8 })).toBeLessThanOrEqual(1.06);
    expect(pitF({ id: 999 })).toBe(1); // unknown → neutral

    // contact lineup (whiff pct 90 = elite contact) → FEWER pitcher Ks
    const contact = oppF([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]);
    expect(contact).toBeLessThan(1);
    expect(contact).toBeGreaterThanOrEqual(0.93);
    // whiffy lineup (pct 10) → MORE pitcher Ks
    const whiffy = oppF([{ id: 11 }, { id: 12 }, { id: 13 }, { id: 14 }, { id: 15 }]);
    expect(whiffy).toBeGreaterThan(1);
    expect(whiffy).toBeLessThanOrEqual(1.07);
    // under 5 known batters → neutral (sample discipline)
    expect(oppF([{ id: 1 }, { id: 2 }])).toBe(1);

    eng.set("SH_V2", null);
    eng.set("SH_PRIORS", null);
  });

  it("ARMED end-to-end on the fixture slate: output changes and the overview says so", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FROZEN_NOW);
    try {
      const fx = fixtureEngine();
      const priors = JSON.parse(readFileSync("public/model/priors.json", "utf8"));
      fx.set("SH_PRIORS", priors);
      fx.set("SH_V2", { priors: true, ctx: false, shin: true, sharpW: true }); // regions stays "us": fixtures recorded us URLs
      const slate = await fx.collectSlate();
      const d = fx.analyze(slate) as unknown as Record<string, unknown>;
      expect(String(d.overview)).toContain("ENGINE V2 INTEGRATED");
      // the integrated pipeline must actually move the numbers vs the classic baseline
      expect(JSON.stringify(digest(d))).not.toBe(readBaseline("baseline43.json"));
    } finally {
      vi.useRealTimers();
    }
  }, 120_000);

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
