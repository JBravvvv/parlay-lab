import { describe, expect, it } from "vitest";
import fx from "./fixtures/gen-pool.json";
import type { PropBoardGame, PropBoardRow } from "@/engine";
import { amToDec, combineTicket, decToAm, type SandboxLeg } from "@/lib/ticket-math";
import {
  LEG_MAX,
  LEG_MIN,
  bandDec,
  generate,
  mulberry32,
  poolCounts,
  poolOf,
  specSeed,
  ticketOf,
  type GenLeg,
  type GenResult,
  type GenSpec,
} from "@/lib/parlay-gen";
/* INSTRUCTION 52 (2026-09-12): `buildPool` is the MLB ADAPTER now — the core is payload-opaque
   and the football desk has its own builder (src/lib/football/gen-pool.ts). The move must not
   change one number in this file: every pinned count and every pinned price below is the same
   assertion it was when buildPool lived inside parlay-gen.ts. */
import { buildPool } from "@/components/props/mlb-gen-pool";

/**
 * PARLAY GENERATOR CORE — INSTRUCTION 50 (2026-09-11), Josh's item 3, verbatim:
 *
 *   "Parlay builder should have a generator that I can select # of legs, prop category,
 *    min & max odds then it will generate a parlay for me within those parameters; if I
 *    hit regenerate then it regenerates a new parlay; each slot is clickable to keep that
 *    player(s) in any round and spin the other slots
 *
 *    Ex: 4 leg, H+R+RBI, -152 -> +110
 *
 *    Leg 1: Yordan Alvarez over 1.5 H+R+RBI -145
 *    Leg 2: Mike Trout over 1.5 H+R+RBI -124
 *    Leg 3: Otto Lopez over 1.5 H+R+RBI -137
 *    Leg 4: Ronald Acuna Jr over 1.5 H+R+RBI -130"
 *
 * THE BAND IS PER LEG — his own four legs prove it, and the first test computes that with
 * the repo's own converters rather than asserting it from memory.
 *
 * EVERY PRICE HERE IS REAL. `tests/fixtures/gen-pool.json` is the board the repo's fixture
 * engine produces from the captured 2026-07-09 odds feed — the same 6 games / 289 rows
 * `tests/armed-baseline.test.ts:91-96` pins. Nothing in this file quotes a made-up number:
 * where a test needs a row the feed does not carry (a `noParlay` row, a row with neither a
 * model number nor a market fair), it sets THAT FLAG on a real row and leaves the posted
 * price untouched.
 */

const board = fx.propBoard as unknown as PropBoardGame[];
const HRR = "batter_hits_runs_rbis";
const HITS = "batter_hits";

/** Josh's band and shape; every knob explicit so a test that changes one says which. */
const spec = (o: Partial<GenSpec> = {}): GenSpec => {
  const legs = o.legs ?? 4;
  return {
    market: HRR,
    legs,
    legMinAm: -152,
    legMaxAm: 110,
    payout: null,
    sides: "o",
    onePerGame: true,
    czOnly: false,
    includeStarted: false,
    modelOnly: false,
    pinned: new Array(legs).fill(null),
    ...o,
  };
};

const poolFor = (s: GenSpec, nowMs = 0, b: readonly PropBoardGame[] = board) => buildPool(b, s, nowMs);
const ok = (r: GenResult<SandboxLeg>) => {
  if (!r.ok) throw new Error(`expected a ticket, got ${JSON.stringify(r.fail)}`);
  return r.ticket;
};
const fail = (r: GenResult<SandboxLeg>) => {
  if (r.ok) throw new Error(`expected a failure, got ${r.ticket.legs.map((l) => l.leg.id).join(", ")}`);
  return r.fail;
};
/** deep clone of the fixture board so a test that mutates a row cannot leak into another */
const clone = (): PropBoardGame[] => JSON.parse(JSON.stringify(board)) as PropBoardGame[];

describe("the band is PER LEG — Josh's own example settles it", () => {
  it("his four legs combine to +834, nowhere near the -152 → +110 he wrote", () => {
    const legs = [-145, -124, -137, -130];
    const dec = legs.reduce((d, am) => d * amToDec(am), 1);
    expect(dec).toBeCloseTo(9.341931, 6);
    expect(decToAm(dec)).toBe(834);
  });

  it("…while every one of those legs sits inside that band on its own", () => {
    const b = bandDec(-152, 110);
    for (const am of [-145, -124, -137, -130]) {
      expect(amToDec(am)).toBeGreaterThanOrEqual(b.lo);
      expect(amToDec(am)).toBeLessThanOrEqual(b.hi);
    }
  });

  it("bandDec is decimal and order-insensitive (American is not ordered across ±100)", () => {
    const b = bandDec(-152, 110);
    expect(b.lo).toBeCloseTo(1.657895, 6);
    expect(b.hi).toBeCloseTo(2.1, 10);
    expect(bandDec(110, -152)).toEqual(b);
    /* the trap this exists for: a naive numeric compare calls -152 the smaller number and
       +110 the larger, which is true of the integers and false of the prices. */
    expect(amToDec(-152)).toBeLessThan(amToDec(110));
  });
});

