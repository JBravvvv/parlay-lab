import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { ARMED_DAILY, ARMED_FUN, FROZEN_NOW, armedDigest, armedFixtureEngine, digest, fixtureEngine } from "./helpers/fixture-env";

/**
 * baseline-armed-v1 — the ARMED regression net (2026-07-26).
 *
 * NOT a replacement for `baseline43.json` and never to be conflated with it. That one
 * pins the LEGACY, v2-dormant math verbatim (`SH_V2`/`SH_PRIORS`/`SH_CTX` all null, per
 * `legacy/index.html` L1547) and must never be regenerated with more inputs — doing so
 * would invalidate every prior digest comparison in the repo's history.
 *
 * This one exists because the dormant baseline exercises **zero of the seven identity
 * factors** and **none of the card path**, so "parity digest unchanged" was a void
 * acceptance criterion for anything living in `shAllocate`, `buildParlaySet`/`shCardPool`,
 * or row shape. See docs/collection-period.md, "What the parity digest actually covers".
 *
 * It captures TODAY'S PRODUCTION STATE, pins included (`umpKFrozen`/`penQFrozen` true) —
 * that is current behaviour, and current behaviour is what a regression test holds.
 *
 * THE FIXTURE DIVERGES FROM PRODUCTION IN BOTH DIRECTIONS ON THE PINNED FACTORS, so its
 * numbers describe neither. `SH_CTX` is absent from the DORMANT harness, making the seven
 * identity factors fixture-inert while `shPenF`/`shTempF` are 100% production-active; and
 * the fix45 context deliberately carries `hpUmp.kFactor` and `pen_quality.ip` values that
 * clear both guards, making `shUmpKf`/`shPenQF` fixture-ACTIVE while both are pinned and
 * production-inert. Same factors, opposite directions. The 8ed8dd2 retro diff is the proof:
 * releasing the pins on HEAD reproduced 8ed8dd2 byte-for-byte, i.e. the pins move this
 * fixture by 8 K rows and 14 H+R+RBI rows while moving production by nothing at all.
 *
 * IT IS A REGRESSION INSTRUMENT, NOT A SOURCE OF PRODUCTION VALUES. The fixture context's
 * `hpUmp.g` spans (3/5/9/40) and `pen_quality.ip` alternation (9.0/40.0) are chosen to
 * exercise both sides of each guard, which is right for catching movement and wrong for
 * anything else. Its numbers answer "did my change move something", never "is this number
 * correct". Do not cite a figure from this baseline as a production measurement.
 *
 * Determinism was verified before the baseline was written: three armed runs produced
 * byte-identical full boards (555,890 chars each). Sim seeding is `shMulberry`,
 * `simN`/`simNHR` are pinned to `SIM_PATHS_FIXTURE`, and dates are pinned via
 * `createEngine({ today })` under fake timers.
 */
