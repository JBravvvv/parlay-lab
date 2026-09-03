import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { settlingDec, ticketPayout } from "@/lib/ticket-payout";

/**
 * WON / PAID ON EVERY PARLAY (2026-09-02, Josh's word, verbatim: "All of the parlays on
 * builder, ledger etc should have 'Won' and 'Paid'"). The pair is the calculator's
 * wins/pays before a grade and the actual won/paid after it.
 */
describe("ticketPayout — wins/pays before the grade, won/paid after it", () => {
  it("pending: potential at the Caesars decimal, cents rounded once", () => {
    expect(ticketPayout({ stake: 10, czDec: 3 })).toEqual({ settled: false, wins: 20, pays: 30 });
    // $25 at 1.6667 → gross 41.6675 → pays 41.67, wins 16.67
    expect(ticketPayout({ stake: 25, czDec: 1.6667 })).toEqual({ settled: false, wins: 16.67, pays: 41.67 });
  });
  it("a confirmed NV price supersedes the Caesars quote (the ledger's old 'to win' rule)", () => {
    expect(ticketPayout({ stake: 10, czDec: 3, confirmed: 150 })).toEqual({ settled: false, wins: 15, pays: 25 });
    expect(settlingDec({ stake: 1, czDec: 3, confirmed: -200 })).toBeCloseTo(1.5, 9);
  });
  it("no czDec: the American string prices it; unpriced tickets render nothing", () => {
    expect(ticketPayout({ stake: 20, czOdds: "+245" })).toEqual({ settled: false, wins: 49, pays: 69 });
    expect(ticketPayout({ stake: 20, czOdds: -110 })).toEqual({ settled: false, wins: 18.18, pays: 38.18 });
    expect(ticketPayout({ stake: 20 })).toBeNull();
    expect(ticketPayout({ stake: 0, czDec: 3 })).toBeNull();
  });
  it("won: the grader's payout is the total return, so Won = payout − stake", () => {
    expect(ticketPayout({ stake: 10, czDec: 3 }, { result: "won", payout: 30 })).toEqual({ settled: true, wins: 20, pays: 30 });
    // settled at a confirmed NV price the grader already applied — the grade wins, not the quote
    expect(ticketPayout({ stake: 10, czDec: 3, confirmed: 150 }, { result: "won", payout: 25 })).toEqual({ settled: true, wins: 15, pays: 25 });
  });
  it("lost pays $0; a push hands the stake back and wins nothing", () => {
    expect(ticketPayout({ stake: 33, czDec: 2.2 }, { result: "lost", payout: 0 })).toEqual({ settled: true, wins: 0, pays: 0 });
    expect(ticketPayout({ stake: 33, czDec: 2.2 }, { result: "push", payout: 33 })).toEqual({ settled: true, wins: 0, pays: 33 });
  });
  it("pending / ungradable grades stay unsettled — still the potential pair", () => {
    expect(ticketPayout({ stake: 10, czDec: 3 }, { result: "pending", payout: 0 })).toEqual({ settled: false, wins: 20, pays: 30 });
    expect(ticketPayout({ stake: 10, czDec: 3 }, { result: "ungradable", payout: 0 })?.settled).toBe(false);
  });
});

describe("every parlay surface renders the pair", () => {
  const src = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
  it("builder ticket cards and ledger ticket rows both mount <WonPaid>", () => {
    expect(src("app/builder/page.tsx")).toMatch(/<WonPaid\b/);
    expect(src("app/ledger/page.tsx")).toMatch(/<WonPaid\b/);
    // the ledger's old one-off "to win" math is gone — one reading everywhere
    expect(src("app/ledger/page.tsx")).not.toMatch(/to win \$/);
  });
});
