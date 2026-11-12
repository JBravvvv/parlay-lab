import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BUCKET_EDGES, outcomeOf, probOf, tallyTickets } from "@/lib/scoreboard-tally";
import { ledgerStats } from "@/lib/ledger-stats";
import type { LedgerEntry } from "@/lib/useLedger";
import { stripComments } from "./helpers/source";

/* AUDIT E3-1 — the Ledger's scoreboard counted a ticket only when its result contained "win" or
   "loss". The stored words are "won" and "lost", so it counted nothing. These tests hold the tally
   to the stored words and to the same won/lost counts the Ledger's own record shows. */

type T = { id: string; prob?: number };
const ticket = (t: T) => ({ id: t.id, bucket: "core", name: t.id, stake: 10, legs: [], ...(t.prob != null ? { prob: t.prob } : {}) });

function entry(date: string, core: T[], results: Record<string, string | undefined>, funT: T[] = []): LedgerEntry {
  const tickets: Record<string, { result: string; payout: number }> = {};
  for (const [id, result] of Object.entries(results)) {
    if (result != null) tickets[id] = { result, payout: result === "won" ? 25 : 0 };
  }
  return {
    date,
    locked: true,
    daily: 100,
    fun: 0,
    core: core.map(ticket),
    funT: funT.map(ticket),
    grading: { tickets, legs: {}, done: true },
  } as unknown as LedgerEntry;
}

describe("E3-1 — the stored result word", () => {
  it("won and lost are the two outcomes, in any case and with stray spaces", () => {
    expect(outcomeOf("won")).toBe("won");
    expect(outcomeOf("lost")).toBe("lost");
    expect(outcomeOf("WON")).toBe("won");
    expect(outcomeOf(" Lost ")).toBe("lost");
  });

  it("nothing else is an outcome", () => {
    for (const r of ["push", "void", "pending", "ungradable", "", "win", "loss", "w", "l", "winner", "lossless", "wonky", "lost-ish", "not won"]) {
      expect(outcomeOf(r), r).toBeNull();
    }
    for (const r of [undefined, null, 1, true, {}, ["won"]]) expect(outcomeOf(r)).toBeNull();
  });

  it("the old test matched neither stored word — the reason the panel read zero", () => {
    const old = (res: string) => res.includes("win") || res.includes("loss") || res === "w" || res === "l";
    expect(old("won")).toBe(false);
    expect(old("lost")).toBe(false);
  });
});

describe("E3-1 — a stored probability", () => {
  it("a fraction stays, a percent is divided by 100", () => {
    expect(probOf(0.42)).toBe(0.42);
    expect(probOf(42)).toBe(0.42);
    expect(probOf(1)).toBe(1);
    expect(probOf(0)).toBe(0);
    expect(probOf(100)).toBe(1);
  });

  it("anything that is not a probability is no probability", () => {
    for (const p of [undefined, null, "0.4", NaN, Infinity, -0.1, -5, 101, 250]) expect(probOf(p), String(p)).toBeNull();
  });
});

describe("E3-1 — the tally", () => {
  it("one won and one lost ticket are two graded tickets, one win", () => {
    const t = tallyTickets([entry("2026-09-20", [{ id: "A" }, { id: "B" }], { A: "won", B: "lost" })]);
    expect(t.graded).toBe(2);
    expect(t.wins).toBe(1);
  });

  it("a push, a void, an open, an ungradable and an ungraded ticket are not counted", () => {
    const e = entry(
      "2026-09-20",
      [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }, { id: "E" }, { id: "F" }, { id: "G" }],
      { A: "won", B: "lost", C: "push", D: "void", E: "pending", F: "ungradable", G: undefined },
    );
    expect(tallyTickets([e])).toMatchObject({ graded: 2, wins: 1 });
  });

  it("fun tickets count beside core tickets, across every entry", () => {
    const a = entry("2026-09-20", [{ id: "A" }], { A: "won", F1: "lost" }, [{ id: "F1" }]);
    const b = entry("2026-09-21", [{ id: "A" }, { id: "B" }], { A: "lost", B: "won" }, [{ id: "F2" }]);
    expect(tallyTickets([a, b])).toMatchObject({ graded: 4, wins: 2 });
  });

  it("a grade for a ticket that is not on the card counts nothing", () => {
    expect(tallyTickets([entry("2026-09-20", [{ id: "A" }], { A: "won", GHOST: "won" })])).toMatchObject({ graded: 1, wins: 1 });
  });

  it("an entry with no grading, no core or no fun list is read as empty, not thrown on", () => {
    const bare = [{ core: [ticket({ id: "A" })] }, { funT: [ticket({ id: "B" })] }, {}, { core: [ticket({ id: "C" })], grading: null }];
    expect(tallyTickets(bare as never)).toEqual({ graded: 0, wins: 0, buckets: [] });
    expect(tallyTickets([])).toEqual({ graded: 0, wins: 0, buckets: [] });
  });

  it("matches the Ledger's own won and lost counts on the same entries", () => {
    const entries = [
      entry("2026-09-20", [{ id: "A" }, { id: "B" }, { id: "C" }], { A: "won", B: "lost", C: "push" }, [{ id: "F" }]),
      entry("2026-09-21", [{ id: "A" }, { id: "B" }], { A: "lost", B: "lost" }),
      entry("2026-09-22", [{ id: "A" }], { A: "won" }),
    ];
    const s = ledgerStats(entries, "all");
    const t = tallyTickets(entries);
    expect(t.wins).toBe(2);
    expect(t.graded - t.wins).toBe(3);
    expect(s.days.reduce((n, d) => n + d.w, 0)).toBe(t.wins);
    expect(s.days.reduce((n, d) => n + d.l, 0)).toBe(t.graded - t.wins);
  });
});

