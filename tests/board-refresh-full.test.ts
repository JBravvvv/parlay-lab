import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { stripComments } from "./helpers/source";
import { buildCfbBoard } from "@/lib/cfb/model";
import { CFB_PROPS } from "@/lib/cfb/rules";
import { finalsOf } from "@/lib/cfb/slate-server";
import type { CfbPropRow, CfbPropsBoard } from "@/lib/cfb/props-types";
import type { CfbSlate } from "@/lib/cfb/types";

/**
 * JOSH, 2026-09-19 (verbatim): "The CFB & NFL boards should function the same way as the MLB one does.
 * It should show the time of last board refresh. MLB should also do a FULL refresh every single time
 * i refresh."
 *
 * Three things, each pinned here:
 *   1. FOOTBALL FORCED RE-PULL — `?refresh=1` WITH the sync phrase (header, never URL) skips the props
 *      route's fresh-board rail, re-prices every selected game that has rows with the per-event data
 *      cache bypassed, pulls the slate's game lines fresh, and stores the answer (`refreshed: true`).
 *      Without the phrase the flag is ignored. The budget rails are not lifted. The EMPTY-EVENT RULE
 *      (a zero-row game inside its own window is not re-asked) is the one carry that survives.
 *   2. THE STAMP — the football header prints "updated h:mm" from the newest ACTIVE board of the desk
 *      (the props board's own generatedAt, else the slate's), desktop appended and phone as the sub.
 *   3. MLB FULL REFRESH — every tap ends with a stored server re-price (`live=1&force=1`, outside the
 *      45-minute limiter and the run cap, tallied on its own key) unless the refill's own pass already
 *      did it; the board it stores is adopted on the device before the invalidation.
 *
 * Plus the installed app's self-update (SwRegister ↔ /api/version), after the phone kept showing the
 * pre-deploy page.
 */

vi.mock("@/lib/server/store", () => ({
  redis: vi.fn(),
  storeEnv: vi.fn(),
  /* the real helper compares the header with LEDGER_SYNC_KEY (sha256 + timingSafeEqual); here a
     made-up phrase, never Josh's — the route's contract is "the flag counts only when authed" */
  syncAuthed: vi.fn((req: NextRequest) => req.headers.get("x-pl-sync") === "test-phrase"),
}));
vi.mock("@/lib/cfb/slate-server", async (orig) => {
  const real = await orig<typeof import("@/lib/cfb/slate-server")>();
  return { ...real, espnEventsOf: vi.fn(), slateFromEspnOf: vi.fn() };
});
vi.mock("@/lib/cfb/props-context", async (orig) => {
  const real = await orig<typeof import("@/lib/cfb/props-context")>();
  return { ...real, loadPropsContext: vi.fn(async () => null) };
});

import { redis, storeEnv, syncAuthed } from "@/lib/server/store";
import { espnEventsOf, slateFromEspnOf } from "@/lib/cfb/slate-server";
import { GET } from "../app/api/cfb/props/route";
import { GET as versionGet } from "../app/api/version/route";
import { cfbPropsQueryKey, cfbQueryKey } from "@/lib/cfb/client";
import { boardStampOf, CfbBoardStamp, CFB_PROPS_KEY_PREFIX, CFB_SLATE_KEY_PREFIX } from "@/components/cfb/CfbPicksBoard";
import { NflBoardStamp } from "@/components/nfl/NflPicksBoard";
import { LeagueProvider } from "@/components/football/LeagueContext";
import { CFB_DESK } from "@/lib/cfb/desk";
import { NFL_DESK } from "@/lib/nfl/desk";
import { refillRepricedBoard } from "@/lib/refill-client";

const root = path.join(__dirname, "..");
const readSrc = (p: string) => stripComments(fs.readFileSync(path.join(root, p), "utf8"));

const FIX = path.join(root, "tests", "fixtures", "cfb");
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8"));
const ESPN = readJson("espn-scoreboard-2026-09-05.json") as { events: unknown[] };
const ODDS = readJson("odds-ncaaf-2026-09-05.json") as unknown[];
const FPI = readJson("espn-fpi.json") as unknown;
const EVENT = readJson("odds-ncaaf-event-props.synthetic.json") as Record<string, unknown>;
const NOW = Date.parse("2026-09-05T12:00:00Z");
const DATE = "2026-09-05";
const BOARD_KEY = `pl:cfb:props:v1:${DATE}`;

