import { describe, expect, it } from "vitest";
import { decide } from "@/lib/anytime/engine";
import { FB_MODEL_FPI, FB_MODEL_MARKET, footballCandidates, footballModelOf, readTwoBooks } from "@/lib/anytime/football";
import { AZ_BOOKS } from "@/lib/az/books";
import { excludedBy } from "@/lib/az/exclusions";
import { noVig } from "@/lib/az/market";
import { CFB_LEAGUE } from "@/lib/cfb/rules";
import { toOddsEvent } from "@/lib/cfb/names";
import { normCdf } from "@/lib/cfb/normal";
import type { CfbGame } from "@/lib/cfb/types";
import { NFL_LEAGUE } from "@/lib/nfl/rules";
import { KICK, T0 } from "./helpers/anytime";

/* FOOTBALL GAME LINES, PRICED FROM DRAFTKINGS AND FANDUEL AND NOTHING ELSE. Every price is invented. */

type Mk = { key: string; outcomes: { name: string; price: number; point?: number }[] };
const HOME = "Arizona Cardinals";
const AWAY = "Seattle Seahawks";
const h2h = (home: number, away: number): Mk => ({ key: "h2h", outcomes: [{ name: HOME, price: home }, { name: AWAY, price: away }] });
const spreads = (line: number, home: number, away: number): Mk => ({ key: "spreads", outcomes: [{ name: HOME, price: home, point: line }, { name: AWAY, price: away, point: -line }] });
const totals = (line: number, over: number, under: number): Mk => ({ key: "totals", outcomes: [{ name: "Over", price: over, point: line }, { name: "Under", price: under, point: line }] });
const book = (key: string, markets: Mk[]) => ({ key, title: key, last_update: "2026-11-15T16:59:30Z", markets });

const DK = book("draftkings", [h2h(-150, 130), spreads(-3, -110, -110), totals(44.5, -110, -110)]);
const FD = book("fanduel", [h2h(-145, 125), spreads(-2.5, -120, 100), totals(45, -105, -115)]);
/* a third book with prices nothing like the other two: it must change nothing */
const CZ = book("williamhill_us", [h2h(400, -600), spreads(6.5, -110, -110), totals(51.5, -110, -110)]);

const oddsEvent = (bookmakers: unknown[], over: Record<string, unknown> = {}) => ({ id: "oe1", sport_key: "americanfootball_nfl", commence_time: KICK, home_team: HOME, away_team: AWAY, bookmakers, ...over });

function game(over: Record<string, unknown> = {}, fpi: { home: number | null; away: number | null } = { home: null, away: null }): CfbGame {
  return {
    id: "401772001",
    date: "2026-11-15",
    start: KICK,
    status: "upcoming",
    neutral: false,
    home: { id: "22", name: HOME, short: "Cardinals", abbr: "ARI", fpi: fpi.home },
    away: { id: "26", name: AWAY, short: "Seahawks", abbr: "SEA", fpi: fpi.away },
    oddsEventId: "oe1",
    rows: [],
    ...over,
  } as unknown as CfbGame;
}

const run = (bookmakers: unknown[], g: CfbGame = game(), league = NFL_LEAGUE, ev: Record<string, unknown> = {}) =>
  footballCandidates({ league, games: [g], oddsEvents: [oddsEvent(bookmakers, ev)], snapshotId: "nfl-r1", fetchedAt: T0 - 1_000 });
const picksOf = (out: ReturnType<typeof run>) => decide({ candidates: out.candidates, now: T0, runId: "r1", trigger: "manual-api", families: new Map(), excluded: excludedBy(), kellyBankroll: 100, kellyOpenByEvent: new Map() });
const S = NFL_LEAGUE.model.sigma;

