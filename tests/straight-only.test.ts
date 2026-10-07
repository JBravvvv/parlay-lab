import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import React, { createElement } from "react";
import { FROZEN_NOW, armedFixtureEngine } from "./helpers/fixture-env";
import { swapSettleBook } from "./helpers/settle-book";
import { buildCfbBoard } from "@/lib/cfb/model";
import { CFB_LEAGUE } from "@/lib/cfb/rules";
import { assertCardMoney } from "@/lib/cfb/lock-server";
import { foundCandidates, planFound } from "@/lib/cfb/found";
import { FOUND, FOUND_POLICY, STRAIGHT_POLICY, STRAIGHT_SINCE, foundFunOf, foundMaxLegs, isFoundDay, isStraightDay } from "@/lib/found-mode";
import { buildLockEntry } from "@/lib/server/lock-card";
import { assertAppendOnly } from "@/lib/append-only";
import { PaperBanner } from "@/components/ui/PaperBanner";

/**
 * STRAIGHT BETS ONLY (2026-10-06, Josh, verbatim in src/lib/found-mode.ts: "I want you to change all
 * sports on parlay tab to now only take +EV straight bets. Same rules apply with $2500 per day and can
 * only bet more if there is a win etc.").
 *
 * From STRAIGHT_SINCE every found pass on MLB, CFB and NFL seats one-leg bets only, adds no fun parlay,
 * and keeps everything already locked. Days before it keep the found rule they ran under. Prices are
 * the fixtures' own; no network is reached.
 */

// vitest compiles JSX with the classic runtime — the component output references a global React
(globalThis as { React?: typeof React }).React = React;
afterEach(() => vi.useRealTimers());

describe("straight-only — the date gate", () => {
  it("starts 2026-10-06 (today); 10-03..10-05 stay found days that may seat parlays", () => {
    expect(STRAIGHT_SINCE).toBe("2026-10-06");
    expect(isStraightDay("2026-10-05")).toBe(false);
    expect(isFoundDay("2026-10-05")).toBe(true);
    expect(isStraightDay("2026-10-06")).toBe(true);
    expect(isStraightDay("2026-10-20")).toBe(true);
    expect(isStraightDay(null)).toBe(false);
    expect(isStraightDay("10/06/2026")).toBe(false);
    expect(foundMaxLegs("2026-10-05")).toBe(FOUND.maxLegs);
    expect(foundMaxLegs("2026-10-06")).toBe(1);
    expect(foundFunOf("2026-10-05")).toBe(FOUND.fun);
    expect(foundFunOf("2026-10-06")).toBe(0);
    /* the money rule is untouched: $2,500 a day, $5–$800 whole-dollar Kelly */
    expect(FOUND.daily).toBe(2500);
  });
});

describe("straight-only — MLB", () => {
  async function build() {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FROZEN_NOW);
    const eng = armedFixtureEngine();
    const d = eng.analyze(await eng.collectSlate()) as unknown as Record<string, unknown>;
    /* the straight rows get the same +20-point test double as the pool (prices untouched) */
    const cats = (d.categories ?? {}) as Record<string, Array<Record<string, unknown>>>;
    for (const rows of Object.values(cats)) for (const r of rows ?? []) if (r && r.prob != null) r.prob = Math.min(97, Number(r.prob) + 20);
    return { eng, d };
  }
  /* the same TEST DOUBLE tests/found-mode.test.ts uses: model probability +20 points on the engine's pool
     (and here on every straight row) so the blended edge is positive; prices untouched */
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

  it("a straights-only day seats one-leg +EV bets only, no fun parlay; the day before may seat parlays", async () => {
    const { eng: raw, d } = await build();
    const eng = edged(raw);
    const before = buildLockEntry({ eng: eng as never, data: d, date: "2026-10-05", now: FROZEN_NOW, trigger: "test" });
    expect(before.core.some((t) => ((t.legs as unknown[]) ?? []).length > 1), "the fixture must offer a parlay, or the gate is untested").toBe(true);

    const e = buildLockEntry({ eng: eng as never, data: d, date: "2026-10-06", now: FROZEN_NOW, trigger: "test" });
    expect(e.selMode).toBe("found");
    expect(e.daily).toBe(2500);
    expect(e.core.length, "the fixture must seat a straight — an empty card is a vacuous green").toBeGreaterThan(0);
    for (const t of e.core) {
      expect((t.legs as unknown[]).length).toBe(1);
      expect(t.paperPolicy).toBe(STRAIGHT_POLICY);
      expect(Number(t.czEv)).toBeGreaterThan(0);
      expect(Number.isInteger(t.stake) && t.stake >= FOUND.minStake).toBe(true);
    }
    expect(e.core.reduce((a, t) => a + Number(t.stake), 0)).toBeLessThanOrEqual(FOUND.daily);
    expect(e.funT ?? []).toEqual([]);
  }, 180_000);

  it("today's parlays and fun locked before the switch ride through; later passes append straights only", async () => {
    const { eng: raw, d } = await build();
    const eng = edged(raw);
    /* a morning card locked under the parlay rule, carried onto 10-06 */
    const morning = buildLockEntry({ eng: eng as never, data: d, date: "2026-10-05", now: FROZEN_NOW, trigger: "morning" });
    const parlays = morning.core.filter((t) => ((t.legs as unknown[]) ?? []).length > 1).slice(0, 2);
    expect(parlays.length).toBeGreaterThan(0);
    const carry = { ...morning, date: "2026-10-06", core: parlays, funT: morning.funT, allocSum: parlays.reduce((a, t) => a + Number(t.stake), 0) };
    const e = buildLockEntry({ eng: eng as never, data: d, date: "2026-10-06", now: FROZEN_NOW + 60_000, trigger: "11am", carry: carry as never });
    expect(() => assertAppendOnly(carry as never, e as never, "straight-only carry")).not.toThrow();
    expect(e.core.slice(0, parlays.length)).toEqual(parlays);
    expect(e.funT).toEqual(morning.funT);
    for (const t of e.core.slice(parlays.length)) {
      expect((t.legs as unknown[]).length).toBe(1);
      expect(t.paperPolicy).toBe(STRAIGHT_POLICY);
    }
  }, 180_000);
});

