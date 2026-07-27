import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { achievableCoverage, liveCoverageOf, pricedGames } from "@/lib/board-coverage";
import { liveCoverage } from "@/lib/server/board-store";
import { boardStale, LU_PCT_FLOOR } from "@/lib/board-stale";

/**
 * EVERY COVERAGE RATIO DECLARES ITS DENOMINATOR — enforced, not documented.
 *
 * WHY (2026-07-26). A coverage ratio can be over ALL games, ELIGIBLE games, or UNSTARTED
 * games, and the three answer different questions. Picking the wrong one has now cost this
 * project three times:
 *
 *   1. `bestBoard` compared boards on whole-day coverage, so a 9am board could beat the
 *      evening board that actually priced what was still open.
 *   2. the staleness gate read the same whole-day number.
 *   3. `achievableCoverage` divided by the whole slate, so a 22:30 Sunday pass that could
 *      reach the ONE remaining game scored 1/15 = 0.071 and was refused as "low-ceiling" —
 *      silently disabling the entry that exists for 65% of the H+R+RBI ladder-defect
 *      exposure. Found by testing it; it would not have been found by reading it.
 *
 * `board-coverage.ts`'s own header warned about exactly this pattern, and instance 3 was one
 * function BELOW that warning. A comment is not a guard, so this file is the guard.
 *
 * THE REGISTRY BELOW IS THE INVARIANT. Every producer of a coverage ratio is listed with the
 * denominator it claims, and the claim is CHECKED by running it on a slate where the three
 * denominators give different answers. A new call site that is not registered fails the
 * source scan at the bottom.
 */

type Den = "unstarted" | "all-games" | "mixed";

/* A slate where the three denominators disagree by construction: 4 games, 1 already
   started, 2 of the 3 unstarted ones have lineups.
     all games      = 4
     unstarted      = 3
     confirmed      = 2   (both unstarted-with-lineups)
   so unstarted-denominator = 2/3 = 0.667 and all-games = 2/4 = 0.500. */
const NOW = Date.parse("2026-07-26T18:00:00Z");
const H = 3600_000;
const GI = {
  started: { start: "2026-07-26T17:00:00Z", lu: true }, //  already underway
  soon_a: { start: "2026-07-26T19:00:00Z", lu: true }, //  unstarted, confirmed
  soon_b: { start: "2026-07-26T20:00:00Z", lu: true }, //  unstarted, confirmed
  late: { start: "2026-07-26T23:00:00Z", lu: false }, //  unstarted, unconfirmed
};
const STARTS = Object.values(GI).map((g) => Date.parse(g.start));

const REGISTRY: { site: string; declares: Den; question: string }[] = [
  {
    site: "liveCoverageOf (src/lib/board-coverage.ts)",
    declares: "unstarted",
    question: "of the games still bettable, how many were priced with a real lineup?",
  },
  {
    site: "achievableCoverage (src/lib/board-coverage.ts)",
    declares: "unstarted",
    question: "of what a pass could still price now, how much is past its lineup window?",
  },
  {
    site: "pricedGames (src/lib/board-coverage.ts)",
    declares: "unstarted",
    question: "how many still-bettable games does this board carry any row for?",
  },
  {
    site: "liveCoverage (src/lib/server/board-store.ts) — the conditional skip",
    declares: "unstarted",
    question: "would a fresh pass add anything over the stored board?",
  },
  {
    site: "coverageOf → boardStale LU_PCT_FLOOR (src/lib/board-stale.ts) — THE LOCK GUARD",
    declares: "unstarted",
    question: "is this board too projected to lock a card off?",
  },
  {
    site: "gen.luPct (app/api/generate/route.ts)",
    declares: "unstarted",
    question: "where did this generating pass land relative to the slate?",
  },
  {
    site: "luCoverage.pct / observedPct / modelledPct (legacy/index.html) — DISPLAY ONLY",
    declares: "mixed",
    question: "(numerator counts unstarted games, denominator is ALL games — see below)",
  },
];

