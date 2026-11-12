import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { decide } from "@/lib/anytime/engine";
import { memoryKv } from "@/lib/anytime/kv";
import { readLedger, writePicks } from "@/lib/anytime/ledger";
import { bestParlay, priceParlayAt } from "@/lib/anytime/parlay";
import { reportOf } from "@/lib/anytime/report";
import { AZ_BOOKS, isAzBook } from "@/lib/az/books";
import { excludedBy } from "@/lib/az/exclusions";
import { azBest, azFair, type AzQuotes } from "@/lib/az/market";
import { azOddsUrl, bookmakersOf } from "@/lib/az/odds-url";
import { CFB_LEAGUE, CFB_PROPS } from "@/lib/cfb/rules";
import { oddsPayloadOf } from "@/lib/cfb/slate-server";
import { MLB_LIVE_EVENTS_URL, mlbLiveEventUrl } from "@/lib/mlb/live-props-rules";
import { NFL_LEAGUE } from "@/lib/nfl/rules";
import { __resetOddsClientForTests } from "@/lib/server/odds-client";
import { cand, clockAt, T0 } from "./helpers/anytime";

/**
 * THE TWO-BOOK GUARD (2026-11-12, Josh's brief: "Add a test that fails if any book key other than
 * draftkings or fanduel appears in a fetch, a calculation, or a stored go-forward pick.").
 *
 *   A  FETCH        every request that reaches The Odds API names the two books and no region, and
 *                   the body handed to the caller holds only those two, whatever the provider sent.
 *                   Every source file that names the provider's host is on a list here with the way
 *                   its request reaches the network; a new file fails until it is classified.
 *   B  CALCULATION  the two-book layer and the any-time engine contain no other book, and ignore a
 *                   third book's quote even when one is forced in. The older desks still carry
 *                   other books' names (dead at run time once A holds: no such data arrives); that
 *                   count is a ceiling that may only go down.
 *   C  STORED PICK  no go-forward pick can be written at any other book, a parlay is one book's
 *                   prices only, and every stored pick names one of the two.
 */

const KEY = "test-key-never-logged";
const HOST = "api.the-odds-api.com";
/* every bookmaker key and book name the sweep of this repo found (AUDIT.md appendix C), plus the
   provider's other US keys. `cz` is not here: since 2026-09-17 that field holds the DraftKings price. */
const OTHER_BOOKS =
  /williamhill|caesars|betmgm|pinnacle|circa|betrivers|fanatics|espnbet|bovada|betonlineag|mybookieag|lowvig|betus|pointsbet|wynnbet|unibet|superbook|barstool|hardrockbet|matchbook|ballybet|betway|betparx|fliff|westgate|southpoint|william hill|betfair|prophetx|betanysports|everygame|gtbets|onexbet|marathonbet|coolbet|nordicbet|betsson|leovegas/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs)$/.test(name) && !/\.gen\.ts$/.test(name) && !/ \d+\.(ts|tsx|mjs)$/.test(name)) out.push(p);
  }
  return out;
}
const SOURCES = [...walk("app"), ...walk("src")].sort();
const read = (p: string) => readFileSync(p, "utf8");
const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

/** A fetch that records every URL and answers an Odds API call with FIVE books. */
function fiveBookFetch() {
  const urls: string[] = [];
  const event = {
    id: "e1",
    commence_time: "2026-11-15T21:25:00Z",
    home_team: "Home",
    away_team: "Away",
    bookmakers: ["pinnacle", "draftkings", "williamhill_us", "fanduel", "betmgm"].map((key) => ({ key, title: key, markets: [{ key: "h2h", outcomes: [{ name: "Home", price: -120 }, { name: "Away", price: 100 }] }] })),
  };
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const u = String(input);
    urls.push(u);
    return new Response(JSON.stringify(/\/events\/[^/]+\/odds/.test(u) ? event : [event]), { status: 200, headers: { "content-type": "application/json", "x-requests-last": "3", "x-requests-remaining": "90000", "x-requests-used": "10000" } });
  });
  vi.stubGlobal("fetch", mock);
  return urls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  __resetOddsClientForTests();
});

