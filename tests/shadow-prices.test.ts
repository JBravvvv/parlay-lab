import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FROZEN_NOW, armedFixtureEngine, fixtureEngine } from "./helpers/fixture-env";

/**
 * SHADOW PRICES — the four speccable amendments computed BESIDE the live path (2026-07-27,
 * signed off: Phase 2 first, bundle at exit, shadow series in between).
 *
 * Scope: M8 (TB 0.5 formula), M11 (expected-metric-primary rate), M10 (bbr shrunk k=75),
 * M1 (shParkF replaces the Coors flags). Per closed-form batter row: `sh:{m8,m11,m10,m1,all}`
 * on propBoard, percent 2dp, null on any missing input. OUT by name: H+R+RBI, pitcher rows,
 * and the sim path (a shadow there needs a second sim run).
 *
 * The pre-committed reading lives in docs/freeze-exit-bundle.md and was written before any
 * shadow data existed.
 */

type ShRow = { ln: number; pO: number | null; fO: number | null; sh?: Record<string, number | null> };
type Board = { propBoard?: { markets?: Record<string, ShRow[]> }[] };

describe("shadow prices ride the armed board and never the dormant one", () => {
  let armed: Board;
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FROZEN_NOW);
    const eng = armedFixtureEngine();
    armed = eng.analyze(await eng.collectSlate()) as unknown as Board;
  }, 300_000);
  afterAll(() => vi.useRealTimers());

  const rows = (b: Board, mkt: string) =>
    (b.propBoard ?? []).flatMap((g) => (g.markets ?? {})[mkt] ?? []);

  it("the DORMANT board carries no shadow field anywhere (byte-level additivity)", async () => {
    vi.setSystemTime(FROZEN_NOW);
    const eng = fixtureEngine();
    const d = eng.analyze(await eng.collectSlate());
    expect(JSON.stringify(d)).not.toContain('"sh"');
    expect(JSON.stringify(d)).not.toContain('"shdw"');
  }, 300_000);

  it("armed closed-form batter rows carry sh; HRR and pitcher rows never do", () => {
    const hits = rows(armed, "batter_hits").filter((r) => r.sh);
    expect(hits.length).toBeGreaterThan(20);
    for (const mkt of ["batter_hits_runs_rbis", "pitcher_strikeouts", "pitcher_outs"]) {
      expect(rows(armed, mkt).filter((r) => r.sh), `${mkt} must carry no shadow`).toHaveLength(0);
    }
  });

  it("every shadow value is a finite percent or null — no fabricated readings", () => {
    for (const mkt of ["batter_hits", "batter_total_bases", "batter_home_runs"]) {
      for (const r of rows(armed, mkt)) {
        if (!r.sh) continue;
        for (const [k, v] of Object.entries(r.sh)) {
          expect(
            v === null || (typeof v === "number" && isFinite(v) && v >= 0 && v <= 100),
            `${mkt} ${k}: ${v}`,
          ).toBe(true);
        }
      }
    }
  });

  it("the fixture CANNOT check M8's board-level gap — pinned as a fact, not skipped silently", () => {
    /* The fixture has ZERO model-priced TB O0.5 rows (its 0.5 rungs are Caesars ALT ladders,
       which carry no lam) — the exact thinness that produced the original vacuous-pass
       incident. This time the non-empty guard caught it instead of passing green. So: the
       thinness is PINNED here; the m8-vs-live gap check runs on real archived boards
       (tools, from 2026-07-28's board onward), and the FORMULA is already pinned by
       tests/self-consistency.test.ts's pure-function M8 test. */
    const tb05 = rows(armed, "batter_total_bases").filter((r) => r.ln === 0.5 && r.sh?.m8 != null);
    expect(tb05).toHaveLength(0);
  });

  it("m8 is null off the 0.5 rung and null outside TB", () => {
    for (const r of rows(armed, "batter_total_bases")) {
      if (r.sh && r.ln > 1) expect(r.sh.m8).toBeNull();
    }
    for (const r of rows(armed, "batter_hits")) {
      if (r.sh) expect(r.sh.m8).toBeNull();
    }
  });

  it("the combined shadow differs from the live price — the bundle engine is a real alternative", () => {
    const hits = rows(armed, "batter_hits").filter(
      (r) => r.ln === 0.5 && r.sh?.all != null && r.pO != null && r.fO != null,
    );
    expect(hits.length).toBeGreaterThan(20);
    const moved = hits.filter((r) => Math.abs(r.sh!.all! - (r.pO! - 0.65 * r.fO!) / 0.35) > 0.5);
    expect(moved.length).toBeGreaterThan(hits.length / 2);
  });
});
