import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { stripComments } from "./helpers/source";
import { buildCfbBoard } from "@/lib/cfb/model";
import { CFB_BANK_BASE, CFB_LOCK, CFB_PAPER, CFB_REDIS, CFB_RULES } from "@/lib/cfb/rules";
import { finalsFromEspn, finalsOf } from "@/lib/cfb/slate-server";
import { cfbBankroll, cfbLedgerStats } from "@/lib/cfb/ledger";
import { gradeCfbEntry } from "@/lib/cfb/grade";
import { buildCfbLockEntry, cfbPricedAhead, CFB_SWEEP_TRIGGER, decideCfbLock } from "@/lib/cfb/lock-server";
import * as lockServerMod from "@/lib/cfb/lock-server";
import * as cfbRulesMod from "@/lib/cfb/rules";
import { cfbEntriesOf, readCfbLedger, upsertCfbEntry, writeCfbLedger } from "@/lib/cfb/store";
import { ptToday } from "@/lib/server/pt-date";
import { mergeLedgers } from "@/lib/ledger-merge";
import type { CfbBoard, CfbCard, CfbFinals, CfbLedgerEntry, CfbSlate, CfbTicket } from "@/lib/cfb/types";

/**
 * THE CFB SERVER LOCK (INSTRUCTION 45, 2026-09-05, Josh, verbatim: "Parlay Lab CFB should've
 * been running the same $150 per day theoretical Core money and $25 Fun money per day").
 *
 * The gap this closes, verified on prod: pl:cfb:ledger:v1 held ZERO entries, because the CFB
 * card locked only when a person tapped LOCK in the Builder, while the MLB scheduler wrote a
 * 'server-lock' entry every day. /api/cfb/lock is the CFB desk's server lock, poked by the
 * scheduler's self-forward on the same pulse and gated the same way. Pinned here, on the real
 * 2026-09-05 fixture slate (10 kickoffs at 16:00Z, two at 16:30Z) with the clock pinned:
 *
 *   gate            CRON_SECRET unset → 503 before anything is read; wrong header → 401; no
 *                   store env → 503. No Redis call on any refusal.
 *   already-locked  an entry for the date (a Builder lock, say) → exit, nothing written, and a
 *                   second poke after the server's own lock is the same exit. Never re-staked.
 *   waiting         before first kickoff − CFB_LOCK.leadMs (15:00Z for a 16:00Z slate) →
 *                   nothing written, the body names locksAt.
 *   locked          at the window: one SET on pl:cfb:ledger:v1 holding a sport-cfb entry with
 *                   source "server-lock", core stakes in the $5–$25 band summing to ≤ $150,
 *                   fun ≤ $25, daily 150 / fun 25, lockedAt = the poke instant.
 *   no-slate        a date with no kickoff → nothing written.
 *   late            after the first kickoff, games still ahead → locked from those, the note
 *                   says "N of M games still ahead".
 *   missed          after the LAST kickoff → a NO-PLAY entry whose note says the window was
 *                   missed; nothing staked, no line that was gone was priced.
 *   merge           the write MERGES (mergeLedgers) — a device entry on another date survives
 *                   byte-for-byte, and a device entry on the SAME date outranks the server's
 *                   in the kernel (grading richness), so the phone's copy is never replaced.
 *   dry=1           builds and returns the card, writes nothing.
 *
 * fetch is never reached: the slate is the fixture through the pure model, Redis is in-memory.
 */

vi.mock("@/lib/server/store", async (orig) => {
  const real = await orig<typeof import("@/lib/server/store")>();
  return { ...real, redis: vi.fn(), storeEnv: vi.fn() };
});
vi.mock("@/lib/cfb/slate-server", async (orig) => {
  const real = await orig<typeof import("@/lib/cfb/slate-server")>();
  return { ...real, espnEvents: vi.fn(), slateFromEspn: vi.fn() };
});
/* buildCfbCard is mocked ONLY so the money guard can be driven a skewed card (the MLB rails
   plant theirs through `__plantStakeSkew` in src/lib/server/lock-card.ts); `beforeEach` puts
   the REAL implementation back, so every other test in this file runs the real card builder. */
const cardReal = vi.hoisted(() => ({ build: null as null | typeof import("@/lib/cfb/card").buildCfbCard }));
vi.mock("@/lib/cfb/card", async (orig) => {
  const real = await orig<typeof import("@/lib/cfb/card")>();
  cardReal.build = real.buildCfbCard;
  return { ...real, buildCfbCard: vi.fn(real.buildCfbCard) };
});

import { redis, storeEnv } from "@/lib/server/store";
import { espnEvents, slateFromEspn } from "@/lib/cfb/slate-server";
import { buildCfbCard } from "@/lib/cfb/card";
import { GET } from "../app/api/cfb/lock/route";
import * as lockRouteMod from "../app/api/cfb/lock/route";

const FIX = path.join(process.cwd(), "tests", "fixtures", "cfb");
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8"));
const ESPN = readJson("espn-scoreboard-2026-09-05.json") as { events: unknown[] };
const ODDS = readJson("odds-ncaaf-2026-09-05.json") as unknown[];
const FPI = readJson("espn-fpi.json") as unknown;
const DATE = "2026-09-05";
const SECRET = "cron-secret-for-this-test-only";
const T = (iso: string) => Date.parse(iso);
const FIRST_KICK = T("2026-09-05T16:00:00Z"); // 10 games
const LAST_KICK = T("2026-09-05T16:30:00Z"); // 2 games
const LOCKS_AT = FIRST_KICK - CFB_LOCK.leadMs; // 15:00Z

const root = path.join(__dirname, "..");
const readSrc = (p: string) => stripComments(fs.readFileSync(path.join(root, p), "utf8"));

function slateAt(now: number): CfbSlate {
  const board = buildCfbBoard({ date: DATE, espnEvents: ESPN.events, oddsEvents: ODDS, fpi: FPI, now, bankroll: 2500 });
  return { ...board, finals: finalsOf(board.games), quota: { remaining: 9000, used: 1000 }, oddsMissing: false };
}

/** an in-memory Redis behind the mocked `redis(cmd)` — records every command it was sent */
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
        kv.set(key, String(rest[0]));
        return "OK";
      default:
        throw new Error(`fake redis: ${op}`);
    }
  });
  /**
   * INSTRUCTION 2026-09-06 (DEFECT 4) — what `sets()` counts, and why it narrowed.
   *
   * Every `sets().length` assertion in this file was written to mean one thing: "how many
   * LEDGER writes did this poke make" — the pins next to them read `sets()[0][1]` and expect
   * `CFB_REDIS.ledger`, or count a sweep record plus today's lock. When `sets()` counted every
   * SET, that meaning held only because the ledger key was the only thing the route ever wrote.
   *
   * The DEFECT 4 fix makes the route write a SECOND, non-ledger key: the dated odds-gap marker
   * `pl:cfb:oddsgap:v1:<date>`, stamped when a poke inside the window refuses because no Caesars
   * price exists. That marker is bookkeeping about a refusal — it is emphatically NOT money and
   * NOT a ledger entry, and the refusal tests still mean exactly what they always meant: nothing
   * was recorded for the day. So `sets()` is narrowed to the ledger key rather than any refusal
   * assertion being loosened: the assertions keep their original number AND their original
   * meaning. `allSets()` still sees every write for anyone who needs the raw traffic, and
   * `markers()` isolates the new key so the DEFECT 4 tests can pin it positively.
   */
  const allSets = () => calls.filter((c) => c[0] === "SET");
  const sets = () => allSets().filter((c) => c[1] === CFB_REDIS.ledger);
  const markers = () => allSets().filter((c) => String(c[1]).startsWith(CFB_REDIS.oddsGap));
  const ledger = (): CfbLedgerEntry[] => {
    const raw = kv.get(CFB_REDIS.ledger);
    return raw ? ((JSON.parse(raw) as { ledger: CfbLedgerEntry[] }).ledger ?? []) : [];
  };
  return { kv, calls, sets, allSets, markers, ledger };
}

/** a Builder-locked (device) day on the CFB rails — synthetic, one $20 single */
function deviceEntry(date: string): CfbLedgerEntry {
  return {
    sport: "cfb",
    date,
    locked: true,
    daily: CFB_PAPER.daily,
    fun: CFB_PAPER.fun,
    core: [{ id: `cfb-${date}-core-1`, bucket: "core", name: "SINGLE · Device ML", stake: 20, czOdds: -150, czDec: 1.6667, prob: 66, czEv: 3, legs: [] }],
    funT: [],
    lockedAt: T(`${date}T14:00:00Z`),
    games: {},
    grading: { tickets: {}, legs: {}, done: false },
  };
}

const setNow = (t: number) => vi.setSystemTime(t);
const req = (opts: { date?: string; dry?: boolean; header?: Record<string, string> } = {}) => {
  const qs = new URLSearchParams();
  if (opts.date) qs.set("date", opts.date);
  if (opts.dry) qs.set("dry", "1");
  const url = `http://localhost/api/cfb/lock${qs.size ? `?${qs}` : ""}`;
  return new NextRequest(url, { headers: opts.header ?? { "x-cron-key": SECRET } });
};
const call = async (r: NextRequest = req({ date: DATE })): Promise<{ status: number; body: Record<string, unknown> }> => {
  const res = await GET(r);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

beforeEach(() => {
  vi.useFakeTimers({ now: LOCKS_AT, toFake: ["Date"] });
  /**
   * THE STORE IS RESET PER TEST, AND AN UNMOCKED ONE IS LOUD (2026-09-06, the critic's second
   * pass — the flake hunt). Every test that reaches the route builds its own store with
   * `fakeRedis()` / `seed()` (verified by walking every `it` in this file), and each of those makes
   * a FRESH in-memory Map, so no key survives a test. The reset below is what guarantees the
   * second half of that: without it a test that forgot to build a store would inherit the previous
   * test's implementation AND its keys, and would then pass or fail according to the order the
   * file happened to run in. `mockReset()` alone leaves a mock that returns `undefined`, which
   * `readStore` reads as a legitimately EMPTY ledger — a silent wrong answer, and exactly the
   * shape of an intermittent failure. So the default implementation throws by name instead.
   */
  vi.mocked(redis).mockReset().mockImplementation(async (cmd: unknown[]) => {
    throw new Error(`this test reached the store without building one — call fakeRedis()/seed() first (cmd: ${String((cmd as string[])[0])})`);
  });
  vi.mocked(storeEnv).mockReset().mockReturnValue({ url: "https://store.test", token: "t" });
  vi.mocked(espnEvents).mockReset().mockResolvedValue(ESPN.events);
  vi.mocked(slateFromEspn).mockReset().mockImplementation(async (_d, _e, now) => slateAt(now));
  vi.mocked(buildCfbCard).mockReset().mockImplementation((...a) => cardReal.build!(...a));
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("CFB_LOCK — the window", () => {
  it("opens one hour before the first kickoff; the forward aborts inside the scheduler's budget", () => {
    expect(CFB_LOCK).toEqual({ leadMs: 60 * 60_000, forwardTimeoutMs: 25_000 });
    expect(CFB_LOCK.leadMs).toBe(3_600_000);
    /* REWRITTEN 2026-09-06 (verification pass, DEFECT 6). The old line read
         // 25 s + the ~60 s generate forward stays inside the scheduler's 90 s maxDuration
         expect(CFB_LOCK.forwardTimeoutMs + 60_000).toBeLessThan(90_000);
       — arithmetically true (85_000 < 90_000) but it pinned a COMFORT, not the margin. The
       generate forward in app/api/scheduler/route.ts is sent with NO signal and NO timeout
       (verified 2026-09-06: `fetch(new URL("/api/generate..."), { headers, cache })` at both
       call sites), so a ~60 s generate plus this 25 s abort leaves FIVE seconds of the 90 s
       budget for the whole rest of the tick. That is the number worth pinning: strictly
       stronger than the old `toBeLessThan`, and it goes red the moment anyone widens the
       forward without putting a timeout on the generate fetch first. */
    expect(CFB_LOCK.forwardTimeoutMs + 60_000).toBe(85_000);
    expect(90_000 - (CFB_LOCK.forwardTimeoutMs + 60_000)).toBe(5_000);
    // the paper allotment the lock deploys is the one Josh named
    expect(CFB_PAPER.daily).toBe(250); // widened from $150 on 2026-09-08
    expect(CFB_PAPER.fun).toBe(25);
  });

  it("decideCfbLock: no-slate / waiting / lock with the games still ahead", () => {
    const games = ESPN.events.length ? slateAt(LOCKS_AT).games : [];
    expect(games.length).toBe(12);
    expect(decideCfbLock([], LOCKS_AT)).toEqual({ kind: "no-slate" });
    expect(decideCfbLock(games, LOCKS_AT - 1)).toEqual({ kind: "waiting", firstKickoff: FIRST_KICK, locksAt: LOCKS_AT });
    expect(decideCfbLock(games, LOCKS_AT)).toEqual({ kind: "lock", firstKickoff: FIRST_KICK, locksAt: LOCKS_AT, ahead: 12, total: 12 });
    expect(decideCfbLock(games, FIRST_KICK + 10 * 60_000)).toMatchObject({ kind: "lock", ahead: 2, total: 12 });
    expect(decideCfbLock(games, LAST_KICK + 60_000)).toMatchObject({ kind: "lock", ahead: 0, total: 12 });
    // an unparseable start is dropped, never a NaN window
    expect(decideCfbLock([{ start: "nope" }], LOCKS_AT)).toEqual({ kind: "no-slate" });
  });
});

describe("the gate — the scheduler's, verbatim", () => {
  it("CRON_SECRET unset → 503 before anything is read", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const fr = fakeRedis();
    const { status, body } = await call();
    expect(status).toBe(503);
    expect(String(body.error)).toMatch(/CRON_SECRET unset/);
    expect(fr.calls.length).toBe(0);
    expect(espnEvents).not.toHaveBeenCalled();
  });
  it("wrong header → 401, no header → 401, query-string key → 401", async () => {
    const fr = fakeRedis();
    expect((await call(req({ date: DATE, header: { "x-cron-key": "wrong" } }))).status).toBe(401);
    expect((await call(req({ date: DATE, header: {} }))).status).toBe(401);
    expect((await GET(new NextRequest(`http://localhost/api/cfb/lock?key=${SECRET}`))).status).toBe(401);
    expect(fr.calls.length).toBe(0);
  });
  it("the Vercel Cron spelling (Bearer) is the same key", async () => {
    fakeRedis();
    const { status, body } = await call(req({ date: DATE, header: { authorization: `Bearer ${SECRET}` } }));
    expect(status).toBe(200);
    expect(body.status).toBe("locked");
  });
  it("no store env → 503, nothing read", async () => {
    vi.mocked(storeEnv).mockReturnValue(null);
    const fr = fakeRedis();
    const { status, body } = await call();
    expect(status).toBe(503);
    expect(body.error).toBe("sync-not-configured");
    expect(fr.calls.length).toBe(0);
  });
  it("a bad date is a 400", async () => {
    fakeRedis();
    expect((await call(req({ date: "2026-9-5" }))).status).toBe(400);
  });
});

describe("the poke, branch by branch", () => {
  it("LOCKED at the window: one merged SET, the entry on the CFB rails, $150 / $25 respected, source server-lock", async () => {
    const fr = fakeRedis();
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.status).toBe("locked");
    expect(body.date).toBe(DATE);
    expect(body.dry).toBe(false);
    expect(body.ahead).toBe(12);
    expect(body.games).toBe(12);
    expect(body.source).toBe("server-lock");
    expect(body.lockedAt).toBe(LOCKS_AT);
    expect(String(body.note)).toMatch(/locked by the server before the first kickoff — 12 games on the slate/);

    expect(fr.sets().length).toBe(1);
    expect(fr.sets()[0][1]).toBe("pl:cfb:ledger:v1");
    const stored = JSON.parse(fr.kv.get(CFB_REDIS.ledger)!) as { ledger: CfbLedgerEntry[]; at: number };
    expect(stored.at).toBe(LOCKS_AT);
    expect(stored.ledger.length).toBe(1);
    const e = stored.ledger[0];
    expect(e.sport).toBe("cfb");
    expect(e.date).toBe(DATE);
    expect(e.locked).toBe(true);
    expect(e.source).toBe("server-lock");
    expect(e.trigger).toBe("cfb-lock");
    expect(e.daily).toBe(250);
    expect(e.fun).toBe(25);
    expect(e.lockedAt).toBe(LOCKS_AT);
    expect(e.noPlay).toBeUndefined();
    // the fixture carries +2% sides: a real card, sized under the rules
    expect(e.core.length).toBeGreaterThan(0);
    const coreStake = e.core.reduce((s, t) => s + t.stake, 0);
    expect(coreStake).toBeGreaterThan(0);
    expect(coreStake).toBeLessThanOrEqual(CFB_PAPER.daily);
    for (const t of e.core) {
      expect(t.stake).toBeGreaterThanOrEqual(CFB_RULES.minStake);
      expect(t.stake).toBeLessThanOrEqual(CFB_RULES.maxStake);
      expect(t.bucket).toBe("core");
    }
    const funStake = e.funT.reduce((s, t) => s + t.stake, 0);
    expect(funStake).toBeLessThanOrEqual(CFB_PAPER.fun);
    expect(body.core).toBe(e.core.length);
    expect(body.coreStake).toBe(coreStake);
    expect(body.fun).toBe(e.funT.length);
    expect(body.funStake).toBe(funStake);
    expect(body.noPlay).toBe(false);
    // every leg's game is in the entry's games snapshot (the grader keys off it)
    for (const t of [...e.core, ...e.funT]) for (const leg of t.legs) expect(e.games[leg.gkey]).toBeDefined();
    // the device-side reader accepts it as a CFB entry — the sync merge will carry it to the phone
    expect(cfbEntriesOf(stored.ledger).length).toBe(1);
  });

  it("IDEMPOTENT: the second poke after the server's own lock exits already-locked, no second SET", async () => {
    const fr = fakeRedis();
    expect((await call()).body.status).toBe("locked");
    const again = await call();
    expect(again.status).toBe(200);
    expect(again.body.status).toBe("already-locked");
    expect(again.body.source).toBe("server-lock");
    expect(fr.sets().length).toBe(1);
    // the second poke never built a slate — nothing upstream was asked
    expect(vi.mocked(slateFromEspn).mock.calls.length).toBe(1);
  });

  it("ALREADY-LOCKED by a device: a Builder lock stands, nothing written, no slate built", async () => {
    const dev = deviceEntry(DATE);
    const fr = fakeRedis({ [CFB_REDIS.ledger]: JSON.stringify({ ledger: [dev], at: dev.lockedAt }) });
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.status).toBe("already-locked");
    expect(body.source).toBe("device");
    expect(body.lockedAt).toBe(dev.lockedAt);
    expect(fr.sets().length).toBe(0);
    expect(espnEvents).not.toHaveBeenCalled();
    expect(fr.ledger()).toEqual([dev]);
  });

  it("WAITING before the window: nothing written, the body names locksAt and the first kickoff", async () => {
    setNow(LOCKS_AT - 1);
    const fr = fakeRedis();
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.status).toBe("waiting");
    expect(body.firstKickoff).toBe("2026-09-05T16:00:00.000Z");
    expect(body.locksAt).toBe("2026-09-05T15:00:00.000Z");
    expect(body.leadMs).toBe(CFB_LOCK.leadMs);
    expect(fr.sets().length).toBe(0);
    // DEFECT 1 (2026-09-06): a pre-window poke decides from the free ESPN board and stops there
    expect(slateFromEspn).not.toHaveBeenCalled();
    // the usual morning poke (05:00 PT) is the same answer
    setNow(T("2026-09-05T12:00:00Z"));
    expect((await call()).body.status).toBe("waiting");
    expect(fr.sets().length).toBe(0);
    expect(slateFromEspn).not.toHaveBeenCalled();
  });

  it("NO-SLATE: a date with no kickoff writes nothing — and spends no Odds API credit (DEFECT 1)", async () => {
    vi.mocked(espnEvents).mockResolvedValue([]);
    vi.mocked(slateFromEspn).mockImplementation(async (date, _e, now) => ({ ...slateAt(now), date, games: [], finals: {}, unmatched: 0 }));
    const fr = fakeRedis();
    const { status, body } = await call(req({ date: "2026-09-08" }));
    expect(status).toBe(200);
    expect(body.status).toBe("no-slate");
    expect(body.date).toBe("2026-09-08");
    expect(fr.sets().length).toBe(0);
    // DEFECT 1 (2026-09-06): the kickoff set comes from ESPN alone, so a kickoff-less date is
    // answered WITHOUT the priced board — slateFromEspn is the only path to oddsPayload().
    expect(slateFromEspn).not.toHaveBeenCalled();
  });

  it("LATE poke after the first kickoff: locks from the games still ahead and says so", async () => {
    setNow(FIRST_KICK + 10 * 60_000);
    const fr = fakeRedis();
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.status).toBe("locked");
    expect(body.ahead).toBe(2);
    expect(body.games).toBe(12);
    expect(String(body.note)).toMatch(/^locked after first kickoff — 2 of 12 games still ahead/);
    expect(fr.sets().length).toBe(1);
    const e = fr.ledger()[0];
    expect(e.source).toBe("server-lock");
    // nothing priced on a game that had kicked off — every leg sits on a game still ahead
    for (const t of [...e.core, ...e.funT]) for (const leg of t.legs) expect(Date.parse(e.games[leg.gkey].start)).toBeGreaterThan(Date.now());
  });

  it("MISSED window (every game kicked off): a NO-PLAY entry whose note says so, nothing staked", async () => {
    setNow(LAST_KICK + 60_000);
    const fr = fakeRedis();
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.status).toBe("locked");
    expect(body.noPlay).toBe(true);
    expect(body.ahead).toBe(0);
    expect(body.core).toBe(0);
    expect(body.coreStake).toBe(0);
    expect(body.fun).toBe(0);
    expect(body.funStake).toBe(0);
    expect(String(body.note)).toMatch(/NO-PLAY — lock window missed: every one of the 12 games on 2026-09-05 had kicked off/);
    expect(fr.sets().length).toBe(1);
    const e = fr.ledger()[0];
    expect(e.noPlay).toBe(true);
    expect(e.core).toEqual([]);
    expect(e.funT).toEqual([]);
    expect(e.source).toBe("server-lock");
    expect(e.note).toBe(body.note);
    // and the day now stands: the next poke is already-locked
    expect((await call()).body.status).toBe("already-locked");
    expect(fr.sets().length).toBe(1);
  });

  it("MERGE, never replace: a device entry on another date survives byte-for-byte", async () => {
    const dev = deviceEntry("2026-09-12");
    const fr = fakeRedis({ [CFB_REDIS.ledger]: JSON.stringify({ ledger: [dev], at: dev.lockedAt }) });
    const { body } = await call();
    expect(body.status).toBe("locked");
    const stored = fr.ledger();
    expect(stored.map((e) => e.date)).toEqual([DATE, "2026-09-12"]);
    expect(stored[1]).toEqual(dev);
    expect(stored[0].source).toBe("server-lock");
    expect(readSrc("app/api/cfb/lock/route.ts")).toMatch(/mergeLedgers\(cur, \[entry\]\)/);
  });

  it("MERGE kernel: a device copy of the SAME date outranks the server's — the phone's lock is never replaced", async () => {
    // the route exits already-locked before this can happen; the kernel is pinned for the
    // sync direction too (pull → merge → push in src/lib/cfb/sync.ts runs the same call)
    setNow(LOCKS_AT);
    const server = buildCfbLockEntry(slateAt(LOCKS_AT), { now: LOCKS_AT, bankroll: 2500, ahead: 12, total: 12, firstKickoff: FIRST_KICK }).entry;
    const dev = deviceEntry(DATE);
    const merged = mergeLedgers([dev], [server]);
    expect(merged.length).toBe(1);
    expect(merged[0].core).toEqual(dev.core);
    expect(merged[0].source).toBeUndefined();
    expect(mergeLedgers([server], [dev])[0].core).toEqual(dev.core);
    // and on an empty device the server's entry rides through the phone's reader intact
    const onPhone = cfbEntriesOf(mergeLedgers([], [server]));
    expect(onPhone.length).toBe(1);
    expect(onPhone[0].source).toBe("server-lock");
    expect(onPhone[0].core).toEqual(server.core);
  });

  it("dry=1 builds and returns the card, writes nothing", async () => {
    const fr = fakeRedis();
    const { status, body } = await call(req({ date: DATE, dry: true }));
    expect(status).toBe(200);
    expect(body.status).toBe("locked");
    expect(body.dry).toBe(true);
    expect((body.entry as CfbLedgerEntry).source).toBe("server-lock");
    expect((body.entry as CfbLedgerEntry).core.length).toBe(body.core);
    expect(fr.sets().length).toBe(0);
    // a dry run leaves the date unlocked — the next real poke locks it
    expect((await call()).body.status).toBe("locked");
    expect(fr.sets().length).toBe(1);
  });

  it("RACED: a device lock that lands while the slate is building wins — the write re-reads and backs off", async () => {
    // the guard that does the real work here (the re-read inside the write block) had no pin at
    // all; without it the phone's own locked day would be merged over by the server's card.
    const fr = fakeRedis();
    const dev = deviceEntry(DATE);
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => {
      fr.kv.set(CFB_REDIS.ledger, JSON.stringify({ ledger: [dev], at: dev.lockedAt }));
      return slateAt(now);
    });
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.status).toBe("already-locked");
    expect(body.raced).toBe(true);
    expect(fr.sets().length).toBe(0);
    expect(fr.ledger()).toEqual([dev]);
  });

  it("a store outage is a 502, never a throw", async () => {
    vi.mocked(redis).mockRejectedValue(new Error("store 503"));
    const { status, body } = await call();
    expect(status).toBe(502);
    expect(String(body.error)).toMatch(/store unreachable/);
  });
});

/**
 * DEFECT 1 (INSTRUCTION 45, 2026-09-05, found in review of the first cut of this route).
 *
 * `oddsPayload()` in src/lib/cfb/slate-server.ts NEVER throws: a missing ODDS_API_KEY, a 401, a
 * 429, a non-array body or a network error all return `{ events: [], missing: true }`. The board
 * is then scores-only, `priceGame` pushes no row (no market probability), `buildCfbCard` finds
 * zero candidates and returns a NO-PLAY card — and the first cut of this route wrote that card
 * and locked the date. Every later poke then answered already-locked, so ONE transient upstream
 * blip cost the whole $150 core / $25 fun day. The route must refuse instead: with games still
 * ahead and no usable Caesars price, write NOTHING and let the next poke retry.
 *
 * The refusal reads BOTH shapes of the same upstream gap:
 *   slate.oddsMissing        the fetch itself failed (or there was no key)
 *   zero Caesars prices      the fetch "worked" but nothing on a game still ahead carries a
 *                            Caesars quote — the same hole wearing a different hat
 * A REAL no-bet day — Caesars prices present, nothing clearing +2% EV under maxDec — still
 * locks, because that is a genuine NO-PLAY and it belongs on the ledger.
 */
describe("DEFECT 1 — an odds outage inside the window must never lock the day away", () => {
  /** the scores-only board slateFromEspn returns when oddsPayload() gives up */
  function slateNoOdds(now: number, oddsMissing: boolean): CfbSlate {
    const board = buildCfbBoard({ date: DATE, espnEvents: ESPN.events, oddsEvents: [], fpi: FPI, now, bankroll: 2500 });
    return { ...board, finals: finalsOf(board.games), quota: { remaining: null, used: null }, oddsMissing };
  }
  /** Caesars prices present on every game, but no side clears the +2% gate */
  function slateNoEdge(now: number): CfbSlate {
    const s = slateAt(now);
    return { ...s, games: s.games.map((g) => ({ ...g, rows: g.rows.map((r) => ({ ...r, evCz: -5, evBest: -5 })) })) };
  }

  it("the fixture really does carry Caesars prices — the no-edge case is not a no-price case", () => {
    const priced = slateNoEdge(LOCKS_AT).games.flatMap((g) => g.rows.filter((r) => r.cz != null));
    expect(priced.length).toBeGreaterThan(0);
    expect(slateNoOdds(LOCKS_AT, true).games.flatMap((g) => g.rows).length).toBe(0);
  });

  /**
   * THE CAUSE HALF, BEHAVIOURALLY (INSTRUCTION 45, 2026-09-06, the closing round's defect C4).
   *
   * THE MUTANT: delete `slate.oddsMissing ||` from the refusal in app/api/cfb/lock/route.ts. Every
   * refusal test above still passes, because on every fixture the two disjuncts coincide —
   * `oddsPayload` (src/lib/cfb/slate-server.ts) returns `{ events: [], missing: true }` on the
   * failures it maps, so a board with `oddsMissing: true` has no priced row and `cfbPricedAhead` is
   * 0 anyway. The pin that killed the mutant was a comment-stripped SOURCE regex in
   * tests/cfb-grade.test.ts, and a source regex passes any behaviourally-identical rewording of the
   * same condition, so it proves nothing about what the route DOES.
   *
   * THIS IS THE SLATE THAT SEPARATES THEM: the REAL odds fixture, so the games still ahead carry
   * playable priced rows and `cfbPricedAhead(slate.games, LOCKS_AT) > 0`, with `oddsMissing: true`
   * forced on it — the shape a cached or partially-priced board, or any future feed that reports
   * `missing` beside surviving rows, produces. The mutant LOCKS the day off those prices; the
   * honest route refuses, which is what DEFECT 1 exists for and is permanent once written (every
   * later poke exits already-locked). The source pin in tests/cfb-grade.test.ts is KEPT and now
   * guards something this cannot: that the route REPORTS the two causes apart (`const why =
   * slate.oddsMissing ?`), which is a fact about the sentence, not about the refusal.
   */
  it("PRICES PRESENT but the feed reported MISSING: the day is still refused, and nothing is written", async () => {
    const withPrices = (now: number): CfbSlate => ({ ...slateAt(now), oddsMissing: true });
    /* the premise: this slate really is priced, so `pricedAhead === 0` cannot be what refuses it */
    expect(cfbPricedAhead(withPrices(LOCKS_AT).games, LOCKS_AT)).toBeGreaterThan(0);
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => withPrices(now));
    const fr = fakeRedis();
    const { status, body } = await call();
    expect(status).toBe(502);
    expect(body.status).toBe("odds-missing");
    expect(body.oddsMissing).toBe(true);
    expect(Number(body.pricedAhead)).toBeGreaterThan(0);
    expect(body.ahead).toBe(12);
    expect(String(body.note)).toMatch(/no Caesars price/i);
    /* and it is the FEED's failure that is named, not the match count */
    expect(String(body.note)).toMatch(/the Odds API call failed or had no key/);
    expect(fr.sets().length).toBe(0);
    expect(fr.ledger()).toEqual([]);
  });

  it("ODDS MISSING at the window with games ahead: writes NOTHING and answers odds-missing (502)", async () => {
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => slateNoOdds(now, true));
    const fr = fakeRedis();
    const { status, body } = await call();
    expect(status).toBe(502);
    expect(body.status).toBe("odds-missing");
    expect(body.date).toBe(DATE);
    expect(body.oddsMissing).toBe(true);
    expect(body.pricedAhead).toBe(0);
    expect(body.ahead).toBe(12);
    expect(body.games).toBe(12);
    expect(String(body.note)).toMatch(/no Caesars price/i);
    expect(fr.sets().length).toBe(0);
    expect(fr.ledger()).toEqual([]);
  });

  it("ODDS PRESENT but zero Caesars quotes on the games ahead: the same refusal, nothing written", async () => {
    // oddsPayload() returned a 200 with an array that matched nothing — the same hole
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => slateNoOdds(now, false));
    const fr = fakeRedis();
    const { status, body } = await call();
    expect(status).toBe(502);
    expect(body.status).toBe("odds-missing");
    expect(body.oddsMissing).toBe(false);
    expect(body.pricedAhead).toBe(0);
    expect(fr.sets().length).toBe(0);
  });

  it("dry=1 reports the refusal too, and never writes", async () => {
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => slateNoOdds(now, true));
    const fr = fakeRedis();
    const { status, body } = await call(req({ date: DATE, dry: true }));
    expect(status).toBe(502);
    expect(body.status).toBe("odds-missing");
    expect(body.dry).toBe(true);
    expect(fr.sets().length).toBe(0);
  });

  it("THE POINT: the very next poke, odds restored, locks the day normally — one SET, the full card", async () => {
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => slateNoOdds(now, true));
    const fr = fakeRedis();
    expect((await call()).body.status).toBe("odds-missing");
    expect(fr.sets().length).toBe(0);

    setNow(LOCKS_AT + 15 * 60_000);
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => slateAt(now));
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.status).toBe("locked");
    expect(body.ahead).toBe(12);
    expect(fr.sets().length).toBe(1);
    const e = fr.ledger()[0];
    expect(e.date).toBe(DATE);
    expect(e.source).toBe("server-lock");
    expect(e.noPlay).toBeUndefined();
    expect(e.core.length).toBeGreaterThan(0);
    expect(e.core.reduce((s, t) => s + t.stake, 0)).toBeGreaterThan(0);
  });

  it("MISSED WINDOW is the one NO-PLAY that may be written without prices — the record is about the window, not the lines", async () => {
    setNow(LAST_KICK + 60_000);
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => slateNoOdds(now, true));
    const fr = fakeRedis();
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.status).toBe("locked");
    expect(body.noPlay).toBe(true);
    expect(body.ahead).toBe(0);
    expect(String(body.note)).toMatch(/NO-PLAY — lock window missed/);
    expect(fr.sets().length).toBe(1);
    expect(fr.ledger()[0].source).toBe("server-lock");
  });

  it("NO OVER-CORRECTION: prices present, nothing clearing +2% EV, still locks a real NO-PLAY day", async () => {
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => slateNoEdge(now));
    const fr = fakeRedis();
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.status).toBe("locked");
    expect(body.noPlay).toBe(true);
    expect(body.core).toBe(0);
    expect(body.coreStake).toBe(0);
    expect(String(body.note)).toMatch(/no playable side clears \+2% EV at Caesars/);
    expect(fr.sets().length).toBe(1);
    const e = fr.ledger()[0];
    expect(e.noPlay).toBe(true);
    expect(e.source).toBe("server-lock");
  });
});

