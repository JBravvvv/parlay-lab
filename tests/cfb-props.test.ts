import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/source";
import { buildCfbBoard } from "@/lib/cfb/model";
import { ATD_YES_ONLY_OVERROUND, hasLiveEvent, median, parseEventProps, playerSlug, propLabel, propsWindowSec, selectPropEvents } from "@/lib/cfb/props";
import { ctxFor, ctxLookup, parseByAthlete } from "@/lib/cfb/props-context";
import { CFB_PROPS_ODDS_MARKETS, CFB_PROP_MARKETS, type CfbPropRow } from "@/lib/cfb/props-types";
import { CFB_PROPS } from "@/lib/cfb/rules";
import { CFB_PROPS_STALE_MS, cfbPropsQueryKey } from "@/lib/cfb/client";
import type { CfbBoard, CfbGame } from "@/lib/cfb/types";

/**
 * CFB PLAYER PROPS (INSTRUCTION 39, 2026-09-05) on a SYNTHETIC per-event payload
 * (tests/fixtures/cfb/odds-ncaaf-event-props.synthetic.json — invented retail shapes, never
 * captured quotes) over the real 2026-09-05 ESPN/odds fixtures for the slate. Every figure
 * asserted below was computed independently in Python (proportional de-vig, equal-weight
 * median, evPct) from the fixture prices named in the comments — not by the module under test.
 */

const FIX = path.join(process.cwd(), "tests", "fixtures", "cfb");
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8"));
const ESPN = readJson("espn-scoreboard-2026-09-05.json") as { events: unknown[] };
const ODDS = readJson("odds-ncaaf-2026-09-05.json") as unknown[];
const FPI = readJson("espn-fpi.json") as unknown;
const EVENT = readJson("odds-ncaaf-event-props.synthetic.json") as Record<string, unknown>;
const NOW = Date.parse("2026-09-05T12:00:00Z");
const DATE = "2026-09-05";

const board: CfbBoard = buildCfbBoard({ date: DATE, espnEvents: ESPN.events, oddsEvents: ODDS, fpi: FPI, now: NOW, bankroll: 2500 });
const ala = board.games.find((g) => g.home.abbr === "ALA") as CfbGame;
const rows = parseEventProps(EVENT, ala, { now: NOW, bankroll: 2500 });
const find = (market: string, player: string, side: string): CfbPropRow => {
  const r = rows.find((x) => x.market === market && x.player === player && x.side === side);
  if (!r) throw new Error(`no row ${market} ${player} ${side}: ${rows.map((x) => x.key).join(", ")}`);
  return r;
};

const root = path.join(__dirname, "..");
const readSrc = (p: string) => stripComments(fs.readFileSync(path.join(root, p), "utf8"));

describe("the contract", () => {
  it("six markets, six odds keys, anytime TD the only yes-kind", () => {
    expect(CFB_PROP_MARKETS).toHaveLength(6);
    expect(CFB_PROPS_ODDS_MARKETS).toBe("player_anytime_td,player_pass_tds,player_pass_yds,player_receptions,player_rush_yds,player_reception_yds");
    expect(CFB_PROP_MARKETS.filter((m) => m.kind === "yes").map((m) => m.id)).toEqual(["anytime_td"]);
    /* 2026-09-05: was { maxEvents: 24, revalidateSec: 1800 } — a fresh 24-event pull MEASURED ~753 credits on prod
       (~31 credits/event, not 6), and the data cache is per deployment; halved, doubled, and budgeted. */
    /* 2026-09-05 (INSTRUCTION 40): + liveRevalidateSec 600 — the window once any priced event is in play */
    /* 2026-09-05 (review fix): + liveMaxEvents 6 (a live pull re-prices only the in-play games) and
       boardRetainSec 36 h (the last board is retained past its window — the stale fallback at the budget cap) */
    /* INSTRUCTION 42 (2026-09-05) — Josh: "It should be grading every possible pick available on the
       board". maxEvents 12 → 60, liveMaxEvents 6 → 24, dailyBudget 1200 → 2500: every eligible game
       is priced; the empty-event rule and per-game pricedAt (route) keep the real spend under the rail. */
    /* THE CAESARS-MISSING RULE (2026-09-05) — Josh: "They are still 12 games today that haven't started
       w/ current Anytime TD odds". + czMissingRevalidateSec 1800 / czMissingWindowSec 4 h: an upcoming
       game with rows and some market with no Caesars quote is re-asked every 30 min inside 4 h of
       kickoff (review fix: a game with NO rows is never re-asked early — it keeps the 2 h empty hold). */
    expect(CFB_PROPS).toEqual({
      maxEvents: 60,
      revalidateSec: 7200,
      liveRevalidateSec: 600,
      liveMaxEvents: 24,
      boardRetainSec: 36 * 3600,
      czMissingRevalidateSec: 1800,
      czMissingWindowSec: 4 * 3600,
      regions: "us",
      minBooks: 2,
      settleBook: "williamhill_us",
      dailyBudget: 2500,
      measuredCreditsPerEvent: 31,
      /* INSTRUCTION 52 (2026-09-12, Josh verbatim: "I've always had in game live lines. It has live
         lines; they just went away this week"). 60 pre-kick events x 31 = 1,860 of 2,500 left 640,
         and a live pull of 24 events wants 744 — so on a full Saturday the in-game pull was refused
         by the rail and the board served carried rows. The hold is HALF a live cycle, 12 x 31 = 372,
         reserved from the NON-live rail only (review round, 2026-09-12: a full 744 cycle left
         floor(1756/31) = 56 event-pulls against a 60-game board, so unfreezing the live lines was
         costing four games' pre-kick props every Saturday). NO TOTAL IS LOWERED — the live pass may
         still draw the whole 2,500, and the hold is further capped at what today's live-or-upcoming
         games could spend; see src/lib/server/football-props.ts. */
      liveReserveCredits: 372,
    });
    // HALF the live pass, exactly — not a number someone picked
    expect(CFB_PROPS.liveReserveCredits).toBe((CFB_PROPS.liveMaxEvents / 2) * CFB_PROPS.measuredCreditsPerEvent);
    // and it leaves the pre-kick rail able to price ALL 60 on the first pull, with 8 pulls to spare
    const prekickPulls = Math.floor((CFB_PROPS.dailyBudget - CFB_PROPS.liveReserveCredits) / CFB_PROPS.measuredCreditsPerEvent);
    expect(prekickPulls).toBe(68);
    expect(prekickPulls).toBeGreaterThanOrEqual(CFB_PROPS.maxEvents + 8);
    expect(CFB_PROPS.liveRevalidateSec).toBeLessThan(CFB_PROPS.revalidateSec);
  });
  it("the fixture says it is synthetic and matches the Alabama game", () => {
    expect(String(EVENT._note)).toMatch(/SYNTHETIC/);
    expect(ala.oddsEventId).toBe(EVENT.id);
    expect(ala.id).toBe("401856634");
  });
});

