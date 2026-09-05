import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CFB_BANK_BASE, CFB_KEYS, CFB_PAPER } from "@/lib/cfb/rules";
import type { CfbLedgerEntry, CfbTicket } from "@/lib/cfb/types";
import {
  addCfbBankAdjustment,
  applyCfbGrading,
  cfbEntriesOf,
  cfbExposure,
  exportCfbLedger,
  findCfbEntry,
  getCfbBankStore,
  getCfbBankroll,
  importCfbLedger,
  readCfbBankStore,
  readCfbLedger,
  readCfbRaw,
  upsertCfbEntries,
  upsertCfbEntry,
  wipeCfbDevice,
  writeCfbBankStore,
  writeCfbLedger,
} from "@/lib/cfb/store";

/**
 * THE CFB DEVICE STORE (INSTRUCTION 38, 2026-09-05). Pure-part guards:
 *   - the keys are exactly CFB_KEYS (its own ledger + bank, never the MLB desk's)
 *   - a lock is once per date: an upsert on a locked date keeps the original core / funT
 *     and only overlays grading + games
 *   - import merges (union by date) and refuses anything that is not a CFB entry
 *   - the bank initializes at CFB_BANK_BASE under its own key and the bankroll is
 *     base + logged moves + realized graded P/L
 *   - with NO localStorage at all (SSR / node) every helper is safe: reads are empty,
 *     writes report false, nothing throws
 *
 * Every dollar figure below is a SYNTHETIC test input (stake / payout chosen here), not a
 * market number; the expected totals are computed from those inputs in the assertions.
 */

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => {
      m.delete(k);
    },
    setItem: (k: string, v: string) => {
      m.set(k, String(v));
    },
  } as Storage;
}
const keysOf = (s: Storage) => Array.from({ length: s.length }, (_, i) => s.key(i) as string).sort();
const install = () => Object.defineProperty(globalThis, "localStorage", { value: memStorage(), configurable: true, writable: true });
const uninstall = () => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
};

/* synthetic ticket: one ML leg, stake in whole dollars, Caesars -110 as the captured price */
function ticket(id: string, stake: number, gkey: string, bucket: "core" | "fun" = "core"): CfbTicket {
  return {
    id,
    bucket,
    name: `SINGLE · test ${gkey}`,
    stake,
    czOdds: -110,
    czDec: 1.909,
    prob: 55,
    czEv: 5,
    legs: [{ label: "Test ML", prop: "ML", cz: -110, gkey, lkey: `${gkey}|ml|home|`, market: "ml", side: "home", line: null, teamId: null, prob: 0.55, push: 0 }],
  };
}

function entry(date: string, stake: number, extra: Partial<CfbLedgerEntry> = {}): CfbLedgerEntry {
  return {
    sport: "cfb",
    date,
    locked: true,
    daily: CFB_PAPER.daily,
    fun: CFB_PAPER.fun,
    core: [ticket(`cfb-${date}-core-1`, stake, "g1")],
    funT: [],
    lockedAt: 1,
    games: { g1: { pk: 1, start: `${date}T19:00:00Z`, home: "Home U", away: "Away U" } },
    ...extra,
  };
}

beforeEach(install);
afterEach(uninstall);

