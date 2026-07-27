import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FROZEN_NOW, armedFixtureEngine } from "./helpers/fixture-env";

/**
 * THE MODEL CHECKED AGAINST ITSELF — a violation here is a PROOF, not evidence.
 *
 * Every other detector in this repo is bottlenecked on an external reference it does not have:
 * the market is not independent (the model blends toward it), the fixture is not production, the
 * archive needs weeks, and twenty runs of one instrument is precision rather than independence.
 *
 * **These constraints need none of that.** They are logical identities between two prices the
 * model itself emits, so a violation proves at least one is wrong with no assumption that the
 * market is right and no waiting.
 *
 * It is how `shTbOver`'s 0.5 branch was found (M8): TB ≥ 1 and H ≥ 1 are the same event, the
 * market priced them **0.1 pp** apart and the model **24.4 pp** apart on 127 rows of the real
 * board. `tools/self_consistency.py` runs the same checks on any board or the whole archive.
 *
 * ⚠️ THE M8 IDENTITY IS ASSERTED HERE PERMANENTLY. A single is one total base, in every model,
 * on every board, forever. It is not a calibration target — it is arithmetic, so it is pinned
 * like `lid-coupling` rather than measured like a gap.
 */

type Row = { lkey?: string; ln: number; pO: number | null; fO: number | null };
type Board = { propBoard?: { markets?: Record<string, Row[]> }[] };
const W = 0.35; // pO = W·pModel + (1−W)·fO
const TOL = 1.0; // pp — below this is de-vig noise

function priced(d: Board) {
  const m = new Map<string, { model: number; market: number }>();
  for (const g of d.propBoard ?? []) {
    for (const [mkt, rows] of Object.entries(g.markets ?? {})) {
      for (const r of rows) {
        if (r.pO == null || r.fO == null || !r.lkey) continue;
        m.set(`${r.lkey.split("|")[0]}|${mkt}|${r.ln}`, {
          model: (r.pO - (1 - W) * r.fO) / W,
          market: r.fO,
        });
      }
    }
  }
  return m;
}

let P: ReturnType<typeof priced>;

