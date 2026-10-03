import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { buildCfbBoard } from "@/lib/cfb/model";
import { CFB_LEAGUE, CFB_LOCK, CFB_REDIS } from "@/lib/cfb/rules";
import { NFL_LEAGUE, NFL_REDIS } from "@/lib/nfl/rules";
import { finalsOf } from "@/lib/cfb/slate-server";
import { assertCardMoney, assertEntryMoney } from "@/lib/cfb/lock-server";
import { foundFamilyOf, foundKeyOf, planFound } from "@/lib/cfb/found";
import { FOUND, FOUND_MAX_STAKE, FOUND_POLICY } from "@/lib/found-mode";
import type { CfbPropRow, CfbPropsBoard } from "@/lib/cfb/props-types";
import type { CfbLedgerEntry, CfbSlate, CfbTicket } from "@/lib/cfb/types";

/**
 * FOUND MODE — THE FOOTBALL HALF (2026-10-03, Josh: "I no longer want the card to lock at a
 * certain time … The engine should lock bets as it finds them … increase the daily amount for
 * each sport to $2500. Bets can be of any amount").
 *
 * On a found day (>= 2026-10-04) /api/cfb/lock and /api/nfl/lock seat every bet the engine finds
 * on the pokes that already pay for a board, Kelly-sized in whole dollars under a $2,500 ceiling.
 * The boards here are the captured 2026-09-05 CFB and 2026-09-13 NFL fixtures re-dated onto found
 * days; every price is the fixture's own, never edited (props are synthetic rows, as in
 * tests/nfl-variety-paper.test.ts). Redis is in-memory; no network is reached.
 */

vi.mock("@/lib/server/store", async (orig) => {
  const real = await orig<typeof import("@/lib/server/store")>();
  return { ...real, redis: vi.fn(), storeEnv: vi.fn() };
});
vi.mock("@/lib/cfb/slate-server", async (orig) => {
  const real = await orig<typeof import("@/lib/cfb/slate-server")>();
  return { ...real, espnEvents: vi.fn(), slateFromEspn: vi.fn(), espnEventsOf: vi.fn(), slateFromEspnOf: vi.fn() };
});
vi.mock("@/lib/server/football-props", () => ({ footballPropsGet: vi.fn() }));

import { redis, storeEnv } from "@/lib/server/store";
import { espnEvents, espnEventsOf, slateFromEspn, slateFromEspnOf } from "@/lib/cfb/slate-server";
import { footballPropsGet } from "@/lib/server/football-props";
import { GET as cfbGET } from "../app/api/cfb/lock/route";
import { GET as nflGET } from "../app/api/nfl/lock/route";
import { swapSettleBook } from "./helpers/settle-book";

