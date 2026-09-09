import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { normCdf } from "@/lib/cfb/normal";
import { stripComments } from "./helpers/source";
import { CFB_MODEL, CFB_KEYS } from "@/lib/cfb/rules";
import { CFB_CTX_TTL, parseByAthlete } from "@/lib/cfb/props-context";
import {
  CFB_SEASON,
  addSeasonLeg,
  makeSeasonLeg,
  paceOf,
  parseAthleteMeta,
  parseSeasonTeams,
  poissonBinomial,
  priceSeasonLeg,
  priceSeasonParlay,
  projectPlayerStat,
  projectWinTotal,
  projectionFor,
  projectionInputs,
  seasonLedgerStats,
  seasonPlayersOf,
  seasonTicketPnl,
  statLineProb,
  winTotalProb,
  type SeasonPlayer,
  type SeasonTeam,
} from "@/lib/cfb/season";

/**
 * SEASON LAB — THE MODEL (INSTRUCTION 46, 2026-09-08). Every expected figure below is computed IN
 * the test from the stated constants (CFB_SEASON) and the normal CDF, never typed from memory:
 *   - the player projection on a fixed line (rate, remaining, projected, σ, P(over), EV, Kelly)
 *   - the small-sample shrink toward the positional prior (g < 4)
 *   - the team win total: Binomial on the FPI-implied per-game probability, MONOTONE in the line
 *   - the parlay: independent product, decimal product, the same-team flag + haircut
 *   - the FPI fixture → teams with ESPN's own record / projection columns (no fixed indexes)
 *   - the store: lock → localStorage("pl_cfb_season") → settle → rehydrate round-trip, never the
 *     CFB daily key
 *   - the route: ESPN-only, no Odds API, revalidate ≥ 3600
 */

const FPI = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests/fixtures/cfb/espn-fpi.json"), "utf8")) as unknown;

const simpson: SeasonPlayer = { slug: "ty-simpson", name: "Ty Simpson", teamId: "333", team: "Alabama Crimson Tide", teamAbbr: "ALA", pos: "QB", g: 5, stats: { pass_yds: 1357, pass_tds: 12 } };
const williams: SeasonPlayer = { slug: "ryan-williams", name: "Ryan Williams", teamId: "333", team: "Alabama Crimson Tide", teamAbbr: "ALA", pos: "WR", g: 5, stats: { rec_yds: 512, receptions: 31, rec_tds: 4 } };
const rookie: SeasonPlayer = { slug: "new-guy", name: "New Guy", teamId: "84", team: "Indiana Hoosiers", teamAbbr: "IND", pos: "QB", g: 2, stats: { pass_yds: 611 } };