describe("Josh's 4-leg H+R+RBI request against the real board", () => {
  it("fills 4 legs, all inside the band, 4 different players, 4 different games", () => {
    /* both sides of the posted line are eligible here — the July-10 slate posts in-band
       H+R+RBI OVERS in only three games (next test), and one-leg-per-game is never
       relaxed behind Josh's back to get around that. */
    const s = spec({ sides: "both" });
    const t = ok(generate(poolFor(s), s, 12345));
    expect(t.legs).toHaveLength(4);
    const b = bandDec(s.legMinAm, s.legMaxAm);
    for (const l of t.legs) {
      expect(l.dec).toBeGreaterThanOrEqual(b.lo);
      expect(l.dec).toBeLessThanOrEqual(b.hi);
      expect(l.leg.market).toBe(HRR);
      expect(l.leg.sub.startsWith("H+R+RBI ")).toBe(true);
    }
    expect(new Set(t.legs.map((l) => l.playerKey)).size).toBe(4);
    expect(new Set(t.legs.map((l) => l.gameKey)).size).toBe(4);
    expect(t.sameGame).toEqual([]);
    expect(t.outsideLegBand).toEqual([]);
  });

  it("OVERS only: this slate posts in-band H+R+RBI overs in 3 games, and it says so", () => {
    const s = spec();
    const f = fail(generate(poolFor(s), s, 12345));
    expect(f).toEqual({ code: "short-pool", have: 3, want: 4, relax: "same-game" });
  });

  it("…and with one-leg-per-game switched off BY THE USER it fills, still 4 players", () => {
    const s = spec({ onePerGame: false });
    const t = ok(generate(poolFor(s), s, 12345));
    expect(t.legs).toHaveLength(4);
    expect(new Set(t.legs.map((l) => l.playerKey)).size).toBe(4);
    for (const l of t.legs) expect(l.leg.sub).toMatch(/^H\+R\+RBI Over /);
    expect(t.sameGame.length).toBeGreaterThan(0); // flagged, never hidden
  });
});

describe("the generator's price is the slip's price", () => {
  it("ticketOf agrees with combineTicket on 20 different seeds", () => {
    const s = spec({ market: HITS, sides: "both", legs: 4 });
    const pool = poolFor(s);
    for (let seed = 1; seed <= 20; seed++) {
      const t = ok(generate(pool, s, seed));
      const c = combineTicket(t.legs.map((l) => l.leg))!;
      expect(c.am).toBe(t.am);
      expect(c.dec).toBe(t.dec);
      expect(c.trueProb).toBe(t.trueProb);
    }
  });

  it("ticketOf multiplies in slot order, so a re-priced ticket never drifts from the slip", () => {
    const s = spec({ market: HITS, sides: "both", legs: 3 });
    const pool = poolFor(s);
    const t = ok(generate(pool, s, 4242));
    expect(ticketOf(t.legs, s, t.seed).dec).toBe(t.dec);
    expect(combineTicket(t.legs.map((l) => l.leg))!.dec).toBe(t.dec);
  });
});

describe("determinism — same seed, same ticket, on any device", () => {
  it("the same seed reproduces the ticket; the next seed moves it", () => {
    const s = spec({ market: HITS, sides: "both", legs: 4 });
    const pool = poolFor(s);
    expect(pool.legs.length).toBeGreaterThanOrEqual(2 * s.legs);
    const a = ok(generate(pool, s, 555));
    const b = ok(generate(pool, s, 555));
    const c = ok(generate(pool, s, 556));
    expect(b.key).toBe(a.key);
    expect(b.legs.map((l) => l.leg.id)).toEqual(a.legs.map((l) => l.leg.id));
    expect(c.key).not.toBe(a.key);
  });

  it("specSeed moves when any knob moves, and mulberry32 is a pure stream", () => {
    const s = spec();
    expect(specSeed(s, "2026-07-10", 0)).toBe(specSeed(s, "2026-07-10", 0));
    expect(specSeed(s, "2026-07-10", 1)).not.toBe(specSeed(s, "2026-07-10", 0));
    expect(specSeed({ ...s, legs: 5 }, "2026-07-10", 0)).not.toBe(specSeed(s, "2026-07-10", 0));
    expect(specSeed(s, "2026-07-11", 0)).not.toBe(specSeed(s, "2026-07-10", 0));
    const r1 = mulberry32(7);
    const r2 = mulberry32(7);
    const draws = [r1(), r1(), r1()];
    expect([r2(), r2(), r2()]).toEqual(draws);
    for (const d of draws) expect(d).toBeGreaterThanOrEqual(0), expect(d).toBeLessThan(1);
  });

  /**
   * PLANT 1 — the canonical id sort is load-bearing, not decoration. Board row order is
   * device-dependent (`bestBoard` hands back the server board on one phone and the cached
   * one on another, src/lib/engine-client.ts:290-297; the page re-sorts by rank,
   * app/props/page.tsx:156). Shuffle the input and the answer must not move.
   */
  it("PLANT 1: shuffling the board's own order changes nothing about the ticket", () => {
    const s = spec({ market: HITS, sides: "both", legs: 4 });
    const straight = ok(generate(poolFor(s), s, 909));
    const flipped = clone()
      .reverse()
      .map((g) => ({
        ...g,
        markets: Object.fromEntries(Object.entries(g.markets).map(([k, rows]) => [k, rows.slice().reverse()])),
      }));
    const shuffledPool = poolFor(s, 0, flipped);
    expect(shuffledPool.legs.map((l) => l.leg.id)).toEqual(poolFor(s).legs.map((l) => l.leg.id));
    const out = ok(generate(shuffledPool, s, 909));
    expect(out.key).toBe(straight.key);
    expect(out.legs.map((l) => l.leg.id)).toEqual(straight.legs.map((l) => l.leg.id));
  });
});