describe("A. fetch: only DraftKings and FanDuel are ever asked for", () => {
  it("every configured Odds API URL becomes a two-book request with no region", () => {
    const urls = [
      CFB_LEAGUE.feeds.oddsUrl,
      NFL_LEAGUE.feeds.oddsUrl,
      `${CFB_LEAGUE.feeds.oddsEventBase}/abc/odds?apiKey=${KEY}&regions=${CFB_PROPS.regions}&markets=${CFB_LEAGUE.feeds.oddsPropMarkets}&oddsFormat=american`,
      `${NFL_LEAGUE.feeds.oddsEventBase}/abc/odds?apiKey=${KEY}&regions=${NFL_LEAGUE.props.regions}&markets=${NFL_LEAGUE.feeds.oddsPropMarkets}&oddsFormat=american`,
      mlbLiveEventUrl("abc", KEY),
      `https://${HOST}/v4/sports/baseball_mlb/odds?regions=us,us2,eu&markets=h2h,spreads,totals&oddsFormat=american&apiKey=${KEY}`,
      `https://${HOST}/v4/sports/baseball_mlb/events/abc/odds?regions=us&markets=batter_hits,pitcher_strikeouts&bookmakers=williamhill_us,pinnacle&apiKey=${KEY}`,
    ];
    for (const u of urls) {
      expect(u).toContain(HOST);
      const out = azOddsUrl(u);
      expect(bookmakersOf(out)).toEqual(["draftkings", "fanduel"]);
      expect(out).not.toMatch(/[?&]regions=/);
      expect(out).not.toMatch(OTHER_BOOKS);
    }
    /* a URL with no bookmaker dimension (the events list) is left alone */
    expect(azOddsUrl(`${MLB_LIVE_EVENTS_URL}?apiKey=${KEY}`)).toBe(`${MLB_LIVE_EVENTS_URL}?apiKey=${KEY}`);
  });

  it("the football game-lines pull sends the two-book URL and hands back two books out of five", async () => {
    vi.stubEnv("ODDS_API_KEY", KEY);
    const urls = fiveBookFetch();
    for (const L of [CFB_LEAGUE, NFL_LEAGUE]) {
      const got = await oddsPayloadOf(L, { fresh: true });
      expect(got.missing).toBe(false);
      const books = (got.events as { bookmakers: { key: string }[] }[]).flatMap((e) => e.bookmakers.map((b) => b.key));
      expect(books).toEqual(["draftkings", "fanduel"]);
    }
    expect(urls).toHaveLength(2);
    for (const u of urls) {
      expect(bookmakersOf(u)).toEqual(["draftkings", "fanduel"]);
      expect(u).not.toMatch(/[?&]regions=/);
    }
  });

  it("the /api/odds proxy rewrites whatever the browser asked for, and filters the answer", async () => {
    vi.stubEnv("ODDS_API_KEY", KEY);
    const urls = fiveBookFetch();
    const { GET } = await import("../app/api/odds/route");
    const asked = "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?regions=us,eu&markets=h2h,spreads,totals&oddsFormat=american";
    const res = await GET(new NextRequest(`https://parlay.test/api/odds?u=${encodeURIComponent(asked)}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { bookmakers: { key: string }[] }[];
    expect(body[0].bookmakers.map((b) => b.key)).toEqual(["draftkings", "fanduel"]);
    expect(urls).toHaveLength(1);
    expect(bookmakersOf(urls[0])).toEqual(["draftkings", "fanduel"]);
    expect(urls[0]).not.toMatch(/[?&]regions=/);
    /* the quota headers the app reads still come through */
    expect(res.headers.get("x-requests-remaining")).toBe("90000");
  });

  /* Every source file that names the provider's host, and how its request reaches the network:
       client   it calls oddsFetch (src/lib/server/odds-client.ts), the one place a request is made
       proxy    it calls this app's /api/odds, which is itself a `client` file
       config   it only holds a URL constant or checks a host; it makes no request
     A new file that names the host fails here until it is added with the way it fetches. */
  const HOST_FILES: Record<string, "client" | "proxy" | "config"> = {
    "app/api/generate/route.ts": "client",
    "app/api/odds/route.ts": "client",
    "app/api/propsnap/route.ts": "client",
    "app/api/clv/route.ts": "proxy",
    "src/engine2/sharpBoard.ts": "proxy",
    "src/lib/ufc.ts": "proxy",
    "src/lib/useAllStar.ts": "proxy",
    "src/lib/fetcher.ts": "proxy", // the browser engine's network layer: an Odds API URL is rewritten to /api/odds
    "src/lib/az/odds-url.ts": "config",
    "src/lib/cfb/rules.ts": "config",
    "src/lib/nfl/rules.ts": "config",
    "src/lib/mlb/live-props-rules.ts": "config",
    "src/lib/football/league.ts": "config",
    "src/lib/ncaab/rules.ts": "config", // College Basketball (2026-11-12): the URL constant; the requests are made in src/lib/server through oddsFetch
  };

  /* a raw fetch() a `client` file may keep, because what it loads is not the Odds API */
  const OWN_FILES: Record<string, string> = {
    // the two model files this app serves itself (`${base}/model/priors.json`, `/model/context.json`)
    "app/api/generate/route.ts": '      fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.text() : null)).catch(() => null);',
  };

  it("every file that names the Odds API host is classified, and none fetches it raw", () => {
    const naming = SOURCES.filter((p) => read(p).includes("the-odds-api.com"));
    expect(naming.sort()).toEqual(Object.keys(HOST_FILES).sort());
    for (const [p, how] of Object.entries(HOST_FILES)) {
      const code = noComments(read(p)).split("\n").filter((l) => l !== OWN_FILES[p]).join("\n");
      const rawFetch = (code.match(/(?<![A-Za-z_.])fetch\(/g) ?? []).length;
      if (how === "client") {
        expect(code, p).toMatch(/oddsFetch|azOddsFetch/);
        expect(rawFetch, `${p} must not call fetch() itself`).toBe(0);
      } else if (how === "proxy") {
        expect(code, p).toMatch(/\/api\/odds\?u=|oddsUrl\(/);
        expect(code, p).not.toMatch(/fetch\(\s*[`"']https:\/\/api\.the-odds-api\.com/);
      } else {
        expect(rawFetch, `${p} holds a URL only`).toBe(0);
      }
    }
    /* the browser layer sends an Odds API URL nowhere but the proxy */
    expect(noComments(read("src/lib/fetcher.ts"))).toMatch(/if \(new URL\(url\)\.hostname === ODDS_HOST\) \{\s*target = `\/api\/odds\?u=\$\{encodeURIComponent\(url\)\}`;/);
    /* and the one place a request is made rewrites the URL before it fetches, and filters the body after */
    const client = noComments(read("src/lib/server/odds-client.ts"));
    expect(client).toMatch(/azOddsUrl\(/);
    expect(client).toMatch(/onlyAzBookmakers\(/);
  });

  it("the files that build an Odds URL from config go through the client too", () => {
    /* these never spell the host: they read it from the league config or a URL builder */
    const viaConfig: Record<string, RegExp> = {
      "src/lib/cfb/slate-server.ts": /await oddsFetch\(`\$\{cfg\.feeds\.oddsUrl\}&apiKey=/,
      "src/lib/server/football-props.ts": /const r = await oddsFetch\(url, cache\);/,
      "src/lib/server/mlb-live-quote.ts": /await oddsFetch\(mlbLiveEventUrl\(id, key\), \{ cache: "no-store" \}\)/,
    };
    for (const [p, re] of Object.entries(viaConfig)) expect(noComments(read(p)), p).toMatch(re);
    /* and nowhere in app/ or src/ is a config Odds URL handed to a bare fetch */
    const bare = /(?<![A-Za-z_.])fetch\([^)\n]*(feeds\.oddsUrl|oddsEventBase|mlbLiveEventUrl|MLB_LIVE_EVENTS_URL|ODDS_URL)/;
    expect(SOURCES.filter((p) => bare.test(noComments(read(p))))).toEqual([]);
  });
});

describe("B. calculation: no third book in any number", () => {
  const TWO_BOOK_LAYER = SOURCES.filter((p) => /^src\/lib\/(anytime|az)\//.test(p) || /^src\/lib\/server\/(anytime[^/]*|odds-client)\.ts$/.test(p) || /^app\/(api\/)?anytime\//.test(p));

  it("the two-book layer and the any-time engine name no other book in code", () => {
    expect(TWO_BOOK_LAYER.length).toBeGreaterThan(15);
    for (const p of [...TWO_BOOK_LAYER, "tools/run-picks.mjs"]) {
      const code = noComments(read(p));
      const hits = code.split("\n").filter((l) => OTHER_BOOKS.test(l));
      /* the one allowed line: history tagging marks a pre-2026-09-17 pick as taken at Caesars */
      if (p === "src/lib/az/books.ts") expect(hits).toEqual(['  return { book: "williamhill_us", legacy: true, inferred: true };']);
      else expect(hits, p).toEqual([]);
    }
  });

  it("a third book's quote is ignored even when forced in", () => {
    const two: AzQuotes = { draftkings: { price: -110, opp: -110 }, fanduel: { price: -105, opp: -115 } };
    const forced = { ...two, pinnacle: { price: 150, opp: -400 }, williamhill_us: { price: 200, opp: -500 } } as unknown as AzQuotes;
    expect(azFair(forced)).toEqual(azFair(two));
    expect(azBest(forced)).toEqual(azBest(two));
    expect(azBest(forced)!.book).toBe("fanduel");
    /* and a market only a third book offers is no market at all */
    const only = { pinnacle: { price: 150, opp: -170 } } as unknown as AzQuotes;
    expect(azFair(only)).toBeNull();
    expect(azBest(only)).toBeNull();
  });

  it("the engine makes no pick from a third book's price", () => {
    const base = { now: T0, runId: "r", trigger: "manual-api" as const, families: new Map(), excluded: excludedBy(), kellyBankroll: 100, kellyOpenByEvent: new Map() };
    const only = decide({ ...base, candidates: [cand({ quotes: { pinnacle: { price: 150, opp: -170 } } as unknown as AzQuotes })] });
    expect(only.picks).toEqual([]);
    const forced = decide({ ...base, candidates: [cand({ quotes: { draftkings: { price: -110, opp: -110 }, fanduel: { price: -105, opp: -115 }, pinnacle: { price: 300, opp: -400 } } as unknown as AzQuotes })] });
    expect(forced.picks).toHaveLength(1);
    expect(forced.picks[0]).toMatchObject({ book: "fanduel", price: -105, otherBook: "draftkings", otherPrice: -110 });
  });

  /* THE OLDER DESKS. Lines in app/ and src/ (outside the two-book layer) that still name another
     book: field names kept from the Caesars era that now hold the DraftKings price, a consensus
     weight for a book that no longer arrives, labels, comments. They are dead at run time once
     section A holds. Removing them is pinned by pre-existing tests and waits for the owner's word;
     until then the count may only fall. Measured 2026-11-12: 403 lines in 93 files. */
  const CEILING = { lines: 403, files: 93 };

  it("the count of other-book lines in the older desks only goes down", () => {
    let lines = 0;
    let files = 0;
    for (const p of SOURCES) {
      if (TWO_BOOK_LAYER.includes(p)) continue;
      const n = read(p).split("\n").filter((l) => OTHER_BOOKS.test(l)).length;
      if (n) files++;
      lines += n;
    }
    expect(lines).toBeGreaterThan(0); // the scan is looking at something
    expect(lines).toBeLessThanOrEqual(CEILING.lines);
    expect(files).toBeLessThanOrEqual(CEILING.files);
  });
});

describe("C. stored go-forward picks: DraftKings or FanDuel, nothing else", () => {
  const input = () => ({ candidates: [cand()], now: T0, runId: "r", trigger: "manual-api" as const, families: new Map(), excluded: excludedBy(), kellyBankroll: 100, kellyOpenByEvent: new Map() });

  it("a pick at any other book cannot be written, and nothing is stored when it is tried", async () => {
    const clock = clockAt(T0);
    const kv = memoryKv(clock);
    const pick = decide(input()).picks[0];
    for (const bad of [{ ...pick, book: "williamhill_us" }, { ...pick, otherBook: "pinnacle" }, { ...pick, book: "DraftKings" }, { ...pick, book: "" }]) {
      await expect(writePicks(kv, [bad as never], clock, new Map())).rejects.toThrow(/NOT A TWO-BOOK PICK/);
    }
    expect(kv.writes).toEqual([]);
    expect(await readLedger(kv)).toEqual([]);
  });

  it("every stored pick names one of the two books, and the report has exactly those three rows", async () => {
    const clock = clockAt(T0);
    const kv = memoryKv(clock);
    const picks = [
      ...decide(input()).picks,
      ...decide({ ...input(), candidates: [cand({ eventId: "ev2", quotes: { draftkings: { price: 120, opp: -140 }, fanduel: { price: 115, opp: -135 } }, model: { win: 0.5, push: 0 } })] }).picks,
    ];
    await writePicks(kv, picks, clock, new Map());
    const rows = await readLedger(kv);
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(isAzBook(r.pick.book)).toBe(true);
      expect(isAzBook(r.pick.otherBook)).toBe(true);
      expect(r.pick.book).not.toBe(r.pick.otherBook);
    }
    expect(rows.map((r) => r.pick.book).sort()).toEqual(["draftkings", "fanduel"]);
    expect(Object.keys(reportOf(rows, T0).byBook).sort()).toEqual(["combined", ...AZ_BOOKS].sort());
    /* and no stored value anywhere in the store names a third book */
    expect(JSON.stringify(kv.dump())).not.toMatch(OTHER_BOOKS);
  });

  it("a parlay is one book's prices: never a DraftKings leg with a FanDuel leg, never a third book", () => {
    const leg = (id: string, dk: number | null, fd: number | null) => ({ eventId: id, selection: id, p: 0.55, prices: { draftkings: dk, fanduel: fd } });
    const split = [leg("a", -110, null), leg("b", null, -110)];
    expect(bestParlay(split)).toMatchObject({ ok: false });
    expect(priceParlayAt(split, "draftkings")).toMatchObject({ ok: false });
    expect(priceParlayAt(split, "fanduel")).toMatchObject({ ok: false });
    const both = [leg("a", -110, -105), leg("b", 120, 125)];
    expect(priceParlayAt(both, "pinnacle")).toMatchObject({ ok: false, reason: "foreign_book" });
    expect(priceParlayAt(both, "DraftKings")).toMatchObject({ ok: false, reason: "foreign_book" });
    expect(priceParlayAt([...both, { eventId: "c", selection: "c", p: 0.5, prices: { draftkings: -110, fanduel: -110, betmgm: 200 } }], "fanduel")).toMatchObject({ ok: false, reason: "foreign_book" });
    const fd = priceParlayAt(both, "fanduel");
    expect(fd).toMatchObject({ ok: true, book: "fanduel", legs: 2 });
    /* the price is FanDuel's two prices multiplied, and nothing of DraftKings' */
    if (fd.ok) expect(fd.dec).toBeCloseTo((1 + 100 / 105) * 2.25, 6);
    expect(bestParlay(both)).toMatchObject({ ok: true, book: "fanduel" });
  });
});
