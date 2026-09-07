import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CFB_PAPER } from "@/lib/cfb/rules";
import { mergeLedgers } from "@/lib/ledger-merge";
import { overlayCfbGrading } from "@/lib/cfb/lock-server";
import type { CfbFinals, CfbLedgerEntry, CfbTicket } from "@/lib/cfb/types";
import { applyCfbGrading, cfbExposure, findCfbEntry, gradeCfb, readCfbLedger, upsertCfbEntries, upsertCfbEntry, writeCfbLedger } from "@/lib/cfb/store";

/**
 * THE DEVICE CONVERGENCE PATH (INSTRUCTION 45, 2026-09-06, Josh verbatim: "Parlay Lab CFB
 * should've been running the same $150 per day theoretical Core money and $25 Fun money per
 * day"). The server lock is what WRITES the money; `upsertCfbEntries` in src/lib/cfb/store.ts is
 * what the PHONE converges on when it pulls that record — and it is the phone Josh looks at.
 *
 * Two defects lived here after the server copies of the same two rules were fixed, and this file
 * is the device-side twin of the pins in tests/cfb-lock-route.test.ts:
 *
 *   F  `overlayGrading` bypassed itself on a first pass (`if (!cur) return inc`), so `done` came
 *      from `gradeCfbEntry` when no grading existed yet and from the overlay on every later pass —
 *      the same day was finished or unfinished purely according to whether an earlier pass had
 *      run. And it computed `done` from SETTLED (won / lost / push) only, so a postponed game
 *      graded `ungradable` could never let a day finish on the phone: the CFB Ledger tab re-graded
 *      a day nothing further could be learned about, forever, and the device's `done` permanently
 *      disagreed with the server's.
 *
 *   G  the upsert kept the existing `core` WHOLESALE, so a phone holding the $75 lock that pulled
 *      the server's topped-up $150 copy kept its $75 and the three appended core tickets never
 *      appeared on the device. The sync rail (`unionCore` in src/lib/ledger-merge.ts) learned the
 *      guarded union last pass; this convergence path had not.
 *
 *   D1 the fix for G was a PRIVATE SECOND COPY of that union in store.ts (`coreAppends`), and it
 *      drifted from the original inside one round — no raise pass, and no allotment bound at all
 *      on a day carrying no numeric `daily`. Both rails now call the one exported `unionCore`; the
 *      table at the foot of this file is what holds them together.
 *
 * Every dollar figure below is a SYNTHETIC test input (stakes chosen here, ids shaped like the
 * real positional `cfb-<date>-core-<i>`); the expected totals are computed from those inputs.
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
const install = () => Object.defineProperty(globalThis, "localStorage", { value: memStorage(), configurable: true, writable: true });
const uninstall = () => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
};

const DATE = "2026-09-05";
const cid = (i: number) => `cfb-${DATE}-core-${i}`;
const lkeyOf = (gkey: string) => `${gkey}|ml|home|`;

/** synthetic ticket: one ML leg on `gkey`, whole-dollar stake, Caesars -110 as the captured price */
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
    legs: [
      {
        label: "Test ML",
        prop: "ML",
        cz: -110,
        gkey,
        lkey: lkeyOf(gkey),
        market: "ml",
        side: "home",
        line: null,
        teamId: null,
        prob: 0.55,
        push: 0,
      },
    ],
  };
}

/** a locked CFB day whose core is `n` positional tickets at `stake` each, one game apiece */
function day(n: number, stake: number, extra: Partial<CfbLedgerEntry> = {}): CfbLedgerEntry {
  const core = Array.from({ length: n }, (_, i) => ticket(cid(i + 1), stake, `g${i + 1}`));
  const games: CfbLedgerEntry["games"] = {};
  for (let i = 1; i <= n; i++) games[`g${i}`] = { pk: i, start: `${DATE}T19:00:00Z`, home: `Home ${i}`, away: `Away ${i}` };
  return {
    sport: "cfb",
    date: DATE,
    locked: true,
    daily: CFB_PAPER.daily,
    fun: CFB_PAPER.fun,
    core,
    funT: [],
    lockedAt: 1,
    games,
    ...extra,
  };
}

const stakeSum = (tix: CfbTicket[]) => tix.reduce((s, t) => s + t.stake, 0);

beforeEach(install);
afterEach(uninstall);

/* ============================== F — the grading overlay ============================== */

describe("device overlayGrading — the same rule on every pass (defect F)", () => {
  it("a first pass and a later pass on the same inputs produce identical grading", () => {
    /* Two core tickets; the incoming map grades only the first and CLAIMS done. The overlay must
       recompute `done` from the ENTRY's own tickets on EVERY pass, including the first — before
       the fix `if (!cur) return inc` handed the incoming claim straight through. */
    const base = day(2, 25);
    const inc = day(2, 25, { grading: { tickets: { [cid(1)]: { result: "won", payout: 47.73 } }, legs: {}, done: true } });

    const first = upsertCfbEntries([base], inc);
    expect(first.entry.grading?.done).toBe(false);
    expect(first.entry.grading?.tickets[cid(1)].result).toBe("won");

    const seeded = day(2, 25, { grading: { tickets: {}, legs: {}, done: false } });
    const later = upsertCfbEntries([seeded], inc);
    expect(later.entry.grading).toEqual(first.entry.grading);
  });

  it("overlaying twice equals overlaying once", () => {
    const inc = day(2, 25, {
      grading: {
        tickets: { [cid(1)]: { result: "won", payout: 47.73 }, [cid(2)]: { result: "lost", payout: 0 } },
        legs: { [lkeyOf("g1")]: { result: "won", detail: "24-17" } },
        done: true,
      },
    });
    const once = upsertCfbEntries([day(2, 25)], inc).entry;
    const twice = upsertCfbEntries([once], inc).entry;
    expect(twice.grading).toEqual(once.grading);
    expect(once.grading?.done).toBe(true);
  });

  it("a postponed ticket graded ungradable lets the day reach done", () => {
    /* A void RESOLVES the ticket for the purpose of stopping the poke: nothing this device can
       recompute from what it holds turns it into a score, so the day may finish. It is NOT
       settled — the case below pins that a later `won` still overwrites it (corrected 2026-09-06,
       INSTRUCTION 45, defect V3: this comment used to claim a void "is terminal", which the
       overwrite guard `settled(...)` in src/lib/cfb/store.ts contradicts). Before the fix `done`
       was computed with SETTLED (won / lost / push), so this day could never finish and the Ledger
       tab re-graded it forever. */
    const seeded = day(2, 25, { grading: { tickets: {}, legs: {}, done: false } });
    const inc = day(2, 25, {
      grading: {
        tickets: { [cid(1)]: { result: "won", payout: 47.73 }, [cid(2)]: { result: "ungradable", payout: 25 } },
        legs: {},
        done: true,
      },
    });
    const r = upsertCfbEntries([seeded], inc);
    expect(r.entry.grading?.done).toBe(true);
    expect(r.entry.grading?.tickets[cid(2)].result).toBe("ungradable");
  });

  it("a still-pending ticket keeps the day open", () => {
    const seeded = day(2, 25, { grading: { tickets: {}, legs: {}, done: false } });
    const inc = day(2, 25, {
      grading: { tickets: { [cid(1)]: { result: "won", payout: 47.73 }, [cid(2)]: { result: "pending", payout: 0 } }, legs: {}, done: true },
      });
    expect(upsertCfbEntries([seeded], inc).entry.grading?.done).toBe(false);
  });

  it("a settled TICKET grade and a settled LEG grade are both never overwritten", () => {
    const cur = day(1, 25, {
      grading: { tickets: { [cid(1)]: { result: "won", payout: 47.73 } }, legs: { [lkeyOf("g1")]: { result: "won", detail: "24-17" } }, done: true },
    });
    const inc = day(1, 25, {
      grading: { tickets: { [cid(1)]: { result: "lost", payout: 0 } }, legs: { [lkeyOf("g1")]: { result: "lost", detail: "17-24" } }, done: true },
    });
    const r = upsertCfbEntries([cur], inc);
    expect(r.entry.grading?.tickets[cid(1)].result).toBe("won");
    expect(r.entry.grading?.legs[lkeyOf("g1")].result).toBe("won");
    expect(r.entry.grading?.done).toBe(true);
  });

  it("an ungradable verdict IS replaceable — by a CORROBORATED final; a void is resolved, not settled", () => {
    /* REWRITTEN 2026-09-06 (INSTRUCTION 45, defect B3), and it is a rewrite of a pin that encoded
       now-deliberately-different behaviour, not a loosening of one. It read, verbatim:

           const cur = day(1, 25, { grading: { tickets: { [cid(1)]: { result: "ungradable", payout: 25 } }, legs: {}, done: true } });
           const inc = day(1, 25, { grading: { tickets: { [cid(1)]: { result: "won", payout: 47.73 } }, legs: {}, done: true } });
           const r = upsertCfbEntries([cur], inc);
           expect(r.entry.grading?.tickets[cid(1)].result).toBe("won");
           expect(r.entry.grading?.done).toBe(true);

       — a verdict landing over a void from an EMPTY incoming leg map, which is exactly the
       evidence `overlayCfbGrading` (src/lib/cfb/lock-server.ts) has refused since L2 and which the
       device overlay now refuses too. The CLAIM this pin exists for is unchanged and still
       asserted: a void is RESOLVED, not SETTLED, so a real later verdict does replace it. What is
       added is the corroboration the rule now demands — every leg of the ticket settled in the
       incoming leg map — plus the companion assertion that the SAME verdict with no corroboration
       does NOT land. Strictly more is pinned here than before, not less. */
    const cur = day(1, 25, { grading: { tickets: { [cid(1)]: { result: "ungradable", payout: 25 } }, legs: {}, done: true } });
    const inc = day(1, 25, {
      grading: {
        tickets: { [cid(1)]: { result: "won", payout: 47.73 } },
        legs: { [lkeyOf("g1")]: { result: "won", detail: "24-17" } },
        done: true,
      },
    });
    const r = upsertCfbEntries([cur], inc);
    expect(r.entry.grading?.tickets[cid(1)].result).toBe("won");
    expect(r.entry.grading?.done).toBe(true);
    /* and the same `won` with nothing behind it leaves the void standing */
    const bare = day(1, 25, { grading: { tickets: { [cid(1)]: { result: "won", payout: 47.73 } }, legs: {}, done: true } });
    expect(upsertCfbEntries([cur], bare).entry.grading?.tickets[cid(1)].result).toBe("ungradable");
  });
});