/**
 * DEFECT 2 (INSTRUCTION 45, 2026-09-05, found in the same review).
 *
 * The date is `q.get("date") || ptToday()` and the scheduler's forward passes no `?date`. The
 * external ticker (docs/cron-jobs.md) pokes UTC hours 15–23 and 0–2 — roughly 08:00–19:45 PT.
 * A slate whose lock window opens AFTER the last poke of that PT day answered `waiting` at
 * 19:45 PT and was never seen again: by the next poke `ptToday()` had already rolled over. The
 * day was never locked and never recorded — a silent day, which is exactly what
 * src/lib/server/lock-card.ts `buildReasonRecord` exists to prevent on the MLB rails.
 *
 * The fix is the previous-PT-date sweep. On a poke that carried no explicit `?date`, the route
 * checks yesterday: no ledger entry (device OR server) and a slate that existed → write the
 * missed-window NO-PLAY record for it. Every game on a CFB board for PT date D has its kickoff
 * on PT date D (src/lib/cfb/model.ts filters `g.date !== input.date` where `g.date` is
 * `ptDateOf(start)`), so by the time we are inside PT date D+1 the whole of D has kicked off —
 * a missed-window record needs only the game list, and is built from ESPN alone with
 * `oddsEvents: []`, spending ZERO Odds API credits. The sweep can never fail the poke: any error
 * is caught and reported under `sweep`, and today's answer and status code are untouched.
 */
describe("DEFECT 2 — the previous PT date is swept, never left silent", () => {
  /**
   * PINS REWRITTEN 2026-09-06 (verification pass, DEFECTS 2 + 3) — THE DATES, AND ONLY THE DATES.
   *
   * Every test below was written on DATE = "2026-09-05" with PREV = "2026-09-04", and each one
   * pinned the sweep's ACTION for PREV: "recorded", "already-recorded", "no-slate", "error",
   * "would-record". `CFB_PAPER.since` is "2026-09-05", so 2026-09-04 predates the desk, and the
   * DEFECT 2 fix now floors the sweep there: the only honest answer for 2026-09-04 is
   * "before-desk", which is exactly what the new pin two describes down asserts. These pins
   * therefore encoded behaviour that is now deliberately different — a sweep that would write a
   * locked NO-PLAY for a day on which the paper card had not started — so they are moved onto a
   * pair of dates AFTER `since` (TODAY 2026-09-12 / PREV 2026-09-11) rather than deleted or
   * loosened. Every assertion keeps its original force, verbatim, on the same fixture payload
   * shifted one week forward; nothing about what a sweep must do to a legitimate silent day has
   * been weakened. What moved: the two date constants, the clock (`NOW`, 08:00 PT on TODAY, which
   * also replaces the `lockedAt` pin's LOCKS_AT), the note's date, and the deeper dates of the
   * DEFECT 3 walk (2026-09-10 / 2026-09-09) which are given empty slates so they answer no-slate
   * and change nothing these tests measure.
   */
  const TODAY = "2026-09-12";
  const PREV = "2026-09-11";
  /** the rest of the bounded walk (CFB_SWEEP_DAYS = 3) — no slate, so they cost nothing here */
  const DEEP = ["2026-09-10", "2026-09-09"];
  /** 08:00 PT on TODAY: TODAY's lock window is open to the second, and PREV has fully kicked off */
  const NOW = T("2026-09-12T15:00:00Z");
  /** ESPN answers for TODAY (+ anything named); the deeper walk dates have no slate at all */
  const days = (extra: Record<string, unknown[]> = {}) =>
    espnByDate({ [TODAY]: eventsFor(TODAY), ...Object.fromEntries(DEEP.map((d) => [d, []])), ...extra });

  beforeEach(() => {
    setNow(NOW);
    vi.mocked(slateFromEspn).mockImplementation(async (d, _e, now) => slateForDate(d, now));
  });

  it("SWEEP: yesterday had a slate and no entry → the missed-window record is written for it", async () => {
    days({ [PREV]: eventsFor(PREV) });
    const fr = fakeRedis();
    const { status, body } = await call(req()); // no ?date — the scheduler's own poke
    expect(status).toBe(200);
    expect(body.status).toBe("locked");
    expect(body.date).toBe(TODAY);
    const sweep = body.sweep as Record<string, unknown>;
    expect(sweep.date).toBe(PREV);
    expect(sweep.action).toBe("recorded");
    expect(sweep.games).toBe(12);

    expect(fr.sets().length).toBe(2); // the sweep record, then today's lock
    const stored = fr.ledger();
    expect(stored.map((e) => e.date).sort()).toEqual([PREV, TODAY]);
    const y = stored.find((e) => e.date === PREV)!;
    expect(y.sport).toBe("cfb");
    expect(y.locked).toBe(true);
    expect(y.noPlay).toBe(true);
    expect(y.core).toEqual([]);
    expect(y.funT).toEqual([]);
    expect(y.source).toBe("server-lock");
    expect(y.trigger).toBe(CFB_SWEEP_TRIGGER);
    expect(y.lockedAt).toBe(NOW); // when the record was written, stated honestly
    expect(String(y.note)).toMatch(/NO-PLAY — lock window missed: every one of the 12 games on 2026-09-11/);
    expect(String(y.note)).toMatch(/swept on the following day's poke/);
    // and today's lock survived the sweep's write — the second SET merged, never replaced
    expect(stored.find((e) => e.date === TODAY)!.core.length).toBeGreaterThan(0);
  });

  it("the sweep spends NO Odds API credits — the previous board is built from ESPN alone", async () => {
    days({ [PREV]: eventsFor(PREV) });
    fakeRedis();
    await call(req());
    // slateFromEspn (the only path that calls oddsPayload) was asked for today and nobody else
    expect(vi.mocked(slateFromEspn).mock.calls.map((c) => c[0])).toEqual([TODAY]);
    expect(readSrc("app/api/cfb/lock/route.ts")).toMatch(/oddsEvents: \[\]/);
  });

  it("IDEMPOTENT: yesterday already recorded (device OR server) → nothing written, nothing fetched for it", async () => {
    for (const seeded of [deviceEntry(PREV), { ...deviceEntry(PREV), source: "server-lock" as const, trigger: CFB_SWEEP_TRIGGER }]) {
      espnByDate({ [TODAY]: eventsFor(TODAY) }); // espnEvents(PREV) would throw — it must never be called
      const fr = fakeRedis({ [CFB_REDIS.ledger]: JSON.stringify({ ledger: [seeded], at: seeded.lockedAt }) });
      const { status, body } = await call(req());
      expect(status).toBe(200);
      expect((body.sweep as Record<string, unknown>).action).toBe("already-recorded");
      expect(fr.sets().length).toBe(1); // today only
      expect(fr.ledger().find((e) => e.date === PREV)).toEqual(seeded);
    }
  });

  it("yesterday had NO slate → nothing written for it, and the poke says so", async () => {
    days({ [PREV]: [] });
    const fr = fakeRedis();
    const { status, body } = await call(req());
    expect(status).toBe(200);
    expect((body.sweep as Record<string, unknown>).action).toBe("no-slate");
    expect(fr.sets().length).toBe(1);
    expect(fr.ledger().map((e) => e.date)).toEqual([TODAY]);
  });

  it("an EXPLICIT ?date suppresses the sweep entirely — a backfill poke touches only the date asked for", async () => {
    espnByDate({ [TODAY]: eventsFor(TODAY) }); // espnEvents(PREV) would throw
    const fr = fakeRedis();
    const { status, body } = await call(req({ date: TODAY }));
    expect(status).toBe(200);
    expect(body.status).toBe("locked");
    expect(body.sweep).toBeUndefined();
    expect(vi.mocked(espnEvents).mock.calls.map((c) => c[0])).toEqual([TODAY]);
    expect(fr.sets().length).toBe(1);
  });

  it("a SWEEP FAILURE is caught and reported — today's answer and status code are untouched", async () => {
    espnByDate({ [TODAY]: eventsFor(TODAY) }); // espnEvents(PREV) throws "unexpected espnEvents(2026-09-11)"
    const fr = fakeRedis();
    const { status, body } = await call(req());
    expect(status).toBe(200);
    expect(body.status).toBe("locked");
    expect(body.core).toBeGreaterThan(0);
    const sweep = body.sweep as Record<string, unknown>;
    expect(sweep.action).toBe("error");
    expect(String(sweep.error)).toMatch(/unexpected espnEvents\(2026-09-11\)/);
    expect(fr.sets().length).toBe(1); // today still locked
    expect(fr.ledger().map((e) => e.date)).toEqual([TODAY]);
  });

  it("the sweep runs on the already-locked path too — a locked today never hides a silent yesterday", async () => {
    days({ [PREV]: eventsFor(PREV) });
    const dev = deviceEntry(TODAY);
    const fr = fakeRedis({ [CFB_REDIS.ledger]: JSON.stringify({ ledger: [dev], at: dev.lockedAt }) });
    const { status, body } = await call(req());
    expect(status).toBe(200);
    expect(body.status).toBe("already-locked");
    expect((body.sweep as Record<string, unknown>).action).toBe("recorded");
    expect(fr.sets().length).toBe(1); // the sweep's write only — today was already locked
    expect(fr.ledger().map((e) => e.date).sort()).toEqual([PREV, TODAY]);
    expect(fr.ledger().find((e) => e.date === TODAY)).toEqual(dev);
  });

  it("the sweep's own write re-reads first: a record that landed while ESPN was answering is not replaced", async () => {
    const landed = deviceEntry(PREV);
    const fr = fakeRedis();
    vi.mocked(espnEvents).mockImplementation(async (d: string) => {
      if (d === PREV) {
        // a device push (or another poke) lands for PREV while this poke is still fetching
        fr.kv.set(CFB_REDIS.ledger, JSON.stringify({ ledger: [landed], at: landed.lockedAt }));
        return eventsFor(PREV);
      }
      return d === TODAY ? eventsFor(TODAY) : [];
    });
    const { status, body } = await call(req());
    expect(status).toBe(200);
    const sweep = body.sweep as Record<string, unknown>;
    expect(sweep.action).toBe("already-recorded");
    expect(sweep.raced).toBe(true);
    expect(fr.ledger().find((e) => e.date === PREV)).toEqual(landed);
  });

  it("dry=1 sweeps in dry too: it reports what it would record and writes nothing", async () => {
    days({ [PREV]: eventsFor(PREV) });
    const fr = fakeRedis();
    const { status, body } = await call(req({ dry: true }));
    expect(status).toBe(200);
    expect(body.dry).toBe(true);
    expect((body.sweep as Record<string, unknown>).action).toBe("would-record");
    expect(fr.sets().length).toBe(0);
  });
});

describe("the route file, comment-stripped — gated and keyed like its siblings", () => {
  const src = readSrc("app/api/cfb/lock/route.ts");
  it("FAILS CLOSED: CRON_SECRET unset → 503 before anything else; header auth; store gate", () => {
    expect(/if \(!process\.env\.CRON_SECRET\)[\s\S]{0,140}?503/.test(src)).toBe(true);
    expect(/return !cron/.test(src)).toBe(false);
    expect(src).toMatch(/cronHeaderAuthed\(req\)/);
    expect(src).toMatch(/if \(!storeEnv\(\)\)[^\n]*503/);
    expect(src).not.toMatch(/searchParams\.get\(["']key["']\)/);
    expect(src).not.toMatch(/x-pl-sync/);
    expect(src).toMatch(/export const dynamic = "force-dynamic"/);
  });
  it("stores under the CFB blobs by their pinned literals, merges, and never names an MLB blob", () => {
    expect(src).toMatch(/"pl:cfb:ledger:v1"/);
    expect(src).toMatch(/"pl:cfb:bank:v1"/);
    expect(src).toMatch(/mergeLedgers\(/);
    expect(src).not.toMatch(/pl:ledger:v1/);
    expect(src).not.toMatch(/pl:bank:v1/);
    expect(src).not.toMatch(/pl:noplay/);
    expect(src).not.toMatch(/epoch/i);
    expect(src).not.toMatch(/api\.the-odds-api\.com/);
    expect(src).not.toMatch(/ODDS_API_KEY/);
  });
  it("derives its date from the shared Pacific helper and builds through the shared slate helper", () => {
    expect(src).toMatch(/ptToday\(\)/);
    expect(src).toMatch(/from "@\/lib\/server\/pt-date"/);
    expect(src).toMatch(/espnEvents\(date\)/);
    expect(src).toMatch(/slateFromEspn\(/);
    expect(src).not.toMatch(/timeZone: ?"America\/Los_Angeles"/);
  });
  it("the entry carries the MLB scheduler's own marker — source \"server-lock\"", () => {
    const helper = readSrc("src/lib/cfb/lock-server.ts");
    expect(helper).toMatch(/CFB_LOCK_SOURCE = "server-lock"/);
    expect(readSrc("src/lib/server/lock-card.ts")).toMatch(/source: "server-lock"/);
  });
  it("the Builder says when the server locked the day and keeps its refusing LOCK", () => {
    const b = readSrc("src/components/cfb/CfbBuilder.tsx");
    expect(b).toMatch(/entry\.source === "server-lock"/);
    expect(b).toMatch(/Locked by the server at \$\{ptClock\(entry\.lockedAt\)\} PT/);
    expect(b).toMatch(/the first lock stands/);
    expect(b).toMatch(/locked\.note/);
  });
});

/* ==========================================================================================
 * THE VERIFICATION PASS (2026-09-06) — six defects found by reading the first hardened cut of
 * /api/cfb/lock, plus the money guard the route was writing unattended without.
 *
 * Shared fixture plumbing for the dated cases: the 2026-09-05 ESPN + odds fixtures shifted onto
 * another calendar day, so a multi-day sweep window and a date rollover can be driven end to end
 * with the real payload shapes.
 * ======================================================================================== */

/** the 2026-09-05 ESPN payload moved onto date `d` (kickoffs 16:00Z / 16:30Z on that day) */
const eventsFor = (d: string) => JSON.parse(JSON.stringify(ESPN.events).replaceAll(`${DATE}T`, `${d}T`)) as unknown[];
/** the same for the odds payload — commence_time moves with it, so names.ts still matches */
const oddsFor = (d: string) => JSON.parse(JSON.stringify(ODDS).replaceAll(`${DATE}T`, `${d}T`)) as unknown[];
/** the priced slate for any date, the way slateFromEspn would return it */
function slateForDate(d: string, now: number): CfbSlate {
  const board = buildCfbBoard({ date: d, espnEvents: eventsFor(d), oddsEvents: oddsFor(d), fpi: FPI, now, bankroll: 2500 });
  return { ...board, finals: finalsOf(board.games), quota: { remaining: 9000, used: 1000 }, oddsMissing: false };
}
/** espnEvents that answers only the dates named — any other date is a thrown "unexpected" */
const espnByDate = (map: Record<string, unknown[]>) =>
  vi.mocked(espnEvents).mockImplementation(async (d: string) => {
    const v = map[d];
    if (!v) throw new Error(`unexpected espnEvents(${d})`);
    return v;
  });
const sweepOf = (body: Record<string, unknown>) => body.sweep as Record<string, unknown>;
const sweepDays = (body: Record<string, unknown>) => (sweepOf(body).days ?? []) as Record<string, unknown>[];

/**
 * DEFECT 1 (verification pass, 2026-09-06) — THE ROUTE BURNT ODDS API CREDITS ON EVERY POKE THAT
 * COULD NOT POSSIBLY LOCK.
 *
 * `slateFromEspn` (src/lib/cfb/slate-server.ts) calls `oddsPayload()` unconditionally, and the
 * first cut called `slateFromEspn` BEFORE `decideCfbLock`. One fresh CFB game-lines pull costs 6
 * credits (docs/cfb-desk.md, measured on prod 2026-09-05: the quota moved 17578 → 17572), the
 * odds data cache revalidates every 240 s and the ticker pokes every ~15 min, so EVERY poke was a
 * fresh billed call. On a date with no kickoff at all — every day February through July, and most
 * Mon/Tue/Wed in season — the route paid 6 credits and then answered `no-slate` having written
 * nothing, ~48 times a day, forever; the long `waiting` stretch before a late kickoff did the
 * same. None of it is visible to the props rail (`CFB_PROPS.dailyBudget` 2500 counts PROPS pulls
 * only), so it silently ate the same monthly plan that makes a full Saturday refuse props pulls.
 *
 * The fix is DECIDE BEFORE YOU SPEND: kickoff times come from ESPN alone, so the route builds the
 * ESPN-only board first (`buildCfbBoard` with `oddsEvents: []`, the same shape the sweep already
 * uses), runs `decideCfbLock` on ITS games, and answers no-slate / waiting from that. Only a poke
 * that is actually going to lock calls `slateFromEspn`.
 */
describe("DEFECT 1 (2026-09-06) — decide before you spend: no Odds credit on a poke that cannot lock", () => {
  it("the ESPN-only board and the priced board carry the SAME games — the decision needs no odds", () => {
    const free = buildCfbBoard({ date: DATE, espnEvents: ESPN.events, oddsEvents: [], fpi: null, now: LOCKS_AT, bankroll: 2500 });
    const priced = slateAt(LOCKS_AT);
    // buildCfbBoard builds `games` from espnEvents alone (shape → drop g.date !== date → dedupe →
    // sort); an odds event only ever fills `rows` and `slateDates`. So it can never add, drop or
    // shift a game, and decideCfbLock over the free board is the same decision.
    expect(free.games.map((g) => g.id)).toEqual(priced.games.map((g) => g.id));
    expect(free.games.map((g) => g.start)).toEqual(priced.games.map((g) => g.start));
    expect(free.games.flatMap((g) => g.rows).length).toBe(0);
    expect(decideCfbLock(free.games, LOCKS_AT)).toEqual(decideCfbLock(priced.games, LOCKS_AT));
    expect(decideCfbLock(free.games, LOCKS_AT - 1)).toEqual(decideCfbLock(priced.games, LOCKS_AT - 1));
  });

  it("A LOCKING poke calls slateFromEspn exactly once — the one poke a day that is allowed to spend", async () => {
    const fr = fakeRedis();
    expect((await call()).body.status).toBe("locked");
    expect(vi.mocked(slateFromEspn).mock.calls.length).toBe(1);
    expect(fr.sets().length).toBe(1);
  });

  it("A DAY OF WAITING POKES costs nothing: eight pre-window pokes, zero priced boards", async () => {
    fakeRedis();
    for (const h of [8, 9, 10, 11, 12, 13, 14, 14.9]) {
      setNow(FIRST_KICK - CFB_LOCK.leadMs - Math.round((15 - h) * 3600_000));
      expect((await call()).body.status).toBe("waiting");
    }
    expect(vi.mocked(slateFromEspn).mock.calls.length).toBe(0);
    expect(vi.mocked(espnEvents).mock.calls.length).toBe(8);
  });
});

/**
 * DEFECTS 2 + 3 (verification pass, 2026-09-06) — THE SWEEP.
 *
 * DEFECT 2: `CFB_PAPER.since` is "2026-09-05". The scheduler's forward passes no `?date`, so the
 * first prod poke swept `prevPtDates(today, 2)[1]` = 2026-09-04 — a Friday with real FBS
 * kickoffs — and wrote a locked NO-PLAY entry for a day on which this route did not exist and the
 * paper card had not started. src/lib/cfb/store.ts states the invariant verbatim: the CFB record
 * "cannot hold a day before CFB_PAPER.since, so this window is exact", which is what the default
 * bank's `asOf` rests on. The sweep now FLOORS at `CFB_PAPER.since`: an older date is skipped,
 * reported as such, and never triggers an ESPN fetch.
 *
 * DEFECT 3: the sweep reached back exactly one PT date. On CFB the week's entire meaningful slate
 * IS Saturday, so a two-day outage left the one day that carries the money silent forever —
 * exactly the silence the sweep exists to abolish. It now walks a bounded window
 * (`CFB_SWEEP_DAYS` previous PT dates, newest first), stopping at the first date that already
 * carries a ledger entry, skipping anything before `CFB_PAPER.since`, and doing the FREE ledger
 * check before any ESPN fetch — so a swept-clean history costs nothing at all.
 */
describe("DEFECTS 2 + 3 (2026-09-06) — the sweep is floored at the desk's start and walks a bounded window", () => {
  const SINCE = CFB_PAPER.since; // "2026-09-05"
  const D3 = "2026-09-08";
  const D2 = "2026-09-07";
  const D1 = "2026-09-06";
  /** 08:00 PT on D3 — inside D3's lock window (its fixture kicks at 16:00Z) and inside D3's PT day */
  const WIN_NOW = T("2026-09-08T15:00:00Z");

  it("the constant exists and is small: a bounded number of previous PT dates per poke", () => {
    expect(cfbRulesMod.CFB_SWEEP_DAYS).toBe(3);
    expect(ptToday(new Date(WIN_NOW))).toBe(D3);
  });

  it("DEFECT 2: a poke on CFB_PAPER.since itself writes NOTHING for the day before it, and never fetches it", async () => {
    // today IS the desk's first day; 2026-09-04 predates the route and the paper card entirely
    espnByDate({ [SINCE]: ESPN.events }); // espnEvents("2026-09-04") would throw
    const fr = fakeRedis();
    const { status, body } = await call(req()); // no ?date — the scheduler's own poke
    expect(status).toBe(200);
    expect(body.status).toBe("locked");
    expect(body.date).toBe(SINCE);
    const sweep = sweepOf(body);
    expect(sweep.date).toBe("2026-09-04");
    expect(sweep.action).toBe("before-desk");
    expect(sweep.since).toBe(SINCE);
    // the money assertion: no record for a day that predates the desk, and no ESPN read for it
    expect(fr.ledger().map((e) => e.date)).toEqual([SINCE]);
    expect(vi.mocked(espnEvents).mock.calls.map((c) => c[0])).toEqual([SINCE]);
  });

  it("DEFECT 3: a TWO-DAY gap gets BOTH records — the Saturday that carries the money is never silent", async () => {
    setNow(WIN_NOW);
    const seeded = deviceEntry(SINCE); // the walk stops here: this date already carries an entry
    const fr = fakeRedis({ [CFB_REDIS.ledger]: JSON.stringify({ ledger: [seeded], at: seeded.lockedAt }) });
    espnByDate({ [D3]: eventsFor(D3), [D2]: eventsFor(D2), [D1]: eventsFor(D1) });
    vi.mocked(slateFromEspn).mockImplementation(async (d, _e, now) => slateForDate(d, now));

    const { status, body } = await call(req());
    expect(status).toBe(200);
    expect(body.status).toBe("locked");
    expect(fr.ledger().map((e) => e.date).sort()).toEqual([SINCE, D1, D2, D3]);
    for (const d of [D1, D2]) {
      const y = fr.ledger().find((e) => e.date === d)!;
      expect(y.noPlay).toBe(true);
      expect(y.source).toBe("server-lock");
      expect(y.trigger).toBe(CFB_SWEEP_TRIGGER);
      expect(y.core).toEqual([]);
    }
    // the walk is reported day by day, newest first, and stops at the first recorded date
    expect(sweepDays(body).map((d) => [d.date, d.action])).toEqual([
      [D2, "recorded"],
      [D1, "recorded"],
      [SINCE, "already-recorded"],
    ]);
    // ...and the headline fields still describe YESTERDAY, as they always have
    expect(sweepOf(body).date).toBe(D2);
    expect(sweepOf(body).action).toBe("recorded");
  });

  it("A SWEPT-CLEAN HISTORY costs nothing: yesterday already recorded → the walk stops, zero ESPN reads for it", async () => {
    setNow(WIN_NOW);
    const seeded = deviceEntry(D2);
    const fr = fakeRedis({ [CFB_REDIS.ledger]: JSON.stringify({ ledger: [seeded], at: seeded.lockedAt }) });
    espnByDate({ [D3]: eventsFor(D3) }); // any swept-date fetch would throw
    vi.mocked(slateFromEspn).mockImplementation(async (d, _e, now) => slateForDate(d, now));
    const { status, body } = await call(req());
    expect(status).toBe(200);
    expect(sweepDays(body).map((d) => [d.date, d.action])).toEqual([[D2, "already-recorded"]]);
    expect(vi.mocked(espnEvents).mock.calls.map((c) => c[0])).toEqual([D3]); // today only
    expect(fr.sets().length).toBe(1);
  });

  it("THE READ BOUND: a fully silent history reads ESPN at most CFB_SWEEP_DAYS times, and never the Odds API", async () => {
    setNow(WIN_NOW);
    const fr = fakeRedis();
    espnByDate({ [D3]: eventsFor(D3), [D2]: eventsFor(D2), [D1]: eventsFor(D1), [SINCE]: eventsFor(SINCE) });
    vi.mocked(slateFromEspn).mockImplementation(async (d, _e, now) => slateForDate(d, now));
    const { body } = await call(req());
    const swept = vi.mocked(espnEvents).mock.calls.map((c) => c[0]).filter((d) => d !== D3);
    expect(swept.length).toBeLessThanOrEqual(cfbRulesMod.CFB_SWEEP_DAYS);
    expect(swept).toEqual([D2, D1, SINCE]);
    // the priced board — the only path to oddsPayload() — was built for TODAY and nobody else
    expect(vi.mocked(slateFromEspn).mock.calls.map((c) => c[0])).toEqual([D3]);
    expect(fr.ledger().map((e) => e.date).sort()).toEqual([SINCE, D1, D2, D3]);
    expect(sweepDays(body).length).toBe(3);
  });
});

/**
 * DEFECT 4 (verification pass, 2026-09-06) — THE SWEPT RECORD STATED A CAUSE THAT COULD BE FALSE.
 *
 * `buildCfbSweepEntry` appended "because no scheduler poke ever landed inside <date>'s lock
 * window". The odds-missing refusal (DEFECT 1 of the first review) manufactures exactly the day
 * where that is FALSE: pokes landed all day INSIDE the window and refused deliberately, for want
 * of a Caesars price. Josh reads that string directly under the locked card
 * (src/components/cfb/CfbBuilder.tsx renders `locked.note`), so a NO-PLAY that lies about its
 * cause points the post-mortem at the ticker instead of at the odds feed.
 *
 * The fix: the refusal leaves a dated marker in the CFB Redis namespace (`pl:cfb:oddsgap:v1:<date>`,
 * short EX), and the sweep reads it to choose between the two causes — each with its own note AND
 * its own trigger, so the two stay apart on the ledger forever.
 */
describe("DEFECT 4 (2026-09-06) — a swept day states the cause it can actually prove", () => {
  const A = "2026-09-06"; // the day lost to the outage
  const B = "2026-09-07"; // the next morning's poke
  const A_WINDOW = T("2026-09-06T15:00:00Z"); // 08:00 PT on A, inside A's lock window
  const B_WINDOW = T("2026-09-07T15:00:00Z"); // 08:00 PT on B
  const scoresOnly = (d: string, now: number): CfbSlate => {
    const board = buildCfbBoard({ date: d, espnEvents: eventsFor(d), oddsEvents: [], fpi: FPI, now, bankroll: 2500 });
    return { ...board, finals: finalsOf(board.games), quota: { remaining: null, used: null }, oddsMissing: true };
  };

  it("AN ALL-DAY ODDS OUTAGE, driven through the date rollover: the sweep says the odds feed, not the ticker", async () => {
    // ── day A: every poke lands inside the window and refuses for want of a Caesars price ──
    setNow(A_WINDOW);
    const seeded = deviceEntry(CFB_PAPER.since); // the walk stops at the desk's first day
    const fr = fakeRedis({ [CFB_REDIS.ledger]: JSON.stringify({ ledger: [seeded], at: seeded.lockedAt }) });
    espnByDate({ [A]: eventsFor(A), [CFB_PAPER.since]: eventsFor(CFB_PAPER.since) });
    vi.mocked(slateFromEspn).mockImplementation(async (d, _e, now) => scoresOnly(d, now));
    const first = await call(req());
    expect(first.status).toBe(502);
    expect(first.body.status).toBe("odds-missing");
    expect(fr.ledger().map((e) => e.date)).toEqual([CFB_PAPER.since]); // nothing written for A
    /* The refusal left its dated marker, so tomorrow's sweep can tell WHY the day was lost.
       Read through `markers()` (2026-09-06): the helper was written for exactly this assertion
       and its comment claimed this role, but the test then re-rolled the filter by hand, so the
       helper was dead code making a claim nothing checked. It also pins the COUNT, which the
       hand-rolled `find` could not: a poke that refuses stamps ONE marker, not one per game and
       not one per retry. */
    expect(fr.markers(), "the odds-missing refusal must leave exactly one dated marker").toHaveLength(1);
    const marker = fr.markers()[0];
    expect(marker[1]).toBe(`pl:cfb:oddsgap:v1:${A}`);
    expect(marker[3]).toBe("EX"); // it expires on its own — a marker, not a record
    expect(fr.sets()).toHaveLength(0); // ...and the marker is emphatically NOT a ledger write

    // ── day B, 08:00 PT: the sweep records A and names the real cause ──
    setNow(B_WINDOW);
    espnByDate({ [B]: eventsFor(B), [A]: eventsFor(A), [CFB_PAPER.since]: eventsFor(CFB_PAPER.since) });
    vi.mocked(slateFromEspn).mockImplementation(async (d, _e, now) => slateForDate(d, now));
    const { status, body } = await call(req());
    expect(status).toBe(200);
    expect(body.status).toBe("locked");
    const y = fr.ledger().find((e) => e.date === A)!;
    expect(y.noPlay).toBe(true);
    expect(y.source).toBe("server-lock");
    expect(y.trigger).toBe("cfb-lock-sweep-odds"); // its own trigger, distinct forever
    expect(String(y.note)).toMatch(/poked inside its lock window/i);
    expect(String(y.note)).toMatch(/no Caesars price/i);
    expect(String(y.note)).not.toMatch(/no scheduler poke ever landed/i);
    expect(sweepDays(body)[0]).toMatchObject({ date: A, action: "recorded", cause: "odds-gap" });
    // day B priced normally, so it stamped no marker of its own — A's is still the only one
    expect(fr.markers().map((c) => c[1])).toEqual([`pl:cfb:oddsgap:v1:${A}`]);
  });

  it("A GENUINELY UN-POKED DAY still gets the ticker-gap record — the two shapes never blur", async () => {
    setNow(B_WINDOW);
    const seeded = deviceEntry(CFB_PAPER.since);
    const fr = fakeRedis({ [CFB_REDIS.ledger]: JSON.stringify({ ledger: [seeded], at: seeded.lockedAt }) });
    espnByDate({ [B]: eventsFor(B), [A]: eventsFor(A), [CFB_PAPER.since]: eventsFor(CFB_PAPER.since) });
    vi.mocked(slateFromEspn).mockImplementation(async (d, _e, now) => slateForDate(d, now));
    const { status, body } = await call(req());
    expect(status).toBe(200);
    const y = fr.ledger().find((e) => e.date === A)!;
    expect(y.trigger).toBe(CFB_SWEEP_TRIGGER);
    expect(String(y.note)).toMatch(/swept on the following day's poke/);
    expect(String(y.note)).not.toMatch(/no Caesars price/i);
    expect(sweepDays(body)[0]).toMatchObject({ date: A, action: "recorded", cause: "no-lock" });
    // and the note never asserts a cause it cannot prove: it states what IS known
    expect(String(y.note)).not.toMatch(/because no scheduler poke ever landed/);
  });
});

/**
 * DEFECT 5 (verification pass, 2026-09-06) — cfbPricedAhead WAS LOOSER THAN THE CARD'S OWN FILTER.
 *
 * It counted any row with `cz != null` on a game whose start is in the future. `buildCfbCard`
 * requires more: src/lib/cfb/card.ts keeps `r.playable && r.cz != null && r.evCz != null`, and
 * src/lib/cfb/model.ts sets `playable = !!sq.cz && upcoming`, where `upcoming` ALSO demands
 * `game.status === "upcoming"`. So a game ESPN flags live or final on a future start — postponed
 * or mislabeled events, which ESPN does produce — inflated `pricedAhead`, suppressed the
 * odds-missing refusal, and let the route lock a NO-PLAY it described as the genuine no-bet kind.
 * That is the exact misdiagnosis the refusal was written to prevent, and it was PERMANENT,
 * because every later poke exits already-locked.
 */
describe("DEFECT 5 (2026-09-06) — cfbPricedAhead counts exactly the rows buildCfbCard would consider", () => {
  const LIVE_TEAM = "Alabama Crimson Tide";
  /** the ESPN payload with one future-start game flagged IN PROGRESS — what a mislabeled or
      postponed event looks like coming off the scoreboard feed */
  const mislabeled = () =>
    (JSON.parse(JSON.stringify(ESPN.events)) as Record<string, any>[]).map((e) => {
      const names = (e.competitions[0].competitors as Record<string, any>[]).map((c) => c.team.displayName);
      if (!names.includes(LIVE_TEAM)) return e;
      e.status.type = { ...e.status.type, name: "STATUS_IN_PROGRESS", state: "in", completed: false };
      return e;
    });
  /** ...and it is the ONLY game the odds feed quoted, so it is the whole of the day's pricing */
  const onlyLiveQuoted = ODDS.filter((o) => {
    const e = o as { home_team?: string; away_team?: string };
    return e.home_team === LIVE_TEAM || e.away_team === LIVE_TEAM;
  });
  const trapSlate = (now: number): CfbSlate => {
    const board = buildCfbBoard({ date: DATE, espnEvents: mislabeled(), oddsEvents: onlyLiveQuoted, fpi: FPI, now, bankroll: 2500 });
    return { ...board, finals: finalsOf(board.games), quota: { remaining: 9000, used: 1000 }, oddsMissing: false };
  };

  it("the trap is real: a future-start game ESPN calls live, Caesars-quoted, and the day's only quoted game", () => {
    const s = trapSlate(LOCKS_AT);
    const live = s.games.filter((g) => g.status === "live");
    expect(live.length).toBe(1);
    expect(Date.parse(live[0].start)).toBeGreaterThan(LOCKS_AT);
    expect(live[0].rows.some((r) => r.cz != null)).toBe(true); // Caesars quoted it
    expect(live[0].rows.every((r) => r.playable === false)).toBe(true); // the card will not touch it
    const others = s.games.filter((g) => g.id !== live[0].id);
    expect(others.flatMap((g) => g.rows.filter((r) => r.cz != null)).length).toBe(0);
    // and buildCfbCard finds nothing at all — the day genuinely cannot be priced
    expect(buildCfbCard(s as CfbBoard, { bankroll: 2500, daily: CFB_PAPER.daily, fun: CFB_PAPER.fun, now: LOCKS_AT }).noPlay).toBe(true);
  });

  it("cfbPricedAhead is ZERO on that slate — a live-flagged game is not a priceable game", () => {
    expect(cfbPricedAhead(trapSlate(LOCKS_AT).games, LOCKS_AT)).toBe(0);
  });

  it("THE POINT: the route refuses, instead of locking a NO-PLAY it would call genuine", async () => {
    vi.mocked(espnEvents).mockResolvedValue(mislabeled());
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => trapSlate(now));
    const fr = fakeRedis();
    const { status, body } = await call();
    expect(status).toBe(502);
    expect(body.status).toBe("odds-missing");
    expect(body.pricedAhead).toBe(0);
    expect(body.ahead).toBe(12);
    expect(fr.sets().length).toBe(0);
    expect(fr.ledger()).toEqual([]);
  });
});

/**
 * DEFECT 6 (verification pass, 2026-09-06) — NO maxDuration.
 *
 * The route declared only `dynamic = "force-dynamic"`. Every peer declares a duration (verified
 * 2026-09-06: scheduler 90, generate 300, sharp 300, calibrate 60, clv 60, propsnap 60,
 * ufcprops 60). This route does 2+ Redis GETs, the sweep's ESPN reads, `espnEvents` (2 fetches),
 * `slateFromEspn` (FPI + odds in parallel), the card build, then a Redis GET + SET — on a slow
 * upstream the platform default can kill the callee before the caller's 25 000 ms
 * `CFB_LOCK.forwardTimeoutMs` ever binds.
 */
describe("DEFECT 6 (2026-09-06) — the route declares how long it may run", () => {
  it("maxDuration is declared, sized above the caller's abort so the CALLER's timeout is the binding one", () => {
    expect(lockRouteMod.maxDuration).toBe(60);
    expect(lockRouteMod.maxDuration * 1000).toBeGreaterThan(CFB_LOCK.forwardTimeoutMs);
    expect(readSrc("app/api/cfb/lock/route.ts")).toMatch(/export const maxDuration = 60/);
  });
});

/**
 * THE MONEY GUARD (verification pass, 2026-09-06). This route writes unattended, daily, with no
 * operator watching. `buildCfbLockEntry` validated only with `validateCfbLedger`, which checks
 * ledger SHAPE and the sport tag — nothing checked the MONEY. A card summing $200 of core, a $40
 * ticket past `CFB_RULES.maxStake`, or an $80 fun parlay would serialize cleanly and be written.
 *
 * MLB puts this check where it can fire: src/lib/server/lock-card.ts `buildLockEntry` re-reads
 * each pick's stake at assembly and THROWS on a mismatch, printing both numbers, under the
 * docblock "a crash, never a quietly wrong card". This is the CFB equivalent.
 */
describe("THE MONEY GUARD (2026-09-06) — a skewed card crashes; it is never written", () => {
  const realCard = () => buildCfbCard(slateAt(LOCKS_AT) as CfbBoard, { bankroll: 2500, daily: CFB_PAPER.daily, fun: CFB_PAPER.fun, now: LOCKS_AT });
  const guard = (card: CfbCard) => () => lockServerMod.assertCfbCardMoney(card);

  it("the honest card passes untouched", () => {
    const card = realCard();
    expect(card.core.length).toBeGreaterThan(0);
    expect(guard(card)).not.toThrow();
  });

  it("core over the day's $250: throws, printing BOTH numbers", () => {
    const card = realCard();
    const t = { ...card.core[0], stake: CFB_RULES.maxStake };
    const core = Array.from({ length: 7 }, (_, i) => ({ ...t, id: `${t.id}-p${i}` })); // 7 × $50 = $350 (2026-09-08: was 7 × $25 = $175 over $150)
    expect(core.reduce((s, x) => s + x.stake, 0)).toBe(350);
    expect(guard({ ...card, core })).toThrow(/350/);
    expect(guard({ ...card, core })).toThrow(/250/);
  });

  it("a core ticket outside the $5–$50 band: throws, printing BOTH numbers", () => {
    const card = realCard();
    const core = [{ ...card.core[0], stake: 60 }]; // 2026-09-08: $40 is inside the widened band, $60 is not
    expect(guard({ ...card, core })).toThrow(/60/);
    expect(guard({ ...card, core })).toThrow(new RegExp(String(CFB_RULES.maxStake)));
    expect(guard({ ...card, core: [{ ...card.core[0], stake: 1 }] })).toThrow(new RegExp(String(CFB_RULES.minStake)));
  });

  it("fun money over the day's $25: throws, printing BOTH numbers", () => {
    const card = realCard();
    const funT = [{ ...card.core[0], id: "fun-skew", bucket: "fun" as const, stake: 80 }];
    expect(guard({ ...card, funT })).toThrow(/80/);
    expect(guard({ ...card, funT })).toThrow(/25/);
  });

  it("more core tickets than CFB_RULES.tickets.max: throws, printing BOTH numbers", () => {
    const card = realCard();
    const t = { ...card.core[0], stake: CFB_RULES.minStake };
    const core = Array.from({ length: CFB_RULES.tickets.max + 1 }, (_, i) => ({ ...t, id: `${t.id}-n${i}` }));
    expect(guard({ ...card, core })).toThrow(new RegExp(`${CFB_RULES.tickets.max + 1}`));
    expect(guard({ ...card, core })).toThrow(new RegExp(`${CFB_RULES.tickets.max}`));
  });

  it("THE POINT: a skewed card planted into the route is a 502, and NOTHING is written", async () => {
    const fr = fakeRedis();
    vi.mocked(buildCfbCard).mockImplementationOnce((board, opts) => {
      const card = cardReal.build!(board, opts);
      const t = { ...card.core[0], stake: CFB_RULES.maxStake };
      return { ...card, core: Array.from({ length: 7 }, (_, i) => ({ ...t, id: `${t.id}-p${i}` })) };
    });
    const { status, body } = await call();
    expect(status).toBe(502);
    expect(String(body.error)).toMatch(/lock build failed/);
    expect(String(body.error)).toMatch(/350/);
    expect(String(body.error)).toMatch(/250/);
    expect(fr.sets().length).toBe(0);
    expect(fr.ledger()).toEqual([]);
  });
});

/* ==========================================================================================
 * INSTRUCTION 45, THE OTHER HALF (2026-09-06). Josh, verbatim: "Parlay Lab CFB should've been
 * running the same $150 per day theoretical Core money and $25 Fun money per day".
 *
 * "THE SAME" is what the MLB desk does, and the CFB lock was doing only the first half of it:
 *   A. THE TOP-UP.  buildCfbCard cannot always deploy $150 and says so — this very fixture
 *      locks $75 in three $25 singles with the note "$75 of the $150 stayed undeployed"
 *      (docs/cfb-desk.md records it). The lock fires an hour before the FIRST kickoff, which is
 *      exactly when the pool is thinnest, and every later poke hit the already-locked exit and
 *      returned. The day ended permanently short while the ledger recorded it as a full paper
 *      day. MLB solved this on Josh's word (src/lib/paper-mode.ts TOPUP_MAX, quoting him: "I
 *      said $150 every day no matter what so we could track and calibrate off of it").
 *   B. THE SETTLE PASS.  Nothing settled a server-locked CFB day: the whole grading chain is
 *      browser-only (gradeCfbEntry ← gradeCfb ← gradeCfbPending ← the Ledger tab's button), and
 *      the scheduler's grading tick forwards to /api/calibrate?grade=only, which has no CFB code.
 *      So cfbLedgerStats reported 0-0 forever and cfbBankroll stayed pinned at CFB_BANK_BASE —
 *      every later day Kelly-sized off a bankroll that could never move.
 * ======================================================================================== */

/** the three fixture games the first server lock stakes (measured: $25 each, $75 of the $150) */
const LOCK_GAMES = ["401858425", "401856634", "401856780"];

/**
 * The fixture slate with a +6% Caesars side on each named game — the evening lines that post
 * AFTER the morning lock, which is the entire reason a top-up exists. Only rows the card would
 * already consider are lifted (playable, Caesars-quoted, decimal ≤ CFB_RULES.maxDec), so nothing
 * here invents a price: it moves the model's EV on a real posted quote.
 */
function richerSlate(now: number, extra: string[]): CfbSlate {
  const s = slateAt(now);
  return {
    ...s,
    games: s.games.map((g) =>
      extra.includes(g.id) ? { ...g, rows: g.rows.map((r) => (r.playable && r.cz != null && r.cz.dec <= CFB_RULES.maxDec ? { ...r, evCz: 6 } : r)) } : g,
    ),
  };
}

/** a SERVER-locked day staked exactly as asked, one single per game — the shape /api/cfb/lock writes */
function serverEntry(date: string, opts: { stakes: number[]; games: string[]; lockedAt: number; fun?: number; topUps?: unknown[] }): CfbLedgerEntry {
  const ticket = (stake: number, gkey: string, id: string, bucket: "core" | "fun") => ({
    id,
    bucket,
    name: `SINGLE · seeded ${gkey}`,
    stake,
    czOdds: -110,
    czDec: 1.9091,
    prob: 52,
    czEv: 1,
    legs: [
      { label: `seeded ${gkey}`, prop: "Spread", cz: -110, gkey, lkey: `${gkey}|spread|home|-3`, market: "spread" as const, side: "home" as const, line: -3, teamId: null, prob: 0.52, push: 0 },
    ],
  });
  const e: CfbLedgerEntry = {
    sport: "cfb",
    date,
    locked: true,
    daily: CFB_PAPER.daily,
    fun: CFB_PAPER.fun,
    core: opts.stakes.map((s, i) => ticket(s, opts.games[i], `cfb-${date}-core-${i + 1}`, "core")),
    funT: opts.fun ? [ticket(opts.fun, opts.games[0], `cfb-${date}-fun-1`, "fun")] : [],
    lockedAt: opts.lockedAt,
    source: "server-lock",
    trigger: "cfb-lock",
    note: "locked by the server before the first kickoff — 12 games on the slate",
    games: Object.fromEntries(opts.games.map((g, i) => [g, { pk: Number(g), start: new Date(FIRST_KICK + i).toISOString(), home: "H", away: "A" }])),
    grading: null,
  };
  if (opts.topUps) (e as Record<string, unknown>).topUps = opts.topUps;
  return e;
}

const seed = (entries: CfbLedgerEntry[]) => fakeRedis({ [CFB_REDIS.ledger]: JSON.stringify({ ledger: entries, at: entries[0].lockedAt }) });
const topUpOf = (body: Record<string, unknown>) => body.topUp as Record<string, unknown>;
const coreStakeOf = (e: CfbLedgerEntry) => e.core.reduce((s, t) => s + t.stake, 0);

describe("A. THE TOP-UP (2026-09-06) — the $250 must deploy, not just be intended", () => {
  it("the cap is a constant beside CFB_LOCK, mirroring the MLB desk's TOPUP_MAX", () => {
    expect(cfbRulesMod.CFB_TOPUP_MAX).toBe(2);
    // ...and the gap it exists to close is real on this very fixture
    expect(
      buildCfbCard(slateAt(LOCKS_AT) as CfbBoard, { bankroll: 2500, daily: CFB_PAPER.daily, fun: CFB_PAPER.fun, now: LOCKS_AT }).coreSum,
    ).toBe(150); // 2026-09-08: three $50 singles of the $250 (was three $25 of the $150)
  });

  it("A THIN SLATE LOCKS UNDER $250 AND A LATER POKE TOPS IT UP — to exactly the $250", async () => {
    const fr = fakeRedis();
    const first = await call();
    expect(first.body.status).toBe("locked");
    expect(first.body.coreStake).toBe(150);
    const locked = fr.ledger()[0];
    expect(locked.core.length).toBe(3);

    // 15 minutes later the evening lines are up on three more games
    setNow(LOCKS_AT + 15 * 60_000);
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => richerSlate(now, ["401858430", "401862701", "401869960"]));
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.status).toBe("already-locked");
    const t = topUpOf(body);
    expect(t.action).toBe("topped-up");
    expect(t.n).toBe(1);
    expect(t.core).toBe(3); // 2026-09-08: the three evening singles split the $100 of room (was three $25 into $75 of room)
    expect(t.stake).toBe(100);
    expect(t.coreStake).toBe(250);

    const e = fr.ledger()[0];
    expect(coreStakeOf(e)).toBe(CFB_PAPER.daily);
    expect(e.core.length).toBe(6);
    expect(e.core.length).toBeLessThanOrEqual(CFB_RULES.tickets.max);
    // the original three tickets are untouched, byte for byte — a top-up never re-stakes or lowers
    expect(e.core.slice(0, 3)).toEqual(locked.core);
    expect(e.lockedAt).toBe(locked.lockedAt);
    expect(e.source).toBe("server-lock");
    // no id collides, every stake is in the band, and no game is staked twice
    expect(new Set(e.core.map((x) => x.id)).size).toBe(6);
    for (const x of e.core) {
      expect(x.stake).toBeGreaterThanOrEqual(CFB_RULES.minStake);
      expect(x.stake).toBeLessThanOrEqual(CFB_RULES.maxStake);
    }
    const gkeys = e.core.flatMap((x) => x.legs.map((l) => l.gkey));
    expect(new Set(gkeys).size).toBe(gkeys.length);
    expect(gkeys.slice(0, 3).sort()).toEqual([...LOCK_GAMES].sort());
    // every appended leg's game is in the entry's games snapshot — the grader keys off it
    for (const x of e.core) for (const l of x.legs) expect(e.games[l.gkey]).toBeDefined();
    // and the entry says a top-up ran, when, and how much it added
    expect((e as Record<string, unknown>).topUps).toHaveLength(1);
    expect(String(e.note)).toMatch(/Top-up 1/);
    expect(String(e.note)).toMatch(/\$100/);
  });

  it("THE CAP refuses the third attempt, even with money still owed", async () => {
    /* 2026-09-08: the fixture's own lock is now $150 of the $250, and every evening single is
       raised to the $50 max, so two top-ups off the real lock would FILL the day and the third
       poke would answer "fully deployed" instead of the cap. The seeded $75 lock keeps the case
       what it is: two attempts spent, $75 still owed, the cap is what refuses. */
    const fr = seed([serverEntry(DATE, { stakes: [25, 25, 25], games: LOCK_GAMES, lockedAt: LOCKS_AT, fun: CFB_PAPER.fun })]);
    const rounds = [
      { at: 5, extra: ["401866410"], stake: 50, total: 125 },
      { at: 10, extra: ["401858430"], stake: 50, total: 175 },
    ];
    for (const [i, r] of rounds.entries()) {
      setNow(LOCKS_AT + r.at * 60_000);
      vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => richerSlate(now, r.extra));
      const { body } = await call();
      expect(topUpOf(body).action).toBe("topped-up");
      expect(topUpOf(body).n).toBe(i + 1);
      expect(coreStakeOf(fr.ledger()[0])).toBe(r.total);
    }
    // a third poke: $75 is still owed and a fresh game is priced, but the cap is spent
    setNow(LOCKS_AT + 20 * 60_000);
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => richerSlate(now, ["401862701"]));
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(topUpOf(body).action).toBe("skipped");
    expect(String(topUpOf(body).reason)).toMatch(/cap/i);
    expect(coreStakeOf(fr.ledger()[0])).toBe(175);
    expect((fr.ledger()[0] as Record<string, unknown>).topUps).toHaveLength(cfbRulesMod.CFB_TOPUP_MAX);
  });

  it("A DEVICE (Builder) LOCK IS NEVER TOPPED UP — Josh's own card is his, and it costs no fetch", async () => {
    const dev = deviceEntry(DATE);
    const fr = seed([dev]);
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.status).toBe("already-locked");
    expect(body.source).toBe("device");
    expect(topUpOf(body).action).toBe("skipped");
    expect(String(topUpOf(body).reason)).toMatch(/device|Builder/i);
    expect(fr.sets().length).toBe(0);
    expect(espnEvents).not.toHaveBeenCalled();
    expect(slateFromEspn).not.toHaveBeenCalled();
    expect(fr.ledger()).toEqual([dev]);
  });

  it("A DAY ALREADY AT $250 is untouched and issues no rebuild at all", async () => {
    const full = serverEntry(DATE, { stakes: [50, 50, 50, 50, 50], games: slateAt(LOCKS_AT).games.slice(0, 5).map((g) => g.id), lockedAt: LOCKS_AT, fun: 25 });
    expect(coreStakeOf(full)).toBe(250);
    const fr = seed([full]);
    setNow(LOCKS_AT + 15 * 60_000);
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(topUpOf(body).action).toBe("skipped");
    expect(String(topUpOf(body).reason)).toMatch(/fully deployed/i);
    expect(fr.sets().length).toBe(0);
    expect(espnEvents).not.toHaveBeenCalled();
    expect(slateFromEspn).not.toHaveBeenCalled();
  });

  it("A TOP-UP AFTER EVERY GAME HAS KICKED OFF does nothing, and never pays for a priced board", async () => {
    const fr = fakeRedis();
    await call();
    setNow(LAST_KICK + 60_000);
    vi.mocked(slateFromEspn).mockClear();
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(topUpOf(body).action).toBe("skipped");
    expect(String(topUpOf(body).reason)).toMatch(/kicked off/i);
    expect(slateFromEspn).not.toHaveBeenCalled();
    expect(coreStakeOf(fr.ledger()[0])).toBe(150);
  });

  /**
   * PIN REWRITTEN 2026-09-06 (INSTRUCTION 45, DEFECT M). This test was
   *
   *   it("TWO OVERLAPPING POKES CANNOT PUSH THE TOTAL PAST $150 — the write block re-reads and
   *      backs off")
   *
   * and it asserted, on the poke that lost the race:
   *
   *   expect(topUpOf(body).action).toBe("skipped");
   *   expect(topUpOf(body).raced).toBe(true);
   *   expect(coreStakeOf(fr.ledger()[0])).toBe(CFB_PAPER.daily);
   *   expect(fr.ledger()[0].core.length).toBe(6);
   *   expect(fr.sets().length).toBe(2);
   *
   * It encoded the OLD rule — ONE gate, computed from the core alone, so a day the winner had
   * pushed to the full $150 refused the loser outright. Under the new rule the two allotments are
   * INDEPENDENT (DEFECT M(a)): the racing writer's card carries $150 of core and an EMPTY fun
   * bucket, so the loser is refused on the CORE arm and fires on the FUN arm, seating the day's
   * first $25 parlay. `action` therefore flips from "skipped"/`raced` to "topped-up", and the
   * writes go from 2 to 3.
   *
   * THIS IS A REWRITE, NOT A LOOSENING. The assertion the test existed for — that two overlapping
   * pokes cannot push the day past its allotment — is kept CHARACTER FOR CHARACTER below
   * (`coreStakeOf(...) === CFB_PAPER.daily`, six core tickets, the winner's card untouched) and is
   * now made TWICE, once per bucket: the fun side gains exactly one parlay and exactly $25, never
   * two and never more. What changed is only which of the two allotments the loser was able to
   * serve, which is the behaviour Josh asked for and this desk was not delivering.
   */
  it("TWO OVERLAPPING POKES CANNOT PUSH EITHER ALLOTMENT PAST ITS OWN LIMIT — the write block re-reads and re-decides", async () => {
    const fr = fakeRedis();
    await call();
    setNow(LOCKS_AT + 15 * 60_000);
    // another poke's top-up lands (bringing the day to $150) while this one is pricing its board
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => {
      const cur = fr.ledger();
      if (coreStakeOf(cur[0]) < CFB_PAPER.daily) {
        const other = serverEntry(DATE, { stakes: [50, 50, 50, 50, 50], games: slateAt(now).games.slice(0, 5).map((g) => g.id), lockedAt: LOCKS_AT, topUps: [{ at: now, core: 2, stake: 100 }] });
        fr.kv.set(CFB_REDIS.ledger, JSON.stringify({ ledger: [other], at: now }));
      }
      return richerSlate(now, ["401858430", "401862701", "401869960"]);
    });
    const { status, body } = await call();
    expect(status).toBe(200);
    /* THE CORE HALF, unchanged and still the point: the winner's $150 stands, the loser adds no
       core money to it, and the six tickets on the day are the winner's card, not this poke's. */
    expect(coreStakeOf(fr.ledger()[0])).toBe(CFB_PAPER.daily);
    expect(fr.ledger()[0].core.length).toBe(5);
    expect(topUpOf(body).core).toBe(0);
    expect(topUpOf(body).stake).toBe(0);
    /* THE FUN HALF, the same rule on the other allotment: the loser serves the bucket the winner
       left empty, and it may put EXACTLY one parlay and EXACTLY $25 on it — never a second. */
    expect(topUpOf(body).action).toBe("topped-up");
    expect(topUpOf(body).buckets).toEqual({ core: false, fun: true });
    const day = fr.ledger()[0];
    expect(day.funT).toHaveLength(1);
    expect(day.funT.reduce((s, t) => s + t.stake, 0)).toBe(CFB_PAPER.fun);
    const allIds = [...day.core, ...day.funT].map((t) => t.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    /* PIN REWRITTEN 2026-09-06 (CRITIC 1), from 1 to 2, because the behaviour deliberately
       changed: an attempt now CLAIMS its record before it buys a priced board, so a poke that
       gets as far as pricing always writes exactly one zero-money row, and only then either
       fills it in or backs off. REWRITTEN AGAIN 2026-09-06 (DEFECT M), from 2 to 3: the loser no
       longer backs off, it seats the fun parlay, so the claim is followed by the top-up write.
       The claim itself is unchanged and is still asserted below — it carries no money at all,
       and it now says so in the row rather than leaving `core: 0` to be read as a claim: */
    expect(fr.sets().length).toBe(3);
    const claimed = (JSON.parse(String(fr.sets()[1][2])) as { ledger: CfbLedgerEntry[] }).ledger.find((e) => e.date === DATE)!;
    /* PIN REWRITTEN 2026-09-06 (INSTRUCTION 45, L1): the claim row gained an explicit `arms`,
       saying which allotment's attempt budget the board it is about to buy is charged to. This is
       an exact-shape `toEqual`, so the new field is ADDED to the expected row rather than the
       assertion being relaxed to `toMatchObject` — the row's shape IS the cap's invariant and the
       pin still states every field of it, including the two booleans that now decide whether a
       later poke may still fire. Not a loosening: the assertion is the same kind, over the same
       row, with one more field pinned than before. */
    /* the arms are the WINNER'S: this is `sets()[1]`, the first claim written on the date, and the
       winner opened on a short core over a fun bucket the lock had already filled. That the row
       says `fun: false` is exactly why the loser is still allowed to serve the bucket below. */
    expect(topUpsOn(claimed)).toEqual([{ at: LOCKS_AT + 15 * 60_000, n: 1, core: 0, stake: 0, filled: false, arms: { core: true, fun: false } }]);
    expect(coreStakeOf(claimed)).toBe(150); // the claim never touches the tickets
  });

  it("THE MONEY GUARD runs over the TOPPED-UP entry: a skewed top-up card is refused, nothing written", async () => {
    const fr = fakeRedis();
    await call();
    setNow(LOCKS_AT + 15 * 60_000);
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => richerSlate(now, ["401858430", "401862701", "401869960"]));
    vi.mocked(buildCfbCard).mockImplementationOnce((board, opts) => {
      const card = cardReal.build!(board, opts);
      return { ...card, core: card.core.map((t) => ({ ...t, stake: CFB_RULES.maxStake })) , coreSum: card.core.length * CFB_RULES.maxStake };
    });
    // two $50 tickets appended to a day already carrying $150 is $250 — legal; skew one past the band
    // (2026-09-08: $40 sits inside the widened $5–$50 band, so the skew is $60)
    vi.mocked(buildCfbCard).mockImplementationOnce((board, opts) => {
      const card = cardReal.build!(board, opts);
      return { ...card, core: card.core.map((t) => ({ ...t, stake: 60 })) };
    });
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.status).toBe("already-locked");
    expect(topUpOf(body).action).toBe("error");
    expect(String(topUpOf(body).error)).toMatch(/MONEY GUARD/);
    expect(coreStakeOf(fr.ledger()[0])).toBe(150);
    /* PIN REWRITTEN 2026-09-06 (CRITIC 1), from 1 to 2 — same reason as the racing test above:
       the attempt claimed its record before it paid for the board it then refused to seat. The
       guard's contract is that NO MONEY was written, which is asserted on the line above and
       again here on the stored entry: the day still carries its $75 and three tickets, and the
       only thing the failed attempt left behind is the attempt itself.

       PIN REWRITTEN 2026-09-06 (DEFECT M(b)): the claim row gained an explicit `filled: false`.
       This is an exact-shape assertion, so the new field is ADDED to it rather than the assertion
       being relaxed to `toMatchObject` — the row's shape is the cap's invariant and the pin still
       states every field of it. Nothing else about this case changed: the guard threw, and the
       attempt that paid for the board it refused to seat is the only trace left. */
    expect(fr.sets().length).toBe(2);
    expect(fr.ledger()[0].core).toHaveLength(3);
    /* PIN REWRITTEN 2026-09-06 (INSTRUCTION 45, L1): the claim row gained an explicit `arms`,
       saying which allotment's attempt budget the board it is about to buy is charged to. This is
       an exact-shape `toEqual`, so the new field is ADDED to the expected row rather than the
       assertion being relaxed to `toMatchObject` — the row's shape IS the cap's invariant and the
       pin still states every field of it, including the two booleans that now decide whether a
       later poke may still fire. Not a loosening: the assertion is the same kind, over the same
       row, with one more field pinned than before. */
    expect(topUpsOn(fr.ledger()[0])).toEqual([{ at: LOCKS_AT + 15 * 60_000, n: 1, core: 0, stake: 0, filled: false, arms: { core: true, fun: false } }]);
  });

  it("dry=1 reports what it would add and writes nothing", async () => {
    const fr = fakeRedis();
    await call();
    setNow(LOCKS_AT + 15 * 60_000);
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => richerSlate(now, ["401858430", "401862701", "401869960"]));
    const { status, body } = await call(req({ dry: true }));
    expect(status).toBe(200);
    expect(topUpOf(body).action).toBe("would-top-up");
    expect(topUpOf(body).stake).toBe(100);
    expect(fr.sets().length).toBe(1);
    expect(coreStakeOf(fr.ledger()[0])).toBe(150);
  });
});

