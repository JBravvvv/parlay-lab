import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FROZEN_NOW, TODAY, fixtureFetchJson } from "./helpers/fixture-env";
import { createEngine, type BoardData, type Engine, type Ticket } from "@/engine";

/* Upgrade 01 — sizing & EV discipline: "no bet" is a first-class output.
   ev_gated (new default) admits only tickets clearing coreEvMin at the Caesars
   price; zero qualifiers = NO-PLAY with $0 recommended; staking anyway takes an
   explicit override that stamps the day. Stakes allocate against
   min(entered DAILY, dailyBankrollCap x bankroll), and the recommended daily is
   the sum of per-ticket quarter-Kelly fractions (2%-of-bankroll cap each). */

let eng: Engine;
let d: BoardData;

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FROZEN_NOW);
  eng = createEngine({ fetchJson: fixtureFetchJson, today: TODAY, storage: memoryStorage() });
  d = eng.analyze(await eng.collectSlate()) as BoardData;
});
afterAll(() => vi.useRealTimers());

const CFG = () => eng.get<Record<string, unknown>>("SH_CFG");
type AllocOut = {
  picks: { stake: number; w: { pl: Ticket } }[];
  sum: number;
  ev: number | null;
  noPlay?: boolean;
  overrode?: boolean;
};
const allocate = (pool: unknown[], amt: number, cfg: unknown, force?: boolean) =>
  eng.get<(p: unknown[], a: number, c: unknown, f?: boolean) => AllocOut>("shAllocate")(pool as never, amt, cfg, force);

type Leg = { label: string; prop: string; lkey: string; game: string };
const leg = (label: string, mkt: string, game: string): Leg => ({
  label,
  prop: `${mkt} O`,
  lkey: `${label.toLowerCase().replace(/\s/g, "")}|${mkt}|5.5`,
  game,
});
const tik = (name: string, czDec: number, czEv: number, prob: number, g1: string, g2: string) => ({
  pl: { type: "MIX", name, legs: [leg(`${name} A`, "batter_hits", g1), leg(`${name} B`, "batter_hits", g2)], czDec, czEv, prob },
  src: "p",
  idx: 0,
});

describe("ev_gated selection (spec tests 1-2)", () => {
  const sixNegative = () => [
    tik("N1", 2.4, -3, 45, "g1", "g2"),
    tik("N2", 2.6, -6, 40, "g3", "g4"),
    tik("N3", 2.8, -1.5, 38, "g5", "g6"),
    tik("N4", 2.5, -9, 42, "g7", "g8"),
    tik("N5", 2.7, -4, 39, "g9", "g10"),
    tik("N6", 3.1, -2, 34, "g11", "g12"),
  ];

  it("a pool of six -EV tickets ends in NO-PLAY: no picks, flagged, nothing staked", () => {
    const a = allocate(sixNegative(), 250, CFG());
    expect(a.picks).toHaveLength(0);
    expect(a.sum).toBe(0);
    expect(a.noPlay).toBe(true);
  });

  it("the override path stakes the exact sum and stamps overrode", () => {
    const a = allocate(sixNegative(), 250, CFG(), true);
    expect(a.sum).toBe(250);
    expect(a.picks.reduce((s, p) => s + p.stake, 0)).toBe(250);
    expect(a.picks.length).toBeGreaterThanOrEqual(4); // spread rules still apply under override
    expect(a.overrode).toBe(true);
    expect(a.noPlay).toBeUndefined();
  });

  it("mixed pool: only tickets clearing coreEvMin are selected; exact-sum preserved", () => {
    const mixed = [
      tik("Pos1", 2.4, 8, 45, "g1", "g2"),
      tik("Neg1", 2.6, -6, 40, "g3", "g4"),
      tik("Pos2", 2.8, 3, 38, "g5", "g6"),
      tik("Zero", 2.5, 0, 42, "g7", "g8"), // exactly breakeven clears the default floor of 0
      tik("Neg2", 2.7, -4, 39, "g9", "g10"),
      tik("Pos3", 3.1, 5, 34, "g11", "g12"),
    ];
    const a = allocate(mixed, 100, CFG());
    expect(a.sum).toBe(100);
    const names = a.picks.map((p) => p.w.pl.name.split(" ")[0]);
    expect(names.sort()).toEqual(["Pos1", "Pos2", "Pos3", "Zero"]);
    // a ticket Caesars can't price (czEv null) never clears the gate
    const withNull = [...mixed, { ...tik("NoCz", 2.5, 0, 50, "g13", "g14"), pl: { ...tik("NoCz", 2.5, 0, 50, "g13", "g14").pl, czEv: null } }];
    const b = allocate(withNull, 100, CFG());
    expect(b.picks.some((p) => p.w.pl.name.startsWith("NoCz"))).toBe(false);
  });

  it("legacy modes stay selectable and unchanged: probability mode still allocates a -EV pool", () => {
    const a = allocate(sixNegative(), 100, { ...CFG(), selMode: "probability" });
    expect(a.sum).toBe(100);
    expect(a.overrode).toBe(false);
  });
});

