import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { stripComments } from "./helpers/source";
import { MLB_LIVE_MARKETS, MLB_LIVE_PROPS, MLB_LIVE_REDIS, mlbLiveEventUrl } from "@/lib/mlb/live-props-rules";
import { encodeOverlay, MLB_LIST_CALL_CREDITS, mlbAffordableEvents, mlbLiveBoardKey, mlbLiveCooldownKey, mlbLiveSlotKey, mlbLiveSpendKey, mlbPullCredits } from "@/lib/mlb/live-props-store";
import { liveQuoteKey, type MlbLiveQuoteBoard } from "@/lib/mlb/live-quote-types";
import { BOARD_KEY, encodeBoard, type StoredBoard } from "@/lib/server/board-store";
import { STATSAPI } from "@/lib/server/mlb-live-state";

/**
 * THE MLB LIVE IN-PLAY ODDS PULL (INSTRUCTION 51, 2026-09-11) — the route that spends.
 * Josh's order, verbatim: "Authorize the live in-play odds pull for MLB".
 *
 * This is the first EXECUTED route test on the MLB side, and the thing under test is a route whose
 * whole job is to spend real money, so the rails are pinned harder than the output is:
 *
 *   free first  — no store, nothing in play, nothing MOVED, a 429 cooldown or an exhausted budget
 *                 each return having called `fetch` zero times (or, past the free statsapi reads,
 *                 zero times upstream). The pre-gate pass is why "nothing moved" is free: the
 *                 divergence verdict is computed BEFORE the 1-credit event list is bought.
 *   order       — cleared -> drifted -> unpriced -> expired, so the game Josh is staring at is the
 *                 one the budget buys first
 *   the budget  — mlbAffordableEvents against 600 / 6, and probeEvents capping the day's FIRST pull
 *                 at 3 until a real credit measurement exists
 *   the spend   — recorded only when something was fetched, from the real x-requests-used deltas,
 *                 and NOT for an event whose call failed
 *   isolation   — not one write to pl:board:, pl:picks:, pl:ledger:, pl:clv:, pl:cfb: or pl:nfl:
 *
 * EVERY UPSTREAM BYTE IS SYNTHETIC. The per-event odds payload and the statsapi schedule are the
 * two fixtures in tests/fixtures/mlb/ — real response SHAPES with invented numbers, never captured
 * quotes (both carry a _note saying so, asserted below). The boxscores are built here in the test.
 * `fetch` is a vi.fn throughout: THE ODDS API IS NOT CALLED BY THIS TEST, and `ODDS_API_KEY` is a
 * sentinel string that the route must never echo.
 */

vi.mock("@/lib/server/store", () => ({
  redis: vi.fn(),
  storeEnv: vi.fn(),
  cronHeaderAuthed: vi.fn(() => true),
  syncAuthed: vi.fn(() => false),
}));

import { cronHeaderAuthed, redis, storeEnv, syncAuthed } from "@/lib/server/store";
import { GET } from "../app/api/mlb/live-props/route";
import { DH_AMBIGUITY_MS, bridgeEvent, mlbLivePropsGet, sightLiveQuote } from "@/lib/server/mlb-live-quote";

const FIX = path.join(process.cwd(), "tests", "fixtures", "mlb");
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8"));
const ODDS = readJson("odds-event-live-props.synthetic.json") as {
  _note: string;
  eventsList: { id: string; commence_time: string; away_team: string; home_team: string }[];
  byEvent: Record<string, { id: string; away_team: string; home_team: string; commence_time: string; bookmakers: unknown[] }>;
};
const SCHED = readJson("statsapi-schedule-live.synthetic.json") as { _note: string };

const root = path.join(__dirname, "..");
const readSrc = (p: string) => stripComments(fs.readFileSync(path.join(root, p), "utf8"));

/** 2026-07-11 01:30Z = 18:30 PT on 2026-07-10 — every fixture game is live, final or still to come */
const NOW = Date.parse("2026-07-11T01:30:00Z");
const DATE = "2026-07-10";
const PT = "2026-07-10";
const KEY = "test-key-never-logged";

const E1 = "250b0373676b10f51ed1c59c93714245"; // NYY @ WSH — six markets, four books, Josh's case
const E2 = "f308816130f3007f771929f15d62862c"; // MIL @ PIT — DK + FD only, NO Caesars
const E3 = "6f2c4b9ad1e34a7c8b5d0e91f7a23c45"; // MIA @ ATL — bookmakers: [] (the EMPTY-EVENT RULE)
const E4 = "a91b7c3d5e2f48a0b6c1d8e4f70a29b3"; // CHC @ STL, game 1 of the doubleheader
const E5 = "b02c8d4e6f3a59b1c7d2e9f5a81b30c4"; // CHC @ STL, game 2 — 20 min later, indistinguishable

/* the board's gkeys, exactly as the engine's shGkey spells them */
const G_NYY = "newyorkyankees@washingtonnationals";
const G_MIL = "milwaukeebrewers@pittsburghpirates";
const G_MIA = "miamimarlins@atlantabraves";
const G_CHC = "chicagocubs@stlouiscardinalsgm1";
const G_BOS = "bostonredsox@torontobluejays"; // FINAL
const G_LAD = "losangelesdodgers@sandiegopadres"; // still to come

const JUDGE_HRR = "aaronjudge|batter_hits_runs_rbis|0.5"; // Josh's exact complaint
const JUDGE_H = "aaronjudge|batter_hits|0.5";
const SOTO_HRR = "juansoto|batter_hits_runs_rbis|1.5";
const GARCIA_H = "luisgarciajr|batter_hits|0.5"; // quoted by fanatics ALONE — must be dropped
const WEATHERS_K = "ryanweathers|pitcher_strikeouts|4.5";
const WEATHERS_OUTS = "ryanweathers|pitcher_outs|14.5"; // the market is absent from the event
const YELICH_H = "christianyelich|batter_hits|0.5";
const SKENES_K = "paulskenes|pitcher_strikeouts|6.5";
const ACUNA_H = "ronaldacunajr|batter_hits|0.5";
const HOERNER_H = "nicohoerner|batter_hits|0.5";