/**
 * B. SERVER-SIDE GRADING (2026-09-06). The route already fetches `espnEvents(date)`, and
 * `finalsFromEspn` turns that same KEYLESS payload into the finals map with no Odds credit, so
 * settling a day costs at most one extra ESPN scoreboard read and zero quota.
 */
describe("B. THE SETTLE PASS (2026-09-06) — a server-locked day scores without Josh opening the app", () => {
  const NEXT = "2026-09-06";
  const NEXT_MORNING = T("2026-09-06T15:00:00Z");
  /** the fixture events for `d`, every game FINAL with a real score — what ESPN serves after the day */
  const finalEventsFor = (d: string, missingScoreFor: string[] = []) =>
    (eventsFor(d) as Record<string, any>[]).map((e) => {
      const type = { name: "STATUS_FINAL", state: "post", completed: true, detail: "Final", shortDetail: "Final" };
      e.status = { ...e.status, type };
      e.competitions[0].status = { ...e.competitions[0].status, type };
      for (const c of e.competitions[0].competitors as Record<string, any>[]) {
        c.score = missingScoreFor.includes(String(e.id)) ? null : c.homeAway === "home" ? "31" : "17";
      }
      return e;
    });

  it("THE KEYS MATCH: a server-lock entry's games map is keyed exactly the way finalsFromEspn keys its finals", () => {
    const entry = buildCfbLockEntry(slateAt(LOCKS_AT), { now: LOCKS_AT, bankroll: 2500, ahead: 12, total: 12, firstKickoff: FIRST_KICK }).entry;
    const { finals } = finalsFromEspn(DATE, finalEventsFor(DATE), LAST_KICK + 6 * 3600_000, 2500);
    expect(Object.keys(entry.games).length).toBeGreaterThan(0);
    for (const gkey of Object.keys(entry.games)) expect(finals[gkey], `finals must carry ${gkey}`).toBeDefined();
    for (const t of [...entry.core, ...entry.funT]) for (const l of t.legs) expect(finals[l.gkey]).toBeDefined();
  });

  it("A LOCKED DAY WHOSE GAMES HAVE ALL FINALED IS SETTLED BY A LATER POKE — and the record starts scoring", async () => {
    const fr = fakeRedis();
    expect((await call()).body.status).toBe("locked");
    const before = fr.ledger()[0];
    expect(before.grading).toBeNull();
    expect(cfbLedgerStats([before], "core").w + cfbLedgerStats([before], "core").l).toBe(0);

    setNow(NEXT_MORNING);
    espnByDate({ [NEXT]: [], [DATE]: finalEventsFor(DATE) });
    const { status, body } = await call(req()); // the scheduler's own poke: no ?date
    expect(status).toBe(200);
    expect(body.date).toBe(NEXT);
    const s = body.settle as Record<string, unknown>;
    expect(s.reads).toBe(1);
    expect(s.wrote).toBe(true);
    expect((s.days as Record<string, unknown>[])[0]).toMatchObject({ date: DATE, action: "settled", done: true });

    const after = fr.ledger().find((e) => e.date === DATE)!;
    expect(after.grading).toBeTruthy();
    expect(after.grading!.done).toBe(true);
    expect(Object.keys(after.grading!.tickets).length).toBe(before.core.length + before.funT.length);
    // the stakes, tickets and lock instant are untouched — grading overlays, it never re-stakes
    expect(after.core).toEqual(before.core);
    expect(after.lockedAt).toBe(before.lockedAt);
    // ...and the two figures that were frozen forever now move
    const st = cfbLedgerStats([after], "core");
    expect(st.w + st.l).toBeGreaterThan(0);
    expect(cfbBankroll({ base: CFB_BANK_BASE, asOf: CFB_PAPER.since, log: [] }, [after])).not.toBe(CFB_BANK_BASE);
  });

  it("A DAY ALREADY GRADED is skipped and costs no ESPN read", async () => {
    const fr = fakeRedis();
    await call();
    /* FIXTURE ADDED 2026-09-06 (not a loosened assertion): the lock above is `call()` with an
       EXPLICIT ?date, so it reads DATE's own ESPN scoreboard to decide the window — a read that
       has nothing to do with settling and predates this capability. `espnByDate` replaces the
       implementation but keeps the call history, so without this clear the count below measures
       "the lock's read plus the settle's" and can never be 1. Cleared here so the assertion means
       exactly what it says: THE SETTLE PASS read this date once, and never reads it again. */
    vi.mocked(espnEvents).mockClear();
    setNow(NEXT_MORNING);
    espnByDate({ [NEXT]: [], [DATE]: finalEventsFor(DATE) });
    await call(req());
    const reads1 = vi.mocked(espnEvents).mock.calls.filter((c) => c[0] === DATE).length;
    expect(reads1).toBe(1);
    // the very next poke: the day is done, so it is never read again
    const { body } = await call(req());
    expect((body.settle as Record<string, unknown>).reads).toBe(0);
    expect(vi.mocked(espnEvents).mock.calls.filter((c) => c[0] === DATE).length).toBe(1);
    expect(fr.ledger().find((e) => e.date === DATE)!.grading!.done).toBe(true);
  });

  it("AN UNGRADABLE GAME (ESPN final, no score) leaves that ticket PENDING — never an invented result", async () => {
    const fr = fakeRedis();
    await call();
    const staked = fr.ledger()[0];
    const blind = staked.core[0].legs[0].gkey;
    setNow(NEXT_MORNING);
    espnByDate({ [NEXT]: [], [DATE]: finalEventsFor(DATE, [blind]) });
    const { body } = await call(req());
    expect((body.settle as Record<string, unknown>).wrote).toBe(true);
    const after = fr.ledger().find((e) => e.date === DATE)!;
    expect(after.grading!.tickets[staked.core[0].id].result).toBe("pending");
    expect(after.grading!.done).toBe(false);
    // ...while the tickets that DID final are settled
    expect(after.grading!.tickets[staked.core[1].id].result).not.toBe("pending");
  });

  it("A DEVICE ENTRY WITH RICHER GRADING IS NOT CLOBBERED — a settled result is never overwritten", async () => {
    const fr = fakeRedis();
    await call();
    const staked = fr.ledger()[0];
    // the phone graded one ticket already (and synced it up); the server must leave it alone
    const rich: CfbLedgerEntry = {
      ...staked,
      grading: { tickets: { [staked.core[0].id]: { result: "won", payout: 999, detail: "graded on the phone" } }, legs: {}, done: false },
    };
    fr.kv.set(CFB_REDIS.ledger, JSON.stringify({ ledger: [rich], at: staked.lockedAt }));
    setNow(NEXT_MORNING);
    espnByDate({ [NEXT]: [], [DATE]: finalEventsFor(DATE) });
    await call(req());
    const after = fr.ledger().find((e) => e.date === DATE)!;
    expect(after.grading!.tickets[staked.core[0].id]).toEqual({ result: "won", payout: 999, detail: "graded on the phone" });
    expect(after.grading!.tickets[staked.core[1].id].result).not.toBe("pending");
    expect(after.grading!.done).toBe(true);
  });

  it("A GRADING FAILURE leaves the poke's answer, its status code and its sweep untouched", async () => {
    const fr = fakeRedis();
    await call();
    setNow(NEXT_MORNING);
    espnByDate({ [NEXT]: [] }); // espnEvents(DATE) throws "unexpected espnEvents(2026-09-05)"
    const { status, body } = await call(req());
    expect(status).toBe(200);
    expect(body.status).toBe("no-slate");
    expect(sweepOf(body).action).toBe("already-recorded");
    const s = body.settle as Record<string, unknown>;
    expect((s.days as Record<string, unknown>[])[0].action).toBe("error");
    expect(String((s.days as Record<string, unknown>[])[0].error)).toMatch(/unexpected espnEvents\(2026-09-05\)/);
    expect(fr.ledger().find((e) => e.date === DATE)!.grading).toBeNull();
  });

  it("THE READ BOUND: at most CFB_SETTLE.maxDatesPerPoke ESPN reads per poke, and never the Odds API", async () => {
    expect(cfbRulesMod.CFB_SETTLE.maxDatesPerPoke).toBe(2);
    const games = slateAt(LOCKS_AT).games.map((g) => g.id);
    const older = ["2026-09-05", "2026-09-06", "2026-09-07"].map((d) =>
      serverEntry(d, { stakes: [25, 25, 25], games: games.slice(0, 3), lockedAt: T(`${d}T15:00:00Z`) }),
    );
    const fr = seed(older);
    setNow(T("2026-09-09T15:00:00Z"));
    /* FIXTURE ADDED 2026-09-06 (not a loosened assertion): the map named 09-06 and 09-07 but not
       09-05, while the expectation below reads ["2026-09-05","settled"] with reads === 2 and two
       days graded. The settle pass walks OLDEST FIRST — the oldest unscored day is the one whose
       absence has distorted the bankroll longest — so 2026-09-05 is the first date it reads, and
       an unmapped date makes espnByDate throw "unexpected espnEvents(2026-09-05)". The day's ESPN
       answer is supplied here, exactly like its two neighbours; every assertion below is untouched
       and still pins the same numbers and the same three actions. */
    espnByDate({ "2026-09-09": [], "2026-09-08": [], "2026-09-07": finalEventsFor("2026-09-07"), "2026-09-06": finalEventsFor("2026-09-06"), "2026-09-05": finalEventsFor("2026-09-05") });
    const { body } = await call(req());
    const s = body.settle as Record<string, unknown>;
    expect(s.reads).toBe(cfbRulesMod.CFB_SETTLE.maxDatesPerPoke);
    expect((s.days as Record<string, unknown>[]).map((d) => [d.date, d.action])).toEqual([
      ["2026-09-05", "settled"],
      ["2026-09-06", "settled"],
      ["2026-09-07", "deferred"],
    ]);
    // the priced board — the only path to the Odds API — was never built for a settled date
    expect(vi.mocked(slateFromEspn).mock.calls.length).toBe(0);
    expect(fr.ledger().filter((e) => e.grading?.done).length).toBe(2);
  });

  it("A DAY WHOSE GAMES HAVE NOT ALL FINISHED is not read at all", async () => {
    const fr = fakeRedis();
    await call();
    setNow(FIRST_KICK + 60 * 60_000); // one hour in: the day is live, nothing can be final
    espnByDate({ [DATE]: ESPN.events, "2026-09-04": [] });
    const { body } = await call(req());
    const s = body.settle as Record<string, unknown>;
    expect(s.reads).toBe(0);
    expect((s.days as Record<string, unknown>[])[0]).toMatchObject({ date: DATE, action: "immature" });
    expect(fr.ledger()[0].grading).toBeNull();
  });

  /**
   * L4 (2026-09-06) — THE SETTLE PASS HAD NO ?dry=1 PIN AT ALL, AND A MUTANT PROVED IT.
   *
   * MEASURED by the mutation sweep of this round: deleting the `!args.dry` conjunct from the
   * settle write gate in `settlePass` (app/api/cfb/lock/route.ts — the `if (!args.dry &&
   * attemptedDates.size)` block) SURVIVED the whole suite. This file's five other dry pins all sit
   * OUTSIDE the settle describe — they cover the lock branch, the odds-missing refusal, the sweep,
   * the top-up and the outage rollback — so nothing anywhere asserted that a dry poke leaves the
   * ledger alone once the settle pass has read a date.
   *
   * WHAT THAT COSTS IN PRODUCTION: `?dry=1` is reachable by hand with the cron secret, and the
   * contract of this route is that it writes NOTHING. With the conjunct gone, a dry probe over a
   * settle-eligible date takes the write branch — `verdicts` is empty on the dry path, so `same`
   * is true for every row and the map still returns `{ ...raw, attemptedAt: args.now }`, `touched`
   * flips, and the ledger blob is SET. So a probe silently rotates the settle queue's tier (and,
   * on a poke that did produce verdicts, would commit grading) while reporting itself as dry.
   *
   * The pin is the shape of the existing dry pin on the sweep ("dry=1 sweeps in dry too"): the
   * body must report what it WOULD record, and `fr.sets()` — the LEDGER writes — must not move.
   */
  it("dry=1 over a settle-eligible date REPORTS what it would record and writes NOTHING (L4)", async () => {
    const fr = fakeRedis();
    expect((await call()).body.status).toBe("locked");
    const before = fr.ledger()[0];
    expect(before.grading).toBeNull();
    const ledgerWrites = fr.sets().length; // the lock's own write, and nothing after it

    setNow(NEXT_MORNING);
    espnByDate({ [NEXT]: [], [DATE]: finalEventsFor(DATE) });
    const { status, body } = await call(req({ dry: true }));
    expect(status).toBe(200);
    expect(body.dry).toBe(true);

    /* IT READ, and it says what the verdict WOULD be — a dry probe reports exactly what a real
       poke would do, which is why the read is not suppressed */
    const s = body.settle as Record<string, unknown>;
    expect(s.reads).toBe(1);
    expect((s.days as Record<string, unknown>[])[0]).toMatchObject({ date: DATE, action: "would-settle", done: true });

    /* ...AND IT WROTE NOTHING: not the verdict, not `gradedAt`, not `attemptedAt`, not one SET */
    expect(s.wrote).toBe(false);
    expect(fr.sets().length).toBe(ledgerWrites);
    const after = fr.ledger().find((e) => e.date === DATE)!;
    expect(after.grading).toBeNull();
    expect((after as Record<string, unknown>).gradedAt).toBeUndefined();
    expect((after as Record<string, unknown>).attemptedAt).toBeUndefined();
    expect(after).toEqual(before);
  });
});

