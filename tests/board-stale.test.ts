import { describe, expect, it } from "vitest";
import {
  boardStale,
  LU_PCT_FLOOR,
  MAX_AUTO_RUNS_PER_DAY,
  MIN_CACHE_AGE_MS,
  NEAR_FIRST_PITCH_MS,
} from "@/lib/board-stale";

/**
 * PHASE 1c — the staleness gate. cachedBoard() used to serve any board with today's
 * date, so opening the app in the evening and locking gave a card priced at 9am off
 * PROJECTED lineups (the closed-form path, with the H+R+RBI PA-conditioning weakness).
 * Each regenerate costs ~120 Odds credits, so the gate must be tight in both
 * directions: it has to fire when it matters and never repeatedly.
 */

const NOW = Date.parse("2026-07-25T22:00:00Z");
const H = 3600_000;
/* 22:00 UTC, board built at 20:00, next game 23:00. That game's lineup window
   (23:00 − 3h = 20:00... ) — use a 23:30 start so the window opened at 20:30,
   after the board was built and before now: a regenerate would add real lineups. */
const base = {
  pct: 0.2,
  at: NOW - 2 * H, // 20:00
  starts: [NOW + 1.5 * H, NOW + 3 * H], // 23:30, 01:00
  autoRuns: 0,
  now: NOW,
};

describe("boardStale", () => {
  it("fires when all three conditions hold", () => {
    expect(boardStale(base)).toEqual({ stale: true, reason: "stale" });
  });

  it("holds when lineup coverage is already good enough", () => {
    expect(boardStale({ ...base, pct: LU_PCT_FLOOR }).reason).toBe("coverage-ok");
    expect(boardStale({ ...base, pct: 0.9 }).stale).toBe(false);
  });

  it("holds when the cache is younger than the floor — no thrashing on rapid opens", () => {
    expect(boardStale({ ...base, at: NOW - (MIN_CACHE_AGE_MS - 1) }).reason).toBe("cache-fresh");
    expect(boardStale({ ...base, at: NOW - (MIN_CACHE_AGE_MS + 1) }).stale).toBe(true);
  });

  it("holds when first pitch is still far off", () => {
    const far = { ...base, starts: [NOW + NEAR_FIRST_PITCH_MS + H] };
    expect(boardStale(far).reason).toBe("too-early");
  });

  /* The morning case, which is Josh's ACTUAL workflow: he generates and locks
     around 9–9:30am PT (16:30 UTC), right after the cron. At that hour nothing is
     posted for the evening slate, and the early games' lineups were already out
     when he generated — so a regenerate produces an equally projected board and
     spends ~120 Odds credits to change nothing. Coverage alone must not fire. */
  it("does NOT fire when a regenerate could not add any lineup", () => {
    const nine30am = Date.parse("2026-07-25T16:30:00Z");
    const v = boardStale({
      pct: 0.1,
      at: Date.parse("2026-07-25T16:00:00Z"), // generated 30 min ago
      starts: [Date.parse("2026-07-25T17:05:00Z"), Date.parse("2026-07-26T00:05:00Z")],
      autoRuns: 0,
      now: nine30am,
    });
    // 17:05 game's lineup window opened 14:05, BEFORE the board was built → nothing new
    expect(v).toEqual({ stale: false, reason: "no-new-lineups" });
  });

  it("fires in the evening, when a window opened after the board was built", () => {
    // board 16:00, now 22:00, game 23:30 → window opened 20:30: after the board, before now
    expect(boardStale(base).stale).toBe(true);
  });

  it("holds once every game has started — nothing left to reprice", () => {
    expect(boardStale({ ...base, starts: [NOW - H, NOW - 2 * H] }).reason).toBe("no-games-left");
  });

  it("ignores games already underway when finding the earliest remaining pitch", () => {
    // one game started an hour ago, the next is in 90 minutes → still stale
    expect(boardStale({ ...base, starts: [NOW - H, NOW + 1.5 * H] }).stale).toBe(true);
  });

  it("caps automatic regenerates per day — ~120 credits each, so the worst case is bounded", () => {
    expect(boardStale({ ...base, autoRuns: MAX_AUTO_RUNS_PER_DAY - 1 }).stale).toBe(true);
    expect(boardStale({ ...base, autoRuns: MAX_AUTO_RUNS_PER_DAY }).reason).toBe("cap");
    expect(boardStale({ ...base, autoRuns: 99 }).stale).toBe(false);
  });

  it("never judges a board that predates luCoverage — no spending on an assumption", () => {
    expect(boardStale({ ...base, pct: undefined }).reason).toBe("unknown-coverage");
    expect(boardStale({ ...base, pct: null }).stale).toBe(false);
  });

  it("gives a reason every time, so a silent no is distinguishable from a broken gate", () => {
    for (const v of [
      base,
      { ...base, pct: 0.9 },
      { ...base, at: NOW },
      { ...base, starts: [NOW + 9 * H] },
      { ...base, starts: [] },
      { ...base, autoRuns: 5 },
      { ...base, pct: null },
    ]) {
      expect(boardStale(v).reason).toBeTruthy();
    }
  });
});