describe("parseEventProps — shape", () => {
  it("emits over+under per O/U (market, player) and one yes row per anytime-TD player", () => {
    const ou = rows.filter((r) => r.market !== "anytime_td");
    expect(ou.every((r) => r.side === "over" || r.side === "under")).toBe(true);
    const overs = ou.filter((r) => r.side === "over").length;
    const unders = ou.filter((r) => r.side === "under").length;
    expect(overs).toBe(unders);
    const atd = rows.filter((r) => r.market === "anytime_td");
    expect(atd).toHaveLength(5);
    expect(atd.every((r) => r.side === "yes" && r.line === null)).toBe(true);
  });
  it("every row carries the game's ids, kickoff, status and sub", () => {
    for (const r of rows) {
      expect(r.gameId).toBe("401856634");
      expect(r.oddsEventId).toBe("b10ebab18213ecdc575885bfa874b98d");
      expect(r.kickoff).toBe(ala.start);
      expect(r.status).toBe("upcoming");
      expect(r.sub).toBe("ECU @ ALA · Sat 9:00 AM");
      expect(r.teamAbbr).toBeNull(); // the feed gives no team on the outcome
      expect(r.ctx).toBeNull(); // no context handed in
    }
  });
  it("labels and keys follow the contract", () => {
    expect(find("pass_yds", "Ty Simpson", "over").label).toBe("Ty Simpson O 245.5 Pass Yds");
    expect(find("pass_yds", "Ty Simpson", "under").label).toBe("Ty Simpson U 245.5 Pass Yds");
    expect(find("anytime_td", "Ryan Williams", "yes").label).toBe("Ryan Williams Anytime TD");
    expect(find("receptions", "Germie Bernard", "over").key).toBe("401856634|receptions|germie-bernard|over|4.5");
    expect(find("anytime_td", "Jam Miller", "yes").key).toBe("401856634|anytime_td|jam-miller|yes|");
    expect(playerSlug("D'Angelo Ponds Jr.")).toBe("dangelo-ponds-jr");
    expect(propLabel("A B", "rush_yds", "over", 64.5)).toBe("A B O 64.5 Rush Yds");
  });
  it("tolerates garbage input", () => {
    expect(parseEventProps(null, ala, { now: NOW, bankroll: 2500 })).toEqual([]);
    expect(parseEventProps({ bookmakers: [{ key: "x", markets: [{ key: "player_pass_yds", outcomes: [{ name: "Over", price: -110 }] }] }] }, ala, { now: NOW, bankroll: 2500 })).toEqual([]);
  });
});

