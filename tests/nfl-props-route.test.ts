import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { stripComments } from "./helpers/source";
import { buildCfbBoard } from "@/lib/cfb/model";
import { finalsOf } from "@/lib/cfb/slate-server";
import { parseEventProps, selectPropEvents } from "@/lib/cfb/props";
import { affordableEvents, assembleStoredBoard, propsBoardKey, propsSpendKey, storedChunkKeys } from "@/lib/cfb/props-store";
import { CFB_PROPS_ODDS_MARKETS, CFB_PROP_MARKETS, type CfbPropRow, type CfbPropsBoard } from "@/lib/cfb/props-types";
import { CFB_PROPS } from "@/lib/cfb/rules";
import { NFL_BANK_BASE, NFL_LEAGUE, NFL_PROPS, NFL_PROPS_REDIS, NFL_RULES } from "@/lib/nfl/rules";
import type { CfbGame, CfbSlate } from "@/lib/cfb/types";

/**
 * THE NFL PROPS ROUTE (2026-09-08, the NFL build) — the core cases of tests/cfb-props-route.test.ts
 * run against app/api/nfl/props/route.ts, the thin shell over src/lib/server/football-props.ts on
 * NFL_LEAGUE, with the NFL fixtures:
 *
 *   slate     — the REAL 2026-09-13 ESPN scoreboard (week 1, 13 games) + the SYNTHESIZED odds
 *               fixture (NFL team names, four books incl. Caesars) through the pure model
 *   props     — the SYNTHESIZED per-event payload for 401872925 (TB @ CIN): six markets, four books
 *   url       — `/v4/sports/americanfootball_nfl/events/<id>/odds?apiKey=…&regions=us&markets=<six>&oddsFormat=american`
 *   redis     — boards under pl:nfl:props:v1:<date>, spend under pl:nfl:props:spend:v1:<ptDate>
 *   caps      — maxEvents 16: a 17-game pre-kick slate prices 16 and says `capped: true`
 *   budget    — dailyBudget 1000 at 31 credits/event → at most 32 events affordable; past the
 *               budget the route refuses the pull and says `budgeted: true`
 *   money     — every Kelly stake on the parsed rows is ≤ NFL_RULES.maxStake ($50)
 *
 * fetch is a vi.fn: no network, and api.the-odds-api.com is never called.
 */

vi.mock("@/lib/server/store", () => ({
  redis: vi.fn(),
  storeEnv: vi.fn(),
}));
vi.mock("@/lib/cfb/slate-server", async (orig) => {
  const real = await orig<typeof import("@/lib/cfb/slate-server")>();
  return { ...real, espnEventsOf: vi.fn(), slateFromEspnOf: vi.fn() };
});
vi.mock("@/lib/cfb/props-context", async (orig) => {
  const real = await orig<typeof import("@/lib/cfb/props-context")>();
  return { ...real, loadPropsContext: vi.fn(async () => null) };
});

import { redis, storeEnv } from "@/lib/server/store";
import { espnEventsOf, slateFromEspnOf } from "@/lib/cfb/slate-server";
import { loadPropsContext } from "@/lib/cfb/props-context";
import { GET } from "../app/api/nfl/props/route";

const root = path.join(__dirname, "..");
const readSrc = (p: string) => stripComments(fs.readFileSync(path.join(root, p), "utf8"));
const FIX = path.join(root, "tests", "fixtures", "nfl");
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8"));
const ESPN = readJson("espn-scoreboard-2026-09-13.json") as { events: unknown[] };
const ODDS = readJson("odds-2026-09-13.json") as unknown[];
const FPI = readJson("espn-fpi.json") as unknown;
const EVENT = readJson("odds-event-props-401872925.json") as Record<string, unknown>;
const NOW = Date.parse("2026-09-13T12:00:00Z"); // 05:00 PT — every week-1 Sunday kickoff is still ahead
const DATE = "2026-09-13";
const CIN = "401872925";
const PER = NFL_PROPS.measuredCreditsPerEvent;
const KEYS = NFL_PROPS_REDIS;

