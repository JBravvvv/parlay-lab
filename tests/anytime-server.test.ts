import { afterEach, describe, expect, it, vi } from "vitest";
import { decide } from "@/lib/anytime/engine";
import { gradeOf } from "@/lib/anytime/grade";
import { memoryKv } from "@/lib/anytime/kv";
import { readLedger } from "@/lib/anytime/ledger";
import { runPicks, type RunDeps, type RunResult } from "@/lib/anytime/run";
import type { PickRecord } from "@/lib/anytime/types";
import { AZ_BOOKS } from "@/lib/az/books";
import { excludedBy } from "@/lib/az/exclusions";
import type { LeagueConfig } from "@/lib/football/league";
import { NFL_LEAGUE } from "@/lib/nfl/rules";
import { SCORE_MISSING_MS, alertPayloadOf, footballAdapter, footballScores, liveFootballFeeds, oddsMeter, oncePerRun, runAlert, type FootballFeeds } from "@/lib/server/anytime-football";
import { upstashKv } from "@/lib/server/anytime-kv";
import { __resetOddsClientForTests, currentOddsRun } from "@/lib/server/odds-client";
import { cand, clockAt, KICK, T0 } from "./helpers/anytime";

/* THE SERVER SIDE OF THE ANY-TIME ENGINE: the store, the live football feed, the scores. No network:
   every feed is injected and every price and score is invented. */

type Mk = { key: string; outcomes: { name: string; price: number; point?: number }[] };
const HOME = "Arizona Cardinals";
const AWAY = "Seattle Seahawks";
const h2h = (home: number, away: number, h = HOME, a = AWAY): Mk => ({ key: "h2h", outcomes: [{ name: h, price: home }, { name: a, price: away }] });
const book = (key: string, markets: Mk[]) => ({ key, title: key, last_update: "2026-11-15T16:59:30Z", markets });
const oddsEvent = (id: string, start: string, bookmakers: unknown[], h = HOME, a = AWAY) => ({ id, sport_key: "americanfootball_nfl", commence_time: start, home_team: h, away_team: a, bookmakers });
/* an invented arbitrage: the best price on each side is +120, at different books. Both sides are picks. */
const ARB = [book("draftkings", [h2h(120, -140)]), book("fanduel", [h2h(-140, 120)])];
/* an ordinary vigged market: no pick */
const FLAT = [book("draftkings", [h2h(-110, -110)]), book("fanduel", [h2h(-110, -110)])];

type EspnOver = { status?: string; state?: string; completed?: boolean; home?: number; away?: number; homeName?: string; awayName?: string };
const espnEvent = (id: string, start: string, o: EspnOver = {}) => ({
  id,
  date: start,
  competitions: [
    {
      date: start,
      competitors: [
        { homeAway: "home", score: String(o.home ?? 0), team: { id: "22", displayName: o.homeName ?? HOME, shortDisplayName: "Cardinals", abbreviation: "ARI" } },
        { homeAway: "away", score: String(o.away ?? 0), team: { id: "26", displayName: o.awayName ?? AWAY, shortDisplayName: "Seahawks", abbreviation: "SEA" } },
      ],
    },
  ],
  status: { type: { name: o.status ?? "STATUS_SCHEDULED", state: o.state ?? "pre", completed: o.completed ?? false } },
});
const FINAL: EspnOver = { status: "STATUS_FINAL", state: "post", completed: true };

/** Feeds a test fills in. Counts every request. */
function feedsOf(init: { odds?: unknown[]; days?: Record<string, unknown[]>; fpi?: unknown } = {}) {
  const f = {
    oddsEvents: init.odds ?? [],
    days: init.days ?? ({} as Record<string, unknown[]>),
    fpiPayload: init.fpi ?? null,
    clock: clockAt(),
    oddsCalls: 0,
    espnCalls: [] as string[],
    fpiCalls: 0,
    oddsError: null as Error | null,
    badDays: new Set<string>(),
    async odds() {
      f.oddsCalls++;
      if (f.oddsError) throw f.oddsError;
      return { events: f.oddsEvents, fetchedAt: f.clock() };
    },
    async espnDay(_L: LeagueConfig, date: string) {
      f.espnCalls.push(date);
      if (f.badDays.has(date)) throw new Error(`espn scoreboard 503 for ${date}`);
      return f.days[date] ?? [];
    },
    async fpi() {
      f.fpiCalls++;
      return f.fpiPayload;
    },
  };
  return f satisfies FootballFeeds & Record<string, unknown>;
}

