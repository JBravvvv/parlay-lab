import { afterEach, describe, expect, it, vi } from "vitest";
import { AZ_BOOKMAKERS_PARAM, AZ_BOOKS, assertAzBook, bookTagOf, isAzBook, onlyAzBookmakers, otherAzBook } from "@/lib/az/books";
import { azOddsUrl, azOddsUrlWithRegionFallback, bookmakersOf } from "@/lib/az/odds-url";
import { amDec, azBest, azEdge, azEdgeAtBook, azFair, clvOf, evOf, kellyOf, noVig, priceClvOf } from "@/lib/az/market";
import { OddsBudgetError, __resetOddsClientForTests, newOddsRun, oddsFetch, oddsRunSummary, redactOddsUrl, withOddsRun } from "@/lib/server/odds-client";

/* The two-book rule (2026-11-12): DraftKings and FanDuel only, in every fetch and every number. */

const KEY = "test-key-never-logged";
const BASE = "https://api.the-odds-api.com/v4/sports/americanfootball_nfl";

describe("the two book keys", () => {
  it("are exactly draftkings and fanduel, DraftKings first", () => {
    expect([...AZ_BOOKS]).toEqual(["draftkings", "fanduel"]);
    expect(AZ_BOOKMAKERS_PARAM).toBe("draftkings,fanduel");
  });

  it("no other key passes", () => {
    for (const k of ["williamhill_us", "betmgm", "pinnacle", "circa", "betrivers", "fanatics", "DraftKings", "", null, undefined, 7]) expect(isAzBook(k)).toBe(false);
    expect(isAzBook("draftkings")).toBe(true);
    expect(isAzBook("fanduel")).toBe(true);
    expect(() => assertAzBook("williamhill_us", "t")).toThrow(/NOT A TWO-BOOK KEY/);
    expect(otherAzBook("draftkings")).toBe("fanduel");
    expect(otherAzBook("fanduel")).toBe("draftkings");
  });

  it("drops every third book from an Odds API body, one event or a list", () => {
    const ev = { id: "e1", bookmakers: [{ key: "pinnacle" }, { key: "draftkings" }, { key: "williamhill_us" }, { key: "fanduel" }, { key: "betmgm" }] };
    expect(onlyAzBookmakers(ev).bookmakers.map((b) => b.key)).toEqual(["draftkings", "fanduel"]);
    expect(onlyAzBookmakers([ev, { id: "e2", bookmakers: [{ key: "betonlineag" }] }]).map((e) => e.bookmakers.length)).toEqual([2, 0]);
    /* a body with no bookmakers (the events list) is returned as it came */
    const list = [{ id: "e3", commence_time: "2026-11-15T18:00:00Z" }];
    expect(onlyAzBookmakers(list)).toEqual(list);
  });

  it("tags history: a Caesars-era pick is legacy, a DraftKings-era pick is not", () => {
    expect(bookTagOf("williamhill_us", "2026-10-01")).toEqual({ book: "williamhill_us", legacy: true, inferred: false });
    expect(bookTagOf("draftkings", "2026-08-01")).toEqual({ book: "draftkings", legacy: false, inferred: false });
    expect(bookTagOf(null, "2026-09-16")).toEqual({ book: "williamhill_us", legacy: true, inferred: true });
    expect(bookTagOf(undefined, "2026-09-17")).toEqual({ book: "draftkings", legacy: false, inferred: true });
    expect(bookTagOf(undefined, undefined).legacy).toBe(true);
  });
});

