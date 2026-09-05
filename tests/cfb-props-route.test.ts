import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { stripComments } from "./helpers/source";
import { buildCfbBoard } from "@/lib/cfb/model";
import { CFB_PROPS } from "@/lib/cfb/rules";
import { finalsOf } from "@/lib/cfb/slate-server";
import { czMissingGameIds, propsCoverage } from "@/lib/cfb/props";
import { affordableEvents, assembleStoredBoard, boardFresh, boardWindowSec, czMissingDue, encodeBoard, propsBoardKey, propsSpendKey, pullCredits, storedChunkKeys, CFB_PROPS_CHUNK_ROWS, CFB_PROPS_SPEND_TTL_SEC, UPSTASH_MAX_REQUEST_BYTES } from "@/lib/cfb/props-store";
import type { CfbPropRow, CfbPropsBoard } from "@/lib/cfb/props-types";
import type { CfbSlate } from "@/lib/cfb/types";

/**
 * THE CFB PROPS ROUTE'S QUOTA RAILS (2026-09-05). MEASURED on prod today: one fresh 24-event
 * pull cost ~753 credits — about 31 credits per event (x-requests-used 2428 → 3187 across the
 * pull plus one 6-credit slate call), not the 6 the header comment assumed. The Next data cache
 * is per deployment, so every deploy re-spent it. The rails pinned here:
 *
 *   rules     — maxEvents 60, revalidateSec 7200, liveRevalidateSec 600, liveMaxEvents 24,
 *               dailyBudget 2500, measuredCreditsPerEvent 31, boardRetainSec 36 h
 *               (INSTRUCTION 42, 2026-09-05: was 12 / 6 / 1200 — every eligible game priced)
 *   per-game  — the stored board carries pricedAt[gameId]; an upcoming game is carried inside ITS
 *               OWN 2 h window, and a game whose last pull returned zero rows is not re-asked until
 *               that window passes, even live (the EMPTY-EVENT RULE) — INSTRUCTION 42
 *   redis     — pl:cfb:props:v1:<date> (EX boardRetainSec — retained past its window) is read
 *               BEFORE any event fetch and written after a fetch; pl:cfb:props:spend:v1:<ptDate>
 *               (EX 36 h) is INCRBY'd by the credits the pull cost
 *   budget    — spent + eventsToFetch × 31 > 1200 → fetch only what the budget still buys
 *               (possibly none), `budgeted: true`; the refused games keep their last priced
 *               rows off the stored board, `stale: true` (2026-09-05 review fix — the board
 *               used to collapse to rows: [] for the rest of the day)
 *   live      — a stored pre-kick board is fresh only inside the CURRENT window once a game in
 *               it kicks off; a live pull re-prices only the in-play events (≤ liveMaxEvents)
 *               and carries the upcoming games' rows over
 *   cz rule   — a game with rows and a market with no Caesars quote re-checks every 30 min inside
 *               4 h of kickoff (zero-row games never — the empty hold stands); re-pulls bypass the
 *               data cache; a failed re-pull keeps the stored rows; czMissing > 0 shortens ttlSec
 *   no redis  — missing store env → the data-cache-only behaviour of before, no store calls
 *   no key    — the unchanged oddsMissing answer, and NOTHING is written
 *
 * The slate is the real 2026-09-05 fixtures through the pure model; the per-event payload is the
 * SYNTHETIC props fixture (invented shapes, never captured quotes). fetch is a vi.fn: no network.
 */

vi.mock("@/lib/server/store", () => ({
  redis: vi.fn(),
  storeEnv: vi.fn(),
}));
vi.mock("@/lib/cfb/slate-server", async (orig) => {
  const real = await orig<typeof import("@/lib/cfb/slate-server")>();
  return { ...real, espnEvents: vi.fn(), slateFromEspn: vi.fn() };
});
vi.mock("@/lib/cfb/props-context", async (orig) => {
  const real = await orig<typeof import("@/lib/cfb/props-context")>();
  return { ...real, loadCfbPropsContext: vi.fn(async () => null) };
});

import { redis, storeEnv } from "@/lib/server/store";
import { espnEvents, slateFromEspn } from "@/lib/cfb/slate-server";
import { GET } from "../app/api/cfb/props/route";

const FIX = path.join(process.cwd(), "tests", "fixtures", "cfb");
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8"));
const ESPN = readJson("espn-scoreboard-2026-09-05.json") as { events: unknown[] };
const ODDS = readJson("odds-ncaaf-2026-09-05.json") as unknown[];
const FPI = readJson("espn-fpi.json") as unknown;
const EVENT = readJson("odds-ncaaf-event-props.synthetic.json") as Record<string, unknown>;
const NOW = Date.parse("2026-09-05T12:00:00Z"); // 05:00 PT — every fixture kickoff is still ahead
const DATE = "2026-09-05";
const PER = CFB_PROPS.measuredCreditsPerEvent;

const root = path.join(__dirname, "..");
const readSrc = (p: string) => stripComments(fs.readFileSync(path.join(root, p), "utf8"));

function slate(oddsMissing = false): CfbSlate {
  const board = buildCfbBoard({ date: DATE, espnEvents: ESPN.events, oddsEvents: ODDS, fpi: FPI, now: NOW, bankroll: 2500 });
  return { ...board, finals: finalsOf(board.games), quota: { remaining: 9000, used: 1000 }, oddsMissing };
}

/** the same slate with one game flipped to LIVE (INSTRUCTION 40) — every fixture game is STATUS_SCHEDULED */
const LIVE_ABBR = "OSU"; // kicks at 16:30Z, after every 16:00Z game — live it must still come FIRST
function liveSlate(): CfbSlate {
  const s = slate();
  const games = s.games.map((g) => (g.home.abbr === LIVE_ABBR ? { ...g, status: "live" as const, detail: "2nd 8:12", homeScore: 14, awayScore: 3 } : g));
  return { ...s, games, finals: finalsOf(games) };
}
const liveOddsEventId = (): string => liveSlate().games.find((g) => g.home.abbr === LIVE_ABBR)?.oddsEventId as string;

/** a per-event odds answer; `used` feeds the x-requests-used header (null → no header) */
function eventResponse(used: number | null): Response {
  const headers = new Headers({ "content-type": "application/json" });
  if (used != null) {
    headers.set("x-requests-used", String(used));
    headers.set("x-requests-remaining", String(20000 - used));
  }
  return new Response(JSON.stringify(EVENT), { status: 200, headers });
}

/** an in-memory Redis behind the mocked `redis(cmd)` — records every command it was sent */
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
  /** INSTRUCTION 42 (2026-09-05, review fix): the board is stored chunked — the INDEX write under the board key is "the board SET" */
  const boardSets = () => calls.filter((c) => c[0] === "SET" && c[1] === propsBoardKey(DATE));
  /** the stored board reassembled the way readBoard does (index + MGET of its chunks) */
  const board = (): CfbPropsBoard | null => {
    const raw = kv.get(propsBoardKey(DATE)) ?? null;
    return assembleStoredBoard(raw, storedChunkKeys(raw).map((k) => kv.get(k) ?? null));
  };
  return { kv, ttl, calls, ops: (op: string) => calls.filter((c) => c[0] === op), boardSets, board };
}

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
const req = (date = DATE) => new NextRequest(`http://localhost/api/cfb/props?date=${date}`);
const call = async (): Promise<{ status: number; body: CfbPropsBoard; res: Response }> => {
  const res = await GET(req());
  return { status: res.status, body: (await res.json()) as CfbPropsBoard, res };
};

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.mocked(redis).mockReset();
  vi.mocked(storeEnv).mockReset();
  vi.mocked(espnEvents).mockReset().mockResolvedValue(ESPN.events);
  vi.mocked(slateFromEspn).mockReset().mockResolvedValue(slate());
  vi.stubEnv("ODDS_API_KEY", "test-key-never-logged");
  vi.mocked(storeEnv).mockReturnValue({ url: "https://store.test", token: "t" });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("rules", () => {
  it("60 pre-kick / 24 live events, a 2 h window (10 min live), a 2500-credit daily budget and the measured per-event cost", () => {
    // INSTRUCTION 42 (2026-09-05): maxEvents 12 → 60, liveMaxEvents 6 → 24, dailyBudget 1200 → 2500
    expect(CFB_PROPS.maxEvents).toBe(60);
    expect(CFB_PROPS.revalidateSec).toBe(7200);
    expect(CFB_PROPS.liveRevalidateSec).toBe(600);
    expect(CFB_PROPS.liveMaxEvents).toBe(24);
    expect(CFB_PROPS.boardRetainSec).toBe(36 * 3600);
    expect(CFB_PROPS.dailyBudget).toBe(2500);
    expect(CFB_PROPS.measuredCreditsPerEvent).toBe(31);
    // THE CAESARS-MISSING RULE (2026-09-05): a 30-min re-check inside 4 h of kickoff — shorter than the 2 h carry, longer than the live window
    expect(CFB_PROPS.czMissingRevalidateSec).toBe(1800);
    expect(CFB_PROPS.czMissingWindowSec).toBe(4 * 3600);
    expect(CFB_PROPS.czMissingRevalidateSec).toBeLessThan(CFB_PROPS.revalidateSec);
    expect(CFB_PROPS.czMissingRevalidateSec).toBeGreaterThan(CFB_PROPS.liveRevalidateSec);
    // worst case PER GAME: at most 8 re-checks in its 4 h window, 248 credits — but in AGGREGATE the 12 such games Josh
    // named on 2026-09-05 would want 2,976, MORE than the daily rail: the rail binds, the copy must not say "within" it
    expect((CFB_PROPS.czMissingWindowSec / CFB_PROPS.czMissingRevalidateSec) * CFB_PROPS.measuredCreditsPerEvent).toBe(248);
    expect(12 * 248).toBe(2976);
    expect(12 * 248).toBeGreaterThan(CFB_PROPS.dailyBudget);
    expect(readSrc("src/lib/cfb/rules.ts")).not.toMatch(/within the daily rail/);
    // the cost math (rules.ts doc): 60 × 31 = 1860 per 2 h pre-kick re-price; 24 × 31 = 744 per 10-min live pull
    expect(CFB_PROPS.maxEvents * CFB_PROPS.measuredCreditsPerEvent).toBe(1860);
    expect(CFB_PROPS.liveMaxEvents * CFB_PROPS.measuredCreditsPerEvent).toBe(744);
    // worst case per day uncapped: 60 × 31 × (24 h / 2 h) = 22320 — the budget is the hard stop, far below it
    expect(60 * 31 * (86400 / CFB_PROPS.revalidateSec)).toBe(22320);
    expect(CFB_PROPS.dailyBudget).toBeLessThan(22320);
    // one full pre-kick pull fits inside the day's budget; a second full one does not
    expect(1860).toBeLessThanOrEqual(CFB_PROPS.dailyBudget);
    expect(2 * 1860).toBeGreaterThan(CFB_PROPS.dailyBudget);
  });
});