const ctx = (now = T0) => ({ now, runId: "r1", trigger: "manual-api" as const, force: true });
const pickOf = (over: Parameters<typeof cand>[0] = {}): PickRecord =>
  decide({ candidates: [cand(over)], now: T0, runId: "r1", trigger: "manual-api", families: new Map(), excluded: excludedBy(), kellyBankroll: 100, kellyOpenByEvent: new Map() }).picks[0];
const ref = (id: string) => ({ source: "espn" as const, league: "nfl", id, home: HOME, away: AWAY });

afterEach(() => {
  vi.unstubAllGlobals();
  __resetOddsClientForTests();
  delete process.env.ODDS_API_KEY;
});

describe("the store adapter speaks exactly the commands the ledger was tested against", () => {
  function fake(answers: Record<string, unknown> = {}) {
    const sent: unknown[][] = [];
    const kv = upstashKv(async (cmd) => (sent.push(cmd), answers[String(cmd[0])] ?? null));
    return { kv, sent };
  }

  it("a pick is created with SET ... NX and reports whether THIS call created it", async () => {
    const won = fake({ SET: "OK" });
    expect(await won.kv.setNx("pl:at:pick:a", "{}")).toBe(true);
    expect(won.sent).toEqual([["SET", "pl:at:pick:a", "{}", "NX"]]);
    const lost = fake({ SET: null });
    expect(await lost.kv.setNx("pl:at:pick:a", "{}")).toBe(false);
  });

  it("the lease is the same command with an expiry", async () => {
    const { kv, sent } = fake({ SET: "OK" });
    await kv.setNx("pl:at:lease", "r1", 90_000);
    expect(sent).toEqual([["SET", "pl:at:lease", "r1", "NX", "PX", 90_000]]);
  });

  it("reads: one answer per key in order, and a short or empty reply is a missing value", async () => {
    const { kv, sent } = fake({ GET: "v", MGET: ["a", null], SMEMBERS: ["x", "y"], LRANGE: ["1", "2"] });
    expect(await kv.get("k")).toBe("v");
    expect(await kv.mget(["a", "b", "c"])).toEqual(["a", null, null]);
    expect(await kv.mget([])).toEqual([]);
    expect(await kv.smembers("s")).toEqual(["x", "y"]);
    expect(await kv.lrange("l", 0, 19)).toEqual(["1", "2"]);
    expect(sent).toEqual([["GET", "k"], ["MGET", "a", "b", "c"], ["SMEMBERS", "s"], ["LRANGE", "l", 0, 19]]);
    const empty = fake();
    expect(await empty.kv.get("k")).toBeNull();
    expect(await empty.kv.smembers("s")).toEqual([]);
  });

  it("index writes; an empty member list sends nothing; the run list is trimmed to its newest entries", async () => {
    const { kv, sent } = fake();
    await kv.set("k", "v");
    await kv.del("k");
    await kv.sadd("s", ["a", "b"]);
    await kv.srem("s", ["a"]);
    await kv.sadd("s", []);
    await kv.srem("s", []);
    await kv.lpushTrim("l", "x", 300);
    expect(sent).toEqual([["SET", "k", "v"], ["DEL", "k"], ["SADD", "s", "a", "b"], ["SREM", "s", "a"], ["LPUSH", "l", "x"], ["LTRIM", "l", 0, 299]]);
  });

  it("a store error is thrown to the caller, never swallowed", async () => {
    const kv = upstashKv(async () => {
      throw new Error("store 403");
    });
    await expect(kv.get("k")).rejects.toThrow("store 403");
    await expect(kv.setNx("k", "v")).rejects.toThrow("store 403");
  });
});

