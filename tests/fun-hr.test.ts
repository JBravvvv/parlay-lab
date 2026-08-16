import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FUN_SHAPE, buildFunHrTickets, type FunLegSrc } from "@/lib/fun-hr";

/**
 * FUN MONEY, RESHAPED (2026-08-15, Josh's word, verbatim: "The 'Fun' Money needs to be
 * split out between 2-5 tickets mainly HR over longshots. It can't include 2 players
 * from the same team though as that shrinks odds significantly. it should be 3-8
 * players on each with limited repeat players").
 *
 * A deterministic COMPOSER, not a model: legs are the board's own HR-over rows (engine
 * prob + Caesars price, never invented), sorted most-likely-first so the longshot is
 * the PARLAY, not the legs. Rules encoded exactly: 2–5 tickets · 3–8 players each ·
 * a team appears at most once per ticket · a player appears on at most
 * FUN_SHAPE.repeatCap tickets across the day. Thin pools build fewer/smaller and the
 * note says so — never a fabricated ticket.
 */

const P = (player: string, team: string, prob: number, dec: number): FunLegSrc => ({
  player,
  team,
  label: `${player} (${team})`,
  prop: "HR O 0.5",
  prob,
  dec,
  cz: Math.round((dec - 1) * 100),
  lkey: `g|batter_home_runs|0.5|o|${player}`,
  gkey: `g_${team}`,
});

/** 20 players, 20 distinct teams — a healthy HR board */
const WIDE = Array.from({ length: 20 }, (_, i) => P(`p${String(i).padStart(2, "0")}`, `T${i}`, 30 - i, 3 + i * 0.1));

describe("the shape is Josh's, verbatim", () => {
  it("2-5 tickets · 3-8 players each · limited repeats", () => {
    expect(FUN_SHAPE).toEqual({ tickets: { min: 2, max: 5 }, legs: { min: 3, max: 8 }, repeatCap: 2 });
  });
});

describe("buildFunHrTickets — the composer's rules, each with a plant", () => {
  it("a healthy pool builds 2-5 tickets, every ticket 3-8 legs, stakes summing EXACTLY the amount", () => {
    const out = buildFunHrTickets(WIDE, 25, new Set());
    expect(out.tickets.length).toBeGreaterThanOrEqual(FUN_SHAPE.tickets.min);
    expect(out.tickets.length).toBeLessThanOrEqual(FUN_SHAPE.tickets.max);
    for (const t of out.tickets) {
      expect(t.legs.length).toBeGreaterThanOrEqual(FUN_SHAPE.legs.min);
      expect(t.legs.length).toBeLessThanOrEqual(FUN_SHAPE.legs.max);
      expect(t.stake).toBeGreaterThan(0);
    }
    expect(out.sum).toBe(25);
    expect(out.tickets.reduce((a, t) => a + t.stake, 0)).toBe(25);
  });

  it("TEAM PLANT: two Yankees in the pool never share a ticket", () => {
    const pool = [P("judge", "NYY", 35, 2.8), P("stanton", "NYY", 30, 3.2), ...WIDE.slice(0, 10)];
    const out = buildFunHrTickets(pool, 25, new Set());
    expect(out.tickets.length).toBeGreaterThan(0);
    for (const t of out.tickets) {
      const teams = t.legs.map((l) => l.team);
      expect(new Set(teams).size, `same team twice on one ticket: ${teams.join(",")}`).toBe(teams.length);
    }
  });

  it("REPEAT PLANT: no player appears on more than repeatCap tickets", () => {
    const out = buildFunHrTickets(WIDE, 25, new Set());
    const count = new Map<string, number>();
    for (const t of out.tickets) for (const l of t.legs) count.set(l.player, (count.get(l.player) ?? 0) + 1);
    for (const [p, n] of count) expect(n, `${p} appears ${n}x`).toBeLessThanOrEqual(FUN_SHAPE.repeatCap);
  });

  it("tickets are DISTINCT — rotation means no two tickets carry an identical leg set", () => {
    const out = buildFunHrTickets(WIDE, 25, new Set());
    const keys = out.tickets.map((t) => t.legs.map((l) => l.player).sort().join("|"));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("legs already used elsewhere on the card are excluded (the no-repeated-pick day rule)", () => {
    const used = new Set([`${WIDE[0].label}|${WIDE[0].prop}`]);
    const out = buildFunHrTickets(WIDE, 25, used);
    for (const t of out.tickets) for (const l of t.legs) expect(`${l.label}|${l.prop}`).not.toBe(`${WIDE[0].label}|${WIDE[0].prop}`);
  });

  it("THIN-POOL HONESTY: two teams can never seat a 3-leg team-disjoint ticket — zero tickets, a note, never a fake", () => {
    const pool = [P("a", "NYY", 30, 3), P("b", "NYY", 28, 3), P("c", "BOS", 26, 3), P("d", "BOS", 24, 3)];
    const out = buildFunHrTickets(pool, 25, new Set());
    expect(out.tickets).toHaveLength(0);
    expect(out.sum).toBe(0);
    expect(out.note).toMatch(/pool/i);
  });

  it("ticket prices are the PRODUCT of the legs' own numbers — dec, prob, and EV all derived, nothing invented", () => {
    const out = buildFunHrTickets(WIDE.slice(0, 6), 25, new Set());
    const t = out.tickets[0];
    const dec = t.legs.reduce((a, l) => a * l.dec, 1);
    expect(t.czDec).toBeCloseTo(dec, 6);
    const prob = t.legs.reduce((a, l) => a * (l.prob / 100), 1) * 100;
    expect(t.prob).toBeCloseTo(prob, 6);
  });

  it("deterministic: the same pool composes the same tickets, byte for byte", () => {
    const a = JSON.stringify(buildFunHrTickets(WIDE, 25, new Set()));
    const b = JSON.stringify(buildFunHrTickets([...WIDE], 25, new Set()));
    expect(a).toBe(b);
  });

  it("stake split: $25 over 5 → all $5; over 2 → $13/$12 (remainder rides the first)", () => {
    const five = buildFunHrTickets(WIDE, 25, new Set());
    if (five.tickets.length === 5) expect(five.tickets.map((t) => t.stake)).toEqual([5, 5, 5, 5, 5]);
    const two = buildFunHrTickets(WIDE.slice(0, 8), 25, new Set());
    if (two.tickets.length === 2) expect(two.tickets.map((t) => t.stake)).toEqual([13, 12]);
  });
});

describe("wired — source scans, comment-stripped", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const read = (p: string) => strip(fs.readFileSync(path.join(process.cwd(), p), "utf8"));

  it("lock-card composes fun from the board's HR rows — shFunPick is retired from the paper path", () => {
    const src = read("src/lib/server/lock-card.ts");
    expect(src).toMatch(/buildFunHrTickets/);
    expect(src).toMatch(/batter_home_runs/);
    expect(src).not.toMatch(/shFunPick/);
  });
});
