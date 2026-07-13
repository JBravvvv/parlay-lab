import { describe, it, expect } from "vitest";
import {
  parseDerby,
  buildHitters,
  powerFromPriors,
  simDerby,
  simRound,
  makeRng,
  probOver,
  parseWinnerOdds,
  parseH2HOdds,
  parseTotalOdds,
  devigField,
  fairTwoWay,
  blendProb,
  evAtAmerican,
  quarterKelly,
  fairAmerican,
  matchHitter,
  lastName,
  type DerbyHitter,
} from "@/engine2/derby";

/* ---- a statsapi-shaped fixture mirroring the real 2026 payload ---- */
const side = (id: number, name: string, seed: number, order: number, hr = 0) => ({
  player: { id, fullName: name },
  seed,
  order,
  numHomeRuns: hr,
  isComplete: false,
  isStarted: false,
  isWinner: false,
  topDerbyHitData: { totalDistance: 0 },
});

const FIXTURE = {
  info: { id: 839032, name: "2026 MLB Home Run Derby", eventDate: "2026-07-14T00:00:00Z", venue: { name: "Citizens Bank Park" } },
  status: { state: "Preview", currentRound: 1 },
  rounds: [
    {
      round: 1,
      type: "Pool",
      numBatters: 8,
      numberOfSwings: 20,
      matchups: [
        { topSeed: side(1001, "Kyle Schwarber", 1, 7), bottomSeed: side(1008, "Jac Caglianone", 8, 1) },
        { topSeed: side(1002, "Ben Rice", 2, 6), bottomSeed: side(1007, "Munetaka Murakami", 7, 5) },
        { topSeed: side(1003, "Junior Caminero", 3, 2), bottomSeed: side(1006, "Bryce Harper", 6, 4) },
        { topSeed: side(1004, "Jordan Walker", 4, 8), bottomSeed: side(1005, "Willson Contreras", 5, 3) },
      ],
    },
    { round: 2, type: "Bracket", numBatters: 4, numberOfSwings: 15, matchups: [] },
    { round: 3, type: "Bracket", numBatters: 2, numberOfSwings: 15, matchups: [] },
  ],
  players: [{ id: 1001, fullName: "Kyle Schwarber", currentAge: 33, currentTeam: { abbreviation: "PHI" } }],
};

const PRIORS: Record<string, { pa: number; barrel_pct: number; pct: Record<string, number> }> = {
  "1001": { pa: 414, barrel_pct: 19.4, pct: { brl_percent: 98, xiso: 97, exit_velocity: 96, hard_hit_percent: 96 } },
  "1002": { pa: 390, barrel_pct: 15.3, pct: { brl_percent: 92, xiso: 94, exit_velocity: 89, hard_hit_percent: 83 } },
  "1003": { pa: 411, barrel_pct: 13.6, pct: { brl_percent: 85, xiso: 89, exit_velocity: 95, hard_hit_percent: 93 } },
  "1004": { pa: 395, barrel_pct: 14.1, pct: { brl_percent: 87, xiso: 89, exit_velocity: 98, hard_hit_percent: 93 } },
  "1005": { pa: 364, barrel_pct: 14.3, pct: { brl_percent: 88, xiso: 96, exit_velocity: 74, hard_hit_percent: 79 } },
  "1006": { pa: 408, barrel_pct: 11.3, pct: { brl_percent: 72, xiso: 93, exit_velocity: 66, hard_hit_percent: 76 } },
  "1007": { pa: 259, barrel_pct: 20.0, pct: { brl_percent: 99, xiso: 98, exit_velocity: 98, hard_hit_percent: 99 } },
  "1008": { pa: 349, barrel_pct: 14.7, pct: { brl_percent: 89, xiso: 85, exit_velocity: 95, hard_hit_percent: 98 } },
};

function fixtureState() {
  const parsed = parseDerby(FIXTURE)!;
  const hitters = buildHitters(parsed.players, PRIORS);
  return { ...parsed, hitters };
}