describe("pins — the slots Josh keeps", () => {
  const s = spec({ market: HITS, sides: "both", legs: 4 });
  const pool = poolFor(s);
  const band = bandDec(s.legMinAm, s.legMaxAm);
  const inBand = pool.legs.filter((l) => l.dec >= band.lo && l.dec <= band.hi);
  const p0 = inBand[0];
  const p2 = inBand.find((l) => l.playerKey !== p0.playerKey && l.gameKey !== p0.gameKey)!;

  it("pinned slots stay byte-identical across five spins while the rest move", () => {
    const pinned = spec({ market: HITS, sides: "both", legs: 4, pinned: [p0.leg.id, null, p2.leg.id, null] });
    const spins = [1, 2, 3, 4, 5].map((seed) => ok(generate(poolFor(pinned), pinned, seed)));
    for (const t of spins) {
      expect(t.legs).toHaveLength(4);
      expect(t.legs[0].leg.id).toBe(p0.leg.id);
      expect(t.legs[2].leg.id).toBe(p2.leg.id);
      expect(t.legs[0].leg).toEqual(p0.leg);
      expect(t.legs[2].leg).toEqual(p2.leg);
    }
    const spun = new Set(spins.map((t) => `${t.legs[1].leg.id}|${t.legs[3].leg.id}`));
    expect(spun.size).toBeGreaterThan(1);
  });

  it("a pin the board no longer carries is named, never silently dropped", () => {
    const dropped = clone().map((g) => ({
      ...g,
      markets: Object.fromEntries(
        Object.entries(g.markets).map(([k, rows]) => [k, rows.filter((r) => `${g.gkey ?? g.game}|${r.lkey}|o` !== p0.leg.id && `${g.gkey ?? g.game}|${r.lkey}|u` !== p0.leg.id)]),
      ),
    }));
    const pinned = spec({ market: HITS, sides: "both", legs: 4, pinned: [p0.leg.id, null, null, null] });
    expect(fail(generate(poolFor(pinned, 0, dropped), pinned, 1))).toEqual({ code: "pin-missing", ids: [p0.leg.id] });
  });

  it("two pins on the same player is a conflict, not a doubled-up ticket", () => {
    const twin = pool.legs.find((l) => l.playerKey === p0.playerKey && l.leg.id !== p0.leg.id)!;
    const pinned = spec({ market: HITS, sides: "both", legs: 4, pinned: [p0.leg.id, twin.leg.id, null, null] });
    const f = fail(generate(poolFor(pinned), pinned, 1));
    expect(f.code).toBe("pin-conflict");
    expect(f).toMatchObject({ why: "same-player", ids: [p0.leg.id, twin.leg.id] });
  });
});

describe("the rules — R1 one player, R2 one game", () => {
  /**
   * R1 IS THE ONE THAT IS NEVER RELAXABLE. The prop board carries the same player at 0.5 /
   * 1.5 / 2.5 plus the Caesars alt ladder, so without it a "4-leg" is one man four times —
   * a ticket that prices correctly and is completely wrong. A single player's posted OVER
   * and UNDER are exactly that collapse in miniature, and the fixture's real row proves it.
   */
  it("one player, both sides posted, cannot fill more than one slot", () => {
    const g = board.find((x) => (x.markets[HRR] ?? []).length > 0)!;
    const row = (g.markets[HRR] ?? []).find((r) => r.o != null && r.u != null)!;
    const one: PropBoardGame[] = [{ ...g, markets: { [HRR]: [row] } }];
    const s = spec({ sides: "both", onePerGame: false });
    const pool = poolFor(s, 0, one);
    expect(pool.legs).toHaveLength(2); // the real Over and the real Under
    expect(new Set(pool.legs.map((l) => l.playerKey)).size).toBe(1);
    expect(fail(generate(pool, s, 1))).toEqual({ code: "short-pool", have: 1, want: 4, relax: null });
  });

  it("a one-game pool fails under one-leg-per-game and fills once the USER turns it off", () => {
    const g = board.find((x) => (x.markets[HRR] ?? []).length >= 4)!;
    const one: PropBoardGame[] = [g];
    const on = spec({ sides: "both" });
    const f = fail(generate(poolFor(on, 0, one), on, 3));
    expect(f).toEqual({ code: "short-pool", have: 1, want: 4, relax: "same-game" });
    const off = spec({ sides: "both", onePerGame: false });
    const t = ok(generate(poolFor(off, 0, one), off, 3));
    expect(t.legs).toHaveLength(4);
    expect(new Set(t.legs.map((l) => l.playerKey)).size).toBe(4);
    expect(t.sameGame).toEqual([g.gkey ?? g.game]);
  });

  it("never seats the same player twice, over fifty spins of a both-sides pool", () => {
    /* the sharp end of R1: with both sides posted, EVERY player in this pool has two legs
       whose probabilities are complements, and the sampler is free to reach for both. Fifty
       seeds, one-leg-per-game off so nothing else is doing R1's work for it. */
    const s = spec({ market: HITS, sides: "both", legs: 4, onePerGame: false });
    const pool = poolFor(s);
    const twoSided = new Set<string>();
    const seen = new Map<string, number>();
    for (const l of pool.legs) seen.set(l.playerKey, (seen.get(l.playerKey) ?? 0) + 1);
    for (const [k, n] of seen) if (n > 1) twoSided.add(k);
    expect(twoSided.size).toBeGreaterThan(20); // the trap is really in the pool
    for (let seed = 1; seed <= 50; seed++) {
      const t = ok(generate(pool, s, seed));
      expect(new Set(t.legs.map((l) => l.playerKey)).size).toBe(4);
      expect(new Set(t.legs.map((l) => l.leg.id)).size).toBe(4);
    }
  });

  /**
   * PLANT 2 — proof the R1 assertion above is not vacuous: a hand-built ticket holding one
   * player twice fails the very check every generated ticket passes.
   */
  it("PLANT 2: a two-legs-one-player ticket fails the assertion the generator passes", () => {
    const s = spec({ market: HITS, sides: "both", legs: 2 });
    const pool = poolFor(s);
    const a = pool.legs[0];
    const twin = pool.legs.find((l) => l.playerKey === a.playerKey && l.leg.id !== a.leg.id)!;
    const handBuilt = ticketOf([a, twin], s, 0);
    expect(new Set(handBuilt.legs.map((l) => l.playerKey)).size).toBe(1); // the bug, made visible
    const real = ok(generate(pool, s, 77));
    expect(new Set(real.legs.map((l) => l.playerKey)).size).toBe(2);
  });
});

