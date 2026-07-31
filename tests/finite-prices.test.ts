import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { armedFixtureEngine, ARMED_DAILY, FROZEN_NOW } from "./helpers/fixture-env";

/**
 * FINITENESS INVARIANT ON THE PRICING PATH (2026-07-30, owner's item 4).
 *
 * WHY THIS CLASS NEEDS ENCODING RATHER THAN A WRITTEN RULE: every comparison with NaN
 * evaluates FALSE, so a NaN price fails every gate — `czEv >= coreEvMin`, `czEv >= czMin`,
 * `eff > bw` — and the row/ticket DISAPPEARS with no error, no log, and no blocked-reason
 * entry. The failure is invisible by construction: a silently-vanishing row looks exactly
 * like a row that was never eligible.
 *
 * AND THE ENGINE PROPAGATES IT: `shClamp(NaN, lo, hi)` returns NaN (measured — Math.max/min
 * pass NaN through), so any factor that computes NaN carries it into the price rather than
 * failing loudly. Every factor is a clamped multiplier.
 *
 * WHAT PROMPTED IT (recorded honestly): a 2026-07-30 probe reported a NaN from
 * `shPenQFShadow`. That was MY PROBE'S ERROR — the function returns an OBJECT
 * `{f, era, ip}`, and Math.min over objects is NaN. The corrected check reads all 30
 * teams: 30 finite `f` values, range [0.9500, 1.0600], ZERO non-finite. The instance was
 * wrong; the CLASS is real and had no guard anywhere in 559 tests — every `isFinite` in
 * the suite was a filter or a helper, never an assertion. This is that assertion.
 *
 * OBSERVED RED 2026-07-30 before acceptance: a planted NaN in one emitted row's `prob`
 * was detected by the row sweep; a planted NaN factor confirmed clamp propagation.
 */

type Row = Record<string, unknown>;

const PRICE_FIELDS = ["prob", "implied", "edge", "ev", "kellyF", "czEv", "czKellyF", "pModel"];

describe("no non-finite number reaches a price or a stake", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });
  afterAll(() => vi.useRealTimers());

  it("every emitted row's numeric price fields are finite (or explicitly null)", async () => {
    const eng = armedFixtureEngine();
    const cfg = eng.get<Record<string, unknown>>("SH_CFG");
    cfg.selMode = "ev_gated";
    cfg.mktN = Object.fromEntries(
      ["ml", "rl", "batter_hits", "batter_total_bases", "batter_home_runs",
        "batter_hits_runs_rbis", "pitcher_strikeouts", "pitcher_outs"].map((k) => [k, 999]),
    );
    const data = eng.analyze(await eng.collectSlate()) as Record<string, unknown>;
    const cats = (data.categories ?? {}) as Record<string, Row[]>;
    const bad: string[] = [];
    let checked = 0;
    for (const [mkt, rows] of Object.entries(cats)) {
      for (const r of rows) {
        for (const f of PRICE_FIELDS) {
          const v = r[f];
          if (v == null) continue; // null is a first-class "no reading" in this engine
          checked++;
          if (typeof v !== "number" || !Number.isFinite(v)) bad.push(`${mkt} ${r.lkey}.${f} = ${String(v)}`);
        }
      }
    }
    expect(checked, "no price fields inspected — the fixture lost its rows, the invariant is vacuous").toBeGreaterThan(100);
    expect(bad, `NON-FINITE price fields reached emitted rows (they would fail every gate SILENTLY): ${bad.slice(0, 5).join(" · ")}`).toHaveLength(0);
  }, 600_000);

  it("every allocated stake is a finite positive number", async () => {
    const eng = armedFixtureEngine();
    const cfg = eng.get<Record<string, unknown>>("SH_CFG");
    cfg.selMode = "ev_gated";
    cfg.mktN = Object.fromEntries(
      ["ml", "rl", "batter_hits", "batter_total_bases", "batter_home_runs",
        "batter_hits_runs_rbis", "pitcher_strikeouts", "pitcher_outs"].map((k) => [k, 999]),
    );
    const data = eng.analyze(await eng.collectSlate()) as Record<string, unknown>;
    const pool = eng.get<(d: unknown) => unknown[]>("shCardPool")(data);
    const alloc = eng.get<(p: unknown[], a: number, c: unknown, f: boolean) => Record<string, unknown>>("shAllocate");
    const picks = (alloc(pool, ARMED_DAILY, eng.get("SH_CFG"), false).picks as Row[]) ?? [];
    expect(picks.length, "no picks — the stake invariant is vacuous").toBeGreaterThan(0);
    for (const p of picks) {
      const s = Number(p.stake);
      expect(Number.isFinite(s), `non-finite stake on ${JSON.stringify(p.id)}`).toBe(true);
      expect(s, `non-positive stake on ${JSON.stringify(p.id)}`).toBeGreaterThan(0);
    }
  }, 600_000);

  it("PLANT: the sweep sees a single NaN, and shClamp propagates one", async () => {
    // (a) the row sweep's own detector
    const planted: Row[] = [{ lkey: "x|batter_hits|1.5", prob: NaN, ev: 1 }];
    const found = planted.flatMap((r) =>
      PRICE_FIELDS.filter((f) => r[f] != null && (typeof r[f] !== "number" || !Number.isFinite(r[f] as number))),
    );
    expect(found, "the sweep is blind to a planted NaN").toContain("prob");
    // (b) the propagation fact this guard exists for
    const eng = armedFixtureEngine();
    const clamp = eng.get<(v: number, lo: number, hi: number, id?: string) => number>("shClamp");
    expect(Number.isNaN(clamp(NaN, 0.95, 1.06)), "shClamp no longer propagates NaN — re-derive this guard's premise").toBe(true);
    // (c) and the reason it matters: every comparison with NaN is false
    expect(NaN >= 2, "NaN comparison semantics changed").toBe(false);
  }, 300_000);
});
