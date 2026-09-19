/**
 * R2b — ONE LEG PER TEAM (2026-09-18). Josh, verbatim: "Add filter on parlay generator alongside
 * 'Two legs from one game' that says 'Two legs from one team' so i can prevent a 3 teamer from
 * having 2 players from same team".
 *
 * The rule reads the adapter's folded `team` tag on every leg; a leg without one is never blocked
 * by it. It is OFF when a spec does not carry it (so every pinned fixture in tests/parlay-gen.test.ts
 * still mints its exact ticket) and ON by default on both desks, relaxed only by the user from the
 * sheet — the same shape as the one-per-game rule beside it.
 *
 * Every price below is tests/fixtures/gen-pool.json's own (6 games / 289 rows). The H+R+RBI overs
 * priced inside Josh's band sit in 3 games, and the Phillies game carries all but one of them —
 * which is exactly the slate the rule exists for.
 */
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fx from "./fixtures/gen-pool.json";
import { stripComments } from "./helpers/source";
import type { PropBoardGame } from "@/engine";
import { GenSheet, genFailLine } from "@/components/props/GenSheet";
import { MLB_GEN_MARKETS, buildPool } from "@/components/props/mlb-gen-pool";
import { generate, poolOf, specSeed, ticketOf, type GenLeg, type GenResult, type GenSpec } from "@/lib/parlay-gen";
import type { SandboxLeg } from "@/lib/ticket-math";

(globalThis as { React?: typeof React }).React = React;
vi.mock("@/components/motion/Reveal", () => ({ Reveal: ({ children }: { children: unknown }) => children }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("tab=batter&mkt=hrr") }));
vi.mock("@/lib/sport", () => ({ useSport: () => "mlb", setSport: () => {} }));
vi.mock("@/lib/mlb-visuals", async (orig) => ({
  ...(await orig<typeof import("@/lib/mlb-visuals")>()),
  useHeadshots: () => ({}),
}));

const root = path.join(__dirname, "..");
const readSrc = (p: string) => stripComments(fs.readFileSync(path.join(root, p), "utf8"));
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

const board = fx.propBoard as unknown as PropBoardGame[];
const HRR = "batter_hits_runs_rbis";
const HITS = "batter_hits";

/** Josh's band and shape with two-legs-from-one-game ON, so the team rule is the one that binds */
const spec = (o: Partial<GenSpec> = {}): GenSpec => {
  const legs = o.legs ?? 4;
  return {
    market: HRR, legs, legMinAm: -152, legMaxAm: 110, payout: null, sides: "o",
    onePerGame: false, onePerTeam: true, czOnly: false, pricingBook: "CZ", includeStarted: false, modelOnly: false,
    pinned: new Array(legs).fill(null), ...o,
  };
};
const poolFor = (s: GenSpec) => buildPool(board, s, 0);
const ok = (r: GenResult<SandboxLeg>) => { if (!r.ok) throw new Error(`expected a ticket, got ${JSON.stringify(r.fail)}`); return r.ticket; };
const fail = (r: GenResult<SandboxLeg>) => { if (r.ok) throw new Error("expected a failure, got a ticket"); return r.fail; };
const teamsOf = (legs: readonly GenLeg[]) => legs.map((l) => l.team);
const noRepeat = (xs: readonly (string | null)[]) => new Set(xs.filter((t) => t != null)).size === xs.filter((t) => t != null).length;

describe("R2b on the fixture board — the Phillies game carries the in-band H+R+RBI overs", () => {
  it("asks for 4 with the game rule OFF and the team rule ON: 3 teams post in-band overs, and it names the team switch", () => {
    const s = spec();
    expect(fail(generate(poolFor(s), s, 12345))).toEqual({ code: "short-pool", have: 3, want: 4, relax: "same-team" });
  });
  it("3 legs fill — three different clubs, on every seed", () => {
    const s = spec({ legs: 3 });
    const pool = poolFor(s);
    for (let seed = 1; seed <= 30; seed++) {
      const t = ok(generate(pool, s, seed));
      expect(t.legs).toHaveLength(3);
      expect(noRepeat(teamsOf(t.legs))).toBe(true);
      expect(t.sameTeam).toEqual([]);
    }
    expect(teamsOf(ok(generate(pool, s, 12345)).legs)).toEqual(["PHI", "CHC", "MIA"]);
  });
  it("with the team rule switched off BY THE USER the same 4-leg ask fills — three Phillies — and the ticket SAYS so", () => {
    const s = spec({ onePerTeam: false });
    const t = ok(generate(poolFor(s), s, 12345));
    expect(t.legs).toHaveLength(4);
    expect(teamsOf(t.legs).filter((x) => x === "PHI")).toHaveLength(3);
    expect(t.sameTeam).toEqual(["PHI"]); // flagged, never hidden
    expect(t.sameGame).toEqual(["philadelphiaphillies@detroittigers"]);
  });
  it("a spec without the control behaves exactly as OFF — same seed, same ticket (the pinned fixtures never move)", () => {
    const off = spec({ onePerTeam: false });
    const { onePerTeam: _drop, ...absent } = off;
    expect(specSeed(absent, "2026-07-10", 0)).toBe(specSeed(off, "2026-07-10", 0));
    expect(ok(generate(poolFor(absent), absent, 12345)).key).toBe(ok(generate(poolFor(off), off, 12345)).key);
    /* and ON changes the seed, so a spin under the rule is its own walk */
    expect(specSeed(spec(), "2026-07-10", 0)).not.toBe(specSeed(off, "2026-07-10", 0));
  });
  it("both sides of the hits market, 4 legs, 25 seeds: no club is ever repeated", () => {
    const s = spec({ market: HITS, sides: "both" });
    const pool = poolFor(s);
    expect(new Set(pool.legs.map((l) => l.team)).size).toBe(10);
    for (let seed = 1; seed <= 25; seed++) {
      const t = ok(generate(pool, s, seed));
      expect(t.legs).toHaveLength(4);
      expect(noRepeat(teamsOf(t.legs))).toBe(true);
    }
  });
  it("a combined-payout ticket keeps the rule through the repair swaps", () => {
    const s = spec({ market: HITS, sides: "both", payout: { minAm: 400, maxAm: 1500 } });
    const pool = poolFor(s);
    for (let seed = 1; seed <= 10; seed++) {
      const r = generate(pool, s, seed);
      if (!r.ok) continue; // the band may be out of reach on a seed; a ticket that IS returned must honour the rule
      expect(noRepeat(teamsOf(r.ticket.legs))).toBe(true);
    }
  });
});

