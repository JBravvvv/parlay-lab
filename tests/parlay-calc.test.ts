import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseAmerican, quoteParlay } from "@/lib/parlay-calc";
import { stripComments } from "./helpers/source";

/**
 * PARLAY CALCULATOR (2026-08-20, Josh's word, verbatim: "Add a parlay calculator tab
 * where you can enter any amount for the bet and it has lines for each bet of the
 * parlay to enter the odds. It should start with 2 lines for bets then have a
 * '+ a leg' button underneath to add a new leg to the parlay each time you press it.
 * At the bottom it should have 'wins' and 'pays' amounts.")
 *
 * The math cases below are checked against the book convention: two -110 legs on $10
 * pay $36.45 (the classic +264 two-teamer), and a -200/-300 pair lands exactly +100.
 */

describe("parseAmerican — the user's own price, or nothing", () => {
  it("accepts the three spellings books use", () => {
    expect(parseAmerican("+150")).toBe(150);
    expect(parseAmerican("150")).toBe(150);
    expect(parseAmerican("-110")).toBe(-110);
    expect(parseAmerican("  -110  ")).toBe(-110);
    expect(parseAmerican("+1500")).toBe(1500);
  });
  it("rejects junk, decimals, and the ±100 dead zone no book quotes from", () => {
    for (const bad of ["", "abc", "1.5", "112.5", "+50", "-99", "0", "+-110", "--110"]) {
      expect(parseAmerican(bad), `"${bad}" should not parse`).toBeNull();
    }
  });
});

describe("quoteParlay — wins is profit, pays is the full return", () => {
  it("the classic two-teamer: $10 on -110/-110 pays $36.45, wins $26.45", () => {
    const q = quoteParlay(10, [-110, -110])!;
    expect(q.pays).toBe(36.45);
    expect(q.wins).toBe(26.45);
    expect(Math.round(q.american)).toBe(264);
  });
  it("a single leg round-trips its own price: $25 at +150 wins $37.50, pays $62.50", () => {
    const q = quoteParlay(25, [150])!;
    expect(q.dec).toBe(2.5);
    expect(q.wins).toBe(37.5);
    expect(q.pays).toBe(62.5);
    expect(q.american).toBe(150);
  });
  it("favorites compound to exactly even money: -200 × -300 = +100", () => {
    const q = quoteParlay(50, [-200, -300])!;
    expect(q.dec).toBeCloseTo(2, 10);
    expect(q.pays).toBe(100);
    expect(q.wins).toBe(50);
    expect(Math.round(q.american)).toBe(100);
  });
  it("guards: no stake or no legs → null, never NaN", () => {
    expect(quoteParlay(0, [-110])).toBeNull();
    expect(quoteParlay(-5, [-110])).toBeNull();
    expect(quoteParlay(10, [])).toBeNull();
  });
});

describe("wired — the tab and the page match the instruction", () => {
  const page = fs.readFileSync(path.join(process.cwd(), "app/calc/page.tsx"), "utf8");
  const shell = fs.readFileSync(path.join(process.cwd(), "src/components/shell/AppShell.tsx"), "utf8");
  it("starts with 2 lines for bets", () => {
    expect(page).toMatch(/useState<string\[\]>\(\["", ""\]\)/);
  });
  it("the button says '+ a leg', verbatim", () => {
    expect(page).toMatch(/\+ a leg/);
  });
  it("the bottom shows Wins and Pays", () => {
    expect(page).toMatch(/>Wins</);
    expect(page).toMatch(/>Pays</);
  });
  it("the tab is in the shell nav as 'Parlay Calculator', reachable on mobile, and the bottom bar sizes itself", () => {
    expect(shell).toMatch(/href: "\/calc", label: "Parlay Calculator"/);
    // not a bottom tab (six already fill 375px) — it rides the mobile top-bar icon row instead
    expect(shell).toMatch(/href: "\/calc".*mobile: false/);
    expect(shell).toMatch(/NAV\.filter\(\(n\) => !n\.mobile\)\.map/);
    expect(shell).toMatch(/gridTemplateColumns: `repeat\(\$\{NAV\.filter\(\(n\) => n\.mobile\)\.length\}/);
    // the hardcoded count that was wrapping tab 7 — comment-stripped, the fix's own comment names it
    expect(stripComments(shell)).not.toMatch(/grid-cols-6/);
  });
});
