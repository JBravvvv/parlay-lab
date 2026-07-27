import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FROZEN_NOW, armedFixtureEngine } from "./helpers/fixture-env";

/**
 * ANY NEW DRAW INSIDE A SEEDED SIMULATION USES AN INDEPENDENT GENERATOR — NEVER THE PRIMARY.
 *
 * `rng = shMulberry(seed)` (L1829) is a deterministic stream seeded per game. Every simulated
 * outcome is a position in that stream, so **inserting one `rng()` call anywhere inside
 * `halfInning` shifts every subsequent draw** and moves every sim number on the board. A change
 * that reads as ten lines would silently rebaseline the entire simulation and both parity
 * baselines with it.
 *
 * This came up sizing `pitcher_strikeouts` → sim: adding a strikeout is a clean split of the
 * existing out-branch, ~10 lines, no cascade into the leash, the V2 hook or the bullpen chain —
 * **except for the RNG stream, which is the whole cost.** Drawing the K decision from a second,
 * independently seeded generator leaves the primary stream's consumption pattern untouched and
 * makes the feature additive and parity-checkable, exactly as `clampActivity` was.
 *
 * **The rule generalises past K's: every future sim addition has this trap.** So it is pinned
 * here rather than remembered — this test fails the moment the primary stream's draw count
 * changes, which is the one symptom every version of the mistake produces.
 *
 * WHEN A LEGITIMATE MODEL CHANGE MOVES THE SIM: update `PRIMARY_DRAWS` deliberately, in the same
 * commit, with the reason. That is the point — the number is a decision, not a fact.
 */

/* measured 2026-07-27 on the armed fixture at SIM_PATHS_FIXTURE */
const PRIMARY_DRAWS = 3_379_570;
const GENERATORS = 11;

describe("the primary sim RNG stream is pinned — new draws must use a second generator", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FROZEN_NOW);
  });
  afterAll(() => vi.useRealTimers());

  it("draw count and generator count are unchanged", async () => {
    const eng = armedFixtureEngine();
    let draws = 0;
    let gens = 0;
    const mul = eng.get<(s: number) => () => number>("shMulberry")!;
    eng.set("shMulberry", function (s: number) {
      gens++;
      const f = mul(s);
      return function () {
        draws++;
        return f();
      };
    });
    eng.analyze(await eng.collectSlate());

    expect(
      gens,
      `${gens} seeded generators, expected ${GENERATORS}. A NEW generator is the CORRECT way to ` +
        `add a draw — if that is what happened, raise GENERATORS and leave PRIMARY_DRAWS alone.`,
    ).toBe(GENERATORS);

    expect(
      draws,
      `the primary sim stream consumed ${draws} draws, expected ${PRIMARY_DRAWS}. Every simulated ` +
        `outcome is a POSITION in this stream, so a changed count means every sim number on the ` +
        `board moved. If a feature was added, draw it from a SECOND seeded generator instead. If ` +
        `the model genuinely changed, update this constant in the same commit with the reason.`,
    ).toBe(PRIMARY_DRAWS);
  }, 300_000);

  it("the rule is written where the next person adding a draw will look", () => {
    const eng = fs.readFileSync(path.join(__dirname, "..", "legacy", "index.html"), "utf8");
    // the seeding line carries the warning, not just this test file
    const i = eng.indexOf("var rng=shMulberry(seed)");
    expect(i).toBeGreaterThan(0);
    const near = eng.slice(Math.max(0, i - 900), i);
    expect(
      /SECOND|independent generator|second generator/i.test(near),
      "legacy/index.html's rng seeding has no note about the second-stream rule — a test only " +
        "fires when it is run; the comment is what the next editor actually sees.",
    ).toBe(true);
  });
});