const SECRET = "test-phrase";
const T = (iso: string) => Date.parse(iso);
const redate = (x: unknown, map: Record<string, string>) => {
  let s = JSON.stringify(x);
  for (const [a, b] of Object.entries(map)) s = s.split(a).join(b);
  return JSON.parse(s);
};
const readFix = (dir: string, f: string, map: Record<string, string>) =>
  redate(swapSettleBook(JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", dir, f), "utf8"))), map);

/* CFB: the 2026-09-05 slate moved to Saturday 2026-10-10 (10 kicks 16:00Z = 09:00 PT, two 16:30Z) */
const DATE = "2026-10-10";
const CMAP = { "2026-09-05": DATE, "2026-09-06": "2026-10-11", "20260905": "20261010" };
const ESPN = readFix("cfb", "espn-scoreboard-2026-09-05.json", CMAP) as { events: unknown[] };
const ODDS = readFix("cfb", "odds-ncaaf-2026-09-05.json", CMAP) as unknown[];
const FPI = readFix("cfb", "espn-fpi.json", {}) as unknown;
const FIRST_KICK = T(`${DATE}T16:00:00Z`);
const LOCKS_AT = FIRST_KICK - CFB_LOCK.leadMs; // 15:00Z = 08:00 PT (also the 08:00 refill slot)
const EARLY = T(`${DATE}T14:30:00Z`); // 07:30 PT — waiting, no refill slot
const MID = T(`${DATE}T15:20:00Z`); // 08:20 PT — inside the lock window (since 2026-10-03 also the 08:15 found slot)
const LATE = T(`2026-10-11T02:30:00Z`); // 19:30 PT on 10-10 — after the last found slot (18:45), no refill slot

/* NFL: the 2026-09-13 slate moved to Sunday 2026-10-11 */
const NDATE = "2026-10-11";
const NMAP = { "2026-09-13": NDATE, "2026-09-14": "2026-10-12", "20260913": "20261011" };
const NESPN = readFix("nfl", "espn-scoreboard-2026-09-13.json", NMAP) as { events: unknown[] };
const NODDS = readFix("nfl", "odds-2026-09-13.json", NMAP) as unknown[];
const NFPI = readFix("nfl", "espn-fpi.json", {}) as unknown;

function slateAt(now: number, opts: { pricedGames?: number; oddsMissing?: boolean } = {}): CfbSlate {
  const board = buildCfbBoard({ date: DATE, espnEvents: ESPN.events, oddsEvents: ODDS, fpi: FPI, now, bankroll: 2500 });
  const games =
    opts.pricedGames == null
      ? board.games
      : board.games.map((g, i) => (i < opts.pricedGames! ? g : { ...g, rows: g.rows.map((r) => ({ ...r, playable: false })) }));
  return { ...board, games, finals: finalsOf(board.games), quota: { remaining: 9000, used: 1000 }, oddsMissing: opts.oddsMissing === true };
}
function nflSlateAt(now: number): CfbSlate {
  const board = buildCfbBoard({ date: NDATE, espnEvents: NESPN.events, oddsEvents: NODDS, fpi: NFPI, now, bankroll: 2500, league: NFL_LEAGUE });
  return { ...board, finals: finalsOf(board.games), quota: { remaining: 9000, used: 1000 }, oddsMissing: false };
}

/** in-memory Redis: GET / SET (incl. NX, PX, EX) / DEL */
function fakeRedis(seed: Record<string, string> = {}) {
  const kv = new Map(Object.entries(seed));
  const calls: unknown[][] = [];
  vi.mocked(redis).mockImplementation(async (cmd: unknown[]) => {
    calls.push(cmd);
    const [op, key, ...rest] = cmd as [string, string, ...unknown[]];
    switch (op) {
      case "GET":
        return kv.get(key) ?? null;
      case "SET":
        if (rest.includes("NX") && kv.has(key)) return null;
        kv.set(key, String(rest[0]));
        return "OK";
      case "DEL":
        return kv.delete(key) ? 1 : 0;
      default:
        throw new Error(`fake redis: ${op}`);
    }
  });
  const ledgerOf = (k: string) => (): CfbLedgerEntry[] => {
    const raw = kv.get(k);
    return raw ? ((JSON.parse(raw) as { ledger: CfbLedgerEntry[] }).ledger ?? []) : [];
  };
  const setsOn = (k: string) => calls.filter((c) => c[0] === "SET" && c[1] === k);
  return { kv, calls, ledger: ledgerOf(CFB_REDIS.ledger), nflLedger: ledgerOf(NFL_REDIS.ledger), ledgerSets: () => setsOn(CFB_REDIS.ledger), setsOn };
}
const stored = (entries: CfbLedgerEntry[], key: string = CFB_REDIS.ledger) => ({ [key]: JSON.stringify({ ledger: entries, at: 1 }) });

const req = (base: string, o: { date?: string; manual?: boolean; slot?: string; dry?: boolean } = {}) => {
  const qs = new URLSearchParams();
  qs.set("date", o.date ?? DATE);
  if (o.manual) qs.set("manual", "1");
  if (o.slot) qs.set("slot", o.slot);
  if (o.dry) qs.set("dry", "1");
  return new NextRequest(`http://localhost${base}?${qs}`, { headers: { "x-cron-key": SECRET } });
};
const call = async (o: Parameters<typeof req>[1] = {}) => {
  const res = await cfbGET(req("/api/cfb/lock", o));
  return { status: res.status, body: (await res.json()) as Record<string, any> };
};
const callNfl = async (o: Parameters<typeof req>[1] = {}) => {
  const res = await nflGET(req("/api/nfl/lock", { date: NDATE, ...o }));
  return { status: res.status, body: (await res.json()) as Record<string, any> };
};

const sum = (t: CfbTicket[]) => t.reduce((a, x) => a + x.stake, 0);
const familiesOf = (core: CfbTicket[]) => core.flatMap((t) => t.legs.map((l) => foundKeyOf(l)));

/** a synthetic found-day server entry carrying `stakes` (legs empty — they block no family) */
function seededEntry(date: string, stakes: number[], o: { fun?: boolean; source?: string } = {}): CfbLedgerEntry {
  const tk = (id: string, stake: number, bucket: "core" | "fun"): CfbTicket => ({ id, bucket, name: "SINGLE · seeded", stake, czOdds: -110, czDec: 1.9091, prob: 55, czEv: 3, legs: [] });
  return {
    sport: "cfb",
    date,
    locked: true,
    daily: FOUND.daily,
    fun: 25,
    core: stakes.map((s, i) => tk(`cfb-${date}-found-${i + 1}`, s, "core")),
    funT: o.fun ? [tk(`cfb-${date}-fun-1`, 25, "fun")] : [],
    lockedAt: T(`${date}T13:00:00Z`),
    games: {},
    grading: null,
    source: o.source ?? "server-lock",
    trigger: CFB_LEAGUE.triggers.lock,
  } as CfbLedgerEntry;
}

beforeEach(() => {
  vi.useFakeTimers({ now: LOCKS_AT, toFake: ["Date"] });
  vi.mocked(redis).mockReset().mockImplementation(async (cmd: unknown[]) => {
    throw new Error(`store reached without fakeRedis() (cmd: ${String((cmd as string[])[0])})`);
  });
  vi.mocked(storeEnv).mockReset().mockReturnValue({ url: "https://store.test", token: "test-key-never-logged" });
  vi.mocked(espnEvents).mockReset().mockResolvedValue(ESPN.events);
  vi.mocked(slateFromEspn).mockReset().mockImplementation(async (_d, _e, now) => slateAt(now));
  vi.mocked(espnEventsOf).mockReset().mockResolvedValue(NESPN.events);
  vi.mocked(slateFromEspnOf).mockReset().mockImplementation(async (_c, _d, _e, now) => nflSlateAt(now));
  vi.mocked(footballPropsGet).mockReset().mockResolvedValue(new Response("{}", { status: 500 }) as never);
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("found mode — the first entry (CFB)", () => {
  it("the lock-window poke seats Kelly whole-dollar stakes (not the $5–$25 band) summing ≤ $2,500, ids -found-N", async () => {
    const r = fakeRedis();
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.status).toBe("locked");
    expect(body.found).toBe(true);
    const [e] = r.ledger();
    expect(e.date).toBe(DATE);
    expect(e.daily).toBe(FOUND.daily);
    expect(e.source).toBe("server-lock");
    expect(e.core.length).toBeGreaterThan(0);
    expect(body.tickets).toBe(e.core.length);
    expect(sum(e.core)).toBeLessThanOrEqual(FOUND.daily);
    expect(e.core.every((t) => Number.isInteger(t.stake) && t.stake >= FOUND.minStake && t.stake <= FOUND_MAX_STAKE)).toBe(true);
    expect(e.core.some((t) => t.stake > 50)).toBe(true);
    e.core.forEach((t, i) => {
      expect(t.id).toBe(`cfb-${DATE}-found-${i + 1}`);
      expect(t.found).toBe(true);
      expect(t.foundAt).toBe(LOCKS_AT);
      expect(t.paperPolicy).toBe(FOUND_POLICY);
      expect(t.legs.length).toBeGreaterThanOrEqual(1);
      expect(t.legs.length).toBeLessThanOrEqual(2);
      expect(t.czDec).toBeLessThanOrEqual(2.6);
      expect(new Set(t.legs.map((l) => l.gkey)).size).toBe(t.legs.length);
    });
    const fams = familiesOf(e.core);
    expect(new Set(fams).size).toBe(fams.length);
    expect(sum(e.funT)).toBeLessThanOrEqual(25);
    expect(() => assertEntryMoney(CFB_LEAGUE, e)).not.toThrow();
    /* every leg's price is the slate's own DraftKings quote */
    const board = slateAt(LOCKS_AT);
    const rowOf = new Map(board.games.flatMap((g) => g.rows.map((x) => [x.key, x])));
    for (const l of e.core.flatMap((t) => t.legs)) {
      const row = rowOf.get(l.lkey);
      if (row) expect(l.cz).toBe(row.cz!.price);
    }
  });

  it("a second pass appends only new bets — never repeats a (game, family), never resizes or drops", async () => {
    const r = fakeRedis();
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => slateAt(now, { pricedGames: 3 }));
    await call();
    const first = r.ledger()[0];
    expect(first.core.length).toBeGreaterThan(0);
    expect(sum(first.core)).toBeLessThan(FOUND.daily);

    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => slateAt(now));
    vi.setSystemTime(MID);
    const { body } = await call({ manual: true });
    expect(body.status).toBe("already-locked");
    expect(body.topUp.action).toBe("found");
    expect(typeof body.topUp.reason).toBe("string");
    const second = r.ledger()[0];
    expect(second.core.slice(0, first.core.length)).toEqual(first.core);
    expect(second.core.length).toBe(first.core.length + body.topUp.added);
    expect(body.topUp.added).toBeGreaterThan(0);
    expect(sum(second.core)).toBe(body.topUp.coreStake);
    expect(sum(second.core)).toBeLessThanOrEqual(FOUND.daily);
    const fams = familiesOf(second.core);
    expect(new Set(fams).size).toBe(fams.length);
    second.core.slice(first.core.length).forEach((t, i) => {
      expect(t.id).toBe(`cfb-${DATE}-found-${first.core.length + i + 1}`);
      expect(t.foundAt).toBe(MID);
    });

    /* a third pass over the same board finds nothing new and writes nothing */
    const before = r.ledgerSets().length;
    const third = await call({ manual: true });
    expect(third.body.topUp.action).toBe("skipped");
    expect(third.body.topUp.added).toBe(0);
    expect(r.ledgerSets().length).toBe(before);
    expect(r.ledger()[0]).toEqual(second);
  });

  it("an entry at $2,496 pays for nothing; at $2,495 the most it can seat is one $5 bet", async () => {
    const r = fakeRedis(stored([seededEntry(DATE, [800, 800, 800, 96], { fun: true })]));
    vi.setSystemTime(MID);
    const a = await call({ manual: true });
    expect(a.body.topUp.action).toBe("skipped");
    expect(a.body.topUp.added).toBe(0);
    expect(vi.mocked(slateFromEspn)).not.toHaveBeenCalled();
    expect(r.ledgerSets().length).toBe(0);

    const r2 = fakeRedis(stored([seededEntry(DATE, [800, 800, 800, 95], { fun: true })]));
    const b = await call({ manual: true });
    const e = r2.ledger()[0];
    expect(sum(e.core)).toBeLessThanOrEqual(FOUND.daily);
    expect(e.core.length - 4).toBeLessThanOrEqual(1);
    expect(e.core.slice(4).every((t) => t.stake === 5)).toBe(true);
    expect(b.body.topUp.room).toBe(FOUND.daily - sum(e.core));
  });

  it("waiting + Josh's manual Refresh creates the first entry", async () => {
    const r = fakeRedis();
    vi.setSystemTime(EARLY);
    const { status, body } = await call({ manual: true });
    expect(status).toBe(200);
    expect(body.status).toBe("locked");
    expect(body.found).toBe(true);
    expect(body.foundTrigger).toBe("manual");
    expect(r.ledger()).toHaveLength(1);
    expect(r.ledger()[0].lockedAt).toBe(EARLY);
  });

  it("a waiting non-slot poke pays for nothing and answers waiting", async () => {
    const r = fakeRedis();
    vi.setSystemTime(EARLY);
    const { body } = await call();
    expect(body.status).toBe("waiting");
    expect(vi.mocked(slateFromEspn)).not.toHaveBeenCalled();
    expect(r.ledgerSets().length).toBe(0);
  });

  it("an empty found pass in the lock window still writes the first entry ($0, a note, core [])", async () => {
    const r = fakeRedis();
    /* the board is priced, but no row clears the +2% gate (every evCz forced below it — the prices stay as given) */
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => {
      const s = slateAt(now);
      return { ...s, games: s.games.map((g) => ({ ...g, rows: g.rows.map((x) => ({ ...x, evCz: x.evCz == null ? x.evCz : Math.min(x.evCz, 0) })) })) };
    });
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.status).toBe("locked");
    expect(body.tickets).toBe(0);
    const [e] = r.ledger();
    expect(e.core).toEqual([]);
    expect(typeof e.note).toBe("string");
    expect(e.note!.length).toBeGreaterThan(0);
    expect(e.daily).toBe(FOUND.daily);
  });

  /* RE-PINNED 2026-10-03 (Josh: "more bets need to be made constantly all day long") — every
     15-minute poke 08:00–18:45 PT is a found slot now, so the quiet poke is one after 18:45 */
  it("a poke outside every found slot on a day that already has its entry does not pull", async () => {
    const r = fakeRedis(stored([seededEntry(DATE, [100])]));
    vi.setSystemTime(LATE);
    const { body } = await call();
    expect(body.status).toBe("already-locked");
    expect(body.topUp.action).toBe("skipped");
    expect(body.topUp.credits).toBe(0);
    expect(vi.mocked(espnEvents)).not.toHaveBeenCalled();
    expect(vi.mocked(slateFromEspn)).not.toHaveBeenCalled();
    expect(r.ledgerSets().length).toBe(0);
  });
});

