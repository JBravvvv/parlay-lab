import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { currentValue, type Boxscore, type GameStatus } from "@/engine2/grade";

/* Live "Current: X" stats (2026-07-21): the same stat extraction as the grader,
   read mid-game. Tested against the REAL boxscore fixture (game 822954).

   INSTRUCTION 50 (2026-09-11, Josh's word, verbatim: "it will show the player is top 4th
   w/ 3 H+R+RBI, but show them as an 'S' grade for over .5 H+R+RBI") — currentValue now
   returns the TALLY as well as the text, so a caller can compare it to the leg's line.
   These assertions are the contract for that number: the same six reads, each with the
   value the fixture really holds; ml_/rl_ carry `val: null` (a score is not a counting
   stat); "0 HR" is a real `val: 0` because the player IS in the box, while a player with
   no boxscore appearance still returns the whole read as null (the last case below). */

const box: Boxscore = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures", "fix40", "box_822954.json"), "utf8"),
);
const live: GameStatus = { state: "In Progress", away: 3, home: 2 };

describe("currentValue — live leg reads from the official boxscore", () => {
  it("H+R+RBI: José Caballero sits at 2 (1 H + 0 R + 1 RBI)", () => {
    expect(currentValue("josecaballero|batter_hits_runs_rbis|1.5", live, box)).toEqual({ txt: "2 H+R+RBI", val: 2 });
  });
  it("hits and total bases: Chandler Simpson 2 H, 6 TB (2 triples)", () => {
    expect(currentValue("chandlersimpson|batter_hits|0.5", live, box)).toEqual({ txt: "2 H", val: 2 });
    expect(currentValue("chandlersimpson|batter_total_bases|1.5", live, box)).toEqual({ txt: "6 TB", val: 6 });
  });
  it("HR: 0 so far is a real zero (player IS in the box), never hidden", () => {
    expect(currentValue("josecaballero|batter_home_runs|0.5", live, box)).toEqual({ txt: "0 HR", val: 0 });
    // the distinction the whole suppression rests on: 0 is a VALUE, absence is null
    expect(currentValue("josecaballero|batter_home_runs|0.5", live, box)?.val).toBe(0);
    expect(currentValue("aaronjudge|batter_home_runs|0.5", live, box)).toBeNull();
  });
  it("pitcher K's and outs: Drew Rasmussen 2 K through 7 outs", () => {
    expect(currentValue("drewrasmussen|pitcher_strikeouts|4.5", live, box)).toEqual({ txt: "2 K", val: 2 });
    expect(currentValue("drewrasmussen|pitcher_outs|14.5", live, box)).toEqual({ txt: "7 outs", val: 7 });
  });
  it("ML/RL legs read the live score, rendered [bet team]-[opponent]", () => {
    expect(currentValue("ml_home", live, box)).toEqual({ txt: "2-3", val: null });
    expect(currentValue("rl_away", live, box)).toEqual({ txt: "3-2", val: null });
    expect(currentValue("ml_home", { state: "In Progress", away: null, home: 2 }, box)).toBeNull();
  });
  it("a player not in the boxscore yet returns null — never a fabricated 0", () => {
    expect(currentValue("aaronjudge|batter_hits|0.5", live, box)).toBeNull();
    expect(currentValue("josecaballero|batter_hits|0.5", live, null)).toBeNull();
    expect(currentValue("garbage-lkey", live, box)).toBeNull();
  });
});
