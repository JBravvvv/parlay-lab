import { describe, expect, it } from "vitest";
import { gameHour, hourLabel, inGameTimeWindow } from "@/lib/game-time-window";
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