function slate(oddsMissing = false): CfbSlate {
  const board = buildCfbBoard({ date: DATE, espnEvents: ESPN.events, oddsEvents: ODDS, fpi: FPI, now: NOW, bankroll: NFL_BANK_BASE, league: NFL_LEAGUE });
  return { ...board, finals: finalsOf(board.games), quota: { remaining: 9000, used: 1000 }, oddsMissing };
}
/** the 13-game slate plus `extra` cloned pre-kick games (new ids, new odds ids) — the 09-13 fixture has 13, the cap is 16 */
function widened(extra: number): CfbSlate {
  const s = slate();
  const clones: CfbGame[] = s.games.slice(0, extra).map((g, i) => ({ ...g, id: `${g.id}-x${i}`, oddsEventId: `${g.oddsEventId}-x${i}` }));
  const games = [...s.games, ...clones];
  return { ...s, games, finals: finalsOf(games) };
}

function eventResponse(used: number | null): Response {
  const headers = new Headers({ "content-type": "application/json" });
  if (used != null) {
    headers.set("x-requests-used", String(used));
    headers.set("x-requests-remaining", String(20000 - used));
  }
  return new Response(JSON.stringify(EVENT), { status: 200, headers });
}

function fakeRedis(seed: Record<string, string> = {}) {
  const kv = new Map(Object.entries(seed));
  const ttl = new Map<string, number>();
  const calls: unknown[][] = [];
  vi.mocked(redis).mockImplementation(async (cmd: unknown[]) => {
    calls.push(cmd);
    const [op, key, ...rest] = cmd as [string, string, ...unknown[]];
    switch (op) {
      case "GET":
        return kv.get(key) ?? null;
      case "MGET":
        return [key, ...rest].map((k) => kv.get(String(k)) ?? null);
      case "SET": {
        kv.set(key, String(rest[0]));
        const ex = rest.indexOf("EX");
        if (ex >= 0) ttl.set(key, Number(rest[ex + 1]));
        return "OK";
      }
      case "INCRBY": {
        const n = Number(kv.get(key) ?? 0) + Number(rest[0]);
        kv.set(key, String(n));
        return n;
      }
      case "EXPIRE":
        ttl.set(key, Number(rest[0]));
        return 1;
      default:
        throw new Error(`fake redis: ${op}`);
    }
  });
  const boardSets = () => calls.filter((c) => c[0] === "SET" && c[1] === propsBoardKey(DATE, KEYS));
  const board = (): CfbPropsBoard | null => {
    const raw = kv.get(propsBoardKey(DATE, KEYS)) ?? null;
    return assembleStoredBoard(raw, storedChunkKeys(raw).map((k) => kv.get(k) ?? null));
  };
  return { kv, ttl, calls, ops: (op: string) => calls.filter((c) => c[0] === op), boardSets, board };
}

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
const call = async (date = DATE): Promise<{ status: number; body: CfbPropsBoard; res: Response }> => {
  const res = await GET(new NextRequest(`http://localhost/api/nfl/props?date=${date}`));
  return { status: res.status, body: (await res.json()) as CfbPropsBoard, res };
};
const urlsFetched = () => fetchMock.mock.calls.map(([u]) => String(u));

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.mocked(redis).mockReset();
  vi.mocked(storeEnv).mockReset();
  vi.mocked(loadPropsContext).mockClear();
  vi.mocked(espnEventsOf).mockReset().mockResolvedValue(ESPN.events);
  vi.mocked(slateFromEspnOf).mockReset().mockResolvedValue(slate());
  vi.stubEnv("ODDS_API_KEY", "test-key-never-logged");
  vi.mocked(storeEnv).mockReturnValue({ url: "https://store.test", token: "t" });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the NFL props rules", () => {
  it("16 / 16 events, the CFB windows, a 1000-credit budget at the (unmeasured on the NFL) 31-credit rate, its own keys", () => {
    expect(NFL_PROPS.maxEvents).toBe(16);
    expect(NFL_PROPS.liveMaxEvents).toBe(16);
    expect(NFL_PROPS.revalidateSec).toBe(7200);
    expect(NFL_PROPS.liveRevalidateSec).toBe(600);
    expect(NFL_PROPS.dailyBudget).toBe(1000);
    expect(NFL_PROPS.measuredCreditsPerEvent).toBe(31);
    expect(NFL_PROPS.regions).toBe("us");
    expect(NFL_PROPS.settleBook).toBe("williamhill_us");
    expect(NFL_LEAGUE.props).toBe(NFL_PROPS);
    expect(KEYS).toEqual({ board: "pl:nfl:props:v1:", spend: "pl:nfl:props:spend:v1:" });
    expect(NFL_LEAGUE.redis.propsBoard).toBe(KEYS.board);
    expect(NFL_LEAGUE.redis.propsSpend).toBe(KEYS.spend);
    // a full 16-event pre-kick pull is 496 credits: two of them fit in a day, a third does not
    expect(16 * PER).toBe(496);
    expect(2 * 496).toBeLessThanOrEqual(NFL_PROPS.dailyBudget);
    expect(3 * 496).toBeGreaterThan(NFL_PROPS.dailyBudget);
  });
  it("the store's retention and Caesars-missing windows are the CFB constants — both leagues carry the same figures (props-store.ts reads CFB_PROPS for them)", () => {
    expect(NFL_PROPS.boardRetainSec).toBe(CFB_PROPS.boardRetainSec);
    expect(NFL_PROPS.czMissingRevalidateSec).toBe(CFB_PROPS.czMissingRevalidateSec);
    expect(NFL_PROPS.czMissingWindowSec).toBe(CFB_PROPS.czMissingWindowSec);
    expect(NFL_PROPS.revalidateSec).toBe(CFB_PROPS.revalidateSec);
  });
  it("the six NFL prop markets are the six CFB market keys, in the same order", () => {
    expect(NFL_LEAGUE.feeds.oddsPropMarkets).toBe(CFB_PROPS_ODDS_MARKETS);
    expect(NFL_LEAGUE.feeds.oddsPropMarkets.split(",")).toEqual(CFB_PROP_MARKETS.map((m) => m.odds));
    expect(NFL_LEAGUE.feeds.oddsEventBase).toBe("https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events");
  });
  it("affordableEvents on the NFL budget: 1000 / 31 buys at most 32 events", () => {
    expect(affordableEvents(40, 0, NFL_PROPS.dailyBudget, PER)).toBe(32);
    expect(affordableEvents(16, 0, NFL_PROPS.dailyBudget, PER)).toBe(16);
    expect(affordableEvents(16, NFL_PROPS.dailyBudget - 16 * PER, NFL_PROPS.dailyBudget, PER)).toBe(16);
    expect(affordableEvents(16, NFL_PROPS.dailyBudget - 16 * PER + 1, NFL_PROPS.dailyBudget, PER)).toBe(15);
    expect(affordableEvents(16, NFL_PROPS.dailyBudget, NFL_PROPS.dailyBudget, PER)).toBe(0);
  });
  it("keys: the NFL prefixes, date-suffixed", () => {
    expect(propsBoardKey(DATE, KEYS)).toBe(`pl:nfl:props:v1:${DATE}`);
    expect(propsSpendKey(DATE, KEYS)).toBe(`pl:nfl:props:spend:v1:${DATE}`);
    // and the default is still the CFB prefix — the two never share a key
    expect(propsBoardKey(DATE)).not.toBe(propsBoardKey(DATE, KEYS));
  });
});

