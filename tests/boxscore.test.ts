/**
 * BOX SCORE shaping (2026-09-03).
 *
 * Operator Josh, verbatim: "You should also be able to click on any game to see
 * the box score."
 *
 * Fixtures are REAL statsapi payloads fetched 2026-09-03 and trimmed to the fields
 * the shaper reads (tests/fixtures/boxscore-*.json, each carries its `_source`):
 *   final   822686  ATL 9 @ WSH 0, 2026-09-02 (W Hernández 2-0, L Cornelio 2-2)
 *   live    824796  BOS 3 @ BAL 3, bottom 7th at fetch time
 *   pregame 823907  STL @ LAD, lineups posted, Mathews vs Skubal
 *   preview 823250  WSH @ SD, 2026-09-08 pregame, Cornelio vs Mize, with BOTH vsPlayer
 *                   feeds (INSTRUCTION 46 Game Preview matchups), fetched 2026-09-08
 *   vsplayer 823907 Skubal vs STL (multi-season splits) + Mathews vs LAD (none),
 *                   fetched 2026-09-08, paired with the 823907 pregame box
 * Every expected figure below was read off the fixture, never typed from memory.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  aggregateVsPlayer,
  battingRows,
  decisionTag,
  fmt3,
  shapeBoxscore,
  shapeLinescore,
  shapeMatchupSide,
  shapePitcher,
  vsRates,
  type ApiBoxscore,
  type ApiLinescore,
  type ApiScheduleGame,
  type ApiVsPlayerPair,
} from "@/lib/boxscore";

type Fix = { boxscore: ApiBoxscore; linescore: ApiLinescore; game: ApiScheduleGame; vsPlayer?: ApiVsPlayerPair };
const load = (name: string): Fix => JSON.parse(readFileSync(path.join(__dirname, "fixtures", name), "utf8")) as Fix;
const shape = (f: Fix) => shapeBoxscore(f.game, f.boxscore, f.linescore);

describe("boxscore: final game (ATL 9 @ WSH 0, 2026-09-02, pk 822686)", () => {
  const f = load("boxscore-final-822686.json");
  const out = shape(f);

  it("header: status, official date, records, score, venue", () => {
    expect(out.pk).toBe(822686);
    expect(out.status).toBe("final");
    expect(out.date).toBe("2026-09-02");
    expect(out.inning).toBeNull();
    expect(out.away).toMatchObject({ abbr: "ATL", short: "Braves", record: "83-57", score: 9 });
    expect(out.home).toMatchObject({ abbr: "WSH", short: "Nationals", record: "67-75", score: 0 });
    expect(out.venue).toBe("Nationals Park");
    expect(out.doubleHeader).toBe(false);
    expect(out.gameNumber).toBe(1);
  });

  it("decisions carry W-L and ERA from the box's own seasonStats; no save on a 9-0", () => {
    expect(out.decisions).toEqual({
      w: { id: 622694, name: "Elieser Hernández", wl: "2-0", era: "1.00" },
      l: { id: 683000, name: "Riley Cornelio", wl: "2-2", era: "5.96" },
      s: null,
    });
  });

  it("linescore: nine columns, R H E totals, no x because the home side batted in the 9th", () => {
    const ls = out.linescore!;
    expect(ls.innings).toHaveLength(9);
    expect(ls.innings[8]).toEqual({ n: 9, away: 1, home: 0 });
    expect(ls.totals).toEqual({ away: { r: 9, h: 11, e: 0 }, home: { r: 0, h: 2, e: 1 } });
    expect(ls.xBottom).toBeNull();
  });

  it("batting box: starters + the sub, pitchers dropped, feed order kept, subs flagged with the a- note", () => {
    const b = out.away.batters;
    expect(b).toHaveLength(10);
    expect(b.map((x) => x.order)).toEqual([100, 200, 300, 400, 500, 501, 600, 700, 800, 900]);
    expect(b[1]).toMatchObject({ boxName: "Acuña Jr.", pos: "RF", ab: 5, r: 2, h: 3, rbi: 3, bb: 0, k: 1, avg: ".243", ops: ".761", sub: false, note: null });
    expect(b[5]).toMatchObject({ name: "Brewer Hicklen", pos: "PH-CF", order: 501, sub: true, note: "a-", ab: 0, bb: 1 });
    expect(out.away.notes).toEqual([{ label: "a", value: "Walked for Harris II in the 9th." }]);
    expect(out.away.battingTotals).toEqual({ ab: 37, r: 9, h: 11, rbi: 9, bb: 6, k: 11 });
    expect(out.home.batters).toHaveLength(11);
  });

  it("info blocks are the feed's own strings, every item, grouped under their titles", () => {
    expect(out.away.info.map((x) => x.title)).toEqual(["BATTING", "BASERUNNING"]);
    const batting = out.away.info[0].items;
    expect(batting.map((x) => x.label)).toEqual(["2B", "HR", "TB", "RBI", "2-out RBI", "Runners left in scoring position, 2 out", "GIDP", "Team RISP", "Team LOB"]);
    expect(batting.find((x) => x.label === "HR")!.value).toBe(
      "Murphy, S (3, 6th inning off Cornelio, 2 on, 2 out); Acuña Jr. (14, 7th inning off Kranick, 2 on, 1 out).",
    );
    expect(batting.find((x) => x.label === "Team RISP")!.value).toBe("4-for-13.");
    expect(out.away.info[1].items).toEqual([
      { label: "SB", value: "Acuña Jr. (20, 2nd base off Cornelio/Ford, H)." },
      { label: "CS", value: "Riley, A (2, 2nd base by Cornelio/Ford, H)." },
    ]);
    expect(out.home.info.map((x) => x.title)).toEqual(["BATTING", "FIELDING"]);
    expect(out.home.info[1].items).toEqual([
      { label: "E", value: "Chaparro (2, fielding)." },
      { label: "DP", value: "(Abrams-Nuñez, N-Morales)." },
    ]);
  });

  it("pitchers: IP H R ER BB K HR ERA with the feed's own (W, 2-0) / (L, 2-2) tags", () => {
    const atl = out.away.pitchers;
    expect(atl.map((p) => p.boxName)).toEqual(["Holmes, G", "Dodd", "Hernández, E", "Fuentes", "Mederos"]);
    expect(atl[2]).toMatchObject({ tag: "(W, 2-0)", ip: "3.0", h: 1, r: 0, er: 0, bb: 1, k: 1, hr: 0, era: "1.00", pitches: 44, strikes: 28 });
    expect(atl[0].tag).toBeNull();
    const wsh = out.home.pitchers;
    expect(wsh[1]).toMatchObject({ boxName: "Cornelio", tag: "(L, 2-2)", ip: "2.2", h: 3, r: 3, er: 3, bb: 1, k: 3, hr: 1, era: "5.96" });
    expect(wsh[2]).toMatchObject({ boxName: "Kranick", tag: null, ip: "1.1", h: 4, r: 5, er: 5, bb: 3, k: 1, hr: 1, era: "9.33" });
    expect(out.away.pitchingTotals).toEqual({ ip: "9.0", h: 2, r: 0, er: 0, bb: 2, k: 6, hr: 0 });
  });

  it("game info: every labelled item, the bare date entry dropped", () => {
    const labels = out.info.map((i) => i.label);
    expect(labels).toEqual([
      "WP", "IBB", "ABS Challenge", "Pitches-strikes", "Groundouts-flyouts", "Batters faced",
      "Inherited runners-scored", "Umpires", "Weather", "Wind", "First pitch", "T", "Att", "Venue",
    ]);
    expect(out.info.find((i) => i.label === "WP")!.value).toBe("Kranick; Tena.");
    expect(out.info.find((i) => i.label === "Weather")!.value).toBe("88 degrees, Cloudy.");
    expect(out.info.find((i) => i.label === "Att")!.value).toBe("15,248.");
    expect(out.pitchingNotes).toEqual([]);
  });
});

describe("boxscore: live game (BOS 3 @ BAL 3, bottom 7th, pk 824796)", () => {
  const f = load("boxscore-live-824796.json");
  const out = shape(f);

  it("carries the inning state and count, live scores, no decisions yet", () => {
    expect(out.status).toBe("live");
    expect(out.inning).toEqual({ num: 7, ordinal: "7th", state: "Bottom", balls: 1, strikes: 0, outs: 2 });
    expect(out.away).toMatchObject({ abbr: "BOS", record: "75-65", score: 3 });
    expect(out.home).toMatchObject({ abbr: "BAL", record: "69-71", score: 3 });
    expect(out.decisions).toBeNull();
  });

  it("pads the linescore to 9 columns; the half in progress is blank, not x", () => {
    const ls = out.linescore!;
    expect(ls.innings).toHaveLength(9);
    expect(ls.innings[6]).toEqual({ n: 7, away: 1, home: null });
    expect(ls.innings[8]).toEqual({ n: 9, away: null, home: null });
    expect(ls.xBottom).toBeNull();
    expect(ls.totals).toEqual({ away: { r: 3, h: 4, e: 0 }, home: { r: 3, h: 5, e: 0 } });
  });

  it("in-game pitching lines have no tag until the game ends", () => {
    expect(out.away.pitchers[0]).toMatchObject({ boxName: "Bennett", tag: null, ip: "6.0", h: 5, r: 3, er: 3, bb: 0, k: 7, hr: 2, era: "3.34" });
    expect(out.away.info[0].items.find((x) => x.label === "HR")!.value).toBe(
      "Rutschman 2 (11, 1st inning off Young, 0 on, 2 out, 6th inning off Young, 0 on, 1 out).",
    );
    expect(out.away.info[1]).toEqual({ title: "FIELDING", items: [{ label: "DP", value: "(Gasper-Kiner-Falefa)." }] });
  });
});

describe("boxscore: pregame (STL @ LAD, lineups posted, pk 823907)", () => {
  const f = load("boxscore-pregame-823907.json");
  const out = shape(f);

  it("is upcoming with no score, no linescore, probables with their season line", () => {
    expect(out.status).toBe("upcoming");
    expect(out.away.score).toBeNull();
    expect(out.linescore).toBeNull();
    expect(out.away.probable).toEqual({ id: 687273, name: "Quinn Mathews", wl: "1-2", era: "5.03" });
    expect(out.home.probable).toEqual({ id: 669373, name: "Tarik Skubal", wl: "8-7", era: "2.84" });
    // 2026-09-08 (INSTRUCTION 46): this fixture was trimmed to era/W-L before the season line existed — every extra figure is null, never 0
    expect(out.away.probableLine).toEqual({ gs: null, ip: null, k: null, bb: null, hr: null, whip: null });
    // no vsPlayer feeds passed → no matchups block at all
    expect(out.matchups).toBeNull();
  });

  it("posts the nine-man lineups with 0-0 lines and drops the un-slotted starter", () => {
    expect(out.away.lineupPosted).toBe(true);
    expect(out.away.batters).toHaveLength(9);
    expect(out.away.batters[0]).toMatchObject({ name: "José Fermín", pos: "2B", order: 100, ab: 0, h: 0, avg: ".241", ops: ".662" });
    expect(out.home.batters.map((b) => b.name).slice(0, 3)).toEqual(["Tommy Edman", "Mookie Betts", "Teoscar Hernández"]);
    expect(out.away.info).toEqual([]);
    expect(out.away.notes).toEqual([]);
  });

  it("game info already carries umpires, weather, first pitch", () => {
    expect(out.info.map((i) => i.label)).toEqual(["Pitches-strikes", "Groundouts-flyouts", "Umpires", "Weather", "Wind", "First pitch", "Venue"]);
    expect(out.info.find((i) => i.label === "Weather")!.value).toBe("73 degrees, Clear.");
  });
});

describe("boxscore: helpers on synthetics", () => {
  const dec = {
    w: { id: 1, name: "A", wl: "1-0", era: "0.00" },
    l: { id: 2, name: "B", wl: "0-1", era: "9.00" },
    s: { id: 3, name: "C", saves: 3 },
  };

  it("builds a decision tag only for the decision pitchers, in the MLB app's form", () => {
    expect(decisionTag(1, dec)).toBe("(W, 1-0)");
    expect(decisionTag(2, dec)).toBe("(L, 0-1)");
    expect(decisionTag(3, dec)).toBe("(S, 3)");
    expect(decisionTag(4, dec)).toBeNull();
    expect(decisionTag(1, null)).toBeNull();
    expect(decisionTag(3, { ...dec, s: { id: 3, name: "C", saves: null } })).toBe("(S)");
  });

  it("the feed's own pitching note wins over a built tag; a missing line is null, never 0", () => {
    const p = { person: { id: 3, fullName: "C" }, stats: { pitching: { note: "(S, 3)", inningsPitched: "1.0" } } };
    expect(shapePitcher(p, "(W, 9-9)")).toMatchObject({ tag: "(S, 3)", ip: "1.0", h: null, era: null });
    expect(shapePitcher({ person: { id: 9, fullName: "Z" } }, null).tag).toBeNull();
  });

  it("an unplayed bottom 9th on a final prints as x; a live one is blank", () => {
    const ls: ApiLinescore = {
      scheduledInnings: 9,
      innings: Array.from({ length: 9 }, (_, i) => ({ num: i + 1, away: { runs: 0 }, home: i < 8 ? { runs: i === 0 ? 2 : 0 } : { hits: 0 } })),
      teams: { away: { runs: 0, hits: 3, errors: 0 }, home: { runs: 2, hits: 6, errors: 1 } },
    };
    expect(shapeLinescore(ls, "final")!.xBottom).toBe(9);
    expect(shapeLinescore(ls, "live")!.xBottom).toBeNull();
    expect(shapeLinescore(ls, "upcoming")).toBeNull();
    // extra innings widen the table past nine
    const ten = { ...ls, innings: [...ls.innings!, { num: 10, away: { runs: 1 }, home: { runs: 0 } }] };
    expect(shapeLinescore(ten, "final")!.innings).toHaveLength(10);
  });

  it("a pitcher in batters[] with no slot and no plate appearance is not a batting row", () => {
    const team = {
      team: { id: 1, name: "X" },
      batters: [10, 11],
      players: {
        ID10: { person: { id: 10, fullName: "Hitter" }, battingOrder: "100", stats: { batting: { atBats: 4, plateAppearances: 4 } } },
        ID11: { person: { id: 11, fullName: "Arm" }, position: { abbreviation: "P" }, stats: { batting: { plateAppearances: 0 } } },
      },
    };
    expect(battingRows(team).map((b) => b.name)).toEqual(["Hitter"]);
  });
});

/**
 * GAME PREVIEW matchups (INSTRUCTION 46, 2026-09-08). Josh, verbatim: "'Preview'
 * should be named 'Game Preview' and has avg, ops stats but no AB, R, H, RBI, etc.
 * it should also have batter vs pitcher matchup data on that page".
 *
 * Fixture boxscore-preview-823250.json is the REAL 2026-09-08 pregame read of
 * WSH @ SD (Cornelio vs Mize), both lineups posted, plus Mize's vsPlayer splits vs
 * WSH (9 rows, one WSH lineup hitter among them — Abrams 3 AB) and Cornelio's vs
 * SD (no splits at all). Every expected figure below was read off the fixture.
 */