describe("parseEventProps — pricing", () => {
  it("de-vigs each book's pair and takes the equal-weight median at the consensus line", () => {
    // Ty Simpson pass yds: DK -115/-105 → 0.510834, FD -114/-106 → 0.508664, MGM -110/-110 → 0.5 at 245.5;
    // Caesars sits alone at 249.5. Consensus line = median(249.5, 245.5, 245.5, 245.5) = 245.5.
    const r = find("pass_yds", "Ty Simpson", "over");
    expect(r.line).toBe(245.5);
    expect(r.books).toBe(3);
    expect(r.fair).toBeCloseTo(0.508664, 5);
    expect(r.fairAm).toBe(-104);
    const u = find("pass_yds", "Ty Simpson", "under");
    expect(u.fair).toBeCloseTo(0.491336, 5);
  });
  it("quotes Caesars at ITS OWN line; a line no second book posts has a price but no EV, grade or Kelly", () => {
    const r = find("pass_yds", "Ty Simpson", "over");
    expect(r.cz).toEqual({ book: "williamhill_us", title: "Caesars", price: -110, line: 249.5, dec: expect.closeTo(1.909091, 5) });
    expect(r.evCz).toBeNull();
    expect(r.grade).toBeNull();
    expect(r.playable).toBe(true);
    expect(r.kelly).toBe(0);
    expect(r.dk?.line).toBe(245.5);
    expect(r.fd?.line).toBe(245.5);
  });
  it("best = highest decimal among the books at the consensus line, with EV there", () => {
    // at 245.5: DK -115 (1.8696), FD -114 (1.8772), MGM -110 (1.9091) → BetMGM; EV = 100·(0.508664·0.909091 − 0.491336)
    const r = find("pass_yds", "Ty Simpson", "over");
    expect(r.best?.book).toBe("betmgm");
    expect(r.evBest).toBeCloseTo(-2.89, 2);
    const u = find("pass_yds", "Ty Simpson", "under");
    expect(u.best?.book).toBe("draftkings"); // DK -105 is the best under at 245.5
    expect(u.evBest).toBeCloseTo(-4.07, 2);
  });
  it("EV at Caesars uses the fair at Caesars' line, then grades it", () => {
    // Katin Houser pass TDs O 1.5: CZ -125/-105, DK -120/-110, FD -118/-112, MGM -115/-115 → de-vigged
    // over reads sorted 0.5, 0.506069, 0.510121, 0.520305; TRUE median (mean of the two middle) = 0.508095;
    // EV at CZ -125 (1.8) = 100·(0.508095·1.8 − 1) = −8.54 → F
    const r = find("pass_tds", "Katin Houser", "over");
    expect(r.line).toBe(1.5);
    expect(r.books).toBe(4);
    expect(r.fair).toBeCloseTo(0.508095, 5);
    expect(r.evCz).toBeCloseTo(-8.54, 2);
    expect(r.grade).toBe("F");
    expect(r.kelly).toBe(0);
    // Germie Bernard rec yds O 52.5 — MGM posts none, three books remain: median 0.504330, EV at CZ -110 = −3.72
    const b = find("rec_yds", "Germie Bernard", "over");
    expect(b.books).toBe(3);
    expect(b.evCz).toBeCloseTo(-3.72, 2);
    expect(b.grade).toBe("F");
  });
  it("a market with fewer than minBooks books has a null fair, null EVs, but keeps the quote", () => {
    // Katin Houser rush yds: Caesars alone at 22.5
    const r = find("rush_yds", "Katin Houser", "over");
    expect(r.fair).toBeNull();
    expect(r.fairAm).toBeNull();
    expect(r.books).toBe(0);
    expect(r.evCz).toBeNull();
    expect(r.evBest).toBeNull();
    expect(r.grade).toBeNull();
    expect(r.cz?.price).toBe(-110);
    expect(r.best?.price).toBe(-110);
    expect(r.playable).toBe(true);
    expect(r.kelly).toBe(0);
  });
  it("anytime TD, yes-only at every book: implied ÷ the stated overround, then the median", () => {
    // Jam Miller: CZ -140 → 0.583333/1.08, DK -135, FD -138, MGM -130 → sorted 0.523349, 0.531915, 0.536882, 0.540123
    // true median = (0.531915 + 0.536882) / 2 = 0.534398; EV at CZ (1.714286) = −8.39; best = MGM -130 (1.769231), EV −5.45
    expect(ATD_YES_ONLY_OVERROUND).toBe(1.08);
    const r = find("anytime_td", "Jam Miller", "yes");
    expect(r.line).toBeNull();
    expect(r.books).toBe(4);
    expect(r.fair).toBeCloseTo(0.534398, 5);
    expect(r.evCz).toBeCloseTo(-8.39, 2);
    expect(r.best?.book).toBe("betmgm");
    expect(r.evBest).toBeCloseTo(-5.45, 2);
  });
  it("median is the true median: middle value, or the mean of the two middles on an even count", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([0.5, 0.52, 0.51, 0.5])).toBeCloseTo(0.505, 9);
    expect(median([0.48917, 0.53061])).toBeCloseTo(0.50989, 9);
    expect(median([7])).toBe(7);
  });
  it("even book counts price Over and Under symmetrically: fair(over)+fair(under)=1 and a 2-book fair is the mean of the reads", () => {
    // CZ -130/+100 → 0.530612, DK -105/-115 → 0.489166 at 245.5 → fair(over) = mean = 0.509889.
    // EV: over at CZ -130 (1.769231) = 100·(0.509889·1.769231 − 1) = −9.79; under at CZ +100 (2.0) = −1.98.
    // The lower-middle rule (engine2 weightedMedian) would have read 0.489166 → over −13.46 / under +2.17,
    // i.e. the Under graded B on the same quotes purely from the tie-break.
    const ou = (book: string, title: string, over: number, under: number) => ({
      key: book, title, markets: [{ key: "player_pass_yds", outcomes: [
        { name: "Over", description: "A B", price: over, point: 245.5 },
        { name: "Under", description: "A B", price: under, point: 245.5 } ] }],
    });
    const payload = { id: "x", bookmakers: [ou("williamhill_us", "Caesars", -130, 100), ou("draftkings", "DraftKings", -105, -115)] };
    const two = parseEventProps(payload, ala, { now: NOW, bankroll: 2500 });
    const o = two.find((r) => r.side === "over") as CfbPropRow;
    const u = two.find((r) => r.side === "under") as CfbPropRow;
    expect(o.books).toBe(2);
    expect(o.fair).toBeCloseTo(0.509889, 5);
    expect(u.fair).toBeCloseTo(0.490111, 5);
    expect((o.fair as number) + (u.fair as number)).toBeCloseTo(1, 9);
    expect(o.evCz).toBeCloseTo(-9.79, 2);
    expect(u.evCz).toBeCloseTo(-1.98, 2);
    // mirror the quotes (swap Over/Under prices) → the grades mirror exactly; the estimator has no side
    const mirrored = { id: "x", bookmakers: [ou("williamhill_us", "Caesars", 100, -130), ou("draftkings", "DraftKings", -115, -105)] };
    const m = parseEventProps(mirrored, ala, { now: NOW, bankroll: 2500 });
    const mo = m.find((r) => r.side === "over") as CfbPropRow;
    const mu = m.find((r) => r.side === "under") as CfbPropRow;
    expect(mo.fair).toBeCloseTo(u.fair as number, 9);
    expect(mo.evCz).toBeCloseTo(u.evCz as number, 9);
    expect(mu.evCz).toBeCloseTo(o.evCz as number, 9);
    expect(mo.grade).toBe(u.grade);
    expect(mu.grade).toBe(o.grade);
  });
  it("anytime TD with a Yes/No pair at a book de-vigs the pair instead", () => {
    const payload = {
      id: "x",
      bookmakers: [
        { key: "williamhill_us", title: "Caesars", markets: [{ key: "player_anytime_td", outcomes: [
          { name: "Yes", description: "A B", price: -150 }, { name: "No", description: "A B", price: 120 } ] }] },
        { key: "draftkings", title: "DraftKings", markets: [{ key: "player_anytime_td", outcomes: [
          { name: "Yes", description: "A B", price: -150 }, { name: "No", description: "A B", price: 120 } ] }] },
      ],
    };
    const [r] = parseEventProps(payload, ala, { now: NOW, bankroll: 2500 });
    // imp(-150)=0.6, imp(+120)=0.454545 → 0.6/1.054545 = 0.568966
    expect(r.fair).toBeCloseTo(0.568966, 5);
    expect(r.books).toBe(2);
  });
  it("a +EV Caesars price gets a quarter-Kelly stake capped at 2% of the bankroll; not playable after kickoff", () => {
    const mk = (cz: number) => ({
      id: "x",
      bookmakers: [
        { key: "williamhill_us", title: "Caesars", markets: [{ key: "player_receptions", outcomes: [
          { name: "Over", description: "A B", price: cz, point: 4.5 }, { name: "Under", description: "A B", price: -110, point: 4.5 } ] }] },
        { key: "draftkings", title: "DraftKings", markets: [{ key: "player_receptions", outcomes: [
          { name: "Over", description: "A B", price: -110, point: 4.5 }, { name: "Under", description: "A B", price: -110, point: 4.5 } ] }] },
        { key: "fanduel", title: "FanDuel", markets: [{ key: "player_receptions", outcomes: [
          { name: "Over", description: "A B", price: -110, point: 4.5 }, { name: "Under", description: "A B", price: -110, point: 4.5 } ] }] },
      ],
    });
    const over = parseEventProps(mk(130), ala, { now: NOW, bankroll: 2500 }).find((r) => r.side === "over") as CfbPropRow;
    // fair at 4.5 = median(0.5, 0.5, cz: imp(+130)=0.434783 vs imp(-110)=0.523810 → 0.453543) = 0.5; EV at +130 = 100·(0.5·1.3 − 0.5) = 15 → S
    expect(over.fair).toBeCloseTo(0.5, 6);
    expect(over.evCz).toBeCloseTo(15, 2);
    expect(over.grade).toBe("S");
    // ¼-Kelly: f = 0.25·((0.5·1.3 − 0.5)/1.3) = 0.028846 → capped 0.02 × 2500 = $50
    expect(over.kelly).toBe(50);
    expect(over.playable).toBe(true);
    const late = parseEventProps(mk(130), ala, { now: Date.parse(ala.start) + 1000, bankroll: 2500 }).find((r) => r.side === "over") as CfbPropRow;
    expect(late.playable).toBe(false);
    expect(late.kelly).toBeNull();
    expect(late.evCz).toBeCloseTo(15, 2);
  });
});

