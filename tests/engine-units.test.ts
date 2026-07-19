/**
 * Key unit assertions ported from the jsc suites (tests/legacy-harness/
 * unit40.js + unit40grade.js): allocator discipline on the real fixture board,
 * Caesars void rules against the real boxscore 822954, and void-reprice math.
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FROZEN_NOW, fixtureEngine } from "./helpers/fixture-env";
import type { BoardData, Engine, Ticket } from "@/engine";

let eng: Engine;
let d: BoardData;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FROZEN_NOW);
  eng = fixtureEngine();
  const slate = await eng.collectSlate();
  d = eng.analyze(slate);
});
afterAll(() => vi.useRealTimers());

describe("daily allocator (core card discipline)", () => {
  /* these tests were written for the pre-upgrade-01 default and pin selMode explicitly:
     the spread/K/cap rules they cover are mode-agnostic (ev_gated has its own suite) */
  const CFG = () => ({ ...eng.get<Record<string, unknown>>("SH_CFG"), selMode: "probability" });
  const pool = () => eng.get<(x: BoardData) => unknown[]>("shCardPool")(d);
  const alloc = (amt: number) =>
    eng.get<(p: unknown[], a: number, c: unknown) => { picks: { stake: number; id: string; w: { pl: Ticket } }[]; sum: number; ev: number; legs: Record<string, number> }>(
      "shAllocate",
    )(pool(), amt, CFG());

  it("sums exactly to the entered amount, whole dollars", () => {
    for (const amt of [37, 25, 5, 750]) {
      const a = alloc(amt);
      expect(a.sum).toBe(amt);
      expect(a.picks.reduce((s, p) => s + p.stake, 0)).toBe(amt);
      for (const p of a.picks) expect(Number.isInteger(p.stake)).toBe(true);
    }
  });

  it("is deterministic (re-run = identical stakes)", () => {
    const a = alloc(37);
    const b = alloc(37);
    expect(b.picks.map((p) => [p.id, p.stake])).toEqual(a.picks.map((p) => [p.id, p.stake]));
  });

  /* synthetic-pool helpers for the K's-parlay + spread rules (2026-07-17):
     the K's parlay is deliberately the Kelly favorite (short odds, biggest EV)
     so only the rules — never the weights — can be what excludes it */
  type Leg = { label: string; prop: string; lkey: string; game: string };
  const leg = (label: string, mkt: string, game: string): Leg => ({
    label,
    prop: `${mkt} O`,
    lkey: `${label.toLowerCase().replace(/\s/g, "")}|${mkt}|5.5`,
    game,
  });
  const tik = (type: string, legs: Leg[], czDec: number, czEv: number, prob: number) => ({
    pl: { type, name: `${type} · ${legs.length} legs`, legs, czDec, czEv, prob },
    src: "p",
    idx: 0,
  });
  const kTik = () =>
    tik("pitcher_strikeouts", [leg("Ace One", "pitcher_strikeouts", "g1"), leg("Ace Two", "pitcher_strikeouts", "g2")], 2.4, 12, 45);
  const synthAlloc = (pool: unknown[], amt: number) =>
    eng.get<(p: unknown[], a: number, c: unknown) => { picks: { stake: number; w: { pl: Ticket } }[]; sum: number }>(
      "shAllocate",
    )(pool as never, amt, CFG());

  it("with a healthy pool: 4+ tickets, ≤25% each, K's parlay shut out, ≤1 mixed K leg", () => {
    const synth = [
      kTik(),
      tik("MIX", [leg("Ace Three", "pitcher_strikeouts", "g3"), leg("Bat One", "batter_hits", "g4")], 2.6, 6, 40),
      tik("MIX", [leg("Ace Four", "pitcher_strikeouts", "g5"), leg("Bat Two", "batter_hits", "g6")], 2.6, 6, 40),
      tik("batter_total_bases", [leg("Bat Three", "batter_total_bases", "g7"), leg("Bat Four", "batter_total_bases", "g8")], 2.8, 5, 38),
      tik("ml", [leg("Team A", "ml", "g9"), leg("Team B", "ml", "g10")], 2.5, 4, 42),
      tik("batter_hits", [leg("Bat Five", "batter_hits", "g11"), leg("Bat Six", "batter_hits", "g12")], 2.7, 5, 39),
    ];
    const a = synthAlloc(synth, 100);
    expect(a.sum).toBe(100);
    expect(a.picks.length).toBeGreaterThanOrEqual(4); // user rule: always 4+ when the pool allows
    let kLegsOnCard = 0;
    for (const p of a.picks) {
      expect(p.w.pl.type).not.toBe("pitcher_strikeouts"); // fill-only: not needed here
      expect(p.stake).toBeLessThanOrEqual(25); // 25% concentration cap
      for (const l of p.w.pl.legs)
        if (String(l.lkey || "").includes("|pitcher_strikeouts|")) kLegsOnCard++;
    }
    expect(kLegsOnCard).toBeLessThanOrEqual(1);
  });

  it("thin pool: a K's parlay fills to the minimum but takes at most 15%", () => {
    const synth = [
      kTik(),
      tik("batter_total_bases", [leg("Bat Three", "batter_total_bases", "g7"), leg("Bat Four", "batter_total_bases", "g8")], 2.8, 5, 38),
      tik("ml", [leg("Team A", "ml", "g9"), leg("Team B", "ml", "g10")], 2.5, 4, 42),
    ];
    const a = synthAlloc(synth, 100);
    expect(a.sum).toBe(100);
    expect(a.picks.length).toBe(3); // all it can do — and the K's parlay is one of them
    const k = a.picks.find((p) => p.w.pl.type === "pitcher_strikeouts");
    expect(k).toBeTruthy(); // "occasionally if needed" — needed here
    expect(k!.stake).toBeLessThanOrEqual(15); // capped at 15% of the daily
  });

  it("never repeats a pick across the card and never takes HR or +1400-plus tickets", () => {
    const a = alloc(750);
    expect(a.picks.length).toBeGreaterThanOrEqual(4); // spread rule on the real fixture pool
    for (const p of a.picks) expect(p.stake).toBeLessThanOrEqual(187); // 25% of $750
    const seen = new Set<string>();
    for (const p of a.picks) {
      const pl = p.w.pl;
      expect(pl.czDec as number).toBeLessThanOrEqual(15);
      for (const l of pl.legs) {
        const key = `${l.label}|${l.prop}`;
        expect(seen.has(key), `duplicate leg on card: ${key}`).toBe(false);
        seen.add(key);
        expect(String(l.lkey || "")).not.toContain("|batter_home_runs|");
      }
    }
  });
});

