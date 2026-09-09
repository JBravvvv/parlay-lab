import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { PropBoardRow } from "@/engine";
import type { PickRow } from "@/engine";
import {
  deepLinkHref,
  filterSide,
  gameMatches,
  groupByGame,
  legDeepLink,
  nameKey,
  parseDeepLink,
  playerMatches,
  rowSide,
  stripTeamSuffix,
  teamTag,
} from "@/components/props/props-model";

/**
 * INSTRUCTION 46 (2026-09-08, Josh's word, verbatim):
 *  8. "On 'Parlay Builder' when looking at a game's prop bets say Giants/Rockies H+R+RBI
 *     there should be 3 buttons: All, Giants & Rockies. If I click Giants or Rockies it only
 *     shows that teams available picks for that prop etc"
 *  9. "… clicking the players name in the bet which should take you to that bet if it is
 *     currently available pregame or live; even if the line has changed"
 *
 * Pure pins on the team-side filter and the /props deep-link contract in props-model.ts,
 * plus source scans on the card (the pill tablist, the reset-on-market-change) and the
 * page (Suspense + useSearchParams, the not-on-board notice). Every row below is a
 * synthetic fixture — no market quote is asserted.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const page = read("app/props/page.tsx");
const rows = read("src/components/props/PlayerRow.tsx");
const games = read("src/components/props/GameCard.tsx");

const row = (p: string, tm: string | null, over: Partial<PropBoardRow> = {}): PropBoardRow => ({
  p,
  tm,
  ln: 1.5,
  lkey: `${nameKey(p)}|batter_hits_runs_rbis|1.5`,
  o: -115,
  oBook: "DraftKings",
  u: -105,
  uBook: "FanDuel",
  cz: null,
  pO: 55,
  fO: 52,
  books: 3,
  ...over,
});

const AWAY = "San Francisco Giants";
const HOME = "Colorado Rockies";
const BOARD = [row("Matt Chapman", "SF"), row("Ezequiel Tovar", "COL"), row("Heliot Ramos", "SF"), row("Unknown Bat", null)];

describe("teamTag — the engine's team tag and the header's abbreviation agree", () => {
  it("full names go through teamAbbr; the two clubs the engine spells differently are folded", () => {
    expect(teamTag("San Francisco Giants")).toBe("SF");
    expect(teamTag("Colorado Rockies")).toBe("COL");
    expect(teamTag("Athletics")).toBe("ATH");
    expect(teamTag("Oakland Athletics")).toBe("ATH");
    expect(teamTag("Chicago White Sox")).toBe("CWS");
  });
  it("a short tag passes through upper-cased, aliases folded", () => {
    expect(teamTag("sf")).toBe("SF");
    expect(teamTag("OAK")).toBe("ATH");
    expect(teamTag("ATH")).toBe("ATH");
    expect(teamTag("CHW")).toBe("CWS");
    expect(teamTag("CWS")).toBe("CWS");
  });
});

describe("rowSide / filterSide — All / Giants / Rockies", () => {
  it("assigns each row to its side of the matchup; an untagged row belongs to neither", () => {
    expect(rowSide(row("x", "SF"), AWAY, HOME)).toBe("away");
    expect(rowSide(row("x", "COL"), AWAY, HOME)).toBe("home");
    expect(rowSide(row("x", null), AWAY, HOME)).toBeNull();
    expect(rowSide(row("x", "NYY"), AWAY, HOME)).toBeNull();
  });
  it("Giants shows only Giants rows; Rockies only Rockies; All is the untouched list", () => {
    expect(filterSide(BOARD, "away", AWAY, HOME).map((r) => r.p)).toEqual(["Matt Chapman", "Heliot Ramos"]);
    expect(filterSide(BOARD, "home", AWAY, HOME).map((r) => r.p)).toEqual(["Ezequiel Tovar"]);
    expect(filterSide(BOARD, "all", AWAY, HOME)).toBe(BOARD);
  });
  it("the Athletics / White Sox spelling gap does not drop their rows", () => {
    const ath = [row("Brent Rooker", "ATH"), row("Luis Robert Jr.", "CWS")];
    expect(filterSide(ath, "away", "Athletics", "Chicago White Sox").map((r) => r.p)).toEqual(["Brent Rooker"]);
    expect(filterSide(ath, "home", "Athletics", "Chicago White Sox").map((r) => r.p)).toEqual(["Luis Robert Jr."]);
  });
});

describe("the card — three-way pill, per game, reset when the market changes", () => {
  it("PropGameCard holds a TeamSide state that resets to all on a cat change", () => {
    expect(rows).toMatch(/useState<TeamSide>\("all"\)/);
    expect(rows).toMatch(/useEffect\(\(\) => setSide\("all"\), \[cat\]\)/);
    expect(rows).toMatch(/filterSide\(rows, side, m\.away, m\.home\)/);
    expect(rows).toMatch(/<TeamSidePills away=\{m\.away\} home=\{m\.home\} side=\{side\} onSide=\{setSide\} \/>/);
  });
  it("the pills are a tablist styled like the Board's scope control: All / <away abbr> / <home abbr>", () => {
    expect(games).toMatch(/data-testid="team-side" role="tablist"/);
    expect(games).toMatch(/aria-selected=\{side === o\.k\}/);
    expect(games).toMatch(/label: "All"/);
    expect(games).toMatch(/label: teamAbbr\(away\)/);
    expect(games).toMatch(/label: teamAbbr\(home\)/);
    expect(games).toMatch(/bg-pos\/20 text-pos/);
  });
  it("the line count on the header and the Show-all button follow the filtered list", () => {
    expect(rows).toMatch(/count=\{`\$\{visible\.length\} line/);
    expect(rows).toMatch(/Show all \{visible\.length\}/);
  });
  it("the ML/RL cards (GameMarketCard) carry no team pill — the filter is for prop markets", () => {
    const mlCard = games.slice(games.indexOf("export function GameMarketCard"));
    expect(mlCard).not.toMatch(/TeamSidePills/);
  });
});

/* -------------------------------------------------------------- deep link */