/* ==========================================================================================
 * THE MONEY-PATH CRITIC'S PASS (INSTRUCTION 45, 2026-09-06). Five defects found by reading the
 * hardened, green cut of /api/cfb/lock ADVERSARIALLY, each one measured with a probe before a
 * line of it was believed. They are numbered CRITIC 1-5 so they can never be confused with the
 * six defects of the verification pass above, which are numbered from the same 1.
 * ======================================================================================== */

/** the entry's own top-up log — the ledger blob is the only thing a cold start, a redeploy and
    an overlapping poke all share, which is why the bound lives there and not in a counter */
const topUpsOn = (e: CfbLedgerEntry) => ((e as Record<string, unknown>).topUps ?? []) as Record<string, unknown>[];

/**
 * CRITIC 1 — THE CAP BOUNDED SUCCESSFUL WRITES, SO A SHORT DAY BOUGHT A BOARD ON EVERY POKE.
 *
 * `CFB_TOPUP_MAX` was read off `cfbTopUpsOf(entry).length`, and a record was appended ONLY by
 * `applyCfbTopUp` — i.e. only when a top-up actually seated a ticket. On a day that stays short,
 * which is the COMMON case (this very fixture locks $75 of the $150 and its top-up plan then
 * returns nothing), the counter never moved, so every poke from the lock until the last kickoff
 * ran the whole top-up path and paid for a priced game-lines board: 6 Odds credits a poke
 * (docs/cfb-desk.md, measured on prod 2026-09-05 — the quota moved 17578 → 17572) at a ~15-min
 * pulse, roughly 40 pokes and ~240 credits a day, none of it visible to the props rail.
 *
 * THE PRECEDENT IS THE MLB DESK'S, and it counts ATTEMPTS: `decideTopUp` in
 * src/lib/server/blocks.ts reads `used` off the `topup-` keys of the block registry, and
 * app/api/generate/route.ts CLAIMS `topup-${used + 1}` and writes the registry row after the fire
 * whatever it seated — a fire that seats nothing has still spent the day's credits.
 */
describe("CRITIC 1 (2026-09-06) — the top-up cap bounds ATTEMPTS, not successful writes", () => {
  const priced = () => vi.mocked(slateFromEspn).mock.calls.length;
  const espnReads = () => vi.mocked(espnEvents).mock.calls.length;

  it("A SHORT DAY THAT PLANS NOTHING STILL BURNS AN ATTEMPT, and the cap then binds for the whole day", async () => {
    const fr = fakeRedis();
    expect((await call()).body.coreStake).toBe(150); // the fixture's $150 of the $250 — the short day
    expect(priced()).toBe(1);

    /* ATTEMPT 1: 15 minutes on, nothing new clears the card's gate. It bought a board to find
       that out, so it must consume the same budget as one that seated a ticket. */
    setNow(LOCKS_AT + 15 * 60_000);
    const a1 = await call();
    expect(topUpOf(a1.body).action).toBe("skipped");
    expect(priced()).toBe(2);
    expect(topUpsOn(fr.ledger()[0])).toHaveLength(1);
    expect(coreStakeOf(fr.ledger()[0])).toBe(150); // and it moved no money doing it

    /* ATTEMPT 2, past the retry window. */
    setNow(LOCKS_AT + 61 * 60_000);
    const a2 = await call();
    expect(topUpOf(a2.body).action).toBe("skipped");
    expect(priced()).toBe(3);
    expect(topUpsOn(fr.ledger()[0])).toHaveLength(cfbRulesMod.CFB_TOPUP_MAX);

    /* ...AND THE CAP BINDS: every later poke of the day costs nothing at all — no priced board
       and not even the keyless ESPN read, because the refusal is free and comes first. */
    const espnAtCap = espnReads();
    for (const m of [65, 70, 75, 80]) {
      setNow(LOCKS_AT + m * 60_000);
      const { status, body } = await call();
      expect(status).toBe(200);
      expect(topUpOf(body).action).toBe("skipped");
      expect(String(topUpOf(body).reason)).toMatch(/cap/i);
    }
    expect(priced()).toBe(3);
    expect(espnReads()).toBe(espnAtCap);
    expect(coreStakeOf(fr.ledger()[0])).toBe(150);
  });

  it("THE FREE PRE-CHECK: a poke inside the retry window after an empty attempt buys no second board", async () => {
    const fr = fakeRedis();
    await call();
    setNow(LOCKS_AT + 15 * 60_000);
    await call();
    expect(priced()).toBe(2);
    expect(topUpsOn(fr.ledger()[0])).toHaveLength(1);
    // the next pulse is 15 minutes later — the same prices, on the same games
    for (const m of [30, 45, 59]) {
      setNow(LOCKS_AT + m * 60_000);
      const { body } = await call();
      expect(topUpOf(body).action).toBe("skipped");
      expect(String(topUpOf(body).reason)).toMatch(/found nothing|retry|wait/i);
    }
    expect(priced()).toBe(2); // ...so nothing was bought, and no attempt was burnt for nothing
    expect(topUpsOn(fr.ledger()[0])).toHaveLength(1);
  });

  it("AN UPSTREAM FAILURE MID-SPEND STILL COSTS THE ATTEMPT — the claim is written BEFORE the pull", async () => {
    /* This is the half of the fix that ordering alone decides. A pull that throws has very
       probably been billed anyway (the Odds API charges the request, not the answer), and a
       platform kill between the pull and the write leaves no answer at all — so a cap that only
       records attempts which came back is not a cap, it is a hope. Claiming first makes the
       failure mode the safe one: the attempt is lost, never the bound. */
    const fr = fakeRedis();
    await call();
    setNow(LOCKS_AT + 15 * 60_000);
    vi.mocked(slateFromEspn).mockRejectedValueOnce(new Error("odds upstream 429"));
    const { status, body } = await call();
    expect(status).toBe(200); // the already-locked answer is never costed by the top-up
    expect(topUpOf(body).action).toBe("error");
    expect(String(topUpOf(body).error)).toMatch(/429/);
    /* PIN REWRITTEN 2026-09-06 (DEFECT M(b)) — the claim row now carries an explicit
       `filled: false` instead of leaving `core: 0` to be read as "in flight". The field is ADDED
       to this exact-shape assertion rather than the assertion being relaxed: what it pins is
       unchanged — the claim was written BEFORE the pull that threw, so the attempt is spent. */
    /* PIN REWRITTEN 2026-09-06 (INSTRUCTION 45, L1): the claim row gained an explicit `arms`,
       saying which allotment's attempt budget the board it is about to buy is charged to. This is
       an exact-shape `toEqual`, so the new field is ADDED to the expected row rather than the
       assertion being relaxed to `toMatchObject` — the row's shape IS the cap's invariant and the
       pin still states every field of it, including the two booleans that now decide whether a
       later poke may still fire. Not a loosening: the assertion is the same kind, over the same
       row, with one more field pinned than before. */
    expect(topUpsOn(fr.ledger()[0])).toEqual([{ at: LOCKS_AT + 15 * 60_000, n: 1, core: 0, stake: 0, filled: false, arms: { core: true, fun: false } }]);
    expect(coreStakeOf(fr.ledger()[0])).toBe(150);

    // ...and it counts against the cap like any other: one more attempt, then the day is done
    setNow(LOCKS_AT + 61 * 60_000);
    vi.mocked(slateFromEspn).mockRejectedValueOnce(new Error("odds upstream 429"));
    await call();
    expect(topUpsOn(fr.ledger()[0])).toHaveLength(cfbRulesMod.CFB_TOPUP_MAX);
    setNow(LOCKS_AT + 65 * 60_000);
    const done = await call();
    expect(String(topUpOf(done.body).reason)).toMatch(/cap/i);
  });

  it("A SUCCESSFUL TOP-UP STILL COSTS EXACTLY ONE ATTEMPT — the record is the attempt, filled in", async () => {
    const fr = fakeRedis();
    await call();
    setNow(LOCKS_AT + 15 * 60_000);
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => richerSlate(now, ["401858430", "401862701", "401869960"]));
    const { body } = await call();
    expect(topUpOf(body).action).toBe("topped-up");
    expect(topUpOf(body).n).toBe(1);
    expect(topUpsOn(fr.ledger()[0])).toHaveLength(1);
    expect(topUpsOn(fr.ledger()[0])[0]).toMatchObject({ core: 3, stake: 100 });
    expect(coreStakeOf(fr.ledger()[0])).toBe(250);
  });
});

/**
 * CRITIC 2 — A VOID TICKET MADE A DATE A PERMANENT SETTLE CANDIDATE, AND TWO OF THEM STARVED
 * THE PASS FOREVER.
 *
 * `overlayCfbGrading` computed `done` as "every ticket SETTLED (won/lost/push)". A postponed or
 * cancelled game grades `ungradable` — a VOID — so such a date could never reach `done`,
 * `cfbSettleCandidate` stayed true, and every poke forever spent one ESPN read to rewrite
 * byte-identical grading. Because the pass is bounded by `CFB_SETTLE.maxDatesPerPoke`, TWO such
 * dates exhaust the budget on every poke and every NEWER date is `deferred` and never scores — so
 * `cfbBankroll` stops moving, and it sizes every later card through ticketKelly.
 *
 * WHAT THIS BLOCK PINS, restated (INSTRUCTION 45, 2026-09-06, L3). The claim this docblock and its
 * describe used to lead with — that a void date is TERMINAL, "the device's terminal state", nothing
 * further to learn — is WITHDRAWN. DEFECT S1 disproved it: a postponed game can be replayed and
 * finalised days later, so the settle pass re-reads a voided date for CFB_VOID_RECHECK_MS and a
 * corroborated final inside that window replaces the void (pinned by the L2 block at the end of
 * this file, and by "S1: A VOIDED DATE IS RE-READ..." below, which this docblock flatly
 * contradicted). Not one assertion here ever tested terminality — every one of them tests the
 * SCHEDULING property, which is untouched and still true: a void puts a date in RESOLVED so the
 * pass stops re-grading it every poke, `done` goes true, and the maxDatesPerPoke budget reaches
 * the fresh dates behind it. RESOLVED is "this poke is done with the date for now", not "the
 * verdict can never change" — that second question is SETTLED's, and `ungradable` is deliberately
 * not in it.
 */
describe("CRITIC 2 (2026-09-06) — a void date stops being re-poked, and a stuck date never starves a fresh one", () => {
  /** the fixture events for `d`: every game FINAL with a score, except the named ids, POSTPONED */
  const finalOrPostponed = (d: string, postponed: string[] = []) =>
    (eventsFor(d) as Record<string, any>[]).map((e) => {
      const off = postponed.includes(String(e.id));
      const type = off
        ? { name: "STATUS_POSTPONED", state: "pre", completed: false, detail: "Postponed", shortDetail: "Ppd" }
        : { name: "STATUS_FINAL", state: "post", completed: true, detail: "Final", shortDetail: "Final" };
      e.status = { ...e.status, type };
      e.competitions[0].status = { ...e.competitions[0].status, type };
      for (const c of e.competitions[0].competitors as Record<string, any>[]) {
        c.score = off ? null : c.homeAway === "home" ? "31" : "17";
      }
      return e;
    });

  it("A POSTPONED GAME SETTLES AS UNGRADABLE and the date stops being a candidate — no read, forever", async () => {
    const fr = fakeRedis();
    expect((await call()).body.status).toBe("locked");
    const staked = fr.ledger()[0];
    const off = staked.core[0].legs[0].gkey; // this game will never be played

    /* PASS 1, the evening of the slate: the game is postponed but inside the 48 h window, so the
       ticket is honestly PENDING and the date's grading is written for the first time. */
    setNow(T("2026-09-06T00:00:00Z"));
    espnByDate({ [DATE]: finalOrPostponed(DATE, [off]) });
    const p1 = await call(req());
    expect((p1.body.settle as Record<string, unknown>).reads).toBe(1);
    const mid = fr.ledger().find((e) => e.date === DATE)!;
    expect(mid.grading!.tickets[staked.core[0].id].result).toBe("pending");
    expect(mid.grading!.done).toBe(false);

    /* PASS 2, three days on: 48 h past kickoff with the game still postponed, which is the VOID
       the grader exists to declare. The date must now be finished. */
    setNow(T("2026-09-08T15:00:00Z"));
    espnByDate({ "2026-09-08": [], "2026-09-07": [], "2026-09-06": [], [DATE]: finalOrPostponed(DATE, [off]) });
    const p2 = await call(req());
    expect((p2.body.settle as Record<string, unknown>).reads).toBe(1);
    const after = fr.ledger().find((e) => e.date === DATE)!;
    expect(after.grading!.tickets[staked.core[0].id].result).toBe("ungradable");
    expect(after.grading!.done).toBe(true);
    // ...while the tickets that DID final kept their real verdicts
    expect(after.grading!.tickets[staked.core[1].id].result).not.toBe("pending");

    /* PASS 3, a month later: nothing further can be learned, so nothing is read. */
    setNow(T("2026-10-08T15:00:00Z"));
    espnByDate({ "2026-10-08": [], "2026-10-07": [], "2026-10-06": [], "2026-10-05": [] });
    const p3 = await call(req());
    const s3 = p3.body.settle as Record<string, unknown>;
    expect(s3.reads).toBe(0);
    expect((s3.days as Record<string, unknown>[]).map((d) => d.date)).not.toContain(DATE);
  });

  it("TWO STUCK DATES DO NOT STARVE A FRESH ONE — a date already attempted yields to one never attempted", async () => {
    const games = slateAt(LOCKS_AT).games.map((g) => g.id);
    const pending = (e: CfbLedgerEntry): CfbLedgerEntry => ({
      ...e,
      grading: { tickets: Object.fromEntries(e.core.map((t) => [t.id, { result: "pending", payout: 0, detail: "awaiting a final" }])), legs: {}, done: false },
    });
    const STUCK = ["2026-09-05", "2026-09-06"];
    const FRESH = "2026-09-07";
    const entries = [
      ...STUCK.map((d) => pending(serverEntry(d, { stakes: [25, 25, 25], games: games.slice(0, 3), lockedAt: T(`${d}T15:00:00Z`) }))),
      serverEntry(FRESH, { stakes: [25, 25, 25], games: games.slice(0, 3), lockedAt: T(`${FRESH}T15:00:00Z`) }),
    ];
    const fr = seed(entries);
    setNow(T("2026-09-07T15:00:00Z"));
    /* only the two dates a FAIR pass may read are answerable; a read of the second stuck date
       (which must be deferred behind the fresh one) throws "unexpected espnEvents(2026-09-06)" */
    espnByDate({ [FRESH]: finalOrPostponed(FRESH), "2026-09-05": finalOrPostponed("2026-09-05", games.slice(0, 3)) });
    const { status, body } = await call(req());
    expect(status).toBe(200);
    const s = body.settle as Record<string, unknown>;
    expect(s.reads).toBe(cfbRulesMod.CFB_SETTLE.maxDatesPerPoke);
    expect((s.days as Record<string, unknown>[]).map((d) => [d.date, d.action])).toEqual([
      [FRESH, "settled"],
      ["2026-09-05", "settled"],
      ["2026-09-06", "deferred"],
    ]);
    // THE POINT: the never-attempted day scored, and the bankroll it feeds finally moves
    const fresh = fr.ledger().find((e) => e.date === FRESH)!;
    expect(fresh.grading!.done).toBe(true);
    expect(cfbBankroll({ base: CFB_BANK_BASE, asOf: CFB_PAPER.since, log: [] }, fr.ledger())).not.toBe(CFB_BANK_BASE);
  });
});

/**
 * CRITIC 3 + 4 — THE OVERLAY'S OWN RULE, APPLIED ONCE AND APPLIED TO BOTH HALVES.
 *
 * CRITIC 3: `overlayCfbGrading` returned the incoming grading UNCONDITIONALLY when there was no
 * current grading (`if (!cur) return inc`), so `done` came from `gradeCfbEntry` on a first pass
 * and from the overlay's own rule on every later one. The same void ticket was therefore
 * "finished" or "not finished" purely according to whether an earlier pass happened to run —
 * and the docblock claimed a stricter rule than the code applied. One rule now runs on every
 * pass, so the overlay is idempotent and order-independent.
 *
 * CRITIC 4: only the TICKET half of "a settled result is never overwritten" was pinned. A mutant
 * that deleted the LEG guard survived the entire suite (measured). The leg half is money too —
 * src/components/cfb/CfbTicketCard.tsx renders leg verdicts under the ticket — so it is pinned.
 */
describe("CRITIC 3 + 4 (2026-09-06) — the overlay is order-independent, and BOTH halves of the guard are pinned", () => {
  const entryWithVoid = () => {
    const entry = buildCfbLockEntry(slateAt(LOCKS_AT), { now: LOCKS_AT, bankroll: 2500, ahead: 12, total: 12, firstKickoff: FIRST_KICK }).entry;
    const off = entry.core[0].legs[0].gkey;
    const events = (eventsFor(DATE) as Record<string, any>[]).map((e) => {
      const dead = String(e.id) === off;
      const type = dead
        ? { name: "STATUS_POSTPONED", state: "pre", completed: false, detail: "Postponed" }
        : { name: "STATUS_FINAL", state: "post", completed: true, detail: "Final" };
      e.status = { ...e.status, type };
      e.competitions[0].status = { ...e.competitions[0].status, type };
      for (const c of e.competitions[0].competitors as Record<string, any>[]) c.score = dead ? null : c.homeAway === "home" ? "31" : "17";
      return e;
    });
    const late = LAST_KICK + 72 * 3600_000; // past the 48 h void window
    const { finals } = finalsFromEspn(DATE, events, late, 2500);
    return { entry, inc: gradeCfbEntry(entry, finals, late) };
  };

  it("CRITIC 3: overlaying twice equals overlaying once — a first pass and a second pass agree", () => {
    const { entry, inc } = entryWithVoid();
    expect(Object.values(inc.tickets).some((g) => g.result === "ungradable")).toBe(true);
    const once = lockServerMod.overlayCfbGrading(null, inc, entry)!;
    const twice = lockServerMod.overlayCfbGrading(once, inc, entry)!;
    expect(twice).toEqual(once);
    expect(twice.done).toBe(once.done);
    // ...and a pass that lands on an EMPTY prior verdict agrees with one that lands on a partial
    const partial = lockServerMod.overlayCfbGrading({ tickets: {}, legs: {}, done: false }, inc, entry)!;
    expect(partial).toEqual(once);
  });

  /**
   * CRITIC 3, THE PIN THAT WAS MISSING (added 2026-09-06, the third critic's pass — DEFECT K).
   *
   * The clause `if (!cur) return inc;` is GONE from `overlayCfbGrading`, and the test above pins
   * that overlaying twice equals overlaying once. It does NOT pin the first pass itself: MEASURED
   * this turn, re-inserting that one line immediately after `if (!inc) return cur ?? null;` left
   * ALL 168 tests of this suite green. A mutant that restores the bypass therefore survives, which
   * means the rule is not actually held by anything — so this is the same rule, stated as the
   * first pass sees it, and it is the half that carries the money.
   *
   * THE MONEY PATH, exactly. `settlePass` (app/api/cfb/lock/route.ts) grades against the copy it
   * read at the TOP of the poke and then writes with `overlayCfbGrading(raw.grading, inc, raw)`,
   * where `raw` is the copy re-read at write time — and `raw` can carry a core ticket a top-up
   * appended in between (the top-up runs on the already-locked exit of another, overlapping poke).
   * `inc.done` was computed by `gradeCfbEntry` over the OLDER, shorter ticket list, so it can be
   * `true` while the stored day carries a ticket nothing has graded. With the bypass, a
   * NEVER-GRADED date (`cur == null` — every date's first settle) took `inc` whole and wrote
   * `done: true`; `cfbSettleCandidate` then returns false for that date FOREVER, so the appended
   * ticket is never graded, its stake never enters `cfbLedgerStats` and its result never reaches
   * `cfbBankroll`. Recomputing `done` from the ENTRY's own tickets on every pass — including the
   * first — is what makes that impossible.
   */
  it("CRITIC 3 / DEFECT K: the FIRST pass recomputes `done` from the ENTRY, so a ticket the incoming grading never saw keeps the day open", () => {
    const base = buildCfbLockEntry(slateAt(LOCKS_AT), { now: LOCKS_AT, bankroll: 2500, ahead: 12, total: 12, firstKickoff: FIRST_KICK }).entry;
    /* the day as the STORE holds it at write time: the locked core, plus a ticket a top-up
       appended after the incoming verdict was graded */
    const appended = { ...base.core[0], id: `cfb-${DATE}-topup1-core-1` };
    const entry: CfbLedgerEntry = { ...base, core: [...base.core, appended], funT: [] };
    /* the incoming verdict, graded against the SHORTER list — it calls itself finished */
    const inc = {
      tickets: Object.fromEntries(base.core.map((t) => [t.id, { result: "won" as const, payout: 47.7, detail: "won" }])),
      legs: {},
      done: true,
    };
    expect(inc.done).toBe(true);
    expect(inc.tickets[appended.id]).toBeUndefined();

    const out = lockServerMod.overlayCfbGrading(null, inc, entry)!;
    expect(out.done).toBe(false); // the appended ticket has no verdict — the day is NOT finished
    expect(out).not.toBe(inc); // ...and the incoming object is never handed back whole
    // the same rule, same answer, on the second pass — which is what makes it ONE rule
    expect(lockServerMod.overlayCfbGrading(out, inc, entry)!.done).toBe(false);
    // ...and once the appended ticket IS graded, the day finishes
    const full = { ...inc, tickets: { ...inc.tickets, [appended.id]: { result: "lost" as const, payout: 0, detail: "a leg lost" } } };
    expect(lockServerMod.overlayCfbGrading(null, full, entry)!.done).toBe(true);
  });

  it("CRITIC 3: a void ticket is FINISHED, exactly as the device's own grader calls it", () => {
    const { entry, inc } = entryWithVoid();
    expect(inc.done).toBe(true); // gradeCfbEntry: `result !== "pending"`
    expect(lockServerMod.overlayCfbGrading(null, inc, entry)!.done).toBe(true);
    expect(lockServerMod.overlayCfbGrading(inc, inc, entry)!.done).toBe(true);
  });

  it("CRITIC 4: a SETTLED LEG is never overwritten either — the leg half of the rule", () => {
    const entry = buildCfbLockEntry(slateAt(LOCKS_AT), { now: LOCKS_AT, bankroll: 2500, ahead: 12, total: 12, firstKickoff: FIRST_KICK }).entry;
    const lkey = entry.core[0].legs[0].lkey;
    const other = entry.core[1].legs[0].lkey;
    const cur = { tickets: {}, legs: { [lkey]: { result: "won", detail: "graded on the phone" } }, done: false };
    const inc = { tickets: {}, legs: { [lkey]: { result: "lost", detail: "a server pass read a changed scoreboard" }, [other]: { result: "push", detail: "new" } }, done: false };
    const out = lockServerMod.overlayCfbGrading(cur, inc, entry)!;
    expect(out.legs![lkey]).toEqual({ result: "won", detail: "graded on the phone" });
    expect(out.legs![other]).toEqual({ result: "push", detail: "new" });
    // ...and a PENDING leg still takes the incoming verdict, or nothing would ever settle
    const pend = { tickets: {}, legs: { [lkey]: { result: "pending", detail: "awaiting a final" } }, done: false };
    expect(lockServerMod.overlayCfbGrading(pend, inc, entry)!.legs![lkey]).toEqual({ result: "lost", detail: "a server pass read a changed scoreboard" });
  });
});

/**
 * CRITIC 5 — A CORRUPT STORE BLOB WAS READ AS AN EMPTY LEDGER AND THEN OVERWRITTEN.
 *
 * `readStore()` mapped a JSON parse failure or a non-array `ledger` to `null`, exactly as it maps
 * a MISSING KEY. The write path then read that as "the ledger is empty", merged the day's single
 * entry into nothing and SET the blob — replacing the ENTIRE CFB season with one entry. A parse
 * failure is not evidence that the ledger is empty; it is evidence that nothing here knows what
 * the ledger holds. A missing key is a legitimately empty ledger; an unreadable value must refuse
 * to write and answer an error status, loudly, so the day is retried rather than the season lost.
 * `readBank()` had the same shape, and a bank read as absent silently re-sizes the day's card off
 * CFB_BANK_BASE.
 */
describe("CRITIC 5 (2026-09-06) — a corrupt blob refuses; it is never read as an empty ledger", () => {
  it("A CORRUPT LEDGER BLOB: the poke answers an error status and issues ZERO writes", async () => {
    const fr = fakeRedis({ [CFB_REDIS.ledger]: "{ this is not json" });
    const { status, body } = await call();
    expect(status).toBe(502);
    expect(String(body.error)).toMatch(/unreadable/i);
    expect(fr.allSets().length).toBe(0);
    expect(fr.kv.get(CFB_REDIS.ledger)).toBe("{ this is not json"); // the season is untouched
  });

  it("A NON-ARRAY LEDGER is the same refusal — shape is not a detail", async () => {
    const fr = fakeRedis({ [CFB_REDIS.ledger]: JSON.stringify({ ledger: { "2026-09-05": {} }, at: 1 }) });
    const { status, body } = await call();
    expect(status).toBe(502);
    expect(String(body.error)).toMatch(/unreadable/i);
    expect(fr.allSets().length).toBe(0);
  });

  it("A CORRUPT BANK BLOB refuses too — a card is never sized off a bankroll nothing could read", async () => {
    const fr = fakeRedis({ [CFB_REDIS.bank]: "}}not json{{" });
    const { status, body } = await call();
    expect(status).toBe(502);
    expect(String(body.error)).toMatch(/unreadable/i);
    expect(fr.allSets().length).toBe(0);
  });

  it("A BANK BLOB OF THE WRONG SHAPE refuses as well — 'it parsed' is not 'it is a bank'", async () => {
    const fr = fakeRedis({ [CFB_REDIS.bank]: JSON.stringify({ at: 1 }) }); // parses; carries no bank
    const { status, body } = await call();
    expect(status).toBe(502);
    expect(String(body.error)).toMatch(/unreadable/i);
    expect(fr.allSets().length).toBe(0);
  });

  it("A MISSING KEY still locks normally — an absent ledger IS an empty ledger", async () => {
    const fr = fakeRedis();
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.status).toBe("locked");
    expect(fr.sets().length).toBe(1);
    expect(fr.ledger().length).toBe(1);
  });
});

/* ==========================================================================================
 * THE MONEY-PATH CRITIC'S SECOND PASS (INSTRUCTION 45, 2026-09-06). Three more defects, all on
 * the TOP-UP path, all measured with a probe before a line of them was believed. They continue
 * the CRITIC numbering (6-8) so they can never be confused with CRITIC 1-5 above or with the
 * verification pass's own DEFECT 1-6.
 *
 *   CRITIC 6  the claim was matched by ORDINAL alone, so an overlapping poke treated a COMPLETED
 *             attempt as its own in-flight claim, re-minted ticket ids that were already seated
 *             and corrupted realized P/L. A REGRESSION introduced by CRITIC 1's claim.
 *   CRITIC 7  a top-up onto a day already graded `done` was never graded and the date could
 *             never settle again.
 *   CRITIC 8  an Odds API outage silently spent the day's top-up allotment.
 * ======================================================================================== */

/** the fixture events for `d`, every game FINAL with a real score — what ESPN serves after the day */
const finalsFixtureFor = (d: string) =>
  (eventsFor(d) as Record<string, any>[]).map((e) => {
    const type = { name: "STATUS_FINAL", state: "post", completed: true, detail: "Final", shortDetail: "Final" };
    e.status = { ...e.status, type };
    e.competitions[0].status = { ...e.competitions[0].status, type };
    for (const c of e.competitions[0].competitors as Record<string, any>[]) c.score = c.homeAway === "home" ? "31" : "17";
    return e;
  });

/**
 * CRITIC 6 — THE TOP-UP CLAIM WAS MATCHED BY ORDINAL ONLY, SO TWO POKES MINTED COLLIDING IDS.
 *
 * `decideCfbTopUp` excluded `r.n !== opts.claim` — by ORDINAL alone. A second overlapping poke that
 * derived the same ordinal therefore treated the FIRST poke's COMPLETED attempt as its own
 * in-flight claim, erased it from the count, and re-minted ticket ids the first poke had already
 * seated (`planCfbTopUp` restarted `tickets.length + 1` at 1). `claimCfbTopUp` and `applyCfbTopUp`
 * filtered the same way, so the claim write ALSO erased the completed row.
 *
 * MEASURED consequence, and it is money: the ids key the grading map (`gradeCfbEntry` writes
 * `tickets[t.id]` per ticket), so two tickets sharing one id produce ONE verdict for two different
 * bets — one on a game that won and one on a game that lost both read the winner's verdict.
 * `validateLedger` checks duplicate DATES only and `assertCfbCardMoney` checked sums, the ticket
 * count and the per-ticket band — never id uniqueness — so nothing caught it.
 */