describe("the football adapter: one odds call, free schedule reads, two books", () => {
  it("prices a listed game it can tie to the schedule, from one odds call", async () => {
    const f = feedsOf({ odds: [oddsEvent("oe1", KICK, ARB)], days: { "2026-11-15": [espnEvent("401", KICK)] } });
    const out = await footballAdapter(NFL_LEAGUE, f).candidates(ctx());
    expect(f.oddsCalls).toBe(1);
    expect(out.candidates.map((c) => c.selection).sort()).toEqual(["Cardinals ML", "Seahawks ML"]);
    expect(out.events).toEqual([{ sport: "nfl", eventId: "oe1", commence: KICK }]);
    expect(out.snapshot).toEqual({ id: "nfl-r1", fetchedAt: T0, events: 1 });
    for (const c of out.candidates) {
      expect(c).toMatchObject({ sport: "nfl", snapshotId: "nfl-r1", fetchedAt: T0, live: false, gradeRef: { source: "espn", league: "nfl", id: "401", home: HOME, away: AWAY } });
      for (const k of Object.keys(c.quotes)) expect(AZ_BOOKS).toContain(k);
    }
    expect(out.notes).toEqual([]);
  });

  it("asks ESPN only for the days that have a listed game (and the day after), each once", async () => {
    const f = feedsOf({ odds: [oddsEvent("oe1", KICK, ARB), oddsEvent("oe2", "2026-11-17T01:15:00Z", ARB, "Dallas Cowboys", "New York Giants")], days: { "2026-11-15": [espnEvent("401", KICK)] } });
    await footballAdapter(NFL_LEAGUE, f).candidates(ctx());
    expect([...f.espnCalls].sort()).toEqual(["2026-11-15", "2026-11-16", "2026-11-17"]);
    expect(f.fpiCalls).toBe(1);
  });

  it("a late Pacific kickoff that ESPN files under the next day is still found", async () => {
    const late = "2026-11-16T05:30:00Z"; // 9:30 pm Pacific on the 15th, 12:30 am Eastern on the 16th
    const f = feedsOf({ odds: [oddsEvent("oe1", late, ARB)], days: { "2026-11-16": [espnEvent("401", late)] } });
    const out = await footballAdapter(NFL_LEAGUE, f).candidates(ctx());
    expect(out.candidates).toHaveLength(2);
    expect(out.candidates[0].commence).toBe(late);
  });

  it("a game that has started, or starts beyond the horizon, is not priced", async () => {
    const f = feedsOf({
      odds: [oddsEvent("old", "2026-11-15T16:00:00Z", ARB), oddsEvent("far", "2026-11-30T21:25:00Z", ARB)],
      days: { "2026-11-15": [espnEvent("401", "2026-11-15T16:00:00Z")] },
    });
    const out = await footballAdapter(NFL_LEAGUE, f).candidates(ctx());
    expect(out.candidates).toEqual([]);
    expect(out.snapshot).toMatchObject({ events: 0 });
    expect(out.notes).toEqual(["nfl: 1 listed game(s) start beyond the 8-day horizon and were not priced"]);
    /* nothing to price: no schedule request was made */
    expect(f.espnCalls).toEqual([]);
  });

  it("a game the schedule shows as already under way is not priced, whatever the odds feed says", async () => {
    const f = feedsOf({ odds: [oddsEvent("oe1", KICK, ARB)], days: { "2026-11-15": [espnEvent("401", KICK, { status: "STATUS_IN_PROGRESS", state: "in" })] } });
    expect((await footballAdapter(NFL_LEAGUE, f).candidates(ctx())).candidates).toEqual([]);
  });

  it("a listed game with no schedule row is not priced, and says so", async () => {
    const f = feedsOf({ odds: [oddsEvent("oe1", KICK, ARB)], days: {} });
    const out = await footballAdapter(NFL_LEAGUE, f).candidates(ctx());
    expect(out.candidates).toEqual([]);
    expect(out.notes).toEqual(["nfl: 1 listed game(s) could not be tied to the ESPN schedule and were not priced"]);
  });

  it("a third book in the reply changes nothing", async () => {
    const days = { "2026-11-15": [espnEvent("401", KICK)] };
    const two = await footballAdapter(NFL_LEAGUE, feedsOf({ odds: [oddsEvent("oe1", KICK, ARB)], days })).candidates(ctx());
    const three = await footballAdapter(NFL_LEAGUE, feedsOf({ odds: [oddsEvent("oe1", KICK, [...ARB, book("williamhill_us", [h2h(400, -600)]), book("pinnacle", [h2h(-105, -105)])])], days })).candidates(ctx());
    expect(three).toEqual(two);
  });

  it("an odds failure or a schedule failure is thrown, not turned into an empty slate", async () => {
    const f = feedsOf({ odds: [oddsEvent("oe1", KICK, ARB)] });
    f.oddsError = new Error("Odds API 401 for nfl");
    await expect(footballAdapter(NFL_LEAGUE, f).candidates(ctx())).rejects.toThrow("Odds API 401");
    f.oddsError = null;
    f.badDays.add("2026-11-15");
    await expect(footballAdapter(NFL_LEAGUE, f).candidates(ctx())).rejects.toThrow("espn scoreboard 503");
  });

  it("one run reads each free feed once however many ask; a failed read may be retried", async () => {
    const f = feedsOf({ days: { "2026-11-15": [espnEvent("401", KICK)] } });
    const once = oncePerRun(f);
    await Promise.all([once.espnDay(NFL_LEAGUE, "2026-11-15"), once.espnDay(NFL_LEAGUE, "2026-11-15"), once.fpi(NFL_LEAGUE), once.fpi(NFL_LEAGUE)]);
    expect(f.espnCalls).toEqual(["2026-11-15"]);
    expect(f.fpiCalls).toBe(1);
    f.badDays.add("2026-11-16");
    await expect(once.espnDay(NFL_LEAGUE, "2026-11-16")).rejects.toThrow();
    f.badDays.clear();
    await expect(once.espnDay(NFL_LEAGUE, "2026-11-16")).resolves.toEqual([]);
    /* odds are never remembered here: two asks are two snapshots */
    await once.odds(NFL_LEAGUE);
    await once.odds(NFL_LEAGUE);
    expect(f.oddsCalls).toBe(2);
  });
});