describe("the pure helpers", () => {
  it("affordableEvents: all when it fits, the floor of the room otherwise, never negative", () => {
    // INSTRUCTION 42 (2026-09-05): the default budget is CFB_PROPS.dailyBudget (2500, was 1200)
    const B = CFB_PROPS.dailyBudget;
    expect(B).toBe(2500);
    expect(affordableEvents(12, 0)).toBe(12);
    expect(affordableEvents(60, 0)).toBe(60);
    expect(affordableEvents(60, B - 60 * 31)).toBe(60);
    expect(affordableEvents(60, B - 60 * 31 + 1)).toBe(59);
    expect(affordableEvents(12, B - 4 * 31)).toBe(4);
    expect(affordableEvents(12, B)).toBe(0);
    expect(affordableEvents(12, B + 1)).toBe(0);
    expect(affordableEvents(12, 5000)).toBe(0);
    expect(affordableEvents(0, 0)).toBe(0);
    // the old figures, explicitly at the old budget, still hold
    expect(affordableEvents(12, 1200 - 12 * 31 + 1, 1200)).toBe(11);
  });
  it("pullCredits: the used delta plus the first call, zero when the cache answered, the measured rate without headers", () => {
    expect(pullCredits([1031, 1062, 1093], 3)).toBe(93);
    expect(pullCredits([2000, 2000, 2000], 3)).toBe(0);
    expect(pullCredits([2000], 3)).toBe(93);
    expect(pullCredits([], 5)).toBe(155);
    expect(pullCredits([1, 2], 0)).toBe(0);
  });
  it("keys and TTLs", () => {
    expect(propsBoardKey("2026-09-05")).toBe("pl:cfb:props:v1:2026-09-05");
    expect(propsSpendKey("2026-09-05")).toBe("pl:cfb:props:spend:v1:2026-09-05");
    expect(CFB_PROPS_SPEND_TTL_SEC).toBe(129600);
  });
  it("boardWindowSec: the board's own ttlSec, else the 2 h default (a bad ttlSec never shortens or extends it)", () => {
    expect(boardWindowSec({})).toBe(7200);
    expect(boardWindowSec({ ttlSec: undefined })).toBe(7200);
    expect(boardWindowSec({ ttlSec: 600 })).toBe(600);
    expect(boardWindowSec({ ttlSec: 7200 })).toBe(7200);
    expect(boardWindowSec({ ttlSec: 0 })).toBe(7200);
    expect(boardWindowSec({ ttlSec: -5 })).toBe(7200);
    expect(boardWindowSec({ ttlSec: Number.NaN })).toBe(7200);
  });
  it("boardFresh: inside min(own window, current window); a future or unreadable generatedAt is never fresh", () => {
    const at = (ageSec: number) => new Date(NOW - ageSec * 1000).toISOString();
    expect(boardFresh({ generatedAt: at(60), ttlSec: 7200 }, NOW)).toBe(true);
    expect(boardFresh({ generatedAt: at(7201), ttlSec: 7200 }, NOW)).toBe(false);
    // a pre-kick board under a live slate: the current 600 s window caps it
    expect(boardFresh({ generatedAt: at(1200), ttlSec: 7200 }, NOW, 600)).toBe(false);
    expect(boardFresh({ generatedAt: at(300), ttlSec: 7200 }, NOW, 600)).toBe(true);
    // a live board under a pre-kick window keeps its own shorter window
    expect(boardFresh({ generatedAt: at(700), ttlSec: 600 }, NOW, 7200)).toBe(false);
    expect(boardFresh({ generatedAt: at(-5), ttlSec: 7200 }, NOW)).toBe(false);
    expect(boardFresh({ generatedAt: "nope", ttlSec: 7200 }, NOW)).toBe(false);
  });
});

