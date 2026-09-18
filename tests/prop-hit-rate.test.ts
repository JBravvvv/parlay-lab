import { describe, expect, it } from "vitest";
import {
  HIT_WINDOWS,
  DEFAULT_HIT_WINDOW,
  batStat,
  cleared,
  hitDots,
  hitKey,
  hitRate,
  hitTone,
  isHitWindow,
  isPitcherMarket,
  statSeries,
  windowLabel,
  type PlayerLog,
} from "@/lib/prop-hit-rate";

/**
 * PROP HIT RATES (2026-09-18, Josh: "incorporate analytics on how often players are achieving the
 * selected prop we are viewing over the last 7, 15, 30 60 & 120 games"). Pure counting over a
 * game log — these pin the counting rules so the chip can never drift from what it claims.
 */

/* newest first: [hits, runs, rbi, hr, tb, ab] */
const HITTER: PlayerLog = {
  id: 1,
  pos: "RF",
  bat: [
    [2, 1, 1, 0, 3, 4],
    [0, 0, 0, 0, 0, 4],
    [1, 0, 2, 1, 4, 3],
    [0, 0, 0, 0, 0, 0], // pinch-runner: no at-bat, does not count
    [1, 1, 0, 0, 1, 5],
    [3, 2, 3, 1, 7, 4],
    [0, 1, 0, 0, 0, 3],
    [1, 0, 0, 0, 2, 4],
  ],
  pit: [],
};

/* [k, outs, gamesStarted] */
const PITCHER: PlayerLog = {
  id: 2,
  pos: "P",
  bat: [],
  pit: [
    [7, 18, 1],
    [2, 3, 0], // a relief cameo: not a start, does not count
    [5, 15, 1],
    [9, 21, 1],
    [4, 12, 1],
  ],
};

describe("the windows", () => {
  it("are exactly Josh's five, default L15", () => {
    expect(HIT_WINDOWS).toEqual([7, 15, 30, 60, 120]);
    expect(DEFAULT_HIT_WINDOW).toBe(15);
    expect(isHitWindow(30)).toBe(true);
    expect(isHitWindow(10)).toBe(false);
    expect(windowLabel(60)).toBe("L60");
  });
});

describe("what counts as a game", () => {
  it("a hitter's game needs an at-bat; the series is newest first", () => {
    expect(statSeries(HITTER, "batter_hits")).toEqual([2, 0, 1, 1, 3, 0, 1]);
    expect(statSeries(HITTER, "batter_hits_runs_rbis")).toEqual([4, 0, 3, 2, 8, 1, 1]);
    expect(statSeries(HITTER, "batter_total_bases")).toEqual([3, 0, 4, 1, 7, 0, 2]);
    expect(statSeries(HITTER, "batter_home_runs")).toEqual([0, 0, 1, 0, 1, 0, 0]);
  });
  it("a pitcher's game must be a start", () => {
    expect(isPitcherMarket("pitcher_strikeouts")).toBe(true);
    expect(isPitcherMarket("batter_hits")).toBe(false);
    expect(statSeries(PITCHER, "pitcher_strikeouts")).toEqual([7, 5, 9, 4]);
    expect(statSeries(PITCHER, "pitcher_outs")).toEqual([18, 15, 21, 12]);
  });
  it("a market with no game-log stat, or no log at all, yields nothing rather than a guess", () => {
    expect(batStat("batter_singles", HITTER.bat[0])).toBeNull();
    expect(statSeries(HITTER, "pitcher_strikeouts")).toEqual([]);
    expect(statSeries(null, "batter_hits")).toEqual([]);
    expect(hitRate(undefined, "batter_hits", 0.5, "o", 15)).toBeNull();
  });
});

describe("clearing a line", () => {
  it("over is strictly more, under strictly less — a push on a whole line is neither", () => {
    expect(cleared(2, 1.5, "o")).toBe(true);
    expect(cleared(1, 1.5, "o")).toBe(false);
    expect(cleared(1, 1.5, "u")).toBe(true);
    expect(cleared(2, 2, "o")).toBe(false);
    expect(cleared(2, 2, "u")).toBe(false);
  });
  it("the rate is hits over the games that counted, capped at the window", () => {
    const r = hitRate(HITTER, "batter_hits", 0.5, "o", 15)!;
    expect(r).toMatchObject({ n: 7, hits: 5, window: 15 });
    expect(r.rate).toBeCloseTo(5 / 7, 12);
    expect(r.avg).toBeCloseTo(8 / 7, 12);
    const short = hitRate(HITTER, "batter_hits", 0.5, "o", 3)!;
    expect(short).toMatchObject({ n: 3, hits: 2 });
    expect(hitRate(HITTER, "batter_hits_runs_rbis", 1.5, "o", 7)!.hits).toBe(4);
    expect(hitRate(HITTER, "batter_hits_runs_rbis", 1.5, "u", 7)!.hits).toBe(3);
    expect(hitRate(PITCHER, "pitcher_strikeouts", 5.5, "o", 15)).toMatchObject({ n: 4, hits: 2 });
  });
  it("the dots strip is the last ten games, oldest on the left", () => {
    expect(hitDots(HITTER, "batter_hits", 0.5, "o")).toEqual([true, false, true, true, true, false, true]);
    expect(hitDots(HITTER, "batter_hits", 0.5, "o", 3)).toEqual([true, false, true]);
  });
  it("the tone is only a reading aid: pink from 60%, gold from 45%, red below", () => {
    expect(hitTone(0.6)).toBe("pos");
    expect(hitTone(0.59)).toBe("gold");
    expect(hitTone(0.45)).toBe("gold");
    expect(hitTone(0.44)).toBe("neg");
  });
});

describe("the client key", () => {
  it("folds the board's spelling the way props-model's nameKey does", () => {
    expect(hitKey("José Ramírez")).toBe("joseramirez");
    expect(hitKey("Vladimir Guerrero Jr.")).toBe("vladimirguerrerojr");
    expect(hitKey("  Bryce  Harper ")).toBe("bryceharper");
  });
});