describe("found mode — the day's winnings reopen the room (2026-10-03)", () => {
  /* Josh: "If a bet wins (Ie: $250 straight bet wins $200) then that is added on top of what can be
     bet on the day … Only way to get more money for that day is to hit a bet THAT DAY." */
  it("a full $2,500 day with an $800 winner graded today finds up to $800 more and records foundWonBy", async () => {
    const seeded = { ...seededEntry(DATE, [800, 800, 800, 100]) };
    seeded.grading = { tickets: { [`cfb-${DATE}-found-1`]: { result: "won", payout: 1600 } }, legs: {}, done: false } as CfbLedgerEntry["grading"];
    const r = fakeRedis(stored([seeded]));
    vi.setSystemTime(MID);
    const { body } = await call({ manual: true });
    expect(body.topUp.won).toBe(800);
    expect(body.topUp.ceiling).toBe(3300);
    expect(body.topUp.action).toBe("found");
    const [e] = r.ledger();
    expect(e.core.slice(0, 4)).toEqual(seeded.core);
    expect(sum(e.core)).toBeGreaterThan(2500);
    expect(sum(e.core)).toBeLessThanOrEqual(3300);
    expect((e as { foundWonBy?: unknown }).foundWonBy).toEqual({ [`cfb-${DATE}-found-1`]: 800 });
    expect(e.daily).toBe(FOUND.daily);
    expect(() => assertEntryMoney(CFB_LEAGUE, e)).not.toThrow();
  });

  it("the same full day with only a LOSS graded stays shut — no board is paid for", async () => {
    const seeded = { ...seededEntry(DATE, [800, 800, 800, 100], { fun: true }) };
    seeded.grading = { tickets: { [`cfb-${DATE}-found-1`]: { result: "lost", payout: 0 } }, legs: {}, done: false } as CfbLedgerEntry["grading"];
    const r = fakeRedis(stored([seeded]));
    vi.setSystemTime(MID);
    const { body } = await call({ manual: true });
    expect(body.topUp.action).toBe("skipped");
    expect(body.topUp.ceiling).toBe(2500);
    expect(vi.mocked(slateFromEspn)).not.toHaveBeenCalled();
    expect(r.ledgerSets().length).toBe(0);
  });
});

