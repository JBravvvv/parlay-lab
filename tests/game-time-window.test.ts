import { describe, expect, it } from "vitest";
import { ALL_DAY, DEFAULT_TIME_BOUNDS, SLATE_OPEN_HOUR, TIME_STEP, gameHour, gameTimeLabel, hourLabel, inGameTimeWindow, isAllDay, slateTimeBounds } from "@/lib/game-time-window";
describe("Pacific game start windows", () => {
  it("uses Pacific time in summer and winter", () => {
    expect(gameHour("2026-09-19T17:30:00Z")).toBe(10.5);
    expect(gameHour("2026-12-19T18:30:00Z")).toBe(10.5);
    expect(inGameTimeWindow("2026-09-19T17:30:00Z", [10, 11])).toBe(true);
    expect(inGameTimeWindow("2026-09-19T18:01:00Z", [10, 11])).toBe(false);
  });
  it("labels the last endpoint 11:59pm and includes that minute", () => {
    expect(hourLabel(0)).toBe("12am");
    expect(hourLabel(24)).toBe("11:59pm");
    expect(inGameTimeWindow("2026-09-20T06:59:00Z", [23, 24])).toBe(true);
  });
  it("excludes unknown starts only when a window is selected", () => {
    expect(inGameTimeWindow(null, [0, 24])).toBe(true);
    expect(inGameTimeWindow(null, [10, 11])).toBe(false);
    expect(inGameTimeWindow("invalid", [10, 11])).toBe(false);
  });
});

/* 2026-09-26, Josh, verbatim: "Should go in 30 minute increments. For MLB, NFL & CFB, unless there is a random
   off game international etc the game start slider should start at 9am" */
describe("half-hour steps, a 9am floor that opens earlier only for an earlier game", () => {
  it("labels half hours", () => {
    expect(hourLabel(9)).toBe("9am");
    expect(hourLabel(9.5)).toBe("9:30am");
    expect(hourLabel(12.5)).toBe("12:30pm");
    expect(hourLabel(23.5)).toBe("11:30pm");
    expect(TIME_STEP).toBe(0.5);
  });
  it("a slate with nothing before 9am PT starts the track at 9am", () => {
    expect(SLATE_OPEN_HOUR).toBe(9);
    expect(slateTimeBounds([])).toEqual([9, 24]);
    expect(slateTimeBounds(["2026-09-26T17:05:00Z", "2026-09-27T01:40:00Z", null, "not a date"])).toEqual(DEFAULT_TIME_BOUNDS);
  });
  it("an early game (a London kickoff, a Tokyo series) opens the track to its half hour", () => {
    // 6:30am PT and 6:45am PT both floor to 6:30am
    expect(slateTimeBounds(["2026-09-26T13:30:00Z", "2026-09-26T20:00:00Z"])).toEqual([6.5, 24]);
    expect(slateTimeBounds(["2026-09-26T13:45:00Z"])).toEqual([6.5, 24]);
  });
  it("ALL_DAY is the no-filter sentinel whatever the track's floor", () => {
    expect(isAllDay(ALL_DAY)).toBe(true);
    expect(isAllDay(undefined)).toBe(true);
    expect(isAllDay(null)).toBe(true);
    expect(isAllDay([9, 24])).toBe(false);
    expect(isAllDay([0, 23.5])).toBe(false);
    expect(inGameTimeWindow("2026-09-26T13:30:00Z", ALL_DAY)).toBe(true);
  });
  it("the hour cache returns the same answer on a repeat call (the generator asks per leg, 32+ times per render)", () => {
    const start = "2026-09-26T17:05:00Z";
    const first = gameHour(start);
    expect(gameHour(start)).toBe(first);
    expect(first).toBeCloseTo(10 + 5 / 60, 10);
    expect(gameTimeLabel(start)).toBe("10:05 AM PT");
  });
});
