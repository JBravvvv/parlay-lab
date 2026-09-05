import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  WINDOW_GAMES, aggregateStarts, ipToOuts, isStarter, needsStartsOnly, outsToIp, parseWindowValue,
  personSplits, shapeWindow, siblingWindow, startsOnlyIds, windowNote, windowValue,
  type LeagueDoc, type PeopleDoc,
} from "@/lib/stats-window";

/**
 * INSTRUCTIONS 35–36 (2026-09-04): Stats tab timeframes are GAME windows.
 *
 * Josh's word: hitters "Last 7 / 15 / 30 Games … should only reflect games they
 * played in"; pitchers "Last 3 / 5 / 10 Games" where for an SP "it should show
 * his last 5 Games Started" and for Chapman "his last 5 RP, not just the last 5
 * games the Red Sox played, only games he pitched in".
 *
 * Fixture: tests/fixtures/stats-window-2026-09-05.json — real statsapi.mlb.com
 * responses captured 2026-09-05 UTC, slimmed to seven players. Every number
 * asserted below is a FIXTURE figure, not a production measurement.
 *
 * The one case the API can't answer alone: Adrian Houser (a starter by the SP
 * rule, 16 GS in 26 G) had 2 starts among his last 5 appearances. lastXGames
 * would show a 5-game line that is mostly relief work; the spec wants his last
 * 5 STARTS, which only his game log can give — 13+13+3+18+5 outs.
 */
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "stats-window-2026-09-05.json"), "utf8")) as {
  pitching: { season: LeagueDoc; people5: PeopleDoc; gameLog: PeopleDoc };
  hitting: { season: LeagueDoc; people15: PeopleDoc };
};
const COLE = 543037, CHAPMAN = 547973, HOUSER = 605288, MARTE = 805074, JUDGE = 592450, BAE = 678225;

describe("window vocabulary", () => {
  it("hitting offers 7/15/30 games, pitching 3/5/10", () => {
    expect(WINDOW_GAMES.hitting).toEqual([7, 15, 30]);
    expect(WINDOW_GAMES.pitching).toEqual([3, 5, 10]);
  });
  it("round-trips the select value and maps windows across groups by position", () => {
    expect(windowValue(15)).toBe("g15");
    expect(parseWindowValue("g15")).toBe(15);
    expect(parseWindowValue("season")).toBeNull();
    expect(parseWindowValue("last7")).toBeNull();
    expect(siblingWindow("hitting", "pitching", 15)).toBe(5);
    expect(siblingWindow("pitching", "hitting", 10)).toBe(30);
    expect(siblingWindow("hitting", "pitching", 8)).toBeNull();
  });
  it("innings arithmetic treats .1/.2 as thirds", () => {
    expect(ipToOuts("5.1")).toBe(16);
    expect(ipToOuts("30.1")).toBe(91);
    expect(outsToIp(52)).toBe("17.1");
  });
  it("the note says what the window means per group", () => {
    expect(windowNote("hitting", 15)).toMatch(/games each hitter played in/);
    expect(windowNote("pitching", 5)).toMatch(/SP: last 5 starts · RP\/CP: last 5 appearances/);
  });
});

describe("starter rule and the starts-only trigger", () => {
  it("matches the Stats page SP filter (started at least half his games, min 1)", () => {
    expect(isStarter(18, 18)).toBe(true);
    expect(isStarter(49, 0)).toBe(false);
    expect(isStarter(26, 16)).toBe(true);
    expect(isStarter(2, 1)).toBe(true);
  });
  it("Cole's window is all starts → keep lastXGames; Chapman is a reliever → keep; Houser needs his starts", () => {
    const wins = personSplits(FX.pitching.people5, "pitching", "lastXGames");
    const season = new Map(FX.pitching.season.stats![0].splits!.map((s) => [s.player!.id, s.stat]));
    expect(needsStartsOnly("pitching", season.get(COLE), wins.get(COLE)![0].stat)).toBe(false);
    expect(needsStartsOnly("pitching", season.get(CHAPMAN), wins.get(CHAPMAN)![0].stat)).toBe(false);
    expect(needsStartsOnly("pitching", season.get(HOUSER), wins.get(HOUSER)![0].stat)).toBe(true);
    expect(needsStartsOnly("pitching", season.get(MARTE), wins.get(MARTE)![0].stat)).toBe(true);
    expect(needsStartsOnly("hitting", { gamesPlayed: 10, gamesStarted: 10 }, { gamesPlayed: 5, gamesStarted: 2 })).toBe(false);
    expect(startsOnlyIds("pitching", FX.pitching.season, FX.pitching.people5).sort()).toEqual([HOUSER, MARTE].sort());
  });
});