describe("the week-1 slate through the pure model", () => {
  it("all 13 games match an odds event with a Caesars side price, so every one is a props candidate", () => {
    const s = slate();
    expect(s.games).toHaveLength(13);
    expect(s.unmatched).toBe(0);
    const { events, capped } = selectPropEvents(s, NOW, NFL_PROPS.maxEvents, NFL_PROPS.liveMaxEvents);
    expect(events).toHaveLength(13);
    expect(capped).toBe(false);
    expect(events.map((g) => g.id)).toContain(CIN);
  });
  it("the props payload for 401872925 parses the six markets with every Kelly stake ≤ $50 (NFL_RULES.maxStake)", () => {
    const game = slate().games.find((g) => g.id === CIN) as CfbGame;
    expect(game.home.name).toBe("Cincinnati Bengals");
    const rows = parseEventProps(EVENT, game, { now: NOW, bankroll: NFL_BANK_BASE, props: NFL_PROPS, rules: NFL_RULES });
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.market))).toEqual(new Set(CFB_PROP_MARKETS.map((m) => m.id)));
    expect(rows.every((r) => r.gameId === CIN && r.oddsEventId === EVENT.id)).toBe(true);
    // Caesars is on the payload, so rows are playable pre-kick and sized at ¼-Kelly of the bankroll, capped at 2 % = $50
    const playable = rows.filter((r) => r.playable);
    expect(playable.length).toBeGreaterThan(0);
    for (const r of rows) {
      if (r.kelly == null) continue;
      expect(r.kelly).toBeGreaterThanOrEqual(0);
      expect(r.kelly).toBeLessThanOrEqual(NFL_RULES.maxStake);
      expect(r.kelly).toBeLessThanOrEqual(NFL_RULES.kellyCap * NFL_BANK_BASE);
    }
    expect(NFL_RULES.kellyCap * NFL_BANK_BASE).toBe(50);
    // the team join: every row resolves to one side of THIS game
    expect(rows.every((r) => r.team === "Cincinnati Bengals" || r.team === "Tampa Bay Buccaneers" || r.team === null)).toBe(true);
  });
});