describe("failures carry real pool numbers, never invented ones", () => {
  it("a market the board does not price → no-rows", () => {
    const s = spec({ market: "batter_walks" });
    expect(poolFor(s).legs).toHaveLength(0);
    expect(fail(generate(poolFor(s), s, 1))).toEqual({ code: "no-rows" });
  });

  /* "No lines on this board" is a statement ABOUT THE BOARD, so it may only be said when the
     board really is empty of this market (INSTRUCTION 52 fix pass). A FILTER that empties the
     eligible set is a different failure and names itself — otherwise the sheet printed "there is
     nothing here to build a parlay from" directly under a diagnostic reading "pool 40 rows", and
     offered no way back. Football made it reachable: anytime TD posts a yes and no under at all.
     The two pools below are this fixture's own legs, re-bagged — not one price is touched. */
  const bagOf = (legs: readonly GenLeg<SandboxLeg>[], rows: number) =>
    poolOf(
      legs.map((l) => ({ ...l })),
      { rows, startedDropped: 0, noParlayDropped: 0 },
    );

  it("a pool with rows and nothing on the side asked for names the SIDE, not the board", () => {
    const full = poolFor(spec({ market: HITS, sides: "both" }));
    const overs = bagOf(
      full.legs.filter((l) => l.side === "o"),
      full.rows,
    );
    expect(overs.legs.length).toBeGreaterThan(0);
    const f = fail(generate(overs, spec({ market: HITS, sides: "u" }), 1));
    expect(f).toEqual({ code: "one-sided", want: "u", has: "o", rows: overs.legs.length });
    /* and the same pool asked for the side it HAS still builds — the filter was the whole problem */
    expect(ok(generate(overs, spec({ market: HITS, sides: "o", onePerGame: false }), 1)).legs).toHaveLength(4);
  });

  it("…and when the Caesars-only filter is what emptied it, the failure names THAT instead", () => {
    const full = poolFor(spec({ market: HITS, sides: "both" }));
    const noCz = bagOf(
      full.legs.filter((l) => l.book !== "CZ"),
      full.rows,
    );
    expect(noCz.legs.length).toBeGreaterThan(3);
    const s = spec({ market: HITS, sides: "both", legs: 3, czOnly: true, onePerGame: false });
    /* both sides are present here, so the side filter is NOT the cause and must not be blamed */
    expect(fail(generate(noCz, s, 1))).toMatchObject({ code: "short-pool", have: 0, want: 3, relax: "cz" });
  });

  it("a band with nothing in it quotes the two REAL posted prices either side of it", () => {
    /* -188 … -182 is a genuine hole in this slate's hits market: the feed posts -189 and
       -181 and nothing between them. */
    const s = spec({ market: HITS, sides: "o", legMinAm: -188, legMaxAm: -182 });
    const pool = poolFor(s);
    const f = fail(generate(pool, s, 1));
    expect(f.code).toBe("band-empty");
    if (f.code !== "band-empty") return;
    expect(f.rows).toBe(81); // every posted OVER in the market, counted
    const posted = pool.legs.map((l) => l.leg.cz);
    expect(posted).toContain(f.nearest.belowAm); // membership, not a computed number
    expect(posted).toContain(f.nearest.aboveAm);
    expect(f.nearest.belowAm).toBe(-189);
    expect(f.nearest.aboveAm).toBe(-181);
    const b = bandDec(s.legMinAm, s.legMaxAm);
    for (const l of pool.legs) expect(l.dec >= b.lo && l.dec <= b.hi).toBe(false);
  });

  it("short-pool names the one relaxation that is actually engaged", () => {
    const s = spec({ sides: "o" });
    const f = fail(generate(poolFor(s), s, 1));
    expect(f).toMatchObject({ code: "short-pool", relax: "same-game" });
    /* with R2 already off there is no same-game card left to play, and the message says so
       rather than inventing one */
    const g = board.find((x) => (x.markets[HRR] ?? []).length > 0)!;
    const row = (g.markets[HRR] ?? [])[0];
    const one: PropBoardGame[] = [{ ...g, markets: { [HRR]: [row] } }];
    const off = spec({ sides: "both", onePerGame: false });
    expect(fail(generate(poolFor(off, 0, one), off, 1))).toMatchObject({ relax: null });
  });
});

