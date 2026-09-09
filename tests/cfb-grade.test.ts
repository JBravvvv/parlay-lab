import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CFB_UNGRADABLE_MS, gradeCfbEntry, gradeCfbLeg } from "@/lib/cfb/grade";
import { cfbBankroll, cfbExposureOn, cfbLedgerStats, lockCfbCard, validateCfbLedger } from "@/lib/cfb/ledger";
import { buildCfbBoard } from "@/lib/cfb/model";
import { buildCfbCard } from "@/lib/cfb/card";
import { CFB_BANK_BASE, CFB_PAPER, CFB_RULES, CFB_SETTLE, CFB_VOID_RECHECK_MS } from "@/lib/cfb/rules";
import { applyCfbTopUp, assertCfbEntryMoney, buildCfbLockEntry, buildCfbSweepEntry, cfbSettleCandidate, cfbSettleReady, decideCfbTopUp, overlayCfbGrading, planCfbTopUp } from "@/lib/cfb/lock-server";
import type { CfbTopUpPlan } from "@/lib/cfb/lock-server";
import { mergeLedgers } from "@/lib/ledger-merge";
import type { SyncEntry } from "@/lib/ledger-merge";
import { stripComments } from "./helpers/source";
import type { CfbFinals, CfbLedgerEntry, CfbTicket, CfbTicketLeg } from "@/lib/cfb/types";

/**
 * CFB GRADING + THE PURE LEDGER (INSTRUCTION 38, 2026-09-05). Legs settle the way the book
 * settles them; a ticket wins only when every non-push leg wins; a pushed leg drops out of
 * the payout; every leg pushing returns the stake. The scores in this file are SYNTHETIC
 * test inputs — none is a claim about a real result.
 */

const leg = (over: Partial<CfbTicketLeg>): CfbTicketLeg => {
  const base: CfbTicketLeg = {
    label: "Indiana -40.5",
    prop: "Spread",
    cz: -110,
    gkey: "401858425",
    lkey: "",
    market: "spread",
    side: "home",
    line: -40.5,
    teamId: "84",
    prob: 0.5,
    push: 0,
    ...over,
  };
  // the row key the board would have given this side — distinct per game / market / side / line
  return { ...base, lkey: over.lkey ?? `${base.gkey}|${base.market}|${base.side}|${base.line ?? ""}` };
};
const fin = (home: number, away: number, final = true, status: CfbFinals[string]["status"] = "final"): CfbFinals[string] => ({ home, away, final, status });

describe("gradeCfbLeg", () => {
  it("moneyline: winner by score; a tie pushes", () => {
    expect(gradeCfbLeg(leg({ market: "ml", side: "home", line: null }), fin(31, 17)).result).toBe("won");
    expect(gradeCfbLeg(leg({ market: "ml", side: "home", line: null }), fin(17, 31)).result).toBe("lost");
    expect(gradeCfbLeg(leg({ market: "ml", side: "away", line: null }), fin(17, 31)).result).toBe("won");
    expect(gradeCfbLeg(leg({ market: "ml", side: "away", line: null }), fin(31, 17)).result).toBe("lost");
    expect(gradeCfbLeg(leg({ market: "ml", side: "home", line: null }), fin(21, 21)).result).toBe("push");
    expect(gradeCfbLeg(leg({ market: "ml", side: "home", line: null }), fin(31, 17)).detail).toBe("31-17 · won by 14");
  });
  it("spread: side margin + line > 0 won, = 0 push, < 0 lost — both sides, both signs", () => {
    expect(gradeCfbLeg(leg({ side: "home", line: -40.5 }), fin(52, 7)).result).toBe("won"); // 45 − 40.5 = +4.5
    expect(gradeCfbLeg(leg({ side: "home", line: -40.5 }), fin(45, 7)).result).toBe("lost"); // 38 − 40.5 = −2.5
    expect(gradeCfbLeg(leg({ side: "home", line: -40 }), fin(47, 7)).result).toBe("push"); // 40 − 40 = 0
    expect(gradeCfbLeg(leg({ side: "away", line: 40.5 }), fin(45, 7)).result).toBe("won"); // −38 + 40.5 = +2.5
    expect(gradeCfbLeg(leg({ side: "away", line: 40.5 }), fin(52, 7)).result).toBe("lost");
    expect(gradeCfbLeg(leg({ side: "away", line: 40 }), fin(47, 7)).result).toBe("push");
    expect(gradeCfbLeg(leg({ side: "away", line: -3 }), fin(20, 24)).result).toBe("won"); // away favorite: −(−4) − 3 = +1
    expect(gradeCfbLeg(leg({ side: "home", line: -40.5 }), fin(52, 7)).detail).toBe("52-7 · margin +45 vs -40.5 · covered by 4.5");
  });
  it("total: sum vs the number, over and under, push on the number", () => {
    expect(gradeCfbLeg(leg({ market: "total", side: "over", line: 56.5 }), fin(35, 24)).result).toBe("won"); // 59
    expect(gradeCfbLeg(leg({ market: "total", side: "over", line: 56.5 }), fin(28, 24)).result).toBe("lost"); // 52
    expect(gradeCfbLeg(leg({ market: "total", side: "under", line: 56.5 }), fin(28, 24)).result).toBe("won");
    expect(gradeCfbLeg(leg({ market: "total", side: "under", line: 56.5 }), fin(35, 24)).result).toBe("lost");
    expect(gradeCfbLeg(leg({ market: "total", side: "over", line: 56 }), fin(35, 21)).result).toBe("push");
    expect(gradeCfbLeg(leg({ market: "total", side: "under", line: 56 }), fin(35, 21)).result).toBe("push");
  });
  it("pending while the game is not final or has no entry; a spread/total leg without a line is ungradable", () => {
    expect(gradeCfbLeg(leg({}), undefined).result).toBe("pending");
    expect(gradeCfbLeg(leg({}), fin(14, 7, false, "live")).result).toBe("pending");
    expect(gradeCfbLeg(leg({}), fin(0, 0, false, "postponed")).detail).toBe("postponed");
    expect(gradeCfbLeg(leg({ line: null }), fin(52, 7)).result).toBe("ungradable");
    expect(gradeCfbLeg(leg({ market: "total", side: "over", line: null }), fin(52, 7)).result).toBe("ungradable");
  });
});

/* ---------- entries ---------- */

const ticket = (id: string, stake: number, legs: CfbTicketLeg[], bucket: "core" | "fun" = "core"): CfbTicket => {
  const dec = legs.reduce((d, l) => d * (l.cz > 0 ? 1 + l.cz / 100 : 1 + 100 / -l.cz), 1);
  return { id, bucket, name: legs.map((l) => l.label).join(" + "), stake, czOdds: -110, czDec: dec, prob: 50, czEv: 2, legs };
};
const entry = (core: CfbTicket[], funT: CfbTicket[] = [], games: CfbLedgerEntry["games"] = {}): CfbLedgerEntry => ({
  sport: "cfb",
  date: "2026-09-05",
  locked: true,
  daily: 150,
  fun: 25,
  core,
  funT,
  lockedAt: Date.parse("2026-09-05T12:00:00Z"),
  games,
  grading: null,
});
const G1 = "401858425"; // IU host
const G2 = "401856634"; // ALA host
const GAMES: CfbLedgerEntry["games"] = {
  [G1]: { pk: 401858425, start: "2026-09-05T16:00Z", home: "Indiana Hoosiers", away: "North Texas Mean Green" },
  [G2]: { pk: 401856634, start: "2026-09-05T16:00Z", home: "Alabama Crimson Tide", away: "East Carolina Pirates" },
};
const AFTER = Date.parse("2026-09-05T23:00:00Z"); // the same evening — inside the 48 h window