describe("baseline-armed-v1 — the armed regression net", () => {
  /**
   * `propBoard` JOINED THE BASELINE ON 2026-07-27, ADDITIVELY.
   *
   * It is 35% of the board blob and no parity check had ever covered it — while being the
   * population BOTH instruments behind the H+R+RBI ladder finding run on (the ladder test
   * and tools/range_compression.py). So the two things that produced the finding sat on the
   * one large object nothing verified.
   *
   * The addition is provably additive: the regenerated file is the previous file with 221
   * bytes appended and not one byte changed.
   *
   *   BEFORE  53b2424b80a72b6a056e2b4fa264925e   94,897 bytes
   *   AFTER   418125e2acb4afbae90c6344f48b8888   95,118 bytes  (+221)
   *
   * ⚠️ COVERAGE IS NOT REPRESENTATIVENESS. The fixture's propBoard is **6 games / 289 rows**,
   * and **133 of those rows are `batter_home_runs`** — the market that is 100% one-sided and
   * carries no `fair`. `pitcher_outs` has **7 rows** and H+R+RBI **14**: the two markets whose
   * findings depend on propBoard are its thinnest. This baseline now catches MOVEMENT in
   * propBoard. It does not make the fixture a sample of it. That is what the 20-board archive
   * series is for.
   */
  const BASELINE_BEFORE_PROPBOARD = "53b2424b80a72b6a056e2b4fa264925e";

  it("the propBoard section was appended, not merged into anything", () => {
    const raw = fs.readFileSync(path.join(__dirname, "fixtures", "baseline-armed-v1.json"), "utf8");
    const cut = raw.lastIndexOf(',"propBoard":');
    expect(cut, "propBoard section missing from the armed baseline").toBeGreaterThan(0);
    // the file with the appended section removed must hash to the pre-addition baseline
    const prior = raw.slice(0, cut) + "}";
    expect(createHash("md5").update(prior).digest("hex")).toBe(BASELINE_BEFORE_PROPBOARD);
  });

  it("propBoard is hashed, counted, and thin exactly where it matters", async () => {
    vi.setSystemTime(FROZEN_NOW);
    const eng = armedFixtureEngine();
    const d = eng.analyze(await eng.collectSlate()) as unknown as Record<string, unknown>;
    const pb = armedDigest(d, eng).propBoard;
    expect(pb.md5).toBe("c8c520787986e7297f9136e143cbf693");
    expect(pb.games).toBe(6);
    expect(pb.rows).toBe(289);
    // pinned so the thinness is a stated fact rather than a discovery on 08-15
    expect(pb.byMarket.batter_home_runs).toBe(133); // 46% of the rows, and unpriceable
    expect(pb.byMarket.pitcher_outs).toBe(7);
    expect(pb.byMarket.batter_hits_runs_rbis).toBe(14);
  }, 300_000);

  it("armed board + card path match the stored armed baseline", async () => {
    vi.setSystemTime(FROZEN_NOW);
    const eng = armedFixtureEngine();
    const slate = await eng.collectSlate();
    const d = eng.analyze(slate) as unknown as Record<string, unknown>;
    const got = JSON.stringify(armedDigest(d, eng));
    const want = fs.readFileSync(path.join(__dirname, "fixtures", "baseline-armed-v1.json"), "utf8");

    if (got !== want) {
      const A = JSON.parse(want) as Record<string, never>;
      const B = JSON.parse(got) as Record<string, never>;
      for (const k of Object.keys(A)) {
        expect(B[k], `armed digest section: ${k}`).toEqual(A[k]);
      }
    }
    expect(got).toBe(want);
  }, 300_000);

  it("arming is load-bearing: the armed board differs from the dormant one", async () => {
    vi.setSystemTime(FROZEN_NOW);
    const a = fixtureEngine();
    const sa = await a.collectSlate();
    vi.setSystemTime(FROZEN_NOW);
    const b = armedFixtureEngine();
    const sb = await b.collectSlate();
    expect(JSON.stringify(digest(b.analyze(sb) as never))).not.toBe(
      JSON.stringify(digest(a.analyze(sa) as never)),
    );
  }, 300_000);

  it("covers the card path the dormant digest never saw", () => {
    const want = JSON.parse(
      fs.readFileSync(path.join(__dirname, "fixtures", "baseline-armed-v1.json"), "utf8"),
    ) as { pool: string[]; alloc: { blocked: string[]; noPlay: boolean }; fun: { picks: unknown[] } };
    // the surfaces Phases 3/4/5 land on must actually be present, or this baseline is
    // as void as the criterion it replaces
    expect(Array.isArray(want.pool)).toBe(true);
    expect(want.pool.length).toBeGreaterThan(0);
    expect(Array.isArray(want.alloc.blocked)).toBe(true);
    expect(typeof want.alloc.noPlay).toBe("boolean");
    expect(Array.isArray(want.fun.picks)).toBe(true);
  });

  it("the card-path inputs are fixed, not read from UI state", () => {
    expect(ARMED_DAILY).toBe(250);
    expect(ARMED_FUN).toBe(5);
  });
});
