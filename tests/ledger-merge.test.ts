import { describe, expect, it } from "vitest";
import { mergeLedgers, validateLedger, type SyncEntry } from "../src/lib/ledger-merge";

const day = (date: string, over: Partial<SyncEntry> = {}): SyncEntry => ({
  date,
  locked: true,
  daily: 40,
  fun: 10,
  core: [
    { id: "t1", bucket: "core", name: "Mixed · 3 legs", stake: 25, confirmed: null },
    { id: "t2", bucket: "core", name: "Hits parlay · 2 legs", stake: 15, confirmed: null },
  ],
  funT: [{ id: "f1", bucket: "fun", name: "HR parlay · 3 legs", stake: 10, confirmed: null }],
  ...over,
});

describe("validateLedger", () => {
  it("accepts a clean locked ledger and rejects the broken shapes", () => {
    expect(validateLedger([day("2026-07-16")]).ok).toBe(true);
    expect(validateLedger("nope").ok).toBe(false);
    expect(validateLedger([{ date: "2026-07-16" }]).ok).toBe(false); // not locked
    expect(validateLedger([day("2026-07-16", { locked: false })]).ok).toBe(false);
    expect(validateLedger([day("bad-date" as never)]).ok).toBe(false);
    expect(validateLedger([day("2026-07-16"), day("2026-07-16")]).ok).toBe(false); // dup date
  });
});

describe("mergeLedgers", () => {
  it("unions distinct days from both devices — nothing is ever lost", () => {
    const phone = [day("2026-07-15"), day("2026-07-16")];
    const desktop = [day("2026-07-14")];
    const m = mergeLedgers(desktop, phone);
    expect(m.map((e) => e.date)).toEqual(["2026-07-14", "2026-07-15", "2026-07-16"]);
  });

  it("an empty device pulls everything and clobbers nothing", () => {
    const phone = [day("2026-07-15"), day("2026-07-16")];
    expect(mergeLedgers([], phone)).toEqual(mergeLedgers(phone, []));
    expect(mergeLedgers([], phone).length).toBe(2);
  });

  it("same day: the graded copy wins, and the other side's accruals overlay", () => {
    const graded = day("2026-07-16", {
      grading: { done: true, tickets: { t1: { result: "won", payout: 50 } }, legs: {} },
    });
    const withClv = day("2026-07-16", {
      clv: { t2: { am: -120, at: 1752700000000 } },
      core: [
        { id: "t1", bucket: "core", name: "Mixed · 3 legs", stake: 25, confirmed: null },
        { id: "t2", bucket: "core", name: "Hits parlay · 2 legs", stake: 15, confirmed: -118 },
      ],
    });
    for (const m of [mergeLedgers([graded], [withClv]), mergeLedgers([withClv], [graded])]) {
      expect(m).toHaveLength(1);
      expect(m[0].grading?.done).toBe(true); // graded base kept
      expect(m[0].clv?.t2.am).toBe(-120); // CLV sighting carried over
      expect(m[0].core.find((t) => t.id === "t2")?.confirmed).toBe(-118); // NV confirm carried over
    }
  });

  it("is symmetric and idempotent (devices converge no matter who syncs first)", () => {
    const a = [day("2026-07-14"), day("2026-07-16", { grading: { done: true, tickets: {}, legs: {} } })];
    const b = [day("2026-07-15"), day("2026-07-16", { clv: { t1: { am: 100, at: 1 } } })];
    const ab = mergeLedgers(a, b);
    const ba = mergeLedgers(b, a);
    expect(JSON.stringify(ab)).toBe(JSON.stringify(ba));
    expect(JSON.stringify(mergeLedgers(ab, b))).toBe(JSON.stringify(ab));
    expect(JSON.stringify(mergeLedgers(ab, ab))).toBe(JSON.stringify(ab));
  });

  it("unlocked drafts never sync", () => {
    const m = mergeLedgers([day("2026-07-16", { locked: false }) as never], [day("2026-07-15")]);
    expect(m.map((e) => e.date)).toEqual(["2026-07-15"]);
  });
});