describe("gradeCfbEntry", () => {
  it("a single at −110: won pays stake × 1.9091; lost pays 0; push returns the stake", () => {
    const e = entry([ticket("t1", 25, [leg({ gkey: G1, side: "home", line: -40.5, cz: -110 })])], [], GAMES);
    const won = gradeCfbEntry(e, { [G1]: fin(52, 7) }, AFTER);
    expect(won.tickets.t1).toMatchObject({ result: "won", payout: 47.73, dec: 1.9091 });
    expect(won.legs[e.core[0].legs[0].lkey].result).toBe("won");
    expect(won.done).toBe(true);
    const lost = gradeCfbEntry(e, { [G1]: fin(45, 7) }, AFTER);
    expect(lost.tickets.t1).toMatchObject({ result: "lost", payout: 0 });
    const e40 = entry([ticket("t1", 25, [leg({ gkey: G1, side: "home", line: -40, cz: -110 })])], [], GAMES);
    const push = gradeCfbEntry(e40, { [G1]: fin(47, 7) }, AFTER);
    expect(push.tickets.t1).toMatchObject({ result: "push", payout: 25 });
    expect(push.done).toBe(true);
  });
  it("a double: both won → stake × dec₁ × dec₂; one lost → lost even with the other pending", () => {
    const legs = [leg({ gkey: G1, side: "home", line: -40.5, cz: -104 }), leg({ gkey: G2, side: "away", line: 28, cz: -106, label: "East Carolina +28" })];
    const e = entry([ticket("d1", 10, legs)], [], GAMES);
    const both = gradeCfbEntry(e, { [G1]: fin(52, 7), [G2]: fin(35, 10) }, AFTER);
    // 10 × 1.9615385 × 1.9433962 = 38.12
    expect(both.tickets.d1).toMatchObject({ result: "won", payout: 38.12 });
    const oneLost = gradeCfbEntry(e, { [G1]: fin(45, 7), [G2]: fin(14, 10, false, "live") }, AFTER);
    expect(oneLost.tickets.d1.result).toBe("lost");
    expect(oneLost.done).toBe(true); // a lost ticket is settled even while its other game runs
    const pending = gradeCfbEntry(e, { [G1]: fin(52, 7) }, AFTER);
    expect(pending.tickets.d1.result).toBe("pending");
    expect(pending.done).toBe(false);
  });
  it("a parlay with one push: the pushed leg drops out, the rest pays", () => {
    const legs = [leg({ gkey: G1, side: "home", line: -40, cz: -110 }), leg({ gkey: G2, side: "away", line: 28, cz: -106, label: "East Carolina +28" })];
    const e = entry([ticket("p1", 20, legs)], [], GAMES);
    const g = gradeCfbEntry(e, { [G1]: fin(47, 7), [G2]: fin(35, 10) }, AFTER);
    expect(g.legs[legs[0].lkey].result).toBe("push");
    expect(g.legs[legs[1].lkey].result).toBe("won");
    // 20 × 1.9433962 = 38.87 — the −110 leg contributes nothing
    expect(g.tickets.p1).toMatchObject({ result: "won", payout: 38.87, dec: 1.9434 });
    expect(g.tickets.p1.detail).toContain("1 leg pushed");
  });
  it("every leg pushing → push, payout = stake", () => {
    const legs = [leg({ gkey: G1, side: "home", line: -40, cz: -110 }), leg({ gkey: G2, side: "away", line: 28, cz: -106 })];
    const e = entry([ticket("pp", 20, legs)], [], GAMES);
    const g = gradeCfbEntry(e, { [G1]: fin(47, 7), [G2]: fin(38, 10) }, AFTER);
    expect(g.tickets.pp).toMatchObject({ result: "push", payout: 20 });
  });
  it("ungradable: a leg still pending more than 48 h after kickoff — missing, postponed, live or upcoming; pending before that", () => {
    const e = entry([ticket("u1", 10, [leg({ gkey: G1 })])], [], GAMES);
    const soon = gradeCfbEntry(e, {}, Date.parse("2026-09-07T15:59:00Z"));
    expect(soon.tickets.u1.result).toBe("pending");
    expect(soon.done).toBe(false);
    const late = gradeCfbEntry(e, {}, Date.parse("2026-09-05T16:00Z") + CFB_UNGRADABLE_MS + 60_000);
    expect(late.tickets.u1).toMatchObject({ result: "ungradable", payout: 0 });
    expect(late.legs[e.core[0].legs[0].lkey].result).toBe("ungradable");
    expect(late.done).toBe(true);
    /**
     * PIN REWRITTEN 2026-09-06 (INSTRUCTION 45, DEFECT I(a)) — the behaviour it encoded was
     * deliberately changed, and this file is the only place that held the old rule.
     *
     *   BEFORE: a postponed game 56 h past kickoff was `ungradable`, and a game ESPN still
     *           called `live` at the same instant was pinned `pending` — with the comment "a
     *           merely late final is not [void]".
     *   AFTER:  BOTH are `ungradable`. The escalation is the 48-hour clock, not the status ESPN
     *           last reported.
     *
     * WHY. The old gate read `!finals[gkey] || status === "postponed"`, so of the four values of
     * `CfbStatus` it ignored the two that are also terminal in practice: ESPN parks a
     * lightning-suspended or abandoned game at `live` (it is present in the finals map, and it is
     * not postponed), and a game rescheduled off the date can sit at `upcoming`. MEASURED on the
     * server rail: such a date graded `pending` at kickoff + 30 days, never reached `done`, stayed
     * a settle candidate for ever, and two of them consumed the whole CFB_SETTLE.maxDatesPerPoke
     * budget on every poke — so newer dates were deferred indefinitely and their realized P/L
     * never reached cfbBankroll. "Live 56 hours after kickoff" is not a game in progress; it is a
     * game nothing will ever score, which is exactly what a void is for.
     *
     * The half of the old pin that was really load-bearing — that the wait is not shortened —
     * stands directly above (`soon`, at 47 h 59 m, is still pending) and is restated here.
     */
    const post = gradeCfbEntry(e, { [G1]: fin(0, 0, false, "postponed") }, Date.parse("2026-09-08T00:00Z"));
    expect(post.tickets.u1.result).toBe("ungradable");
    const live = gradeCfbEntry(e, { [G1]: fin(14, 7, false, "live") }, Date.parse("2026-09-08T00:00Z"));
    expect(live.tickets.u1.result).toBe("ungradable");
    const up = gradeCfbEntry(e, { [G1]: fin(0, 0, false, "upcoming") }, Date.parse("2026-09-08T00:00Z"));
    expect(up.tickets.u1.result).toBe("ungradable");
    // ...and INSIDE the window a live game is still honestly pending — the clock is the rule
    const stillOn = gradeCfbEntry(e, { [G1]: fin(14, 7, false, "live") }, Date.parse("2026-09-07T15:59:00Z"));
    expect(stillOn.tickets.u1.result).toBe("pending");
    expect(stillOn.done).toBe(false);
  });
  /**
   * DEFECT S1 (2026-09-06) — the premise the server's void window rests on, pinned HERE because
   * this is the file that owns the escalation.
   *
   * The 48-hour escalation fires on a leg that is STILL `pending`. A leg whose game has finalised
   * is never pending, so a final that lands 50 hours after kickoff — the weather-suspended game
   * resumed two days later — grades to its REAL result at any distance past the window, exactly
   * as it would have on the night. Nothing about the clock overrides a score.
   *
   * That is what makes the void PROVISIONAL rather than a guess the desk is stuck with: the honest
   * verdict is available whenever anything asks for it. What was missing was anything asking —
   * `cfbSettleCandidate` (src/lib/cfb/lock-server.ts) refused a date the moment a void made it
   * `done`, which CFB_VOID_RECHECK_MS now bounds.
   */
  it("a final that lands 50 h after kickoff still grades to its real result — the escalation only fires on a leg still PENDING", () => {
    const e = entry([ticket("late", 10, [leg({ gkey: G1, side: "home", line: -40.5, cz: -110 })])], [], GAMES);
    const at50h = Date.parse("2026-09-05T16:00Z") + 50 * 3600_000;
    expect(at50h - Date.parse("2026-09-05T16:00Z")).toBeGreaterThan(CFB_UNGRADABLE_MS);
    // while it was unfinalised at that same instant it was a void...
    expect(gradeCfbEntry(e, { [G1]: fin(14, 7, false, "live") }, at50h).tickets.late.result).toBe("ungradable");
    // ...and the moment the real final exists, it is graded from the final
    const won = gradeCfbEntry(e, { [G1]: fin(52, 7) }, at50h);
    expect(won.tickets.late).toMatchObject({ result: "won", payout: 19.09 }); // 10 × 1.9091, the −110 decimal
    expect(won.legs[e.core[0].legs[0].lkey].detail).not.toMatch(/48h past kickoff/);
    expect(won.done).toBe(true);
    const lost = gradeCfbEntry(e, { [G1]: fin(45, 7) }, at50h);
    expect(lost.tickets.late).toMatchObject({ result: "lost", payout: 0 });
  });
  /**
   * DEFECT C1 (INSTRUCTION 45, 2026-09-06) — the regression the 48-hour widening left behind, and
   * the reason the two windows are not the same length.
   *
   * `gradeCfbLeg` has a fourth pending arm nobody re-read when DEFECT I(a) widened the escalation:
   * a game whose `final` is TRUE but whose `Number(home)` / `Number(away)` are not finite returns
   * `{ result: "pending", detail: "score unavailable" }`. Under the OLD gate — absent OR postponed
   * — such a leg simply stayed pending and was re-graded on the next poke. Under the widened gate
   * it is a `pending` leg past 48 h like any other, so it voids; `settle` makes the whole ticket
   * ungradable, `done` flips true, and `ticketPL` (src/lib/bankroll.ts) books the stake at 0.
   *
   * That is the one case where the clock is wrong about the world. "Not final" means nothing has
   * happened yet and the 48-hour void is the honest verdict. "Final, score unreadable" means the
   * RESULT EXISTS and only our read of it failed, so voiding at 48 h throws away a real P/L: the
   * server keeps a voided date readable for CFB_VOID_RECHECK_MS (`cfbSettleCandidate` in
   * src/lib/cfb/lock-server.ts) but the device path never revisits it at all — `gradeCfbPending`
   * in src/components/cfb/CfbLedger.tsx filters `!e.grading?.done` — so a $25 core ticket on a game ESPN only
   * publishes correctly on day 8 is scored $0 for ever, and cfbBankroll, which Kelly-sizes every
   * later day, stays low by that amount permanently.
   *
   * So the final-but-unreadable leg gets the LONGER window the server already holds the date open
   * for. It still terminates — nothing here is unbounded — but only once the recheck window that
   * bounds the whole void mechanism has closed. Every other pending shape keeps the 48 hours.
   */
  it("C1: a game that IS final but whose score is unreadable waits the full void-recheck window, not 48 h", () => {
    const e = entry([ticket("u2", 25, [leg({ gkey: G1, side: "home", line: -40.5, cz: -110 })])], [], GAMES);
    const K = Date.parse("2026-09-05T16:00Z");
    const lkey = e.core[0].legs[0].lkey;
    expect(CFB_VOID_RECHECK_MS).toBeGreaterThan(CFB_UNGRADABLE_MS);
    /**
     * ESPN serving a completed game with the scores still missing — `final` true, scores
     * unreadable. MEASURED WHILE WRITING THIS PIN: the obvious fixture `{ home: null }` does NOT
     * reach the arm under test. `gradeCfbLeg` tests `Number.isFinite(Number(f.home))` and
     * `Number(null)` is 0, so a null-scored final grades as a real 0-0 game — the first red this
     * test produced was `{ result: "lost", detail: "0-0 · margin 0 vs -40.5 · short by 40.5" }`.
     * The unreadable shapes are the ones that make `Number` return NaN: a missing property, or a
     * non-numeric string like ESPN's "TBD". Both are used below so the fixture cannot silently
     * stop exercising the branch.
     */
    const unreadable = { home: undefined, away: undefined, final: true, status: "final" } as unknown as CfbFinals[string];
    const unreadableTbd = { home: "TBD", away: "TBD", final: true, status: "final" } as unknown as CfbFinals[string];

    // the 48-hour escalation is UNCHANGED for a game that is not final (DEFECT I(a) stands)
    const live49 = gradeCfbEntry(e, { [G1]: fin(14, 7, false, "live") }, K + 49 * 3600_000);
    expect(live49.tickets.u2.result).toBe("ungradable");
    expect(live49.done).toBe(true);

    // ...but the final-with-an-unreadable-score leg is still honestly pending at 49 h
    const at49 = gradeCfbEntry(e, { [G1]: unreadable }, K + 49 * 3600_000);
    expect(at49.legs[lkey]).toMatchObject({ result: "pending", detail: "score unavailable" });
    expect(at49.tickets.u2.result).toBe("pending");
    expect(at49.done).toBe(false);
    const tbd49 = gradeCfbEntry(e, { [G1]: unreadableTbd }, K + 49 * 3600_000);
    expect(tbd49.legs[lkey]).toMatchObject({ result: "pending", detail: "score unavailable" });
    expect(tbd49.done).toBe(false);
    // and one minute short of the recheck window it is STILL pending, so the date stays readable
    expect(gradeCfbEntry(e, { [G1]: unreadable }, K + CFB_VOID_RECHECK_MS - 60_000).done).toBe(false);

    // it does terminate: past the recheck window the desk stops waiting and voids
    const at8d = gradeCfbEntry(e, { [G1]: unreadable }, K + 8 * 24 * 3600_000);
    expect(at8d.tickets.u2).toMatchObject({ result: "ungradable", payout: 0 });
    expect(at8d.legs[lkey].result).toBe("ungradable");
    expect(at8d.done).toBe(true);

    // and the whole point: a score that becomes readable inside the window grades to the real result
    const late = gradeCfbEntry(e, { [G1]: fin(52, 7) }, K + 6 * 24 * 3600_000);
    expect(late.tickets.u2).toMatchObject({ result: "won", payout: 47.73 });
    expect(late.done).toBe(true);
  });
  /**
   * DEFECT C1, SECOND HALF (INSTRUCTION 45, 2026-09-06) — the null-shaped score the first half
   * walked straight past, and the one case the fix must NOT sweep up with it.
   *
   * `Number(null)` is 0 and 0 is finite, so before this pin `gradeCfbLeg` read a final whose
   * scores are JSON null as a genuine nil-all tie. MEASURED TWICE while writing this test, on the
   * $25 core ML single below with `{ home: null, away: null, final: true, status: "final" }` at
   * kickoff + 1 h: the leg came back `{ result: "push", detail: "0-0 · tie" }` and the ticket
   * `{ result: "push", payout: 25, dec: 1, detail: "every leg pushed — stake returned" }`, `done`
   * true. That is the worst shape in the file, because a push is the one wrong answer that can
   * never be corrected: `push` IS in the SETTLED set of BOTH overlays (`SETTLED` in
   * src/lib/cfb/store.ts and in src/lib/cfb/lock-server.ts, both `new Set(["won", "lost",
   * "push"])`), so neither will replace it; `done` true makes `cfbSettleCandidate`
   * (src/lib/cfb/lock-server.ts) return false with no void to hold the date open, so no later ESPN
   * read is ever made; and `ticketPL` (src/lib/bankroll.ts) falls through to `return 0` for a push.
   * A real winner or loser is booked at $0 P/L permanently and cfbBankroll — which Kelly-sizes
   * every later day — is wrong by that amount for ever.
   *
   * The first half of C1 (the test above) gave the final-but-unreadable leg a seven-day window,
   * and its own guard `voidWindowMs` tested `Number.isFinite(Number(f.home))` — TRUE for null — so
   * the window written for exactly the meaning "the result exists and our read of it failed" did
   * not cover the null shape sitting next to it. Both arms now read the raw value BEFORE `Number`
   * touches it, so null takes the same long window as `undefined` and `"TBD"`.
   *
   * `finalsOf` (src/lib/cfb/slate-server.ts) skips a final with a null score on the ESPN path, so
   * the live reach is narrowed — but a persisted, merged or hand-built finals map still arrives
   * here, and `CfbFinals` declaring `home: number` is documentation, not enforcement.
   *
   * AND THE HALF THAT MUST NOT MOVE: a REAL 0-0 final — `home` and `away` the NUMBER zero — is a
   * real tie. It pushes, it is done, and it never takes the long window. Falsiness is not the
   * test; readability is.
   */
  it("C1: JSON-null scores are UNREADABLE, not a real 0-0 — and a real 0-0 still pushes", () => {
    const e = entry([ticket("n1", 25, [leg({ gkey: G1, market: "ml", side: "home", line: null, cz: -110 })])], [], GAMES);
    const K = Date.parse("2026-09-05T16:00Z");
    const lkey = e.core[0].legs[0].lkey;
    const nulls = { home: null, away: null, final: true, status: "final" } as unknown as CfbFinals[string];

    // K+1h: pending, NOT a nil-all tie booked at $0 and closed for ever
    const at1h = gradeCfbEntry(e, { [G1]: nulls }, K + 3600_000);
    expect(at1h.legs[lkey]).toMatchObject({ result: "pending", detail: "score unavailable" });
    expect(at1h.tickets.n1.result).toBe("pending");
    expect(at1h.done).toBe(false);

    // it takes the LONG window, exactly like the undefined / "TBD" shapes in the test above
    expect(gradeCfbEntry(e, { [G1]: nulls }, K + 49 * 3600_000).done).toBe(false);
    expect(gradeCfbEntry(e, { [G1]: nulls }, K + CFB_VOID_RECHECK_MS - 60_000).done).toBe(false);
    const at8d = gradeCfbEntry(e, { [G1]: nulls }, K + 8 * 24 * 3600_000);
    expect(at8d.tickets.n1).toMatchObject({ result: "ungradable", payout: 0 });
    expect(at8d.legs[lkey].result).toBe("ungradable");
    expect(at8d.done).toBe(true);

    // one null side is enough — half a score is not a score
    const half = { home: 21, away: null, final: true, status: "final" } as unknown as CfbFinals[string];
    expect(gradeCfbEntry(e, { [G1]: half }, K + 3600_000).legs[lkey]).toMatchObject({ result: "pending", detail: "score unavailable" });
    // ESPN's score field is a STRING upstream: a numeric one reads, an empty one does not
    // (`Number("")` is 0, the same silent zero as `Number(null)`)
    const blank = { home: "", away: "", final: true, status: "final" } as unknown as CfbFinals[string];
    expect(gradeCfbEntry(e, { [G1]: blank }, K + 3600_000).legs[lkey]).toMatchObject({ result: "pending", detail: "score unavailable" });
    const strs = { home: "31", away: "17", final: true, status: "final" } as unknown as CfbFinals[string];
    expect(gradeCfbLeg(leg({ market: "ml", side: "home", line: null }), strs)).toMatchObject({ result: "won", detail: "31-17 · won by 14" });

    // ...AND THE HALF THAT MUST NOT MOVE: a real 0-0 is a real tie
    const nil = gradeCfbEntry(e, { [G1]: fin(0, 0) }, K + 3600_000);
    expect(nil.legs[lkey]).toMatchObject({ result: "push", detail: "0-0 · tie" });
    expect(nil.tickets.n1).toMatchObject({ result: "push", payout: 25, dec: 1 });
    expect(nil.done).toBe(true);
    // a real 0-0 is READABLE, so it never reaches the long window either
    expect(gradeCfbEntry(e, { [G1]: fin(0, 0) }, K + 8 * 24 * 3600_000).tickets.n1.result).toBe("push");
    // and zero is a number everywhere else too — a total grades from it
    expect(gradeCfbLeg(leg({ market: "total", side: "under", line: 42.5 }), fin(0, 0)).result).toBe("won");
    expect(gradeCfbLeg(leg({ side: "home", line: -3.5 }), fin(0, 0)).result).toBe("lost");
  });
  it("core and fun tickets grade together; done only when none is pending", () => {
    const e = entry([ticket("c1", 25, [leg({ gkey: G1, side: "home", line: -40.5 })])], [ticket("f1", 25, [leg({ gkey: G1, side: "home", line: -40.5 }), leg({ gkey: G2, side: "away", line: 28, cz: -106 })], "fun")], GAMES);
    const g = gradeCfbEntry(e, { [G1]: fin(52, 7) }, AFTER);
    expect(g.tickets.c1.result).toBe("won");
    expect(g.tickets.f1.result).toBe("pending");
    expect(g.done).toBe(false);
  });
});

