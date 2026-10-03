/**
 * FOUND MODE — MLB + shared pieces (2026-10-03, Josh: "The engine should lock bets as it finds them … any
 * time it finds a bet or a parlay, it can add that to the daily card and lock that pick/parlay on it … You
 * can also increase the daily amount for each sport to $2500. Bets can be of any amount").
 *
 * New file, date-gated re-pins (the INSTRUCTION 72 precedent): every day before FOUND_SINCE keeps the pins
 * the existing suites hold; these pin the found branch only.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import React, { createElement } from "react";
import { FROZEN_NOW, armedFixtureEngine } from "./helpers/fixture-env";
import { stripComments } from "./helpers/source";
import { FOUND, FOUND_MAX_STAKE, FOUND_POLICY, FOUND_SINCE, foundRoom, foundStake, isFoundDay, kellyStar, pickFound } from "@/lib/found-mode";
import { PAPER, TOPUP_MAX, paperDaily } from "@/lib/paper-mode";
import { buildLockEntry } from "@/lib/server/lock-card";
import { decideTopUp } from "@/lib/server/blocks";
import { assertAppendOnly } from "@/lib/append-only";
import { validateLedger } from "@/lib/ledger-merge";
import { PaperBanner } from "@/components/ui/PaperBanner";

// vitest compiles JSX with the classic runtime — the component output references a global React
(globalThis as { React?: typeof React }).React = React;
const read = (p: string) => readFileSync(p, "utf8");
afterEach(() => vi.useRealTimers());

describe("found-mode — the rule's numbers", () => {
  /* RE-PINNED 2026-10-03 (Josh: "No. Lock the $350 today as well as any other locked parlays then
     increase the max for all sports to $2500") — found mode starts TODAY, Saturday 10-03 */
  it("starts Saturday 2026-10-03 (today) at $2,500 a day per sport, $25 fun, stakes $5–$800", () => {
    expect(FOUND_SINCE).toBe("2026-10-03");
    expect(FOUND.daily).toBe(2500);
    expect(FOUND.fun).toBe(25);
    expect(FOUND.minStake).toBe(5);
    expect(FOUND_MAX_STAKE).toBe(800);
    expect(FOUND_POLICY).toBe("found-v1");
  });
  it("isFoundDay is a date gate — Friday 10-02 and every earlier day keep their old rules", () => {
    expect(isFoundDay("2026-10-02")).toBe(false);
    expect(isFoundDay("2026-10-03")).toBe(true);
    expect(isFoundDay("2026-10-04")).toBe(true);
    expect(isFoundDay("2027-04-01")).toBe(true);
    expect(isFoundDay(null)).toBe(false);
    expect(isFoundDay("10/04/2026")).toBe(false);
  });
  it("paperDaily: $2,500 from the found day, the old ceilings before it", () => {
    expect(paperDaily("2026-10-04")).toBe(2500);
    expect(paperDaily("2026-10-03")).toBe(2500);
    expect(paperDaily("2026-10-02")).toBe(PAPER.daily);
    expect(paperDaily("2026-09-17")).toBe(PAPER.dailyBefore);
  });
  it("kellyStar / foundStake: whole dollars, floor $5, cap $800, trimmed to the room", () => {
    expect(kellyStar(0.5, 2)).toBe(0);
    expect(kellyStar(0.6, 2)).toBeCloseTo(0.2, 10);
    expect(foundStake(0.5, 2, 2500)).toBe(0); // no edge
    expect(foundStake(0.6, 2, 2500)).toBe(800); // ¼·0.2 = 5% → capped at 2% → 4 × $10,000 × 2%
    expect(foundStake(0.6, 2, 300.7)).toBe(300); // trimmed to the room, floored
    expect(foundStake(0.6, 2, 4)).toBe(0); // under the floor
    const small = foundStake(0.505, 2, 2500); // f* = 0.01 → round(40000 × 0.0025) = 100
    expect(small).toBe(100);
    expect(Number.isInteger(foundStake(0.53, 1.95, 2500))).toBe(true);
  });
  it("foundRoom / pickFound: the ceiling is never crossed and a refused candidate is skipped, not forced", () => {
    expect(foundRoom([500, "300", null, undefined])).toBe(1700);
    expect(foundRoom([2000, 900])).toBe(0);
    const taken: number[] = [];
    const r = pickFound([800, 800, 3, 800, 800], { room: 2000, stakeOf: (c, room) => Math.min(c, Math.floor(room)), admit: (c) => c !== 3, commit: (c) => void taken.push(c) });
    expect(r.picks.map((p) => p.stake)).toEqual([800, 800, 400]);
    expect(r.room).toBe(0);
  });
});