describe("nameKey / stripTeamSuffix / playerMatches — matched on the name, never the line", () => {
  it("nameKey is accent, case, punctuation and space proof", () => {
    expect(nameKey("José Ramírez")).toBe("joseramirez");
    expect(nameKey("Vladimir Guerrero Jr.")).toBe("vladimirguerrerojr");
    expect(nameKey("jake mangum")).toBe(nameKey("Jake Mangum"));
  });
  it("stripTeamSuffix drops the ledger's (TEAM) tag only", () => {
    expect(stripTeamSuffix("Jake Mangum (PIT)")).toBe("Jake Mangum");
    expect(stripTeamSuffix("Gunnar Henderson")).toBe("Gunnar Henderson");
    expect(stripTeamSuffix("New York Yankees")).toBe("New York Yankees");
  });
  it("playerMatches ignores the line entirely — a moved line still hits", () => {
    expect(playerMatches(row("Jake Mangum", "PIT", { ln: 1.5 }).p, "jake mangum")).toBe(true);
    expect(playerMatches("Jake Mangum", "Jake Mangum (PIT)")).toBe(false); // the builder strips the tag first
  });
});

describe("legDeepLink / deepLinkHref — the ledger leg → /props?tab=&mkt=&game=&player=", () => {
  it("a batter prop leg (engine lkey name|market|line) opens the batter tab at that market", () => {
    const d = legDeepLink({ label: "Jake Mangum (PIT)", lkey: "jakemangum|batter_hits|0.5", gkey: "pittsburghpirates@cincinnatireds" });
    expect(d).toEqual({ tab: "batter", mkt: "hits", game: "pittsburghpirates@cincinnatireds", player: "Jake Mangum" });
    expect(deepLinkHref(d!)).toBe("/props?tab=batter&mkt=hits&game=pittsburghpirates%40cincinnatireds&player=Jake+Mangum");
  });
  it("H+R+RBI → hrr, total bases → tb, HR → hr; pitcher markets open the pitcher tab", () => {
    expect(legDeepLink({ label: "A (SF)", lkey: "a|batter_hits_runs_rbis|1.5" })?.mkt).toBe("hrr");
    expect(legDeepLink({ label: "A (SF)", lkey: "a|batter_total_bases|1.5" })?.mkt).toBe("tb");
    expect(legDeepLink({ label: "A (SF)", lkey: "a|batter_home_runs|0.5" })?.mkt).toBe("hr");
    expect(legDeepLink({ label: "P (SF)", lkey: "p|pitcher_strikeouts|5.5" })).toMatchObject({ tab: "pitcher", mkt: "k" });
    expect(legDeepLink({ label: "P (SF)", lkey: "p|pitcher_outs|16.5" })).toMatchObject({ tab: "pitcher", mkt: "outs" });
  });
  it("ML / RL legs open the Games tab at that market with the team as the player", () => {
    expect(legDeepLink({ label: "New York Yankees", lkey: "ml_home", gkey: "g1" })).toEqual({ tab: "games", mkt: "ml", game: "g1", player: "New York Yankees" });
    expect(legDeepLink({ label: "Baltimore Orioles", lkey: "rl_away", gkey: null })).toEqual({ tab: "games", mkt: "rl", game: null, player: "Baltimore Orioles" });
  });
  it("no lkey, an unrecognised key, or a market the sandbox does not price → no link", () => {
    expect(legDeepLink({ label: "HR over" })).toBeNull();
    expect(legDeepLink({ label: "HR over", lkey: "l1" })).toBeNull();
    expect(legDeepLink({ label: "A (SF)", lkey: "a|batter_doubles|0.5" })).toBeNull();
  });
  it("the game param is omitted when the leg has no gkey", () => {
    expect(deepLinkHref({ tab: "games", mkt: "ml", game: null, player: "Boston Red Sox" })).toBe("/props?tab=games&mkt=ml&player=Boston+Red+Sox");
  });
});

