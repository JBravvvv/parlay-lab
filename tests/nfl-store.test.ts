import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildCfbBoard } from "@/lib/cfb/model";
import { buildCfbCard } from "@/lib/cfb/card";
import { CFB_KEYS, CFB_PAPER } from "@/lib/cfb/rules";
import { NFL_BANK_BASE, NFL_KEYS, NFL_LEAGUE, NFL_PAPER, NFL_RULES } from "@/lib/nfl/rules";
import type { CfbBoard, CfbLedgerEntry, CfbTicket } from "@/lib/cfb/types";
import { CFB_STORE, readCfbLedger, wipeCfbDevice, writeCfbLedger } from "@/lib/cfb/store";
import {
  NFL_CHANGE_EVENT,
  NFL_STORE,
  NFL_SYNC_EVENT,
  getNflBankStore,
  getNflBankroll,
  importNflLedger,
  lockNfl,
  nflEntriesOf,
  nflExposure,
  readNflLedger,
  readNflRaw,
  upsertNflEntry,
  wipeNflDevice,
  writeNflLedger,
} from "@/lib/nfl/store";
import { makeDeviceStore } from "@/lib/football/store";

/**
 * THE NFL DEVICE STORE (2026-09-08; Josh, verbatim: "NFL needs to be built NOW"). The mirror of
 * tests/cfb-store.test.ts on the other desk, plus the one property that file could not have:
 * TWO instances of the same factory on one page are INDEPENDENT — a write on one leaves the
 * other's record, snapshot and version untouched, and a subscriber hears only its own desk.
 *
 *   - the keys are exactly NFL_KEYS (pl_nfl_ledger / pl_nfl_bank2) and nothing else is written
 *   - an import refuses a CFB-stamped entry, and a CFB ledger read never sees an NFL day
 *   - the bank initializes at NFL_BANK_BASE ($2,500) under its own key
 *   - a lock through the real engine (buildCfbBoard over the NFL fixtures → buildCfbCard under
 *     NFL_RULES → lockNfl) stamps sport "nfl", daily NFL_PAPER.daily and nfl-… ticket ids
 *
 * Every dollar figure in the synthetic entries below is a test input, not a market number. The
 * odds fixture is SYNTHESIZED in the CFB odds fixture shape (see its per-event `_note`); the
 * scoreboard is a real ESPN capture.
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

function entry(sport: "nfl" | "cfb", date: string, stake: number, extra: Partial<CfbLedgerEntry> = {}): CfbLedgerEntry {
  const paper = sport === "nfl" ? NFL_PAPER : CFB_PAPER;
  return {
    sport,
    date,
    locked: true,
    daily: paper.daily,
    fun: paper.fun,
    core: [ticket(`${sport}-${date}-core-1`, stake, "g1")],
    funT: [],
    lockedAt: 1,
    games: { g1: { pk: 1, start: `${date}T17:00:00Z`, home: "Home Team", away: "Away Team" } },
    ...extra,
  };
}

const FIX = path.join(process.cwd(), "tests", "fixtures", "nfl");
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8"));
const DATE = "2026-09-13";
const NOW = Date.parse("2026-09-13T12:00:00Z");

function nflBoard(): CfbBoard {
  const espn = readJson("espn-scoreboard-2026-09-13.json") as { events: unknown[] };
  return buildCfbBoard({
    date: DATE,
    espnEvents: espn.events,
    oddsEvents: readJson("odds-2026-09-13.json"),
    fpi: readJson("espn-fpi.json"),
    now: NOW,
    bankroll: NFL_BANK_BASE,
    league: NFL_LEAGUE,
  });
}

beforeEach(install);
afterEach(uninstall);

describe("keys — its own ledger and bank, nothing else", () => {
  it("NFL_KEYS are the pinned literals and the store carries them", () => {
    expect(NFL_KEYS.ledger).toBe("pl_nfl_ledger");
    expect(NFL_KEYS.bank).toBe("pl_nfl_bank2");
    expect(NFL_STORE.KEYS).toEqual({ ledger: "pl_nfl_ledger", bank: "pl_nfl_bank2" });
    expect(NFL_STORE.CHANGE_EVENT).toBe("pl:nfl-ledger-change");
    expect(NFL_STORE.SYNC_EVENT).toBe("pl:nfl-ledger-sync");
    expect(NFL_CHANGE_EVENT).toBe(NFL_STORE.CHANGE_EVENT);
    expect(NFL_SYNC_EVENT).toBe(NFL_STORE.SYNC_EVENT);
  });

  it("a ledger write lands under pl_nfl_ledger only", () => {
    expect(writeNflLedger([entry("nfl", "2026-09-13", 10)])).toBe(true);
    expect(keysOf(localStorage)).toEqual(["pl_nfl_ledger"]);
    expect(JSON.parse(localStorage.getItem("pl_nfl_ledger") as string)).toHaveLength(1);
    expect(readNflLedger()[0].date).toBe("2026-09-13");
    expect(readNflLedger()[0].sport).toBe("nfl");
  });

  it("the bank initializes under pl_nfl_bank2 at NFL_BANK_BASE, and an empty device answers $2,500", () => {
    expect(getNflBankroll()).toBe(2500);
    expect(keysOf(localStorage)).toEqual([]); // the read-only bankroll never writes
    const b = getNflBankStore();
    expect(b.base).toBe(NFL_BANK_BASE);
    expect(b.base).toBe(2500);
    expect(b.asOf).toBe(NFL_PAPER.since);
    expect(b.asOf).toBe("2026-09-10");
    expect(b.log).toEqual([]);
    expect(keysOf(localStorage)).toEqual(["pl_nfl_bank2"]);
  });

  it("wipe removes the two NFL keys and nothing else — the CFB record beside it survives", () => {
    writeNflLedger([entry("nfl", "2026-09-13", 10)]);
    getNflBankStore();
    writeCfbLedger([entry("cfb", "2026-09-12", 10)]);
    localStorage.setItem("pl_sport", "nfl");
    wipeNflDevice();
    expect(keysOf(localStorage)).toEqual([CFB_KEYS.ledger, "pl_sport"]);
    expect(readNflLedger()).toEqual([]);
    expect(readNflRaw()).toEqual({ ledger: "", bank: "" });
    expect(readCfbLedger().map((e) => e.date)).toEqual(["2026-09-12"]);
  });

  it("reads drop anything that is not a locked NFL entry — a CFB day under the NFL key included", () => {
    localStorage.setItem(
      "pl_nfl_ledger",
      JSON.stringify([entry("nfl", "2026-09-13", 10), entry("cfb", "2026-09-12", 10), { date: "2026-09-14", locked: true, core: [] }, null, "x"]),
    );
    expect(readNflLedger().map((e) => e.date)).toEqual(["2026-09-13"]);
    expect(nflEntriesOf([entry("cfb", "2026-09-12", 10)])).toEqual([]);
    expect(nflEntriesOf("nope")).toEqual([]);
  });
});

describe("two desks, one page — the instances are independent", () => {
  it("writing one desk leaves the other's record untouched", () => {
    writeNflLedger([entry("nfl", "2026-09-13", 10)]);
    writeCfbLedger([entry("cfb", "2026-09-12", 25)]);
    expect(readNflLedger().map((e) => [e.sport, e.date])).toEqual([["nfl", "2026-09-13"]]);
    expect(readCfbLedger().map((e) => [e.sport, e.date])).toEqual([["cfb", "2026-09-12"]]);
    expect(keysOf(localStorage)).toEqual([CFB_KEYS.ledger, NFL_KEYS.ledger]);
    wipeCfbDevice();
    expect(readNflLedger()).toHaveLength(1);
  });

  it("the CFB store and the NFL store are different objects with different handles", () => {
    expect(NFL_STORE).not.toBe(CFB_STORE);
    expect(NFL_STORE.readLedger).not.toBe(CFB_STORE.readLedger);
    expect(NFL_STORE.useLedger).not.toBe(CFB_STORE.useLedger);
    expect(CFB_STORE.KEYS).toEqual({ ledger: "pl_cfb_ledger", bank: "pl_cfb_bank2" });
    /* the pure upsert rail is shared by reference — one rule, two desks */
    expect(NFL_STORE.upsertEntries).toBe(CFB_STORE.upsertEntries);
  });

  it("a change on one desk dispatches only that desk's event", () => {
    const heard: string[] = [];
    const w = { addEventListener: (type: string, _cb: unknown) => void _cb, dispatchEvent: (e: Event) => (heard.push(e.type), true) } as unknown as Window & typeof globalThis;
    Object.defineProperty(globalThis, "window", { value: w, configurable: true, writable: true });
    try {
      writeNflLedger([entry("nfl", "2026-09-13", 10)]);
      expect(heard).toEqual(["pl:nfl-ledger-change"]);
      writeCfbLedger([entry("cfb", "2026-09-12", 10)]);
      expect(heard).toEqual(["pl:nfl-ledger-change", "pl:cfb-ledger-change"]);
      expect(heard.filter((t) => t === "pl:nfl-ledger-change")).toHaveLength(1);
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });

  it("two fresh instances of the factory write their own keys and fire only their own events", () => {
    const listeners = new Map<string, Set<(e?: unknown) => void>>();
    const w = {
      addEventListener: (type: string, cb: (e?: unknown) => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(cb);
      },
      removeEventListener: (type: string, cb: (e?: unknown) => void) => listeners.get(type)?.delete(cb),
      dispatchEvent: (e: Event) => {
        for (const cb of listeners.get(e.type) ?? []) cb(e);
        return true;
      },
    } as unknown as Window & typeof globalThis;
    Object.defineProperty(globalThis, "window", { value: w, configurable: true, writable: true });
    try {
      const A = makeDeviceStore({ ...NFL_LEAGUE, keys: { ledger: "t_a_ledger", bank: "t_a_bank" }, events: { change: "t:a-change", sync: "t:a-sync" } });
      const B = makeDeviceStore({ ...NFL_LEAGUE, keys: { ledger: "t_b_ledger", bank: "t_b_bank" }, events: { change: "t:b-change", sync: "t:b-sync" } });
      expect(A.useLedger).not.toBe(B.useLedger);
      const heard = { a: 0, b: 0 };
      w.addEventListener("t:a-change", () => heard.a++);
      w.addEventListener("t:b-change", () => heard.b++);

      A.writeLedger([entry("nfl", "2026-09-13", 10)]);
      expect(heard).toEqual({ a: 1, b: 0 });
      expect(A.readLedger()).toHaveLength(1);
      expect(B.readLedger()).toHaveLength(0);
      expect(keysOf(localStorage)).toEqual(["t_a_ledger"]);

      B.getBankStore();
      expect(heard).toEqual({ a: 1, b: 1 });
      expect(keysOf(localStorage)).toEqual(["t_a_ledger", "t_b_bank"]);
      expect(A.readBankStore()).toBeNull(); // A's bank key was never written

      B.wipeDevice();
      expect(heard).toEqual({ a: 1, b: 2 });
      expect(A.readLedger()).toHaveLength(1); // B's wipe never reached A's keys
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });
});

