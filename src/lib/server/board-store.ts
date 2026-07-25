import { gunzipSync, gzipSync } from "node:zlib";
import type { BoardData } from "@/engine";
import { achievableCoverage, deadSlate, liveCoverageOf } from "@/lib/board-coverage";

/**
 * SERVER BOARD DELIVERY (Phase 1, 2026-07-25)
 *
 * Until now /api/generate analyzed a board, extracted prediction records, and threw
 * the board itself away — so the cron's work could never be *bet*, only logged, and
 * the client always paid ~120 Odds credits for its own generate. That made "retime
 * the cron and stop generating manually" impossible: both would have run, ~240
 * credits for one usable board.
 *
 * Storing the board closes that. The cron's board becomes the day's board; the
 * client loads it instead of building its own.
 *
 * Encoding: gzip → base64. Re-measured after the timezone fix (2026-07-25): a
 * 15-game board with props on 6 of them is 539KB raw / 62KB gzipped / **83KB stored**.
 * propBoard is the only part that scales with slate size (~9.7KB per prop-game;
 * categories are capped at 50 rows/market and saturate), so a full 18-game slate with
 * props on every game projects to ~655KB raw / **~104KB stored** — 19x headroom against
 * MAX_STORED_BYTES. The route decompresses before responding, so the client sees
 * ordinary JSON and gains no new failure mode.
 */

export const BOARD_KEY = (date: string) => `pl:board:${date}`;
/** Refuse to store anything absurd rather than silently truncating a board. */
export const MAX_STORED_BYTES = 2_000_000;

export type StoredBoard = { date: string; at: number; data: BoardData };

export function encodeBoard(b: StoredBoard): { blob: string; bytes: number } | { error: string } {
  const json = JSON.stringify(b);
  const blob = gzipSync(Buffer.from(json)).toString("base64");
  if (blob.length > MAX_STORED_BYTES) return { error: `board too large (${blob.length} bytes compressed)` };
  return { blob, bytes: blob.length };
}

export function decodeBoard(blob: string | null): StoredBoard | null {
  if (!blob) return null;
  try {
    return JSON.parse(gunzipSync(Buffer.from(blob, "base64")).toString("utf8")) as StoredBoard;
  } catch {
    return null; // corrupt or legacy value — the client just generates, as before
  }
}

/* ---- the conditional skip ----

   A second generation is pointless when a good board for the date already exists.
   The trap is measuring "good" over the WHOLE day: a Sunday board built at 16:00 UTC
   reads 71% lineup-confirmed, and by 22:00 nearly every one of those games has already
   started. Whole-day coverage would wave the run through on a board with nothing
   bettable left in it.

   So coverage is measured over games that have NOT started at decision time. That also
   fails in the safe direction: a stale, low-coverage board can never satisfy it, so it
   can't be used to suppress a run that should happen. */

export const SKIP_COVERAGE = 0.7;
/**
 * Below this achievable coverage a pass cannot do useful work whatever the engine
 * does, because the lineups simply are not posted yet — a 16:00 UTC run on a Monday
 * reaches ~1% of the slate. Guards a mis-scheduled cron from spending ~120 Odds
 * credits a day for nothing, independently of whether the day-of-week split is right.
 */
export const MIN_ACHIEVABLE = 0.15;

export type SkipCheck = {
  skip: boolean;
  reason: "no-board" | "no-games-left" | "covered" | "thin" | "dead-slate" | "low-ceiling";
  live: number; // games not yet started
  confirmed: number; // ...of those, with both lineups posted when the board was built
  pct: number;
};

/**
 * @param board    the stored board for the date, if any
 * @param now      decision time
 * @param starts   first-pitch times from the SCHEDULE, independent of any stored
 *                 board. Without this an empty store always means "run" — which on
 *                 a Sunday at 22:00, with every game long since started, buys ~120
 *                 Odds credits of a dead slate. The schedule is keyless and free,
 *                 so the emptiest case is also the cheapest one to answer.
 */
export function liveCoverage(board: StoredBoard | null, now: number, starts?: number[]): SkipCheck {
  if (starts && starts.length && deadSlate(starts, now)) {
    return { skip: true, reason: "dead-slate", live: 0, confirmed: 0, pct: 0 };
  }
  /* Ceiling check, before any board is consulted: what could a fresh board reach at
     this hour at best? Below the floor the answer is "almost nothing", and that is
     true of a correct engine on a badly chosen hour, so no board can rescue it. */
  if (starts && starts.length) {
    const ceiling = achievableCoverage(starts, now);
    if (ceiling < MIN_ACHIEVABLE) {
      return { skip: true, reason: "low-ceiling", live: 0, confirmed: 0, pct: ceiling };
    }
  }
  if (!board) return { skip: false, reason: "no-board", live: 0, confirmed: 0, pct: 0 };
  const gi = (board.data?.gameInfo ?? {}) as Record<string, { start?: string | null; lu?: boolean }>;
  const cov = liveCoverageOf(gi, now);
  if (!cov.live) {
    // nothing left to price today — a fresh board would have nothing to add
    return { skip: true, reason: "no-games-left", live: 0, confirmed: 0, pct: 0 };
  }
  const covered = cov.pct >= SKIP_COVERAGE;
  return { skip: covered, reason: covered ? "covered" : "thin", ...cov };
}