describe("parseDeepLink — the page validates the query string, guessing nothing", () => {
  const q = (o: Record<string, string>) => (k: string) => o[k] ?? null;
  it("round-trips a valid link", () => {
    expect(parseDeepLink(q({ tab: "batter", mkt: "hrr", game: "SF@COL", player: "Matt Chapman" }))).toEqual({ tab: "batter", mkt: "hrr", game: "SF@COL", player: "Matt Chapman" });
    expect(parseDeepLink(q({ tab: "games", mkt: "rl", player: "Colorado Rockies" }))).toEqual({ tab: "games", mkt: "rl", game: null, player: "Colorado Rockies" });
  });
  it("rejects an unknown tab or a market not on that tab; tab + mkt alone is a plain market link (player empty)", () => {
    expect(parseDeepLink(q({ tab: "cfb", mkt: "hrr", player: "x" }))).toBeNull();
    expect(parseDeepLink(q({ tab: "games", mkt: "hrr", player: "x" }))).toBeNull();
    expect(parseDeepLink(q({ tab: "batter", mkt: "hrr", player: "  " }))).toEqual({ tab: "batter", mkt: "hrr", game: null, player: "" });
    expect(parseDeepLink(q({}))).toBeNull();
  });
});

describe("gameMatches — by gkey first, then AWAY@HOME abbreviations", () => {
  const g = { game: "San Francisco Giants @ Colorado Rockies · 1:10 PM", gkey: "sanfranciscogiants@coloradorockies" };
  it("matches the engine gkey case-insensitively", () => {
    expect(gameMatches(g, "sanfranciscogiants@coloradorockies")).toBe(true);
    expect(gameMatches(g, "SanFranciscoGiants@ColoradoRockies")).toBe(true);
    expect(gameMatches(g, "sanfranciscogiants@coloradorockiesgm2")).toBe(false);
  });
  it("matches AWAY@HOME abbreviations, aliases folded, never the reverse order", () => {
    expect(gameMatches(g, "SF@COL")).toBe(true);
    expect(gameMatches(g, "sf@col")).toBe(true);
    expect(gameMatches(g, "COL@SF")).toBe(false);
    expect(gameMatches({ game: "Athletics @ Chicago White Sox · 7:10 PM", gkey: null }, "OAK@CHW")).toBe(true);
    expect(gameMatches({ game: "Athletics @ Chicago White Sox · 7:10 PM", gkey: null }, "ATH@CWS")).toBe(true);
  });
  it("no game param means every game matches; a malformed one matches none", () => {
    expect(gameMatches(g, null)).toBe(true);
    expect(gameMatches(g, "giants")).toBe(false);
  });
});

describe("groupByGame carries gkey — a Ledger ML/RL link finds its Games-tab card (2026-09-08 fix)", () => {
  /* the engine's shGkey = pnorm(away)+"@"+pnorm(home): the AWAY@HOME fallback would slice "SAN"/"NEW"
     out of it and never equal the header's SF / NYY — the gkey branch must fire on the Games tab too */
  const ml = (game: string, gkey: string, label: string, lkey: string): PickRow =>
    ({ game, gkey, label, lkey, sub: "ML", cz: -120, prob: 55 }) as unknown as PickRow;
  const board = groupByGame([
    ml("San Francisco Giants @ Colorado Rockies · 1:10 PM", "sanfranciscogiants@coloradorockies", "San Francisco Giants", "ml_away"),
    ml("New York Yankees @ Boston Red Sox · 7:10 PM", "newyorkyankees@bostonredsox", "New York Yankees", "ml_away"),
  ]);
  it("every group carries the first row's gkey", () => {
    expect(board.map((g) => g.gkey)).toEqual(["newyorkyankees@bostonredsox", "sanfranciscogiants@coloradorockies"]);
  });
  for (const [label, gkey, ab] of [
    ["San Francisco Giants", "sanfranciscogiants@coloradorockies", "SF@COL"],
    ["New York Yankees", "newyorkyankees@bostonredsox", "NYY@BOS"],
  ] as const) {
    it(`${ab}: the ledger leg's link (gkey form) lands on exactly its card`, () => {
      const d = legDeepLink({ label, lkey: "ml_away", gkey })!;
      const parsed = parseDeepLink((k) => new URL(deepLinkHref(d), "http://x").searchParams.get(k))!;
      const hits = board.filter((g) => gameMatches(g, parsed.game));
      expect(hits.map((g) => g.gkey)).toEqual([gkey]);
    });
    it(`${ab}: the AWAY@HOME form lands on the same card`, () => {
      const hits = board.filter((g) => gameMatches(g, ab));
      expect(hits.map((g) => g.gkey)).toEqual([gkey]);
    });
  }
});

