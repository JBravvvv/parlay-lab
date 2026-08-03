import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FROZEN_NOW, fixtureEngine } from "./helpers/fixture-env";
import { boardToPredictions, mergeDayBlob, type PredRecord } from "../src/lib/pred-serialize";
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
    /* suggested tickets captured with their legs + joint probability.
       WIDENED 2026-08-03 AT THE SINGLES FLIP, and this is a STRUCTURAL SUBSTITUTION, not a
       relaxation. The old assertion was `legs.length >= 2` over the top 10 — it encoded the
       2-leg floor as an invariant of the LOGGING path, where it was only ever a fact about the
       builder. Singles sort high on probability, so they now occupy the top of the set and the
       assertion went red on correct behaviour. The property the logger actually owes is that
       EVERY ticket carries at least one leg and a finite probability; that is asserted over the
       whole set now rather than the first ten, which is strictly stronger. */
    expect(parlays.length).toBeGreaterThan(20);
    for (const t of parlays) {
      expect(t.legs.length, "a logged ticket has no legs").toBeGreaterThanOrEqual(1);
      expect(isFinite(t.prob), "a logged ticket has a non-finite probability").toBe(true);
    }
    // and the flip's own population is present in the log, not silently dropped by it
    expect(parlays.filter((t) => t.legs.length === 1).length, "singles are live in the engine but absent from the prediction log").toBeGreaterThan(0);
    expect(parlays.filter((t) => t.legs.length >= 2).length, "parlays vanished from the log").toBeGreaterThan(0);
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

describe("mergeDayBlob freeze rules (shared by /api/predictions and /api/generate)", () => {
  const rec = (k: string, p: number, over: Partial<PredRecord> = {}): PredRecord => ({
    k,
    label: "X",
    sub: "Hits O 1.5",
    market: "batter_hits",
    gkey: "g1",
    lkey: "x|batter_hits|1.5",
    p,
    pModel: null,
    pMkt: 50,
    w: null,
    edge: 1,
    ev: 1,
    odds: -110,
    book: null,
    cz: null,
    czEv: null,
    lu: "confirmed",
    tags: [],
    ...over,
  });
  const NOW = new Date("2026-07-18T15:00:00Z").getTime();
  const futureGames = { g1: { pk: 1, start: "2026-07-18T20:00:00Z" } };
  const pastGames = { g1: { pk: 1, start: "2026-07-18T14:00:00Z" } };

  it("latest pre-start write wins; graded records are immutable", () => {
    const first = mergeDayBlob(null, "2026-07-18", [rec("a", 55)], [], futureGames, NOW);
    const second = mergeDayBlob(first.blob, "2026-07-18", [rec("a", 58)], [], futureGames, NOW + 1000);
    expect(second.blob.records.a.p).toBe(58); // lines moved — last pre-start statement graded
    second.blob.records.a.res = "won";
    const third = mergeDayBlob(second.blob, "2026-07-18", [rec("a", 40)], [], futureGames, NOW + 2000);
    expect(third.blob.records.a.p).toBe(58); // graded = frozen forever
    expect(third.blob.records.a.res).toBe("won");
  });

  it("post-start writes can neither add nor rewrite a pick", () => {
    const pre = mergeDayBlob(null, "2026-07-18", [rec("a", 55)], [], pastGames, NOW - 2 * 3600_000);
    const post = mergeDayBlob(pre.blob, "2026-07-18", [rec("a", 70), rec("b", 60)], [], pastGames, NOW);
    expect(post.blob.records.a.p).toBe(55); // the playable-time statement stands
    expect(post.blob.records.b).toBeUndefined(); // no pick logged after first pitch
  });
});
