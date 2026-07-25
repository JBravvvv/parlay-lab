import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  boardToPredictions,
  gradedFromBlob,
  groupKeyOf,
  lineKeyOf,
  mergeDayBlob,
  type DayBlob,
  type PredRecord,
} from "@/lib/pred-serialize";
import { FROZEN_NOW, fixtureEngine } from "./helpers/fixture-env";
import type { BoardData } from "@/engine";

/**
 * PREDICTION-ROW IDEMPOTENCY (Phase 1, 2026-07-25)
 *
 * A second generation pass restates the same date: the 9am board prices a projected
 * lineup, the 1pm board prices a confirmed one. The record key is `gkey|lkey|sub`,
 * which carries the SIDE and the line — so a pass that changes its mind writes a
 * DIFFERENT key and the stale forecast survives beside the new one. Grading both is
 * not miscounting, it is incoherent: one outcome scoring two contradictory claims,
 * double-weighting the reliability fit and inflating mktN, which prematurely relaxes
 * the consensus gate the Phase 1 banner exists to explain.
 *
 * Resolution: overwrite for training, keep for audit, replacement scoped to the
 * generation. Lines a pass did NOT restate are never deleted.
 */

const NOW = Date.parse("2026-07-25T16:30:00Z");
const FUTURE = { g1: { pk: 1, start: "2026-07-25T23:05:00Z" } };
const games = FUTURE as Record<string, { pk: number | null; start: string | null }>;

function rec(over: Partial<PredRecord> & { k: string }): PredRecord {
  return {
    label: "x",
    sub: "Hits O 1.5",
    market: "batter_hits",
    gkey: "g1",
    lkey: "judge|batter_hits|1.5",
    p: 55,
    pModel: 55,
    pMkt: 54,
    w: 0.35,
    edge: 1,
    ev: 1,
    odds: -110,
    book: "CZ",
    cz: -110,
    czEv: 1,
    lu: "projected",
    tags: [],
    ln: 1.5,
    ...over,
  } as PredRecord;
}

const merge = (cur: DayBlob | null, records: PredRecord[], at = NOW) =>
  mergeDayBlob(cur, "2026-07-25", records, [], games, at);

describe("keys above the record key", () => {
  it("lineKeyOf is side-agnostic for game markets — where the side lives in the lkey", () => {
    expect(lineKeyOf("g1", "ml_home")).toBe(lineKeyOf("g1", "ml_away"));
    expect(lineKeyOf("g1", "rl_home")).toBe(lineKeyOf("g1", "rl_away"));
    expect(lineKeyOf("g1", "ml_home")).not.toBe(lineKeyOf("g1", "rl_home"));
    expect(lineKeyOf("g1", "ml_home")).not.toBe(lineKeyOf("g2", "ml_home"));
  });

  it("groupKeyOf collapses a player's lines but never two different players or markets", () => {
    expect(groupKeyOf("g1", "judge|batter_hits|1.5")).toBe(groupKeyOf("g1", "judge|batter_hits|2.5"));
    expect(groupKeyOf("g1", "judge|batter_hits|1.5")).not.toBe(groupKeyOf("g1", "judge|batter_total_bases|1.5"));
    expect(groupKeyOf("g1", "judge|batter_hits|1.5")).not.toBe(groupKeyOf("g1", "soto|batter_hits|1.5"));
  });

  it("game markets group without a player field at all", () => {
    // ML/RL rows carry no player — the group key has to come off the lkey
    expect(groupKeyOf("g1", "ml_home")).toBe(groupKeyOf("g1", "ml_away"));
    expect(groupKeyOf("g1", "ml_home")).not.toBe(groupKeyOf("g1", "rl_away"));
  });
});

