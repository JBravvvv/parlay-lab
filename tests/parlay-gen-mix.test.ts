import { describe, expect, it } from "vitest";
import { amToDec } from "@/lib/ticket-math";
import { generate, poolOf, poolCounts, mixCandidates, specSeed, type GenLeg, type GenSpec } from "@/lib/parlay-gen";
import { mixBands, mixChance, mixOrder } from "@/lib/parlay-gen-mix";
import { mulberry32 } from "@/lib/parlay-gen";

// Synthetic probability/quote ladder: behavior tests, never presented as live picks.
const odds = [-230, -210, -190, -170, -150, -130, -115, -100, 110, 125, 140, 155, 170, 185, 200];
const legs: GenLeg[] = odds.map((am, i) => ({ id: `p${i}`, playerKey: `p${i}`, gameKey: `g${i}`,
  am, dec: amToDec(am), prob: 96 / amToDec(am), src: "market", side: "o", label: `Player ${i}`,
  sub: "Anytime TD", leg: {}, team: null, started: false, alt: false, book: "CZ", ev: -0.04 }));
const pool = poolOf(legs, { rows: legs.length, startedDropped: 0, noParlayDropped: 0 });
const spec: GenSpec = { style: "safer", market: "anytime_td", legs: 4, legMinAm: -230, legMaxAm: 200,
  payout: null, sides: "o", onePerGame: true, czOnly: true, includeStarted: false, modelOnly: false,
  pinned: [null, null, null, null] };
const ticket = (s: GenSpec, seed: number, recent?: ReadonlyMap<string, number>) => {
  const r = generate(pool, s, seed, undefined, recent);
  if (!r.ok) throw new Error(JSON.stringify(r.fail));
  return r.ticket;
};

describe("category-relative mixes", () => {
  it("rotates plus-money TDs while preserving the user's band, player and game constraints", () => {
    const used = new Set<string>();
    for (let seed = 0; seed < 150; seed++) {
      const t = ticket(spec, seed);
      expect(t.legs).toHaveLength(4);
      expect(new Set(t.legs.map((l) => l.playerKey)).size).toBe(4);
      expect(new Set(t.legs.map((l) => l.gameKey)).size).toBe(4);
      expect(t.legs.every((l) => l.dec >= amToDec(-230) && l.dec <= amToDec(200))).toBe(true);
      expect(t.legs.some((l) => l.am > 0)).toBe(true);
      for (const l of t.legs) used.add(l.id);
    }
    expect(used.size).toBe(legs.length);
  });
  it("safer mix has higher average estimated hit chance than balanced across many seeds", () => {
    const avg = (style: GenSpec["style"]) => Array.from({ length: 300 }, (_, seed) =>
      ticket({ ...spec, style }, seed).legs.reduce((s, l) => s + l.prob, 0) / 4).reduce((a, b) => a + b, 0) / 300;
    expect(avg("safer")).toBeGreaterThan(avg("balanced") + 2);
  });
  it("equal estimates never receive misleading different risk tiers", () => {
    expect(new Set(mixBands(legs.map((l) => ({ ...l, prob: 50 }))).values())).toEqual(new Set(["middle"]));
  });
  it("anchors are relative to the category, not a universal odds cutoff", () => {
    const td = legs.map((l, i) => ({ ...l, prob: 35 - i, src: "market" as const }));
    expect(mixBands(td).get("p0")).toBe("anchor");
    expect(mixChance(td[0])).toBeLessThan(mixChance(legs.find((l) => l.id === "p6")!));
  });
  it("clips model optimism for ranking without rewriting the forecast", () => {
    const l = { ...legs.find((l) => l.id === "p14")!, src: "model" as const, prob: 95 };
    expect(mixChance(l)).toBeCloseTo(1 / 3);
    expect(l.prob).toBe(95);
  });
  it("keeps pinned slots and does not reshuffle on a pin tap", () => {
    const seed = specSeed(spec, "2026-09-12", 0);
    const before = ticket(spec, seed);
    const pinned = { ...spec, pinned: [null, before.legs[1].id, null, null] };
    expect(specSeed(pinned, "2026-09-12", 0)).toBe(seed);
    expect(ticket(pinned, seed).legs.map((l) => l.id)).toEqual(before.legs.map((l) => l.id));
    expect(ticket(pinned, seed + 1).legs[1].id).toBe(before.legs[1].id);
  });
  it("reduces recent-player exposure without making a small pool fail", () => {
    const frequent = new Map(legs.slice(0, 3).map((l) => [l.playerKey, 4]));
    const count = (recent?: ReadonlyMap<string, number>) => Array.from({ length: 250 }, (_, seed) =>
      ticket(spec, seed, recent).legs.filter((l) => frequent.has(l.playerKey)).length).reduce((a, b) => a + b, 0);
    expect(count(frequent)).toBeLessThan(count() * 0.6);
    expect(ticket(spec, 17, new Map(legs.map((l) => [l.playerKey, 4]))).legs).toHaveLength(4);
  });
  it("duplicate alternate lines do not distort the relative probability bands", () => {
    const duplicate = Array.from({ length: 20 }, (_, i) => ({ ...legs[0], id: `alt${i}` }));
    const original = mixBands(legs);
    const withAlts = mixBands([...legs, ...duplicate]);
    for (const l of legs) expect(withAlts.get(l.id)).toBe(original.get(l.id));
  });
  it("repeats deterministically and still enforces a combined payout target", () => {
    expect(ticket(spec, 19)).toEqual(ticket(spec, 19));
    const t = ticket(spec, 19);
    const exact = { ...spec, payout: { minAm: t.am - 1, maxAm: t.am + 1 } };
    const result = generate(pool, exact, 19);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.ticket.am).toBeGreaterThanOrEqual(exact.payout.minAm);
  });
  it("bounded ordering preserves every candidate for payout repair", () => {
    const ordered = mixOrder(legs, "safer", mulberry32(1));
    expect(new Set(ordered.map((l) => l.id))).toEqual(new Set(legs.map((l) => l.id)));
  });
});