describe("the live feeds", () => {
  const answer = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", "x-requests-last": "3", "x-requests-remaining": "9000", "x-requests-used": "1000", date: new Date().toUTCString() } });

  it("odds: asks for the two books by name, never by region, never from a cache, and drops any other book", async () => {
    process.env.ODDS_API_KEY = "test-key-never-logged";
    const seen: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string, init?: RequestInit) => (seen.push({ url: String(u), init }), answer([oddsEvent("oe1", KICK, [...ARB, book("betmgm", [h2h(-150, 130)])])]))));
    const pull = await liveFootballFeeds().odds(NFL_LEAGUE);
    expect(seen).toHaveLength(1);
    const u = new URL(seen[0].url);
    expect(u.searchParams.get("bookmakers")).toBe("draftkings,fanduel");
    expect(u.searchParams.has("regions")).toBe(false);
    expect(u.searchParams.get("markets")).toBe("h2h,spreads,totals");
    expect(seen[0].init).toMatchObject({ cache: "no-store" });
    expect((pull.events as { bookmakers: { key: string }[] }[])[0].bookmakers.map((b) => b.key)).toEqual(["draftkings", "fanduel"]);
    expect(Math.abs(pull.fetchedAt - Date.now())).toBeLessThan(5_000);
  });

  it("odds: no key, a refusal, or a reply that is not a list is an error, and the key is in none of them", async () => {
    const calls = vi.fn(async () => new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", calls);
    await expect(liveFootballFeeds().odds(NFL_LEAGUE)).rejects.toThrow("ODDS_API_KEY not set");
    expect(calls).not.toHaveBeenCalled();
    process.env.ODDS_API_KEY = "test-key-never-logged";
    const refused = await liveFootballFeeds().odds(NFL_LEAGUE).catch((e: Error) => e.message);
    expect(refused).toBe("Odds API 401 for nfl");
    vi.stubGlobal("fetch", vi.fn(async () => answer({ message: "quota" })));
    __resetOddsClientForTests();
    const odd = await liveFootballFeeds().odds(NFL_LEAGUE).catch((e: Error) => e.message);
    expect(odd).toBe("Odds API: unexpected reply for nfl");
    for (const m of [refused, odd]) expect(m).not.toContain("test-key-never-logged");
  });

  it("schedule: one ESPN day per request; a refusal is an error; FPI failure is just no FPI", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => (seen.push(String(u)), new Response(JSON.stringify({ events: [espnEvent("401", KICK)] }), { status: 200 }))));
    expect(await liveFootballFeeds().espnDay(NFL_LEAGUE, "2026-11-15")).toHaveLength(1);
    expect(seen[0]).toBe(`${NFL_LEAGUE.feeds.espnScoreboard}?${NFL_LEAGUE.feeds.espnScoreboardQuery}&dates=20261115`);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 503 })));
    await expect(liveFootballFeeds().espnDay(NFL_LEAGUE, "2026-11-15")).rejects.toThrow("espn scoreboard 503 for nfl 2026-11-15");
    expect(await liveFootballFeeds().fpi(NFL_LEAGUE)).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("network"))));
    expect(await liveFootballFeeds().fpi(NFL_LEAGUE)).toBeNull();
  });
});