describe("two generations, one date", () => {
  it("overwrites the same statement and keeps the old probability in hist", () => {
    const a = merge(null, [rec({ k: "g1|judge|batter_hits|1.5|Hits O 1.5", p: 55, lu: "projected" })]);
    const b = merge(a.blob, [rec({ k: "g1|judge|batter_hits|1.5|Hits O 1.5", p: 61, lu: "confirmed" })], NOW + 3600_000);
    const rows = Object.values(b.blob.records);
    expect(rows).toHaveLength(1); // ONE row, not two
    expect(rows[0].p).toBe(61); // the more informed statement stands
    expect(rows[0].lu).toBe("confirmed");
    expect(rows[0].hist).toEqual([{ p: 55, lu: "projected", src: undefined, at: NOW }]);
  });

  it("PROP side flip: the superseded side is kept, marked, and never trained", () => {
    const first = merge(null, [rec({ k: "g1|judge|batter_hits|1.5|Hits O 1.5", sub: "Hits O 1.5", p: 55 })]);
    const second = merge(
      first.blob,
      [rec({ k: "g1|judge|batter_hits|1.5|Hits U 1.5", sub: "Hits U 1.5", p: 52, lu: "confirmed" })],
      NOW + 3600_000,
    );
    const rows = Object.values(second.blob.records);
    expect(rows).toHaveLength(2); // both statements survive on disk
    const over = rows.find((r) => r.sub === "Hits O 1.5")!;
    const under = rows.find((r) => r.sub === "Hits U 1.5")!;
    expect(over.superseded).toBe(true);
    expect(under.superseded).toBeUndefined();
    // ...but only ONE reaches the grader
    for (const r of rows) r.res = "won";
    const graded = gradedFromBlob(second.blob);
    expect(graded).toHaveLength(1);
    expect(graded[0].p).toBe(52);
  });

  it("ML side flip: a confirmed lineup moving ml_home → ml_away is caught", () => {
    // the case that matters most — ML/RL rebuilds mktN slowest (~2 weeks), so
    // double-counting there relaxes that gate fastest
    const nine = merge(null, [
      rec({ k: "g1|ml_home|ML vs BOS", lkey: "ml_home", market: "ml", sub: "ML vs BOS", p: 54, ln: null }),
    ]);
    const one = merge(
      nine.blob,
      [rec({ k: "g1|ml_away|ML vs NYY", lkey: "ml_away", market: "ml", sub: "ML vs NYY", p: 51, lu: "confirmed", ln: null })],
      NOW + 3600_000,
    );
    const rows = Object.values(one.blob.records);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.lkey === "ml_home")!.superseded).toBe(true);
    expect(rows.find((r) => r.lkey === "ml_away")!.superseded).toBeUndefined();
    for (const r of rows) r.res = "won";
    expect(gradedFromBlob(one.blob).map((g) => g.p)).toEqual([51]);
  });

  it("orphaned lines SURVIVE and still train — the book moved, the prediction was real", () => {
    const nine = merge(null, [
      rec({ k: "g1|judge|batter_hits|1.5|Hits O 1.5", lkey: "judge|batter_hits|1.5", ln: 1.5, p: 55 }),
      rec({ k: "g1|judge|batter_hits|2.5|Hits O 2.5", lkey: "judge|batter_hits|2.5", ln: 2.5, p: 22 }),
    ]);
    // 1pm: the book has pulled O2.5 — only O1.5 comes back
    const one = merge(
      nine.blob,
      [rec({ k: "g1|judge|batter_hits|1.5|Hits O 1.5", lkey: "judge|batter_hits|1.5", ln: 1.5, p: 60, lu: "confirmed" })],
      NOW + 3600_000,
    );
    const rows = Object.values(one.blob.records);
    expect(rows).toHaveLength(2); // not deleted
    const orphan = rows.find((r) => r.ln === 2.5)!;
    expect(orphan.stale).toBe(true); // marked
    expect(orphan.superseded).toBeUndefined(); // nothing contradicted it
    expect(orphan.p).toBe(22); // untouched
    for (const r of rows) r.res = "won";
    expect(gradedFromBlob(one.blob).map((g) => g.ln).sort()).toEqual([1.5, 2.5]); // still trains
  });

  it("keeps two lines from ONE pass — multi-line boards are legitimate, not collisions", () => {
    const both = merge(null, [
      rec({ k: "g1|sproat|pitcher_strikeouts|4.5|K's O 4.5", lkey: "sproat|pitcher_strikeouts|4.5", ln: 4.5, market: "pitcher_strikeouts" }),
      rec({ k: "g1|sproat|pitcher_strikeouts|5.5|K's O 5.5", lkey: "sproat|pitcher_strikeouts|5.5", ln: 5.5, market: "pitcher_strikeouts" }),
    ]);
    expect(Object.values(both.blob.records)).toHaveLength(2);
    expect(Object.values(both.blob.records).some((r) => r.superseded || r.stale)).toBe(false);
  });

  it("leaves a player the second pass never mentions completely alone", () => {
    const nine = merge(null, [
      rec({ k: "g1|judge|batter_hits|1.5|Hits O 1.5", p: 55 }),
      rec({ k: "g1|soto|batter_hits|1.5|Hits O 1.5", lkey: "soto|batter_hits|1.5", p: 58 }),
    ]);
    const one = merge(nine.blob, [rec({ k: "g1|judge|batter_hits|1.5|Hits O 1.5", p: 61 })], NOW + 3600_000);
    const soto = Object.values(one.blob.records).find((r) => r.lkey === "soto|batter_hits|1.5")!;
    expect(soto.p).toBe(58);
    expect(soto.stale).toBeUndefined();
    expect(soto.superseded).toBeUndefined();
  });

  it("is idempotent: the same pass twice changes nothing", () => {
    const rows = [rec({ k: "g1|judge|batter_hits|1.5|Hits O 1.5", p: 55 })];
    const once = merge(null, rows);
    const twice = merge(JSON.parse(JSON.stringify(once.blob)) as DayBlob, rows, NOW + 60_000);
    expect(Object.keys(twice.blob.records)).toHaveLength(1);
    expect(Object.values(twice.blob.records)[0].p).toBe(55);
  });

  it("never rewrites or supersedes a graded row, or one whose game has started", () => {
    const started = { g1: { pk: 1, start: "2026-07-25T15:00:00Z" } };
    const blob: DayBlob = {
      date: "2026-07-25",
      at: 0,
      records: {
        "g1|judge|batter_hits|1.5|Hits O 1.5": rec({ k: "g1|judge|batter_hits|1.5|Hits O 1.5", p: 55, res: "won" }),
      },
      parlays: {},
      games: started,
    };
    const after = mergeDayBlob(blob, "2026-07-25", [rec({ k: "g1|judge|batter_hits|1.5|Hits U 1.5", sub: "Hits U 1.5", p: 40 })], [], started, NOW);
    const rows = Object.values(after.blob.records);
    expect(rows).toHaveLength(1); // post-start statement refused outright
    expect(rows[0].res).toBe("won");
    expect(rows[0].superseded).toBeUndefined(); // a graded row is never marked either
  });
});