describe("player projection — a fixed line, every number derived from the constants", () => {
  it("5 G / 271.4 per G / 12 games / proj 3,257 — and P(over) is the normal tail through σ = cv·rate·√remaining", () => {
    const p = projectPlayerStat(simpson, "pass_yds")!;
    expect(p.g).toBe(5);
    expect(p.rate).toBeCloseTo(1357 / 5, 9); // 271.4
    expect(p.shrunk).toBe(false);
    expect(p.rateUsed).toBeCloseTo(271.4, 9);
    expect(p.remaining).toBe(CFB_SEASON.regularSeasonGames - 5); // 7
    const projected = 1357 + 271.4 * 7; // 3256.8
    expect(p.projected).toBeCloseTo(projected, 6);
    const sigma = CFB_SEASON.cv.pass_yds * 271.4 * Math.sqrt(7);
    expect(p.sigma).toBeCloseTo(sigma, 6);
    expect(projectionInputs(p)).toBe("5 G / 271.4 per G / 12 games / proj 3,257");

    const line = 3250.5;
    const over = 1 - normCdf((line - projected) / sigma);
    const pr = statLineProb(p, line);
    expect(pr.over).toBeCloseTo(over, 9);
    expect(pr.under).toBeCloseTo(1 - over, 9);
    expect(pr.push).toBe(0);
    // the fair line is the median: P(over projected) = 0.5
    expect(statLineProb(p, projected).over).toBeCloseTo(0.5, 9);
  });
  it("prices a typed -110 with the repo's EV / ¼-Kelly helpers against the season Kelly bank", () => {
    const p = projectPlayerStat(simpson, "pass_yds")!;
    const priced = priceSeasonLeg(p, "over", 3250.5, -110)!;
    const dec = 1 + 100 / 110;
    expect(priced.dec).toBeCloseTo(dec, 9);
    const prob = statLineProb(p, 3250.5).over;
    expect(priced.prob).toBeCloseTo(prob, 9);
    expect(priced.evPct).toBeCloseTo(100 * (prob * (dec - 1) - (1 - prob)), 9);
    // ¼-Kelly: f = 0.25·(p·b − q)/b, capped at 2% of the $250 season bank, whole dollars
    const b = dec - 1;
    const f = 0.25 * ((prob * b - (1 - prob)) / b);
    const kelly = f > 0 ? Math.round(Math.min(f, 0.02) * CFB_SEASON.kellyBank) : 0;
    expect(priced.kelly).toBe(kelly);
    expect(priced.side).toBe("over");
    // an under at the same line is the complement
    const under = priceSeasonLeg(p, "under", 3250.5, -110)!;
    expect(under.prob).toBeCloseTo(1 - prob, 9);
  });
  it("an integer line carries the continuity push, exactly as coverProb prices a game total", () => {
    const p = projectPlayerStat(simpson, "pass_yds")!;
    const pr = statLineProb(p, 3257);
    const hi = normCdf((3257 + 0.5 - p.projected) / p.sigma);
    const lo = normCdf((3257 - 0.5 - p.projected) / p.sigma);
    expect(pr.over).toBeCloseTo(1 - hi, 9);
    expect(pr.push).toBeCloseTo(hi - lo, 9);
    expect(pr.under).toBeCloseTo(lo, 9);
  });
  it("shrinks a 2-game rate halfway to the positional prior (w = g / shrinkGames)", () => {
    const p = projectPlayerStat(rookie, "pass_yds")!;
    expect(p.rate).toBeCloseTo(305.5, 9);
    expect(p.shrunk).toBe(true);
    const w = 2 / CFB_SEASON.shrinkGames; // 0.5
    const used = w * 305.5 + (1 - w) * CFB_SEASON.prior.pass_yds; // 267.75
    expect(p.rateUsed).toBeCloseTo(used, 9);
    expect(p.remaining).toBe(10);
    expect(p.projected).toBeCloseTo(611 + used * 10, 6);
    expect(projectionInputs(p)).toBe("2 G / 267.8 per G (shrunk from 305.5) / 12 games / proj 3,289");
  });
  it("a stat ESPN holds no total for, or a bad price, is null — never a guess", () => {
    expect(projectPlayerStat(simpson, "rec_yds")).toBeNull();
    expect(projectPlayerStat({ ...simpson, g: 0 }, "pass_yds")).toBeNull();
    const p = projectPlayerStat(simpson, "pass_yds")!;
    expect(priceSeasonLeg(p, "over", 3250.5, -50)).toBeNull();
    expect(priceSeasonLeg(p, "over", Number.NaN, -110)).toBeNull();
  });
  it("nothing left to play → σ 0 and the current total simply is or is not past the line", () => {
    const p = projectPlayerStat({ ...simpson, g: 12 }, "pass_yds")!;
    expect(p.remaining).toBe(0);
    expect(p.sigma).toBe(0);
    expect(statLineProb(p, 1300.5)).toEqual({ over: 1, under: 0, push: 0 });
    expect(statLineProb(p, 1400.5)).toEqual({ over: 0, under: 1, push: 0 });
  });
});