describe("scores: the schedule row the pick was made on, with the start time the schedule shows now", () => {
  const start = Date.parse(KICK);

  it("a final is read with its score and its current start; a game in progress is not final", async () => {
    const p = pickOf({ gradeRef: ref("401") });
    const f = feedsOf({ days: { "2026-11-15": [espnEvent("401", KICK, { ...FINAL, home: 24, away: 21 })] } });
    const got = await footballScores([NFL_LEAGUE], f)([p], start + 4 * 3600_000);
    expect(got).toEqual(new Map([[p.id, { home: 24, away: 21, final: true, status: "final", start: KICK }]]));
    f.days["2026-11-15"] = [espnEvent("401", KICK, { status: "STATUS_IN_PROGRESS", state: "in", home: 14, away: 7 })];
    const live = (await footballScores([NFL_LEAGUE], f)([p], start + 3600_000)) as Map<string, unknown>;
    expect(live.get(p.id)).toMatchObject({ final: false, status: "live", home: 14, away: 7 });
  });

  it("a game moved two days is found on its new day, and each book settles it by its own window", async () => {
    const p = pickOf({ gradeRef: ref("401") });
    const moved = "2026-11-18T01:15:00Z";
    const f = feedsOf({ days: { "2026-11-17": [espnEvent("401", moved, { ...FINAL, home: 24, away: 21 })] } });
    const now = Date.parse("2026-11-18T06:00:00Z");
    const got = (await footballScores([NFL_LEAGUE], f)([p], now)) as Map<string, { start: string }>;
    expect(got.get(p.id)).toMatchObject({ final: true, start: moved });
    const score = got.get(p.id) as Parameters<typeof gradeOf>[1];
    expect(gradeOf({ ...p, book: "draftkings" }, score, now, "espn")).toMatchObject({ result: "void", reason: "postponed" });
    expect(gradeOf({ ...p, book: "fanduel" }, score, now, "espn")).toMatchObject({ result: "won" });
  });

  it("never asks the schedule about a day that has not come", async () => {
    const p = pickOf({ gradeRef: ref("401") });
    const f = feedsOf();
    await footballScores([NFL_LEAGUE], f)([p], start + 3600_000);
    /* today (Pacific) is the 15th; a board reads its own day and the next */
    expect(Math.max(...f.espnCalls.map((d) => Date.parse(d)))).toBeLessThanOrEqual(Date.parse("2026-11-16"));
  });

  it("a game the schedule has dropped is left open for nine days, then reported missing; the grader voids it at the book's deadline", async () => {
    const p = pickOf({ gradeRef: ref("401") });
    const f = feedsOf();
    const early = (await footballScores([NFL_LEAGUE], f)([p], start + SCORE_MISSING_MS - 1)) as Map<string, unknown>;
    expect(early.has(p.id)).toBe(false);
    const late = start + SCORE_MISSING_MS + 1;
    const got = (await footballScores([NFL_LEAGUE], f)([p], late)) as Map<string, Parameters<typeof gradeOf>[1]>;
    expect(got.get(p.id)).toMatchObject({ final: false, status: "missing" });
    expect(gradeOf(p, got.get(p.id), late, "espn")).toMatchObject({ result: "void", reason: "postponed", detail: "feed status missing" });
    /* "missing" before the book's window closes is still open */
    expect(gradeOf({ ...p, book: "draftkings" }, { home: 0, away: 0, final: false, status: "missing" }, start + 47 * 3600_000, "espn")).toBeNull();
  });

  it("the same schedule id with different teams is not the pick's game", async () => {
    const p = pickOf({ gradeRef: ref("401") });
    const f = feedsOf({ days: { "2026-11-15": [espnEvent("401", KICK, { ...FINAL, home: 24, away: 21, homeName: "Dallas Cowboys" })] } });
    const got = (await footballScores([NFL_LEAGUE], f)([p], start + 4 * 3600_000)) as Map<string, unknown>;
    expect(got.has(p.id)).toBe(false);
  });

  it("a final with no score on it is not final", async () => {
    const p = pickOf({ gradeRef: ref("401") });
    const ev = espnEvent("401", KICK, FINAL) as { competitions: { competitors: { score?: string }[] }[] };
    for (const c of ev.competitions[0].competitors) delete c.score;
    const got = (await footballScores([NFL_LEAGUE], feedsOf({ days: { "2026-11-15": [ev] } }))([p], start + 4 * 3600_000)) as Map<string, unknown>;
    expect(got.get(p.id)).toMatchObject({ final: false, status: "final" });
    expect(gradeOf(p, got.get(p.id) as Parameters<typeof gradeOf>[1], start + 4 * 3600_000, "espn")).toBeNull();
  });

  it("a day that cannot be read is reported beside the scores that were read, and is never called missing", async () => {
    /* a pick whose game was due on the 2nd (Pacific), a day the schedule cannot be read for */
    const a: PickRecord = { ...pickOf({ eventId: "evA", gradeRef: ref("399") }), id: "evA-old-1", commence: "2026-11-03T01:15:00Z" };
    const b = pickOf({ gradeRef: ref("401") });
    const f = feedsOf({ days: { "2026-11-15": [espnEvent("401", KICK, { ...FINAL, home: 24, away: 21 })] } });
    f.badDays.add("2026-11-02");
    const got = await footballScores([NFL_LEAGUE], oncePerRun(f))([a, b], Date.parse("2026-11-16T03:00:00Z"));
    expect(got instanceof Map).toBe(false);
    const r = got as { scores: Map<string, unknown>; errors: string[] };
    expect(r.scores.has(b.id)).toBe(true);
    expect(r.scores.has(a.id)).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]).toContain("espn scoreboard 503");
  });

  it("picks from another league or with no schedule reference are not looked up", async () => {
    const f = feedsOf();
    const got = (await footballScores([NFL_LEAGUE], f)([pickOf({ gradeRef: { source: "espn", league: "cfb", id: "9" } }), pickOf({ eventId: "e2", gradeRef: null })], start + 4 * 3600_000)) as Map<string, unknown>;
    expect(got.size).toBe(0);
    expect(f.espnCalls).toEqual([]);
  });
});

