import { describe, expect, it } from "vitest";
import { BANK_BASE, computeBankroll, realizedPL, ticketPL, todayExposure, type BankStore, type LedgerDayLike } from "@/lib/bankroll";
import { fixtureEngine } from "./helpers/fixture-env";
import type { Engine } from "@/engine";

/* Fix-file Phase 6 + Correction 4: the bankroll is COMPUTED —
   $2,500 base + logged deposits/withdrawals + realized graded P/L — never typed. */

const store = (log: BankStore["log"] = [], asOf = "2026-07-24"): BankStore => ({ base: BANK_BASE, asOf, log });

const day = (date: string, tickets: { id: string; stake: number; result?: string; payout?: number }[]): LedgerDayLike => ({
  date,
  locked: true,
  core: tickets.map((t) => ({ id: t.id, stake: t.stake })),
  funT: [],
  grading: {
    done: true,
    tickets: Object.fromEntries(tickets.filter((t) => t.result).map((t) => [t.id, { result: t.result!, payout: t.payout ?? 0 }])),
  },
});

describe("managed bankroll math", () => {
  it("initializes at the true figure: $2,500 (Correction 4)", () => {
    expect(BANK_BASE).toBe(2500);
    expect(computeBankroll(store(), [])).toBe(2500);
  });
  it("ticket P/L: won pays payout−stake, lost costs the stake, push/void/pending are zero", () => {
    expect(ticketPL(100, { result: "won", payout: 198.33 })).toBeCloseTo(98.33);
    expect(ticketPL(50, { result: "lost" })).toBe(-50);
    expect(ticketPL(50, { result: "push" })).toBe(0);
    expect(ticketPL(50, { result: "void" })).toBe(0);
    expect(ticketPL(50, undefined)).toBe(0);
  });
  it("deposits add, withdrawals subtract, graded P/L rides on top — days before asOf never count", () => {
    const s = store([
      { ts: 1, kind: "deposit", amt: 100, note: "reload" },
      { ts: 2, kind: "withdrawal", amt: 40, note: "cash out" },
    ]);
    const ledger = [
      day("2026-07-20", [{ id: "old", stake: 500, result: "lost" }]), // pre-init: already in the $2,500 base
      day("2026-07-24", [
        { id: "w", stake: 100, result: "won", payout: 198.33 },
        { id: "l", stake: 50, result: "lost" },
        { id: "p", stake: 25 }, // pending — never counted before it grades
      ]),
    ];
    expect(realizedPL(ledger, "2026-07-24")).toBeCloseTo(48.33);
    expect(computeBankroll(s, ledger)).toBe(2500 + 100 - 40 + 48); // rounded to whole dollars
  });
  it("today's exposure sums CORE+FUN stakes of the locked day only", () => {
    const e = day("2026-07-24", [{ id: "a", stake: 30 }, { id: "b", stake: 12 }]);
    e.funT = [{ id: "f", stake: 5 }];
    expect(todayExposure([e, day("2026-07-23", [{ id: "x", stake: 99 }])], "2026-07-24")).toBe(47);
    expect(todayExposure([], "2026-07-24")).toBe(0);
  });
});

describe("lock-time combined exposure cap (engine)", () => {
  it("supplemental adds are refused past 10% of the managed bankroll", () => {
    const eng: Engine = fixtureEngine();
    const SH = eng.get<{ bankroll: number }>("SH");
    const save = eng.get<(e: Record<string, unknown>) => void>("shLedgerSave");
    const today = eng.get<() => string>("shToday")();
    SH.bankroll = 100; // cap = $10
    save({
      date: today,
      locked: true,
      lockedAt: 1,
      daily: 9,
      fun: 20,
      bankroll: 100,
      games: {},
      core: [{ id: "c1", stake: 9, name: "t", legs: [] }],
      funT: [],
      grading: null,
    });
    // remaining fun budget is $20, but the combined cap only has $1 of headroom:
    // shSupplementalCalc still proposes; the WRITE path must refuse
    const r = eng.get<() => { ok: boolean; err?: string }>("shLockSupplemental")();
    expect(r.ok).toBe(false);
    // whichever guard fires first, the lock never goes through past the cap
  });
});