describe("position constraints", () => {
  const positioned = legs.map((l, i) => ({ ...l, position: ["QB", "RB", "WR", "TE", null][i % 5] }));
  const p = poolOf(positioned, { rows: positioned.length, startedDropped: 0, noParlayDropped: 0 });
  const filtered = { ...spec, positions: ["WR", "RB"] };
  it("every spin contains only checked positions, with the same pool used for counts and mix tiers", () => {
    expect(poolCounts(p, filtered).eligible).toBe(6);
    expect(mixCandidates(p, filtered)).toHaveLength(6);
    for (let seed = 0; seed < 60; seed++) {
      const r = generate(p, filtered, seed);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.ticket.legs).toHaveLength(4);
        expect(r.ticket.legs.every((l) => l.position === "WR" || l.position === "RB")).toBe(true);
        expect(new Set(r.ticket.legs.map((l) => l.gameKey)).size).toBe(4);
      }
    }
  });
  it("cannot smuggle an unchecked or unknown position through a pin", () => {
    for (const id of [positioned[0].id, positioned[4].id]) {
      expect(generate(p, { ...filtered, pinned: [id, null, null, null] }, 1)).toMatchObject({ ok: false, fail: { code: "pin-position", ids: [id] } });
    }
  });
  it("reports an insufficient position pool and offers an explicit all-position recovery", () => {
    expect(generate(p, { ...spec, positions: ["WR"] }, 1)).toMatchObject({ ok: false, fail: { code: "short-pool", have: 3, want: 4, relax: "positions" } });
    expect(poolCounts(p, { ...spec, positions: [] }).eligible).toBe(15);
  });
  it("checkbox order does not change the seeded ticket", () => {
    expect(specSeed(filtered, "board", 2)).toBe(specSeed({ ...filtered, positions: ["RB", "WR"] }, "board", 2));
  });
});

describe("doubleheader compatibility", () => {
  const row = (id: string, playerKey: string, gameKey: string): GenLeg => ({ ...legs[0], id, playerKey, gameKey });
  it("finds a valid ticket even when the first player's game choice would strand the other player", () => {
    const p = poolOf([row("a1", "a", "g1"), row("b1", "b", "g1"), row("a2", "a", "g2")], { rows: 3, startedDropped: 0, noParlayDropped: 0 });
    for (let seed = 0; seed < 30; seed++) {
      const r = generate(p, { ...spec, legs: 2, pinned: [null, null] }, seed);
      expect(r.ok).toBe(true);
      if (r.ok) expect(new Set(r.ticket.legs.map((l) => l.id))).toEqual(new Set(["b1", "a2"]));
    }
  });
  it("reports the achievable matching, not the minimum of separate player and game counts", () => {
    const p = poolOf([row("a1", "a", "g1"), row("a2", "a", "g2"), row("a3", "a", "g3"), row("b4", "b", "g4"), row("c4", "c", "g4")], { rows: 5, startedDropped: 0, noParlayDropped: 0 });
    const r = generate(p, { ...spec, legs: 3, pinned: [null, null, null] }, 1);
    expect(r).toMatchObject({ ok: false, fail: { code: "short-pool", have: 2, want: 3 } });
  });
});

it("does not reject a feasible payout because a greedy doubleheader estimate misses it", () => {
  const make = (id: string, playerKey: string, gameKey: string, am: number): GenLeg => ({ ...legs[0], id, playerKey, gameKey, am, dec: amToDec(am), prob: 96 / amToDec(am) });
  const p = poolOf([make("a1", "a", "g1", -1000), make("a2", "a", "g2", -200), make("b1", "b", "g1", -200), make("b2", "b", "g2", 9900)], { rows: 4, startedDropped: 0, noParlayDropped: 0 });
  const r = generate(p, { ...spec, legs: 2, pinned: [null, null], legMinAm: -1000, legMaxAm: 9900, payout: { minAm: 124, maxAm: 126 } }, 1);
  expect(r.ok).toBe(true);
  if (r.ok) expect(new Set(r.ticket.legs.map((l) => l.id))).toEqual(new Set(["a2", "b1"]));
});