describe("the optional COMBINED payout band (second mode, same predicate)", () => {
  const twoLeg = (payout: { minAm: number; maxAm: number } | null) =>
    spec({ sides: "both", legs: 2, onePerGame: false, payout });

  it("prices the whole ticket into the band when the band is reachable", () => {
    const s = twoLeg({ minAm: 200, maxAm: 300 });
    const t = ok(generate(poolFor(s), s, 99));
    const b = bandDec(200, 300);
    expect(t.dec).toBeGreaterThanOrEqual(b.lo);
    expect(t.dec).toBeLessThanOrEqual(b.hi);
    expect(t.am).toBeGreaterThanOrEqual(200);
    expect(t.am).toBeLessThanOrEqual(300);
    for (const l of t.legs) {
      const lb = bandDec(s.legMinAm, s.legMaxAm);
      expect(l.dec >= lb.lo && l.dec <= lb.hi).toBe(true); // the per-leg band still binds
    }
  });

  it("an unreachable payout says how far this pool actually reaches", () => {
    const s = twoLeg({ minAm: 5000, maxAm: 9000 });
    const pool = poolFor(s);
    const f = fail(generate(pool, s, 99));
    expect(f.code).toBe("payout-unreachable");
    if (f.code !== "payout-unreachable") return;
    /* the ceiling is the product of two REAL in-band prices from two different players */
    const b = bandDec(s.legMinAm, s.legMaxAm);
    const best = new Map<string, number>();
    for (const l of pool.legs) {
      if (l.dec < b.lo || l.dec > b.hi) continue;
      best.set(l.playerKey, Math.max(best.get(l.playerKey) ?? 0, l.dec));
    }
    const top2 = [...best.values()].sort((x, y) => y - x).slice(0, 2);
    expect(f.reach.maxAm).toBe(decToAm(top2[0] * top2[1]));
    expect(amToDec(f.reach.maxAm)).toBeLessThan(bandDec(5000, 9000).lo);
  });
});

describe("the pool — what it admits and what it refuses", () => {
  it("skips games that have started unless Josh asks for them (live/start, read here first)", () => {
    const s = spec({ market: HITS, sides: "both" });
    const pre = poolFor(s, 0);
    expect(pre.startedDropped).toBe(0);
    /* the fixture slate's real first pitches are 22:40Z / 22:45Z / 23:05Z / 23:10Z */
    const mid = Date.parse("2026-07-10T23:00:00Z");
    const skipped = poolFor(s, mid);
    expect(skipped.startedDropped).toBeGreaterThan(0);
    expect(skipped.legs.length).toBeLessThan(pre.legs.length);
    expect(skipped.games).toBeLessThan(pre.games);
    for (const l of skipped.legs) expect(l.started).toBe(false);
    const admitted = poolFor({ ...s, includeStarted: true }, mid);
    expect(admitted.legs.map((l) => l.leg.id)).toEqual(pre.legs.map((l) => l.leg.id));
    expect(admitted.startedDropped).toBe(0);
    expect(admitted.legs.some((l) => l.started)).toBe(true); // flagged, so the UI can say so
  });

  it("a game the feed marks live is started whatever the clock says", () => {
    const b = clone();
    b[0] = { ...b[0], live: true };
    const s = spec({ market: HITS, sides: "both" });
    const pool = poolFor(s, 0, b);
    expect(pool.startedDropped).toBe((board[0].markets[HITS] ?? []).length);
    expect(pool.legs.every((l) => l.gameKey !== (b[0].gkey ?? b[0].game))).toBe(true);
  });

  it("never mints a noParlay row, and counts the ones it refused", () => {
    /* the flag is set on a REAL row; its posted price is untouched */
    const b = clone();
    const rows = b[0].markets[HITS] as PropBoardRow[];
    rows[0].noParlay = true;
    const banned = `${b[0].gkey ?? b[0].game}|${rows[0].lkey}`;
    const s = spec({ market: HITS, sides: "both" });
    const pool = poolFor(s, 0, b);
    expect(pool.noParlayDropped).toBe(1);
    expect(pool.legs.some((l) => l.leg.id.startsWith(`${banned}|`))).toBe(false);
  });

  it("never mints a row with no model number and no market fair (prob 0 is not a price)", () => {
    const b = clone();
    const rows = b[0].markets[HITS] as PropBoardRow[];
    rows[0].pO = null;
    rows[0].fO = null;
    const blind = `${b[0].gkey ?? b[0].game}|${rows[0].lkey}`;
    const s = spec({ market: HITS, sides: "both" });
    const pool = poolFor(s, 0, b);
    expect(pool.legs.some((l) => l.leg.id.startsWith(`${blind}|`))).toBe(false);
    for (const l of pool.legs) expect(l.leg.prob).toBeGreaterThan(0);
  });

  it("never mints a side the book does not post (anytime HR has no under)", () => {
    const s = spec({ market: "batter_home_runs", sides: "both", legMinAm: -1000, legMaxAm: 5000 });
    const pool = poolFor(s);
    const hrRows = board.reduce((n, g) => n + (g.markets["batter_home_runs"] ?? []).length, 0);
    expect(hrRows).toBe(133);
    const unders = pool.legs.filter((l) => l.leg.id.endsWith("|u"));
    const posted = board.flatMap((g) => g.markets["batter_home_runs"] ?? []).filter((r) => r.u != null || r.cz?.u != null);
    expect(unders).toHaveLength(posted.length);
  });

  it("sides, Caesars-only and model-only filters admit exactly what they claim", () => {
    const both = poolFor(spec({ market: HITS, sides: "both" }));
    expect(both.legs.length).toBeGreaterThan(0);
    const overs = ok(generate(both, spec({ market: HITS, sides: "o", legs: 3 }), 5));
    for (const l of overs.legs) expect(l.leg.id.endsWith("|o")).toBe(true);
    const unders = ok(generate(both, spec({ market: HITS, sides: "u", legs: 3 }), 5));
    for (const l of unders.legs) expect(l.leg.id.endsWith("|u")).toBe(true);
    /* the Caesars-only and model-only pools are thin, so these two widen the band rather
       than pretend the default one holds them */
    const wide = { market: HITS, sides: "both" as const, legs: 3, legMinAm: -400, legMaxAm: 400, onePerGame: false };
    const cz = ok(generate(both, spec({ ...wide, czOnly: true }), 5));
    for (const l of cz.legs) expect(l.book).toBe("CZ");
    const model = ok(generate(both, spec({ ...wide, modelOnly: true }), 5));
    for (const l of model.legs) expect(l.leg.src).toBe("model");
  });

  it("the pool's own counters describe the board it was built from", () => {
    const s = spec({ market: HITS, sides: "both" });
    const pool = poolFor(s);
    expect(pool.rows).toBe(81); // the market's real row count on this slate
    expect(pool.games).toBe(6);
    expect(pool.byId.size).toBe(pool.legs.length);
    for (const l of pool.legs) expect(pool.byId.get(l.leg.id)).toBe(l);
    expect(fx.games).toBe(6);
    expect(fx.rows).toBe(289);
  });

  it("poolCounts says which control is binding, through the same filters generate uses", () => {
    const s = spec({ market: HITS, sides: "both" });
    const pool = poolFor(s);
    const all = poolCounts(pool, s);
    expect(all.pool).toBe(pool.legs.length);
    expect(all.eligible).toBe(pool.legs.length); // both sides, no book or source filter
    const overs = poolCounts(pool, spec({ market: HITS, sides: "o" }));
    expect(overs.eligible).toBe(81); // every posted OVER on this slate
    expect(overs.inBand).toBeLessThan(overs.eligible);
    expect(overs.games).toBeLessThanOrEqual(pool.games);
    /* the count and the failure are the same measurement */
    const empty = spec({ market: HITS, sides: "o", legMinAm: -188, legMaxAm: -182 });
    expect(poolCounts(pool, empty).inBand).toBe(0);
    const f = fail(generate(pool, empty, 1));
    expect(f).toMatchObject({ code: "band-empty", rows: poolCounts(pool, empty).eligible });
  });

  it("every leg's ev is the engine's own number against the posted price", () => {
    const pool = poolFor(spec({ market: HITS, sides: "both" }));
    for (const l of pool.legs as GenLeg<SandboxLeg>[]) {
      expect(l.dec).toBe(amToDec(l.leg.cz));
      expect(l.ev).toBeCloseTo((l.leg.prob / 100) * l.dec - 1, 12);
    }
  });
});

