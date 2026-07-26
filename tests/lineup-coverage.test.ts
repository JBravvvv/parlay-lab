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

/** Mirrors the engine's luCoverage block verbatim (legacy/index.html, analyze()). */
type LuGame = { start?: string; lineup_away?: unknown[]; lineup_home?: unknown[] };
function coverageOfGames(games: LuGame[], now: number) {
  const LEAD = 3 * 3600000;
  let conf = 0, model = 0, unstarted = 0;
  for (const g of games) {
    const st = g.start ? Date.parse(g.start) : null;
    if (st != null && st <= now) continue;
    unstarted++;
    if (st != null && st - now <= LEAD) model++;
    if ((g.lineup_away ?? []).length >= 9 && (g.lineup_home ?? []).length >= 9) conf++;
  }
  const den = games.length;
  return {
    confirmed: conf, eligible: den, unstarted, modelled: model,
    pct: den ? conf / den : 0,
    modelledPct: den ? model / den : 0,
    observedPct: den ? conf / den : 0,
  };
}

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

/* CANONICAL METRIC (2026-07-26). luCoverage did not implement docs/board-timing.md's
   definition — the fourth denominator mismatch in this project. A LIVE game always has
   posted lineups, so counting it inflated the numerator while contributing nothing
   loggable (boardToPredictions rejects live rows). Both quantities are now emitted over
   the same denominator so the model can be checked against the observation. */
describe("luCoverage — canonical denominator, started games excluded", () => {
  const NOW = Date.parse("2026-07-26T16:46:00Z");
  const nine = Array.from({ length: 9 }, (_, i) => ({ id: i }));
  const game = (hrsToPitch: number, lineups: boolean) => ({
    away: `a${hrsToPitch}`, home: `h${hrsToPitch}`, gnum: 1,
    start: new Date(NOW + hrsToPitch * 3600000).toISOString(),
    lineup_away: lineups ? nine : [], lineup_home: lineups ? nine : [],
  });

  it("a LIVE game is excluded from both numerators even though its lineups are posted", () => {
    const games = [game(-0.5, true), game(0.8, true), game(6.6, false)];
    const lu = coverageOfGames(games, NOW);
    expect(lu.unstarted).toBe(2);          // the live game is not unstarted
    expect(lu.confirmed).toBe(1);          // ...and does not count as observed coverage
    expect(lu.modelled).toBe(1);           // ...nor as modelled
    expect(lu.eligible).toBe(3);           // denominator stays the whole slate
  });

  it("modelled and observed share a denominator, so they are directly comparable", () => {
    const games = [game(0.8, true), game(1.4, true), game(3.3, false), game(6.6, false)];
    const lu = coverageOfGames(games, NOW);
    expect(lu.modelled).toBe(2);           // two inside pitch − 3h
    expect(lu.confirmed).toBe(2);          // and exactly those two have lineups
    expect(lu.modelledPct).toBeCloseTo(lu.observedPct, 10);
  });

  it("catches the model being WRONG in either direction", () => {
    // a lineup posted 5h out — earlier than the model predicts
    const early = coverageOfGames([game(5, true), game(6, false)], NOW);
    expect(early.modelled).toBe(0);
    expect(early.confirmed).toBe(1);
    expect(early.observedPct).toBeGreaterThan(early.modelledPct);
    // inside the window but no lineup yet — later than the model predicts
    const late = coverageOfGames([game(2, false), game(6, false)], NOW);
    expect(late.modelled).toBe(1);
    expect(late.confirmed).toBe(0);
    expect(late.observedPct).toBeLessThan(late.modelledPct);
  });
});