describe("the pure ledger: lock → grade → stats / bankroll / validate", () => {
  const FIX = path.join(process.cwd(), "tests", "fixtures", "cfb");
  const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8"));
  const NOW = Date.parse("2026-09-05T12:00:00Z");
  const espn = readJson("espn-scoreboard-2026-09-05.json") as { events: unknown[] };
  const board = buildCfbBoard({ date: "2026-09-05", espnEvents: espn.events, oddsEvents: readJson("odds-ncaaf-2026-09-05.json"), fpi: readJson("espn-fpi.json"), now: NOW, bankroll: 2500 });
  const card = buildCfbCard(board, { bankroll: 2500, daily: CFB_PAPER.daily, fun: CFB_PAPER.fun, now: NOW });
  const locked = lockCfbCard(card, board, NOW + 1000);

  it("lockCfbCard stamps sport/date/allotments and a games map for every leg's game", () => {
    expect(locked.sport).toBe("cfb");
    expect(locked.locked).toBe(true);
    expect(locked.date).toBe("2026-09-05");
    expect(locked.daily).toBe(250); // widened 150 → 250 on 2026-09-08 ("Widen the CFB allocation to $250")
    expect(locked.fun).toBe(25);
    expect(locked.lockedAt).toBe(NOW + 1000);
    expect(locked.core).toBe(card.core);
    expect(locked.funT).toBe(card.funT);
    expect(locked.grading).toBeNull();
    expect(locked.noPlay).toBeUndefined();
    for (const t of [...locked.core, ...locked.funT]) {
      for (const l of t.legs) {
        const g = locked.games[l.gkey];
        expect(g).toBeDefined();
        expect(g.pk).toBe(Number(l.gkey));
        expect(g.start).toBe(board.games.find((x) => x.id === l.gkey)!.start);
        expect(g.home).toBe(board.games.find((x) => x.id === l.gkey)!.home.name);
      }
    }
    const np = lockCfbCard({ ...card, core: [], funT: [], coreSum: 0, funSum: 0, noPlay: true }, board, NOW);
    expect(np.noPlay).toBe(true);
    expect(np.games).toEqual({});
  });
  it("validateCfbLedger accepts the locked day and rejects a non-CFB or unlocked entry", () => {
    expect(validateCfbLedger([locked]).ok).toBe(true);
    const mlb = { ...locked, sport: "mlb" } as unknown;
    const r = validateCfbLedger([mlb]);
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.error).toMatch(/sport must be "cfb"/);
    expect(validateCfbLedger([{ ...locked, locked: false }]).ok).toBe(false);
    expect(validateCfbLedger("nope").ok).toBe(false);
  });
  it("stats + bankroll + exposure over a graded day (synthetic finals: every core leg loses, fun pending)", () => {
    // every core leg is an underdog spread on this fixture card; blowout finals make each one lose
    const finals: CfbFinals = {};
    for (const g of board.games) finals[g.id] = fin(70, 0);
    const graded = { ...locked, grading: gradeCfbEntry(locked, finals, NOW + 3600_000) };
    expect(Object.values(graded.grading!.tickets).filter((t) => t.result === "lost").length).toBe(card.core.length + card.funT.length);
    const core = cfbLedgerStats([graded], "core");
    expect(core.staked).toBe(card.coreSum);
    expect(core.ret).toBe(0);
    expect(core.pl).toBe(-card.coreSum);
    expect(core.l).toBe(card.core.length);
    expect(core.w).toBe(0);
    expect(core.days).toHaveLength(1);
    const fun = cfbLedgerStats([graded], "fun");
    expect(fun.staked).toBe(card.funSum);
    const all = cfbLedgerStats([graded], "all");
    expect(all.pl).toBe(-(card.coreSum + card.funSum));
    expect(cfbExposureOn([graded], "2026-09-05")).toBe(card.coreSum + card.funSum);
    expect(cfbExposureOn([graded], "2026-09-06")).toBe(0);
    const store = { base: CFB_BANK_BASE, asOf: "2026-09-05", log: [{ ts: 1, kind: "deposit" as const, amt: 100, note: "seed" }] };
    expect(cfbBankroll(store, [graded])).toBe(2500 + 100 - card.coreSum - card.funSum);
    // an ungraded day stakes nothing yet
    expect(cfbBankroll(store, [locked])).toBe(2600);
    expect(cfbLedgerStats([locked], "core").pending).toBe(card.core.length);
  });
});

/* ==========================================================================================
   INSTRUCTION 45 (2026-09-06) — THE SERVER RAIL. Josh, verbatim: "Parlay Lab CFB should've been
   running the same $150 per day theoretical Core money and $25 Fun money per day".

   These pins live in THIS file rather than in tests/cfb-lock-route.test.ts because the round that
   wrote them owned tests/cfb-grade.test.ts and not that file. They drive the PURE helpers in
   src/lib/cfb/lock-server.ts directly — no route, no Redis, no network — which is what the file
   they would otherwise have gone in does through a mocked HTTP shell.
   ========================================================================================== */

describe("C1 (2026-09-06) — a verdict booked from an unreadable score is correctable; an ordinary push is not", () => {
  const K = Date.parse("2026-09-05T16:00Z");
  const LATER = K + 30 * 3600_000;

  /**
   * THE SHAPE, AND WHY IT IS NOT REACHABLE THROUGH THE GRADER ANY MORE. The C1 fix in
   * src/lib/cfb/grade.ts is FORWARD-ONLY: `readScore` now refuses a null/blank score, so nothing
   * will ever book this verdict again. The days already booked are the defect, and they are booked
   * — a stored blob, not a computation — so the fixture is written the way the OLD grader wrote it.
   * Its exact bytes are quoted from the MEASURED paragraph of "C1: JSON-null scores are UNREADABLE"
   * above: the leg `{ result: "push", detail: "0-0 · tie" }` and the ticket `{ result: "push",
   * payout: 25, dec: 1, detail: "every leg pushed — stake returned" }`, `done` true.
   */
  const phantom = (lkey: string): NonNullable<CfbLedgerEntry["grading"]> => ({
    tickets: { z1: { result: "push", payout: 25, dec: 1, detail: "every leg pushed — stake returned" } },
    legs: { [lkey]: { result: "push", detail: "0-0 · tie" } },
    done: true,
  });

  const dayOf = (g: NonNullable<CfbLedgerEntry["grading"]>): CfbLedgerEntry => ({
    ...entry([ticket("z1", 25, [leg({ gkey: G1, market: "ml", side: "home", line: null, cz: -110 })])], [], GAMES),
    grading: g,
  });

  it("the phantom push is byte-identical to a REAL 0-0 push — which is why the correction cannot be told apart, and why it is safe", () => {
    const e = dayOf(null as never);
    const lkey = e.core[0].legs[0].lkey;
    /* a genuine nil-all final, graded by today's grader, produces exactly the stored fixture */
    const real = gradeCfbEntry(e, { [G1]: fin(0, 0) }, K + 3600_000);
    expect(real.legs[lkey]).toEqual({ result: "push", detail: "0-0 · tie" });
    expect(real.tickets.z1).toMatchObject({ result: "push", payout: 25, dec: 1 });
    expect(real.done).toBe(true);
    expect(JSON.stringify(real)).toBe(JSON.stringify(phantom(lkey)));
  });

  it("a stored 0-0 push is replaced by a CORROBORATED later final, and the leg line is corrected with it", () => {
    const e = dayOf({} as never);
    const lkey = e.core[0].legs[0].lkey;
    const day = dayOf(phantom(lkey));
    const inc = gradeCfbEntry(day, { [G1]: fin(31, 17) }, LATER);
    expect(inc.tickets.z1).toMatchObject({ result: "won", payout: 47.73 });
    expect(inc.legs[lkey]).toMatchObject({ result: "won", detail: "31-17 · won by 14" });
    expect(e.date).toBe("2026-09-05");

    const merged = overlayCfbGrading(day.grading, inc, day)!;
    expect(merged.tickets.z1).toMatchObject({ result: "won", payout: 47.73 });
    expect(merged.legs[lkey]).toMatchObject({ result: "won", detail: "31-17 · won by 14" });
    expect(merged.done).toBe(true);
  });

  it("and the settle pass will still be ASKING: a day whose only unsettled verdict is a 0-0 push stays a candidate inside the recheck window", () => {
    const day = dayOf(phantom(entry([ticket("z1", 25, [leg({ gkey: G1, market: "ml", side: "home", line: null, cz: -110 })])], [], GAMES).core[0].legs[0].lkey));
    expect(day.grading!.done).toBe(true);
    expect(cfbSettleCandidate(day, LATER)).toBe(true);
    /* it TERMINATES: past CFB_VOID_RECHECK_MS from the last kickoff the date is closed for good */
    expect(cfbSettleCandidate(day, K + CFB_VOID_RECHECK_MS + 60_000)).toBe(false);
  });

  it("an UNCORROBORATED later read never replaces it — the void rule's own bar, reused", () => {
    const lkey = entry([ticket("z1", 25, [leg({ gkey: G1, market: "ml", side: "home", line: null, cz: -110 })])], [], GAMES).core[0].legs[0].lkey;
    const day = dayOf(phantom(lkey));
    /* the game is not final again — the leg grades pending, so nothing corroborates the ticket */
    const inc = gradeCfbEntry(day, { [G1]: fin(31, 17, false, "live") }, LATER);
    expect(inc.tickets.z1.result).toBe("pending");
    const merged = overlayCfbGrading(day.grading, inc, day)!;
    expect(merged.tickets.z1).toMatchObject({ result: "push", payout: 25 });
    expect(merged.legs[lkey]).toMatchObject({ result: "push", detail: "0-0 · tie" });
  });

  it("a REAL 0-0 re-read corroborates to the same push — the exception can correct, never fabricate", () => {
    const lkey = entry([ticket("z1", 25, [leg({ gkey: G1, market: "ml", side: "home", line: null, cz: -110 })])], [], GAMES).core[0].legs[0].lkey;
    const day = dayOf(phantom(lkey));
    const inc = gradeCfbEntry(day, { [G1]: fin(0, 0) }, LATER);
    const merged = overlayCfbGrading(day.grading, inc, day)!;
    expect(merged.tickets.z1).toMatchObject({ result: "push", payout: 25, dec: 1 });
    expect(merged.legs[lkey]).toEqual({ result: "push", detail: "0-0 · tie" });
    expect(merged.done).toBe(true);
  });

  /**
   * THE HALF THAT MUST NOT MOVE. The settled guard is load-bearing and this exception is keyed to
   * ONE stored shape: a `push` whose LEG line records a 0-0 read. Every other settled verdict —
   * a spread push on a real score, a win, a loss — is still untouchable by anything, which is what
   * protects a verdict the phone graded and synced up.
   */
  it("an ordinary legitimate push is STILL untouchable, and so are won and lost", () => {
    const t = ticket("z1", 25, [leg({ gkey: G1, side: "home", line: -40, cz: -110 })]);
    const base = entry([t], [], GAMES);
    const lkey = base.core[0].legs[0].lkey;
    /* a real spread push: 47-7 against -40 */
    const stored = gradeCfbEntry(base, { [G1]: fin(47, 7) }, K + 3600_000);
    expect(stored.tickets.z1).toMatchObject({ result: "push", payout: 25 });
    expect(stored.legs[lkey].detail).toBe("47-7 · margin +40 vs -40 · push");
    const day: CfbLedgerEntry = { ...base, grading: stored };
    const inc = gradeCfbEntry(base, { [G1]: fin(52, 7) }, LATER);
    expect(inc.tickets.z1.result).toBe("won");
    const merged = overlayCfbGrading(day.grading, inc, day)!;
    expect(merged.tickets.z1).toMatchObject({ result: "push", payout: 25 });
    expect(merged.legs[lkey].detail).toBe("47-7 · margin +40 vs -40 · push");
    expect(cfbSettleCandidate(day, LATER)).toBe(false);

    const wonDay: CfbLedgerEntry = { ...base, grading: gradeCfbEntry(base, { [G1]: fin(52, 7) }, K + 3600_000) };
    const flip = gradeCfbEntry(base, { [G1]: fin(45, 7) }, LATER);
    expect(flip.tickets.z1.result).toBe("lost");
    expect(overlayCfbGrading(wonDay.grading, flip, wonDay)!.tickets.z1.result).toBe("won");
    expect(cfbSettleCandidate(wonDay, LATER)).toBe(false);
  });
});

