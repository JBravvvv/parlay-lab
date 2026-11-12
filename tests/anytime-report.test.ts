import { describe, expect, it } from "vitest";
import { decide } from "@/lib/anytime/engine";
import type { LedgerRow } from "@/lib/anytime/ledger";
import { bankOf, calibrationOf, clvAtOwnBook, intervalOf, payDec, reportOf, returnOf, statsOf } from "@/lib/anytime/report";
import type { Candidate, CloseRecord, GradeResult, Trigger } from "@/lib/anytime/types";
import { excludedBy } from "@/lib/az/exclusions";
import { cand, T0 } from "./helpers/anytime";

/* EVERY NUMBER THE UI SHOWS COMES FROM HERE, AND FROM NOTHING BUT THE RAW LEDGER ROWS. */

let seq = 0;
type Extra = { gradedAt?: string; close?: CloseRecord["books"]; voided?: boolean; trigger?: Trigger; reason?: string };

function row(over: Partial<Candidate>, result: GradeResult | null, extra: Extra = {}): LedgerRow {
  seq++;
  const pick = decide({ candidates: [cand({ eventId: `e${seq}`, ...over })], now: T0, runId: "r", trigger: extra.trigger ?? "manual-api", families: new Map(), excluded: excludedBy(), kellyBankroll: 100, kellyOpenByEvent: new Map() }).picks[0];
  if (!pick) throw new Error("fixture produced no pick");
  return {
    pick,
    grade: result ? { id: pick.id, result, gradedAt: extra.gradedAt ?? "2026-11-16T02:00:00Z", source: "espn", ...(extra.reason ? { reason: extra.reason } : {}) } : null,
    close: extra.close ? { id: pick.id, at: "2026-11-15T21:20:00Z", snapshotId: "s", books: extra.close, fairP: null, fairN: 2, final: true } : null,
    void: extra.voided ? { id: pick.id, reason: "not_available_az", at: "2026-11-15T18:00:00Z", by: "owner" } : null,
  };
}

const FD_105 = {}; // the default fixture: FanDuel -105 (DraftKings -110), model 55%
const DK_120 = { model: { win: 0.5, push: 0 }, quotes: { draftkings: { price: 120, opp: -140 }, fanduel: { price: 115, opp: -135 } } };
const DK_108 = { quotes: { draftkings: { price: -108, opp: -112 }, fanduel: { price: -110, opp: -110 } } };
const FD_150 = { model: { win: 0.45, push: 0 }, quotes: { draftkings: { price: 140, opp: -170 }, fanduel: { price: 150, opp: -180 } } };

/** Seven rows: four settled, one open, one marked not-available-in-AZ, one postponed past the book's window. */
function ledger() {
  const a = row(FD_105, "won", { gradedAt: "2026-11-16T01:00:00Z" });
  const b = row(DK_120, "lost", { gradedAt: "2026-11-16T02:00:00Z", trigger: "cron" });
  const c = row(DK_108, "push", { gradedAt: "2026-11-16T03:00:00Z", trigger: "cron" });
  const d = row(FD_150, "won", { gradedAt: "2026-11-16T04:00:00Z", trigger: "event:line-move" });
  const e = row(FD_105, null);
  const f = row(FD_105, "won", { voided: true });
  const g = row(FD_105, "void", { reason: "postponed" });
  return { a, b, c, d, e, f, g, rows: [a, b, c, d, e, f, g] };
}

