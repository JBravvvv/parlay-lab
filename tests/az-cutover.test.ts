import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FROZEN_NOW, armedFixtureEngine } from "./helpers/fixture-env";
import { swapSettleBook } from "./helpers/settle-book";
import { assertAppendOnly } from "@/lib/append-only";
import { ANYTIME_SINCE, anytimeOwns, cutoverNote } from "@/lib/az/cutover";
import { foundCandidates, foundNothingReason, planFound } from "@/lib/cfb/found";
import { buildCfbBoard } from "@/lib/cfb/model";
import { CFB_LEAGUE } from "@/lib/cfb/rules";
import { FOUND_SINCE, STRAIGHT_SINCE, isFoundDay, isStraightDay } from "@/lib/found-mode";
import { NFL_LEAGUE } from "@/lib/nfl/rules";
import { buildLockEntry } from "@/lib/server/lock-card";

/**
 * THE CUTOVER (src/lib/az/cutover.ts): from ANYTIME_SINCE the any-time engine is the only thing that
 * records a new pick. The older desks' found passes still run and still carry what they hold; they
 * seat nothing new on a card dated on or after it. Nothing is deleted, and setting the date to null
 * turns the older passes back on. Prices are the fixtures' own; no network is reached.
 */

afterEach(() => vi.useRealTimers());

const DAY_BEFORE = "2026-11-12";
const DAY_OF = "2026-11-13";

describe("cutover — the date gate", () => {
  it("starts on the card dated 2026-11-13 and leaves every earlier card alone", () => {
    expect(ANYTIME_SINCE).toBe(DAY_OF);
    expect(anytimeOwns(DAY_BEFORE)).toBe(false);
    expect(anytimeOwns(DAY_OF)).toBe(true);
    expect(anytimeOwns("2027-04-01")).toBe(true);
    expect(anytimeOwns(FOUND_SINCE)).toBe(false);
    expect(anytimeOwns(STRAIGHT_SINCE)).toBe(false);
    /* the older rules it sits on top of are unchanged on both sides of it */
    expect(isFoundDay(DAY_OF) && isStraightDay(DAY_OF)).toBe(true);
  });

  it("never fires on something that is not a card date", () => {
    for (const bad of [null, undefined, "", "11/13/2026", "2026-11-13T00:00:00Z", "20261113", "zzzz-zz-zz"]) expect(anytimeOwns(bad as never)).toBe(false);
  });

  it("is reversible: with no date, the older passes own every card again", () => {
    expect(anytimeOwns(DAY_OF, null)).toBe(false);
    expect(anytimeOwns("2030-01-01", null)).toBe(false);
    expect(anytimeOwns("2026-11-20", "2026-12-01")).toBe(false);
    expect(anytimeOwns("2026-12-01", "2026-12-01")).toBe(true);
  });

  it("says in plain words why a desk added nothing", () => {
    expect(cutoverNote()).toBe("new picks come from the any-time engine since 2026-11-13 — this desk adds nothing new; see the Any-time page.");
    expect(cutoverNote(null)).toMatch(/since the cutover/);
  });
});

describe("cutover — MLB found pass", () => {
  async function build() {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FROZEN_NOW);
    const eng = armedFixtureEngine();
    const d = eng.analyze(await eng.collectSlate()) as unknown as Record<string, unknown>;
    const cats = (d.categories ?? {}) as Record<string, Array<Record<string, unknown>>>;
    for (const rows of Object.values(cats)) for (const r of rows ?? []) if (r && r.prob != null) r.prob = Math.min(97, Number(r.prob) + 20);
    return { eng, d };
  }
  /* the same TEST DOUBLE tests/straight-only.test.ts uses: model probability +20 points so the fixture seats bets */
  function edged(eng: ReturnType<typeof armedFixtureEngine>) {
    const get = eng.get.bind(eng);
    return Object.assign(Object.create(eng), {
      get: (k: string) => {
        const v = get(k as never) as unknown;
        if (k !== "shCardPool") return v;
        return (b: unknown) =>
          ((v as (b: unknown) => { pl: { prob: number } }[])(b)).map((w) => ({ ...w, pl: { ...w.pl, prob: Math.min(97, Number(w.pl.prob) + 20) } }));
      },
    });
  }

  it("the day before seats bets; from the cutover the same board seats none, and writes a valid empty found card", async () => {
    const { eng: raw, d } = await build();
    const eng = edged(raw);
    const before = buildLockEntry({ eng: eng as never, data: d, date: DAY_BEFORE, now: FROZEN_NOW, trigger: "test" });
    expect(before.core.length, "the fixture must seat a bet the day before, or the gate is untested").toBeGreaterThan(0);

    const e = buildLockEntry({ eng: eng as never, data: d, date: DAY_OF, now: FROZEN_NOW, trigger: "test" });
    expect(e.selMode).toBe("found");
    expect(e.core).toEqual([]);
    expect(e.funT ?? []).toEqual([]);
    expect(e.date).toBe(DAY_OF);
  }, 180_000);

  it("what the card already holds rides through untouched, and nothing is appended", async () => {
    const { eng: raw, d } = await build();
    const eng = edged(raw);
    const morning = buildLockEntry({ eng: eng as never, data: d, date: DAY_BEFORE, now: FROZEN_NOW, trigger: "morning" });
    const held = morning.core.slice(0, 2);
    expect(held.length).toBeGreaterThan(0);
    const carry = { ...morning, date: DAY_OF, core: held, funT: morning.funT, allocSum: held.reduce((a, t) => a + Number(t.stake), 0) };
    const e = buildLockEntry({ eng: eng as never, data: d, date: DAY_OF, now: FROZEN_NOW + 60_000, trigger: "11am", carry: carry as never });
    expect(() => assertAppendOnly(carry as never, e as never, "cutover carry")).not.toThrow();
    expect(e.core).toEqual(held);
    expect(e.funT).toEqual(morning.funT);
  }, 180_000);
});

