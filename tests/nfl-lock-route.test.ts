import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { stripComments } from "./helpers/source";
import { buildCfbBoard } from "@/lib/cfb/model";
import { NFL_BANK_BASE, NFL_LEAGUE, NFL_LOCK, NFL_PAPER, NFL_REDIS, NFL_RULES } from "@/lib/nfl/rules";
import { CFB_REDIS } from "@/lib/cfb/rules";
import { finalsOf } from "@/lib/cfb/slate-server";
import type { CfbLedgerEntry, CfbSlate } from "@/lib/cfb/types";

/**
 * THE NFL SERVER LOCK (2026-09-08, Josh, verbatim: "2. NFL needs to be built NOW" and
 * "3. Allocation should be set to $350"). /api/nfl/lock is a parameterised copy of the CFB
 * shell — same gate, same order, same shared helpers in src/lib/server/football-lock.ts — driven
 * by NFL_LEAGUE and its own three Redis literals. Pinned here two ways, the way
 * tests/cfb-lock-route.test.ts pins the CFB one:
 *
 *   the route file, comment-stripped   the gate order, the literals, the shared helpers, the
 *                                      60 s maxDuration above the caller's 25 s abort, and NOT
 *                                      ONE CFB key or path in the file.
 *   the exported GET, CALLED           on the REAL week-1 Sunday fixture (13 kickoffs: eight at
 *                                      17:00Z, four at 20:25Z, SNF at 00:20Z — all on PT date
 *                                      2026-09-13) with the SYNTHESIZED odds fixture (never a
 *                                      real Odds API response; api.the-odds-api.com is never
 *                                      called) and the real ESPN FPI capture. The lock window
 *                                      opens at 16:00Z (17:00Z − NFL_LOCK.leadMs). A poke there
 *                                      writes ONE sport-"nfl" entry under pl:nfl:ledger:v1
 *                                      carrying daily 350 / fun 25, ids nfl-2026-09-13-core-*,
 *                                      core ≤ $350, every stake in the $5–$50 band, ≤ 10
 *                                      tickets. An 18:00Z poke (the 17:00Z games kicked, five
 *                                      still ahead) locks from those five and says so.
 *
 * fetch is never reached: the slate is the fixture through the pure model, Redis is in-memory.
 */

vi.mock("@/lib/server/store", async (orig) => {
  const real = await orig<typeof import("@/lib/server/store")>();
  return { ...real, redis: vi.fn(), storeEnv: vi.fn() };
});
vi.mock("@/lib/cfb/slate-server", async (orig) => {
  const real = await orig<typeof import("@/lib/cfb/slate-server")>();
  return { ...real, espnEventsOf: vi.fn(), slateFromEspnOf: vi.fn() };
});

import { redis, storeEnv } from "@/lib/server/store";
import { espnEventsOf, slateFromEspnOf } from "@/lib/cfb/slate-server";
import { GET } from "../app/api/nfl/lock/route";
import * as lockRouteMod from "../app/api/nfl/lock/route";

const FIX = path.join(process.cwd(), "tests", "fixtures", "nfl");
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8"));
const ESPN = readJson("espn-scoreboard-2026-09-13.json") as { events: unknown[] };
const ODDS = readJson("odds-2026-09-13.json") as unknown[];
const FPI = readJson("espn-fpi.json") as unknown;
const DATE = "2026-09-13";
const SECRET = "cron-secret-for-this-test-only";
const T = (iso: string) => Date.parse(iso);
const FIRST_KICK = T("2026-09-13T17:00:00Z"); // 8 games
const LATE_KICK = T("2026-09-13T20:25:00Z"); // 4 games
const SNF_KICK = T("2026-09-14T00:20:00Z"); // 1 game — 17:20 PT on the 13th, so ON this PT date
const LOCKS_AT = FIRST_KICK - NFL_LOCK.leadMs; // 16:00Z
const GAMES = 13;

const root = path.join(__dirname, "..");
const readSrc = (p: string) => stripComments(fs.readFileSync(path.join(root, p), "utf8"));

function slateAt(now: number): CfbSlate {
  const board = buildCfbBoard({ date: DATE, espnEvents: ESPN.events, oddsEvents: ODDS, fpi: FPI, now, bankroll: NFL_BANK_BASE, league: NFL_LEAGUE });
  return { ...board, finals: finalsOf(board.games), quota: { remaining: 9000, used: 1000 }, oddsMissing: false };
}

