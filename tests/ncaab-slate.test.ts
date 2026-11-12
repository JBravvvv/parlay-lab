import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AZ_BOOKS } from "@/lib/az/books";
import { excludedBy } from "@/lib/az/exclusions";
import { amDec, noVig } from "@/lib/az/market";
import { NCAAB_ID, NCAAB_LINES, NCAAB_MODEL_MARKET, NCAAB_ODDS_URL, NCAAB_ESPN_QUERY, NCAAB_ESPN_SCOREBOARD } from "@/lib/ncaab/rules";
import { boardRows, buildNcaabSlate, flipGame, ncaabCandidates, parseEspnGame, parseEspnGames, rowOf, tieOdds, type NcaabGame, type NcaabSlateInput } from "@/lib/ncaab/slate";
import { dayChips, ncaabViewOf, noLineReason, rowGroups, sectionsOf, slateLine, tabNameOf, tipLabel } from "@/lib/ncaab/view";

/**
 * THE COLLEGE BASKETBALL DESK — the pure half (2026-11-12, Josh: "Add NCAAB to the site").
 *
 * The schedule fixtures are real rows trimmed from ESPN's public scoreboard for 2026-11-11 and
 * 2026-11-12. The odds fixture is SYNTHETIC: The Odds API's shape with invented prices, built on
 * those real team names. It holds one game at both books on the same lines, one at both books on
 * different lines, one at a single book, one the odds feed lists the other way round (a neutral
 * site), one with a price that beats the fair number, a third book that must be ignored, an event
 * with no scheduled game, one already in play and one listed far ahead. No network anywhere.
 */