describe("two books in, nothing else", () => {
  it("a third book in the feed changes no candidate, no probability and no quote", () => {
    expect(run([DK, FD, CZ])).toEqual(run([DK, FD]));
    expect(run([CZ, DK, FD, book("betmgm", [h2h(-300, 250)]), book("pinnacle", [h2h(-160, 145)])])).toEqual(run([DK, FD]));
  });

  it("only other books posting: no candidates at all", () => {
    const out = run([CZ, book("betmgm", [h2h(-150, 130)])]);
    expect(out.candidates).toEqual([]);
    expect(out.events).toEqual([]);
  });

  it("no candidate ever carries a quote from any book but the two", () => {
    for (const c of run([DK, FD, CZ]).candidates) for (const k of Object.keys(c.quotes)) expect(AZ_BOOKS).toContain(k);
    expect(Object.keys(readTwoBooks(toOddsEvent(oddsEvent([DK, FD, CZ]))!, S, S)).sort()).toEqual(["draftkings", "fanduel"]);
  });
});

describe("what a game turns into", () => {
  it("one candidate per side of each market at each exact line either book posts", () => {
    const out = run([DK, FD]);
    expect(out.candidates.map((c) => c.selection).sort()).toEqual(
      ["Cardinals ML", "Seahawks ML", "Cardinals -3", "Cardinals -2.5", "Seahawks +3", "Seahawks +2.5", "Over 44.5", "Over 45", "Under 44.5", "Under 45"].sort(),
    );
    expect(out.events).toEqual([{ sport: "nfl", eventId: "oe1", commence: KICK }]);
    expect(out.notes).toEqual([]);
  });

  it("a line is quoted only by the book that posts that line; the moneyline by both", () => {
    const by = Object.fromEntries(run([DK, FD]).candidates.map((c) => [c.selection, c]));
    expect(by["Cardinals -3"].quotes).toEqual({ draftkings: { price: -110, opp: -110, at: "2026-11-15T16:59:30Z" } });
    expect(by["Cardinals -2.5"].quotes).toEqual({ fanduel: { price: -120, opp: 100, at: "2026-11-15T16:59:30Z" } });
    expect(by["Seahawks +2.5"].quotes.fanduel).toMatchObject({ price: 100, opp: -120 });
    expect(by["Over 45"].quotes).toEqual({ fanduel: { price: -105, opp: -115, at: "2026-11-15T16:59:30Z" } });
    expect(by["Cardinals ML"].quotes).toMatchObject({ draftkings: { price: -150, opp: 130 }, fanduel: { price: -145, opp: 125 } });
    expect(by["Seahawks ML"].quotes).toMatchObject({ draftkings: { price: 130, opp: -150 }, fanduel: { price: 125, opp: -145 } });
  });

  it("each candidate carries what the engine and the grader need", () => {
    const c = run([DK, FD]).candidates.find((x) => x.selection === "Cardinals -3")!;
    expect(c).toMatchObject({
      sport: "nfl",
      eventId: "oe1",
      event: "Seahawks @ Cardinals",
      commence: KICK,
      market: "spread",
      marketType: "nfl:spread",
      side: "home",
      line: -3,
      snapshotId: "nfl-r1",
      fetchedAt: T0 - 1_000,
      live: false,
      gradeRef: { source: "espn", league: "nfl", id: "401772001", home: HOME, away: AWAY },
    });
  });

  it("college football uses its own league id and market types", () => {
    const out = run([DK, FD], game(), CFB_LEAGUE);
    expect(new Set(out.candidates.map((c) => c.sport))).toEqual(new Set(["cfb"]));
    expect(new Set(out.candidates.map((c) => c.marketType))).toEqual(new Set(["cfb:ml", "cfb:spread", "cfb:total"]));
  });
});

