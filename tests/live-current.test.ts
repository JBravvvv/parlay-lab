import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { currentValue, type Boxscore, type GameStatus } from "@/engine2/grade";

/* Live "Current: X" stats (2026-07-21): the same stat extraction as the grader,
   read mid-game. Tested against the REAL boxscore fixture (game 822954). */

const box: Boxscore = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures", "fix40", "box_822954.json"), "utf8"),
);
const live: GameStatus = { state: "In Progress", away: 3, home: 2 };

describe("currentValue — live leg reads from the official boxscore", () => {
  it("H+R+RBI: José Caballero sits at 2 (1 H + 0 R + 1 RBI)", () => {
    expect(currentValue("josecaballero|batter_hits_runs_rbis|1.5", live, box)).toEqual({ txt: "2 H+R+RBI" });
  });
  it("hits and total bases: Chandler Simpson 2 H, 6 TB (2 triples)", () => {
    expect(currentValue("chandlersimpson|batter_hits|0.5", live, box)).toEqual({ txt: "2 H" });
    expect(currentValue("chandlersimpson|batter_total_bases|1.5", live, box)).toEqual({ txt: "6 TB" });
  });
  it("HR: 0 so far is a real zero (player IS in the box), never hidden", () => {
    expect(currentValue("josecaballero|batter_home_runs|0.5", live, box)).toEqual({ txt: "0 HR" });
  });
  it("pitcher K's and outs: Drew Rasmussen 2 K through 7 outs", () => {
    expect(currentValue("drewrasmussen|pitcher_strikeouts|4.5", live, box)).toEqual({ txt: "2 K" });
    expect(currentValue("drewrasmussen|pitcher_outs|14.5", live, box)).toEqual({ txt: "7 outs" });
  });
  it("ML/RL legs read the live score", () => {
    expect(currentValue("ml_home", live, box)).toEqual({ txt: "3-2" });
    expect(currentValue("rl_away", live, box)).toEqual({ txt: "3-2" });
    expect(currentValue("ml_home", { state: "In Progress", away: null, home: 2 }, box)).toBeNull();
  });
  it("a player not in the boxscore yet returns null — never a fabricated 0", () => {
    expect(currentValue("aaronjudge|batter_hits|0.5", live, box)).toBeNull();
    expect(currentValue("josecaballero|batter_hits|0.5", live, null)).toBeNull();
    expect(currentValue("garbage-lkey", live, box)).toBeNull();
  });
});