/* ========================= G — the core union (the money half) ========================= */

describe("device upsertCfbEntries — the server's top-up reaches the phone (defect G)", () => {
  /**
   * THE DEVICE COPY CARRIES AN OPEN GRADING MAP IN THE FOUR CASES BELOW THAT CONTEST THE BASE
   * (INSTRUCTION 45, 2026-09-06, defect B1), and here is why that is a REWRITE of those pins'
   * inputs rather than a loosening of their assertions — none of which changed.
   *
   * `upsertCfbEntries` used to seat `core` from its own `unionCore(cur, entry)` call, which forces
   * the STORED copy to be the base. It now takes the whole merged day from `mergeLedgers`, whose
   * base is `pickBase`'s symmetric choice — that is defect B1's fix, and the point of it is that
   * the phone and the cloud may not answer differently about one date's money. So a pin that
   * asserted "the DEVICE copy's ticket stands" was, silently, also asserting "the device copy is
   * the base", and on these inputs it was not: with no grading on either side `pickBase` falls to
   * its byte-length tiebreak and the incoming card wins.
   *
   * `{ grading: OPEN() }` is present-but-empty grading — `gradeScore` 1 against the incoming
   * copy's 0 — so the device copy is deterministically the base and each pin measures what it was
   * written to measure: the AGREEMENT refusal, the price-is-not-identity rule, and the two
   * ALLOTMENT bounds, all on a card the phone owns. It is also the real shape, and the D1 table
   * below already uses it for the same reason: the phone grades what it pulled, and the server
   * tops the day up afterwards.
   *
   * WHAT THE OLD INPUTS COVERED AND THESE DO NOT is covered instead, and by a stronger pin: the
   * case where the device copy is NOT the base now sits in "the two rails seat the same core in
   * BOTH argument orders" at the foot of this file, which asserts the device rail matches
   * `mergeLedgers` on the rival card, the re-quoted ticket and the legacy day in both orders —
   * an equality the old inputs could not have asserted, because the two rails disagreed.
   */
  const OPEN = () => ({ tickets: {}, legs: {}, done: false }) as CfbLedgerEntry["grading"];

  it("a $75 device copy upserted with the server's $150 copy ends with all six tickets, $150 once", () => {
    const device = day(3, 25); // the noon pull: three core tickets, $75 of the $150
    const server = day(6, 25); // the 1pm top-up: the same three plus three more, $150
    expect(stakeSum(device.core)).toBe(75);
    expect(stakeSum(server.core)).toBe(150);

    const r = upsertCfbEntries([device], server);
    expect(r.entry.core).toHaveLength(6);
    expect(stakeSum(r.entry.core)).toBe(150);
    expect(new Set(r.entry.core.map((t) => t.id)).size).toBe(6);
    expect(r.entry.core.map((t) => t.id)).toEqual([1, 2, 3, 4, 5, 6].map(cid));
    /* the appended tickets' games ride along — grading and CLV both key off entry.games */
    expect(Object.keys(r.entry.games).sort()).toEqual(["g1", "g2", "g3", "g4", "g5", "g6"]);
  });

  it("the union is idempotent — re-upserting the same server copy never double-stakes the day", () => {
    const once = upsertCfbEntries([day(3, 25)], day(6, 25)).entry;
    const twice = upsertCfbEntries([once], day(6, 25)).entry;
    expect(twice.core).toHaveLength(6);
    expect(stakeSum(twice.core)).toBe(150);
    expect(twice.core.map((t) => t.id)).toEqual(once.core.map((t) => t.id));
  });

  it("the appended tickets are DEEP copies — mutating the incoming card cannot reach the record", () => {
    const server = day(6, 25);
    const r = upsertCfbEntries([day(3, 25)], server);
    server.core[5].stake = 9999;
    expect(stakeSum(r.entry.core)).toBe(150);
  });

  it("a rival card that disagrees on a shared id does NOT merge — the phone's own lock stands whole", () => {
    /* CFB core ids are POSITIONAL (`cfb-<date>-core-<i>`), so two independent locks of one date
       both mint `core-1` holding DIFFERENT bets. AGREEMENT refuses the whole union rather than
       stapling a rival's surplus onto a card that is already the day's money. */
    const device = day(3, 25, { grading: OPEN() });
    const rival: CfbLedgerEntry = {
      ...day(6, 25),
      core: [ticket(cid(1), 25, "g99"), ...day(6, 25).core.slice(1)],
    };
    const r = upsertCfbEntries([device], rival);
    expect(r.entry.core).toHaveLength(3);
    expect(stakeSum(r.entry.core)).toBe(75);
    expect(r.entry.core[0].legs[0].gkey).toBe("g1");
  });

  it("a re-quoted leg is the same wager — price and stake are never part of AGREEMENT", () => {
    const device = day(3, 25, { grading: OPEN() });
    const server = day(6, 25);
    server.core[0] = { ...server.core[0], stake: 40, czOdds: -125, legs: [{ ...server.core[0].legs[0], cz: -125 }] };
    const r = upsertCfbEntries([device], server);
    expect(r.entry.core).toHaveLength(6);
    /* the base's own copy of the shared ticket is what stands — $25, not the re-quoted $40 */
    expect(r.entry.core[0].stake).toBe(25);
    expect(stakeSum(r.entry.core)).toBe(150);
  });

  it("ALLOTMENT: appends may never carry the merged core past the day's own recorded daily", () => {
    const device = day(3, 25, { grading: OPEN() }); // $75
    const server = day(7, 25); // $175 — one ticket more than the $150 allotment allows
    const r = upsertCfbEntries([device], server);
    expect(r.entry.daily).toBe(150);
    expect(stakeSum(r.entry.core)).toBe(150);
    expect(r.entry.core).toHaveLength(6);
    expect(r.entry.core.map((t) => t.id)).not.toContain(cid(7));
  });

  it("a day with no numeric daily is bounded by the DESK'S OWN allotment, not left unbounded", () => {
    /* REWRITTEN 2026-09-06 (INSTRUCTION 45, defect D1), and this is a rewrite, not a loosening.
       The pin used to read "a day with no numeric daily unions unbounded rather than lose an
       append to a missing number", asserting `toHaveLength(7)` / `stakeSum === 175` on these very
       inputs. It encoded the DEVICE rail's private `coreAppends` copy, whose
       `const bounded = Number.isFinite(cap) && cap > 0` skipped the allotment gate whenever no
       side carried a numeric `daily` — while the sync rail's `allotmentCap`
       (src/lib/ledger-merge.ts) had already had that default INVERTED (defect E) to fall back to
       the desk's own allotment. So the two rails produced different core SETS on exactly the
       legacy days the fallback exists for: $175 here, $150 there. The union is now the kernel's
       one `unionCore` on both rails, so the bound is CFB_PAPER.daily and the seventh $25 ticket
       does not fit. The assertion is STRICTLY TIGHTER than the one it replaces — an unbounded
       union became a bounded one — and the pin it protects (that an append is not silently lost)
       is re-asserted below: six of the seven still seat. */
    const device = { ...day(3, 25, { grading: OPEN() }), daily: Number.NaN } as CfbLedgerEntry;
    const server = { ...day(7, 25), daily: Number.NaN } as CfbLedgerEntry;
    const r = upsertCfbEntries([device], server);
    expect(CFB_PAPER.daily).toBe(150);
    expect(r.entry.core).toHaveLength(6);
    expect(stakeSum(r.entry.core)).toBe(150);
    expect(r.entry.core.map((t) => t.id)).toEqual([1, 2, 3, 4, 5, 6].map(cid));
  });

  it("an append is NOT a re-lock: refused stays true and every lock-instant field is the phone's own", () => {
    const device = day(3, 25);
    const server = day(6, 25, { lockedAt: 999, source: "server-lock", trigger: "cfb-lock" });
    const r = upsertCfbEntries([device], server);
    expect(r.refused).toBe(true);
    expect(r.entry.lockedAt).toBe(1);
    expect(r.entry.source).toBeUndefined();
    expect(r.entry.trigger).toBeUndefined();
    expect(r.entries).toHaveLength(1);
  });

  it("storage-backed: the once-per-date rule still refuses a second, disagreeing lock", () => {
    expect(upsertCfbEntry(day(3, 25, { grading: OPEN() })).refused).toBe(false);
    const rival: CfbLedgerEntry = { ...day(6, 25), core: [ticket(cid(1), 50, "g99"), ...day(6, 25).core.slice(1)] };
    const r = upsertCfbEntry(rival);
    expect(r.refused).toBe(true);
    expect(readCfbLedger()).toHaveLength(1);
    expect(findCfbEntry(DATE)?.core).toHaveLength(3);
    expect(stakeSum(findCfbEntry(DATE)?.core ?? [])).toBe(75);
  });

  it("storage-backed: the server's top-up lands on the device record itself", () => {
    upsertCfbEntry(day(3, 25));
    upsertCfbEntry(day(6, 25, { source: "server-lock", trigger: "cfb-lock" }));
    const stored = findCfbEntry(DATE);
    expect(stored?.core).toHaveLength(6);
    expect(stakeSum(stored?.core ?? [])).toBe(150);
  });

  it("done is recomputed over the MERGED core — an appended, ungraded ticket reopens the day", () => {
    const device = day(3, 25, {
      grading: { tickets: Object.fromEntries([1, 2, 3].map((i) => [cid(i), { result: "won" as const, payout: 47.73 }])), legs: {}, done: true },
    });
    const server = day(6, 25);
    const r = upsertCfbEntries([device], server);
    expect(r.entry.core).toHaveLength(6);
    expect(r.entry.grading?.done).toBe(false);
  });
});

/* ================= D1 — ONE UNION, ONE SET OF GATES (the two rails converge) ================= */

