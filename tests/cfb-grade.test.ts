import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CFB_UNGRADABLE_MS, gradeCfbEntry, gradeCfbLeg } from "@/lib/cfb/grade";
import { cfbBankroll, cfbExposureOn, cfbLedgerStats, lockCfbCard, validateCfbLedger } from "@/lib/cfb/ledger";
import { buildCfbBoard } from "@/lib/cfb/model";
import { buildCfbCard } from "@/lib/cfb/card";
import { CFB_BANK_BASE, CFB_PAPER } from "@/lib/cfb/rules";
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
  it("ungradable: a game missing from the finals more than 48 h after kickoff; pending before that", () => {
    const e = entry([ticket("u1", 10, [leg({ gkey: G1 })])], [], GAMES);
    const soon = gradeCfbEntry(e, {}, Date.parse("2026-09-07T15:59:00Z"));
    expect(soon.tickets.u1.result).toBe("pending");
    expect(soon.done).toBe(false);
    const late = gradeCfbEntry(e, {}, Date.parse("2026-09-05T16:00Z") + CFB_UNGRADABLE_MS + 60_000);
    expect(late.tickets.u1).toMatchObject({ result: "ungradable", payout: 0 });
    expect(late.legs[e.core[0].legs[0].lkey].result).toBe("ungradable");
    expect(late.done).toBe(true);
    // a postponed game that long after kickoff is void too; a merely late final is not
    const post = gradeCfbEntry(e, { [G1]: fin(0, 0, false, "postponed") }, Date.parse("2026-09-08T00:00Z"));
    expect(post.tickets.u1.result).toBe("ungradable");
    const live = gradeCfbEntry(e, { [G1]: fin(14, 7, false, "live") }, Date.parse("2026-09-08T00:00Z"));
    expect(live.tickets.u1.result).toBe("pending");
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
    expect(locked.daily).toBe(150);
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
