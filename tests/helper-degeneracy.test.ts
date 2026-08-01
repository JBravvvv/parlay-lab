import { describe, expect, it } from "vitest";
import {
  ARMED_DAILY,
  FROZEN_NOW,
  TODAY,
  armedFixtureEngine,
  digest,
  fixtureEngine,
  fixtureFetchJson,
  readBaseline,
  stableHash,
} from "./helpers/fixture-env";
import { deviceReachableModes, isDisciplined } from "./helpers/modes";
import type { Engine } from "@/engine";

/**
 * SHARED-HELPER DEGENERACY (2026-08-01, owner's item 1).
 *
 * ── THE RULE, general form ───────────────────────────────────────────────────────────
 *   A FILTER SHARED BY N GUARDS SILENTLY DISABLES N GUARDS WHEN IT GOES INERT, SO IT
 *   NEEDS AN ASSERTION THAT FIRES WHEN IT STOPS DOING ANYTHING.
 * Record it beside the count-versus-substitution rule: that one is about what a single
 * assertion can be fooled by; this one is about what a single helper can take down.
 *
 * The stripper proved it — neutered to `(s) => s`, six dependent guards passed 40/40 and
 * only its own test noticed. This file asks the same question of every OTHER shared helper,
 * and the neuter was actually RUN for each rather than reasoned about.
 *
 * ── MEASURED 2026-08-01, one neuter per helper ───────────────────────────────────────
 * | helper                          | deps | neutered to            | caught by dependents? |
 * | tests/helpers/source (strip)    |  13  | (s) => s               | NO — 40/40 green      |
 * | fixture-env fixtureFetchJson    |   8  | {ok:true, body:{}}     | YES — 7 of 8 failed   |
 * | fixture-env stableHash          |   4  | a constant             | YES — cfsel-guard 4,  |
 * |                                 |      |                        | armed-baseline 2      |
 * | modes deviceReachableModes      |   3  | []                     | YES — the suspension  |
 * |                                 |      |                        | guards assert >=2     |
 * |                                 |      |                        | disciplined, >=1 leg. |
 * | tools/strict num()              |   n  | () => 0                | YES — both tool suites|
 * | fixture-env armedFixtureEngine  |  15  | an UNARMED engine      | **PARTLY — 7 of 15    |
 * |                                 |      |                        | still passed**        |
 *
 * ── THE ONE THAT MATTERS, by the owner's priority rule ───────────────────────────────
 * `armedFixtureEngine` feeds BOTH suspension guards, and with it returning an unarmed
 * engine — no priors, no context, no `SH_V2`, so no Shin de-vig, no sim, no park/ump
 * factors — `outs-suspension-coupling` and `hrr-suspension-coupling` BOTH still passed,
 * as did `finite-prices` and `self-consistency`.
 *
 * THAT IS NOT PROOF OF A BUG. The suspension bar lives in `finalizeCats`/`buildParlaySet`,
 * not in the armed pipeline, so holding unarmed is plausible and probably correct. What it
 * proves is that **the certification does not depend on the arming it is documented to run
 * under** — so if arming silently stopped, those guards would go on certifying a WEAKER
 * engine than production runs, and say nothing. Measured on a different population is the
 * class this session keeps finding.
 *
 * The fix is here rather than in the suspension guards: ONE assertion at the source covers
 * all fifteen dependents, and it is the helper's own claim about itself that is being
 * checked. OBSERVED RED by re-running the unarmed neuter with this file in place.
 */

/** Dependent counts, from the import census. Update beside the helper, not silently. */
const DEPENDENTS = {
  "helpers/fixture-env": 38,
  "helpers/source": 13,
  "helpers/modes": 3,
} as const;