describe("leg count", () => {
  it("honours the requested count exactly, and clamps to the supported range", () => {
    const pool = poolFor(spec({ market: HITS, sides: "both" }));
    for (const n of [2, 3, 4, 5, 6]) {
      const s = spec({ market: HITS, sides: "both", legs: n, onePerGame: false });
      expect(ok(generate(pool, s, 31)).legs).toHaveLength(n);
    }
    const tooMany = spec({ market: HITS, sides: "both", legs: 99, onePerGame: false, pinned: [] });
    expect(ok(generate(pool, tooMany, 31)).legs).toHaveLength(LEG_MAX);
    const tooFew = spec({ market: HITS, sides: "both", legs: 1, onePerGame: false, pinned: [] });
    expect(ok(generate(pool, tooFew, 31)).legs).toHaveLength(LEG_MIN);
  });

  it("a spin never fails just because the pool is small — avoid is a preference", () => {
    const s = spec({ market: HITS, sides: "both", legs: 2, onePerGame: false });
    const pool = poolFor(s);
    const first = ok(generate(pool, s, 1234));
    const next = ok(generate(pool, s, 1234, new Set([first.key])));
    expect(next.key).not.toBe(first.key); // a real board has room to move
    /* two real players, overs only, a band wide enough to hold both: exactly ONE ticket
       exists, so "avoid" has nowhere to go */
    const g = board.find((x) => (x.markets[HRR] ?? []).length >= 2)!;
    const tiny: PropBoardGame[] = [{ ...g, markets: { [HRR]: (g.markets[HRR] ?? []).slice(0, 2) } }];
    const two = spec({ sides: "o", legs: 2, onePerGame: false, legMinAm: -1000, legMaxAm: 1000 });
    const tinyPool = poolFor(two, 0, tiny);
    /* the pool mints every posted side; the spec's "o" narrows it inside generate() */
    expect(tinyPool.legs.filter((l) => l.leg.id.endsWith("|o"))).toHaveLength(2);
    const only = ok(generate(tinyPool, two, 1));
    const again = ok(generate(tinyPool, two, 1, new Set([only.key])));
    expect(again.key).toBe(only.key); // one possible ticket: repeated, not refused
  });
});

/* ------------------------------------------------------------------------------------------
   INSTRUCTION 50 — FIX PASS (2026-09-11). Four defects found by verification against the real
   fixture, each of which handed Josh a wrong answer or a wrong remedy. Every number below is
   read off the fixture at run time; none is typed in from memory.
   ------------------------------------------------------------------------------------------ */

