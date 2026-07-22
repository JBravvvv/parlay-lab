import { describe, expect, it } from "vitest";
import { createEngine, type Engine } from "@/engine";

/* Live-state Monte Carlo (2026-07-21): shSimGames can RESUME an in-progress
   game — score, inning/half, outs, runners, next batter, starter status, and
   each player's real tally — and simulate only the remainder. Scenarios below
   are deterministic (all-out / all-HR batter vectors), so outcomes are exact. */

const stubFetch = () => Promise.resolve({ ok: false, body: {} });
function eng(): Engine {
  return createEngine({ fetchJson: stubFetch, today: "2026-07-21" });
}
type SimFn = (ctx: Record<string, unknown>, n: number, seed: number) => {
  pHome: number;
  avgHome: number;
  avgAway: number;
  pHomeM15: number;
  legP: Record<string, number>;
};

const OUT = [0, 0, 0, 0, 0]; // PA vector [BB,1B,2B,3B,HR]: (almost) always out
const HR = [0, 0, 0, 0, 1]; // always homers
const bat9 = (v: number[]) => Array.from({ length: 9 }, () => ({ vSP: v, vBP: v }));
const SP = { outs: 0, runs: 0, gone: false };

function ctx(awayV: number[], homeV: number[], init: Record<string, unknown> | null, legs: Record<string, unknown>[] = []) {
  return {
    away: { bat: bat9(awayV) },
    home: { bat: bat9(homeV) },
    awayLeash: 18,
    homeLeash: 18,
    legs: [{ key: "ml_home", type: "ml_home" }, ...legs],
    v2: null,
    init,
  };
}
const initAt = (o: Record<string, unknown>) => ({
  inn: 9, half: "bot", outs: 2, runsA: 0, runsH: 0, idxA: 0, idxH: 0,
  b1: -1, b2: -1, b3: -1, f5a: 0, f5h: 0, spAway: SP, spHome: SP, tallies: {},
  ...o,
});

describe("shSimGames — resumed mid-game states (deterministic)", () => {
  it("init at a fresh top-1st reproduces the no-init run exactly (same RNG stream)", () => {
    const run = eng().get<SimFn>("shSimGames");
    // mixed, realistic-ish vectors so outcomes vary between sims
    const V = [0.08, 0.15, 0.05, 0.005, 0.03];
    const a = run(ctx(V, V, null), 4000, 42);
    const b = run(
      ctx(V, V, initAt({ inn: 1, half: "top", outs: 0 })),
      4000,
      42,
    );
    expect(b.pHome).toBe(a.pHome);
    expect(b.avgHome).toBe(a.avgHome);
    expect(b.avgAway).toBe(a.avgAway);
  });

  it("bottom 9, two outs, home down 1, hitters who never reach → away wins every sim", () => {
    const run = eng().get<SimFn>("shSimGames");
    const r = run(ctx(OUT, OUT, initAt({ runsA: 3, runsH: 2 })), 2000, 7);
    expect(r.pHome).toBe(0);
  });

  it("bottom 9 tied, walk-off HR ends it at exactly one run — never a cover", () => {
    const run = eng().get<SimFn>("shSimGames");
    const r = run(ctx(OUT, HR, initAt({ runsA: 3, runsH: 3 })), 2000, 7);
    expect(r.pHome).toBe(1);
    expect(r.avgHome).toBe(4); // walk-off stops at +1, never piles on
    expect(r.pHomeM15).toBe(0); // wins, but NEVER by 2+
  });

  it("resumed runners score on the walk-off blast; the real score carries through", () => {
    const run = eng().get<SimFn>("shSimGames");
    const r = run(ctx(OUT, HR, initAt({ runsA: 5, runsH: 3, b1: 4, b2: 5 })), 1000, 7);
    // down 2 with two on: the first HR scores 3 → walk-off 6-5, every time
    expect(r.pHome).toBe(1);
    expect(r.avgHome).toBe(6);
    expect(r.avgAway).toBe(5);
  });

  it("a leg's real tally counts: line already cleared → 100%; out-machine never adds → 0%", () => {
    const run = eng().get<SimFn>("shSimGames");
    const legs = [
      { key: "done", team: "home", bat: 0, stat: "h", ln: 1.5, base: 2 },
      { key: "never", team: "home", bat: 0, stat: "h", ln: 1.5, base: 1 },
    ];
    const r = run(ctx(OUT, OUT, initAt({ runsA: 1, runsH: 0 }), legs), 1000, 7);
    expect(r.legP.done).toBe(1); // 2 hits already banked > 1.5, whatever happens
    expect(r.legP.never).toBe(0); // stuck at 1 — the sim never fabricates the 2nd
  });
});

