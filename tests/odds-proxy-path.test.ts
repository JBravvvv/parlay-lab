import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { GET } from "../app/api/odds/route";
import { PROXY_SPORTS, proxyTargetOf, proxyUpstreamOf } from "../src/lib/server/odds-path";
import { __resetOddsClientForTests } from "../src/lib/server/odds-client";
import { stripComments } from "./helpers/source";

/* AUDIT E2-2 — /api/odds spends the server's Odds API key for callers with no credential. It
   used to send the caller's whole URL upstream after checking only the host and the
   markets x regions shape, and it honoured fresh=1 for anyone when APP_PASSCODE was unset.
   These tests hold the path list, the rebuilt request, and the fresh gate. The provider is a
   stub throughout: nothing here reaches the network. */

const KEY = "test-key-never-logged";
const PHRASE = "test-phrase";
const PASS = "test-pass-1234";
const HOST = "https://api.the-odds-api.com";
const TWO = "bookmakers=draftkings,fanduel";

const LINES = `${HOST}/v4/sports/baseball_mlb/odds?regions=us,eu&markets=h2h,spreads,totals&oddsFormat=american`;
const PROPS = `${HOST}/v4/sports/baseball_mlb/events/abc123def456/odds?regions=us&oddsFormat=american&markets=batter_hits,pitcher_strikeouts`;
const EVENTS = `${HOST}/v4/sports/baseball_mlb/events`;
const SPORTS = `${HOST}/v4/sports/`;

type Call = { url: string; init: unknown };
const calls: Call[] = [];
let upstream: { status: number; body: string; headers: Record<string, string>; fail?: Error } = { status: 200, body: "[]", headers: {} };

const QUOTA = { "x-requests-remaining": "90000", "x-requests-used": "10000", "x-requests-last": "3" };

const ask = (u: string, opts: { fresh?: string; headers?: Record<string, string> } = {}) =>
  GET(new NextRequest(`https://parlay.test/api/odds?u=${encodeURIComponent(u)}${opts.fresh ? `&fresh=${opts.fresh}` : ""}`, { headers: opts.headers ?? {} }));

const CACHED = { next: { revalidate: 240 } };
const UNCACHED = { cache: "no-store" };