describe("quarter-Kelly recommended daily (spec test 3)", () => {
  const kf = (pl: { prob: number; czDec: number }) =>
    eng.get<(pl: unknown) => number | null>("shKellyFrac")(pl);

  it("known p/dec fixtures reproduce hand-computed stakes", () => {
    // p=0.40 dec=3.5: f*=(2.5*0.4-0.6)/2.5=0.16 -> quarter=0.04 -> capped at 0.02
    expect(kf({ prob: 40, czDec: 3.5 })).toBeCloseTo(0.02, 10);
    // p=0.55 dec=2.0: f*=(0.55-0.45)/1=0.10 -> quarter=0.025 -> capped at 0.02
    expect(kf({ prob: 55, czDec: 2.0 })).toBeCloseTo(0.02, 10);
    // p=0.44 dec=2.5: f*=(1.5*0.44-0.56)/1.5=0.0666.. -> quarter=0.01666.. (under the cap)
    expect(kf({ prob: 44, czDec: 2.5 })).toBeCloseTo(0.25 * ((1.5 * 0.44 - 0.56) / 1.5), 10);
    // -EV ticket: Kelly says don't bet -> 0, never negative
    expect(kf({ prob: 30, czDec: 3.0 })).toBe(0);
  });

  it("stakes allocate against min(entered DAILY, cap x bankroll); kellyDaily <= cap; override stamps the card", () => {
    const SH = eng.get<{ daily: number; fun: number; bankroll: number }>("SH");
    SH.daily = 250;
    SH.fun = 0;
    SH.bankroll = 750;
    type CC = { alloc: AllocOut & { picks: { stake: number; kelly?: number | null; w: { pl: Ticket } }[] }; kellyDaily: number; dailyCap: number; enteredDaily: number; overrode: boolean };
    const calc = () => eng.get<(x: unknown) => CC | null>("shCardCalc")(d)!;

    // the fixture slate prices all-negative at Caesars: ev_gated answers NO-PLAY, $0 recommended
    const noPlay = calc();
    expect(noPlay.dailyCap).toBe(75); // 10% of $750
    expect(noPlay.alloc.noPlay).toBe(true);
    expect(noPlay.alloc.sum).toBe(0);
    expect(noPlay.kellyDaily).toBe(0);
    expect(noPlay.overrode).toBe(false);

    // explicit override: allocation returns, but against min($250, $75) = the bankroll cap
    eng.get<(on: boolean) => void>("shSetOverride")(true);
    const forced = calc();
    expect(forced.overrode).toBe(true);
    expect(forced.alloc.sum).toBe(75); // cap binds, never the entered $250
    // kellyDaily is the sum of per-ticket quarter-Kelly stakes, capped by dailyCap
    const expected = Math.min(
      Math.round(750 * forced.alloc.picks.reduce((s, p) => s + (kf(p.w.pl as never) ?? 0), 0)),
      75,
    );
    expect(forced.kellyDaily).toBe(expected);
    for (const p of forced.alloc.picks) {
      expect(p.kelly).toBe(Math.round(750 * (kf(p.w.pl as never) ?? 0)));
    }

    // entered DAILY binds when it is the smaller number
    SH.daily = 40;
    const small = calc();
    expect(small.alloc.sum).toBe(40);
    eng.get<(on: boolean) => void>("shSetOverride")(false);
    expect(calc().alloc.noPlay).toBe(true); // override off -> discipline back on
  });
});