describe("import — merge, never replace, and only this desk's sport", () => {
  it("refuses a sport 'cfb' entry, an unstamped one and bad JSON, without touching the record", () => {
    writeNflLedger([entry("nfl", "2026-09-13", 10)]);
    const cfbDay = importNflLedger(JSON.stringify([entry("cfb", "2026-09-12", 10)]));
    expect(cfbDay.ok).toBe(false);
    expect(!cfbDay.ok && cfbDay.error).toMatch(/not a nfl entry/);
    expect(!cfbDay.ok && cfbDay.error).toMatch(/sport must be "nfl"/);
    const noSport = importNflLedger(JSON.stringify([{ date: "2026-09-14", locked: true, core: [], funT: [] }]));
    expect(noSport.ok).toBe(false);
    const mlbLike = importNflLedger(JSON.stringify([{ ...entry("nfl", "2026-09-14", 10), sport: "mlb" }]));
    expect(mlbLike.ok).toBe(false);
    expect(importNflLedger("{not json").ok).toBe(false);
    expect(readNflLedger().map((e) => e.date)).toEqual(["2026-09-13"]);
  });

  it("merges an NFL day in and round-trips export", () => {
    writeNflLedger([entry("nfl", "2026-09-13", 10)]);
    const r = importNflLedger(JSON.stringify({ ledger: [entry("nfl", "2026-09-13", 10), entry("nfl", "2026-09-20", 15)] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.added).toBe(1);
    expect(r.merged).toBe(1);
    expect(readNflLedger().map((e) => e.date)).toEqual(["2026-09-13", "2026-09-20"]);
    expect(readNflLedger()[1].daily).toBe(350);
  });
});

describe("bank + exposure under the NFL allotment", () => {
  it("bankroll = base + realized graded NFL P/L; exposure sums the day's stakes", () => {
    writeNflLedger([entry("nfl", "2026-09-13", 10, { grading: { tickets: { "nfl-2026-09-13-core-1": { result: "won", payout: 25 } }, legs: {}, done: true } })]);
    expect(getNflBankroll()).toBe(2515);
    expect(nflExposure("2026-09-13")).toBe(10);
    expect(nflExposure("2026-09-14")).toBe(0);
    expect(keysOf(localStorage)).toEqual(["pl_nfl_ledger"]);
  });

  it("the upsert rail caps a day at NFL_PAPER.daily ($350), not the CFB $250", () => {
    const seven = Array.from({ length: 7 }, (_, i) => ticket(`nfl-2026-09-13-core-${i + 1}`, 50, `g${i + 1}`));
    const games = Object.fromEntries(seven.map((_, i) => [`g${i + 1}`, { pk: i + 1, start: "2026-09-13T17:00:00Z", home: `H${i}`, away: `A${i}` }]));
    const r = upsertNflEntry(entry("nfl", "2026-09-13", 0, { core: seven, games }));
    expect(r.refused).toBe(false);
    expect(r.entry.core.reduce((s, t) => s + t.stake, 0)).toBe(350);
    expect(r.entry.daily).toBe(NFL_PAPER.daily);
    expect(NFL_PAPER.daily).toBe(350);
  });
});

describe("lockNfl — the real engine over the NFL fixtures", () => {
  it("stamps sport nfl, daily 350, fun 25, and mints nfl-… ticket ids", () => {
    const board = nflBoard();
    expect(board.games.length).toBeGreaterThan(0);
    const card = buildCfbCard(board, { bankroll: NFL_BANK_BASE, daily: NFL_PAPER.daily, fun: NFL_PAPER.fun, now: NOW, rules: NFL_RULES, idPrefix: "nfl" });
    expect(card.date).toBe(DATE);
    const { entry: locked, refused } = lockNfl(card, board);
    expect(refused).toBe(false);
    expect(locked.sport).toBe("nfl");
    expect(locked.daily).toBe(350);
    expect(locked.fun).toBe(25);
    expect(locked.date).toBe(DATE);
    /* the SYNTHESIZED odds fixture prices no +2% side at Caesars, so the core is empty on this
       board (a thin card, exactly what the real 2026-09-05 CFB fixture does) — the FUN ticket is
       what carries the id pin, so it is asserted by name rather than left to a vacuous loop */
    expect(locked.funT.map((t) => [t.id, t.stake])).toEqual([["nfl-2026-09-13-fun-1", 25]]);
    for (const t of [...locked.core, ...locked.funT]) expect(t.id).toMatch(/^nfl-2026-09-13-(core|fun)-\d+$/);
    expect(locked.core.reduce((s, t) => s + t.stake, 0)).toBeLessThanOrEqual(NFL_PAPER.daily);
    for (const t of locked.core) expect(t.stake).toBeLessThanOrEqual(NFL_RULES.maxStake);
    /* persisted under the NFL key only, readable back, and the CFB record is empty */
    expect(keysOf(localStorage)).toEqual(["pl_nfl_ledger"]);
    expect(readNflLedger()[0].sport).toBe("nfl");
    expect(readCfbLedger()).toEqual([]);
    /* a second press cannot re-stake the Sunday */
    expect(lockNfl(card, board).refused).toBe(true);
    expect(readNflLedger()).toHaveLength(1);
  });
});

describe("no localStorage at all (SSR / node) — every helper is safe", () => {
  it("reads are empty, writes report false, nothing throws", () => {
    uninstall();
    expect(typeof localStorage).toBe("undefined");
    expect(readNflLedger()).toEqual([]);
    expect(writeNflLedger([entry("nfl", "2026-09-13", 10)])).toBe(false);
    expect(readNflRaw()).toEqual({ ledger: "", bank: "" });
    expect(getNflBankStore().base).toBe(NFL_BANK_BASE);
    expect(getNflBankroll()).toBe(NFL_BANK_BASE);
    expect(nflExposure("2026-09-13")).toBe(0);
    expect(importNflLedger(JSON.stringify([entry("nfl", "2026-09-13", 10)])).ok).toBe(false);
    expect(() => wipeNflDevice()).not.toThrow();
  });
});
