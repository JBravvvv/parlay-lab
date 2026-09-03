/**
 * GAMES TAB shaping (2026-09-03).
 *
 * Operator Josh, verbatim: "There should be a tab called "Games" that has every
 * game for the day listed kind of like the mlb app or any other website."
 *
 * Inline fixture shaped exactly like the MLB Stats API schedule
 * (hydrate=probablePitcher,linescore,team,decisions,broadcasts) plus a few engine
 * board ML rows. Covers: status mapping (Postponed / Warmup / Final / Preview),
 * the record string, ML matching by team name (and a game with no board), linescore
 * totals, and the live → upcoming → final ordering.
 */
import { describe, expect, it } from "vitest";
import { dateStrip, fmtAm, mapStatus, mlFor, pitcherIds, shapeGames, type ApiGame, type MlRow } from "@/lib/games";

const side = (id: number, name: string, abbr: string, w: number, l: number, extra: Record<string, unknown> = {}) => ({
  team: { id, name, abbreviation: abbr, teamName: name.split(" ").pop() },
  leagueRecord: { wins: w, losses: l },
  ...extra,
});

const FINAL: ApiGame = {
  gamePk: 1,
  gameDate: "2026-09-03T16:35:00Z",
  status: { abstractGameState: "Final", detailedState: "Final" },
  teams: {
    away: side(137, "San Francisco Giants", "SF", 58, 83, { score: 2, probablePitcher: { id: 10, fullName: "Blade Tidwell" } }),
    home: side(134, "Pittsburgh Pirates", "PIT", 71, 69, { score: 5, probablePitcher: { id: 11, fullName: "Khristian Curtis" } }),
  },
  linescore: {
    currentInning: 9,
    currentInningOrdinal: "9th",
    inningState: "Top",
    innings: [
      { num: 1, away: { runs: 0, hits: 0, errors: 0 }, home: { runs: 2, hits: 1, errors: 0 } },
      { num: 2, away: { runs: 2, hits: 2, errors: 1 }, home: { runs: 3, hits: 4, errors: 0 } },
    ],
    teams: { away: { runs: 2, hits: 2, errors: 1 }, home: { runs: 5, hits: 5, errors: 0 } },
  },
  decisions: { winner: { id: 11, fullName: "Khristian Curtis" }, loser: { id: 10, fullName: "Blade Tidwell" }, save: { id: 12, fullName: "Mason Montgomery" } },
  broadcasts: [{ name: "KNBR 680", type: "AM" }, { name: "NBCS BA", type: "TV" }, { name: "SNP", type: "TV" }],
  venue: { name: "PNC Park" },
};

const WARMUP: ApiGame = {
  gamePk: 2,
  gameDate: "2026-09-03T17:10:00Z",
  status: { abstractGameState: "Live", detailedState: "Warmup" },
  teams: {
    away: side(146, "Miami Marlins", "MIA", 66, 74, { score: 0, probablePitcher: { id: 20, fullName: "Sandy Alcantara" } }),
    home: side(118, "Kansas City Royals", "KC", 70, 70, { score: 0, probablePitcher: { id: 21, fullName: "Michael Wacha" } }),
  },
  linescore: {
    currentInning: 1,
    currentInningOrdinal: "1st",
    inningState: "Top",
    innings: [{ num: 1, away: { hits: 0, errors: 0 }, home: { hits: 0, errors: 0 } }],
    teams: { away: { runs: 0, hits: 0, errors: 0 }, home: { runs: 0, hits: 0, errors: 0 } },
  },
  broadcasts: [{ name: "FDSN KC", type: "TV" }],
  venue: { name: "Kauffman Stadium" },
};

const LATER: ApiGame = {
  gamePk: 3,
  gameDate: "2026-09-04T02:10:00Z",
  status: { abstractGameState: "Preview", detailedState: "Pre-Game" },
  teams: {
    away: side(147, "New York Yankees", "NYY", 80, 60, { probablePitcher: { id: 30, fullName: "Max Fried" } }),
    home: side(119, "Los Angeles Dodgers", "LAD", 85, 55),
  },
  linescore: { currentInning: 1, innings: [{ num: 1 }], teams: { away: { runs: 0 }, home: { runs: 0 } } },
};

const EARLIER: ApiGame = {
  gamePk: 4,
  gameDate: "2026-09-03T23:05:00Z",
  status: { abstractGameState: "Preview", detailedState: "Scheduled" },
  teams: { away: side(133, "Athletics", "ATH", 60, 80), home: side(136, "Seattle Mariners", "SEA", 78, 62) },
};

const PPD: ApiGame = {
  gamePk: 5,
  gameDate: "2026-09-03T23:40:00Z",
  status: { abstractGameState: "Final", detailedState: "Postponed" },
  teams: { away: side(111, "Boston Red Sox", "BOS", 75, 65), home: side(110, "Baltimore Orioles", "BAL", 60, 80) },
};

const ML: MlRow[] = [
  { label: "New York Yankees ML", odds: "-102", book: "DK", cz: -105, gkey: "newyorkyankees@losangelesdodgers" },
  { label: "New York Yankees ML", odds: "+100", book: "FD", cz: null, gkey: "newyorkyankees@losangelesdodgers" },
  { label: "Los Angeles Dodgers ML", odds: -116, book: "DK", cz: null, gkey: "newyorkyankees@losangelesdodgers" },
  { label: "Miami Marlins ML", odds: "+140", book: "MGM", cz: "+135", gkey: "miamimarlins@kansascityroyals" },
];