/**
 * WHY THE FIXTURE SEATS NO CORE, AND THE SWEETENED BOARD (read before touching the 16:00Z cases).
 *
 * tests/fixtures/nfl/odds-2026-09-13.json is SYNTHESIZED (its own `_note` on every event): the
 * moneylines were derived from ESPN FPI + 2.0 hfa through a sigma-13.5 normal — the SAME model
 * src/lib/cfb/model.ts prices with under NFL_MODEL. Market and model therefore agree to four
 * decimals (Steelers ML: fair 0.58805 vs mkt 0.58814, measured 2026-09-08), and once Caesars'
 * vig is on top the best `evCz` on every one of the 13 games is NEGATIVE (max −0.72, measured).
 * So `buildCfbCard` honestly finds no side clearing NFL_RULES.minEvPct (+2%) and the locked day
 * carries ZERO core tickets and the $25 fun parlay only (fun.minEvPct is −3). That is a property
 * of the fixture, not of the route — and it is pinned as such below, because a NO-CORE day IS a
 * real shape the rail must lock cleanly.
 *
 * To prove the CORE path — nfl-<date>-core-* ids, the $5–$50 band, ≤ 10 tickets, ≤ $350, one leg
 * per game — `sweetened()` richens the Caesars price on the favourite's moneyline of the first
 * `n` games still ahead so each clears ~+5% EV under 2.60. ONLY the price moves: the leg's
 * probability comes from `game.model` (src/lib/cfb/card.ts legOf → rowProbAt), which is left
 * alone, so the ticket's own EV is computed by the real card builder over the real model. This
 * is the test's board, never a captured quote; api.the-odds-api.com is never called.
 */
const decToAm = (dec: number) => (dec >= 2 ? Math.round((dec - 1) * 100) : -Math.round(100 / (dec - 1)));
function sweetened(slate: CfbSlate, now: number, n: number, evPct = 5): CfbSlate {
  let done = 0;
  const games = slate.games.map((g) => {
    if (done >= n || !(Date.parse(g.start) > now)) return g;
    const fav = g.rows
      .filter((r) => r.market === "ml" && r.playable && r.cz != null && r.push === 0)
      .sort((a, b) => b.fair - a.fair)[0];
    if (!fav) return g;
    const dec = Math.min(NFL_RULES.maxDec, (1 + evPct / 100) / fav.fair);
    const evCz = Math.round((fav.fair * dec - 1) * 10000) / 100;
    if (evCz < NFL_RULES.minEvPct) return g;
    done++;
    return { ...g, rows: g.rows.map((r) => (r === fav ? { ...r, cz: { ...r.cz!, price: decToAm(dec), dec }, evCz } : r)) };
  });
  return { ...slate, games };
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
  const allSets = () => calls.filter((c) => c[0] === "SET");
  const sets = () => allSets().filter((c) => c[1] === NFL_REDIS.ledger);
  const markers = () => allSets().filter((c) => String(c[1]).startsWith(NFL_REDIS.oddsGap));
  const ledger = (): CfbLedgerEntry[] => {
    const raw = kv.get(NFL_REDIS.ledger);
    return raw ? ((JSON.parse(raw) as { ledger: CfbLedgerEntry[] }).ledger ?? []) : [];
  };
  return { kv, calls, sets, allSets, markers, ledger };
}

