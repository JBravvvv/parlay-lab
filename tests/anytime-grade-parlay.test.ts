import { describe, expect, it } from "vitest";
import { decide } from "@/lib/anytime/engine";
import { excludedBy } from "@/lib/az/exclusions";
import { HOUSE_RULES, gradeOf, gradeSide, houseRuleOf, voidDeadline, type FinalScore } from "@/lib/anytime/grade";
import { bestParlay, priceParlayAt, type ParlayLeg } from "@/lib/anytime/parlay";
import type { PickRecord } from "@/lib/anytime/types";
import { cand, T0 } from "./helpers/anytime";

/* GRADING BY THE PICK'S OWN BOOK, AND PARLAYS INSIDE ONE BOOK. */

const pickOf = (over: Parameters<typeof cand>[0] = {}): PickRecord =>
  decide({ candidates: [cand(over)], now: T0, runId: "r1", trigger: "manual-api", families: new Map(), excluded: excludedBy(), kellyBankroll: 100, kellyOpenByEvent: new Map() }).picks[0];
const at = (p: PickRecord, book: "draftkings" | "fanduel"): PickRecord => ({ ...p, book, otherBook: book === "draftkings" ? "fanduel" : "draftkings" });
const fin = (home: number, away: number, over: Partial<FinalScore> = {}): FinalScore => ({ home, away, final: true, status: "final", ...over });

describe("settling a side from the final score", () => {
  const side = (market: string, s: string, line: number | null) => ({ market, side: s, line, book: "draftkings" as const, sport: "nfl" });

  it("spread: cover, miss, and a landing exactly on the number is a push", () => {
    expect(gradeSide(side("spread", "home", -2.5), { home: 24, away: 21 })).toBe("won");
    expect(gradeSide(side("spread", "home", -3.5), { home: 24, away: 21 })).toBe("lost");
    expect(gradeSide(side("spread", "home", -3), { home: 24, away: 21 })).toBe("push");
    expect(gradeSide(side("spread", "away", 3), { home: 24, away: 21 })).toBe("push");
    expect(gradeSide(side("spread", "away", 3.5), { home: 24, away: 21 })).toBe("won");
    expect(gradeSide(side("spread", "away", 2.5), { home: 24, away: 21 })).toBe("lost");
  });

  it("total: over, under, push on the number; overtime points are in the final score", () => {
    expect(gradeSide(side("total", "over", 44.5), { home: 24, away: 21 })).toBe("won");
    expect(gradeSide(side("total", "under", 44.5), { home: 24, away: 21 })).toBe("lost");
    expect(gradeSide(side("total", "over", 45), { home: 24, away: 21 })).toBe("push");
    expect(gradeSide(side("total", "under", 45), { home: 24, away: 21 })).toBe("push");
    expect(HOUSE_RULES.draftkings.nfl.overtimeCounts && HOUSE_RULES.fanduel.nfl.overtimeCounts).toBe(true);
  });

  it("moneyline: winner, loser, and an NFL tie is refunded", () => {
    expect(gradeSide(side("ml", "home", null), { home: 24, away: 21 })).toBe("won");
    expect(gradeSide(side("ml", "away", null), { home: 24, away: 21 })).toBe("lost");
    expect(gradeSide(side("ml", "home", null), { home: 20, away: 20 })).toBe("push");
  });

  it("what it cannot settle it does not guess at", () => {
    expect(gradeSide(side("player_pass_yds", "over", 250.5), { home: 24, away: 21 })).toBeNull();
    expect(gradeSide(side("spread", "over", -2.5), { home: 24, away: 21 })).toBeNull();
    expect(gradeSide(side("spread", "home", null), { home: 24, away: 21 })).toBeNull();
    expect(gradeSide(side("ml", "home", null), { home: Number.NaN, away: 21 })).toBeNull();
    expect(gradeSide({ ...side("ml", "home", null), sport: "curling" }, { home: 3, away: 1 })).toBeNull();
  });
});

