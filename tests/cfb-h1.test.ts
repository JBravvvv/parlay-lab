import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { attachH1, parseH1 } from "@/lib/cfb/h1";
import { baseMarketOf, FULL_MARKETS, H1_MARKETS, H1_ODDS_MARKETS, H1_SIGMA_SCALE, isH1Market, marketWord, SIDE_MARKETS } from "@/lib/cfb/markets";
import { buildCfbBoard, rowProbAt } from "@/lib/cfb/model";
import { buildCfbCard, legOf } from "@/lib/cfb/card";
import { ptDateOf } from "@/lib/cfb/dates";
import { gradeCfbLeg } from "@/lib/cfb/grade";
import { buildCfbPicks, CFB_PICK_CATEGORIES, legFits } from "@/lib/cfb/picks";
import { decodeH1, encodeH1, propsH1Key } from "@/lib/cfb/props-store";
import { CFB_PARLAY_CATEGORIES, CFB_PROPS_ODDS_MARKETS } from "@/lib/cfb/props-types";
import { CFB_LEAGUE, CFB_PAPER } from "@/lib/cfb/rules";
import { finalsOf } from "@/lib/cfb/slate-server";
import type { CfbFinals, CfbGame, CfbH1Game, CfbTicketLeg } from "@/lib/cfb/types";
import { NFL_LEAGUE } from "@/lib/nfl/rules";
import { swapSettleBook } from "./helpers/settle-book";
import { stripComments } from "./helpers/source";

/**
 * FIRST-HALF LINES (2026-09-19, Josh: "1H bets should be included on NFL & CFB").
 *
 * The 1H markets (h2h_h1 / spreads_h1 / totals_h1) ride the per-event props pull, price through the
 * full game's own reader and row builder under the half's σ, attach onto the slate as six more rows
 * per game, join the ranked list / builder / parlay categories, and settle on ESPN's half-time score
 * (periods 1 + 2 off `linescores`). The synthetic event below is an INVENTED retail shape (three books
 * at -3.5 / 27.5), never a captured quote — the real 2026-09-05 fixtures carry no first-half market.
 */