const STATS = {
  10: { wins: 0, losses: 2, era: "4.43" },
  11: { wins: 1, losses: 0, era: "1.64" },
  12: { wins: 2, losses: 1, era: "2.10", saves: 8 },
  20: { wins: 13, losses: 8, era: "3.46" },
  21: { wins: 8, losses: 8, era: "3.32" },
};

const ALL = [LATER, FINAL, PPD, EARLIER, WARMUP];

describe("games: status mapping", () => {
  it("maps Preview/Live/Final and treats Postponed as its own bucket", () => {
    expect(mapStatus({ abstractGameState: "Preview", detailedState: "Pre-Game" })).toBe("upcoming");
    expect(mapStatus({ abstractGameState: "Live", detailedState: "Warmup" })).toBe("live");
    expect(mapStatus({ abstractGameState: "Live", detailedState: "In Progress" })).toBe("live");
    expect(mapStatus({ abstractGameState: "Final", detailedState: "Final" })).toBe("final");
    expect(mapStatus({ abstractGameState: "Final", detailedState: "Postponed" })).toBe("postponed");
    expect(mapStatus({ abstractGameState: "Preview", detailedState: "Postponed" })).toBe("postponed");
  });
});

describe("games: shaping", () => {
  const out = shapeGames("2026-09-03", ALL, STATS, ML);
  const byPk = Object.fromEntries(out.games.map((g) => [g.pk, g]));

  it("orders live first, then upcoming by start, then final, then postponed", () => {
    expect(out.games.map((g) => g.pk)).toEqual([2, 4, 3, 1, 5]);
    expect(out.counts).toEqual({ upcoming: 2, live: 1, final: 1 });
  });

  it("prints the record as W-L", () => {
    expect(byPk[1].home.record).toBe("71-69");
    expect(byPk[1].away.record).toBe("58-83");
  });

  it("matches ML rows by team name, keeps the best price + book, and carries the Caesars price", () => {
    expect(byPk[3].away.ml).toEqual({ odds: "+100", book: "FD", cz: "-105" });
    expect(byPk[3].home.ml).toEqual({ odds: "-116", book: "DK", cz: null });
    expect(byPk[2].away.ml).toEqual({ odds: "+140", book: "MGM", cz: "+135" });
    expect(byPk[2].home.ml).toBeNull();
  });

  it("omits odds for a game with no board rows and when there is no board at all", () => {
    expect(byPk[4].away.ml).toBeNull();
    expect(byPk[4].home.ml).toBeNull();
    const none = shapeGames("2026-09-03", ALL, STATS, undefined);
    expect(none.games.every((g) => g.away.ml === null && g.home.ml === null)).toBe(true);
  });

  it("carries probables with their season line and null when no line is known", () => {
    expect(byPk[2].away.probable).toEqual({ id: 20, name: "Sandy Alcantara", wl: "13-8", era: "3.46" });
    expect(byPk[3].away.probable).toEqual({ id: 30, name: "Max Fried", wl: null, era: null });
    expect(byPk[3].home.probable).toBeNull();
  });

  it("builds the linescore with R H E totals only for live/final games", () => {
    expect(byPk[1].linescore).toEqual({
      innings: [
        { n: 1, away: 0, home: 2 },
        { n: 2, away: 2, home: 3 },
      ],
      totals: { away: { r: 2, h: 2, e: 1 }, home: { r: 5, h: 5, e: 0 } },
    });
    expect(byPk[2].linescore?.innings).toEqual([{ n: 1, away: null, home: null }]);
    expect(byPk[3].linescore).toBeNull();
    expect(byPk[5].linescore).toBeNull();
  });

  it("carries scores, inning, decisions and TV broadcasts", () => {
    expect(byPk[1].away.score).toBe(2);
    expect(byPk[1].home.score).toBe(5);
    expect(byPk[3].home.score).toBeNull();
    expect(byPk[2].inning).toEqual({ num: 1, ordinal: "1st", state: "Top" });
    expect(byPk[1].inning).toBeNull();
    expect(byPk[1].decisions).toEqual({
      w: { name: "Khristian Curtis", wl: "1-0", era: "1.64" },
      l: { name: "Blade Tidwell", wl: "0-2", era: "4.43" },
      s: { name: "Mason Montgomery", saves: 8 },
    });
    expect(byPk[2].decisions).toBeNull();
    expect(byPk[1].broadcasts).toEqual(["NBCS BA", "SNP"]);
    expect(byPk[1].venue).toBe("PNC Park");
    expect(byPk[5].detail).toBe("Postponed");
  });

  it("collects the unique pitcher ids the cards need (probables + decisions)", () => {
    expect(pitcherIds(ALL).sort((a, b) => a - b)).toEqual([10, 11, 12, 20, 21, 30]);
  });
});

describe("games: helpers", () => {
  it("formats American odds from numbers or strings and rejects junk", () => {
    expect(fmtAm(-116)).toBe("-116");
    expect(fmtAm("+150")).toBe("+150");
    expect(fmtAm(120)).toBe("+120");
    expect(fmtAm(null)).toBeNull();
    expect(fmtAm("n/a")).toBeNull();
  });

  it("does not cross-wire a team-name substring across games (Athletics vs a gkey)", () => {
    const rows: MlRow[] = [{ label: "Athletics ML", odds: -110, book: "DK", gkey: "athletics@texasrangers" }];
    expect(mlFor(rows, EARLIER, "away")).toBeNull();
    expect(mlFor([{ label: "Athletics ML", odds: -110, book: "DK" }], EARLIER, "away")).toEqual({ odds: "-110", book: "DK", cz: null });
  });

  it("builds the ±2 day strip across a month boundary", () => {
    expect(dateStrip("2026-09-01")).toEqual(["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03"]);
  });
});