describe("keeping a slot is a LOCK, not a spin (specSeed drops the pins)", () => {
  /* Josh, verbatim: "each slot is clickable to keep that player(s) in any round and spin the
     other slots". Folding `spec.pinned` into the seed meant the act of keeping one slot
     re-rolled the three he had NOT touched — the opposite of what he asked for. */
  it("pinning one slot at the same roll leaves every other slot byte-identical", () => {
    const s = spec({ market: HITS, sides: "both", legs: 4, onePerGame: false });
    const pool = poolFor(s);
    const before = ok(generate(pool, s, specSeed(s, "2026-07-10", 0)));
    const ids = before.legs.map((l) => l.leg.id);

    const pinnedSpec: GenSpec = { ...s, pinned: [ids[0], null, null, null] };
    const after = ok(generate(pool, pinnedSpec, specSeed(pinnedSpec, "2026-07-10", 0)));

    expect(after.legs.map((l) => l.leg.id)).toEqual(ids);
  });

  it("the seed still moves on a spin, and on every other knob", () => {
    const s = spec();
    expect(specSeed({ ...s, pinned: ["x", null, null, null] }, "2026-07-10", 0)).toBe(
      specSeed(s, "2026-07-10", 0),
    );
    expect(specSeed(s, "2026-07-10", 1)).not.toBe(specSeed(s, "2026-07-10", 0));
    expect(specSeed({ ...s, sides: "u" }, "2026-07-10", 0)).not.toBe(specSeed(s, "2026-07-10", 0));
  });
});

describe("a fully pinned ticket that is ALREADY inside the payout band is a success", () => {
  /* repairPayout bailed on "no free slot to swap" BEFORE testing the price it already had, so
     generate burned every retry and returned payout-not-found — telling Josh his target was
     "only just out of reach" about a ticket sitting squarely inside it. */
  it("pins-only + a band around their own price returns ok, not payout-not-found", () => {
    const s = spec({ market: HITS, sides: "both", legs: 4, onePerGame: false });
    const pool = poolFor(s);
    const base = ok(generate(pool, s, 4242));
    const ids = base.legs.map((l) => l.leg.id);
    /* the band is derived from the ticket's OWN combined price — a real number, widened by
       200 american points on each side so the arithmetic is not knife-edge */
    const inside: GenSpec = {
      ...s,
      pinned: ids,
      payout: { minAm: base.am - 200, maxAm: base.am + 200 },
    };
    const got = generate(pool, inside, 4242);
    expect(got.ok, got.ok ? "" : `expected ok, got ${JSON.stringify(got.fail)}`).toBe(true);
    if (!got.ok) return;
    expect(got.ticket.legs.map((l) => l.leg.id)).toEqual(ids);
    expect(got.ticket.am).toBe(base.am);
  });
});

describe("pins that consume the pool report short-pool, never band-empty", () => {
  /* `cands` has already had pin-clashing legs removed, so an empty `cands` used to be reported
     as "no leg is priced in this band" even when in-band legs plainly existed — a false
     sentence quoting "the closest posted prices", plus a remedy (widen the band) that cannot
     possibly help. */
  it("pinning every in-band game under one-per-game gives short-pool with the real relax", () => {
    const s = spec({ market: HRR, sides: "o", legs: 4 });
    const pool = poolFor(s);
    const band = bandDec(s.legMinAm, s.legMaxAm);
    const inBand = pool.legs.filter((l) => l.leg.id.endsWith("|o") && l.dec >= band.lo && l.dec <= band.hi);
    const byGame = new Map<string, GenLeg<SandboxLeg>>();
    for (const l of inBand) if (!byGame.has(l.gameKey)) byGame.set(l.gameKey, l);
    const pins = [...byGame.values()].map((l) => l.leg.id);
    /* the fixture must actually be in the shape this defect needs: fewer in-band GAMES than
       legs asked for, so the pins exhaust one-per-game */
    expect(pins.length).toBeGreaterThan(0);
    expect(pins.length).toBeLessThan(4);

    const pinned: GenSpec = { ...s, pinned: [...pins, ...new Array(4 - pins.length).fill(null)] };
    const f = fail(generate(pool, pinned, 7));
    expect(f.code).toBe("short-pool");
    if (f.code !== "short-pool") return;
    expect(f.have).toBe(pins.length);
    expect(f.want).toBe(4);
    expect(f.relax).toBe("same-game");
  });

  it("band-empty still fires when the band really is empty of eligible legs", () => {
    const s = spec({ legMinAm: -100000, legMaxAm: -99000 });
    const f = fail(generate(poolFor(s), s, 7));
    expect(f.code).toBe("band-empty");
  });
});

describe("capacity never over-states what one-per-player can seat (doubleheaders)", () => {
  /* shGkey appends "gm2" to the second half of a doubleheader, so the two halves are distinct
     GAME keys while the player is the same man in both. Counting games alone therefore claimed
     a `have` no selection could reach — a number shown to Josh that he cannot act on. */
  it("the same player in both halves of a doubleheader counts once, not twice", () => {
    const g = board.find((x) => (x.markets[HRR] ?? []).length >= 1)!;
    const rows = (g.markets[HRR] ?? []).slice(0, 1) as PropBoardRow[];
    const twin: PropBoardGame[] = [
      { ...g, markets: { [HRR]: rows } },
      { ...g, gkey: `${g.gkey}gm2`, markets: { [HRR]: rows } },
    ];
    const s = spec({ market: HRR, sides: "both", legs: 2, legMinAm: -100000, legMaxAm: 100000 });
    const pool = poolFor(s, 0, twin);
    // both halves minted their rows, so the game count alone would say "2 legs fit"
    expect(new Set(pool.legs.map((l) => l.gameKey)).size).toBe(2);
    const f = fail(generate(pool, s, 5));
    expect(f.code).toBe("short-pool");
    if (f.code !== "short-pool") return;
    expect(f.have, "one player cannot fill two slots, in one game or two").toBe(1);
  });
});