describe("found-mode — the MLB card builder on the armed fixture", () => {
  async function build(date: string) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FROZEN_NOW);
    const eng = armedFixtureEngine();
    const d = eng.analyze(await eng.collectSlate()) as unknown as Record<string, unknown>;
    return { eng, d };
  }

  /* MEASURED: the July fixture's own prices carry no edge after the 0.5 market blend (found_no_edge 90 of
     113, zero seated) — itself the correct outcome, pinned below. The mechanics test therefore runs over a
     TEST DOUBLE: the engine's card pool with each ticket's model probability raised 20 points, so the
     blended edge is positive and the builder has something to seat. Prices are untouched. */
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

  it("the fixture's own prices: no blended edge → nothing seated, the run says so", async () => {
    const { eng, d } = await build("2026-10-04");
    const e = buildLockEntry({ eng: eng as never, data: d, date: "2026-10-04", now: FROZEN_NOW, trigger: "test" });
    expect(e.core.length).toBe(0);
    expect(String(e.note)).toContain("found no new bet");
    expect(Number((e.blockedReasons as Record<string, number>).found_no_edge)).toBeGreaterThan(0);
  }, 120_000);

  it("a found day locks every qualifying bet with Kelly stakes inside the ceiling; a second pass only appends", async () => {
    const { eng: raw, d } = await build("2026-10-04");
    const eng = edged(raw);
    const e1 = buildLockEntry({ eng: eng as never, data: d, date: "2026-10-04", now: FROZEN_NOW, trigger: "test" });
    expect(validateLedger([e1 as never]).ok ?? true).toBeTruthy();
    expect(e1.selMode).toBe("found");
    expect(e1.daily).toBe(2500);
    expect(e1.core.length, "the fixture must seat something — an empty card is a vacuous green").toBeGreaterThan(0);
    const sum = e1.core.reduce((a, t) => a + Number(t.stake), 0);
    expect(sum).toBeLessThanOrEqual(FOUND.daily);
    const legKeys = new Set<string>();
    for (const t of e1.core) {
      expect(Number.isInteger(t.stake)).toBe(true);
      expect(t.stake).toBeGreaterThanOrEqual(FOUND.minStake);
      expect(t.stake).toBeLessThanOrEqual(FOUND_MAX_STAKE);
      expect(t.found).toBe(true);
      expect(t.paperPolicy).toBe(FOUND_POLICY);
      expect(Number(t.czEv)).toBeGreaterThan(0);
      for (const l of t.legs as { label: string; prop: string }[]) {
        const k = `${l.label}|${l.prop}`;
        expect(legKeys.has(k), `leg ${k} repeated`).toBe(false);
        legKeys.add(k);
        expect(String(l.prop)).not.toMatch(/home run/i);
      }
    }
    const funSum = (e1.funT ?? []).reduce((a, t) => a + Number(t.stake), 0);
    expect(funSum).toBeLessThanOrEqual(FOUND.fun);

    const e2 = buildLockEntry({ eng: eng as never, data: d, date: "2026-10-04", now: FROZEN_NOW + 60_000, trigger: "test-2", carry: e1 });
    expect(() => assertAppendOnly(e1 as never, e2 as never, "found second pass")).not.toThrow();
    expect(e2.core.slice(0, e1.core.length)).toEqual(e1.core);
    expect(new Set(e2.core.map((t) => t.id)).size).toBe(e2.core.length);
    expect(e2.core.reduce((a, t) => a + Number(t.stake), 0)).toBeLessThanOrEqual(FOUND.daily);
  }, 120_000);

  /* 2026-10-03 (Josh: "Lock the $350 today as well as any other locked parlays then increase the max for
     all sports to $2500 … If a bet wins … that is added on top"): today's shaped morning card is the
     carry — the found pass appends to it, keeps every carried ticket as it was, and a win widens the room */
  it("today: a carried pre-found shaped card is kept whole, found bets append, and the day's win widens the ceiling", async () => {
    const { eng: raw, d } = await build("2026-10-03");
    const eng = edged(raw);
    /* the morning card's stand-in: four real fixture tickets, re-staked to today's $170 shape (50/50/40/30)
       and stripped of the found stamp — the same carry shape the 08:00 shaped lock left on the day */
    const seed = buildLockEntry({ eng: eng as never, data: d, date: "2026-10-04", now: FROZEN_NOW, trigger: "seed" });
    expect(seed.core.length, "the fixture must seat four tickets to stand in for the morning card").toBeGreaterThanOrEqual(4);
    const redated = JSON.parse(JSON.stringify(seed).split("2026-10-04").join("2026-10-03"));
    const core = redated.core.slice(0, 4).map((t: Record<string, unknown>, i: number) => {
      const { found: _f, ...rest } = t;
      return { ...rest, id: `2026-10-03-core-${i + 1}`, stake: [50, 50, 40, 30][i] };
    });
    const carry = { ...redated, selMode: "shaped", core, funT: [], allocSum: 350, slotUnderSum: 180, unallocated: undefined, note: "shaped $350 morning card" };
    const carriedSum = 170;
    const e = buildLockEntry({ eng: eng as never, data: d, date: "2026-10-03", now: FROZEN_NOW + 60_000, trigger: "found-1", carry, foundWonBy: { "2026-10-03-core-1": 300, "not-on-the-card": 999 } });
    expect(e.selMode).toBe("found");
    expect(() => assertAppendOnly(carry as never, e as never, "found over the shaped card")).not.toThrow();
    expect(e.core.slice(0, carry.core.length)).toEqual(carry.core);
    expect(e.core.length).toBeGreaterThan(carry.core.length);
    const total = e.core.reduce((a, t) => a + Number(t.stake), 0);
    expect(total).toBeLessThanOrEqual(FOUND.daily + 300);
    expect((e as { foundWonBy?: unknown }).foundWonBy).toEqual({ "2026-10-03-core-1": 300 });
    expect(e.daily).toBe(FOUND.daily);
    expect(Number(e.unallocated)).toBeCloseTo(Math.max(0, FOUND.daily + 300 - total), 6);
    for (const t of e.core.slice(carry.core.length)) {
      expect(t.found).toBe(true);
      expect(Number.isInteger(t.stake)).toBe(true);
    }
    expect(carry.core.reduce((a: number, t: { stake: number }) => a + Number(t.stake), 0)).toBe(carriedSum);
    expect(Number(e.allocSum)).toBe(total);
    // no leg of the morning card is bet twice
    const keys = e.core.flatMap((t) => (t.legs as { label: string; prop: string }[]).map((l) => `${l.label}|${l.prop}`));
    expect(new Set(keys).size).toBe(keys.length);
  }, 120_000);

  it("a day before FOUND_SINCE still runs the old shaped builder", async () => {
    const { eng, d } = await build("2026-10-03");
    const e = buildLockEntry({ eng: eng as never, data: d, date: "2026-07-10", now: FROZEN_NOW, trigger: "test" });
    expect(e.selMode).not.toBe("found");
    for (const t of e.core) expect(t.found).toBeUndefined();
  }, 120_000);
});