describe("C3 (2026-09-06) — the server rail's no-play rule is STAKED MONEY, not a row count", () => {
  const K = Date.parse("2026-09-05T16:00Z");
  const LATER = Date.parse("2026-09-05T13:00:00Z");
  const planOf = (over: Partial<CfbTopUpPlan> = {}): CfbTopUpPlan => ({ tickets: [], stake: 0, fun: [], funStake: 0, games: {}, pricedAhead: 1, ...over });
  const noPlayDay = (): CfbLedgerEntry => ({ ...entry([], [], GAMES), noPlay: true, note: "NO-PLAY — nothing staked." });

  /**
   * THE KERNEL MOVED FIRST. `mergeDay` (src/lib/ledger-merge.ts) reads, verbatim today:
   *   `if (out.noPlay && (stakeSum(out.core) > 1e-9 || stakeSum(out.funT ?? []) > 1e-9)) delete out.noPlay;`
   * `applyCfbTopUp` still counted ROWS (`core.length || funT.length`), so the same day could be a
   * no-play on the merge rail and a played day on the write rail. `noPlay` is a claim about the
   * CARD — "the day locked with nothing staked" — and a $0 row stakes nothing, so a row's mere
   * EXISTENCE reports a day as played over $0.00 of exposure. MONEY_EPS in that file is the same
   * 1e-9 the kernel spells out.
   */
  it("a $0 fun ticket does NOT end a no-play day — the flag answers off the same number the money does", () => {
    const np = noPlayDay();
    expect(np.noPlay).toBe(true);
    const free = ticket("cfb-2026-09-05-topup1-fun-1", 0, [leg({ gkey: G1, side: "home", line: -40.5 })], "fun");
    const next = applyCfbTopUp(np, planOf({ fun: [free], funStake: 0 }), LATER, 1);
    expect(next.funT).toHaveLength(1);
    expect(next.funT[0].stake).toBe(0);
    expect(next.noPlay).toBe(true);
    expect("noPlay" in next).toBe(true);
  });

  /**
   * THE CORE BUCKET CANNOT EVEN GET THAT FAR, and the pin says so rather than pretending the
   * no-play line is what protects it: `assertCfbCardMoney` holds every CORE ticket to the
   * $CFB_RULES.minStake–$maxStake band, so a $0 core ticket throws the money guard over the merged
   * entry and NOTHING is written. Both buckets are pinned; they are simply refused at different
   * depths.
   */
  it("a $0 core ticket is refused outright by the money guard — nothing written, so no flag to argue about", () => {
    const np = noPlayDay();
    const free = ticket("cfb-2026-09-05-topup1-core-1", 0, [leg({ gkey: G1, side: "home", line: -40.5 })]);
    expect(CFB_RULES.minStake).toBe(5);
    expect(() => applyCfbTopUp(np, planOf({ tickets: [free], stake: 0 }), LATER, 1)).toThrow(/CFB MONEY GUARD/);
  });

  it("and REAL money in either bucket still ends the no-play day, exactly as before", () => {
    const np = noPlayDay();
    const core = ticket("cfb-2026-09-05-topup1-core-1", 25, [leg({ gkey: G1, side: "home", line: -40.5 })]);
    const withCore = applyCfbTopUp(np, planOf({ tickets: [core], stake: 25 }), LATER, 1);
    expect("noPlay" in withCore).toBe(false);
    const funT = ticket("cfb-2026-09-05-topup1-fun-1", 25, [leg({ gkey: G1, side: "home", line: -40.5 })], "fun");
    const withFun = applyCfbTopUp(noPlayDay(), planOf({ fun: [funT], funStake: 25 }), LATER, 1);
    expect("noPlay" in withFun).toBe(false);
    /* a top-up that seats NOTHING still leaves the honest flag standing */
    expect(applyCfbTopUp(noPlayDay(), planOf(), LATER, 1).noPlay).toBe(true);
    expect(K).toBeGreaterThan(LATER);
  });
});

describe("C4 (2026-09-06) — the server passes over a day the KERNEL merged", () => {
  const LATER = Date.parse("2026-09-05T13:00:00Z");
  const planOf = (over: Partial<CfbTopUpPlan> = {}): CfbTopUpPlan => ({ tickets: [], stake: 0, fun: [], funStake: 0, games: {}, pricedAhead: 1, ...over });

  /**
   * (a) MARKERS THE SERVER HAS NEVER SEEN. `mergeDay` (src/lib/ledger-merge.ts) records what it had
   * to refuse ON THE DAY — `funDropped` / `funDroppedPL` today, `capBreach` beside them — and this
   * round it gains more of them (a receiptless stake raise keeping the SMALLER stake, a core drop
   * channel). None of them is a field the server rail knows.
   *
   * IT CANNOT MATTER, AND HERE IS WHY, read this turn rather than assumed. `SyncEntry`
   * (src/lib/ledger-merge.ts) carries an `[k: string]: unknown` index signature, so an unknown
   * marker typechecks and travels. `applyCfbTopUp` opens its write with `const next: CfbLedgerEntry = {`
   * and `...entry,` on the next line, naming only `core`, `funT`, `games: { ...plan.games,
   * ...(entry.games ?? {}) },` and `note` after it (READ IN src/lib/cfb/lock-server.ts THIS TURN;
   * the one-line paraphrase that used to stand here was never a quote of anything) — a SPREAD of
   * the whole stored entry, which is the property this pin drives — and `settlePass`
   * (app/api/cfb/lock/route.ts) writes `{ ...raw, ...(same ? {} : { grading: g }), ...(inc ?
   * { gradedAt: args.now } : {}), attemptedAt: args.now }`, likewise a spread of the stored row. So
   * both passes carry every marker through untouched, and NEITHER READS ONE: `cfbSettleCandidate`
   * looks at `core`, `funT`, `grading` and `games`, `overlayCfbGrading` at `grading` and the
   * tickets' legs, and `decideCfbTopUp` at `source`, `core`, `funT`, `lockedAt` and `topUps`. The
   * validator is additive too — `validateLedger` checks date, `locked`, `core`, duplicate dates and
   * the `placed` / `actualStake` shapes, and passes anything else.
   *
   * The pin drives markers that exist AND names that do not, because the point is the property —
   * an unknown key survives — not the current spelling of the kernel's channels.
   */
  it("(a) an unknown merge marker survives the top-up write byte for byte, and no server pass reads one", () => {
    const graded = ticket("cfb-2026-09-05-fun-1", 25, [leg({ gkey: G1, side: "home", line: -40.5 })], "fun");
    const merged = {
      ...entry([], [graded], GAMES),
      funDropped: ["cfb-2026-09-05-fun-9"],
      funDroppedPL: { "cfb-2026-09-05-fun-9": -25 },
      capBreach: { fun: 25 },
      stakeConflictNobodyHereKnowsAbout: [{ id: "cfb-2026-09-05-core-1", kept: 10, refused: 25 }],
    } as unknown as CfbLedgerEntry;
    const core = ticket("cfb-2026-09-05-topup1-core-1", 25, [leg({ gkey: G2, side: "away", line: 28, cz: -106 })]);
    const next = applyCfbTopUp(merged, planOf({ tickets: [core], stake: 25 }), LATER, 1) as unknown as Record<string, unknown>;
    expect(next.funDropped).toEqual(["cfb-2026-09-05-fun-9"]);
    expect(next.funDroppedPL).toEqual({ "cfb-2026-09-05-fun-9": -25 });
    expect(next.capBreach).toEqual({ fun: 25 });
    expect(next.stakeConflictNobodyHereKnowsAbout).toEqual([{ id: "cfb-2026-09-05-core-1", kept: 10, refused: 25 }]);
    /* and the passes that read the day answer the same with the markers as without them */
    const plain = entry([], [graded], GAMES);
    expect(cfbSettleCandidate(merged as CfbLedgerEntry, LATER)).toBe(cfbSettleCandidate(plain, LATER));
    const g = gradeCfbEntry(plain, { [G1]: fin(52, 7) }, LATER);
    expect(overlayCfbGrading(null, g, merged as CfbLedgerEntry)).toEqual(overlayCfbGrading(null, g, plain));
  });

  /**
   * (b) A TOP-UP CANNOT DELETE A GRADED FUN TICKET. `planCfbTopUp` seats a fun parlay only onto a
   * day whose bucket is EMPTY — and, since the closing round's S2, only onto one carrying no merge
   * refusal receipt either; the gate names `cfbFunRefusedOf` beside the emptiness test, and C7(d)
   * below drives that half. `applyCfbTopUp` writes
   * `const funT = [...entry.funT, ...plan.fun]` — an APPEND, with no filter anywhere on this path.
   * The kernel's fun cap is the thing that evicts, and it lives in `mergeDay`; the route's top-up
   * write does not merge at all (`cur.map(e => … next …)` replaces the date's entry), so no
   * eviction rule runs over a top-up whatever the kernel's final cap does.
   */
  it("(b) a top-up over a day whose fun bucket holds a GRADED ticket keeps the ticket AND its verdict", () => {
    const funTix = ticket("cfb-2026-09-05-fun-1", 25, [leg({ gkey: G1, side: "home", line: -40.5 })], "fun");
    const day = entry([], [funTix], GAMES);
    const won = gradeCfbEntry(day, { [G1]: fin(52, 7) }, LATER);
    expect(won.tickets["cfb-2026-09-05-fun-1"].result).toBe("won");
    const held: CfbLedgerEntry = { ...day, grading: won };
    const core = ticket("cfb-2026-09-05-topup1-core-1", 25, [leg({ gkey: G2, side: "away", line: 28, cz: -106 })]);
    const next = applyCfbTopUp(held, planOf({ tickets: [core], stake: 25 }), LATER, 1);
    expect(next.funT).toHaveLength(1);
    expect(next.funT[0]).toEqual(funTix);
    expect(next.grading!.tickets["cfb-2026-09-05-fun-1"]).toMatchObject({ result: "won" });
    /* the fresh core ticket is ungraded, so the day is reopened for the auto-grader — CRITIC 7 */
    expect(next.grading!.done).toBe(false);
    /* the plan a real poke would build for such a day carries NO fun ticket at all */
    expect(planCfbTopUp({ ...buildCfbBoard({ date: "2026-09-05", espnEvents: [], oddsEvents: [], fpi: null, now: LATER, bankroll: 2500 }) }, held, { now: LATER, bankroll: 2500, room: 150, slots: 7, n: 1 }).fun).toHaveLength(0);
  });

  /**
   * (c) NOTHING SERVER-SIDE MINTS A $0 TICKET, now that both no-play rules key on staked money.
   * Three independent floors, read this turn: `buildCfbCard` (src/lib/cfb/card.ts) clamps every
   * core stake into `R.minStake`–`R.maxStake` and stakes the fun parlay at `opts.fun` outright;
   * `planCfbTopUp` refuses a fun ticket on `!(t.stake > 0)`; and `assertCfbCardMoney` throws on any
   * core ticket outside the band, over the card AND over a merged top-up entry.
   */
  it("(c) every ticket the card builder mints carries real money, and the guard refuses one that does not", () => {
    const FIXD = path.join(process.cwd(), "tests", "fixtures", "cfb");
    const j = (f: string) => JSON.parse(fs.readFileSync(path.join(FIXD, f), "utf8"));
    const NOW = Date.parse("2026-09-05T12:00:00Z");
    const b = buildCfbBoard({ date: "2026-09-05", espnEvents: (j("espn-scoreboard-2026-09-05.json") as { events: unknown[] }).events, oddsEvents: j("odds-ncaaf-2026-09-05.json"), fpi: j("espn-fpi.json"), now: NOW, bankroll: 2500 });
    const c = buildCfbCard(b, { bankroll: 2500, daily: CFB_PAPER.daily, fun: CFB_PAPER.fun, now: NOW });
    expect(c.core.length).toBeGreaterThan(0);
    for (const t of c.core) expect(t.stake).toBeGreaterThanOrEqual(CFB_RULES.minStake);
    for (const t of c.funT) expect(t.stake).toBeGreaterThan(0);
    const plan = planCfbTopUp(b, entry([], [], GAMES), { now: NOW, bankroll: 2500, room: CFB_PAPER.daily, slots: CFB_RULES.tickets.max, n: 1 });
    for (const t of [...plan.tickets, ...plan.fun]) expect(t.stake).toBeGreaterThan(0);
    /* and the guard is what makes it a rule rather than a habit */
    const zero = ticket("cfb-2026-09-05-core-1", 0, [leg({ gkey: G1, side: "home", line: -40.5 })]);
    expect(() => assertCfbEntryMoney(entry([zero], [], GAMES))).toThrow(/CFB MONEY GUARD/);
  });
});

