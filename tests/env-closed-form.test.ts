import { describe, expect, it, vi } from "vitest";
import { FROZEN_NOW, armedFixtureEngine, digest, fixtureEngine } from "./helpers/fixture-env";
import { applyEnvClosedForm } from "@/lib/env-adjust";

/**
 * ENV→CLOSED-FORM (2026-08-27, Josh's word, verbatim: "Make sure the engine is taking
 * into account daily ballpark factor and weather. … Sunny day @ Great American, Coors,
 * Nationals Park, Chase Field, Toronto, Globe Life or Athletics Ballpark in Sacramento
 * then the ball will probably fly and odds for HR, H+R+RBI, Hits, Total Bases, RBI,
 * Runs Scored etc most likely go up while theoretical odds a pitcher goes over K's/outs
 * goes down if hitters are doing better.")
 *
 * The recorded M1/M3 freeze-exit amendments, shipped dormant behind SH_CFG.envCf:
 *   - park×handedness (shParkF) replaces the Coors flags in the closed-form batter
 *     factors (double-counting rule, freeze-exit-bundle L614);
 *   - H+R+RBI λ becomes the recorded mass-weighted blend 0.74·hF + 0.26·tbF
 *     (hrr-recalibration.md "THE CORRECTED λ" — pitcher terms enter once, never a product);
 *   - pitcher K's gain the venue K index (parks.k, 50% damped, clamp 0.94–1.06);
 *   - pitcher K's/outs gain a hitter-weather trim (wind/temp inverse, clamp 0.97–1.03;
 *     outs also carry the park run-environment inverse, 25% damped).
 *
 * DORMANCY IS THE PARITY STRATEGY (the side-aware precedent): fixtures never set envCf,
 * so baseline43 / baseline44-singles / the armed baseline all held without a re-cut —
 * proven by their own suites this same gate. The tests here prove the OTHER half:
 * armed, the routing actually moves every market Josh named, and the flag alone on an
 * unarmed engine (no priors/parks) moves nothing.
 */

const T9 = 300_000;
type Row = { label?: string; sub?: string; prob?: number };
const probMap = (d: Record<string, unknown>, mkt: string) => {
  const rows = ((d.categories as Record<string, Row[]>) ?? {})[mkt] ?? [];
  const m = new Map<string, number>();
  for (const r of rows) m.set(`${r.label}|${r.sub}`, Number(r.prob));
  return m;
};

describe("env→closed-form routing (armed fixture: real Savant park values, fix45)", () => {
  it("moves closed-form rows in EVERY market Josh named — batter and pitcher alike", async () => {
    vi.setSystemTime(FROZEN_NOW);
    const off = armedFixtureEngine();
    const dOff = off.analyze(await off.collectSlate()) as Record<string, unknown>;
    vi.setSystemTime(FROZEN_NOW);
    const on = armedFixtureEngine();
    applyEnvClosedForm(on.get<Record<string, unknown>>("SH_CFG"));
    const dOn = on.analyze(await on.collectSlate()) as Record<string, unknown>;
    for (const mkt of [
      "batter_home_runs", "batter_hits", "batter_total_bases", "batter_hits_runs_rbis",
      "pitcher_strikeouts", "pitcher_outs",
    ]) {
      const a = probMap(dOff, mkt);
      const b = probMap(dOn, mkt);
      let moved = 0, shared = 0;
      for (const [k, v] of a) {
        if (!b.has(k)) continue;
        shared++;
        if (b.get(k) !== v) moved++;
      }
      expect(shared, `${mkt}: no comparable rows`).toBeGreaterThan(0);
      expect(moved, `${mkt}: zero rows moved under envCf — the routing does not reach this market`).toBeGreaterThan(0);
    }
  }, T9);

  it("DOUBLE GATE: the flag on an UNARMED engine (no SH_V2, no parks) changes nothing", async () => {
    vi.setSystemTime(FROZEN_NOW);
    const off = fixtureEngine();
    const dOff = off.analyze(await off.collectSlate()) as Record<string, unknown>;
    vi.setSystemTime(FROZEN_NOW);
    const on = fixtureEngine();
    applyEnvClosedForm(on.get<Record<string, unknown>>("SH_CFG"));
    const dOn = on.analyze(await on.collectSlate()) as Record<string, unknown>;
    expect(digest(dOn)).toEqual(digest(dOff));
  }, T9);
});

describe("wired — both generators arm the flag beside the suspension lift", () => {
  it("generate route, scheduler backfill, and the browser engine all call applyEnvClosedForm", async () => {
    const fs = await import("node:fs");
    for (const f of ["app/api/generate/route.ts", "app/api/scheduler/route.ts", "src/lib/engine-client.ts"]) {
      expect(fs.readFileSync(f, "utf8")).toMatch(/applyEnvClosedForm\(cfg\)/);
    }
  });
});