describe("found mode — refusals", () => {
  it("oddsMissing writes nothing (first entry → 502 + marker; refill → skip + marker)", async () => {
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => slateAt(now, { oddsMissing: true }));
    const r = fakeRedis();
    const a = await call();
    expect(a.status).toBe(502);
    expect(a.body.status).toBe("odds-missing");
    expect(r.ledgerSets().length).toBe(0);
    expect(r.setsOn(`${CFB_REDIS.oddsGap}:${DATE}`).length).toBe(1);

    const r2 = fakeRedis(stored([seededEntry(DATE, [100])]));
    vi.setSystemTime(MID);
    const b = await call({ manual: true });
    expect(b.body.topUp.action).toBe("skipped");
    expect(b.body.topUp.oddsMissing).toBe(true);
    expect(b.body.topUp.reason).toMatch(/could not be priced/);
    expect(r2.ledgerSets().length).toBe(0);
    expect(r2.setsOn(`${CFB_REDIS.oddsGap}:${DATE}`).length).toBe(1);
  });

  it("a held lease skips without pulling — and the holder's lease is left alone", async () => {
    const lease = `pl:cfb:found:lease:${DATE}`;
    const r = fakeRedis({ ...stored([seededEntry(DATE, [100])]), [lease]: "someone-else" });
    vi.setSystemTime(MID);
    const { body } = await call({ manual: true });
    expect(body.topUp.action).toBe("skipped");
    expect(body.topUp.leaseHeld).toBe(true);
    expect(typeof body.topUp.reason).toBe("string");
    expect(vi.mocked(slateFromEspn)).not.toHaveBeenCalled();
    expect(r.ledgerSets().length).toBe(0);
    expect(r.kv.get(lease)).toBe("someone-else");

    /* the first-entry path refuses the same way */
    const r2 = fakeRedis({ [lease]: "someone-else" });
    vi.setSystemTime(LOCKS_AT);
    const f = await call();
    expect(f.body.status).toBe("busy");
    expect(vi.mocked(slateFromEspn)).not.toHaveBeenCalled();
    expect(r2.ledgerSets().length).toBe(0);
  });

  it("a pass takes the lease with SET NX PX 300000 and releases it afterwards", async () => {
    const r = fakeRedis(stored([seededEntry(DATE, [100])]));
    vi.setSystemTime(MID);
    await call({ manual: true });
    const lease = `pl:cfb:found:lease:${DATE}`;
    const take = r.calls.find((c) => c[0] === "SET" && c[1] === lease)!;
    expect(take.slice(3)).toEqual(["NX", "PX", 300000]);
    expect(r.calls.some((c) => c[0] === "DEL" && c[1] === lease)).toBe(true);
    expect(r.kv.has(lease)).toBe(false);
  });

  it("?dry=1 computes, writes nothing and takes no lease", async () => {
    const r = fakeRedis(stored([seededEntry(DATE, [100])]));
    vi.setSystemTime(MID);
    const { body } = await call({ manual: true, dry: true });
    expect(body.topUp.action).toBe("found");
    expect(body.topUp.dry).toBe(true);
    expect(r.calls.filter((c) => c[0] === "SET").length).toBe(0);
  });

  /* RE-PINNED 2026-10-03 (Josh: "Lock the $350 today as well as any other locked parlays … We can keep
     all the locked bets but more bets need to be made") — a device lock is appended to, never replaced */
  it("a device (Builder) lock IS appended to — its own tickets and source are kept", async () => {
    const seeded = seededEntry(DATE, [100], { source: "device" });
    const r = fakeRedis(stored([seeded]));
    vi.setSystemTime(MID);
    const { body } = await call({ manual: true });
    expect(body.topUp.action).toBe("found");
    expect(vi.mocked(slateFromEspn)).toHaveBeenCalled();
    const [e] = r.ledger();
    expect(e.source).toBe("device");
    expect(e.core[0]).toEqual(seeded.core[0]);
    expect(e.core.length).toBeGreaterThan(1);
    expect(sum(e.core)).toBeLessThanOrEqual(FOUND.daily);
  });
});

