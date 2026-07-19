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

describe("2026-07-18 doubleheader repair (Mangum graded vs the wrong game)", () => {
  type GameRef = { pk: number | null; start?: string };
  const GK = "pittsburghpirates@clevelandguardians";
  const games = (e: SyncEntry) => e.games as Record<string, GameRef>;
  const staleDay = (): SyncEntry =>
    day("2026-07-18", {
      games: {
        [GK]: { pk: 824412, start: "2026-07-18T23:10:00Z" }, // game 2 — Mangum 1-for-5
        "tampabayrays@boston": { pk: 555001, start: "2026-07-18T20:10:00Z" },
      },
      grading: { done: true, tickets: { t1: { result: "won", payout: 80 } }, legs: {} },
      gradedAt: 1752900000000,
    });

  it("re-points the pk at game 1 and clears the stale grading, whichever side it arrives on", () => {
    const cases = [
      mergeLedgers([staleDay()], []),
      mergeLedgers([], [staleDay()]),
      mergeLedgers([staleDay()], [staleDay()]),
    ];
    for (const m of cases) {
      expect(games(m[0])[GK].pk).toBe(824414); // game 1 — Mangum 0-for-5, the game the card priced
      expect(games(m[0])[GK].start).toBe("2026-07-18T17:10:00Z");
      expect(m[0].grading).toBeNull();
      expect(games(m[0])["tampabayrays@boston"].pk).toBe(555001); // other legs untouched
    }
  });

  it("a corrected, re-graded copy outranks every stale copy in both merge orders", () => {
    const corrected = day("2026-07-18", {
      games: { [GK]: { pk: 824414, start: "2026-07-18T17:10:00Z" } },
      grading: { done: true, tickets: { t1: { result: "lost", payout: 0 } }, legs: {} },
    });
    for (const m of [mergeLedgers([corrected], [staleDay()]), mergeLedgers([staleDay()], [corrected])]) {
      const t = (m[0].grading?.tickets as Record<string, { result: string }>).t1;
      expect(t.result).toBe("lost");
      expect(games(m[0])[GK].pk).toBe(824414);
    }
  });

  it("touches nothing else — other days keep their grading even with the same pk", () => {
    const other = day("2026-07-17", {
      games: { anything: { pk: 824412 } },
      grading: { done: true, tickets: {}, legs: {} },
    });
    const m = mergeLedgers([other], []);
    expect(games(m[0]).anything.pk).toBe(824412);
    expect(m[0].grading?.done).toBe(true);
  });
});