describe("fresh fetch (nothing in redis, budget untouched)", () => {
  it("reads redis before fetching, fetches each selected event once, then writes the board with EX and INCRBYs the spend", async () => {
    const r = fakeRedis();
    let used = 1000;
    fetchMock.mockImplementation(async () => eventResponse((used += PER)));
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.source).toBe("fetch");
    expect(body.budgeted).toBe(false);
    expect(body.events).toBeGreaterThan(0);
    expect(body.events).toBeLessThanOrEqual(CFB_PROPS.maxEvents);
    expect(body.fetched).toBe(body.events);
    expect(body.rows.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(body.events);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(String(url)).toMatch(/\/v4\/sports\/americanfootball_ncaaf\/events\/[^/]+\/odds\?apiKey=test-key-never-logged&regions=us&markets=player_anytime_td/);
      expect(init).toEqual({ next: { revalidate: CFB_PROPS.revalidateSec } });
    }
    // both reads happen (the order pin is its own test below)
    const gets = r.ops("GET").map((c) => c[1]);
    expect(gets).toContain(`pl:cfb:props:v1:${DATE}`);
    expect(gets).toContain(`pl:cfb:props:spend:v1:${DATE}`);
    // the board write: SET key <index> EX boardRetainSec — retained past its window for the stale fallback
    // (INSTRUCTION 42 review fix: rows live in gzip chunks under their own keys, each also EX boardRetainSec)
    const set = r.boardSets();
    expect(set).toHaveLength(1);
    expect(set[0].slice(0, 2)).toEqual(["SET", `pl:cfb:props:v1:${DATE}`]);
    expect(set[0].slice(3)).toEqual(["EX", CFB_PROPS.boardRetainSec]);
    for (const c of r.ops("SET")) expect(c.slice(3)).toEqual(["EX", CFB_PROPS.boardRetainSec]);
    expect(r.ops("SET").length).toBe(1 + storedChunkKeys(String(set[0][2])).length);
    const stored = r.board()!;
    expect(stored).not.toBeNull();
    expect(stored.rows).toHaveLength(body.rows.length);
    expect(stored.fetched).toBe(body.fetched);
    expect(stored.generatedAt).toBe(body.generatedAt);
    expect(r.ttl.get(`pl:cfb:props:v1:${DATE}`)).toBe(CFB_PROPS.boardRetainSec);
    // the games on the board are named, so a later live pull can carry them over
    expect(body.priced).toHaveLength(body.events);
    expect(body.stale).toBe(false);
    // a pre-kick set: the 2 h window, nothing live
    expect(body.ttlSec).toBe(CFB_PROPS.revalidateSec);
    expect(body.live).toBe(0);
    expect(stored.ttlSec).toBe(CFB_PROPS.revalidateSec);
    // the spend: the real delta of x-requests-used across the pull (last − first, plus the first call's own cost)
    const inc = r.ops("INCRBY");
    expect(inc).toHaveLength(1);
    expect(inc[0].slice(0, 2)).toEqual(["INCRBY", `pl:cfb:props:spend:v1:${DATE}`]);
    expect(inc[0][2]).toBe(body.events * PER);
    expect(r.ttl.get(`pl:cfb:props:spend:v1:${DATE}`)).toBe(36 * 3600);
    expect(body.spentToday).toBe(body.events * PER);
  });

  it("falls back to fetched × measuredCreditsPerEvent when the quota headers are missing", async () => {
    const r = fakeRedis();
    fetchMock.mockImplementation(async () => eventResponse(null));
    const { body } = await call();
    expect(body.fetched).toBe(body.events);
    expect(r.ops("INCRBY")[0][2]).toBe(body.fetched * PER);
    expect(body.quota).toEqual({ remaining: 9000, used: 1000 }); // the slate's, untouched
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
});

describe("redis has a fresh board", () => {
  it("answers from redis with source 'redis' and never fetches", async () => {
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
    const r = fakeRedis({ [`pl:cfb:props:v1:${DATE}`]: JSON.stringify(cached), [`pl:cfb:props:spend:v1:${DATE}`]: "372" });
    const { body } = await call();
    expect(body.source).toBe("redis");
    expect(body.fetched).toBe(3);
    expect(body.events).toBe(3);
    expect(body.generatedAt).toBe(cached.generatedAt);
    expect(body.spentToday).toBe(372);
    expect(body.budgeted).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.boardSets()).toHaveLength(0);
    expect(r.ops("INCRBY")).toHaveLength(0);
  });
  it("a stale stored board (older than the window, still retained) is re-priced in full", async () => {
    const stale = { date: DATE, events: 1, fetched: 1, capped: false, rows: [], quota: null, oddsMissing: false, generatedAt: new Date(NOW - (CFB_PROPS.revalidateSec + 5) * 1000).toISOString() };
    fakeRedis({ [`pl:cfb:props:v1:${DATE}`]: JSON.stringify(stale) });
    fetchMock.mockImplementation(async () => eventResponse(null));
    const { body } = await call();
    expect(body.source).toBe("fetch");
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe("a live slate (INSTRUCTION 40, 2026-09-05 — in-game props keep populating)", () => {
  beforeEach(() => {
    vi.mocked(slateFromEspn).mockResolvedValue(liveSlate());
  });

  it("the live game is priced (fetched FIRST), its rows carry status 'live', and the whole board is held for liveRevalidateSec", async () => {
    const r = fakeRedis();
    fetchMock.mockImplementation(async () => eventResponse(null));
    const { body } = await call();
    expect(body.source).toBe("fetch");
    expect(body.live).toBe(1);
    expect(body.ttlSec).toBe(CFB_PROPS.liveRevalidateSec);
    expect(body.ttlSec).toBe(600);
    expect(body.fetched).toBe(body.events);
    // live first: the very first per-event call is the live game's odds event
    expect(String(fetchMock.mock.calls[0][0])).toContain(`/events/${liveOddsEventId()}/odds`);
    // every event call — live or not — sits on the shorter data-cache window for this pull
    for (const [, init] of fetchMock.mock.calls) expect(init).toEqual({ next: { revalidate: CFB_PROPS.liveRevalidateSec } });
    // the Redis write is retained past the window (the stale fallback); the board itself says 600
    const set = r.boardSets();
    expect(set).toHaveLength(1);
    expect(set[0].slice(3)).toEqual(["EX", CFB_PROPS.boardRetainSec]);
    const stored = r.board()!;
    expect(stored.ttlSec).toBe(600);
    expect(stored.live).toBe(1);
    // the live game's rows keep status "live" (the Board's LIVE parlays read it); the rest stay upcoming
    const liveGameId = liveSlate().games.find((g) => g.home.abbr === LIVE_ABBR)?.id as string;
    const liveRows = body.rows.filter((row) => row.gameId === liveGameId);
    expect(liveRows.length).toBeGreaterThan(0);
    expect(liveRows.every((row) => row.status === "live")).toBe(true);
    expect(body.rows.filter((row) => row.gameId !== liveGameId).every((row) => row.status === "upcoming")).toBe(true);
    // the same slate WITHOUT the live game gets the 2 h window — the short TTL is the live set's alone
    vi.mocked(slateFromEspn).mockResolvedValue(slate());
    fakeRedis();
    fetchMock.mockClear();
    const pre = await call();
    expect(pre.body.ttlSec).toBe(CFB_PROPS.revalidateSec);
    expect(pre.body.live).toBe(0);
    for (const [, init] of fetchMock.mock.calls) expect(init).toEqual({ next: { revalidate: CFB_PROPS.revalidateSec } });
  });

  it("a stored LIVE board is served inside its 10-minute window and ignored past it (never held for the 2 h default)", async () => {
    const mk = (ageSec: number): CfbPropsBoard => ({
      date: DATE,
      events: 5,
      fetched: 5,
      capped: false,
      rows: [],
      quota: null,
      oddsMissing: false,
      generatedAt: new Date(NOW - ageSec * 1000).toISOString(),
      live: 1,
      ttlSec: 600,
    });
    fakeRedis({ [`pl:cfb:props:v1:${DATE}`]: JSON.stringify(mk(500)) });
    fetchMock.mockImplementation(async () => eventResponse(null));
    const fresh = await call();
    expect(fresh.body.source).toBe("redis");
    expect(fresh.body.ttlSec).toBe(600);
    expect(fetchMock).not.toHaveBeenCalled();

    fakeRedis({ [`pl:cfb:props:v1:${DATE}`]: JSON.stringify(mk(700)) });
    const stale = await call();
    expect(stale.body.source).toBe("fetch");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("a live slate at the daily cap with NOTHING stored fetches nothing and writes nothing", async () => {
    const r = fakeRedis({ [`pl:cfb:props:spend:v1:${DATE}`]: String(CFB_PROPS.dailyBudget) });
    const { body } = await call();
    expect(body.budgeted).toBe(true);
    expect(body.source).toBe("none");
    expect(body.fetched).toBe(0);
    expect(body.rows).toEqual([]);
    expect(body.stale).toBe(false);
    expect(body.live).toBe(1); // the live game was SELECTED — the budget, not the selection, refused it
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.boardSets()).toHaveLength(0);
    expect(r.ops("INCRBY")).toHaveLength(0);
  });

  /** a real pre-kick pull, re-dated `ageSec` back, as the stored board */
  async function preKickBoard(ageSec: number): Promise<CfbPropsBoard> {
    vi.mocked(slateFromEspn).mockResolvedValue(slate());
    fakeRedis();
    fetchMock.mockImplementation(async () => eventResponse(null));
    const { body } = await call();
    expect(body.source).toBe("fetch");
    expect(body.live).toBe(0);
    vi.mocked(slateFromEspn).mockResolvedValue(liveSlate());
    fetchMock.mockClear();
    // every stamp re-dated together (review fix: a live game re-prices off ITS OWN pricedAt, so a board whose
    // generatedAt alone was aged read as "priced just now" and was carried)
    const at = new Date(NOW - ageSec * 1000).toISOString();
    return { ...body, generatedAt: at, pricedAt: Object.fromEntries(Object.keys(body.pricedAt ?? {}).map((id) => [id, at])) };
  }

  it("a stored PRE-KICK board (ttlSec 7200) is NOT honoured past the live window once a game in it kicks off — the live game is re-priced, the upcoming rows are carried", async () => {
    const stored = await preKickBoard(20 * 60);
    const r = fakeRedis({ [`pl:cfb:props:v1:${DATE}`]: JSON.stringify(stored), [`pl:cfb:props:spend:v1:${DATE}`]: "372" });
    fetchMock.mockImplementation(async () => eventResponse(null));
    const { body } = await call();
    expect(body.source).toBe("fetch");
    expect(body.live).toBe(1);
    expect(body.ttlSec).toBe(CFB_PROPS.liveRevalidateSec);
    expect(body.stale).toBe(false);
    // only the live game was fetched — every upcoming game rode on the stored board
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(`/events/${liveOddsEventId()}/odds`);
    const liveGameId = liveSlate().games.find((g) => g.home.abbr === LIVE_ABBR)?.id as string;
    expect(body.rows.filter((row) => row.gameId === liveGameId).every((row) => row.status === "live")).toBe(true);
    // the carried rows are the stored board's own, minus the live game's pre-kick rows
    const carried = stored.rows.filter((row) => row.gameId !== liveGameId);
    expect(body.rows.filter((row) => row.gameId !== liveGameId)).toEqual(carried);
    expect(body.fetched).toBe(body.events);
    expect(body.priced).toHaveLength(body.events);
    // the merged board is written back and only the live game's credits are spent
    expect(r.boardSets()).toHaveLength(1);
    expect(r.ops("INCRBY")[0][2]).toBe(1 * PER);
    expect(body.spentToday).toBe(372 + PER);
  });

  it("the same stored pre-kick board only 5 min old is still served from redis under a live slate — with the live window as its ttlSec", async () => {
    const stored = await preKickBoard(5 * 60);
    fakeRedis({ [`pl:cfb:props:v1:${DATE}`]: JSON.stringify(stored) });
    const { body } = await call();
    expect(body.source).toBe("redis");
    expect(body.ttlSec).toBe(CFB_PROPS.liveRevalidateSec);
    expect(body.generatedAt).toBe(stored.generatedAt);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("at the daily cap the last stored board is served STALE (never rows: []), nothing fetched or written", async () => {
    const stored = await preKickBoard(20 * 60);
    const r = fakeRedis({ [`pl:cfb:props:v1:${DATE}`]: JSON.stringify(stored), [`pl:cfb:props:spend:v1:${DATE}`]: String(CFB_PROPS.dailyBudget) });
    const { body } = await call();
    expect(body.source).toBe("redis");
    expect(body.budgeted).toBe(true);
    expect(body.stale).toBe(true);
    expect(body.rows.length).toBeGreaterThan(0);
    // 2026-09-05 (same-day follow-up, read on prod): carried rows adopt the CURRENT slate's status —
    // the game that kicked off since pricing is reported live and is no longer playable; the
    // pre-kick games' rows are carried untouched
    const liveGameId = liveSlate().games.find((g) => g.home.abbr === LIVE_ABBR)?.id as string;
    const liveRows = body.rows.filter((row) => row.gameId === liveGameId);
    expect(liveRows.length).toBeGreaterThan(0);
    expect(liveRows.every((row) => row.status === "live" && row.playable === false)).toBe(true);
    expect(stored.rows.filter((row) => row.gameId === liveGameId).every((row) => row.status === "upcoming")).toBe(true);
    expect(body.rows.filter((row) => row.gameId !== liveGameId)).toEqual(stored.rows.filter((row) => row.gameId !== liveGameId));
    expect(body.rows.map((row) => row.key)).toEqual(stored.rows.map((row) => row.key));
    expect(body.generatedAt).toBe(stored.generatedAt); // honestly dated
    expect(body.note).toMatch(/last priced lines/);
    expect(body.live).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.boardSets()).toHaveLength(0);
    expect(r.ops("INCRBY")).toHaveLength(0);
  });

  it("a live re-price fetches at most liveMaxEvents in-play games per pull — and under the 24 cap every fixture game in play is priced", async () => {
    const s = slate();
    const games = s.games.map((g) => ({ ...g, status: "live" as const, detail: "2nd 8:12", homeScore: 14, awayScore: 3 }));
    vi.mocked(slateFromEspn).mockResolvedValue({ ...s, games, finals: finalsOf(games) });
    fakeRedis();
    fetchMock.mockImplementation(async () => eventResponse(null));
    const { body } = await call();
    // INSTRUCTION 42 (2026-09-05): the live pool holds 24 now (was 6, which left half of this 12-game
    // fixture unpriced); every in-play game gets its pull and nothing is capped
    expect(s.games.length).toBeLessThanOrEqual(CFB_PROPS.liveMaxEvents);
    expect(body.events).toBe(s.games.length);
    expect(body.capped).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(s.games.length);
    expect(body.fetched).toBe(s.games.length);
    expect(body.live).toBe(s.games.length);
    expect(body.ttlSec).toBe(CFB_PROPS.liveRevalidateSec);
    // every game on the answer is stamped with this pull's instant
    expect(Object.keys(body.pricedAt ?? {})).toHaveLength(s.games.length);
    expect(Object.values(body.pricedAt ?? {}).every((t) => t === new Date(NOW).toISOString())).toBe(true);
  });

  it("the budget still buys only what it can: room for 2 events prices the live game plus one", async () => {
    const r = fakeRedis({ [`pl:cfb:props:spend:v1:${DATE}`]: String(CFB_PROPS.dailyBudget - 2 * PER) });
    fetchMock.mockImplementation(async () => eventResponse(null));
    const { body } = await call();
    expect(body.budgeted).toBe(true);
    expect(body.fetched).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain(`/events/${liveOddsEventId()}/odds`);
    expect(body.ttlSec).toBe(600);
    expect(r.ops("INCRBY")[0][2]).toBe(2 * PER);
  });
});

describe("INSTRUCTION 42 (2026-09-05) — per-game windows and the empty-event rule", () => {
  const liveGameId = (): string => liveSlate().games.find((g) => g.home.abbr === LIVE_ABBR)?.id as string;

  /** a real pre-kick pull, the board re-dated `ageSec` back (pricedAt stamps included), then the slate flipped live */
  async function preKickBoard(ageSec: number): Promise<CfbPropsBoard> {
    vi.mocked(slateFromEspn).mockResolvedValue(slate());
    fakeRedis();
    fetchMock.mockImplementation(async () => eventResponse(null));
    const { body } = await call();
    expect(body.source).toBe("fetch");
    vi.mocked(slateFromEspn).mockResolvedValue(liveSlate());
    fetchMock.mockClear();
    const at = new Date(NOW - ageSec * 1000).toISOString();
    const pricedAt = Object.fromEntries(Object.keys(body.pricedAt ?? {}).map((id) => [id, at]));
    return { ...body, generatedAt: at, pricedAt };
  }

  it("a fresh pull stamps pricedAt for every priced game with the pull's instant", async () => {
    fakeRedis();
    fetchMock.mockImplementation(async () => eventResponse(null));
    const { body } = await call();
    expect(body.priced?.length).toBeGreaterThan(0);
    expect(Object.keys(body.pricedAt ?? {}).sort()).toEqual([...(body.priced ?? [])].sort());
    for (const t of Object.values(body.pricedAt ?? {})) expect(t).toBe(new Date(NOW).toISOString());
  });

  it("EMPTY-EVENT RULE: a live game whose last pull returned ZERO rows, priced 5 min ago, is NOT re-fetched on a live pull", async () => {
    const stored = await preKickBoard(20 * 60);
    const id = liveGameId();
    // the stored board says: this game was pulled 5 min ago and the API had no player props for it
    const held: CfbPropsBoard = {
      ...stored,
      rows: stored.rows.filter((r) => r.gameId !== id),
      pricedAt: { ...stored.pricedAt, [id]: new Date(NOW - 5 * 60 * 1000).toISOString() },
    };
    expect(held.priced).toContain(id);
    const r = fakeRedis({ [`pl:cfb:props:v1:${DATE}`]: JSON.stringify(held), [`pl:cfb:props:spend:v1:${DATE}`]: "372" });
    fetchMock.mockImplementation(async () => eventResponse(null));
    const { body } = await call();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.source).toBe("redis");
    expect(body.live).toBe(1); // the live game IS selected — it is held, not dropped
    expect(body.budgeted).toBe(false);
    expect(body.stale).toBe(false); // it carries no lines, so nothing on the answer is out of date
    expect(body.rows).toEqual(held.rows);
    expect(body.priced).toContain(id);
    expect(body.pricedAt?.[id]).toBe(held.pricedAt?.[id]);
    expect(body.spentToday).toBe(372); // not a credit spent
    expect(r.boardSets()).toHaveLength(0);
    expect(r.ops("INCRBY")).toHaveLength(0);
  });

  it("EMPTY-EVENT RULE: the same zero-row live game priced 2 h + 5 s ago IS re-fetched (and only it)", async () => {
    const stored = await preKickBoard(20 * 60);
    const id = liveGameId();
    const held: CfbPropsBoard = {
      ...stored,
      rows: stored.rows.filter((r) => r.gameId !== id),
      pricedAt: { ...stored.pricedAt, [id]: new Date(NOW - (CFB_PROPS.revalidateSec + 5) * 1000).toISOString() },
    };
    const r = fakeRedis({ [`pl:cfb:props:v1:${DATE}`]: JSON.stringify(held), [`pl:cfb:props:spend:v1:${DATE}`]: "372" });
    fetchMock.mockImplementation(async () => eventResponse(null));
    const { body } = await call();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(`/events/${liveOddsEventId()}/odds`);
    expect(body.source).toBe("fetch");
    expect(body.pricedAt?.[id]).toBe(new Date(NOW).toISOString()); // re-stamped now
    // every upcoming game kept its own 20-min-old stamp
    for (const [gid, t] of Object.entries(body.pricedAt ?? {})) if (gid !== id) expect(t).toBe(stored.generatedAt);
    expect(r.ops("INCRBY")[0][2]).toBe(1 * PER);
  });

  it("a live game WITH rows re-prices once its own stamp is older than the live window (20 min here; the empty-event rule holds only empty events)", async () => {
    const stored = await preKickBoard(20 * 60);
    const id = liveGameId();
    expect(stored.rows.some((r) => r.gameId === id)).toBe(true);
    fakeRedis({ [`pl:cfb:props:v1:${DATE}`]: JSON.stringify(stored) });
    fetchMock.mockImplementation(async () => eventResponse(null));
    const { body } = await call();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(`/events/${liveOddsEventId()}/odds`);
    expect(body.source).toBe("fetch");
  });

  it("PER-GAME WINDOW: a stored LIVE board (ttlSec 600) 11 min old re-prices only the live game — the upcoming games ride on their own 2 h pricedAt", async () => {
    // before INSTRUCTION 42 the carry read the BOARD's window (600 s under a live slate), so every
    // upcoming game was re-fetched each 10-min pull — 60 × 31 credits a pull at the new cap
    vi.mocked(slateFromEspn).mockResolvedValue(liveSlate());
    fakeRedis();
    fetchMock.mockImplementation(async () => eventResponse(null));
    const first = await call();
    expect(first.body.ttlSec).toBe(600);
    const age = 11 * 60;
    const at = new Date(NOW - age * 1000).toISOString();
    const stored: CfbPropsBoard = { ...first.body, generatedAt: at, pricedAt: Object.fromEntries(Object.keys(first.body.pricedAt ?? {}).map((id) => [id, at])) };
    const r = fakeRedis({ [`pl:cfb:props:v1:${DATE}`]: JSON.stringify(stored), [`pl:cfb:props:spend:v1:${DATE}`]: "372" });
    fetchMock.mockClear();
    const { body } = await call();
    expect(body.source).toBe("fetch");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(`/events/${liveOddsEventId()}/odds`);
    expect(body.events).toBe(first.body.events);
    expect(body.fetched).toBe(body.events);
    expect(body.stale).toBe(false);
    expect(r.ops("INCRBY")[0][2]).toBe(1 * PER);
    // the carried games keep the 11-min-old stamp; the live game is re-stamped
    expect(body.pricedAt?.[liveGameId()]).toBe(new Date(NOW).toISOString());
    expect(Object.entries(body.pricedAt ?? {}).filter(([gid]) => gid !== liveGameId()).every(([, t]) => t === at)).toBe(true);
  });

  it("a board written BEFORE pricedAt existed falls back to generatedAt: 2 h + 5 s old → every game re-priced", async () => {
    const stored = await preKickBoard(CFB_PROPS.revalidateSec + 5);
    const legacy: CfbPropsBoard = { ...stored };
    delete legacy.pricedAt;
    fakeRedis({ [`pl:cfb:props:v1:${DATE}`]: JSON.stringify(legacy) });
    fetchMock.mockImplementation(async () => eventResponse(null));
    const { body } = await call();
    expect(body.source).toBe("fetch");
    expect(fetchMock).toHaveBeenCalledTimes(body.events);
  });

  it("the caps are pinned in the route's own answer: a 12-game fixture is never capped at 60 / 24", async () => {
    fakeRedis();
    fetchMock.mockImplementation(async () => eventResponse(null));
    const pre = await call();
    expect(pre.body.capped).toBe(false);
    expect(pre.body.events).toBe(slate().games.length);
    expect(pre.body.events).toBeLessThanOrEqual(CFB_PROPS.maxEvents);
    expect(CFB_PROPS.maxEvents).toBe(60);
    expect(CFB_PROPS.liveMaxEvents).toBe(24);
    expect(CFB_PROPS.dailyBudget).toBe(2500);
  });

  it("the budget rail still refuses beyond 2500: room for one event buys exactly one; at or past 2500 buys none", async () => {
    fakeRedis({ [`pl:cfb:props:spend:v1:${DATE}`]: String(2500 - PER) });
    fetchMock.mockImplementation(async () => eventResponse(null));
    const one = await call();
    expect(one.body.budgeted).toBe(true);
    expect(one.body.fetched).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(one.body.spentToday).toBe(2500);

    fetchMock.mockClear();
    fakeRedis({ [`pl:cfb:props:spend:v1:${DATE}`]: "2500" });
    const none = await call();
    expect(none.body.budgeted).toBe(true);
    expect(none.body.fetched).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockClear();
    const r = fakeRedis({ [`pl:cfb:props:spend:v1:${DATE}`]: "2531" });
    const past = await call();
    expect(past.body.budgeted).toBe(true);
    expect(past.body.fetched).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.ops("INCRBY")).toHaveLength(0);
    expect(past.body.note).toMatch(/2500 credits/);
  });
});

describe("the daily budget", () => {
  it("fetches only as many events as the budget still buys, and says so", async () => {
    const wanted = slate().games.length; // > the affordable count below
    expect(wanted).toBeGreaterThan(4);
    const spent = CFB_PROPS.dailyBudget - 4 * PER; // room for exactly 4 events
    const r = fakeRedis({ [`pl:cfb:props:spend:v1:${DATE}`]: String(spent) });
    fetchMock.mockImplementation(async () => eventResponse(null));
    const { body } = await call();
    expect(body.budgeted).toBe(true);
    expect(body.source).toBe("fetch");
    expect(body.fetched).toBe(4);
    expect(body.events).toBeGreaterThan(4);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(body.note).toMatch(/budget/i);
    expect(r.ops("INCRBY")[0][2]).toBe(4 * PER);
    expect(body.spentToday).toBe(spent + 4 * PER);
    expect(r.boardSets()).toHaveLength(1); // the partial board is still cached for the window
  });
  it("a used-up budget fetches nothing, writes no board, and answers source 'none'", async () => {
    const r = fakeRedis({ [`pl:cfb:props:spend:v1:${DATE}`]: String(CFB_PROPS.dailyBudget) });
    const { body } = await call();
    expect(body.budgeted).toBe(true);
    expect(body.source).toBe("none");
    expect(body.fetched).toBe(0);
    expect(body.rows).toEqual([]);
    expect(body.oddsMissing).toBe(false);
    expect(body.spentToday).toBe(CFB_PROPS.dailyBudget);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.boardSets()).toHaveLength(0);
    expect(r.ops("INCRBY")).toHaveLength(0);
  });
  it("exactly at the line is allowed: spent + n × 31 == budget fetches all n", async () => {
    const s = slate();
    const n = Math.min(s.games.length, CFB_PROPS.maxEvents);
    fakeRedis({ [`pl:cfb:props:spend:v1:${DATE}`]: String(CFB_PROPS.dailyBudget - n * PER) });
    fetchMock.mockImplementation(async () => eventResponse(null));
    const { body } = await call();
    expect(body.budgeted).toBe(false);
    expect(body.fetched).toBe(body.events);
  });
});

describe("no store / no key", () => {
  it("without the store env the route behaves as before: fetch on the data cache, no redis calls, spentToday null", async () => {
    vi.mocked(storeEnv).mockReturnValue(null);
    fetchMock.mockImplementation(async () => eventResponse(null));
    const { body } = await call();
    expect(body.source).toBe("fetch");
    expect(body.budgeted).toBe(false);
    expect(body.spentToday).toBeNull();
    expect(body.fetched).toBe(body.events);
    expect(redis).not.toHaveBeenCalled();
  });
  it("a store that throws never breaks the answer — it fetches and still returns 200", async () => {
    vi.mocked(redis).mockRejectedValue(new Error("store 503"));
    fetchMock.mockImplementation(async () => eventResponse(null));
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.source).toBe("fetch");
    expect(body.fetched).toBe(body.events);
  });
  it("missing ODDS_API_KEY → the unchanged oddsMissing answer, no fetch, no redis writes", async () => {
    vi.stubEnv("ODDS_API_KEY", "");
    const r = fakeRedis({ [`pl:cfb:props:spend:v1:${DATE}`]: "999" });
    const { body } = await call();
    expect(body.oddsMissing).toBe(true);
    expect(body.rows).toEqual([]);
    expect(body.fetched).toBe(0);
    expect(body.source).toBe("none");
    expect(body.budgeted).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.boardSets()).toHaveLength(0);
    expect(r.ops("INCRBY")).toHaveLength(0);
  });
  it("slate oddsMissing → the same empty answer, nothing written", async () => {
    vi.mocked(slateFromEspn).mockResolvedValue(slate(true));
    const r = fakeRedis();
    const { body } = await call();
    expect(body.oddsMissing).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.boardSets()).toHaveLength(0);
    expect(r.ops("INCRBY")).toHaveLength(0);
  });
});