describe("grading — Caesars void rules on real boxscore 822954", () => {
  const box = JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures/fix40/box_822954.json"), "utf8"),
  );
  const gradeLeg = () =>
    eng.get<(l: unknown, e: unknown, b: unknown, s: unknown) => { result: string; detail: string }>(
      "shGradeLeg",
    );
  const pn = (n: string) => eng.get<(s: string) => string>("pnorm")(n);
  const entry = { games: { g1: { pk: 822954, start: "2026-07-09T23:00:00Z", away: "A", home: "B" } } };
  const boxes = { 822954: box };
  const finals = { 822954: { state: "Final", away: 4, home: 6 } };
  const leg = (name: string, mkt: string, ln: number, prop: string) => ({
    gkey: "g1",
    lkey: `${pn(name)}|${mkt}|${ln}`,
    prop,
  });

  it("grades hits / TB / H+R+RBI from batter lines (McMahon 2H, 4TB, 5 H+R+RBI)", () => {
    const g = gradeLeg();
    expect(g(leg("Ryan McMahon", "batter_hits", 1.5, "Hits O 1.5"), entry, boxes, finals).result).toBe("won");
    expect(g(leg("Ryan McMahon", "batter_total_bases", 3.5, "TB O 3.5"), entry, boxes, finals).result).toBe("won");
    expect(g(leg("Ryan McMahon", "batter_total_bases", 4.5, "TB O 4.5"), entry, boxes, finals).result).toBe("lost");
    expect(g(leg("Ryan McMahon", "batter_hits_runs_rbis", 4.5, "H+R+RBI O 4.5"), entry, boxes, finals).result).toBe("won");
    // integer line lands exactly -> push
    expect(g(leg("Ryan McMahon", "batter_hits", 2, "Hits O 2"), entry, boxes, finals).result).toBe("push");
  });

  it("voids a substitute batter (Palacios) and grades a starting pitcher (Blackburn 3K)", () => {
    const g = gradeLeg();
    const sub = g(leg("Richie Palacios", "batter_hits", 0.5, "Hits O 0.5"), entry, boxes, finals);
    expect(sub.result).toBe("void");
    expect(sub.detail).toBe("not in starting lineup");
    expect(g(leg("Paul Blackburn", "pitcher_strikeouts", 2.5, "Ks O 2.5"), entry, boxes, finals).result).toBe("won");
    expect(g(leg("Paul Blackburn", "pitcher_strikeouts", 3.5, "Ks O 3.5"), entry, boxes, finals).result).toBe("lost");
  });

  it("grades ML/RL from the final score and voids postponed games", () => {
    const g = gradeLeg();
    expect(g({ gkey: "g1", lkey: "ml_home", prop: "ML" }, entry, boxes, finals).result).toBe("won");
    expect(g({ gkey: "g1", lkey: "ml_away", prop: "ML" }, entry, boxes, finals).result).toBe("lost");
    expect(g({ gkey: "g1", lkey: "rl_away", prop: "RL +1.5 vs B" }, entry, boxes, finals).result).toBe("lost");
    const pp = g(leg("Ryan McMahon", "batter_hits", 1.5, "Hits O 1.5"), entry, boxes, {
      822954: { state: "Postponed", away: null, home: null },
    });
    expect(pp.result).toBe("void");
  });
});