describe("aggregateStarts sums the last N starts and recomputes rates", () => {
  const logs = personSplits(FX.pitching.gameLog, "pitching", "gameLog");
  it("Houser: 5 starts, 52 outs → 17.1 IP, 7 ER → ERA 3.63, 20 K, WHIP 1.15", () => {
    const a = aggregateStarts(logs.get(HOUSER)!, 5)!;
    expect(a.gamesPlayed).toBe(5);
    expect(a.gamesStarted).toBe(5);
    expect(a.outs).toBe(52);
    expect(a.inningsPitched).toBe("17.1");
    expect(a.earnedRuns).toBe(7);
    expect(a.era).toBe("3.63");
    expect(a.strikeOuts).toBe(20);
    expect(a.hits).toBe(15);
    expect(a.baseOnBalls).toBe(5);
    expect(a.whip).toBe("1.15");
    expect(a.windowSource).toBe("starts");
  });
  it("Marte has one start → a 1-start line, never padded with relief outings", () => {
    const a = aggregateStarts(logs.get(MARTE)!, 5)!;
    expect(a.gamesPlayed).toBe(1);
    expect(a.inningsPitched).toBe("4.2");
    expect(a.earnedRuns).toBe(1);
  });
  it("a log with no starts yields null (the window keeps the lastXGames line)", () => {
    expect(aggregateStarts([{ stat: { gamesStarted: 0, outs: 3 } }], 5)).toBeNull();
    expect(aggregateStarts([], 5)).toBeNull();
  });
});

describe("shapeWindow builds the league-shaped doc the Stats table parses", () => {
  it("hitting: Judge's last 15 games (57 AB), Bae's last 15 = the 4 he played, team and position carried", () => {
    const doc = shapeWindow({ group: "hitting", n: 15, seasonDoc: FX.hitting.season, peopleDoc: FX.hitting.people15 });
    const by = new Map(doc.stats![0].splits!.map((s) => [s.player!.id, s]));
    expect(doc.window).toEqual({ group: "hitting", n: 15, players: 3, startsOnly: 0 });
    expect(by.get(JUDGE)!.stat!.gamesPlayed).toBe(15);
    expect(by.get(JUDGE)!.stat!.atBats).toBe(57);
    expect(by.get(JUDGE)!.team!.id).toBe(147);
    expect(by.get(BAE)!.stat!.gamesPlayed).toBe(4);
  });
  it("pitching: Cole keeps his 5-start lastXGames line, Chapman his 5 appearances, Houser gets his 5 starts", () => {
    const doc = shapeWindow({
      group: "pitching", n: 5, seasonDoc: FX.pitching.season, peopleDoc: FX.pitching.people5, gameLogDoc: FX.pitching.gameLog,
    });
    const by = new Map(doc.stats![0].splits!.map((s) => [s.player!.id, s]));
    expect(doc.window.startsOnly).toBe(2);
    expect(by.get(COLE)!.stat!.inningsPitched).toBe("30.1");
    expect(by.get(COLE)!.stat!.gamesStarted).toBe(5);
    expect(by.get(CHAPMAN)!.stat!.gamesPlayed).toBe(5);
    expect(by.get(CHAPMAN)!.stat!.gamesStarted).toBe(0);
    expect(by.get(CHAPMAN)!.stat!.inningsPitched).toBe("5.0");
    expect(by.get(HOUSER)!.stat!.inningsPitched).toBe("17.1");
    expect(by.get(HOUSER)!.stat!.era).toBe("3.63");
    expect(by.get(HOUSER)!.position!.abbreviation).toBe("P");
  });
  it("without the game-log doc a mixed starter falls back to his lastXGames line rather than vanishing", () => {
    const doc = shapeWindow({ group: "pitching", n: 5, seasonDoc: FX.pitching.season, peopleDoc: FX.pitching.people5 });
    const h = doc.stats![0].splits!.find((s) => s.player!.id === HOUSER)!;
    expect(h.stat!.inningsPitched).toBe("18.0");
    expect(doc.window.startsOnly).toBe(0);
  });
});

describe("Stats page wiring", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "app", "stats", "page.tsx"), "utf8");
  const route = fs.readFileSync(path.join(__dirname, "..", "app", "api", "stats", "window", "route.ts"), "utf8");
  it("the timeframe menu is game windows, not day windows", () => {
    expect(page).toMatch(/Last \{n\} Games/);
    expect(page).not.toMatch(/Last \d+ Days/);
    expect(page).not.toMatch(/byDateRange/);
    expect(page).toMatch(/WINDOW_GAMES\[group\]/);
  });
  it("individual windows hit /api/stats/window; team windows use MLB's team lastXGames with limit=N", () => {
    expect(page).toMatch(/\/api\/stats\/window\?group=\$\{group\}&n=\$\{n\}&season=\$\{season\}/);
    expect(page).toMatch(/lastXGames&limit=\$\{n\}/);
    expect(page).toMatch(/data-testid="window-note"/);
    expect(page).toMatch(/siblingWindow\(group, g, n\)/);
  });
  it("the route batches people hydrate with limit=N and only pulls game logs for the starters that need them", () => {
    expect(route).toMatch(/type=\[lastXGames\],limit=\$\{n\}/);
    expect(route).toMatch(/startsOnlyIds\(group, seasonDoc, peopleDoc\)/);
    expect(route).toMatch(/needLog\.length \? await people\(needLog, group, season, "type=\[gameLog\]"\) : null/);
    expect(route).toMatch(/playerPool=All&limit=2500/);
  });
});