describe("the MLB adapter hoists, never invents (INSTRUCTION 52 — the move to CFB & NFL)", () => {
  /* The core used to reach into the MLB leg object for the price, the win %, the source and
     the two label lines. It is payload-opaque now, so the ADAPTER copies those up. These pins
     exist because a silent typo in that copy would not fail a single other test in this file —
     the generator would happily build tickets off a price that is not the slip's price. */
  it("every hoisted field is the slip leg's own value, byte for byte", () => {
    for (const market of [HITS, HRR, "pitcher_strikeouts"]) {
      const pool = poolFor(spec({ market, sides: "both", legs: 2 }));
      expect(pool.legs.length).toBeGreaterThan(0);
      for (const l of pool.legs) {
        expect(l.id).toBe(l.leg.id);
        expect(l.am).toBe(l.leg.cz);
        expect(l.prob).toBe(l.leg.prob);
        expect(l.src).toBe(l.leg.src);
        expect(l.label).toBe(l.leg.label);
        expect(l.sub).toBe(l.leg.sub);
        expect(l.book).toBe(l.leg.book ?? "BOOK");
      }
    }
  });

  it("the hoisted side agrees with the side in the leg id — an inverted copy cannot hide", () => {
    /* Josh sets OVER/UNDER more often than any other control. The old core read the last
       character of the leg id; the new one reads this field, so the two must agree on every
       leg on the board or the filter silently hands back the opposite bet. */
    const pool = poolFor(spec({ market: HITS, sides: "both" }));
    expect(pool.legs.length).toBeGreaterThan(0);
    for (const l of pool.legs) {
      expect(l.side, l.id).toBe(l.id.endsWith("|u") ? "u" : "o");
      expect(l.id.endsWith(`|${l.side}`), l.id).toBe(true);
    }
  });
});

describe("MLB's answer did not move when the generator went to CFB & NFL (INSTRUCTION 52)", () => {
  /**
   * A GOLDEN TICKET. The move made the core payload-opaque and pushed `buildPool` into the MLB
   * adapter; a reshuffled field copy there would still satisfy every other test in this file
   * while handing Josh a DIFFERENT parlay for the same board, spec and spin. So one ticket is
   * frozen whole: its seed, its key, and each leg's id, price, win %, side and both label lines.
   *
   * Every frozen value is ALSO re-derived here against the band, the one-per-player and
   * one-per-game rules and the slip leg itself — so this is a golden master with its own
   * independent checks, not a bare snapshot of whatever the code happens to do.
   */
  it("the same board, spec and spin still produce this exact 4-leg H+R+RBI ticket", () => {
    const s = spec({ sides: "both" });
    const seed = specSeed(s, "2026-07-10", 0);
    expect(seed).toBe(2137388135);
    const t = ok(generate(poolFor(s), s, seed));
    expect(t.legs.map((l) => [l.id, l.am, l.prob, l.side, l.label, l.sub, l.book, l.src])).toEqual([
      ["philadelphiaphillies@detroittigers|bryceharper|batter_hits_runs_rbis|1.5|u", -110, 52.7, "u", "Bryce Harper (PHI)", "H+R+RBI Under 1.5", "CZ", "model"],
      ["chicagocubs@cincinnatireds|carsonkelly|batter_hits_runs_rbis|1.5|o", 105, 49.2, "o", "Carson Kelly (CHC)", "H+R+RBI Over 1.5", "FAN", "model"],
      ["clevelandguardians@miamimarlins|xavieredwards|batter_hits_runs_rbis|1.5|u", -125, 49.8, "u", "Xavier Edwards (MIA)", "H+R+RBI Under 1.5", "FAN", "model"],
      ["milwaukeebrewers@pittsburghpirates|jakemangum|batter_hits_runs_rbis|1.5|u", 110, 43.2, "u", "Jake Mangum (PIT)", "H+R+RBI Under 1.5", "FAN", "model"],
    ]);
    expect(t.key).toBe(
      "chicagocubs@cincinnatireds|carsonkelly|batter_hits_runs_rbis|1.5|o+clevelandguardians@miamimarlins|xavieredwards|batter_hits_runs_rbis|1.5|u+milwaukeebrewers@pittsburghpirates|jakemangum|batter_hits_runs_rbis|1.5|u+philadelphiaphillies@detroittigers|bryceharper|batter_hits_runs_rbis|1.5|u",
    );
    /* the independent checks: every frozen price is the slip's own, inside Josh's band, and the
       four legs are four players in four games */
    const b = bandDec(s.legMinAm, s.legMaxAm);
    for (const l of t.legs) {
      expect(l.am).toBe(l.leg.cz);
      expect(l.prob).toBe(l.leg.prob);
      expect(amToDec(l.am)).toBeGreaterThanOrEqual(b.lo);
      expect(amToDec(l.am)).toBeLessThanOrEqual(b.hi);
    }
    expect(new Set(t.legs.map((l) => l.playerKey)).size).toBe(4);
    expect(new Set(t.legs.map((l) => l.gameKey)).size).toBe(4);
    expect(t.outsideLegBand).toEqual([]);
    expect(t.sameGame).toEqual([]);
  });
});