/**
 * THE TWO RAILS MUST AGREE ABOUT THE MONEY ON A CARD (INSTRUCTION 45, 2026-09-06, defect D1).
 *
 * There are two places a CFB day gets merged with another copy of itself, and until this round
 * they were two different pieces of code with two different sets of gates:
 *
 *   the DEVICE rail   `upsertCfbEntries` (src/lib/cfb/store.ts), reached through `lockCfb`
 *   the SYNC rail     `mergeLedgers` -> `mergeDay` -> `unionCore` (src/lib/ledger-merge.ts),
 *                     which is what src/lib/cfb/sync.ts runs on every pull
 *
 * MEASURED before the fix, and captured verbatim in this round's report: the device rail's private
 * `coreAppends` copy APPENDED ONLY — it had no shared-id RAISE at all — and it SKIPPED the
 * allotment bound entirely whenever the entry carried no numeric `daily`
 * (`const bounded = Number.isFinite(cap) && cap > 0`), where the kernel falls back to the desk's
 * own allotment. So the phone's card and the cloud's card could disagree about the money on one
 * ticket, and about the ticket SET on exactly the legacy days the fallback exists for — and
 * whichever Josh happened to be looking at is the one he would believe.
 *
 * This table is the pin. Each row is a (device copy, incoming copy) pair; the assertion is that
 * BOTH rails produce the SAME core array, and — so a mutant cannot satisfy the pin by making both
 * rails wrong in the same way — what that array actually is. The device copy in every row carries
 * an open (present but empty) grading map so `pickBase` scores it 1 against the incoming copy's 0
 * and deterministically takes the DEVICE side as its base; that is also the real shape (the phone
 * grades what it pulled, the server tops the day up afterwards), and it makes the two rails
 * comparable ticket-for-ticket, ORDER included.
 *
 * Only `core` is compared. The two rails' GRADING rules are deliberately different questions —
 * `mergeDay` does a fill-only map union between two peer copies, `overlayGrading` applies the
 * device's SETTLED overwrite guard — and neither is the other's twin. `overlayGrading`'s twin is
 * `overlayCfbGrading` in src/lib/cfb/lock-server.ts.
 *
 * Every dollar figure is a SYNTHETIC test input; the expected totals are computed from those
 * inputs.
 */
describe("device rail vs sync rail — the SAME core, one union, one set of gates (defect D1)", () => {
  /** present but empty: gradeScore 1 in `pickBase`, so the device copy is always the base. */
  const OPEN = () => ({ tickets: {}, legs: {}, done: false }) as CfbLedgerEntry["grading"];
  const sumOf = (tix: { stake?: unknown }[]) => tix.reduce((s, t) => s + (Number(t.stake) || 0), 0);

  const ROWS: { name: string; device: CfbLedgerEntry; incoming: CfbLedgerEntry; ids: string[]; stake: number }[] = [
    {
      /* the shared-id RAISE with the receipt `withTopUp`-shaped writers stamp: the sync rail takes
         the larger stake, and before this fix the device rail had no raise pass at all. */
      name: "a shared id the server raised WITH a top-up receipt — $15 -> $25, topUp 10",
      device: day(1, 15, { grading: OPEN() }),
      incoming: { ...day(1, 25), core: [{ ...ticket(cid(1), 25, "g1"), topUp: 10 }] },
      ids: [cid(1)],
      stake: 25,
    },
    {
      /* the SAME numbers with no receipt. Neither rail may resurrect a stake the server re-sized:
         the sync rail refuses on the missing `topUp`, the device rail must refuse for the same
         reason and not merely because it never raises. */
      name: "the same $15 -> $25 with NO receipt — neither rail resurrects the larger stake",
      device: day(1, 15, { grading: OPEN() }),
      incoming: day(1, 25),
      ids: [cid(1)],
      stake: 15,
    },
    {
      /* the legacy day the device rail used to union UNBOUNDED. Both sides' `daily` is unreadable,
         so the ceiling is the desk's own CFB_PAPER.daily and the seventh $25 ticket does not fit. */
      name: "a legacy day carrying no numeric daily — both rails fall back to the desk's allotment",
      device: { ...day(3, 25, { grading: OPEN() }), daily: Number.NaN },
      incoming: { ...day(7, 25), daily: Number.NaN },
      ids: [1, 2, 3, 4, 5, 6].map(cid),
      stake: 150,
    },
    {
      /* AGREEMENT: CFB core ids are positional, so two independent locks of one date both mint
         `core-1` over DIFFERENT bets. Both rails must refuse the whole union. */
      name: "a rival card disagreeing on a shared id merges on NEITHER rail",
      device: day(3, 25, { grading: OPEN() }),
      incoming: { ...day(6, 25), core: [ticket(cid(1), 25, "g99"), ...day(6, 25).core.slice(1)] },
      ids: [1, 2, 3].map(cid),
      stake: 75,
    },
    {
      name: "the plain top-up append — the $75 noon copy against the topped-up $150 copy",
      device: day(3, 25, { grading: OPEN() }),
      incoming: day(6, 25),
      ids: [1, 2, 3, 4, 5, 6].map(cid),
      stake: 150,
    },
    {
      /* ALLOTMENT: $75 + seven $25 tickets is $250 on a $150 day; three seat, the seventh does not. */
      name: "an append that would breach the day's own recorded daily is refused on both rails",
      device: day(3, 25, { grading: OPEN() }),
      incoming: day(7, 25),
      ids: [1, 2, 3, 4, 5, 6].map(cid),
      stake: 150,
    },
  ];

  for (const row of ROWS) {
    it(`same core — ${row.name}`, () => {
      const viaDevice = upsertCfbEntries([row.device], row.incoming).entry.core;
      const viaSync = mergeLedgers([row.device], [row.incoming])[0].core;
      expect(viaDevice.map((t) => t.id)).toEqual(row.ids);
      expect(sumOf(viaDevice)).toBe(row.stake);
      expect(viaSync.map((t) => t.id)).toEqual(row.ids);
      expect(sumOf(viaSync)).toBe(row.stake);
      expect(viaDevice).toEqual(viaSync);
    });
  }

  it("a raise invalidates the verdict it was priced under — on the device rail too", () => {
    /* THE SAME RULE `mergeDay` APPLIES (INSTRUCTION 45, defect N1). A stake and the payout beside
       it are ONE quote — src/lib/cfb/grade.ts `settle` prices the payout FROM the stake — so the
       moment a raise lands, a verdict already in the map describes a bet that no longer exists.
       `done: true` would then tell `gradeCfbPending` (src/components/cfb/CfbLedger.tsx) there is
       nothing left to recompute, and the day's realized P/L would read the NEW stake against the
       OLD payout for ever. Enabling the raise on this rail without this is importing the defect.
       Synthetic: $40 at a 1.90 settle is a $76 payout; the server's residue fire raises to $60. */
    const device = day(1, 40, {
      grading: {
        tickets: { [cid(1)]: { result: "won", payout: 76 } },
        legs: { [lkeyOf("g1")]: { result: "won", detail: "24-17" } },
        done: true,
      },
    });
    const incoming = { ...day(1, 60), core: [{ ...ticket(cid(1), 60, "g1"), topUp: 20 }] };
    const r = upsertCfbEntries([device], incoming).entry;
    expect(r.core[0].stake).toBe(60);
    expect(r.core[0].topUp).toBe(20);
    expect(r.grading?.tickets[cid(1)]).toBeUndefined();
    expect(r.grading?.legs[lkeyOf("g1")]).toBeUndefined();
    expect(r.grading?.done).toBe(false);
  });

  it("a leg another surviving ticket still owns is NOT withdrawn with the raised one", () => {
    /* leg verdicts are stake-INDEPENDENT, so withdrawing them is not required for the money; it is
       there so an invalidated ticket leaves no half-present grading record behind it. A leg the
       OTHER ticket still references belongs to a verdict that still stands. Both tickets are built
       on g1 here, so they share the one lkey. */
    const shared = lkeyOf("g1");
    const device: CfbLedgerEntry = {
      ...day(2, 25, {
        grading: {
          tickets: { [cid(1)]: { result: "won", payout: 47.73 }, [cid(2)]: { result: "won", payout: 47.73 } },
          legs: { [shared]: { result: "won", detail: "24-17" } },
          done: true,
        },
      }),
      core: [ticket(cid(1), 25, "g1"), ticket(cid(2), 25, "g1")],
    };
    const incoming: CfbLedgerEntry = {
      ...day(2, 25),
      core: [{ ...ticket(cid(1), 40, "g1"), topUp: 15 }, ticket(cid(2), 25, "g1")],
    };
    const r = upsertCfbEntries([device], incoming).entry;
    expect(r.core[0].stake).toBe(40);
    expect(r.grading?.tickets[cid(1)]).toBeUndefined();
    expect(r.grading?.tickets[cid(2)]?.result).toBe("won");
    expect(r.grading?.legs[shared]).toBeDefined();
    expect(r.grading?.done).toBe(false);
  });
});

/* ============ D2 — the first-pass rule is the SAME rule, and it is asserted ============ */

describe("device overlayGrading — an incoming `done` claim is never taken on trust (defect D2)", () => {
  it("a first pass over a device copy with NO grading still recomputes done from the entry", () => {
    /* THE MISSING PIN (INSTRUCTION 45, 2026-09-06, defect D2). `overlayGrading`'s docblock and the
       parity docblock in src/lib/cfb/lock-server.ts BOTH assert that `done` is recomputed from the
       entry on EVERY pass including the first — and nothing asserted it: a mutant restoring the
       deleted `if (!cur) return inc;` bypass passed the whole store suite.
       WHY THE OTHER FIRST-PASS CASE ABOVE DOES NOT BITE: the reopen block under `overlayGrading`
       already forces `done: false` when a ticket is MISSING from the grading map, which is what
       that case has. Here BOTH tickets are PRESENT — cid(2) is graded, just `pending` — so the
       reopen block cannot fire and only the recompute can catch the incoming `done: true`.
       WHAT THE BYPASS WOULD COST: `gradeCfbPending` (src/components/cfb/CfbLedger.tsx) grades the
       days where `!e.grading?.done`, so a day that wrongly reads done is dropped from the grading
       queue for ever and the stake on cid(2) never reaches the bankroll — Instruction 45's own
       failure mode, on the device half. */
    const cur = day(2, 25);
    expect(cur.grading).toBeUndefined();
    const inc = day(2, 25, {
      grading: {
        tickets: { [cid(1)]: { result: "won", payout: 47.73 }, [cid(2)]: { result: "pending", payout: 0 } },
        legs: {},
        done: true,
      },
    });
    const r = upsertCfbEntries([cur], inc).entry;
    expect(r.grading?.done).toBe(false);
    expect(r.grading?.tickets[cid(1)].result).toBe("won");
    expect(r.grading?.tickets[cid(2)].result).toBe("pending");
  });
});