describe("team win totals — FPI through the slate's normal margin model, monotone in the line", () => {
  const team: SeasonTeam = { id: "194", name: "Ohio State Buckeyes", abbr: "OSU", fpi: 20, fpiRank: 1, wins: 2, losses: 0, ties: 0, espnProjW: 10.3, espnProjL: 2.3 };
  it("the live path is avg-fpi: p per game = Φ((FPI − avg) / σ), remaining wins Binomial, projected = wins + n·p", () => {
    const pr = projectWinTotal(team, 0)!;
    expect(pr.path).toBe("avg-fpi");
    expect(pr.oppFpi).toBe(0);
    expect(pr.played).toBe(2);
    expect(pr.remaining).toBe(10);
    const p = normCdf(20 / CFB_MODEL.sigma);
    for (const x of pr.pGames) expect(x).toBeCloseTo(p, 12);
    expect(pr.projected).toBeCloseTo(2 + 10 * p, 9);
    // Binomial(10, p) from first principles
    const choose = (n: number, k: number) => {
      let r = 1;
      for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
      return r;
    };
    for (let k = 0; k <= 10; k++) expect(pr.dist[k]).toBeCloseTo(choose(10, k) * p ** k * (1 - p) ** (10 - k), 12);
    expect(pr.dist.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
  });
  it("P(over line) falls as the line rises; over + under + push = 1; an integer line pushes on exactly that win count", () => {
    const pr = projectWinTotal(team, 0)!;
    let prev = 1.01;
    for (const line of [2.5, 4.5, 6.5, 8.5, 9.5, 10.5, 11.5]) {
      const w = winTotalProb(pr, line);
      expect(w.over).toBeLessThan(prev);
      expect(w.push).toBe(0);
      expect(w.over + w.under).toBeCloseTo(1, 12);
      prev = w.over;
    }
    const w9 = winTotalProb(pr, 9);
    expect(w9.push).toBeCloseTo(pr.dist[7], 12); // 2 wins in hand + 7 more = 9
    expect(w9.over + w9.under + w9.push).toBeCloseTo(1, 12);
    // over 1.5 with 2 wins already banked is certain
    expect(winTotalProb(pr, 1.5).over).toBeCloseTo(1, 12);
  });
  it("a schedule path (per-opponent FPIs + site) runs a Poisson-binomial and says so", () => {
    const pr = projectWinTotal(team, 0, { opponents: [{ fpi: 25, home: true }, { fpi: -10, home: false }, { fpi: 5, home: null }] })!;
    expect(pr.path).toBe("schedule");
    expect(pr.remaining).toBe(3);
    const ps = [normCdf((20 - 25 + CFB_MODEL.hfa) / CFB_MODEL.sigma), normCdf((20 + 10 - CFB_MODEL.hfa) / CFB_MODEL.sigma), normCdf((20 - 5) / CFB_MODEL.sigma)];
    for (let i = 0; i < 3; i++) expect(pr.pGames[i]).toBeCloseTo(ps[i], 12);
    expect(pr.dist[0]).toBeCloseTo((1 - ps[0]) * (1 - ps[1]) * (1 - ps[2]), 12);
    expect(pr.dist[3]).toBeCloseTo(ps[0] * ps[1] * ps[2], 12);
    expect(poissonBinomial([])).toEqual([1]);
  });
  it("a team without FPI, or no average to price against, is null", () => {
    expect(projectWinTotal({ ...team, fpi: null }, 0)).toBeNull();
    expect(projectWinTotal(team, null)).toBeNull();
  });
  it("parses the real FPI fixture by column NAME: Ohio State 28.676 / #1 / 0-0 / ESPN proj 10.288–2.303; 138 teams; avg FPI is the mean", () => {
    const { teams, avgFpi, updated } = parseSeasonTeams(FPI);
    expect(teams).toHaveLength(138);
    const osu = teams.find((t) => t.id === "194")!;
    expect(osu).toMatchObject({ name: "Ohio State Buckeyes", abbr: "OSU", fpi: 28.676, fpiRank: 1, wins: 0, losses: 0, ties: 0, espnProjW: 10.288, espnProjL: 2.303 });
    expect(teams[0].id).toBe("194"); // sorted by FPI rank
    const rated = teams.filter((t) => t.fpi != null);
    expect(avgFpi).toBeCloseTo(rated.reduce((s, t) => s + (t.fpi as number), 0) / rated.length, 12);
    expect(typeof updated === "string" || updated === null).toBe(true);
    expect(parseSeasonTeams(null)).toEqual({ teams: [], avgFpi: null, updated: null });
  });
});

describe("parlays — independent product, same-team flag + haircut", () => {
  const simpsonProj = projectPlayerStat(simpson, "pass_yds")!;
  const williamsProj = projectPlayerStat(williams, "rec_yds")!;
  const rookieProj = projectPlayerStat(rookie, "pass_yds")!;
  const l1 = makeSeasonLeg(simpsonProj, priceSeasonLeg(simpsonProj, "over", 3250.5, -110)!);
  const l2 = makeSeasonLeg(williamsProj, priceSeasonLeg(williamsProj, "over", 1200.5, -115)!);
  const l3 = makeSeasonLeg(rookieProj, priceSeasonLeg(rookieProj, "over", 3300.5, +105)!, "DraftKings");
  it("two legs on different teams multiply straight through", () => {
    const p = priceSeasonParlay([l1, l3])!;
    expect(p.legs).toBe(2);
    expect(p.dec).toBeCloseTo(l1.dec * l3.dec, 12);
    expect(p.prob).toBeCloseTo(l1.prob * l3.prob, 12);
    expect(p.probAdj).toBeCloseTo(p.prob, 12);
    expect(p.haircut).toBe(1);
    expect(p.sameTeam).toEqual([]);
    expect(p.evPct).toBeCloseTo(100 * (p.prob * p.dec - 1), 9);
    expect(l3.book).toBe("DraftKings");
    expect(l1.book).toBe(CFB_SEASON.defaultBook);
  });
  it("two Alabama legs are flagged and the joint takes one haircut per pair", () => {
    const p = priceSeasonParlay([l1, l2, l3])!;
    expect(p.sameTeam).toEqual(["Alabama Crimson Tide"]);
    expect(p.haircut).toBeCloseTo(CFB_SEASON.sameTeamHaircut, 12);
    expect(p.probAdj).toBeCloseTo(l1.prob * l2.prob * l3.prob * CFB_SEASON.sameTeamHaircut, 12);
    expect(p.evPct).toBeCloseTo(100 * (p.probAdj * p.dec - 1), 9);
    expect(priceSeasonParlay([])).toBeNull();
  });
  it("the leg label / id carry the subject, stat, side and line; addSeasonLeg toggles and replaces per subject-stat", () => {
    expect(l1.id).toBe("ty-simpson|pass_yds|over|3250.5");
    expect(l1.label).toBe("Ty Simpson Pass Yds O 3,250.5");
    expect(l1.inputs).toBe("5 G / 271.4 per G / 12 games / proj 3,257");
    let slip = addSeasonLeg([], l1);
    expect(slip.map((l) => l.id)).toEqual([l1.id]);
    slip = addSeasonLeg(slip, l2);
    expect(slip).toHaveLength(2);
    // a new line on the same player-stat replaces the old one
    const l1b = makeSeasonLeg(simpsonProj, priceSeasonLeg(simpsonProj, "under", 3300.5, -105)!);
    slip = addSeasonLeg(slip, l1b);
    expect(slip.map((l) => l.id)).toEqual([l2.id, l1b.id]);
    // tapping the same leg again removes it
    expect(addSeasonLeg(slip, l1b).map((l) => l.id)).toEqual([l2.id]);
  });
  it("a team leg on a team parlay flags the same team as a player leg on it", () => {
    const team: SeasonTeam = { id: "333", name: "Alabama Crimson Tide", abbr: "ALA", fpi: 22, fpiRank: 3, wins: 1, losses: 1, ties: 0, espnProjW: null, espnProjL: null };
    const tp = projectWinTotal(team, 0)!;
    const tl = makeSeasonLeg(tp, priceSeasonLeg(tp, "over", 8.5, -120)!);
    expect(tl.id).toBe("team:333|wins|over|8.5");
    expect(tl.label).toBe("Alabama Crimson Tide wins O 8.5");
    expect(priceSeasonParlay([tl, l1])!.sameTeam).toEqual(["Alabama Crimson Tide"]);
  });
});

describe("pace — a locked leg against the latest projection", () => {
  it("player overs: cleared once the current total passes the line, else on pace / behind by the projection", () => {
    const proj = projectPlayerStat(simpson, "pass_yds")!; // current 1357, projected 3256.8
    expect(paceOf({ kind: "player", side: "over", line: 3250.5 }, proj)).toBe("on pace");
    expect(paceOf({ kind: "player", side: "over", line: 3300.5 }, proj)).toBe("behind");
    expect(paceOf({ kind: "player", side: "over", line: 1300.5 }, proj)).toBe("cleared");
    expect(paceOf({ kind: "player", side: "under", line: 3300.5 }, proj)).toBe("on pace");
    expect(paceOf({ kind: "player", side: "under", line: 3200.5 }, proj)).toBe("behind");
    expect(paceOf({ kind: "player", side: "over", line: 3250.5 }, null)).toBe("—");
  });
  it("win totals: dead when the maximum cannot reach the line, cleared when the line is already beaten", () => {
    const team: SeasonTeam = { id: "1", name: "Team", abbr: "T", fpi: 5, fpiRank: null, wins: 3, losses: 6, ties: 0, espnProjW: null, espnProjL: null };
    const pr = projectWinTotal(team, 0)!; // 3 remaining, max 6
    expect(paceOf({ kind: "team", side: "over", line: 6.5 }, pr)).toBe("dead");
    expect(paceOf({ kind: "team", side: "over", line: 2.5 }, pr)).toBe("cleared");
    expect(paceOf({ kind: "team", side: "under", line: 2.5 }, pr)).toBe("dead");
    expect(paceOf({ kind: "team", side: "under", line: 6.5 }, pr)).toBe("cleared");
    expect(["on pace", "behind"]).toContain(paceOf({ kind: "team", side: "over", line: 4.5 }, pr));
  });
  // fix round (2026-09-08): a finished season is graded, never "on pace"
  it("a finished season (0 games left) grades the leg: cleared if the line is beaten, else dead — a push is dead", () => {
    const done: SeasonTeam = { id: "2", name: "Done", abbr: "D", fpi: 5, fpiRank: null, wins: 8, losses: 4, ties: 0, espnProjW: null, espnProjL: null };
    const tp = projectWinTotal(done, 0)!;
    expect(tp.remaining).toBe(0);
    expect(paceOf({ kind: "team", side: "over", line: 7.5 }, tp)).toBe("cleared");
    expect(paceOf({ kind: "team", side: "over", line: 8.5 }, tp)).toBe("dead");
    expect(paceOf({ kind: "team", side: "under", line: 8.5 }, tp)).toBe("cleared");
    expect(paceOf({ kind: "team", side: "under", line: 7.5 }, tp)).toBe("dead");
    expect(paceOf({ kind: "team", side: "over", line: 8 }, tp)).toBe("dead");
    expect(paceOf({ kind: "team", side: "under", line: 8 }, tp)).toBe("dead");
    const pp = projectPlayerStat({ ...simpson, g: 12 }, "pass_yds", { remaining: 0 })!; // final 1357
    expect(pp.remaining).toBe(0);
    expect(paceOf({ kind: "player", side: "over", line: 1300.5 }, pp)).toBe("cleared");
    expect(paceOf({ kind: "player", side: "over", line: 1400.5 }, pp)).toBe("dead");
    expect(paceOf({ kind: "player", side: "under", line: 1400.5 }, pp)).toBe("cleared");
    expect(paceOf({ kind: "player", side: "under", line: 1300.5 }, pp)).toBe("dead");
    // never "on pace" / "behind" once nothing is left to play
    for (const side of ["over", "under"] as const) for (const line of [1000.5, 1357, 2000.5]) expect(["cleared", "dead"]).toContain(paceOf({ kind: "player", side, line }, pp));
  });
  it("projectionFor finds the live projection by slug + stat or team id", () => {
    const feed = { players: [simpson], teams: [{ id: "194", name: "Ohio State Buckeyes", abbr: "OSU", fpi: 20, fpiRank: 1, wins: 2, losses: 0, ties: 0, espnProjW: null, espnProjL: null }], avgFpi: 0 };
    expect(projectionFor({ id: "ty-simpson|pass_yds|over|3250.5", kind: "player", stat: "pass_yds" }, feed)?.kind).toBe("player");
    expect(projectionFor({ id: "team:194|wins|over|8.5", kind: "team", stat: "wins" }, feed)?.kind).toBe("team");
    expect(projectionFor({ id: "nobody|pass_yds|over|1", kind: "player", stat: "pass_yds" }, feed)).toBeNull();
  });
});

describe("the feed join — ESPN's byathlete page → players with name / team / position", () => {
  const page = {
    categories: [
      { name: "general", names: ["gamesPlayed"] },
      { name: "passing", names: ["passingYards", "passingTouchdowns"] },
    ],
    athletes: [
      { athlete: { id: "1", displayName: "Ty Simpson", teamId: 333, teamName: "Alabama Crimson Tide", teamShortName: "ALA", position: { abbreviation: "QB" } }, categories: [{ name: "general", values: [5] }, { name: "passing", values: [1357, 12] }] },
      { athlete: { id: "2", displayName: "No Team", team: { id: "84", displayName: "Indiana Hoosiers", abbreviation: "IND" } }, categories: [{ name: "general", values: [3] }, { name: "passing", values: [400, 2] }] },
    ],
  };
  it("parseAthleteMeta reads flat or nested team fields; seasonPlayersOf joins by slug", () => {
    const meta = parseAthleteMeta(page);
    expect(meta.get("ty-simpson")).toEqual({ name: "Ty Simpson", teamId: "333", team: "Alabama Crimson Tide", teamAbbr: "ALA", pos: "QB" });
    expect(meta.get("no-team")).toEqual({ name: "No Team", teamId: "84", team: "Indiana Hoosiers", teamAbbr: "IND", pos: null });
    const players = seasonPlayersOf(parseByAthlete(page), meta);
    expect(players.map((p) => p.name)).toEqual(["No Team", "Ty Simpson"]);
    expect(players[1]).toMatchObject({ slug: "ty-simpson", g: 5, stats: { pass_yds: 1357, pass_tds: 12 }, teamId: "333", pos: "QB" });
    expect(seasonPlayersOf(null, meta)).toEqual([]);
  });
});

/* ---------- the store ---------- */

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  } as Storage;
}