const setNow = (t: number) => vi.setSystemTime(t);
const req = (opts: { date?: string; dry?: boolean; header?: Record<string, string> } = {}) => {
  const qs = new URLSearchParams();
  if (opts.date) qs.set("date", opts.date);
  if (opts.dry) qs.set("dry", "1");
  const url = `http://localhost/api/nfl/lock${qs.size ? `?${qs}` : ""}`;
  return new NextRequest(url, { headers: opts.header ?? { "x-cron-key": SECRET } });
};
const call = async (r: NextRequest = req({ date: DATE })): Promise<{ status: number; body: Record<string, unknown> }> => {
  const res = await GET(r);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const stakes = (e: CfbLedgerEntry) => e.core.reduce((s, t) => s + t.stake, 0);

beforeEach(() => {
  vi.useFakeTimers({ now: LOCKS_AT, toFake: ["Date"] });
  /* an unmocked store is LOUD (the CFB harness's rule): every test that reaches the route builds
     its own fresh Map with fakeRedis(); a test that forgot would otherwise read `undefined` as an
     empty ledger — a silent wrong answer. */
  vi.mocked(redis).mockReset().mockImplementation(async (cmd: unknown[]) => {
    throw new Error(`this test reached the store without building one — call fakeRedis() first (cmd: ${String((cmd as string[])[0])})`);
  });
  vi.mocked(storeEnv).mockReset().mockReturnValue({ url: "https://store.test", token: "t" });
  vi.mocked(espnEventsOf).mockReset().mockResolvedValue(ESPN.events);
  vi.mocked(slateFromEspnOf).mockReset().mockImplementation(async (_cfg, _d, _e, now) => slateAt(now));
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("the fixture — what the behavioural half stands on", () => {
  it("13 scheduled games, all on PT date 2026-09-13, the synthesized odds carrying americanfootball_nfl and a Caesars quote", () => {
    expect(ESPN.events.length).toBe(GAMES);
    const board = slateAt(LOCKS_AT);
    expect(board.games.length).toBe(GAMES);
    const starts = board.games.map((g) => Date.parse(g.start)).sort((a, b) => a - b);
    expect(starts[0]).toBe(FIRST_KICK);
    expect(starts.filter((t) => t === FIRST_KICK).length).toBe(8);
    expect(starts.filter((t) => t === LATE_KICK).length).toBe(4);
    expect(starts[starts.length - 1]).toBe(SNF_KICK);
    // the odds fixture is SYNTHETIC by construction and says so on every event
    for (const ev of ODDS as { _note?: string; sport_key: string }[]) {
      expect(ev.sport_key).toBe("americanfootball_nfl");
      expect(ev._note).toMatch(/SYNTHETIC/);
    }
    // every game carries at least one priced, playable Caesars row at the window
    for (const g of board.games) expect(g.rows.some((r) => r.playable && r.cz != null && r.evCz != null), `${g.id} unpriced`).toBe(true);
  });
});

describe("the route file, comment-stripped — gated and keyed like its CFB sibling, on NFL literals", () => {
  const src = readSrc("app/api/nfl/lock/route.ts");

  it("exports only handlers and route config; dynamic + maxDuration 60 above the caller's 25 s abort", () => {
    expect(src).toMatch(/export const dynamic = "force-dynamic"/);
    expect(src).toMatch(/export const maxDuration = 60/);
    expect(lockRouteMod.dynamic).toBe("force-dynamic");
    expect(lockRouteMod.maxDuration).toBe(60);
    expect(lockRouteMod.maxDuration * 1000).toBeGreaterThan(NFL_LOCK.forwardTimeoutMs);
    expect(60 * 1000 > NFL_LOCK.forwardTimeoutMs).toBe(true);
    // a Next route may export ONLY handlers and route config — anything else breaks the Vercel build
    expect(Object.keys(lockRouteMod).sort()).toEqual(["GET", "dynamic", "maxDuration"]);
    const exported = [...src.matchAll(/^export (?:const|function|async function|type|class|let|var) (\w+)/gm)].map((m) => m[1]);
    expect(exported.sort()).toEqual(["GET", "dynamic", "maxDuration"]);
  });

  it("FAILS CLOSED: CRON_SECRET unset → 503 before anything else; header auth; store gate", () => {
    expect(/if \(!process\.env\.CRON_SECRET\)[\s\S]{0,140}?503/.test(src)).toBe(true);
    expect(/return !cron/.test(src)).toBe(false);
    expect(src).toMatch(/cronHeaderAuthed\(req\)/);
    expect(src).toMatch(/if \(!storeEnv\(\)\)[^\n]*503/);
    expect(src).not.toMatch(/searchParams\.get\(["']key["']\)/);
    expect(src).not.toMatch(/x-pl-sync/);
    expect(src).toMatch(/nfl-lock-not-configured: CRON_SECRET unset — failing closed/);
    expect(src).toMatch(/\[nfl-lock\] unauthorized poke/);
    expect(src).toMatch(/"sync-not-configured"/);
    // the ORDER: secret gate, then header, then store
    const iSecret = src.indexOf("if (!process.env.CRON_SECRET)");
    const iHeader = src.indexOf("cronHeaderAuthed(req)");
    const iStore = src.indexOf("if (!storeEnv())");
    expect(iSecret).toBeGreaterThan(0);
    expect(iHeader).toBeGreaterThan(iSecret);
    expect(iStore).toBeGreaterThan(iHeader);
  });

  it("stores under the NFL blobs by their pinned literals, merges, and never names an MLB or CFB blob", () => {
    expect(src).toMatch(/"pl:nfl:ledger:v1"/);
    expect(src).toMatch(/"pl:nfl:bank:v1"/);
    expect(src).toMatch(/"pl:nfl:oddsgap:v1"/);
    expect(src).toMatch(/mergeLedgers\(cur, \[entry\]\)/);
    expect(src).toMatch(/oddsEvents: \[\]/);
    expect(src).not.toMatch(/pl:ledger:v1/);
    expect(src).not.toMatch(/pl:bank:v1/);
    expect(src).not.toMatch(/pl:noplay/);
    expect(src).not.toMatch(/epoch/i);
    expect(src).not.toMatch(/api\.the-odds-api\.com/);
    expect(src).not.toMatch(/ODDS_API_KEY/);
    expect(src).not.toMatch(/res\.status !== 200/);
    // the literals are the contract's own
    expect(NFL_REDIS.ledger).toBe("pl:nfl:ledger:v1");
    expect(NFL_REDIS.bank).toBe("pl:nfl:bank:v1");
    expect(NFL_REDIS.oddsGap).toBe("pl:nfl:oddsgap:v1");
    // and none of them is a CFB key
    expect(NFL_REDIS.ledger).not.toBe(CFB_REDIS.ledger);
    expect(NFL_REDIS.bank).not.toBe(CFB_REDIS.bank);
  });

  it("NOT ONE CFB key, feed or path in the NFL shell (the separation rule, applied to this file)", () => {
    for (const bad of ["pl_cfb", "pl:cfb", "americanfootball_ncaaf", "college-football", '"/api/cfb', "CFB_LEAGUE", "CFB_PAPER", "CFB_RULES", "CFB_LOCK", "CFB_REDIS", "CFB_BANK_BASE"]) {
      expect(src, `NFL shell names ${bad}`).not.toContain(bad);
    }
    expect(src).toMatch(/from "@\/lib\/nfl\/rules"/);
    expect(src).toMatch(/NFL_LEAGUE/);
  });

  it("derives its date from the shared Pacific helper and builds through the league-bound slate helpers", () => {
    expect(src).toMatch(/ptToday\(\)/);
    expect(src).toMatch(/from "@\/lib\/server\/pt-date"/);
    expect(src).toMatch(/espnEventsOf\(NFL_LEAGUE, date\)/);
    expect(src).toMatch(/slateFromEspnOf\(NFL_LEAGUE, /);
    expect(src).toMatch(/buildLockEntry\(NFL_LEAGUE, /);
    expect(src).toMatch(/league: NFL_LEAGUE/);
    expect(src).toMatch(/feedsOf\(NFL_LEAGUE\)/);
    expect(src).toMatch(/from "@\/lib\/server\/football-lock"/);
    expect(src).not.toMatch(/timeZone: ?"America\/Los_Angeles"/);
    // the CFB-bound wrappers are never called here — they would price the CFB feed on the NFL ledger
    expect(src).not.toMatch(/[^A-Za-z]espnEvents\(date\)/);
    expect(src).not.toMatch(/[^A-Za-z]slateFromEspn\(/);
    expect(src).not.toMatch(/buildCfbLockEntry/);
  });

  it("the odds-missing refusal and the locked log line are the CFB shell's, on the NFL label", () => {
    expect(src).toMatch(/d\.ahead > 0 && \(slate\.oddsMissing \|\| pricedAhead === 0\)/);
    expect(src).toMatch(/const why = slate\.oddsMissing \?/);
    expect(src).toMatch(/status: "odds-missing"/);
    expect(src).toMatch(/\[nfl-lock\] LOCKED/);
    expect(src).not.toMatch(/\[cfb-lock\]/);
  });

  it("the shared helpers take cfg as a REQUIRED first argument — no default league on the money seam", () => {
    const helper = readSrc("src/lib/server/football-lock.ts");
    for (const fn of ["sweepPrevDates", "settlePass", "topUpDate", "markOddsGap"]) {
      expect(helper).toMatch(new RegExp(`export async function ${fn}\\(cfg: LeagueConfig, keys: LockKeys`));
      expect(helper).not.toMatch(new RegExp(`function ${fn}\\(cfg: LeagueConfig = `));
    }
    const lock = readSrc("src/lib/cfb/lock-server.ts");
    for (const fn of ["assertCardMoney", "buildLockEntry", "buildSweepEntry", "decideTopUp", "claimTopUp", "releaseTopUp", "assertEntryMoney", "planTopUp", "applyTopUp", "settleCandidate"]) {
      expect(lock).toMatch(new RegExp(`export function ${fn}\\(cfg: LeagueConfig, `));
      expect(lock).not.toMatch(new RegExp(`function ${fn}\\(cfg: LeagueConfig = `));
    }
    expect(lock).toMatch(/export function settleReady\(cfg: LeagueConfig, /);
    // the CFB-bound wrappers by today's names still exist, so the read-only CFB suite keeps resolving
    for (const w of ["assertCfbCardMoney", "buildCfbLockEntry", "buildCfbSweepEntry", "decideCfbTopUp", "claimCfbTopUp", "releaseCfbTopUp", "assertCfbEntryMoney", "planCfbTopUp", "applyCfbTopUp", "cfbSettleCandidate", "cfbSettleReady"]) {
      expect(lock).toMatch(new RegExp(`export const ${w} = `));
    }
    expect(lock).toMatch(/CFB_LOCK_SOURCE = "server-lock"/);
    expect(lock).toMatch(/CFB_LOCK_TRIGGER = "cfb-lock"/);
  });
});

describe("the gate — 503 / 401 / 503, in that order, and no store call on any refusal", () => {
  it("CRON_SECRET unset → 503 nfl-lock-not-configured, even with a correct header", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const { status, body } = await call(req({ date: DATE, header: { "x-cron-key": "anything" } }));
    expect(status).toBe(503);
    expect(String(body.error)).toMatch(/^nfl-lock-not-configured: CRON_SECRET unset/);
    expect(vi.mocked(redis).mock.calls.length).toBe(0);
    expect(vi.mocked(espnEventsOf).mock.calls.length).toBe(0);
  });

  it("wrong header → 401 unauthorized; no header → 401", async () => {
    const wrong = await call(req({ date: DATE, header: { "x-cron-key": "nope" } }));
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual({ error: "unauthorized" });
    const none = await call(req({ date: DATE, header: {} }));
    expect(none.status).toBe(401);
    expect(vi.mocked(redis).mock.calls.length).toBe(0);
    expect(vi.mocked(espnEventsOf).mock.calls.length).toBe(0);
  });

  it("store env unset → 503 sync-not-configured, after the header check", async () => {
    vi.mocked(storeEnv).mockReturnValue(null as never);
    const { status, body } = await call();
    expect(status).toBe(503);
    expect(body).toEqual({ error: "sync-not-configured" });
    expect(vi.mocked(redis).mock.calls.length).toBe(0);
    // a bad header still loses to the header gate first
    const wrong = await call(req({ date: DATE, header: { "x-cron-key": "nope" } }));
    expect(wrong.status).toBe(401);
  });

  it("a malformed ?date → 400, nothing read", async () => {
    const { status, body } = await call(req({ date: "13-09-2026" }));
    expect(status).toBe(400);
    expect(body).toEqual({ error: "bad date" });
    expect(vi.mocked(redis).mock.calls.length).toBe(0);
  });
});

describe("the exported GET, CALLED on the week-1 Sunday fixture", () => {
  it("BEFORE the window (15:59Z): waiting, nothing written, locksAt = 16:00Z", async () => {
    setNow(LOCKS_AT - 60_000);
    const fr = fakeRedis();
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.status).toBe("waiting");
    expect(body.firstKickoff).toBe(new Date(FIRST_KICK).toISOString());
    expect(body.locksAt).toBe(new Date(LOCKS_AT).toISOString());
    expect(body.leadMs).toBe(NFL_LOCK.leadMs);
    expect(fr.sets().length).toBe(0);
    // the FREE board decides — no odds pull before the window
    expect(vi.mocked(slateFromEspnOf).mock.calls.length).toBe(0);
    // an explicit ?date suppresses the sweep and the settle pass
    expect(body.sweep).toBeUndefined();
    expect(body.settle).toBeUndefined();
  });

  it("AT the window (16:00Z), the fixture AS CAPTURED: locks ONE sport-nfl entry under pl:nfl:ledger:v1 — daily 350 / fun 25, NO core (the synthesized odds clear nothing), the $25 fun parlay only", async () => {
    setNow(LOCKS_AT);
    const fr = fakeRedis();
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.status).toBe("locked");
    expect(body.date).toBe(DATE);
    expect(body.ahead).toBe(GAMES);
    expect(body.games).toBe(GAMES);
    expect(body.oddsMissing).toBe(false);
    expect(body.pricedAhead as number).toBeGreaterThan(0);
    expect(body.noPlay).toBe(false);
    expect(body.source).toBe("server-lock");
    expect(body.trigger).toBe("nfl-lock");
    // the headline AND the no-core detail, the line Josh reads under the card
    expect(String(body.note)).toMatch(/^locked by the server before the first kickoff — 13 games on the slate · No core ticket — no playable side clears \+2% EV at Caesars under 2\.60/);
    expect(String(body.note)).toMatch(/None of the \$350 core is staked; the \$25 fun parlay is the day's only money/);
    // the odds pull was paid exactly once, on the league's own config
    expect(vi.mocked(slateFromEspnOf).mock.calls.length).toBe(1);
    expect(vi.mocked(slateFromEspnOf).mock.calls[0][0]).toBe(NFL_LEAGUE);
    expect(vi.mocked(espnEventsOf).mock.calls[0][0]).toBe(NFL_LEAGUE);

    // ONE ledger write, on the NFL key, and no odds-gap marker
    expect(fr.sets().length).toBe(1);
    expect(fr.sets()[0][1]).toBe("pl:nfl:ledger:v1");
    expect(fr.markers().length).toBe(0);
    expect(fr.kv.has(CFB_REDIS.ledger)).toBe(false);

    const led = fr.ledger();
    expect(led.length).toBe(1);
    const e = led[0];
    expect(e.sport).toBe("nfl");
    expect(e.date).toBe(DATE);
    expect(e.locked).toBe(true);
    expect(e.daily).toBe(350);
    expect(e.fun).toBe(25);
    expect(e.daily).toBe(NFL_PAPER.daily);
    expect(e.fun).toBe(NFL_PAPER.fun);
    expect(e.source).toBe("server-lock");
    expect(e.trigger).toBe("nfl-lock");
    expect(e.lockedAt).toBe(LOCKS_AT);

    // THE MONEY on the captured fixture: zero core (measured: best evCz per game −0.72 … −3.31), one $25 fun parlay
    expect(e.core).toEqual([]);
    expect(body.core).toBe(0);
    expect(body.coreStake).toBe(0);
    expect(e.funT.length).toBe(1);
    expect(e.funT[0].id).toBe("nfl-2026-09-13-fun-1");
    expect(e.funT[0].stake).toBe(25);
    expect(e.funT[0].legs.length).toBeGreaterThanOrEqual(NFL_RULES.fun.legs.min);
    expect(e.funT[0].legs.length).toBeLessThanOrEqual(NFL_RULES.fun.legs.max);
    expect(e.funT[0].czDec).toBeGreaterThanOrEqual(NFL_RULES.fun.minDec);
    expect(e.funT[0].czDec).toBeLessThanOrEqual(NFL_RULES.fun.maxDec);
    expect(body.fun).toBe(1);
    expect(body.funStake).toBe(25);
    // and the fixture really is what the docblock says: nothing clears +2% at Caesars
    const board = slateAt(LOCKS_AT);
    for (const g of board.games) {
      const best = Math.max(...g.rows.filter((r) => r.playable && r.cz != null && r.evCz != null).map((r) => r.evCz as number));
      expect(best, `${g.id} clears the core gate — the fixture changed; re-read the docblock above sweetened()`).toBeLessThan(NFL_RULES.minEvPct);
    }
  });

  it("AT the window (16:00Z), the SWEETENED board: core tickets seat — nfl-2026-09-13-core-* ids, every stake in the $5–$50 band, ≤ 10 tickets, core ≤ $350, one leg per game, fun ≤ $25", async () => {
    setNow(LOCKS_AT);
    vi.mocked(slateFromEspnOf).mockImplementation(async (_cfg, _d, _e, now) => sweetened(slateAt(now), now, GAMES));
    const fr = fakeRedis();
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.status).toBe("locked");
    expect(body.noPlay).toBe(false);
    expect(String(body.note)).toMatch(/^locked by the server before the first kickoff — 13 games on the slate$/);

    expect(fr.sets().length).toBe(1);
    expect(fr.sets()[0][1]).toBe("pl:nfl:ledger:v1");
    const e = fr.ledger()[0];
    expect(e.sport).toBe("nfl");
    expect(e.daily).toBe(350);
    expect(e.fun).toBe(25);
    expect(e.source).toBe("server-lock");
    expect(e.trigger).toBe("nfl-lock");

    // THE MONEY
    expect(e.core.length).toBeGreaterThan(0);
    expect(e.core.length).toBeLessThanOrEqual(NFL_RULES.tickets.max);
    expect(e.core.length).toBeLessThanOrEqual(10);
    expect(stakes(e)).toBeLessThanOrEqual(350);
    expect(stakes(e)).toBeLessThanOrEqual(NFL_PAPER.daily);
    expect(body.coreStake).toBe(stakes(e));
    expect(body.core).toBe(e.core.length);
    for (const t of e.core) {
      expect(t.stake).toBeGreaterThanOrEqual(NFL_RULES.minStake);
      expect(t.stake).toBeGreaterThanOrEqual(5);
      expect(t.stake).toBeLessThanOrEqual(50);
      expect(t.stake).toBeLessThanOrEqual(NFL_RULES.maxStake);
      expect(t.id).toMatch(/^nfl-2026-09-13-core-\d+$/);
      expect(t.bucket).toBe("core");
      expect(t.czEv).toBeGreaterThanOrEqual(NFL_RULES.minEvPct);
      expect(t.czDec).toBeLessThanOrEqual(NFL_RULES.maxDec);
    }
    // the ids are minted in order from 1 on the NFL prefix
    expect(e.core.map((t) => t.id)).toEqual(e.core.map((_, i) => `nfl-2026-09-13-core-${i + 1}`));
    for (const t of e.funT) {
      expect(t.id).toBe("nfl-2026-09-13-fun-1");
      expect(t.stake).toBeLessThanOrEqual(25);
    }
    expect(e.funT.reduce((s, t) => s + t.stake, 0)).toBeLessThanOrEqual(NFL_PAPER.fun);
    // the ids are distinct — they key the grading map
    const ids = [...e.core, ...e.funT].map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    // one leg per game across the core (NFL_RULES.oneLegPerGame)
    const coreGames = e.core.flatMap((t) => t.legs.map((l) => l.gkey));
    expect(new Set(coreGames).size).toBe(coreGames.length);
    // every leg sits on a game still ahead, on this date
    for (const t of [...e.core, ...e.funT]) for (const leg of t.legs) expect(Date.parse(e.games[leg.gkey].start)).toBeGreaterThan(Date.now());
    // not one CFB id anywhere on the day
    for (const id of ids) expect(id).not.toMatch(/^cfb-/);
    // THIRTEEN +EV games at the $50 cap would be far past $350: the day stops at the allotment
    // exactly. (With only nine sweetened games the real builder deployed $300 — measured
    // 2026-09-08: maxLegs is 2, so `drafts()` also seats DOUBLES of two favourites, whose ~10%
    // EV outranks a single's ~5% in the byEv sort, and each double consumes two games — six
    // tickets at $50. That is the engine's own shape, not a defect; the sweetened set is widened
    // to every game so the $350 fills and the allotment cap is what binds.)
    expect(stakes(e)).toBe(350);
    expect(e.core.length).toBeGreaterThanOrEqual(7); // $350 / $50
  });

  it("the money guard on the NFL rails: a card past $350 / $50 / 10 tickets is a 502 with NOTHING written", async () => {
    setNow(LOCKS_AT);
    const { buildCfbCard } = await import("@/lib/cfb/card");
    const { buildLockEntry, assertCardMoney } = await import("@/lib/cfb/lock-server");
    const slate = sweetened(slateAt(LOCKS_AT), LOCKS_AT, GAMES);
    const good = buildLockEntry(NFL_LEAGUE, slate, { now: LOCKS_AT, bankroll: NFL_BANK_BASE, ahead: GAMES, total: GAMES, firstKickoff: FIRST_KICK });
    expect(good.card.coreSum).toBe(350);
    // over the allotment
    const over = { ...good.card, core: good.card.core.map((t) => ({ ...t, stake: 50 })).concat([{ ...good.card.core[0], id: "nfl-2026-09-13-core-99", stake: 50 }]) };
    over.coreSum = over.core.reduce((s, t) => s + t.stake, 0);
    expect(over.coreSum).toBeGreaterThan(350);
    expect(() => assertCardMoney(NFL_LEAGUE, over)).toThrow(/NFL MONEY GUARD: the card deploys \$\d+ of core but the day's core allotment is \$350/);
    // a $60 ticket past the $50 band
    const wide = { ...good.card, core: good.card.core.map((t, i) => (i === 0 ? { ...t, stake: 60 } : { ...t, stake: 5 })) };
    expect(() => assertCardMoney(NFL_LEAGUE, wide)).toThrow(/NFL MONEY GUARD: core ticket nfl-2026-09-13-core-1 carries \$60, outside the \$5–\$50 band NFL_RULES sets/);
    // the CFB guard is a different guard with different numbers
    expect(() => assertCardMoney(NFL_LEAGUE, good.card)).not.toThrow();
    const plain = buildCfbCard(slate, { bankroll: NFL_BANK_BASE, daily: 350, fun: 25, now: LOCKS_AT, rules: NFL_RULES, idPrefix: "nfl" });
    expect(plain.core.map((t) => t.id)).toEqual(good.card.core.map((t) => t.id));
  });

  it("the SECOND poke after the server's own lock is already-locked — never re-staked (the top-up is reported, the lock is not repeated)", async () => {
    setNow(LOCKS_AT);
    const fr = fakeRedis();
    await call();
    expect(fr.sets().length).toBe(1);
    const first = JSON.stringify(fr.ledger()[0].core.map((t) => t.id));
    setNow(LOCKS_AT + 5 * 60_000);
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.status).toBe("already-locked");
    expect(body.source).toBe("server-lock");
    expect(body.topUp).toBeDefined();
    // the lock path was never re-entered: no second slate pull for a lock
    const led = fr.ledger();
    expect(led.length).toBe(1);
    expect(led[0].sport).toBe("nfl");
    // whatever the top-up did, the ORIGINAL core ids are all still there, in order
    expect(JSON.stringify(led[0].core.slice(0, JSON.parse(first).length).map((t) => t.id))).toBe(first);
    expect(stakes(led[0])).toBeLessThanOrEqual(350);
    expect(led[0].core.length).toBeLessThanOrEqual(10);
  });

  it("LATE poke at 18:00Z: the eight 17:00Z games have kicked, five are ahead — locks from those five and every leg sits on a game still ahead", async () => {
    setNow(T("2026-09-13T18:00:00Z"));
    const fr = fakeRedis();
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.status).toBe("locked");
    expect(body.ahead).toBe(5);
    expect(body.games).toBe(GAMES);
    expect(String(body.note)).toMatch(/^locked after first kickoff — 5 of 13 games still ahead/);
    expect(fr.sets().length).toBe(1);
    const e = fr.ledger()[0];
    expect(e.sport).toBe("nfl");
    expect(e.source).toBe("server-lock");
    expect(e.daily).toBe(350);
    // nothing priced on a game that had kicked off — every leg sits on a game still ahead
    const legs = [...e.core, ...e.funT].flatMap((t) => t.legs);
    expect(legs.length).toBeGreaterThan(0);
    for (const leg of legs) expect(Date.parse(e.games[leg.gkey].start)).toBeGreaterThan(Date.now());
    // the kicked games are 17:00Z; nothing on the day is priced on one
    for (const leg of legs) expect(Date.parse(e.games[leg.gkey].start)).toBeGreaterThanOrEqual(LATE_KICK);
    // the core is at most one ticket per open game
    expect(e.core.length).toBeLessThanOrEqual(5);
    expect(stakes(e)).toBeLessThanOrEqual(350);
    for (const t of e.core) expect(t.stake).toBeLessThanOrEqual(50);
  });

  it("LATE poke at 18:00Z on the SWEETENED board: the core is built from the five open games only — every core leg kicks at 20:25Z or later, ≤ 5 tickets, ≤ $250 at the $50 cap", async () => {
    setNow(T("2026-09-13T18:00:00Z"));
    // sweeten EVERY game (the kicked ones included) — the card must ignore the kicked ones on its own
    vi.mocked(slateFromEspnOf).mockImplementation(async (_cfg, _d, _e, now) => sweetened(slateAt(LOCKS_AT), LOCKS_AT, GAMES));
    const fr = fakeRedis();
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.status).toBe("locked");
    expect(body.ahead).toBe(5);
    expect(String(body.note)).toMatch(/^locked after first kickoff — 5 of 13 games still ahead$/);
    const e = fr.ledger()[0];
    expect(e.core.length).toBeGreaterThan(0);
    expect(e.core.length).toBeLessThanOrEqual(5);
    // five open games × the $50 cap = $250 is the most the day can carry; never the $350
    expect(stakes(e)).toBeLessThanOrEqual(250);
    for (const t of e.core) {
      expect(t.id).toMatch(/^nfl-2026-09-13-core-\d+$/);
      expect(t.stake).toBeLessThanOrEqual(50);
      for (const leg of t.legs) expect(Date.parse(e.games[leg.gkey].start)).toBeGreaterThanOrEqual(LATE_KICK);
    }
    const coreGames = e.core.flatMap((t) => t.legs.map((l) => l.gkey));
    expect(new Set(coreGames).size).toBe(coreGames.length);
  });

  it("MISSED window (after SNF kicked, 00:30Z on the 14th, ?date=2026-09-13): a NO-PLAY entry, nothing staked, trigger nfl-lock", async () => {
    setNow(SNF_KICK + 10 * 60_000);
    const fr = fakeRedis();
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.status).toBe("locked");
    expect(body.ahead).toBe(0);
    expect(body.noPlay).toBe(true);
    expect(body.cause).toBe("no-lock");
    expect(String(body.note)).toMatch(/NO-PLAY — lock window missed: every one of the 13 games on 2026-09-13 had kicked off/);
    const e = fr.ledger()[0];
    expect(e.sport).toBe("nfl");
    expect(e.core).toEqual([]);
    expect(e.funT).toEqual([]);
    expect(e.trigger).toBe("nfl-lock");
    expect(e.daily).toBe(350);
  });

  it("ODDS MISSING inside the window: 502, nothing written to the ledger, the NFL odds-gap marker stamped under pl:nfl:oddsgap:v1:<date>", async () => {
    setNow(LOCKS_AT);
    vi.mocked(slateFromEspnOf).mockImplementation(async (_cfg, _d, _e, now) => ({ ...slateAt(now), oddsMissing: true }));
    const fr = fakeRedis();
    const { status, body } = await call();
    expect(status).toBe(502);
    expect(body.status).toBe("odds-missing");
    expect(body.ahead).toBe(GAMES);
    expect(fr.sets().length).toBe(0);
    expect(fr.markers().length).toBe(1);
    expect(fr.markers()[0][1]).toBe(`pl:nfl:oddsgap:v1:${DATE}`);
    expect(fr.markers()[0].slice(3)).toEqual(["EX", NFL_LEAGUE.oddsGapTtlSec]);
    expect(fr.kv.has(`${CFB_REDIS.oddsGap}:${DATE}`)).toBe(false);
  });

  it("dry=1 builds and returns the card, writes nothing", async () => {
    setNow(LOCKS_AT);
    const fr = fakeRedis();
    const { status, body } = await call(req({ date: DATE, dry: true }));
    expect(status).toBe(200);
    expect(body.status).toBe("locked");
    expect(body.dry).toBe(true);
    const e = body.entry as CfbLedgerEntry;
    expect(e.sport).toBe("nfl");
    expect(e.daily).toBe(350);
    expect(fr.allSets().length).toBe(0);
  });

  it("a stored CFB-shaped entry on the NFL key for the date is left alone — 'not an NFL card', nothing touched", async () => {
    setNow(LOCKS_AT);
    const foreign: CfbLedgerEntry = {
      sport: "cfb",
      date: DATE,
      locked: true,
      daily: 250,
      fun: 25,
      core: [{ id: `cfb-${DATE}-core-1`, bucket: "core", name: "SINGLE · Device ML", stake: 20, czOdds: -150, czDec: 1.6667, prob: 66, czEv: 3, legs: [] }],
      funT: [],
      lockedAt: T(`${DATE}T14:00:00Z`),
      games: {},
      grading: { tickets: {}, legs: {}, done: false },
    };
    const fr = fakeRedis({ [NFL_REDIS.ledger]: JSON.stringify({ ledger: [foreign], at: 1 }) });
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.status).toBe("already-locked");
    expect(String((body.topUp as { reason: string }).reason)).toMatch(/not an NFL card/);
    expect(fr.sets().length).toBe(0);
    expect(vi.mocked(slateFromEspnOf).mock.calls.length).toBe(0);
  });

  it("no-slate: a date with no NFL kickoff writes nothing and pays no odds pull", async () => {
    vi.mocked(espnEventsOf).mockResolvedValue([]);
    const fr = fakeRedis();
    const { status, body } = await call(req({ date: "2026-09-15" }));
    expect(status).toBe(200);
    expect(body.status).toBe("no-slate");
    expect(fr.allSets().length).toBe(0);
    expect(vi.mocked(slateFromEspnOf).mock.calls.length).toBe(0);
  });

  it("ESPN down → 502 espn unavailable, nothing written", async () => {
    vi.mocked(espnEventsOf).mockRejectedValue(new Error("espn scoreboard 503 for 2026-09-13"));
    const fr = fakeRedis();
    const { status, body } = await call();
    expect(status).toBe(502);
    expect(String(body.error)).toMatch(/^espn unavailable: espn scoreboard 503/);
    expect(fr.allSets().length).toBe(0);
  });
});