/* ====== V1 + V2 — the FUN bucket and the NO-PLAY flag cross the SAME two rails ====== */

/**
 * THE CORE UNION WAS ONLY THE FIRST THIRD OF THE CARD (INSTRUCTION 45, 2026-09-06, defects V1 and
 * V2). `upsertCfbEntries` builds its result as `{ ...cur, core, games, grading }` — so everything
 * the spread carries is the DEVICE's copy, unexamined. Two of those fields are money:
 *
 *   V1  `funT`. The device rail never unioned the fun bucket at all. MEASURED, both rails on one
 *       pair (device core [core-1 @ $25] / funT []; server the same core plus funT
 *       [topup1-fun-1 @ $25]): `upsertCfbEntries` gave funT [] / $0 and a day exposure of $25,
 *       `mergeLedgers` gave funT [topup1-fun-1] / $25 and an exposure of $50. Josh's instruction
 *       names the fun allotment in the same breath as the core one ("$150 per day theoretical Core
 *       money and $25 Fun money per day"), and the phone was silently dropping the whole $25 half.
 *
 *   V2  `noPlay`. The "a merged day never shows NO-PLAY over staked money" rule went into
 *       `mergeDay` only. MEASURED on device {noPlay:true, core:[], grading done} against a server
 *       copy of the same date carrying two $25 top-up core tickets: the device rail produced core
 *       2 / stake 50 / **noPlay true**, the sync rail core 2 / stake 50 / noPlay undefined. With
 *       the flag standing the Builder renders "NO-PLAY recorded — nothing staked"
 *       (src/components/cfb/CfbBuilder.tsx) and the Ledger row renders "NO-PLAY — nothing staked"
 *       beside a No-play pill (src/components/cfb/CfbLedger.tsx) over $50 of live exposure.
 *
 * The pins below are RAIL-EQUALITY pins, like the D1 table above: each asserts what the field IS
 * and that the two rails produce the same thing, so neither can drift again without a failure —
 * and a mutant cannot satisfy them by breaking both rails identically.
 *
 * Every dollar figure is a SYNTHETIC test input; the expected totals are computed from those
 * inputs.
 */
describe("device rail vs sync rail — the fun bucket and the no-play flag (defects V1, V2)", () => {
  /** present but empty: gradeScore 1 in `pickBase`, so the device copy is always the sync base. */
  const OPEN = () => ({ tickets: {}, legs: {}, done: false }) as CfbLedgerEntry["grading"];
  const sumOf = (tix: { stake?: unknown }[]) => tix.reduce((s, t) => s + (Number(t.stake) || 0), 0);
  const idsOf = (tix: { id?: unknown }[]) => tix.map((t) => String(t.id));
  const funTix = (id: string, stake: number, gkey: string) => ticket(id, stake, gkey, "fun");
  const rails = (device: CfbLedgerEntry, incoming: CfbLedgerEntry) => ({
    viaDevice: upsertCfbEntries([device], incoming).entry,
    viaSync: mergeLedgers([device], [incoming])[0] as CfbLedgerEntry,
  });
  const OWN_FUN = `cfb-${DATE}-fun-1`;
  const TOPUP1_FUN = `cfb-${DATE}-topup1-fun-1`;
  const TOPUP2_FUN = `cfb-${DATE}-topup2-fun-1`;

  it("the server's $25 fun ticket reaches the phone — same funT, same funSum, on both rails", () => {
    const device = day(1, 25, { grading: OPEN() });
    const incoming = day(1, 25, { funT: [funTix(TOPUP1_FUN, 25, "g1")] });
    expect(sumOf(device.funT)).toBe(0);
    const { viaDevice, viaSync } = rails(device, incoming);
    expect(idsOf(viaDevice.funT)).toEqual([TOPUP1_FUN]);
    expect(sumOf(viaDevice.funT)).toBe(25);
    expect(idsOf(viaSync.funT)).toEqual([TOPUP1_FUN]);
    expect(sumOf(viaSync.funT)).toBe(25);
    expect(viaDevice.funT).toEqual(viaSync.funT);
  });

  it("storage-backed: the fun ticket lands on the device record and counts in the day's exposure", () => {
    upsertCfbEntry(day(1, 25, { grading: OPEN() }));
    upsertCfbEntry(day(1, 25, { funT: [funTix(TOPUP1_FUN, 25, "g1")] }));
    expect(idsOf(findCfbEntry(DATE)?.funT ?? [])).toEqual([TOPUP1_FUN]);
    expect(cfbExposure(DATE)).toBe(50);
  });

  it("the fun union is idempotent — a second upsert of the same copy never double-seats the bucket", () => {
    const incoming = day(1, 25, { funT: [funTix(TOPUP1_FUN, 25, "g1")] });
    const once = upsertCfbEntries([day(1, 25, { grading: OPEN() })], incoming).entry;
    const twice = upsertCfbEntries([once], incoming).entry;
    expect(idsOf(twice.funT)).toEqual([TOPUP1_FUN]);
    expect(sumOf(twice.funT)).toBe(25);
    expect(twice.funT).toEqual(once.funT);
  });

  it("the $25 fun allotment bounds the device rail too — the refused ticket is named, not swallowed", () => {
    /* The bucket is already full at the day's own recorded `fun`, so the incoming top-up ticket
       cannot be seated. Both rails must refuse it, and both must NAME it: a silent drop is the
       shape the kernel's K4 exists to end. */
    const device = day(1, 25, { grading: OPEN(), funT: [funTix(OWN_FUN, 25, "g1")] });
    const incoming = day(1, 25, { funT: [funTix(OWN_FUN, 25, "g1"), funTix(TOPUP1_FUN, 25, "g1")] });
    const { viaDevice, viaSync } = rails(device, incoming);
    expect(CFB_PAPER.fun).toBe(25);
    expect(idsOf(viaDevice.funT)).toEqual([OWN_FUN]);
    expect(sumOf(viaDevice.funT)).toBe(25);
    expect(viaDevice.funDropped).toEqual([TOPUP1_FUN]);
    expect(idsOf(viaSync.funT)).toEqual([OWN_FUN]);
    expect(viaSync.funDropped).toEqual([TOPUP1_FUN]);
    expect(viaDevice.funT).toEqual(viaSync.funT);
    expect(viaDevice.funDropped).toEqual(viaSync.funDropped);
  });

  it("a legacy day carrying no numeric daily or fun — both rails fall back to the desk's allotments", () => {
    /* The device rail's old private union skipped its bound whenever no side carried a numeric
       `daily`; the fun bucket had no bound on this rail at all. Both ceilings now come from the
       one kernel pair (`allotmentCap` / `funCap`), so a legacy day is bounded by the desk's own
       $150 / $25 and the two rails seat exactly the same tickets. */
    const device = { ...day(3, 25, { grading: OPEN() }), daily: Number.NaN, fun: Number.NaN };
    const incoming = {
      ...day(7, 25),
      daily: Number.NaN,
      fun: Number.NaN,
      funT: [funTix(TOPUP1_FUN, 25, "g1"), funTix(TOPUP2_FUN, 25, "g2")],
    };
    const { viaDevice, viaSync } = rails(device, incoming);
    expect(CFB_PAPER.daily).toBe(150);
    expect(CFB_PAPER.fun).toBe(25);
    expect(idsOf(viaDevice.core)).toEqual([1, 2, 3, 4, 5, 6].map(cid));
    expect(sumOf(viaDevice.core)).toBe(150);
    expect(idsOf(viaDevice.funT)).toEqual([TOPUP1_FUN]);
    expect(sumOf(viaDevice.funT)).toBe(25);
    expect(viaDevice.funDropped).toEqual([TOPUP2_FUN]);
    expect(viaDevice.core).toEqual(viaSync.core);
    expect(viaDevice.funT).toEqual(viaSync.funT);
    expect(viaDevice.funDropped).toEqual(viaSync.funDropped);
  });

  it("an appended fun ticket reopens the day — `done` is measured over the merged fun bucket too", () => {
    /* `done` is recomputed from the ENTRY's own tickets, and the entry now includes the seated fun
       ticket. A day that was finished before the append is not finished until the new ticket is
       graded, or the CFB Ledger tab drops it from the grading queue for ever. */
    const device = day(1, 25, {
      grading: { tickets: { [cid(1)]: { result: "won", payout: 47.73 } }, legs: {}, done: true },
    });
    const incoming = day(1, 25, { funT: [funTix(TOPUP1_FUN, 25, "g1")] });
    const { viaDevice, viaSync } = rails(device, incoming);
    expect(idsOf(viaDevice.funT)).toEqual([TOPUP1_FUN]);
    expect(viaDevice.grading?.done).toBe(false);
    expect(viaSync.grading?.done).toBe(false);
  });

  it("a stale NO-PLAY never stands over staked money — on the device rail too", () => {
    const device: CfbLedgerEntry = { ...day(0, 25, { grading: { tickets: {}, legs: {}, done: true } }), noPlay: true };
    const incoming: CfbLedgerEntry = {
      ...day(2, 25),
      core: [ticket(`cfb-${DATE}-topup1-core-1`, 25, "g1"), ticket(`cfb-${DATE}-topup1-core-2`, 25, "g2")],
    };
    const { viaDevice, viaSync } = rails(device, incoming);
    expect(viaDevice.core).toHaveLength(2);
    expect(sumOf(viaDevice.core)).toBe(50);
    expect(viaDevice.noPlay).toBeUndefined();
    expect(viaSync.core).toHaveLength(2);
    expect(viaSync.noPlay).toBeUndefined();
    expect(viaDevice.noPlay).toEqual(viaSync.noPlay);
  });

  it("a genuine NO-PLAY day keeps its flag — the twin removes the claim only when the card has bets", () => {
    const device: CfbLedgerEntry = { ...day(0, 25, { grading: { tickets: {}, legs: {}, done: true } }), noPlay: true };
    const incoming: CfbLedgerEntry = { ...day(0, 25), noPlay: true };
    const { viaDevice, viaSync } = rails(device, incoming);
    expect(viaDevice.core).toHaveLength(0);
    expect(viaDevice.noPlay).toBe(true);
    expect(viaSync.noPlay).toBe(true);
    expect(viaDevice.noPlay).toEqual(viaSync.noPlay);
  });
});