describe("the number, with no rating on either team: the two-book market and nothing else", () => {
  it("every candidate is stamped market-only", () => {
    for (const c of run([DK, FD]).candidates) expect([c.modelVersion, c.modelKind]).toEqual([FB_MODEL_MARKET, "market-only"]);
  });

  it("the win probability is the mean of the two books' own no-vig numbers", () => {
    const pDk = noVig(-150, 130)!.p;
    const pFd = noVig(-145, 125)!.p;
    const by = Object.fromEntries(run([DK, FD]).candidates.map((c) => [c.selection, c]));
    expect(by["Cardinals ML"].model.win).toBeCloseTo((pDk + pFd) / 2, 12);
    expect(by["Seahawks ML"].model.win).toBeCloseTo(1 - (pDk + pFd) / 2, 12);
    expect(by["Cardinals ML"].model.push).toBe(0);
  });

  it("a half-point difference in the line is not read as an edge: both books imply nearly the same margin", () => {
    const books = readTwoBooks(toOddsEvent(oddsEvent([DK, FD]))!, S, S);
    expect(books.draftkings!.spread!.mu).toBeCloseTo(3, 9); // -3 at -110/-110
    expect(books.fanduel!.spread!.mu).toBeGreaterThan(2.5); // -2.5 at -120 is worth more than 2.5
    expect(Math.abs(books.draftkings!.spread!.mu - books.fanduel!.spread!.mu)).toBeLessThan(0.5);
    const m = footballModelOf(game(), books, NFL_LEAGUE);
    expect(m.muMargin).toBeCloseTo((books.draftkings!.spread!.mu + books.fanduel!.spread!.mu) / 2, 12);
    expect(m.fpi).toBe(false);
  });

  it("an ordinary market with vig at both books produces no pick", () => {
    const d = picksOf(run([DK, FD]));
    expect(d.picks).toEqual([]);
    expect(d.rejects.every((r) => r.reason === "below_ev" || r.reason === "not_best_in_family")).toBe(true);
  });

  it("one book alone can never beat its own no-vig price: no pick", () => {
    expect(picksOf(run([DK])).picks).toEqual([]);
    expect(picksOf(run([FD])).picks).toEqual([]);
  });

  it("one book out of line with the other is a pick at the better price, recorded as price-based", () => {
    /* FanDuel has the home side at +100 while DraftKings has the away side at +130: each is the best
       price for its side, and each beats the two-book no-vig number. One pick a side, one book each. */
    const soft = book("fanduel", [h2h(100, -120), spreads(-2.5, -120, 100), totals(45, -105, -115)]);
    const { picks } = picksOf(run([DK, soft]));
    expect(picks.map((p) => [p.selection, p.book, p.price, p.otherPrice]).sort()).toEqual([
      ["Cardinals ML", "fanduel", 100, -150],
      ["Seahawks ML", "draftkings", 130, -120],
    ]);
    for (const p of picks) {
      expect(p).toMatchObject({ basis: "price", modelVersion: FB_MODEL_MARKET, fairN: 2 });
      expect(p.ev).toBeCloseTo(p.priceEv, 9);
    }
  });

  it("a slightly better price at one book, inside the vig, is not a pick", () => {
    const better = book("fanduel", [h2h(-140, 120), spreads(-2.5, -120, 100), totals(45, -105, -115)]);
    expect(picksOf(run([DK, better])).picks).toEqual([]);
  });

  it("totals: the mean of the two books' implied totals, over and under summing to one off the number", () => {
    const by = Object.fromEntries(run([DK, FD]).candidates.map((c) => [c.selection, c]));
    expect(by["Over 44.5"].model.win + by["Under 44.5"].model.win).toBeCloseTo(1, 12);
    expect(by["Over 44.5"].model.win).toBeGreaterThan(by["Over 45"].model.win);
    expect(by["Over 45"].model.push).toBeGreaterThan(0); // a whole number can land
    expect(by["Over 45"].model.win + by["Under 45"].model.win + by["Over 45"].model.push).toBeCloseTo(1, 12);
  });
});