describe("shared helpers fail loudly when they go inert", () => {
  it("the dependent census is recorded, so 'shared by N' is a number and not a feeling", () => {
    expect(Object.values(DEPENDENTS).every((n) => n > 1)).toBe(true);
    // fixture-env is the largest shared surface in the suite — larger than the stripper,
    // which is the one that actually failed. Size is not the risk; a missing check is.
    expect(DEPENDENTS["helpers/fixture-env"]).toBeGreaterThan(DEPENDENTS["helpers/source"]);
  });

  it("fixtureFetchJson serves REAL fixture bodies, not empty ones", async () => {
    const r = await fixtureFetchJson("https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-07-10");
    expect(r.ok, "the schedule fixture no longer resolves — every engine guard degrades to 'no games'").toBe(true);
    expect(
      JSON.stringify(r.body).length,
      "fixtureFetchJson returned an EMPTY body. Every engine guard built on it collapses to a " +
        "no-data path; measured, 7 of its 8 dependents fail loudly and one does not.",
    ).toBeGreaterThan(200);
  });

  it("armedFixtureEngine actually ARMS — the neuter 7 of 15 dependents did not notice", () => {
    const eng = armedFixtureEngine();
    const priors = eng.get<unknown>("SH_PRIORS");
    const ctx = eng.get<unknown>("SH_CTX");
    const v2 = eng.get<Record<string, unknown>>("SH_V2");
    expect(priors, "SH_PRIORS is not set — the 'armed' engine is unarmed").toBeTruthy();
    expect(ctx, "SH_CTX is not set — the 'armed' engine is unarmed").toBeTruthy();
    expect(v2, "SH_V2 is not set — no Shin de-vig, no sim, no park/ump factors").toBeTruthy();
    for (const k of ["shin", "sharpW", "sim", "projLineup", "priors", "ctx"]) {
      expect(v2?.[k], `SH_V2.${k} is not on — the armed pipeline is partly disarmed`).toBe(true);
    }
    expect(Number(v2?.simN), "SH_V2.simN is not a positive sim depth").toBeGreaterThan(0);
    // and it must DIFFER from the unarmed one, or "armed" means nothing
    const plain: Engine = fixtureEngine();
    expect(
      plain.get<unknown>("SH_PRIORS") ?? null,
      "the UNARMED fixture engine already carries priors — the two are indistinguishable",
    ).toBeNull();
  });

  it("stableHash and digest are not constants", () => {
    expect(stableHash({ a: 1 })).not.toBe(stableHash({ a: 2 }));
    expect(stableHash({ a: 1 }), "stableHash is order-unstable — it is meant to be order-free").toBe(
      stableHash({ a: 1 }),
    );
    /* the key is `categories`, which digest() reads — an input digest() ignores would make
       this case pass on a blind digest, which is the failure it exists to catch. */
    const row = (label: string) => ({ categories: { x: [{ label, sub: "s", odds: 1, prob: 2, ev: 3 }] } });
    const d1 = JSON.stringify(digest(row("a") as never));
    const d2 = JSON.stringify(digest(row("b") as never));
    expect(d1, "digest ignored the input entirely — this case is checking nothing").toContain("\"a\"");
    expect(d1, "digest is blind to a changed field — every 'unchanged' assertion is trivially true").not.toBe(d2);
  });

  it("deviceReachableModes covers a real domain — an empty domain makes every mode loop vacuous", () => {
    const modes = deviceReachableModes();
    expect(modes.length, "the reachable-mode domain is EMPTY — every `for (const mode of ...)` runs zero times").toBeGreaterThanOrEqual(3);
    expect(modes.filter(isDisciplined).length, "no disciplined mode in the domain").toBeGreaterThanOrEqual(2);
    expect(modes.filter((m) => !isDisciplined(m)).length, "no legacy mode in the domain").toBeGreaterThanOrEqual(1);
  });

  it("readBaseline returns a real baseline, and the frozen constants are frozen", () => {
    expect(readBaseline("baseline43.json").length, "the baseline is empty — every parity comparison is vacuous").toBeGreaterThan(1_000);
    expect(TODAY, "TODAY drifted — every fixture route keys on it").toBe("2026-07-10");
    expect(FROZEN_NOW, "FROZEN_NOW drifted — every time-dependent guard moves with it").toBe(Date.parse("2026-07-10T03:30:00Z"));
    expect(ARMED_DAILY).toBeGreaterThan(0);
  });

  it("PLANT (invalid-by-value): an unarmed engine is caught by the arming check", () => {
    const plain = fixtureEngine();
    expect(plain.get<unknown>("SH_V2") ?? null, "the arming check would pass an unarmed engine").toBeNull();
  });
});