describe("cutover — football found pass", () => {
  const redate = (x: unknown, map: Record<string, string>) => {
    let s = JSON.stringify(x);
    for (const [a, b] of Object.entries(map)) s = s.split(a).join(b);
    return JSON.parse(s);
  };
  const readFix = (dir: string, f: string, map: Record<string, string>) =>
    redate(swapSettleBook(JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", dir, f), "utf8"))), map);
  const CMAP = { "2026-09-05": DAY_BEFORE, "2026-09-06": DAY_OF, "20260905": "20261112" };
  const ESPN = readFix("cfb", "espn-scoreboard-2026-09-05.json", CMAP) as { events: unknown[] };
  const ODDS = readFix("cfb", "odds-ncaaf-2026-09-05.json", CMAP) as unknown[];
  const FPI = readFix("cfb", "espn-fpi.json", {}) as unknown;
  const now = Date.parse(`${DAY_BEFORE}T15:00:00Z`);
  const board = buildCfbBoard({ date: DAY_BEFORE, espnEvents: ESPN.events, oddsEvents: ODDS, fpi: FPI, now, bankroll: 2500 });
  /* the same games, on a card dated the cutover day */
  const after = { ...board, date: DAY_OF };

  it("the day before plans bets; from the cutover the same board plans none", () => {
    const p = planFound(CFB_LEAGUE, board, null, now);
    expect(p.tickets.length, "the fixture must seat a bet the day before, or the gate is untested").toBeGreaterThan(0);
    expect(foundCandidates(CFB_LEAGUE, after, now).length, "the candidates are still there: the gate, not an empty board, is what stops them").toBeGreaterThan(0);

    for (const cfg of [CFB_LEAGUE, NFL_LEAGUE]) {
      const q = planFound(cfg, after, null, now);
      expect(q.tickets).toEqual([]);
      expect(q.fun).toEqual([]);
      expect([q.stake, q.funStake, q.candidates]).toEqual([0, 0, 0]);
      expect(q.games).toEqual({});
      /* the room is still reported honestly: nothing was spent */
      expect(q.room).toBe(q.roomBefore);
      expect(foundNothingReason(cfg, DAY_OF, q)).toBe(cutoverNote());
    }
    expect(foundNothingReason(CFB_LEAGUE, DAY_BEFORE, planFound(CFB_LEAGUE, board, null, now))).not.toBe(cutoverNote());
  });

  it("a card that already holds bets keeps them and gains nothing", () => {
    const p = planFound(CFB_LEAGUE, board, null, now);
    const entry = { sport: "cfb", date: DAY_OF, locked: true, daily: 2500, fun: 0, core: p.tickets.slice(0, 2), funT: [], lockedAt: now, games: p.games } as never;
    const frozen = JSON.stringify(entry);
    const q = planFound(CFB_LEAGUE, after, entry, now + 60_000);
    expect(q.tickets).toEqual([]);
    expect(JSON.stringify(entry)).toBe(frozen);
  });
});

describe("cutover — as source", () => {
  const strip = (f: string) => fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  it("both older found passes read the one gate, and nothing else decides it", () => {
    const fb = strip("src/lib/cfb/found.ts");
    expect(fb).toMatch(/import \{ anytimeOwns, cutoverNote \} from "@\/lib\/az\/cutover";/);
    expect(fb).toMatch(/const handedOver = anytimeOwns\(board\.date\);\n\s*const cands = handedOver \? \[\] : foundCandidates\(cfg, board, now\);/);
    expect(fb).toMatch(/if \(!handedOver && !funT\.length && foundFunOf\(board\.date\) > 0/);
    const mlb = strip("src/lib/server/lock-card.ts");
    expect(mlb).toMatch(/import \{ anytimeOwns \} from "@\/lib\/az\/cutover";/);
    expect(mlb).toMatch(/const handedOver = anytimeOwns\(date\);\n\s*for \(const w of \(handedOver \? \[\] : \[\.\.\.enginePool, \.\.\.straights\]\)/);
    expect(mlb).toMatch(/if \(!handedOver && funT\.length === 0 && foundFunOf\(date\) > 0\)/);
    /* the date lives in exactly one file */
    const lit = (f: string) => (strip(f).match(/2026-11-13/g) ?? []).length;
    expect(lit("src/lib/az/cutover.ts")).toBe(1);
    expect(lit("src/lib/cfb/found.ts") + lit("src/lib/server/lock-card.ts") + lit("src/lib/found-mode.ts")).toBe(0);
  });

  it("the any-time engine is not gated by it: it records picks on every date", () => {
    for (const f of ["src/lib/anytime/run.ts", "src/lib/anytime/engine.ts", "src/lib/anytime/ledger.ts", "src/lib/server/anytime.ts"]) expect(strip(f)).not.toMatch(/cutover|anytimeOwns|ANYTIME_SINCE/);
  });

  it("the gate removes nothing: no delete, no write, no store", () => {
    const c = strip("src/lib/az/cutover.ts");
    expect(c).not.toMatch(/redis|fetch\(|"DEL"|"SET"|import /);
  });
});