describe("R2b and the relax hint order", () => {
  it("with BOTH rules on, the game switch is named first (it is the one that opens the pool up), then the team switch", () => {
    const both = spec({ onePerGame: true, onePerTeam: true });
    expect(fail(generate(poolFor(both), both, 12345))).toEqual({ code: "short-pool", have: 3, want: 4, relax: "same-game" });
    const gameOff = spec({ onePerGame: false, onePerTeam: true });
    expect(fail(generate(poolFor(gameOff), gameOff, 12345)).code === "short-pool" && (fail(generate(poolFor(gameOff), gameOff, 12345)) as { relax: string }).relax).toBe("same-team");
  });
});

describe("R2b and kept slots", () => {
  const s = spec({ onePerTeam: false });
  const t = ok(generate(poolFor(s), s, 12345));
  const phils = t.legs.filter((l) => l.team === "PHI");
  it("two kept Phillies under the rule is a pin conflict the sheet words as the team", () => {
    const pinnedSpec = spec({ pinned: [phils[0].id, phils[1].id, null, null] });
    const f = fail(generate(poolFor(pinnedSpec), pinnedSpec, 1));
    expect(f).toEqual({ code: "pin-conflict", ids: [phils[0].id, phils[1].id], why: "same-team" });
    expect(genFailLine(f, { marketLabel: "H+R+RBI", legs: 4, loAm: -152, hiAm: 110 }))
      .toBe('Two kept slots are on the same team — turn on "two legs from one team" or unpin one of them.');
  });
  it("…and with the game rule ALSO on, the game is named first — the two rules keep their order", () => {
    const pinnedSpec = spec({ onePerGame: true, pinned: [phils[0].id, phils[1].id, null, null] });
    expect(fail(generate(poolFor(pinnedSpec), pinnedSpec, 1))).toMatchObject({ code: "pin-conflict", why: "same-game" });
  });
  it("one kept Philly blocks every other Philly from the free slots", () => {
    const pinnedSpec = spec({ legs: 3, pinned: [phils[0].id, null, null] });
    for (let seed = 1; seed <= 10; seed++) {
      const tk = ok(generate(poolFor(pinnedSpec), pinnedSpec, seed));
      expect(tk.legs[0].id).toBe(phils[0].id);
      expect(teamsOf(tk.legs).filter((x) => x === "PHI")).toHaveLength(1);
    }
  });
});

