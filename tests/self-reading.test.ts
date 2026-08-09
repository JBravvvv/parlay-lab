import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildReading, buildReadingSafe, CHECKLIST, READING_KEY } from "@/lib/server/self-reading";
import type { SyncEntry } from "@/lib/ledger-merge";

/**
 * SELF-READING (2026-08-06, operator requirement: nothing waits on a human paste for
 * routine operation). The run that writes the board + locked card also writes the READING
 * — reading 31 applied, slate stamp echoed, structure mix, refusal statuses, M14 notes,
 * the single-vs-leg check, and Josh's checklist — to pl:reading:{date}, served by
 * /api/board beside the card. Empty-gate and reason days self-read the same way.
 *
 * RULES ENCODED HERE, red-first:
 *  - any check over an empty population DECLARES ITSELF in the output (vacuity rule);
 *  - the single-vs-leg impossible branch writes a LOUD flag into the artifact, and the
 *    builder NEVER throws for it (a reader reports; only writers throw);
 *  - a generator failure produces a PARTIAL with a named continuation, never nothing —
 *    no silent days extends to no unread days.
 *
 * OBSERVED RED FIRST: module-not-found before src/lib/server/self-reading.ts existed;
 * the mismatch plant and the poisoned-entry partial below.
 */

const NOW = Date.parse("2026-08-06T20:45:00Z");

function ticket(over: Partial<SyncEntry["core"][number]> = {}): SyncEntry["core"][number] {
  return {
    id: "t1",
    stake: 10,
    prob: 0.31,
    czDec: 4.1,
    czEv: 0.27,
    bsDec: 4.4,
    bsEv: 0.36,
    name: "PHI stack",
    type: "same-game",
    legs: [
      { lkey: "a|batter_hits|0.5", label: "A over", prop: "batter_hits", cz: 1.4 },
      { lkey: "b|batter_total_bases|1.5", label: "B over", prop: "batter_total_bases", cz: 1.9 },
    ],
    placed: null,
    actualStake: null,
    ...over,
  } as SyncEntry["core"][number];
}

function lockedEntry(core: SyncEntry["core"], over: Partial<SyncEntry> = {}): SyncEntry {
  return {
    date: "2026-08-06",
    locked: true,
    lockedAt: NOW,
    trigger: "header",
    source: "server-lock",
    selMode: "ev_gated",
    daily: 75,
    bankroll: 750,
    allocSum: core.reduce((s, t) => s + (t.stake ?? 0), 0),
    unallocated: 0,
    core,
    funT: [],
    games: { g1: { pk: 1, start: "2026-08-06T22:05:00Z" } },
    blockedReasons: { "ev below coreEvMin": 3 },
    ...over,
  } as SyncEntry;
}