describe("found-mode — decideTopUp's found branch", () => {
  const now = Date.parse("2026-10-04T16:00:00Z");
  const base = { blocks: [], starts: [now + 3_600_000], now, daily: 2500, max: TOPUP_MAX, date: "2026-10-04" };
  it("fires with no attempt cap while money is open and a game is ahead", () => {
    const registry = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`topup-${i + 1}`, { slot: "manual" }])) as never;
    const r = decideTopUp({ ...base, entry: { paper: true, date: "2026-10-04", allocSum: 400 }, registry, slot: "manual" });
    expect(r.fire).toBe(true);
    expect(r.owed).toBe(2100);
  });
  it("fires with no entry yet — the first pass that finds something creates the day", () => {
    expect(decideTopUp({ ...base, entry: null, registry: null, slot: "08:00" }).fire).toBe(true);
  });
  it("refuses once every game started, and a named slot that already ran", () => {
    expect(decideTopUp({ ...base, starts: [now - 1], entry: null, registry: null, slot: "manual" }).fire).toBe(false);
    expect(decideTopUp({ ...base, entry: null, registry: { "topup-1": { slot: "08:00" } } as never, slot: "08:00" }).fire).toBe(false);
  });
});

describe("found-mode — server wiring (source pins)", () => {
  const gen = stripComments(read("app/api/generate/route.ts"));
  const sched = stripComments(read("app/api/scheduler/route.ts"));
  it("GEN: no attempt cap on a found day, one run at a time on the day's card, the lease always released", () => {
    expect(gen).toContain("if (used >= TOPUP_MAX && !isFoundDay(dateNow)) {");
    expect(gen).toMatch(/foundLease = await takeFoundLease\(date, "gen", now\);\s*if \(!foundLease\) \{\s*throw new Error\("FOUND LEASE HELD/);
    /* released in the finally, and only when the stored token is still this run's (src/lib/server/found-lease.ts) */
    expect(gen).toMatch(/finally \{\s*await releaseFoundLease\(date, foundLease\);/);
    const fl = stripComments(read("src/lib/server/found-lease.ts"));
    expect(fl).toContain("`pl:found:lease:${date}`");
    expect(fl).toContain('redis(["SET", foundLeaseKey(date), token, "NX", "PX", String(FOUND_LEASE_PX)])');
    expect(fl).toContain('if ((await redis(["GET", key])) === token) await redis(["DEL", key]);');
    expect(fl).toContain("FOUND_LEASE_PX = 300_000");
  });
  it("scheduler backfill: a found day waits for a board priced inside 30 minutes and takes the same lease", () => {
    expect(sched).toContain('action === "backfill" && board && isFoundDay(date)');
    expect(sched).toMatch(/ageMin > 30/);
    expect(sched).toContain('action: "found-wait"');
    /* the same lease, re-read under it, and released on every exit (a throw included), token-checked */
    expect(sched).toMatch(/else if \(!\(foundToken = await takeFoundLease\(date, "sched", now\)\)\) foundHold =/);
    expect(sched).toMatch(/else \{\s*if \(await lockExists\(date\)\) foundHold =/);
    expect(sched).toMatch(/\} finally \{\s*await releaseFoundLease\(date, foundToken\);/);
  });
  it("found fun holds the HR rule: O 0.5 only", () => {
    const lc = stripComments(read("src/lib/server/lock-card.ts"));
    expect(lc).toContain('const funPool = catRows("batter_home_runs").filter((r) => pregame(r) && /\\bO 0\\.5$/.test(String(r.sub ?? ""))).map(toSrc);');
  });
  it("the Builder's manual lock refuses and hides on a found day", () => {
    const b = stripComments(read("app/builder/page.tsx"));
    expect(b).toMatch(/!locked && !foundToday && \(/);
    /* today is read after mount only — a static render (next build prerenders /builder) never touches window */
    expect(b).toContain("const foundToday = isFoundDay(ptToday);");
    expect(b).toContain("<PaperBanner date={ptToday} />");
    expect(stripComments(read("app/ledger/page.tsx"))).toContain("<PaperBanner date={ptToday} />");
    expect(b).toContain("Bets lock on their own as the engine finds them");
    const cfb = stripComments(read("src/components/cfb/CfbBuilder.tsx"));
    expect(cfb).toContain('data-testid="cfb-found-note"');
    expect(cfb).toMatch(/if \(found\) \{\s*setStatus\(/);
    expect(stripComments(read("src/lib/football/store.ts"))).toMatch(/if \(isFoundDay\(card\.date\)\) throw new Error/);
  });
});

describe("found-mode — PaperBanner", () => {
  it("a found date shows the $2,500 ceiling; an earlier date keeps the old line", () => {
    const f = renderToStaticMarkup(createElement(PaperBanner, { date: "2026-10-03" }));
    expect(f).toMatch(/hypothetical \$2500\/day \+ that day(&#x27;|')s wins · nothing is real money/);
    expect(f).toMatch(/plus whatever that day(&#x27;|')s bets win, since 2026-10-03/);
    expect(f).toContain("locked bet by bet as the engine finds them all day");
    /* no date = the static/first render: the pre-found line, never a baked-in build day */
    expect(renderToStaticMarkup(createElement(PaperBanner))).not.toContain("locked bet by bet");
    const old = renderToStaticMarkup(createElement(PaperBanner, { date: "2026-10-02" }));
    expect(old).not.toContain("locked bet by bet");
    expect(old).toMatch(/\$350\/day/);
  });
});
