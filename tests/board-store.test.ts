import { describe, expect, it } from "vitest";
import { decodeBoard, encodeBoard, liveCoverage, MIN_ACHIEVABLE, SKIP_COVERAGE, type StoredBoard } from "@/lib/server/board-store";
import type { BoardData } from "@/engine";
import { achievableCoverage, liveCoverageOf, pricedGames } from "@/lib/board-coverage";

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

/* Josh's item 2: retiming the cron to 22:00 deletes the 16:00 board, so on Sundays
   the store can be EMPTY at decision time. Empty used to mean "run" — ~120 credits
   on a slate that finished hours ago. The schedule is consulted independently, and
   it is keyless and free, so the emptiest case is also the cheapest to answer. */
describe("empty store (the Sunday case after retiming)", () => {
  const SUN_STARTS = [
    Date.parse("2026-07-26T17:05:00Z"),
    Date.parse("2026-07-26T17:10:00Z"),
    Date.parse("2026-07-26T20:05:00Z"),
  ];

  it("NO board and every game already started → skip, not a wasted run", () => {
    const v = liveCoverage(null, NOW, SUN_STARTS); // NOW = 22:00 UTC
    expect(v.skip).toBe(true);
    expect(v.reason).toBe("dead-slate");
  });

  it("NO board but games still to come → runs, which is the whole point", () => {
    const v = liveCoverage(null, Date.parse("2026-07-26T16:00:00Z"), SUN_STARTS);
    expect(v.skip).toBe(false);
    expect(v.reason).toBe("no-board");
  });

  it("a dead slate skips even when a stored board looks fine", () => {
    const b = board({ a: { start: "2026-07-26T17:05:00Z", lu: true } });
    expect(liveCoverage(b, NOW, SUN_STARTS).reason).toBe("dead-slate");
  });

  it("no schedule available degrades to the previous behaviour, never to a false skip", () => {
    expect(liveCoverage(null, NOW, []).skip).toBe(false);
    expect(liveCoverage(null, NOW, undefined).skip).toBe(false);
  });
});

describe("live coverage basis (shared by the skip AND the board picker)", () => {
  it("a board that predates the lu flag reports UNKNOWN, not 0%", () => {
    const older = liveCoverageOf({ a: { start: "2026-07-26T23:05:00Z" } }, NOW);
    expect(older.known).toBe(false);
    expect(older.pct).toBe(0); // and the caller maps unknown → -1, losing every comparison
  });

  it("distinguishes 'none confirmed' from 'no data'", () => {
    const none = liveCoverageOf({ a: { start: "2026-07-26T23:05:00Z", lu: false } }, NOW);
    expect(none.known).toBe(true);
    expect(none.pct).toBe(0);
  });

  it("counts only unstarted games — the whole-day number would say 100% here", () => {
    const cov = liveCoverageOf(
      {
        past: { start: "2026-07-26T17:05:00Z", lu: true },
        next: { start: "2026-07-26T23:05:00Z", lu: false },
      },
      NOW,
    );
    expect(cov.live).toBe(1);
    expect(cov.pct).toBe(0);
  });
});

/* COMPLETENESS (Josh, 2026-07-25). Coverage is computed from the SCHEDULE, so it is
   blind to whether a game carries odds at all — a board that lost a quarter of the
   slate still scores 82%. That is what the calendar-day filter did to every server
   board for a week, and a mid-chain API failure or an unposted market produces the
   identical shape with no timezone bug involved. */