describe("found mode — money guards and the pre-found boundary", () => {
  const card = (date: string, stakes: number[]) => ({
    date,
    core: stakes.map((s, i) => ({ id: `cfb-${date}-found-${i + 1}`, bucket: "core" as const, name: "x", stake: s, czOdds: 100, czDec: 2, prob: 52, czEv: 4, legs: [], found: true })),
    funT: [],
    coreSum: stakes.reduce((a, b) => a + b, 0),
    funSum: 0,
    noPlay: false,
    notes: [],
    benched: [],
  });
  it("accept $800 on a found day and refuse it on 2026-10-02", () => {
    expect(() => assertCardMoney(CFB_LEAGUE, card(DATE, [800]))).not.toThrow();
    expect(() => assertCardMoney(NFL_LEAGUE, card(NDATE, [800, 800, 800, 100]))).not.toThrow();
    expect(() => assertCardMoney(CFB_LEAGUE, card("2026-10-03", [800]))).not.toThrow();
    expect(() => assertCardMoney(CFB_LEAGUE, card("2026-10-02", [800]))).toThrow(/MONEY GUARD/);
    expect(() => assertCardMoney(CFB_LEAGUE, card(DATE, [801]))).toThrow(/MONEY GUARD/);
    expect(() => assertCardMoney(CFB_LEAGUE, card(DATE, [12.5]))).toThrow(/MONEY GUARD/);
    expect(() => assertCardMoney(CFB_LEAGUE, card(DATE, [4]))).toThrow(/MONEY GUARD/);
    expect(() => assertCardMoney(CFB_LEAGUE, card(DATE, [800, 800, 800, 101]))).toThrow(/MONEY GUARD/);
  });

  it("2026-10-03: a pre-found ticket carried from the morning keeps its own stake; that day's wins extend the ceiling", () => {
    const c = card("2026-10-03", [800]);
    const carried = { ...c, core: [{ ...c.core[0], id: "cfb-2026-10-03-core-1", stake: 12.5, found: undefined }, ...c.core], coreSum: 812.5 };
    expect(() => assertCardMoney(CFB_LEAGUE, carried)).not.toThrow();
    // the exemption is 2026-10-03's alone: an unflagged $12.5 ticket on any later found day is refused
    const later = card(DATE, [800]);
    const unflagged = { ...later, core: [{ ...later.core[0], id: `cfb-${DATE}-core-1`, stake: 12.5, found: undefined }, ...later.core], coreSum: 812.5 };
    expect(() => assertCardMoney(CFB_LEAGUE, unflagged)).toThrow(/MONEY GUARD/);
    const over = card(DATE, [800, 800, 800, 400]);
    expect(() => assertCardMoney(CFB_LEAGUE, over)).toThrow(/MONEY GUARD/);
    expect(() => assertCardMoney(CFB_LEAGUE, over, { won: 300 })).not.toThrow();
    expect(() => assertCardMoney(CFB_LEAGUE, over, { won: 299 })).toThrow(/MONEY GUARD/);
  });

  it("pre-found 2026-09-27 still runs topUpDate (no found pass, no lease)", async () => {
    const PRE = "2026-09-27";
    const entry = { ...seededEntry(PRE, []), daily: 250, core: [], noPlay: true } as CfbLedgerEntry;
    const r = fakeRedis(stored([entry]));
    vi.mocked(espnEvents).mockResolvedValue([]);
    vi.setSystemTime(T(`${PRE}T16:00:00Z`));
    const { body } = await call({ date: PRE, manual: true });
    expect(body.status).toBe("already-locked");
    expect(body.topUp).not.toHaveProperty("added");
    expect(r.calls.some((c) => String(c[1]).includes(":found:lease:"))).toBe(false);
  });
});

