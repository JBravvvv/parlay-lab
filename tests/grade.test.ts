import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { GRADE_CUTS, gradeFromEv, type Grade } from "@/lib/grade";

/**
 * LETTER GRADES (2026-08-10, Josh's ask: "each play on the parlay lab board etc
 * should have a letter grade (A-F) … A being the top tier bets down to F").
 *
 * A grade is a LABEL ON A NUMBER THE ENGINE ALREADY COMPUTED — never a new
 * model. Board rows grade on the SAME EV the row displays (czEv, or bsEv in
 * dk_fd basis mode); prop picks grade on their model−implied edge in points.
 * Cutoffs are FIXED and pre-committed (A ≥ +3, B ≥ +1, C ≥ −1, D ≥ −3, F
 * below), so an A always means the same thing on every tab on every day —
 * and A's are RARE by construction, because most of a retail board is −EV.
 * No price → no grade (never fabricate).
 */

describe("gradeFromEv — fixed cutoffs, boundaries land exactly where stated", () => {
  const cases: Array<[number, Grade]> = [
    [10, "A"],
    [3, "A"], // boundary: ≥ +3 is an A
    [2.999, "B"],
    [1, "B"], // boundary: ≥ +1 is a B
    [0.999, "C"],
    [0, "C"],
    [-1, "C"], // boundary: ≥ −1 is still about-fair
    [-1.001, "D"],
    [-3, "D"], // boundary: ≥ −3 is a D
    [-3.001, "F"],
    [-12, "F"],
  ];
  it.each(cases)("EV %f%% → %s", (ev, g) => {
    expect(gradeFromEv(ev)).toBe(g);
  });
  it("no number, no grade — null/undefined/NaN never invent a tier", () => {
    expect(gradeFromEv(null)).toBeNull();
    expect(gradeFromEv(undefined)).toBeNull();
    expect(gradeFromEv(Number.NaN)).toBeNull();
  });
  it("the cutoffs are the published ones", () => {
    expect(GRADE_CUTS).toEqual({ A: 3, B: 1, C: -1, D: -3 });
  });
});

describe("wired — source scans, comment-stripped", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const read = (p: string) => strip(fs.readFileSync(path.join(process.cwd(), p), "utf8"));

  it("board rows carry a GradeChip in BOTH basis modes, graded on the same EV the row displays", () => {
    const src = read("app/board/page.tsx");
    expect(src).toMatch(/GradeChip/);
    expect(src).toMatch(/gradeFromEv\(.*\bczEv\b/s); // caesars mode grades czEv
    expect(src).toMatch(/gradeFromEv\(.*\bbsEv\b/s); // dk_fd mode grades bsEv
  });
  it("prop picks grade on their model−implied edge", () => {
    const src = read("app/board/page.tsx");
    expect(src).toMatch(/gradeFromEv\(.*\bedge\b/s);
  });
  it("the chip explains itself — basis and cutoffs in the title", () => {
    const chip = fs.readFileSync(path.join(process.cwd(), "src/components/ui/GradeChip.tsx"), "utf8");
    expect(chip).toMatch(/A ≥ \+3/);
    expect(chip).toMatch(/F below −3/);
  });
});