function slate(): CfbSlate {
  const board = buildCfbBoard({ date: DATE, espnEvents: ESPN.events, oddsEvents: ODDS, fpi: FPI, now: NOW, bankroll: 2500 });
  return { ...board, finals: finalsOf(board.games), quota: { remaining: 9000, used: 1000 }, oddsMissing: false };
}
const pricedGames = () => slate().games.filter((g) => !!g.oddsEventId);
/** a stored board, priced a minute ago (fresh for its whole 2 h window), with one row per game unless excluded */
function storedBoard(opts: { noRowsFor?: string[] } = {}): CfbPropsBoard {
  const games = pricedGames();
  const skip = new Set(opts.noRowsFor ?? []);
  const rows = games
    .filter((g) => !skip.has(g.id))
    .map((g) => ({ id: `${g.id}|player_pass_yds|qb|over|250.5`, gameId: g.id, market: "player_pass_yds", cz: -110 }) as unknown as CfbPropRow);
  const at = new Date(NOW - 60_000).toISOString();
  return {
    date: DATE,
    events: games.length,
    fetched: games.length,
    capped: false,
    rows,
    quota: { remaining: 8000, used: 2000 },
    oddsMissing: false,
    generatedAt: at,
    priced: games.map((g) => g.id),
    pricedAt: Object.fromEntries(games.map((g) => [g.id, at])),
  };
}

function fakeRedis(seed: Record<string, string> = {}) {
  const kv = new Map(Object.entries(seed));
  const calls: unknown[][] = [];
  vi.mocked(redis).mockImplementation(async (cmd: unknown[]) => {
    calls.push(cmd);
    const [op, key, ...rest] = cmd as [string, string, ...unknown[]];
    switch (op) {
      case "GET":
        return kv.get(key) ?? null;
      case "MGET":
        return [key, ...rest].map((k) => kv.get(String(k)) ?? null);
      case "SET":
        kv.set(key, String(rest[0]));
        return "OK";
      case "INCRBY": {
        const n = Number(kv.get(key) ?? 0) + Number(rest[0]);
        kv.set(key, String(n));
        return n;
      }
      case "EXPIRE":
        return 1;
      default:
        throw new Error(`fake redis: ${op}`);
    }
  });
  return { kv, calls, sets: () => calls.filter((c) => c[0] === "SET" && c[1] === BOARD_KEY) };
}