describe("a postponed game is settled by the rule of the book the pick was taken at", () => {
  /* Sunday 2026-11-15, 4:25 pm Eastern */
  const start = Date.parse("2026-11-15T21:25:00Z");
  const dk = houseRuleOf("draftkings", "nfl")!;
  const fd = houseRuleOf("fanduel", "nfl")!;

  it("DraftKings: 48 hours from the scheduled start", () => {
    expect(voidDeadline(dk, start)).toBe(start + 48 * 3600_000);
  });

  it("FanDuel: the end of the scheduling week, the next Thursday 00:00 Eastern", () => {
    expect(new Date(voidDeadline(fd, start)).toISOString()).toBe("2026-11-19T05:00:00.000Z");
    /* a Thursday-night game's week runs to the FOLLOWING Thursday */
    expect(new Date(voidDeadline(fd, Date.parse("2026-11-13T01:15:00Z"))).toISOString()).toBe("2026-11-19T05:00:00.000Z");
    /* a Monday-night game: three days */
    expect(new Date(voidDeadline(fd, Date.parse("2026-11-17T01:15:00Z"))).toISOString()).toBe("2026-11-19T05:00:00.000Z");
    /* summer time: Thursday 00:00 EDT is 04:00Z */
    expect(new Date(voidDeadline(fd, Date.parse("2026-09-13T17:00:00Z"))).toISOString()).toBe("2026-09-17T04:00:00.000Z");
  });

  it("the table marks itself unverified until the books' live rule pages are read", () => {
    for (const b of ["draftkings", "fanduel"] as const) for (const s of ["nfl", "cfb"]) expect(HOUSE_RULES[b][s].verified).toBe(false);
  });

  it("played three days late: void at DraftKings, graded at FanDuel", () => {
    const p = pickOf();
    const late = fin(24, 21, { start: "2026-11-18T23:00:00Z" });
    const now = Date.parse("2026-11-19T03:00:00Z");
    expect(gradeOf(at(p, "draftkings"), late, now, "espn")).toMatchObject({ result: "void", reason: "postponed" });
    expect(gradeOf(at(p, "fanduel"), late, now, "espn")).toMatchObject({ result: "won" });
  });

  it("played a week late: void at both", () => {
    const p = pickOf();
    const late = fin(24, 21, { start: "2026-11-22T21:25:00Z" });
    for (const b of ["draftkings", "fanduel"] as const) expect(gradeOf(at(p, b), late, Date.parse("2026-11-23T03:00:00Z"), "espn")?.result).toBe("void");
  });

  it("postponed and not yet replayed: open until that book's window closes, then void", () => {
    const p = pickOf();
    const pp: FinalScore = { home: 0, away: 0, final: false, status: "postponed" };
    expect(gradeOf(at(p, "draftkings"), pp, start + 47 * 3600_000, "espn")).toBeNull();
    expect(gradeOf(at(p, "draftkings"), pp, start + 49 * 3600_000, "espn")).toMatchObject({ result: "void", reason: "postponed" });
    expect(gradeOf(at(p, "fanduel"), pp, start + 49 * 3600_000, "espn")).toBeNull();
    expect(gradeOf(at(p, "fanduel"), pp, Date.parse("2026-11-19T05:00:01Z"), "espn")?.result).toBe("void");
  });

  it("a game in progress, a missing game and an unknown score are left open", () => {
    const p = pickOf();
    expect(gradeOf(p, { home: 14, away: 7, final: false, status: "live" }, start + 3600_000, "espn")).toBeNull();
    expect(gradeOf(p, undefined, start + 10 * 86_400_000, "espn")).toBeNull();
  });

  it("an on-time final is graded with the score it was read from", () => {
    const g = gradeOf(pickOf(), fin(24, 21, { start: "2026-11-15T21:25:00Z" }), start + 4 * 3600_000, "espn");
    expect(g).toMatchObject({ result: "won", detail: "21-24 (away-home)", source: "espn" });
  });
});