describe("found mode — NFL", () => {
  it("waiting + manual creates the first NFL entry, attaching props once with forceFresh", async () => {
    const r = fakeRedis();
    vi.setSystemTime(T(`${NDATE}T14:00:00Z`)); // 07:00 PT, first kick 17:00Z
    const { status, body } = await callNfl({ manual: true });
    expect(status).toBe(200);
    expect(body.status).toBe("locked");
    expect(body.found).toBe(true);
    expect(vi.mocked(footballPropsGet)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(footballPropsGet).mock.calls[0][2]).toMatchObject({ forceFresh: true });
    const [e] = r.nflLedger();
    expect(e.sport).toBe("nfl");
    expect(e.daily).toBe(FOUND.daily);
    expect(sum(e.core)).toBeLessThanOrEqual(FOUND.daily);
  });

  it("a refill pass on an NFL entry pays no props pull", async () => {
    const e = { ...seededEntry(NDATE, [100]), sport: "nfl", core: [{ ...seededEntry(NDATE, [100]).core[0], id: `nfl-${NDATE}-found-1` }], trigger: NFL_LEAGUE.triggers.lock } as CfbLedgerEntry;
    fakeRedis(stored([e], NFL_REDIS.ledger));
    vi.setSystemTime(T(`${NDATE}T16:10:00Z`));
    const { body } = await callNfl({ manual: true });
    expect(body.status).toBe("already-locked");
    expect(["found", "skipped"]).toContain(body.topUp.action);
    expect(vi.mocked(footballPropsGet)).not.toHaveBeenCalled();
  });

  it("variety props on the board are found as singles, one per (game, player|market)", () => {
    const now = T(`${NDATE}T16:00:00Z`);
    vi.setSystemTime(now);
    const board = nflSlateAt(now);
    const rows = board.games.slice(0, 4).map(
      (g, i) =>
        ({
          key: `${g.id}|rec|player${i}`,
          gameId: g.id,
          market: "receptions",
          side: "over",
          player: `Player ${i}`,
          label: `Player ${i} O 4.5 Receptions`,
          teamId: g.home.id,
          line: 4.5,
          fair: 0.53,
          evCz: 6,
          cz: { book: "draftkings", price: 100, line: 4.5, dec: 2 },
        }) as CfbPropRow,
    );
    const paperProps = { date: NDATE, rows: [...rows, { ...rows[0], key: `${rows[0].key}|dup` }], pricedAt: Object.fromEntries(rows.map((x) => [x.gameId, new Date(now - 60_000).toISOString()])) } as CfbPropsBoard;
    const plan = planFound(NFL_LEAGUE, { ...board, paperProps }, null, now);
    const props = plan.tickets.filter((t) => t.legs.some((l) => l.player));
    expect(props.length).toBe(4);
    expect(props.every((t) => t.legs.length === 1 && t.legs[0].cz === 100)).toBe(true);
    const fams = familiesOf(plan.tickets);
    expect(new Set(fams).size).toBe(fams.length);
    expect(foundFamilyOf(props[0].legs[0])).toBe("prop:player0|receptions");
    expect(plan.tickets.every((t) => t.id.startsWith(`nfl-${NDATE}-found-`))).toBe(true);
  });
});
