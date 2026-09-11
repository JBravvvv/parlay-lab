import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { legSettled, settledRead, MONOTONE_MARKETS } from "@/lib/leg-settled";
import { stripComments } from "./helpers/source";

/**
 * INSTRUCTION 50 (2026-09-11) — item 2, Josh's word, verbatim:
 *
 *   "It's not updating with live odds; it will show the player is top 4th w/ 3 H+R+RBI,
 *    but show them as an 'S' grade for over .5 H+R+RBI when their live over/under is 3.5
 *    H+R+RBI"
 *
 * The app held both halves of that sentence on one render and never compared them: the
 * live tally came out of `currentValue` as TEXT ONLY (the number was computed and thrown
 * away), while the grade chip is `gradeFromEv(czEv)` — a threshold on a number computed
 * pregame, with no game-state input. `legSettled` is the comparison, and this file is its
 * contract.
 *
 * The asymmetry under test is the whole point. All six MLB prop markets are monotone
 * non-decreasing counting stats, so `cur > line` PROVES the Over won and the Under lost,
 * free, at any moment. Nothing else is provable free: `cur <= line` (and `cur === line`)
 * is undecided and must return null, and a leg with no observed number must never be
 * treated as a zero. Every assertion below exists to hold one of those two lines.
 */

const JOSH_LKEY = "yordanalvarez|batter_hits_runs_rbis|0.5";
const JOSH_SUB = "H+R+RBI Over 0.5";

describe("legSettled — the live tally vs the leg's own line", () => {
  it("Josh's case: 3 H+R+RBI against a 0.5 line is decided, not an 'S' grade", () => {
    expect(legSettled(JOSH_LKEY, JOSH_SUB, 3)).toBe("over-cleared");
    const r = settledRead(JOSH_LKEY, JOSH_SUB, 3);
    expect(r?.line).toBe(0.5);
    expect(r?.val).toBe(3);
    expect(r?.side).toBe("O");
    expect(r?.why).toContain("Over is decided won");
  });

  it("undecided stays untouched: 1 against a 1.5 line is still live", () => {
    expect(legSettled("mitchellparker|batter_hits|1.5", "H O 1.5", 1)).toBeNull();
    expect(settledRead("mitchellparker|batter_hits|1.5", "H O 1.5", 1)).toBeNull();
  });

  it("no number, no verdict — a player not in the boxscore is never a fabricated 0", () => {
    expect(legSettled(JOSH_LKEY, JOSH_SUB, null)).toBeNull();
    expect(legSettled(JOSH_LKEY, JOSH_SUB, undefined)).toBeNull();
    expect(legSettled(JOSH_LKEY, JOSH_SUB, Number.NaN)).toBeNull();
    /* and a REAL observed zero is a real number that simply has not cleared the line —
       the same null, reached honestly rather than by treating absence as 0 */
    expect(legSettled(JOSH_LKEY, JOSH_SUB, 0)).toBeNull();
  });

  it("an Under is decided too — the same instant, the opposite way", () => {
    const lkey = "jacobdegrom|pitcher_strikeouts|6.5";
    const sub = "K U 6.5";
    expect(legSettled(lkey, sub, 8)).toBe("over-cleared");
    const r = settledRead(lkey, sub, 8);
    expect(r?.side).toBe("U");
    expect(r?.why).toContain("Under is decided lost");
  });

  it("equal is NOT settled — one more hit still clears a whole-number line", () => {
    expect(legSettled("aaronjudge|batter_total_bases|2", "TB O 2", 2)).toBeNull();
    expect(legSettled("aaronjudge|batter_total_bases|2", "TB O 2", 3)).toBe("over-cleared");
  });

  it("ml_/rl_ legs carry no counting stat and are never settled this way", () => {
    expect(legSettled("ml_home", "ML", 3)).toBeNull();
    expect(legSettled("ml_away", "ML", 99)).toBeNull();
    expect(legSettled("rl_home", "RL -1.5", 4)).toBeNull();
    expect(legSettled("rl_away", "RL +1.5", 4)).toBeNull();
    expect(legSettled(null, null, 4)).toBeNull();
    expect(legSettled("garbage-lkey", "whatever", 4)).toBeNull();
  });

  it("only monotone markets qualify, and the list cannot drift from the extractor", () => {
    const src = stripComments(
      fs.readFileSync(path.join(process.cwd(), "src/engine2/grade.ts"), "utf8"),
    );
    const body = src.slice(src.indexOf("export function currentValue("));
    expect(body.length, "currentValue not found in src/engine2/grade.ts").toBeGreaterThan(200);
    const extracted = [...body.matchAll(/mkt === "([a-z_]+)"/g)].map((m) => m[1]);
    expect([...new Set(extracted)].sort()).toEqual([...MONOTONE_MARKETS].sort());
    /* a market the extractor does not read can never produce a val, but the gate is
       belt-and-braces: a caller passing a number for a non-counting market gets null */
    expect(legSettled("somebody|batter_walks|0.5", "BB O 0.5", 3)).toBeNull();
  });

  it("PLANT: the guard is not vacuous — move the tally under the line and it goes quiet", () => {
    expect(legSettled(JOSH_LKEY, JOSH_SUB, 3)).toBe("over-cleared");
    // same leg, tally swapped below the line: a guard that always fired would miss this
    expect(legSettled(JOSH_LKEY, JOSH_SUB, 0)).toBeNull();
    // same tally, line raised above it: ditto
    expect(legSettled("yordanalvarez|batter_hits_runs_rbis|3.5", JOSH_SUB, 3)).toBeNull();
    // and a hand-built always-true predicate would fail the pair above
    const vacuous = () => "over-cleared" as const;
    expect(vacuous()).not.toBe(legSettled(JOSH_LKEY, JOSH_SUB, 0));
  });
});