describe("shLiveState — real statsapi payloads → resume state", () => {
  const linescore = {
    currentInning: 6,
    inningState: "Bottom",
    outs: 1,
    teams: { away: { runs: 2 }, home: { runs: 5 } },
    innings: [1, 2, 3, 4, 5].map((n) => ({ num: n, away: { runs: n === 3 ? 2 : 0 }, home: { runs: n === 1 ? 4 : 0 } })),
    offense: { batter: { id: 30 }, first: { id: 10 } },
    defense: { pitcher: { id: 99 } },
  };
  const player = (id: number, name: string, order: number | null, bat: Record<string, number> | null) => ({
    person: { id, fullName: name },
    ...(order != null ? { battingOrder: order } : {}),
    stats: { batting: bat ?? {}, pitching: {} },
  });
  const boxscore = {
    teams: {
      away: {
        players: {
          p10: player(10, "Away Guy", 100, { plateAppearances: 3, hits: 1, doubles: 0, triples: 0, homeRuns: 0, runs: 1, rbi: 0 }),
          p99: { person: { id: 99, fullName: "Away Starter" }, stats: { batting: {}, pitching: { gamesStarted: 1, outs: 16, earnedRuns: 5 } } },
        },
      },
      home: {
        players: {
          p30: player(30, "Home Star", 200, { plateAppearances: 2, hits: 2, doubles: 1, triples: 0, homeRuns: 1, runs: 2, rbi: 3 }),
        },
      },
    },
  };

  it("maps inning/half/outs/score, runners, next batter, starter outs and tallies", () => {
    const f = eng().get<(ls: unknown, bx: unknown) => Record<string, never> | null>("shLiveState");
    const st = f(linescore, boxscore)! as Record<string, unknown>;
    expect(st).toMatchObject({ inn: 6, half: "bot", outs: 1, runsA: 2, runsH: 5 });
    expect(st.idxH).toBe(1); // current batter id 30 bats 2nd (order 200)
    expect(st.b1).toBe(0); // runner id 10 isn't in the HOME order (bottom half) → previous-batter fallback (idx 0)
    // 2 H = 1 double (2 TB) + 1 HR (4 TB) → 6 total bases
    expect((st.tallies as Record<string, { h: number; tb: number }>).homestar).toMatchObject({ h: 2, tb: 6, hr: 1, r: 2, rbi: 3 });
    expect((st.spAway as { outs: number; gone: boolean })).toMatchObject({ outs: 16, gone: false });
    expect(st.f5a).toBe(2); // resumed past the 5th → real first-5 totals ride along
    expect(st.f5h).toBe(4);
  });

  it('"Middle" and "End" inning states normalize to the next clean half', () => {
    const f = eng().get<(ls: unknown, bx: unknown) => Record<string, unknown> | null>("shLiveState");
    const mid = f({ ...linescore, inningState: "Middle", outs: 2 }, boxscore)!;
    expect(mid).toMatchObject({ inn: 6, half: "bot", outs: 0 });
    const end = f({ ...linescore, inningState: "End", outs: 2 }, boxscore)!;
    expect(end).toMatchObject({ inn: 7, half: "top", outs: 0 });
  });

  it("missing linescore or boxscore → null, never a guessed state", () => {
    const f = eng().get<(ls: unknown, bx: unknown) => unknown>("shLiveState");
    expect(f(null, boxscore)).toBeNull();
    expect(f(linescore, null)).toBeNull();
    expect(f({ currentInning: 0 }, boxscore)).toBeNull();
  });
});
