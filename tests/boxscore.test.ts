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
 * Every expected figure below was read off the fixture, never typed from memory.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  battingRows,
  decisionTag,
  shapeBoxscore,
  shapeLinescore,
  shapePitcher,
  type ApiBoxscore,
  type ApiLinescore,
  type ApiScheduleGame,
} from "@/lib/boxscore";

type Fix = { boxscore: ApiBoxscore; linescore: ApiLinescore; game: ApiScheduleGame };
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