/**
 * C2 (2026-09-06) — THE CAUSE HALF OF THE LOCK PATH'S ODDS REFUSAL, pinned from the source.
 *
 * THE MUTANT: delete `slate.oddsMissing ||` from the refusal in app/api/cfb/lock/route.ts and the
 * whole CFB route suite still passes. The refusal itself is well pinned; what is not is the
 * SPECIFIC CAUSE that fires it. Both disjuncts happen to coincide on every fixture — `oddsPayload`
 * (src/lib/cfb/slate-server.ts) returns `{ events: [], missing: true }` on every failure it maps,
 * so a board with `oddsMissing: true` has no priced row and `cfbPricedAhead` is 0 anyway.
 *
 * SO IS IT LOAD-BEARING? Yes, and not because of today's arithmetic. The two disjuncts are
 * different claims — "the feed did not answer" and "the feed answered and matched nothing still
 * ahead" — the route's own body prints them as different sentences two lines below (`why`), and
 * `cfbPricedAhead` is deliberately narrower than "has a price": READ THIS TURN in
 * src/lib/cfb/lock-server.ts it counts only rows passing `if (r.playable && r.cz != null && r.evCz != null) n++;`
 * on a game whose kickoff is still ahead, and `playable` is itself set by `const playable = !!sq.cz && upcoming;`
 * over `const upcoming = game.status === "upcoming" && Number.isFinite(kickoff) && kickoff > now;`
 * (src/lib/cfb/model.ts). (CORRECTED 2026-09-06, the closing round's citation sweep: this line used
 * to quote the row predicate without its `r.` receiver and paraphrase `playable` as
 * `status === "upcoming"`; neither string is in either source.) A cached or partially-priced
 * board, or any future feed that reports `missing` beside surviving rows, separates them — and the
 * mutant would then LOCK a day whose prices the desk does not trust, which is the exact failure
 * DEFECT 1 exists to prevent and is permanent once written (every later poke exits already-locked).
 *
 * THE TEST THAT WOULD KILL IT BEHAVIOURALLY belongs in tests/cfb-lock-route.test.ts, which the
 * round that wrote this pin did not own: build the slate from the REAL odds fixture (so the games
 * still ahead carry playable priced rows and `cfbPricedAhead(slate.games, LOCKS_AT) > 0`) and force
 * `oddsMissing: true` on it — a one-line variant of that file's own `slateAt` — poke at LOCKS_AT,
 * and assert 502 / `status: "odds-missing"` with nothing written to the ledger. The mutant locks
 * the day instead and the assertion on `status` fails. Until that exists, this source pin stands
 * in: it is exact about the disjunct, and deleting it is a red test.
 */
describe("C2 (2026-09-06) — the lock path refuses on the CAUSE as well as on the count", () => {
  it("the refusal names slate.oddsMissing, not just a zero priced-ahead count", () => {
    const src = stripComments(fs.readFileSync(path.join(process.cwd(), "app", "api", "cfb", "lock", "route.ts"), "utf8"));
    expect(src).toMatch(/d\.ahead > 0 && \(slate\.oddsMissing \|\| pricedAhead === 0\)/);
    /* the two causes are reported apart, so a reader of the answer knows which one fired */
    expect(src).toMatch(/const why = slate\.oddsMissing \?/);
    expect(src).toMatch(/status: "odds-missing"/);
  });
});

/**
 * C2 (INSTRUCTION 45, 2026-09-06, the closing round) — THE PHANTOM-PUSH CORRECTION MAY NOT LEAVE A
 * TICKET DISAGREEING WITH ITS OWN LEGS. A REGRESSION of the C1 exception above.
 *
 * WHAT WENT WRONG. `overlayCfbGrading` (src/lib/cfb/lock-server.ts) grew two exceptions to the
 * settled guard last round, one per map, and only the TICKET one is keyed to the ticket. The LEG
 * loop read `if (isSettled(stored?.result) && !(zeroReadPush(stored) && isSettled(g.result)))
 * continue;` — a bar on the LEG's stored shape and on the INCOMING leg verdict, with no test of
 * any kind on the ticket that leg belongs to.
 *
 * A PARLAY IS THE SHAPE THAT SEPARATES THEM. `settle` (src/lib/cfb/grade.ts) drops a pushed leg
 * out of the payout — `if (results[i].result === "push") continue;` — and returns `won` when every
 * leg that STOOD won, so a two-leg parlay whose second leg pushed off an unreadable 0-0 read is
 * booked `won · 1 leg pushed and dropped out`. That ticket's stored verdict is `won`, which is NOT
 * the `push` `zeroReadTicket` looks for, so the ticket exception correctly refuses to touch it —
 * and the leg exception fired anyway, correcting the leg line underneath a verdict the same pass
 * had just refused to reopen. The stored day then said "this parlay WON" over a leg reading
 * "31-17 · lost by 14", and `ticketPL` (src/lib/bankroll.ts) goes on paying the win.
 *
 * THE FIX IS A BAR, NOT A DOOR. It would have been wrong to answer this by letting the correction
 * reach the ticket too: that guard is load-bearing — it is what stops a server pass replacing a
 * verdict the phone graded and synced up — and this describe pins that an ordinary push, a win and
 * a loss are all still untouchable. So the LEG exception is barred instead: it applies only when no
 * ticket carrying that leg keeps a SETTLED stored verdict this same pass did not re-derive.
 */
describe("C2 (2026-09-06) — the 0-0 leg correction never leaves a ticket contradicting its legs", () => {
  const K = Date.parse("2026-09-05T16:00Z");
  const LATER = K + 30 * 3600_000;
  const legA = leg({ gkey: G1, market: "ml", side: "home", line: null, cz: -110 });
  const legB = leg({ gkey: G2, market: "ml", side: "home", line: null, cz: -110 });
  const parlay = () => ticket("p1", 25, [legA, legB]);
  const dayOf = (g: CfbLedgerEntry["grading"]): CfbLedgerEntry => ({ ...entry([parlay()], [], GAMES), grading: g });

  /** the stored day the OLD grader wrote: G1 a real win, G2 an unreadable 0-0 booked as a push */
  const stored = () => {
    const g = gradeCfbEntry(dayOf(null), { [G1]: fin(31, 17), [G2]: fin(0, 0) }, K + 3600_000);
    expect(g.legs[legB.lkey]).toEqual({ result: "push", detail: "0-0 · tie" });
    expect(g.tickets.p1.result).toBe("won");
    expect(g.tickets.p1.detail).toBe("won · 1 leg pushed and dropped out");
    return g;
  };

  it("the trap is real: a parlay is booked WON because the unreadable leg pushed and dropped out", () => {
    const g = stored();
    expect(g.done).toBe(true);
    /* and the ticket exception rightly refuses such a ticket — its stored verdict is `won`, not a
       0-0 `push`, so nothing about it is correctable */
    const day = dayOf(g);
    const inc = gradeCfbEntry(day, { [G1]: fin(31, 17), [G2]: fin(10, 38) }, LATER);
    expect(inc.tickets.p1.result).toBe("lost");
    expect(overlayCfbGrading(day.grading, inc, day)!.tickets.p1.result).toBe("won");
  });

  it("THE PIN: the leg line is NOT corrected under a settled ticket the same pass refused to reopen", () => {
    const day = dayOf(stored());
    const inc = gradeCfbEntry(day, { [G1]: fin(31, 17), [G2]: fin(10, 38) }, LATER);
    expect(inc.legs[legB.lkey].result).toBe("lost");
    const merged = overlayCfbGrading(day.grading, inc, day)!;
    expect(merged.tickets.p1.result).toBe("won");
    /* the ticket and its own legs agree: nothing under a standing `won` says a leg lost */
    expect(merged.legs[legB.lkey]).toEqual({ result: "push", detail: "0-0 · tie" });
    for (const l of day.core[0].legs) expect(merged.legs[l.lkey].result).not.toBe("lost");
  });

  it("the exception still fires where the whole ticket IS corrected — a single, and the leg with it", () => {
    const single = ticket("s1", 25, [legB]);
    const base = entry([single], [], GAMES);
    const g = gradeCfbEntry(base, { [G2]: fin(0, 0) }, K + 3600_000);
    expect(g.tickets.s1).toMatchObject({ result: "push", payout: 25 });
    expect(g.legs[legB.lkey]).toEqual({ result: "push", detail: "0-0 · tie" });
    const day: CfbLedgerEntry = { ...base, grading: g };
    const inc = gradeCfbEntry(base, { [G2]: fin(31, 17) }, LATER);
    const merged = overlayCfbGrading(day.grading, inc, day)!;
    expect(merged.tickets.s1).toMatchObject({ result: "won" });
    expect(merged.legs[legB.lkey]).toMatchObject({ result: "won", detail: "31-17 · won by 14" });
  });

  it("an ordinary legitimate push is STILL untouchable at the leg level too", () => {
    const single = ticket("s1", 25, [leg({ gkey: G1, side: "home", line: -40, cz: -110 })]);
    const base = entry([single], [], GAMES);
    const lkey = base.core[0].legs[0].lkey;
    const g = gradeCfbEntry(base, { [G1]: fin(47, 7) }, K + 3600_000);
    expect(g.legs[lkey].detail).toBe("47-7 · margin +40 vs -40 · push");
    const day: CfbLedgerEntry = { ...base, grading: g };
    const inc = gradeCfbEntry(base, { [G1]: fin(52, 7) }, LATER);
    const merged = overlayCfbGrading(day.grading, inc, day)!;
    expect(merged.tickets.s1).toMatchObject({ result: "push", payout: 25 });
    expect(merged.legs[lkey].detail).toBe("47-7 · margin +40 vs -40 · push");
  });
});

/**
 * C5 (INSTRUCTION 45, 2026-09-06, the closing round) — THE SERVER PASSES OVER A DAY THE KERNEL HAS
 * SINCE CHANGED UNDER THEM. Three separate claims, each read off the code this turn and each
 * pinned behaviourally rather than asserted in prose:
 *
 *   (a) the settle and top-up passes are correct against a day carrying markers they have never
 *       seen — including `stakeConflict`, the BET-CONFLICT marker `mergeDay` gained this round
 *       (src/lib/ledger-merge.ts: `{kept, refused}` for a shared id whose two stakes disagreed with
 *       no `topUp` receipt), plus `coreDropped` / `coreDroppedPL` beside it. The C4(a) pin above
 *       already drives markers by names that DO NOT exist, on purpose; this one drives the kernel's
 *       real spellings, so both the property and today's channels are covered.
 *   (b) `decideCfbTopUp` cannot be handed fresh room by a stake the merge REFUSED. Its money comes
 *       from `const staked = cfbStakeOf(entry.core)` — the seated tickets, read this turn — and it
 *       reads `source`, `core`, `funT` and `topUps` and nothing else. A CFB entry stamps none of
 *       the MLB allocator fields (`allocSum` / `gatedSum` / `topUpSum`, moved by `carryMoneyMeta`),
 *       which is the field `decideTopUp` (src/lib/server/blocks.ts) computes `owed` from and the
 *       one a refusal could have inflated.
 *   (c) nothing on the server rail MINTS an allotment above the desk's. `lockCfbCard`
 *       (src/lib/cfb/ledger.ts) is the only writer of `daily` / `fun` on this rail and stamps
 *       `CFB_PAPER.daily` / `CFB_PAPER.fun` unconditionally; `buildCfbLockEntry` and
 *       `buildCfbSweepEntry` both go through it, and `applyCfbTopUp` builds `{ ...entry, … }` and
 *       names neither field.
 */
