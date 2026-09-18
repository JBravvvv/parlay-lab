import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { findGameSplits, mlbLegSplit, parseConsensus, sideSplit, splitText, teamKeys } from "../src/lib/splits";

/**
 * BETTING SPLITS (2026-09-18) — the parser reads REAL scoresandodds.com consensus markup saved on
 * 2026-09-18 (tests/fixtures/consensus-*.html, trimmed to the first cards) and every number below
 * is one the page printed. Left pennant = away, right = home (verified against the MLB statsapi
 * schedule that day: Cubs @ Reds drew CHC left, CIN right).
 */
const fx = (n: string) => fs.readFileSync(path.join(process.cwd(), "tests/fixtures", n), "utf8");

describe("splits — parseConsensus reads the page's own bars", () => {
  const nfl = parseConsensus(fx("consensus-nfl.html"), "nfl");
  it("folds the three market cards of one event onto one game, away left / home right", () => {
    const g = nfl.find((x) => x.id === "35985370")!;
    expect(g).toBeTruthy();
    expect(g.away).toEqual({ abbr: "GB", name: "Packers" });
    expect(g.home).toEqual({ abbr: "NYJ", name: "Jets" });
    expect(g.kickoff).toBe("2026-09-20T17:00:00Z");
    expect(g.markets.spread).toEqual({ a: { bets: 77, money: 61 }, b: { bets: 23, money: 39 }, line: -3.5 });
    expect(g.markets.total).toEqual({ a: { bets: 21, money: 24 }, b: { bets: 79, money: 76 }, line: 44.5 });
  });
  it("reads a bar whose label is blank (&nbsp; under 10%) off its width", () => {
    const g = nfl.find((x) => x.id === "35985370")!;
    expect(g.markets.moneyline).toEqual({ a: { bets: 91, money: 91 }, b: { bets: 9, money: 9 }, line: null });
  });
  it("parses the MLB page the same way (run line = spread) and the NCAAF page (school names)", () => {
    const mlb = parseConsensus(fx("consensus-mlb.html"), "mlb");
    const cubs = mlb.find((g) => g.away.abbr === "CHC")!;
    expect(cubs.home.abbr).toBe("CIN");
    expect(cubs.away.name).toBe("Cubs");
    expect(Object.keys(cubs.markets).sort()).toEqual(["moneyline", "spread", "total"]);
    for (const g of mlb) for (const m of Object.values(g.markets)) {
      expect(m.a.bets + m.b.bets).toBeGreaterThanOrEqual(99);
      expect(m.a.bets + m.b.bets).toBeLessThanOrEqual(101);
    }
    const ncaaf = parseConsensus(fx("consensus-ncaaf.html"), "ncaaf");
    expect(ncaaf.length).toBeGreaterThan(0);
    expect(ncaaf.every((g) => g.away.name && g.home.name)).toBe(true);
  });
  it("returns nothing, never a guess, for markup it does not recognise", () => {
    expect(parseConsensus("<html><body>nope</body></html>", "nfl")).toEqual([]);
    expect(parseConsensus('<div class="trend-card consensus consensus-table-spread--0"><div class="event-header"></div></div>', "nfl")).toEqual([]);
  });
});