describe("the season store — lock / settle / rehydrate on pl_cfb_season, never the daily key", () => {
  beforeEach(() => Object.defineProperty(globalThis, "localStorage", { value: memStorage(), configurable: true, writable: true }));
  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });
  it("round-trips a locked ticket through localStorage and settles it by hand", async () => {
    const { CFB_SEASON_KEY, clampSeasonStake, rehydrateSeasonStore, useSeasonStore } = await import("@/lib/cfb/season-store");
    expect(CFB_SEASON_KEY).toBe("pl_cfb_season");
    expect(CFB_SEASON_KEY).not.toBe(CFB_KEYS.ledger);
    rehydrateSeasonStore();
    const proj = projectPlayerStat(simpson, "pass_yds")!;
    const leg = makeSeasonLeg(proj, priceSeasonLeg(proj, "over", 3250.5, -110)!);
    expect(useSeasonStore.getState().lock([], 5)).toBeNull();
    const t = useSeasonStore.getState().lock([leg], 40, 1_700_000_000_000)!;
    expect(t.stake).toBe(CFB_SEASON.ticketMax); // clamped to the fun-money cap
    expect(t.result).toBe("open");
    expect(t.dec).toBeCloseTo(leg.dec, 12);
    expect(t.prob).toBeCloseTo(leg.prob, 12);
    expect(clampSeasonStake(0.4)).toBe(1);
    expect(clampSeasonStake(Number.NaN)).toBe(CFB_SEASON.ticketDefault);

    const raw = localStorage.getItem(CFB_SEASON_KEY);
    expect(raw).not.toBeNull();
    expect(localStorage.getItem(CFB_KEYS.ledger)).toBeNull();
    expect(JSON.parse(raw as string).state.tickets).toHaveLength(1);

    useSeasonStore.getState().settle(t.id, "won", 1_700_000_100_000);
    const won = useSeasonStore.getState().tickets[0];
    expect(won.result).toBe("won");
    expect(won.settledAt).toBe(1_700_000_100_000);
    expect(seasonTicketPnl(won)).toBeCloseTo(Math.round(25 * (leg.dec - 1) * 100) / 100, 9);
    expect(seasonLedgerStats(useSeasonStore.getState().tickets)).toMatchObject({ open: 0, won: 1, lost: 0, voided: 0, staked: 25 });

    // wipe the in-memory state (which persist also writes through), put the device record back,
    // rehydrate: the settled ticket comes back exactly as it was written
    const settledRaw = localStorage.getItem(CFB_SEASON_KEY) as string;
    useSeasonStore.setState({ tickets: [] });
    expect(JSON.parse(localStorage.getItem(CFB_SEASON_KEY) as string).state.tickets).toEqual([]);
    localStorage.setItem(CFB_SEASON_KEY, settledRaw);
    await useSeasonStore.persist.rehydrate();
    expect(useSeasonStore.getState().tickets[0]).toMatchObject({ id: t.id, result: "won", stake: 25 });

    useSeasonStore.getState().settle(t.id, "open");
    expect(useSeasonStore.getState().tickets[0].settledAt).toBeNull();
    useSeasonStore.getState().remove(t.id);
    expect(useSeasonStore.getState().tickets).toEqual([]);
  });
  it("drops non-ticket junk on the wire instead of crashing", async () => {
    const { CFB_SEASON_KEY, useSeasonStore } = await import("@/lib/cfb/season-store");
    localStorage.setItem(CFB_SEASON_KEY, JSON.stringify({ state: { tickets: [{ id: "x" }, 42, null] }, version: 1 }));
    await useSeasonStore.persist.rehydrate();
    expect(useSeasonStore.getState().tickets).toEqual([]);
  });
});