describe("profit is recomputed from the raw ledger, by hand", () => {
  it("the fixture books are what the test says they are", () => {
    const { a, b, c, d } = ledger();
    expect([a.pick.book, b.pick.book, c.pick.book, d.pick.book]).toEqual(["fanduel", "draftkings", "draftkings", "fanduel"]);
    expect([a.pick.price, b.pick.price, c.pick.price, d.pick.price]).toEqual([-105, 120, -108, 150]);
  });

  it("combined: units, ROI, win rate, sample, open and voided", () => {
    const { rows } = ledger();
    const rep = reportOf(rows, T0);
    const s = rep.byBook.combined;
    const profit = 100 / 105 - 1 + 0 + 1.5;
    expect(s).toMatchObject({ picks: 5, graded: 4, won: 2, lost: 1, push: 1, open: 1, flatStaked: 4 });
    expect(s.flatProfit).toBeCloseTo(profit, 12);
    expect(s.flatRoi?.mean).toBeCloseTo(profit / 4, 12);
    expect(s.flatRoi?.n).toBe(4);
    expect(s.flatRoi!.lo).toBeLessThan(s.flatRoi!.mean);
    expect(s.flatRoi!.hi).toBeGreaterThan(s.flatRoi!.mean);
    expect(s.winRate).toBeCloseTo(2 / 3, 12);
    expect(rep.voided).toBe(2);
  });

  it("DraftKings, FanDuel and combined are always all three, and the two books add up to the whole", () => {
    const { rows } = ledger();
    const { byBook } = reportOf(rows, T0);
    expect(Object.keys(byBook).sort()).toEqual(["combined", "draftkings", "fanduel"]);
    expect(byBook.fanduel).toMatchObject({ picks: 3, graded: 2, won: 2, lost: 0, push: 0, open: 1 });
    expect(byBook.fanduel.flatProfit).toBeCloseTo(100 / 105 + 1.5, 12);
    expect(byBook.draftkings).toMatchObject({ picks: 2, graded: 2, won: 0, lost: 1, push: 1, open: 0, winRate: 0 });
    expect(byBook.draftkings.flatProfit).toBe(-1);
    expect(byBook.draftkings.flatProfit + byBook.fanduel.flatProfit).toBeCloseTo(byBook.combined.flatProfit, 12);
    expect(byBook.draftkings.picks + byBook.fanduel.picks).toBe(byBook.combined.picks);
    expect(byBook.draftkings.kellyProfit + byBook.fanduel.kellyProfit).toBeCloseTo(byBook.combined.kellyProfit, 12);
  });

  it("an empty ledger still reports three books, with nothing invented", () => {
    const { byBook, bank, voided } = reportOf([], T0);
    for (const k of ["draftkings", "fanduel", "combined"] as const) expect(byBook[k]).toMatchObject({ picks: 0, graded: 0, flatProfit: 0, flatRoi: null, winRate: null, clv: null, kellyRoi: null, brierModel: null });
    expect(bank).toEqual({ kelly: 100, flat: 0, graded: 0 });
    expect(voided).toBe(0);
  });

  it("the Kelly bankroll: each pick's recorded stake times its return", () => {
    const { a, b, c, d, rows } = ledger();
    const s = statsOf(rows);
    const kp = a.pick.stakeKelly * (100 / 105) - b.pick.stakeKelly + 0 + d.pick.stakeKelly * 1.5;
    expect(s.kellyProfit).toBeCloseTo(kp, 12);
    expect(s.kellyStaked).toBeCloseTo(a.pick.stakeKelly + b.pick.stakeKelly + c.pick.stakeKelly + d.pick.stakeKelly, 12);
    expect(s.kellyRoi).toBeCloseTo(kp / s.kellyStaked, 12);
    expect(bankOf(rows)).toEqual({ kelly: Math.round((100 + kp) * 100) / 100, flat: Math.round((100 / 105 - 1 + 1.5) * 1e4) / 1e4, graded: 4 });
  });

  it("a win pays the American price taken, not a rounded decimal", () => {
    const { a } = ledger();
    expect(payDec(a.pick)).toBe(1 + 100 / 105);
    expect(a.pick.dec).not.toBe(payDec(a.pick)); // the stored display decimal is rounded
    expect(returnOf("won", payDec(a.pick))).toBeCloseTo(0.952381, 6);
    expect([returnOf("lost", 2.5), returnOf("push", 2.5), returnOf("void", 2.5)]).toEqual([-1, 0, 0]);
  });

  it("a voided pick and a postponed-void pick are in no number, whatever grade sits beside them", () => {
    const { f, g, rows } = ledger();
    const without = rows.filter((r) => r !== f && r !== g);
    expect(statsOf(rows)).toEqual(statsOf(without));
    expect(bankOf(rows)).toEqual(bankOf(without));
    expect(calibrationOf(rows)).toEqual(calibrationOf(without));
  });

  it("drawdown follows the order picks settled in", () => {
    const { rows } = ledger();
    /* +0.952, -1, 0, +1.5: peak 0.952, trough -0.048 */
    expect(statsOf(rows).maxDrawdown).toBeCloseTo(1, 12);
    expect(statsOf([...rows].reverse()).maxDrawdown).toBeCloseTo(1, 12);
  });

  it("profit and ROI sit side by side: more volume at a worse rate shows as a lower ROI", () => {
    const many = Array.from({ length: 40 }, (_, i) => row(FD_105, i % 2 ? "won" : "lost")); // 20-20 at -105
    const few = [row(FD_150, "won"), row(FD_150, "lost"), row(FD_150, "won")];
    const big = statsOf(many);
    const small = statsOf(few);
    expect(big.flatProfit).toBeCloseTo(20 * (100 / 105) - 20, 9);
    expect(small.flatProfit).toBeCloseTo(2, 12);
    expect(big.flatRoi!.mean).toBeLessThan(0);
    expect(small.flatRoi!.mean).toBeGreaterThan(big.flatRoi!.mean);
    /* three picks cannot carry a claim: the interval says so */
    expect(small.flatRoi!.lo).toBeLessThan(0);
  });
});