describe("the whole path: price, record, grade, with the real adapter and score reader", () => {
  function world() {
    const f = feedsOf({ odds: [oddsEvent("oe1", KICK, ARB)], days: { "2026-11-15": [espnEvent("401", KICK)] } });
    const kv = memoryKv(f.clock);
    let n = 0;
    const alerts: RunResult[] = [];
    const deps: RunDeps = { kv, adapters: [footballAdapter(NFL_LEAGUE, f)], scores: footballScores([NFL_LEAGUE], f), clock: f.clock, newRunId: () => `run${++n}`, alert: async (r) => void alerts.push(r) };
    return { f, kv, deps, alerts };
  }

  it("records each pick at DraftKings or FanDuel with the other book's price, then grades it from the final", async () => {
    const { f, kv, deps } = world();
    const r1 = await runPicks(deps, { trigger: "manual-ui" });
    expect(r1).toMatchObject({ status: "ok", errors: [] });
    expect(r1.picks.map((p) => [p.selection, p.book, p.price, p.otherBook, p.otherPrice]).sort()).toEqual([
      ["Cardinals ML", "draftkings", 120, "fanduel", -140],
      ["Seahawks ML", "fanduel", 120, "draftkings", -140],
    ]);
    /* asked again at once: nothing new */
    expect((await runPicks(deps, { trigger: "manual-api" })).picks).toEqual([]);

    f.clock.set(Date.parse(KICK) + 4 * 3600_000);
    f.oddsEvents = [];
    f.days["2026-11-15"] = [espnEvent("401", KICK, { ...FINAL, home: 24, away: 21 })];
    const r3 = await runPicks(deps, { trigger: "cron" });
    expect(r3.graded.map((g) => g.result).sort()).toEqual(["lost", "won"]);
    const rows = await readLedger(kv);
    expect(rows.map((x) => [x.pick.selection, x.grade?.result, x.grade?.detail]).sort()).toEqual([
      ["Cardinals ML", "won", "21-24 (away-home)"],
      ["Seahawks ML", "lost", "21-24 (away-home)"],
    ]);
    /* +1.2 units on the winner, -1 on the loser */
    expect(r3.bank.flat).toBeCloseTo(0.2, 9);
  });

  it("an ordinary vigged market at both books records nothing", async () => {
    const { f, deps } = world();
    f.oddsEvents = [oddsEvent("oe1", KICK, FLAT)];
    const r = await runPicks(deps, { trigger: "manual-ui" });
    expect(r).toMatchObject({ status: "ok", candidates: 2 });
    expect(r.picks).toEqual([]);
  });

  it("an unreadable score day makes the run partial and raises the alert, without blocking the pricing", async () => {
    const { f, deps, alerts } = world();
    await runPicks(deps, { trigger: "manual-ui" });
    f.clock.set(Date.parse(KICK) + 4 * 3600_000);
    f.oddsEvents = [];
    f.badDays.add("2026-11-15");
    const r = await runPicks(deps, { trigger: "cron" });
    expect(r.status).toBe("partial");
    expect(r.graded).toEqual([]);
    expect(r.errors[0]).toMatch(/^grade: scores: nfl 2026-11-1\d: espn scoreboard 503/);
    expect(alerts).toHaveLength(1);
  });

  it("a dead odds feed fails the run loudly and records no pick", async () => {
    const { f, kv, deps, alerts } = world();
    f.oddsError = new Error("Odds API 401 for nfl");
    const r = await runPicks(deps, { trigger: "cron" });
    expect(r).toMatchObject({ status: "failed", picks: [], errors: ["nfl: Odds API 401 for nfl"] });
    expect(await readLedger(kv)).toEqual([]);
    expect(alerts).toHaveLength(1);
  });
});