describe("keys — its own ledger and bank, nothing else", () => {
  it("CFB_KEYS are the pinned literals", () => {
    expect(CFB_KEYS.ledger).toBe("pl_cfb_ledger");
    expect(CFB_KEYS.bank).toBe("pl_cfb_bank2");
  });

  it("a ledger write lands under CFB_KEYS.ledger only", () => {
    expect(writeCfbLedger([entry("2026-09-05", 10)])).toBe(true);
    expect(keysOf(localStorage)).toEqual([CFB_KEYS.ledger]);
    expect(JSON.parse(localStorage.getItem(CFB_KEYS.ledger) as string)).toHaveLength(1);
    expect(readCfbLedger()[0].date).toBe("2026-09-05");
  });

  it("the bank initializes under CFB_KEYS.bank at CFB_BANK_BASE", () => {
    const b = getCfbBankStore();
    expect(b.base).toBe(CFB_BANK_BASE);
    expect(b.base).toBe(2500);
    expect(b.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(b.log).toEqual([]);
    expect(keysOf(localStorage)).toEqual([CFB_KEYS.bank]);
    expect(readCfbBankStore()).toEqual(b);
  });

  it("wipe removes the two CFB keys and nothing else", () => {
    writeCfbLedger([entry("2026-09-05", 10)]);
    getCfbBankStore();
    localStorage.setItem("pl_sport", "cfb");
    wipeCfbDevice();
    expect(keysOf(localStorage)).toEqual(["pl_sport"]);
    expect(readCfbLedger()).toEqual([]);
    expect(readCfbRaw()).toEqual({ ledger: "", bank: "" });
  });

  it("reads drop anything that is not a locked CFB entry", () => {
    localStorage.setItem(
      CFB_KEYS.ledger,
      JSON.stringify([entry("2026-09-05", 10), { date: "2026-09-06", locked: true, core: [] }, { ...entry("2026-09-07", 10), locked: false }, null, "x"]),
    );
    expect(readCfbLedger().map((e) => e.date)).toEqual(["2026-09-05"]);
    expect(cfbEntriesOf("nope")).toEqual([]);
  });
});

describe("upsert — the lock is once per date", () => {
  it("pure: a second entry for a locked date keeps the original core and overlays grading + games", () => {
    const first = entry("2026-09-05", 10);
    const again = entry("2026-09-05", 25, {
      lockedAt: 2,
      games: { g1: { pk: 1, start: "2026-09-05T19:00:00Z", home: "Home U", away: "Away U" }, g2: { pk: 2, start: "2026-09-05T23:00:00Z", home: "H2", away: "A2" } },
      grading: { tickets: { "cfb-2026-09-05-core-1": { result: "won", payout: 19.09 } }, legs: { "g1|ml|home|": { result: "won", detail: "24-17" } }, done: true },
    });
    const r = upsertCfbEntries([first], again);
    expect(r.refused).toBe(true);
    expect(r.entries).toHaveLength(1);
    expect(r.entry.core[0].stake).toBe(10);
    expect(r.entry.lockedAt).toBe(1);
    expect(Object.keys(r.entry.games).sort()).toEqual(["g1", "g2"]);
    expect(r.entry.grading?.tickets["cfb-2026-09-05-core-1"].result).toBe("won");
    expect(r.entry.grading?.done).toBe(true);
  });

  it("pure: a new date appends, sorted ascending", () => {
    const r = upsertCfbEntries([entry("2026-09-12", 10)], entry("2026-09-05", 10));
    expect(r.refused).toBe(false);
    expect(r.entries.map((e) => e.date)).toEqual(["2026-09-05", "2026-09-12"]);
  });

  it("storage-backed: the refused re-lock never reaches the device record", () => {
    expect(upsertCfbEntry(entry("2026-09-05", 10)).refused).toBe(false);
    const r = upsertCfbEntry(entry("2026-09-05", 25));
    expect(r.refused).toBe(true);
    expect(readCfbLedger()).toHaveLength(1);
    expect(readCfbLedger()[0].core[0].stake).toBe(10);
    expect(findCfbEntry("2026-09-05")?.core[0].stake).toBe(10);
    expect(findCfbEntry("2026-09-06")).toBeNull();
  });

  it("grading overlay: a settled result is never overwritten by a pending one, and vice versa fills", () => {
    const id = "cfb-2026-09-05-core-1";
    const won = { tickets: { [id]: { result: "won" as const, payout: 19.09 } }, legs: {}, done: true };
    const pending = { tickets: { [id]: { result: "pending" as const, payout: 0 } }, legs: {}, done: false };
    const a = upsertCfbEntries([entry("2026-09-05", 10, { grading: won })], entry("2026-09-05", 10, { grading: pending }));
    expect(a.entry.grading?.tickets[id].result).toBe("won");
    expect(a.entry.grading?.done).toBe(true);
    const b = upsertCfbEntries([entry("2026-09-05", 10, { grading: pending })], entry("2026-09-05", 10, { grading: won }));
    expect(b.entry.grading?.tickets[id].result).toBe("won");
    expect(b.entry.grading?.done).toBe(true);
  });

  it("applyCfbGrading stores the grader's verdict on the date and only that date", () => {
    writeCfbLedger([entry("2026-09-05", 10), entry("2026-09-12", 10)]);
    const g = { tickets: { "cfb-2026-09-05-core-1": { result: "lost" as const, payout: 0 } }, legs: {}, done: true };
    expect(applyCfbGrading("2026-09-05", g)?.grading?.done).toBe(true);
    expect(applyCfbGrading("2026-09-19", g)).toBeNull();
    const [d5, d12] = readCfbLedger();
    expect(d5.grading?.tickets["cfb-2026-09-05-core-1"].result).toBe("lost");
    expect(d12.grading ?? null).toBeNull();
  });
});

describe("export / import — merge, never replace", () => {
  it("import merges a new date in and overlays grading on an existing one", () => {
    writeCfbLedger([entry("2026-09-05", 10)]);
    const text = JSON.stringify([
      entry("2026-09-05", 10, { grading: { tickets: { "cfb-2026-09-05-core-1": { result: "won", payout: 19.09 } }, legs: {}, done: true } }),
      entry("2026-09-12", 15),
    ]);
    const r = importCfbLedger(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.added).toBe(1);
    expect(r.merged).toBe(1);
    expect(r.entries.map((e) => e.date)).toEqual(["2026-09-05", "2026-09-12"]);
    expect(readCfbLedger()[0].grading?.done).toBe(true);
    expect(readCfbLedger()[0].core[0].stake).toBe(10);
    expect(readCfbLedger()[1].core[0].stake).toBe(15);
  });

  it("accepts the { ledger: [...] } wrapper and round-trips export", () => {
    writeCfbLedger([entry("2026-09-05", 10)]);
    const exported = exportCfbLedger();
    expect(JSON.parse(exported)).toHaveLength(1);
    const r = importCfbLedger(JSON.stringify({ ledger: JSON.parse(exported) }));
    expect(r.ok && r.added).toBe(0);
    expect(readCfbLedger()).toHaveLength(1);
  });

  it("refuses an entry without sport 'cfb', and bad JSON, without touching the record", () => {
    writeCfbLedger([entry("2026-09-05", 10)]);
    const noSport = importCfbLedger(JSON.stringify([{ date: "2026-09-06", locked: true, core: [], funT: [] }]));
    expect(noSport.ok).toBe(false);
    expect(!noSport.ok && noSport.error).toMatch(/not a cfb entry/);
    const mlbLike = importCfbLedger(JSON.stringify([{ ...entry("2026-09-06", 10), sport: "mlb" }]));
    expect(mlbLike.ok).toBe(false);
    expect(importCfbLedger("{not json").ok).toBe(false);
    expect(importCfbLedger(JSON.stringify({ hello: 1 })).ok).toBe(false);
    expect(readCfbLedger().map((e) => e.date)).toEqual(["2026-09-05"]);
  });
});

describe("bank + bankroll + exposure", () => {
  it("bankroll = base + logged moves + realized graded CFB P/L (from the synthetic inputs)", () => {
    writeCfbBankStore({ base: CFB_BANK_BASE, asOf: "2026-09-01", log: [] });
    expect(getCfbBankroll()).toBe(2500);
    // stake 10 won at payout 25 → +15 realized
    writeCfbLedger([entry("2026-09-05", 10, { grading: { tickets: { "cfb-2026-09-05-core-1": { result: "won", payout: 25 } }, legs: {}, done: true } })]);
    expect(getCfbBankroll()).toBe(2515);
    const b = addCfbBankAdjustment("deposit", 100, "test deposit");
    expect(b.log).toHaveLength(1);
    expect(b.log[0]).toMatchObject({ kind: "deposit", amt: 100, note: "test deposit" });
    expect(getCfbBankroll()).toBe(2615);
    expect(addCfbBankAdjustment("withdrawal", 0, "ignored").log).toHaveLength(1);
    expect(addCfbBankAdjustment("withdrawal", 15, "").log).toHaveLength(2);
    expect(getCfbBankroll()).toBe(2600);
    expect(keysOf(localStorage)).toEqual([CFB_KEYS.bank, CFB_KEYS.ledger]);
  });

  it("exposure sums CORE + FUN stakes locked on the date", () => {
    writeCfbLedger([entry("2026-09-05", 10, { funT: [ticket("cfb-2026-09-05-fun-1", 25, "g2", "fun")] })]);
    expect(cfbExposure("2026-09-05")).toBe(35);
    expect(cfbExposure("2026-09-06")).toBe(0);
  });
});

describe("no localStorage at all (SSR / node) — every helper is safe", () => {
  it("reads are empty, writes report false, nothing throws", () => {
    uninstall();
    expect(typeof localStorage).toBe("undefined");
    expect(readCfbLedger()).toEqual([]);
    expect(writeCfbLedger([entry("2026-09-05", 10)])).toBe(false);
    expect(readCfbRaw()).toEqual({ ledger: "", bank: "" });
    expect(readCfbBankStore()).toBeNull();
    expect(getCfbBankStore().base).toBe(CFB_BANK_BASE);
    expect(getCfbBankroll()).toBe(CFB_BANK_BASE);
    expect(cfbExposure("2026-09-05")).toBe(0);
    expect(findCfbEntry("2026-09-05")).toBeNull();
    expect(importCfbLedger(JSON.stringify([entry("2026-09-05", 10)])).ok).toBe(false);
    expect(() => wipeCfbDevice()).not.toThrow();
  });
});