describe("INSTRUCTION 42 (2026-09-05, review fix) — the stored board fits Upstash's 1 MB request cap, and a failed write is visible", () => {
  /** a 60-game / ~3,000-row board built from the route's own parsed rows (real shape, real field widths) */
  async function bigBoard(): Promise<CfbPropsBoard> {
    fakeRedis();
    fetchMock.mockImplementation(async () => eventResponse(null));
    const { body } = await call();
    expect(body.rows.length).toBeGreaterThan(0);
    const rows: CfbPropRow[] = [];
    const games = 60;
    for (let g = 0; g < games && rows.length < 3000; g++) {
      for (const r of body.rows) {
        if (rows.length >= 3000) break;
        rows.push({ ...r, key: `${r.key}#${g}`, gameId: `${r.gameId}-${g}`, player: `${r.player} ${g}`, label: `${r.label} ${g}`, sub: `${r.sub} · game ${g}` });
      }
    }
    return { ...body, rows, priced: Array.from(new Set(rows.map((r) => r.gameId))) };
  }
  it("a 3,000-row board is ~2.5 MB of JSON, yet every stored request (index + gzip chunks) is far under 1 MB and round-trips exactly", async () => {
    const board = await bigBoard();
    expect(board.rows.length).toBe(3000);
    const whole = Buffer.byteLength(JSON.stringify(board), "utf8");
    expect(whole).toBeGreaterThan(UPSTASH_MAX_REQUEST_BYTES); // the finding: one SET of the whole board would be refused
    const { index, chunks } = encodeBoard(DATE, board);
    expect(chunks).toHaveLength(Math.ceil(3000 / CFB_PROPS_CHUNK_ROWS));
    for (const c of chunks) expect(Buffer.byteLength(c.value, "utf8")).toBeLessThan(UPSTASH_MAX_REQUEST_BYTES / 4);
    expect(Buffer.byteLength(index, "utf8")).toBeLessThan(UPSTASH_MAX_REQUEST_BYTES / 10);
    expect(new Set(chunks.map((c) => c.key)).size).toBe(chunks.length);
    for (const c of chunks) expect(c.key.startsWith(`pl:cfb:props:v1:${DATE}:c:`)).toBe(true);
    expect(storedChunkKeys(index)).toEqual(chunks.map((c) => c.key));
    expect(assembleStoredBoard(index, chunks.map((c) => c.value))).toEqual(board);
  });
  it("a chunked index with a chunk missing reads as no board; a legacy plain-JSON board still reads as itself", async () => {
    const board = await bigBoard();
    const { index, chunks } = encodeBoard(DATE, board);
    expect(assembleStoredBoard(index, chunks.map((c, i) => (i === 1 ? null : c.value)))).toBeNull();
    expect(assembleStoredBoard(index, chunks.slice(1).map((c) => c.value))).toBeNull();
    const legacy: CfbPropsBoard = { ...board, rows: board.rows.slice(0, 5) };
    expect(storedChunkKeys(JSON.stringify(legacy))).toEqual([]);
    expect(assembleStoredBoard(JSON.stringify(legacy), [])).toEqual(legacy);
    expect(assembleStoredBoard("not json", [])).toBeNull();
  });
  it("the route writes chunks then the index, and the next request reads the whole board back through MGET with source 'redis'", async () => {
    const r = fakeRedis();
    fetchMock.mockImplementation(async () => eventResponse(null));
    const first = await call();
    const sets = r.ops("SET").map((c) => String(c[1]));
    expect(sets[sets.length - 1]).toBe(propsBoardKey(DATE)); // the index is the LAST write
    expect(sets.length).toBeGreaterThan(1);
    fetchMock.mockClear();
    const second = await call();
    expect(second.body.source).toBe("redis");
    expect(second.body.rows).toEqual(first.body.rows);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.ops("MGET")).toHaveLength(1);
    expect(r.ops("MGET")[0].slice(1)).toEqual(storedChunkKeys(r.kv.get(propsBoardKey(DATE)) ?? null));
  });
  it("a store that refuses the write no longer fails silently: the answer is still 200 with its rows, flagged storeWriteFailed", async () => {
    const r = fakeRedis();
    const base = vi.mocked(redis).getMockImplementation()!;
    vi.mocked(redis).mockImplementation(async (cmd: unknown[]) => {
      if (cmd[0] === "SET") throw new Error("store 413");
      return base(cmd);
    });
    fetchMock.mockImplementation(async () => eventResponse(null));
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.rows.length).toBeGreaterThan(0);
    expect(body.storeWriteFailed).toBe(true);
    expect(r.boardSets()).toHaveLength(0);
    // a good write carries no flag
    const ok = fakeRedis();
    const good = await call();
    expect(good.body.storeWriteFailed).toBeUndefined();
    expect(ok.boardSets()).toHaveLength(1);
  });
});

