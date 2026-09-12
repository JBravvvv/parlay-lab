import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { shapeAllowed } from "@/lib/server/odds-shape";
import { stripComments } from "./helpers/source";

/**
 * POLLER CONTINGENCY A + B (2026-08-02, §12Z shipped on the owner's word — public repo,
 * ungated /api/odds, unchanged priority).
 *
 * A — FIX THE FALLTHROUGH: an unauthenticated `fresh=1` serves CACHE instead of 401.
 *     Closes the billed surface: an unauthenticated caller can never force an upstream fetch.
 *     The 401 was also the mechanism that would KILL THE MORNING BATCH if APP_PASSCODE were
 *     ever set (snapshot_props retries 3x and returns empty — the Josh-block env-var warning);
 *     with A, setting the passcode later degrades unauthenticated fresh to cache instead of
 *     breaking collection. The degraded response carries `x-pl-stale: true` so a legitimate
 *     caller that silently lost freshness has a signal.
 * B — SHAPE ALLOW-LIST: the `markets × regions` product is validated against the two shapes
 *     this product actually uses. Bounds the cache-key attack (§3: ~34,000 credits/day
 *     admissible through arbitrary event ids × market products). B does not stop a caller
 *     using OUR exact shape — stated, not hidden; that is what C is for.
 *
 * OBSERVED RED 2026-08-02: this file ran against the route as it stood — the 401 branch
 * present, no allow-list, no odds-shape module — and failed on module-not-found first, then
 * the source assertions were checked against the pre-fix route text to confirm they would
 * have fired (the 401-absence case reds on the old text).
 */

const ev = (markets: string, regions: string) =>
  `https://api.the-odds-api.com/v4/sports/baseball_mlb/events/abc123/odds?markets=${markets}&regions=${regions}&oddsFormat=american`;

describe("B — the shape allow-list", () => {
  it("allows OUR props shape: six markets x regions=us", () => {
    expect(shapeAllowed(new URL(ev("batter_hits,batter_total_bases,batter_home_runs,batter_hits_runs_rbis,pitcher_strikeouts,pitcher_outs", "us")))).toBe(true);
    // subsets of the shape are the same billed product or less — allowed
    expect(shapeAllowed(new URL(ev("pitcher_outs", "us")))).toBe(true);
  });

  it("INSTRUCTION 34 (2026-09-04) — the ENGINE'S OWN props URL (SH_PROP_MARKETS + SH_PROP_ALT) passes; it was 403 since 08-02 and every device Refresh lost its props", () => {
    const eng = fs.readFileSync(path.join(process.cwd(), "legacy/index.html"), "utf8");
    const core = /var SH_PROP_MARKETS="([^"]+)"/.exec(eng)?.[1];
    const alt = /var SH_PROP_ALT="([^"]+)"/.exec(eng)?.[1];
    expect(core && alt, "engine market constants vanished — re-point this extraction").toBeTruthy();
    const u = new URL(`https://api.the-odds-api.com/v4/sports/baseball_mlb/events/abc/odds?regions=us&oddsFormat=american&markets=${core},${alt}&apiKey=`);
    expect(shapeAllowed(u)).toBe(true);
    // the ladders are still OUR shape only — widening the region on them is still a foreign product
    u.searchParams.set("regions", "us,eu");
    expect(shapeAllowed(u)).toBe(false);
  });
  it("allows the SharpDesk shape: h2h/spreads/totals x regions=us,eu", () => {
    expect(shapeAllowed(new URL(ev("h2h,spreads,totals", "us,eu")))).toBe(true);
  });

  it("allows the events LIST (no markets param) — the 1-credit class", () => {
    expect(shapeAllowed(new URL("https://api.the-odds-api.com/v4/sports/baseball_mlb/events?dateFormat=iso"))).toBe(true);
  });

  it("rejects a foreign market product — the cache-key attack surface", () => {
    expect(shapeAllowed(new URL(ev("player_points,player_rebounds", "us")))).toBe(false);
    // our markets on a widened region product = a different (larger) bill — rejected
    expect(shapeAllowed(new URL(ev("pitcher_outs", "us,eu,uk,au")))).toBe(false);
    // cross-pairing the two allowed shapes is neither shape
    expect(shapeAllowed(new URL(ev("h2h,spreads,totals", "us")))).toBe(false);
    expect(shapeAllowed(new URL(ev("batter_hits", "us,eu")))).toBe(false);
  });

  it("PLANT (invalid-by-value): a permissive list would pass the widened region", () => {
    expect(shapeAllowed(new URL(ev("pitcher_outs", "us,eu,uk,au"))), "the allow-list admits a widened region product").toBe(false);
  });
});