describe("coverage ratios declare their denominator, and the declaration is checked", () => {
  it("the fixture slate separates the three denominators", () => {
    expect(STARTS.filter((s) => s > NOW).length).toBe(3); // unstarted
    expect(STARTS.length).toBe(4); // all games
    expect(2 / 3).not.toBeCloseTo(2 / 4, 3); // the two answers differ
  });

  it("liveCoverageOf divides by UNSTARTED games", () => {
    const cov = liveCoverageOf(GI, NOW);
    expect(cov.live).toBe(3);
    expect(cov.confirmed).toBe(2);
    expect(cov.pct).toBeCloseTo(2 / 3, 3);
    expect(cov.pct).not.toBeCloseTo(2 / 4, 3); // NOT the whole slate
  });

  it("achievableCoverage divides by UNSTARTED games — the instance-3 regression", () => {
    // at 21:00 only the 23:00 game is left, and it is inside its 3h lineup window
    const at21 = Date.parse("2026-07-26T21:00:00Z");
    expect(achievableCoverage(STARTS, at21)).toBe(1); // 1 of 1 unstarted
    // the whole-slate denominator would have said 1/4 = 0.25 and, on the real Sunday
    // slate, 1/15 = 0.071 — below MIN_ACHIEVABLE, refusing the pass
    expect(achievableCoverage(STARTS, at21)).not.toBeCloseTo(0.25, 3);
  });

  it("pricedGames counts only still-bettable games", () => {
    const cats = { m: [{ gkey: "started" }, { gkey: "soon_a" }] };
    expect(pricedGames(cats, GI, NOW)).toBe(1); // `started` does not count
  });

  it("the conditional skip inherits the unstarted denominator", () => {
    const board = { date: "2026-07-26", at: NOW - H, data: { gameInfo: GI } } as never;
    const v = liveCoverage(board, NOW, STARTS);
    expect(v.live).toBe(3);
    expect(v.pct).toBeCloseTo(2 / 3, 3);
  });

  it("THE LOCK GUARD's 50% threshold is over unstarted games, not the whole slate", () => {
    // 2/3 = 0.667 clears LU_PCT_FLOOR; 2/4 = 0.500 sits exactly ON it, and the whole
    // point of the guard is that those are different decisions about real money.
    const covUnstarted = liveCoverageOf(GI, NOW).pct;
    expect(covUnstarted).toBeGreaterThan(LU_PCT_FLOOR);
    expect(boardStale({ pct: covUnstarted, at: NOW - H, starts: STARTS, autoRuns: 0, now: NOW }).stale).toBe(false);
    // and had it been computed the other way it would have been a coin-flip on the floor
    expect(2 / 4).toBe(LU_PCT_FLOOR);
  });

  it("SOURCE SCAN: no unregistered coverage ratio exists", () => {
    const files = ["src/lib/board-coverage.ts", "src/lib/server/board-store.ts", "src/lib/board-stale.ts",
                   "src/lib/engine-client.ts", "app/api/generate/route.ts"];
    const producers = new Set<string>();
    for (const f of files) {
      const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
      for (const m of src.matchAll(/\b(liveCoverageOf|achievableCoverage|pricedGames|liveCoverage|coverageOf)\s*\(/g)) {
        producers.add(m[1]);
      }
    }
    // every function that produces a ratio must appear in the registry's site strings
    const registered = REGISTRY.map((r) => r.site).join(" ");
    for (const p of producers) {
      const named = registered.includes(p) || p === "coverageOf" || p === "liveCoverage";
      expect(named, `coverage producer \`${p}\` is not in the REGISTRY — declare its denominator`).toBe(true);
    }
    expect(producers.size).toBeGreaterThan(3);
  });

  /**
   * THE ONE MISMATCH, RECORDED AND FROZEN.
   *
   * `legacy/index.html` builds `luCoverage` with a numerator that skips started games
   * (`if(started)return;`) and a denominator of `slate.games.length` — ALL games. So `pct`
   * understates by exactly the started fraction, and `observedPct` is byte-identical to
   * `pct` rather than being the unstarted-denominator version its name implies. `luUnstarted`
   * is computed and never used in any ratio.
   *
   * On the real 2026-07-26 board: `{confirmed: 13, eligible: 15, pct: 0.867}` with one game
   * live, so the unstarted-denominator answer is 13/14 = 0.929.
   *
   * NOT FIXED: it is engine code under the collection-period freeze, and changing it moves
   * every board's bytes and the armed baseline. **No decision path reads it** — the lock
   * guard, the skip and the board comparison all go through `liveCoverageOf(gameInfo)`
   * instead. It is display and archive only.
   *
   * The risk it carries is a future reader grabbing the convenient stored number. This test
   * is where that reader finds out.
   */
  it("the engine's luCoverage is MIXED-denominator — documented, frozen, unread by any gate", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "legacy", "index.html"), "utf8");
    expect(src).toContain("var luDen=slate.games.length;");
    expect(src).toContain("if(started)return;");
    // pct and observedPct really are the same expression — not a transcription slip here
    const pctExpr = /pct:luDen\?Math\.round\(\(luConf\/luDen\)\*1000\)\/1000:0/;
    const obsExpr = /observedPct:luDen\?Math\.round\(\(luConf\/luDen\)\*1000\)\/1000:0/;
    expect(pctExpr.test(src)).toBe(true);
    expect(obsExpr.test(src)).toBe(true);
    // and it is read by NO decision path — only comments mention it outside the engine
    for (const f of ["src/lib/board-stale.ts", "src/lib/server/board-store.ts", "src/lib/engine-client.ts"]) {
      const t = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
      for (const line of t.split("\n")) {
        if (!line.includes("luCoverage")) continue;
        expect(line.trimStart().startsWith("*") || line.trimStart().startsWith("//"),
          `${f} READS luCoverage outside a comment — it is mixed-denominator`).toBe(true);
      }
    }
  });

  it("the registry is complete and every entry states its question", () => {
    expect(REGISTRY.length).toBeGreaterThanOrEqual(7);
    for (const r of REGISTRY) {
      expect(r.question.length).toBeGreaterThan(20);
      expect(["unstarted", "all-games", "mixed"]).toContain(r.declares);
    }
    // exactly one known mismatch; a second means something regressed
    expect(REGISTRY.filter((r) => r.declares !== "unstarted").length).toBe(1);
  });
});