describe("C5 (2026-09-06) — the server passes against the kernel's newest markers and the desk's allotment", () => {
  const FIXD = path.join(process.cwd(), "tests", "fixtures", "cfb");
  const j = (f: string) => JSON.parse(fs.readFileSync(path.join(FIXD, f), "utf8"));
  const NOW = Date.parse("2026-09-05T12:00:00Z");
  const LATER = Date.parse("2026-09-05T13:00:00Z");
  const K = Date.parse("2026-09-05T16:00Z");
  const planOf = (over: Partial<CfbTopUpPlan> = {}): CfbTopUpPlan => ({ tickets: [], stake: 0, fun: [], funStake: 0, games: {}, pricedAhead: 1, ...over });
  const board = () =>
    buildCfbBoard({
      date: "2026-09-05",
      espnEvents: (j("espn-scoreboard-2026-09-05.json") as { events: unknown[] }).events,
      oddsEvents: j("odds-ncaaf-2026-09-05.json"),
      fpi: j("espn-fpi.json"),
      now: NOW,
      bankroll: 2500,
    });

  it("(a) a BET-CONFLICT day is read exactly like the same day without the marker, and the markers survive the write", () => {
    const t = ticket("cfb-2026-09-05-core-1", 10, [leg({ gkey: G1, side: "home", line: -40.5 })]);
    const plain = entry([t], [], GAMES);
    const marked = {
      ...plain,
      stakeConflict: { "cfb-2026-09-05-core-1": { kept: 10, refused: 25 } },
      coreDropped: ["cfb-2026-09-05-core-9"],
      coreDroppedPL: { "cfb-2026-09-05-core-9": { result: "lost", payout: 0, stake: 25 } },
      capBreach: { core: { sum: 175, cap: 150 } },
    } as unknown as CfbLedgerEntry;

    /* the settle pass's two decisions answer the same with the markers as without */
    expect(cfbSettleCandidate(marked, LATER)).toBe(cfbSettleCandidate(plain, LATER));
    const g = gradeCfbEntry(plain, { [G1]: fin(52, 7) }, LATER);
    expect(overlayCfbGrading(null, g, marked)).toEqual(overlayCfbGrading(null, g, plain));

    /* and the top-up write carries every one of them through byte for byte */
    const add = ticket("cfb-2026-09-05-topup1-core-1", 25, [leg({ gkey: G2, side: "away", line: 28, cz: -106 })]);
    const next = applyCfbTopUp(marked, planOf({ tickets: [add], stake: 25 }), LATER, 1) as unknown as Record<string, unknown>;
    expect(next.stakeConflict).toEqual({ "cfb-2026-09-05-core-1": { kept: 10, refused: 25 } });
    expect(next.coreDropped).toEqual(["cfb-2026-09-05-core-9"]);
    expect(next.coreDroppedPL).toEqual({ "cfb-2026-09-05-core-9": { result: "lost", payout: 0, stake: 25 } });
    expect(next.capBreach).toEqual({ core: { sum: 175, cap: 150 } });
  });

  it("(b) the refused stake is not room: the decider answers off the SEATED tickets, marker or no marker", () => {
    const seated = ticket("cfb-2026-09-05-core-1", 10, [leg({ gkey: G1, side: "home", line: -40.5 })]);
    const base: CfbLedgerEntry = { ...entry([seated], [], GAMES), source: "server-lock" };
    const marked = {
      ...base,
      /* the merge kept $10 and REFUSED $25 on this very id, and refused a whole second ticket */
      stakeConflict: { "cfb-2026-09-05-core-1": { kept: 10, refused: 25 } },
      coreDropped: ["cfb-2026-09-05-core-9"],
    } as unknown as CfbLedgerEntry;

    const plainD = decideCfbTopUp(base, LATER);
    const markedD = decideCfbTopUp(marked, LATER);
    expect(plainD).toEqual(markedD);
    expect(markedD.fire).toBe(true);
    /* $150 less the ONE stake actually on the day — never $150 less the refused $25, and never
       $150 less the kept and the refused together */
    if (markedD.fire) {
      expect(markedD.room).toBe(CFB_PAPER.daily - 10);
      expect(markedD.room).not.toBe(CFB_PAPER.daily - 25);
      expect(markedD.room).not.toBe(CFB_PAPER.daily - 35);
    }
    /* and a day the merge left OVER its allotment opens no core arm at all — 12 × $25 = $300 over the
       $250 allotment (2026-09-08: the old 9 × $25 = $225 fixture sat UNDER the widened allotment with
       $25 of room, which is exactly one minStake ticket, so it would have opened the core arm) */
    const over = {
      ...entry(
        Array.from({ length: 12 }, (_, i) => ticket(`cfb-2026-09-05-core-${i + 1}`, 25, [leg({ gkey: G1, side: "home", line: -40.5, lkey: `k${i}` })])),
        [],
        GAMES,
      ),
      source: "server-lock" as const,
      capBreach: { core: { sum: 300, cap: 250 } },
    } as unknown as CfbLedgerEntry;
    const overD = decideCfbTopUp(over, LATER);
    expect(overD.fire).toBe(true);
    if (overD.fire) {
      expect(overD.core).toBe(false);
      expect(overD.fun).toBe(true);
      expect(overD.room).toBe(CFB_PAPER.daily - 300);
    }
  });

  it("(c) every server writer stamps the DESK's allotment, and a top-up never raises one", () => {
    const b = board();
    const lock = buildCfbLockEntry(b, { now: NOW, bankroll: 2500, ahead: 12, total: 12, firstKickoff: K }).entry;
    expect(lock.daily).toBe(CFB_PAPER.daily);
    expect(lock.fun).toBe(CFB_PAPER.fun);
    const missed = buildCfbLockEntry(b, { now: K + 3600_000, bankroll: 2500, ahead: 0, total: 12, firstKickoff: K }).entry;
    expect(missed.daily).toBe(CFB_PAPER.daily);
    expect(missed.fun).toBe(CFB_PAPER.fun);
    const swept = buildCfbSweepEntry(b, { now: K + 26 * 3600_000, total: 12 });
    expect(swept.daily).toBe(CFB_PAPER.daily);
    expect(swept.fun).toBe(CFB_PAPER.fun);
    /* the top-up path names neither field — it spreads the entry, so what the lock decided stands */
    const add = ticket("cfb-2026-09-05-topup1-core-1", 25, [leg({ gkey: G2, side: "away", line: 28, cz: -106 })]);
    const topped = applyCfbTopUp(lock, planOf({ tickets: [add], stake: 25 }), LATER, 1);
    expect(topped.daily).toBe(CFB_PAPER.daily);
    expect(topped.fun).toBe(CFB_PAPER.fun);
    expect(topped.daily).toBeLessThanOrEqual(CFB_PAPER.daily);
    expect(topped.fun).toBeLessThanOrEqual(CFB_PAPER.fun);
  });
});

/* ==========================================================================================
 * C6 (INSTRUCTION 45, 2026-09-06, the closing round) — THE DAY THAT REOPENS, AND THE $25's REAL
 * BOUND. Josh, verbatim: "Parlay Lab CFB should've been running the same $150 per day theoretical
 * Core money and $25 Fun money per day".
 *
 * The kernel withdraws a ticket's verdict when the merge MOVES its stake (src/lib/ledger-merge.ts
 * `mergeDay`), because a stake and the payout beside it are one quote. THE QUOTE THAT WAS HERE IS
 * STALE (corrected 2026-09-06, S3): this said `if (united?.restaked.length && out.grading) {`, and
 * grepped this turn no such string exists. The kernel now builds `withdrawn` from `restaked` UNION
 * the `betConflict` ids the base had not already graded, gates the block on a wider `legWithdrawn`
 * list, and deletes a TICKET verdict only for an id in `withdrawn` — the scoping that stopped it
 * deleting honest verdicts. Named, not re-quoted, for the reason the sweep exists. That turns a day the phone had
 * `done: true` on back into an OPEN day, and everything downstream of it has to cope: the two
 * overlays must re-grade the withdrawn ticket, the settle pass must ask again without buying
 * anything, and the top-up decider must not read the reopening as fresh room.
 *
 * WHAT THE WITHDRAWAL LEAVES BEHIND, read this turn and the reason (a) below is shaped the way it
 * is: `delete tix[id];` — the verdict is an ABSENT KEY, not a "pending" one. Both overlays bar a
 * SETTLED stored verdict and, separately, an `ungradable` one that is not corroborated; neither
 * bar can match `undefined`. So a withdrawn verdict is re-gradable BY CONSTRUCTION, and the pins
 * below drive that rather than restating it.
 * ======================================================================================== */