const GAME_INFO: Record<string, { pk: number; start: string; away: string; home: string; gm?: number }> = {
  [G_NYY]: { pk: 823901, start: "2026-07-10T22:46:00Z", away: "New York Yankees", home: "Washington Nationals" },
  [G_MIL]: { pk: 823902, start: "2026-07-10T22:41:00Z", away: "Milwaukee Brewers", home: "Pittsburgh Pirates" },
  [G_MIA]: { pk: 823903, start: "2026-07-10T23:10:00Z", away: "Miami Marlins", home: "Atlanta Braves" },
  [G_CHC]: { pk: 823906, start: "2026-07-11T00:15:00Z", away: "Chicago Cubs", home: "St. Louis Cardinals", gm: 1 },
  [G_BOS]: { pk: 823904, start: "2026-07-10T17:07:00Z", away: "Boston Red Sox", home: "Toronto Blue Jays" },
  [G_LAD]: { pk: 823905, start: "2026-07-11T02:10:00Z", away: "Los Angeles Dodgers", home: "San Diego Padres" },
};

const ROWS: Record<string, { lkey: string; prob: number }[]> = {
  [G_NYY]: [
    { lkey: JUDGE_HRR, prob: 78 },
    { lkey: JUDGE_H, prob: 64 },
    { lkey: SOTO_HRR, prob: 55 },
    { lkey: GARCIA_H, prob: 52 },
    { lkey: WEATHERS_K, prob: 51 },
    { lkey: WEATHERS_OUTS, prob: 50 },
  ],
  [G_MIL]: [
    { lkey: YELICH_H, prob: 61 },
    { lkey: SKENES_K, prob: 55 },
  ],
  [G_MIA]: [{ lkey: ACUNA_H, prob: 66 }],
  [G_CHC]: [{ lkey: HOERNER_H, prob: 58 }],
  [G_BOS]: [{ lkey: "rafaeldevers|batter_hits|0.5", prob: 60 }],
  [G_LAD]: [{ lkey: "shoheiohtani|batter_hits|0.5", prob: 70 }],
};

/** a boxscore in statsapi's shape, built here — the numbers are the test's, not a captured feed */
type Line = { batting?: Record<string, number>; pitching?: Record<string, number> };
function boxOf(players: Record<string, Line>) {
  const entries = Object.entries(players).map(([fullName, stats], i) => [
    `ID${900000 + i}`,
    { person: { fullName }, stats: { batting: stats.batting ?? {}, pitching: stats.pitching ?? {} } },
  ]);
  return { teams: { away: { players: Object.fromEntries(entries) }, home: { players: {} } } };
}

/** JUDGE HAS ALREADY CLEARED 0.5 H+R+RBI — 1 H, 1 R, 1 RBI in the top of the 4th, exactly Josh's case */
const BOX_CLEARED: Record<number, unknown> = {
  823901: boxOf({
    "Aaron Judge": { batting: { hits: 1, runs: 1, rbi: 1, homeRuns: 0, doubles: 0, triples: 0 } },
    "Juan Soto": { batting: { hits: 1, runs: 0, rbi: 0 } },
    "Luis Garcia Jr.": { batting: { hits: 0, runs: 0, rbi: 0 } },
    "Ryan Weathers": { pitching: { strikeOuts: 3, outs: 11 } },
  }),
  823902: boxOf({
    "Christian Yelich": { batting: { hits: 0, runs: 0, rbi: 0 } },
    "Paul Skenes": { pitching: { strikeOuts: 5, outs: 15 } },
  }),
  823903: boxOf({ "Ronald Acuna Jr.": { batting: { hits: 0, runs: 0, rbi: 0 } } }),
  823906: boxOf({ "Nico Hoerner": { batting: { hits: 0, runs: 0, rbi: 0 } } }),
};

/** the same slate with NOTHING cleared — Judge is 0-for-2 and every stored line still stands */
const BOX_QUIET: Record<number, unknown> = {
  ...BOX_CLEARED,
  823901: boxOf({
    "Aaron Judge": { batting: { hits: 0, runs: 0, rbi: 0, homeRuns: 0, doubles: 0, triples: 0 } },
    "Juan Soto": { batting: { hits: 0, runs: 0, rbi: 0 } },
    "Luis Garcia Jr.": { batting: { hits: 0, runs: 0, rbi: 0 } },
    "Ryan Weathers": { pitching: { strikeOuts: 3, outs: 11 } },
  }),
};

function storedBoard(gkeys: string[]): string {
  const rows = gkeys.flatMap((g) => (ROWS[g] ?? []).map((r) => ({ ...r, gkey: g, sub: null })));
  const gameInfo = Object.fromEntries(gkeys.map((g) => [g, GAME_INFO[g]]));
  const board = { date: DATE, at: NOW, data: { categories: { props: rows }, parlays: [], parlaysMixed: [], gameInfo } } as unknown as StoredBoard;
  const enc = encodeBoard(board);
  if ("error" in enc) throw new Error(enc.error);
  return enc.blob;
}
const ALL_GAMES = [G_NYY, G_MIL, G_MIA, G_CHC, G_BOS, G_LAD];

/** an overlay as the route would have written it, for the carry / hold / freshness paths */
function overlay(over: Partial<MlbLiveQuoteBoard>): string {
  return encodeOverlay({
    date: DATE,
    generatedAt: new Date(NOW - 60_000).toISOString(),
    events: 0,
    fetched: 0,
    capped: false,
    live: 0,
    noLive: 0,
    unmatched: 0,
    ttlSec: MLB_LIVE_PROPS.liveRevalidateSec,
    stale: false,
    budgeted: false,
    spentToday: 0,
    oddsMissing: false,
    pricedAt: {},
    emptyAt: {},
    rows: {},
    quota: null,
    ...over,
  });
}

/** a quote as a previous pull would have stored it — the thing the carry paths must hand back */
const CARRIED_QUOTE = {
  gkey: G_NYY,
  lkey: JUDGE_HRR,
  ln: 3.5,
  czAm: -145,
  oppAm: 115,
  bsAm: -140,
  bsBk: "FD",
  books: 3,
  fO: 0.56,
  pLive: 0.56,
  pSrc: "market" as const,
  evCz: -5.39,
  at: new Date(NOW - 300_000).toISOString(),
};

/* ------------------------------------------------------------------ the fakes */

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
        /* NX is HONOURED (fix pass, 2026-09-11) — the fake used to ignore it and always answer
           "OK", which would have made the new one-pass-per-slot stamp and the spend lease
           untestable: both are `SET ... NX` and both decide whether this pass may spend. */
        if (rest.includes("NX") && kv.has(key)) return null;
        kv.set(key, String(rest[0]));
        const ex = rest.indexOf("EX");
        if (ex >= 0) ttl.set(key, Number(rest[ex + 1]));
        return "OK";
      }
      case "DEL":
        return kv.delete(key) ? 1 : 0;
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
  const writes = () => calls.filter((c) => c[0] === "SET" || c[0] === "INCRBY");
  return { kv, ttl, calls, writes, ops: (op: string) => calls.filter((c) => c[0] === op) };
}

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });

