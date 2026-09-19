import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { PropBoardGame, PropBoardRow } from "@/engine";
import { HR_MARKET, hrLineAllowed, liveMarketBoard, marketPhaseBoard, pruneHrLines } from "@/lib/mlb/market-board";
import type { LiveNowRead } from "@/lib/liveNow";
import { SETTLE_BOOK } from "@/lib/sportsbook/books";
import { stripComments } from "./helpers/source";

/**
 * THE HOME-RUN LINE RULE (2026-09-18, Josh, verbatim: "no HR bets shown EVER should be over 1.5 HR
 * unless its a live bet in which the player already has 1 HR live OR it is a manual filter by
 * myself to just look at grades on over 1.5 HRs pre game for funsies. Every bet should be over .5
 * HR or 1+HR. Either one.").
 *
 * The 7:03pm board that prompted it carried 34 HR rows for the one upcoming game — 18 at 0.5 and
 * 16 at 1.5 — and the ranked list's #1 pick was an O1.5 at +5500.
 */
const root = path.join(__dirname, "..");
const readSrc = (p: string) => stripComments(fs.readFileSync(path.join(root, p), "utf8"));
const now = Date.parse("2026-09-19T02:10:00Z"), at = new Date(now - 60_000).toISOString();
const hr = (p: string, ln: number, over: Partial<PropBoardRow> = {}): PropBoardRow => ({
  p, tm: "LAD", ln, lkey: `${p.toLowerCase().replace(/ /g, "")}|batter_home_runs|${ln}`, o: ln > 0.5 ? 6000 : 320, u: null, oBook: "DraftKings", uBook: null,
  cz: { o: ln > 0.5 ? 6000 : 320, u: null }, pO: null, fO: ln > 0.5 ? 1.5 : 22, books: 3, alt: ln > 0.5,
  bookQuotes: { o: { [SETTLE_BOOK]: { am: ln > 0.5 ? 6000 : 320, line: ln, book: SETTLE_BOOK, at } }, u: {} },
  ...over,
});
const upcoming: PropBoardGame = { game: "SF @ LAD", gkey: "sf-lad", start: new Date(now + 300_000).toISOString(), live: false,
  markets: { [HR_MARKET]: [hr("Freddie Freeman", 0.5), hr("Freddie Freeman", 1.5), hr("Shohei Ohtani", 0.5), hr("Shohei Ohtani", 1.5)], batter_hits: [hr("Mookie Betts", 1.5, { lkey: "mookiebetts|batter_hits|1.5" })] } };
const live: PropBoardGame = { ...upcoming, gkey: "min-laa", game: "MIN @ LAA · 🔴 Top 7th", live: true, start: new Date(now - 7_200_000).toISOString() };
const stateWith = (tallies: Record<string, number | null>): LiveNowRead =>
  ({ games: { 7: { priceable: true, live: true } }, legNow: (_pk: number, lkey: string) => { const v = tallies[lkey.split("|")[0]]; return v == null ? null : { val: v, txt: `${v} HR`, inning: 7 }; } } as unknown as LiveNowRead);

describe("hrLineAllowed", () => {
  it("0.5 always; above 0.5 only live with the homers already in the book, or under the manual filter", () => {
    expect(hrLineAllowed(HR_MARKET, 0.5, { live: false })).toBe(true);
    expect(hrLineAllowed(HR_MARKET, 1.5, { live: false })).toBe(false);
    expect(hrLineAllowed(HR_MARKET, 1.5, { live: false, altHr: true })).toBe(true);
    expect(hrLineAllowed(HR_MARKET, 1.5, { live: true, tally: null })).toBe(false);
    expect(hrLineAllowed(HR_MARKET, 1.5, { live: true, tally: 0 })).toBe(false);
    expect(hrLineAllowed(HR_MARKET, 1.5, { live: true, tally: 1 })).toBe(true);
    expect(hrLineAllowed(HR_MARKET, 2.5, { live: true, tally: 1 })).toBe(false);
    expect(hrLineAllowed(HR_MARKET, 2.5, { live: true, tally: 2 })).toBe(true);
    expect(hrLineAllowed("batter_hits", 1.5, { live: false })).toBe(true); // every other market keeps its ladder
  });
});

describe("pregame: the O1.5 rows are gone unless the manual filter is on", () => {
  it("pruneHrLines / marketPhaseBoard drop the 1.5s and leave every other market alone", () => {
    const pruned = pruneHrLines([upcoming]);
    expect(pruned[0].markets[HR_MARKET].map((r) => r.ln)).toEqual([0.5, 0.5]);
    expect(pruned[0].markets.batter_hits).toHaveLength(1);
    expect(marketPhaseBoard([upcoming], [], "pregame", now)[0].markets[HR_MARKET]).toHaveLength(2);
    expect(marketPhaseBoard([upcoming], [], "mixed", now)[0].markets[HR_MARKET]).toHaveLength(2);
    expect(marketPhaseBoard([upcoming], [], "pregame", now, { altHr: true })[0].markets[HR_MARKET]).toHaveLength(4);
    expect(upcoming.markets[HR_MARKET]).toHaveLength(4); // never mutated
  });
});

describe("live: an O1.5 stays only for a batter who already has one", () => {
  it("Freeman with a homer keeps his O1.5 (and loses the decided O0.5); Ohtani without one keeps only O0.5", () => {
    const out = liveMarketBoard([live], null, { "min-laa": { pk: 7 } }, stateWith({ freddiefreeman: 1, shoheiohtani: 0 }), now, 1_800_000);
    expect(out[0].markets[HR_MARKET].map((r) => `${r.p} ${r.ln}`)).toEqual(["Freddie Freeman 1.5", "Shohei Ohtani 0.5"]);
    expect(out[0].markets[HR_MARKET][0]).toMatchObject({ quoteAt: at, pO: null });
  });
  it("no boxscore read at all: only the 0.5s survive", () => {
    const out = liveMarketBoard([live], null, { "min-laa": { pk: 7 } }, stateWith({}), now, 1_800_000);
    expect(out[0].markets[HR_MARKET].map((r) => r.ln)).toEqual([0.5, 0.5]);
  });
});

describe("wiring — where the rule is applied", () => {
  const props = readSrc("app/props/page.tsx");
  const board = readSrc("app/board/page.tsx");
  it("the MLB desk's browse view carries the manual filter, and only the browse view", () => {
    expect(props).toMatch(/data-testid="hr-alt-filter"/);
    expect(props).toContain("Show O1.5 HR");
    expect(props).toMatch(/marketPhaseBoard\(propBoard,live,spec\.phase\?\?"pregame",at,\{altHr:altHr && cat===HR_MARKET\}\)/);
    /* the generator's pool and the ranked list are built by buildGenPool, which never passes altHr */
    expect(props).toMatch(/buildPool\(marketPhaseBoard\(propBoard,currentLive,sp\.phase\?\?"pregame",at\)/);
    expect(props).not.toMatch(/buildGenPool\([^)]*altHr/);
  });
  it("the Board's ALL scope applies it to its pregame prop rows", () => {
    expect(board).toMatch(/if \(!hrLineAllowed\(m, r\.ln, \{ live: false \}\)\) continue;/);
  });
});
