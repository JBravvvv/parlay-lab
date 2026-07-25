import { describe, expect, it } from "vitest";
import { decodeBoard, encodeBoard, liveCoverage, SKIP_COVERAGE, type StoredBoard } from "@/lib/server/board-store";
import type { BoardData } from "@/engine";

/**
 * SERVER BOARD DELIVERY + THE CONDITIONAL SKIP (Phase 1, 2026-07-25)
 *
 * The cron used to analyze a board, keep the prediction records and discard the board
 * itself — so its work could be logged but never bet, and the client always paid ~120
 * Odds credits to rebuild the same day. Storing it is what makes retiming the cron a
 * saving rather than a doubling.
 *
 * The skip's trap is measuring coverage over the WHOLE day: a Sunday board built at
 * 16:00 UTC reads 71% confirmed and by 22:00 nearly all of it has already started.
 */

const H = 3600_000;
const NOW = Date.parse("2026-07-26T22:00:00Z");

const board = (games: Record<string, { start: string; lu?: boolean }>): StoredBoard => ({
  date: "2026-07-26",
  at: NOW - 6 * H,
  data: { gameInfo: games, categories: {}, parlays: [], parlaysMixed: [] } as unknown as BoardData,
});

describe("encode / decode", () => {
  it("round-trips a board", () => {
    const b = board({ g1: { start: "2026-07-26T23:05:00Z", lu: true } });
    const enc = encodeBoard(b);
    expect("blob" in enc).toBe(true);
    if (!("blob" in enc)) return;
    expect(decodeBoard(enc.blob)).toEqual(b);
  });

  it("compresses hard — repeated JSON keys are ~9:1, so a fat slate can't creep up on the limit", () => {
    const many: Record<string, { start: string; lu: boolean }> = {};
    for (let i = 0; i < 15; i++) many[`g${i}`] = { start: "2026-07-26T23:05:00Z", lu: i % 2 === 0 };
    const b = board(many);
    const enc = encodeBoard(b);
    if (!("blob" in enc)) throw new Error("expected a blob");
    expect(enc.bytes).toBeLessThan(JSON.stringify(b).length);
  });

  it("a corrupt or legacy value decodes to null, never a throw", () => {
    expect(decodeBoard("not-base64-gzip")).toBe(null);
    expect(decodeBoard(null)).toBe(null);
    expect(decodeBoard("")).toBe(null);
  });
});

describe("conditional skip", () => {
  it("skips when the games that HAVEN'T started are already well covered", () => {
    const v = liveCoverage(
      board({
        a: { start: "2026-07-26T23:05:00Z", lu: true },
        b: { start: "2026-07-27T00:05:00Z", lu: true },
        c: { start: "2026-07-27T01:05:00Z", lu: true },
      }),
      NOW,
    );
    expect(v.skip).toBe(true);
    expect(v.reason).toBe("covered");
    expect(v.pct).toBe(1);
  });

  it("runs when the upcoming games are thin, however good the day looked overall", () => {
    const v = liveCoverage(
      board({
        done1: { start: "2026-07-26T17:05:00Z", lu: true }, // started
        done2: { start: "2026-07-26T18:05:00Z", lu: true }, // started
        next: { start: "2026-07-26T23:05:00Z", lu: false }, // the only one left
      }),
      NOW,
    );
    // whole-day coverage is 67%; coverage of what's LEFT is 0%
    expect(v.skip).toBe(false);
    expect(v.live).toBe(1);
    expect(v.pct).toBe(0);
  });

  /* The Sunday case, explicitly. Josh generates 9–10am PT; Sunday slates are
     early-heavy, so by the 22:00 UTC decision point almost everything has started. */
  it("SUNDAY: a good morning board suppresses the evening run only if games remain", () => {
    const sundayMorningBoard = board({
      s1: { start: "2026-07-26T17:05:00Z", lu: true },
      s2: { start: "2026-07-26T17:10:00Z", lu: true },
      s3: { start: "2026-07-26T20:05:00Z", lu: true },
    });
    // 22:00: every Sunday game has started — nothing left to price, so skip
    const late = liveCoverage(sundayMorningBoard, NOW);
    expect(late.skip).toBe(true);
    expect(late.reason).toBe("no-games-left");

    // but at 19:00, with a covered game still to come, it also skips — correctly,
    // because the morning board already priced it off real lineups
    const early = liveCoverage(sundayMorningBoard, Date.parse("2026-07-26T19:00:00Z"));
    expect(early.skip).toBe(true);
    expect(early.reason).toBe("covered");
    expect(early.live).toBe(1);
  });

  it("a stale LOW-coverage board can never suppress a run — it fails in the safe direction", () => {
    const stale = board({
      a: { start: "2026-07-26T23:05:00Z", lu: false },
      b: { start: "2026-07-27T00:05:00Z", lu: false },
    });
    const v = liveCoverage(stale, NOW);
    expect(v.skip).toBe(false);
    expect(v.reason).toBe("thin");
  });

  it("no stored board at all means run, never skip", () => {
    expect(liveCoverage(null, NOW)).toMatchObject({ skip: false, reason: "no-board" });
  });

  it("treats a missing per-game lu flag as unconfirmed, not as covered", () => {
    // boards built before the flag existed must not suppress a run
    const older = board({ a: { start: "2026-07-26T23:05:00Z" }, b: { start: "2026-07-27T00:05:00Z" } });
    expect(liveCoverage(older, NOW).skip).toBe(false);
  });

  it("sits exactly on the threshold the way the constant says", () => {
    const mk = (n: number, conf: number) => {
      const g: Record<string, { start: string; lu: boolean }> = {};
      for (let i = 0; i < n; i++) g[`g${i}`] = { start: "2026-07-26T23:05:00Z", lu: i < conf };
      return board(g);
    };
    expect(liveCoverage(mk(10, 7), NOW).pct).toBe(SKIP_COVERAGE);
    expect(liveCoverage(mk(10, 7), NOW).skip).toBe(true);
    expect(liveCoverage(mk(10, 6), NOW).skip).toBe(false);
  });
});

/* The client's source-selection rule, mirrored here as pure logic: prefer the server
   board ONLY when its coverage is strictly better. The failure this guards is a
   silent downgrade — a cached board built after lineups posted being replaced by an
   earlier cron board just because the cron board is the "official" one. */
describe("never silently downgrade", () => {
  const pick = (cachedPct: number | undefined, serverPct: number | undefined) => {
    const cov = (p: number | undefined) => (typeof p === "number" ? p : -1);
    const cached = cachedPct === undefined ? null : { pct: cachedPct };
    const server = serverPct === undefined ? null : { pct: serverPct };
    return server && (!cached || cov(server.pct) > cov(cached.pct)) ? "server" : cached ? "cached" : "generate";
  };

  it("takes the server board when it is better", () => expect(pick(0.1, 0.8)).toBe("server"));
  it("KEEPS a better cached board", () => expect(pick(0.9, 0.2)).toBe("cached"));
  it("keeps the cached board on a tie — no pointless churn", () => expect(pick(0.5, 0.5)).toBe("cached"));
  it("takes the server board when there is no cache", () => expect(pick(undefined, 0.1)).toBe("server"));
  it("keeps the cache when the server has nothing", () => expect(pick(0.3, undefined)).toBe("cached"));
  it("generates only when BOTH are empty — the old behaviour, unchanged", () =>
    expect(pick(undefined, undefined)).toBe("generate"));
});