/* ---------- the route ---------- */

describe("the season route — ESPN only, an hour on the data cache, no Odds API", () => {
  // comments stripped: the route's doc comment is allowed to SAY it never touches the key
  const src = stripComments(fs.readFileSync(path.join(process.cwd(), "app/api/cfb/season/route.ts"), "utf8"));
  it("never names the Odds API key or host and revalidates at ≥ 3600 s", () => {
    expect(src).not.toMatch(/ODDS_API_KEY|the-odds-api|oddsPayload|CFB_ODDS_URL/);
    expect(src).toMatch(/revalidate: SEASON_ROUTE_TTL/);
    expect(src).toMatch(/\nconst SEASON_ROUTE_TTL = CFB_CTX_TTL/);
    expect(src).not.toMatch(/export const SEASON_ROUTE_TTL/);
  });
  it("GET assembles players from the three byathlete tables and teams from the FPI feed (fetch mocked)", async () => {
    const page = {
      categories: [
        { name: "general", names: ["gamesPlayed"] },
        { name: "rushing", names: ["rushingYards", "rushingTouchdowns"] },
      ],
      athletes: [{ athlete: { id: "9", displayName: "Jeremiyah Love", teamId: "87", teamName: "Notre Dame Fighting Irish", position: { abbreviation: "RB" } }, categories: [{ name: "general", values: [3] }, { name: "rushing", values: [312, 4] }] }],
    };
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("powerindex")) return new Response(JSON.stringify(FPI), { status: 200 });
      if (url.includes("byathlete")) return new Response(JSON.stringify(page), { status: 200 });
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { GET } = await import("../app/api/cfb/season/route");
      // the TTL is pinned by source scan above (not exported — Next forbids non-handler route exports)
      expect(CFB_CTX_TTL).toBeGreaterThanOrEqual(3600);
      const res = await GET();
      const body = (await res.json()) as { season: number; players: SeasonPlayer[]; teams: SeasonTeam[]; avgFpi: number | null };
      expect(body.season).toBe(2026);
      expect(body.teams).toHaveLength(138);
      expect(body.players).toHaveLength(1);
      expect(body.players[0]).toMatchObject({ slug: "jeremiyah-love", g: 3, stats: { rush_yds: 312, rush_tds: 4 }, teamId: "87", pos: "RB" });
      expect(body.avgFpi).not.toBeNull();
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.filter((u) => u.includes("byathlete"))).toHaveLength(3);
      expect(urls.filter((u) => u.includes("powerindex"))).toHaveLength(1);
      expect(urls.some((u) => u.includes("the-odds-api"))).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