describe("CRITIC 6 (2026-09-06) — an overlapping top-up can never re-mint an id that is already seated", () => {
  /** A's game, then B's second — the evening lines posting one after another (2026-09-08: A had
      two games; at the $50 max two singles would fill the $250 and B would be refused "fully
      deployed" before it could claim, which is not the race this case is about) */
  const A_EXTRA = ["401866410"];
  const B_EXTRA = "401862701";

  it("TWO OVERLAPPING POKES: every id is unique, BOTH attempts are counted, and the cap then binds", async () => {
    const fr = fakeRedis();
    expect((await call()).body.coreStake).toBe(150);
    const locked = fr.ledger()[0];
    expect(locked.core.length).toBe(3);

    setNow(LOCKS_AT + 15 * 60_000);
    /* Poke B reads the stored snapshot at GET and only reaches its own top-up after the sweep and
       the settle pass have run — the whole request is the window. Poke A runs end to end inside
       exactly that window, so both pokes derive their ordinal from the same $75 / no-attempts
       snapshot. The hook is B's own keyless ESPN read, which sits between B's GET read and B's
       claim. */
    let fired = false;
    vi.mocked(espnEvents).mockImplementation(async (d: string) => {
      if (d === DATE && !fired) {
        fired = true;
        await call(); // ← poke A, end to end
      }
      return ESPN.events;
    });
    let priced = 0;
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => richerSlate(now, priced++ === 0 ? A_EXTRA : [...A_EXTRA, B_EXTRA]));

    const { status, body } = await call(); // ← poke B
    expect(status).toBe(200);
    expect(body.status).toBe("already-locked");

    const e = fr.ledger()[0];
    /* THE DEFECT, first: two tickets carried one id, so the day held six bets and five verdicts. */
    expect(new Set(e.core.map((t) => t.id)).size, "two core tickets share a ticket id").toBe(e.core.length);
    /* ...and every one of them is scored on its own game, not on its twin's. */
    const { finals } = finalsFromEspn(DATE, finalsFixtureFor(DATE), LAST_KICK + 12 * 3600_000, 2500);
    const graded = gradeCfbEntry(e, finals, LAST_KICK + 12 * 3600_000);
    expect(Object.keys(graded.tickets).length, "a ticket lost its own verdict to a colliding id").toBe(e.core.length + e.funT.length);
    /* THE DEFECT, second: B erased A's completed attempt, so the log counted one of two. */
    expect(topUpsOn(e), "a completed attempt was erased from the day's top-up log").toHaveLength(2);
    expect(topUpsOn(e).map((r) => r.n)).toEqual([1, 2]);
    expect(topUpsOn(e).every((r) => Number(r.core) > 0)).toBe(true);
    /* ...and the money still lands exactly where the rules allow. */
    expect(coreStakeOf(e)).toBe(CFB_PAPER.daily);
    expect(e.core.length).toBe(5);
    const gkeys = e.core.flatMap((t) => t.legs.map((l) => l.gkey));
    expect(new Set(gkeys).size).toBe(gkeys.length);

    /* THE CAP THEN BINDS: with both attempts spent no later poke prices another board. */
    vi.mocked(slateFromEspn).mockClear();
    setNow(LOCKS_AT + 61 * 60_000);
    const third = await call();
    expect(topUpOf(third.body).action).toBe("skipped");
    expect(String(topUpOf(third.body).reason)).toMatch(/cap|fully deployed/i);
    expect(slateFromEspn).not.toHaveBeenCalled();
    expect(coreStakeOf(fr.ledger()[0])).toBe(CFB_PAPER.daily);
  });

  it("THE GUARD: a duplicate ticket id is a MONEY defect, and assertCfbEntryMoney throws on it", () => {
    const games = slateAt(LOCKS_AT).games.map((g) => g.id);
    const e = serverEntry(DATE, { stakes: [25, 25], games: games.slice(0, 2), lockedAt: LOCKS_AT });
    expect(() => lockServerMod.assertCfbEntryMoney(e)).not.toThrow();
    const dup: CfbLedgerEntry = { ...e, core: [...e.core, { ...e.core[1], id: e.core[0].id }] };
    expect(() => lockServerMod.assertCfbEntryMoney(dup)).toThrow(/MONEY GUARD/);
    expect(() => lockServerMod.assertCfbEntryMoney(dup)).toThrow(new RegExp(e.core[0].id));
    // ...and the fun bucket shares the same id space, because the grading map does
    const cross: CfbLedgerEntry = { ...e, funT: [{ ...e.core[0], bucket: "fun" as const }] };
    expect(() => lockServerMod.assertCfbEntryMoney(cross)).toThrow(/MONEY GUARD/);
  });
});

/**
 * CRITIC 7 — A TOP-UP ONTO A GRADED DAY WAS NEVER GRADED, AND THE DATE COULD NEVER SETTLE AGAIN.
 *
 * `applyCfbTopUp` appended core tickets and never touched `grading`. If the entry already carried
 * `grading.done === true`, the appended tickets were ungraded on a "finished" day, and
 * `cfbSettleCandidate` (`entry.grading?.done !== true`) refused the date FOREVER — the server never
 * graded the money it had just deployed. `mergeDay` has exactly this reopen rule
 * (src/lib/ledger-merge.ts: "any ticket without a grade reopens grading"), but the top-up write
 * path does not merge — it is a raw `cur.map` replace — so nothing reopened it server-side.
 *
 * Reachable: a zero-ticket sweep / no-play day Josh grades on the phone (`gradeCfbEntry` over an
 * empty ticket set returns `done: true` via `[].every()`), synced up, then topped up by the server.
 */
describe("CRITIC 7 (2026-09-06) — a top-up reopens a day that was already marked done", () => {
  const games = () => slateAt(LOCKS_AT).games.map((g) => g.id);
  const gradedDay = () => {
    const e = serverEntry(DATE, { stakes: [50, 50, 50], games: games().slice(0, 3), lockedAt: LOCKS_AT }); // 2026-09-08: $150 of the $250
    return {
      ...e,
      grading: {
        tickets: Object.fromEntries(e.core.map((t, i) => [t.id, { result: i === 0 ? "won" : "lost", payout: i === 0 ? 47.5 : 0, detail: "graded" }])),
        legs: {},
        done: true,
      },
    } as CfbLedgerEntry;
  };
  /* FIXTURE EXTENDED 2026-09-06 (INSTRUCTION 45, DEFECT J) — not a loosened assertion. `CfbTopUpPlan`
     now carries the fun parlay a top-up may seat (`fun` / `funStake`), so a hand-built plan has to
     carry those two fields or `applyCfbTopUp` reads `undefined.length`. Every assertion in this
     describe is unchanged; the CORE-only plan is what these three cases are about, so the fun half
     is empty here and is exercised on its own below. */
  const planFor = (n: number, fun: CfbTicket[] = []) => {
    const donor = serverEntry(DATE, { stakes: [50, 50], games: games().slice(3, 5), lockedAt: LOCKS_AT }); // the $100 that fills the $250
    return {
      tickets: donor.core.map((t, i) => ({ ...t, id: `cfb-${DATE}-topup${n}-core-${i + 4}` })),
      stake: 100,
      fun,
      funStake: fun.reduce((a, t) => a + t.stake, 0),
      games: donor.games,
      pricedAhead: 3,
    };
  };

  it("A DONE DAY THAT GAINS TICKETS IS NOT DONE — it settles again, and the input entry is not mutated", () => {
    const done = gradedDay();
    expect(lockServerMod.cfbSettleCandidate(done)).toBe(false);
    const next = lockServerMod.applyCfbTopUp(done, planFor(1), LOCKS_AT + 15 * 60_000, 1);
    expect(coreStakeOf(next)).toBe(CFB_PAPER.daily);
    expect(next.grading!.done, "the day deployed $100 more and still called itself finished").toBe(false);
    expect(lockServerMod.cfbSettleCandidate(next), "the settle pass can never list this date again").toBe(true);
    // the verdicts already scored are kept, untouched
    expect(next.grading!.tickets[done.core[0].id]).toEqual({ result: "won", payout: 47.5, detail: "graded" });
    expect(Object.keys(next.grading!.tickets).length).toBe(3);
    // ...and the entry it was handed is not mutated — the caller's copy still says what it said
    expect(done.grading!.done, "applyCfbTopUp mutated the entry it was given").toBe(true);
    expect(lockServerMod.cfbSettleCandidate(done)).toBe(false);
  });

  /* ADDED 2026-09-06 (DEFECT J): the SAME rule, for the bucket that could not gain a ticket until
     this turn. A fun parlay appended to a day that called itself finished is money nobody graded,
     which is the identical failure — so it is pinned identically rather than assumed. */
  it("A DONE DAY THAT GAINS A FUN TICKET IS NOT DONE EITHER — the reopen rule spans both buckets", () => {
    const done = gradedDay();
    const parlay: CfbTicket = { ...done.core[0], id: `cfb-${DATE}-topup1-fun-1`, bucket: "fun", stake: CFB_PAPER.fun };
    const next = lockServerMod.applyCfbTopUp(done, planFor(1, [parlay]), LOCKS_AT + 15 * 60_000, 1);
    expect(next.funT).toHaveLength(1);
    expect(next.funT[0].id).toBe(`cfb-${DATE}-topup1-fun-1`);
    expect(next.grading!.done, "the day deployed $25 of fun money and still called itself finished").toBe(false);
    expect(lockServerMod.cfbSettleCandidate(next)).toBe(true);
    expect(String(next.note)).toMatch(/Fun: \+\$25/);
  });

  it("A DAY THAT WAS NOT DONE STAYS NOT DONE, and a top-up whose tickets are all already graded stays done", () => {
    const open = { ...gradedDay(), grading: { ...gradedDay().grading!, done: false } } as CfbLedgerEntry;
    expect(lockServerMod.applyCfbTopUp(open, planFor(1), LOCKS_AT + 15 * 60_000, 1).grading!.done).toBe(false);
    // the degenerate case mergeDay also allows: nothing was actually added that lacks a verdict
    const done = gradedDay();
    const empty = { tickets: [], stake: 0, fun: [], funStake: 0, games: {}, pricedAhead: 0 };
    expect(lockServerMod.applyCfbTopUp(done, empty, LOCKS_AT + 15 * 60_000, 1).grading!.done).toBe(true);
  });

  it("A DAY WITH NO GRADING AT ALL is untouched by the rule — a top-up never invents a grading object", () => {
    const e = serverEntry(DATE, { stakes: [25, 25, 25], games: games().slice(0, 3), lockedAt: LOCKS_AT });
    expect(e.grading).toBeNull();
    expect(lockServerMod.applyCfbTopUp(e, planFor(1), LOCKS_AT + 15 * 60_000, 1).grading).toBeNull();
  });
});

/**
 * CRITIC 8 — AN ODDS API OUTAGE SILENTLY SPENT THE DAY'S TOP-UP ALLOTMENT.
 *
 * The top-up path never inspected `slate.oddsMissing`. An outage consumed a top-up ATTEMPT (the
 * claim is written before the pull, by CRITIC 1's own design) recorded as `core: 0`, and armed the
 * CFB_TOPUP_RETRY_MS window — while the LOCK path treats the same condition as a REFUSAL: 502,
 * no entry written, an odds-gap marker stamped. Two transient outages therefore stranded the day's
 * whole undeployed core: CFB_TOPUP_MAX is 2, so from the second outage to the last kickoff every
 * poke was refused "the top-up cap is spent" and the day ended short though Caesars prices were
 * posted all afternoon — recorded on the ledger as a full paper day, with nothing saying the money
 * was lost to the feed rather than to the rules.
 */
describe("CRITIC 8 (2026-09-06) — an odds outage costs the top-up nothing, and says so", () => {
  const scoresOnly = (now: number): CfbSlate => {
    const board = buildCfbBoard({ date: DATE, espnEvents: ESPN.events, oddsEvents: [], fpi: FPI, now, bankroll: 2500 });
    return { ...board, finals: finalsOf(board.games), quota: { remaining: null, used: null }, oddsMissing: true };
  };

  it("TWO OUTAGE POKES SPEND ZERO ATTEMPTS and stamp the odds-gap marker; both attempts survive for the prices", async () => {
    const fr = fakeRedis();
    expect((await call()).body.coreStake).toBe(150);

    for (const m of [15, 30]) {
      setNow(LOCKS_AT + m * 60_000);
      vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => scoresOnly(now));
      const { status, body } = await call();
      expect(status).toBe(200);
      const t = topUpOf(body);
      expect(t.action).toBe("skipped");
      expect(t.oddsMissing, "the answer must name the outage, not blame the rules").toBe(true);
      expect(String(t.reason)).toMatch(/odds/i);
      expect(topUpsOn(fr.ledger()[0]), `an outage spent a top-up attempt at +${m} min`).toEqual([]);
      expect(coreStakeOf(fr.ledger()[0])).toBe(150);
    }
    /* the same dated marker the LOCK path stamps, so the sweep's cause-reading agrees with what
       actually happened — one per refusal, on the date that was refused */
    expect(fr.markers().map((c) => c[1])).toEqual([`pl:cfb:oddsgap:v1:${DATE}`, `pl:cfb:oddsgap:v1:${DATE}`]);

    /* THE POINT: prices return, and the day still has BOTH of its attempts to deploy with. */
    setNow(LOCKS_AT + 45 * 60_000);
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => richerSlate(now, ["401866410"]));
    const a1 = await call();
    expect(topUpOf(a1.body).action).toBe("topped-up");
    expect(topUpOf(a1.body).n).toBe(1);
    expect(coreStakeOf(fr.ledger()[0])).toBe(200);

    setNow(LOCKS_AT + 50 * 60_000);
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => richerSlate(now, ["401858430"]));
    const a2 = await call();
    expect(topUpOf(a2.body).action).toBe("topped-up");
    expect(topUpOf(a2.body).n).toBe(2);
    expect(coreStakeOf(fr.ledger()[0])).toBe(250);
    expect(topUpsOn(fr.ledger()[0])).toHaveLength(cfbRulesMod.CFB_TOPUP_MAX);
  });

  it("dry=1 on an outage writes nothing at all — no claim to release and no marker", async () => {
    const fr = fakeRedis();
    await call();
    setNow(LOCKS_AT + 15 * 60_000);
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => scoresOnly(now));
    const { status, body } = await call(req({ date: DATE, dry: true }));
    expect(status).toBe(200);
    expect(topUpOf(body).action).toBe("skipped");
    expect(topUpOf(body).oddsMissing).toBe(true);
    expect(fr.markers()).toHaveLength(0);
    expect(fr.sets()).toHaveLength(1); // the lock's own write, and nothing since
  });
});

/* ==========================================================================================
 * THE THIRD CRITIC'S PASS (INSTRUCTION 45, 2026-09-06). Josh, verbatim: "Parlay Lab CFB
 * should've been running the same $150 per day theoretical Core money and $25 Fun money per
 * day." BOTH halves of that sentence are money, and the second half had no top-up at all.
 *
 * DEFECT I — A GAME ESPN NEVER FINALISES STAYS PENDING FOREVER, AND STARVES NEWER DATES.
 *   (a) `gradeCfbEntry`'s 48-hour void escalation fired only when the game was ABSENT from the
 *       finals map or carried `status === "postponed"`. A game ESPN leaves `live` — a
 *       lightning-suspended or abandoned game, which it does serve — is PRESENT and not
 *       postponed, so its leg stayed `pending` for ever, the date never reached `done`, and it
 *       stayed a settle candidate burning one ESPN read per poke until the end of time.
 *   (b) the settle queue tiered on `grading != null`, i.e. "has this date ever been graded",
 *       which never changes once it is true. TWO permanently-stuck dates are both in the front
 *       tier, `CFB_SETTLE.maxDatesPerPoke` is 2, so they took the whole budget on EVERY poke and
 *       a third date that could actually finish was `deferred` for ever — its realized P/L never
 *       reaching `cfbBankroll`, which sizes every later card through ticketKelly.
 *
 * DEFECT J — THE "$25 FUN MONEY PER DAY" HALF HAD NO TOP-UP. `planCfbTopUp` read only
 *   `card.core` and threw the rebuild's fun parlay away, so a day whose fun parlay did not clear
 *   the gate at the lock instant (CFB_RULES.fun: 3-5 legs, decimal 4-40, EV ≥ -3%) recorded $0
 *   of the $25 for life while the ledger presented it as a complete paper day.
 * ======================================================================================== */
describe("DEFECT I (2026-09-06) — a game ESPN never finalises is a VOID at 48 h, and no stuck date starves a fresh one", () => {
  /** the fixture events for `d`, every game FINAL with a score EXCEPT the named ids, which ESPN
      still calls IN PROGRESS — the lightning-suspended game that never gets a final */
  const suspendedEventsFor = (d: string, suspended: string[]) =>
    (eventsFor(d) as Record<string, any>[]).map((e) => {
      const off = suspended.includes(String(e.id));
      const type = off
        ? { name: "STATUS_SUSPENDED", state: "in", completed: false, detail: "Suspended", shortDetail: "Susp" }
        : { name: "STATUS_FINAL", state: "post", completed: true, detail: "Final", shortDetail: "Final" };
      e.status = { ...e.status, type };
      e.competitions[0].status = { ...e.competitions[0].status, type };
      for (const c of e.competitions[0].competitors as Record<string, any>[]) {
        c.score = off ? "14" : c.homeAway === "home" ? "31" : "17";
      }
      return e;
    });

  /** the same, but the named ids are POSTPONED — the void this desk already declared */
  const finalOrPostponed = (d: string, postponed: string[] = []) =>
    (eventsFor(d) as Record<string, any>[]).map((e) => {
      const off = postponed.includes(String(e.id));
      const type = off
        ? { name: "STATUS_POSTPONED", state: "pre", completed: false, detail: "Postponed", shortDetail: "Ppd" }
        : { name: "STATUS_FINAL", state: "post", completed: true, detail: "Final", shortDetail: "Final" };
      e.status = { ...e.status, type };
      e.competitions[0].status = { ...e.competitions[0].status, type };
      for (const c of e.competitions[0].competitors as Record<string, any>[]) {
        c.score = off ? null : c.homeAway === "home" ? "31" : "17";
      }
      return e;
    });

  it("I(a): a game left LIVE 48 h past kickoff is a VOID — the escalation is the clock, not the status ESPN last reported", () => {
    const entry = buildCfbLockEntry(slateAt(LOCKS_AT), { now: LOCKS_AT, bankroll: 2500, ahead: 12, total: 12, firstKickoff: FIRST_KICK }).entry;
    const off = entry.core[0].legs[0].gkey;
    const events = suspendedEventsFor(DATE, [off]);

    /* the trap, stated: the game IS in the finals map and it is NOT postponed */
    const late = LAST_KICK + 72 * 3600_000;
    const { finals } = finalsFromEspn(DATE, events, late, 2500);
    expect(finals[off]).toBeDefined();
    expect(finals[off].final).toBe(false);
    expect(finals[off].status).toBe("live");

    const g = gradeCfbEntry(entry, finals, late);
    expect(g.tickets[entry.core[0].id].result).toBe("ungradable");
    expect(g.legs[entry.core[0].legs[0].lkey].detail).toMatch(/48h past kickoff/);
    expect(g.done).toBe(true);

    /* ...and INSIDE the window it is still honestly pending: the void is the 48 hours, and
       nothing here shortens the wait for a game that is genuinely still being played */
    const early = LAST_KICK + 20 * 3600_000;
    const g2 = gradeCfbEntry(entry, finalsFromEspn(DATE, events, early, 2500).finals, early);
    expect(g2.tickets[entry.core[0].id].result).toBe("pending");
    expect(g2.done).toBe(false);
  });

  it("I(a): THE POINT — a suspended date settles and STOPS being a settle candidate, instead of reading ESPN for ever", async () => {
    const fr = fakeRedis();
    expect((await call()).body.status).toBe("locked");
    const staked = fr.ledger()[0];
    const off = staked.core[0].legs[0].gkey; // this game is never finalised

    /* three days on: 48 h past kickoff, ESPN still calling it in progress */
    setNow(T("2026-09-08T15:00:00Z"));
    espnByDate({ "2026-09-08": [], "2026-09-07": [], "2026-09-06": [], [DATE]: suspendedEventsFor(DATE, [off]) });
    const p = await call(req());
    expect((p.body.settle as Record<string, unknown>).reads).toBe(1);
    const after = fr.ledger().find((e) => e.date === DATE)!;
    expect(after.grading!.tickets[staked.core[0].id].result).toBe("ungradable");
    expect(after.grading!.done).toBe(true);
    /* the tickets that DID final kept their real verdicts — a void is per leg, never per day */
    expect(after.grading!.tickets[staked.core[1].id].result).not.toBe("pending");

    /* a month later: nothing further can be learned, so nothing is read and the date is not
       even listed — which is the ESPN read per poke, for ever, that this closes */
    setNow(T("2026-10-08T15:00:00Z"));
    espnByDate({ "2026-10-08": [], "2026-10-07": [], "2026-10-06": [], "2026-10-05": [] });
    const p3 = await call(req());
    const s3 = p3.body.settle as Record<string, unknown>;
    expect(s3.reads).toBe(0);
    expect((s3.days as Record<string, unknown>[]).map((d) => d.date)).not.toContain(DATE);
  });

  /**
   * I(b). THE STARVATION IS BETWEEN DATES THAT HAVE ALL BEEN ATTEMPTED. The CRITIC 2 pin above
   * covers the case where one date has NEVER been graded; this is the case that pin cannot see —
   * three dates that all carry a grading object, two of which can never finish. On the old tier
   * (`grading ? 1 : 0`) all three sit in the same tier for ever, oldest-first hands the whole
   * two-date budget to the two stuck ones on every poke, and the third never scores.
   *
   * The kickoffs are stamped 19 hours before the pokes on purpose: past CFB_SETTLE.finishMs, so
   * every date is READY, and inside CFB_UNGRADABLE_MS, so the two stuck dates are still honestly
   * pending rather than voided by I(a) — the starvation has to be shown while it is real.
   */
  it("I(b): THREE ATTEMPTED DATES, TWO OF THEM STUCK — the third is read within three pokes, not deferred for ever", async () => {
    const ids = slateAt(LOCKS_AT).games.slice(0, 3).map((g) => g.id);
    const KICK = T("2026-09-07T20:00:00Z");
    const day = (date: string): CfbLedgerEntry => {
      const e = serverEntry(date, { stakes: [25, 25, 25], games: ids, lockedAt: T(`${date}T15:00:00Z`) });
      return {
        ...e,
        games: Object.fromEntries(ids.map((g, i) => [g, { pk: Number(g), start: new Date(KICK + i).toISOString(), home: "H", away: "A" }])),
        grading: { tickets: Object.fromEntries(e.core.map((t) => [t.id, { result: "pending", payout: 0, detail: "awaiting a final" }])), legs: {}, done: false },
      };
    };
    const S1 = "2026-09-05";
    const S2 = "2026-09-06";
    const LATE = "2026-09-07";
    const fr = seed([day(S1), day(S2), day(LATE)]);
    /* the two stuck dates never final; the third one did, and can be finished the moment it is
       given a read at all */
    espnByDate({
      "2026-09-08": [],
      [S1]: finalOrPostponed(S1, ids),
      [S2]: finalOrPostponed(S2, ids),
      [LATE]: finalOrPostponed(LATE),
    });

    const seen: unknown[][] = [];
    for (const m of [0, 5, 10]) {
      setNow(T("2026-09-08T15:00:00Z") + m * 60_000);
      const { body } = await call(req());
      const s = body.settle as Record<string, unknown>;
      seen.push((s.days as Record<string, unknown>[]).map((d) => [d.date, d.action]));
    }

    /* POKE 1 is the old behaviour and stays the old behaviour: oldest first inside the tier. */
    expect(seen[0]).toEqual([
      [S1, "settled"],
      [S2, "settled"],
      [LATE, "deferred"],
    ]);
    /* POKE 2 is the fix: the two dates read a moment ago go to the BACK, so the date that has
       waited longest for a read gets one — and it finishes. */
    expect(seen[1]).toEqual([
      [LATE, "settled"],
      [S1, "settled"],
      [S2, "deferred"],
    ]);
    /* POKE 3: the finished date is not a candidate at all any more, and the two stuck dates
       rotate rather than one of them being read twice while the other waits. */
    expect(seen[2]).toEqual([
      [S2, "settled"],
      [S1, "settled"],
    ]);

    const late = fr.ledger().find((e) => e.date === LATE)!;
    expect(late.grading!.done).toBe(true);
    expect(cfbBankroll({ base: CFB_BANK_BASE, asOf: CFB_PAPER.since, log: [] }, fr.ledger())).not.toBe(CFB_BANK_BASE);
    /* ...and the two stuck dates are still stuck, honestly: nothing here invented a result */
    expect(fr.ledger().find((e) => e.date === S1)!.grading!.done).toBe(false);
    expect(fr.ledger().find((e) => e.date === S2)!.grading!.done).toBe(false);
  });
});

describe("DEFECT J (2026-09-06) — the $25 fun money is topped up too, once, and never past $25", () => {
  const funT = (e: CfbLedgerEntry) => e.funT ?? [];
  const funStakeOf = (e: CfbLedgerEntry) => funT(e).reduce((s, t) => s + t.stake, 0);

  it("J(a): A LOCKED DAY WITH AN EMPTY FUN BUCKET gains exactly ONE fun ticket, at or under $25", async () => {
    /* 2026-09-08: $100 of the $250, so the three evening singles below (each raised to the $50 max) land the core exactly on the allotment */
    const day = serverEntry(DATE, { stakes: [50, 25, 25], games: LOCK_GAMES, lockedAt: LOCKS_AT });
    expect(funT(day)).toHaveLength(0); // $0 of the $25, and nothing said so
    const fr = seed([day]);

    setNow(LOCKS_AT + 15 * 60_000);
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => richerSlate(now, ["401858430", "401862701", "401869960"]));
    const { status, body } = await call();
    expect(status).toBe(200);
    const t = topUpOf(body);
    expect(t.action).toBe("topped-up");

    const e = fr.ledger()[0];
    expect(funT(e)).toHaveLength(1);
    expect(funStakeOf(e)).toBeGreaterThan(0);
    expect(funStakeOf(e)).toBeLessThanOrEqual(CFB_PAPER.fun);
    expect(funT(e)[0].id).toBe(`cfb-${DATE}-topup1-fun-1`);
    expect(funT(e)[0].bucket).toBe("fun");
    expect(funT(e)[0].legs.length).toBeGreaterThanOrEqual(CFB_RULES.fun.legs.min);
    expect(funT(e)[0].legs.length).toBeLessThanOrEqual(CFB_RULES.fun.legs.max);
    /* every fun leg's game is in the entry's snapshot too — the grader keys off it */
    for (const l of funT(e)[0].legs) expect(e.games[l.gkey]).toBeDefined();
    /* the core it was appended beside is untouched, and no id collides across the two buckets */
    expect(coreStakeOf(e)).toBe(CFB_PAPER.daily);
    const ids = [...e.core, ...funT(e)].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("J(b): the answer and the note both say what the FUN bucket did — a short day is never silent", async () => {
    const fr = seed([serverEntry(DATE, { stakes: [25, 25, 25], games: LOCK_GAMES, lockedAt: LOCKS_AT })]);
    setNow(LOCKS_AT + 15 * 60_000);
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => richerSlate(now, ["401858430", "401862701", "401869960"]));
    const { body } = await call();
    const t = topUpOf(body);
    expect(t.funStake).toBe(CFB_PAPER.fun);
    expect(t.funRoom).toBe(0);
    expect(String(fr.ledger()[0].note)).toMatch(/fun/i);
    expect(String(fr.ledger()[0].note)).toMatch(/\$25/);

    /* dry=1 reports the same two figures and writes nothing */
    const before = fr.sets().length;
    const dryDay = serverEntry(DATE, { stakes: [25, 25, 25], games: LOCK_GAMES, lockedAt: LOCKS_AT });
    fr.kv.set(CFB_REDIS.ledger, JSON.stringify({ ledger: [dryDay], at: LOCKS_AT }));
    const dry = await call(req({ date: DATE, dry: true }));
    expect(topUpOf(dry.body).action).toBe("would-top-up");
    expect(topUpOf(dry.body).funStake).toBe(CFB_PAPER.fun);
    expect(topUpOf(dry.body).funRoom).toBe(0);
    expect(fr.sets().length).toBe(before);
  });

  it("J(a): A DAY THAT ALREADY CARRIES A FUN TICKET gains no second one — an append is not a re-stake", async () => {
    const day = serverEntry(DATE, { stakes: [25, 25, 25], games: LOCK_GAMES, lockedAt: LOCKS_AT, fun: CFB_PAPER.fun });
    expect(funT(day)).toHaveLength(1);
    const fr = seed([day]);
    setNow(LOCKS_AT + 15 * 60_000);
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => richerSlate(now, ["401858430", "401862701", "401869960"]));
    const { body } = await call();
    expect(topUpOf(body).action).toBe("topped-up");
    expect(topUpOf(body).funStake).toBe(0);
    const e = fr.ledger()[0];
    expect(funT(e)).toHaveLength(1);
    expect(funT(e)[0]).toEqual(day.funT[0]); // byte for byte — the locked parlay is never replaced
    expect(funStakeOf(e)).toBe(CFB_PAPER.fun);
  });

  it("J(a): THE MONEY GUARD covers the fun bucket — over $25, or a colliding fun id, throws over the MERGED entry", () => {
    const day = serverEntry(DATE, { stakes: [25], games: LOCK_GAMES, lockedAt: LOCKS_AT, fun: CFB_PAPER.fun });
    const second = { ...day.funT[0], id: `cfb-${DATE}-topup1-fun-1` };
    expect(() => lockServerMod.assertCfbEntryMoney({ ...day, funT: [...day.funT, second] })).toThrow(/MONEY GUARD/);
    expect(() => lockServerMod.assertCfbEntryMoney({ ...day, funT: [...day.funT, second] })).toThrow(/fun money/);
    /* ...and the id space is ONE space: a fun ticket may not re-use a core ticket's id either */
    const clash = { ...day.funT[0], id: day.core[0].id };
    expect(() => lockServerMod.assertCfbEntryMoney({ ...day, funT: [clash] })).toThrow(/appears twice/);
  });
});

/* ==========================================================================================
 * DEFECT M (INSTRUCTION 45, 2026-09-06) — THE TWO ALLOTMENTS ARE ONE GATE, SO THE COMMONEST
 * GOOD DAY THROWS THE $25 AWAY. Josh, verbatim: "Parlay Lab CFB should've been running the same
 * $150 per day theoretical Core money and $25 Fun money per day". BOTH halves are money.
 *
 * M(a) — THE CORE GATE REFUSES BEFORE THE FUN BUCKET IS EVEN READ. `decideCfbTopUp` refused on
 *   "the day is fully deployed" (core room < CFB_RULES.minStake) and on "the ticket cap is
 *   spent" (CFB_RULES.tickets.max core tickets), both computed from `entry.core` ALONE, and
 *   `planCfbTopUp` — the only thing that can seat a fun ticket — sits past that refusal. MEASURED
 *   on the 2026-09-05 fixture: a day at the full $150 core with `funT: []` answered
 *   `{"fire":false,"reason":"the day is fully deployed — $150 of the $150 core is staked, less
 *   than one $5 minimum short."}`, and seven $5 core tickets ($35 staked, $115 still owed)
 *   answered `{"fire":false,"reason":"the ticket cap is spent — 7 of 7 core tickets are already
 *   on the day."}` — stranding $115 of core AND $25 of fun in one answer. A Saturday whose lock
 *   deploys the whole core and whose parlay did not clear the gate at the lock instant sits at $0
 *   of its $25 for the life of the day: the core allotment working PERFECTLY is exactly when the
 *   fun money is thrown away.
 *
 *   THE RULE NOW: two INDEPENDENT gates. The attempt fires when EITHER the core has room and a
 *   free ticket slot OR the fun bucket is genuinely empty, and the decision says which arm(s)
 *   opened. Neither bucket may exceed its own allotment; neither may veto the other.
 *
 * M(b) — A PLAN WITH A FUN TICKET AND NO CORE TICKET WAS DISCARDED WHOLE, AND SPENT THE ATTEMPT.
 *   `planCfbTopUp` builds `fun` independently of `tickets`, and the fun gate is looser than the
 *   core's (CFB_RULES.fun.minEvPct = -3 against CFB_RULES.minEvPct = 2), so a narrowed board can
 *   clear the parlay while seating no core ticket at all — which is EVERY fun-only fire above,
 *   where the core room is $0 and `buildCfbCard`'s admit loop breaks on the first pass. The route
 *   required `plan.tickets.length`, so it answered `skipped`/`raced` and dropped `plan.fun` on the
 *   floor — while the claim it had already written stayed on the entry with `core: 0`, counting
 *   against CFB_TOPUP_MAX and arming the 45-minute retry window. Two such pokes spent the whole
 *   day's attempt budget and seated nothing, with $25 available the entire time.
 *
 *   THE BLOCKER, and why `CfbTopUpRecord` changed shape: a completed fun-only attempt records
 *   `{ core: 0, stake: 0 }`, which the claim filters read as an IN-FLIGHT CLAIM — the exact
 *   ambiguity CRITIC 6 exploited. So a row now says so itself: `filled` is false on a claim and
 *   true on a completed attempt, and every filter tests THAT instead of `core === 0`. A row
 *   written before this change carries no `filled` at all; for those the old reading is still
 *   exact, because `claimCfbTopUp` was the only writer that could ever produce `core: 0, stake: 0`.
 * ======================================================================================== */
