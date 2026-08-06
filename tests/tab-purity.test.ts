import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { FROZEN_NOW, armedFixtureEngine } from "./helpers/fixture-env";
import { splitPure, tabPure } from "@/lib/tab-purity";
import { stripComments } from "./helpers/source";

/**
 * TAB PURITY — every row rendered under a tab matches that tab's market key (2026-08-05,
 * operator report: RL under Hits, ML under RL).
 *
 * THE (a)/(b) READING, run before this guard existed: engine arrays PURE on the armed fixture
 * (0 cross-market rows in all 8 categories), both render surfaces key-addressed. Neither defect
 * reproduces from disk; the live sample is the operator's. This guard pins purity at the engine
 * level permanently, and the board page now renders through splitPure() so a slate-specific
 * contamination EXCLUDES-and-COUNTS instead of rendering under the wrong tab.
 *
 * OBSERVED RED 2026-08-05: the cross-filed plant below was run against a copy of splitPure with
 * the predicate inverted and against a hand-planted RL row inside batter_hits — both named the
 * row. The guard sees what it exists to see.
 */

describe("tabPure — the predicate, every convention", () => {
  it("prop rows match by lkey market segment; ml/rl by prefix; all is exempt", () => {
    expect(tabPure("batter_hits", "jakemangum|batter_hits|0.5")).toBe(true);
    expect(tabPure("batter_hits", "someone|rl|1.5")).toBe(false);
    expect(tabPure("ml", "ml_home")).toBe(true);
    expect(tabPure("ml", "rl_home")).toBe(false);
    expect(tabPure("rl", "rl_away")).toBe(true);
    expect(tabPure("rl", "ml_away")).toBe(false);
    expect(tabPure("all", "anything|whatever|1")).toBe(true);
  });

  it("PLANT (invalid-by-value): a cross-filed row is caught and NAMED", () => {
    const rows = [
      { lkey: "playera|batter_hits|0.5", label: "A" },
      { lkey: "rl_home", label: "PLANTED RL ROW UNDER HITS" },
      { lkey: "playerb|batter_hits|1.5", label: "B" },
    ];
    const { pure, excluded } = splitPure("batter_hits", rows);
    expect(pure.length).toBe(2);
    expect(excluded.length, "the planted RL row passed as a Hits row").toBe(1);
    expect(excluded[0].label).toContain("PLANTED");
  });
});

describe("engine-level purity + the tab spec's acceptance check", () => {
  it("EVERY category is pure on the armed fixture, and the tab list prints with counts", async () => {
    vi.setSystemTime(FROZEN_NOW);
    const eng = armedFixtureEngine();
    const d = eng.analyze(await eng.collectSlate()) as unknown as {
      categories: Record<string, { lkey?: string | null }[]>;
    };
    const report: string[] = [];
    for (const [k, rows] of Object.entries(d.categories)) {
      const { pure, excluded } = splitPure(k, rows);
      report.push(`${k}:${rows.length}`);
      expect(
        excluded.map((r) => r.lkey),
        `CROSS-MARKET ROWS IN categories.${k} — defect (b), data-side; every per-market figure ` +
          `computed from this store inherits it`,
      ).toEqual([]);
      expect(pure.length).toBe(rows.length);
    }
    /* the tab spec (owner, 2026-08-05): one tab per market, enumerated FROM THE DATA;
       prop tabs cap at 50 (the engine's own per-market top-50, ranked by win probability —
       the sort field is r.prob, engine L2575 comment + construction); ml/rl carry the full
       slate and cannot reach 50. Acceptance: the fixture's own counts, printed. */
    console.log(`[tab-spec] ${report.join("  ")}`);
    for (const [k, rows] of Object.entries(d.categories)) {
      if (k === "all" || k === "ml" || k === "rl") continue;
      expect(rows.length, `${k} exceeds the per-market top-50`).toBeLessThanOrEqual(50);
    }
    expect(Object.keys(d.categories).sort()).toEqual(
      ["all", "batter_hits", "batter_hits_runs_rbis", "batter_home_runs", "batter_total_bases", "ml", "pitcher_outs", "pitcher_strikeouts", "rl"].sort(),
    );
  }, 300_000);

  it("the board page renders through splitPure — the defensive layer is actually wired", () => {
    const page = stripComments(readFileSync("app/board/page.tsx", "utf8"));
    expect(/splitPure/.test(page), "the page no longer filters through splitPure — a contaminated bucket would render").toBe(true);
    expect(/cross-market/.test(page), "the excluded-count disclosure is gone — exclusion went silent").toBe(true);
  });
});