describe("A — the fallthrough, on the comment-stripped route", () => {
  const src = stripComments(readFileSync("app/api/odds/route.ts", "utf8"));

  it("the unauthenticated-fresh 401 is GONE — cache is served instead", () => {
    expect(
      /passcode required/.test(src),
      "the 401-on-fresh branch is back: an unauthenticated fresh=1 errors instead of degrading " +
        "to cache, and setting APP_PASSCODE would kill the morning batch again (the Josh-block " +
        "mechanism this ship removed)",
    ).toBe(false);
  });

  it("the degraded response is marked stale", () => {
    expect(/x-pl-stale/.test(src), "the silent-freshness-loss signal is gone").toBe(true);
  });

  it("the allow-list actually gates the route", () => {
    expect(/shapeAllowed/.test(src), "the route no longer consults the shape allow-list").toBe(true);
    expect(/shape not allowed|market shape/.test(src)).toBe(true);
  });

  it("the host pin and key handling are untouched", () => {
    expect(/api\.the-odds-api\.com/.test(src)).toBe(true);
    expect(/ODDS_API_KEY/.test(src)).toBe(true);
  });
});

/**
 * INSTRUCTION 51 (2026-09-11) — THE MLB LIVE IN-PLAY PULL, ADDED WITHOUT TOUCHING ANYTHING ABOVE.
 *
 * Josh, verbatim: "Authorize the live in-play odds pull for MLB". The second half of INSTRUCTION 50
 * item 2: actually pulling the in-play line and price so the board can print "over 3.5 at -145"
 * instead of suppressing a dead row.
 *
 * TWO CLAIMS THIS FILE IS THE RIGHT PLACE TO PIN:
 *
 *  1. THE NEW SHAPE NEEDS NO ALLOW-LIST CHANGE. The live per-event call asks the SIX core prop
 *     markets at `regions=us` — a strict SUBSET of `PROP_MARKETS` on a byte-equal region string —
 *     so `shapeAllowed` admits it on the first shape with `src/lib/server/odds-shape.ts` unedited.
 *     No `_alternate` ladder is requested in play: the three ladders are pre-kick Caesars milestone
 *     products this feature never reads, and nine markets instead of six is +50% spend for nothing.
 *     The widened-region PLANT above (the `us,eu,uk,au` case) is re-run against the LIVE shape here,
 *     so widening the allow-list to make the live pull "work" would be caught by both.
 *
 *  2. THE LIVE ROUTE DOES NOT GO THROUGH THIS PROXY. `/api/odds` caches for TTL_SECONDS = 240 and an
 *     unauthenticated `fresh=1` degrades to that cache (assertion A above is the mechanism). A live
 *     price served from a four-minute cache LOOKS live and is not — the exact dishonesty
 *     INSTRUCTION 50 existed to remove — so the live route reads `process.env.ODDS_API_KEY` in its
 *     own body and fetches the upstream directly with `cache: "no-store"`, exactly as
 *     `/api/generate` and `/api/propsnap` already do. Claim 1 is what makes re-routing it through
 *     the proxy a one-line change should that ever become desirable.
 *
 * NOTHING AT :33-97 IS EDITED. Those assertions pin the proxy's auth behaviour, which this build
 * does not weaken and does not touch.
 */

const LIVE_MARKETS =
  "batter_hits,batter_total_bases,batter_home_runs,batter_hits_runs_rbis,pitcher_strikeouts,pitcher_outs";
const liveEventOdds = (regions = "us") =>
  new URL(
    `https://api.the-odds-api.com/v4/sports/baseball_mlb/events/e51live/odds` +
      `?apiKey=&regions=${regions}&markets=${LIVE_MARKETS}&oddsFormat=american`,
  );