describe("DEFECT M (2026-09-06) — the core and fun allotments are INDEPENDENT gates", () => {
  const gameIds = () => slateAt(LOCKS_AT).games.map((g) => g.id);
  const LATER = LOCKS_AT + 15 * 60_000;
  /** the evening lines, on games no seeded core ticket sits on */
  const EXTRA = ["401858430", "401862701", "401869960"];

  it("M(a): A DAY AT THE FULL $250 CORE WITH AN EMPTY FUN BUCKET still fires — on the fun arm alone", () => {
    const full = serverEntry(DATE, { stakes: [50, 50, 50, 50, 50], games: gameIds().slice(0, 5), lockedAt: LOCKS_AT });
    expect(coreStakeOf(full)).toBe(CFB_PAPER.daily);
    expect(full.funT).toHaveLength(0); // $0 of the $25, and the core gate never let anything ask
    const d = lockServerMod.decideCfbTopUp(full, LATER);
    expect(d.fire).toBe(true);
    expect(d).toMatchObject({ fire: true, core: false, fun: true });
  });

  it("M(a): THE TICKET CAP strands the core, but it may not strand the fun money too", () => {
    const seven = serverEntry(DATE, { stakes: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5], games: gameIds().slice(0, 10), lockedAt: LOCKS_AT }); // 2026-09-08: ten $5 singles fill the widened ticket cap
    expect(seven.core).toHaveLength(CFB_RULES.tickets.max);
    expect(coreStakeOf(seven)).toBe(50); // $200 of core owed, and no slot to seat it in
    const d = lockServerMod.decideCfbTopUp(seven, LATER);
    expect(d.fire).toBe(true);
    expect(d).toMatchObject({ fire: true, core: false, fun: true });
  });

  it("M(a): BOTH BUCKETS FULL is still a free refusal, and it names BOTH of them", () => {
    const done = serverEntry(DATE, { stakes: [50, 50, 50, 50, 50], games: gameIds().slice(0, 5), lockedAt: LOCKS_AT, fun: CFB_PAPER.fun });
    const d = lockServerMod.decideCfbTopUp(done, LATER);
    expect(d.fire).toBe(false);
    expect(String((d as { reason: string }).reason)).toMatch(/fully deployed/i);
    expect(String((d as { reason: string }).reason)).toMatch(/fun/i);
    /* ...and the core arm alone is not enough to fire when the core is full: */
    const d2 = lockServerMod.decideCfbTopUp(serverEntry(DATE, { stakes: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5], games: gameIds().slice(0, 10), lockedAt: LOCKS_AT, fun: CFB_PAPER.fun }), LATER);
    expect(d2.fire).toBe(false);
    expect(String((d2 as { reason: string }).reason)).toMatch(/ticket cap/i);
  });

  it("M(b): A FUN-ONLY PLAN IS REAL: no core ticket fits, and the parlay still clears", () => {
    const full = serverEntry(DATE, { stakes: [50, 50, 50, 50, 50], games: gameIds().slice(0, 5), lockedAt: LOCKS_AT });
    const plan = lockServerMod.planCfbTopUp(richerSlate(LATER, EXTRA) as CfbBoard, full, { now: LATER, bankroll: 2500, room: 0, slots: 1, n: 1 });
    expect(plan.tickets).toHaveLength(0);
    expect(plan.fun).toHaveLength(1);
    expect(plan.funStake).toBe(CFB_PAPER.fun);
    expect(plan.fun[0].id).toBe(`cfb-${DATE}-topup1-fun-1`);
  });

  it("M(a)+M(b): THE POINT — a full-core day gains its $25, the core is untouched, and the attempt is recorded FILLED", async () => {
    const day = serverEntry(DATE, { stakes: [50, 50, 50, 50, 50], games: gameIds().slice(0, 5), lockedAt: LOCKS_AT });
    const fr = seed([day]);
    setNow(LATER);
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => richerSlate(now, EXTRA));

    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.status).toBe("already-locked");
    const t = topUpOf(body);
    expect(t.action).toBe("topped-up");
    expect(t.core).toBe(0);
    expect(t.stake).toBe(0);
    expect(t.fun).toBe(1);
    expect(t.funStake).toBe(CFB_PAPER.fun);
    expect(t.funRoom).toBe(0);
    expect(t.buckets).toEqual({ core: false, fun: true });

    const e = fr.ledger()[0];
    /* the CORE is untouched — byte for byte, and still exactly its own allotment */
    expect(e.core).toEqual(day.core);
    expect(coreStakeOf(e)).toBe(CFB_PAPER.daily);
    /* ...and the fun bucket is exactly its own allotment, never more */
    expect(e.funT).toHaveLength(1);
    expect(e.funT[0].stake).toBeLessThanOrEqual(CFB_PAPER.fun);
    expect(e.funT.reduce((s, x) => s + x.stake, 0)).toBe(CFB_PAPER.fun);
    expect(e.funT[0].bucket).toBe("fun");
    const ids = [...e.core, ...e.funT].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of e.funT[0].legs) expect(e.games[l.gkey]).toBeDefined();
    expect(String(e.note)).toMatch(/Fun: \+\$25/);
    /* THE REGRESSION: the attempt is FILLED, so no later poke reads it as an in-flight claim */
    expect(topUpsOn(e)).toHaveLength(1);
    expect(topUpsOn(e)[0]).toMatchObject({ n: 1, core: 0, stake: 0, fun: 1, filled: true });
  });

  it("M(b): TWO OVERLAPPING POKES CANNOT SEAT TWO FUN TICKETS — the loser reads the parlay that stands", async () => {
    const day = serverEntry(DATE, { stakes: [50, 50, 50, 50, 50], games: gameIds().slice(0, 5), lockedAt: LOCKS_AT });
    const fr = seed([day]);
    setNow(LATER);
    /* poke A runs end to end inside poke B's own keyless ESPN read — the window between B's GET
       snapshot and B's write, exactly as the CRITIC 6 race is driven */
    let fired = false;
    vi.mocked(espnEvents).mockImplementation(async (d: string) => {
      if (d === DATE && !fired) {
        fired = true;
        await call(); // ← poke A
      }
      return ESPN.events;
    });
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => richerSlate(now, EXTRA));

    const { status, body } = await call(); // ← poke B
    expect(status).toBe(200);
    expect(topUpOf(body).action).toBe("skipped");
    expect(topUpOf(body).raced).toBe(true);

    const e = fr.ledger()[0];
    expect(e.funT).toHaveLength(1);
    expect(e.funT.reduce((s, x) => s + x.stake, 0)).toBe(CFB_PAPER.fun);
    expect(coreStakeOf(e)).toBe(CFB_PAPER.daily);
    const ids = [...e.core, ...e.funT].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(topUpsOn(e)).toHaveLength(1);
    expect(topUpsOn(e)[0]).toMatchObject({ filled: true, fun: 1 });
  });

  it("M(b): A FILLED FUN-ONLY ROW IS SOMEBODY'S COMPLETED ATTEMPT — only an UNFILLED row is a claim", () => {
    const rows = [
      { at: LOCKS_AT, n: 1, core: 0, stake: 0, fun: 1, filled: true }, // a completed FUN-ONLY attempt
      { at: LOCKS_AT, n: 2, core: 0, stake: 0, filled: false }, // somebody's claim, still in flight
    ];
    const e = serverEntry(DATE, { stakes: [25, 25, 25], games: gameIds().slice(0, 3), lockedAt: LOCKS_AT, topUps: rows });
    const now = LOCKS_AT + 60 * 60_000; // past CFB_TOPUP_RETRY_MS, so the retry window is not what refuses

    /* a poke holding NO claim counts both rows: the cap is spent */
    const none = lockServerMod.decideCfbTopUp(e, now);
    expect(none.fire).toBe(false);
    expect(String((none as { reason: string }).reason)).toMatch(/cap is spent \(2 of 2\)/);

    /* the poke that HOLDS the unfilled ordinal 2 does not count its own attempt in flight */
    const own = lockServerMod.decideCfbTopUp(e, now, { claim: 2 });
    expect(own).toMatchObject({ fire: true, n: 2 });

    /* THE POINT: ordinal 1 carries `core: 0` and is NOT a claim — it is a finished fun-only
       attempt, and it must count against the cap for everyone, including a poke that names it */
    const stale = lockServerMod.decideCfbTopUp(e, now, { claim: 1 });
    expect(stale.fire).toBe(false);
    expect(String((stale as { reason: string }).reason)).toMatch(/cap is spent \(2 of 2\)/);
  });
});

/* ==========================================================================================
 * THE MUTATION PASS (2026-09-06) — two lines the 27-mutant sweep found unpinned. The SOURCE was
 * correct in both cases; nothing below changes behaviour, and each test is the pin that was
 * missing. Both are pure: no route, no fixture clock, no store.
 * ======================================================================================== */
describe("MUTANTS (2026-09-06) — two correct lines nothing was asserting", () => {
  const gameIds = () => slateAt(LOCKS_AT).games.map((g) => g.id);

  /**
   * M1 SURVIVED: replacing the claim lookup with `rows.find((r) => r.n === opts.claim)` — matching
   * by ORDINAL ALONE — left the whole suite green, because the second, independent guarantee (a
   * fresh ordinal takes `Math.max(attempts + 1, maxN + 1)`, where `const attempts = others.length`)
   * makes ordinal collision unreachable
   * THROUGH THE ROUTE. It is reachable directly, and it is the cap: a poke that names a completed
   * attempt's ordinal would have its own third attempt past CFB_TOPUP_MAX.
   *
   * CITATION CORRECTED (INSTRUCTION 45, 2026-09-06, DEFECT C3). This line quoted the fresh-ordinal
   * expression as `Math.max(used + 1, maxN + 1)`. GREPPED THIS TURN: `decideCfbTopUp`
   * (src/lib/cfb/lock-server.ts) returns `n: held ? (opts!.claim as number) : Math.max(attempts + 1,
   * maxN + 1)`, and `used` is a DIFFERENT quantity in the same function — `const used =
   * others.filter(spentCoreAttempt).length`, the attempts that spent CORE money, which since the
   * fun-only completion of DEFECT M(b) is no longer every other row. Quoting `used` here claimed the
   * fresh ordinal skips only core-spending attempts; it skips ALL of them. A REWRITE, not a
   * loosening: the assertion below is untouched, only the sentence explaining why it holds.
   *
   * The invariant, stated as it now is: a FILLED row at the claimed ordinal is somebody's
   * COMPLETED attempt and must count for everyone. A row from before `filled` existed carries none
   * — every such row was written on success and carries `core > 0`, so it reads as filled too.
   */
  it("M1: a COMPLETED row at the claimed ordinal still counts — a third attempt is refused", () => {
    const e = serverEntry(DATE, {
      stakes: [25, 25, 25],
      games: gameIds().slice(0, 3),
      lockedAt: LOCKS_AT,
      topUps: [
        { at: LOCKS_AT, n: 1, core: 3, stake: 75 },
        { at: LOCKS_AT, n: 2, core: 1, stake: 25 },
      ],
    });
    const d = lockServerMod.decideCfbTopUp(e, LOCKS_AT + 15 * 60_000, { claim: 1 });
    expect(d.fire).toBe(false);
    expect(String((d as { reason: string }).reason)).toMatch(/cap is spent \(2 of 2\)/);
  });

  /**
   * M3 SURVIVED: restoring `${tickets.length + 1}` as the ticket-id index — the pre-CRITIC-6
   * numbering, which restarts at 1 on every plan — left the suite green. The ids KEY THE GRADING
   * MAP, so an index that restarts is how two bets end up sharing one verdict. Nothing asserted
   * that the index counts on from the core the plan is APPENDED TO.
   */
  it("M3: top-up ticket ids count on from the entry's own core, and the fun id names the attempt", () => {
    const three = serverEntry(DATE, { stakes: [25, 25, 25], games: LOCK_GAMES, lockedAt: LOCKS_AT });
    expect(three.core).toHaveLength(3);
    const now = LOCKS_AT + 15 * 60_000;
    const plan = lockServerMod.planCfbTopUp(richerSlate(now, ["401858430", "401862701", "401869960"]) as CfbBoard, three, {
      now,
      bankroll: 2500,
      room: 75,
      slots: CFB_RULES.tickets.max - three.core.length,
      n: 1,
    });
    expect(plan.tickets.length).toBeGreaterThan(0);
    expect(plan.tickets.map((t) => t.id)).toEqual(plan.tickets.map((_t, i) => `cfb-${DATE}-topup1-core-${three.core.length + i + 1}`));
    expect(plan.tickets[0].id).toBe(`cfb-${DATE}-topup1-core-4`);
    expect(plan.fun.map((t) => t.id)).toEqual([`cfb-${DATE}-topup1-fun-1`]);
  });
});

/* ==========================================================================================
 * THE SECOND CRITIC'S REGRESSION PASS (INSTRUCTION 45, 2026-09-06). The 48-hour void widened in
 * DEFECT I(a) is honest about a game nobody will ever score — and it was TERMINAL, which is a
 * different claim and a false one. S1 makes it provisional; S2 stops a date whose ESPN read
 * THROWS from holding the whole read budget for ever.
 * ======================================================================================== */

describe("DEFECT S1 (2026-09-06) — the 48-hour void is PROVISIONAL, not terminal", () => {
  /** the fixture events for `d`, every game FINAL with a score EXCEPT the named ids, which ESPN
      still calls IN PROGRESS — the lightning-suspended game that has not been finalised YET */
  const suspendedEventsFor = (d: string, suspended: string[]) =>
    (eventsFor(d) as Record<string, any>[]).map((e) => {
      const off = suspended.includes(String(e.id));
      const type = off
        ? { name: "STATUS_SUSPENDED", state: "in", completed: false, detail: "Suspended", shortDetail: "Susp" }
        : { name: "STATUS_FINAL", state: "post", completed: true, detail: "Final", shortDetail: "Final" };
      e.status = { ...e.status, type };
      e.competitions[0].status = { ...e.competitions[0].status, type };
      for (const c of e.competitions[0].competitors as Record<string, any>[]) {
        c.score = off ? "14" : c.homeAway === "home" ? "31" : "17";
      }
      return e;
    });

  /** every game FINAL with a score — the resumed game's real result, 50 hours late */
  const finalEventsFor = (d: string) =>
    (eventsFor(d) as Record<string, any>[]).map((e) => {
      const type = { name: "STATUS_FINAL", state: "post", completed: true, detail: "Final", shortDetail: "Final" };
      e.status = { ...e.status, type };
      e.competitions[0].status = { ...e.competitions[0].status, type };
      for (const c of e.competitions[0].competitors as Record<string, any>[]) c.score = c.homeAway === "home" ? "31" : "17";
      return e;
    });

  const AT_49H = T("2026-09-07T17:00:00Z"); // 49 h past the 16:00Z kickoffs — past the void
  const AT_51H = T("2026-09-07T19:00:00Z"); // the resumed game's final has landed
  const INSIDE_HORIZON = T("2026-09-12T15:00:00Z"); // ~6.96 days past the last kickoff
  const PAST_HORIZON = T("2026-09-13T15:00:00Z"); // ~7.96 days past the last kickoff

  it("S1: A GAME THAT FINALISES 50 h LATE is voided at 48 h and then RE-GRADED to its real result", async () => {
    const fr = fakeRedis();
    expect((await call()).body.status).toBe("locked");
    const staked = fr.ledger()[0];
    const off = staked.core[0].legs[0].gkey; // suspended for weather at 20:00, resumed 50 h later

    /* POKE 1, 49 h on: ESPN still calls it live, so the desk voids it — that much is DEFECT I(a)
       and it stays. What must NOT follow is that the day is finished with the money forfeited. */
    setNow(AT_49H);
    espnByDate({ "2026-09-07": [], "2026-09-06": [], [DATE]: suspendedEventsFor(DATE, [off]) });
    const p1 = await call(req());
    expect((p1.body.settle as Record<string, unknown>).reads).toBe(1);
    const voided = fr.ledger().find((e) => e.date === DATE)!;
    expect(voided.grading!.tickets[staked.core[0].id].result).toBe("ungradable");
    expect(voided.grading!.done).toBe(true);

    /* THE POINT: two hours later the game has finalised. A void is what the desk says while it
       waits, not a verdict it refuses to revisit — the date must still be a candidate. */
    expect(lockServerMod.cfbSettleCandidate(voided, AT_51H)).toBe(true);

    setNow(AT_51H);
    espnByDate({ "2026-09-07": [], "2026-09-06": [], [DATE]: finalEventsFor(DATE) });
    const p2 = await call(req());
    const s2 = p2.body.settle as Record<string, unknown>;
    expect(s2.reads).toBe(1);
    expect((s2.days as Record<string, unknown>[])[0]).toMatchObject({ date: DATE, action: "settled", done: true });
    const scored = fr.ledger().find((e) => e.date === DATE)!;
    expect(scored.grading!.tickets[staked.core[0].id].result).not.toBe("ungradable");
    expect(["won", "lost", "push"]).toContain(scored.grading!.tickets[staked.core[0].id].result);
    expect(scored.grading!.done).toBe(true);
    /* the money: the honest final is on the ledger, so the bankroll that sizes tomorrow's Kelly
       is no longer short by a ticket booked as a wash */
    expect(cfbBankroll({ base: CFB_BANK_BASE, asOf: CFB_PAPER.since, log: [] }, [scored])).not.toBe(
      cfbBankroll({ base: CFB_BANK_BASE, asOf: CFB_PAPER.since, log: [] }, [voided]),
    );
  });

  it("S1: A DATE WHOSE LEGS ARE ALL GENUINELY SETTLED is never re-read — the window is for VOIDS only", async () => {
    const fr = fakeRedis();
    await call();
    setNow(AT_51H);
    espnByDate({ "2026-09-07": [], "2026-09-06": [], [DATE]: finalEventsFor(DATE) });
    await call(req());
    const settled = fr.ledger().find((e) => e.date === DATE)!;
    expect(settled.grading!.done).toBe(true);
    expect(Object.values(settled.grading!.tickets).every((g) => g.result !== "ungradable")).toBe(true);
    expect(lockServerMod.cfbSettleCandidate(settled, INSIDE_HORIZON)).toBe(false);

    /* five days later, well inside the void window: nothing was voided, so nothing is re-read */
    setNow(INSIDE_HORIZON);
    espnByDate({ "2026-09-12": [], "2026-09-11": [], "2026-09-10": [], "2026-09-09": [] });
    const { body } = await call(req());
    const s = body.settle as Record<string, unknown>;
    expect(s.reads).toBe(0);
    expect((s.days as Record<string, unknown>[]).map((d) => d.date)).not.toContain(DATE);
  });

  it("S1: THE WINDOW IS BOUNDED — inside the horizon a void is re-read; past it the date is dropped", async () => {
    const fr = fakeRedis();
    await call();
    const staked = fr.ledger()[0];
    const off = staked.core[0].legs[0].gkey;

    setNow(AT_49H);
    espnByDate({ "2026-09-07": [], "2026-09-06": [], [DATE]: suspendedEventsFor(DATE, [off]) });
    await call(req());
    const voided = fr.ledger().find((e) => e.date === DATE)!;
    expect(voided.grading!.tickets[staked.core[0].id].result).toBe("ungradable");

    /* the constant is named, and it is the horizon the two probes below straddle */
    expect(cfbRulesMod.CFB_VOID_RECHECK_MS).toBe(7 * 24 * 3600_000);
    expect(lockServerMod.cfbSettleCandidate(voided, INSIDE_HORIZON)).toBe(true);
    expect(lockServerMod.cfbSettleCandidate(voided, PAST_HORIZON)).toBe(false);

    /* inside the horizon the game is STILL suspended: one ESPN read, zero odds credits, and the
       verdict stays the honest void */
    setNow(INSIDE_HORIZON);
    espnByDate({ "2026-09-12": [], "2026-09-11": [], "2026-09-10": [], "2026-09-09": [], [DATE]: suspendedEventsFor(DATE, [off]) });
    const inside = await call(req());
    expect((inside.body.settle as Record<string, unknown>).reads).toBe(1);
    expect(vi.mocked(slateFromEspn).mock.calls.map((c) => c[0])).toEqual([DATE]); // the lock's own pull, and nothing since
    expect(fr.ledger().find((e) => e.date === DATE)!.grading!.tickets[staked.core[0].id].result).toBe("ungradable");

    /* past it, the day is closed: an unmapped DATE would throw, and nothing reads it */
    setNow(PAST_HORIZON);
    espnByDate({ "2026-09-13": [], "2026-09-12": [], "2026-09-11": [], "2026-09-10": [] });
    const past = await call(req());
    const sp = past.body.settle as Record<string, unknown>;
    expect(sp.reads).toBe(0);
    expect((sp.days as Record<string, unknown>[]).map((d) => d.date)).not.toContain(DATE);
  });
});

describe("DEFECT S2 (2026-09-06) — a date whose ESPN read THROWS is stamped, so it cannot starve fresh dates", () => {
  const finalEventsFor = (d: string) =>
    (eventsFor(d) as Record<string, any>[]).map((e) => {
      const type = { name: "STATUS_FINAL", state: "post", completed: true, detail: "Final", shortDetail: "Final" };
      e.status = { ...e.status, type };
      e.competitions[0].status = { ...e.competitions[0].status, type };
      for (const c of e.competitions[0].competitors as Record<string, any>[]) c.score = c.homeAway === "home" ? "31" : "17";
      return e;
    });

  it("S2: TWO DATES WHOSE SCOREBOARD READ ALWAYS THROWS do not hold the budget — the third is read within three pokes", async () => {
    const games = slateAt(LOCKS_AT).games.map((g) => g.id).slice(0, 3);
    const BAD1 = "2026-09-05";
    const BAD2 = "2026-09-06";
    const GOOD = "2026-09-07";
    const fr = seed([BAD1, BAD2, GOOD].map((d) => serverEntry(d, { stakes: [25, 25, 25], games, lockedAt: T(`${d}T15:00:00Z`) })));

    /* an upstream 5xx pinned to two dates: every read of them throws, for ever. Every other date
       answers normally, so nothing else about the poke is broken. */
    vi.mocked(espnEvents).mockImplementation(async (d: string) => {
      if (d === BAD1 || d === BAD2) throw new Error(`espn 503 on ${d}`);
      if (d === GOOD) return finalEventsFor(GOOD);
      return [];
    });

    const seen: unknown[][] = [];
    for (const m of [0, 5, 10]) {
      setNow(T("2026-09-08T15:00:00Z") + m * 60_000);
      const { status, body } = await call(req());
      expect(status).toBe(200);
      seen.push(((body.settle as Record<string, unknown>).days as Record<string, unknown>[]).map((d) => [d.date, d.action]));
    }

    /* POKE 1: the two oldest go first and both throw — that is the upstream's fault, not a defect */
    expect(seen[0]).toEqual([
      [BAD1, "error"],
      [BAD2, "error"],
      [GOOD, "deferred"],
    ]);
    /* POKE 2 IS THE POINT: the two dates that just consumed a slot go to the BACK, so the date
       that has never been read gets one — and it finishes. */
    expect(seen[1][0]).toEqual([GOOD, "settled"]);
    const good = fr.ledger().find((e) => e.date === GOOD)!;
    expect(good.grading!.done).toBe(true);
    expect(cfbBankroll({ base: CFB_BANK_BASE, asOf: CFB_PAPER.since, log: [] }, fr.ledger())).not.toBe(CFB_BANK_BASE);
    /* ...and the failing dates are not corrupted: an error never writes a grading */
    expect(fr.ledger().find((e) => e.date === BAD1)!.grading).toBeNull();
    expect(fr.ledger().find((e) => e.date === BAD2)!.grading).toBeNull();
  });
});


/* ==========================================================================================
 * THE CONVERGENCE ROUND (INSTRUCTION 45, 2026-09-06). Josh, verbatim: "Parlay Lab CFB should've
 * been running the same $150 per day theoretical Core money and $25 Fun money per day."
 *
 * Five items, found by reading the green cut of the top-up / settle path against the mutation
 * sweep that ran over it. L1 and L2 are REGRESSIONS opened by earlier fixes in this same
 * instruction; L4 and L5 are pins over code that was already right and that a planted mutant
 * walked straight through.
 * ======================================================================================== */

/**
 * L1 — A FUN-ONLY FIRE THAT CANNOT SEAT ANYTHING STILL BOUGHT A PRICED BOARD, AND CHARGED IT TO
 * THE CORE'S ATTEMPT BUDGET.
 *
 * DEFECT M(a) made the two allotments independent gates, which is right: a day at the full $150
 * core with an empty fun bucket must still be able to seat its $25. But the arm it opened has no
 * free feasibility test of its own. `decideCfbTopUp` answers `{ fire: true, core: false, fun: true
 * }`, `topUpDate` then spends its keyless ESPN read, CLAIMS the attempt, and pays for a priced
 * game-lines board (6 Odds credits, measured on prod 2026-09-05: the quota moved 17578 → 17572) —
 * and only then does `planCfbTopUp` discover that a fun parlay cannot be built at all, because
 * CFB_RULES.fun.legs.min is 3 DISTINCT games and fewer than three games the core is not already
 * on are still ahead. The attempt is spent, the 45-minute retry window is armed, and the next
 * poke past that window spends the second one on the same $0.
 *
 * WORST CASE PER DATE: 18 Odds credits (the lock's own 6 plus 2 × 6) for nothing, against a
 * 2500/day plan that binds on a full Saturday.
 *
 * SECOND HALF: the used/cap counting did not distinguish the arms, so a fun attempt consumed a
 * CORE attempt. That never stranded core money on today's code (the fun arm is only consulted
 * when the core arm is already closed, and neither arm can re-open — room and slots only shrink),
 * but the accounting said something false about Josh's two pots of money, and the cap is the
 * thing that decides whether the $150 gets its second chance.
 */
describe("L1 (2026-09-06) — a fun arm that provably cannot seat refuses for FREE, and never spends a core attempt", () => {
  const gameIds = () => slateAt(LOCKS_AT).games.map((g) => g.id);
  const LATER = LOCKS_AT + 15 * 60_000;
  const EXTRA = ["401858430", "401862701", "401869960"];
  /** 16:10Z on the fixture slate: the ten 16:00Z games have kicked off, the two 16:30Z ones have not */
  const MID_SLATE = T("2026-09-05T16:10:00Z");
  const KICKED = ["401856634", "401856778", "401856780", "401858208", "401858425", "401858430"];

  it("L1: the trap is real — mid-slate, only TWO unseated games are still ahead and a parlay needs THREE", () => {
    const s = slateAt(MID_SLATE);
    const ahead = s.games.filter((g) => Date.parse(g.start) > MID_SLATE);
    expect(ahead.map((g) => g.id)).toEqual(["401858207", "401858432"]);
    expect(ahead.length).toBeLessThan(CFB_RULES.fun.legs.min);
    expect(CFB_RULES.fun.legs.min).toBe(3);
    for (const g of KICKED) expect(ahead.map((x) => x.id)).not.toContain(g);
  });

  it("L1: A FUN-ONLY FIRE THAT CANNOT SEAT ANYTHING COSTS ZERO PRICED BOARDS, and claims no attempt", async () => {
    const day = serverEntry(DATE, { stakes: [50, 50, 50, 50, 50], games: KICKED.slice(0, 5), lockedAt: LOCKS_AT });
    expect(coreStakeOf(day)).toBe(CFB_PAPER.daily); // the core arm is shut
    expect(day.funT).toHaveLength(0); // ...and the fun arm is the only one open
    const fr = seed([day]);
    setNow(MID_SLATE);
    expect(lockServerMod.decideCfbTopUp(day, MID_SLATE)).toMatchObject({ fire: true, core: false, fun: true });

    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.status).toBe("already-locked");
    const t = topUpOf(body);
    expect(t.action).toBe("skipped");
    expect(String(t.reason)).toMatch(/fun parlay needs 3 distinct games/);

    /* THE POINT — the refusal is FREE: no priced board, so no Odds API credit */
    expect(vi.mocked(slateFromEspn).mock.calls.length).toBe(0);
    /* ...and no attempt was claimed, so the day keeps both of its chances */
    expect(topUpsOn(fr.ledger()[0])).toHaveLength(0);
    expect(fr.sets().length).toBe(0);
    expect(fr.ledger()[0]).toEqual(day);
  });

  it("L1: THE CORE ARM IS UNAFFECTED — an unseated game still ahead is enough for the core, whatever the fun needs", async () => {
    const short = serverEntry(DATE, { stakes: [25, 25, 25], games: KICKED.slice(0, 3), lockedAt: LOCKS_AT, fun: CFB_PAPER.fun });
    const fr = seed([short]);
    setNow(MID_SLATE);
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => richerSlate(now, ["401858207", "401858432"]));
    const { body } = await call();
    /* the core arm is open and only two games are ahead — a core single needs ONE game, so this
       poke MUST still buy its board. The free refusal above is the FUN arm's rule, not a new
       ceiling on the core's. */
    expect(vi.mocked(slateFromEspn).mock.calls.length).toBe(1);
    expect(topUpOf(body).action).toBe("topped-up");
    expect(coreStakeOf(fr.ledger()[0])).toBeGreaterThan(75);
  });

  it("L1: A SPENT FUN ATTEMPT DOES NOT CONSUME A CORE ATTEMPT — each allotment counts its own", () => {
    const funRows = [
      { at: LOCKS_AT, n: 1, core: 0, stake: 0, fun: 0, filled: true, arms: { core: false, fun: true } },
      { at: LOCKS_AT + 60_000, n: 2, core: 0, stake: 0, fun: 1, filled: true, arms: { core: false, fun: true } },
    ];
    const now = LOCKS_AT + 2 * 3600_000; // past CFB_TOPUP_RETRY_MS, so the retry window is not what answers
    const e = serverEntry(DATE, { stakes: [25, 25, 25], games: gameIds().slice(0, 3), lockedAt: LOCKS_AT, fun: CFB_PAPER.fun, topUps: funRows });
    expect(coreStakeOf(e)).toBe(75); // $175 of the $250 still owed
    const d = lockServerMod.decideCfbTopUp(e, now);
    expect(d).toMatchObject({ fire: true, core: true, fun: false });
    expect((d as { used: number }).used).toBe(0);

    /* ...and the core's OWN two attempts still bind it */
    const coreRows = [
      { at: LOCKS_AT, n: 1, core: 0, stake: 0, fun: 0, filled: true, arms: { core: true, fun: false } },
      { at: LOCKS_AT + 60_000, n: 2, core: 1, stake: 25, fun: 0, filled: true, arms: { core: true, fun: false } },
    ];
    const spent = lockServerMod.decideCfbTopUp(
      serverEntry(DATE, { stakes: [25, 25, 25], games: gameIds().slice(0, 3), lockedAt: LOCKS_AT, fun: CFB_PAPER.fun, topUps: coreRows }),
      now,
    );
    expect(spent.fire).toBe(false);
    expect(String((spent as { reason: string }).reason)).toMatch(/cap is spent \(2 of 2\)/);
  });

  it("L1: A LEGACY ROW CARRYING NO ARMS COUNTS AGAINST BOTH — an old blob never buys extra spending", () => {
    const legacy = [
      { at: LOCKS_AT, n: 1, core: 0, stake: 0, filled: true },
      { at: LOCKS_AT + 60_000, n: 2, core: 1, stake: 25, filled: true },
    ];
    const now = LOCKS_AT + 2 * 3600_000;
    const withCoreRoom = serverEntry(DATE, { stakes: [25, 25, 25], games: gameIds().slice(0, 3), lockedAt: LOCKS_AT, fun: CFB_PAPER.fun, topUps: legacy });
    const a = lockServerMod.decideCfbTopUp(withCoreRoom, now);
    expect(a.fire).toBe(false);
    expect(String((a as { reason: string }).reason)).toMatch(/cap is spent \(2 of 2\)/);

    const withFunRoom = serverEntry(DATE, { stakes: [50, 50, 50, 50, 50], games: gameIds().slice(0, 5), lockedAt: LOCKS_AT, topUps: legacy });
    const b = lockServerMod.decideCfbTopUp(withFunRoom, now);
    expect(b.fire).toBe(false);
    expect(String((b as { reason: string }).reason)).toMatch(/cap is spent \(2 of 2\)/);
  });

  it("L1: THE ROW SAYS WHICH ARM IT SERVED — a fun-only attempt is recorded as one", async () => {
    const day = serverEntry(DATE, { stakes: [50, 50, 50, 50, 50], games: gameIds().slice(0, 5), lockedAt: LOCKS_AT });
    const fr = seed([day]);
    setNow(LATER);
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => richerSlate(now, EXTRA));
    const { body } = await call();
    expect(topUpOf(body).action).toBe("topped-up");
    expect(topUpsOn(fr.ledger()[0])[0]).toMatchObject({ n: 1, filled: true, fun: 1, arms: { core: false, fun: true } });
  });
});

/**
 * L2 — THE VOID → RESULT TRANSITION IS ONE-WAY AND, INSIDE THE NEW WINDOW, SINGLE-SOURCED.
 *
 * DEFECT S1 made the 48-hour void PROVISIONAL: for CFB_VOID_RECHECK_MS (7 days) past a date's last
 * kickoff, `cfbSettleCandidate` keeps the date readable so a game that finalises late can still be
 * scored, and `overlayCfbGrading` accepts the late verdict because `ungradable` is deliberately
 * NOT in SETTLED. That is the right fix for the money — a genuine winner booked as a wash keeps
 * cfbBankroll permanently low — and it opened a door that was shut before it: for seven days, ONE
 * later ESPN read can overwrite a real void with a win or a loss, with no second confirmation, and
 * the replacement IS settled, so nothing can ever correct it afterwards.
 *
 * The shapes that produce a wrong verdict from a single read are ordinary: a scoreboard correction,
 * a gkey that resolves to the wrong game, a payload `finalsFromEspn` mis-parses — and the trap the
 * grader itself carries, `settle()`'s `stood === 0` arm, which hands a legless ticket a PUSH with
 * its stake back. Before this round a voided day was closed for good, so none of it could land.
 *
 * THE RULE NOW: a stored `ungradable` may be replaced only by a CORROBORATED verdict — every leg of
 * that ticket graded from a game ESPN reports `final` with both scores finite, which is exactly
 * what `gradeCfbLeg` requires before it returns won / lost / push. A verdict DERIVED from a partial
 * payload (settle()'s "a leg lost" while another leg has no final at all, or the legless push) is
 * refused and the honest void stands. Nothing else about the overlay changed: a stored result that
 * is pending or missing still takes the incoming verdict, and a SETTLED one is still never touched.
 */
