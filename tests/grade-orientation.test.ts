import { describe, expect, it } from "vitest";
import { fixtureEngine } from "./helpers/fixture-env";
import { gradePrediction, type GameStatus } from "@/engine2/grade";
import type { Engine } from "@/engine";

/* Ledger audit (2026-07-22): every settled ML/RL result re-verified against
   statsapi finals was CORRECT — the defect was the detail string, which printed
   the raw away-home score with no orientation. Both graders now render
   [bet team]-[opponent], pinned here on the two games from the audit:
     2026-07-18  NYM 1 @ PHI 6   (home team bet, home team won)
     2026-07-22  STL 1 @ LAA 0   (home team bet, home team lost) */

const PHI: GameStatus = { state: "Final", away: 1, home: 6 };
const LAA: GameStatus = { state: "Final", away: 1, home: 0 };

describe("gradePrediction — ML/RL score orientation (cloud grader)", () => {
  it("home-side bets: bet team's score first, result from the same mapping", () => {
    expect(gradePrediction("ml_home", "ML", PHI, null)).toEqual({ result: "won", detail: "6-1" });
    expect(gradePrediction("ml_home", "ML", LAA, null)).toEqual({ result: "lost", detail: "0-1" });
    expect(gradePrediction("rl_home", "RL -1.5", PHI, null)).toEqual({ result: "won", detail: "6-1" });
    expect(gradePrediction("rl_home", "RL +1.5", LAA, null)).toEqual({ result: "won", detail: "0-1" });
  });
  it("away-side bets: same rule from the other seat", () => {
    expect(gradePrediction("ml_away", "ML", PHI, null)).toEqual({ result: "lost", detail: "1-6" });
    expect(gradePrediction("ml_away", "ML", LAA, null)).toEqual({ result: "won", detail: "1-0" });
    expect(gradePrediction("rl_away", "RL +1.5", PHI, null)).toEqual({ result: "lost", detail: "1-6" });
    expect(gradePrediction("rl_away", "RL -1.5", LAA, null)).toEqual({ result: "lost", detail: "1-0" });
  });
});

describe("shGradeLeg — the in-app grader agrees, both sides", () => {
  const eng: Engine = fixtureEngine();
  const gradeLeg = eng.get<(l: unknown, e: unknown, b: unknown, s: unknown) => { result: string; detail: string }>("shGradeLeg");
  const entry = { games: { g1: { pk: 823441, start: "2026-07-18T20:05:00Z", away: "New York Mets", home: "Philadelphia Phillies" } } };
  const finals = { 823441: PHI };
  const leg = (lkey: string, prop: string) => ({ gkey: "g1", lkey, prop, label: "x" });

  it("ml_home won 6-1 / ml_away lost 1-6 on the same final", () => {
    expect(gradeLeg(leg("ml_home", "ML"), entry, {}, finals)).toEqual({ result: "won", detail: "6-1" });
    expect(gradeLeg(leg("ml_away", "ML"), entry, {}, finals)).toEqual({ result: "lost", detail: "1-6" });
  });
  it("run lines pick up the same orientation", () => {
    expect(gradeLeg(leg("rl_home", "RL -1.5", ), entry, {}, finals)).toEqual({ result: "won", detail: "6-1" });
    expect(gradeLeg(leg("rl_away", "RL +1.5"), entry, {}, finals)).toEqual({ result: "lost", detail: "1-6" });
  });
});