describe("straight-only — football", () => {
  const redate = (x: unknown, map: Record<string, string>) => {
    let s = JSON.stringify(x);
    for (const [a, b] of Object.entries(map)) s = s.split(a).join(b);
    return JSON.parse(s);
  };
  const readFix = (dir: string, f: string, map: Record<string, string>) =>
    redate(swapSettleBook(JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", dir, f), "utf8"))), map);
  const DATE = "2026-10-10";
  const CMAP = { "2026-09-05": DATE, "2026-09-06": "2026-10-11", "20260905": "20261010" };
  const ESPN = readFix("cfb", "espn-scoreboard-2026-09-05.json", CMAP) as { events: unknown[] };
  const ODDS = readFix("cfb", "odds-ncaaf-2026-09-05.json", CMAP) as unknown[];
  const FPI = readFix("cfb", "espn-fpi.json", {}) as unknown;
  const now = Date.parse(`${DATE}T15:00:00Z`);
  const board = buildCfbBoard({ date: DATE, espnEvents: ESPN.events, oddsEvents: ODDS, fpi: FPI, now, bankroll: 2500 });

  it("a straights-only day plans singles and no fun; a parlay-era date keeps the found policy", () => {
    const oldBoard = { ...board, date: "2026-10-05" };
    /* MEASURED: under the 2.60 price cap this fixture offers no double at all, so the parlay-era date and the
       straight date see the same singles here — the leg cap itself is pinned by the MLB test above */
    expect(foundCandidates(CFB_LEAGUE, oldBoard, now).every((d) => d.legs.length <= 2)).toBe(true);
    expect(planFound(CFB_LEAGUE, oldBoard, null, now).tickets.every((t) => t.paperPolicy === FOUND_POLICY)).toBe(true);
    expect(foundCandidates(CFB_LEAGUE, board, now).every((d) => d.legs.length === 1)).toBe(true);

    const p = planFound(CFB_LEAGUE, board, null, now);
    expect(p.tickets.length).toBeGreaterThan(0);
    for (const t of p.tickets) {
      expect(t.legs.length).toBe(1);
      expect(t.paperPolicy).toBe(STRAIGHT_POLICY);
      expect(t.czEv).toBeGreaterThan(0);
    }
    expect(p.fun).toEqual([]);
    expect(p.funStake).toBe(0);
    expect(p.stake).toBeLessThanOrEqual(FOUND.daily);
  });

  it("the money guard refuses a straight-policy ticket with two legs", () => {
    const p = planFound(CFB_LEAGUE, board, null, now);
    const t = p.tickets[0];
    const card = { date: DATE, core: [t], funT: [], coreSum: t.stake, funSum: 0, noPlay: false, notes: [], benched: [] };
    expect(() => assertCardMoney(CFB_LEAGUE, card as never)).not.toThrow();
    const two = { ...card, core: [{ ...t, legs: [t.legs[0], { ...t.legs[0], gkey: "other" }] }] };
    expect(() => assertCardMoney(CFB_LEAGUE, two as never)).toThrow(/locked as a straight bet/);
  });
});

describe("straight-only — the banner", () => {
  it("a straights-only date says +EV straight bets; a found date before it keeps its line", () => {
    const now = renderToStaticMarkup(createElement(PaperBanner, { date: "2026-10-06" }));
    expect(now).toMatch(/\+EV straight bets/);
    expect(now).not.toMatch(/fun/);
    const before = renderToStaticMarkup(createElement(PaperBanner, { date: "2026-10-05" }));
    expect(before).not.toMatch(/straight bets/);
  });
});