describe("hist never reaches the training channel", () => {
  it("gradedFromBlob reads the row, never the row's history", () => {
    const blob: DayBlob = {
      date: "2026-07-25",
      at: 0,
      records: {
        a: rec({
          k: "a",
          p: 61,
          res: "won",
          hist: [
            { p: 1, lu: "projected", src: "cron", at: 1 },
            { p: 99, lu: "projected", src: "cron", at: 2 },
          ],
        }),
      },
      parlays: {},
      games,
    };
    const graded = gradedFromBlob(blob);
    expect(graded).toHaveLength(1); // two hist entries did NOT become two rows
    expect(graded.map((g) => g.p)).toEqual([61]);
    // and nothing in the output structurally carries history forward
    expect(JSON.stringify(graded)).not.toContain("hist");
    expect(JSON.stringify(graded)).not.toContain("99");
  });

  it("excludes unsettled and superseded rows, keeps stale ones", () => {
    const blob: DayBlob = {
      date: "2026-07-25",
      at: 0,
      records: {
        won: rec({ k: "won", p: 60, res: "won" }),
        pending: rec({ k: "pending", p: 60, res: "pending" }),
        void: rec({ k: "void", p: 60, res: "void" }),
        superseded: rec({ k: "superseded", p: 60, res: "won", superseded: true }),
        stale: rec({ k: "stale", p: 44, res: "lost", stale: true }),
      },
      parlays: {},
      games,
    };
    expect(gradedFromBlob(blob).map((g) => g.p).sort()).toEqual([44, 60]);
  });
});

/* End-to-end on the real engine: two generations over one fixture date, the second
   with a shifted board, asserting the row count and which probability survives. */
describe("two real generations against one fixture date", () => {
  it("collapses to one row per statement and the later pass wins", async () => {
    vi.setSystemTime(FROZEN_NOW);
    const eng = fixtureEngine();
    const cfg = eng.get<Record<string, unknown>>("SH_CFG");
    cfg.selMode = "ev_gated";
    const slate = await eng.collectSlate();
    const board = eng.analyze(slate) as BoardData;

    const pass1 = boardToPredictions(board, { src: "cron", selMode: "ev_gated" });
    // second pass: same board, every probability nudged (as a confirmed lineup would)
    const pass2 = {
      ...pass1,
      records: pass1.records.map((r) => ({ ...r, p: Math.min(99, r.p + 1.7), lu: "confirmed" as const, src: "client" as const })),
    };

    const first = mergeDayBlob(null, "2026-07-10", pass1.records, pass1.parlays, pass1.games, NOW);
    const second = mergeDayBlob(first.blob, "2026-07-10", pass2.records, pass2.parlays, pass2.games, NOW + 3600_000);

    expect(pass1.records.length).toBeGreaterThan(100);
    // ROW COUNT: unchanged by the second pass — no doubling
    expect(Object.keys(second.blob.records)).toHaveLength(Object.keys(first.blob.records).length);
    // WHICH PROBABILITY SURVIVES: the second pass's, everywhere
    const rows = Object.values(second.blob.records);
    expect(rows.every((r) => r.lu === "confirmed" && r.src === "client")).toBe(true);
    expect(rows.every((r) => (r.hist?.length ?? 0) === 1)).toBe(true);
    // and the training channel sees exactly one statement per row
    for (const r of rows) r.res = "won";
    expect(gradedFromBlob(second.blob)).toHaveLength(rows.length);
  }, 120000);
});

/* The store is the only place these rows live; the fit must not be able to reach
   past gradedFromBlob into raw records again. */
describe("the training channel has one door", () => {
  it("/api/calibrate fills the training set only through gradedFromBlob", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "app/api/calibrate/route.ts"), "utf8");
    expect(src).toMatch(/graded\.push\(\.\.\.gradedFromBlob\(blob\)\)/);
    // exactly two writers into the training set: the store (via the one door) and the
    // cloud-ledger backfill for dates the store never logged. Nothing hand-rolled.
    // (The route DOES iterate raw records elsewhere — that is the grading pass, which
    // must still grade superseded and stale rows so they stay auditable.)
    expect((src.match(/graded\.push\(/g) ?? []).length).toBe(2);
    // and no executable line in the route reaches into a record's history
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/\.hist\b/);
  });
});