describe("completeness beats coverage", () => {
  const gi = (n: number) =>
    Object.fromEntries(
      Array.from({ length: n }, (_, i) => [`g${i}`, { start: "2026-07-26T23:05:00Z", lu: true }]),
    );
  const cats = (n: number) => ({ ml: Array.from({ length: n }, (_, i) => ({ gkey: `g${i}` })) });

  it("counts distinct UNSTARTED games that actually carry priced rows", () => {
    const games = { a: { start: "2026-07-26T17:00:00Z" }, b: { start: "2026-07-26T23:05:00Z" } };
    // 'a' has started; a row for it must not count toward completeness
    expect(pricedGames({ ml: [{ gkey: "a" }, { gkey: "b" }] }, games, NOW)).toBe(1);
  });

  it("does not double-count a game priced in several markets", () => {
    const games = { a: { start: "2026-07-26T23:05:00Z" } };
    expect(pricedGames({ ml: [{ gkey: "a" }], rl: [{ gkey: "a" }], batter_hits: [{ gkey: "a" }] }, games, NOW)).toBe(1);
  });

  it("THE CASE: an incomplete 82%-coverage server board must LOSE to a complete client board", () => {
    // server: 15 scheduled, all lineups posted (82%+ coverage) — but only 11 priced
    const server = { priced: pricedGames(cats(11), gi(15), NOW), cov: 1 };
    // client: same slate, lower lineup coverage, but every game priced
    const client = { priced: pricedGames(cats(15), gi(15), NOW), cov: 0.4 };
    expect(server.cov).toBeGreaterThan(client.cov); // coverage would pick the server board
    const pick = server.priced > client.priced ? "server" : server.priced === client.priced && server.cov > client.cov ? "server" : "client";
    expect(pick).toBe("client"); // completeness decides first
  });

  it("with equal completeness, coverage decides — then freshness", () => {
    const a = pricedGames(cats(15), gi(15), NOW);
    const b = pricedGames(cats(15), gi(15), NOW);
    expect(a).toBe(b);
    const byCov = 0.9 > 0.3 ? "server" : "client";
    expect(byCov).toBe("server");
  });

  it("a board with no categories at all prices nothing", () => {
    expect(pricedGames({}, gi(15), NOW)).toBe(0);
    expect(pricedGames(null, gi(15), NOW)).toBe(0);
  });
});

/* COVERAGE FLOOR (Josh, 2026-07-25): independent of whether the day-of-week split is
   right, a pass at a badly chosen hour cannot do useful work — a 16:00 UTC run on a
   Monday reaches ~1% of the slate because nothing is posted yet. Asked from the
   schedule alone, before any spend. */
describe("coverage floor", () => {
  const day = "2026-07-27"; // a Monday
  const at = (h: number, m = 0) => Date.parse(`${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
  const MONDAY = [at(23, 5), at(23, 10), at(23, 40), Date.parse("2026-07-28T00:05:00Z"), Date.parse("2026-07-28T02:10:00Z")];

  it("skips a pass whose ceiling is under the floor, whatever the engine could do", () => {
    const v = liveCoverage(null, at(16), MONDAY); // 16:00 Monday: nothing posted yet
    expect(v.skip).toBe(true);
    expect(v.reason).toBe("low-ceiling");
  });

  it("runs once the lineup windows have opened", () => {
    const v = liveCoverage(null, at(21), MONDAY); // 3 of 5 games inside their window
    expect(v.skip).toBe(false);
    expect(v.reason).toBe("no-board");
  });

  it("the floor is checked BEFORE any board, so it holds with a board present too", () => {
    const b = board({ a: { start: "2026-07-27T23:05:00Z", lu: false } });
    expect(liveCoverage(b, at(16), MONDAY).reason).toBe("low-ceiling");
  });

  it("dead slate still wins over low ceiling — both skip, the reason stays honest", () => {
    expect(liveCoverage(null, Date.parse("2026-07-28T05:00:00Z"), MONDAY).reason).toBe("dead-slate");
  });

  it("achievableCoverage is a pure schedule read: no board, no odds call, no credits", () => {
    expect(achievableCoverage(MONDAY, at(16))).toBe(0);
    expect(achievableCoverage(MONDAY, at(21))).toBeGreaterThan(MIN_ACHIEVABLE);
    expect(achievableCoverage([], at(21))).toBe(0);
  });
});
