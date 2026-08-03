/**
 * THE hard constraint of the rebuild: the extracted engine must generate a
 * pick/ticket digest byte-identical to the legacy app's build-43/44 baseline
 * on the captured real fixtures. If this fails, the math changed — stop.
 *
 * ── SCOPED 2026-08-03 BY THE SINGLES FLIP, AND SCOPED RATHER THAN REGENERATED ────────
 * `baseline43.json` is the LEGACY APP'S artifact. Its value is PROVENANCE: it proves the
 * extraction is faithful to a build that shipped before this repo existed. The legacy app had
 * no singles, so with `singlesOn:true` the digest cannot match — and REGENERATING baseline43
 * from our own engine would destroy a provenance guarantee and replace it with a self-generated
 * one wearing the same filename. That is the "self-grading" failure this project keeps naming.
 *
 * So the legacy case is SCOPED instead: it pins `singlesOn:false`, which is the exact
 * configuration the baseline was captured under, and the extraction guarantee survives intact.
 * The SHIPPED configuration gets its own regression net below (`baseline44-singles.json`,
 * GENERATED 2026-08-03 from the flipped engine and named as generated, not as parity).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FROZEN_NOW, digest, fixtureEngine, readBaseline } from "./helpers/fixture-env";
import type { BoardData } from "@/engine";

describe("engine parity vs legacy baseline43 (build 43/44 generation)", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FROZEN_NOW);
  });
  afterAll(() => vi.useRealTimers());

  it("produces an identical generation digest (legacy config: singlesOn OFF)", async () => {
    const eng = fixtureEngine();
    /* the configuration baseline43 was captured under — see the header. Not a workaround: the
       legacy app HAD no singles, so this is the only configuration in which the parity claim
       is even meaningful. */
    eng.get<Record<string, unknown>>("SH_CFG").singlesOn = false;
    const slate = await eng.collectSlate();
    const d = eng.analyze(slate) as unknown as Record<string, unknown>;
    const got = JSON.stringify(digest(d));
    const want = readBaseline("baseline43.json");

    if (got !== want) {
      // localize the first difference for the failure message
      const A = JSON.parse(want);
      const B = JSON.parse(got);
      for (const k of ["parlays", "parlaysMixed", "parlaysLive"] as const) {
        expect(B[k].length, `${k} count`).toBe(A[k].length);
        for (let i = 0; i < A[k].length; i++) {
          expect(B[k][i], `${k}[${i}]`).toEqual(A[k][i]);
        }
      }
      for (const k of Object.keys(A.categories)) {
        expect(B.categories[k], `categories.${k}`).toEqual(A.categories[k]);
      }
    }
    expect(got).toBe(want);
  }, 120_000);

  it("SHIPPED config (singles live) matches its own generated baseline", async () => {
    /* GENERATED 2026-08-03 from the flipped engine — a REGRESSION net, not a parity claim, and
       labelled so nobody later cites it as provenance. It is what catches an unintended change
       to the configuration production actually runs. */
    const eng = fixtureEngine();
    const d = eng.analyze(await eng.collectSlate()) as unknown as Record<string, unknown>;
    expect(JSON.stringify(digest(d))).toBe(readBaseline("baseline44-singles.json"));
  }, 120_000);

  it("board carries the additive layers the UI needs (cz prices, gameInfo)", async () => {
    const eng = fixtureEngine();
    const slate = await eng.collectSlate();
    const d = eng.analyze(slate) as BoardData;

    const rows = Object.entries(d.categories)
      .filter(([k]) => k !== "all")
      .flatMap(([, v]) => v);
    const withCz = rows.filter((r) => r.cz != null);
    expect(withCz.length).toBeGreaterThan(0);
    for (const r of withCz) {
      expect(r.czOdds, `czOdds on ${r.label}`).not.toBeNull();
      expect(r.czEv, `czEv on ${r.label}`).not.toBeNull();
    }
    expect(d.gameInfo && Object.keys(d.gameInfo).length).toBeGreaterThan(0);
    const czTix = [...d.parlays, ...d.parlaysMixed].filter((t) => t.czOdds != null);
    expect(czTix.length).toBeGreaterThan(0);
  }, 120_000);
});