describe("boxscore: Game Preview matchups (WSH @ SD, 2026-09-08, pk 823250)", () => {
  const f = load("boxscore-preview-823250.json");
  const out = shapeBoxscore(f.game, f.boxscore, f.linescore, f.vsPlayer);

  it("is a pregame box with both probables and their season lines (GS IP K BB HR WHIP from seasonStats)", () => {
    expect(out.status).toBe("upcoming");
    expect(out.date).toBe("2026-09-08");
    expect(out.away).toMatchObject({ abbr: "WSH", record: "67-79", lineupPosted: true });
    expect(out.home).toMatchObject({ abbr: "SD", record: "76-68", lineupPosted: true });
    expect(out.away.probable).toEqual({ id: 683000, name: "Riley Cornelio", wl: "2-2", era: "5.96" });
    expect(out.home.probable).toEqual({ id: 663554, name: "Casey Mize", wl: "5-9", era: "3.64" });
    expect(out.home.probableLine).toEqual({ gs: 22, ip: "113.2", k: 100, bb: 28, hr: 13, whip: "1.12" });
    expect(out.away.probableLine).toEqual({ gs: 0, ip: "22.2", k: 23, bb: 21, hr: 2, whip: "1.81" });
  });

  it("the preview lineup carries season AVG / OPS for every posted batter", () => {
    expect(out.away.batters).toHaveLength(9);
    expect(out.away.batters[0]).toMatchObject({ boxName: "Wood", pos: "RF", order: 100, avg: ".268", ops: ".927" });
    expect(out.home.batters[0]).toMatchObject({ boxName: "Tatis Jr.", order: 100, avg: ".283", ops: ".799" });
    expect(out.home.batters.map((b) => b.boxName)).toEqual(["Tatis Jr.", "Cronenworth", "Machado, M", "France, T", "Merrill", "Campusano", "Harris, D", "Bogaerts", "Fermin"]);
  });

  it("away lineup vs Mize: Abrams is the one hitter with history (his single split verbatim), the other eight are 'no history' in lineup order, roster-only splits are dropped", () => {
    const m = out.matchups!.away!;
    expect(m.pitcher).toEqual({ id: 663554, name: "Casey Mize" });
    expect(m.lineupPosted).toBe(true);
    expect(m.lines).toHaveLength(9);
    expect(m.lines[0]).toEqual({ id: 682928, name: "CJ Abrams", boxName: "Abrams", order: 400, history: true, seasons: 1, ab: 3, h: 1, hr: 0, bb: 0, k: 0, avg: ".333", ops: ".666" });
    expect(m.lines.slice(1).every((l) => !l.history && l.ab === null && l.avg === null && l.ops === null)).toBe(true);
    expect(m.lines.slice(1).map((l) => l.order)).toEqual([100, 200, 300, 500, 600, 700, 800, 900]);
    // Lane Thomas / Meneses / Winker … faced Mize for WSH but are not in tonight's lineup
    expect(m.lines.find((l) => l.name === "Lane Thomas")).toBeUndefined();
  });

  it("home lineup vs Cornelio: the feed has no splits, so nine 'no history' rows — never a 0-for-0", () => {
    const m = out.matchups!.home!;
    expect(m.pitcher).toEqual({ id: 683000, name: "Riley Cornelio" });
    expect(m.lines).toHaveLength(9);
    expect(m.lines.every((l) => !l.history && l.ab === null)).toBe(true);
    expect(m.lines.map((l) => l.boxName)).toEqual(["Tatis Jr.", "Cronenworth", "Machado, M", "France, T", "Merrill", "Campusano", "Harris, D", "Bogaerts", "Fermin"]);
  });

  it("a side with no probable, or a feed that did not load, is null (the section is absent for it)", () => {
    const noHomeProbable = { ...f.game, teams: { ...f.game.teams, home: { ...f.game.teams.home, probablePitcher: undefined } } };
    expect(shapeMatchupSide(noHomeProbable, f.boxscore, "away", f.vsPlayer!.away)).toBeNull();
    expect(shapeMatchupSide(f.game, f.boxscore, "away", null)).toBeNull();
    expect(shapeBoxscore(f.game, f.boxscore, f.linescore, { away: null, home: null }).matchups).toEqual({ away: null, home: null });
  });

  it("with no lineup posted the rows are ONLY roster hitters the feed has history for, AB desc, no slot — departed players dropped", () => {
    // 2026-09-08 fix round: the feed lists everyone who ever faced Mize while with WSH. Of the 9
    // splits only CJ Abrams (682928, 3 AB) and Jacob Young (696285, 2 AB) are in the box's 28-man
    // players map; Meneses, Winker, Lane Thomas, Rosario, Millas, García Jr., Vargas are gone and
    // must not print under a caption that calls them roster hitters.
    const unposted = { ...f.boxscore, teams: { ...f.boxscore.teams, away: { ...f.boxscore.teams.away, battingOrder: [] } } };
    const m = shapeMatchupSide(f.game, unposted, "away", f.vsPlayer!.away)!;
    expect(m.lineupPosted).toBe(false);
    expect(m.lines).toHaveLength(2);
    expect(m.lines.every((l) => l.history && l.order === null && !!unposted.teams.away.players[`ID${l.id}`])).toBe(true);
    expect(m.lines.map((l) => [l.name, l.ab])).toEqual([["CJ Abrams", 3], ["Jacob Young", 2]]);
    expect(m.lines.find((l) => l.name === "Joey Meneses")).toBeUndefined();
    expect(m.lines.find((l) => l.name === "Jesse Winker")).toBeUndefined();
  });
});

