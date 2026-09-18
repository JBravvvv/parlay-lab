import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildPool, GEN_MARKETS, type MlbHitSource } from "@/components/props/mlb-gen-pool";
import { generate, mixCandidates, poolCounts, specMarkets, specSeed, type GenSpec } from "@/lib/parlay-gen";
import { footballGenPool } from "@/lib/football/gen-pool";
import { hitKey, type PlayerLog } from "@/lib/prop-hit-rate";
import type { PropBoardGame } from "@/engine";
import { buildCfbBoard } from "@/lib/cfb/model";
import { parseEventProps } from "@/lib/cfb/props";
import type { CfbPropRow } from "@/lib/cfb/props-types";
import type { CfbGame } from "@/lib/cfb/types";
import { propLegOf, propQuote } from "@/components/cfb/CfbProps";
import { swapSettleBook } from "./helpers/settle-book";

/**
 * THE 2026-09-18 GENERATOR CONTROLS, on the same captured board tests/parlay-gen-ui.test.ts uses:
 * several categories on one ticket (with the spread rule), the hit-rate floor and the games
 * filter. Josh, verbatim: "The parlay generator needs significantly more customization."
 */
const root = path.resolve(__dirname, "..");
const FIXTURE = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/gen-pool.json"), "utf8")) as { propBoard: PropBoardGame[] };
const BOARD = FIXTURE.propBoard;
const DATE = "2026-07-10";

const base: GenSpec = {
  market: "batter_hits_runs_rbis",
  legs: 4,
  legMinAm: -400,
  legMaxAm: 400,
  payout: null,
  sides: "o",
  onePerGame: true,
  czOnly: false,
  includeStarted: false,
  modelOnly: false,
  pinned: [null, null, null, null],
};
const ok = (r: ReturnType<typeof generate>) => {
  expect(r.ok, JSON.stringify(r)).toBe(true);
  return (r as Extract<typeof r, { ok: true }>).ticket;
};
const fail = (r: ReturnType<typeof generate>) => {
  expect(r.ok).toBe(false);
  return (r as Extract<typeof r, { ok: false }>).fail;
};

