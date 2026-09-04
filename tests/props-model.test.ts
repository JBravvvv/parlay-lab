import { describe, expect, it } from "vitest";
import type { PickRow, PropBoardRow } from "@/engine";
import {
  bookAb,
  bothSides,
  groupByGame,
  legId,
  norm,
  oppRow,
  playerLeg,
  rankOf,
  sideLabel,
  sidePrice,
  sideProb,
  sideShort,
} from "@/components/props/props-model";

/**
 * PARLAY BUILDER — pure-function pins on src/components/props/props-model.ts
 * (the price / prob / label helpers the O/U buttons and the slip read). These
 * run the functions on synthetic rows — no board, no network — so a silent
 * logic change (the under-side 100−% flip, CZ-before-feed price precedence,
 * the leg id / sub format, away-first ordering) turns red even though the
 * source-scan pins in props-ui.test.ts would still see the same names.
 *
 * Every number below is a synthetic fixture, NOT a market quote; nothing here
 * asserts what any book posts.
 */

const row = (over: Partial<PropBoardRow> = {}): PropBoardRow => ({
  p: "Gunnar Henderson",
  tm: "BAL",
  ln: 1.5,
  lkey: "bal-henderson-tb-1.5",
  o: -115,
  oBook: "DraftKings",
  u: -105,
  uBook: "FanDuel",
  cz: null,
  pO: 58.2,
  fO: 52.4,
  books: 3,
  ...over,
});

describe("sideLabel / sideShort — the bet as the book words it, and its button form", () => {
  it("anytime HR (ln 0.5) reads Anytime HR / No HR, abbreviated Any HR / No HR", () => {
    const hr = row({ ln: 0.5 });
    expect(sideLabel("batter_home_runs", hr, "o")).toBe("Anytime HR");
    expect(sideLabel("batter_home_runs", hr, "u")).toBe("No HR");
    expect(sideShort("batter_home_runs", hr, "o")).toBe("Any HR");
    expect(sideShort("batter_home_runs", hr, "u")).toBe("No HR");
  });
  it("every other market is Over/Under <line>, abbreviated O/U <line>", () => {
    expect(sideLabel("batter_total_bases", row(), "o")).toBe("Over 1.5");
    expect(sideLabel("batter_total_bases", row(), "u")).toBe("Under 1.5");
    expect(sideShort("batter_total_bases", row(), "o")).toBe("O 1.5");
    expect(sideShort("batter_total_bases", row(), "u")).toBe("U 1.5");
    // a 0.5 line on a non-HR market is still Over/Under, not "Anytime"
    expect(sideLabel("batter_hits", row({ ln: 0.5 }), "o")).toBe("Over 0.5");
    expect(sideShort("pitcher_strikeouts", row({ ln: 6.5 }), "u")).toBe("U 6.5");
  });
});

describe("bookAb — feed book titles → the tag that fits on a price button", () => {
  it("maps the known books and is case/whitespace-proof", () => {
    expect(bookAb("draftkings")).toBe("DK");
    expect(bookAb("DraftKings")).toBe("DK");
    expect(bookAb("  FanDuel ")).toBe("FD");
    expect(bookAb("BetMGM")).toBe("MGM");
    expect(bookAb("William Hill (US)")).toBe("CZ");
    expect(bookAb("caesars")).toBe("CZ");
  });
  it("an unknown book becomes its first four letters, uppercased", () => {
    expect(bookAb("SuperBook")).toBe("SUPE");
    expect(bookAb("bet365")).toBe("BET3");
  });
});