describe("GET /api/nfl/props — a fresh pull", () => {
  it("asks the NFL event base for each selected event with the six markets, keys the board and spend under pl:nfl:props:*", async () => {
    const r = fakeRedis();
    let used = 1000;
    fetchMock.mockImplementation(async () => eventResponse((used += PER)));
    const { status, body, res } = await call();
    expect(status).toBe(200);
    expect(body.source).toBe("fetch");
    expect(body.budgeted).toBe(false);
    expect(body.capped).toBe(false);
    expect(body.events).toBe(13);
    expect(body.fetched).toBe(13);
    expect(body.rows.length).toBeGreaterThan(0);
    expect(body.rows.every((r: CfbPropRow) => r.kelly == null || r.kelly <= NFL_RULES.maxStake)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(13);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(String(url)).toMatch(
        /^https:\/\/api\.the-odds-api\.com\/v4\/sports\/americanfootball_nfl\/events\/[^/]+\/odds\?apiKey=test-key-never-logged&regions=us&markets=player_anytime_td,player_pass_tds,player_pass_yds,player_receptions,player_rush_yds,player_reception_yds&oddsFormat=american$/,
      );
      expect(String(url)).not.toContain("ncaaf");
      expect(init).toEqual({ next: { revalidate: NFL_PROPS.revalidateSec } });
    }
    const cinOdds = slate().games.find((g) => g.id === CIN)?.oddsEventId as string;
    expect(urlsFetched()).toContain(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${cinOdds}/odds?apiKey=test-key-never-logged&regions=us&markets=${CFB_PROPS_ODDS_MARKETS}&oddsFormat=american`);
    // the helpers were asked for the NFL league; the season context too
    expect(vi.mocked(espnEventsOf)).toHaveBeenCalledWith(NFL_LEAGUE, DATE);
    expect(vi.mocked(slateFromEspnOf).mock.calls[0][0]).toBe(NFL_LEAGUE);
    expect(vi.mocked(loadPropsContext)).toHaveBeenCalledWith(NFL_LEAGUE);
    // redis: read before fetch, the NFL keys only
    const gets = r.ops("GET").map((c) => c[1]);
    expect(gets).toContain(`pl:nfl:props:v1:${DATE}`);
    expect(gets).toContain(`pl:nfl:props:spend:v1:${DATE}`);
    expect(r.calls.some((c) => String(c[1]).includes("pl:cfb"))).toBe(false);
    const set = r.boardSets();
    expect(set).toHaveLength(1);
    expect(set[0].slice(0, 2)).toEqual(["SET", `pl:nfl:props:v1:${DATE}`]);
    expect(set[0].slice(3)).toEqual(["EX", NFL_PROPS.boardRetainSec]);
    for (const c of r.ops("SET")) expect(String(c[1]).startsWith("pl:nfl:props:v1:")).toBe(true);
    const stored = r.board()!;
    expect(stored).not.toBeNull();
    expect(stored.rows).toHaveLength(body.rows.length);
    expect(stored.ttlSec).toBe(NFL_PROPS.revalidateSec);
    const inc = r.ops("INCRBY");
    expect(inc).toHaveLength(1);
    expect(inc[0].slice(0, 2)).toEqual(["INCRBY", `pl:nfl:props:spend:v1:${DATE}`]);
    expect(inc[0][2]).toBe(13 * PER);
    expect(body.spentToday).toBe(13 * PER);
    expect(body.ttlSec).toBe(NFL_PROPS.revalidateSec);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-requests-used")).toBe(String(used));
  });

  it("the store GET happens before the first event fetch", async () => {
    const order: string[] = [];
    vi.mocked(redis).mockImplementation(async (cmd: unknown[]) => {
      order.push(`redis:${String(cmd[0])}`);
      return cmd[0] === "INCRBY" ? 0 : null;
    });
    fetchMock.mockImplementation(async () => {
      order.push("fetch");
      return eventResponse(null);
    });
    await call();
    expect(order.indexOf("redis:GET")).toBeLessThan(order.indexOf("fetch"));
  });

  it("maxEvents 16: a 17-game pre-kick slate prices 16 and says capped", async () => {
    const wide = widened(4);
    expect(wide.games).toHaveLength(17);
    expect(wide.games.every((g) => g.status === "upcoming")).toBe(true);
    vi.mocked(slateFromEspnOf).mockResolvedValue(wide);
    fakeRedis();
    fetchMock.mockImplementation(async () => eventResponse(null));
    const { body } = await call();
    expect(body.events).toBe(16);
    expect(body.capped).toBe(true);
    expect(body.fetched).toBe(16);
    expect(fetchMock).toHaveBeenCalledTimes(16);
    // and a 16-game slate is not capped
    vi.mocked(slateFromEspnOf).mockResolvedValue(widened(3));
    fetchMock.mockClear();
    fakeRedis();
    const full = await call();
    expect(full.body.events).toBe(16);
    expect(full.body.capped).toBe(false);
  });
});

describe("GET /api/nfl/props — the rails", () => {
  it("a fresh stored board answers from redis under the NFL key, no fetch", async () => {
    const cached: CfbPropsBoard = {
      date: DATE,
      events: 3,
      fetched: 3,
      capped: false,
      rows: [],
      quota: { remaining: 8000, used: 2000 },
      oddsMissing: false,
      generatedAt: new Date(NOW - 60_000).toISOString(),
    };
    const r = fakeRedis({ [`pl:nfl:props:v1:${DATE}`]: JSON.stringify(cached), [`pl:nfl:props:spend:v1:${DATE}`]: "372" });
    const { body } = await call();
    expect(body.source).toBe("redis");
    expect(body.spentToday).toBe(372);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.boardSets()).toHaveLength(0);
  });

  it("the daily budget (1000) binds: with 1000 spent nothing is fetched, `budgeted: true`, the note names the NFL figure", async () => {
    const r = fakeRedis({ [`pl:nfl:props:spend:v1:${DATE}`]: String(NFL_PROPS.dailyBudget) });
    const { body } = await call();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.budgeted).toBe(true);
    expect(body.fetched).toBe(0);
    expect(body.note).toMatch(/1000 credits/);
    expect(body.note).not.toMatch(/2500/);
    expect(r.boardSets()).toHaveLength(0);
  });

  it("a partly spent budget buys only what is left: 1000 − 10 × 31 → 10 of 13 games", async () => {
    fakeRedis({ [`pl:nfl:props:spend:v1:${DATE}`]: String(NFL_PROPS.dailyBudget - 10 * PER) });
    fetchMock.mockImplementation(async () => eventResponse(null));
    const { body } = await call();
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(body.budgeted).toBe(true);
    expect(body.fetched).toBe(10);
    expect(body.note).toMatch(/covers 10 of 13 games/);
  });

  it("missing ODDS_API_KEY → oddsMissing, no fetch, nothing written", async () => {
    vi.stubEnv("ODDS_API_KEY", "");
    const r = fakeRedis();
    const { body } = await call();
    expect(body.oddsMissing).toBe(true);
    expect(body.rows).toEqual([]);
    expect(body.source).toBe("none");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.boardSets()).toHaveLength(0);
    expect(r.ops("INCRBY")).toHaveLength(0);
  });

  it("slate oddsMissing → the same empty answer", async () => {
    vi.mocked(slateFromEspnOf).mockResolvedValue(slate(true));
    const r = fakeRedis();
    const { body } = await call();
    expect(body.oddsMissing).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.boardSets()).toHaveLength(0);
  });

  it("no store env → data-cache only: fetches, no redis call", async () => {
    vi.mocked(storeEnv).mockReturnValue(null);
    fetchMock.mockImplementation(async () => eventResponse(null));
    const { body } = await call();
    expect(body.source).toBe("fetch");
    expect(body.fetched).toBe(13);
    expect(body.spentToday).toBeNull();
    expect(vi.mocked(redis)).not.toHaveBeenCalled();
  });

  it("a bad date is 400; an ESPN outage is 502", async () => {
    expect((await call("13-09-2026")).status).toBe(400);
    vi.mocked(espnEventsOf).mockRejectedValue(new Error("espn scoreboard 503"));
    expect((await call()).status).toBe(502);
  });
});

describe("source pins", () => {
  const shell = readSrc("app/api/nfl/props/route.ts");
  const body = readSrc("src/lib/server/football-props.ts");
  it("the NFL shell: force-dynamic, its own literal keys, the shared body on NFL_LEAGUE, nothing else exported", () => {
    expect(shell).toMatch(/export const dynamic = "force-dynamic"/);
    expect(shell.match(/^export const /gm)).toEqual(["export const "]);
    expect(shell).toMatch(/"pl:nfl:props:v1:"/);
    expect(shell).toMatch(/"pl:nfl:props:spend:v1:"/);
    expect(shell).toMatch(/footballPropsGet\(NFL_LEAGUE, req, /);
    expect(shell).not.toMatch(/\bfetch\(/);
    expect(shell).not.toMatch(/ODDS_API_KEY/);
    expect(shell).not.toMatch(/pl:cfb|pl_cfb|americanfootball_ncaaf|college-football|"\/api\/cfb/);
    expect(shell).not.toMatch(/CFB_/);
  });
  it("the shared body takes cfg as a REQUIRED first arg and reads every knob off it", () => {
    expect(body).toMatch(/export async function footballPropsGet\(cfg: LeagueConfig, req: NextRequest, deps: PropsRouteDeps\)/);
    expect(body).not.toMatch(/cfg: LeagueConfig = /);
    expect(body).toMatch(/cfg\.feeds\.oddsEventBase/);
    expect(body).toMatch(/cfg\.feeds\.oddsPropMarkets/);
    expect(body).toMatch(/cfg\.props\.regions/);
    expect(body).toMatch(/cfg\.props\.maxEvents, cfg\.props\.liveMaxEvents/);
    expect(body).toMatch(/propsStore\(deps\.storeKeys\)/);
    expect(body).toMatch(/loadPropsContext\(cfg\)/);
    expect(body).toMatch(/props: cfg\.props, rules: cfg\.rules/);
    expect(body).toMatch(/bankRaw > 0 \? bankRaw : cfg\.bankBase/);
    expect(body).toMatch(/process\.env\.ODDS_API_KEY/);
    expect(body).not.toMatch(/CFB_PROPS|CFB_BANK_BASE|CFB_LEAGUE|NFL_/);
    expect(body).not.toMatch(/americanfootball_(ncaaf|nfl)/);
    expect(body).not.toMatch(/console\.(log|info|warn|error)/);
    expect(body).not.toMatch(/status: 500/);
    expect(body.match(/^export const /gm)).toBeNull();
  });
});
