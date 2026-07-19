import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FROZEN_NOW, TODAY, fixtureFetchJson } from "./helpers/fixture-env";
import { createEngine, type Engine } from "@/engine";
import { mergeLedgers, type SyncEntry } from "@/lib/ledger-merge";
import { applySights, pendingLegs, sightProp, type OddsEvent } from "@/lib/server/clv-core";
import { ledgerSegments } from "@/lib/ledger-segments";

/* Supplemental fun locks + shadow card. Hard rules under test:
   (a) total fun staked across all locks today <= the day's FUN $ — at zero the
       feature disables until tomorrow;
   (b) appends are append-only: own lockedAt, supplemental:true, core and
       existing grades untouched, immutability guard still holds;
   (c) the pool obeys every existing fun rule PLUS leg-disjointness against
       everything already locked today;
   (d) grading and CLV sighting cover supplemental tickets identically;
   (e) the shadow card (shCardCalc while locked) never writes the ledger. */

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FROZEN_NOW);
});
afterAll(() => vi.useRealTimers());

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    dump: (k: string) => m.get(k) ?? null,
  };
}

type Pl = Record<string, unknown>;
const leg = (label: string, mkt: string, gkey: string, ln = 5.5) => ({
  label,
  prop: `${mkt} O ${ln}`,
  lkey: `${label.toLowerCase().replace(/\s/g, "")}|${mkt}|${ln}`,
  game: gkey,
  gkey,
  cz: -110,
  est: 60,
});
const corePl = (name: string, g1: string, g2: string): Pl => ({
  type: "MIX",
  name,
  legs: [leg(`${name} A`, "batter_hits", g1), leg(`${name} B`, "batter_hits", g2)],
  czDec: 2.4,
  czOdds: "+140",
  czEv: 3,
  prob: 45,
});
const funPl = (name: string, czDec: number, prob: number, g: string, extra: Pl = {}): Pl => ({
  type: "MIX",
  name,
  legs: [leg(`${name} A`, "batter_hits", g), leg(`${name} B`, "batter_total_bases", g)],
  czDec,
  czOdds: "+1100",
  czEv: 5,
  prob,
  ...extra,
});
const gameInfo = (keys: string[], startIso = "2026-07-10T23:00:00Z") => {
  const gi: Record<string, unknown> = {};
  keys.forEach((k, i) => (gi[k] = { pk: 900000 + i, start: startIso, away: `A${i}`, home: `H${i}` }));
  return gi;
};
const board = (parlays: Pl[], gi: Record<string, unknown>) => ({ parlays, parlaysMixed: [], gameInfo: gi });

const CORE4 = () => [corePl("N1", "g1", "g2"), corePl("N2", "g3", "g4"), corePl("N3", "g5", "g6"), corePl("N4", "g7", "g8")];

type Entry = SyncEntry & {
  fun: number;
  games: Record<string, { pk: number | null; start: string }>;
  gradedAt?: number | null;
};
type SuppCalc = { budget: number; staked: number; left: number; fun: { picks: { id: string; stake: number; w: { pl: { legs: { label: string; prop: string }[] } } }[]; sum: number } };
type SuppResult = { ok: boolean; err?: string; added?: number; sum?: number; left?: number };

/** Fresh engine with a locked morning card: DAILY $40 over 4 core tickets,
    FUN $20 budgeted but unspent (no fun-eligible tickets on the morning board). */
function lockedMorning() {
  const storage = memoryStorage();
  const eng = createEngine({ fetchJson: fixtureFetchJson, today: TODAY, storage });
  const SH = eng.get<Record<string, unknown>>("SH");
  SH.daily = 40;
  SH.fun = 20;
  SH.bankroll = 750;
  const d = board(CORE4(), gameInfo(["g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8"]));
  SH.board = { date: TODAY, data: d };
  eng.get<() => void>("shLockCard")();
  const entry = eng.get<(dt: string) => Entry | null>("shLedgerFind")(TODAY)!;
  return { eng, SH, storage, entry };
}

/** Evening board: same core + fun-tier candidates, one of which (F-DUP) shares
    a leg with the locked card and would sort FIRST if disjointness failed. */
function eveningBoard() {
  const dup = funPl("F-DUP", 15, 6, "g11", { posCorr: true }) as { legs: unknown[] };
  dup.legs[0] = leg("N1 A", "batter_hits", "g1"); // identical lid to locked core leg
  const d = board(
    [...CORE4(), funPl("F1", 12, 8, "g9"), funPl("F2", 30, 3, "g10"), dup as Pl],
    gameInfo(["g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8", "g9", "g10", "g11"]),
  );
  return d;
}