const fx = (f: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests/fixtures/ncaab", f), "utf8"));
const ESPN_12: unknown[] = fx("espn-scoreboard-2026-11-12.json").events;
const ESPN_11: unknown[] = fx("espn-scoreboard-2026-11-11.json").events;
const ESPN = [...ESPN_12, ...ESPN_11];
const ODDS: unknown[] = fx("odds-ncaab.synthetic.json");
const NOW = Date.parse("2026-11-12T21:00:00Z");
const DATE = "2026-11-12";

const slateOf = (over: Partial<NcaabSlateInput> = {}) => buildNcaabSlate({ date: DATE, espnEvents: ESPN, oddsEvents: ODDS, oddsMissing: false, quota: null, now: NOW, ttlSec: 240, ...over });
const game = (s: ReturnType<typeof slateOf>, id: string) => s.games.find((g) => g.id === id)!;
const row = (s: ReturnType<typeof slateOf>, id: string, market: string, side: string, line?: number) => game(s, id).rows.find((r) => r.market === market && r.side === side && (line == null || r.line === line))!;

const PSU = "401917176";
const IND = "401916288";
const PFW = "401928818";
const SJSU = "401911471";
const COPPIN = "401925631";
const MASON = "401920073";
const JWU = "401923400";

/* a hand-built ESPN event, for the cases the real day did not have */
type Over = { name?: string; state?: string; completed?: boolean; home?: string | number; away?: string | number; date?: string; detail?: string };
const espnEvent = (id: string, o: Over = {}) => ({
  id,
  date: o.date ?? "2026-11-12T23:00Z",
  competitions: [
    {
      date: o.date ?? "2026-11-12T23:00Z",
      neutralSite: false,
      competitors: [
        { homeAway: "home", score: o.home ?? "0", curatedRank: { current: 99 }, records: [{ type: "total", summary: "1-1" }], team: { id: "1", displayName: "Home State Lions", shortDisplayName: "Home St", abbreviation: "HSL", logo: null } },
        { homeAway: "away", score: o.away ?? "0", curatedRank: { current: 7 }, records: [], team: { id: "2", displayName: "Away Tech Bears", shortDisplayName: "Away Tech", abbreviation: "ATB" } },
      ],
      status: { type: { name: o.name ?? "STATUS_SCHEDULED", state: o.state ?? "pre", completed: o.completed ?? false, shortDetail: o.detail ?? "detail" } },
    },
  ],
});

describe("the schedule: one ESPN event → one game", () => {
  it("reads a real scheduled row: teams, ids, start, Pacific date, no score before the tip", () => {
    const g = parseEspnGames(ESPN_12).find((x) => x.id === PSU)!;
    expect(g).toMatchObject({ id: PSU, start: "2026-11-12T23:30:00.000Z", date: "2026-11-12", status: "upcoming", neutral: false, oddsEventId: null });
    expect(g.home).toMatchObject({ name: "Penn State Nittany Lions", short: "Penn State", rank: null, score: null, fpi: null });
    expect(g.away).toMatchObject({ name: "Mercyhurst Lakers", short: "Mercyhurst", score: null });
    expect(g.home.logo).toMatch(/^https:\/\/a\.espncdn\.com\//);
  });

  it("ESPN's \"0\" before the tip is no score, and a live or final score is a number", () => {
    expect(parseEspnGame(espnEvent("x"))!.home.score).toBeNull();
    expect(parseEspnGame(espnEvent("x"))!.away.score).toBeNull();
    const live = parseEspnGames(ESPN_12).find((x) => x.id === MASON)!;
    expect([live.status, live.home.score, live.away.score, live.neutral]).toEqual(["live", 42, 35, true]);
    const fin = parseEspnGames(ESPN_11).find((x) => x.id === "401918054")!;
    expect([fin.status, fin.home.score, fin.away.score]).toEqual(["final", 65, 77]);
  });

  it("a late tip belongs to the Pacific day it is played on, not ESPN's or UTC's", () => {
    /* 2026-11-12T04:00Z is 8 PM Pacific on the 11th; 2026-11-13T03:00Z is 7 PM Pacific on the 12th */
    expect(parseEspnGames(ESPN_11).find((x) => x.id === "401918054")!.date).toBe("2026-11-11");
    expect(parseEspnGames(ESPN_12).find((x) => x.id === SJSU)!.date).toBe("2026-11-12");
  });

  it("a rank is 1 to 25 or nothing (ESPN writes 99 for unranked)", () => {
    expect(parseEspnGames(ESPN_11).find((x) => x.id === "401918054")!.away.rank).toBe(21);
    expect(parseEspnGame(espnEvent("x"))!.home.rank).toBeNull();
    expect(parseEspnGame(espnEvent("x"))!.away.rank).toBe(7);
    expect(parseEspnGame(espnEvent("x"))!.home.record).toBe("1-1");
    expect(parseEspnGame(espnEvent("x"))!.away.record).toBeNull();
  });

  it("the record shown is the overall one, wherever ESPN lists it", () => {
    const raw = JSON.parse(JSON.stringify(espnEvent("y")));
    raw.competitions[0].competitors[0].records = [{ type: "home", summary: "9-0" }, { type: "total", summary: "11-4" }];
    raw.competitions[0].competitors[1].records = [{ type: "road", summary: "3-2" }];
    expect(parseEspnGame(raw)!.home.record).toBe("11-4");
    expect(parseEspnGame(raw)!.away.record).toBeNull();
  });

  it.each([
    ["STATUS_SCHEDULED", "pre", false, "upcoming"],
    ["STATUS_IN_PROGRESS", "in", false, "live"],
    ["STATUS_HALFTIME", "in", false, "live"],
    ["STATUS_FINAL", "post", true, "final"],
    ["STATUS_POSTPONED", "post", false, "postponed"],
    ["STATUS_POSTPONED", "pre", false, "postponed"],
    ["STATUS_CANCELED", "post", false, "cancelled"],
    ["STATUS_CANCELLED", "post", true, "cancelled"],
    ["STATUS_SUSPENDED", "post", false, "postponed"],
    ["STATUS_SOMETHING_NEW", "post", false, "postponed"],
    ["STATUS_SOMETHING_NEW", "", false, "postponed"],
  ])("%s / %s / completed %s is %s", (name, state, completed, want) => {
    expect(parseEspnGame(espnEvent("x", { name, state, completed, home: 70, away: 60 }))!.status).toBe(want);
  });

  it("a game called final with a score missing is not a result", () => {
    const g = parseEspnGame(espnEvent("x", { name: "STATUS_FINAL", state: "post", completed: true, home: "", away: 61 }))!;
    expect(g.status).toBe("postponed");
    expect([g.home.score, g.away.score]).toEqual([null, null]);
  });

  it("an event that is not a readable two-team game is dropped, never guessed at", () => {
    const base = espnEvent("x");
    expect(parseEspnGame(null)).toBeNull();
    expect(parseEspnGame({})).toBeNull();
    expect(parseEspnGame({ ...base, id: 5 })).toBeNull();
    expect(parseEspnGame({ ...base, competitions: [] })).toBeNull();
    expect(parseEspnGame({ ...base, date: "soon", competitions: [{ ...base.competitions[0], date: "soon" }] })).toBeNull();
    expect(parseEspnGame({ ...base, competitions: [{ ...base.competitions[0], competitors: base.competitions[0].competitors.slice(0, 1) }] })).toBeNull();
    const noName = structuredClone(base);
    (noName.competitions[0].competitors[1].team as { displayName?: string }).displayName = undefined;
    expect(parseEspnGame(noName)).toBeNull();
  });

  it("a game is listed once, and the list is in tip order", () => {
    const games = parseEspnGames([...ESPN_12, ...ESPN_12, ...ESPN_11]);
    expect(games).toHaveLength(15);
    expect(new Set(games.map((g) => g.id)).size).toBe(15);
    const starts = games.map((g) => Date.parse(g.start));
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});

describe("tying a scheduled game to its odds event", () => {
  const games = parseEspnGames(ESPN_12);
  const tied = tieOdds(games, ODDS);
  const by = (id: string) => tied.games.find((g) => g.id === id)!;

  it("ties by team names, through an accent the odds feed does not write", () => {
    expect(by(PSU).oddsEventId).toMatch(/01$/);
    expect(by(IND).oddsEventId).toMatch(/02$/);
    expect(by(PFW).oddsEventId).toMatch(/03$/);
    expect(by(SJSU).home.name).toBe("San José State Spartans");
    expect(by(SJSU).oddsEventId).toMatch(/04$/);
  });

  it("a game the odds feed lists the other way round is tied and turned to the odds feed's order", () => {
    const before = games.find((g) => g.id === COPPIN)!;
    expect([before.home.name, before.away.name]).toEqual(["Coppin State Eagles", "Bradley Braves"]);
    const g = by(COPPIN);
    expect(g.oddsEventId).toMatch(/05$/);
    expect(g.flipped).toBe(true);
    expect([g.home.name, g.away.name]).toEqual(["Bradley Braves", "Coppin State Eagles"]);
    expect(by(PSU).flipped).toBeUndefined();
  });

  it("a game neither book lists stays untied, and an odds event with no game is counted", () => {
    expect(by(JWU).oddsEventId).toBeNull();
    /* the invented Pandas-Owls event and the far-ahead Duke-Kansas one have no row on this day */
    expect(tied.unmatchedOdds).toBe(2);
  });

  it("no odds event is ever used twice", () => {
    const doubled = tieOdds([...games, ...games.map((g) => ({ ...g, id: `${g.id}-copy` }))], ODDS);
    const ids = doubled.games.map((g) => g.oddsEventId).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("a postponed or cancelled game is never tied", () => {
    const off = games.map((g): NcaabGame => (g.id === PSU ? { ...g, status: "postponed" } : g.id === IND ? { ...g, status: "cancelled" } : g));
    const t = tieOdds(off, ODDS);
    expect(t.games.find((g) => g.id === PSU)!.oddsEventId).toBeNull();
    expect(t.games.find((g) => g.id === IND)!.oddsEventId).toBeNull();
    expect(t.unmatchedOdds).toBe(4);
  });

  it("a turned-round tie cannot take the odds event of a game listed the usual way", () => {
    /* two schedule rows for the same pair, the first one the wrong way round: the right-way row must get the event */
    const right = games.find((g) => g.id === PSU)!;
    const wrong = { ...flipGame(right), id: "wrong-way", flipped: undefined };
    const t = tieOdds([wrong, right], ODDS);
    expect(t.games.find((g) => g.id === PSU)!.oddsEventId).toMatch(/01$/);
    expect(t.games.find((g) => g.id === "wrong-way")!.oddsEventId).toBeNull();
  });

  it("flipping twice is the game it started as", () => {
    const g = games.find((x) => x.id === PSU)!;
    const back = flipGame(flipGame(g));
    expect([back.home.name, back.away.name, back.flipped]).toEqual([g.home.name, g.away.name, false]);
  });
});

describe("the slate the desk shows", () => {
  const s = slateOf();

  it("holds the date's games only, with the counts it reports", () => {
    expect(s).toMatchObject({ sport: "ncaab", date: DATE, oddsMissing: false, ttlSec: 240, generatedAt: "2026-11-12T21:00:00.000Z" });
    expect(s.games).toHaveLength(10);
    expect(s.games.every((g) => g.date === DATE)).toBe(true);
    expect(s.priced).toBe(5);
    expect(s.unpriced).toBe(4);
    const y = slateOf({ date: "2026-11-11" });
    expect(y.games.map((g) => g.status)).toEqual(["final", "final", "final", "final", "final"]);
    expect([y.priced, y.unpriced]).toEqual([0, 0]);
  });

  it("prices only a game that has not tipped: the one in play carries no line though the feed still lists it", () => {
    expect(game(s, MASON).status).toBe("live");
    expect(game(s, MASON).oddsEventId).toMatch(/07$/);
    expect(game(s, MASON).rows).toEqual([]);
    expect(s.games.filter((g) => g.rows.length).every((g) => g.status === "upcoming" && Date.parse(g.start) > NOW)).toBe(true);
  });

  it("the clock decides too: a game ESPN still calls scheduled after its tip time gets no line", () => {
    const late = slateOf({ now: Date.parse("2026-11-12T23:45:00Z") });
    expect(game(late, PSU).status).toBe("upcoming");
    expect(game(late, PSU).rows).toEqual([]);
    expect(game(late, SJSU).rows.length).toBeGreaterThan(0);
  });

  it("both books on the same lines: six rows, both prices on each, the better one named", () => {
    const rows = game(s, PSU).rows;
    expect(rows.map((r) => `${r.market}:${r.side}:${r.line}`)).toEqual(["spread:away:18.5", "spread:home:-18.5", "total:over:141.5", "total:under:141.5", "ml:away:null", "ml:home:null"]);
    expect(rows.every((r) => r.books === 2)).toBe(true);
    expect(row(s, PSU, "spread", "home")).toMatchObject({ selection: "Penn State -18.5", prices: { draftkings: -110, fanduel: -105 }, best: { book: "fanduel", price: -105 } });
    expect(row(s, PSU, "spread", "away")).toMatchObject({ selection: "Mercyhurst +18.5", prices: { draftkings: -110, fanduel: -115 }, best: { book: "draftkings", price: -110 } });
    expect(row(s, PSU, "total", "over")).toMatchObject({ selection: "Over 141.5", best: { book: "draftkings", price: -110 } });
    expect(row(s, PSU, "ml", "away")).toMatchObject({ selection: "Mercyhurst ML", prices: { draftkings: 1200, fanduel: 1300 }, best: { book: "fanduel", price: 1300 } });
  });

  it("the fair number is the mean of the two books' no-vig prices, and the edge is the better price against it", () => {
    for (const side of ["home", "away"] as const) {
      const r = row(s, SJSU, "ml", side);
      const [dk, fd] = side === "home" ? [noVig(-140, 120)!.p, noVig(-125, 135)!.p] : [noVig(120, -140)!.p, noVig(135, -125)!.p];
      expect(r.fair).toBeCloseTo((dk + fd) / 2, 10);
      expect(r.ev).toBeCloseTo(r.fair * amDec(r.best.price) - 1, 10);
    }
    expect(row(s, SJSU, "ml", "home").fair + row(s, SJSU, "ml", "away").fair).toBeCloseTo(1, 10);
    /* same line at both books: the fair number is the two no-vig prices averaged (to within the curve's bend) */
    const sp = row(s, PSU, "spread", "home");
    expect(sp.fair).toBeCloseTo((noVig(-110, -110)!.p + noVig(-105, -115)!.p) / 2, 4);
    expect(sp.ev).toBeCloseTo(sp.fair * amDec(-105) - 1, 10);
  });

  it("on every row the edge is that row's own fair number at that row's own better price", () => {
    const rows = s.games.flatMap((g) => g.rows);
    expect(rows).toHaveLength(34);
    for (const r of rows) {
      /* every line in the fixture is a half point or a moneyline, so there is no push to carry */
      expect(r.ev, r.selection).toBeCloseTo(r.fair * amDec(r.best.price) - 1, 10);
      expect(r.best.price, r.selection).toBe(Math.max(...Object.values(r.prices).map((p) => amDec(p))) === amDec(r.prices[r.best.book]!) ? r.prices[r.best.book] : NaN);
    }
    /* a tie in price goes to DraftKings */
    expect(row(s, PSU, "total", "over").prices).toEqual({ draftkings: -110, fanduel: -112 });
    expect(row(s, COPPIN, "spread", "away").best).toEqual({ book: "draftkings", price: -110 });
  });

  it("an ordinary vigged market shows a negative edge on every side: nothing is dressed up", () => {
    for (const id of [PSU, IND, PFW, COPPIN]) expect(game(s, id).rows.every((r) => r.ev < 0), id).toBe(true);
  });

  it("a price that beats the fair number shows as a positive edge at the book that pays it", () => {
    expect(row(s, SJSU, "ml", "away")).toMatchObject({ selection: "UC Riverside ML", best: { book: "fanduel", price: 135 } });
    expect(row(s, SJSU, "ml", "away").ev).toBeGreaterThan(0.02);
    expect(row(s, SJSU, "ml", "home")).toMatchObject({ selection: "San José St ML", best: { book: "fanduel", price: -125 } });
    expect(row(s, SJSU, "ml", "home").ev).toBeGreaterThan(0.005);
  });

  it("the books on different lines: each line is its own row with the one book that posts it, and a half point is not an edge", () => {
    const rows = game(s, IND).rows;
    expect(rows.map((r) => `${r.market}:${r.side}:${r.line}`)).toEqual([
      "spread:away:21.5",
      "spread:home:-21.5",
      "spread:away:22.5",
      "spread:home:-22.5",
      "total:over:150.5",
      "total:under:150.5",
      "total:over:151.5",
      "total:under:151.5",
    ]);
    expect(rows.every((r) => r.books === 1 && Object.keys(r.prices).length === 1)).toBe(true);
    expect(row(s, IND, "spread", "home", -21.5).prices).toEqual({ draftkings: -110 });
    expect(row(s, IND, "spread", "home", -22.5).prices).toEqual({ fanduel: -104 });
    expect(rows.every((r) => r.ev < 0)).toBe(true);
    /* the shorter line is the easier one to cover, so its fair number is the higher of the two */
    expect(row(s, IND, "spread", "home", -21.5).fair).toBeGreaterThan(row(s, IND, "spread", "home", -22.5).fair);
    expect(row(s, IND, "total", "over", 150.5).fair).toBeGreaterThan(row(s, IND, "total", "over", 151.5).fair);
  });

  it("one book only: the rows carry that book's price and the fair number is that book's own", () => {
    const rows = game(s, PFW).rows;
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.books === 1 && r.best.book === "draftkings" && r.prices.fanduel === undefined)).toBe(true);
    expect(row(s, PFW, "ml", "home").fair).toBeCloseTo(noVig(-180, 150)!.p, 10);
  });

  it("a third book in the feed changes nothing: no price, no fair number, no row", () => {
    const stripped = (ODDS as { bookmakers: { key: string }[] }[]).map((e) => ({ ...e, bookmakers: e.bookmakers.filter((b) => (AZ_BOOKS as readonly string[]).includes(b.key)) }));
    expect((ODDS as { bookmakers: { key: string }[] }[]).some((e) => e.bookmakers.some((b) => b.key === "otherbook"))).toBe(true);
    expect(slateOf({ oddsEvents: stripped })).toEqual(s);
    for (const g of s.games) for (const r of g.rows) expect(Object.keys(r.prices).every((k) => (AZ_BOOKS as readonly string[]).includes(k))).toBe(true);
  });

  it("the game the odds feed lists the other way round: every price sits on the team it was quoted for", () => {
    const g = game(s, COPPIN);
    expect(g.flipped).toBe(true);
    expect(row(s, COPPIN, "ml", "home")).toMatchObject({ selection: "Bradley ML", prices: { draftkings: -650, fanduel: -700 } });
    expect(row(s, COPPIN, "ml", "away")).toMatchObject({ selection: "Coppin St ML", prices: { draftkings: 470, fanduel: 480 } });
    expect(row(s, COPPIN, "spread", "home")).toMatchObject({ selection: "Bradley -11.5", line: -11.5 });
  });

  it("with no prices the schedule still stands, and says the prices are missing", () => {
    const bare = slateOf({ oddsMissing: true });
    expect(bare.oddsMissing).toBe(true);
    expect(bare.games).toHaveLength(10);
    expect(bare.games.every((g) => g.rows.length === 0 && g.oddsEventId === null)).toBe(true);
    expect([bare.priced, bare.unpriced]).toEqual([0, 9]);
    const none = slateOf({ oddsEvents: [] });
    expect([none.oddsMissing, none.priced, none.unpriced]).toEqual([false, 0, 9]);
  });
});

describe("the board: the selections whose better price beats the fair number", () => {
  it("lists only positive edges, the largest first", () => {
    const b = boardRows(slateOf());
    expect(b.map((r) => `${r.selection} ${r.best.book} ${r.best.price}`)).toEqual(["UC Riverside ML fanduel 135", "San José St ML fanduel -125"]);
    expect(b[0].ev).toBeGreaterThan(b[1].ev);
    expect(b[0]).toMatchObject({ gameId: SJSU, event: "UC Riverside @ San José St", start: "2026-11-13T03:00:00.000Z" });
  });

  it("an edge of exactly nothing is not on it, and a floor can be asked for", () => {
    const s = slateOf();
    const flat = { games: s.games.map((g) => ({ ...g, rows: g.rows.map((r) => ({ ...r, ev: 0 })) })) };
    expect(boardRows(flat)).toEqual([]);
    expect(boardRows(s, 0.02).map((r) => r.selection)).toEqual(["UC Riverside ML"]);
    expect(boardRows(s, 0.5)).toEqual([]);
  });

  it("ties go to the earlier game, then the selection", () => {
    const s = slateOf();
    const even = { games: s.games.map((g) => ({ ...g, rows: g.rows.filter((r) => r.market === "ml").map((r) => ({ ...r, ev: 0.01 })) })) };
    const b = boardRows(even);
    expect(b.map((r) => r.gameId)).toEqual([COPPIN, COPPIN, PSU, PSU, PFW, PFW, SJSU, SJSU]);
    expect(b.slice(0, 2).map((r) => r.selection)).toEqual(["Bradley ML", "Coppin St ML"]);
  });
});

describe("what the any-time engine is handed", () => {
  const tied = tieOdds(parseEspnGames(ESPN_12), ODDS);
  const out = ncaabCandidates({ games: tied.games, oddsEvents: ODDS, snapshotId: "snap", fetchedAt: NOW });

  it("is this sport's game lines, stamped as the market alone, at the two books and no other", () => {
    expect(out.candidates.length).toBeGreaterThan(20);
    for (const c of out.candidates) {
      expect(c.sport).toBe("ncaab");
      expect(["ncaab:ml", "ncaab:spread", "ncaab:total"]).toContain(c.marketType);
      expect(c.modelVersion).toBe("bb-market-1");
      expect(c.modelKind).toBe("market-only");
      expect(c.live).toBe(false);
      expect(c.player ?? null).toBeNull();
      expect(Object.keys(c.quotes).every((k) => (AZ_BOOKS as readonly string[]).includes(k))).toBe(true);
      expect(c.gradeRef).toMatchObject({ source: "espn", league: "ncaab" });
      expect(excludedBy()(c.marketType)).toBe(false);
    }
    expect(NCAAB_MODEL_MARKET).toBe("bb-market-1");
  });

  it("never offers a game in play, and never a prop", () => {
    expect(out.candidates.some((c) => c.gradeRef?.id === MASON)).toBe(false);
    expect(out.candidates.some((c) => /prop/.test(c.marketType))).toBe(false);
    expect(excludedBy()("ncaab:player_prop:points")).toBe(true);
    expect(excludedBy()("ncaab:prop")).toBe(true);
  });

  it("a turned-round game's grading reference names the teams the way its prices do", () => {
    const c = out.candidates.find((x) => x.gradeRef?.id === COPPIN && x.market === "ml" && x.side === "home")!;
    expect(c.selection).toBe("Bradley ML");
    expect(c.gradeRef).toEqual({ source: "espn", league: "ncaab", id: COPPIN, home: "Bradley Braves", away: "Coppin State Eagles" });
  });

  it("the row the desk shows is made from the same candidate, so the page and the engine cannot disagree", () => {
    const s = slateOf();
    const c = out.candidates.find((x) => x.gradeRef?.id === SJSU && x.market === "ml" && x.side === "away")!;
    const r = rowOf(c)!;
    expect(r).toEqual(row(s, SJSU, "ml", "away"));
    expect(rowOf({ ...c, market: "player_points" })).toBeNull();
  });
});

describe("the desk's constants", () => {
  it("asks The Odds API for this sport, the three full-game markets, and the two books by name", () => {
    const u = new URL(NCAAB_ODDS_URL);
    expect(u.hostname).toBe("api.the-odds-api.com");
    expect(u.pathname).toBe("/v4/sports/basketball_ncaab/odds");
    expect(u.searchParams.get("bookmakers")).toBe("draftkings,fanduel");
    expect(u.searchParams.get("markets")).toBe("h2h,spreads,totals");
    expect(u.searchParams.get("oddsFormat")).toBe("american");
    expect(u.searchParams.has("regions")).toBe(false);
    expect(u.searchParams.has("apiKey")).toBe(false);
  });

  it("reads the whole Division I board from ESPN, not the featured few", () => {
    expect(NCAAB_ESPN_SCOREBOARD).toBe("https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard");
    expect(NCAAB_ESPN_QUERY).toBe("groups=50&limit=400");
  });

  it("has no rating of its own: the blend is the market and nothing else", () => {
    expect(NCAAB_ID).toBe("ncaab");
    expect(NCAAB_LINES).toEqual({ id: "ncaab", model: { sigma: 11, sigmaTotal: 17, hfa: 0, blend: { mkt: 1, spread: 0, fpi: 0 }, spreadBlend: { mkt: 1, fpi: 0 } } });
  });
});

describe("the page's words", () => {
  it.each([
    ["/games", "games"],
    ["/games/401917176", "games"],
    ["/board", "board"],
    ["/board/parlays", "other"],
    ["/ledger", "ledger"],
    ["/stats", "other"],
    ["/builder", "other"],
    ["/sharp", "other"],
    ["/simulator", "other"],
    ["/props", "other"],
    ["/ballpark", "other"],
    ["/season", "other"],
    ["/first-sunday-six", "other"],
    ["/settings", null],
    ["/calc", null],
    ["/anytime", null],
    ["/taken", null],
    ["/", null],
    ["/gamesmanship", null],
    ["/boardroom", null],
  ])("%s opens %s", (p, want) => {
    expect(ncaabViewOf(p)).toBe(want);
  });

  it("names the tab a page belongs to", () => {
    expect(tabNameOf("/props")).toBe("Parlay Builder");
    expect(tabNameOf("/board/parlays")).toBe("Parlays");
    expect(tabNameOf("/sharp")).toBe("The Sharp");
    expect(tabNameOf("/nowhere")).toBe("This page");
  });

  it("the date strip is yesterday, today and the days ahead, by the calendar alone", () => {
    expect(dayChips("2026-11-12")).toEqual([
      { date: "2026-11-11", label: "Yesterday" },
      { date: "2026-11-12", label: "Today" },
      { date: "2026-11-13", label: "Fri 13" },
      { date: "2026-11-14", label: "Sat 14" },
      { date: "2026-11-15", label: "Sun 15" },
      { date: "2026-11-16", label: "Mon 16" },
      { date: "2026-11-17", label: "Tue 17" },
    ]);
    expect(dayChips("2026-12-31", 1).map((c) => c.date)).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
  });

  it("a tip time is read in the reader's own zone", () => {
    expect(tipLabel("2026-11-12T23:30:00Z", "America/Phoenix")).toBe("4:30 PM");
    expect(tipLabel("2026-11-12T23:30:00Z", "America/Los_Angeles")).toBe("3:30 PM");
    expect(tipLabel("soon")).toBe("");
  });

  it("sorts a day into in play, still to tip, final and called off", () => {
    const s = slateOf();
    const sec = sectionsOf([...s.games, { ...game(s, PSU), id: "off", status: "cancelled" as const }]);
    expect([sec.live.length, sec.upcoming.length, sec.final.length, sec.off.length]).toEqual([1, 9, 0, 1]);
    expect(sectionsOf(slateOf({ date: "2026-11-11" }).games).final).toHaveLength(5);
  });

  it("groups a game's rows spread, total, moneyline, and leaves out a market with no row", () => {
    const s = slateOf();
    expect(rowGroups(game(s, PSU).rows).map((g) => [g.title, g.rows.length])).toEqual([
      ["Spread", 2],
      ["Total", 2],
      ["Moneyline", 2],
    ]);
    expect(rowGroups(game(s, IND).rows).map((g) => [g.title, g.rows.length])).toEqual([
      ["Spread", 4],
      ["Total", 4],
    ]);
    expect(rowGroups([])).toEqual([]);
  });

  it("says why a game shows no line", () => {
    const s = slateOf();
    expect(noLineReason(game(s, PSU), s)).toBeNull();
    expect(noLineReason(game(s, MASON), s)).toBe("In play — this desk prices before tip-off only.");
    expect(noLineReason(game(s, JWU), s)).toBe("Neither book lists this game.");
    expect(noLineReason({ ...game(s, PSU), rows: [] }, s)).toBe("Neither book has a full line up yet.");
    expect(noLineReason(game(slateOf({ oddsMissing: true }), PSU), { oddsMissing: true })).toBe("Prices are not loaded right now.");
    expect(noLineReason(slateOf({ date: "2026-11-11" }).games[0], s)).toBeNull();
  });

  it("sums the slate up in one line", () => {
    expect(slateLine(slateOf())).toBe("10 games · 5 with a line at DraftKings or FanDuel");
    expect(slateLine(slateOf({ oddsMissing: true }))).toBe("10 games · prices are not loaded right now, schedule and scores only");
    expect(slateLine(slateOf({ date: "2026-11-20" }))).toBe("No Division I games on this date.");
    expect(slateLine({ games: [game(slateOf(), PSU)], priced: 1, oddsMissing: false })).toBe("1 game · 1 with a line at DraftKings or FanDuel");
  });
});