/**
 * THE CAESARS-MISSING RULE (2026-09-05). Josh, verbatim: "It's still only showing ANYTIME TD picks for
 * ARST @ MEM, WYO @ CSU, FIU @ USF, WMU @ MICH, SHSU @ TROY, BOISE @ ORE; They are still 12 games today
 * that haven't started w/ current Anytime TD odds". Read on prod ~15:45 PT: 11 upcoming games carried
 * DK / FD anytime-TD rows and NO Caesars quote on any row — priced once before Caesars posted, then
 * ridden for the whole 2 h carry. The fixture kicks at 16:00Z / 16:30Z; the clock below sits at 13:00Z
 * (3 h out — inside the 4 h window) or 11:00Z (5 h out — outside it). "Stripped" = the game's stored
 * rows with cz nulled (DK / FD stay), "emptied" = the game's rows removed (no book posts props).
 */
describe("THE CAESARS-MISSING RULE (2026-09-05) — a 30-min re-check inside 4 h of kickoff", () => {
  const IN = Date.parse("2026-09-05T13:00:00Z"); // every fixture kickoff 3–3.5 h ahead
  const OUT = Date.parse("2026-09-05T11:00:00Z"); // 5–5.5 h ahead
  const MIN = 60_000;
  const iso = (t: number) => new Date(t).toISOString();

  /** a real pre-kick pull at `at`, every stamp re-dated `ageMin` back */
  async function boardAt(at: number, ageMin: number): Promise<CfbPropsBoard> {
    vi.setSystemTime(at);
    fakeRedis();
    fetchMock.mockImplementation(async () => eventResponse(null));
    const { body } = await call();
    expect(body.source).toBe("fetch");
    expect(body.rows.some((r) => r.cz)).toBe(true);
    fetchMock.mockClear();
    const stamp = iso(at - ageMin * MIN);
    return { ...body, generatedAt: stamp, pricedAt: Object.fromEntries(Object.keys(body.pricedAt ?? {}).map((id) => [id, stamp])) };
  }
  const strip = (b: CfbPropsBoard, id: string): CfbPropsBoard => ({ ...b, rows: b.rows.map((r) => (r.gameId === id ? { ...r, cz: null, evCz: null } : r)) });
  const emptied = (b: CfbPropsBoard, id: string): CfbPropsBoard => ({ ...b, rows: b.rows.filter((r) => r.gameId !== id) });
  const seed = (b: CfbPropsBoard, spend = "372") => fakeRedis({ [`pl:cfb:props:v1:${DATE}`]: JSON.stringify(b), [`pl:cfb:props:spend:v1:${DATE}`]: spend });
  const oddsIdOf = (gameId: string) => slate().games.find((g) => g.id === gameId)?.oddsEventId as string;
  const urlsFetched = () => fetchMock.mock.calls.map(([u]) => String(u));
  // the pre-kick selection order (kickoff, then rank): game[1] is ECU@ALA, [2] ORST@HOU, [3] CCU@WVU
  const G = "401856634";
  const H = "401856778";
  const I = "401856780";

  it("czMissingDue (pure): upcoming + Caesars-missing (the caller's market verdict) + inside 4 h + stamp older than 30 min — and nothing else", () => {
    const board = { generatedAt: iso(IN - 35 * MIN), pricedAt: { g: iso(IN - 35 * MIN), y: iso(IN - 25 * MIN) } };
    const kick = IN + 3 * 3600_000;
    expect(czMissingDue(board, { id: "g", status: "upcoming", kickoffMs: kick }, true, IN)).toBe(true);
    expect(czMissingDue(board, { id: "y", status: "upcoming", kickoffMs: kick }, true, IN)).toBe(false); // 25 min: not yet
    expect(czMissingDue(board, { id: "g", status: "upcoming", kickoffMs: kick }, false, IN)).toBe(false); // Caesars on every market it has (or no rows at all)
    expect(czMissingDue(board, { id: "g", status: "live", kickoffMs: kick }, true, IN)).toBe(false); // live games keep their rule
    expect(czMissingDue(board, { id: "g", status: "upcoming", kickoffMs: IN + 5 * 3600_000 }, true, IN)).toBe(false); // 5 h out
    expect(czMissingDue(board, { id: "g", status: "upcoming", kickoffMs: IN + 4 * 3600_000 }, true, IN)).toBe(true); // 4 h exactly: inside
    expect(czMissingDue(board, { id: "g", status: "upcoming", kickoffMs: IN - 1 }, true, IN)).toBe(false); // already kicked
    expect(czMissingDue(board, { id: "g", status: "upcoming", kickoffMs: Number.NaN }, true, IN)).toBe(false);
    // an unstamped game (boards written before pricedAt existed) reads the board's generatedAt — 35 min here → due
    expect(czMissingDue(board, { id: "zz", status: "upcoming", kickoffMs: kick }, true, IN)).toBe(true);
    expect(czMissingDue({ generatedAt: iso(IN - 25 * MIN) }, { id: "zz", status: "upcoming", kickoffMs: kick }, true, IN)).toBe(false);
    expect(czMissingDue({ generatedAt: "nope" }, { id: "zz", status: "upcoming", kickoffMs: kick }, true, IN)).toBe(true); // unreadable → due
    expect(czMissingDue(board, { id: "g", status: "upcoming", kickoffMs: kick }, true, IN - 6 * MIN)).toBe(false); // 29 min: not yet
  });

  it("czMissingGameIds (pure, review fix): keyed on the MARKET — a game is missing when some market with rows has no Caesars quote on any of them; zero rows is never missing", () => {
    const q = { book: "x", title: "x", price: -110, line: null, dec: 1.91 };
    const rows = [
      { gameId: "a", market: "pass_yds" as const, cz: q },
      { gameId: "a", market: "anytime_td" as const, cz: null }, // Caesars yardage, no Caesars anytime TD yet → missing
      { gameId: "b", market: "pass_yds" as const, cz: q },
      { gameId: "b", market: "pass_yds" as const, cz: null }, // one Caesars row on the market is enough → not missing
      { gameId: "c", market: "anytime_td" as const, cz: null }, // no Caesars at all → missing
      { gameId: "d", market: "anytime_td" as const, cz: q },
    ];
    expect([...czMissingGameIds(rows)].sort()).toEqual(["a", "c"]);
    expect(czMissingGameIds([])).toEqual(new Set());
  });

  it("propsCoverage (pure): czMissing = priced upcoming games with rows and a Caesars-less market; noProps = priced games with zero rows; unpriced games count in neither", () => {
    const ev = [
      { id: "a", status: "upcoming" as const },
      { id: "b", status: "upcoming" as const },
      { id: "c", status: "live" as const },
      { id: "d", status: "upcoming" as const },
      { id: "e", status: "upcoming" as const },
      { id: "f", status: "upcoming" as const },
    ];
    const q = { book: "x", title: "x", price: -110, line: null, dec: 1.91 };
    const rows = [
      { gameId: "a", market: "pass_yds" as const, cz: q },
      { gameId: "a", market: "pass_yds" as const, cz: null },
      { gameId: "b", market: "anytime_td" as const, cz: null },
      { gameId: "b", market: "anytime_td" as const, cz: null },
      { gameId: "c", market: "anytime_td" as const, cz: null },
      { gameId: "f", market: "pass_yds" as const, cz: q },
      { gameId: "f", market: "anytime_td" as const, cz: null }, // the mixed case the market key exists for
    ];
    expect(propsCoverage(ev, rows, ["a", "b", "c", "d", "f"])).toEqual({ czMissing: 2, noProps: 1 }); // b, f missing; d priced but empty; c is live; e unpriced
    expect(propsCoverage(ev, rows, ["a", "b", "c", "d", "e", "f"])).toEqual({ czMissing: 2, noProps: 2 });
    expect(propsCoverage(ev, rows, [])).toEqual({ czMissing: 0, noProps: 0 });
    expect(propsCoverage([], rows, ["a"])).toEqual({ czMissing: 0, noProps: 0 });
  });

  it("a fresh pre-kick pull reports czMissing 0 / noProps 0 on the synthetic fixture (every game has Caesars rows)", async () => {
    vi.setSystemTime(IN);
    fakeRedis();
    fetchMock.mockImplementation(async () => eventResponse(null));
    const { body } = await call();
    expect(body.czMissing).toBe(0);
    expect(body.noProps).toBe(0);
  });

  it("a stripped game (other books' rows, no Caesars) stamped 35 min ago, 3 h before kickoff, is re-fetched — ALONE, bypassing the data cache — even though the board as a whole is 'fresh'", async () => {
    const held = strip(await boardAt(IN, 35), G);
    expect(boardFresh(held, IN, CFB_PROPS.revalidateSec)).toBe(true); // rail 1 would have answered before this rule
    const r = seed(held);
    fetchMock.mockImplementation(async () => eventResponse(null));
    const { body } = await call();
    expect(body.source).toBe("fetch");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(urlsFetched()[0]).toContain(`/events/${oddsIdOf(G)}/odds`);
    // review fix: Next's data cache is stale-while-revalidate — a `revalidate: 1800` re-check would have been answered
    // with the very body it re-pulls to replace, landing Caesars one interval (~60 min) late; the re-pull bypasses it
    expect(fetchMock.mock.calls[0][1]).toEqual({ cache: "no-store" });
    expect(body.pricedAt?.[G]).toBe(iso(IN)); // re-stamped now
    for (const [gid, t] of Object.entries(body.pricedAt ?? {})) if (gid !== G) expect(t).toBe(held.generatedAt); // the rest ride their stamps
    expect(body.fetched).toBe(body.events);
    expect(body.stale).toBe(false);
    expect(body.budgeted).toBe(false);
    expect(body.ttlSec).toBe(CFB_PROPS.revalidateSec); // the board's header window is unchanged once nothing is Caesars-missing
    expect(body.czMissing).toBe(0); // the re-pull found Caesars rows (the fixture posts them)
    expect(body.noProps).toBe(0);
    expect(r.ops("INCRBY")[0][2]).toBe(1 * PER);
    expect(r.boardSets()).toHaveLength(1);
  });

  it("the same stripped game stamped 25 min ago is NOT re-fetched: the board answers from redis and counts it — czMissing 1, and ttlSec drops to the 30-min rule so the phone re-asks", async () => {
    const held = strip(await boardAt(IN, 25), G);
    const r = seed(held);
    const { body } = await call();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.source).toBe("redis");
    expect(body.czMissing).toBe(1);
    expect(body.noProps).toBe(0);
    // review fix: nothing else calls this route — with ttlSec 7200 the open phone's staleTime hid the re-check for 2 h
    expect(body.ttlSec).toBe(Math.min(CFB_PROPS.revalidateSec, CFB_PROPS.czMissingRevalidateSec));
    expect(body.ttlSec).toBe(1800);
    expect(body.rows).toEqual(held.rows);
    expect(r.boardSets()).toHaveLength(0);
    expect(r.ops("INCRBY")).toHaveLength(0);
  });

  it("the 4 h window: the same stripped game 35 min old but 5 h before kickoff rides the 2 h carry (no fetch, czMissing 1, ttlSec 1800)", async () => {
    const held = strip(await boardAt(OUT, 35), G);
    seed(held);
    const { body } = await call();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.source).toBe("redis");
    expect(body.czMissing).toBe(1);
    expect(body.ttlSec).toBe(1800);
    // …and once its 2 h carry expires it is fetched under the existing rule, at the pull's own window
    const old = strip(await boardAt(OUT, CFB_PROPS.revalidateSec / 60 + 1), G);
    seed(old);
    fetchMock.mockImplementation(async () => eventResponse(null));
    const again = await call();
    expect(again.body.source).toBe("fetch");
    expect(fetchMock).toHaveBeenCalledTimes(again.body.events); // every game's carry expired together
    for (const [, init] of fetchMock.mock.calls) expect(init).toEqual({ next: { revalidate: CFB_PROPS.revalidateSec } });
  });

  it("an EMPTIED upcoming game (zero stored rows) counts as noProps and is NOT Caesars-missing: inside 4 h it stays on the 2 h empty-event hold (review fix — 29 of 46 priced games that day were FBS-vs-FCS games no book posts props on; re-asking them every 30 min wanted ~7,200 credits)", async () => {
    const fresh = emptied(await boardAt(IN, 25), G);
    seed(fresh);
    const first = await call();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(first.body.source).toBe("redis");
    expect(first.body.noProps).toBe(1);
    expect(first.body.czMissing).toBe(0);
    expect(first.body.ttlSec).toBe(CFB_PROPS.revalidateSec); // no Caesars-missing game: the 2 h window stands
    expect(first.body.priced).toContain(G); // still a priced game — it simply has no rows
    // 35 min old (would be due under the old rule), 65 min old, 119 min old: never re-asked inside the 2 h hold
    for (const ageMin of [35, 65, CFB_PROPS.revalidateSec / 60 - 1]) {
      const r = seed(emptied(await boardAt(IN, ageMin), G));
      const { body } = await call();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(body.source).toBe("redis");
      expect(body.noProps).toBe(1);
      expect(body.czMissing).toBe(0);
      expect(body.priced).toContain(G);
      expect(r.ops("INCRBY")).toHaveLength(0);
    }
    // …and once the 2 h hold passes it is fetched under the existing rule (every game's carry expired together here)
    seed(emptied(await boardAt(IN, CFB_PROPS.revalidateSec / 60 + 1), G));
    fetchMock.mockImplementation(async () => eventResponse(null));
    const again = await call();
    expect(again.body.source).toBe("fetch");
    expect(urlsFetched()).toContain(`https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/events/${oddsIdOf(G)}/odds?apiKey=test-key-never-logged&regions=us&markets=player_anytime_td,player_pass_tds,player_pass_yds,player_receptions,player_rush_yds,player_reception_yds&oddsFormat=american`);
    expect(again.body.noProps).toBe(0);
  });

  it("a MARKET-keyed miss (review fix): a game with Caesars yardage props but no Caesars anytime TD is counted AND re-checked — the rule is per market, not per game", async () => {
    const stripAtd = (b: CfbPropsBoard, id: string): CfbPropsBoard => ({
      ...b,
      rows: b.rows.map((r) => (r.gameId === id && r.market === "anytime_td" ? { ...r, cz: null, evCz: null } : r)),
    });
    const fresh = stripAtd(await boardAt(IN, 25), G);
    expect(fresh.rows.some((r) => r.gameId === G && r.market !== "anytime_td" && r.cz)).toBe(true); // Caesars IS on its other markets
    seed(fresh);
    const first = await call();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(first.body.source).toBe("redis");
    expect(first.body.czMissing).toBe(1); // under a per-game "any Caesars row" count this read 0 while the ANYTIME TD set lacked G
    expect(first.body.ttlSec).toBe(1800);
    const due = stripAtd(await boardAt(IN, 35), G);
    seed(due);
    fetchMock.mockImplementation(async () => eventResponse(null));
    const second = await call();
    expect(second.body.source).toBe("fetch");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(urlsFetched()[0]).toContain(`/events/${oddsIdOf(G)}/odds`);
    expect(fetchMock.mock.calls[0][1]).toEqual({ cache: "no-store" });
    expect(second.body.czMissing).toBe(0);
    expect(second.body.ttlSec).toBe(CFB_PROPS.revalidateSec);
  });

  it("a FAILED re-pull (review fix): when the odds call answers non-2xx for a game with stored rows, the answer keeps its stored rows and old pricedAt — never 'unpriced' — and nothing is booked", async () => {
    const held = strip(await boardAt(IN, 35), G);
    const heldRows = held.rows.filter((r) => r.gameId === G);
    expect(heldRows.length).toBeGreaterThan(0);
    const r = seed(held);
    fetchMock.mockImplementation(async () => new Response("upstream down", { status: 502 }));
    const { body } = await call();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(urlsFetched()[0]).toContain(`/events/${oddsIdOf(G)}/odds`);
    expect(body.source).toBe("fetch");
    expect(body.rows.filter((row) => row.gameId === G)).toEqual(heldRows);
    expect(body.priced).toContain(G);
    expect(body.pricedAt?.[G]).toBe(held.pricedAt?.[G]); // the old stamp: the next request tries again after its 30 min, not at once
    expect(body.czMissing).toBe(1); // still honestly counted
    expect(body.stale).toBe(false); // an upcoming game inside its 2 h carry — nothing out of date
    expect(body.fetched).toBe(body.events - 1); // the failed event is not "fetched"
    expect(r.ops("INCRBY")).toHaveLength(0); // nothing fetched, nothing booked, nothing written
    expect(r.boardSets()).toHaveLength(0);
  });

  it("a FAILED re-pull beside a successful one: the WRITTEN board keeps the failed game's stored rows and old pricedAt too", async () => {
    const base = await boardAt(IN, 35);
    const mixed: CfbPropsBoard = { ...strip(base, G), pricedAt: { ...base.pricedAt, [H]: iso(IN - (CFB_PROPS.revalidateSec + 5) * 1000) } };
    const gRows = mixed.rows.filter((row) => row.gameId === G);
    const r = seed(mixed);
    fetchMock.mockImplementation(async (input) => (String(input).includes(`/events/${oddsIdOf(G)}/odds`) ? new Response("", { status: 503 }) : eventResponse(null)));
    const { body } = await call();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(body.pricedAt?.[G]).toBe(mixed.pricedAt?.[G]);
    expect(body.pricedAt?.[H]).toBe(iso(IN));
    expect(body.rows.filter((row) => row.gameId === G)).toEqual(gRows);
    expect(r.ops("INCRBY")[0][2]).toBe(1 * PER); // only H cost anything
    const stored = r.board()!;
    expect(stored.rows.filter((row) => row.gameId === G)).toEqual(gRows);
    expect(stored.pricedAt?.[G]).toBe(mixed.pricedAt?.[G]);
    expect(stored.priced).toContain(G);
    expect(stored.czMissing).toBe(1);
  });

  it("a FAILED live re-pull keeps the live game's stored rows, re-stamped live / unplayable, and flags the answer stale (its lines are older than the live window)", async () => {
    const stored = await boardAt(IN, 20); // a pre-kick pull 20 min ago; the game kicks off (liveSlate) and its re-pull fails
    const id = liveSlate().games.find((g) => g.home.abbr === LIVE_ABBR)?.id as string;
    const liveRows = stored.rows.filter((row) => row.gameId === id);
    expect(liveRows.length).toBeGreaterThan(0);
    seed(stored);
    fetchMock.mockImplementation(async () => new Response("", { status: 500 }));
    vi.mocked(slateFromEspn).mockResolvedValue(liveSlate());
    const { body } = await call();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(body.rows.filter((row) => row.gameId === id)).toEqual(liveRows.map((row) => ({ ...row, status: "live", playable: false })));
    expect(body.pricedAt?.[id]).toBe(stored.pricedAt?.[id]);
    expect(body.live).toBe(1);
    expect(body.stale).toBe(true);
  });

  it("LIVE AGE GATE (review fix): a Caesars-missing game turning due skips rail 1 but does NOT re-queue a live game re-priced 1 min ago — only the due game is fetched", async () => {
    const base = await boardAt(IN, 35);
    const liveId = liveSlate().games.find((g) => g.home.abbr === LIVE_ABBR)?.id as string;
    // the board: written 1 min ago under a live window, the live game re-priced then, G stripped and 35 min old
    const board: CfbPropsBoard = { ...strip(base, G), generatedAt: iso(IN - 1 * MIN), ttlSec: CFB_PROPS.liveRevalidateSec, live: 1, pricedAt: { ...base.pricedAt, [liveId]: iso(IN - 1 * MIN) } };
    vi.mocked(slateFromEspn).mockResolvedValue(liveSlate());
    expect(boardFresh(board, IN, CFB_PROPS.liveRevalidateSec)).toBe(true); // rail 1 is skipped ONLY because G is due
    const r = seed(board, String(CFB_PROPS.dailyBudget - 1 * PER)); // room for exactly one event: before the fix the live game took it and G was refused
    fetchMock.mockImplementation(async () => eventResponse(null));
    const { body } = await call();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(urlsFetched()[0]).toContain(`/events/${oddsIdOf(G)}/odds`);
    expect(body.budgeted).toBe(false);
    expect(body.live).toBe(1); // the live game is carried, not dropped
    expect(body.stale).toBe(false); // …and its 1-min-old lines are not stale
    expect(body.pricedAt?.[liveId]).toBe(iso(IN - 1 * MIN));
    expect(body.pricedAt?.[G]).toBe(iso(IN));
    expect(body.czMissing).toBe(0);
    expect(r.ops("INCRBY")[0][2]).toBe(1 * PER); // one real call booked — never the whole live pool
    // the same live game 11 min old IS re-priced, first, ahead of G
    const older: CfbPropsBoard = { ...board, pricedAt: { ...board.pricedAt, [liveId]: iso(IN - 11 * MIN) } };
    seed(older);
    fetchMock.mockClear();
    const two = await call();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(urlsFetched()[0]).toContain(`/events/${liveOddsEventId()}/odds`);
    expect(urlsFetched()[1]).toContain(`/events/${oddsIdOf(G)}/odds`);
    expect(fetchMock.mock.calls[0][1]).toEqual({ cache: "no-store" }); // a live RE-pull bypasses the data cache too
    expect(two.body.pricedAt?.[liveId]).toBe(iso(IN));
  });

  it("cache per game on one pre-kick pull: the Caesars-missing re-check bypasses the data cache, the 2 h-expired game rides the pull's 7200 — and the re-check is fetched FIRST", async () => {
    const base = await boardAt(IN, 35);
    const mixed: CfbPropsBoard = { ...strip(base, G), pricedAt: { ...base.pricedAt, [H]: iso(IN - (CFB_PROPS.revalidateSec + 5) * 1000) } };
    seed(mixed);
    fetchMock.mockImplementation(async () => eventResponse(null));
    const { body } = await call();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(urlsFetched()[0]).toContain(`/events/${oddsIdOf(G)}/odds`);
    expect(urlsFetched()[1]).toContain(`/events/${oddsIdOf(H)}/odds`);
    expect(fetchMock.mock.calls[0][1]).toEqual({ cache: "no-store" });
    expect(fetchMock.mock.calls[1][1]).toEqual({ next: { revalidate: 7200 } });
    expect(body.ttlSec).toBe(7200);
    expect(body.pricedAt?.[G]).toBe(iso(IN));
    expect(body.pricedAt?.[H]).toBe(iso(IN));
  });

  it("need is ordered live → never priced → Caesars-missing → 2 h-expired, so a tight budget buys the cheapest wins first", async () => {
    // the stored board: OSU live (rows, re-prices every pull), I never priced, G stripped 35 min ago, H expired 2 h + 5 s ago
    const base = await boardAt(IN, 35);
    const liveId = liveSlate().games.find((g) => g.home.abbr === LIVE_ABBR)?.id as string;
    const board: CfbPropsBoard = {
      ...strip(base, G),
      rows: strip(base, G).rows.filter((r) => r.gameId !== I),
      priced: (base.priced ?? []).filter((id) => id !== I),
      pricedAt: Object.fromEntries(Object.entries({ ...base.pricedAt, [H]: iso(IN - (CFB_PROPS.revalidateSec + 5) * 1000) }).filter(([id]) => id !== I)),
    };
    vi.mocked(slateFromEspn).mockResolvedValue(liveSlate());
    const expectOrder = async (room: number, ids: string[]) => {
      seed(board, String(CFB_PROPS.dailyBudget - room * PER));
      fetchMock.mockClear();
      fetchMock.mockImplementation(async () => eventResponse(null));
      const { body } = await call();
      expect(fetchMock).toHaveBeenCalledTimes(ids.length);
      expect(urlsFetched().map((u) => u.match(/\/events\/([^/]+)\/odds/)?.[1])).toEqual(ids.map(oddsIdOf));
      return body;
    };
    const full = await expectOrder(4, [liveId, I, G, H]);
    expect(full.budgeted).toBe(false);
    expect(full.stale).toBe(false);
    // the re-pulls (the live game already on the board, the Caesars-missing re-check) bypass the data cache; the
    // first pull (I) and the expired carry (H) sit on the pull's 10-min window
    expect(fetchMock.mock.calls.map(([, init]) => init)).toEqual([
      { cache: "no-store" },
      { next: { revalidate: CFB_PROPS.liveRevalidateSec } },
      { cache: "no-store" },
      { next: { revalidate: CFB_PROPS.liveRevalidateSec } },
    ]);
    const two = await expectOrder(2, [liveId, I]);
    expect(two.budgeted).toBe(true);
    expect(two.stale).toBe(true); // G and H were refused and carry rows
    expect(two.czMissing).toBe(1); // G still has no Caesars row on the answer
    const three = await expectOrder(3, [liveId, I, G]);
    expect(three.budgeted).toBe(true);
    expect(three.czMissing).toBe(0);
    const one = await expectOrder(1, [liveId]);
    expect(one.budgeted).toBe(true);
    expect(one.priced).not.toContain(I); // never priced, still not: absent, not counted as noProps
    expect(one.noProps).toBe(0);
  });

  it("a refused game with NO stored rows does not flag the board stale (it carries nothing that could be out of date)", async () => {
    // G emptied and its own 2 h carry expired (a zero-row game is never due under the Caesars-missing rule — review fix)
    const base = await boardAt(IN, 35);
    // (the board's own generatedAt is aged past 2 h too, so rail 1 does not answer; every other game rides its 35-min stamp)
    const expired = iso(IN - (CFB_PROPS.revalidateSec + 5) * 1000);
    const held: CfbPropsBoard = { ...emptied(base, G), generatedAt: expired, pricedAt: { ...base.pricedAt, [G]: expired } };
    seed(held, String(CFB_PROPS.dailyBudget)); // budget spent: G is due (expired), refused
    const { body } = await call();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.budgeted).toBe(true);
    expect(body.stale).toBe(false);
    expect(body.noProps).toBe(1);
  });

  it("the footnote copy's figures come from the constants: 30 min and 4 h", () => {
    expect(CFB_PROPS.czMissingRevalidateSec / 60).toBe(30);
    expect(CFB_PROPS.czMissingWindowSec / 3600).toBe(4);
  });
});

