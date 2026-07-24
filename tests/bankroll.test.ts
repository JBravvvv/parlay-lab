import { describe, expect, it } from "vitest";
import { BANK_BASE, computeBankroll, mergeBankStores, realizedPL, ticketPL, todayExposure, validateBankStore, type BankAdjustment, type BankStore, type LedgerDayLike } from "@/lib/bankroll";
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

/* Hardening Phase 1: the adjustment log cloud-syncs with the ledger. The merge
   kernel must behave exactly like the ledger's: symmetric, idempotent, and
   append-only — no order of syncs may lose an entry or fork the bankroll. */
describe("bank store sync merge (hardening Phase 1)", () => {
  const adj = (ts: number, kind: BankAdjustment["kind"], amt: number, note = ""): BankAdjustment => ({ ts, kind, amt, note });

  it("union de-duplicates by ts+kind+amt+note; distinct entries all survive", () => {
    const a = store([adj(1, "deposit", 100, "reload"), adj(3, "withdrawal", 40)]);
    const b = store([adj(1, "deposit", 100, "reload"), adj(2, "deposit", 25, "bonus")]);
    const m = mergeBankStores(a, b);
    expect(m.log).toEqual([adj(1, "deposit", 100, "reload"), adj(2, "deposit", 25, "bonus"), adj(3, "withdrawal", 40)]);
  });

  it("is symmetric and idempotent (re-merging changes nothing)", () => {
    const a = store([adj(5, "deposit", 10, "x")], "2026-07-25");
    const b = store([adj(4, "withdrawal", 7, "y")], "2026-07-24");
    const ab = mergeBankStores(a, b);
    expect(mergeBankStores(b, a)).toEqual(ab);
    expect(mergeBankStores(ab, a)).toEqual(ab);
    expect(mergeBankStores(ab, ab)).toEqual(ab);
  });

  it("earlier init date wins — a fresh device converges to the season baseline", () => {
    const cloud = store([adj(1, "deposit", 50)], "2026-07-24");
    const fresh = store([], "2026-07-30"); // just-initialized second device
    const m = mergeBankStores(fresh, cloud);
    expect(m.asOf).toBe("2026-07-24");
    expect(m.base).toBe(BANK_BASE);
    expect(m.log).toHaveLength(1);
  });

  it("validate rejects malformed stores from the wire", () => {
    expect(validateBankStore(null).ok).toBe(false);
    expect(validateBankStore({ base: 2500, asOf: "not-a-date", log: [] }).ok).toBe(false);
    expect(validateBankStore({ base: 2500, asOf: "2026-07-24", log: {} }).ok).toBe(false);
    expect(validateBankStore({ base: 2500, asOf: "2026-07-24", log: [{ ts: 1, kind: "edit", amt: 5, note: "" }] }).ok).toBe(false);
    expect(validateBankStore({ base: 2500, asOf: "2026-07-24", log: [{ ts: 1, kind: "deposit", amt: -5, note: "" }] }).ok).toBe(false);
    expect(validateBankStore({ base: 2500, asOf: "2026-07-24", log: [adj(1, "deposit", 5, "ok")] }).ok).toBe(true);
  });

  it("two clients syncing out of order converge to one bankroll (acceptance)", () => {
    // Device A logs a deposit, device B logs a withdrawal, both offline.
    const devA = store([adj(10, "deposit", 200, "reload")]);
    const devB = store([adj(20, "withdrawal", 75, "cash out")]);
    // B syncs first (cloud empty → cloud = B), then A, then B pulls again.
    let cloud = mergeBankStores(store(), devB);
    cloud = mergeBankStores(cloud, devA); // A's push (server-side merge)
    const aView = mergeBankStores(devA, cloud); // A adopts the server reply
    const bView = mergeBankStores(devB, cloud); // B's next pull
    expect(aView).toEqual(bView);
    // Both devices price Kelly + the 10% exposure cap off the same number:
    const ledger = [day("2026-07-24", [{ id: "w", stake: 100, result: "won", payout: 198.33 }])];
    const bank = computeBankroll(aView, ledger);
    expect(bank).toBe(computeBankroll(bView, ledger));
    expect(bank).toBe(2500 + 200 - 75 + 98); // base + deposit − withdrawal + realized (rounded)
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
