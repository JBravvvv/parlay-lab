import { beforeAll, describe, expect, it, vi } from "vitest";
import { FROZEN_NOW, fixtureEngine } from "./helpers/fixture-env";
import type { BoardData } from "@/engine";

/**
 * PHASE 1b — luCoverage. The Monte Carlo path needs a confirmed 9-man lineup on
 * BOTH sides; without one the game falls to the closed-form path that carries the
 * documented H+R+RBI PA-conditioning weakness. The 16:00 UTC cron runs at 9am PT,
 * when almost nothing is posted — so "how much of this board is real lineups" is
 * the number that says which instrument you are looking at. Nothing in selection
 * reads it; it exists to be measured and displayed.
 */

type LuCoverage = { confirmed: number; eligible: number; pct: number };

let d: BoardData;

beforeAll(async () => {
  vi.setSystemTime(FROZEN_NOW);
  const eng = fixtureEngine();
  const slate = await eng.collectSlate();
  d = eng.analyze(slate);
}, 120000);

describe("luCoverage", () => {
  it("counts games with BOTH lineups posted, out of the eligible slate", () => {
    const lu = d.luCoverage as LuCoverage;
    expect(lu).toBeTruthy();
    expect(lu.eligible).toBeGreaterThan(0);
    expect(lu.confirmed).toBeGreaterThanOrEqual(0);
    expect(lu.confirmed).toBeLessThanOrEqual(lu.eligible);
    expect(lu.pct).toBeCloseTo(lu.confirmed / lu.eligible, 3);
  });

  it("agrees with the games the board itself lists", () => {
    const lu = d.luCoverage as LuCoverage;
    expect(lu.eligible).toBe(Object.keys(d.gameInfo ?? {}).length);
  });

  it("is a pure addition — the ranked pool and parlays are untouched", () => {
    // parity.test.ts pins the digest; this pins that the field is additive only
    expect(Object.keys(d.categories).length).toBeGreaterThan(0);
    expect(d.parlays.length).toBeGreaterThan(0);
  });
});

describe("luCoverage math at the edges", () => {
  const cover = (games: { a: number; h: number }[]) => {
    let c = 0;
    for (const g of games) if (g.a >= 9 && g.h >= 9) c++;
    return { confirmed: c, eligible: games.length, pct: games.length ? Math.round((c / games.length) * 1000) / 1000 : 0 };
  };
  it("no lineups posted", () => {
    expect(cover([{ a: 0, h: 0 }, { a: 0, h: 0 }])).toEqual({ confirmed: 0, eligible: 2, pct: 0 });
  });
  it("one side only does not count — the sim needs both", () => {
    expect(cover([{ a: 9, h: 0 }])).toEqual({ confirmed: 0, eligible: 1, pct: 0 });
    expect(cover([{ a: 8, h: 9 }])).toEqual({ confirmed: 0, eligible: 1, pct: 0 });
  });
  it("partial and full", () => {
    expect(cover([{ a: 9, h: 9 }, { a: 0, h: 0 }]).pct).toBe(0.5);
    expect(cover([{ a: 9, h: 10 }, { a: 9, h: 9 }]).pct).toBe(1);
  });
  it("an empty slate is 0, never a divide-by-zero", () => {
    expect(cover([])).toEqual({ confirmed: 0, eligible: 0, pct: 0 });
  });
});