describe("L2 (2026-09-06) — a void is overwritten only by a corroborated final, and only inside the window", () => {
  const G1 = "401858425";
  const G2 = "401856634";
  const leg = (g: string) => ({
    label: `leg ${g}`,
    prop: "Spread",
    cz: -110,
    gkey: g,
    lkey: `${g}|spread|home|-3`,
    market: "spread" as const,
    side: "home" as const,
    line: -3,
    teamId: null,
    prob: 0.52,
    push: 0,
  });
  const parlay: CfbTicket = {
    id: `cfb-${DATE}-core-1`,
    bucket: "core",
    name: "PARLAY · two legs",
    stake: 25,
    czOdds: 150,
    czDec: 2.5,
    prob: 45,
    czEv: 3,
    legs: [leg(G1), leg(G2)],
  };
  const entryWith = (t: CfbTicket): CfbLedgerEntry => ({
    ...serverEntry(DATE, { stakes: [25], games: [G1], lockedAt: LOCKS_AT }),
    core: [t],
  });
  const VOID = { tickets: { [parlay.id]: { result: "ungradable", payout: 0, detail: "a leg is void" } }, legs: {}, done: true };

  it("L2: A PARTIAL PAYLOAD CANNOT BOOK A VOID AS A LOSS — one leg final, the other never finalised", () => {
    const partial = {
      tickets: { [parlay.id]: { result: "lost", payout: 0, detail: "a leg lost" } },
      legs: {
        [parlay.legs[0].lkey]: { result: "lost", detail: "31-17 · margin +14 vs -3 · short by 4" },
        [parlay.legs[1].lkey]: { result: "ungradable", detail: "not final · 48h past kickoff — void" },
      },
      done: true,
    };
    const out = lockServerMod.overlayCfbGrading(VOID, partial, entryWith(parlay))!;
    expect(out.tickets[parlay.id].result).toBe("ungradable");
    expect(out.tickets[parlay.id].payout).toBe(0);
  });

  it("L2: A LEGLESS PUSH CANNOT BOOK A VOID AS A STAKE RETURNED — settle()'s own trap never lands on money", () => {
    const legless = entryWith({ ...parlay, legs: [] });
    const derived = {
      tickets: { [parlay.id]: { result: "push", payout: 25, dec: 1, detail: "every leg pushed — stake returned" } },
      legs: {},
      done: true,
    };
    const out = lockServerMod.overlayCfbGrading(VOID, derived, legless)!;
    expect(out.tickets[parlay.id].result).toBe("ungradable");
    expect(out.tickets[parlay.id].payout).toBe(0);
  });

  it("L2: A CORROBORATED FINAL DOES LAND — every leg scored from a real final, push included", () => {
    const real = {
      tickets: { [parlay.id]: { result: "won", payout: 62.5, dec: 2.5, detail: "won · 1 leg pushed and dropped out" } },
      legs: {
        [parlay.legs[0].lkey]: { result: "won", detail: "31-17 · margin +14 vs -3 · covered by 11" },
        [parlay.legs[1].lkey]: { result: "push", detail: "20-17 · margin +3 vs -3 · push" },
      },
      done: true,
    };
    const out = lockServerMod.overlayCfbGrading(VOID, real, entryWith(parlay))!;
    expect(out.tickets[parlay.id].result).toBe("won");
    expect(out.tickets[parlay.id].payout).toBe(62.5);
    expect(out.done).toBe(true);
  });

  it("L2: THE RULE IS ABOUT VOIDS ONLY — a PENDING ticket still takes a partial verdict, as it always did", () => {
    const pending = { tickets: { [parlay.id]: { result: "pending", payout: 0, detail: "awaiting a final" } }, legs: {}, done: false };
    const partial = {
      tickets: { [parlay.id]: { result: "lost", payout: 0, detail: "a leg lost" } },
      legs: { [parlay.legs[0].lkey]: { result: "lost", detail: "31-17 · short by 4" } },
      done: false,
    };
    const out = lockServerMod.overlayCfbGrading(pending, partial, entryWith(parlay))!;
    expect(out.tickets[parlay.id].result).toBe("lost");
    /* ...and a SETTLED result is still never overwritten by anything, corroborated or not */
    const settled = { tickets: { [parlay.id]: { result: "won", payout: 62.5, dec: 2.5, detail: "won" } }, legs: {}, done: true };
    expect(lockServerMod.overlayCfbGrading(settled, partial, entryWith(parlay))!.tickets[parlay.id].result).toBe("won");
  });

  it("L2: THE EDGE IS ONE-WAY IN TIME — past K + CFB_VOID_RECHECK_MS a real final on the wire never reaches the void", async () => {
    const suspendedEventsFor = (d: string, suspended: string[]) =>
      (eventsFor(d) as Record<string, any>[]).map((e) => {
        const off = suspended.includes(String(e.id));
        const type = off
          ? { name: "STATUS_SUSPENDED", state: "in", completed: false, detail: "Suspended", shortDetail: "Susp" }
          : { name: "STATUS_FINAL", state: "post", completed: true, detail: "Final", shortDetail: "Final" };
        e.status = { ...e.status, type };
        e.competitions[0].status = { ...e.competitions[0].status, type };
        for (const c of e.competitions[0].competitors as Record<string, any>[]) c.score = off ? "14" : c.homeAway === "home" ? "31" : "17";
        return e;
      });
    const finalEventsFor = (d: string) =>
      (eventsFor(d) as Record<string, any>[]).map((e) => {
        const type = { name: "STATUS_FINAL", state: "post", completed: true, detail: "Final", shortDetail: "Final" };
        e.status = { ...e.status, type };
        e.competitions[0].status = { ...e.competitions[0].status, type };
        for (const c of e.competitions[0].competitors as Record<string, any>[]) c.score = c.homeAway === "home" ? "31" : "17";
        return e;
      });

    const fr = fakeRedis();
    expect((await call()).body.status).toBe("locked");
    const staked = fr.ledger()[0];
    const off = staked.core[0].legs[0].gkey;

    setNow(T("2026-09-07T17:00:00Z")); // 49 h on: ESPN still calls it live, so the desk voids it
    espnByDate({ "2026-09-07": [], "2026-09-06": [], [DATE]: suspendedEventsFor(DATE, [off]) });
    await call(req());
    const voided = fr.ledger().find((e) => e.date === DATE)!;
    expect(voided.grading!.tickets[staked.core[0].id].result).toBe("ungradable");

    /* PAST THE HORIZON, with a REAL FINAL sitting on the wire for that very date: the date is not
       a candidate, so nothing reads it and the void stands. The window closes in one direction. */
    vi.mocked(espnEvents).mockClear();
    setNow(T("2026-09-13T15:00:00Z")); // ~7.96 days past the last kickoff
    espnByDate({ "2026-09-13": [], "2026-09-12": [], "2026-09-11": [], "2026-09-10": [], [DATE]: finalEventsFor(DATE) });
    const { body } = await call(req());
    const s = body.settle as Record<string, unknown>;
    expect(s.reads).toBe(0);
    expect(vi.mocked(espnEvents).mock.calls.filter((c) => c[0] === DATE)).toHaveLength(0);
    expect(fr.ledger().find((e) => e.date === DATE)!.grading!.tickets[staked.core[0].id].result).toBe("ungradable");
  });
});

/**
 * L5 — THREE MORE MUTATION SURVIVORS. The source was correct in all three; each test below is the
 * pin that was missing, and each was confirmed by re-planting its own mutant afterwards.
 *
 * A14  `decideCfbTopUp` gates the fun arm on `entry.funT.length === 0`, not on a stake comparison
 *      against CFB_PAPER.fun. Swapping it for `cfbStakeOf(entry.funT) < CFB_PAPER.fun` survived —
 *      yet the two rules diverge the moment a fun ticket is seated for LESS than $25, and the
 *      stake form would then write a SECOND fun parlay. The desk's rule (planCfbTopUp) is that an
 *      append is not a re-stake: seating the FIRST parlay onto a day that carries none removes no
 *      bet, and topping a short one toward $25 could only be done by replacing what stands.
 *
 * A15  `applyCfbTopUp`'s no-play clear had no pin at all; deleting the line leaves a day flagged
 *      `noPlay` while carrying freshly written tickets, and src/components/cfb/CfbBuilder.tsx
 *      renders a no-play banner over live money.
 *
 *      NOTE CORRECTED 2026-09-06 (D2). This paragraph quoted the line in its old, CORE-ONLY form
 *      — `if (next.noPlay && core.length) delete next.noPlay;` — which is not what the function
 *      says. That correction then went stale in its turn: it replaced the core-only quote with
 *      `if (next.noPlay && (core.length || funT.length)) delete next.noPlay;`, a ROW-COUNT form
 *      the function had ALREADY left behind, and shipped under a "read this turn" warrant that
 *      did not hold. CORRECTED AGAIN 2026-09-06 (the closing round's defect C3). GREPPED THIS
 *      TURN, src/lib/cfb/lock-server.ts's `applyCfbTopUp` says, as its last statement before the
 *      grading reopen:
 *
 *          if (next.noPlay && (staked > MONEY_EPS || funStaked > MONEY_EPS)) delete next.noPlay;
 *
 *      STAKED MONEY against MONEY_EPS, not array lengths — `staked` is `cfbStakeOf(core)` and
 *      `funStaked` is `cfbStakeOf(funT)`, both computed a few lines above for the note, and
 *      MONEY_EPS is that file's `1e-9`. The rule the row-count form encoded is a STRICT SUBSET of
 *      today's on every input this test drives (every ticket it seats carries a positive stake),
 *      so NO ASSERTION BELOW CHANGES — only the sentence that claimed to quote the source. What
 *      the widening added is that a $0 row no longer ends a no-play, which is pinned separately in
 *      tests/cfb-grade.test.ts under C3 and is not this test's subject.
 *
 *      BOTH BUCKETS, and the test below covers both: it applies a core-bearing plan, then the
 *      same plan with `tickets: []` so only the fun parlay is seated, and asserts `"noPlay" in`
 *      the result is false each time — then that a plan seating NEITHER leaves the honest flag
 *      standing. So "had no pin at all" describes the state this pass FOUND, not the state it
 *      leaves: the pin exists, and it covers the FUN bucket as well as the core. The whole write
 *      path is pinned separately at D3(c) below, through the route and off the stored entry.
 *
 * A20  the settle queue's tier reads `attemptedAt` and falls back to `gradedAt`; removing the
 *      fallback drops an entry stamped before DEFECT S2 to the never-read tier, which silently
 *      re-orders the starvation queue in favour of a date that was in fact just read.
 */
describe("L5 (2026-09-06) — three mutation survivors, pinned", () => {
  const gameIds = () => slateAt(LOCKS_AT).games.map((g) => g.id);
  const LATER = LOCKS_AT + 15 * 60_000;
  const EXTRA = ["401858430", "401862701", "401869960"];

  it("A14: the FUN arm is gated on an EMPTY bucket, never on a stake under $25", () => {
    const short = serverEntry(DATE, { stakes: [25, 25, 25], games: gameIds().slice(0, 3), lockedAt: LOCKS_AT, fun: 10 });
    expect(short.funT).toHaveLength(1);
    expect(short.funT[0].stake).toBeLessThan(CFB_PAPER.fun); // $10 of the $25 — a stake test would re-open the arm
    expect(lockServerMod.decideCfbTopUp(short, LATER)).toMatchObject({ fire: true, core: true, fun: false });

    /* ...and with the core shut too, the day refuses for FREE rather than write a second parlay */
    const full = serverEntry(DATE, { stakes: [50, 50, 50, 50, 50], games: gameIds().slice(0, 5), lockedAt: LOCKS_AT, fun: 10 });
    const d = lockServerMod.decideCfbTopUp(full, LATER);
    expect(d.fire).toBe(false);
    expect(String((d as { reason: string }).reason)).toMatch(/fun money is already on a parlay/);
  });

  it("A15: a NO-PLAY day that gains money is not a no-play day — for EITHER bucket", () => {
    const np: CfbLedgerEntry = { ...serverEntry(DATE, { stakes: [], games: gameIds().slice(0, 3), lockedAt: LOCKS_AT }), noPlay: true };
    expect(np.core).toHaveLength(0);
    expect(np.noPlay).toBe(true);
    const plan = lockServerMod.planCfbTopUp(richerSlate(LATER, EXTRA) as CfbBoard, np, {
      now: LATER,
      bankroll: 2500,
      room: CFB_PAPER.daily,
      slots: CFB_RULES.tickets.max,
      n: 1,
    });
    expect(plan.tickets.length).toBeGreaterThan(0);
    expect(plan.fun).toHaveLength(1);

    const withCore = lockServerMod.applyCfbTopUp(np, plan, LATER, 1);
    expect(withCore.core.length).toBeGreaterThan(0);
    expect("noPlay" in withCore).toBe(false);

    /* THE CARD FIX OF THIS ROUND MADE THE SECOND HALF REACHABLE: src/lib/cfb/card.ts now seats the
       fun parlay on a core-empty board, so a locked NO-PLAY day can be topped up with FUN money and
       no core ticket at all. $25 of live money under a no-play banner is the same defect. */
    const funOnly = { ...plan, tickets: [], stake: 0 };
    const withFun = lockServerMod.applyCfbTopUp(np, funOnly, LATER, 1);
    expect(withFun.core).toHaveLength(0);
    expect(withFun.funT).toHaveLength(1);
    expect("noPlay" in withFun).toBe(false);

    /* ...and a top-up that seats NOTHING leaves the honest no-play flag exactly where it was */
    const nothing = { ...plan, tickets: [], stake: 0, fun: [], funStake: 0 };
    expect(lockServerMod.applyCfbTopUp(np, nothing, LATER, 1).noPlay).toBe(true);
  });

  it("A20: an entry stamped `gradedAt` before DEFECT S2 keeps its place in the queue — the fallback is load-bearing", async () => {
    const finalEventsFor = (d: string) =>
      (eventsFor(d) as Record<string, any>[]).map((e) => {
        const type = { name: "STATUS_FINAL", state: "post", completed: true, detail: "Final", shortDetail: "Final" };
        e.status = { ...e.status, type };
        e.competitions[0].status = { ...e.competitions[0].status, type };
        for (const c of e.competitions[0].competitors as Record<string, any>[]) c.score = c.homeAway === "home" ? "31" : "17";
        return e;
      });
    const games = gameIds().slice(0, 3);
    const pendingGrading = (e: CfbLedgerEntry) => ({
      tickets: Object.fromEntries(e.core.map((t) => [t.id, { result: "pending", payout: 0, detail: "awaiting a final" }])),
      legs: {},
      done: false,
    });
    const day = (d: string, stamp: Record<string, number>): CfbLedgerEntry => {
      const base = serverEntry(d, { stakes: [25, 25, 25], games, lockedAt: T(`${d}T15:00:00Z`) });
      return { ...base, grading: pendingGrading(base) as CfbLedgerEntry["grading"], ...stamp } as CfbLedgerEntry;
    };
    const OLDEST_READ = T("2026-09-08T09:00:00Z");
    const MIDDLE_READ = T("2026-09-08T10:00:00Z");
    const NEWEST_READ = T("2026-09-08T11:00:00Z");
    /* the pre-DEFECT-S2 blob: it WAS read, and most recently of the three, but the deploy that
       read it only knew how to stamp `gradedAt`. Its tier must come from that number. */
    const LEGACY = "2026-09-05";
    const MID = "2026-09-06";
    const OLD = "2026-09-07";
    const fr = seed([day(LEGACY, { gradedAt: NEWEST_READ }), day(MID, { attemptedAt: MIDDLE_READ }), day(OLD, { attemptedAt: OLDEST_READ })]);

    setNow(T("2026-09-08T15:00:00Z"));
    /* only the two dates a correct queue may read are answerable; reading LEGACY throws */
    espnByDate({ "2026-09-08": [], [OLD]: finalEventsFor(OLD), [MID]: finalEventsFor(MID) });
    const { status, body } = await call(req());
    expect(status).toBe(200);
    const s = body.settle as Record<string, unknown>;
    expect((s.days as Record<string, unknown>[]).map((d) => [d.date, d.action])).toEqual([
      [OLD, "settled"],
      [MID, "settled"],
      [LEGACY, "deferred"],
    ]);
    expect(s.reads).toBe(cfbRulesMod.CFB_SETTLE.maxDatesPerPoke);
    /* the legacy day was not read, and its grading is untouched */
    expect(fr.ledger().find((e) => e.date === LEGACY)!.grading!.done).toBe(false);
    expect((fr.ledger().find((e) => e.date === LEGACY)! as Record<string, unknown>).gradedAt).toBe(NEWEST_READ);
  });
});

/* ==========================================================================================
 * D1 (INSTRUCTION 45, 2026-09-06) — A FULL-CORE DAY WITH AN EMPTY FUN BUCKET MAY NOT BUY THE
 * SAME UNSEATABLE BOARD TWICE INSIDE THE RETRY WINDOW.
 *
 * Josh, verbatim: "Parlay Lab CFB should've been running the same $150 per day theoretical Core
 * money and $25 Fun money per day". DEFECT M(a) made the fun arm fire on its own, which is what
 * that sentence asks for, and created a shape that had never existed before: a day whose CORE is
 * complete ($150, six tickets) and whose fun bucket is EMPTY fires with `{ core: false, fun: true }`
 * and pays for a priced board — one game-lines pull, 6 Odds credits — to learn that nothing on the
 * board clears CFB_RULES.fun (decimal 4-40, EV >= -3%). The route's own free refusal above the
 * pull (`!d.core && d.fun && openAhead < CFB_RULES.fun.legs.min`) cannot save it: that refusal is
 * arithmetic about DISTINCT GAMES, and this day has six unseated games still ahead carrying priced
 * sides. It is not a money defect — no path here stakes more than CFB_PAPER.daily or CFB_PAPER.fun
 * — but it is SPEND, on a Saturday where the 2500/day Odds cap already binds.
 *
 * The bound is CFB_TOPUP_RETRY_MS, the cooldown the core arm already has, and the pins below state
 * it as a credit cost rather than as a code shape: ONE priced board inside the window however many
 * times the ~15-minute ticker pokes, and — because a cooldown that never lifts is a silent kill —
 * a SECOND board once the window has elapsed.
 * ======================================================================================== */
describe("D1 (2026-09-06) — an empty fun-only attempt holds the next one off; the window is a cooldown, not a kill", () => {
  const gameIds = () => slateAt(LOCKS_AT).games.map((g) => g.id);
  const ATTEMPT1 = LOCKS_AT + 60_000; // 15:01Z — past `lockedAt`, and 59 min before the first kickoff
  const priced = () => vi.mocked(slateFromEspn).mock.calls.length;
  const EXTRA = ["401858430", "401862701", "401869960"];
  /** the shape DEFECT M(a) made reachable: every dollar of core deployed, $0 of the $25 */
  /* 2026-09-08: six seated games still ($250 = four $50 + two $25), so the six open games ahead —
     and the board that prices them and seats nothing — are exactly the ones the trap was measured on */
  const fullCoreEmptyFun = () => serverEntry(DATE, { stakes: [50, 50, 50, 50, 25, 25], games: gameIds().slice(0, 6), lockedAt: LOCKS_AT });

  it("D1: the trap is real — the day fires on the fun arm alone, six unseated games are still ahead, and the board seats NOTHING", () => {
    const day = fullCoreEmptyFun();
    expect(coreStakeOf(day)).toBe(CFB_PAPER.daily);
    expect(day.funT).toHaveLength(0);
    expect(lockServerMod.decideCfbTopUp(day, ATTEMPT1)).toMatchObject({ fire: true, room: 0, core: false, fun: true });

    /* the route's L1 free refusal is arithmetic about distinct games, and it does not apply here */
    const seated = lockServerMod.cfbCoreGamesOf(day);
    const openAhead = slateAt(ATTEMPT1).games.filter((g) => !seated.has(g.id) && Date.parse(g.start) > ATTEMPT1).length;
    expect(openAhead).toBe(6); // six of the twelve, and a fun parlay needs only CFB_RULES.fun.legs.min
    expect(openAhead).toBeGreaterThanOrEqual(CFB_RULES.fun.legs.min);

    /* ...and the board it would pay for prices plenty of sides and still seats nothing at all */
    const plan = lockServerMod.planCfbTopUp(slateAt(ATTEMPT1) as CfbBoard, day, { now: ATTEMPT1, bankroll: 2500, room: 0, slots: 1, n: 1 });
    expect(plan.pricedAhead).toBeGreaterThan(0);
    expect(plan.tickets).toHaveLength(0);
    expect(plan.fun).toHaveLength(0);
  });

  it("D1: ONE priced board inside CFB_TOPUP_RETRY_MS — every later poke in the window buys ZERO", async () => {
    const fr = seed([fullCoreEmptyFun()]);
    setNow(ATTEMPT1);
    const first = await call();
    expect(topUpOf(first.body).action).toBe("skipped");
    expect(priced()).toBe(1); // the one board this defect is allowed to buy
    expect(topUpsOn(fr.ledger()[0])).toHaveLength(1);
    expect(topUpsOn(fr.ledger()[0])[0]).toMatchObject({ n: 1, filled: false, arms: { core: false, fun: true } });

    /* the ~15-minute ticker keeps poking, and the prices are the ones just paid for. THE PIN IS
       THE CREDIT COUNT, asserted after EVERY poke rather than once at the end: the cost is what
       this defect is about, and a refusal that arrives with the board already bought is not a
       refusal. The reason is checked too, so the pin also says WHICH rule declined. */
    for (const m of [16, 31, 45]) {
      setNow(LOCKS_AT + m * 60_000);
      const { status, body } = await call();
      expect(status).toBe(200);
      expect(topUpOf(body).action).toBe("skipped");
      expect(priced()).toBe(1); // ← ZERO further boards, poke by poke
      expect(String(topUpOf(body).reason)).toMatch(/found nothing to seat|waits/i);
    }
    expect(priced()).toBe(1);
    expect(topUpsOn(fr.ledger()[0])).toHaveLength(1);
    expect(fr.ledger()[0].funT).toHaveLength(0);
    expect(coreStakeOf(fr.ledger()[0])).toBe(CFB_PAPER.daily);
  });

  it("D1: it is a COOLDOWN, not a kill — past the window the fun arm buys its second board and seats the $25", async () => {
    const fr = seed([fullCoreEmptyFun()]);
    setNow(ATTEMPT1);
    await call();
    expect(priced()).toBe(1);

    /* 46 minutes on — past CFB_TOPUP_RETRY_MS, still 13 minutes before the first kickoff — and the
       evening lines have posted on three games no core ticket sits on */
    setNow(ATTEMPT1 + cfbRulesMod.CFB_TOPUP_RETRY_MS + 60_000);
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => richerSlate(now, EXTRA));
    const { body } = await call();
    expect(topUpOf(body).action).toBe("topped-up");
    expect(topUpOf(body).buckets).toEqual({ core: false, fun: true });
    expect(priced()).toBe(2);

    const e = fr.ledger()[0];
    expect(e.funT).toHaveLength(1);
    expect(e.funT.reduce((s, t) => s + t.stake, 0)).toBe(CFB_PAPER.fun);
    expect(coreStakeOf(e)).toBe(CFB_PAPER.daily);
  });
});

/* ==========================================================================================
 * D3 (INSTRUCTION 45, 2026-09-06) — THE ROUTE-LEVEL GUARD FOR "A $25-ONLY DAY IS NOT A NO-PLAY".
 *
 * `applyCfbTopUp` clears `noPlay` for EITHER bucket, and L5/A15 pins that function directly. What
 * had no pin is the WHOLE WRITE PATH: the route re-reads the store, re-decides, rebuilds the plan
 * and SETs the merged ledger, and any one of those steps could put the flag back — the lock path a
 * few hundred lines below writes `noPlay: entry.noPlay === true` onto its own summary, so the shape
 * exists in this file. The pins below drive a FUN-ONLY top-up end to end through GET and read the
 * flag off the entry that actually landed in the store, because that entry is what
 * src/components/cfb/CfbBuilder.tsx renders its no-play banner from and what the merge rails carry
 * to the phone. A day whose only money is the $25 fun parlay must not report NO-PLAY anywhere.
 * ======================================================================================== */
describe("D3 (2026-09-06) — a fun-only seat is never re-flagged NO-PLAY by the route's own write path", () => {
  const gameIds = () => slateAt(LOCKS_AT).games.map((g) => g.id);
  const LATER = LOCKS_AT + 15 * 60_000;
  const EXTRA = ["401858430", "401862701", "401869960"];

  /**
   * THE BOARD WHOSE ONLY MONEY IS THE FUN PARLAY. Every priced edge is flattened to 0%: no core
   * ticket clears CFB_RULES.minEvPct (+2%), and the fun rows, gated at CFB_RULES.fun.minEvPct
   * (-3%), all survive. This is exactly the board src/lib/cfb/card.ts's independent fun gate was
   * changed for this round to serve — the shape that makes a locked NO-PLAY day topped up with
   * $25 and no core ticket at all reachable through the route.
   */
  const funOnlySlate = (now: number): CfbSlate => {
    const s = slateAt(now);
    return { ...s, games: s.games.map((g) => ({ ...g, rows: g.rows.map((r) => (r.evCz == null ? r : { ...r, evCz: 0 })) })) };
  };

  it("D3: the fun-only board is real — no core ticket clears +2%, and the parlay still clears -3%", () => {
    const card = buildCfbCard(funOnlySlate(LATER) as CfbBoard, { bankroll: 2500, daily: CFB_PAPER.daily, fun: CFB_PAPER.fun, now: LATER });
    expect(card.core).toHaveLength(0);
    expect(card.funT).toHaveLength(1);
    expect(card.funSum).toBe(CFB_PAPER.fun);
    expect(card.noPlay).toBe(false); // $25 of live money is not a no-play day
  });

  it("D3(c): A LOCKED NO-PLAY DAY TOPPED UP WITH THE $25 ALONE lands in the store with NO noPlay flag", async () => {
    const np: CfbLedgerEntry = { ...serverEntry(DATE, { stakes: [], games: gameIds().slice(0, 3), lockedAt: LOCKS_AT }), noPlay: true };
    expect(np.core).toHaveLength(0);
    expect(np.funT).toHaveLength(0);
    expect(np.noPlay).toBe(true);
    const fr = seed([np]);

    setNow(LATER);
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => funOnlySlate(now));
    const { status, body } = await call();
    expect(status).toBe(200);
    const t = topUpOf(body);
    expect(t.action).toBe("topped-up");
    expect(t.core).toBe(0);
    expect(t.stake).toBe(0);
    expect(t.fun).toBe(1);
    expect(t.funStake).toBe(CFB_PAPER.fun);

    /* THE PIN: the STORED entry — the one the Builder renders and the merge rails carry */
    const e = fr.ledger()[0];
    expect("noPlay" in e).toBe(false);
    expect(e.noPlay).toBeUndefined();
    expect(e.core).toHaveLength(0);
    expect(e.funT).toHaveLength(1);
    expect(e.funT.reduce((s, x) => s + x.stake, 0)).toBe(CFB_PAPER.fun);
    expect(e.funT[0].bucket).toBe("fun");
    /* ...and the day is still honest about the money: $0 of the core, $25 of the fun */
    expect(coreStakeOf(e)).toBe(0);
    expect(String(e.note)).toMatch(/Fun: \+\$25/);
  });

  it("D3(c): A FULL-CORE DAY THAT GAINS ONLY THE $25 is not flagged either — the route adds no flag of its own", async () => {
    const day = serverEntry(DATE, { stakes: [50, 50, 50, 50, 50], games: gameIds().slice(0, 5), lockedAt: LOCKS_AT });
    expect(day.noPlay).toBeUndefined();
    const fr = seed([day]);
    setNow(LATER);
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => richerSlate(now, EXTRA));

    expect(topUpOf((await call()).body).action).toBe("topped-up");
    const e = fr.ledger()[0];
    expect("noPlay" in e).toBe(false);
    expect(e.funT.reduce((s, x) => s + x.stake, 0)).toBe(CFB_PAPER.fun);
    expect(coreStakeOf(e)).toBe(CFB_PAPER.daily);
  });

  it("D3(b): THE FUN-ONLY WRITE PATH CANNOT SEAT MORE THAN CFB_PAPER.fun — one ticket, and the guard over the merged entry", () => {
    /* the plan itself stops at ONE fun ticket and at the allotment... */
    const np: CfbLedgerEntry = { ...serverEntry(DATE, { stakes: [], games: gameIds().slice(0, 3), lockedAt: LOCKS_AT }), noPlay: true };
    const plan = lockServerMod.planCfbTopUp(funOnlySlate(LATER) as CfbBoard, np, { now: LATER, bankroll: 2500, room: CFB_PAPER.daily, slots: CFB_RULES.tickets.max, n: 1 });
    expect(plan.tickets).toHaveLength(0);
    expect(plan.fun).toHaveLength(1);
    expect(plan.funStake).toBe(CFB_PAPER.fun);

    /* ...and applying it twice — the shape a racing writer could otherwise produce — is refused by
       the money guard over the MERGED entry, not quietly written */
    const once = lockServerMod.applyCfbTopUp(np, plan, LATER, 1);
    expect(once.funT).toHaveLength(1);
    expect(() => lockServerMod.applyCfbTopUp(once, plan, LATER, 2)).toThrow(/MONEY GUARD/);
    /* the day that already carries its parlay gets NOTHING from a second plan — an append is not a
       re-stake, so the second attempt cannot even build one */
    const second = lockServerMod.planCfbTopUp(funOnlySlate(LATER) as CfbBoard, once, { now: LATER, bankroll: 2500, room: CFB_PAPER.daily, slots: CFB_RULES.tickets.max, n: 2 });
    expect(second.fun).toHaveLength(0);
    expect(second.funStake).toBe(0);
  });
});

/* ==========================================================================================
 * THE CLOSING ROUND (INSTRUCTION 45, 2026-09-06). Josh, verbatim: "Parlay Lab CFB should've been
 * running the same $150 per day theoretical Core money and $25 Fun money per day".
 *
 * Three things this round closes, and they are all about a READER of the desk rather than about
 * a new capability:
 *
 *   D1  a constant's docblock documented a gate the code no longer has. `CFB_TOPUP_RETRY_MS`
 *       (src/lib/cfb/rules.ts) said the empty-attempt cooldown gates on `core === 0`; DEFECT M(b)
 *       moved that test to `isClaimRow` — an explicit `filled` flag — precisely because a
 *       COMPLETED fun-only attempt also records `core: 0`. The stale sentence therefore
 *       contradicted `decideCfbTopUp`'s own block in src/lib/cfb/lock-server.ts. The same sweep
 *       found `CFB_TOPUP_MAX`'s docblock still claiming the two allotments "do NOT get an attempt
 *       budget each", which L1 changed: `used` and `funUsed` count each arm separately.
 *
 *   D2  the cap-spent refusal reported `room` — the CORE figure — so a day that has stranded its
 *       whole $25 fun allotment refused with the words "$0 stays undeployed". True of the core,
 *       false of the day, and the $0-of-$25 day is the exact shape the other half of Josh's
 *       sentence is about. The CONDITION is untouched; only what it reports changed.
 *
 *   D3  three sibling files are moving in this same round — the merge kernel's fun cap, the CFB
 *       device store, and the grader's reading of an unreadable score. This file's own passes
 *       consume all three, so the guards below state what the SERVER must go on doing whatever
 *       those three settle on.
 * ======================================================================================== */