describe("the page — Suspense + useSearchParams, opens the right tab/market, marks the row", () => {
  it("a CFB ledger link (?cfb=1) flips the sport store to CFB so the CFB Builder renders", () => {
    expect(page).toMatch(/import \{ setSport \} from "@\/lib\/sport"/); // separate line: cfb-separation pins the bare useSport import
    expect(page).toMatch(/const wantCfb = params\.get\("cfb"\) === "1"/);
    expect(page).toMatch(/if \(CFB_ENABLED && wantCfb\) setSport\("cfb"\)/);
  });
  it("the team pills are thumb-sized (min-h-9 = 36px) with the Board's tablist sizing", () => {
    expect(games).toMatch(/min-h-9 rounded-full px-3 py-1 text-\[11px\]/);
  });
  it("reads the query inside a Suspense boundary like app/games/page.tsx", () => {
    expect(page).toMatch(/import \{ useSearchParams \} from "next\/navigation"/);
    expect(page).toMatch(/<Suspense fallback=\{null\}>\s*<PropsDesk \/>\s*<\/Suspense>/);
    expect(page).toMatch(/parseDeepLink\(\(k\) => params\.get\(k\)\)/);
  });
  it("the initial tab and market come from the link, defaulting to Games / ML", () => {
    expect(page).toMatch(/useState<TabKey>\(link\?\.tab \?\? "games"\)/);
    expect(page).toMatch(/useState<string>\(link\?\.mkt \?\? "ml"\)/);
  });
  it("filters to the linked game and passes the player to the cards as hitPlayer; the row is ringed and scrolled to", () => {
    expect(page).toMatch(/gameMatches\(x\.g, link\.game\)/);
    expect(page).toMatch(/gameMatches\(g, link\.game\)/);
    expect(page).toMatch(/hitPlayer=\{deep\.hit\}/g);
    expect(rows).toMatch(/hit=\{!!hitPlayer && playerMatches\(r\.p, hitPlayer\)\}/);
    expect(rows).toMatch(/data-deeplink=\{hit \? "hit" : undefined\}/);
    expect(rows).toMatch(/scrollIntoView\(\{ block: "center", behavior: "smooth" \}\)/);
    expect(games).toMatch(/data-deeplink=\{hit \? "hit" : undefined\}/);
    // the ringed row is still the 40px py-1 row (props-ui density pin) — the ring is appended, not a rewrite
    expect(rows).toMatch(/border-t border-white\/\[0\.04\] py-1" \+ \(hit \?/);
  });
  it("a linked player past the first 12 rows is shown without a Show-all tap", () => {
    expect(rows).toMatch(/const limit = hitAt >= shown \? hitAt \+ 1 : shown/);
  });
  it("a bet that is not on today's board says so and leaves the whole board up", () => {
    expect(page).toMatch(/That bet is not on today&apos;s board/);
    expect(page).toMatch(/data-testid="deeplink-missing"/);
    expect(page).toMatch(/const gameGroups = deep\.games \?\? allGameGroups/);
    expect(page).toMatch(/const propGames = deep\.props \?\? allPropGames/);
  });
  it("the link only binds while the reader is on the linked tab + market, and can be dismissed", () => {
    expect(page).toMatch(/const linkOn = !!link && link\.tab === tab && link\.mkt === mktKey/);
    expect(page).toMatch(/onClick=\{\(\) => setLink\(null\)\}/);
  });
});

describe("the page — the NFL deep link (?nfl=1) mirrors ?cfb=1 (2026-09-08)", () => {
  it("flips the sport store to NFL beside the CFB line, which stays byte-identical", () => {
    expect(page).toMatch(/const wantCfb = params\.get\("cfb"\) === "1"/);
    expect(page).toMatch(/if \(CFB_ENABLED && wantCfb\) setSport\("cfb"\)/);
    expect(page).toMatch(/const wantNfl = params\.get\("nfl"\) === "1"/);
    expect(page).toMatch(/if \(NFL_ENABLED && wantNfl\) setSport\("nfl"\)/);
    expect(page).toMatch(/\}, \[wantNfl\]\);/);
  });
});
