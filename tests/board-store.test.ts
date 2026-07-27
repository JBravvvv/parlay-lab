import { describe, expect, it } from "vitest";
import { decodeBoard, encodeBoard, liveCoverage, MIN_ACHIEVABLE, SKIP_COVERAGE, type StoredBoard } from "@/lib/server/board-store";
import type { BoardData } from "@/engine";
import { achievableCoverage, liveCoverageOf, pricedGames } from "@/lib/board-coverage";
import { MAX_GENS_PER_DATE, bestGen, mergeGenIndex, type GenIndexEntry } from "@/lib/server/board-store";

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

  /* THE SECOND SUNDAY PASS (2026-07-26). Sunday splits: an afternoon bulk and one
     national night game 5h45m later. The 17:00Z entry serves the bulk; the 22:30Z entry
     exists ONLY for the night game, which carried 11 of 17 closed-form H+R+RBI rows —
     65% of the ladder-defect exposure (docs/hrr-recalibration.md).

     achievableCoverage divided `ready` by the WHOLE DAY's games, so at 22:30 the one
     remaining game scored 1/15 = 0.067 and the pass was refused as "low-ceiling" — the
     guard against a mis-scheduled cron firing on a slate it cannot reach. The denominator
     is the bug: this is exactly the whole-day-denominator failure board-coverage.ts's own
     header warns about for luCoverage.pct, left unfixed one function below it. */
  const SUNDAY = [
    Date.parse("2026-07-26T16:15:00Z"),
    ...[0, 1, 2].map(() => Date.parse("2026-07-26T17:35:00Z")),
    ...[0, 1, 2].map(() => Date.parse("2026-07-26T17:40:00Z")),
    ...[0, 1, 2].map(() => Date.parse("2026-07-26T18:10:00Z")),
    Date.parse("2026-07-26T18:15:00Z"),
    Date.parse("2026-07-26T18:35:00Z"),
    Date.parse("2026-07-26T20:05:00Z"),
    Date.parse("2026-07-26T23:20:00Z"), // Sunday Night Baseball
  ];
  const sun = (h: number, m = 0) =>
    Date.parse(`2026-07-26T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);

  it("the 22:30 Sunday pass is NOT refused: the ceiling is over games still bettable", () => {
    // one game left (23:20), and it is past its lineup window -> the pass can reach 100%
    expect(achievableCoverage(SUNDAY, sun(22, 30))).toBe(1);
    expect(achievableCoverage(SUNDAY, sun(22, 30))).toBeGreaterThan(MIN_ACHIEVABLE);
    expect(liveCoverage(null, sun(22, 30), SUNDAY).skip).toBe(false);
  });

  it("...and the 17:00 board does not suppress it — the night game is unconfirmed", () => {
    // the 17:00 board covers the afternoon; at 22:30 those are started and excluded,
    // leaving one unstarted game whose lineup was NOT posted when that board was built
    const b = board({
      bulk: { start: "2026-07-26T17:35:00Z", lu: true },
      night: { start: "2026-07-26T23:20:00Z", lu: false },
    });
    const v = liveCoverage(b, sun(22, 30), SUNDAY);
    expect(v.live).toBe(1);
    expect(v.confirmed).toBe(0);
    expect(v.skip).toBe(false);
    expect(v.reason).toBe("thin");
  });

  it("the guard it was protecting still fires: a 16:00 Monday reaches almost nothing", () => {
    expect(achievableCoverage(MONDAY, at(16))).toBeLessThan(MIN_ACHIEVABLE);
    expect(liveCoverage(null, at(16), MONDAY).reason).toBe("low-ceiling");
  });

  it("and a dead Sunday slate is still dead, not 100%", () => {
    expect(achievableCoverage(SUNDAY, Date.parse("2026-07-27T04:00:00Z"))).toBe(0);
    expect(liveCoverage(null, Date.parse("2026-07-27T04:00:00Z"), SUNDAY).reason).toBe("dead-slate");
  });
});

/**
 * NON-DESTRUCTIVE BOARD STORE (2026-07-26).
 *
 * `/api/generate` used an unconditional SET, so a later pass replaced an earlier one
 * permanently. The Sunday 22:30 entry reaches ~1 unstarted game, so it would have
 * overwritten a 15-game board with a 1-game board — discarding captured data, which this
 * project has already ruled is strictly worse than failing to capture it. Not hypothetical:
 * the 2.28 decomposition, the pitcher_outs audit, the H+R+RBI ladder test and the
 * sim-coverage measurement all came off persisted boards.
 */
describe("board generations are kept, not overwritten", () => {
  const g = (at: number, priced: number): GenIndexEntry => ({ at, priced, live: priced, luPct: 1, bytes: 1 });

  it("de-dupes by `at` so a retry cannot double-count a generation", () => {
    const idx = mergeGenIndex(mergeGenIndex([], g(100, 15)), g(100, 15));
    expect(idx.length).toBe(1);
  });

  it("keeps newest first and caps the retained set", () => {
    let idx: GenIndexEntry[] = [];
    for (let i = 1; i <= MAX_GENS_PER_DATE + 3; i++) idx = mergeGenIndex(idx, g(i * 100, i));
    expect(idx.length).toBe(MAX_GENS_PER_DATE);
    expect(idx[0].at).toBeGreaterThan(idx[idx.length - 1].at); // newest first
    expect(idx.some((e) => e.at === 100)).toBe(false); // oldest dropped
  });

  it("BEST is the most complete board, NOT the latest — the whole point", () => {
    // the real Sunday shape: a fat 17:00 pass, then a thin 22:30 one
    const idx = mergeGenIndex(mergeGenIndex([], g(1700, 15)), g(2230, 1));
    expect(idx[0].at).toBe(2230); // latest
    expect(bestGen(idx)!.at).toBe(1700); // most priced
    expect(bestGen(idx)!.priced).toBe(15);
  });

  it("ties go to the later pass — same coverage, fresher prices", () => {
    const idx = mergeGenIndex(mergeGenIndex([], g(1700, 12)), g(2200, 12));
    expect(bestGen(idx)!.at).toBe(2200);
  });

  it("an empty index has no best, and never throws", () => {
    expect(bestGen([])).toBe(null);
  });

  /* EVICTION IS BY RANK, NOT BY AGE. A plain slice() would drop the oldest, and on a
     Sunday the oldest is the FAT 17:00 pass — the one bestGen exists to return. Thin late
     passes accumulating would then delete exactly what the non-destructive store protects,
     while the index still looked healthy. */
  it("the FAT oldest generation survives any number of thin later ones", () => {
    let idx: GenIndexEntry[] = [g(1, 99)]; // fattest board, oldest
    for (let i = 2; i <= MAX_GENS_PER_DATE + 8; i++) idx = mergeGenIndex(idx, g(i * 10, 1));
    expect(idx.length).toBe(MAX_GENS_PER_DATE);
    expect(idx.some((e) => e.at === 1)).toBe(true); // NOT evicted
    expect(bestGen(idx)!.priced).toBe(99); // and still the best
  });

  it("the LATEST is never evicted either — it is what /api/board serves", () => {
    let idx: GenIndexEntry[] = [g(1, 99)];
    for (let i = 2; i <= MAX_GENS_PER_DATE + 8; i++) idx = mergeGenIndex(idx, g(i * 10, 1));
    const newest = Math.max(...idx.map((e) => e.at));
    expect(idx[0].at).toBe(newest);
  });

  it("eviction drops the lowest bettable count first, oldest breaking the tie", () => {
    // fill to the cap with a clear ranking, then push one more
    let idx: GenIndexEntry[] = [];
    for (const [at, priced] of [[10, 9], [20, 2], [30, 8], [40, 3], [50, 7], [60, 6]] as const) {
      idx = mergeGenIndex(idx, g(at, priced));
    }
    expect(idx.length).toBe(MAX_GENS_PER_DATE);
    idx = mergeGenIndex(idx, g(70, 5)); // over cap -> evict
    expect(idx.length).toBe(MAX_GENS_PER_DATE);
    expect(idx.some((e) => e.at === 20)).toBe(false); // priced 2, the weakest
    expect(idx.some((e) => e.at === 10)).toBe(true); // priced 9 = best, protected
    expect(idx.some((e) => e.at === 70)).toBe(true); // latest, protected
  });

  /* `priced` is computed at each generation's OWN gen.at (pricedGames filters to games
     unstarted at that moment), so a pass that fires four hours late scores only what was
     still bettable when IT ran. Verified on the real 2026-07-26 board: it scores 14 of 15
     — the live game is excluded from its own count — and the same rows fired at 20:00
     would have scored 2. The guard is structural; this pins it so a later refactor cannot
     pass Date.now() instead. */
  it("a late generation cannot out-rank a punctual one on raw game count", () => {
    const punctual = g(1000, 14); // 14 still bettable when it ran
    const late = g(9000, 2); //  same slate, 4h later: only 2 still bettable
    const idx = mergeGenIndex(mergeGenIndex([], punctual), late);
    expect(bestGen(idx)!.at).toBe(1000);
    expect(idx[0].at).toBe(9000); // ...and it is still the latest, for betting
  });
});