describe("the number, with a rating on both teams", () => {
  const rated = game({}, { home: 5, away: -2 });

  it("sides are stamped with the rating model; totals stay market-only", () => {
    for (const c of run([DK, FD], rated).candidates) {
      if (c.market === "total") expect([c.modelVersion, c.modelKind]).toEqual([FB_MODEL_MARKET, "market-only"]);
      else expect([c.modelVersion, c.modelKind]).toEqual([FB_MODEL_FPI, "independent"]);
    }
  });

  it("the margin and win probability are the league's stated blend of market and rating", () => {
    const books = readTwoBooks(toOddsEvent(oddsEvent([DK, FD]))!, S, S);
    const M = NFL_LEAGUE.model;
    const m = footballModelOf(rated, books, NFL_LEAGUE);
    expect(m.fpiMargin).toBe(5 - -2 + M.hfa);
    const sb = M.spreadBlend;
    expect(m.muMargin).toBeCloseTo((sb.mkt * m.mktMargin! + sb.fpi * m.fpiMargin!) / (sb.mkt + sb.fpi), 12);
    const b = M.blend;
    const p = (b.mkt * m.mktPHome! + b.spread * normCdf(m.mktMargin! / S) + b.fpi * normCdf(m.fpiMargin! / S)) / (b.mkt + b.spread + b.fpi);
    expect(m.pHome).toBeCloseTo(p, 12);
    expect(m.muTotal).toBe(m.mktTotal);
    expect(m.fpi).toBe(true);
  });

  it("a neutral field takes the home edge out; a rating on one team only is no rating", () => {
    const books = readTwoBooks(toOddsEvent(oddsEvent([DK, FD]))!, S, S);
    expect(footballModelOf(game({ neutral: true }, { home: 5, away: -2 }), books, NFL_LEAGUE).fpiMargin).toBe(7);
    const half = footballModelOf(game({}, { home: 5, away: null }), books, NFL_LEAGUE);
    expect(half).toMatchObject({ fpi: false, fpiMargin: null });
    expect(half.muMargin).toBe(half.mktMargin);
  });

  it("no moneyline posted: no win probability is made up from the rating alone", () => {
    const noMl = [book("draftkings", [spreads(-3, -110, -110)]), book("fanduel", [spreads(-2.5, -120, 100)])];
    const out = run(noMl, rated);
    expect(out.candidates.some((c) => c.market === "ml")).toBe(false);
    expect(out.candidates.every((c) => c.market === "spread")).toBe(true);
  });
});

describe("what it refuses", () => {
  it("a game that is live, final or postponed gives no candidates", () => {
    for (const status of ["live", "final", "postponed"]) {
      const out = run([DK, FD], game({ status }));
      expect(out.candidates, status).toEqual([]);
      expect(out.events, status).toEqual([]);
    }
  });

  it("the start it guards on is the EARLIER of the schedule's kickoff and the feed's commence time", () => {
    const earlyEspn = "2026-11-15T21:05:00Z";
    expect(run([DK, FD], game({ start: earlyEspn })).candidates[0].commence).toBe(earlyEspn);
    const lateEspn = "2026-11-15T22:00:00Z";
    expect(run([DK, FD], game({ start: lateEspn })).candidates[0].commence).toBe(KICK);
    expect(run([DK, FD], game({ start: "not a date" })).candidates[0].commence).toBe(KICK);
  });

  it("a scheduled game the odds feed did not match is counted in a note, never priced", () => {
    const out = footballCandidates({ league: NFL_LEAGUE, games: [game({ oddsEventId: null }), game({ id: "x", oddsEventId: "gone" })], oddsEvents: [oddsEvent([DK, FD])], snapshotId: "s", fetchedAt: T0 });
    expect(out.candidates).toEqual([]);
    expect(out.notes).toEqual(["nfl: 2 scheduled game(s) had no odds event"]);
  });

  it("a quote that is not a real price, or whose two sides disagree on the line, is dropped", () => {
    const bad = book("draftkings", [
      h2h(50, -150), // not an American price
      { key: "spreads", outcomes: [{ name: HOME, price: -110, point: -3 }, { name: AWAY, price: -110, point: 2.5 }] }, // sides are different lines
      { key: "totals", outcomes: [{ name: "Over", price: -110, point: 44.5 }, { name: "Under", price: -110, point: 45.5 }] },
    ]);
    expect(run([bad]).candidates).toEqual([]);
    const half = book("draftkings", [{ key: "h2h", outcomes: [{ name: HOME, price: -150 }] }, spreads(-3, -110, -110)]);
    expect(run([half]).candidates.map((c) => c.market)).toEqual(["spread", "spread"]);
  });

  it("a malformed odds event is ignored", () => {
    const out = footballCandidates({ league: NFL_LEAGUE, games: [game()], oddsEvents: [null, "x", { id: "oe1" }, { id: "oe1", commence_time: "nope", home_team: HOME, away_team: AWAY }], snapshotId: "s", fetchedAt: T0 });
    expect(out.candidates).toEqual([]);
    expect(out.notes).toEqual(["nfl: 1 scheduled game(s) had no odds event"]);
  });
});
