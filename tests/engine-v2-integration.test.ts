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
      // regions stays "us" (fixtures recorded us URLs); simN kept at a test-fast 2000
      fx.set("SH_V2", { priors: true, ctx: false, shin: true, sharpW: true, sim: true, simN: 2000 });
      const slate = await fx.collectSlate();
      const d = fx.analyze(slate) as unknown as Record<string, unknown>;
      expect(String(d.overview)).toContain("ENGINE V2 INTEGRATED");
      expect(String(d.overview)).toContain("log5 batter×pitcher");
      // the integrated pipeline must actually move the numbers vs the classic baseline
      expect(JSON.stringify(digest(d))).not.toBe(readBaseline("baseline43.json"));
      // sim pricing desk: every simmed game carries F5 + team-total model prices
      const sm = d.simMarkets as Array<Record<string, never>> | null;
      expect(Array.isArray(sm)).toBe(true);
      for (const row of sm!) {
        const f5 = row.f5 as { pHome: number; pAway: number; pTie: number };
        expect(f5.pHome + f5.pAway + f5.pTie).toBeCloseTo(1, 8);
        const tot = row.total as { model: number; final: number } | undefined;
        if (tot) {
          expect(tot.model).toBeGreaterThan(0);
          expect(tot.model).toBeLessThan(1);
          expect(tot.final).toBeGreaterThan(0);
          expect(tot.final).toBeLessThan(1);
        }
      }
    } finally {
      vi.useRealTimers();
    }
  }, 120_000);

  it("platoon / park / log5 / pen-fatigue kernels: direction, caps, dormant neutrality", () => {
    const platoon = eng.get<(b: string | null, p: string | null) => { h: number; hr: number }>("shPlatoon")!;
    const parkF = eng.get<(v: string | null, s: string | null) => { h: number; hr: number } | null>("shParkF")!;
    const log5 = eng.get<(a: number, b: number, c: number) => number>("shLog5")!;
    const penF = eng.get<(t: string) => number>("shPenF")!;

    // dormant → everything neutral
    expect(platoon("L", "L")).toEqual({ h: 1, hr: 1 });
    expect(parkF("Coors Field", "R")).toBeNull();
    expect(penF("New York Yankees")).toBe(1);

    eng.set("SH_V2", { sim: true, priors: true });
    eng.set("SH_PRIORS", {
      league: { xba: 0.244, xslg: 0.4, barrel_pct: 8 },
      batters: {},
      pitchers: {},
      parks: { R: { "Coors Field": { hits: 112, hr: 110 } }, L: { "Coors Field": { hits: 116, hr: 104 } } },
    });
    eng.set("SH_CTX", {
      bullpen_last3: {
        "New York Yankees": [{ name: "A", pitches: 200, daysAgo: 1 }],
        "Boston Red Sox": [{ name: "B", pitches: 10, daysAgo: 3 }],
      },
    });

    // platoon: same-hand hurts, opposite helps, switch always mildly helps
    expect(platoon("R", "R").h).toBeLessThan(1);
    expect(platoon("R", "R").hr).toBeLessThan(platoon("R", "R").h); // power split is bigger
    expect(platoon("L", "R").h).toBeGreaterThan(1);
    expect(platoon("S", "R").h).toBeGreaterThan(1);
    // park×handedness: index 112 dampened 50% → 1.06; side-specific
    expect(parkF("Coors Field", "R")!.h).toBeCloseTo(1.06, 10);
    expect(parkF("Coors Field", "L")!.h).toBeCloseTo(1.08, 10);
    expect(parkF("Unknown Park", "R")).toBeNull();
    // log5: pitcher at league average → batter rate unchanged; tough pitcher suppresses
    expect(log5(0.3, 0.244, 0.244)).toBeCloseTo(0.3, 10);
    expect(log5(0.3, 0.2, 0.244)).toBeLessThan(0.3);
    expect(log5(0.3, 0.3, 0.244)).toBeGreaterThan(0.3);
    // pen fatigue: gassed pen boosts opposing offense, fresh pen suppresses, caps hold
    const tired = penF("New York Yankees");
    const fresh = penF("Boston Red Sox");
    expect(tired).toBeGreaterThan(1);
    expect(tired).toBeLessThanOrEqual(1.05);
    expect(fresh).toBeLessThan(1);
    expect(fresh).toBeGreaterThanOrEqual(0.96);
    expect(penF("Not A Team")).toBe(1);

    eng.set("SH_V2", null);
    eng.set("SH_PRIORS", null);
    eng.set("SH_CTX", null);
  });

  it("sim v2 block: TTO/hook + totals/F5 counters only exist when armed", () => {
    const simGames = eng.get<(ctx: unknown, n: number, seed: number) => Record<string, never>>("shSimGames")!;
    // a league-average-ish lineup vector: [BB,1B,2B,3B,HR]
    const v = [0.08, 0.14, 0.04, 0.004, 0.03];
    const bat = Array.from({ length: 9 }, () => ({ vSP: v, vBP: v }));
    const base = { away: { bat }, home: { bat }, awayLeash: 18, homeLeash: 18, legs: [] };

    const dormant = simGames({ ...base, v2: null }, 500, 42);
    expect(dormant.v2m).toBeUndefined();

    const armed = simGames({ ...base, v2: { total: 8.5 } }, 500, 42) as unknown as {
      v2m: { pTotO: number; pF5Home: number; pF5Away: number; pF5Tie: number; avgF5: number; tt: { home: { o35: number; o45: number } } };
      avgHome: number;
    };
    const m = armed.v2m;
    expect(m.pF5Home + m.pF5Away + m.pF5Tie).toBeCloseTo(1, 8);
    expect(m.pTotO).toBeGreaterThan(0);
    expect(m.pTotO).toBeLessThan(1);
    expect(m.avgF5).toBeGreaterThan(0);
    expect(m.tt.home.o35).toBeGreaterThanOrEqual(m.tt.home.o45); // over 3.5 ⊇ over 4.5
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