function eventResponse(): Response {
  return new Response(JSON.stringify(EVENT), { status: 200, headers: { "content-type": "application/json", "x-requests-used": "100", "x-requests-remaining": "19900" } });
}

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
const call = async (qs: string, headers?: Record<string, string>) => {
  const res = await GET(new NextRequest(`http://localhost/api/cfb/props?date=${DATE}${qs}`, { headers }));
  return { status: res.status, body: (await res.json()) as CfbPropsBoard };
};
const fetchedUrls = () => fetchMock.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset().mockImplementation(async () => eventResponse());
  vi.mocked(redis).mockReset();
  vi.mocked(storeEnv).mockReset().mockReturnValue({ url: "https://store.test", token: "t" });
  vi.mocked(syncAuthed).mockClear();
  vi.mocked(espnEventsOf).mockReset().mockResolvedValue(ESPN.events);
  vi.mocked(slateFromEspnOf).mockReset().mockResolvedValue(slate());
  vi.stubEnv("ODDS_API_KEY", "test-key-never-logged");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("1. the football props route — ?refresh=1 is a FULL re-pull, with the sync phrase only", () => {
  it("a fresh stored board is served from redis with no refresh flag — nothing spent (the rail of before)", async () => {
    fakeRedis({ [BOARD_KEY]: JSON.stringify(storedBoard()) });
    const { body } = await call("");
    expect(body.source).toBe("redis");
    expect(body.refreshed).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.mocked(slateFromEspnOf).mock.calls[0][5]).toEqual({ fresh: false });
  });

  it("?refresh=1 WITHOUT the sync phrase is ignored — served from redis, nothing spent, syncAuthed consulted", async () => {
    fakeRedis({ [BOARD_KEY]: JSON.stringify(storedBoard()) });
    const { body } = await call("&refresh=1");
    expect(syncAuthed).toHaveBeenCalledTimes(1);
    expect(body.source).toBe("redis");
    expect(body.refreshed).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.mocked(slateFromEspnOf).mock.calls[0][5]).toEqual({ fresh: false });
  });

  it("?refresh=1 WITH the phrase re-prices every selected game with rows now, cache bypassed, slate pulled fresh, answer stored", async () => {
    const r = fakeRedis({ [BOARD_KEY]: JSON.stringify(storedBoard()) });
    const { status, body } = await call("&refresh=1", { "x-pl-sync": "test-phrase" });
    expect(status).toBe(200);
    expect(body.source).toBe("fetch");
    expect(body.refreshed).toBe(true);
    expect(body.generatedAt).toBe(new Date(NOW).toISOString());
    // the slate's lines were pulled with the odds cache bypassed
    expect(vi.mocked(slateFromEspnOf).mock.calls[0][5]).toEqual({ fresh: true });
    // every selected game was re-asked — one per-event fetch each, all with the data cache bypassed
    expect(body.events).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(body.events);
    for (const c of fetchMock.mock.calls) expect((c[1] as RequestInit | undefined)?.cache).toBe("no-store");
    const first = pricedGames()[0];
    expect(fetchedUrls().some((u) => u.includes(String(first.oddsEventId)))).toBe(true);
    // and the fresh board was written back
    expect(r.sets().length).toBeGreaterThan(0);
    // the key never leaks
    expect(JSON.stringify(body)).not.toContain("test-key-never-logged");
  });

  it("manual refresh retries zero-row games so newly posted sportsbook props are discovered", async () => {
    const first = pricedGames()[0];
    fakeRedis({ [BOARD_KEY]: JSON.stringify(storedBoard({ noRowsFor: [first.id] })) });
    const { body } = await call("&refresh=1", { "x-pl-sync": "test-phrase" });
    expect(body.source).toBe("fetch");
    expect(body.refreshed).toBe(true);
    expect(fetchedUrls().some((u) => u.includes(String(first.oddsEventId)))).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(body.events);
  });

  it("the upgraded plan allows refresh after the former daily budget is spent", async () => {
    fakeRedis({ [BOARD_KEY]: JSON.stringify(storedBoard()), [`pl:cfb:props:spend:v1:${DATE}`]: "100000" });
    const { body } = await call("&refresh=1", { "x-pl-sync": "test-phrase" });
    expect(fetchMock).toHaveBeenCalledTimes(body.events);
    expect(body.budgeted).toBe(false);
  });

  it("the source: the flag short-circuits on the query BEFORE syncAuthed, the phrase is read from the header, and the rail is gated on it", () => {
    const src = readSrc("src/lib/server/football-props.ts");
    expect(src).toMatch(/const refresh = q\.get\("refresh"\) === "1" && syncAuthed\(req\);/);
    expect(src).toMatch(/if \(!refresh && stored && boardFresh\(stored, now, windowSec\) && czDueIds\.size === 0\) \{/);
    expect(src).toMatch(/slateFromEspnOf\(cfg, date, espn, now, bankroll, \{ fresh: refresh \}\)/);
    expect(src).toMatch(/return refresh \|\| w === "czMissing" \|\| \(w === "live" && storedIds\.has\(g\.id\)\) \? \{ cache: "no-store" \}/);
    expect(src).toMatch(/\.\.\.\(refresh \? \{ refreshed: true \} : \{\}\)/);
    // the verbatim "unpriced" line the live-reserve test pins stays first; the refresh branch follows it
    expect(src).toMatch(/if \(!stored \|\| !storedIds\.has\(g\.id\)\) return "unpriced";\s*if \(refresh\) \{/);
    for (const route of ["app/api/cfb/route.ts", "app/api/nfl/route.ts"]) {
      const s = readSrc(route);
      expect(s, route).toMatch(/const refresh = q\.get\("refresh"\) === "1" && syncAuthed\(req\);/);
      expect(s, route).toMatch(/\{ fresh: refresh \}/);
      expect(s, route).not.toMatch(/\bfetch\(/);
    }
    const ss = readSrc("src/lib/cfb/slate-server.ts");
    expect(ss).toMatch(/opts\?\.fresh \? \{ cache: "no-store" \} : \{ next: \{ revalidate: ODDS_TTL \} \}/);
  });

  it("the clients send the flag only with the phrase stored, and the phrase only in the header — never in a URL", () => {
    for (const p of ["src/lib/cfb/client.ts", "src/lib/football/client.ts"]) {
      const s = readSrc(p);
      expect(s, p).toMatch(/const key = refresh \? getSyncKey\(\) : null;\s*return key \? \{ "x-pl-sync": key \} : undefined;/);
      expect(s, p).toMatch(/const headers = refreshHeaders\(opts\?\.refresh\);\s*if \(headers\) p\.set\("refresh", "1"\);/);
      expect(s, p).not.toMatch(/p\.set\("sync|p\.set\("key|x-pl-sync=|sync=\$\{/);
      expect(s, p).toMatch(/refresh\?: boolean/);
    }
  });
});

describe("2. the header stamp — 'updated h:mm' from the newest ACTIVE board of the desk", () => {
  const bank = CFB_DESK.bankBase;
  const slateKey = cfbQueryKey(DATE, bank);
  const propsKey = cfbPropsQueryKey(DATE, bank);
  const slateData = { games: [{}, {}, {}], generatedAt: NOW - 30_000 } as unknown as CfbSlate;
  const propsData = { rows: [{}, {}], generatedAt: new Date(NOW - 5_000).toISOString(), live: 1 } as unknown as CfbPropsBoard;

  it("reads nothing from an INACTIVE board (a lingering other date never wins), the props stamp when both are on screen, the slate's when only it is", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } } });
    qc.setQueryData(slateKey, slateData);
    qc.setQueryData(propsKey, propsData);
    expect(boardStampOf(qc, CFB_SLATE_KEY_PREFIX, CFB_PROPS_KEY_PREFIX)).toBeNull();
    const unS = new QueryObserver(qc, { queryKey: slateKey, queryFn: async () => slateData }).subscribe(() => {});
    const unP = new QueryObserver(qc, { queryKey: propsKey, queryFn: async () => propsData }).subscribe(() => {});
    expect(boardStampOf(qc, CFB_SLATE_KEY_PREFIX, CFB_PROPS_KEY_PREFIX)).toEqual({ at: NOW - 5_000, feed: "props", games: 3, rows: 2, live: 1 });
    unP();
    expect(boardStampOf(qc, CFB_SLATE_KEY_PREFIX, CFB_PROPS_KEY_PREFIX)).toEqual({ at: NOW - 30_000, feed: "slate", games: 3, rows: 0, live: 0 });
    unS();
    expect(boardStampOf(qc, CFB_SLATE_KEY_PREFIX, CFB_PROPS_KEY_PREFIX)).toBeNull();
  });

  it("the props stamp is the board's OWN generatedAt — a cache-served re-read (an older stamp) does not move it forward", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } } });
    const older = { ...propsData, generatedAt: new Date(NOW - 3_600_000).toISOString() } as CfbPropsBoard;
    qc.setQueryData(propsKey, older);
    const un = new QueryObserver(qc, { queryKey: propsKey, queryFn: async () => older }).subscribe(() => {});
    expect(boardStampOf(qc, CFB_SLATE_KEY_PREFIX, CFB_PROPS_KEY_PREFIX)?.at).toBe(NOW - 3_600_000);
    un();
  });

  it("renders on the server: the phone sub says 'loading the board…' and the desktop span is empty until the cache speaks", () => {
    (globalThis as { React?: typeof React }).React = React;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const render = (el: React.ReactElement) => renderToStaticMarkup(createElement(QueryClientProvider, { client: qc }, el));
    const phone = render(createElement(LeagueProvider, { desk: CFB_DESK }, createElement(CfbBoardStamp, { phone: true })));
    expect(phone).toContain('data-testid="cfb-board-updated"');
    expect(phone).toContain("loading the board…");
    const desk = render(createElement(LeagueProvider, { desk: CFB_DESK }, createElement(CfbBoardStamp)));
    expect(desk).toMatch(/<span data-testid="cfb-board-updated"><\/span>/);
    const nfl = render(createElement(NflBoardStamp, { phone: true }));
    expect(nfl).toContain("loading the board…");
    expect(NFL_DESK.id).toBe("nfl");
  });

  it("the page mounts the stamp in both football headers — desktop appended to the sentence, phone as the whole sub", () => {
    const page = readSrc("app/board/page.tsx");
    expect(page).toMatch(/import \{ CfbBoardStamp, CfbPicksBoard, CfbRefreshPill \} from "@\/components\/cfb\/CfbPicksBoard";/);
    expect(page).toMatch(/import \{ NflBoardStamp, NflPicksBoard, NflRefreshPill \} from "@\/components\/nfl\/NflPicksBoard";/);
    const cfb = page.slice(page.indexOf('if (CFB_ENABLED && desk === "cfb")'), page.indexOf("<CfbPicksBoard />"));
    expect(cfb).toMatch(/The games list is on Games\.\s*<CfbBoardStamp \/>/);
    expect(cfb).toMatch(/subMobile=\{<CfbBoardStamp phone \/>\}/);
    const nfl = page.slice(page.indexOf('if (NFL_ENABLED && desk === "nfl")'), page.indexOf("<NflPicksBoard />"));
    expect(nfl).toMatch(/The games list is on Games\.\s*<NflBoardStamp \/>/);
    expect(nfl).toMatch(/subMobile=\{<NflBoardStamp phone \/>\}/);
    // the stamp prints the MLB header's phone shape
    const board = readSrc("src/components/cfb/CfbPicksBoard.tsx");
    expect(board).toMatch(/\$\{stamp\.games\} games · \$\{stamp\.rows\} prop rows\$\{stamp\.live \? ` · \$\{stamp\.live\} live` : ""\} · updated \$\{time\}/);
    expect(board).toMatch(/toLocaleTimeString\(\[\], \{ hour: "numeric", minute: "2-digit" \}\)/);
    expect(board).toMatch(/type: "active"/);
  });

  it("the football pill: with the phrase every active slate + props query is re-pulled with refresh: true, then the refill; without it the old re-read", () => {
    const board = readSrc("src/components/cfb/CfbPicksBoard.tsx");
    const pill = board.slice(board.indexOf("export function CfbRefreshPill"), board.indexOf("function winsOn"));
    expect(pill).toMatch(/if \(!getSyncKey\(\)\) \{\s*await \(L\.id === "cfb" \? refreshCfbBoard\(qc\) : refreshLeagueBoard\(qc, L\)\);\s*return;\s*\}/);
    expect(pill).toMatch(/const pulled = await forceRefreshLeagueBoard\(qc, L\);\s*const r = await refillDesk\(L\.id\);/);
    expect(pill).toMatch(/board re-pulled \$\{at\}/);
    const force = board.slice(board.indexOf("export async function forceRefreshLeagueBoard"), board.indexOf("export type BoardStamp"));
    expect(force.match(/refresh: true/g)?.length).toBe(2);
    expect(force).toMatch(/L\.client\.loadSlate\(dateOf\(k\), \{ bankroll: bankOf\(k\), refresh: true \}\)/);
    expect(force).toMatch(/L\.client\.loadProps\(dateOf\(k\), \{ bankroll: bankOf\(k\), refresh: true \}\)/);
    expect(force).toMatch(/staleTime: 0/);
  });
});