describe("buildReading — the artifact analyzes itself", () => {
  it("full card: reading 31 fields, structure mix with stake shares, checklist verbatim, no false vacuity", () => {
    const single = ticket({ id: "s1", name: "C single", type: "single", stake: 5, czDec: 2.05, czEv: 0.04, legs: [{ lkey: "c|batter_home_runs|0.5", label: "C over", prop: "batter_home_runs", cz: 2.05 }] });
    const r = buildReading({ entry: lockedEntry([ticket(), single]), gen: { slate: { total: 11, started: 6, ready: 4, unstarted: 5 } } as never, date: "2026-08-06", now: NOW, kind: "fire" });
    expect(r.reading31).toMatchObject({ lockPresent: true, lockedTrue: true, sourceServerLock: true, trigger: "header", placedNullAll: true, actualStakeNullAll: true, daily: 75, emptyGate: false });
    expect(r.reading31.refusals.lockMaxAgeMin).toMatch(/n\/a/);
    expect(r.reading31.refusals.exposureCap).toMatch(/\$75/);
    expect(r.structureMix).toMatchObject({ singles: 1, parlays: 1, singleStake: 5, parlayStake: 10 });
    expect(r.structureMix.stakeShareSingles).toBeCloseTo(5 / 15, 10);
    expect(r.structureMix.allocatorOrder).toHaveLength(2);
    expect(r.singlesVsLeg).toMatchObject({ checked: 1, impossibleBranchFired: false });
    expect(r.slate).toEqual({ total: 11, started: 6, ready: 4, unstarted: 5 });
    expect(r.checklist).toBe(CHECKLIST);
    expect(JSON.stringify(r)).not.toMatch(/VACUOUS/);
  });

  it("PLANT — a single priced differently as a 1-leg ticket than its own leg: LOUD flag, never a throw", () => {
    const bad = ticket({ id: "s1", name: "D single", stake: 5, czDec: 2.1, legs: [{ lkey: "d|batter_hits|0.5", label: "D over", prop: "batter_hits", cz: 1.95 }] });
    const r = buildReading({ entry: lockedEntry([bad]), gen: null, date: "2026-08-06", now: NOW, kind: "fire" });
    expect(r.singlesVsLeg.impossibleBranchFired).toBe(true);
    expect(r.singlesVsLeg.mismatches).toEqual([{ name: "D single", ticketDec: 2.1, legCz: 1.95 }]);
    expect(JSON.stringify(r)).toMatch(/IMPOSSIBLE BRANCH/);
  });

  it("PRODUCTION REGRESSION (2026-08-09, the branch's first live fire was FALSE) — American leg odds are the same price, no fire", () => {
    // the real first live single: ticket czDec 1.6757, leg cz -148 (American) — −148 ≡ 1+100/148
    const ks = ticket({ id: "s1", name: "K's single", stake: 2, czDec: 1.6757, legs: [{ lkey: "p|pitcher_strikeouts|5.5", label: "P over", prop: "pitcher_strikeouts", cz: -148 }] });
    const r = buildReading({ entry: lockedEntry([ks]), gen: null, date: "2026-08-09", now: NOW, kind: "fire" });
    expect(r.singlesVsLeg.checked).toBe(1);
    expect(r.singlesVsLeg.impossibleBranchFired).toBe(false);
    expect(r.singlesVsLeg.mismatches).toEqual([]);
    // positive American converts too
    const ks2 = ticket({ id: "s2", name: "dog single", stake: 2, czDec: 2.4, legs: [{ lkey: "q|batter_hits|0.5", label: "Q over", prop: "batter_hits", cz: 140 }] });
    const r2 = buildReading({ entry: lockedEntry([ks2]), gen: null, date: "2026-08-09", now: NOW, kind: "fire" });
    expect(r2.singlesVsLeg.impossibleBranchFired).toBe(false);
    // a cz in no known unit is UNCHECKABLE, counted, never guessed
    const odd = ticket({ id: "s3", name: "odd single", stake: 2, czDec: 1.9, legs: [{ lkey: "r|batter_hits|0.5", label: "R over", prop: "batter_hits", cz: 60 }] });
    const r3 = buildReading({ entry: lockedEntry([odd]), gen: null, date: "2026-08-09", now: NOW, kind: "fire" });
    expect(r3.singlesVsLeg.uncheckable).toBe(1);
  });

  it("empty-gate day: every empty-population check declares itself VACUOUS; histogram echoed", () => {
    const r = buildReading({ entry: lockedEntry([], { note: "no-bet day" }), gen: null, date: "2026-08-06", now: NOW, kind: "fire" });
    expect(r.reading31.emptyGate).toBe(true);
    expect(r.reading31.blockedReasons).toEqual({ "ev below coreEvMin": 3 });
    expect(r.structureMix.vacuous).toMatch(/VACUOUS/);
    expect(r.singlesVsLeg.vacuous).toMatch(/VACUOUS/);
    expect(r.m14.vacuous).toMatch(/VACUOUS/);
  });

  it("a reader REPORTS violations, it does not throw: placed:true on a locked ticket reads as a named violation", () => {
    const r = buildReading({ entry: lockedEntry([ticket({ placed: true as never })]), gen: null, date: "2026-08-06", now: NOW, kind: "fire" });
    expect(r.reading31.placedNullAll).toBe(false);
    expect(r.reading31.violations.join(" ")).toMatch(/placed/);
  });

  it("PARTIAL — a poisoned entry yields a partial with a NAMED continuation, never nothing", () => {
    const poison = new Proxy({} as SyncEntry, { get() { throw new Error("poisoned"); } });
    const r = buildReadingSafe({ entry: poison, gen: null, date: "2026-08-06", now: NOW, kind: "fire" });
    expect(r.partial).toBe(true);
    expect(r.error).toMatch(/poisoned/);
    expect(r.continuation).toMatch(/self-check/);
  });

  it("READING_KEY namespaces per date", () => {
    expect(READING_KEY("2026-08-06")).toBe("pl:reading:2026-08-06");
  });
});

describe("the self-reading is wired — source scan, comment-stripped", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const read = (p: string) => strip(fs.readFileSync(path.join(process.cwd(), p), "utf8"));
  it("generate writes the reading after the lock; scheduler repairs a missing reading; board serves it", () => {
    const gen = read("app/api/generate/route.ts");
    expect(gen).toMatch(/writeReading\(/);
    const sched = read("app/api/scheduler/route.ts");
    expect(sched).toMatch(/readingExists|getReading/);
    expect(sched).toMatch(/writeReading\(/);
    const board = read("app/api/board/route.ts");
    expect(board).toMatch(/getReading\(/);
    expect(board).toMatch(/reading \}\)|reading\s*\}\)|, reading/);
  });
});