/* ====== B1 + B2 + B3 — the last three places the two rails still answered differently ====== */

/**
 * THE CLOSING ROUND (INSTRUCTION 45, 2026-09-06, Josh verbatim: "Parlay Lab CFB should've been
 * running the same $150 per day theoretical Core money and $25 Fun money per day"). The three
 * pins below are the device twins of three rules that shipped on the SERVER side only. Each was
 * measured on this tree before the fix and each verbatim failure is quoted in the block that
 * introduces it.
 *
 *   B1  `upsertCfbEntries` cleared a stale `noPlay` on `kept.core.length` ALONE, while the server
 *       write path (`applyCfbTopUp`, src/lib/cfb/lock-server.ts) cleared it on EITHER bucket.
 *
 *       THE FORM QUOTED HERE WAS WRONG AND IS CORRECTED (INSTRUCTION 45, 2026-09-06, the closing
 *       round's defect C3). This line read "…reads `if (next.noPlay && (core.length ||
 *       funT.length)) delete next.noPlay;`" under a present-tense warrant, and that ROW-COUNT form
 *       is not what the function has: GREPPED THIS TURN, `applyCfbTopUp`'s last statement before
 *       its grading reopen is
 *       `if (next.noPlay && (staked > MONEY_EPS || funStaked > MONEY_EPS)) delete next.noPlay;`,
 *       where `staked` is `cfbStakeOf(core)` and `funStaked` is `cfbStakeOf(funT)` — STAKED MONEY
 *       against that file's `MONEY_EPS` (`1e-9`), not array lengths. The row-count form is what
 *       the server rail said when this pin was written and is kept above only as the history it
 *       is. Nothing below moves: this test drives tickets carrying a positive stake, on which the
 *       two forms agree, and what B1 asserts is the DEVICE rail's behaviour, not the quotation.
 *       A day whose CORE
 *       stayed empty but whose FUN bucket now holds the $25 top-up ticket kept the flag, and the
 *       phone renders "NO-PLAY — nothing staked." (src/components/cfb/CfbLedger.tsx) over a live
 *       $25 wager. That is exactly the day this whole instruction shipped: nothing clears the core
 *       gate, the $25 fun parlay is seated anyway.
 *
 *   B2  the two rails seated DIFFERENT $25 fun wagers. `mergeDay` picks its base SYMMETRICALLY
 *       (`pickBase`); `upsertCfbEntries` always made the STORED copy the base, and the $25 fun cap
 *       then refused whichever ticket the other side happened to hold. Ticket ids key
 *       `grading.tickets`, so the phone and the cloud carried a different wager, a different
 *       verdict and a different day P/L for one date indefinitely — whichever copy was pushed last
 *       won. The V1 pins above cannot see it: they hand both sides the SAME base ticket, so no
 *       base choice is contested.
 *
 *   B3  the corroboration gate was on the SERVER overlay only. `overlayCfbGrading` refuses to
 *       overwrite a stored `ungradable` unless EVERY leg of that ticket is settled in the incoming
 *       leg map; the device's `overlayGrading` took ANY incoming verdict over a void. The phone
 *       re-grading from a PARTIAL finals payload wrote a `lost` that IS settled, and the server's
 *       own corroborated final could then never replace it — the stake scored against a verdict
 *       the server refused to accept from the same evidence.
 *
 * Every dollar figure is a SYNTHETIC test input; the expected totals are computed from those
 * inputs.
 */