describe("INSTRUCTION 51 — the live in-play shape rides the EXISTING allow-list", () => {
  it("six core markets x regions=us passes with odds-shape.ts unchanged", () => {
    expect(shapeAllowed(liveEventOdds())).toBe(true);
    expect(LIVE_MARKETS.split(",")).toHaveLength(6);
    // in play we ask for the SIX core markets only — never the milestone ladders
    expect(LIVE_MARKETS).not.toMatch(/_alternate/);
  });

  it("the events LIST that bridges gkey -> oddsEventId is the no-market-product class", () => {
    expect(
      shapeAllowed(new URL("https://api.the-odds-api.com/v4/sports/baseball_mlb/events?apiKey=&dateFormat=iso")),
    ).toBe(true);
  });

  it("PLANT (invalid-by-value): the SAME six markets on a widened region is still a foreign product", () => {
    expect(
      shapeAllowed(liveEventOdds("us,eu")),
      "the allow-list admits the live shape on a widened region — a different, larger bill",
    ).toBe(false);
    expect(shapeAllowed(liveEventOdds("us,eu,uk,au"))).toBe(false);
  });

  it("odds-shape.ts itself did not move: still exactly the two shapes, props x us and sharp x us,eu", () => {
    const shape = stripComments(readFileSync("src/lib/server/odds-shape.ts", "utf8"));
    expect(shape).toMatch(/\{\s*markets:\s*PROP_MARKETS,\s*regions:\s*"us"\s*\}/);
    expect(shape).toMatch(/\{\s*markets:\s*SHARP_MARKETS,\s*regions:\s*"us,eu"\s*\}/);
    // no third shape was bolted on to admit the live pull
    expect((shape.match(/regions:\s*"/g) ?? []).length, "a shape was added or removed").toBe(2);
  });
});

describe("INSTRUCTION 51 — the live route bills directly, never through the 240s proxy cache", () => {
  /**
   * THE ROUTE IS THREE FILES, SO THE PIN READS THREE FILES (fix pass, 2026-09-11).
   *
   * These four assertions were written against a single-file route and went RED the moment the
   * build split it: `app/api/mlb/live-props/route.ts` is a 56-line auth-and-export shell, the host
   * literal is authored in `src/lib/mlb/live-props-rules.ts` (`MLB_LIVE_EVENTS_URL`) and
   * `process.env.ODDS_API_KEY` is read in `src/lib/server/mlb-live-quote.ts`. A pin that reds on a
   * correct build is worse than no pin: it trains you to ignore it. What the four checks are really
   * about is the BILLED SURFACE of the live pull — it must reach the upstream itself with a
   * server-side key, never hop the 240s /api/odds cache, and never carry a key literal — and that
   * surface is exactly these three files together, so they are concatenated and asserted as one.
   *
   * Read lazily and asserted, NOT at module scope: a throw in a describe body would take the
   * untouched proxy assertions above down with it, and those must keep reporting on their own.
   */
  const ROUTE = "app/api/mlb/live-props/route.ts";
  const SURFACE = [ROUTE, "src/lib/server/mlb-live-quote.ts", "src/lib/mlb/live-props-rules.ts"];
  const routeSrc = (): string => {
    for (const f of SURFACE) {
      expect(
        fs.existsSync(f),
        `${f} is absent — the live in-play pull this instruction authorises is not complete ` +
          "(the billed surface is the route shell + its body + its rules). Until it lands, these four pins are red BY DESIGN.",
      ).toBe(true);
    }
    return SURFACE.map((f) => stripComments(readFileSync(f, "utf8"))).join("\n");
  };

  it("it reaches the Odds API host itself, with the server-side key", () => {
    const src = routeSrc();
    expect(src).toMatch(/api\.the-odds-api\.com/);
    expect(src).toMatch(/ODDS_API_KEY/);
  });

  it("it does NOT hop through /api/odds — a four-minute cache would make a live price a lie", () => {
    expect(routeSrc()).not.toMatch(/\/api\/odds/);
  });

  it("no API key literal is committed in the route", () => {
    expect(routeSrc(), "an api key literal is baked into the route source").not.toMatch(/apiKey=[A-Za-z0-9]/);
  });

  it("PLANT (invalid-by-value): both route predicates fire on source that violates them", () => {
    const viaProxy = stripComments(
      `const r = await fetch("/api/odds?u=" + encodeURIComponent(u)); // proxied, cached 240s`,
    );
    expect(/\/api\/odds/.test(viaProxy), "the proxy-hop check cannot see a proxied fetch").toBe(true);
    const leaked = stripComments(
      `const u = "https://api.the-odds-api.com/v4/sports/baseball_mlb/events?apiKey=deadKeyLiteral99";`,
    );
    expect(/apiKey=[A-Za-z0-9]/.test(leaked), "the key-literal check cannot see a baked-in key").toBe(true);
  });
});