describe("supplemental fun locks (engine)", () => {
  it("morning lock leaves the FUN budget intact when no longshot qualifies", () => {
    const { eng, entry } = lockedMorning();
    expect(entry.locked).toBe(true);
    expect(entry.core.length).toBeGreaterThanOrEqual(4);
    expect(entry.funT).toHaveLength(0);
    const r = eng.get<() => { budget: number; staked: number; left: number }>("shFunRemaining")();
    expect(r).toMatchObject({ budget: 20, staked: 0, left: 20 });
  });

  it("pool is leg-disjoint against everything locked today — the tainted ticket is skipped, remaining budget drives the tier split", () => {
    const { eng, SH } = lockedMorning();
    const d = eveningBoard();
    SH.board = { date: TODAY, data: d };
    const sc = eng.get<(x: unknown) => SuppCalc>("shSupplementalCalc")(d);
    expect(sc.left).toBe(20);
    const names = sc.fun.picks.map((p) => (p.w.pl as { name?: string }).name);
    expect(names).toEqual(["F1", "F2"]); // F-DUP excluded despite sorting first
    expect(sc.fun.sum).toBe(20); // $12/$8 tier split of the remaining budget
    // no picked leg may collide with a locked leg
    const lockedLids = new Set(
      eng
        .get<(dt: string) => Entry>("shLedgerFind")(TODAY)
        .core.flatMap((t) => (t.legs as { label: string; prop: string }[]).map((l) => `${l.label}|${l.prop}`)),
    );
    for (const p of sc.fun.picks)
      for (const l of p.w.pl.legs) expect(lockedLids.has(`${l.label}|${l.prop}`)).toBe(false);
  });

  it("append: own lockedAt + supplemental flag, games merged, core and existing grades untouched, grading reopened", () => {
    const { eng, SH } = lockedMorning();
    const save = eng.get<(e: Record<string, unknown>) => void>("shLedgerSave");
    const before = eng.get<(dt: string) => Entry>("shLedgerFind")(TODAY);
    // pre-grade the morning card (all core ids, done) through the sanctioned path
    const tickets: Record<string, unknown> = {};
    before.core.forEach((t) => (tickets[t.id as string] = { result: "won", payout: 24 }));
    save({ date: TODAY, grading: { legs: {}, tickets, done: true }, gradedAt: 1 });
    const coreBefore = JSON.stringify(eng.get<(dt: string) => Entry>("shLedgerFind")(TODAY).core);

    SH.board = { date: TODAY, data: eveningBoard() };
    const r = eng.get<() => SuppResult>("shLockSupplemental")();
    expect(r).toMatchObject({ ok: true, added: 2, sum: 20, left: 0 });

    const e = eng.get<(dt: string) => Entry>("shLedgerFind")(TODAY);
    expect(e.funT).toHaveLength(2);
    for (const t of e.funT!) {
      expect(t.supplemental).toBe(true);
      expect(t.lockedAt).toBe(FROZEN_NOW);
      expect(t.late).toBeUndefined(); // both games still pregame at the frozen clock
    }
    expect(e.funT!.reduce((s, t) => s + (t.stake as number), 0)).toBeLessThanOrEqual(e.fun);
    expect(e.games.g9).toBeTruthy();
    expect(e.games.g10).toBeTruthy();
    expect(e.games.g11).toBeUndefined(); // F-DUP never locked, its game never recorded
    expect(JSON.stringify(e.core)).toBe(coreBefore); // core untouchable
    const g = e.grading as { done: boolean; tickets: Record<string, { result: string; payout: number }> };
    expect(g.done).toBe(false); // reopened so the new tickets grade
    for (const t of before.core) expect(g.tickets[t.id as string]).toEqual({ result: "won", payout: 24 }); // grades stand

    // immutability guard still holds after the append
    save({ date: TODAY, daily: 999, core: [] });
    const e2 = eng.get<(dt: string) => Entry>("shLedgerFind")(TODAY);
    expect(e2.daily).toBe(40);
    expect(JSON.stringify(e2.core)).toBe(coreBefore);
  });

  it("budget exhaustion disables the feature until tomorrow", () => {
    const { eng, SH } = lockedMorning();
    SH.board = { date: TODAY, data: eveningBoard() };
    expect(eng.get<() => SuppResult>("shLockSupplemental")().ok).toBe(true);
    // budget now fully deployed
    expect(eng.get<() => { left: number }>("shFunRemaining")().left).toBe(0);
    const sc = eng.get<(x: unknown) => SuppCalc>("shSupplementalCalc")(eveningBoard());
    expect(sc.left).toBe(0);
    expect(sc.fun.picks).toHaveLength(0);
    const r = eng.get<() => SuppResult>("shLockSupplemental")();
    expect(r.ok).toBe(false);
    expect(r.err).toMatch(/fully deployed/);
  });

  it("shadow card: shCardCalc on the fresh board while locked mutates nothing in the ledger", () => {
    const { eng, SH, storage } = lockedMorning();
    const d = eveningBoard();
    SH.board = { date: TODAY, data: d };
    const ledgerBefore = storage.dump("pl_ledger");
    const entryBefore = JSON.stringify(eng.get<(dt: string) => Entry>("shLedgerFind")(TODAY));
    const cc = eng.get<(x: unknown) => { alloc: { picks: unknown[] }; fun: { picks: unknown[] } }>("shCardCalc")(d);
    eng.get<(x: unknown) => unknown>("shCardCalc")(d); // idempotent re-run, same as a re-render
    expect(cc.alloc.picks.length).toBeGreaterThan(0); // it does produce a hypothetical card
    expect(storage.dump("pl_ledger")).toBe(ledgerBefore); // byte-identical store
    expect(JSON.stringify(eng.get<(dt: string) => Entry>("shLedgerFind")(TODAY))).toBe(entryBefore);
  });

  it("a supplemental ticket grades exactly like an at-lock one (real boxscore 822954 through shGrade)", async () => {
    const storage = memoryStorage();
    const eng = createEngine({ fetchJson: fixtureFetchJson, today: TODAY, storage });
    const pn = eng.get<(s: string) => string>("pnorm");
    const save = eng.get<(e: Record<string, unknown>) => void>("shLedgerSave");
    save({
      date: "2026-07-09",
      locked: true,
      daily: 10,
      fun: 10,
      bankroll: 750,
      core: [
        {
          id: "c1", bucket: "core", name: "Core", stake: 10, czDec: 2.5, confirmed: null,
          legs: [{ label: "Ryan McMahon", prop: "Hits O 1.5", cz: -110, gkey: "g1", lkey: `${pn("Ryan McMahon")}|batter_hits|1.5` }],
        },
      ],
      funT: [
        {
          id: "s1", bucket: "fun", name: "Supp longshot", stake: 10, czDec: 12, confirmed: null,
          supplemental: true, lockedAt: FROZEN_NOW,
          legs: [{ label: "Paul Blackburn", prop: "Ks O 2.5", cz: 120, gkey: "g1", lkey: `${pn("Paul Blackburn")}|pitcher_strikeouts|2.5` }],
        },
      ],
      games: { g1: { pk: 822954, start: "2026-07-09T23:00:00Z", away: "New York Yankees", home: "Tampa Bay Rays" } },
      grading: null,
      gradedAt: null,
      clv: {},
    });
    const changed = await eng.get<() => Promise<number>>("shGrade")();
    expect(changed).toBe(1);
    const e = eng.get<(dt: string) => Entry>("shLedgerFind")("2026-07-09");
    const g = e.grading as { done: boolean; tickets: Record<string, { result: string }> };
    expect(g.tickets.s1.result).toBe("won"); // Blackburn 3K clears O 2.5 — supplemental graded
    expect(g.tickets.c1.result).toBe("won"); // McMahon 2H clears O 1.5 — same pass, same rules
    expect(g.done).toBe(true);
  });
});