describe("device rail vs sync rail — the closing three (B1, B2, B3)", () => {
  const OPEN = () => ({ tickets: {}, legs: {}, done: false }) as CfbLedgerEntry["grading"];
  const sumOf = (tix: { stake?: unknown }[]) => tix.reduce((s, t) => s + (Number(t.stake) || 0), 0);
  const idsOf = (tix: { id?: unknown }[]) => tix.map((t) => String(t.id));
  const funTix = (id: string, stake: number, gkey: string) => ticket(id, stake, gkey, "fun");
  const OWN_FUN = `cfb-${DATE}-fun-1`;
  const TOPUP1_FUN = `cfb-${DATE}-topup1-fun-1`;

  /* ------------------------------- B1 ------------------------------- */

  it("a stale NO-PLAY never stands over a staked FUN bucket either — both argument orders", () => {
    /* THE HEADLINE DAY OF THIS INSTRUCTION (B1). A board where nothing clears the core gate still
       seats the $25 fun parlay, so `core: []` with a funded `funT` is the ORDINARY shape here, not
       a corner. The server write path already clears the flag on either bucket; this rail cleared
       it on the core alone.

       NOT WRITTEN AS A RAIL-EQUALITY PIN, deliberately and only for this round: the sync twin of
       this same widening was being moved and widened in src/lib/ledger-merge.ts by concurrent work
       when this pin was written, so an assertion against `mergeLedgers` here would have been
       measuring another agent's in-flight file rather than this rail. What the DEVICE must do is
       fixed and is asserted directly; the money assertions below (funT / fun sum) are unaffected
       either way.

       THE FORM THIS PARAGRAPH NAMED FOR THAT TWIN — `mergeDay`'s
       `if (out.noPlay && out.core.length) delete out.noPlay;` — WAS THE PRE-MOVE ONE and is dated
       as such (INSTRUCTION 45, 2026-09-06, the closing round's defect C3). That concurrent work
       has landed: GREPPED IN src/lib/ledger-merge.ts THIS TURN, `mergeDay` now reads
       `if (out.noPlay && (stakeSum(out.core) > 1e-9 || stakeSum(out.funT ?? []) > 1e-9)) delete out.noPlay;`
       — both buckets, and measured in STAKED MONEY rather than rows, which is the rule the server
       rail was then brought onto too. The reason for not asserting rail equality HERE is
       therefore spent, and the rail-equality assertions this file now carries for the no-play flag
       live in the C1/C2/C3 describe at the foot of this file ("a $0 ticket in the … bucket does
       NOT end a no-play — staked money decides, on both rails"). This block's own assertions are
       left exactly as they were. */
    const stale: CfbLedgerEntry = {
      ...day(0, 25, { grading: { tickets: {}, legs: {}, done: true } }),
      noPlay: true,
    };
    const funded: CfbLedgerEntry = day(0, 25, { funT: [funTix(TOPUP1_FUN, 25, "g1")] });
    for (const [cur, inc, order] of [
      [stale, funded, "stored stale · incoming funded"],
      [funded, stale, "stored funded · incoming stale"],
    ] as [CfbLedgerEntry, CfbLedgerEntry, string][]) {
      const r = upsertCfbEntries([cur], inc).entry;
      expect(idsOf(r.funT), order).toEqual([TOPUP1_FUN]);
      expect(sumOf(r.funT), order).toBe(25);
      expect(r.core, order).toHaveLength(0);
      expect(r.noPlay, order).toBeUndefined();
    }
  });

  /* ------------------------------- B2 ------------------------------- */

  /**
   * TWO COPIES, TWO DIFFERENT $25 WAGERS. Neither side carries grading, so `pickBase` cannot
   * separate the two copies on richness and its own deterministic tiebreak decides — the SAME
   * decision in either argument order, which is what makes the sync rail symmetric. The device
   * rail seated `cur.funT` unconditionally, so ITS answer was whichever copy the phone happened
   * to have stored. The assertion is that the two rails seat the same ticket and name the same
   * refusal, in both orders.
   */
  const disjoint = (extra: Partial<CfbLedgerEntry> = {}) => ({
    a: { ...day(0, 25, { funT: [funTix(OWN_FUN, 25, "g1")] }), ...extra } as CfbLedgerEntry,
    b: { ...day(0, 25, { funT: [funTix(TOPUP1_FUN, 25, "g2")] }), ...extra } as CfbLedgerEntry,
  });

  for (const [name, extra] of [
    ["a current day", {}],
    ["a legacy day carrying no numeric daily or fun", { daily: Number.NaN, fun: Number.NaN }],
  ] as [string, Partial<CfbLedgerEntry>][]) {
    it(`the same $25 fun ticket is seated on both rails, whichever copy is stored — ${name}`, () => {
      const { a, b } = disjoint(extra);
      const deviceAB = upsertCfbEntries([a], b).entry;
      const deviceBA = upsertCfbEntries([b], a).entry;
      const syncAB = mergeLedgers([a], [b])[0] as CfbLedgerEntry;
      const syncBA = mergeLedgers([b], [a])[0] as CfbLedgerEntry;
      /* the sync rail is symmetric — stated as the fact the device rail is measured against */
      expect(syncAB.funT).toEqual(syncBA.funT);
      expect(syncAB.funDropped).toEqual(syncBA.funDropped);
      /* one $25 ticket seated, one named as refused, and the two rails agree on WHICH */
      expect(sumOf(syncAB.funT)).toBe(25);
      expect(deviceAB.funT).toEqual(syncAB.funT);
      expect(deviceAB.funDropped).toEqual(syncAB.funDropped);
      expect(deviceBA.funT).toEqual(syncBA.funT);
      expect(deviceBA.funDropped).toEqual(syncBA.funDropped);
      /* and the device rail is itself order-free: the stored copy no longer decides the wager */
      expect(deviceAB.funT).toEqual(deviceBA.funT);
      expect(deviceAB.funDropped).toEqual(deviceBA.funDropped);
    });
  }

  /* ------------------------------- B3 ------------------------------- */

  /**
   * A VOID IS REPLACED ONLY BY A CORROBORATED FINAL — ON THE PHONE TOO. The three incomings are
   * the three shapes the gate exists to separate: a PARTIAL leg map (one leg final, the other
   * never), a MISSING key (no leg map at all), and a FULL one (every leg settled). The device
   * overlay is reached through `upsertCfbEntries`; the server's `overlayCfbGrading` is called
   * directly on the same entry and the same two grading maps, so the pin is rail equality and not
   * a restatement of either rule.
   */
  const twoLeg = (id: string, stake: number): CfbTicket => ({
    ...ticket(id, stake, "g1"),
    legs: [ticket(id, stake, "g1").legs[0], ticket(id, stake, "g2").legs[0]],
  });

  for (const [name, legs, expected] of [
    ["PARTIAL — one leg final, the other never", { [lkeyOf("g1")]: { result: "lost", detail: "17-24" } }, "ungradable"],
    ["MISSING — no incoming leg map at all", {}, "ungradable"],
    [
      "FULL — every leg of the ticket settled",
      { [lkeyOf("g1")]: { result: "lost", detail: "17-24" }, [lkeyOf("g2")]: { result: "won", detail: "31-10" } },
      "lost",
    ],
  ] as [string, Record<string, { result: string; detail: string }>, string][]) {
    it(`a stored void takes an incoming verdict on the same terms as the server — ${name}`, () => {
      const T = cid(1);
      const base = { ...day(1, 25), core: [twoLeg(T, 25)] } as CfbLedgerEntry;
      const cur: CfbLedgerEntry = {
        ...base,
        grading: { tickets: { [T]: { result: "ungradable", payout: 0 } }, legs: {}, done: true },
      };
      const inc: CfbLedgerEntry = {
        ...base,
        grading: { tickets: { [T]: { result: "lost", payout: 0 } }, legs, done: true },
      };
      const viaDevice = upsertCfbEntries([cur], inc).entry.grading;
      const viaServer = overlayCfbGrading(cur.grading, inc.grading, base);
      expect(viaDevice?.tickets[T]?.result).toBe(expected);
      expect(viaServer?.tickets[T]?.result).toBe(expected);
      expect(viaDevice).toEqual(viaServer);
    });
  }

  /**
   * A LEGLESS PUSH CANNOT BOOK A VOID AS A STAKE RETURNED — ON THE PHONE TOO (INSTRUCTION 45,
   * 2026-09-06, the closing round's defect C1). A MUTATION SURVIVOR, and the money is the point.
   *
   * WHAT WENT UNPINNED. `overlayGrading` (src/lib/cfb/store.ts) decides whether an incoming
   * verdict may replace a stored `ungradable` by asking its `corroborated` closure, whose first
   * statement — read this turn — is `if (!ls?.length) return false;` over the ticket's own leg
   * list. Planting `return true` in place of that statement and running the whole 39-file suite
   * left it GREEN: the three shapes the loop above drives (PARTIAL, MISSING, FULL) all carry a
   * TWO-LEG ticket, so `ls.length` is 2 on every one of them and the bar is never the thing that
   * decides. Nothing on the device rail drove a ticket with NO legs at all.
   *
   * WHY A LEGLESS TICKET IS THE ONE THAT COSTS MONEY. `settle` (src/lib/cfb/grade.ts) hands a
   * ticket whose leg list is empty a PUSH through its `stood === 0` arm — grepped this turn, that
   * line is `if (stood === 0) return { result: "push", payout: stake, dec: 1, detail: "every leg
   * pushed — stake returned" };` — so the derived verdict is not "unknown", it is a stake RETURNED
   * at full payout. With the bar gone, that push corroborates itself (`[].every(...)` is true) and
   * books over a stored void the desk never proved. `push` is in SETTLED on both rails, so no
   * later pass can take it back.
   *
   * THE SERVER TWIN IS PINNED AND HAS BEEN ("L2: A LEGLESS PUSH CANNOT BOOK A VOID AS A STAKE
   * RETURNED", tests/cfb-lock-route.test.ts) — the two overlays are HAND-KEPT twins, which is
   * exactly the shape that drifts, so this test asserts BOTH DIRECTIONS on BOTH rails in one
   * place: the legless push is REFUSED, the same `push` verdict on a ticket whose legs ARE settled
   * in the incoming map IS taken, and the two rails return the same object either way. A rail that
   * loses the bar fails the first half; a rail that answers "never take a push" fails the second.
   */
  it("a LEGLESS push cannot book a void as a stake returned — and a corroborated push still can, on both rails", () => {
    const T = cid(1);
    const VOID = { tickets: { [T]: { result: "ungradable" as const, payout: 0, detail: "a leg is void" } }, legs: {}, done: true };
    const PUSH = { result: "push" as const, payout: 25, dec: 1, detail: "every leg pushed — stake returned" };

    /* (i) REFUSED — the ticket carries no legs, so nothing corroborates the push */
    const legless = { ...day(1, 25), core: [{ ...ticket(T, 25, "g1"), legs: [] }] } as CfbLedgerEntry;
    expect(legless.core[0].legs).toHaveLength(0);
    const derived = { tickets: { [T]: PUSH }, legs: {}, done: true };
    const refusedDevice = upsertCfbEntries([{ ...legless, grading: VOID }], { ...legless, grading: derived }).entry.grading;
    const refusedServer = overlayCfbGrading(VOID, derived, legless);
    expect(refusedDevice?.tickets[T]?.result).toBe("ungradable");
    expect(refusedDevice?.tickets[T]?.payout).toBe(0);
    expect(refusedServer?.tickets[T]?.result).toBe("ungradable");
    expect(refusedServer?.tickets[T]?.payout).toBe(0);
    expect(refusedDevice).toEqual(refusedServer);

    /* (ii) TAKEN — the SAME push verdict, on a ticket whose every leg pushed off a real final */
    const legged = { ...day(1, 25), core: [twoLeg(T, 25)] } as CfbLedgerEntry;
    const corroborated = {
      tickets: { [T]: PUSH },
      legs: { [lkeyOf("g1")]: { result: "push", detail: "20-17 · margin +3 vs -3 · push" }, [lkeyOf("g2")]: { result: "push", detail: "24-24 · tie" } },
      done: true,
    };
    const takenDevice = upsertCfbEntries([{ ...legged, grading: VOID }], { ...legged, grading: corroborated }).entry.grading;
    const takenServer = overlayCfbGrading(VOID, corroborated, legged);
    expect(takenDevice?.tickets[T]?.result).toBe("push");
    expect(takenDevice?.tickets[T]?.payout).toBe(25);
    expect(takenServer?.tickets[T]?.result).toBe("push");
    expect(takenServer?.tickets[T]?.payout).toBe(25);
    expect(takenDevice).toEqual(takenServer);
  });
});

/* ====== the closing round: CORE off the shared merge, the markers, the device GRADER ====== */

/**
 * THE LAST THREE PLACES THE PHONE AND THE CLOUD STILL ANSWERED DIFFERENTLY (INSTRUCTION 45,
 * 2026-09-06, Josh verbatim: "Parlay Lab CFB should've been running the same $150 per day
 * theoretical Core money and $25 Fun money per day").
 *
 *   B1  the device rail was only HALF delegated. `funT` came off the shared `mergeLedgers` merge
 *       (defect B2) while `core` still came from the private `unionCore(cur, entry)` call — and
 *       core is exactly where the two rails answer differently, because `mergeDay` chooses its
 *       base with the module-private `pickBase` and this rail always made the STORED copy the
 *       base.
 *
 *   B2  `capBreach` rode along on the `{ ...cur }` spread while `funDropped` was taken off the
 *       merged day: two merge markers, one object literal, two different authorities.
 *
 *   B3  `gradeCfb` -> `applyCfbGrading` wrote the device grader's verdict WHOLESALE, with no
 *       overlay and no corroboration gate, so the phone could still settle a void from a partial
 *       finals payload — and once settled the server's own corroborated final could never
 *       replace it.
 *
 * Every dollar figure below is a SYNTHETIC test input; the expected totals are computed from
 * those inputs.
 */