describe("shGradeOrientFix — one-time migration of stored v1 details", () => {
  it("flips home-side ML/RL strings once, stamps v2, never touches results or props", () => {
    const eng: Engine = fixtureEngine();
    const store = eng.get<{ set: (k: string, v: unknown) => void; get: (k: string, d: unknown) => unknown }>("LS");
    const day = {
      date: "2026-07-18",
      locked: true,
      lockedAt: 1,
      gradedAt: 2,
      daily: 10,
      fun: 0,
      bankroll: 100,
      games: {},
      core: [
        {
          id: "t1",
          stake: 5,
          name: "ML parlay",
          legs: [
            { label: "Philadelphia Phillies", prop: "ML", lkey: "ml_home", gkey: "g1" },
            { label: "Detroit Tigers", prop: "ML", lkey: "ml_away", gkey: "g2" },
            { label: "JJ Wetherholt (STL)", prop: "Hits O 0.5", lkey: "jjwetherholt|batter_hits|0.5", gkey: "g3" },
          ],
        },
      ],
      funT: [],
      grading: {
        done: true,
        tickets: { t1: { result: "won", payout: 9 } },
        legs: {
          "Philadelphia Phillies|ML": { result: "won", detail: "1-6" },
          "Detroit Tigers|ML": { result: "won", detail: "7-0" },
          "JJ Wetherholt (STL)|Hits O 0.5": { result: "won", detail: "2 H" },
        },
      },
    };
    store.set("pl_ledger", [day]);
    const n = eng.get<() => number>("shGradeOrientFix")();
    expect(n).toBe(1); // only the home-side score string needed flipping
    type Graded = typeof day & { grading: { v?: number } };
    const after = (store.get("pl_ledger", []) as Graded[])[0];
    expect(after.grading.v).toBe(2);
    expect(after.grading.legs["Philadelphia Phillies|ML"]).toEqual({ result: "won", detail: "6-1" });
    expect(after.grading.legs["Detroit Tigers|ML"]).toEqual({ result: "won", detail: "7-0" }); // away side already bet-first
    expect(after.grading.legs["JJ Wetherholt (STL)|Hits O 0.5"]).toEqual({ result: "won", detail: "2 H" });
    expect(after.grading.tickets.t1).toEqual({ result: "won", payout: 9 }); // results untouched
    // idempotent: a second pass changes nothing
    expect(eng.get<() => number>("shGradeOrientFix")()).toBe(0);
  });
});

/* Fix-file Phase 4: the complete settlement matrix, each named case explicit.
   (Several were already pinned above; this block makes every row of the fix
   file's matrix a first-class assertion on its own final.) */
describe("settlement matrix — every RL/ML case the fix file names", () => {
  const F = (away: number, home: number): GameStatus => ({ state: "Final", away, home });
  it("home team picked and wins", () => {
    expect(gradePrediction("ml_home", "ML", F(1, 6), null).result).toBe("won");
  });
  it("away team picked and wins", () => {
    expect(gradePrediction("ml_away", "ML", F(7, 0), null).result).toBe("won");
  });
  it("RL +1.5 covers via outright win", () => {
    expect(gradePrediction("rl_home", "RL +1.5", F(2, 3), null)).toEqual({ result: "won", detail: "3-2" });
    expect(gradePrediction("rl_away", "RL +1.5", F(5, 4), null)).toEqual({ result: "won", detail: "5-4" });
  });
  it("RL +1.5 covers via a 1-run loss", () => {
    expect(gradePrediction("rl_home", "RL +1.5", F(4, 3), null)).toEqual({ result: "won", detail: "3-4" });
    expect(gradePrediction("rl_away", "RL +1.5", F(2, 3), null)).toEqual({ result: "won", detail: "2-3" });
  });
  it("RL +1.5 fails by exactly 2, and by more", () => {
    expect(gradePrediction("rl_home", "RL +1.5", F(5, 3), null).result).toBe("lost");
    expect(gradePrediction("rl_away", "RL +1.5", F(1, 3), null).result).toBe("lost");
    expect(gradePrediction("rl_away", "RL +1.5", F(1, 6), null).result).toBe("lost");
  });
  it("RL -1.5 needs a 2+ run win; a 1-run win loses it", () => {
    expect(gradePrediction("rl_home", "RL -1.5", F(3, 4), null).result).toBe("lost");
    expect(gradePrediction("rl_home", "RL -1.5", F(3, 5), null).result).toBe("won");
  });
});