describe("boxscore: matchups across seasons (STL lineup of 823907 vs Skubal, feeds fetched 2026-09-08)", () => {
  const box = load("boxscore-pregame-823907.json");
  const vs = (JSON.parse(readFileSync(path.join(__dirname, "fixtures", "boxscore-vsplayer-823907.json"), "utf8")) as { vsPlayer: ApiVsPlayerPair }).vsPlayer;
  const out = shapeBoxscore(box.game, box.boxscore, box.linescore, vs);

  it("sums a hitter's seasons into one career line and prints AVG / OPS the MLB way", () => {
    const m = out.matchups!.away!;
    expect(m.pitcher).toEqual({ id: 669373, name: "Tarik Skubal" });
    // Iván Herrera: 2025 3-for-3 + 2026 3-for-3 → 6 AB, 4 H (the fixture's two rows are 2h each)
    const herrera = m.lines.find((l) => l.id === 671056)!;
    expect(herrera).toMatchObject({ boxName: "Herrera", seasons: 2, ab: 6, h: 4, hr: 0, bb: 0, k: 0, avg: ".667", ops: "1.334" });
    // Pedro Pagés: 2025 0-for-2 (1 K) + 2026 1-for-2 → 4 AB 1 H → .250, OBP .250 + SLG .250
    expect(m.lines.find((l) => l.id === 686780)).toMatchObject({ seasons: 2, ab: 4, h: 1, k: 1, avg: ".250", ops: ".500" });
    // Jordan Walker: 2025 0-for-2 (2 K) + 2026 1-for-3 (2 K) → 5 AB 1 H 4 K
    expect(m.lines.find((l) => l.id === 691023)).toMatchObject({ seasons: 2, ab: 5, h: 1, k: 4, avg: ".200", ops: ".400" });
  });

  it("orders by AB desc, ties in lineup order; every STL starter has faced him so no 'no history' rows", () => {
    const m = out.matchups!.away!;
    expect(m.lines.map((l) => `${l.boxName} ${l.ab}`)).toEqual(["Herrera 6", "Walker, J 5", "Pagés, P 4", "Fermín 3", "Báez 3", "Bernal 3", "Urías, R 3", "Church 3", "Saggese 2"]);
    expect(m.lines.every((l) => l.history)).toBe(true);
    // roster hitters with Skubal history who are not in the posted nine (Arenado, Contreras, Winn …) are not rows
    expect(m.lines.find((l) => l.name === "Nolan Arenado")).toBeUndefined();
  });

  it("the LAD side vs Mathews has no splits at all → nine 'no history' rows", () => {
    const m = out.matchups!.home!;
    expect(m.pitcher).toEqual({ id: 687273, name: "Quinn Mathews" });
    expect(m.lines).toHaveLength(9);
    expect(m.lines.every((l) => !l.history)).toBe(true);
  });

  it("a one-season line reproduces the feed's own AVG / OPS strings exactly (OPS = rounded OBP + rounded SLG)", () => {
    const agg = aggregateVsPlayer(vs.away);
    const splits = vs.away!.stats!.find((s) => s.type?.displayName === "vsPlayer")!.splits!;
    let checked = 0;
    for (const a of agg.values()) {
      if (a.seasons !== 1) continue;
      const sp = splits.find((s) => s.batter!.id === a.id)!;
      expect(vsRates(a), a.name).toEqual({ avg: sp.stat.avg, ops: sp.stat.ops });
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(15);
    // a 0-AB walk prints .000 / 1.000 as the feed does (Rangel Ravelo 2020)
    expect(vsRates(agg.get(592660)!)).toEqual({ avg: ".000", ops: "1.000" });
  });

  it("vsPlayerTotal (the pitcher vs the whole club, no batter) is ignored; empty / missing feeds aggregate to nothing", () => {
    expect(aggregateVsPlayer(vs.away).has(669373)).toBe(false);
    expect(aggregateVsPlayer(vs.home).size).toBe(0);
    expect(aggregateVsPlayer(null).size).toBe(0);
    expect(aggregateVsPlayer({ stats: [{ type: { displayName: "vsPlayerTotal" }, splits: [{ stat: { atBats: 65 } }] }] }).size).toBe(0);
  });

  it("rates: a split with no counts is null (prints —), fmt3 drops the leading zero", () => {
    expect(vsRates({ id: 1, name: "x", seasons: 1, ab: null, h: null, doubles: null, triples: null, hr: null, bb: null, k: null, hbp: null, sf: null, tb: null })).toEqual({ avg: null, ops: null });
    expect(fmt3(0)).toBe(".000");
    expect(fmt3(1)).toBe("1.000");
    expect(fmt3(2 / 3)).toBe(".667");
  });
});