describe("device rail vs sync rail — core, the markers, and the device grader (B1, B2, B3)", () => {
  const sumOf = (tix: { stake?: unknown }[]) => tix.reduce((s, t) => s + (Number(t.stake) || 0), 0);
  const idsOf = (tix: { id?: unknown }[]) => tix.map((t) => String(t.id));
  const twoLeg = (id: string, stake: number): CfbTicket => ({
    ...ticket(id, stake, "g1"),
    legs: [ticket(id, stake, "g1").legs[0], ticket(id, stake, "g2").legs[0]],
  });

  /* ------------------------------- B1 ------------------------------- */

  it("an already-over-cap stored blob converges on ONE core and ONE capBreach — both argument orders", () => {
    const a = day(3, 25); // $75
    const b = day(7, 25); // $175 — the shape mergeDay's own K3 docblock calls a blob already over cap
    expect(sumOf(a.core)).toBe(75);
    expect(sumOf(b.core)).toBe(175);
    for (const [cur, inc, order] of [
      [a, b, "stored $75 · incoming $175"],
      [b, a, "stored $175 · incoming $75"],
    ] as [CfbLedgerEntry, CfbLedgerEntry, string][]) {
      const viaDevice = upsertCfbEntries([cur], inc).entry;
      const viaSync = mergeLedgers([cur], [inc])[0] as CfbLedgerEntry;
      expect(idsOf(viaDevice.core), order).toEqual(idsOf(viaSync.core));
      expect(sumOf(viaDevice.core), order).toBe(sumOf(viaSync.core));
      expect(viaDevice.core, order).toEqual(viaSync.core);
      expect(viaDevice.capBreach, order).toEqual(viaSync.capBreach);
      /* and what that one answer actually IS, so a mutant cannot satisfy the pin by breaking
         both rails the same way */
      expect(sumOf(viaDevice.core), order).toBe(175);
      expect(viaDevice.capBreach, order).toEqual({ core: { sum: 175, cap: 150 } });
    }
  });

  it("the two rails seat the same core in BOTH argument orders — the append, the rival and the legacy day", () => {
    const PAIRS: [string, CfbLedgerEntry, CfbLedgerEntry][] = [
      ["the plain top-up append", day(3, 25), day(6, 25)],
      ["a rival card disagreeing on a shared id", day(3, 25), { ...day(6, 25), core: [ticket(cid(1), 25, "g99"), ...day(6, 25).core.slice(1)] }],
      ["a legacy day carrying no numeric daily", { ...day(3, 25), daily: Number.NaN }, { ...day(7, 25), daily: Number.NaN }],
      ["a re-quoted, re-staked shared ticket with no receipt", day(3, 25), { ...day(6, 25), core: [{ ...ticket(cid(1), 40, "g1"), czOdds: -125 }, ...day(6, 25).core.slice(1)] }],
    ];
    for (const [name, a, b] of PAIRS) {
      for (const [cur, inc, order] of [
        [a, b, `${name} · a stored`],
        [b, a, `${name} · b stored`],
      ] as [CfbLedgerEntry, CfbLedgerEntry, string][]) {
        const viaDevice = upsertCfbEntries([cur], inc).entry;
        const viaSync = mergeLedgers([cur], [inc])[0] as CfbLedgerEntry;
        expect(viaDevice.core, order).toEqual(viaSync.core);
        expect(sumOf(viaDevice.core), order).toBe(sumOf(viaSync.core));
        expect(viaDevice.capBreach, order).toEqual(viaSync.capBreach);
      }
    }
  });

  /* ------------------------------- B2 ------------------------------- */

  it("a stale capBreach does NOT ride along on a day that is no longer over cap", () => {
    const stale = { ...day(3, 25), capBreach: { core: { sum: 175, cap: 150 } } } as CfbLedgerEntry;
    const r = upsertCfbEntries([stale], day(3, 25)).entry;
    expect(sumOf(r.core)).toBe(75);
    expect(r.capBreach).toBeUndefined();
    expect(r.capBreach).toEqual((mergeLedgers([stale], [day(3, 25)])[0] as CfbLedgerEntry).capBreach);
  });

  it("a day that BECOMES over cap gains the marker the sync rail gives it", () => {
    const cur = day(3, 25);
    const inc = day(7, 25);
    expect(cur.capBreach).toBeUndefined();
    const r = upsertCfbEntries([cur], inc).entry;
    expect(r.capBreach).toEqual({ core: { sum: 175, cap: 150 } });
  });

  /* ------------------------------- B3 ------------------------------- */

  it("the DEVICE grader cannot settle a void from an uncorroborated pass, and yields to a corroborated one", () => {
    const T = cid(1);
    const base = { ...day(2, 25), core: [twoLeg(T, 25)] } as CfbLedgerEntry;
    const stored: CfbLedgerEntry = { ...base, grading: { tickets: { [T]: { result: "ungradable", payout: 0 } }, legs: {}, done: true } };
    writeCfbLedger([stored]);
    const partial = { tickets: { [T]: { result: "lost" as const, payout: 0 } }, legs: { [lkeyOf("g1")]: { result: "lost", detail: "17-24" } }, done: true };
    expect(applyCfbGrading(DATE, partial)?.grading?.tickets[T]?.result).toBe("ungradable");
    expect(findCfbEntry(DATE)?.grading?.tickets[T]?.result).toBe("ungradable");
    const full = {
      tickets: { [T]: { result: "lost" as const, payout: 0 } },
      legs: { [lkeyOf("g1")]: { result: "lost", detail: "17-24" }, [lkeyOf("g2")]: { result: "won", detail: "31-10" } },
      done: true,
    };
    expect(applyCfbGrading(DATE, full)?.grading?.tickets[T]?.result).toBe("lost");
    expect(findCfbEntry(DATE)?.grading?.tickets[T]?.result).toBe("lost");
  });

  it("gradeCfb over a PARTIAL finals payload leaves the stored void standing; the full payload settles it", () => {
    const T = cid(1);
    const base = { ...day(2, 25), core: [twoLeg(T, 25)] } as CfbLedgerEntry;
    writeCfbLedger([{ ...base, grading: { tickets: { [T]: { result: "ungradable", payout: 0 } }, legs: {}, done: true } }]);
    const partial: CfbFinals = { g1: { home: 17, away: 24, final: true, status: "final" } };
    expect(gradeCfb(DATE, partial)?.tickets[T]?.result).toBe("ungradable");
    expect(findCfbEntry(DATE)?.grading?.tickets[T]?.result).toBe("ungradable");
    const full: CfbFinals = { ...partial, g2: { home: 31, away: 10, final: true, status: "final" } };
    expect(gradeCfb(DATE, full)?.tickets[T]?.result).toBe("lost");
    expect(findCfbEntry(DATE)?.grading?.tickets[T]?.result).toBe("lost");
  });
});

/* ====== the closing round: the merge's ANSWER is the default on this rail (C1, C2, C3) ====== */

/**
 * ONE DEFECT, THREE FACES (INSTRUCTION 45, 2026-09-06, Josh verbatim: "Parlay Lab CFB should've
 * been running the same $150 per day theoretical Core money and $25 Fun money per day").
 *
 * `upsertCfbEntries` built its answer as `{ ...cur, core, funT, games, grading }` and then copied
 * back, by hand and BY NAME, the fields of the merged day somebody had remembered — `funDropped`
 * one round, `capBreach` the next. The DEFAULT for a CFB day was therefore "whatever the phone
 * already held", and the shared merge reached the record only through that list. Six rounds have
 * each fixed one member of the class and shipped the next; these pins are written against the
 * DIRECTION rather than against any one member:
 *
 *   C1  the no-play rule was stated a THIRD time here, and this copy counted ROWS while
 *       `mergeDay` had moved to STAKED MONEY. A $0 ticket in either bucket made the phone call a
 *       genuine no-play day a played one.
 *   C2  `funDroppedPL` — the receipt that says what a dropped SETTLED fun ticket was worth — was
 *       never carried, so the phone named a drop it could not price.
 *   C3  and neither would the next marker be. `alt`, `clv`, `blocks` and the MLB money metadata
 *       were in the same position.
 *
 * The sweep at the foot of this block is the pin that outlives the list: it compares EVERY key of
 * the merged day except the ones the lock instant and this file's own grading rule own, so a
 * marker added to `mergeDay` next round is carried or this fails. Every dollar figure below is a
 * SYNTHETIC test input; the expected totals are computed from those inputs.
 */