describe("ticket grading — void reprice divides the leg out", () => {
  const gradeTicket = () =>
    eng.get<(t: unknown, r: Record<string, { result: string }>) => { result: string; payout: number; dec?: number }>(
      "shGradeTicket",
    );
  const ticket = (over: Partial<Record<string, unknown>> = {}) => ({
    confirmed: null,
    czDec: 7.0,
    stake: 10,
    legs: [
      { label: "A", prop: "Hits O 0.5", cz: -110 },
      { label: "B", prop: "TB O 1.5", cz: 150 },
      { label: "C", prop: "Ks O 5.5", cz: -120 },
    ],
    ...over,
  });

  it("+600 ticket with the +150 leg void reprices 7.0/2.5 = 2.8 -> $28 on $10", () => {
    const g = gradeTicket()(ticket(), {
      "A|Hits O 0.5": { result: "won" },
      "B|TB O 1.5": { result: "void" },
      "C|Ks O 5.5": { result: "won" },
    });
    expect(g.result).toBe("won");
    expect(g.dec).toBe(2.8);
    expect(g.payout).toBe(28);
  });

  it("any lost leg loses; all-void pushes the stake back; NV-confirmed price wins over czDec", () => {
    const g = gradeTicket();
    expect(
      g(ticket(), {
        "A|Hits O 0.5": { result: "won" },
        "B|TB O 1.5": { result: "lost" },
        "C|Ks O 5.5": { result: "void" },
      }).result,
    ).toBe("lost");
    const push = g(ticket(), {
      "A|Hits O 0.5": { result: "void" },
      "B|TB O 1.5": { result: "void" },
      "C|Ks O 5.5": { result: "void" },
    });
    expect(push.result).toBe("push");
    expect(push.payout).toBe(10);
    const conf = g(ticket({ confirmed: 600 }), {
      "A|Hits O 0.5": { result: "won" },
      "B|TB O 1.5": { result: "won" },
      "C|Ks O 5.5": { result: "won" },
    });
    expect(conf.payout).toBe(70);
  });

  it("pending legs keep the ticket pending; ledger write-guard keeps locked entries append-only", () => {
    const g = gradeTicket()(ticket(), {
      "A|Hits O 0.5": { result: "won" },
      "B|TB O 1.5": { result: "pending" },
      "C|Ks O 5.5": { result: "won" },
    });
    expect(g.result).toBe("pending");

    // write-guard: a locked entry refuses field mutation, merges only grading/clv
    const save = eng.get<(e: Record<string, unknown>) => void>("shLedgerSave");
    const ledger = eng.get<() => Record<string, unknown>[]>("shLedger");
    save({ date: "2099-01-01", locked: true, daily: 40, core: [], funT: [], games: {}, clv: {} });
    save({ date: "2099-01-01", daily: 999, grading: { done: true }, gradedAt: 123 });
    const e = ledger().find((x) => x.date === "2099-01-01")!;
    expect(e.daily).toBe(40);
    expect((e.grading as { done: boolean }).done).toBe(true);
  });
});