describe("season context join", () => {
  const espnPage = {
    categories: [
      { name: "general", names: ["gamesPlayed", "fumblesForced"] },
      { name: "passing", names: ["completions", "passingYards", "passingTouchdowns"] },
      { name: "rushing", names: ["rushingAttempts", "rushingYards", "rushingTouchdowns"] },
      { name: "receiving", names: ["receptions", "receivingYards", "receivingTouchdowns"] },
    ],
    athletes: [
      { athlete: { id: "1", displayName: "Ty Simpson" }, categories: [
        { name: "general", displayName: "Own General", values: [2, null] },
        { name: "passing", displayName: "Own Passing", values: [40, 611, 5] },
        { name: "rushing", displayName: "Own Rushing", values: [6, 21, 1] },
        { name: "receiving", displayName: "Own Receiving", values: [null, null, null] },
      ] },
      { athlete: { id: "2", displayName: "Ryan Williams" }, categories: [
        { name: "general", values: [2, null] },
        { name: "receiving", values: [11, 187, 2] },
      ] },
    ],
  };
  it("parses ESPN's names/values tables and fills the row's stat", () => {
    const ctx = parseByAthlete(espnPage);
    expect(ctxFor(ctx.get("ty-simpson"), "pass_yds")).toEqual({ g: 2, perGame: 305.5, season: 611 });
    expect(ctxFor(ctx.get("ty-simpson"), "pass_tds")).toEqual({ g: 2, perGame: 2.5, season: 5 });
    expect(ctxFor(ctx.get("ty-simpson"), "anytime_td")).toEqual({ g: 2, perGame: 0.5, season: 1 });
    expect(ctxFor(ctx.get("ryan-williams"), "receptions")).toEqual({ g: 2, perGame: 5.5, season: 11 });
    expect(ctxFor(ctx.get("ryan-williams"), "rec_yds")).toEqual({ g: 2, perGame: 93.5, season: 187 });
    expect(ctxFor(ctx.get("ryan-williams"), "pass_yds")).toEqual({ g: 2, perGame: null, season: null });
    expect(ctxFor(undefined, "pass_yds")).toBeNull();
  });
  it("joins by normalised name into the rows; a miss is null, never a guess", () => {
    const lookup = ctxLookup(parseByAthlete(espnPage));
    const withCtx = parseEventProps(EVENT, ala, { now: NOW, bankroll: 2500, ctx: lookup });
    const simpson = withCtx.find((r) => r.player === "Ty Simpson" && r.market === "pass_yds" && r.side === "over") as CfbPropRow;
    expect(simpson.ctx).toEqual({ g: 2, perGame: 305.5, season: 611 });
    const houser = withCtx.find((r) => r.player === "Katin Houser" && r.market === "pass_yds") as CfbPropRow;
    expect(houser.ctx).toBeNull();
    expect(ctxLookup(null)).toBeNull();
    expect(parseByAthlete(null).size).toBe(0);
  });

  /* INSTRUCTION 46 (2026-09-08): the same tables carry the player's identity — headshot href, ESPN
     team id (= the slate's CfbTeam.id), short name, position — and the odds feed names no team on
     any fixture row, so the team is resolved from ESPN's id against the game's home / away ids. */
  const identityPage = {
    ...espnPage,
    athletes: [
      {
        athlete: {
          id: "4685454",
          displayName: "Ty Simpson",
          headshot: { href: "https://a.espncdn.com/i/headshots/college-football/players/full/4685454.png" },
          teamId: ala.home.id,
          teamShortName: ala.home.abbr,
          position: { abbreviation: "QB" },
        },
        categories: espnPage.athletes[0].categories,
      },
      {
        // a team id that is NEITHER side of the game, and a headshot that is not a URL → nothing guessed
        athlete: { id: "2", displayName: "Ryan Williams", headshot: { href: "not-a-url" }, teamId: "999999999", position: {} },
        categories: espnPage.athletes[1].categories,
      },
    ],
  };
  it("carries ESPN's identity in the season line — headshot, teamId, teamAbbr, pos — or null", () => {
    const ctx = parseByAthlete(identityPage);
    const ts = ctx.get("ty-simpson")!;
    expect(ts.athleteId).toBe("4685454");
    expect(ts.headshot).toBe("https://a.espncdn.com/i/headshots/college-football/players/full/4685454.png");
    expect(ts.teamId).toBe(ala.home.id);
    expect(ts.teamAbbr).toBe(ala.home.abbr);
    expect(ts.pos).toBe("QB");
    const rw = ctx.get("ryan-williams")!;
    expect(rw.headshot).toBeNull();
    expect(rw.pos).toBeNull();
    expect(rw.teamId).toBe("999999999");
    const lookup = ctxLookup(ctx)!;
    expect(lookup.player!("Ty Simpson")).toEqual({ athleteId: "4685454", headshot: ts.headshot, teamId: ala.home.id, teamAbbr: ala.home.abbr, pos: "QB" });
    expect(lookup.player!("Nobody Here")).toBeNull();
  });
  it("a prop row with no odds-feed team resolves its team from ESPN's teamId against the game's sides; a miss stays null", () => {
    const withCtx = parseEventProps(EVENT, ala, { now: NOW, bankroll: 2500, ctx: ctxLookup(parseByAthlete(identityPage)) });
    const simpson = withCtx.find((r) => r.player === "Ty Simpson" && r.market === "pass_yds" && r.side === "over") as CfbPropRow;
    expect(simpson.teamId).toBe(ala.home.id);
    expect(simpson.teamAbbr).toBe(ala.home.abbr);
    expect(simpson.team).toBe(ala.home.name);
    expect(simpson.opp).toBe(ala.away.short);
    expect(simpson.headshot).toBe("https://a.espncdn.com/i/headshots/college-football/players/full/4685454.png");
    expect(simpson.pos).toBe("QB");
    // the stat join is untouched by the identity join
    expect(simpson.ctx).toEqual({ g: 2, perGame: 305.5, season: 611 });
    const williams = withCtx.find((r) => r.player === "Ryan Williams") as CfbPropRow;
    expect(williams.teamId).toBeNull();
    expect(williams.team).toBeNull();
    expect(williams.headshot).toBeNull();
    // no context at all → identity fields null, the same as before this shipped
    const bare = find("pass_yds", "Ty Simpson", "over");
    expect(bare.headshot).toBeNull();
    expect(bare.pos).toBeNull();
    expect(bare.teamId).toBeNull();
    // a plain-function lookup (no `.player`) still joins the stat and never throws
    const plain = parseEventProps(EVENT, ala, { now: NOW, bankroll: 2500, ctx: (m, p) => ctxFor(parseByAthlete(espnPage).get(playerSlug(p)), m) });
    expect((plain.find((r) => r.player === "Ty Simpson" && r.market === "pass_yds") as CfbPropRow).ctx?.season).toBe(611);
  });
  // INSTRUCTION 46 fix round (2026-09-08, verifier probe): the ESPN join is by NAME, so a same-named
  // athlete on a FOREIGN roster used to hand his (valid) headshot and position to the row while the
  // team was correctly left null — the wrong man's face with the initials fallback disabled.
  it("a same-name athlete whose ESPN teamId is on NEITHER side of the game lends the row nothing — no headshot, no position, no team", () => {
    const foreignPage = {
      ...identityPage,
      athletes: [
        identityPage.athletes[0],
        {
          athlete: {
            id: "77",
            displayName: "Ryan Williams",
            headshot: { href: "https://a.espncdn.com/i/headshots/college-football/players/full/77.png" },
            teamId: "999999999",
            teamShortName: "XYZ",
            position: { abbreviation: "WR" },
          },
          categories: espnPage.athletes[1].categories,
        },
      ],
    };
    const ctx = parseByAthlete(foreignPage);
    // the context itself still carries what ESPN said (the gate lives in parseEventProps)
    expect(ctx.get("ryan-williams")!.headshot).toBe("https://a.espncdn.com/i/headshots/college-football/players/full/77.png");
    const rows = parseEventProps(EVENT, ala, { now: NOW, bankroll: 2500, ctx: ctxLookup(ctx) });
    const williams = rows.filter((r) => r.player === "Ryan Williams");
    expect(williams.length).toBeGreaterThan(0);
    for (const w of williams) {
      expect(w.headshot).toBeNull();
      expect(w.pos).toBeNull();
      expect(w.teamId).toBeNull();
      expect(w.teamAbbr).toBeNull();
      expect(w.team).toBeNull();
    }
    // the stat join is untouched by the identity gate
    expect(williams[0].ctx).not.toBeNull();
    // the man ESPN puts on this game keeps his identity (numeric id compared as a string, too)
    const numericIds = { ...foreignPage, athletes: [{ ...foreignPage.athletes[0], athlete: { ...foreignPage.athletes[0].athlete, teamId: Number(ala.home.id) } }] };
    const simpson = parseEventProps(EVENT, ala, { now: NOW, bankroll: 2500, ctx: ctxLookup(parseByAthlete(numericIds)) }).find((r) => r.player === "Ty Simpson") as CfbPropRow;
    expect(simpson.headshot).toBe("https://a.espncdn.com/i/headshots/college-football/players/full/4685454.png");
    expect(simpson.teamId).toBe(ala.home.id);
  });
});