describe("sidePrice — Caesars first, else the feed's best with its book tag", () => {
  it("uses the Caesars quote when Caesars posts that side", () => {
    const r = row({ cz: { o: -120, u: 100 } });
    expect(sidePrice(r, "o")).toEqual({ am: -120, book: "CZ" });
    expect(sidePrice(r, "u")).toEqual({ am: 100, book: "CZ" });
  });
  it("falls back per side: a one-sided Caesars quote only covers that side", () => {
    const r = row({ cz: { o: -120, u: null } });
    expect(sidePrice(r, "o")).toEqual({ am: -120, book: "CZ" });
    expect(sidePrice(r, "u")).toEqual({ am: -105, book: "FD" });
  });
  it("without Caesars, the feed's best price is labelled with its book", () => {
    expect(sidePrice(row(), "o")).toEqual({ am: -115, book: "DK" });
    expect(sidePrice(row(), "u")).toEqual({ am: -105, book: "FD" });
    expect(sidePrice(row({ oBook: null }), "o")).toEqual({ am: -115, book: "BOOK" });
  });
  it("a side nobody posts is null — never a made-up price", () => {
    expect(sidePrice(row({ u: null, uBook: null }), "u")).toBeNull();
    expect(sidePrice(row({ o: null, oBook: null, cz: { o: null, u: -110 } }), "o")).toBeNull();
  });
});

describe("sideProb — model number first, market fair second, under = 100 − over", () => {
  it("prefers the engine's model % and tags it model", () => {
    expect(sideProb(row(), "o")).toEqual({ pct: 58.2, src: "model" });
    expect(sideProb(row(), "u")).toEqual({ pct: 100 - 58.2, src: "model" });
  });
  it("falls back to the de-vigged market fair, tagged market", () => {
    const r = row({ pO: null });
    expect(sideProb(r, "o")).toEqual({ pct: 52.4, src: "market" });
    expect(sideProb(r, "u")).toEqual({ pct: 100 - 52.4, src: "market" });
  });
  it("is null when neither exists (no % is ever invented)", () => {
    expect(sideProb(row({ pO: null, fO: null }), "o")).toBeNull();
  });
  it("rankOf orders by the same precedence, −1 when unpriced", () => {
    expect(rankOf(row())).toBe(58.2);
    expect(rankOf(row({ pO: null }))).toBe(52.4);
    expect(rankOf(row({ pO: null, fO: null }))).toBe(-1);
  });
});

describe("playerLeg — the sandbox leg for one side of a player row", () => {
  it("builds the under leg with the flipped % and the feed book", () => {
    const leg = playerLeg(row({ pO: null }), "batter_total_bases", "u", "Baltimore Orioles @ New York Yankees · 7:05 PM", "g1");
    expect(leg).toEqual({
      id: "g1|bal-henderson-tb-1.5|u",
      label: "Gunnar Henderson (BAL)",
      sub: "Total Bases Under 1.5",
      game: "Baltimore Orioles @ New York Yankees · 7:05 PM",
      cz: -105,
      prob: 100 - 52.4,
      market: "batter_total_bases",
      book: "FD",
      src: "market",
    });
  });
  it("the HR over leg: id keyed by gkey, sub 'HR Anytime HR', CZ price, model %", () => {
    const leg = playerLeg(row({ ln: 0.5, lkey: "bal-henderson-hr", cz: { o: 380, u: null }, u: null, uBook: null }), "batter_home_runs", "o", "G", "g1");
    expect(leg).toMatchObject({ id: "g1|bal-henderson-hr|o", sub: "HR Anytime HR", cz: 380, book: "CZ", prob: 58.2, src: "model" });
  });
  it("falls back to the game string in the id when gkey is null, and drops the team suffix when unknown", () => {
    const leg = playerLeg(row({ tm: null }), "batter_hits", "o", "AWAY @ HOME · 1:10 PM", null);
    expect(leg?.id).toBe("AWAY @ HOME · 1:10 PM|bal-henderson-tb-1.5|o");
    expect(leg?.label).toBe("Gunnar Henderson");
    expect(leg?.sub).toBe("Hits Over 1.5");
  });
  it("an unknown market keeps its raw key in the sub and prob is 0 when no % exists", () => {
    const leg = playerLeg(row({ pO: null, fO: null }), "batter_doubles", "o", "G", "g1");
    expect(leg?.sub).toBe("batter_doubles Over 1.5");
    expect(leg?.prob).toBe(0);
    expect(leg?.src).toBeUndefined();
  });
  it("is null when that side is not posted — a blank side never becomes a leg", () => {
    expect(playerLeg(row({ u: null, uBook: null }), "batter_home_runs", "u", "G", "g1")).toBeNull();
  });
});