/** what the upstream should do this test — swapped per case, never a network call */
type Plan = {
  boxes: Record<number, unknown>;
  events: unknown;
  eventsStatus: number;
  perEvent: Record<string, number>; // eventId -> HTTP status
  used: number;
};
let plan: Plan;

/** two events 20 min apart are indistinguishable; pushing game 2 out three hours makes them not */
function widenedEventsList() {
  return ODDS.eventsList.map((e) => (e.id === E5 ? { ...e, commence_time: "2026-07-11T03:15:00Z" } : e));
}

function install() {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith(`${STATSAPI}/schedule`)) return json(SCHED);
    const box = url.match(/\/game\/(\d+)\/boxscore$/);
    if (box) {
      const b = plan.boxes[Number(box[1])];
      return b ? json(b) : new Response("no", { status: 404 });
    }
    if (url.startsWith("https://api.the-odds-api.com/v4/sports/baseball_mlb/events?")) {
      if (plan.eventsStatus !== 200) return new Response("no", { status: plan.eventsStatus });
      plan.used += 1;
      return json(plan.events, { "x-requests-used": String(plan.used), "x-requests-remaining": String(20000 - plan.used) });
    }
    const ev = url.match(/\/events\/([a-z0-9]+)\/odds\?/);
    if (ev) {
      const id = ev[1];
      const status = plan.perEvent[id] ?? 200;
      plan.used += 4;
      const headers = { "x-requests-used": String(plan.used), "x-requests-remaining": String(20000 - plan.used) };
      if (status !== 200) return new Response("no", { status, headers });
      return json(ODDS.byEvent[id], headers);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

const upstream = () => fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("api.the-odds-api.com"));
const eventPulls = () => upstream().filter((u) => /\/events\/[a-z0-9]+\/odds\?/.test(u));
const idsPulled = () => eventPulls().map((u) => (u.match(/\/events\/([a-z0-9]+)\/odds\?/) as RegExpMatchArray)[1]);

const url = (qs = "") => new NextRequest(`http://localhost/api/mlb/live-props?date=${DATE}${qs}`);
const body = async (res: Response) => (await res.json()) as MlbLiveQuoteBoard;
/** the route, end to end */
const call = async (qs = "") => body(await GET(url(qs)));
/** the body with a sim socket filled — the only way to exercise the "drifted" rung and pSrc "sim" */
const callWith = async (legPOf: Parameters<typeof mlbLivePropsGet>[1]["legPOf"], qs = "") =>
  body(await mlbLivePropsGet(url(qs), { storeKeys: MLB_LIVE_REDIS, legPOf }));

/** a sim that says Yelich is now a near-lock — 0.95 against a stored 61% is a 0.34 drift */
const yelichDrift = (gkey: string) => (gkey === G_MIL ? { [YELICH_H]: 0.95 } : {});

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.mocked(redis).mockReset();
  vi.mocked(storeEnv).mockReset();
  vi.mocked(cronHeaderAuthed).mockReset().mockReturnValue(true);
  vi.mocked(syncAuthed).mockReset().mockReturnValue(false);
  vi.stubEnv("ODDS_API_KEY", KEY);
  vi.mocked(storeEnv).mockReturnValue({ url: "https://store.test", token: "t" } as never);
  plan = { boxes: BOX_CLEARED, events: ODDS.eventsList, eventsStatus: 200, perEvent: {}, used: 1000 };
  install();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/* ================================================================== the fixtures */

describe("the fixtures are synthesized, not captured", () => {
  it("both say so in a _note", () => {
    expect(String(ODDS._note)).toMatch(/SYNTHETIC/);
    expect(String(ODDS._note)).toMatch(/The Odds API was NOT called/i);
    expect(String(SCHED._note)).toMatch(/SYNTHETIC/);
    expect(String(SCHED._note)).toMatch(/no paid feed was called/i);
  });
});

/* ================================================================== the free rails */