/* ---- a doubleheader, built by hand: one club with legs in two games, both rules on */
type P = { tag: string };
const mk = (id: string, gameKey: string, team: string | null, am: number, prob: number): GenLeg<P> => {
  const dec = am > 0 ? 1 + am / 100 : 1 + 100 / -am;
  return { id, am, prob, side: "o", label: id, sub: "Hits Over 0.5", leg: { tag: id }, dec, gameKey, playerKey: id, team, started: false, alt: false, book: "DK", ev: (prob / 100) * dec - 1, market: HITS };
};
const dh = poolOf<P>(
  [mk("tx", "g1", "T", -120, 58), mk("ty", "g2", "T", -110, 56), mk("b", "g2", "B", 105, 50), mk("n", "g2", null, -130, 60)],
  { rows: 4, startedDropped: 0, noParlayDropped: 0 },
);
const dhSpec = (o: Partial<GenSpec> = {}): GenSpec => ({
  market: HITS, legs: 2, legMinAm: -200, legMaxAm: 200, payout: null, sides: "o",
  onePerGame: true, onePerTeam: true, czOnly: false, includeStarted: false, modelOnly: false, pinned: [null, null], ...o,
});
describe("R2b on a doubleheader — a club with legs in two games", () => {
  it("2 legs with both rules on always fill (the lookahead arms on the club, not only on a player): tx + one of g2's non-T legs", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const t = ok(generate(dh, dhSpec(), seed));
      const ids = t.legs.map((l) => l.id).sort();
      expect(ids[0] === "tx" || ids[1] === "tx").toBe(true);
      expect(ids).not.toContain("ty");
      expect(noRepeat(teamsOf(t.legs))).toBe(true);
    }
  });
  it("3 legs cannot fit — two games, one club, and the untagged leg shares g2 — and the failure is exact", () => {
    const s = dhSpec({ legs: 3, pinned: [null, null, null] });
    expect(fail(generate(dh, s, 1))).toEqual({ code: "short-pool", have: 2, want: 3, relax: "same-game" });
  });
  it("with the game rule off, the club still sits once and the untagged leg is never blocked by the team rule", () => {
    const s = dhSpec({ legs: 3, onePerGame: false, pinned: [null, null, null] });
    const t = ok(generate(dh, s, 1));
    const ids = t.legs.map((l) => l.id).sort();
    expect(ids).toEqual(expect.arrayContaining(["b", "n"])); // b and the untagged leg both sit, g2 shared
    expect(ids.filter((id) => id === "tx" || id === "ty")).toHaveLength(1); // the club exactly once
    expect(teamsOf(t.legs).filter((x) => x === "T")).toHaveLength(1);
    expect(t.sameTeam).toEqual([]);
  });
});

/* ---- the sheet */
const SPEC = spec();
const POOL = poolFor(SPEC);
const sheet = (over: Record<string, unknown> = {}) =>
  html(createElement(GenSheet, {
    market: SPEC.market, marketLabel: "H+R+RBI", markets: MLB_GEN_MARKETS, pool: POOL, spec: SPEC, onSpec: () => {},
    result: generate(POOL, SPEC, 12345), onGenerate: () => {}, onTogglePin: () => {}, onAdd: () => {}, canUndo: false, onUndo: () => {},
    open: true, onOpen: () => {}, boardAt: null, ...over,
  } as Parameters<typeof GenSheet>[0]));

describe("the sheet: the toggle sits beside 'Two legs from one game', and the failure names the switch", () => {
  it("renders the toggle, OFF under the rule and ON when relaxed, after the game toggle", () => {
    const out = sheet();
    expect(out).toMatch(/aria-pressed="false"[^>]*>[^<]*<span[^>]*>Two legs from one team</);
    expect(out.indexOf("Two legs from one game")).toBeLessThan(out.indexOf("Two legs from one team"));
    expect(sheet({ spec: { ...SPEC, onePerTeam: false } })).toMatch(/aria-pressed="true"[^>]*>[^<]*<span[^>]*>Two legs from one team</);
    /* a spec without the control renders it as ON — undefined is OFF for the rule, so "allowed" */
    const { onePerTeam: _drop, ...absent } = SPEC;
    expect(sheet({ spec: absent })).toMatch(/aria-pressed="true"[^>]*>[^<]*<span[^>]*>Two legs from one team</);
  });
  it("the short-pool failure offers 'Allow two legs from one team' as the one-tap fix, and only sets that switch", () => {
    const out = sheet();
    expect(out).toContain('data-testid="gen-fail"');
    expect(out).toContain("Allow two legs from one team");
    expect(out).toContain('turn on &quot;two legs from one team&quot; and it may fit');
    const src = readSrc("src/components/props/GenSheet.tsx");
    expect(src).toContain('"same-team": { onePerTeam: false },');
    expect(src).toContain('"same-team": "Allow two legs from one team",');
  });
  it("a ticket that stacks a club says so — with the game note when they share the game, on its own otherwise", () => {
    const off = spec({ onePerTeam: false });
    const t = ok(generate(poolFor(off), off, 12345));
    const both = sheet({ spec: off, result: { ok: true, ticket: t } });
    expect(both).toContain("1 game carries more than one leg — same-game legs are correlated, and the combined % below does not model that. 1 team carries more than one leg.");
    /* the same three Phillies re-keyed into three different games: a doubleheader-shaped stack */
    const spread = t.legs.map((l, i) => ({ ...l, gameKey: `g${i}` }));
    const tk = ticketOf(spread, off, 1);
    expect(tk.sameGame).toEqual([]);
    expect(tk.sameTeam).toEqual(["PHI"]);
    const teamOnly = sheet({ spec: off, result: { ok: true, ticket: tk } });
    expect(teamOnly).toContain("1 team carries more than one leg — same-team legs are correlated, and the combined % below does not model that.");
    expect(teamOnly).not.toContain("game carries");
  });
  it("both desks default the rule ON, beside the game rule", () => {
    for (const p of ["app/props/page.tsx", "src/components/cfb/CfbProps.tsx"]) {
      expect(readSrc(p)).toMatch(/onePerGame: true,\s*onePerTeam: true,/);
    }
  });
});