/* TWO SUB GRAMMARS REACH THIS FUNCTION. The grader and /api/picks write " O " / " U "
   (src/engine2/grade.ts, app/api/picks/route.ts), while the Parlay Builder composes subs as
   "H+R+RBI Under 1.5" (src/components/props/props-model.ts, playerLeg). A read that only knows
   the one-letter spelling calls every builder Under an Over and prints "this Over is decided won"
   on a leg that is decided LOST — the exact inversion of the fact Josh needs. */
describe("settledRead — both sub grammars, one side", () => {
  const LKEY = "yordanalvarez|batter_hits_runs_rbis|1.5";

  it("the props-model spelling 'H+R+RBI Under 1.5' reads as an Under", () => {
    const r = settledRead(LKEY, "H+R+RBI Under 1.5", 3);
    expect(r?.code).toBe("over-cleared");
    expect(r?.side).toBe("U");
    expect(r?.why).toContain("this Under is decided lost");
    expect(r?.why).not.toContain("Over is decided won");
  });

  it("the props-model spelling 'H+R+RBI Over 1.5' still reads as an Over", () => {
    const r = settledRead(LKEY, "H+R+RBI Over 1.5", 3);
    expect(r?.side).toBe("O");
    expect(r?.why).toContain("this Over is decided won");
  });

  it("the grader's one-letter spelling is unchanged in both directions", () => {
    expect(settledRead(LKEY, "H+R+RBI U 1.5", 3)?.side).toBe("U");
    expect(settledRead(LKEY, "H+R+RBI O 1.5", 3)?.side).toBe("O");
  });

  it("a word merely CONTAINING u or under does not flip the side", () => {
    /* "Outs" and "Runs" both carry a u; neither is a side. */
    expect(settledRead("hunterbrown|pitcher_outs|1.5", "Outs Over 1.5", 3)?.side).toBe("O");
    expect(settledRead(LKEY, "H+R+RBI Over 1.5", 3)?.side).toBe("O");
  });

  it("the side is wording only — it can never settle an undecided leg", () => {
    expect(settledRead(LKEY, "H+R+RBI Under 1.5", 1)).toBeNull();
    expect(settledRead(LKEY, "H+R+RBI Under 1.5", null)).toBeNull();
  });

  it("the source reads both spellings, not the narrow one-letter test", () => {
    const src = stripComments(
      fs.readFileSync(path.join(process.cwd(), "src/lib/leg-settled.ts"), "utf8"),
    );
    expect(src).toMatch(/U\(nder\)\?/);
  });
});

describe("/api/picks emits the leg key the comparison needs", () => {
  const routeSrc = stripComments(
    fs.readFileSync(path.join(process.cwd(), "app/api/picks/route.ts"), "utf8"),
  );

  it("the mapped pick carries lkey", () => {
    expect(routeSrc).toMatch(/lkey: r\.lkey/);
  });

  it("nothing else about the route moved: same population, same public read", () => {
    expect(routeSrc).toMatch(/!r\.live/); // live rows still excluded from the picks list
    expect(routeSrc).toMatch(/tabPure\(m, r\.lkey \?\? null\)/);
    expect(routeSrc).toMatch(/lineOf\(r\.lkey \?\? null\)/);
    // still public, exactly as tests/picks-cohort.test.ts pins it
    expect(routeSrc).not.toMatch(/cronHeaderAuthed|syncAuthed|x-pl-sync/);
    // still read-only
    expect(routeSrc).not.toMatch(/redisSetJson|\["SET"/);
    expect(routeSrc).not.toMatch(/shAllocate|shCardPool|createEngine/);
  });
});
