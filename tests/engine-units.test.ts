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
  const CFG = () => eng.get<Record<string, unknown>>("SH_CFG");
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

  it("K's parlays never take daily money and at most one K leg rides the card (user rule 2026-07-17)", () => {
    // the fixture slate has no Caesars-playable K tickets, so exercise the rule
    // through the real allocator on a synthetic pool where the K's parlay would
    // otherwise be the Kelly favorite (short odds + biggest EV = biggest weight)
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
    const synth = [
      tik("pitcher_strikeouts", [leg("Ace One", "pitcher_strikeouts", "g1"), leg("Ace Two", "pitcher_strikeouts", "g2")], 2.4, 12, 45),
      tik("MIX", [leg("Ace Three", "pitcher_strikeouts", "g3"), leg("Bat One", "batter_hits", "g4")], 2.6, 6, 40),
      tik("MIX", [leg("Ace Four", "pitcher_strikeouts", "g5"), leg("Bat Two", "batter_hits", "g6")], 2.6, 6, 40),
      tik("batter_total_bases", [leg("Bat Three", "batter_total_bases", "g7"), leg("Bat Four", "batter_total_bases", "g8")], 2.8, 5, 38),
      tik("ml", [leg("Team A", "ml", "g9"), leg("Team B", "ml", "g10")], 2.5, 4, 42),
    ];
    const a = eng.get<(p: unknown[], amt: number, c: unknown) => { picks: { stake: number; w: { pl: Ticket } }[]; sum: number }>(
      "shAllocate",
    )(synth as never, 100, CFG());
    expect(a.sum).toBe(100);
    expect(a.picks.length).toBeGreaterThan(0);
    let kLegsOnCard = 0;
    for (const p of a.picks) {
      expect(p.w.pl.type).not.toBe("pitcher_strikeouts");
      for (const l of p.w.pl.legs)
        if (String(l.lkey || "").includes("|pitcher_strikeouts|")) kLegsOnCard++;
    }
    // two K-leg mixed tickets offered — the card-wide budget lets at most one through
    expect(kLegsOnCard).toBeLessThanOrEqual(1);
    // and the live fixture card stays K-parlay-free too
    for (const p of alloc(750).picks) expect(p.w.pl.type).not.toBe("pitcher_strikeouts");
  });

  it("never repeats a pick across the card and never takes HR or +1400-plus tickets", () => {
    const a = alloc(750);
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