describe("parlays never leave one book", () => {
  const leg = (eventId: string, dk: number | null, fd: number | null, p = 0.55): ParlayLeg => ({ eventId, selection: `sel-${eventId}`, p, prices: { ...(dk != null ? { draftkings: dk } : {}), ...(fd != null ? { fanduel: fd } : {}) } });

  it("prices a cross-game parlay with THAT book's leg prices", () => {
    const legs = [leg("a", -110, -105), leg("b", +120, +115)];
    const dk = priceParlayAt(legs, "draftkings");
    const fd = priceParlayAt(legs, "fanduel");
    expect(dk).toMatchObject({ ok: true, book: "draftkings", legs: 2 });
    expect(dk.ok && dk.dec).toBeCloseTo((1 + 100 / 110) * 2.2, 9);
    expect(fd.ok && fd.dec).toBeCloseTo((1 + 100 / 105) * 2.15, 9);
    expect(dk.ok && dk.p).toBeCloseTo(0.3025, 9);
    expect(dk.ok && dk.ev).toBeCloseTo(0.3025 * (1 + 100 / 110) * 2.2 - 1, 9);
  });

  it("never mixes: the best leg prices sit at different books, and the ticket still uses one book's prices", () => {
    const legs = [leg("a", -110, -105), leg("b", +120, +115)];
    const mixed = (1 + 100 / 105) * 2.2; // FanDuel's leg a with DraftKings' leg b: not a real ticket
    const best = bestParlay(legs);
    expect(best.ok).toBe(true);
    if (best.ok) {
      expect(best.dec).toBeLessThan(mixed);
      expect([(1 + 100 / 110) * 2.2, (1 + 100 / 105) * 2.15]).toContain(best.dec);
      expect(best.book).toBe("draftkings");
    }
  });

  it("legs that are not all at one book are not a parlay", () => {
    const split = [leg("a", -110, null), leg("b", null, +115)];
    expect(priceParlayAt(split, "draftkings")).toMatchObject({ ok: false, reason: "leg_not_at_book" });
    expect(priceParlayAt(split, "fanduel")).toMatchObject({ ok: false, reason: "leg_not_at_book" });
    expect(bestParlay(split)).toMatchObject({ ok: false, reason: "leg_not_at_book" });
  });

  it("takes the one book that has every leg", () => {
    const legs = [leg("a", -110, -105), leg("b", null, +115)];
    expect(bestParlay(legs)).toMatchObject({ ok: true, book: "fanduel" });
  });

  it("refuses any other book, as the ticket's book or as a leg's price", () => {
    const legs = [leg("a", -110, -105), leg("b", +120, +115)];
    for (const b of ["williamhill_us", "betmgm", "pinnacle", "best", ""]) expect(priceParlayAt(legs, b)).toMatchObject({ ok: false, reason: "foreign_book" });
    const tainted = [leg("a", -110, -105), { ...leg("b", +120, +115), prices: { draftkings: 120, williamhill_us: 140 } }];
    expect(priceParlayAt(tainted, "draftkings")).toMatchObject({ ok: false, reason: "foreign_book", detail: "williamhill_us" });
    expect(bestParlay(tainted)).toMatchObject({ ok: false, reason: "foreign_book" });
  });

  it("a same-game parlay is not priced by multiplying legs: refused without the book's own price, and no EV is claimed with it", () => {
    const sgp = [leg("a", -110, -105), { ...leg("a", +120, +115), selection: "other leg, same game" }];
    expect(priceParlayAt(sgp, "draftkings")).toMatchObject({ ok: false, reason: "same_game_needs_book_price" });
    expect(bestParlay(sgp)).toMatchObject({ ok: false, reason: "same_game_needs_book_price" });
    const quoted = priceParlayAt(sgp, "draftkings", 3.4);
    expect(quoted).toMatchObject({ ok: true, book: "draftkings", dec: 3.4 });
    expect(quoted.ok && Number.isNaN(quoted.ev) && Number.isNaN(quoted.p)).toBe(true);
    expect(priceParlayAt(sgp, "draftkings", 1)).toMatchObject({ ok: false, reason: "same_game_needs_book_price" });
  });

  it("one leg is not a parlay; a leg with no probability is refused", () => {
    expect(priceParlayAt([leg("a", -110, -105)], "draftkings")).toMatchObject({ ok: false, reason: "too_few_legs" });
    expect(priceParlayAt([leg("a", -110, -105), leg("b", +120, +115, 1.2)], "draftkings")).toMatchObject({ ok: false, reason: "bad_leg" });
  });
});