describe("supplemental coverage in the CLV kernel", () => {
  const start = new Date(FROZEN_NOW + 20 * 60_000).toISOString();
  const entry: SyncEntry = {
    date: TODAY,
    locked: true,
    core: [],
    funT: [
      {
        id: "s1",
        supplemental: true,
        legs: [{ label: "Jose Ramirez", prop: "TB O 1.5", gkey: "cle@min", lkey: "joseramirez|batter_total_bases|1.5" }],
      },
    ],
    games: { "cle@min": { start } },
  } as never;

  it("a supplemental pregame leg is pending, gets sighted, and applySights writes clv only", () => {
    const by = pendingLegs(entry, FROZEN_NOW, 45 * 60_000);
    const legs = [...by.values()].flatMap((g) => g.legs);
    expect(legs.map((l) => l.lid)).toEqual(["Jose Ramirez|TB O 1.5"]);

    const mk = (over: number, under: number) => ({
      key: "batter_total_bases",
      outcomes: [
        { description: "Jose Ramirez", name: "Over", point: 1.5, price: over },
        { description: "Jose Ramirez", name: "Under", point: 1.5, price: under },
      ],
    });
    const ev: OddsEvent = {
      id: "e1",
      away_team: "Cleveland Guardians",
      home_team: "Minnesota Twins",
      commence_time: start,
      bookmakers: [
        { key: "williamhill_us", markets: [mk(-115, -105)] },
        { key: "fanduel", markets: [mk(-110, -110)] },
        { key: "draftkings", markets: [mk(-112, -108)] },
      ],
    };
    const s = sightProp(ev, legs[0], FROZEN_NOW)!;
    expect(s.am).toBe(-115); // the Caesars close
    expect(s.consensusFair).not.toBeNull(); // >=2 books de-vigged

    const { entry: out, updated } = applySights(entry, { [legs[0].lid]: s });
    expect(updated).toBe(1);
    expect((out.clv as Record<string, unknown>)["Jose Ramirez|TB O 1.5"]).toEqual(s);
    const a = { ...out, clv: undefined };
    const b = { ...JSON.parse(JSON.stringify(entry)), clv: undefined };
    expect(JSON.stringify(a)).toBe(JSON.stringify(b)); // clv and nothing else
  });

  it("a started supplemental leg is never sighted", () => {
    const stale = JSON.parse(JSON.stringify(entry)) as SyncEntry;
    (stale.games as Record<string, { start: string }>)["cle@min"].start = new Date(FROZEN_NOW - 60_000).toISOString();
    expect(pendingLegs(stale, FROZEN_NOW, 45 * 60_000).size).toBe(0);
  });
});