describe("splits — matching a desk game and reading one side", () => {
  const nfl = parseConsensus(fx("consensus-nfl.html"), "nfl");
  const feed = { games: nfl };
  it("matches by ESPN abbreviation, by full name, by nickname, and through the alias table", () => {
    const byAbbr = findGameSplits(feed, { abbr: "GB" }, { abbr: "NYJ" });
    expect(byAbbr?.id).toBe("35985370");
    expect(findGameSplits(feed, { name: "Green Bay Packers" }, { name: "New York Jets" })?.id).toBe("35985370");
    expect(findGameSplits(feed, { abbr: "GNB", short: "Green Bay" }, { abbr: "NYJ", short: "NY Jets" })?.id).toBe("35985370");
    // a swapped pair (neutral site) still lands on the game
    expect(findGameSplits(feed, { abbr: "NYJ" }, { abbr: "GB" })?.id).toBe("35985370");
    expect(findGameSplits(feed, { abbr: "GB" }, { abbr: "DAL" })).toBeNull();
    expect(findGameSplits(null, { abbr: "GB" }, { abbr: "NYJ" })).toBeNull();
  });
  it("sideSplit hands back the pick's own bar — away/over = a, home/under = b — and null off the page", () => {
    const g = findGameSplits(feed, { abbr: "GB" }, { abbr: "NYJ" })!;
    expect(sideSplit(g, "spread", "away")).toEqual({ bets: 77, money: 61 });
    expect(sideSplit(g, "spread", "home")).toEqual({ bets: 23, money: 39 });
    expect(sideSplit(g, "total", "over")).toEqual({ bets: 21, money: 24 });
    expect(sideSplit(g, "total", "under")).toEqual({ bets: 79, money: 76 });
    expect(sideSplit(g, "ml", "away")).toEqual({ bets: 91, money: 91 });
    expect(sideSplit(g, "ml", "over")).toBeNull();
    expect(sideSplit(null, "ml", "away")).toBeNull();
    expect(splitText({ bets: 77, money: 61 })).toBe("77% bets · 61% $");
  });
  it("teamKeys carries the two-word nicknames whole (Red Sox, Blue Jays) and strips a parenthetical", () => {
    expect(teamKeys({ name: "Boston Red Sox" }).has("redsox")).toBe(true);
    expect(teamKeys({ name: "Miami (FL)" }).has("miami")).toBe(true);
    expect(teamKeys({ abbr: "ATH" }).has("oak")).toBe(true);
  });
});

describe("splits — MLB engine legs (label + gkey) find their bar", () => {
  const feed = { games: parseConsensus(fx("consensus-mlb.html"), "mlb") };
  it("an ML leg reads the moneyline bar for its own club; an RL leg the run-line bar; a prop gets nothing", () => {
    const cubs = feed.games.find((g) => g.away.abbr === "CHC")!;
    const ml = mlbLegSplit(feed, { label: "Chicago Cubs ML", sub: "ML", gkey: "chicagocubs@cincinnatireds" });
    expect(ml).toEqual(cubs.markets.moneyline!.a);
    const reds = mlbLegSplit(feed, { label: "Cincinnati Reds RL", sub: "RL +1.5", gkey: "chicagocubs@cincinnatireds" });
    expect(reds).toEqual(cubs.markets.spread!.b);
    expect(mlbLegSplit(feed, { label: "Seiya Suzuki", sub: "H+R+RBI O 1.5", gkey: "chicagocubs@cincinnatireds" })).toBeNull();
    expect(mlbLegSplit(feed, { label: "Chicago Cubs ML", sub: "ML", gkey: null })).toBeNull();
    // a doubleheader gkey ("… gm2") still names the clubs
    expect(mlbLegSplit(feed, { label: "Chicago Cubs ML", sub: "ML", gkey: "chicagocubs@cincinnatireds gm2" })).toEqual(cubs.markets.moneyline!.a);
  });
});

describe("splits — the route and the chip are honest about the source", () => {
  const route = fs.readFileSync(path.join(process.cwd(), "app/api/splits/route.ts"), "utf8");
  const chip = fs.readFileSync(path.join(process.cwd(), "src/components/ui/SplitsChip.tsx"), "utf8");
  it("the route reads scoresandodds only, caches ten minutes, and returns an EMPTY feed on failure", () => {
    expect(route).toMatch(/SPLITS_SOURCE_URL\(league\)/);
    expect(route).toMatch(/const TTL_SEC = 600;/);
    expect(route).toMatch(/games: \[\]/);
    expect(route).not.toMatch(/the-odds-api|api\.the-odds-api\.com/);
  });
  it("the chip renders nothing without a split and names the consensus source in its title", () => {
    expect(chip).toMatch(/if \(!split\) return null;/);
    expect(chip).toMatch(/scoresandodds\.com \/ Action Network/);
    expect(chip).toMatch(/data-splits-chip/);
  });
});