describe("every Odds API URL asks for the two books by name, never a region", () => {
  it("swaps regions for bookmakers and leaves every other byte alone", () => {
    const u = `${BASE}/odds?regions=us,eu&markets=h2h,spreads,totals&oddsFormat=american&apiKey=${KEY}`;
    expect(azOddsUrl(u)).toBe(`${BASE}/odds?bookmakers=draftkings,fanduel&markets=h2h,spreads,totals&oddsFormat=american&apiKey=${KEY}`);
    const v = `${BASE}/events/abc/odds?apiKey=${KEY}&regions=us&markets=player_pass_yds&oddsFormat=american`;
    expect(azOddsUrl(v)).toBe(`${BASE}/events/abc/odds?apiKey=${KEY}&bookmakers=draftkings,fanduel&markets=player_pass_yds&oddsFormat=american`);
  });

  it("adds bookmakers when the caller named neither", () => {
    expect(azOddsUrl(`${BASE}/odds?markets=h2h`)).toBe(`${BASE}/odds?markets=h2h&bookmakers=draftkings,fanduel`);
  });

  it("replaces a caller's own bookmakers list: a third book cannot ride along", () => {
    const out = azOddsUrl(`${BASE}/odds?bookmakers=pinnacle,draftkings,williamhill_us&regions=us&markets=h2h`);
    expect(bookmakersOf(out)).toEqual(["draftkings", "fanduel"]);
    expect(out).not.toMatch(/regions=/);
    expect(out).not.toMatch(/pinnacle|williamhill/);
    const first = azOddsUrl(`${BASE}/odds?regions=us&bookmakers=betmgm&markets=h2h`);
    expect(bookmakersOf(first)).toEqual(["draftkings", "fanduel"]);
    expect(first).not.toMatch(/regions=|betmgm/);
    expect(first).not.toMatch(/\?&|&&/);
  });

  it("is idempotent", () => {
    const u = azOddsUrl(`${BASE}/odds?regions=us&markets=h2h`);
    expect(azOddsUrl(u)).toBe(u);
  });

  it("leaves the events list, scores and other hosts untouched", () => {
    for (const u of [`${BASE}/events?apiKey=${KEY}`, `${BASE}/scores?daysFrom=1&apiKey=${KEY}`, "https://site.api.espn.com/x?regions=us&markets=h2h", "not a url"]) expect(azOddsUrl(u)).toBe(u);
  });

  it("the fallback form keeps both books and adds one region beside them", () => {
    const f = azOddsUrlWithRegionFallback(`${BASE}/odds?regions=us,eu&markets=h2h&apiKey=${KEY}`);
    expect(f).toBe(`${BASE}/odds?regions=us&bookmakers=draftkings,fanduel&markets=h2h&apiKey=${KEY}`);
    expect(azOddsUrlWithRegionFallback(f)).toBe(f);
  });
});

describe("two-book market math", () => {
  it("takes the hold out of one book's two-way price", () => {
    const nv = noVig(-110, -110)!;
    expect(nv.p).toBeCloseTo(0.5, 10);
    expect(nv.hold).toBeCloseTo(2 * (110 / 210) - 1, 10);
    const fav = noVig(-200, 170)!;
    expect(fav.p).toBeGreaterThan(0.63);
    expect(fav.p).toBeLessThan(2 / 3);
    expect(fav.p + noVig(170, -200)!.p).toBeCloseTo(1, 9);
  });

  it("a one-sided price has no no-vig number, and is not guessed", () => {
    expect(noVig(450, null)).toBeNull();
    expect(noVig(450, undefined)).toBeNull();
    expect(noVig(50, -110)).toBeNull();
    expect(azFair({ draftkings: { price: 450, opp: null } })).toBeNull();
  });

  it("an arbitrage-shaped quote is refused", () => {
    expect(noVig(150, 150)).toBeNull();
  });

  it("the market number is the MEAN of the two books' no-vig numbers, not the lower one", () => {
    const q = { draftkings: { price: -120, opp: 100 }, fanduel: { price: -105, opp: -115 } };
    const f = azFair(q)!;
    const dk = noVig(-120, 100)!.p;
    const fd = noVig(-105, -115)!.p;
    expect(f.n).toBe(2);
    expect(f.p).toBeCloseTo((dk + fd) / 2, 12);
    expect(f.p).toBeGreaterThan(Math.min(dk, fd));
    expect(f.p).toBeLessThan(Math.max(dk, fd));
  });

  it("one book alone is enough for a market number", () => {
    const f = azFair({ fanduel: { price: -110, opp: -110 } })!;
    expect(f.n).toBe(1);
    expect(f.p).toBeCloseTo(0.5, 10);
    expect(Object.keys(f.byBook)).toEqual(["fanduel"]);
  });

  it("line shopping picks the better payout and names the book; DraftKings on a tie", () => {
    expect(azBest({ draftkings: { price: -115, opp: -105 }, fanduel: { price: -108, opp: -112 } })).toMatchObject({ book: "fanduel", price: -108, otherBook: "draftkings", otherPrice: -115 });
    expect(azBest({ draftkings: { price: 140, opp: -165 }, fanduel: { price: 130, opp: -155 } })).toMatchObject({ book: "draftkings", price: 140, otherPrice: 130 });
    expect(azBest({ draftkings: { price: -110, opp: -110 }, fanduel: { price: -110, opp: -110 } })!.book).toBe("draftkings");
    expect(azBest({ fanduel: { price: 120, opp: -140 } })).toMatchObject({ book: "fanduel", otherBook: "draftkings", otherPrice: null });
    expect(azBest({})).toBeNull();
  });

  it("EV, Kelly and edge agree with hand arithmetic", () => {
    expect(evOf(0.55, 0, amDec(-110))).toBeCloseTo(0.55 * (210 / 110) - 1, 12);
    expect(kellyOf(0.55, 0, 2)).toBeCloseTo(0.1, 12);
    expect(kellyOf(0.45, 0, 2)).toBe(0);
    /* a push returns the stake: it is neither a win nor a loss */
    expect(evOf(0.5, 0.1, 2)).toBeCloseTo(0.1, 12);
    expect(kellyOf(0.5, 0.1, 2)).toBeCloseTo((0.5 - 0.4) / 0.9, 12);
    const e = azEdge({ win: 0.56, push: 0 }, { draftkings: { price: -110, opp: -110 }, fanduel: { price: 100, opp: -120 } })!;
    expect(e.best.book).toBe("fanduel");
    expect(e.ev).toBeCloseTo(0.12, 12);
    expect(e.edge).toBeCloseTo(0.56 - e.fair!.p, 12);
    expect(e.priceEv).toBeCloseTo(e.fair!.p * 2 - 1, 12);
  });

  it("with one book only, the model-free price edge is never positive", () => {
    for (const [a, b] of [[-110, -110], [150, -180], [-300, 240], [105, -125]] as const) {
      const e = azEdge({ win: 0.5, push: 0 }, { draftkings: { price: a, opp: b } })!;
      expect(e.priceEv!).toBeLessThanOrEqual(1e-12);
    }
  });

  it("prices at a named book for same-book work", () => {
    const q = { draftkings: { price: -115, opp: -105 }, fanduel: { price: -108, opp: -112 } };
    expect(azEdgeAtBook({ win: 0.54, push: 0 }, q, "draftkings")!.best).toMatchObject({ book: "draftkings", price: -115, otherPrice: -108 });
    expect(azEdgeAtBook({ win: 0.54, push: 0 }, { fanduel: q.fanduel }, "draftkings")).toBeNull();
  });

  it("rejects a model probability that is not a probability", () => {
    const q = { draftkings: { price: -110, opp: -110 } };
    for (const m of [{ win: 0, push: 0 }, { win: 1, push: 0 }, { win: 0.7, push: 0.4 }, { win: NaN, push: 0 }, { win: 0.5, push: -0.1 }]) expect(azEdge(m, q)).toBeNull();
  });

  it("closing line value: against the close's fair number, and price against price", () => {
    expect(clvOf(110, 0.5)).toBeCloseTo(0.05, 12);
    expect(clvOf(-110, 0.5)).toBeCloseTo(0.5 * (210 / 110) - 1, 12);
    expect(clvOf(110, 0)).toBeNull();
    expect(priceClvOf(110, 100)).toBeCloseTo(0.05, 12);
    expect(priceClvOf(-110, -120)).toBeGreaterThan(0);
    expect(priceClvOf(-110, null)).toBeNull();
  });
});