/* ------------------------------------------------------------- game markets */

const pick = (over: Partial<PickRow> = {}): PickRow => ({
  label: "New York Yankees",
  sub: "ML",
  cz: { o: -140 },
  prob: 58,
  game: "Baltimore Orioles @ New York Yankees · 7:05 PM",
  gkey: "g1",
  lkey: "ml-home",
  live: false,
  ...over,
});

describe("oppRow / bothSides — the other team of an ML/RL row, away listed first", () => {
  it("ML: the opponent's sub is 'ML vs <engine side>'", () => {
    const o = oppRow(pick({ opp: { label: "Baltimore Orioles", cz: 120, prob: 42, lkey: "ml-away" } }));
    expect(o).toMatchObject({ label: "Baltimore Orioles", sub: "ML vs New York Yankees", cz: 120, prob: 42, lkey: "ml-away", game: pick().game, gkey: "g1" });
  });
  it("RL: the opponent's sub carries its signed spread", () => {
    const o = oppRow(pick({ lkey: "rl-home", sub: "RL -1.5", opp: { label: "Baltimore Orioles", cz: -150, prob: 55, pt: 1.5, lkey: "rl-away" } }));
    expect(o?.sub).toBe("RL +1.5 vs New York Yankees");
    const neg = oppRow(pick({ lkey: "rl-away", opp: { label: "X", pt: -1.5, lkey: "rl-home" } }));
    expect(neg?.sub).toBe("RL -1.5 vs New York Yankees");
  });
  it("a board generated before opp shipped has no opposite row", () => {
    expect(oppRow(pick())).toBeNull();
    expect(oppRow(pick({ opp: { label: "" } }))).toBeNull();
    expect(bothSides([pick()])).toHaveLength(1);
  });
  it("bothSides lists the away side first regardless of which side the engine picked", () => {
    const homePick = pick({ opp: { label: "Baltimore Orioles", cz: 120, prob: 42, lkey: "ml-away" } });
    expect(bothSides([homePick]).map((r) => r.label)).toEqual(["Baltimore Orioles", "New York Yankees"]);
    const awayPick = pick({ label: "Baltimore Orioles", lkey: "ml-away", opp: { label: "New York Yankees", cz: -140, prob: 58, lkey: "ml-home" } });
    expect(bothSides([awayPick]).map((r) => r.label)).toEqual(["Baltimore Orioles", "New York Yankees"]);
  });
});

describe("groupByGame / legId / norm", () => {
  it("groups rows by game string, parses the matchup, and sorts games by string", () => {
    const g2 = "Atlanta Braves @ Chicago Cubs · 1:20 PM";
    const groups = groupByGame([pick(), pick({ game: g2, label: "Chicago Cubs" }), pick({ label: "Baltimore Orioles", lkey: "ml-away" }), pick({ game: "" })]);
    expect(groups.map((g) => g.game)).toEqual([g2, pick().game]);
    expect(groups[1]).toMatchObject({ away: "Baltimore Orioles", home: "New York Yankees", time: "7:05 PM" });
    expect(groups[1].rows).toHaveLength(2);
    expect(groups[0].rows).toHaveLength(1);
  });
  it("legId is lkey|label|sub, tolerant of a missing lkey", () => {
    expect(legId(pick())).toBe("ml-home|New York Yankees|ML");
    expect(legId(pick({ lkey: undefined }))).toBe("|New York Yankees|ML");
  });
  it("norm strips accents, case and punctuation so a search hits the feed's spelling", () => {
    expect(norm("José Ramírez")).toBe("jose ramirez");
    expect(norm("Vladimir Guerrero Jr.")).toBe("vladimir guerrero jr");
    expect(norm("O'Neil")).toBe("oneil");
  });
});