describe("THE CLOSING ROUND (2026-09-06) — D1 the docblocks, D2 the refusal, D3 the server-side guards", () => {
  const readRaw = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
  /** the `/** … *​/` block immediately above a declaration — comments, deliberately, not code */
  const docBlockFor = (src: string, decl: string): string => {
    const i = src.indexOf(decl);
    expect(i, `declaration not found: ${decl}`).toBeGreaterThan(0);
    return src.slice(src.lastIndexOf("/**", i), i);
  };

  /* ---------- D1 ---------- */

  it("D1: the CFB_TOPUP_RETRY_MS docblock states the gate `decideCfbTopUp` actually runs — `filled`, never `core === 0`", () => {
    const doc = docBlockFor(readRaw("src/lib/cfb/rules.ts"), "export const CFB_TOPUP_RETRY_MS");
    expect(doc).toContain("EMPTY ATTEMPT");
    /* the gate the code has, named */
    expect(doc).toMatch(/isClaimRow/);
    expect(doc).toMatch(/filled: false/);
    /* THE PIN: `core === 0` is the pre-DEFECT-M(b) reading, which a completed FUN-ONLY attempt
       also satisfies. The block may QUOTE it — withdrawing a claim in the open is this file's
       house style — but only after saying it is false, never as the rule. */
    if (doc.includes("core === 0")) {
      expect(doc.search(/corrected 2026-09-06|is now false/)).toBeGreaterThan(-1);
      expect(doc.search(/corrected 2026-09-06/)).toBeLessThan(doc.indexOf("core === 0"));
    }
    /* ...and the gate it now describes is the one in the code, by name */
    expect(readSrc("src/lib/cfb/lock-server.ts")).toMatch(/last && isClaimRow\(last\) && now - last\.at < CFB_TOPUP_RETRY_MS/);
  });

  it("D1: the CFB_TOPUP_MAX docblock counts PER ARM, exactly as `decideCfbTopUp` counts", () => {
    const doc = docBlockFor(readRaw("src/lib/cfb/rules.ts"), "export const CFB_TOPUP_MAX");
    /* L1 gave each arm its own counter, and the docblock must say so by the names the code uses */
    expect(doc).toMatch(/arms/);
    expect(doc).toMatch(/`used`/);
    expect(doc).toMatch(/`funUsed`/);
    /* THE PIN: the single-budget sentences may appear only as a WITHDRAWN claim, never as the rule */
    for (const stale of ["do NOT get an attempt budget each", "whichever bucket the attempt was serving"]) {
      if (doc.includes(stale)) expect(doc.indexOf("WITHDRAWN")).toBeLessThan(doc.indexOf(stale));
    }
    /* the check that is NOT free and does NOT live in decideCfbTopUp was listed as though it were */
    expect(doc).not.toContain("no time passed since the lock, every game kicked off");
    expect(doc).toMatch(/every game on the date has kicked off/);
    /* the invariant the paragraph exists to state must still be there */
    expect(doc).toMatch(/unchanged at (2|two) (priced )?boards/i);
    const code = readSrc("src/lib/cfb/lock-server.ts");
    expect(code).toMatch(/const used = others\.filter\(spentCoreAttempt\)\.length/);
    expect(code).toMatch(/const funUsed = others\.filter\(spentFunAttempt\)\.length/);
  });

  /* ---------- D2 ---------- */

  const gameIds = () => slateAt(LOCKS_AT).games.map((g) => g.id);
  const spentRow = (n: number, arms: { core: boolean; fun: boolean }) => ({ at: LOCKS_AT + n, n, core: 0, stake: 0, fun: 0, filled: true, arms });

  it("D2: A DAY THAT HAS STRANDED ITS WHOLE $25 refuses in words that name BOTH allotments", () => {
    /* the shape: every dollar of core deployed, the fun bucket EMPTY, and both fun attempts spent */
    const day = serverEntry(DATE, {
      stakes: [50, 50, 50, 50, 50],
      games: gameIds().slice(0, 5),
      lockedAt: LOCKS_AT,
      topUps: [spentRow(1, { core: false, fun: true }), spentRow(2, { core: false, fun: true })],
    });
    expect(coreStakeOf(day)).toBe(CFB_PAPER.daily);
    expect(day.funT).toHaveLength(0);

    const d = lockServerMod.decideCfbTopUp(day, LOCKS_AT + 3 * 3600_000);
    expect(d.fire).toBe(false);
    const reason = String((d as { reason: string }).reason);
    /* the cap and its ordinal are unchanged — the CONDITION did not move, only the reporting */
    expect(reason).toMatch(/cap is spent \(2 of 2\)/);
    /* THE PIN: $0 of core is true, and saying only that hides the $25 the day actually stranded */
    expect(reason).toMatch(/\$0 of the \$250 core/);
    expect(reason).toMatch(/\$25 of the \$25 fun/);
  });

  it("D2: A JOINT CORE+FUN STRANDING names both figures, and a day whose parlay stands reports $0 of fun", () => {
    /* core $175 owed AND the $25 bucket empty, both arms' attempts spent */
    const both = serverEntry(DATE, {
      stakes: [25, 25, 25],
      games: gameIds().slice(0, 3),
      lockedAt: LOCKS_AT,
      topUps: [spentRow(1, { core: true, fun: true }), spentRow(2, { core: true, fun: true })],
    });
    const r1 = String((lockServerMod.decideCfbTopUp(both, LOCKS_AT + 3 * 3600_000) as { reason: string }).reason);
    expect(r1).toMatch(/cap is spent \(2 of 2\)/);
    expect(r1).toMatch(/\$175 of the \$250 core/);
    expect(r1).toMatch(/\$25 of the \$25 fun/);

    /* the same day once its parlay stands: the fun figure is $0, and it is still stated */
    const seated = serverEntry(DATE, {
      stakes: [25, 25, 25],
      games: gameIds().slice(0, 3),
      lockedAt: LOCKS_AT,
      fun: CFB_PAPER.fun,
      topUps: [spentRow(1, { core: true, fun: true }), spentRow(2, { core: true, fun: true })],
    });
    const r2 = String((lockServerMod.decideCfbTopUp(seated, LOCKS_AT + 3 * 3600_000) as { reason: string }).reason);
    expect(r2).toMatch(/\$175 of the \$250 core/);
    expect(r2).toMatch(/\$0 of the \$25 fun/);
  });

  /* ---------- D3(a) — the grader now calls an unreadable score PENDING, not a 0-0 push ---------- */

  const NEXT = "2026-09-06";
  const NEXT_MORNING = T("2026-09-06T15:00:00Z");
  const AT_49H = T("2026-09-07T17:00:00Z");
  const PAST_7D = T("2026-09-13T15:00:00Z");
  const lockedDay = () => buildCfbLockEntry(slateAt(LOCKS_AT), { now: LOCKS_AT, bankroll: 2500, ahead: 12, total: 12, firstKickoff: FIRST_KICK }).entry;
  /** the fixture events for `d`, every game FINAL with a score except the named ids, whose score is null */
  const blindEventsFor = (d: string, blind: string[]) =>
    (eventsFor(d) as Record<string, any>[]).map((e) => {
      const type = { name: "STATUS_FINAL", state: "post", completed: true, detail: "Final", shortDetail: "Final" };
      e.status = { ...e.status, type };
      e.competitions[0].status = { ...e.competitions[0].status, type };
      for (const c of e.competitions[0].competitors as Record<string, any>[]) {
        c.score = blind.includes(String(e.id)) ? null : c.homeAway === "home" ? "31" : "17";
      }
      return e;
    });

  it("D3(a): A FINAL WHOSE SCORE IS UNREADABLE grades PENDING — the overlay leaves it overwritable and the date stays a candidate", () => {
    const entry = lockedDay();
    const t0 = entry.core[0];
    const blind = t0.legs[0].gkey;
    const { finals } = finalsFromEspn(DATE, finalsFixtureFor(DATE), AT_49H, 2500);
    /* the shape the grader's `readScore` arm exists for: PRESENT, final, and unreadable */
    const unreadable: CfbFinals = { ...finals, [blind]: { ...finals[blind], home: null as unknown as number, final: true, status: "final" } };

    const inc = gradeCfbEntry(entry, unreadable, AT_49H);
    /* a 0-0 push is SETTLED and could never be corrected; pending is not */
    expect(inc.legs[t0.legs[0].lkey].result).toBe("pending");
    expect(inc.tickets[t0.id].result).toBe("pending");
    expect(inc.tickets[t0.id].result).not.toBe("push");
    expect(inc.done).toBe(false);

    const merged = lockServerMod.overlayCfbGrading(null, inc, entry)!;
    expect(merged.done).toBe(false);
    const held: CfbLedgerEntry = { ...entry, grading: merged };
    /* THE POINT: the date is still a settle candidate, so a later poke re-reads it... */
    expect(lockServerMod.cfbSettleCandidate(held, AT_49H)).toBe(true);
    /* ...and because `pending` is not in the overlay's SETTLED set, the real score lands */
    const real = gradeCfbEntry(entry, finalsFromEspn(DATE, finalsFixtureFor(DATE), AT_49H, 2500).finals, AT_49H);
    const after = lockServerMod.overlayCfbGrading(merged, real, entry)!;
    expect(["won", "lost", "push"]).toContain(after.tickets[t0.id].result);
    expect(after.done).toBe(true);
    /* ...and it does NOT starve another date for ever: past the void horizon the day is closed */
    const voided = lockServerMod.overlayCfbGrading(null, gradeCfbEntry(entry, unreadable, PAST_7D), entry)!;
    expect(voided.tickets[t0.id].result).toBe("ungradable");
    expect(lockServerMod.cfbSettleCandidate({ ...entry, grading: voided }, PAST_7D)).toBe(false);
  });

  it("D3(a): THROUGH THE ROUTE — the unreadable date is stamped, re-read on the next poke, and then scored", async () => {
    const fr = fakeRedis();
    expect((await call()).body.status).toBe("locked");
    const staked = fr.ledger()[0];
    const blind = staked.core[0].legs[0].gkey;
    vi.mocked(espnEvents).mockClear();

    setNow(NEXT_MORNING);
    espnByDate({ [NEXT]: [], [DATE]: blindEventsFor(DATE, [blind]) });
    await call(req());
    const pending = fr.ledger().find((e) => e.date === DATE)!;
    expect(pending.grading!.tickets[staked.core[0].id].result).toBe("pending");
    expect(pending.grading!.done).toBe(false);
    expect(lockServerMod.cfbSettleCandidate(pending, NEXT_MORNING)).toBe(true);
    /* the read is STAMPED whatever it learned, so the date sorts to the BACK of the queue and
       cannot hold the CFB_SETTLE.maxDatesPerPoke budget against a fresher date (DEFECT S2) */
    expect(Number((pending as Record<string, unknown>).attemptedAt)).toBe(NEXT_MORNING);

    /* the very next poke re-reads it, and the published score lands on the pending verdict */
    setNow(NEXT_MORNING + 30 * 60_000);
    espnByDate({ [NEXT]: [], [DATE]: finalsFixtureFor(DATE) });
    const p2 = await call(req());
    expect((p2.body.settle as Record<string, unknown>).reads).toBe(1);
    const scored = fr.ledger().find((e) => e.date === DATE)!;
    expect(["won", "lost", "push"]).toContain(scored.grading!.tickets[staked.core[0].id].result);
    expect(scored.grading!.done).toBe(true);
  });

  /* ---------- D3(b) — a graded fun ticket survives the server's own fun seating ---------- */

  const LATER = LOCKS_AT + 15 * 60_000;
  const EXTRA = ["401858430", "401862701", "401869960"];

  it("D3(b): A DAY WHOSE FUN BUCKET ALREADY HOLDS A GRADED TICKET keeps it byte-for-byte through a top-up", async () => {
    const base = serverEntry(DATE, { stakes: [25, 25, 25], games: gameIds().slice(0, 3), lockedAt: LOCKS_AT, fun: CFB_PAPER.fun });
    const funId = base.funT[0].id;
    const day: CfbLedgerEntry = {
      ...base,
      grading: { tickets: { [funId]: { result: "won", payout: 100, detail: "graded on the phone" } }, legs: {}, done: false },
    };

    /* the plan itself refuses to touch a bucket that is not empty — whatever the board offers */
    const plan = lockServerMod.planCfbTopUp(richerSlate(LATER, EXTRA) as CfbBoard, day, { now: LATER, bankroll: 2500, room: 75, slots: 4, n: 1 });
    expect(plan.fun).toHaveLength(0);
    expect(plan.funStake).toBe(0);
    expect(plan.tickets.length).toBeGreaterThan(0);

    const fr = seed([day]);
    setNow(LATER);
    vi.mocked(slateFromEspn).mockImplementation(async (_d, _e, now) => richerSlate(now, EXTRA));
    const { body } = await call();
    expect(topUpOf(body).action).toBe("topped-up");
    expect(topUpOf(body).fun).toBe(0);
    expect(topUpOf(body).funStake).toBe(0);

    /* THE PIN: the settled ticket, its stake and its verdict all survive the write */
    const e = fr.ledger()[0];
    expect(e.funT).toEqual(day.funT);
    expect(e.funT).toHaveLength(1);
    expect(e.funT.reduce((s, t) => s + t.stake, 0)).toBe(CFB_PAPER.fun);
    expect(e.grading!.tickets[funId].result).toBe("won");
    expect(e.grading!.tickets[funId].payout).toBe(100);
    expect(e.core.length).toBeGreaterThan(day.core.length);
  });

  /* ---------- D3(c) — no fun ticket is ever written at a $0 stake ---------- */

  it("D3(c): A FUN PARLAY SIZED AT $0 IS NEVER SEATED — the plan refuses it and the route writes no fun ticket", async () => {
    const np: CfbLedgerEntry = { ...serverEntry(DATE, { stakes: [], games: gameIds().slice(0, 3), lockedAt: LOCKS_AT }), noPlay: true };
    /* the card builder hands back a parlay the sizer floored to $0 — a ticket that stakes nothing
       is not money, and a `noPlay` clear that counts TICKETS rather than STAKED MONEY would take
       it for a real bet. Nothing on this path may write it. */
    vi.mocked(buildCfbCard).mockImplementation((board, opts) => {
      const card = cardReal.build!(board, opts);
      const t = card.funT[0] ?? { ...card.core[0], id: "cfb-fun-zero", bucket: "fun" as const };
      return { ...card, core: [], coreSum: 0, funT: [{ ...t, stake: 0 }], funSum: 0, noPlay: false };
    });

    const plan = lockServerMod.planCfbTopUp(slateAt(LATER) as CfbBoard, np, {
      now: LATER,
      bankroll: 2500,
      room: CFB_PAPER.daily,
      slots: CFB_RULES.tickets.max,
      n: 1,
    });
    expect(plan.fun).toHaveLength(0);
    expect(plan.funStake).toBe(0);

    const fr = seed([np]);
    setNow(LATER);
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(topUpOf(body).action).toBe("skipped");
    const e = fr.ledger()[0];
    expect(e.funT).toHaveLength(0);
    expect(e.core).toHaveLength(0);
    /* and the guard that refuses it is in the source, by name, so removing it is a red test */
    expect(readSrc("src/lib/cfb/lock-server.ts")).toMatch(/!\(t\.stake > 0\)/);
  });
});

/**
 * C1 (INSTRUCTION 45, 2026-09-06) — THE PHONE MAY NOT PERSIST A DAY WHOSE OWN MONEY CONTRADICTS
 * ITSELF. Josh, verbatim: "Parlay Lab CFB should've been running the same $150 per day theoretical
 * Core money and $25 Fun money per day".
 *
 * WHAT WENT WRONG. `upsertCfbEntries` (src/lib/cfb/store.ts) takes the merged day whole from
 * `mergeLedgers` and then takes back the LOCK-INSTANT fields off the stored copy — `daily` and
 * `fun` among them. Two of the merge's own answers are MEASURED AGAINST those two numbers:
 * `mergeDay`'s allotment assertion computes `allotmentCap(out, other)` / `funCap(out, other)` off
 * the merged day's `daily` / `fun` and writes `capBreach` from them. So when the two copies record
 * different allotments the marker was decided against ONE number and the phone then persisted the
 * OTHER — a stored day carrying a core sum over its own recorded `daily` with no marker anywhere
 * saying so, and nothing downstream re-guards it (`writeCfbLedger` runs no money guard, and the
 * PUT rail's `validateLedger` checks date / `locked` / `core` / duplicate dates / the `placed` and
 * `actualStake` shapes and nothing about money).
 *
 * THE FIX IS TO RECONCILE AFTER THE TAKEBACK, not to stop taking the allotments back: `daily` and
 * `fun` are genuinely lock-instant (the desk's allotment for that date, decided once — and
 * adopting a foreign copy's $500 would be the worse answer), so the day is re-run through the same
 * shared merge once the phone's own numbers are seated. See RECONCILE THE TAKEBACK in that file.
 *
 * THE ASSERTIONS ARE MUTUAL CONSISTENCY, not a fixed cap: a concurrent change to `allotmentCap`
 * may lower the ceiling below the day's recorded `daily`, so the pin says the breach must be
 * present whenever the stored sum exceeds the stored allotment, must quote the stored sum, and may
 * never name a cap the stored day does not carry.
 */
describe("C1 (2026-09-06) — the stored day's coreSum, its daily and its markers agree", () => {
  const memStorage = (): Storage => {
    const m = new Map<string, string>();
    return {
      get length() {
        return m.size;
      },
      clear: () => m.clear(),
      getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
      key: (i: number) => [...m.keys()][i] ?? null,
      removeItem: (k: string) => void m.delete(k),
      setItem: (k: string, v: string) => void m.set(k, String(v)),
    } as Storage;
  };
  beforeEach(() => Object.defineProperty(globalThis, "localStorage", { value: memStorage(), configurable: true, writable: true }));
  afterEach(() => delete (globalThis as { localStorage?: Storage }).localStorage);

  const coreTix = (n: number, stake = 25): CfbTicket => ({
    id: `cfb-${DATE}-core-${n}`,
    bucket: "core",
    name: `SINGLE · leg ${n}`,
    stake,
    czOdds: -110,
    czDec: 1.9091,
    prob: 55,
    czEv: 3,
    legs: [{ label: `game ${n}`, prop: "ML", cz: -110, gkey: `g${n}`, lkey: `g${n}:ml:home`, market: "ml", side: "home", line: null, teamId: null, prob: 0.55, push: 0 }],
  });
  const dayOf = (daily: number, n: number): CfbLedgerEntry => ({
    sport: "cfb",
    date: DATE,
    locked: true,
    daily,
    fun: CFB_PAPER.fun,
    core: Array.from({ length: n }, (_, i) => coreTix(i + 1)),
    funT: [],
    lockedAt: LOCKS_AT,
    games: {},
    grading: null,
  });
  const sumOf = (tix: CfbTicket[]) => tix.reduce((s, t) => s + t.stake, 0);

  it("a merged day measured against the OTHER copy's allotment is re-measured against the one the phone keeps", () => {
    const cur = dayOf(CFB_PAPER.daily, 3); // the phone's own $150 day, $75 staked
    const inc = dayOf(500, 9); // a copy claiming a $500 allotment and $225 staked
    expect(sumOf(cur.core)).toBe(75);
    expect(sumOf(inc.core)).toBe(225);

    /* the SYNC rail's own answer, for reference: whatever cap it applied, it applied it to the
       `daily` its own merged day carries */
    const sync = mergeLedgers([cur], [inc])[0] as CfbLedgerEntry;

    writeCfbLedger([cur]);
    const r = upsertCfbEntry(inc);
    expect(r.refused).toBe(true);

    /* the STORED day — read back through the device record, not the return value */
    const stored = readCfbLedger()[0];
    expect(stored.date).toBe(DATE);
    /* the lock instant still stands: the phone's own $150 allotment, not the incoming $500 */
    expect(stored.daily).toBe(CFB_PAPER.daily);
    expect(stored.fun).toBe(CFB_PAPER.fun);
    /* and the money the day carries is the merge's, whatever it seated */
    expect(sumOf(stored.core)).toBe(sumOf(sync.core));

    const breach = (stored as unknown as { capBreach?: { core?: { sum: number; cap: number } } }).capBreach;
    if (sumOf(stored.core) > stored.daily) {
      expect(breach?.core).toBeDefined();
      expect(breach!.core!.sum).toBeCloseTo(sumOf(stored.core), 6);
      expect(breach!.core!.cap).toBeLessThanOrEqual(stored.daily);
    } else {
      expect(breach?.core).toBeUndefined();
    }
  });

  /**
   * THE FIXTURE ABOVE NO LONGER PRODUCES THE CONDITION IT ASSERTS ON (INSTRUCTION 45, 2026-09-06,
   * the closing round's defect C2). MUTATION SURVIVOR W12: delete the reconcile step in
   * `upsertCfbEntries` outright — the line is `const reconciled = (mergeLedgers([kept], [kept])[0]
   * as CfbLedgerEntry | undefined) ?? kept;`, read in src/lib/cfb/store.ts this turn — and the
   * whole suite stays green. The two tests around this one are why, and the fault is the FIXTURE,
   * not the assertions.
   *
   * THE PROOF, MEASURED THIS TURN AND REPRODUCED TWICE, on the `daily 150` vs `daily 500` pair the
   * test above drives:
   *
   *     with the reconcile:     stored {n:9, sum:225, daily:150, capBreach:{core:{sum:225,cap:150}}}
   *     with it deleted:        stored {n:9, sum:225, daily:150, capBreach:{core:{sum:225,cap:150}}}
   *
   * Identical. The breach BRANCH does execute (225 > 150), so the assertions are not skipped — but
   * they cannot fail either way, because the marker the reconcile exists to recompute is ALREADY
   * on the merged day. The kernel is why: `allotmentCap` (src/lib/ledger-merge.ts, read this turn)
   * returns `recorded.length ? Math.min(desk, Math.max(...recorded)) : desk`, so an INFLATED
   * foreign `daily: 500` is clamped straight back to the desk's own $150 and the cap the merge
   * measured against is already the cap the phone keeps. An over-claim can no longer make the two
   * caps differ; when this pin was written it could.
   *
   * WHAT STILL CAN, and what this test drives: a stored day whose own `daily` is LOWER than the
   * merged day's. The takeback then seats an allotment SMALLER than the one the merge measured
   * against, which is the same defect the describe's docblock states, in the only direction the
   * clamp leaves open. MEASURED THIS TURN, both runs identical:
   *
   *     with the reconcile:     stored {n:6, sum:150, daily:80, capBreach:{core:{sum:150,cap:80}}}
   *     with it deleted:        stored {n:6, sum:150, daily:80}   ← no marker at all
   *
   * A day staking $150 against its own recorded $80 allotment with nothing anywhere saying so.
   *
   * THIS IS A REWRITE OF A VACUOUS FIXTURE, NOT A LOOSENED PIN, and it is written as an ADDITION
   * so that it cannot be either: not one assertion of the test above is edited, and its own claim
   * — that the phone keeps its $150 and never adopts a foreign $500 — is a real property this pair
   * cannot express. The fixture is the only thing that moved, `dayOf(CFB_PAPER.daily, 3)` /
   * `dayOf(500, 9)` becoming `dayOf(80, 3)` / `dayOf(CFB_PAPER.daily, 6)`, and the assertions here
   * are the same mutual-consistency shape: the breach must be present whenever the stored sum
   * exceeds the stored allotment, must quote the stored sum, and may never name a cap the stored
   * day does not carry. An $80 `daily` is not a shape the desk mints — `lockCfbCard`
   * (src/lib/cfb/ledger.ts) stamps `daily: CFB_PAPER.daily` — it is what a stored blob can carry,
   * and a stored blob is exactly what this rail must not launder into the record.
   */
  it("a stored day whose OWN allotment is lower than the merged day's is re-measured against its own", () => {
    const cur = dayOf(80, 3); // the phone's own day: an $80 allotment, $75 staked
    const inc = dayOf(CFB_PAPER.daily, 6); // a $150 copy carrying the same three plus three more
    expect(sumOf(cur.core)).toBe(75);
    expect(sumOf(inc.core)).toBe(150);

    /* the SYNC rail's own answer, for reference: it measured against ITS merged day's `daily` */
    const sync = mergeLedgers([cur], [inc])[0] as CfbLedgerEntry;
    expect(sumOf(sync.core)).toBe(150);
    expect(sync.daily).toBe(CFB_PAPER.daily);
    expect((sync as unknown as { capBreach?: unknown }).capBreach).toBeUndefined();

    writeCfbLedger([cur]);
    expect(upsertCfbEntry(inc).refused).toBe(true);

    const stored = readCfbLedger()[0];
    /* the lock instant still stands: the phone's own $80, not the incoming $150 */
    expect(stored.daily).toBe(80);
    /* and the money the day carries is the merge's, whatever it seated */
    expect(sumOf(stored.core)).toBe(sumOf(sync.core));

    const breach = (stored as unknown as { capBreach?: { core?: { sum: number; cap: number } } }).capBreach;
    if (sumOf(stored.core) > stored.daily) {
      expect(breach?.core).toBeDefined();
      expect(breach!.core!.sum).toBeCloseTo(sumOf(stored.core), 6);
      expect(breach!.core!.cap).toBeLessThanOrEqual(stored.daily);
    } else {
      expect(breach?.core).toBeUndefined();
    }
  });

  it("a day that is NOT over its own allotment carries no breach marker at all", () => {
    const cur = dayOf(CFB_PAPER.daily, 3);
    const inc = dayOf(500, 5); // $125 — inside $150 whichever copy wins pickBase
    writeCfbLedger([cur]);
    upsertCfbEntry(inc);
    const stored = readCfbLedger()[0];
    expect(stored.daily).toBe(CFB_PAPER.daily);
    expect(sumOf(stored.core)).toBeLessThanOrEqual(stored.daily);
    expect((stored as unknown as { capBreach?: unknown }).capBreach).toBeUndefined();
  });
});

/**
 * C4 (INSTRUCTION 45, 2026-09-06, the closing round) — THE THREE THINGS THE KERNEL'S CONCURRENT
 * CHANGES COULD HAVE MOVED, VERIFIED AND THEN PINNED. The kernel agent is changing the fun rank
 * band, the rival-card stake refusal (`betConflict`) and the allocSum derivation in
 * src/lib/ledger-merge.ts. Nothing below writes that file; everything below was READ off it and
 * off src/lib/cfb/lock-server.ts THIS TURN and is quoted as read.
 *
 * (a) THE TOP-UP DECIDER STILL REACHES THE FULL $150 ON A SHORT DAY — and the second half of that
 *     question ("cannot be handed fresh owed by a refused stake") IS NOT TRUE, so it is pinned as
 *     the bounded property it actually is rather than as the property it was hoped to be.
 *     `decideCfbTopUp` (src/lib/cfb/lock-server.ts) reads, this turn:
 *
 *         const staked = cfbStakeOf(entry.core);
 *         const room = CFB_PAPER.daily - staked;
 *         const slots = CFB_RULES.tickets.max - entry.core.length;
 *         const coreOpen = room >= CFB_RULES.minStake && slots > 0;
 *
 *     (the fun arm beside it is `funOpen`, NAMED AND NOT QUOTED: nothing below turns on its
 *     expression, and the kernel is still moving it. CITATION CORRECTED — INSTRUCTION 45,
 *     2026-09-06, DEFECT C1 — this note quoted it as `const funOpen = entry.funT.length === 0;`,
 *     which GREPPED THIS TURN does not grep and no longer occurs in src/lib/cfb/lock-server.ts:
 *     the live arm also consults `cfbFunRefusedOf`, so an emptied-by-refusal bucket does NOT
 *     reopen it.)
 *
 *     `room` is measured off the SEATED core and nothing else. Grepped this turn, the string
 *     `stakeConflict` does not occur anywhere in src/lib/cfb/lock-server.ts, so a day whose merge
 *     REFUSED a raise presents a SMALLER seated core and therefore MORE room. THE REFUSAL IS
 *     NAMED BY SYMBOL, NOT QUOTED (same defect C1): `unionCore` in src/lib/ledger-merge.ts settles
 *     a stake disagreement through a four-way `lift` branch whose receiptless arm seats the
 *     smaller stake and writes its `conflict` map, which `mergeDay` publishes on the entry as
 *     `stakeConflict`. Every expression an earlier draft of this note quoted here — a
 *     `receipted ? hi : lo` ternary and an `if (!receipted)`-guarded conflict write — GREPPED
 *     THIS TURN neither greps, and no longer occurs in that file; the kernel rewrote the branch
 *     twice this round, which is exactly why a symbol is cited and an expression is not. That is
 *     fresh owed handed over by a refusal, and the test below measures it instead of denying it. WHAT BOUNDS IT is the recorded day, not the
 *     decision: `room = CFB_PAPER.daily - staked` can never exceed the allotment, and
 *     `assertCfbEntryMoney` re-runs `assertCfbCardMoney` over the merged entry, which throws
 *     `if (coreSum > CFB_PAPER.daily + MONEY_EPS)`. So the desk can be asked to buy a board it did
 *     not need; it can never RECORD more than $150 on the date. Both halves are asserted.
 *
 * (b) THE SETTLE AND GRADING PASSES ON A `betConflict` DAY. `cfbSettleCandidate` and
 *     `cfbSettleReady` were read this turn: the candidate test opens with
 *     `if (!tix.length) return false;`, then `if (tix.some((t) => !t.legs?.length)) return false;`,
 *     then `if (grading?.done !== true) return true;`, and readiness is
 *     `return cfbLastKickoffOf(entry) + finishMs <= now;`. (The first two are SEPARATE STATEMENTS
 *     on separate lines; an earlier draft ran them together on one line, which is a form that does
 *     not occur in the file.) Neither consults a merge marker, and
 *     the pin below asserts exactly that INDEPENDENCE — the same day, marker present and marker
 *     absent, must give the same four answers — because "behaves correctly against a day carrying
 *     a betConflict marker" means the marker changes nothing about when the day is read.
 *
 *     WHAT THIS PARAGRAPH USED TO REPORT, AND WHY IT IS NOW DELETED (INSTRUCTION 45, 2026-09-06,
 *     DEFECT C1). It reported, under a "MEASURED THIS TURN" warrant, that a `betConflict` day
 *     could carry an ALIEN SETTLED VERDICT — the rival copy's payout copied in by the fill-only
 *     grading merge under an id `mergeDay` never withdrew, because the withdrawal was driven off
 *     `restaked` alone and a rival id never enters `restaked`. THE KERNEL HAS SINCE FIXED THAT,
 *     and the report is deleted rather than restated because a fixed defect described as live is
 *     the same falsehood as a stale quote. RE-READ THIS TURN in src/lib/ledger-merge.ts:
 *     `mergeDay` derives `withdrawn` from `restaked` UNION the disputed `betConflict` ids, derives
 *     `legWithdrawn` from `withdrawn` UNION `betConflict`, and gates the ticket/leg deletion on
 *     `legWithdrawn`. The measured figures an earlier draft carried here are not repeated: they
 *     were produced against code that no longer exists, and re-quoting them would be the defect
 *     this correction is undoing. `unionCore` in src/lib/ledger-merge.ts names the rivals first —
 *
 *         for (const t of base.core) {
 *           const m = t.id ? theirs.get(String(t.id)) : undefined;
 *           if (m && !sameBet(t, m)) betConflict.push(String(t.id));
 *         }
 *
 *     — and its reconciliation loop then seats the BASE's ticket under that id with
 *     `if (m && !sameBet(t, m)) {` / `out.push(t);` / `continue;`, so the id is never added to
 *     `restaked`. That is still true, and it is now IRRELEVANT to the verdict, because the
 *     withdrawal no longer reads `restaked` alone. The settle passes themselves are correct as
 *     functions and the marker changes nothing about when the day is read, which is all the pin
 *     below asserts.
 *
 *     SITES BY ENCLOSING FUNCTION AND BY SYMBOL, not by line and not by expression — the kernel
 *     agent moved these lines twice while this note was being written, so every line number and
 *     every reconciliation expression an earlier draft quoted was stale within the turn:
 *     `unionCore` in src/lib/ledger-merge.ts holds the rival pre-pass and the seat-and-skip, and
 *     `mergeDay` in the same file holds `withdrawn` and `legWithdrawn`. The pre-pass block above
 *     and the two forms named in this sentence were grepped in the file THIS TURN.
 *
 * (c) NO SERVER PATH MINTS A TICKET CARRYING A `daily` OR `fun` ABOVE THE DESK ALLOTMENT. The two
 *     mints both spread `lockCfbCard`, which stamps `daily` and `fun` off `CFB_PAPER`
 *     (src/lib/cfb/ledger.ts, read this turn — two separate properties on two separate lines, not
 *     the single-line form an earlier draft quoted) and neither `buildCfbLockEntry` nor
 *     `buildCfbSweepEntry` overrides them; `applyCfbTopUp` opens its record (read this turn) with
 *     `const next: CfbLedgerEntry = {` then `...entry,` / `core,` / `funT,` /
 *     `games: { ...plan.games, ...(entry.games ?? {}) },` and a `note`, and writes neither
 *     allotment field — `daily` and `fun` ride in on the spread. `buildCfbLockEntry`'s
 *     allotments already have a pin above; the SWEEP mint and the top-up's preservation did not,
 *     which is what the third test adds, together with the money guard's own refusal.
 */
describe("C4 (2026-09-06) — the decider's room, the settle passes under a merge marker, and the minted allotments", () => {
  const gameIds = () => slateAt(LOCKS_AT).games.map((g) => g.id);
  const LATER = LOCKS_AT + 15 * 60_000;

  it("(a) the decider offers exactly the room to $250 — and a REFUSED raise hands it MORE room, bounded by the money guard", () => {
    /* a legitimately short day: three $25 singles, $75 of the $250 deployed */
    const short = serverEntry(DATE, { stakes: [25, 25, 25], games: gameIds().slice(0, 3), lockedAt: LOCKS_AT });
    expect(coreStakeOf(short)).toBe(75);
    const d = lockServerMod.decideCfbTopUp(short, LATER);
    expect(d).toMatchObject({ fire: true, core: true });
    expect((d as { room: number }).room).toBe(CFB_PAPER.daily - coreStakeOf(short)); // the FULL remainder, $175
    expect((d as { room: number }).room + coreStakeOf(short)).toBe(CFB_PAPER.daily);

    /* ...and a day with every dollar seated offers none of it */
    const full = serverEntry(DATE, { stakes: [50, 50, 50, 50, 50], games: gameIds().slice(0, 5), lockedAt: LOCKS_AT });
    expect(coreStakeOf(full)).toBe(CFB_PAPER.daily);
    expect(lockServerMod.decideCfbTopUp(full, LATER)).toMatchObject({ room: 0, core: false });

    /* THE REFUSED RAISE. Two copies of one day disagree about core-1's stake with no `topUp`
       receipt on either; the kernel keeps the SMALLER and names the refusal. */
    const lo = serverEntry(DATE, { stakes: [15, 50, 50, 50, 50], games: gameIds().slice(0, 5), lockedAt: LOCKS_AT }); // 2026-09-08: $215 of the $250
    const hi = serverEntry(DATE, { stakes: [50, 50, 50, 50, 50], games: gameIds().slice(0, 5), lockedAt: LOCKS_AT });
    const merged = mergeLedgers([lo], [hi])[0] as CfbLedgerEntry;
    const conflict = (merged as unknown as { stakeConflict?: Record<string, { kept: number; refused: number }> }).stakeConflict;
    expect(conflict?.[`cfb-${DATE}-core-1`]).toEqual({ kept: 15, refused: 50 });
    expect(coreStakeOf(merged)).toBe(215);
    expect(merged.source).toBe("server-lock");

    /* the decider does not read the marker, so the refused $35 comes back as fresh owed */
    const dm = lockServerMod.decideCfbTopUp(merged, LATER);
    expect(dm).toMatchObject({ fire: true, core: true });
    expect((dm as { room: number }).room).toBe(CFB_PAPER.daily - coreStakeOf(merged)); // $35
    expect((dm as { room: number }).room).toBeGreaterThan(0);

    /* THE BOUND, which is what actually protects the money: the offer is capped by the allotment */
    expect((dm as { room: number }).room).toBeLessThanOrEqual(CFB_PAPER.daily);
    expect((dm as { room: number }).room + coreStakeOf(merged)).toBe(CFB_PAPER.daily);
    /* ...and a RECORDED day over the allotment is refused outright, marker or no marker */
    expect(() => lockServerMod.assertCfbEntryMoney(merged)).not.toThrow();
    const over = serverEntry(DATE, { stakes: [50, 50, 50, 50, 50, 50], games: gameIds().slice(0, 6), lockedAt: LOCKS_AT });
    expect(coreStakeOf(over)).toBe(300);
    expect(() => lockServerMod.assertCfbEntryMoney(over)).toThrow(/MONEY GUARD/);
  });

  it("(b) a betConflict marker changes NOTHING about when the settle pass reads the day", () => {
    const plain = serverEntry(DATE, { stakes: [25, 25, 25], games: gameIds().slice(0, 3), lockedAt: LOCKS_AT, fun: 10 });
    const marked = { ...plain, betConflict: [`cfb-${DATE}-core-1`] } as CfbLedgerEntry;
    expect((marked as unknown as { betConflict: string[] }).betConflict).toEqual([`cfb-${DATE}-core-1`]);

    const last = lockServerMod.cfbLastKickoffOf(plain);
    expect(lockServerMod.cfbLastKickoffOf(marked)).toBe(last);
    const before = last + 60_000;
    const after = last + 12 * 3600_000;

    /* an ungraded day is a candidate on both, and neither is ready before its own finish window */
    expect(lockServerMod.cfbSettleCandidate(plain, before)).toBe(true);
    expect(lockServerMod.cfbSettleCandidate(marked, before)).toBe(lockServerMod.cfbSettleCandidate(plain, before));
    expect(lockServerMod.cfbSettleReady(plain, before)).toBe(false);
    expect(lockServerMod.cfbSettleReady(marked, before)).toBe(lockServerMod.cfbSettleReady(plain, before));
    expect(lockServerMod.cfbSettleReady(plain, after)).toBe(true);
    expect(lockServerMod.cfbSettleReady(marked, after)).toBe(lockServerMod.cfbSettleReady(plain, after));

    /* ...and a day whose grading is DONE with nothing reopenable closes on both, marker included */
    const closed = (e: CfbLedgerEntry): CfbLedgerEntry => ({
      ...e,
      grading: {
        tickets: Object.fromEntries([...e.core, ...e.funT].map((t) => [t.id, { result: "lost" as const, payout: 0 }])),
        legs: {},
        done: true,
      },
    });
    expect(lockServerMod.cfbSettleCandidate(closed(plain), after)).toBe(false);
    expect(lockServerMod.cfbSettleCandidate(closed(marked), after)).toBe(false);
  });

  it("(c) every server mint stamps the desk allotment, the top-up never raises it, and the guard refuses more", () => {
    /* the LOCK mint */
    const locked = buildCfbLockEntry(slateAt(LOCKS_AT), { now: LOCKS_AT, bankroll: 2500, ahead: 12, total: 12, firstKickoff: FIRST_KICK }).entry;
    expect(locked.daily).toBe(CFB_PAPER.daily);
    expect(locked.fun).toBe(CFB_PAPER.fun);

    /* the SWEEP mint — the missed-window record, which had no allotment pin at all */
    const swept = lockServerMod.buildCfbSweepEntry(slateAt(LOCKS_AT) as CfbBoard, { now: LOCKS_AT, total: 12 });
    expect(swept.daily).toBe(CFB_PAPER.daily);
    expect(swept.fun).toBe(CFB_PAPER.fun);
    expect(swept.source).toBe("server-lock");

    /* the TOP-UP does not mint an allotment: it carries the day's own through untouched */
    const short = serverEntry(DATE, { stakes: [25, 25, 25], games: gameIds().slice(0, 3), lockedAt: LOCKS_AT });
    const plan = lockServerMod.planCfbTopUp(slateAt(LATER) as CfbBoard, short, {
      now: LATER,
      bankroll: CFB_BANK_BASE,
      room: CFB_PAPER.daily - coreStakeOf(short),
      slots: CFB_RULES.tickets.max - short.core.length,
      n: 1,
    });
    const next = lockServerMod.applyCfbTopUp(short, plan, LATER, 1);
    expect(next.daily).toBe(CFB_PAPER.daily);
    expect(next.fun).toBe(CFB_PAPER.fun);
    expect(coreStakeOf(next)).toBeLessThanOrEqual(CFB_PAPER.daily);
    expect(next.funT.reduce((s, t) => s + t.stake, 0)).toBeLessThanOrEqual(CFB_PAPER.fun);

    /* ...and the guard both mints run through refuses anything above EITHER allotment. It
       recomputes both sums off the tickets themselves (`const coreSum = sum(card.core);`, read
       this turn), so the refusal is driven with real tickets, not with a claimed total. */
    const overFun = { ...short, funT: [{ ...short.core[0], id: `cfb-${DATE}-fun-1`, bucket: "fun" as const, stake: CFB_PAPER.fun + 5 }] };
    expect(overFun.funT[0].stake).toBeGreaterThan(CFB_PAPER.fun);
    expect(() => lockServerMod.assertCfbEntryMoney(overFun)).toThrow(/fun money/);
  });
});
