import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { stripComments } from "./helpers/source";
import { generate, poolOf, type GenLeg, type GenMemo, type GenSpec } from "@/lib/parlay-gen";
import { amToDec } from "@/lib/ticket-math";
import { landAtMs, OddsTicker, REEL_BASE_MS, REEL_STAGGER_MS, startReveal } from "@/components/props/ParlayReveal";

/**
 * 2026-09-26, Josh, verbatim:
 *   "1. Parlay Builder is moving EXTREMELY SLOW 2. Game start slider is very glitchy, not responding for 5-10
 *    seconds, needs to have immediate response and drag with cursor as I drag it not delayed. Should go in 30 minute
 *    increments. … 3. 'Customize Your Picks' categories dont need to be listed left to right as they are already
 *    included in 'Markets' dropdown 4. Game Start slider doesn't need to be that long … 6. Make the parlay generation
 *    more interactive like some kind of spinnings wheel, reveal, etc"
 */
// vitest compiles JSX with the classic runtime — the component output references a global React
(globalThis as { React?: typeof React }).React = React;

const read = (rel: string) => stripComments(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));

describe("the game start slider drags locally and commits once, on release", () => {
  const src = read("src/components/props/GameTimeRange.tsx");
  it("steps in half hours from the slate's own floor", () => {
    expect(src).toMatch(/step=\{TIME_STEP\}/);
    expect(src).toMatch(/bounds = DEFAULT_TIME_BOUNDS/);
  });
  it("a drag moves a local draft; the parent hears one change, inside a transition", () => {
    expect(src).toMatch(/startTransition\(\(\) => onChange\(next\)\)/);
    expect(src).toMatch(/addEventListener\("change"/);
    expect(src).toMatch(/onBlur=/);
  });
  it("both thumbs at the ends of the track read as 'all times'", () => {
    expect(src).toMatch(/ALL_DAY/);
  });
  it("is capped short — it no longer spans the whole panel", () => {
    expect(src).toMatch(/max-w-\[15rem\]/);
  });
});

describe("Customize Your Picks keeps its categories in the Markets dropdown only", () => {
  it("the left-to-right category rail is gone from the ranked list and from the filter component", () => {
    const ranked = read("src/components/props/RankedPicks.tsx");
    expect(ranked).not.toMatch(/ranked-market-rail/);
    expect(read("src/components/props/DiscoveryFilters.tsx")).not.toMatch(/categoryRail/);
    expect(fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8")).not.toMatch(/\.ranked-market-rail/);
    /* the dropdown still drives the same market filter (MLB's controlled rail stays in sync) */
    expect(ranked).toMatch(/if\(v\.markets\.length===1\)pick\(v\.markets\[0\]\)/);
  });
});

describe("the builder does its per-pool work once", () => {
  const legs: GenLeg[] = [];
  for (let g = 0; g < 6; g++) for (let p = 0; p < 8; p++) for (const side of ["o", "u"] as const) {
    const am = [-150, 110, 140, 180, 240][(g + p) % 5];
    legs.push({ id: `g${g}|p${p}|${side}`, am, prob: 100 / amToDec(am) + ((g * p) % 5) - 2, side, label: `P${g}-${p}`, sub: "hits o0.5", leg: null, dec: amToDec(am), gameKey: `g${g}`, start: `2026-09-26T${17 + g}:05:00Z`, playerKey: `g${g}p${p}`, team: `T${g}${p % 2}`, started: false, alt: false, book: "DK", ev: 0.02 * ((g + p) % 3) - 0.02, market: "hits", line: 0.5, sport: "mlb", src: "model" } as GenLeg);
  }
  const pool = poolOf(legs, { rows: legs.length, startedDropped: 0, noParlayDropped: 0 });
  const spec: GenSpec = { market: "hits", markets: ["hits"], legs: 3, legMinAm: -250, legMaxAm: 300, payout: null, sides: "both", onePerGame: true, onePerTeam: true, czOnly: false, includeStarted: false, modelOnly: false, pinned: [], style: "balanced" };
  it("a shared memo returns exactly what a fresh call returns, seed by seed (the strategy loop's 32 runs)", () => {
    const memo: GenMemo = {};
    for (let seed = 1; seed <= 20; seed++) {
      expect(generate(pool, spec, seed * 97, undefined, undefined, memo)).toEqual(generate(pool, spec, seed * 97));
    }
    const pay: GenSpec = { ...spec, style: undefined, payout: { minAm: 400, maxAm: 1500 } };
    const payMemo: GenMemo = {};
    for (let seed = 1; seed <= 10; seed++) {
      expect(generate(pool, pay, seed, undefined, undefined, payMemo)).toEqual(generate(pool, pay, seed));
    }
  });
  it("strategyGenerate hands its runs one memo", () => {
    const strat = read("src/lib/parlay-strategy.ts");
    expect(strat).toMatch(/const memo:GenMemo=\{\};/);
    expect(strat).toMatch(/run\(p,clean,\(seed\+i\*997\)>>>0,avoid,recent,memo\)/);
  });
  it("the sheet memoises its pool passes instead of recounting on every render", () => {
    const sheet = read("src/components/props/GenSheet.tsx");
    expect(sheet).toMatch(/useMemo\(\(\) => poolCounts\(pool, spec\), \[pool, spec\]\)/);
    expect(sheet).toMatch(/useMemo\(\(\) => availableLegBand\(pool, spec\), \[pool, spec\]\)/);
  });
});

describe("the reveal — a slot machine over real legs", () => {
  it("unlocked slots land top to bottom on a fixed stagger", () => {
    expect(landAtMs(0)).toBe(REEL_BASE_MS);
    expect(landAtMs(3)).toBe(REEL_BASE_MS + 3 * REEL_STAGGER_MS);
  });
  it("nothing spins when every slot is locked", () => {
    expect(startReveal(1, 0)).toBeNull();
  });
  it("the combined odds settle on the ticket's own price, and show nothing invented while spinning", () => {
    expect(renderToStaticMarkup(createElement(OddsTicker, { am: 612, reveal: null }))).toBe("+612");
    expect(renderToStaticMarkup(createElement(OddsTicker, { am: 612, reveal: { spin: 1, at: 0, end: 900 } }))).toBe('<span aria-hidden="true">···</span>');
  });
  it("the reel faces come from the pool's own legs and the Generate press starts the reveal", () => {
    const sheet = read("src/components/props/GenSheet.tsx");
    expect(sheet).toMatch(/<ReelOverlay/);
    /* 2026-09-26 follow-up: the press HOLDS the reels; they land from the render where the spin's own ticket exists
       (spinKey moved), never from the press — see tests/gen-hold-drag.test.ts */
    expect(sheet).toMatch(/setHeld\(\{ reveal: holdReveal\(-next, performance\.now\(\)\) \}\)/);
    expect(sheet).toMatch(/setReveal\(startReveal\(spinKey,/);
    expect(sheet).not.toMatch(/Math\.random/);
    const css = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toMatch(/\.gen-reel\s*\{\s*display:\s*none/);
  });
});
