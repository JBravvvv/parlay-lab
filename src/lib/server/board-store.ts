import { gunzipSync, gzipSync } from "node:zlib";
import type { BoardData } from "@/engine";

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
 * Encoding: gzip → base64. A 15-game board measures ~517KB raw and ~59KB gzipped
 * (JSON of repeated keys compresses ~9:1), so the stored value is ~80KB — far under
 * any per-key ceiling, and small enough that a fat slate can't creep up on it. The
 * route decompresses before responding, so the client sees ordinary JSON and gains
 * no new failure mode.
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

export type SkipCheck = {
  skip: boolean;
  reason: "no-board" | "no-games-left" | "covered" | "thin";
  live: number; // games not yet started
  confirmed: number; // ...of those, with both lineups posted when the board was built
  pct: number;
};

export function liveCoverage(board: StoredBoard | null, now: number): SkipCheck {
  if (!board) return { skip: false, reason: "no-board", live: 0, confirmed: 0, pct: 0 };
  const gi = (board.data?.gameInfo ?? {}) as Record<string, { start?: string | null; lu?: boolean }>;
  const upcoming = Object.values(gi).filter((g) => {
    const t = g?.start ? Date.parse(g.start) : NaN;
    return isFinite(t) && t > now;
  });
  if (!upcoming.length) {
    // nothing left to price today — a fresh board would have nothing to add
    return { skip: true, reason: "no-games-left", live: 0, confirmed: 0, pct: 0 };
  }
  const confirmed = upcoming.filter((g) => g.lu === true).length;
  const pct = confirmed / upcoming.length;
  return {
    skip: pct >= SKIP_COVERAGE,
    reason: pct >= SKIP_COVERAGE ? "covered" : "thin",
    live: upcoming.length,
    confirmed,
    pct: Math.round(pct * 1000) / 1000,
  };
}