const FIX = path.join(process.cwd(), "tests", "fixtures");
const readJson = (f: string) => swapSettleBook(JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8")));
const ESPN = readJson("cfb/espn-scoreboard-2026-09-05.json") as { events: unknown[] };
const ODDS = readJson("cfb/odds-ncaaf-2026-09-05.json") as unknown[];
const FPI = readJson("cfb/espn-fpi.json");
const NOW = Date.parse("2026-09-05T12:00:00Z");
const DATE = "2026-09-05";
const GAME_ID = "401858425"; // Indiana (home) v North Texas, 16:00Z
const SB = CFB_LEAGUE.model.settleBook;

const root = process.cwd();
const readSrc = (p: string) => stripComments(fs.readFileSync(path.join(root, p), "utf8"));

const board = () => buildCfbBoard({ date: DATE, espnEvents: ESPN.events, oddsEvents: ODDS, fpi: FPI, now: NOW, bankroll: 2500, league: CFB_LEAGUE });

type Names = { home: string; away: string };
const IU_UNT: Names = { home: "Indiana Hoosiers", away: "North Texas Mean Green" };
function book(key: string, title: string, opts: { homeSpreadPrice?: number; ml?: boolean; spread?: boolean; total?: boolean } = {}, names: Names = IU_UNT) {
  const { homeSpreadPrice = -110, ml = true, spread = true, total = true } = opts;
  const markets: unknown[] = [];
  if (spread) markets.push({ key: "spreads_h1", outcomes: [{ name: names.home, price: homeSpreadPrice, point: -3.5 }, { name: names.away, price: -110, point: 3.5 }] });
  if (ml) markets.push({ key: "h2h_h1", outcomes: [{ name: names.home, price: -180 }, { name: names.away, price: 150 }] });
  if (total) markets.push({ key: "totals_h1", outcomes: [{ name: "Over", price: -110, point: 27.5 }, { name: "Under", price: -110, point: 27.5 }] });
  // a player market beside them — the 1H reader must ignore it
  markets.push({ key: "player_pass_yds", outcomes: [{ name: "Over", description: "A Quarterback", price: -115, point: 245.5 }, { name: "Under", description: "A Quarterback", price: -105, point: 245.5 }] });
  return { key, title, last_update: "2026-09-05T06:25:43Z", markets };
}
const eventJson = (opts: { homeSpreadPrice?: number; ml?: boolean; spread?: boolean; total?: boolean; books?: number } = {}, names: Names = IU_UNT) => ({
  id: names === IU_UNT ? "h1-synthetic-event" : `h1-synthetic-${names.home}`,
  sport_key: "americanfootball_ncaaf",
  commence_time: "2026-09-05T16:00:00Z",
  home_team: names.home,
  away_team: names.away,
  bookmakers: [book(SB, "Settle Book", opts, names), book("fanduel", "FanDuel", { ...opts, homeSpreadPrice: -110 }, names), book("betmgm", "BetMGM", { ...opts, homeSpreadPrice: -110 }, names)].slice(0, opts.books ?? 3),
});
/** the synthetic half on EVERY game of the fixture board (the settle book +105 on each home 1H spread) */
const attachAll = (b: ReturnType<typeof board>, now = NOW) => {
  const all = b.games.map((g) => parseH1(eventJson({ homeSpreadPrice: 105 }, { home: g.home.name, away: g.away.name }), g, CFB_LEAGUE, now)!);
  return attachH1(b.games, all, { now, bankroll: 2500, league: CFB_LEAGUE });
};

const gameOf = (b: ReturnType<typeof board>) => b.games.find((g) => g.id === GAME_ID)!;

describe("markets.ts — the market vocabulary", () => {
  it("names the three first-half markets beside the three full-game ones", () => {
    expect(FULL_MARKETS).toEqual(["ml", "spread", "total"]);
    expect(H1_MARKETS).toEqual(["ml_1h", "spread_1h", "total_1h"]);
    expect(SIDE_MARKETS).toEqual([...FULL_MARKETS, ...H1_MARKETS]);
    expect(H1_ODDS_MARKETS).toBe("h2h_h1,spreads_h1,totals_h1");
    expect(H1_SIGMA_SCALE).toBeCloseTo(Math.SQRT1_2, 12);
  });
  it("isH1Market / baseMarketOf / marketWord", () => {
    expect(isH1Market("spread_1h")).toBe(true);
    expect(isH1Market("spread")).toBe(false);
    expect(isH1Market("pass_yds")).toBe(false);
    expect(baseMarketOf("ml_1h")).toBe("ml");
    expect(baseMarketOf("total_1h")).toBe("total");
    expect(baseMarketOf("total")).toBe("total");
    expect(baseMarketOf("anytime_td")).toBe("anytime_td");
    expect(marketWord("ml")).toBe("ML");
    expect(marketWord("spread_1h")).toBe("1H Spread");
    expect(marketWord("total_1h")).toBe("1H Total");
    expect(marketWord("ml_1h")).toBe("1H ML");
  });
});

describe("parseH1 — the per-event first-half consensus", () => {
  const b = board();
  const game = gameOf(b);
  it("reads the three 1H markets under the half's σ; the player market beside them is ignored", () => {
    const h = parseH1(eventJson(), game, CFB_LEAGUE, NOW);
    expect(h).not.toBeNull();
    expect(h!.gameId).toBe(GAME_ID);
    expect(h!.oddsEventId).toBe("h1-synthetic-event");
    expect(h!.model.sigma).toBeCloseTo(CFB_LEAGUE.model.sigma * Math.SQRT1_2, 9);
    expect(h!.model.sigmaTotal).toBeCloseTo(CFB_LEAGUE.model.sigmaTotal * Math.SQRT1_2, 9);
    // three books at -3.5 / -110 both ways: every book's margin is exactly 3.5 → the median is 3.5
    expect(h!.model.muMargin).toBeCloseTo(3.5, 9);
    expect(h!.model.muTotal).toBeCloseTo(27.5, 9);
    expect(h!.model.books).toEqual({ ml: 3, spread: 3, total: 3 });
    // pHome blends the de-vigged 1H moneyline (-180/+150 ≈ .617) with the spread-implied chance (Φ(3.5/σ₁ₕ) ≈ .618) — no FPI
    expect(h!.model.pHome).toBeGreaterThan(0.6);
    expect(h!.model.pHome).toBeLessThan(0.64);
    expect(Number.isFinite(Date.parse(h!.model.pricedAt))).toBe(true);
    expect(h!.sides.map((s) => `${s.market}|${s.side}|${s.line ?? ""}`)).toEqual([
      "ml_1h|home|",
      "ml_1h|away|",
      "spread_1h|home|-3.5",
      "spread_1h|away|3.5",
      "total_1h|over|27.5",
      "total_1h|under|27.5",
    ]);
    for (const s of h!.sides) {
      expect(s.books).toBe(3);
      expect(s.quotes).toHaveLength(3);
      expect(s.mkt).toBeGreaterThan(0);
      expect(s.mkt).toBeLessThan(1);
    }
    const home = h!.sides.find((s) => s.market === "spread_1h" && s.side === "home")!;
    expect(home.quotes.find((q) => q.book === SB)!.line).toBe(-3.5);
    const away = h!.sides.find((s) => s.market === "spread_1h" && s.side === "away")!;
    expect(away.quotes.find((q) => q.book === SB)!.line).toBe(3.5);
  });
  it("rowProbAt prices a 1H side off model.h1 — and null without one (never the full-game numbers)", () => {
    const h = parseH1(eventJson(), game, CFB_LEAGUE, NOW)!;
    const model = { ...game.model, h1: h.model };
    expect(rowProbAt(model, "spread_1h", "home", -3.5)!.win).toBeCloseTo(0.5, 9);
    expect(rowProbAt(model, "spread_1h", "away", 3.5)!.win).toBeCloseTo(0.5, 9);
    expect(rowProbAt(model, "total_1h", "over", 27.5)!.win).toBeCloseTo(0.5, 9);
    expect(rowProbAt(model, "ml_1h", "home", null)!.win).toBeCloseTo(h.model.pHome!, 12);
    expect(rowProbAt(game.model, "spread_1h", "home", -3.5)).toBeNull();
    // the full-game rows read the full-game model, untouched by h1
    expect(rowProbAt(model, "spread", "home", -40.5)).toEqual(rowProbAt(game.model, "spread", "home", -40.5));
  });
  it("null when no book posts a half, when only one book does (minBooks 2), and for an unusable event", () => {
    expect(parseH1(eventJson({ ml: false, spread: false, total: false }), game, CFB_LEAGUE, NOW)).toBeNull();
    expect(parseH1(eventJson({ books: 1 }), game, CFB_LEAGUE, NOW)).toBeNull();
    expect(parseH1({ id: 1 }, game, CFB_LEAGUE, NOW)).toBeNull();
    expect(parseH1(null, game, CFB_LEAGUE, NOW)).toBeNull();
  });
  it("a spread-only half gives the model a pHome (spread-implied) but no 1H moneyline side", () => {
    const h = parseH1(eventJson({ ml: false, total: false }), game, CFB_LEAGUE, NOW)!;
    expect(h.sides.map((s) => s.market)).toEqual(["spread_1h", "spread_1h"]);
    expect(h.model.pHome).not.toBeNull();
    expect(h.model.muTotal).toBeNull();
    expect(h.model.books).toEqual({ ml: 0, spread: 3, total: 0 });
  });
});

describe("attachH1 — six more rows on the slate's game, built by the full game's own row builder", () => {
  it("attaches by ESPN game id, leaves the full-game rows byte-identical, and is idempotent", () => {
    const b = board();
    const game = gameOf(b);
    const before = JSON.stringify(game.rows);
    const n0 = game.rows.length;
    const h = parseH1(eventJson({ homeSpreadPrice: 105 }), game, CFB_LEAGUE, NOW)!;
    expect(attachH1(b.games, [h], { now: NOW, bankroll: 2500, league: CFB_LEAGUE })).toBe(1);
    expect(game.rows).toHaveLength(n0 + 6);
    expect(JSON.stringify(game.rows.slice(0, n0))).toBe(before);
    expect(game.model.h1).toEqual(h.model);
    const keys = game.rows.slice(n0).map((r) => r.key);
    expect(keys).toEqual([
      `${GAME_ID}|ml_1h|home|`,
      `${GAME_ID}|ml_1h|away|`,
      `${GAME_ID}|spread_1h|home|-3.5`,
      `${GAME_ID}|spread_1h|away|3.5`,
      `${GAME_ID}|total_1h|over|27.5`,
      `${GAME_ID}|total_1h|under|27.5`,
    ]);
    for (const r of game.rows.slice(n0)) {
      expect(r.label.startsWith("1H ")).toBe(true);
      expect(r.gameId).toBe(GAME_ID);
      expect(r.books).toBe(3);
    }
    expect(game.rows.find((r) => r.key === `${GAME_ID}|spread_1h|home|-3.5`)!.label).toBe("1H Indiana -3.5");
    expect(game.rows.find((r) => r.key === `${GAME_ID}|total_1h|over|27.5`)!.label).toBe("1H Over 27.5");
    expect(game.rows.find((r) => r.key === `${GAME_ID}|ml_1h|away|`)!.label).toBe("1H North Texas ML");
    // no other game gained a row; every other game's model has no h1
    for (const g of b.games) if (g.id !== GAME_ID) expect(g.model.h1 ?? null).toBeNull();
    // idempotent
    expect(attachH1(b.games, [h], { now: NOW, bankroll: 2500, league: CFB_LEAGUE })).toBe(0);
    expect(game.rows).toHaveLength(n0 + 6);
    // an unknown game id / nothing to attach
    expect(attachH1(b.games, [{ ...h, gameId: "no-such-game" }], { now: NOW, bankroll: 2500, league: CFB_LEAGUE })).toBe(0);
    expect(attachH1(b.games, null, { now: NOW, bankroll: 2500, league: CFB_LEAGUE })).toBe(0);
    expect(attachH1(b.games, [], { now: NOW, bankroll: 2500, league: CFB_LEAGUE })).toBe(0);
  });
  it("a 1H row is priced like any side: EV at the settle book, ¼-Kelly, playable while the kickoff is ahead", () => {
    const b = board();
    const game = gameOf(b);
    attachH1(b.games, [parseH1(eventJson({ homeSpreadPrice: 105 }), game, CFB_LEAGUE, NOW)!], { now: NOW, bankroll: 2500, league: CFB_LEAGUE });
    const home = game.rows.find((r) => r.key === `${GAME_ID}|spread_1h|home|-3.5`)!;
    expect(home.fair).toBeCloseTo(0.5, 9);
    expect(home.push).toBe(0);
    expect(home.cz).not.toBeNull();
    expect(home.cz!.book).toBe(SB);
    expect(home.cz!.price).toBe(105);
    expect(home.cz!.line).toBe(-3.5);
    // fair .5 at +105 → EV = .5 × 2.05 − 1 = +2.5 %
    expect(home.evCz).toBeCloseTo(2.5, 6);
    expect(home.playable).toBe(true);
    expect(home.kelly).toBeGreaterThan(0);
    expect(home.grade).not.toBeNull();
    const away = game.rows.find((r) => r.key === `${GAME_ID}|spread_1h|away|3.5`)!;
    expect(away.cz!.price).toBe(-110);
    // fair .5 at -110 → EV = .5 × 1.909 − 1 = −4.55 %
    expect(away.evCz).toBeCloseTo(-4.545, 2);
    expect(away.kelly).toBe(0);
    expect(away.teamId).toBe(game.away.id);
    expect(home.teamId).toBe(game.home.id);
    expect(game.rows.find((r) => r.key === `${GAME_ID}|total_1h|over|27.5`)!.teamId).toBeNull();
  });
  it("once the kickoff has passed the 1H rows are not playable and stake nothing", () => {
    const late = Date.parse("2026-09-05T17:00:00Z");
    const b = buildCfbBoard({ date: DATE, espnEvents: ESPN.events, oddsEvents: ODDS, fpi: FPI, now: late, bankroll: 2500, league: CFB_LEAGUE });
    const game = gameOf(b);
    attachH1(b.games, [parseH1(eventJson({ homeSpreadPrice: 105 }), game, CFB_LEAGUE, late)!], { now: late, bankroll: 2500, league: CFB_LEAGUE });
    const home = game.rows.find((r) => r.key === `${GAME_ID}|spread_1h|home|-3.5`)!;
    expect(home.playable).toBe(false);
    expect(home.kelly).toBe(0);
    expect(home.evCz).toBeCloseTo(2.5, 6);
  });
});

describe("the first-half score off ESPN's linescores", () => {
  const FIN = readJson("nfl/espn-scoreboard-2026-08-22-final.json") as { events: unknown[] };
  const DATE_0822 = ptDateOf("2026-08-22T16:00Z");
  const NOW_0822 = Date.parse("2026-08-23T12:00:00Z");
  const shape = (events: unknown[]) => buildCfbBoard({ date: DATE_0822, espnEvents: events, oddsEvents: [], fpi: null, now: NOW_0822, bankroll: 2500, league: NFL_LEAGUE });
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
  const findEvent = (id: string) => FIN.events.find((e) => (e as { id: string }).id === id) as Record<string, unknown>;
  /** ESPN carries the status on the event and again on its competition — set both, as the feed does */
  const setStatus = (ev: Record<string, unknown>, period: number, type: Record<string, unknown>) => {
    const comp = (ev.competitions as Record<string, unknown>[])[0];
    ev.status = { ...(ev.status as Record<string, unknown>), period, type };
    comp.status = { ...(comp.status as Record<string, unknown>), period, type };
    return comp;
  };
  it("a final carries both halves' quarters: Lions 7–7 Commanders at the half (17–13 final), h1Final", () => {
    const g = shape(FIN.events).games.find((x) => x.id === "401873601")!;
    expect(g.status).toBe("final");
    expect(g.homeScore).toBe(17);
    expect(g.awayScore).toBe(13);
    expect(g.homeH1).toBe(7);
    expect(g.awayH1).toBe(7);
    expect(g.h1Final).toBe(true);
    const ne = shape(FIN.events).games.find((x) => x.id === "401873293")!;
    expect([ne.homeH1, ne.awayH1, ne.h1Final]).toEqual([10, 14, true]);
  });
  it("finalsOf carries the half beside the final, and only when both quarters are posted", () => {
    const finals = finalsOf(shape(FIN.events).games);
    expect(finals["401873601"]).toEqual({ home: 17, away: 13, final: true, status: "final", h1: { home: 7, away: 7, final: true } });
    expect(finals["401873296"]).toEqual({ home: 16, away: 15, final: true, status: "final", h1: { home: 0, away: 9, final: true } });
    // a scheduled game: no score, no half
    const g0 = board().games[0];
    expect(finalsOf([g0])[g0.id]).toEqual({ home: 0, away: 0, final: false, status: "upcoming" });
    expect("h1" in finalsOf([g0])[g0.id]).toBe(false);
  });
  it("halftime: the half is final with two quarters on the board and the game still live", () => {
    const ev = clone(findEvent("401873601"));
    const comp = setStatus(ev, 2, { id: "23", name: "STATUS_HALFTIME", state: "in", completed: false, description: "Halftime", detail: "Halftime", shortDetail: "Half" });
    for (const c of comp.competitors as Record<string, unknown>[]) {
      c.linescores = (c.linescores as unknown[]).slice(0, 2);
      c.score = String((c.linescores as { value: number }[]).reduce((a, l) => a + l.value, 0));
    }
    const g = shape([ev]).games[0];
    expect(g.status).toBe("live");
    expect([g.homeH1, g.awayH1, g.h1Final]).toEqual([7, 7, true]);
    expect(finalsOf([g])[g.id]).toEqual({ home: 7, away: 7, final: false, status: "live", h1: { home: 7, away: 7, final: true } });
  });
  it("in the 2nd quarter the half is on the board but not final; in the 1st there is no half yet; in the 3rd it is final", () => {
    const at = (period: number, quarters: number) => {
      const ev = clone(findEvent("401873601"));
      const comp = setStatus(ev, period, { id: "2", name: "STATUS_IN_PROGRESS", state: "in", completed: false, description: "In Progress", detail: "3:12 - 2nd", shortDetail: "3:12 - 2nd" });
      for (const c of comp.competitors as Record<string, unknown>[]) c.linescores = (c.linescores as unknown[]).slice(0, quarters);
      return shape([ev]).games[0];
    };
    const q2 = at(2, 2);
    expect([q2.homeH1, q2.awayH1, q2.h1Final]).toEqual([7, 7, false]);
    expect(finalsOf([q2])[q2.id].h1).toEqual({ home: 7, away: 7, final: false });
    const q1 = at(1, 1);
    expect(q1.homeH1).toBeUndefined();
    expect(q1.h1Final).toBeUndefined();
    expect("h1" in finalsOf([q1])[q1.id]).toBe(false);
    const q3 = at(3, 3);
    expect([q3.homeH1, q3.awayH1, q3.h1Final]).toEqual([7, 7, true]);
  });
});

describe("gradeCfbLeg — a 1H leg settles on the half-time score, the moment the half is over", () => {
  const leg = (over: Partial<CfbTicketLeg>): CfbTicketLeg => ({
    label: "1H Indiana -3.5",
    prop: "1H Spread",
    cz: -110,
    gkey: GAME_ID,
    lkey: `${GAME_ID}|spread_1h|home|-3.5`,
    market: "spread_1h",
    side: "home",
    line: -3.5,
    teamId: "84",
    prob: 0.5,
    push: 0,
    ...over,
  });
  const fin = (h1: CfbFinals[string]["h1"] | undefined, over: Partial<CfbFinals[string]> = {}): CfbFinals[string] => ({ home: 24, away: 21, final: true, status: "final", ...(h1 ? { h1 } : {}), ...over });
  const half = { home: 10, away: 14, final: true };
  it("moneyline / spread / total on the HALF score (10–14), full-game final 24–21 ignored", () => {
    expect(gradeCfbLeg(leg({ market: "ml_1h", side: "home", line: null }), fin(half))).toEqual({ result: "lost", detail: "1H 10-14 · lost by 4" });
    expect(gradeCfbLeg(leg({ market: "ml_1h", side: "away", line: null }), fin(half))).toEqual({ result: "won", detail: "1H 10-14 · won by 4" });
    expect(gradeCfbLeg(leg({}), fin(half))).toEqual({ result: "lost", detail: "1H 10-14 · margin -4 vs -3.5 · short by 7.5" });
    expect(gradeCfbLeg(leg({ side: "away", line: 3.5 }), fin(half))).toEqual({ result: "won", detail: "1H 10-14 · margin +4 vs +3.5 · covered by 7.5" });
    expect(gradeCfbLeg(leg({ market: "total_1h", side: "over", line: 23.5 }), fin(half))).toEqual({ result: "won", detail: "1H 10-14 · total 24 vs 23.5 · over by 0.5" });
    expect(gradeCfbLeg(leg({ market: "total_1h", side: "under", line: 24 }), fin(half))).toEqual({ result: "push", detail: "1H 10-14 · total 24 vs 24 · push" });
    expect(gradeCfbLeg(leg({ market: "ml_1h", side: "home", line: null }), fin({ home: 7, away: 7, final: true })).result).toBe("push");
    expect(gradeCfbLeg(leg({ line: null }), fin(half))).toEqual({ result: "ungradable", detail: "1H 10-14 · spread leg has no line" });
  });
  it("settles at halftime while the game is still live; pending until both quarters are posted", () => {
    expect(gradeCfbLeg(leg({ side: "away", line: 3.5 }), fin(half, { final: false, status: "live" })).result).toBe("won");
    expect(gradeCfbLeg(leg({}), fin({ home: 10, away: 14, final: false }, { final: false, status: "live" }))).toEqual({ result: "pending", detail: "first half in progress" });
    expect(gradeCfbLeg(leg({}), fin(undefined, { final: false, status: "live" }))).toEqual({ result: "pending", detail: "no first-half score yet" });
    expect(gradeCfbLeg(leg({}), fin(undefined, { final: false, status: "upcoming" }))).toEqual({ result: "pending", detail: "no first-half score yet" });
    expect(gradeCfbLeg(leg({}), fin(undefined))).toEqual({ result: "pending", detail: "first-half score unavailable" });
    expect(gradeCfbLeg(leg({}), fin(half, { status: "postponed", final: false }))).toEqual({ result: "pending", detail: "postponed" });
    expect(gradeCfbLeg(leg({}), undefined)).toEqual({ result: "pending", detail: "no final yet" });
  });
  it("a full-game leg grades exactly as before, with or without a half beside the final", () => {
    const fg = leg({ label: "Indiana -3.5", prop: "Spread", market: "spread", lkey: `${GAME_ID}|spread|home|-3.5` });
    expect(gradeCfbLeg(fg, fin(half))).toEqual({ result: "lost", detail: "24-21 · margin +3 vs -3.5 · short by 0.5" });
    expect(gradeCfbLeg(fg, fin(undefined))).toEqual(gradeCfbLeg(fg, fin(half)));
    expect(gradeCfbLeg({ ...fg, market: "ml", line: null }, fin(half))).toEqual({ result: "won", detail: "24-21 · won by 3" });
    expect(gradeCfbLeg({ ...fg, market: "total", side: "over", line: 44.5 }, fin(half))).toEqual({ result: "won", detail: "24-21 · total 45 vs 44.5 · over by 0.5" });
    expect(gradeCfbLeg(fg, fin(half, { final: false, status: "live" }))).toEqual({ result: "pending", detail: "not final" });
  });
});

describe("picks / card / categories", () => {
  const legOfMarket = (market: string, gameId = "g1") => ({ kind: "side" as const, rowKey: `${gameId}|${market}|home|`, gameId, label: market, sub: "", cz: -110, dec: 1.909, prob: 0.5, push: 0, market, evCz: 3, live: false });
  it("legFits: one leg per market per game counts the half with the full game", () => {
    expect(legFits(legOfMarket("spread_1h"), [legOfMarket("spread")])).toBe(false);
    expect(legFits(legOfMarket("spread"), [legOfMarket("spread_1h")])).toBe(false);
    expect(legFits(legOfMarket("total_1h"), [legOfMarket("total")])).toBe(false);
    expect(legFits(legOfMarket("ml_1h"), [legOfMarket("spread")])).toBe(true);
    expect(legFits(legOfMarket("spread_1h"), [legOfMarket("spread", "g2")])).toBe(true);
    expect(legFits(legOfMarket("spread_1h"), [legOfMarket("total")])).toBe(true);
  });
  it("the pick categories and parlay categories carry the three 1H markets right after the full-game three", () => {
    expect(CFB_PICK_CATEGORIES.slice(0, 7)).toEqual(["all", "ml", "spread", "total", "ml_1h", "spread_1h", "total_1h"]);
    expect(CFB_PARLAY_CATEGORIES.slice(0, 6)).toEqual(["ml", "spread", "total", "ml_1h", "spread_1h", "total_1h"]);
    expect(CFB_PARLAY_CATEGORIES).toHaveLength(19);
  });
  it("buildCfbPicks lists the 1H rows under their own categories and in `all`, labelled 1H", () => {
    const b = board();
    const game = gameOf(b);
    attachH1(b.games, [parseH1(eventJson({ homeSpreadPrice: 105 }), game, CFB_LEAGUE, NOW)!], { now: NOW, bankroll: 2500, league: CFB_LEAGUE });
    const picks = buildCfbPicks(b, null, { now: NOW, bankroll: 2500 });
    expect(picks.categories.spread_1h.map((p) => p.label).sort()).toEqual(["1H Indiana -3.5", "1H North Texas +3.5"]);
    expect(picks.categories.ml_1h).toHaveLength(2);
    expect(picks.categories.total_1h).toHaveLength(2);
    expect(picks.categories.all.filter((p) => isH1Market(p.market))).toHaveLength(6);
    // the 1H spread is not in the full-game spread list
    expect(picks.categories.spread.some((p) => isH1Market(p.market))).toBe(false);
    const home = picks.categories.spread_1h.find((p) => p.label === "1H Indiana -3.5")!;
    expect(home.teamId).toBe(game.home.id);
    expect(picks.categories.total_1h[0].teamId).toBeNull();
    expect(home.playable).toBe(true);
    expect(home.kelly).toBeGreaterThan(0);
  });
  it("the three 1H parlay sets build from 1H legs only, one leg per game, once the slate carries the half", () => {
    const b = board();
    expect(attachAll(b)).toBe(b.games.length);
    const picks = buildCfbPicks(b, null, { now: NOW, bankroll: 2500 });
    for (const k of ["ml_1h", "spread_1h", "total_1h"] as const) {
      const list = picks.sets[k];
      expect(list.length, k).toBeGreaterThan(0);
      for (const t of list) {
        expect(t.legs.length).toBeGreaterThanOrEqual(2);
        expect(t.legs.every((l) => l.market === k), k).toBe(true);
        expect(new Set(t.legs.map((l) => l.gameId)).size).toBe(t.legs.length);
        for (const l of t.legs) expect(l.label.startsWith("1H ")).toBe(true);
      }
    }
    // the full-game sets never take a 1H leg; the mixed set may, on a distinct game
    for (const k of ["ml", "spread", "total"] as const) for (const t of picks.sets[k]) expect(t.legs.some((l) => isH1Market(l.market)), k).toBe(false);
  });
  it("card.legOf words a 1H leg with its market ('1H Spread') and the auto paper card never drafts a 1H row", () => {
    const b = board();
    const game = gameOf(b);
    attachH1(b.games, [parseH1(eventJson({ homeSpreadPrice: 105 }), game, CFB_LEAGUE, NOW)!], { now: NOW, bankroll: 2500, league: CFB_LEAGUE });
    const row = game.rows.find((r) => r.key === `${GAME_ID}|spread_1h|home|-3.5`)!;
    const l = legOf(row, game)!;
    expect(l.prop).toBe("1H Spread");
    expect(l.market).toBe("spread_1h");
    expect(l.label).toBe("1H Indiana -3.5");
    expect(l.line).toBe(-3.5);
    expect(l.prob).toBeCloseTo(0.5, 9);
    expect(legOf(game.rows.find((r) => r.key === `${GAME_ID}|ml_1h|home|`)!, game)!.prop).toBe("1H ML");
    expect(legOf(game.rows.find((r) => r.key === `${GAME_ID}|total_1h|over|27.5`)!, game)!.prop).toBe("1H Total");
    expect(legOf(game.rows.find((r) => r.market === "spread" && r.side === "home")!, game)!.prop).toBe("Spread");
    const card = buildCfbCard(b, { bankroll: 2500, daily: CFB_PAPER.daily, fun: CFB_PAPER.fun, now: NOW });
    const legs = [...card.core, ...card.funT].flatMap((t) => t.legs);
    expect(legs.length).toBeGreaterThan(0);
    expect(legs.some((x) => isH1Market(x.market))).toBe(false);
    // the +2.5 % 1H spread cleared no gate onto the card — it is Josh's to pick, by design
    expect(card.benched.some((x) => x.label.startsWith("1H "))).toBe(false);
  });
});

describe("the store value and the feed", () => {
  it("encodeH1 / decodeH1 round-trip; garbage decodes to null", () => {
    const game = gameOf(board());
    const h = parseH1(eventJson(), game, CFB_LEAGUE, NOW)!;
    const store = { generatedAt: new Date(NOW).toISOString(), games: [h] as CfbH1Game[] };
    const raw = encodeH1(store);
    expect(typeof raw).toBe("string");
    expect(decodeH1(raw)).toEqual(store);
    expect(decodeH1(null)).toBeNull();
    expect(decodeH1("")).toBeNull();
    expect(decodeH1("not base64 gzip")).toBeNull();
    expect(decodeH1(Buffer.from("{}").toString("base64"))).toBeNull();
    expect(decodeH1(encodeH1({ generatedAt: "nope", games: [] }))).toBeNull();
    expect(decodeH1(encodeH1({ generatedAt: store.generatedAt, games: [{ gameId: 1 } as unknown as CfbH1Game] }))).toBeNull();
    expect(propsH1Key("2026-09-20")).toBe("pl:cfb:props:v1:2026-09-20:h1");
    expect(propsH1Key("2026-09-20", { board: "pl:nfl:props:v1:", spend: "pl:nfl:props:spend:v1:" })).toBe("pl:nfl:props:v1:2026-09-20:h1");
  });
  it("the per-event market list carries the three 1H markets after the six player markets, on both leagues", () => {
    expect(CFB_PROPS_ODDS_MARKETS.endsWith(",h2h_h1,spreads_h1,totals_h1")).toBe(true);
    expect(CFB_PROPS_ODDS_MARKETS.split(",")).toHaveLength(13);
    expect(CFB_LEAGUE.feeds.oddsPropMarkets).toBe(CFB_PROPS_ODDS_MARKETS);
    expect(NFL_LEAGUE.feeds.oddsPropMarkets).toBe(CFB_PROPS_ODDS_MARKETS);
  });
});

describe("source pins — where the 1H lines show", () => {
  it("the props pull parses and stores the half; both slate routes read it back onto the board", () => {
    const pull = readSrc("src/lib/server/football-props.ts");
    expect(pull).toMatch(/parseH1\(r\.json, game, cfg, now\)/);
    expect(pull).toMatch(/store\.writeH1\(date, \{ generatedAt: nowIso, games: h1Games \}\)/);
    expect(pull).toMatch(/store\.readH1\(date\)/);
    expect(readSrc("app/api/cfb/route.ts")).toMatch(/readH1\(date\)/);
    expect(readSrc("app/api/nfl/route.ts")).toMatch(/readH1\(date\)/);
    expect(readSrc("src/lib/cfb/slate-server.ts")).toMatch(/attachH1\(board\.games, opts\?\.h1, \{ now, bankroll, league: cfg \}\)/);
    expect(readSrc("src/lib/cfb/card.ts")).toMatch(/!isH1Market\(r\.market\)/);
  });
  it("Board categories, ranked-list chips, game-card and sandbox grid rows, slip and ticket wording", () => {
    const pb = readSrc("src/components/cfb/CfbPicksBoard.tsx");
    expect(pb).toMatch(/\{ key: "ml_1h", label: "1H ML", prop: false \}/);
    expect(pb).toMatch(/\{ key: "spread_1h", label: "1H SPREAD", prop: false \}/);
    expect(pb).toMatch(/\{ key: "total_1h", label: "1H TOTAL", prop: false \}/);
    expect(pb).toMatch(/ml_1h: \{ label: "1H ML"/);
    expect(pb).toMatch(/SIDE_CAT\.has\(cat\)/);
    const props = readSrc("src/components/cfb/CfbProps.tsx");
    expect(props).toMatch(/\{ key: "ml_1h", label: "1H ML" \}/);
    expect(props).toMatch(/\{ key: "spread_1h", label: "1H Spread" \}/);
    expect(props).toMatch(/\{ key: "total_1h", label: "1H Total" \}/);
    expect(props).toMatch(/\|away\|1h/);
    expect(props).toMatch(/\|home\|1h/);
    const card = readSrc("src/components/cfb/CfbGameCard.tsx");
    expect(card).toMatch(/-away-1h/);
    expect(card).toMatch(/-home-1h/);
    expect(card).toMatch(/function H1Block/);
    expect(readSrc("src/components/cfb/CfbSlip.tsx")).toMatch(/isH1Market\(l\.market\) \? marketWord\(l\.market\)/);
    const ticket = readSrc("src/components/cfb/CfbTicketCard.tsx");
    expect(ticket).not.toMatch(/leg\.market === "total"/);
    expect(ticket.match(/baseMarketOf\(leg\.market\) === "total"/g)?.length).toBe(4);
    expect(ticket.match(/replace\(\/\^1H\\s\+\/, ""\)/g)?.length).toBe(2);
    expect(readSrc("src/components/cfb/CfbSharp.tsx")).toMatch(/1H lines · /);
  });
});