describe("the one door to the Odds API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetOddsClientForTests();
  });

  const body = [{ id: "e1", bookmakers: [{ key: "pinnacle", markets: [] }, { key: "draftkings", markets: [] }, { key: "fanduel", markets: [] }, { key: "williamhill_us", markets: [] }] }];
  const answer = (over: Partial<{ status: number; last: string | null; text: string }> = {}) => {
    const h = new Headers({ "content-type": "application/json", "x-requests-remaining": "9000", "x-requests-used": "1000", date: new Date().toUTCString() });
    if (over.last !== null) h.set("x-requests-last", over.last ?? "3");
    return new Response(over.text ?? JSON.stringify(body), { status: over.status ?? 200, headers: h });
  };

  it("fetches bookmakers=draftkings,fanduel with no region, and hands back the two books only", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => (seen.push(String(u)), answer())));
    const r = await oddsFetch(`${BASE}/odds?regions=us,eu&markets=h2h,spreads,totals&apiKey=${KEY}`, { cache: "no-store" });
    expect(seen).toHaveLength(1);
    expect(bookmakersOf(seen[0])).toEqual(["draftkings", "fanduel"]);
    expect(seen[0]).not.toMatch(/regions=/);
    const j = (await r.json()) as typeof body;
    expect(j[0].bookmakers.map((b) => b.key)).toEqual(["draftkings", "fanduel"]);
    expect(r.headers.get("x-requests-last")).toBe("3");
  });

  it("a run adds up x-requests-last and never fetches the same market twice", async () => {
    const f = vi.fn(async () => answer());
    vi.stubGlobal("fetch", f);
    const run = newOddsRun("r1");
    await withOddsRun(run, async () => {
      const a = `${BASE}/odds?regions=us,eu&markets=h2h,spreads,totals&apiKey=${KEY}`;
      const [x, y] = await Promise.all([oddsFetch(a), oddsFetch(a)]);
      expect(await x.json()).toEqual(await y.json());
      await oddsFetch(a);
      await oddsFetch(`${BASE}/events/e1/odds?regions=us&markets=player_pass_yds&apiKey=${KEY}`);
    });
    expect(f).toHaveBeenCalledTimes(2);
    expect(oddsRunSummary(run)).toMatchObject({ calls: 2, cacheHits: 2, credits: 6, unmetered: 0, remaining: 9000, used: 1000, urls: 2, regionFallback: false });
  });

  it("the tally and its URLs never hold the key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer()));
    const run = newOddsRun("r2");
    await withOddsRun(run, () => oddsFetch(`${BASE}/odds?regions=us&markets=h2h&apiKey=${KEY}`));
    expect(JSON.stringify([run.urls, [...run.memo.keys()], oddsRunSummary(run)])).not.toContain(KEY);
    expect(redactOddsUrl(`${BASE}/odds?apiKey=${KEY}&markets=h2h`)).toBe(`${BASE}/odds?apiKey=REDACTED&markets=h2h`);
  });

  it("stops spending when the run's budget is used up", async () => {
    const f = vi.fn(async () => answer({ last: "5" }));
    vi.stubGlobal("fetch", f);
    const run = newOddsRun("r3", 8);
    await withOddsRun(run, async () => {
      await oddsFetch(`${BASE}/events/a/odds?regions=us&markets=m&apiKey=${KEY}`);
      await oddsFetch(`${BASE}/events/b/odds?regions=us&markets=m&apiKey=${KEY}`);
      await expect(oddsFetch(`${BASE}/events/c/odds?regions=us&markets=m&apiKey=${KEY}`)).rejects.toBeInstanceOf(OddsBudgetError);
      /* an answer already in the run's memory is still free */
      expect((await oddsFetch(`${BASE}/events/a/odds?regions=us&markets=m&apiKey=${KEY}`)).ok).toBe(true);
    });
    expect(f).toHaveBeenCalledTimes(2);
    expect(run).toMatchObject({ credits: 10, refused: 1, cacheHits: 1 });
  });

  it("a failed pull is not remembered, and is counted as an error", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (++n === 1 ? answer({ status: 500, text: "boom", last: null }) : answer())));
    const run = newOddsRun("r4");
    const u = `${BASE}/odds?regions=us&markets=h2h&apiKey=${KEY}`;
    await withOddsRun(run, async () => {
      expect((await oddsFetch(u)).status).toBe(500);
      expect((await oddsFetch(u)).ok).toBe(true);
    });
    expect(run).toMatchObject({ calls: 2, errors: 1, credits: 3, cacheHits: 0 });
  });

  it("a call with no x-requests-last is counted as unmetered, not as free", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer({ last: null })));
    const run = newOddsRun("r5");
    await withOddsRun(run, () => oddsFetch(`${BASE}/odds?regions=us&markets=h2h&apiKey=${KEY}`));
    expect(run).toMatchObject({ calls: 1, credits: 0, unmetered: 1 });
  });

  it("a framework-cache replay (old date header) is not billed twice", async () => {
    const old = new Response(JSON.stringify(body), { status: 200, headers: { "x-requests-last": "3", date: new Date(Date.now() - 200_000).toUTCString() } });
    vi.stubGlobal("fetch", vi.fn(async () => old));
    const run = newOddsRun("r6");
    await withOddsRun(run, () => oddsFetch(`${BASE}/odds?regions=us&markets=h2h&apiKey=${KEY}`));
    expect(run).toMatchObject({ calls: 0, credits: 0, staleCacheReplays: 1 });
  });

  it("if the provider refuses bookmakers-only, retries once with regions=us beside the two books and remembers", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      seen.push(String(u));
      return /regions=/.test(String(u)) ? answer() : answer({ status: 422, text: '{"message":"Missing regions parameter"}', last: null });
    }));
    const run = newOddsRun("r7");
    await withOddsRun(run, async () => {
      expect((await oddsFetch(`${BASE}/odds?regions=us,eu&markets=h2h&apiKey=${KEY}`)).ok).toBe(true);
      expect((await oddsFetch(`${BASE}/events/z/odds?regions=us&markets=m&apiKey=${KEY}`)).ok).toBe(true);
    });
    expect(seen).toHaveLength(3);
    expect(seen[0]).not.toMatch(/regions=/);
    for (const u of seen.slice(1)) {
      expect(u).toMatch(/regions=us&bookmakers=draftkings,fanduel/);
      expect(bookmakersOf(u)).toEqual(["draftkings", "fanduel"]);
    }
    expect(run.regionFallback).toBe(true);
    expect(run.errors).toBe(1);
  });

  it("another host is passed straight through", async () => {
    const f = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", f);
    await oddsFetch("https://site.api.espn.com/apis/x?regions=us");
    expect(f).toHaveBeenCalledWith("https://site.api.espn.com/apis/x?regions=us", undefined);
  });
});