describe("the rails that cost nothing", () => {
  it("401s an unauthenticated caller before anything is read", async () => {
    vi.mocked(cronHeaderAuthed).mockReturnValue(false);
    vi.mocked(syncAuthed).mockReturnValue(false);
    const res = await GET(url());
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("NO REDIS MEANS NO SPEND: not one fetch call, and the board says why", async () => {
    vi.mocked(storeEnv).mockReturnValue(undefined as never);
    const b = await call();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(b.budgeted).toBe(true);
    expect(b.spentToday).toBeNull();
    expect(b.note).toMatch(/no spend tally available/);
    expect(b.rows).toEqual({});
  });

  it("no game under way: the free statsapi read happens, the paid one does not", async () => {
    fakeRedis({ [BOARD_KEY(DATE)]: storedBoard([G_BOS, G_LAD]) });
    const b = await call();
    expect(upstream()).toEqual([]);
    expect(b.live).toBe(0);
    expect(b.note).toMatch(/no MLB game is under way/);
  });

  it("a live game inside its re-price window with nothing cleared buys NOTHING — not even the event list", async () => {
    plan.boxes = BOX_QUIET;
    const recent = new Date(NOW - 60_000).toISOString();
    fakeRedis({
      [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES),
      [mlbLiveBoardKey(DATE)]: overlay({ pricedAt: { [G_NYY]: recent, [G_MIL]: recent, [G_MIA]: recent, [G_CHC]: recent } }),
    });
    const b = await call();
    expect(upstream()).toEqual([]); // THE PRE-GATE: the verdict is free, so the event list is never bought
    expect(b.live).toBe(4);
    expect(b.fetched).toBe(0);
    expect(b.note).toMatch(/nothing worth a credit/);
  });

  it("an exhausted day returns the stored quotes, stale, and names the 600-credit rail", async () => {
    fakeRedis({
      [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES),
      [mlbLiveSpendKey(PT)]: "600",
      [mlbLiveBoardKey(DATE)]: overlay({ rows: { [liveQuoteKey(G_NYY, JUDGE_HRR)]: CARRIED_QUOTE } }),
    });
    const b = await call();
    expect(upstream()).toEqual([]);
    expect(b.budgeted).toBe(true);
    expect(b.stale).toBe(true);
    expect(b.spentToday).toBe(600);
    expect(b.note).toMatch(/600 credits is used up/);
    expect(b.rows[liveQuoteKey(G_NYY, JUDGE_HRR)]?.ln).toBe(3.5);
  });

  it("a 429 cooldown suspends the day, and lets Josh's own manual refresh through exactly once", async () => {
    const r = fakeRedis({ [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES), [mlbLiveCooldownKey(PT)]: "1" });
    const auto = await call();
    expect(upstream()).toEqual([]);
    expect(auto.stale).toBe(true);
    expect(auto.note).toMatch(/suspended for the rest of the Pacific day/);

    const manual = await call("&manual=1");
    expect(eventPulls().length).toBeGreaterThan(0); // the one override spends
    expect(r.kv.get(mlbLiveCooldownKey(PT))).toBe("manual-used");
    expect(manual.fetched).toBeGreaterThan(0);

    fetchMock.mockClear();
    const second = await call("&manual=1");
    expect(upstream()).toEqual([]);
    expect(second.note).toMatch(/manual override is already used/);
  });

  it("a final game and a game still to come are never priced", async () => {
    fakeRedis({ [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES) });
    const b = await call();
    expect(b.live).toBe(4); // 823901/2/3 and game 1 of the doubleheader — not the final, not the 02:10Z start
    for (const id of idsPulled()) expect([E1, E2, E3, E4, E5]).toContain(id);
    expect(Object.values(b.rows).some((q) => q.gkey === G_BOS || q.gkey === G_LAD)).toBe(false);
  });
});

/* ================================================================== the pull */

describe("the pull", () => {
  it("asks for the six core markets at regions=us, with no alternate ladder and the key threaded", async () => {
    fakeRedis({ [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES) });
    await call();
    const first = eventPulls()[0];
    expect(first).toBe(mlbLiveEventUrl(E1, KEY));
    expect(first).toContain(`markets=${MLB_LIVE_MARKETS}`);
    expect(first).toContain("regions=us");
    expect(first).toContain("oddsFormat=american");
    expect(first).not.toContain("_alternate");
    expect(MLB_LIVE_MARKETS.split(",")).toHaveLength(6);
    for (const u of upstream()) expect(u.startsWith("https://api.the-odds-api.com/")).toBe(true);
  });

  it("spends in the order cleared -> drifted -> unpriced", async () => {
    fakeRedis({ [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES) });
    const b = await callWith(yelichDrift);
    // NYY cleared (Judge is past 0.5 H+R+RBI), MIL drifted (the sim moved 0.34), MIA merely unpriced
    expect(idsPulled()).toEqual([E1, E2, E3]);
    expect(b.unmatched).toBe(1); // the doubleheader pair, 20 min apart — refused, never guessed
  });

  it("re-anchors Josh's exact case: over 0.5 H+R+RBI becomes the live 3.5 at Caesars -145", async () => {
    fakeRedis({ [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES) });
    const b = await call();
    const q = b.rows[liveQuoteKey(G_NYY, JUDGE_HRR)];
    expect(q).toBeTruthy();
    expect(q.ln).toBe(3.5); // NOT the stored 0.5 — the whole point of the build
    expect(q.czAm).toBe(-145);
    expect(q.oppAm).toBe(115);
    expect(q.bsAm).toBe(-140);
    expect(q.bsBk).toBe("FD");
    expect(q.books).toBe(3);
    expect(q.pSrc).toBe("market"); // no sim context here, and the pregame 78% is NEVER reused
    expect(q.fO).toBeCloseTo(0.5599, 3); // the median of the three de-vigged book fairs
    expect(q.pLive).toBeCloseTo(0.5599, 3);
    expect(q.evCz).toBeCloseTo(-5.39, 2); // a market fair against the market's own price: no edge
  });

  it("breaks a 2-2 modal tie to the Caesars point", async () => {
    fakeRedis({ [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES) });
    const b = await call();
    // Soto: Caesars 2.5, DK 1.5, FD 1.5, Fanatics 2.5 — tied, so the book Josh settles at wins
    const q = b.rows[liveQuoteKey(G_NYY, SOTO_HRR)];
    expect(q.ln).toBe(2.5);
    expect(q.czAm).toBe(128);
    expect(q.books).toBe(2);
  });

  it("drops a line only one book is posting, and a market the books have taken down", async () => {
    fakeRedis({ [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES) });
    const b = await call();
    expect(MLB_LIVE_PROPS.minBooks).toBe(2);
    expect(b.rows[liveQuoteKey(G_NYY, GARCIA_H)]).toBeUndefined(); // fanatics alone is not a market
    expect(b.rows[liveQuoteKey(G_NYY, WEATHERS_OUTS)]).toBeUndefined(); // pitcher_outs: no in-play market
    expect(b.rows[liveQuoteKey(G_NYY, WEATHERS_K)]?.ln).toBe(4.5);
  });

  it("prices a game with no Caesars quote, and refuses to invent an EV for it", async () => {
    fakeRedis({ [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES) });
    const b = await call();
    const q = b.rows[liveQuoteKey(G_MIL, YELICH_H)];
    expect(q.books).toBe(2);
    expect(q.czAm).toBeNull(); // no settle-book price
    expect(q.oppAm).toBeNull();
    expect(q.evCz).toBeNull(); // ...so no EV, rather than an EV against a price Josh cannot bet
    expect(q.bsBk).toBe("FD");
    expect(q.bsAm).toBe(-132);
    expect(q.fO).toBeCloseTo(0.5412, 3);
  });

  it("labels a quote 'sim' only when a sim actually supplied the number", async () => {
    fakeRedis({ [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES) });
    const b = await callWith(yelichDrift);
    expect(b.rows[liveQuoteKey(G_MIL, YELICH_H)].pSrc).toBe("sim");
    expect(b.rows[liveQuoteKey(G_MIL, YELICH_H)].pLive).toBe(0.95);
    expect(b.rows[liveQuoteKey(G_MIL, SKENES_K)].pSrc).toBe("market"); // no sim for this leg
  });

  it("THE EMPTY-EVENT RULE: a live game posting no in-play market is counted, then held", async () => {
    const r = fakeRedis({ [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES) });
    const first = await call();
    expect(idsPulled()).toContain(E3);
    expect(first.noLive).toBe(1);
    expect(first.emptyAt[G_MIA]).toBe(new Date(NOW).toISOString());
    expect(first.rows[liveQuoteKey(G_MIA, ACUNA_H)]).toBeUndefined();

    // the overlay the route just wrote is the input to the next poll: MIA is held, the others are not
    expect(r.kv.get(mlbLiveBoardKey(DATE))).toBeTruthy();
    fetchMock.mockClear();
    const second = await call();
    expect(idsPulled()).not.toContain(E3);
    expect(MLB_LIVE_PROPS.emptyHoldSec).toBe(7200);
    expect(second.noLive).toBe(0);
  });

  it("a quote never outlives its game", async () => {
    fakeRedis({
      [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES),
      // a stored quote on the FINAL game — it must not be handed back, at any age
      [mlbLiveBoardKey(DATE)]: overlay({ rows: { [liveQuoteKey(G_BOS, "rafaeldevers|batter_hits|0.5")]: { ...CARRIED_QUOTE, gkey: G_BOS } } }),
    });
    const b = await call();
    expect(b.rows[liveQuoteKey(G_BOS, "rafaeldevers|batter_hits|0.5")]).toBeUndefined();
  });
});

/* ================================================================== the credit rails */

describe("the credit rails", () => {
  it("probeEvents caps EVERY pull at 3 while the per-event cost is unmeasured", async () => {
    plan.events = widenedEventsList(); // the doubleheader is now unambiguous, so four games are selectable
    fakeRedis({ [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES) });
    const b = await callWith(yelichDrift);
    expect(MLB_LIVE_PROPS.probeEvents).toBe(3);
    expect(eventPulls()).toHaveLength(3);
    expect(idsPulled()).toEqual([E1, E2, E3]);
    expect(b.events).toBe(4);
    expect(b.fetched).toBe(3);
    expect(b.unmatched).toBe(0);
    /* AMENDED (fix pass, 2026-09-11): the cap was `spent === 0`, so it guarded the day's first pull
       and nothing after it — a mistaken second pass could still buy 12 events, which at CFB's
       measured 31 is 372 credits against a 600 rail. It is now gated on MLB_LIVE_PROPS.rateMeasured
       and binds on EVERY pass until a real x-requests-used delta is written into
       docs/credit-budget.md and the flag is deliberately flipped. */
    expect(MLB_LIVE_PROPS.rateMeasured).toBe(false);
    expect(b.note).toMatch(/every pull is capped at 3 events/);
  });

  it("the probe cap holds on a LATER pull too, not just the day's first", async () => {
    plan.events = widenedEventsList();
    // credits already spent today, so the old `spent === 0` gate would have let this pass buy four
    fakeRedis({ [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES), [mlbLiveSpendKey(PT)]: "120" });
    const b = await callWith(yelichDrift);
    expect(eventPulls()).toHaveLength(3);
    expect(b.note).toMatch(/every pull is capped at 3 events/);
  });

  it("mlbAffordableEvents binds against 600 at 6 a game, never CFB's rail", () => {
    expect(MLB_LIVE_PROPS.dailyBudget).toBe(600);
    expect(MLB_LIVE_PROPS.measuredCreditsPerEvent).toBe(6);
    expect(mlbAffordableEvents(10, 560)).toBe(6); // (600 − 560) / 6
    expect(mlbAffordableEvents(10, 588)).toBe(2);
    expect(mlbAffordableEvents(10, 600)).toBe(0);
    expect(mlbAffordableEvents(1, 600)).toBe(0);
  });

  it("buys what the budget still affords and says how many it refused", async () => {
    plan.events = widenedEventsList();
    fakeRedis({ [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES), [mlbLiveSpendKey(PT)]: "588" });
    const b = await callWith(yelichDrift);
    expect(eventPulls()).toHaveLength(2); // (600 − 588) / 6
    expect(b.budgeted).toBe(true);
    expect(b.stale).toBe(true);
    expect(b.note).toMatch(/600 credits bought 2 of 4/);
  });

  it("records the spend from the real header deltas, and only when something was fetched", async () => {
    const r = fakeRedis({ [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES) });
    const b = await call();
    // the fake upstream steps x-requests-used by 4 an event: three pulls -> readings 8 apart
    const readings = [1005, 1009, 1013];
    expect(mlbPullCredits(readings, 3)).toBe(14); // (1013 − 1005) + the first call's own 6
    /* AMENDED (fix pass, 2026-09-11): + Call A. The events list is its own 1-credit call and went
       entirely unbilled — ~100 credits a day at the 15-minute cadence, invisible against a 600
       rail. It is added separately rather than handed to `pullCredits`, which would price it at the
       6-credit per-event rate on top of a delta that already covered it. */
    expect(MLB_LIST_CALL_CREDITS).toBe(1);
    expect(r.kv.get(mlbLiveSpendKey(PT))).toBe(String(14 + MLB_LIST_CALL_CREDITS));
    expect(b.spentToday).toBe(14 + MLB_LIST_CALL_CREDITS);
    expect(r.ops("EXPIRE").some((c) => c[1] === mlbLiveSpendKey(PT))).toBe(true);
  });

  it("charges nothing for a pull that fetched nothing", async () => {
    plan.boxes = BOX_QUIET;
    const recent = new Date(NOW - 60_000).toISOString();
    const r = fakeRedis({
      [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES),
      [mlbLiveBoardKey(DATE)]: overlay({ pricedAt: { [G_NYY]: recent, [G_MIL]: recent, [G_MIA]: recent, [G_CHC]: recent } }),
    });
    await call();
    expect(r.kv.get(mlbLiveSpendKey(PT))).toBeUndefined();
    expect(r.ops("INCRBY")).toEqual([]);
  });

  it("a failed event keeps that game's stored quotes and its OLD pricedAt, and is not billed", async () => {
    const old = new Date(NOW - 3 * 3600_000).toISOString();
    plan.perEvent = { [E1]: 502 };
    const r = fakeRedis({
      [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES),
      [mlbLiveBoardKey(DATE)]: overlay({
        pricedAt: { [G_NYY]: old },
        rows: { [liveQuoteKey(G_NYY, JUDGE_HRR)]: CARRIED_QUOTE },
      }),
    });
    const b = await call();
    expect(idsPulled()).toContain(E1);
    expect(b.fetched).toBe(2); // E1 failed; E2 and E3 landed
    expect(b.pricedAt[G_NYY]).toBe(old); // NOT restamped — the board must not claim a price it lacks
    expect(b.rows[liveQuoteKey(G_NYY, JUDGE_HRR)]?.at).toBe(CARRIED_QUOTE.at);
    expect(b.stale).toBe(true);
    expect(b.note).toMatch(/1 in-play call failed/);
    // two readings, still 4 apart per call, so the spend is the delta plus one event's rate — and
    // Call A, which happened whether or not any per-event call landed
    expect(Number(r.kv.get(mlbLiveSpendKey(PT)))).toBe(mlbPullCredits([1009, 1013], 2) + MLB_LIST_CALL_CREDITS);
  });

  it("a pull where every per-event call failed still bills Call A, and nothing more", async () => {
    plan.perEvent = { [E1]: 502, [E2]: 502, [E3]: 502 };
    const r = fakeRedis({
      [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES),
      [mlbLiveBoardKey(DATE)]: overlay({ rows: { [liveQuoteKey(G_NYY, JUDGE_HRR)]: CARRIED_QUOTE } }),
    });
    const b = await call();
    expect(eventPulls()).toHaveLength(3); // the gate DID select them — this is not the free path
    expect(b.fetched).toBe(0);
    /* AMENDED (fix pass, 2026-09-11). This used to assert an untouched spend key, which was only
       true because Call A went unbilled: the pass DID reach the upstream and DID buy the events
       list, so "no spend row at all" was a claim about money that had already left. It now records
       exactly the list call and not one credit of per-event rate, because no event was fetched. */
    expect(mlbPullCredits([], 0)).toBe(0);
    expect(r.kv.get(mlbLiveSpendKey(PT))).toBe(String(MLB_LIST_CALL_CREDITS));
    expect(b.spentToday).toBe(MLB_LIST_CALL_CREDITS);
    expect(b.stale).toBe(true);
    expect(b.note).toMatch(/3 in-play calls failed/);
    expect(b.rows[liveQuoteKey(G_NYY, JUDGE_HRR)]?.ln).toBe(3.5); // every game kept its last prices
  });

  it("says so when the credits were spent but the overlay could not be stored", async () => {
    const r = fakeRedis({ [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES) });
    const real = vi.mocked(redis).getMockImplementation() as (cmd: unknown[]) => Promise<unknown>;
    vi.mocked(redis).mockImplementation(async (cmd: unknown[]) => {
      if (cmd[0] === "SET" && cmd[1] === mlbLiveBoardKey(DATE)) throw new Error("upstash down");
      return real(cmd);
    });
    const b = await call();
    expect(b.fetched).toBe(3);
    expect(b.storeWriteFailed).toBe(true); // NEVER swallowed: the money left, the overlay did not land
    expect(Number(r.kv.get(mlbLiveSpendKey(PT)))).toBeGreaterThan(0); // ...and the spend is still billed
  });

  it("a 429 mid-pull arms the cooldown key, and the next call fetches nothing", async () => {
    plan.perEvent = { [E2]: 429 };
    const r = fakeRedis({ [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES) });
    const b = await call();
    expect(b.note).toMatch(/429/);
    expect(r.kv.get(mlbLiveCooldownKey(PT))).toBe("1");
    expect(mlbLiveCooldownKey(PT)).toBe(`pl:mlb:liveprops:429:${PT}`);
    expect(r.ttl.get(mlbLiveCooldownKey(PT))).toBeGreaterThan(0);

    fetchMock.mockClear();
    const next = await call();
    expect(upstream()).toEqual([]);
    expect(next.stale).toBe(true);
  });

  it("an event list that fails costs the day nothing more and hands back what it has", async () => {
    plan.eventsStatus = 500;
    const r = fakeRedis({
      [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES),
      [mlbLiveBoardKey(DATE)]: overlay({ rows: { [liveQuoteKey(G_NYY, JUDGE_HRR)]: CARRIED_QUOTE } }),
    });
    const b = await call();
    expect(eventPulls()).toEqual([]);
    expect(b.oddsMissing).toBe(true);
    expect(b.stale).toBe(true);
    expect(b.rows[liveQuoteKey(G_NYY, JUDGE_HRR)]?.ln).toBe(3.5);
    expect(r.ops("INCRBY")).toEqual([]);
  });
});

/* ================================================================== the doubleheader */

describe("the doubleheader bridge", () => {
  const start = Date.parse("2026-07-11T00:15:00Z");
  it("refuses two events it cannot tell apart, rather than pricing the wrong game", () => {
    const b = bridgeEvent(ODDS.eventsList as never, G_CHC, start);
    expect(b.id).toBeNull();
    expect(b.ambiguous).toBe(true);
    expect(DH_AMBIGUITY_MS).toBe(30 * 60_000);
    expect(Date.parse("2026-07-11T00:35:00Z") - start).toBeLessThan(DH_AMBIGUITY_MS);
  });

  it("takes the nearer commence_time once the two are distinguishable", () => {
    const b = bridgeEvent(widenedEventsList() as never, G_CHC, start);
    expect(b.ambiguous).toBe(false);
    expect(b.id).toBe(E4);
    expect(bridgeEvent(widenedEventsList() as never, G_CHC, Date.parse("2026-07-11T03:10:00Z")).id).toBe(E5);
  });

  it("a matchup with no event at all is unmatched, not mispriced", () => {
    expect(bridgeEvent(ODDS.eventsList as never, "seattlemariners@texasrangers", start)).toEqual({ id: null, ambiguous: false });
  });
});

/* ================================================================== sightLiveQuote */

describe("sightLiveQuote", () => {
  const ev = () => ODDS.byEvent[E1] as never;
  const cfg = { minBooks: MLB_LIVE_PROPS.minBooks, settleBook: MLB_LIVE_PROPS.settleBook };

  it("reads the line the market has MOVED to, not the one that was stored", () => {
    const s = sightLiveQuote(ev(), "aaronjudge", "batter_hits_runs_rbis", cfg);
    expect(s?.ln).toBe(3.5);
    expect(s?.books).toBe(3);
  });

  it("returns null for a market the event does not carry", () => {
    expect(sightLiveQuote(ev(), "ryanweathers", "pitcher_outs", cfg)).toBeNull();
  });

  it("returns null below minBooks, and the same quote once the bar is one book", () => {
    expect(sightLiveQuote(ev(), "luisgarciajr", "batter_hits", cfg)).toBeNull();
    const solo = sightLiveQuote(ev(), "luisgarciajr", "batter_hits", { ...cfg, minBooks: 1 });
    expect(solo?.books).toBe(1);
    expect(solo?.czAm).toBeNull();
  });

  it("settles on Caesars: the settle book decides the tie and owns czAm", () => {
    expect(MLB_LIVE_PROPS.settleBook).toBe("williamhill_us");
    const s = sightLiveQuote(ev(), "juansoto", "batter_hits_runs_rbis", cfg);
    expect(s?.ln).toBe(2.5);
    expect(s?.czAm).toBe(128);
    expect(s?.oppAm).toBe(-158);
    // with a different settle book the tie breaks elsewhere — the rule is the book, not the number
    const dkSettles = sightLiveQuote(ev(), "juansoto", "batter_hits_runs_rbis", { ...cfg, settleBook: "draftkings" });
    expect(dkSettles?.ln).toBe(1.5);
    expect(dkSettles?.czAm).toBe(-138);
  });

  it("returns null for a player the event never mentions", () => {
    expect(sightLiveQuote(ev(), "shoheiohtani", "batter_hits", cfg)).toBeNull();
  });
});

/* ================================================================== isolation + source */

describe("isolation", () => {
  it("writes to this desk's keys and to no other desk's", async () => {
    const r = fakeRedis({ [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES) });
    await call();
    const written = r.writes().map((c) => String(c[1]));
    expect(written.length).toBeGreaterThan(0);
    for (const k of written) {
      expect(k.startsWith("pl:mlb:liveprops:")).toBe(true);
      for (const other of ["pl:board:", "pl:picks:", "pl:ledger:", "pl:clv:", "pl:cfb:", "pl:nfl:"]) {
        expect(k.startsWith(other)).toBe(false);
      }
    }
    // the stamped board is READ and never written — a live line must not re-grade a placed bet
    expect(r.ops("GET").some((c) => c[1] === BOARD_KEY(DATE))).toBe(true);
    expect(written.some((k) => k === BOARD_KEY(DATE))).toBe(false);
  });

  it("the keys are this desk's literals, in the route and in the rules", () => {
    expect(MLB_LIVE_REDIS.board).toBe("pl:mlb:liveprops:v1:");
    expect(MLB_LIVE_REDIS.spend).toBe("pl:mlb:liveprops:spend:v1:");
    expect(MLB_LIVE_REDIS.cooldown).toBe("pl:mlb:liveprops:429:");
    const route = readSrc("app/api/mlb/live-props/route.ts");
    for (const v of Object.values(MLB_LIVE_REDIS)) expect(route).toContain(v);
    expect(route).not.toMatch(/pl:(cfb|nfl|board|picks|ledger|clv):/);
  });
});

describe("the source", () => {
  const quote = () => readSrc("src/lib/server/mlb-live-quote.ts");
  const route = () => readSrc("app/api/mlb/live-props/route.ts");

  it("goes to the upstream directly and never through the 4-minute cache at /api/odds", () => {
    expect(quote()).not.toMatch(/\/api\/odds/);
    expect(route()).not.toMatch(/\/api\/odds/);
    expect(quote()).toMatch(/cache: "no-store"/);
  });

  it("never logs, and never carries a literal key", () => {
    for (const src of [quote(), route()]) {
      expect(src).not.toMatch(/console\./);
      expect(src).not.toMatch(/apiKey=[A-Za-z0-9]/);
    }
  });

  it("is authenticated and force-dynamic, with room for twelve events", () => {
    const src = route();
    expect(src).toMatch(/export const dynamic = "force-dynamic"/);
    expect(src).toMatch(/export const maxDuration = 60/);
    expect(src).toMatch(/cronHeaderAuthed\(req\)/);
    expect(src).toMatch(/syncAuthed\(req\)/);
    expect(src).toMatch(/status: 401/);
  });

  /**
   * THE PLANT. A scan that cannot fail is not a guard, so the budget-rail checker is pointed at a
   * copy of the source with the rail cut out and must come back false.
   */
  it("the budget-rail checker actually notices when the rail is gone", () => {
    /* `spent` became `spentNow` at the second rail (fix pass, 2026-09-11): the tally is RE-READ
       inside the Redis lease, immediately before the per-event buy is sized against it, because the
       first read happened before two network round trips and two overlapping passes could both
       size a full budget against the same stale number. */
    const hasBudgetRail = (src: string) => /mlbAffordableEvents\(1, spent\) === 0/.test(src) && /mlbAffordableEvents\(sel\.events\.length, spentNow\)/.test(src);
    const src = quote();
    expect(hasBudgetRail(src)).toBe(true);
    expect(src).toMatch(/const spentNow = await quiet\(store\.readSpend\(ptDate\), spent\)/);
    const cut = src.replace(/mlbAffordableEvents\(1, spent\) === 0/, "false");
    expect(hasBudgetRail(cut)).toBe(false);
    const bothCut = cut.replace(/mlbAffordableEvents\(sel\.events\.length, spentNow\)/, "sel.events.length");
    expect(hasBudgetRail(bothCut)).toBe(false);
  });
});

/* ============================================ the fix pass (2026-09-11) — the rails that were missing */

describe("INSTRUCTION 51 fix pass — the Under gets its OWN number", () => {
  it("evOpp is the Caesars UNDER at the live line, priced against 1 - pLive", async () => {
    fakeRedis({ [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES) });
    const b = await call();
    const q = b.rows[liveQuoteKey(G_NYY, JUDGE_HRR)];
    /* THE DEFECT THIS CLOSES: the overlay is keyed `gkey|lkey` and an lkey is
       `player|market|line` — it carries NO SIDE. So an Over row and an Under row on the same
       player/market/line read the SAME quote, and every field on it is the OVER's. A UI reading
       `evCz` on an Under row showed the opposite bet's edge with the sign kept: a losing Under
       printed as a green live bet. The Under's own EV is computed here, once, by the route. */
    expect(q.oppAm).toBe(115);
    expect(q.evOpp).not.toBeNull();
    // the UNDER at +115 against 1 - 0.5599: (0.4401 x 2.15 - 1) x 100
    expect(q.evOpp).toBeCloseTo((1 - q.pLive) * (1 + 115 / 100) * 100 - 100, 1);
    /* This fixture's pair is very nearly fair, so the two sides round to almost the same figure —
       which is exactly why the defect was invisible by inspection. The discriminator is that the
       Under is priced off `oppAm` and `1 - pLive`, never off the Over's price: a 2-2 modal tie row
       with a plus-money Over shows the gap plainly. */
    const soto = b.rows[liveQuoteKey(G_NYY, SOTO_HRR)];
    expect(soto.czAm).toBe(128);
    expect(soto.evCz).not.toBe(soto.evOpp);
    expect(soto.evOpp).toBeCloseTo((1 - soto.pLive) * (1 + (soto.oppAm < 0 ? 100 / -soto.oppAm : soto.oppAm / 100)) * 100 - 100, 1);
  });

  it("no Caesars UNDER price means no Under EV — nothing is derived from the Over", async () => {
    fakeRedis({ [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES) });
    const b = await call();
    const q = b.rows[liveQuoteKey(G_MIL, YELICH_H)];
    expect(q.czAm).toBeNull();
    expect(q.evCz).toBeNull();
    expect(q.evOpp).toBeNull();
  });
});

describe("INSTRUCTION 51 fix pass — a re-pulled game's carried quotes do not survive the pull", () => {
  it("a line the books have taken down is GONE, not carried under this pull's fresh stamp", async () => {
    /* THE DEFECT: the route wrote `pricedAt[gkey] = now` for every successful event and left the
       carried rows for that game in place, so a leg whose in-play market had been withdrawn kept
       its old quote while the game's stamp said "just pulled" — and the Board labelled the age off
       that stamp. A stale price printed as a live one, which is the single thing the render-time
       cap exists to prevent. Weathers' pitcher_outs is exactly that leg: the fixture's event posts
       no pitcher_outs market at all. */
    const stale = { ...CARRIED_QUOTE, lkey: WEATHERS_OUTS, ln: 17.5, at: new Date(NOW - 25 * 60_000).toISOString() };
    fakeRedis({
      [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES),
      [mlbLiveBoardKey(DATE)]: overlay({ rows: { [liveQuoteKey(G_NYY, WEATHERS_OUTS)]: stale } }),
    });
    const b = await call();
    expect(idsPulled()).toContain(E1);
    expect(b.pricedAt[G_NYY]).toBe(new Date(NOW).toISOString()); // the game WAS re-priced
    expect(b.rows[liveQuoteKey(G_NYY, WEATHERS_OUTS)]).toBeUndefined(); // ...so the dead row is gone
    expect(b.rows[liveQuoteKey(G_NYY, JUDGE_HRR)]?.at).toBe(new Date(NOW).toISOString());
  });

  it("a game whose call FAILED still keeps its carried rows — only a successful pull replaces them", async () => {
    plan.perEvent = { [E1]: 502 };
    fakeRedis({
      [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES),
      [mlbLiveBoardKey(DATE)]: overlay({
        pricedAt: { [G_NYY]: new Date(NOW - 3 * 3600_000).toISOString() },
        rows: { [liveQuoteKey(G_NYY, JUDGE_HRR)]: CARRIED_QUOTE },
      }),
    });
    const b = await call();
    expect(b.rows[liveQuoteKey(G_NYY, JUDGE_HRR)]?.at).toBe(CARRIED_QUOTE.at);
  });
});

describe("INSTRUCTION 51 fix pass — one automatic pass per slot, and one pass at a time", () => {
  it("a slot is stamped on the answer and refused for FREE the second time it fires", async () => {
    const r = fakeRedis({ [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES) });
    const first = await call("&slot=16%3A45");
    expect(first.slot).toBe("16:45");
    expect(first.fetched).toBe(3);
    expect(r.kv.get(mlbLiveSlotKey(PT, "16:45"))).toBeTruthy();

    /* The scheduler ticks every 15 minutes and `decideSlotTick` re-fires the same slot for the
       whole GRADE_SLOT_WINDOW_MIN window; /api/refill and a vercel poke can land on it too. The
       second pass costs nothing and says which slot it was. */
    fetchMock.mockClear();
    const second = await call("&slot=16%3A45");
    expect(eventPulls()).toHaveLength(0);
    expect(second.note).toMatch(/16:45 live pull already ran today/);
  });

  it("Josh's own manual tap is NEVER de-duplicated — it stamps no slot and is never refused as one", async () => {
    const r = fakeRedis({ [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES) });
    const first = await call("&slot=manual&manual=1");
    expect(first.slot).toBe("manual");
    expect(r.kv.get(mlbLiveSlotKey(PT, "manual"))).toBeUndefined(); // no stamp, so nothing to refuse
    const second = await call("&slot=manual&manual=1");
    expect(second.note ?? "").not.toMatch(/already ran today/);
  });

  it("THE LEASE: a pass that cannot take it spends nothing and says a pull is in flight", async () => {
    const r = fakeRedis({ [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES) });
    /* seeded by hand here; in production it is held by the overlapping pass itself. The lease closes
       the window between reading the spend tally and writing it back — two concurrent passes could
       otherwise size a full budget against the same stale number. */
    r.kv.set(`${MLB_LIVE_REDIS.board}lock:${PT}`, "held");
    const b = await call();
    expect(eventPulls()).toHaveLength(0);
    expect(r.kv.get(mlbLiveSpendKey(PT))).toBeUndefined();
    expect(b.note).toMatch(/another live pull is in flight/);
  });

  it("the lease is RELEASED at the end, so a second tap a second later is not refused", async () => {
    const r = fakeRedis({ [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES) });
    await call();
    expect(r.kv.get(`${MLB_LIVE_REDIS.board}lock:${PT}`)).toBeUndefined();
  });
});

describe("INSTRUCTION 51 fix pass — a bridge-empty game is held, and dead stamps are pruned", () => {
  it("a game with no matchable odds event is held on emptyHoldSec, not re-bought every poll", async () => {
    const r = fakeRedis({ [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES) });
    const b = await call();
    /* THE DEFECT: the doubleheader pair is 20 minutes apart, inside DH_AMBIGUITY_MS, so the bridge
       REFUSES it — correctly. But an unmatched game stayed `unpriced` for ever, so it re-qualified
       the whole slate on every poll and re-bought Call A each time with no backoff. */
    expect(b.unmatched).toBe(1);
    expect(b.emptyAt[G_CHC]).toBe(new Date(NOW).toISOString());
    expect(r.kv.get(mlbLiveBoardKey(DATE))).toBeTruthy();
  });

  it("a stamp for a game no longer in play is dropped — the header cannot quote a finished game", async () => {
    fakeRedis({
      [BOARD_KEY(DATE)]: storedBoard(ALL_GAMES),
      [mlbLiveBoardKey(DATE)]: overlay({
        pricedAt: { [G_BOS]: new Date(NOW - 90 * 60_000).toISOString() },
        emptyAt: { [G_BOS]: new Date(NOW - 90 * 60_000).toISOString() },
      }),
    });
    const b = await call();
    expect(b.pricedAt[G_BOS]).toBeUndefined(); // BOS is final in the fixture
    expect(b.emptyAt[G_BOS]).toBeUndefined();
  });
});
