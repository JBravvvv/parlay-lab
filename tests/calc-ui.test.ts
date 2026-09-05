import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stripComments } from "./helpers/source";

/**
 * PARLAY CALC UI PINS (INSTRUCTION 40, 2026-09-05) — source-level guards on the rebuilt
 * calculator. Josh: "Make the UI on the Parlay Calc significantly more intriguing to use."
 * The rules these pin: every input is a ≥44px numeric/decimal box; no blur filter on any
 * calc surface (iOS freeze); no history-pushing navigation; every number on the page
 * comes from src/lib/calc-math.ts (the page never does its own arithmetic on prices);
 * and the original functions — two starting legs, "+ a leg", Wins and Pays — survive.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const BLUR = /backdrop-filter|backdrop-blur/;

const PAGE = "app/calc/page.tsx";

/** every opening `<tag …>` in a file, brace-aware (attributes hold arrow functions with `=>`) */
function openingTags(src: string, tag: string): string[] {
  const out: string[] = [];
  let i = src.indexOf(`<${tag}`);
  while (i !== -1) {
    const after = src[i + tag.length + 1];
    if (after !== undefined && /[\s\n/>]/.test(after)) {
      let depth = 0;
      let j = i;
      for (; j < src.length; j++) {
        const ch = src[j];
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
        else if (ch === ">" && depth === 0) break;
      }
      out.push(src.slice(i, j + 1));
    }
    i = src.indexOf(`<${tag}`, i + tag.length + 1);
  }
  return out;
}
const CALC_DIR = "src/components/calc";
const COMPONENTS = fs
  .readdirSync(path.join(ROOT, CALC_DIR))
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => `${CALC_DIR}/${f}`);
const ALL = [PAGE, ...COMPONENTS];

describe("calc-ui — the calc directory exists and is populated", () => {
  it("has the hero, legs, stake, stats, ladder, share and roll pieces", () => {
    const names = COMPONENTS.map((p) => path.basename(p));
    for (const n of ["CalcHero.tsx", "LegCard.tsx", "QuickAdd.tsx", "StakeInput.tsx", "CalcStats.tsx", "CalcLadder.tsx", "ShareButton.tsx", "RollingNumber.tsx"]) {
      expect(names, n).toContain(n);
    }
  });
});

describe("calc-ui — the page runs on calc-math, not its own arithmetic", () => {
  const page = stripComments(read(PAGE));
  it("imports the math from @/lib/calc-math", () => {
    expect(page).toMatch(/from "@\/lib\/calc-math"/);
    for (const fn of ["parlayDecimal", "decimalToAmerican", "impliedProb", "payout", "profit", "evPct", "ladder", "parseOdds"]) {
      expect(page, `page imports ${fn}`).toMatch(new RegExp(`\\b${fn}\\b`));
    }
  });
  it("the retired parlay-calc helpers and amToDec are no longer the page's math", () => {
    expect(page).not.toMatch(/@\/lib\/parlay-calc/);
    expect(page).not.toMatch(/amToDec/);
  });
  it("the math module is pure: no React, no DOM, no fetch", () => {
    const math = stripComments(read("src/lib/calc-math.ts"));
    expect(math).not.toMatch(/from "react"|from "motion|document\.|window\.|fetch\(/);
    for (const fn of ["americanToDecimal", "decimalToAmerican", "parlayDecimal", "impliedProb", "payout", "profit", "evPct", "ladder"]) {
      expect(math, `exports ${fn}`).toMatch(new RegExp(`export function ${fn}\\(`));
    }
  });
});

describe("calc-ui — the original functions survive the redesign", () => {
  const page = read(PAGE);
  it("starts with 2 lines for bets", () => {
    expect(page).toMatch(/useState<string\[\]>\(\["", ""\]\)/);
  });
  it("the button still says '+ a leg' and the bottom still shows Wins and Pays", () => {
    expect(page).toMatch(/\+ a leg/);
    expect(page).toMatch(/>Wins</);
    expect(page).toMatch(/>Pays</);
  });
  it("leg removal never drops below two legs", () => {
    expect(stripComments(page)).toMatch(/legs\.length <= 2\) return/);
  });
});