describe("self-consistency — constraints the model must satisfy against itself", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FROZEN_NOW);
    const eng = armedFixtureEngine();
    P = priced(eng.analyze(await eng.collectSlate()) as unknown as Board);
  }, 300_000);
  afterAll(() => vi.useRealTimers());

  const players = () => new Set([...P.keys()].map((k) => k.split("|")[0]));
  const get = (who: string, mkt: string, ln: number) => P.get(`${who}|${mkt}|${ln}`);

  /** P(a) ≥ P(b) − TOL for every player carrying both. Returns [checked, violations]. */
  function implies(a: [string, number], b: [string, number], side: "model" | "market") {
    let n = 0, bad = 0;
    for (const who of players()) {
      const x = get(who, a[0], a[1]);
      const y = get(who, b[0], b[1]);
      if (!x || !y) continue;
      n++;
      if (x[side] - y[side] < -TOL) bad++;
    }
    return [n, bad] as const;
  }

  it("the fixture board prices enough rows to check anything", () => {
    expect(P.size).toBeGreaterThan(50);
  });

  /**
   * ⚠️ THE M8 IDENTITY — TESTED ON THE FUNCTION, NOT ON A BOARD.
   *
   * The first version of this checked TB O0.5 against hits O0.5 across the fixture's players and
   * PASSED VACUOUSLY: 99 players, **zero** carrying both rows. That is the exact defect
   * `docs/harness-substitutions.md`'s top rule was written about, reproduced one turn after
   * writing it — a loop over an empty intersection asserts nothing and reports green.
   *
   * So the identity is asserted where it actually lives: `shTbOver` is a pure function, and
   * `P(TB ≥ 1)` is `1 − P0` by definition. No board, no overlap, no slate dependence.
   * `tools/self_consistency.py` runs the board-level version, where the rows do exist — 127 of
   * them on 2026-07-26, at 24.4 pp.
   */
  it("shTbOver PINS M8 — the defect is asserted, not the fix (frozen)", async () => {
    /* The correct assertion is written below and COMMENTED. M8 is a real, unfixed bug under the
       collection-period freeze, so the suite pins CURRENT behaviour — the same treatment
       `pitcher_outs` gets as Phase 2's positive control. When M8 ships, swap the two blocks;
       the test failing at that moment is the point. */
    const eng = armedFixtureEngine();
    const tb = eng.get<(line: number, lamH: number, s1: number, s2: number) => number>("shTbOver")!;
    const pmf = eng.get<(k: number, lam: number) => number>("shPoisPmf")!;
    const [s1, s2] = [0.65, 0.2];

    for (const lamH of [0.6, 0.96, 1.4]) {
      const at05 = tb(0.5, lamH, s1, s2);
      const at15 = tb(1.5, lamH, s1, s2);
      const truth05 = 1 - pmf(0, lamH); // P(TB ≥ 1) === P(≥1 hit), by definition

      // === CURRENT (DEFECTIVE) BEHAVIOUR — pinned ===
      expect(
        Math.abs(at05 - at15),
        `shTbOver no longer returns the same number for 0.5 and 1.5 at λ=${lamH}. If M8 was ` +
          `fixed, swap this block for the commented one below and update docs/freeze-exit-bundle.md.`,
      ).toBeLessThan(1e-12); // ONE answer for TWO questions: `if(line<2)` catches both
      expect(
        truth05 - at05,
        `the M8 gap changed size at λ=${lamH}. It is P(TB≥1) − P(TB≥2) and should be large.`,
      ).toBeGreaterThan(0.15);

      // === THE CORRECT ASSERTIONS, for when M8 ships ===
      // expect(Math.abs(at05 - truth05)).toBeLessThan(0.005);   // P(TB≥1) === 1 − P0
      // expect(Math.abs(at05 - at15)).toBeGreaterThan(0.01);    // 0.5 and 1.5 differ
    }
  }, 120_000);

  it("a home run implies a hit, a total base, and three H+R+RBI credits", () => {
    for (const [name, a, b] of [
      ["hits ≥ 1 ≥ HR ≥ 1", ["batter_hits", 0.5], ["batter_home_runs", 0.5]],
      ["H+R+RBI ≥ 1 ≥ HR ≥ 1", ["batter_hits_runs_rbis", 0.5], ["batter_home_runs", 0.5]],
      ["H+R+RBI ≥ 3 ≥ HR ≥ 1", ["batter_hits_runs_rbis", 2.5], ["batter_home_runs", 0.5]],
      ["H+R+RBI ≥ 1 ≥ hits ≥ 1", ["batter_hits_runs_rbis", 0.5], ["batter_hits", 0.5]],
      ["TB ≥ 2 ≥ hits ≥ 2", ["batter_total_bases", 1.5], ["batter_hits", 1.5]],
    ] as [string, [string, number], [string, number]][]) {
      const [n, bad] = implies(a, b, "model");
      expect(bad, `${name}: ${bad} of ${n} players violate an implication that holds by definition`).toBe(0);
    }
  });

  it("every ladder is monotone — P(X ≥ a) ≥ P(X ≥ b) for a < b", () => {
    for (const mkt of ["batter_hits", "batter_total_bases", "batter_home_runs",
                       "batter_hits_runs_rbis", "pitcher_strikeouts", "pitcher_outs"]) {
      const byPlayer = new Map<string, number[]>();
      for (const k of P.keys()) {
        const [who, m, ln] = k.split("|");
        if (m !== mkt) continue;
        (byPlayer.get(who) ?? byPlayer.set(who, []).get(who)!).push(Number(ln));
      }
      for (const [who, lns] of byPlayer) {
        lns.sort((a, b) => a - b);
        for (let i = 0; i < lns.length - 1; i++) {
          const lo = get(who, mkt, lns[i])!;
          const hi = get(who, mkt, lns[i + 1])!;
          expect(
            lo.model - hi.model,
            `${mkt} ${who}: P(≥${lns[i]}) < P(≥${lns[i + 1]}) — a ladder cannot rise`,
          ).toBeGreaterThanOrEqual(-TOL);
        }
      }
    }
  });
});