describe("the run's Odds API tally and its failure alert", () => {
  it("the meter gives the run its own tally and budget and reads it back", async () => {
    const m = oddsMeter();
    expect(m.spend()).toBeNull();
    const inside = await m.run("r1", 400, async () => currentOddsRun()?.id);
    expect(inside).toBe("r1");
    expect(m.spend()).toEqual({ calls: 0, cacheHits: 0, credits: 0, unmetered: 0, remaining: null, used: null, budget: 400, refused: 0, errors: 0, regionFallback: false });
    expect(currentOddsRun()).toBeNull();
  });

  it("the alert names the failure and nothing else; a send that throws is swallowed", async () => {
    const r = { status: "failed", trigger: "cron", runId: "r1", errors: ["nfl: Odds API 401 for nfl", "cfb: Odds API 401 for cfb"] } as unknown as RunResult;
    expect(alertPayloadOf(r)).toEqual({ title: "Parlay Lab: pick run FAILED", body: "nfl: Odds API 401 for nfl (+1 more)", url: "/anytime", tag: "anytime-run" });
    expect(alertPayloadOf({ ...r, status: "partial", errors: [] }).title).toBe("Parlay Lab: pick run had errors");
    const sent: unknown[] = [];
    await runAlert(async (p) => void sent.push(p))(r);
    expect(sent).toHaveLength(1);
    await expect(runAlert(async () => Promise.reject(new Error("push down")))(r)).resolves.toBeUndefined();
  });
});