describe("E3-1 — calibration buckets", () => {
  it("each graded ticket lands in the bucket holding its probability; edges go up", () => {
    const e = entry(
      "2026-09-20",
      [
        { id: "A", prob: 0.1 },
        { id: "B", prob: 0.15 },
        { id: "C", prob: 0.3 },
        { id: "D", prob: 0.45 },
        { id: "E", prob: 0.6 },
        { id: "F", prob: 1 },
        { id: "G", prob: 0.149 },
      ],
      { A: "lost", B: "won", C: "lost", D: "won", E: "won", F: "won", G: "won" },
    );
    const t = tallyTickets([e]);
    expect(t.buckets.map((b) => [b.label, b.n])).toEqual([
      ["<15%", 2],
      ["15–30%", 1],
      ["30–45%", 1],
      ["45–60%", 1],
      ["60%+", 2],
    ]);
  });

  it("predicted is the mean stored probability, actual the share that won", () => {
    const e = entry(
      "2026-09-20",
      [{ id: "A", prob: 0.5 }, { id: "B", prob: 0.48 }, { id: "C", prob: 0.52 }, { id: "D", prob: 46 }],
      { A: "won", B: "lost", C: "lost", D: "lost" },
    );
    const [b] = tallyTickets([e]).buckets;
    expect(b.label).toBe("45–60%");
    expect(b.n).toBe(4);
    expect(b.predicted).toBeCloseTo(0.49, 10);
    expect(b.actual).toBe(0.25);
  });

  it("a percent-stored probability is bucketed as its fraction", () => {
    const e = entry("2026-09-20", [{ id: "A", prob: 22 }, { id: "B", prob: 62.5 }], { A: "won", B: "lost" });
    expect(tallyTickets([e]).buckets).toEqual([
      { label: "15–30%", n: 1, predicted: 0.22, actual: 1 },
      { label: "60%+", n: 1, predicted: 0.625, actual: 0 },
    ]);
  });

  it("a graded ticket with no usable probability is counted but put in no bucket", () => {
    const e = entry("2026-09-20", [{ id: "A" }, { id: "B", prob: -3 }, { id: "C", prob: 400 }], { A: "won", B: "lost", C: "won" });
    expect(tallyTickets([e])).toEqual({ graded: 3, wins: 2, buckets: [] });
  });

  it("an ungraded ticket's probability is in no bucket", () => {
    const e = entry("2026-09-20", [{ id: "A", prob: 0.5 }, { id: "B", prob: 0.5 }], { A: "push", B: undefined });
    expect(tallyTickets([e]).buckets).toEqual([]);
  });

  it("an empty bucket is left out and the rest keep their order", () => {
    const e = entry("2026-09-20", [{ id: "A", prob: 0.7 }, { id: "B", prob: 0.05 }], { A: "won", B: "lost" });
    expect(tallyTickets([e]).buckets.map((b) => b.label)).toEqual(["<15%", "60%+"]);
  });

  it("the edges cover 0 to 1 with no gap and no overlap", () => {
    expect(BUCKET_EDGES[0].lo).toBe(0);
    for (let i = 1; i < BUCKET_EDGES.length; i++) expect(BUCKET_EDGES[i].lo).toBe(BUCKET_EDGES[i - 1].hi);
    expect(BUCKET_EDGES[BUCKET_EDGES.length - 1].hi).toBeGreaterThan(1);
  });
});

describe("E3-1 — as source", () => {
  const panel = stripComments(readFileSync("src/components/mlb/ProScoreboard.tsx", "utf8"));
  const tally = stripComments(readFileSync("src/lib/scoreboard-tally.ts", "utf8"));

  it("the panel takes graded, wins and buckets from the tally and returns them untouched", () => {
    expect(panel).toMatch(/import \{ tallyTickets \} from "@\/lib\/scoreboard-tally";/);
    expect(panel).toMatch(/const \{ graded, wins, buckets \} = tallyTickets\(entries\);/);
    expect(panel).toMatch(/return \{\s*graded,\s*wins,\s*clvN,/);
    expect(panel).toMatch(/\n\s*buckets,\s*\};/);
  });

  it("the panel no longer reads a result word itself", () => {
    expect(panel).not.toMatch(/includes\("win"\)|includes\("loss"\)|=== "w"|=== "l"/);
    expect(panel).not.toMatch(/\.result\b/);
    expect(panel).not.toMatch(/graded\+\+|wins\+\+|graded\s*[+-]=|wins\s*[+-]=/);
  });

  it("the tally is pure: no fetch, no store, no clock", () => {
    expect(tally).not.toMatch(/fetch\(|redis\(|process\.env|Date\.now|localStorage/);
    expect(tally).toMatch(/r === "won" \|\| r === "lost"/);
  });
});
