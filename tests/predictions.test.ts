import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FROZEN_NOW, fixtureEngine } from "./helpers/fixture-env";
import { boardToPredictions } from "../src/lib/predictions";
import type { BoardData } from "@/engine";

/* 3A write-side: the serializer must capture the FULL board — every priced
   pick with its true/model/consensus probabilities and blend weight — from a
   real generated board (the captured fixture slate). */

let d: BoardData;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FROZEN_NOW);
  const eng = fixtureEngine();
  d = eng.analyze(await eng.collectSlate()) as BoardData;
});
afterAll(() => vi.useRealTimers());

describe("boardToPredictions", () => {
  it("logs the full board with the spec's fields", () => {
    const { records, parlays, games } = boardToPredictions(d);
    expect(records.length).toBeGreaterThan(100); // the whole board, not just plays
    const markets = new Set(records.map((r) => r.market));
    for (const m of ["ml", "rl", "batter_hits", "batter_total_bases", "batter_home_runs"]) {
      expect(markets.has(m), `missing market ${m}`).toBe(true);
    }
    for (const r of records) {
      expect(r.k).toContain("|");
      expect(isFinite(r.p)).toBe(true);
      expect(isFinite(r.pMkt)).toBe(true);
      expect(["confirmed", "projected"]).toContain(r.lu);
      expect(r.market).not.toBe("all"); // TOP 50 duplicates are excluded
    }
    // blend metadata present on rows the engine priced with a consensus
    const withBlend = records.filter((r) => r.w != null && r.pModel != null);
    expect(withBlend.length).toBeGreaterThan(50);
    // suggested parlays captured with their legs + joint probability
    expect(parlays.length).toBeGreaterThan(20);
    for (const t of parlays.slice(0, 10)) {
      expect(t.legs.length).toBeGreaterThanOrEqual(2);
      expect(isFinite(t.prob)).toBe(true);
    }
    // the games map carries pk + start for the grader
    const withPk = Object.values(games).filter((g) => g.pk != null);
    expect(withPk.length).toBeGreaterThan(0);
  });

  it("no record duplicates and no live rows", () => {
    const { records } = boardToPredictions(d);
    const keys = new Set(records.map((r) => r.k));
    expect(keys.size).toBe(records.length);
  });
});