describe("merge kernel: supplemental appends survive cross-device merges", () => {
  const baseDay = (): SyncEntry =>
    ({
      date: "2026-07-18",
      locked: true,
      fun: 20,
      core: [{ id: "c1", bucket: "core", stake: 20, confirmed: null, legs: [] }],
      funT: [{ id: "f1", bucket: "fun", stake: 10, confirmed: null, legs: [] }],
      games: { g1: { pk: 1, start: "2026-07-18T20:00:00Z" } },
      grading: {
        done: true,
        tickets: { c1: { result: "won", payout: 44 }, f1: { result: "lost", payout: 0 } },
        legs: {},
      },
    }) as never;

  it("a graded copy without the append cannot erase it: funT unions, games carry, grading reopens", () => {
    const graded = baseDay();
    const appended = baseDay();
    (appended.grading as { done: boolean }).done = false; // append reopened grading on its device
    appended.funT!.push({ id: "s1", bucket: "fun", stake: 10, supplemental: true, lockedAt: 5, confirmed: null, legs: [] } as never);
    (appended.games as Record<string, unknown>).g9 = { pk: 9, start: "2026-07-19T00:00:00Z" };

    const ab = mergeLedgers([graded], [appended]);
    const ba = mergeLedgers([appended], [graded]);
    expect(JSON.stringify(ab)).toBe(JSON.stringify(ba)); // symmetric
    const m = ab[0];
    expect(m.funT!.map((t) => t.id)).toContain("s1"); // the append survived the richer-graded base
    expect((m.games as Record<string, unknown>).g9).toBeTruthy();
    const g = m.grading as { done: boolean; tickets: Record<string, { result: string }> };
    expect(g.done).toBe(false); // s1 has no grade yet — the auto-grader must run again
    expect(g.tickets.c1.result).toBe("won"); // existing grades never lost
    expect(g.tickets.f1.result).toBe("lost");
    // idempotent: re-merging changes nothing
    expect(JSON.stringify(mergeLedgers(ab, [appended]))).toBe(JSON.stringify(ab));
  });
});

describe("receipts: fun P/L and CLV split at-lock vs supplemental", () => {
  it("each group carries its own tickets, P/L and CLV", () => {
    const e: SyncEntry = {
      date: "2026-07-18",
      locked: true,
      core: [],
      funT: [
        { id: "f1", stake: 10, legs: [{ label: "A", prop: "Hits O 0.5", lkey: "a|batter_hits|0.5", cz: 900 }] },
        { id: "f2", stake: 8, supplemental: true, legs: [{ label: "B", prop: "Hits O 0.5", lkey: "b|batter_hits|0.5", cz: 1200 }] },
      ],
      grading: { done: true, tickets: { f1: { result: "lost", payout: 0 }, f2: { result: "won", payout: 104 } }, legs: {} },
      clv: { "B|Hits O 0.5": { am: 1000, at: 1 } },
    } as never;
    const s = ledgerSegments([e]);
    expect(s.funSplit.atLock).toMatchObject({ tickets: 1, staked: 10, settled: 10, pl: -10, sighted: 0, legs: 1 });
    expect(s.funSplit.atLock.clvPts).toBeNull();
    expect(s.funSplit.supplemental).toMatchObject({ tickets: 1, staked: 8, settled: 8, pl: 96, sighted: 1, legs: 1 });
    // +1000 close vs +1200 locked = beat the close by ~1.4 probability points
    expect(s.funSplit.supplemental.clvPts).toBeCloseTo(100 / 11 - 100 / 13, 6);
  });
});
