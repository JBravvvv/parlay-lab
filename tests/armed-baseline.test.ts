import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
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