describe("C6 (2026-09-06) — a REOPENED day re-grades, re-asks for free, and offers no new money", () => {
  const LATER = Date.parse("2026-09-05T13:00:00Z");
  const K = Date.parse("2026-09-05T16:00Z");
  const NOW = Date.parse("2026-09-05T12:00:00Z");
  const j = (f: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "cfb", f), "utf8"));
  const planOf = (over: Partial<CfbTopUpPlan> = {}): CfbTopUpPlan => ({ tickets: [], stake: 0, fun: [], funStake: 0, games: {}, pricedAhead: 1, ...over });
  const p1 = ticket("cfb-2026-09-05-core-1", 25, [leg({ gkey: G1, side: "home", line: -40.5 })]);
  const p2 = ticket("cfb-2026-09-05-core-2", 25, [leg({ gkey: G2, side: "away", line: 28, cz: -106 })]);
  const day = () => entry([p1, p2], [], GAMES);
  const FINALS: CfbFinals = { [G1]: fin(52, 7), [G2]: fin(10, 38) };

  /**
   * (a) THE WITHDRAWN VERDICT IS RE-GRADABLE, AND THE CORROBORATION BAR DOES NOT TOUCH IT. The bar
   * exists for a stored `ungradable` — a 48-hour void may only be replaced by a final every leg of
   * that ticket corroborates. A withdrawn verdict is a DIFFERENT shape: nothing was determined, so
   * there is nothing to protect, and treating it as settled-and-immutable would strand the raised
   * ticket at `ticketPL` 0 for ever. The pin drives BOTH: the re-grade lands, and the same day with
   * a stored `ungradable` and NO corroborating legs is still refused — the bar is intact, it simply
   * does not apply here.
   */
  it("(a) a ticket whose verdict the merge withdrew re-grades on the server rail, and closes the day again", () => {
    const graded = overlayCfbGrading(null, gradeCfbEntry(day(), FINALS, AFTER), day())!;
    expect(graded.done).toBe(true);
    expect(graded.tickets[p1.id].result).toBe("won");
    expect(graded.tickets[p2.id].result).toBe("won");

    /* the kernel's withdrawal, applied by hand exactly as `mergeDay` writes it: the id's verdict
       DELETED (not set to pending), the legs no surviving ticket references deleted with it */
    const withdrawn = { tickets: { ...graded.tickets }, legs: { ...graded.legs }, done: false };
    delete withdrawn.tickets[p1.id];
    for (const l of p1.legs) delete withdrawn.legs[l.lkey];
    expect(p1.id in withdrawn.tickets).toBe(false);

    /* the raised ticket, at its new stake — the day the grader is handed */
    const raised = { ...p1, stake: 40 };
    const reopened: CfbLedgerEntry = { ...entry([raised, p2], [], GAMES), grading: withdrawn };
    expect(reopened.grading!.done).toBe(false);

    const again = overlayCfbGrading(reopened.grading, gradeCfbEntry(reopened, FINALS, AFTER), reopened)!;
    expect(again.tickets[raised.id].result).toBe("won");
    expect(again.tickets[raised.id].payout).toBeGreaterThan(0);
    expect(again.tickets[p2.id].result).toBe("won"); // the surviving verdict is untouched
    expect(again.done).toBe(true); // and the day closes again
    /* the payout is priced off the NEW stake, which is the whole point of the withdrawal */
    expect(again.tickets[raised.id].payout).not.toBe(graded.tickets[p1.id].payout);

    /* THE BAR IS STILL THERE — same day, a stored `ungradable` and an incoming read whose legs are
       NOT settled is refused, so (a) is not a hole in the void guard */
    const void1 = { tickets: { [p1.id]: { result: "ungradable" as const, payout: 0 } }, legs: {}, done: false };
    const pendingRead = { tickets: { [p1.id]: { result: "won" as const, payout: 99 } }, legs: {}, done: false };
    expect(overlayCfbGrading(void1, pendingRead, day())!.tickets[p1.id].result).toBe("ungradable");
  });

  /**
   * (b) A REOPENED DAY IS ASKED AGAIN, FOR FREE, AND CANNOT STALL. `cfbSettleCandidate` short-
   * circuits on `if (grading?.done !== true) return true;` — read this turn — so a reopened day is
   * a candidate with NO window test at all, which is right: the seven-day `CFB_VOID_RECHECK_MS`
   * clock bounds how long a VOID stays provisional, and a reopened day is not a void.
   *
   * WHAT THAT COSTS, checked rather than assumed: nothing at the Odds API. The settle pass grades
   * from a KEYLESS ESPN scoreboard read (`finalsFromEspn` builds its board with `oddsEvents: []`);
   * only the lock and the top-up path buy a priced board. And it cannot stall the queue, because
   * `cfbSettleReady` gates on the day's LAST KICKOFF plus `CFB_SETTLE.finishMs` — a date whose
   * games have not finished is not read at all, and every date that IS read is stamped
   * `attemptedAt: args.now` by the route, which is what rotates it to the back of the tier.
   */
  it("(b) a reopened day is a settle candidate at any distance, and readiness is the finish gate", () => {
    const graded = overlayCfbGrading(null, gradeCfbEntry(day(), FINALS, AFTER), day())!;
    const closed: CfbLedgerEntry = { ...day(), grading: graded };
    const reopened: CfbLedgerEntry = { ...day(), grading: { ...graded, done: false } };

    /* a CLOSED day with no reopenable shape is never re-read — the steady state */
    expect(cfbSettleCandidate(closed, AFTER)).toBe(false);
    expect(cfbSettleCandidate(closed, K + CFB_VOID_RECHECK_MS + 1)).toBe(false);
    /* a REOPENED one is, and stays one past the void window, because that window is not its clock */
    expect(cfbSettleCandidate(reopened, AFTER)).toBe(true);
    expect(cfbSettleCandidate(reopened, K + CFB_VOID_RECHECK_MS + 1)).toBe(true);

    /* readiness is the only thing holding it back, and it lets go on the finish clock */
    expect(cfbSettleReady(reopened, K + CFB_SETTLE.finishMs - 1)).toBe(false);
    expect(cfbSettleReady(reopened, K + CFB_SETTLE.finishMs)).toBe(true);
    /* ...and a reopened day whose fresh ticket has NOT kicked off yet waits for it, rather than
       burning a read on a game with no result: the gate is the LAST kickoff on the day */
    const ahead: CfbLedgerEntry = {
      ...entry([p1, p2], [], { ...GAMES, [G2]: { ...GAMES[G2], start: "2026-09-06T16:00Z" } }),
      grading: { ...graded, done: false },
    };
    expect(cfbSettleCandidate(ahead, K + CFB_SETTLE.finishMs)).toBe(true);
    expect(cfbSettleReady(ahead, K + CFB_SETTLE.finishMs)).toBe(false);
  });

  /**
   * (c) A REOPENING IS NOT ROOM. `decideCfbTopUp` reads SEATED money only — `cfbStakeOf(entry.core)`
   * for the core arm and the bucket's own emptiness for the fun arm — so neither a withdrawn verdict
   * nor a drop receipt can be mistaken for a bucket with space in it. C5(b) above pins the core half
   * against `stakeConflict` / `coreDropped`; this pins the FUN half against the channel that empties
   * that bucket, and pins that the grading state is not an input to the decision at all.
   *
   * THE FUN GATE IS NO LONGER EMPTINESS ALONE (note corrected 2026-09-06, S2). This paragraph
   * quoted it as `entry.funT.length === 0`, which is now only half of it: read this turn,
   * `decideCfbTopUp` names `cfbFunRefusedOf` beside that test, so an empty bucket carrying a merge
   * refusal receipt keeps the arm SHUT. The day driven below carries a SEATED parlay, so its
   * answers are unchanged by that narrowing and no assertion here moves; C7(b) drives the emptied
   * shape the narrowing exists for.
   */
  it("(c) neither a drop receipt nor a withdrawn verdict re-offers money the day already carries", () => {
    const funTix = ticket("cfb-2026-09-05-fun-1", CFB_PAPER.fun, [leg({ gkey: G1, side: "home", line: -40.5 })], "fun");
    const base: CfbLedgerEntry = { ...entry([p1], [funTix], GAMES), source: "server-lock" };
    const marked = {
      ...base,
      /* the merge seated ONE parlay and refused a rival one, with its receipt */
      funDropped: ["cfb-2026-09-05-topup1-fun-1"],
      funDroppedPL: { "cfb-2026-09-05-topup1-fun-1": { result: "lost", payout: 0, stake: 25 } },
    } as unknown as CfbLedgerEntry;

    const plainD = decideCfbTopUp(base, LATER);
    const markedD = decideCfbTopUp(marked, LATER);
    expect(plainD).toEqual(markedD);
    expect(markedD.fire).toBe(true);
    if (markedD.fire) {
      /* the seated parlay closes the fun arm — the refused one is NOT a second $25 to deploy */
      expect(markedD.fun).toBe(false);
      expect(markedD.core).toBe(true);
      expect(markedD.room).toBe(CFB_PAPER.daily - 25);
    }

    /* and the same day REOPENED answers identically: grading is not an input to the decision */
    const graded = overlayCfbGrading(null, gradeCfbEntry(base, FINALS, AFTER), base)!;
    const closed = decideCfbTopUp({ ...base, grading: graded }, LATER);
    const reopened = decideCfbTopUp({ ...base, grading: { ...graded, done: false } }, LATER);
    expect(closed).toEqual(plainD);
    expect(reopened).toEqual(plainD);
  });

  /**
   * (d) WHAT ACTUALLY BOUNDS THE $25 (mutation survivor R26). `planCfbTopUp` used to carry a
   * running-sum cap over `card.funT` behind `if (fun.length >= 1) break;`, which bounded the loop
   * to one iteration and left the sum at 0 when the cap was tested — so the cap degraded to a
   * per-ticket comparison no builder in this repo can fail, and a mutant deleting it survived. It
   * is gone; the seat is now one candidate, taken or not taken. The live bound is
   * `assertCfbCardMoney`'s `if (funSum > CFB_PAPER.fun + MONEY_EPS) {` reached through
   * `assertCfbEntryMoney` at the END of `applyCfbTopUp`, over the MERGED day — the only place the
   * day's real fun sum exists. This pin drives that bound directly, and drives the plan's shape.
   */
  it("(d) the fun allotment is bounded by the merged-day money guard, not by the plan's own arithmetic", () => {
    /* the guard fires on a SINGLE over-allotment parlay, not only on a second one */
    const over = ticket("cfb-2026-09-05-fun-1", CFB_PAPER.fun + 5, [leg({ gkey: G1, side: "home", line: -40.5 })], "fun");
    expect(() => assertCfbEntryMoney(entry([], [over], GAMES))).toThrow(/CFB MONEY GUARD/);
    expect(() => assertCfbEntryMoney(entry([], [over], GAMES))).toThrow(/fun money/);
    /* exactly the allotment is fine — the bound is a ceiling, not a band */
    const exact = ticket("cfb-2026-09-05-fun-1", CFB_PAPER.fun, [leg({ gkey: G1, side: "home", line: -40.5 })], "fun");
    expect(() => assertCfbEntryMoney(entry([], [exact], GAMES))).not.toThrow();

    /* and it is REACHED from the top-up write, over entry.funT and plan.fun together */
    const seated = ticket("cfb-2026-09-05-topup1-fun-1", CFB_PAPER.fun, [leg({ gkey: G2, side: "away", line: 28, cz: -106 })], "fun");
    expect(() => applyCfbTopUp(entry([], [exact], GAMES), planOf({ fun: [seated], funStake: CFB_PAPER.fun }), LATER, 1)).toThrow(/fun money/);
    /* onto an EMPTY bucket the same parlay is written, and the day carries exactly the allotment */
    const ok = applyCfbTopUp(entry([], [], GAMES), planOf({ fun: [seated], funStake: CFB_PAPER.fun }), LATER, 1);
    expect(ok.funT).toHaveLength(1);
    expect(ok.funT.reduce((s, t) => s + t.stake, 0)).toBe(CFB_PAPER.fun);

    /* THE PLAN'S OWN SHAPE, off a real board: at most ONE parlay, at exactly the allotment, and
       only onto a day whose bucket is empty — the three things the removed cap looked like it did */
    const b = buildCfbBoard({
      date: "2026-09-05",
      espnEvents: (j("espn-scoreboard-2026-09-05.json") as { events: unknown[] }).events,
      oddsEvents: j("odds-ncaaf-2026-09-05.json"),
      fpi: j("espn-fpi.json"),
      now: NOW,
      bankroll: 2500,
    });
    const empty = planCfbTopUp(b, entry([], [], GAMES), { now: NOW, bankroll: 2500, room: CFB_PAPER.daily, slots: CFB_RULES.tickets.max, n: 1 });
    expect(empty.fun.length).toBeLessThanOrEqual(1);
    for (const t of empty.fun) expect(t.stake).toBe(CFB_PAPER.fun);
    expect(empty.funStake).toBeLessThanOrEqual(CFB_PAPER.fun);
    expect(empty.fun.map((t) => t.id)).toEqual(empty.fun.length ? ["cfb-2026-09-05-topup1-fun-1"] : []);
    /* a day that already carries a parlay gets none, whatever the board offers */
    const held = planCfbTopUp(b, entry([], [exact], GAMES), { now: NOW, bankroll: 2500, room: CFB_PAPER.daily, slots: CFB_RULES.tickets.max, n: 1 });
    expect(held.fun).toHaveLength(0);
    expect(held.funStake).toBe(0);
  });
});

/* ==========================================================================================
 * C7 (INSTRUCTION 45, 2026-09-06, the closing round) — A REFUSED WAGER IS NEVER RE-OFFERED AS
 * ROOM, ON EITHER CHANNEL. Josh, verbatim: "Parlay Lab CFB should've been running the same $150
 * per day theoretical Core money and $25 Fun money per day".
 *
 * A merge that refuses a wager records it TWICE, on two channels written at different call sites
 * inside `unionCore` / `unionFun` (src/lib/ledger-merge.ts, read this turn): an ID LIST
 * (`coreDropped` / `funDropped`) and a RECEIPT MAP carrying the money (`coreDroppedPL` /
 * `funDroppedPL`, `{ result, payout, stake }` per id). `mergeDay` accrues both from BOTH copies,
 * so a day that has been through several merges can carry either one without the other — and a
 * blob written by an older deploy carries whichever channel existed then.
 *
 * C5(b) and C6(c) above pin the ID-LIST channel. THE RECEIPT CHANNEL WAS UNPINNED, and it is the
 * one that carries a `stake` — so it is the only one a reader could add to, or subtract from, the
 * day's money. Both halves are pinned here:
 *
 *   (a) THE CORE. `decideCfbTopUp` sizes the day off `cfbStakeOf(entry.core)` — the SEATED
 *       tickets. A receipt naming a ticket the day actually CARRIES (a stale marker an earlier
 *       merge left behind, kept alive on the receipt channel while the id list was cleared) must
 *       not hand that stake back as room, and a receipt naming a ticket the day does NOT carry
 *       must not be counted against it either. MUTATION-PROVED this turn: a variant of
 *       `decideCfbTopUp` reading `coreDroppedPL` to discount `staked` survives the whole CFB trio
 *       today and is killed by this pin.
 *
 *   (b) THE FUN BUCKET, which is the same property with a live defect behind it — see the S2
 *       decision recorded in `decideCfbTopUp`'s own `funOpen` block. The fun arm opens on an EMPTY
 *       bucket, and the merge can empty a bucket by REFUSING its wager against a `funCap` lower
 *       than the ticket's stake (`funCap`, src/lib/ledger-merge.ts, reads the largest recorded
 *       `fun` on either copy, bounded by CFB_PAPER.fun). Such a day carries no fun ticket and a
 *       fun drop receipt, and the arm re-opened on it: the server bought a priced board and seated
 *       a fresh $25 the next merge refuses again, on the same cap, for ever. DECIDED AND FIXED
 *       this turn — the reopen is BARRED on either channel, and (d) pins the SECOND gate, because
 *       the route calls `planCfbTopUp` on any fire, so a core-only fire would otherwise seat the
 *       parlay the decision had just refused.
 *
 * MUTATION-PROVED, both halves, this turn: with a variant of `decideCfbTopUp` discounting `staked`
 * by the `coreDroppedPL` stakes, the seven-file run answered "Tests 1 failed | 336 passed (337)"
 * twice, and the ONE failure was (a) — "expected { fire: true, room: 190, …(6) } to deeply equal
 * { fire: true, room: 125, …(6) }". Nothing else in the seven files sees the receipt channel.
 * ======================================================================================== */
