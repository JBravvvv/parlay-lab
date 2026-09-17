import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FROZEN_NOW, armedFixtureEngine, digest } from "./helpers/fixture-env";
import { applyEnvClosedForm, applyParkDaily, bindParkDaily } from "@/lib/env-adjust";
import { parkDailyForGame } from "@/lib/mlb/ballpark";

/**
 * THE DAILY BALLPARK HOOK REACHES THE ENGINE (INSTRUCTION 68, 2026-09-17). Same shape as the
 * envCf proof (tests/env-closed-form.test.ts): armed, `windNote` reads the hook and the batter
 * markets AND the pitcher trims move; the flag without the binding — or the binding without
 * the flag — is byte-identical to the legacy rule (the dormancy the baselines rely on).
 */

const T9 = 300_000;
type Row = { label?: string; sub?: string; prob?: number };
const probMap = (d: Record<string, unknown>, mkt: string) => {
  const rows = ((d.categories as Record<string, Row[]>) ?? {})[mkt] ?? [];
  const m = new Map<string, number>();
  for (const r of rows) m.set(`${r.label}|${r.sub}`, Number(r.prob));
  return m;
};

describe("daily ballpark factor → engine (armed fixture, fix39 weather)", () => {
  it("armed (flag + hook), rows move in every batter market and the pitcher K's / outs trims", async () => {
    vi.setSystemTime(FROZEN_NOW);
    const off = armedFixtureEngine();
    applyEnvClosedForm(off.get<Record<string, unknown>>("SH_CFG"));
    const dOff = off.analyze(await off.collectSlate()) as Record<string, unknown>;
    vi.setSystemTime(FROZEN_NOW);
    const on = armedFixtureEngine();
    applyEnvClosedForm(on.get<Record<string, unknown>>("SH_CFG"));
    applyParkDaily(on.get<Record<string, unknown>>("SH_CFG"));
    bindParkDaily(on);
    const dOn = on.analyze(await on.collectSlate()) as Record<string, unknown>;
    for (const mkt of ["batter_home_runs", "batter_hits", "batter_total_bases", "batter_hits_runs_rbis", "pitcher_strikeouts", "pitcher_outs"]) {
      const a = probMap(dOff, mkt);
      const b = probMap(dOn, mkt);
      let moved = 0, shared = 0;
      for (const [k, v] of a) {
        if (!b.has(k)) continue;
        shared++;
        if (b.get(k) !== v) moved++;
      }
      expect(shared, `${mkt}: no comparable rows`).toBeGreaterThan(0);
      expect(moved, `${mkt}: zero rows moved under parkDaily — the hook does not reach this market`).toBeGreaterThan(0);
    }
  }, T9);

  it("the flag alone (no hook bound) and the hook alone (no flag) are both byte-identical to the legacy rule", async () => {
    vi.setSystemTime(FROZEN_NOW);
    const base = armedFixtureEngine();
    applyEnvClosedForm(base.get<Record<string, unknown>>("SH_CFG"));
    const dBase = digest(base.analyze(await base.collectSlate()) as Record<string, unknown>);
    vi.setSystemTime(FROZEN_NOW);
    const flagOnly = armedFixtureEngine();
    applyEnvClosedForm(flagOnly.get<Record<string, unknown>>("SH_CFG"));
    applyParkDaily(flagOnly.get<Record<string, unknown>>("SH_CFG"));
    expect(digest(flagOnly.analyze(await flagOnly.collectSlate()) as Record<string, unknown>)).toEqual(dBase);
    vi.setSystemTime(FROZEN_NOW);
    const hookOnly = armedFixtureEngine();
    applyEnvClosedForm(hookOnly.get<Record<string, unknown>>("SH_CFG"));
    bindParkDaily(hookOnly);
    expect(digest(hookOnly.analyze(await hookOnly.collectSlate()) as Record<string, unknown>)).toEqual(dBase);
  }, T9);

  it("the card text names the wind, the temperature and the multiplier when armed (fix39's live weather overlaid by venue)", async () => {
    /* the engine's schedule fixture (schedule_tom_lu) posts `weather: {}` on every game, so the
       armed run above moves on elevation alone; here the same real fix39 sky is overlaid by venue
       through the hook — the exact object shape the blob hands `shParkDaily(g)` — to prove the
       wind / temperature read reaches the case text. */
    const sched = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "fix39", "schedule.json"), "utf8")) as { dates: { games: { venue: { name: string }; weather: Record<string, string> }[] }[] };
    const WX: Record<string, Record<string, string>> = {};
    for (const g of sched.dates[0].games) WX[g.venue.name] = g.weather;
    vi.setSystemTime(FROZEN_NOW);
    const on = armedFixtureEngine();
    applyEnvClosedForm(on.get<Record<string, unknown>>("SH_CFG"));
    applyParkDaily(on.get<Record<string, unknown>>("SH_CFG"));
    on.set("shParkDaily", (g: { venue?: string | null; weather?: Record<string, string> | null } | null) =>
      parkDailyForGame(g ? { ...g, weather: (g.venue && WX[g.venue]) || g.weather } : g),
    );
    const d = on.analyze(await on.collectSlate()) as Record<string, unknown>;
    const rows = ((d.categories as Record<string, { case?: string; label?: string }[]>) ?? {}).batter_home_runs ?? [];
    const cases = rows.map((r) => String(r.case ?? ""));
    expect(cases.length).toBeGreaterThan(0);
    // Comerica: 80 °F, 7 mph Out To LF (corner weight 0.75), 600 ft → 1.08 × 1.0525 × 1.007 ≈ 1.14
    expect(cases.some((c) => /wind 7 mph, Out To LF \(out\) · 80°F · 600 ft ×1\.1[45]/.test(c))).toBe(true);
    // Tropicana: a dome — no wind line, the reported 72 °F still prints
    expect(cases.some((c) => /wind roof closed · 72°F ×1\.02/.test(c))).toBe(true);
  }, T9);
});

describe("wiring — every generator arms the flag AND binds the hook (a half-armed generator prices the legacy way)", () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
  for (const p of ["src/lib/engine-client.ts", "app/api/generate/route.ts", "app/api/scheduler/route.ts"]) {
    it(p, () => {
      const s = read(p);
      expect(s).toMatch(/applyParkDaily\(cfg\)/);
      expect(s).toMatch(/bindParkDaily\((engine|eng)\)/);
    });
  }
  it("the blob declares the hook var beside shTempF, windNote consults it first, and hits / TB read h / tb", () => {
    const html = read("legacy/index.html");
    expect(html).toMatch(/var shParkDaily=null;/);
    expect(html).toMatch(/var dp=\(SH_CFG&&SH_CFG\.parkDaily&&typeof shParkDaily==="function"\)\?shParkDaily\(g\):null;/);
    expect(html).toMatch(/if\(dp&&isFinite\(dp\.f\)\)return \{f:dp\.f,h:dp\.h,tb:dp\.tb,txt:dp\.txt\|\|null\};/);
    expect(html).toMatch(/tbF=power\*pq\*\(wind\.tb\|\|\(wind\.f>1\?1\.05:wind\.f<1\?0\.96:1\)\)\*/);
    expect((html.match(/\*\(wind\.h\|\|1\)/g) ?? []).length).toBe(3);
  });
});