describe("device rail vs sync rail — the merge's answer is the default (C1, C2, C3)", () => {
  const sumOf = (tix: { stake?: unknown }[]) => tix.reduce((s, t) => s + (Number(t.stake) || 0), 0);
  const idsOf = (tix: { id?: unknown }[]) => tix.map((t) => String(t.id));
  const funTix = (id: string, stake: number, gkey: string) => ticket(id, stake, gkey, "fun");
  const OWN_FUN = `cfb-${DATE}-fun-1`;
  const TOPUP1_FUN = `cfb-${DATE}-topup1-fun-1`;
  const both = (a: CfbLedgerEntry, b: CfbLedgerEntry): [CfbLedgerEntry, CfbLedgerEntry, string][] => [
    [a, b, "a stored · b incoming"],
    [b, a, "b stored · a incoming"],
  ];

  /* ------------------------------- C1 — a $0 ticket is not a bet ------------------------------- */

  /**
   * THE THIRD COPY OF THE NO-PLAY RULE IS GONE. `mergeDay` (src/lib/ledger-merge.ts) reads
   * `if (out.noPlay && (stakeSum(out.core) > 1e-9 || stakeSum(out.funT ?? []) > 1e-9)) delete
   * out.noPlay;` — quoted from that file this turn — while this rail read
   * `if (kept.noPlay && (kept.core.length || kept.funT.length)) delete kept.noPlay;`. A writer that
   * emits a $0 row (a benched ticket recorded for the record, a top-up plan whose stake rounds
   * away) makes the two rails disagree about whether Josh played that Saturday at all.
   *
   * The pin is rail EQUALITY plus what the answer IS, so a mutant cannot satisfy it by breaking
   * both rails the same way. Both argument orders, because the stale copy is the one carrying the
   * flag in one order and the incoming one in the other.
   */
  for (const [bucket, zero] of [
    ["core", (): CfbLedgerEntry => ({ ...day(0, 0), core: [ticket(cid(1), 0, "g1")] })],
    ["fun", (): CfbLedgerEntry => ({ ...day(0, 0), funT: [funTix(TOPUP1_FUN, 0, "g1")] })],
  ] as [string, () => CfbLedgerEntry][]) {
    it(`a $0 ticket in the ${bucket} bucket does NOT end a no-play — staked money decides, on both rails`, () => {
      const stale: CfbLedgerEntry = { ...day(0, 0, { grading: { tickets: {}, legs: {}, done: true } }), noPlay: true };
      for (const [cur, inc, order] of both(stale, zero())) {
        const viaDevice = upsertCfbEntries([cur], inc).entry;
        const viaSync = mergeLedgers([cur], [inc])[0] as CfbLedgerEntry;
        expect(sumOf([...viaDevice.core, ...viaDevice.funT]), order).toBe(0);
        expect(viaDevice.core.length + viaDevice.funT.length, order).toBe(1);
        expect(viaSync.noPlay, order).toBe(true);
        expect(viaDevice.noPlay, order).toBe(true);
        expect(viaDevice.noPlay, order).toEqual(viaSync.noPlay);
      }
    });
  }

  it("a REAL staked ticket still ends the no-play on this rail — the widening did not become a loophole", () => {
    const stale: CfbLedgerEntry = { ...day(0, 0, { grading: { tickets: {}, legs: {}, done: true } }), noPlay: true };
    const funded: CfbLedgerEntry = { ...day(0, 0), funT: [funTix(TOPUP1_FUN, 25, "g1")] };
    for (const [cur, inc, order] of both(stale, funded)) {
      const viaDevice = upsertCfbEntries([cur], inc).entry;
      const viaSync = mergeLedgers([cur], [inc])[0] as CfbLedgerEntry;
      expect(sumOf(viaDevice.funT), order).toBe(25);
      expect(viaDevice.noPlay, order).toBeUndefined();
      expect(viaDevice.noPlay, order).toEqual(viaSync.noPlay);
    }
  });

  /* ------------------------- C2 / C3 — the markers and the sweep ------------------------- */

  /**
   * TWO SETTLED $25 FUN TICKETS AND ONE $25 ALLOTMENT, on a day whose core is already over its
   * $150 cap — the one pair that makes `mergeDay` emit all three markers at once: `funDropped`
   * (the id the cap refused), `funDroppedPL` (what that refused ticket was WORTH, added so a
   * settled ticket is never deleted in silence) and `capBreach` (the stored blob that was already
   * over cap). The phone carried the first and the third and dropped the second.
   */
  const marked = (): { a: CfbLedgerEntry; b: CfbLedgerEntry } => ({
    a: {
      ...day(7, 25),
      funT: [funTix(OWN_FUN, 25, "g1")],
      grading: { tickets: { [OWN_FUN]: { result: "won", payout: 47.73 } }, legs: {}, done: false },
    },
    b: {
      ...day(7, 25),
      funT: [funTix(TOPUP1_FUN, 25, "g2")],
      grading: { tickets: { [TOPUP1_FUN]: { result: "won", payout: 30 } }, legs: {}, done: false },
    },
  });

  it("the DROP RECEIPT reaches the phone with the money on it — funDroppedPL, both argument orders", () => {
    const { a, b } = marked();
    for (const [cur, inc, order] of both(a, b)) {
      const viaDevice = upsertCfbEntries([cur], inc).entry;
      const viaSync = mergeLedgers([cur], [inc])[0] as CfbLedgerEntry;
      /* THE SYNC RAIL NAMES ONE REFUSAL AND PRICES IT — stated as the fact the device is measured
         against, so this pin fails if the kernel stops emitting the receipt as well as if the
         device stops carrying it. WHICH of the two $25 tickets the $25 allotment refuses is
         `unionFun`'s SETTLEMENT RANKING and is pinned in tests/ledger-merge.test.ts, not here, so
         the expected id is read off the merge's own answer: exactly one of a $25 pair must be
         refused whatever the ranking says, and the receipt must price THAT one from the verdict
         the fixture gave it. This file's question is whether the phone carries what the merge
         produced — a ranking change must not turn that into a red here. */
      const dropped = (viaSync.funDropped ?? []) as string[];
      expect(dropped, order).toHaveLength(1);
      const gone = String(dropped[0]);
      const PAYOUT: Record<string, number> = { [OWN_FUN]: 47.73, [TOPUP1_FUN]: 30 };
      expect(idsOf(viaSync.funT), order).toEqual([gone === OWN_FUN ? TOPUP1_FUN : OWN_FUN]);
      expect(viaSync.funDroppedPL, order).toEqual({ [gone]: { result: "won", payout: PAYOUT[gone], stake: 25 } });
      expect(viaDevice.funDropped, order).toEqual(viaSync.funDropped);
      expect(viaDevice.funDroppedPL, order).toEqual(viaSync.funDroppedPL);
      expect(viaDevice.capBreach, order).toEqual(viaSync.capBreach);
      expect(viaDevice.capBreach, order).toEqual({ core: { sum: 175, cap: 150 } });
    }
  });

  it("a receipt never outlives the loss it names — a stored funDroppedPL for a now-seated ticket is dropped", () => {
    const stale: CfbLedgerEntry = {
      ...day(1, 25),
      funT: [],
      funDropped: [OWN_FUN],
      funDroppedPL: { [OWN_FUN]: { result: "won", payout: 47.73, stake: 25 } },
      grading: { tickets: {}, legs: {}, done: false },
    } as CfbLedgerEntry;
    const seats: CfbLedgerEntry = { ...day(1, 25), funT: [funTix(OWN_FUN, 25, "g1")] };
    const viaDevice = upsertCfbEntries([stale], seats).entry;
    const viaSync = mergeLedgers([stale], [seats])[0] as CfbLedgerEntry;
    expect(idsOf(viaDevice.funT)).toEqual([OWN_FUN]);
    expect(viaSync.funDroppedPL).toBeUndefined();
    expect(viaDevice.funDroppedPL).toBeUndefined();
    expect(viaDevice.funDropped).toEqual(viaSync.funDropped);
  });

  /**
   * THE PIN THAT OUTLIVES THE LIST (C3). Every key of the merged day is compared, MINUS the two
   * closed sets this rail legitimately owns:
   *
   *   `LOCK_INSTANT`  sport · date · locked · daily · fun · lockedAt · source · trigger — the
   *                   once-per-date lock's own fields, taken back off the stored copy by name
   *                   (src/lib/cfb/store.ts `LOCK_INSTANT`), and separately pinned below.
   *   `grading`       this file's `overlayGrading`, deliberately not `mergeDay`'s fill-only map
   *                   merge — the two answer differently about a void ON PURPOSE.
   *
   * Everything else is the shared merge's answer, so a marker `mergeDay` starts emitting next
   * round is carried onto the phone with no edit to store.ts — and if someone re-introduces a
   * `{ ...cur }` default, THIS fails rather than the money quietly diverging for another six
   * rounds. The `arrayContaining` line below is a NON-VACUITY check, not the carrying assertion:
   * it proves the sweep actually had the markers in scope on this fixture.
   */
  const DEVICE_OWNED = new Set(["sport", "date", "locked", "daily", "fun", "lockedAt", "source", "trigger", "grading"]);
  const mergeOwned = (e: CfbLedgerEntry) => Object.fromEntries(Object.entries(e as Record<string, unknown>).filter(([k]) => !DEVICE_OWNED.has(k)));

  it("every field the shared merge decides is the phone's answer too — a sweep over the merged day's keys", () => {
    const { a, b } = marked();
    for (const [cur, inc, order] of both(a, b)) {
      const viaDevice = upsertCfbEntries([cur], inc).entry;
      const viaSync = mergeLedgers([cur], [inc])[0] as CfbLedgerEntry;
      expect(Object.keys(mergeOwned(viaSync)).sort(), order).toEqual(expect.arrayContaining(["capBreach", "core", "funDropped", "funDroppedPL", "funT", "games"]));
      expect(mergeOwned(viaDevice), order).toEqual(mergeOwned(viaSync));
    }
  });

  /**
   * AND THE MARKERS THE KERNEL ADDED WHILE THIS ROUND WAS OPEN ARE ALREADY ON THE PHONE
   * (INSTRUCTION 45, 2026-09-06, defect C2 here / the kernel's own C2). The sweep above is
   * generic, but a generic sweep only proves what its FIXTURE produces, and that fixture makes
   * `capBreach` / `funDropped` / `funDroppedPL` fire and nothing else. `mergeDay`
   * (src/lib/ledger-merge.ts) grew three MORE merge markers this round, read in that file this
   * turn beside its `stillCoreDropped` / `stillConflict` writes:
   *   "· `coreDropped`   — ids the allotment refused, dropped again if the id is now seated."
   *   "· `coreDroppedPL` — what each of those wagers was WORTH, same shape as `funDroppedPL`."
   *   "· `stakeConflict` — {kept, refused} for a shared id whose stakes disagreed with no receipt."
   * Not one of them is named anywhere in src/lib/cfb/store.ts — they reach the phone because the
   * merged day IS the device record now. This fixture makes all three fire and re-runs the same
   * equality over them, so that claim is measured rather than asserted.
   *
   * THE FIXTURE. One date. The stored copy is the whole $150 desk — six ids at $25 — and carries
   * grading, so `gradeScore` seats IT as the base in BOTH argument orders. The other copy holds a
   * SEVENTH ticket and stakes the first id at $30 with no `topUp` stamp anywhere. The raise has no
   * receipt, so the reconciliation keeps the smaller stake and records the refusal; the seventh
   * ticket does not fit under the day's own allotment, so the append is refused and NAMED with the
   * money it represented.
   *
   * THE KEY ASSERTION IS A UNION ACROSS BOTH ORDERS AND STAYS `arrayContaining`, so a marker the
   * kernel adds NEXT is carried by the same deep equality without this pin being edited. The
   * inversion in `upsertCfbEntries` makes a forgotten field fail SAFE (it is the merge's own
   * answer); this shape makes a RE-INTRODUCED hand-written carry list fail LOUD.
   */
  it("the markers the kernel added this round reach the phone too — stakeConflict and the core drop channel", () => {
    const a = day(6, 25, { grading: { tickets: {}, legs: {}, done: false } });
    const b = day(7, 25);
    b.core[0] = { ...b.core[0], stake: 30 };
    const seen = new Set<string>();
    for (const [cur, inc, order] of both(a, b)) {
      const viaDevice = upsertCfbEntries([cur], inc).entry;
      const viaSync = mergeLedgers([cur], [inc])[0] as CfbLedgerEntry;
      for (const k of Object.keys(mergeOwned(viaSync))) seen.add(k);
      expect(mergeOwned(viaDevice), order).toEqual(mergeOwned(viaSync));
      /* and what the answer IS, so a mutant cannot satisfy the equality by breaking both rails */
      expect(viaDevice.core.find((t) => t.id === cid(1))?.stake, order).toBe(25);
      expect(idsOf(viaDevice.core), order).toEqual([1, 2, 3, 4, 5, 6].map(cid));
      expect(sumOf(viaDevice.core), order).toBe(150);
    }
    expect([...seen].sort()).toEqual(expect.arrayContaining(["coreDropped", "coreDroppedPL", "stakeConflict"]));
  });

  it("and the LOCK INSTANT is still the phone's own — even when the incoming copy wins pickBase", () => {
    /* The incoming copy is graded (`gradeScore` 2 against 0), so `pickBase` seats IT as the merged
       day's base — the case the old `{ ...cur }` spread made unreachable and the inversion has to
       handle by name. A re-lock would re-stake the Saturday; this is still not one. */
    const device = day(3, 25);
    const server = day(6, 25, {
      lockedAt: 999,
      source: "server-lock",
      trigger: "cfb-lock",
      daily: 999,
      fun: 999,
      grading: { tickets: {}, legs: {}, done: true },
    });
    const r = upsertCfbEntries([device], server);
    expect(r.refused).toBe(true);
    expect(r.entry.lockedAt).toBe(1);
    expect(r.entry.daily).toBe(150);
    expect(r.entry.fun).toBe(25);
    expect(r.entry.source).toBeUndefined();
    expect(r.entry.trigger).toBeUndefined();
    /* and the money still came off the shared merge */
    expect(idsOf(r.entry.core)).toEqual([1, 2, 3, 4, 5, 6].map(cid));
    expect(sumOf(r.entry.core)).toBe(150);
  });
});