describe("C7 (2026-09-06) — a refused wager is never re-offered as room, on either channel", () => {
  const LATER = Date.parse("2026-09-05T13:00:00Z");
  const p1 = ticket("cfb-2026-09-05-core-1", 25, [leg({ gkey: G1, side: "home", line: -40.5 })]);
  const funTix = ticket("cfb-2026-09-05-fun-1", CFB_PAPER.fun, [leg({ gkey: G2, side: "away", line: 28, cz: -106 })], "fun");
  const server = (over: Record<string, unknown> = {}, funT: CfbTicket[] = []): CfbLedgerEntry =>
    ({ ...entry([p1], funT, GAMES), source: "server-lock", ...over }) as unknown as CfbLedgerEntry;

  it("(a) a CORE drop RECEIPT is inert — even one naming a ticket the day actually carries", () => {
    const plain = decideCfbTopUp(server(), LATER);
    expect(plain.fire).toBe(true);
    if (plain.fire) expect(plain.room).toBe(CFB_PAPER.daily - 25);

    /* the receipt channel ALONE — no `coreDropped` id list beside it, which is the shape an older
       stored blob (and a day whose id list was cleared by a later merge seating the id) carries */
    const receiptOnly = server({
      coreDroppedPL: {
        /* a receipt for the ticket the day DOES carry: its $25 is money on the card, not room */
        "cfb-2026-09-05-core-1": { result: "won", payout: 47.73, stake: 25 },
        /* and one for a wager the day does NOT carry: not room either, and not exposure */
        "cfb-2026-09-05-core-9": { result: "lost", payout: 0, stake: 40 },
      },
    });
    expect((receiptOnly as unknown as Record<string, unknown>).coreDropped).toBeUndefined();
    const d = decideCfbTopUp(receiptOnly, LATER);
    expect(d).toEqual(plain);
    if (d.fire) {
      expect(d.room).toBe(CFB_PAPER.daily - 25); // the seated stake, once
      expect(d.room).not.toBe(CFB_PAPER.daily); // ...not handed back by its own receipt
      expect(d.room).not.toBe(CFB_PAPER.daily - 65); // ...and the refused $40 is not charged
      expect(d.slots).toBe(CFB_RULES.tickets.max - 1);
    }

    /* both channels together, and the id list alone, answer the same — one property, three shapes */
    expect(decideCfbTopUp(server({ coreDropped: ["cfb-2026-09-05-core-9"] }), LATER)).toEqual(plain);
    expect(
      decideCfbTopUp(
        server({ coreDropped: ["cfb-2026-09-05-core-9"], coreDroppedPL: { "cfb-2026-09-05-core-9": { result: "lost", payout: 0, stake: 40 } } }),
        LATER,
      ),
    ).toEqual(plain);
  });

  it("(b) a fun bucket the merge EMPTIED does not reopen the fun arm — on either channel", () => {
    /* the day the merge left: the $25 parlay refused against a lower recorded `fun`, so the bucket
       is empty and the loss is named. The arm must stay SHUT — the money was refused, not unspent. */
    const idList = server({ funDropped: ["cfb-2026-09-05-fun-1"] });
    const receipt = server({ funDroppedPL: { "cfb-2026-09-05-fun-1": { result: "lost", payout: 0, stake: CFB_PAPER.fun } } });
    const both = server({
      funDropped: ["cfb-2026-09-05-fun-1"],
      funDroppedPL: { "cfb-2026-09-05-fun-1": { result: "lost", payout: 0, stake: CFB_PAPER.fun } },
    });
    for (const e of [idList, receipt, both]) {
      expect(e.funT).toHaveLength(0);
      const d = decideCfbTopUp(e, LATER);
      expect(d.fire).toBe(true);
      if (d.fire) {
        expect(d.fun).toBe(false); // the refused $25 is not a $25 to deploy
        expect(d.core).toBe(true); // and the core arm is untouched by the fun channel
      }
    }

    /* the ordinary empty bucket — no refusal anywhere — still opens the arm, so (b) narrows the
       gate rather than closing it: this is the second half of Josh's sentence and it still fires */
    const clean = decideCfbTopUp(server(), LATER);
    expect(clean.fire).toBe(true);
    if (clean.fire) expect(clean.fun).toBe(true);

    /* and a day that SEATED its parlay is unchanged by a receipt for the rival one it refused */
    const seatedD = decideCfbTopUp(server({}, [funTix]), LATER);
    const seatedMarked = decideCfbTopUp(server({ funDropped: ["cfb-2026-09-05-topup1-fun-1"] }, [funTix]), LATER);
    expect(seatedMarked).toEqual(seatedD);
    if (seatedD.fire) expect(seatedD.fun).toBe(false);
  });

  it("(c) the refusal names the RIGHT reason — a refused bucket is not a bucket carrying a parlay", () => {
    /* a FULL day is 5 × $50 = $250 since 2026-09-08 (was 6 × $25 = $150) */
    const full = Array.from({ length: 5 }, (_, i) => ticket(`cfb-2026-09-05-core-${i + 1}`, 50, [leg({ gkey: G1, side: "home", line: -40.5, lkey: `k${i}` })]));
    const deployed = (over: Record<string, unknown>, funT: CfbTicket[] = []) =>
      ({ ...entry(full, funT, GAMES), source: "server-lock", ...over }) as unknown as CfbLedgerEntry;

    /* the bucket that CARRIES its parlay keeps the sentence tests/cfb-lock-route.test.ts pins */
    const held = decideCfbTopUp(deployed({}, [funTix]), LATER);
    expect(held.fire).toBe(false);
    if (!held.fire) expect(held.reason).toMatch(/fun money is already on a parlay/);

    /* the bucket the merge EMPTIED must not claim a parlay stands on it */
    const refused = decideCfbTopUp(deployed({ funDropped: ["cfb-2026-09-05-fun-1"] }), LATER);
    expect(refused.fire).toBe(false);
    if (!refused.fire) {
      expect(refused.reason).not.toMatch(/already on a parlay/);
      expect(refused.reason).toMatch(/refused/i);
    }
  });

  /**
   * (d) THE SEAT OBEYS THE SAME BAR. `decideCfbTopUp` answers per ARM, but the route acts on a
   * FIRE: it calls `planCfbTopUp` whenever the decision fires, whichever arm opened it, and that
   * function takes its fun candidate on the bucket's own emptiness. So a day whose CORE arm is open
   * and whose fun arm the receipt just shut would still have had a parlay seated onto the emptied
   * bucket — the exact money the merge refused, back on the card. The gate reads `cfbFunRefusedOf`
   * too. C6(d) above pins the ordinary bounds of that seat; this pins the refusal bar.
   */
  it("(d) planCfbTopUp does not seat a parlay onto a bucket the merge emptied — either channel", () => {
    const NOW = Date.parse("2026-09-05T12:00:00Z");
    const jf = (f: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "cfb", f), "utf8"));
    const b = buildCfbBoard({
      date: "2026-09-05",
      espnEvents: (jf("espn-scoreboard-2026-09-05.json") as { events: unknown[] }).events,
      oddsEvents: jf("odds-ncaaf-2026-09-05.json"),
      fpi: jf("espn-fpi.json"),
      now: NOW,
      bankroll: 2500,
    });
    const plan = (e: CfbLedgerEntry) => planCfbTopUp(b, e, { now: NOW, bankroll: 2500, room: CFB_PAPER.daily, slots: CFB_RULES.tickets.max, n: 1 });

    /* the control: a clean empty bucket on this very board DOES get its parlay, so the assertions
       below are a bar and not a board that had nothing to offer in the first place */
    const clean = plan(entry([], [], GAMES));
    expect(clean.fun).toHaveLength(1);
    expect(clean.funStake).toBe(CFB_PAPER.fun);

    const emptied = (over: Record<string, unknown>) => ({ ...entry([], [], GAMES), ...over }) as unknown as CfbLedgerEntry;
    const shapes = [
      emptied({ funDropped: ["cfb-2026-09-05-fun-1"] }),
      emptied({ funDroppedPL: { "cfb-2026-09-05-fun-1": { result: "lost", payout: 0, stake: CFB_PAPER.fun } } }),
      emptied({
        funDropped: ["cfb-2026-09-05-fun-1"],
        funDroppedPL: { "cfb-2026-09-05-fun-1": { result: "lost", payout: 0, stake: CFB_PAPER.fun } },
      }),
    ];
    for (const e of shapes) {
      expect(e.funT).toHaveLength(0);
      const p = plan(e);
      expect(p.fun).toHaveLength(0);
      expect(p.funStake).toBe(0);
      /* and the CORE half of the same plan is untouched by the fun channel — the bar is not a stop */
      expect(p.tickets.length).toBe(clean.tickets.length);
    }
  });

  /**
   * (e) NO SERVER PATH MINTS ABOVE EITHER ALLOTMENT (S4(c) of the closing round, pinned because it
   * had no pin of its own on the CORE side — C6(d) above drives the FUN half). Two bounds, both
   * read this turn: `decideCfbTopUp` derives `room` from `CFB_PAPER.daily` less `cfbStakeOf` over
   * the SEATED core, so it can never OFFER more than the allotment; and `applyCfbTopUp` ends with
   * `assertCfbEntryMoney` over the MERGED day, which throws through `assertCfbCardMoney`'s
   * `if (coreSum > CFB_PAPER.daily + MONEY_EPS) {` — grepped this turn. The decision is advice;
   * the guard is the bound.
   */
  it("(e) the core allotment bounds the offer AND the write — advice, then a loud guard", () => {
    /* the full $250 is 5 × $50 since 2026-09-08 (was 6 × $25 = $150) */
    const six = Array.from({ length: 5 }, (_, i) => ticket(`cfb-2026-09-05-core-${i + 1}`, 50, [leg({ gkey: G1, side: "home", line: -40.5, lkey: `e${i}` })]));
    const deployed = { ...entry(six, [], GAMES), source: "server-lock" } as unknown as CfbLedgerEntry;

    const d = decideCfbTopUp(deployed, LATER);
    expect(d.fire).toBe(true); // the FUN arm is still open on this day — the second half of the instruction
    if (d.fire) {
      expect(d.room).toBe(0);
      expect(d.core).toBe(false); // ...and the core arm offers nothing
      expect(d.room).toBeLessThanOrEqual(CFB_PAPER.daily);
    }
    /* the widest the offer can ever be is the allotment itself, on a day carrying no core at all */
    const bare = decideCfbTopUp({ ...entry([], [], GAMES), source: "server-lock" } as unknown as CfbLedgerEntry, LATER);
    expect(bare.fire).toBe(true);
    if (bare.fire) expect(bare.room).toBe(CFB_PAPER.daily);

    /* and a plan that ignores the advice does not become the record: the write refuses, loudly */
    const over: CfbTopUpPlan = {
      tickets: [ticket("cfb-2026-09-05-topup1-core-1", 25, [leg({ gkey: G2, side: "away", line: 28, cz: -106 })])],
      stake: 25,
      fun: [],
      funStake: 0,
      games: {},
      pricedAhead: 1,
    };
    expect(() => applyCfbTopUp(deployed, over, LATER, 1)).toThrow(/CFB MONEY GUARD/);
    expect(() => applyCfbTopUp(deployed, over, LATER, 1)).toThrow(/core allotment/);
    /* the same plan onto a day with room is written, and lands INSIDE the allotment */
    const room = { ...entry(six.slice(0, 4), [], GAMES), source: "server-lock" } as unknown as CfbLedgerEntry;
    const ok = applyCfbTopUp(room, over, LATER, 1);
    expect(ok.core.reduce((a, t) => a + t.stake, 0)).toBeLessThanOrEqual(CFB_PAPER.daily);
  });

  /**
   * (f) A DAY THAT REOPENS CONVERGES — IT DOES NOT CYCLE (S4(a) of the closing round). The server
   * rail's loop is grade -> `overlayCfbGrading` -> merge, and a reopened day runs it again on the
   * next poke. What must be true is that the loop reaches a FIXED POINT: a day whose inputs stop
   * changing must stop changing too, or the desk re-writes the same date for ever and the settle
   * queue never frees its two read slots.
   *
   * Six cycles, driven here, with the finals arriving late on the third — the shape a reopen has.
   * The assertion is byte equality of the whole entry from one cycle to the next once the inputs
   * settle, which is stronger than checking any one field and is what "converges" means.
   *
   * WHAT THIS DOES NOT CLAIM: that the fixed point is the RIGHT verdict. It is not, on one shape,
   * and that is reported rather than pinned — see the run report for the 48-hour void that
   * `pickBase` restores over a corroborated correction (src/lib/ledger-merge.ts, not this round's
   * file). This pins the loop's TERMINATION, which is the half that is true.
   */
  it("(f) six merge/grade cycles on the server rail reach a fixed point", () => {
    const p1c = ticket("cfb-2026-09-05-core-1", 25, [leg({ gkey: G1, side: "home", line: -40.5 })]);
    const p2c = ticket("cfb-2026-09-05-core-2", 25, [leg({ gkey: G2, side: "away", line: 28, cz: -106 })]);
    const partial: CfbFinals = { [G1]: fin(52, 7) };
    const complete: CfbFinals = { [G1]: fin(52, 7), [G2]: fin(10, 38) };

    let e = { ...entry([p1c, p2c], [], GAMES), source: "server-lock" } as unknown as CfbLedgerEntry;
    const fp = (x: CfbLedgerEntry) => JSON.stringify(x);
    const stable: boolean[] = [];
    for (let i = 1; i <= 6; i++) {
      const now = AFTER + i * 3_600_000;
      const fresh = gradeCfbEntry(e, i <= 2 ? partial : complete, now);
      const graded = { ...e, grading: overlayCfbGrading(e.grading, fresh, e) } as CfbLedgerEntry;
      const before = fp(e);
      e = ((mergeLedgers([e as unknown as SyncEntry], [graded as unknown as SyncEntry])[0] as CfbLedgerEntry | undefined) ?? graded);
      stable.push(fp(e) === before);
    }
    /* cycle 1 writes the first verdicts and cycle 3 takes the late final; every OTHER cycle is a
       no-op, and the last three in a row are the fixed point */
    expect(stable).toEqual([false, true, false, true, true, true]);
    expect(e.grading?.done).toBe(true);
    expect(Object.keys(e.grading?.tickets ?? {}).sort()).toEqual([p1c.id, p2c.id]);
    /* the money never moved through any of it */
    expect(e.core.reduce((a, t) => a + t.stake, 0)).toBe(50);
    expect(e.funT).toHaveLength(0);
    /* and a settled day stops being a candidate at all — the queue's slots come back */
    expect(cfbSettleCandidate(e, AFTER + 7 * 3_600_000)).toBe(false);
  });
});