describe("calc-ui — the premium-instrument pieces are wired", () => {
  const page = stripComments(read(PAGE));
  it("hero PAYS number uses .hero-price in the gold tone and rolls via motion animate", () => {
    const hero = stripComments(read(`${CALC_DIR}/CalcHero.tsx`));
    expect(hero).toMatch(/hero-price is-gold/);
    expect(hero).toMatch(/RollingNumber/);
    const roll = stripComments(read(`${CALC_DIR}/RollingNumber.tsx`));
    expect(roll).toMatch(/import \{ animate, useReducedMotion \} from "motion\/react"/);
    expect(roll).toMatch(/animate\(from, value/);
  });
  it("quick-add row carries the common prices, stake has the $10/$25/$50/$100 presets", () => {
    const quick = stripComments(read(`${CALC_DIR}/QuickAdd.tsx`));
    expect(quick).toMatch(/chip-row/);
    for (const p of ["-110", "-150", "100", "150"]) expect(quick, p).toMatch(new RegExp(`(?<![\\w-])${p}(?!\\w)`));
    const stakeSrc = stripComments(read(`${CALC_DIR}/StakeInput.tsx`));
    expect(stakeSrc).toMatch(/STAKE_PRESETS = \[10, 25, 50, 100\]/);
  });
  it("legs accept either spelling (parseOdds) and show the other; a push toggle voids the leg", () => {
    const leg = stripComments(read(`${CALC_DIR}/LegCard.tsx`));
    expect(leg).toMatch(/parseOdds\(value\.odds\)/);
    expect(leg).toMatch(/parsed\.kind === "american"/);
    expect(leg).toMatch(/push: !value\.push/);
    expect(leg).toMatch(/parseConfidence\(value\.conf\)/);
  });
  it("stat tiles, edge meter, ladder and the copy button are mounted from the page", () => {
    expect(page).toMatch(/<CalcStats/);
    expect(page).toMatch(/<CalcLadder/);
    expect(page).toMatch(/<ShareButton/);
    expect(page).toMatch(/<CalcHero/);
    expect(page).toMatch(/<StakeInput/);
    expect(page).toMatch(/<QuickAdd/);
    const stats = stripComments(read(`${CALC_DIR}/CalcStats.tsx`));
    expect(stats).toMatch(/<StatTile/);
    expect(stats).toMatch(/<EdgeMeter/);
    expect(stats).toMatch(/<ProbBar/);
    for (const label of ["Combined odds", "Decimal", "Implied prob", "True prob", "EV vs implied", "Payout"]) {
      expect(stats, label).toContain(`label="${label}"`);
    }
  });
  it("share copies text only — no external call, no share sheet, no URL", () => {
    const share = stripComments(read(`${CALC_DIR}/ShareButton.tsx`));
    expect(share).toMatch(/navigator\.clipboard/);
    expect(share).not.toMatch(/fetch\(|navigator\.share|https?:\/\//);
  });
});

describe("calc-ui — phone rules (375px, 44px targets, numeric keypad, no blur, no push nav)", () => {
  for (const f of ALL) {
    const src = stripComments(read(f));
    it(`${f}: no backdrop blur`, () => {
      expect(src).not.toMatch(BLUR);
    });
    it(`${f}: no router.push, and every <Link> is replace`, () => {
      expect(src).not.toMatch(/router\.push\(/);
      expect(src).not.toMatch(/useRouter/);
      for (const m of src.matchAll(/<Link\b[^>]*>/g)) expect(m[0]).toMatch(/\breplace\b/);
    });
    it(`${f}: no fixed pixel widths wider than a 375px phone`, () => {
      for (const m of src.matchAll(/(?<![\w-])(?:w|min-w)-\[(\d+)px\]/g)) expect(Number(m[1]), m[0]).toBeLessThanOrEqual(343);
    });
  }
  it("every <input> carries inputMode decimal/numeric and a ≥44px height", () => {
    const inputs: string[] = [];
    for (const f of ALL) {
      for (const t of openingTags(stripComments(read(f)), "input")) inputs.push(`${f}: ${t}`);
    }
    expect(inputs.length).toBeGreaterThanOrEqual(3);
    for (const tag of inputs) {
      expect(tag).toMatch(/inputMode="(decimal|numeric)"/);
      const h = /\bh-\[(\d+)px\]/.exec(tag);
      expect(h, `${tag.slice(0, 80)} has an explicit h-[Npx]`).not.toBeNull();
      expect(Number(h![1])).toBeGreaterThanOrEqual(44);
      expect(tag).toMatch(/aria-label=/);
    }
  });
  it("every tap button in the calc components is at least 36px tall (44px for primary controls)", () => {
    for (const f of COMPONENTS) {
      const src = stripComments(read(f));
      for (const t of openingTags(src, "button")) {
        const h = /\bh-\[(\d+)px\]/.exec(t);
        expect(h, `${f}: ${t.slice(0, 60)} has h-[Npx]`).not.toBeNull();
        expect(Number(h![1])).toBeGreaterThanOrEqual(36);
      }
    }
    const stakeSrc = stripComments(read(`${CALC_DIR}/StakeInput.tsx`));
    const quick = stripComments(read(`${CALC_DIR}/QuickAdd.tsx`));
    expect(stakeSrc).toMatch(/h-\[44px\]/);
    expect(quick).toMatch(/h-\[44px\]/);
  });
});