describe("derby bracket parse", () => {
  it("reads rounds, swing counts, pairs, and players", () => {
    const p = parseDerby(FIXTURE)!;
    expect(p.id).toBe(839032);
    expect(p.venue).toBe("Citizens Bank Park");
    expect(p.rounds.map((r) => r.swings)).toEqual([20, 15, 15]);
    expect(p.rounds[0].type).toBe("Pool");
    expect(p.players).toHaveLength(8);
    expect(p.pairs).toHaveLength(4);
    expect(p.pairs[0]).toEqual([1001, 1008]);
    // team metadata joined from the players array when present
    expect(p.players.find((x) => x.id === 1001)?.team).toBe("PHI");
  });

  it("returns null on junk", () => {
    expect(parseDerby(null)).toBeNull();
    expect(parseDerby({})).toBeNull();
    expect(parseDerby({ rounds: [] })).toBeNull();
  });
});

describe("power model", () => {
  it("higher percentiles → higher HR/swing, missing priors → neutral", () => {
    const elite = powerFromPriors(PRIORS["1007"]);
    const lesser = powerFromPriors(PRIORS["1006"]);
    expect(elite.hrPerSwing).toBeGreaterThan(lesser.hrPerSwing);
    const neutral = powerFromPriors(null);
    expect(neutral.powerFactor).toBe(1);
    expect(neutral.pctPower).toBeNull();
  });

  it("buildHitters sorts by seed and flags thin samples", () => {
    const hs = fixtureState().hitters;
    expect(hs.map((h) => h.seed)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(hs.every((h) => !h.thin)).toBe(true);
    const thin = buildHitters([{ id: 9, name: "X", seed: 9, order: null, team: null, age: null }], { "9": { pa: 40 } });
    expect(thin[0].thin).toBe(true);
  });
});

describe("round + tournament sim", () => {
  it("simRound respects the final-swing extension (mean > swings*p)", () => {
    const rng = makeRng(7);
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) sum += simRound(0.35, 20, rng);
    const mean = sum / n;
    expect(mean).toBeGreaterThan(20 * 0.35); // extension adds tail HRs
    expect(mean).toBeLessThan(20 * 0.35 + 1.5);
  });

  it("winner probs sum to 1, everyone alive, power ordering respected", () => {
    const st = fixtureState();
    const sim = simDerby(st, { n: 8000, seed: 42 });
    const wins = st.hitters.map((h) => sim.byId[h.id].win);
    expect(wins.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(Math.min(...wins)).toBeGreaterThan(0.02);
    // Murakami (99th pct blend) should out-win Harper (weakest blend)
    expect(sim.byId[1007].win).toBeGreaterThan(sim.byId[1006].win);
    // advance probs: 4 of 8 make it through
    const adv = st.hitters.map((h) => sim.byId[h.id].advanceR1);
    expect(adv.reduce((a, b) => a + b, 0)).toBeCloseTo(4, 6);
    // two finalists per tournament
    const fin = st.hitters.map((h) => sim.byId[h.id].reachFinal);
    expect(fin.reduce((a, b) => a + b, 0)).toBeCloseTo(2, 6);
  });

  it("H2H pair probs are coherent and deterministic under a seed", () => {
    const st = fixtureState();
    const a = simDerby(st, { n: 4000, seed: 9 });
    const b = simDerby(st, { n: 4000, seed: 9 });
    expect(a.pairs[0].pA).toBe(b.pairs[0].pA);
    for (const pr of a.pairs) expect(pr.pA + pr.pB + pr.pTie).toBeCloseTo(1, 6);
  });

  it("histograms integrate back to n and probOver handles pushes", () => {
    const st = fixtureState();
    const n = 3000;
    const sim = simDerby(st, { n, seed: 3 });
    const h = sim.byId[1001].r1Hist;
    expect(h.reduce((a, b) => a + b, 0)).toBe(n);
    const { over, under, push } = probOver(h, 6.5, n);
    expect(over + under).toBeCloseTo(1, 6);
    expect(push).toBe(0);
    const int = probOver(h, 7, n);
    expect(int.push).toBeGreaterThan(0);
    expect(int.over + int.under).toBeCloseTo(1, 6);
  });
});

describe("odds paste parsing", () => {
  const hitters = fixtureState().hitters as DerbyHitter[];

  it("winner lines with junk tolerated", () => {
    const txt = "Kyle Schwarber +330\nMurakami\t+500 BET\n\nCaminero +450\nnot a player +900";
    const { quotes, unmatched } = parseWinnerOdds(txt, hitters);
    expect(quotes).toEqual([
      { id: 1001, odds: 330 },
      { id: 1007, odds: 500 },
      { id: 1003, odds: 450 },
    ]);
    expect(unmatched).toEqual(["not a player +900"]);
  });

  it("H2H single-line and two-line forms", () => {
    const one = parseH2HOdds("Schwarber -140 Caglianone +120", hitters);
    expect(one.quotes).toEqual([{ aId: 1001, bId: 1008, aOdds: -140, bOdds: 120 }]);
    const two = parseH2HOdds("Ben Rice -115\nMurakami -105", hitters);
    expect(two.quotes).toEqual([{ aId: 1002, bId: 1007, aOdds: -115, bOdds: -105 }]);
  });

  it("totals: both sides on one line, single side on another", () => {
    const txt = "Schwarber Over 15.5 -115 Under 15.5 -105\nHarper o11.5 +100";
    const { quotes } = parseTotalOdds(txt, hitters);
    expect(quotes).toEqual([
      { id: 1001, line: 15.5, overOdds: -115, underOdds: -105 },
      { id: 1006, line: 11.5, overOdds: 100, underOdds: null },
    ]);
  });

  it("matchHitter needs uniqueness on last names", () => {
    expect(matchHitter("walker jersey", hitters)?.id).toBe(1004);
    expect(matchHitter("somebody else", hitters)).toBeNull();
  });

  it("lastName strips generational suffixes", () => {
    expect(lastName("Jazz Chisholm Jr.")).toBe("Chisholm");
    expect(lastName("Kyle Schwarber")).toBe("Schwarber");
    const withJr: DerbyHitter[] = [{ ...hitters[0], id: 2001, name: "Jazz Chisholm Jr." }];
    expect(matchHitter("Chisholm +800", withJr)?.id).toBe(2001);
  });
});

describe("market math", () => {
  it("devigField strips an 8-way overround to a fair field", () => {
    const quotes = [330, 450, 500, 700, 800, 900, 1000, 1200].map((odds, i) => ({ id: i, odds }));
    const fair = devigField(quotes);
    const s = [...fair.values()].reduce((a, b) => a + b, 0);
    expect(s).toBeCloseTo(1, 6);
    expect(fair.get(0)!).toBeGreaterThan(fair.get(7)!);
  });

  it("two-way fair, blend, EV, kelly", () => {
    const f = fairTwoWay(-115, -105)!;
    expect(f.a + f.b).toBeCloseTo(1, 6);
    expect(blendProb(0.4, 0.2)).toBeCloseTo(0.25, 10); // 25/75 model/market
    expect(blendProb(0.4, null)).toBe(0.4);
    expect(evAtAmerican(0.5, 100)).toBeCloseTo(0, 10);
    expect(evAtAmerican(0.55, 100)).toBeCloseTo(0.1, 10);
    expect(quarterKelly(0.55, 100, 750)).toBeCloseTo((0.1 / 4) * 750, 6);
    expect(quarterKelly(0.4, -200, 750)).toBe(0);
    expect(fairAmerican(0.25)).toBe(300);
    expect(fairAmerican(0.75)).toBe(-300);
  });
});