describe("3. the MLB pill — a FULL stored re-price on every tap", () => {
  it("the client sends live=1&force=1 and adopts the board the pass stored before invalidating", () => {
    const client = readSrc("src/lib/mlb/live-board-client.ts");
    expect(client).toMatch(/fetch\("\/api\/generate\?live=1&force=1", \{ headers: \{ "x-pl-sync": key \}, cache: "no-store" \}\)/);
    expect(client).toMatch(/const fresh = await serverBoard\(\);\s*if \(fresh\) \{\s*adoptServerBoard\(fresh\);\s*qc\.setQueryData\(\["board"\], fresh\);\s*\}/);
    expect(client).toMatch(/import \{ adoptServerBoard, serverBoard, todayStr \} from "@\/lib\/engine-client";/);
    const engine = readSrc("src/lib/engine-client.ts");
    expect(engine).toMatch(/export function adoptServerBoard\(b: Board\): void \{/);
    expect(engine).toMatch(/localStorage\.setItem\(BOARD_KEY, JSON\.stringify\(b\)\);[\s\S]*?syncEngineBoard\(b\);/);
  });

  it("the route: force && boardOnly is outside the run cap, tallied on its own key, never against the card ladder, never setting K_LASTGEN", () => {
    const src = readSrc("app/api/generate/route.ts");
    expect(src).toMatch(/const manualReprice = force && boardOnly;/);
    expect(src).toMatch(/const K_MANUAL = "pl:gen:manual:";/);
    expect(src).toMatch(/const runsUsed = boardOnly && !manualReprice \? Number\(await redis\(\["GET", runsKey\]\)\) \|\| 0 : 0;/);
    expect(src).toMatch(/if \(boardOnly && !manualReprice && runsUsed >= MAX_RUNS_PER_DATE\) \{/);
    expect(src).toMatch(/if \(manualReprice\) \{\s*const manualKey = `\$\{K_MANUAL\}\$\{dateNow\}`;\s*manualRuns = Number\(await redis\(\["INCR", manualKey\]\)\) \|\| 0;/);
    // the scheduled board-only pass is untouched: same cap, same limiter line, same INCR
    expect(src).toMatch(/const MAX_RUNS_PER_DATE = Number\.POSITIVE_INFINITY;/);
    expect(src).toMatch(/if \(!force && !topup && now - lastRun < 45 \* 60_000\) \{/);
    expect(src).toMatch(/const runs = Number\(await redis\(\["INCR", runsKey\]\)\) \|\| 0;/);
    // the forced pass is still board-only: the two pre-existing `if (boardOnly) {` blocks (the lock skip and the
    // reading), none added — the card-region proof in tests/live-board-only.test.ts still finds the lock line
    expect(src.match(/if \(boardOnly\) \{/g)?.length).toBe(2);
    expect(src).not.toMatch(/if \(manualReprice\) \{[\s\S]{0,400}lock/);
    expect(src.match(/\.\.\.\(manualReprice \? \{ forced: true, manualRuns \} : \{\}\)/g)?.length).toBe(2);
  });

  it("refillRepricedBoard is the one early return; the browser re-price is the fallback's fallback", () => {
    const page = readSrc("app/board/page.tsx");
    expect(page).toMatch(/if \(!httpFail && !refused && refillRepricedBoard\(r\.body\)\) return;\s*liveBoard\.mutate\(\);/);
    expect(page).toMatch(/onError: \(\) => liveBoard\.mutate\(\),/);
    expect(page).toMatch(/const liveBoard = useLiveBoardReprice\(\{ onFallback: \(\) => regen\.mutate\(\) \}\);/);
    expect(page).not.toMatch(/ran recently/);
    expect(page).toMatch(/full board re-priced and stored on the server — your locked card was not touched/);
    expect(refillRepricedBoard({ fired: true, generateStatus: 200, generate: { ok: true } })).toBe(true);
    expect(refillRepricedBoard({ fired: false })).toBe(false);
  });
});

describe("the installed app keeps itself on the newest deploy", () => {
  it("/api/version answers the commit sha, never cached", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abc1234");
    const res = await versionGet();
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ sha: "abc1234" });
  });
  it("SwRegister compares the build sha with /api/version on open and on every return to the foreground, reloading once per new build", () => {
    const sw = readSrc("src/components/shell/SwRegister.tsx");
    expect(sw).toMatch(/const BUILD_SHA = process\.env\.NEXT_PUBLIC_BUILD_SHA \?\? "";/);
    expect(sw).toMatch(/fetch\("\/api\/version", \{ cache: "no-store" \}\)/);
    expect(sw).toMatch(/if \(!sha \|\| sha === BUILD_SHA\) return false;/);
    expect(sw).toMatch(/sessionStorage\.getItem\(RELOADED_KEY\) === sha\) return false;/);
    expect(sw).toMatch(/location\.reload\(\);/);
    expect(sw).toMatch(/document\.addEventListener\("visibilitychange", onVisible\);/);
    expect(sw).toMatch(/navigator\.serviceWorker\.register\("\/sw\.js"\)/);
    expect(readSrc("next.config.ts")).toMatch(/env: \{ NEXT_PUBLIC_BUILD_SHA: process\.env\.VERCEL_GIT_COMMIT_SHA \?\? "" \}/);
    const route = readSrc("app/api/version/route.ts");
    expect(route).toMatch(/process\.env\.VERCEL_GIT_COMMIT_SHA \?\? ""/);
    expect(route).not.toMatch(/ODDS_API_KEY|LEDGER_SYNC_KEY|CRON_SECRET/);
  });
});
