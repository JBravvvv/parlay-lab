/**
 * THE hard constraint of the rebuild: the extracted engine must generate a
 * pick/ticket digest byte-identical to the legacy app's build-43/44 baseline
 * on the captured real fixtures. If this fails, the math changed — stop.
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

  it("produces an identical generation digest", async () => {
    const eng = fixtureEngine();
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