describe("the interval", () => {
  it("mean and a 95% normal interval; one value has no width; nothing has no interval", () => {
    expect(intervalOf([])).toBeNull();
    expect(intervalOf([0.4])).toEqual({ mean: 0.4, lo: 0.4, hi: 0.4, n: 1 });
    const i = intervalOf([1, -1, 1, -1])!;
    expect(i.mean).toBe(0);
    expect(i.hi).toBeCloseTo(1.96 * Math.sqrt(4 / 3 / 4), 12);
    expect(i.lo).toBeCloseTo(-i.hi, 12);
  });
});

describe("closing line value is judged at the book the pick was taken at", () => {
  it("own book's close decides it; the other book's close is reference only", () => {
    /* taken FanDuel -105. FanDuel closed -120 (beat it); DraftKings closed +100 (would have lost to it) */
    const r = row(FD_105, null, { close: { fanduel: { price: -120, opp: 100, line: -2.5 }, draftkings: { price: 100, opp: -120, line: -2.5 } } });
    const c = clvAtOwnBook(r);
    expect(c.priceClv).toBeCloseTo((1 + 100 / 105) / (1 + 100 / 120) - 1, 12);
    expect(c.priceClv).toBeGreaterThan(0);
    expect(c.otherPriceClv).toBeLessThan(0);
    expect(statsOf([r])).toMatchObject({ beatClose: 1, lineMoved: 0 });
    expect(statsOf([r]).priceClv?.mean).toBeCloseTo(c.priceClv!, 12);
    expect(statsOf([r]).clv?.mean).toBeCloseTo(c.clv!, 12);
  });

  it("no close at the pick's own book: no CLV, even though the other book closed", () => {
    const r = row(FD_105, null, { close: { draftkings: { price: -125, opp: 105, line: -2.5 } } });
    expect(clvAtOwnBook(r)).toMatchObject({ clv: null, priceClv: null, lineMoved: false });
    expect(clvAtOwnBook(r).otherPriceClv).toBeGreaterThan(0);
    expect(statsOf([r])).toMatchObject({ clv: null, priceClv: null, beatClose: null });
  });

  it("the own book closed on a different line: counted as moved, left out of the mean", () => {
    const moved = row(FD_105, null, { close: { fanduel: { price: -110, opp: -110, line: -3.5 } } });
    const same = row(FD_105, null, { close: { fanduel: { price: 100, opp: -120, line: -2.5 } } });
    const s = statsOf([moved, same]);
    expect(s.lineMoved).toBe(1);
    expect(s.priceClv?.n).toBe(1);
    expect(s.beatClose).toBe(0);
  });

  it("no close recorded: nothing claimed", () => {
    expect(clvAtOwnBook(row(FD_105, null))).toEqual({ clv: null, priceClv: null, lineMoved: false, otherPriceClv: null });
  });
});

