import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GenOptions, OPTIONS_SHOWN, optionsTitle, sortOptions } from "@/components/props/GenOptions";
import { buildPool } from "@/components/props/mlb-gen-pool";
import { generate, mixCandidates, openOptions, specSeed, type GenLeg, type GenSpec } from "@/lib/parlay-gen";
import type { PropBoardGame } from "@/engine";

/**
 * 2026-11-15, Josh, verbatim: "when on parlay builder, after generating picks etc. i should be able to click a button
 * or dropdown that displays all possible picks in those filters so if i have 3/4 picks i like & I keep spinning to get
 * the same 5 or 6 guys as my 4th leg on the parlay, i can click that to see if there are only 6 options or 20 options
 * to help make my last leg decision easier".
 *
 * Every price below comes from tests/fixtures/gen-pool.json (real engine output over the repo's captured odds
 * fixtures), the same board the generator's own tests use. No number here was made up.
 */
vi.stubGlobal("React", React);
(globalThis as { React?: typeof React }).React = React;

const root = path.join(__dirname, "..");
const PROP_BOARD = (JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/gen-pool.json"), "utf8")) as { propBoard: PropBoardGame[] }).propBoard;

const SPEC: GenSpec = {
  market: "batter_hits_runs_rbis", legs: 4, legMinAm: -152, legMaxAm: 110, payout: null, sides: "o",
  onePerGame: false, czOnly: false, includeStarted: false, modelOnly: false, pinned: [null, null, null, null],
};
const POOL = buildPool(PROP_BOARD, SPEC, 0);
const spin = (spec: GenSpec, roll: number) => generate(POOL, spec, specSeed(spec, "2026-07-10", roll));
const FIRST = spin(SPEC, 0);
if (!FIRST.ok) throw new Error("fixture no longer fills four slots");
const LEGS = FIRST.ticket.legs;
/* three locked, the fourth slot open: Josh's own case */
const LOCK3: GenSpec = { ...SPEC, pinned: [LEGS[0].id, LEGS[1].id, LEGS[2].id, null] };
const ids = (legs: readonly GenLeg[]) => legs.map((l) => l.id).sort();
const mark = () => null;
const view = (spec: GenSpec, over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(GenOptions, { pool: POOL, spec, ticketIds: [], renderMark: mark, startOpen: true, ...over } as Parameters<typeof GenOptions>[0]));

describe("openOptions: every pick a spin can put in an open slot", () => {
  it("with nothing locked it is exactly the generator's own candidate set", () => {
    const o = openOptions(POOL, SPEC);
    expect(ids(o.legs)).toEqual(ids(mixCandidates(POOL, SPEC)));
    expect(o.legs.length).toBeGreaterThan(4);
    expect([o.locked, o.open]).toEqual([0, 4]);
    expect(o.players).toBe(new Set(o.legs.map((l) => l.playerKey)).size);
  });

  it("with three locked, no option is a locked leg or a locked player, and every option is inside the odds band", () => {
    const o = openOptions(POOL, LOCK3);
    expect([o.locked, o.open]).toEqual([3, 1]);
    const lockedPlayers = new Set(LEGS.slice(0, 3).map((l) => l.playerKey));
    expect(o.legs.length).toBeGreaterThan(0);
    for (const l of o.legs) {
      expect(lockedPlayers.has(l.playerKey)).toBe(false);
      expect(l.dec).toBeGreaterThanOrEqual(1.657894);
      expect(l.dec).toBeLessThanOrEqual(2.1);
      expect(l.side).toBe("o");
    }
    expect(o.legs.length).toBeLessThan(openOptions(POOL, SPEC).legs.length);
  });

  it("every fourth leg a spin lands on is in the list: 60 spins, none outside it", () => {
    const allowed = new Set(openOptions(POOL, LOCK3).legs.map((l) => l.id));
    const seen = new Set<string>();
    for (let roll = 0; roll < 60; roll++) {
      const r = spin(LOCK3, roll);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.ticket.legs.slice(0, 3).map((l) => l.id)).toEqual(LOCK3.pinned.slice(0, 3));
      expect(allowed.has(r.ticket.legs[3].id)).toBe(true);
      seen.add(r.ticket.legs[3].id);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("one leg per game: an option never shares a game with a locked pick", () => {
    const cands = mixCandidates(POOL, SPEC);
    const pin = cands.find((a) => cands.some((b) => b.gameKey === a.gameKey && b.playerKey !== a.playerKey))!;
    const spec: GenSpec = { ...SPEC, legs: 2, onePerGame: true, pinned: [pin.id, null] };
    const o = openOptions(POOL, spec);
    expect(o.legs.length).toBeGreaterThan(0);
    expect(o.legs.some((l) => l.gameKey === pin.gameKey)).toBe(false);
    const loose = openOptions(POOL, { ...spec, onePerGame: false });
    expect(loose.legs.some((l) => l.gameKey === pin.gameKey)).toBe(true);
  });

  it("one leg per team: an option never shares a team with a locked pick", () => {
    const cands = mixCandidates(POOL, SPEC);
    const withTeam = cands.find((a) => a.team != null && cands.some((b) => b.team === a.team && b.playerKey !== a.playerKey))!;
    const spec: GenSpec = { ...SPEC, legs: 2, onePerTeam: true, pinned: [withTeam.id, null] };
    expect(openOptions(POOL, spec).legs.some((l) => l.team === withTeam.team)).toBe(false);
    expect(openOptions(POOL, { ...spec, onePerTeam: false }).legs.some((l) => l.team === withTeam.team && l.playerKey !== withTeam.playerKey)).toBe(true);
  });

  it("every slot locked: nothing to list, and it says how many are locked", () => {
    const o = openOptions(POOL, { ...SPEC, pinned: LEGS.map((l) => l.id) });
    expect([o.legs.length, o.players, o.locked, o.open]).toEqual([0, 0, 4, 0]);
  });

  it("a filter narrows the list the same way it narrows a spin", () => {
    const game = LEGS[3].gameKey;
    const o = openOptions(POOL, { ...LOCK3, games: [game] });
    expect(o.legs.every((l) => l.gameKey === game)).toBe(true);
    expect(openOptions(POOL, { ...LOCK3, legMinAm: -110, legMaxAm: -105 }).legs.every((l) => l.am <= -105 && l.am >= -110)).toBe(true);
    expect(openOptions(POOL, { ...LOCK3, noMarkets: true }).legs).toEqual([]);
  });

  it("every category once: with one open slot and one category still missing, only that category is listed", () => {
    const two: GenSpec = { ...SPEC, legs: 2, markets: ["batter_hits_runs_rbis", "batter_total_bases"], spread: true, pinned: [null, null] };
    const pool = buildPool(PROP_BOARD, two, 0);
    const all = openOptions(pool, two).legs;
    const markets = new Set(all.map((l) => l.market));
    if (markets.size < 2) return; // the fixture posts one of the two only: nothing to prove
    const hrr = all.find((l) => l.market === "batter_hits_runs_rbis")!;
    const locked = openOptions(pool, { ...two, pinned: [hrr.id, null] });
    expect(locked.legs.length).toBeGreaterThan(0);
    expect(locked.legs.every((l) => l.market === "batter_total_bases")).toBe(true);
    expect(openOptions(pool, { ...two, spread: false, pinned: [hrr.id, null] }).legs.some((l) => l.market === "batter_hits_runs_rbis")).toBe(true);
  });
});

describe("the order and the header", () => {
  const legs = openOptions(POOL, LOCK3).legs;
  it("best chance first, shortest odds first, longest odds first", () => {
    const chance = sortOptions(legs, "chance").map((l) => l.prob);
    expect(chance).toEqual(chance.slice().sort((a, b) => b - a));
    const short = sortOptions(legs, "short").map((l) => l.dec);
    expect(short).toEqual(short.slice().sort((a, b) => a - b));
    const long = sortOptions(legs, "long").map((l) => l.dec);
    expect(long).toEqual(long.slice().sort((a, b) => b - a));
    expect(ids(sortOptions(legs, "long"))).toEqual(ids(legs));
  });

  it("the header says what the list is for and counts picks and players", () => {
    expect(optionsTitle({ legs: new Array(6).fill(null), players: 5, locked: 3, open: 1 } as never)).toEqual({ lead: "Every pick that fits your 1 open slot", count: "6 picks · 5 players" });
    expect(optionsTitle({ legs: [null], players: 1, locked: 2, open: 2 } as never)).toEqual({ lead: "Every pick that fits your 2 open slots", count: "1 pick · 1 player" });
    expect(optionsTitle({ legs: new Array(20).fill(null), players: 20, locked: 0, open: 4 } as never)).toEqual({ lead: "Every pick that fits these filters", count: "20 picks · 20 players" });
    expect(optionsTitle({ legs: [], players: 0, locked: 1, open: 1 } as never).count).toBe("none");
    expect(optionsTitle({ legs: [], players: 0, locked: 4, open: 0 } as never)).toEqual({ lead: "Every slot is locked", count: "unlock one to see what else fits" });
  });
});

describe("GenOptions: the fold under the ticket", () => {
  const o = openOptions(POOL, LOCK3);
  const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

  it("closed, it still shows the count, and lists nothing", () => {
    const out = view(LOCK3, { startOpen: false });
    expect(out).toContain('data-testid="gen-options"');
    expect(out).toContain('aria-expanded="false"');
    expect(out).toContain(`${o.legs.length} pick${o.legs.length === 1 ? "" : "s"} · ${o.players} player${o.players === 1 ? "" : "s"}`);
    expect(out).toContain("Every pick that fits your 1 open slot");
    expect(count(out, /data-gen-option="/g)).toBe(0);
  });

  it("open, it lists one row per possible pick with its line, price and estimate", () => {
    const out = view(LOCK3);
    expect(out).toContain('aria-expanded="true"');
    expect(count(out, /data-gen-option="/g)).toBe(Math.min(o.legs.length, OPTIONS_SHOWN));
    const best = sortOptions(o.legs, "chance")[0];
    expect(out).toContain(`${best.prob.toFixed(1)}%`);
    expect(out).toContain("H+R+RBI Over ");
    expect(out).toContain("beside your 3 locked picks");
    expect(out.indexOf(`data-gen-option="${best.id}"`)).toBeLessThan(out.indexOf(`data-gen-option="${sortOptions(o.legs, "chance").at(-1)!.id}"`));
  });

  it("marks the pick already on the ticket, and no other", () => {
    const on = o.legs[0];
    const out = view(LOCK3, { ticketIds: [on.id] });
    expect(count(out, />on ticket</g)).toBe(1);
    expect(count(view(LOCK3), />on ticket</g)).toBe(0);
  });

  it("a long list is capped and says so", () => {
    const wide: GenSpec = { ...SPEC, legMinAm: -100000, legMaxAm: 100000, sides: "both" };
    const all = openOptions(POOL, wide).legs.length;
    const out = view(wide);
    expect(count(out, /data-gen-option="/g)).toBe(Math.min(all, OPTIONS_SHOWN));
    if (all > OPTIONS_SHOWN) expect(out).toContain(`Showing the first ${OPTIONS_SHOWN} of ${all}.`);
  });

  it("says so in words when every slot is locked, and when nothing fits", () => {
    expect(view({ ...SPEC, pinned: LEGS.map((l) => l.id) })).toContain("All 4 slots are locked");
    const none = view({ ...LOCK3, legMinAm: 90000, legMaxAm: 99000 });
    expect(none).toContain("No pick on this board fits beside your locked picks.");
    expect(count(none, /data-gen-option="/g)).toBe(0);
  });

  it("the generator sheet mounts it under the ticket, once", () => {
    const src = fs.readFileSync(path.join(root, "src/components/props/GenSheet.tsx"), "utf8");
    expect(count(src, /<GenOptions /g)).toBe(1);
    expect(src).toContain("<GenOptions pool={pool} spec={spec}");
  });
});
