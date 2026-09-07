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
import { mergeLedgers } from "@/lib/ledger-merge";
import type { SyncEntry } from "@/lib/ledger-merge";

/**
 * THE CFB DEVICE STORE (INSTRUCTION 38, 2026-09-05). Pure-part guards:
 *   - the keys are exactly CFB_KEYS (its own ledger + bank, never the MLB desk's)
 *   - a lock is once per date: an upsert on a locked date keeps the LOCK INSTANT, and — under
 *     the fixtures in this file — the original core / funT with grading + games overlaid
 *
 *     THE SECOND HALF OF THAT LINE WAS WRITTEN BEFORE THE CORE UNION AND IS NO LONGER TRUE IN
 *     GENERAL (INSTRUCTION 45, 2026-09-06, the closing round's defect C3 sweep; no assertion
 *     below is changed by this note, only the claim above it). READ IN src/lib/cfb/store.ts THIS
 *     TURN, `upsertCfbEntries` takes the merged day WHOLE —
 *       `const syncDay = (mergeLedgers([cur], [entry])[0] as CfbLedgerEntry | undefined) ?? cur;`
 *       `const kept: CfbLedgerEntry = { ...syncDay, grading };`
 *     — and takes back off the stored day only the lock-instant fields, which read this turn
 *       `const LOCK_INSTANT = ["sport", "date", "locked", "daily", "fun", "lockedAt", "source", "trigger"] as const;`
 *     so `core`, `funT` and `games` are the KERNEL's answer for the date, not the stored day's.
 *     What the lock makes invariant is that list. The stored $10 core DOES stand against the
 *     incoming $25 in the pins below, but the kernel is why, not the lock: same ticket id, two
 *     stakes, NEITHER carrying a `topUp` receipt, and `unionCore` (src/lib/ledger-merge.ts) keeps
 *     the SMALLER stake and names what it refused on `conflict`.
 *
 *     THE QUOTE THAT WAS HERE IS GONE FROM THE KERNEL (corrected 2026-09-06, the closing round's
 *     S3 sweep). This paragraph said, under a "read this turn" warrant, that the rail settles a
 *     receiptless disagreement with `const win = receipted ? hi : lo;`. GREPPED THIS TURN that
 *     string does not grep and no longer occurs anywhere in src/lib/ledger-merge.ts: the kernel
 *     now computes a `lift` and branches four ways, and the receiptless case is the LAST arm —
 *     it assigns `lo` and
 *     writes the `{ kept, refused }` marker. The BEHAVIOUR the pins below rely on is unchanged,
 *     which is why no assertion moves; only the sentence that claimed to quote the source does.
 *     Named rather than re-quoted on purpose: a symbol survives the kernel's next rewrite.
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

  /**
   * THE GRADING STAMP IS MONEY MACHINERY, NOT BOOKKEEPING (INSTRUCTION 45, 2026-09-06, mutation
   * survivor R28). Deleting `gradedAt: Date.now()` from `applyCfbGrading` left the whole suite
   * green, and it must not: the server's settle queue TIERS the dates it will spend a scoreboard
   * read on off exactly that stamp. Read this turn in app/api/cfb/lock/route.ts:
   *   `const attempted = (e: CfbLedgerEntry) => Math.max(stampOf(e, "attemptedAt"), stampOf(e, "gradedAt")) || (e.grading ? 1 : 0);`
   * With the stamp gone every device-graded date answers 0 there — an untouched date — so the
   * queue re-offers the SAME dates ahead of ones it has never looked at, and `CFB_SETTLE`'s
   * per-poke budget starves the back of the queue indefinitely. The field is declared for this
   * (`gradedAt?: number | null;` on `CfbLedgerEntry`, src/lib/cfb/types.ts, read this turn) and
   * the kernel resets it deliberately (`out.gradedAt = null;` in `repairEntry`,
   * src/lib/ledger-merge.ts) — both of which are dead weight if nobody writes it.
   *
   * PINNED BEHAVIOURALLY, not by matching the source line: the stamp must be a number, it must be
   * NOW rather than whatever the stored day already carried, and it must be on BOTH the returned
   * entry and the persisted one — the persisted one is what the queue reads.
   */
  it("applyCfbGrading stamps gradedAt with NOW, on the returned entry and the stored one", () => {
    const STALE = 1;
    writeCfbLedger([entry("2026-09-05", 10, { gradedAt: STALE })]);
    const g = { tickets: { "cfb-2026-09-05-core-1": { result: "lost" as const, payout: 0 } }, legs: {}, done: true };
    const before = Date.now();
    const out = applyCfbGrading("2026-09-05", g);
    const after = Date.now();
    expect(typeof out?.gradedAt).toBe("number");
    expect(out!.gradedAt!).toBeGreaterThanOrEqual(before);
    expect(out!.gradedAt!).toBeLessThanOrEqual(after);
    expect(out!.gradedAt!).toBeGreaterThan(STALE); // the stale stamp did not survive
    const stored = readCfbLedger()[0];
    expect(stored.gradedAt).toBe(out!.gradedAt);
    /* and the consumer's own arithmetic, driven here so the pin fails for the reason it names */
    const stampOf = (e: CfbLedgerEntry, k: string) => Number((e as unknown as Record<string, unknown>)[k]) || 0;
    const attempted = (e: CfbLedgerEntry) => Math.max(stampOf(e, "attemptedAt"), stampOf(e, "gradedAt")) || (e.grading ? 1 : 0);
    expect(attempted(stored)).toBe(stored.gradedAt);
    expect(attempted(stored)).toBeGreaterThan(attempted(entry("2026-09-12", 10)));
  });

  /**
   * THE DEVICE TWIN OF THE REOPENED DAY (INSTRUCTION 45, 2026-09-06, the closing round's S3(a)).
   * The kernel withdraws a ticket's verdict when the merge MOVES its stake — src/lib/ledger-merge.ts
   * `mergeDay`, read this turn: for every id in its `withdrawn` set it runs `delete tix[id];` and
   * then `out.grading.done = false;`. (NAMED, NOT QUOTED — CITATION CORRECTED, INSTRUCTION 45,
   * 2026-09-06, DEFECT C3. The gate was quoted here LAST ROUND as
   * `if (united?.restaked.length && out.grading) {`; GREPPED THIS TURN that string does not grep and no
   * longer occurs in src/lib/ledger-merge.ts. The kernel now derives `withdrawn` from `restaked` UNION the
   * disputed `betConflict` ids and gates the block on a wider `legWithdrawn` set. The BEHAVIOUR
   * this pin relies on — a withdrawn verdict is an absent key — is unchanged, which is why no
   * assertion moves; only the sentence that claimed to quote the source does. Two sets that the
   * kernel is still renaming are exactly what a quote cannot survive, so they are named.)
   * A withdrawn verdict is therefore an ABSENT KEY, and
   * `overlayGrading` (src/lib/cfb/store.ts) bars only two shapes — `if (settled(stored)) continue;`
   * and `if (stored === "ungradable" && !corroborated(id)) continue;` — neither of which can match
   * `undefined`. So the device rail re-grades a withdrawn ticket exactly as the server rail does,
   * and the corroboration bar built for 48-hour voids never sees it.
   *
   * This matters for money, not tidiness: the raised ticket is priced off its NEW stake only if
   * something re-grades it, and `ticketPL` scores an ungraded ticket 0 until then. Pinned through
   * `applyCfbGrading` — the real device entry point — rather than against the module-private
   * overlay, so the pin fails if any layer between them starts refusing a reopened day.
   */
  it("a withdrawn verdict re-grades on the device rail, and the void bar still refuses an uncorroborated ungradable", () => {
    const id = "cfb-2026-09-05-core-1";
    const won = { tickets: { [id]: { result: "won" as const, payout: 47.73 } }, legs: { "g1|ml|home|": { result: "won" as const, detail: "31-17" } }, done: true };
    /* the merge's own output: the verdict and its exclusive leg DELETED, done reopened */
    const withdrawn = { tickets: {}, legs: {}, done: false };
    writeCfbLedger([{ ...entry("2026-09-05", 25, { grading: withdrawn }) }]);
    const out = applyCfbGrading("2026-09-05", won);
    expect(out?.grading?.tickets[id].result).toBe("won");
    expect(out?.grading?.tickets[id].payout).toBe(47.73);
    expect(out?.grading?.done).toBe(true); // the day closes again
    expect(readCfbLedger()[0].grading?.tickets[id].result).toBe("won");

    /* the void bar is untouched: a stored `ungradable` under an incoming read whose LEG is still
       unsettled is refused — `corroborated` is every-leg-SETTLED in the INCOMING leg map */
    const voided = () => entry("2026-09-05", 25, { grading: { tickets: { [id]: { result: "ungradable" as const, payout: 0 } }, legs: {}, done: false } });
    const uncorroborated = { tickets: { [id]: { result: "won" as const, payout: 47.73 } }, legs: { "g1|ml|home|": { result: "pending" as const, detail: "" } }, done: false };
    writeCfbLedger([voided()]);
    expect(applyCfbGrading("2026-09-05", uncorroborated)?.grading?.tickets[id].result).toBe("ungradable");
    /* ...and yields the moment every leg of that ticket IS settled in the incoming read */
    writeCfbLedger([voided()]);
    expect(applyCfbGrading("2026-09-05", won)?.grading?.tickets[id].result).toBe("won");
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

/**
 * S1 (INSTRUCTION 45, 2026-09-06, the closing round) — THE RECEIPT CHANNEL ON THE DEVICE RAIL.
 * Josh, verbatim: "Parlay Lab CFB should've been running the same $150 per day theoretical Core
 * money and $25 Fun money per day".
 *
 * A merge that refuses a wager records it on TWO channels — an ID LIST (`coreDropped`) and a
 * RECEIPT MAP carrying the money (`coreDroppedPL`) — written from different places, so a stored
 * blob can carry either one alone. The property "money the day actually carries must not be
 * re-offered as room, and money it does NOT carry must not be counted against it" was pinned only
 * through the id list: a mutant reading the RECEIPT channel survived the suite. tests/cfb-grade.ts
 * C7(a) pins the SERVER rail; this pins the DEVICE one.
 *
 * The device rail is not a second implementation — `upsertCfbEntries` (src/lib/cfb/store.ts, read
 * this turn) delegates to `mergeLedgers` for the day itself:
 *     `const syncDay = (mergeLedgers([cur], [entry])[0] as CfbLedgerEntry | undefined) ?? cur;`
 * — so the test drives both and asserts they AGREE, which is what makes the pin a guard against
 * the store growing its own answer rather than a duplicate of the kernel's own tests.
 *
 * MUTATION, AND WHAT IT FOUND (this turn, reproduced twice each). Restoring the stored day's
 * `coreDroppedPL` onto `kept` — the classic shape of this rail's own C2 defect, a remembered field
 * put back by hand — SURVIVES, because the final `mergeLedgers([kept], [kept])` reconcile
 * recomputes the marker off the seated core and cleans it again. That is defence in depth and it
 * is worth knowing. The same restore applied AFTER the reconcile is killed by this test:
 * "expected { result: 'won', payout: 19.09, …(1) } to be undefined".
 */
describe("S1 (2026-09-06) — a drop RECEIPT is not room, and not exposure, on the device rail", () => {
  const SEATED = "cfb-2026-09-05-core-1";
  const GONE = "cfb-2026-09-05-core-9";
  /* the stale shape: a receipt for the ticket the day CARRIES (an earlier merge's marker, kept
     alive on the receipt channel after a later merge seated the id and cleared the id list) and a
     receipt for one it does not. NO `coreDropped` beside either — that is the whole point. */
  const stored = () =>
    ({
      ...entry("2026-09-05", 10),
      coreDroppedPL: {
        [SEATED]: { result: "won", payout: 19.09, stake: 10 },
        [GONE]: { result: "lost", payout: 0, stake: 40 },
      },
    }) as unknown as CfbLedgerEntry;

  it("a receipt for a ticket the day SEATS is cleared, and one for a ticket it never took survives", () => {
    const cur = stored();
    expect((cur as unknown as Record<string, unknown>).coreDropped).toBeUndefined();
    const r = upsertCfbEntries([cur], entry("2026-09-05", 10));
    /* `refused` is the LOCK's answer — the date was already locked, so the re-lock is refused —
       and the day is merged all the same; the receipt bookkeeping below is what this pins */
    expect(r.refused).toBe(true);
    const pl = (r.entry as unknown as Record<string, unknown>).coreDroppedPL as Record<string, { stake: number }> | undefined;
    expect(pl?.[SEATED]).toBeUndefined(); // the money is ON the card; the receipt is spent
    expect(pl?.[GONE]).toEqual({ result: "lost", payout: 0, stake: 40 });
    /* and the id list is not conjured out of the receipt map either */
    expect((r.entry as unknown as Record<string, unknown>).coreDropped).toBeUndefined();

    /* the two rails agree — the store did not grow its own answer */
    const viaSync = mergeLedgers([stored() as unknown as SyncEntry], [entry("2026-09-05", 10) as unknown as SyncEntry])[0] as Record<string, unknown>;
    expect(pl).toEqual(viaSync.coreDroppedPL);
    expect((r.entry as unknown as Record<string, unknown>).coreDropped).toEqual(viaSync.coreDropped);
  });

  it("exposure counts the SEATED stake once — a receipt neither adds to it nor gives it back", () => {
    upsertCfbEntry(stored());
    expect(cfbExposure("2026-09-05")).toBe(10); // the one $10 ticket on the card
    expect(cfbExposure("2026-09-05")).not.toBe(50); // ...not $10 + the refused $40
    expect(cfbExposure("2026-09-05")).not.toBe(0); // ...and not handed back by its own receipt

    /* the same day with the ID-LIST channel instead answers identically — one property, two
       channels, and neither is a way in to the day's money */
    wipeCfbDevice();
    upsertCfbEntry({ ...entry("2026-09-05", 10), coreDropped: [SEATED, GONE] } as unknown as CfbLedgerEntry);
    expect(cfbExposure("2026-09-05")).toBe(10);
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