describe("source pins", () => {
  const route = readSrc("app/api/cfb/props/route.ts");
  const store = readSrc("src/lib/cfb/props-store.ts");
  it("the keys and TTLs are the pinned literals, through the shared store client", () => {
    expect(store).toMatch(/"pl:cfb:props:v1:"/);
    expect(store).toMatch(/"pl:cfb:props:spend:v1:"/);
    expect(store).toMatch(/from "@\/lib\/server\/store"/);
    expect(store).toMatch(/36 \* 3600/);
    // 2026-09-05 (review fix): the board is RETAINED past its window; freshness is the reader's `boardFresh`
    expect(store).toMatch(/"EX", CFB_PROPS\.boardRetainSec/);
    expect(store).toMatch(/export function boardFresh\(/);
    expect(store).toMatch(/Math\.min\(boardWindowSec\(board\), windowSec\)/);
    expect(store).not.toMatch(/"EX", CFB_PROPS\.revalidateSec/);
    expect(route).toMatch(/boardFresh\(stored, now, windowSec\)/);
    // 2026-09-05 (same-day follow-up): the live cap lives in selectPropEvents (its own pool), not the route
    expect(readSrc("src/lib/cfb/props.ts")).toMatch(/liveMax: number = CFB_PROPS\.liveMaxEvents/);
    expect(route).not.toMatch(/liveTaken/);
    expect(store).toMatch(/"INCRBY"/);
    // INSTRUCTION 42 (2026-09-05): the carry decision is per game through pricedAgeMs, and the board stamps pricedAt
    expect(store).toMatch(/export function pricedAgeMs\(/);
    expect(route).toMatch(/pricedAgeMs\(stored, g\.id, now\)/);
    expect(route).toMatch(/pricedAt: pricedAt\(/);
    expect(route).not.toMatch(/boardFresh\(stored, now, CFB_PROPS\.revalidateSec\)/);
    expect(route).toMatch(/CFB_PROPS\.dailyBudget/);
    expect(route).toMatch(/CFB_PROPS\.measuredCreditsPerEvent/);
    expect(route).not.toMatch(/console\.(log|info|warn|error)/);
    expect(route).not.toMatch(/apiKey=[A-Za-z0-9]/);
  });
});