describe("calibration: the model beside the market on the same picks", () => {
  it("buckets by predicted probability; pushes, opens and voids are not in the table", () => {
    const { rows } = ledger();
    const table = calibrationOf(rows, "model");
    expect(table.reduce((a, b) => a + b.n, 0)).toBe(3);
    const at = (lo: number) => table.find((b) => b.lo === lo)!;
    expect(at(0.55)).toMatchObject({ n: 1, actual: 1 });
    expect(at(0.5)).toMatchObject({ n: 1, actual: 0 });
    expect(at(0.45)).toMatchObject({ n: 1, actual: 1 });
    expect(at(0.55).predicted).toBeCloseTo(0.55, 4);
    expect(at(0.7)).toMatchObject({ n: 0, predicted: null, actual: null, hi: 1 });
  });

  it("Brier score and log loss for the model and for the two-book no-vig number", () => {
    const { a, b, d, rows } = ledger();
    const s = statsOf(rows);
    const dec = [a, b, d];
    const y = [1, 0, 1];
    const brier = (ps: number[]) => ps.reduce((acc, p, i) => acc + (p - y[i]) ** 2, 0) / 3;
    const ll = (ps: number[]) => ps.reduce((acc, p, i) => acc - Math.log(y[i] ? p : 1 - p), 0) / 3;
    expect(s.brierModel).toBeCloseTo(brier(dec.map((r) => r.pick.modelP)), 12);
    expect(s.brierMarket).toBeCloseTo(brier(dec.map((r) => r.pick.fairP)), 12);
    expect(s.logLossModel).toBeCloseTo(ll(dec.map((r) => r.pick.modelP)), 12);
    expect(s.logLossMarket).toBeCloseTo(ll(dec.map((r) => r.pick.fairP)), 12);
    expect(s.brierModel).toBeCloseTo((0.45 ** 2 + 0.5 ** 2 + 0.55 ** 2) / 3, 6);
  });

  it("claimed edge is the average over every live pick, settled or not", () => {
    const { rows } = ledger();
    const live = rows.slice(0, 5);
    expect(statsOf(rows).claimedEv).toBeCloseTo(live.reduce((a, r) => a + r.pick.ev, 0) / 5, 12);
    expect(statsOf(rows).claimedPriceEv).toBeCloseTo(live.reduce((a, r) => a + r.pick.priceEv, 0) / 5, 12);
  });
});

describe("the splits", () => {
  it("by sport, market, trigger, model version, basis and engine; every split's picks add up to the whole", () => {
    const { rows } = ledger();
    const rep = reportOf(rows, T0);
    expect(rep.bySport.map((s) => s.key)).toEqual(["nfl"]);
    expect(rep.byMarket.map((s) => s.key)).toEqual(["nfl:spread"]);
    expect(rep.byTrigger.map((s) => [s.key, s.stats.picks])).toEqual([["cron", 2], ["event:line-move", 1], ["manual-api", 2]]);
    expect(rep.byModel.map((s) => s.key)).toEqual(["t-1"]);
    for (const split of [rep.bySport, rep.byMarket, rep.byTrigger, rep.byModel, rep.byBasis, rep.byEngine]) {
      expect(split.reduce((a, s) => a + s.stats.picks, 0)).toBe(rep.byBook.combined.picks);
      expect(split.reduce((a, s) => a + s.stats.flatProfit, 0)).toBeCloseTo(rep.byBook.combined.flatProfit, 12);
    }
    expect(rep.generatedAt).toBe(new Date(T0).toISOString());
  });

  it("a market-only pick is split from a model pick, so line shopping is never reported as model edge", () => {
    const priceOnly = row({ model: { win: 0.5, push: 0 }, modelKind: "market-only", modelVersion: "fb-market-1", quotes: { draftkings: { price: 105, opp: -125 }, fanduel: { price: -125, opp: 105 } } }, "won");
    const modelled = row(FD_105, "lost");
    const rep = reportOf([priceOnly, modelled], T0);
    expect(rep.byBasis.map((s) => [s.key, s.stats.picks, s.stats.won])).toEqual([["model", 1, 0], ["price", 1, 1]]);
    expect(rep.byModel.map((s) => s.key)).toEqual(["fb-market-1", "t-1"]);
  });
});