beforeEach(() => {
  calls.length = 0;
  upstream = { status: 200, body: "[]", headers: { "content-type": "application/json", ...QUOTA } };
  __resetOddsClientForTests();
  process.env.ODDS_API_KEY = KEY;
  delete process.env.LEDGER_SYNC_KEY;
  delete process.env.APP_PASSCODE;
  vi.stubGlobal("fetch", async (url: unknown, init?: unknown) => {
    calls.push({ url: String(url), init });
    if (upstream.fail) throw upstream.fail;
    return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ODDS_API_KEY;
  delete process.env.LEDGER_SYNC_KEY;
  delete process.env.APP_PASSCODE;
});

describe("E2-2 — which paths the proxy serves (pure)", () => {
  const kind = (path: string) => proxyTargetOf(new URL(HOST + path))?.kind ?? null;

  it("the sports list, with or without the trailing slash", () => {
    expect(kind("/v4/sports")).toBe("sports");
    expect(kind("/v4/sports/")).toBe("sports");
  });

  it.each(PROXY_SPORTS.map((s) => [s]))("%s: events, odds and one event's odds", (sport) => {
    expect(kind(`/v4/sports/${sport}/events`)).toBe("events");
    expect(kind(`/v4/sports/${sport}/odds`)).toBe("odds");
    expect(kind(`/v4/sports/${sport}/events/0123456789abcdef0123456789abcdef/odds`)).toBe("event-odds");
  });

  it("serves exactly four sports", () => {
    expect([...PROXY_SPORTS].sort()).toEqual(["americanfootball_ncaaf", "americanfootball_nfl", "baseball_mlb", "mma_mixed_martial_arts"]);
  });

  it.each([
    ["the historical odds endpoint", "/v4/historical/sports/baseball_mlb/odds"],
    ["the historical events endpoint", "/v4/historical/sports/baseball_mlb/events"],
    ["one historical event's odds", "/v4/historical/sports/baseball_mlb/events/abc/odds"],
    ["scores", "/v4/sports/baseball_mlb/scores"],
    ["participants", "/v4/sports/baseball_mlb/participants"],
    ["an event's market list", "/v4/sports/baseball_mlb/events/abc/markets"],
    ["a sport no caller asks for", "/v4/sports/basketball_nba/odds"],
    ["a sport no caller asks for, events", "/v4/sports/soccer_epl/events"],
    ["a sport in capitals", "/v4/sports/BASEBALL_MLB/odds"],
    ["a sport that only starts like one", "/v4/sports/baseball_mlb_preseason/odds"],
    ["an older API version", "/v3/sports/baseball_mlb/odds"],
    ["a trailing slash on odds", "/v4/sports/baseball_mlb/odds/"],
    ["a trailing segment on odds", "/v4/sports/baseball_mlb/odds/extra"],
    ["a path parameter", "/v4/sports/baseball_mlb/odds;x=1"],
    ["an empty sport", "/v4/sports//odds"],
    ["an empty event id", "/v4/sports/baseball_mlb/events//odds"],
    ["an event id with a dash", "/v4/sports/baseball_mlb/events/a-b/odds"],
    ["an event id with an encoded slash", "/v4/sports/baseball_mlb/events/a%2Fb/odds"],
    ["an event id of 65 characters", `/v4/sports/baseball_mlb/events/${"a".repeat(65)}/odds`],
    ["a prefix before the version", "/x/v4/sports/baseball_mlb/odds"],
    ["a prefix before the sports list", "/x/v4/sports"],
    ["a prefix before the sports list, trailing slash", "/x/v4/sports/"],
    ["a prefix before the events list", "/x/v4/sports/baseball_mlb/events"],
    ["a prefix before an event's odds", "/x/v4/sports/baseball_mlb/events/abc123/odds"],
    ["a trailing segment on an event's odds", "/v4/sports/baseball_mlb/events/abc123/odds/extra"],
    ["a trailing slash on an event's odds", "/v4/sports/baseball_mlb/events/abc123/odds/"],
    ["a trailing slash on the events list", "/v4/sports/baseball_mlb/events/"],
    ["the root", "/"],
    ["a dot segment that climbs out", "/v4/sports/baseball_mlb/../../historical/sports/baseball_mlb/odds"],
    ["an encoded dot segment that climbs out", "/v4/sports/baseball_mlb/%2e%2e/%2e%2e/historical/sports/baseball_mlb/odds"],
  ])("refuses %s", (_n, path) => {
    expect(kind(path)).toBeNull();
  });

  it("an event id of 64 characters is the longest served", () => {
    expect(kind(`/v4/sports/baseball_mlb/events/${"a".repeat(64)}/odds`)).toBe("event-odds");
  });
});

describe("E2-2 — the upstream request is built from recognised parts (pure)", () => {
  const build = (u: string, key = "k") => {
    const url = new URL(u);
    return proxyUpstreamOf(url, proxyTargetOf(url)!, key);
  };

  it("a priced request carries regions, sorted markets, the format and the key, in that order", () => {
    expect(build(`${HOST}/v4/sports/baseball_mlb/odds?oddsFormat=american&markets=totals,h2h,spreads&regions=us,eu`)).toEqual({
      ok: true,
      pathAndQuery: "/v4/sports/baseball_mlb/odds?regions=us,eu&markets=h2h,spreads,totals&oddsFormat=american&apiKey=k",
    });
  });

  it("two orderings of one market set build the same request", () => {
    const a = build(`${HOST}/v4/sports/baseball_mlb/odds?regions=us,eu&markets=h2h,totals,spreads`);
    const b = build(`${HOST}/v4/sports/baseball_mlb/odds?regions=us,eu&markets=spreads,h2h,totals`);
    expect(a).toEqual(b);
  });

  it("a repeated market is sent once", () => {
    expect(build(`${HOST}/v4/sports/baseball_mlb/odds?regions=us&markets=h2h,h2h,%20h2h`)).toEqual({ ok: true, pathAndQuery: "/v4/sports/baseball_mlb/odds?regions=us&markets=h2h&apiKey=k" });
  });

  it("regions keep the caller's order (the shape check compares the list as written)", () => {
    expect(build(`${HOST}/v4/sports/baseball_mlb/odds?regions=us,eu&markets=h2h`)).toMatchObject({ pathAndQuery: expect.stringContaining("regions=us,eu&") });
  });

  it("only the first value of a repeated parameter is read, and it is the only one sent", () => {
    const got = build(`${HOST}/v4/sports/baseball_mlb/odds?regions=us&markets=h2h&markets=player_pass_yds&regions=uk&oddsFormat=american&oddsFormat=decimal`);
    expect(got).toEqual({ ok: true, pathAndQuery: "/v4/sports/baseball_mlb/odds?regions=us&markets=h2h&oddsFormat=american&apiKey=k" });
  });

  it("every other parameter is dropped", () => {
    const got = build(
      `${HOST}/v4/sports/baseball_mlb/odds?regions=us&markets=h2h&date=2026-07-01T00:00:00Z&eventIds=a,b&commenceTimeFrom=2026-07-01T00:00:00Z&commenceTimeTo=2026-07-02T00:00:00Z&includeLinks=true&includeSids=true&includeBetLimits=true&bookmakers=pinnacle&dateFormat=unix&anything=1`,
    );
    expect(got).toEqual({ ok: true, pathAndQuery: "/v4/sports/baseball_mlb/odds?regions=us&markets=h2h&apiKey=k" });
  });

  it("the odds format is sent only when it is one of the two known values", () => {
    const q = (fmt: string) => (build(`${HOST}/v4/sports/baseball_mlb/odds?regions=us&markets=h2h&oddsFormat=${fmt}`) as { pathAndQuery: string }).pathAndQuery;
    expect(q("american")).toContain("&oddsFormat=american&");
    expect(q("decimal")).toContain("&oddsFormat=decimal&");
    expect(q("AMERICAN")).not.toContain("oddsFormat");
    expect(q("fractional")).not.toContain("oddsFormat");
    expect(q("american%26date%3D2026")).not.toContain("oddsFormat");
  });

  it.each([
    ["no markets", "regions=us", "missing markets"],
    ["an empty market list", "regions=us&markets=", "missing markets"],
    ["a market list of commas", "regions=us&markets=,,", "missing markets"],
    ["a market in capitals", "regions=us&markets=H2H", "bad market list"],
    ["a market carrying a second parameter", "regions=us&markets=h2h%26date%3D2026", "bad market list"],
    ["a market over 40 characters", `regions=us&markets=${"a".repeat(41)}`, "bad market list"],
    ["no regions", "markets=h2h", "missing regions"],
    ["an empty region list", "markets=h2h&regions=", "missing regions"],
    ["a region carrying a second parameter", "markets=h2h&regions=us%26date%3D2026", "bad region list"],
    ["a region of one letter", "markets=h2h&regions=u", "bad region list"],
    ["a region of four letters", "markets=h2h&regions=usaa", "bad region list"],
    ["a region in capitals", "markets=h2h&regions=US", "bad region list"],
  ])("a priced request with %s is refused", (_n, query, error) => {
    expect(build(`${HOST}/v4/sports/baseball_mlb/odds?${query}`)).toEqual({ ok: false, error });
    expect(build(`${HOST}/v4/sports/baseball_mlb/events/abc/odds?${query}`)).toEqual({ ok: false, error });
  });

  it("the two free kinds carry the key and nothing else", () => {
    expect(build(`${HOST}/v4/sports/?all=true&regions=us&markets=h2h`)).toEqual({ ok: true, pathAndQuery: "/v4/sports/?apiKey=k" });
    expect(build(`${HOST}/v4/sports/baseball_mlb/events?dateFormat=unix&commenceTimeFrom=x&eventIds=a`)).toEqual({ ok: true, pathAndQuery: "/v4/sports/baseball_mlb/events?apiKey=k" });
  });

  it("the key is encoded, so it cannot add a parameter", () => {
    expect(build(SPORTS, "a b&date=x")).toEqual({ ok: true, pathAndQuery: "/v4/sports/?apiKey=a%20b%26date%3Dx" });
  });
});

describe("E2-2 — what the route refuses before the provider is touched", () => {
  const refused = async (r: Response, status: number, error: string) => {
    expect(r.status).toBe(status);
    expect(await r.json()).toEqual({ error });
    expect(calls).toEqual([]);
  };

  it("no u", async () => {
    await refused(await GET(new NextRequest("https://parlay.test/api/odds")), 400, "missing u");
  });

  it("a u of 2,000 characters is read; one more is refused", async () => {
    const base = `${SPORTS}?x=`;
    expect((await ask(base + "a".repeat(2000 - base.length))).status).toBe(200);
    expect(calls).toHaveLength(1);
    calls.length = 0;
    await refused(await ask(base + "a".repeat(2001 - base.length)), 400, "bad url");
  });

  it("a u that is not a URL", async () => {
    await refused(await ask("not a url"), 400, "bad url");
  });

  it.each([
    ["plain http", "http://api.the-odds-api.com/v4/sports"],
    ["another host", "https://example.test/v4/sports"],
    ["a host that only starts like the provider", "https://api.the-odds-api.com.example.test/v4/sports"],
    ["the provider's name as a user name", "https://api.the-odds-api.com@example.test/v4/sports"],
    ["a sibling host", "https://www.the-odds-api.com/v4/sports"],
  ])("%s", async (_n, u) => {
    await refused(await ask(u), 403, "host not allowed");
  });

  it.each([
    ["the historical endpoint on an allowed shape", `${HOST}/v4/historical/sports/baseball_mlb/odds?regions=us,eu&markets=h2h&date=2026-07-01T00:00:00Z`],
    ["the historical endpoint with no markets", `${HOST}/v4/historical/sports/baseball_mlb/events?date=2026-07-01T00:00:00Z`],
    ["another sport on an allowed shape", `${HOST}/v4/sports/basketball_nba/odds?regions=us,eu&markets=h2h,spreads,totals`],
    ["scores", `${HOST}/v4/sports/baseball_mlb/scores?daysFrom=3`],
    ["a dot segment that climbs to the historical endpoint", `${HOST}/v4/sports/baseball_mlb/../../historical/sports/baseball_mlb/odds?regions=us,eu&markets=h2h`],
    ["an encoded dot segment that climbs to the historical endpoint", `${HOST}/v4/sports/baseball_mlb/%2e%2e/%2e%2e/historical/sports/baseball_mlb/odds?regions=us,eu&markets=h2h`],
  ])("%s", async (_n, u) => {
    await refused(await ask(u), 403, "path not allowed");
  });

  it("a fresh pull with a valid credential is refused on a bad path just the same", async () => {
    process.env.LEDGER_SYNC_KEY = PHRASE;
    await refused(await ask(`${HOST}/v4/historical/sports/baseball_mlb/odds?regions=us,eu&markets=h2h`, { fresh: "1", headers: { "x-pl-sync": PHRASE } }), 403, "path not allowed");
  });

  it("a market set outside the two shapes, as before", async () => {
    await refused(await ask(`${HOST}/v4/sports/baseball_mlb/odds?regions=us&markets=h2h`), 403, "market shape not allowed");
    await refused(await ask(`${HOST}/v4/sports/baseball_mlb/odds?regions=us,eu,uk,au&markets=h2h`), 403, "market shape not allowed");
  });

  it("the path is judged before the shape", async () => {
    await refused(await ask(`${HOST}/v4/historical/sports/baseball_mlb/odds?regions=us,eu,uk&markets=h2h`), 403, "path not allowed");
  });

  it("an odds request with no markets, which the shape check lets through as an events list", async () => {
    await refused(await ask(`${HOST}/v4/sports/baseball_mlb/odds?regions=us,eu`), 400, "missing markets");
    await refused(await ask(`${HOST}/v4/sports/baseball_mlb/odds`), 400, "missing markets");
    await refused(await ask(`${HOST}/v4/sports/baseball_mlb/events/abc/odds?regions=us&markets=`), 400, "missing markets");
  });

  it("no key on the server and none from the caller", async () => {
    delete process.env.ODDS_API_KEY;
    await refused(await ask(LINES), 500, "no API key configured");
    await refused(await ask(SPORTS), 500, "no API key configured");
  });
});

describe("E2-2 — what the route sends", () => {
  it("game lines: the rebuilt request, two books by name, the server's key, one call", async () => {
    const r = await ask(LINES);
    expect(r.status).toBe(200);
    expect(calls.map((c) => c.url)).toEqual([`${HOST}/v4/sports/baseball_mlb/odds?${TWO}&markets=h2h,spreads,totals&oddsFormat=american&apiKey=${KEY}`]);
  });

  it("two orderings of the markets reach the provider as one URL", async () => {
    await ask(`${HOST}/v4/sports/baseball_mlb/odds?regions=us,eu&markets=h2h,totals,spreads&oddsFormat=american`);
    await ask(`${HOST}/v4/sports/baseball_mlb/odds?oddsFormat=american&markets=spreads,totals,h2h&regions=us,eu`);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe(calls[1].url);
  });

  it("one event's props", async () => {
    await ask(PROPS);
    expect(calls.map((c) => c.url)).toEqual([`${HOST}/v4/sports/baseball_mlb/events/abc123def456/odds?${TWO}&markets=batter_hits,pitcher_strikeouts&oddsFormat=american&apiKey=${KEY}`]);
  });

  it("the events list and the sports list carry the key and nothing else", async () => {
    await ask(`${EVENTS}?apiKey=caller-key&dateFormat=unix&commenceTimeFrom=2026-07-01T00:00:00Z`);
    await ask(`${SPORTS}?all=true`);
    expect(calls.map((c) => c.url)).toEqual([`${EVENTS}?apiKey=${KEY}`, `${SPORTS}?apiKey=${KEY}`]);
  });

  it("nothing else the caller wrote goes upstream", async () => {
    await ask(`${LINES}&date=2026-07-01T00:00:00Z&eventIds=a,b&commenceTimeFrom=2026-07-01T00:00:00Z&includeLinks=true&bookmakers=pinnacle&dateFormat=unix&anything=1&apiKey=caller-key`);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${HOST}/v4/sports/baseball_mlb/odds?${TWO}&markets=h2h,spreads,totals&oddsFormat=american&apiKey=${KEY}`);
  });

  it("a second markets parameter does not ride along", async () => {
    await ask(`${LINES}&markets=batter_home_runs,player_pass_yds`);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).not.toContain("batter_home_runs");
    expect(calls[0].url.match(/markets=/g)).toHaveLength(1);
  });

  it("a user name, a port and a fragment in the caller's URL are not sent", async () => {
    await ask("https://someone:word@api.the-odds-api.com:8443/v4/sports/#frag");
    expect(calls.map((c) => c.url)).toEqual([`${SPORTS}?apiKey=${KEY}`]);
  });

  it("the server's key replaces the caller's; with none on the server the caller's is used", async () => {
    await ask(`${SPORTS}?apiKey=caller-key`);
    delete process.env.ODDS_API_KEY;
    await ask(`${SPORTS}?apiKey=caller-key`);
    await ask(`${SPORTS}?apiKey=${encodeURIComponent("a b&date=x")}`);
    expect(calls.map((c) => c.url)).toEqual([`${SPORTS}?apiKey=${KEY}`, `${SPORTS}?apiKey=caller-key`, `${SPORTS}?apiKey=a%20b%26date%3Dx`]);
  });
});

describe("E2-2 — fresh=1 with no credential configured on the server (the old open door)", () => {
  it.each([
    ["no header", {}],
    ["a guessed passcode", { "x-pl-pass": PASS }],
    ["a guessed phrase", { "x-pl-sync": PHRASE }],
    ["an empty passcode", { "x-pl-pass": "" }],
    ["both guessed", { "x-pl-pass": PASS, "x-pl-sync": PHRASE }],
  ])("%s: answered from the cached path, marked stale, never refused", async (_n, headers) => {
    const r = await ask(LINES, { fresh: "1", headers });
    expect(r.status).toBe(200);
    expect(r.headers.get("x-pl-stale")).toBe("true");
    expect(calls).toHaveLength(1);
    expect(calls[0].init).toEqual(CACHED);
  });

  it("the free sports list (the quota tool's call) degrades the same way", async () => {
    const r = await ask(SPORTS, { fresh: "1" });
    expect(r.status).toBe(200);
    expect(r.headers.get("x-pl-stale")).toBe("true");
    expect(calls[0].init).toEqual(CACHED);
  });
});

describe("E2-2 — fresh=1 with the sync phrase set", () => {
  beforeEach(() => {
    process.env.LEDGER_SYNC_KEY = PHRASE;
  });

  it("the phrase forces an uncached pull, with no stale mark", async () => {
    const r = await ask(LINES, { fresh: "1", headers: { "x-pl-sync": PHRASE } });
    expect(r.status).toBe(200);
    expect(r.headers.get("x-pl-stale")).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0].init).toEqual(UNCACHED);
  });

  it.each([
    ["no header", {}],
    ["a wrong phrase", { "x-pl-sync": "test-phras" }],
    ["the phrase with one more character", { "x-pl-sync": `${PHRASE}e` }],
    ["the phrase sent as the passcode", { "x-pl-pass": PHRASE }],
    ["the phrase as a Bearer", { authorization: `Bearer ${PHRASE}` }],
    ["any passcode, since the server has none", { "x-pl-pass": PASS }],
  ])("%s degrades to the cache", async (_n, headers) => {
    const r = await ask(LINES, { fresh: "1", headers });
    expect(r.status).toBe(200);
    expect(r.headers.get("x-pl-stale")).toBe("true");
    expect(calls[0].init).toEqual(CACHED);
  });

  it("the phrase is not sent upstream", async () => {
    await ask(LINES, { fresh: "1", headers: { "x-pl-sync": PHRASE } });
    expect(JSON.stringify(calls)).not.toContain(PHRASE);
  });
});

describe("E2-2 — fresh=1 with the passcode set", () => {
  beforeEach(() => {
    process.env.APP_PASSCODE = PASS;
  });

  it("the passcode forces an uncached pull, with no sync phrase on the server", async () => {
    const r = await ask(PROPS, { fresh: "1", headers: { "x-pl-pass": PASS } });
    expect(r.status).toBe(200);
    expect(r.headers.get("x-pl-stale")).toBeNull();
    expect(calls[0].init).toEqual(UNCACHED);
    expect(JSON.stringify(calls)).not.toContain(PASS);
  });

  it.each([
    ["no header", {}],
    ["a wrong passcode", { "x-pl-pass": "test-pass-123" }],
    ["the passcode with one more character", { "x-pl-pass": `${PASS}5` }],
    ["the passcode sent as the sync phrase", { "x-pl-sync": PASS }],
    ["a phrase, since the server has none", { "x-pl-sync": PHRASE }],
  ])("%s degrades to the cache", async (_n, headers) => {
    const r = await ask(PROPS, { fresh: "1", headers });
    expect(r.status).toBe(200);
    expect(r.headers.get("x-pl-stale")).toBe("true");
    expect(calls[0].init).toEqual(CACHED);
  });

  it("with both configured, either one passes; swapped, neither does", async () => {
    process.env.LEDGER_SYNC_KEY = PHRASE;
    await ask(LINES, { fresh: "1", headers: { "x-pl-sync": PHRASE } });
    await ask(LINES, { fresh: "1", headers: { "x-pl-pass": PASS } });
    await ask(LINES, { fresh: "1", headers: { "x-pl-sync": PASS, "x-pl-pass": PHRASE } });
    expect(calls.map((c) => c.init)).toEqual([UNCACHED, UNCACHED, CACHED]);
  });
});

describe("E2-2 — a request that does not ask for a fresh pull", () => {
  beforeEach(() => {
    process.env.LEDGER_SYNC_KEY = PHRASE;
    process.env.APP_PASSCODE = PASS;
  });

  it.each([
    ["no fresh flag, no credential", undefined, {}],
    ["no fresh flag, a valid phrase", undefined, { "x-pl-sync": PHRASE }],
    ["fresh=0", "0", { "x-pl-sync": PHRASE }],
    ["fresh=true", "true", { "x-pl-pass": PASS }],
    ["fresh=11", "11", { "x-pl-pass": PASS }],
  ])("%s: the cached path, and no stale mark", async (_n, fresh, headers) => {
    const r = await ask(LINES, { fresh, headers });
    expect(r.status).toBe(200);
    expect(r.headers.get("x-pl-stale")).toBeNull();
    expect(calls[0].init).toEqual(CACHED);
  });
});

describe("E2-2 — what comes back", () => {
  it("the three quota headers are passed through, and no other upstream header", async () => {
    upstream.headers = { "content-type": "text/plain", ...QUOTA, "set-cookie": "a=b", "x-other": "1" };
    const r = await ask(LINES);
    expect(r.headers.get("x-requests-remaining")).toBe("90000");
    expect(r.headers.get("x-requests-used")).toBe("10000");
    expect(r.headers.get("x-requests-last")).toBe("3");
    expect(r.headers.get("set-cookie")).toBeNull();
    expect(r.headers.get("x-other")).toBeNull();
    expect(r.headers.get("content-type")).toBe("application/json");
  });

  it("a quota header the provider did not send is not invented", async () => {
    upstream.headers = { "x-requests-remaining": "5" };
    const r = await ask(LINES);
    expect(r.headers.get("x-requests-remaining")).toBe("5");
    expect(r.headers.get("x-requests-used")).toBeNull();
    expect(r.headers.get("x-requests-last")).toBeNull();
  });

  it("only the two books are in the body handed back", async () => {
    upstream.body = JSON.stringify([{ id: "e1", bookmakers: ["pinnacle", "draftkings", "betmgm", "fanduel"].map((key) => ({ key, markets: [] })) }]);
    const body = await (await ask(LINES)).json();
    expect(body[0].bookmakers.map((b: { key: string }) => b.key)).toEqual(["draftkings", "fanduel"]);
  });

  it("the provider's own refusal is passed through with its status", async () => {
    upstream = { status: 429, body: JSON.stringify({ message: "quota" }), headers: { "x-requests-remaining": "0" } };
    const r = await ask(LINES);
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ message: "quota" });
    expect(r.headers.get("x-requests-remaining")).toBe("0");
  });

  it("a provider that cannot be reached is a 502 that repeats nothing", async () => {
    upstream.fail = new Error(`connect failed for ${HOST}/v4/sports/?apiKey=${KEY}`);
    const r = await ask(LINES, { fresh: "1" });
    expect(r.status).toBe(502);
    const text = await r.text();
    expect(JSON.parse(text)).toEqual({ error: "upstream unreachable" });
    expect(text).not.toContain(KEY);
    expect(calls).toHaveLength(1);
  });

  it("no refusal carries the key, the phrase, the passcode or what the caller sent", async () => {
    process.env.LEDGER_SYNC_KEY = PHRASE;
    process.env.APP_PASSCODE = PASS;
    const sent = { "x-pl-sync": "sent-phrase-zz", "x-pl-pass": "sent-pass-zz" };
    const tries = [
      "not a url",
      "https://example.test/v4/sports?apiKey=sent-key-zz",
      `${HOST}/v4/historical/sports/baseball_mlb/odds?apiKey=sent-key-zz`,
      `${HOST}/v4/sports/baseball_mlb/odds?regions=us&markets=h2h&apiKey=sent-key-zz`,
      `${HOST}/v4/sports/baseball_mlb/odds?apiKey=sent-key-zz`,
    ];
    for (const u of tries) {
      const text = await (await ask(u, { fresh: "1", headers: sent })).text();
      for (const secret of [KEY, PHRASE, PASS, "sent-phrase-zz", "sent-pass-zz", "sent-key-zz"]) expect(text).not.toContain(secret);
    }
    expect(calls).toEqual([]);
  });
});

describe("E2-2 — as source", () => {
  const route = stripComments(readFileSync("app/api/odds/route.ts", "utf8"));
  const get = route.slice(route.indexOf("export async function GET("));

  it("no plain string compare of a secret is left, and no passcode means no pass", () => {
    expect(route).not.toMatch(/=== pass\b|!== pass\b/);
    expect(route).not.toMatch(/!pass \|\|/);
    expect(route).toMatch(/timingSafeEqual\(h\(want\), h\(got\)\)/);
    expect(route).toMatch(/if \(!want \|\| !got\) return false;/);
    expect(get).toMatch(/const authedFresh = fresh && \(syncAuthed\(req\) \|\| passAuthed\(req\)\);/);
  });

  it("the path is checked before the shape, the shape before the request is built, and that before the pull", () => {
    const at = (s: string) => get.indexOf(s);
    expect(at("proxyTargetOf(url)")).toBeGreaterThan(-1);
    expect(at("proxyTargetOf(url)")).toBeLessThan(at("shapeAllowed(url)"));
    expect(at("shapeAllowed(url)")).toBeLessThan(at("proxyUpstreamOf(url, target, apiKey)"));
    expect(at("proxyUpstreamOf(url, target, apiKey)")).toBeLessThan(at("await oddsFetch("));
  });

  it("the caller's URL is never sent as written, and there is one pull", () => {
    expect(route).not.toMatch(/url\.toString\(\)|url\.href|oddsFetch\(raw|oddsFetch\(url\b/);
    expect(route.match(/oddsFetch\(/g)).toHaveLength(1);
    expect(route).not.toMatch(/(?<![A-Za-z_.])fetch\(/);
    expect(route).not.toMatch(/searchParams\.set\(/);
  });

  it("a refused fresh pull is never a 401, and nothing is logged", () => {
    expect(route).not.toMatch(/status: 401/);
    expect(route).not.toMatch(/console\./);
  });

  it("the path module names no host, so the route stays the only place one is written", () => {
    expect(readFileSync("src/lib/server/odds-path.ts", "utf8")).not.toMatch(/the-odds-api|https?:\/\//);
  });
});