describe("selectPropEvents", () => {
  it("keeps upcoming games with an odds event and a Caesars side, kickoff then rank order", () => {
    const { events, capped } = selectPropEvents(board, NOW);
    expect(capped).toBe(false);
    expect(events.length).toBeGreaterThan(0);
    for (const g of events) {
      expect(g.oddsEventId).not.toBeNull();
      expect(g.rows.some((r) => !!r.cz)).toBe(true);
      expect(Date.parse(g.start)).toBeGreaterThan(NOW);
    }
    // 16:00Z kickoffs first, ranked teams first inside the hour: IU (#6), ALA (#13), HOU (#23)
    expect(events.slice(0, 3).map((g) => g.home.abbr)).toEqual(["IU", "ALA", "HOU"]);
    // Ohio State is #1 but kicks at 16:30Z, so it sits after every 16:00Z game
    const osu = events.findIndex((g) => g.home.abbr === "OSU");
    expect(osu).toBeGreaterThan(events.filter((g) => g.start === "2026-09-05T16:00Z").length - 1);
  });
  it("caps at max and flags it; excludes kicked-off-but-still-'upcoming' games and games without a Caesars price", () => {
    const three = selectPropEvents(board, NOW, 3);
    expect(three.events).toHaveLength(3);
    expect(three.capped).toBe(true);
    expect(selectPropEvents(board, NOW).events.length).toBeLessThanOrEqual(CFB_PROPS.maxEvents);
    // every fixture game is STATUS_SCHEDULED: past its kickoff with status still "upcoming" it is stale, not live
    const late = selectPropEvents(board, Date.parse("2026-09-05T17:00:00Z"));
    expect(late.events).toHaveLength(0);
    const noCz: CfbBoard = { ...board, games: board.games.map((g) => ({ ...g, rows: g.rows.map((r) => ({ ...r, cz: null })) })) };
    expect(selectPropEvents(noCz, NOW).events).toHaveLength(0);
  });

  /* INSTRUCTION 40 (2026-09-05) — Josh: "It's not showing any current props for CFB. In game prop
     lines should still populate just like they do on the MLB side." The fixture has no in-play
     game, so a live one is synthesised by flipping a selected game's status (ESPN's own field). */
  const withStatus = (abbr: string, status: CfbGame["status"], extra: Partial<CfbGame> = {}): CfbBoard => ({
    ...board,
    games: board.games.map((g) => (g.home.abbr === abbr ? { ...g, status, ...extra } : g)),
  });
  const LATE = Date.parse("2026-09-05T17:00:00Z"); // every 16:00Z / 16:30Z kickoff has passed

  it("a LIVE game is selected even after its kickoff has passed", () => {
    const live = withStatus("ALA", "live", { detail: "2nd 8:12", homeScore: 14, awayScore: 3 });
    const { events } = selectPropEvents(live, LATE);
    expect(events.map((g) => g.home.abbr)).toEqual(["ALA"]);
    expect(events[0].status).toBe("live");
    expect(events[0].oddsEventId).not.toBeNull();
  });
  it("a FINAL or POSTPONED game is never selected", () => {
    expect(selectPropEvents(withStatus("ALA", "final", { homeScore: 31, awayScore: 10 }), LATE).events).toHaveLength(0);
    expect(selectPropEvents(withStatus("ALA", "final"), NOW).events.map((g) => g.home.abbr)).not.toContain("ALA");
    expect(selectPropEvents(withStatus("ALA", "postponed"), NOW).events.map((g) => g.home.abbr)).not.toContain("ALA");
  });
  it("live games come first, then the pre-kick games in kickoff / rank order", () => {
    // OSU kicks at 16:30Z (after every 16:00Z game); live, it moves to the front of the whole list
    const live = withStatus("OSU", "live", { detail: "1st 12:00" });
    const { events } = selectPropEvents(live, NOW);
    expect(events[0].home.abbr).toBe("OSU");
    expect(events[0].status).toBe("live");
    expect(events.slice(1, 4).map((g) => g.home.abbr)).toEqual(["IU", "ALA", "HOU"]);
    // a live game still needs a Caesars price and an odds event
    const liveNoCz: CfbBoard = { ...live, games: live.games.map((g) => (g.home.abbr === "OSU" ? { ...g, rows: g.rows.map((r) => ({ ...r, cz: null })) } : g)) };
    expect(selectPropEvents(liveNoCz, NOW).events.map((g) => g.home.abbr)).not.toContain("OSU");
    const liveNoEvent: CfbBoard = { ...live, games: live.games.map((g) => (g.home.abbr === "OSU" ? { ...g, oddsEventId: null } : g)) };
    expect(selectPropEvents(liveNoEvent, NOW).events.map((g) => g.home.abbr)).not.toContain("OSU");
  });
  /* 2026-09-05 (same-day follow-up, read on prod after the INSTRUCTION 40 deploy): nine in-play
     afternoon games filled all 12 slots of the single sorted list, so the twenty-plus evening
     kickoffs got no props at all. Live games and pre-kick games now have their own pools. */
  it("live games never crowd out the pre-kick pool: at most liveMax live PLUS up to max upcoming", () => {
    // INSTRUCTION 42 (2026-09-05): the defaults are now 60 / 24 — larger than the 12-game fixture — so the
    // pool arithmetic is exercised with explicit caps (liveMax 3); the defaults are pinned in "the contract"
    const upcomingIds = selectPropEvents(board, NOW).events.map((g) => g.id);
    const LIVE_CAP = 3;
    expect(upcomingIds.length).toBeGreaterThan(LIVE_CAP + 1);
    // flip more games live than the live pool holds (their kickoffs are still ahead of NOW — status is ESPN's word)
    const liveIds = new Set(upcomingIds.slice(0, LIVE_CAP + 2));
    const many: CfbBoard = { ...board, games: board.games.map((g) => (liveIds.has(g.id) ? { ...g, status: "live" as const, detail: "1st 10:00" } : g)) };
    const { events, capped } = selectPropEvents(many, NOW, CFB_PROPS.maxEvents, LIVE_CAP);
    const live = events.filter((g) => g.status === "live");
    const upcoming = events.filter((g) => g.status === "upcoming");
    expect(live).toHaveLength(LIVE_CAP);
    expect(capped).toBe(true); // the live pool overflowed by two
    expect(events.slice(0, live.length).every((g) => g.status === "live")).toBe(true); // live first
    // every pre-kick game still gets its slot: the whole upcoming remainder, up to maxEvents
    const upcomingLeft = upcomingIds.filter((id) => !liveIds.has(id));
    expect(upcoming.map((g) => g.id)).toEqual(upcomingLeft.slice(0, CFB_PROPS.maxEvents));
    expect(upcoming.length).toBeLessThanOrEqual(CFB_PROPS.maxEvents);
    // the two pools are independent: a smaller live cap changes only the live count
    const two = selectPropEvents(many, NOW, CFB_PROPS.maxEvents, 2);
    expect(two.events.filter((g) => g.status === "live")).toHaveLength(2);
    expect(two.events.filter((g) => g.status === "upcoming").map((g) => g.id)).toEqual(upcoming.map((g) => g.id));
    // and with the live pool empty, `capped` is still an honest word on the upcoming pool alone
    expect(selectPropEvents(board, NOW, 3).capped).toBe(true);
    // under the DEFAULT caps (60 / 24) every fixture game — all five live and the rest pre-kick — is priced
    const all = selectPropEvents(many, NOW);
    expect(all.events).toHaveLength(upcomingIds.length);
    expect(all.capped).toBe(false);
    expect(all.events.filter((g) => g.status === "live")).toHaveLength(LIVE_CAP + 2);
  });
  it("rows parsed for a live game keep status 'live' (the Board's LIVE parlays read it) and are not 'playable' (no pre-kick Kelly)", () => {
    const liveAla = withStatus("ALA", "live", { detail: "3rd 4:12", homeScore: 21, awayScore: 7 }).games.find((g) => g.home.abbr === "ALA") as CfbGame;
    const liveRows = parseEventProps(EVENT, liveAla, { now: LATE, bankroll: 2500 });
    expect(liveRows.length).toBe(rows.length);
    expect(liveRows.every((r) => r.status === "live")).toBe(true);
    expect(liveRows.every((r) => r.playable === false && r.kelly === null)).toBe(true);
    // the pricing itself is unchanged by status: same fair, same EV
    const a = liveRows.find((r) => r.player === "Ty Simpson" && r.market === "pass_yds" && r.side === "over") as CfbPropRow;
    expect(a.fair).toBeCloseTo(0.508664, 5);
    expect(a.cz?.price).toBe(-110);
  });
  it("propsWindowSec: 2 h for a pre-kick set, 10 min once any event in the set is live, 2 h for an empty set", () => {
    expect(propsWindowSec(selectPropEvents(board, NOW).events)).toBe(CFB_PROPS.revalidateSec);
    expect(propsWindowSec([])).toBe(CFB_PROPS.revalidateSec);
    const live = selectPropEvents(withStatus("HOU", "live"), NOW).events;
    expect(hasLiveEvent(live)).toBe(true);
    expect(propsWindowSec(live)).toBe(CFB_PROPS.liveRevalidateSec);
    expect(propsWindowSec(live)).toBe(600);
    expect(hasLiveEvent([{ status: "upcoming" }, { status: "final" }])).toBe(false);
  });
});