describe("several categories on one ticket", () => {
  it("specMarkets: `markets` wins when set, else the one `market`", () => {
    expect(specMarkets({ market: "a" })).toEqual(["a"]);
    expect(specMarkets({ market: "a", markets: [] })).toEqual(["a"]);
    expect(specMarkets({ market: "a", markets: ["b", "a"] })).toEqual(["b", "a"]);
  });
  it("the single-category pool is byte-identical to before: `markets` of one entry changes nothing", () => {
    const one = buildPool(BOARD, base, 0);
    const same = buildPool(BOARD, { ...base, markets: ["batter_hits_runs_rbis"] }, 0);
    expect(same.legs.map((l) => l.id)).toEqual(one.legs.map((l) => l.id));
    expect(same.rows).toBe(one.rows);
    for (const l of one.legs) {
      expect(l.market).toBe("batter_hits_runs_rbis");
      expect(typeof l.line).toBe("number");
      expect(l.gameLabel).toBeTruthy();
      expect(l.hit).toBeUndefined(); // no hit source given → no hit stamped, no floor possible
    }
  });
  it("the union pool carries every selected category, each leg stamped with its own", () => {
    const spec = { ...base, markets: ["batter_hits_runs_rbis", "batter_hits", "pitcher_strikeouts"] };
    const pool = buildPool(BOARD, spec, 0);
    const per = (m: string) => buildPool(BOARD, { ...base, market: m }, 0);
    expect(pool.rows).toBe(per("batter_hits_runs_rbis").rows + per("batter_hits").rows + per("pitcher_strikeouts").rows);
    expect(new Set(pool.legs.map((l) => l.market))).toEqual(new Set(spec.markets));
    expect(pool.legs.length).toBe(per("batter_hits_runs_rbis").legs.length + per("batter_hits").legs.length + per("pitcher_strikeouts").legs.length);
  });
  it("spread (default on): every selected category lands on the ticket at least once", () => {
    const spec = { ...base, markets: ["batter_hits_runs_rbis", "batter_hits", "pitcher_strikeouts"] };
    const pool = buildPool(BOARD, spec, 0);
    for (let roll = 0; roll < 12; roll++) {
      const t = ok(generate(pool, spec, specSeed(spec, DATE, roll)));
      expect(t.legs).toHaveLength(4);
      expect(new Set(t.legs.map((l) => l.market))).toEqual(new Set(spec.markets));
      expect(new Set(t.legs.map((l) => l.playerKey)).size).toBe(4);
    }
  });
  it("spread off: the sampler may land any mix", () => {
    const spec = { ...base, markets: ["batter_hits_runs_rbis", "batter_home_runs"], spread: false, legs: 2 };
    const pool = buildPool(BOARD, spec, 0);
    const mixes = new Set<string>();
    for (let roll = 0; roll < 40; roll++) {
      const t = ok(generate(pool, spec, specSeed(spec, DATE, roll)));
      mixes.add([...new Set(t.legs.map((l) => l.market))].sort().join("+"));
    }
    expect(mixes.size).toBeGreaterThan(1); // at least one single-category ticket among forty spins
  });
  it("fewer legs than categories: covers as many as the legs allow, never fails for it", () => {
    const spec = { ...base, legs: 2, markets: ["batter_hits_runs_rbis", "batter_hits", "pitcher_strikeouts"] };
    const pool = buildPool(BOARD, spec, 0);
    const t = ok(generate(pool, spec, specSeed(spec, DATE, 1)));
    expect(new Set(t.legs.map((l) => l.market)).size).toBe(2);
  });
  it("the seed names the category set, the spread rule, the floor and the games — a different setup is a different spin", () => {
    const a = specSeed(base, DATE, 0);
    expect(specSeed({ ...base, markets: ["batter_hits_runs_rbis", "batter_hits"] }, DATE, 0)).not.toBe(a);
    expect(specSeed({ ...base, markets: ["batter_hits", "batter_hits_runs_rbis"] }, DATE, 0)).toBe(specSeed({ ...base, markets: ["batter_hits_runs_rbis", "batter_hits"] }, DATE, 0));
    expect(specSeed({ ...base, spread: false }, DATE, 0)).not.toBe(a);
    expect(specSeed({ ...base, minHit: 0.6 }, DATE, 0)).not.toBe(a);
    expect(specSeed({ ...base, games: ["x"] }, DATE, 0)).not.toBe(a);
    expect(specSeed({ ...base, markets: [] }, DATE, 0)).toBe(a);
  });
  it("football: the union pool works the same way, from the desk's own rows", () => {
    const FIX = path.join(root, "tests", "fixtures", "cfb");
    const readJson = (f: string) => swapSettleBook(JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8")));
    const ESPN = readJson("espn-scoreboard-2026-09-05.json") as { events: unknown[] };
    const NOW = Date.parse("2026-09-05T12:00:00Z");
    const board = buildCfbBoard({ date: "2026-09-05", espnEvents: ESPN.events, oddsEvents: readJson("odds-ncaaf-2026-09-05.json") as unknown[], fpi: readJson("espn-fpi.json"), now: NOW, bankroll: 2500 });
    const ala = board.games.find((g) => g.home.abbr === "ALA") as CfbGame;
    const rows = parseEventProps(readJson("odds-ncaaf-event-props.synthetic.json") as Record<string, unknown>, ala, { now: NOW, bankroll: 2500 });
    const opts = { mode: "best" as const, nowMs: 0, teamOf: (r: CfbPropRow) => r.team, positionOf: () => "HB", quoteOf: propQuote, legOf: propLegOf };
    const one = footballGenPool(rows, { market: "pass_yds", includeStarted: true }, opts);
    const two = footballGenPool(rows, { market: "pass_yds", markets: ["pass_yds", "rush_yds"], includeStarted: true }, opts);
    expect(one.legs.length).toBeGreaterThan(0);
    expect(two.legs.length).toBeGreaterThan(one.legs.length);
    expect(new Set(two.legs.map((l) => l.market))).toEqual(new Set(["pass_yds", "rush_yds"]));
    for (const l of one.legs) {
      expect(l.market).toBe("pass_yds");
      expect(l.gameLabel).toMatch(/ALA/);
    }
  });
});

describe("the hit-rate floor", () => {
  /* a fake log: every player on the board cleared every line in 8 of 10 games... except the ones
     the test marks cold, who cleared 2 of 10 */
  const hot: PlayerLog = { id: 1, pos: "RF", bat: Array.from({ length: 10 }, (_, i) => (i < 8 ? [3, 2, 3, 1, 6, 4] : [0, 0, 0, 0, 0, 4]) as const), pit: Array.from({ length: 10 }, (_, i) => (i < 8 ? [9, 21, 1] : [1, 6, 1]) as const) };
  const cold: PlayerLog = { id: 2, pos: "RF", bat: Array.from({ length: 10 }, (_, i) => (i < 2 ? [3, 2, 3, 1, 6, 4] : [0, 0, 0, 0, 0, 4]) as const), pit: Array.from({ length: 10 }, (_, i) => (i < 2 ? [9, 21, 1] : [1, 6, 1]) as const) };
  const names = [...new Set(BOARD.flatMap((g) => GEN_MARKETS.flatMap((m) => (g.markets?.[m] ?? []).map((r) => r.p))))];
  const coldKeys = new Set(names.filter((_, i) => i % 3 === 0).map(hitKey));
  const logs = new Map(names.filter((_, i) => i % 5 !== 4).map((n) => [hitKey(n), coldKeys.has(hitKey(n)) ? cold : hot])); // every fifth player has NO log
  const nameOf = (label: string) => label.replace(/\s*\([A-Z0-9]+\)$/, ""); // the MLB leg label is "Name (TM)"
  const hits: MlbHitSource = { logs, window: 15, keyOf: hitKey };

  it("stamps every leg with its own rate over the window, null when the player has no log", () => {
    const pool = buildPool(BOARD, base, 0, hits);
    expect(pool.legs.some((l) => l.hit === null)).toBe(true);
    for (const l of pool.legs) {
      const key = hitKey(nameOf(l.label));
      if (!logs.has(key)) { expect(l.hit).toBeNull(); continue; }
      expect(l.hit).not.toBeNull();
      expect(l.hit!.n).toBe(10);
      /* the pool holds both sides: the hot log clears the over 8 of 10 and the under 2 of 10; the cold log the reverse */
      const high = coldKeys.has(key) ? l.side === "u" : l.side === "o";
      expect(l.hit!.hits).toBe(high ? 8 : 2);
      expect(l.hit!.dots).toHaveLength(10);
    }
  });
  it("the floor keeps only legs at or above it; a leg with no log cannot clear a floor", () => {
    const pool = buildPool(BOARD, base, 0, hits);
    const all = mixCandidates(pool, base);
    const floored = mixCandidates(pool, { ...base, minHit: 0.6 });
    expect(floored.length).toBeLessThan(all.length);
    expect(floored.length).toBeGreaterThan(0);
    for (const l of floored) expect(l.hit!.rate).toBeGreaterThanOrEqual(0.6);
    expect(floored.some((l) => l.hit == null)).toBe(false);
    expect(mixCandidates(pool, { ...base, minHit: 0.9 })).toHaveLength(0);
    expect(poolCounts(pool, { ...base, minHit: 0.6 }).eligible).toBe(floored.length);
  });
  it("a ticket under a floor is all hot players; an impossible floor fails with the 'hit' relax", () => {
    const pool = buildPool(BOARD, base, 0, hits);
    const spec = { ...base, minHit: 0.6 };
    const t = ok(generate(pool, spec, specSeed(spec, DATE, 0)));
    for (const l of t.legs) expect(l.hit!.rate).toBeGreaterThanOrEqual(0.6);
    const f = fail(generate(pool, { ...base, minHit: 0.9 }, 1));
    expect(f).toMatchObject({ code: "short-pool", have: 0, want: 4, relax: "hit" });
  });
});

describe("the games filter", () => {
  it("restricts the pool to the chosen games and relaxes with 'games' when they are too few", () => {
    const pool = buildPool(BOARD, base, 0);
    const games = [...new Set(pool.legs.map((l) => l.gameKey))];
    expect(games.length).toBeGreaterThan(2);
    const two = games.slice(0, 2);
    const spec = { ...base, games: two, legs: 2 };
    const t = ok(generate(pool, spec, specSeed(spec, DATE, 0)));
    for (const l of t.legs) expect(two).toContain(l.gameKey);
    /* one game, one-per-game, four legs: impossible — and the hint names the games filter */
    const f = fail(generate(pool, { ...base, games: games.slice(0, 1) }, 1));
    expect(f).toMatchObject({ code: "short-pool", want: 4 });
    expect((f as { relax?: string }).relax === "games" || (f as { relax?: string }).relax === "same-game").toBe(true);
  });
});