describe("app/api/cfb/props/route.ts + src/lib/server/football-props.ts + client — source pins", () => {
  /* 2026-09-08 (the NFL build): the body moved to src/lib/server/football-props.ts and runs on a
     LeagueConfig; the CFB route is a thin shell that keeps the route config and the CFB store keys.
     The body pins scan the shared file; the shell pins scan the route. */
  const route = readSrc("src/lib/server/football-props.ts");
  const shell = readSrc("app/api/cfb/props/route.ts");
  const client = readSrc("src/lib/cfb/client.ts");

  it("reads the key from the environment only and appends it through a template", () => {
    expect(route).toMatch(/process\.env\.ODDS_API_KEY/);
    expect(route).toMatch(/apiKey=\$\{/);
    expect(route).not.toMatch(/apiKey=[A-Za-z0-9]/);
    expect(route).toMatch(/oddsMissing/);
    expect(route).not.toMatch(/status: 500/);
    expect(route).not.toMatch(/console\.(log|info|warn|error)/);
  });
  it("caches each event call for the pull's own window (propsWindowSec: 2 h pre-kick, 10 min live — INSTRUCTION 40) and builds the slate through the shared helper", () => {
    expect(route).toMatch(/const r = await fetch\(url, cache\)/);
    expect(route).toMatch(/const pullSec = propsWindowSec\(toFetch, cfg\.props\)/);
    // THE CAESARS-MISSING RULE (2026-09-05, review fix): Next's data cache is stale-while-revalidate, so a re-pull
    // (a Caesars-missing re-check, or a live game already on the board) bypasses it with cache: "no-store";
    // a first pull or an expired carry keeps next.revalidate at the pull's window
    expect(route).toMatch(/type EventCache = \{ next: \{ revalidate: number \} \} \| \{ cache: "no-store" \}/);
    expect(route).toMatch(
      /const cacheFor = \(g: CfbGame\): EventCache => \{\s*const w = whyOf\.get\(g\.id\);\s*return w === "czMissing" \|\| \(w === "live" && storedIds\.has\(g\.id\)\) \? \{ cache: "no-store" \} : \{ next: \{ revalidate: pullSec \} \};/,
    );
    expect(route).toMatch(/eventOdds\(game\.oddsEventId as string, key, cacheFor\(game\)\)/);
    expect(route).not.toMatch(/const ttlFor = \(g: CfbGame\): number/);
    expect(route).not.toMatch(/PROPS_TTL/);
    expect(route).not.toMatch(/revalidate: CFB_PROPS\.revalidateSec/);
    expect(CFB_PROPS.revalidateSec).toBe(7200);
    expect(CFB_PROPS.liveRevalidateSec).toBe(600);
    // 2026-09-05: the route reads the persisted board before any event fetch, and the budget gates the pull
    expect(route).toMatch(/propsStore\(/);
    expect(route).toMatch(/readBoard\(/);
    expect(route).toMatch(/affordableEvents\(/);
    expect(route.indexOf("readBoard(")).toBeLessThan(route.indexOf("eventOdds(game"));
    expect(route).toMatch(/slateFromEspnOf\(cfg, /);
    expect(route).toMatch(/espnEventsOf\(cfg, /);
    expect(route).toMatch(/selectPropEvents\(/);
    // the six markets come off the league's feed (CFB_LEAGUE copies CFB_PROPS_ODDS_MARKETS), never a CFB constant in the shared body
    expect(route).toMatch(/feeds\.oddsPropMarkets/);
    expect(route).toMatch(/feeds\.oddsEventBase/);
    expect(route).not.toMatch(/CFB_PROPS/);
    expect(route).not.toMatch(/americanfootball_ncaaf/);
    expect(route).toMatch(/"cache-control": "no-store"/);
    expect(route).toMatch(/ptToday\(/);
    expect(route).toMatch(/x-requests-remaining/);
    // the shell: route config only, the body through the shared file on CFB_LEAGUE with the CFB store keys
    expect(shell).toMatch(/export const dynamic = "force-dynamic"/);
    expect(shell).toMatch(/footballPropsGet\(CFB_LEAGUE, req, \{ storeKeys: CFB_PROPS_REDIS \}\)/);
    expect(shell).not.toMatch(/\bfetch\(/);
    expect(shell).not.toMatch(/ODDS_API_KEY/);
    expect(shell.match(/^export const /gm) ?? []).toEqual(["export const "]); // only route config is exported (Vercel build rule)
  });
  it("the client has no refetchInterval anywhere and mirrors the 2-hour window (was 30 min until 2026-09-05)", () => {
    expect(client).not.toMatch(/refetchInterval/);
    expect(route).not.toMatch(/refetchInterval/);
    expect(CFB_PROPS_STALE_MS).toBe(7_200_000);
    expect(cfbPropsQueryKey("2026-09-05", 2500)).toEqual(["cfb", "props", "2026-09-05", 2500]);
    expect(cfbPropsQueryKey(undefined, 2500)).toEqual(["cfb", "props", "today", 2500]);
    expect(client).toMatch(/CFB_ROUTES\.props/);
  });
  it("no football props module — CFB, NFL or shared — references an MLB key, route or store", () => {
    for (const f of [
      "app/api/cfb/props/route.ts",
      "src/lib/cfb/props.ts",
      "src/lib/cfb/props-context.ts",
      "src/lib/cfb/props-types.ts",
      "src/lib/cfb/props-store.ts",
      "src/lib/cfb/slate-server.ts",
      "src/lib/server/football-props.ts",
      "app/api/nfl/props/route.ts",
      "app/api/nfl/route.ts",
      "app/api/nfl/ledger/route.ts",
    ]) {
      const src = readSrc(f);
      expect(src, f).not.toMatch(/pl_ledger|pl_bank2|pl_noplay/);
      expect(src, f).not.toMatch(/pl:ledger:v1|pl:bank:v1|pl:noplay/);
      expect(src, f).not.toMatch(/\/api\/(odds|board|picks|ledger|props)"/);
      expect(src, f).not.toMatch(/baseball_mlb|statsapi\.mlb\.com/);
      expect(src, f).not.toMatch(/\bmlb\b/i);
    }
  });
});
