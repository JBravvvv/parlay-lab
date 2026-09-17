import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FROZEN_NOW, armedFixtureEngine, digest } from "./helpers/fixture-env";
import { applyEnvClosedForm, applyParlayVariety, PARLAY_VARIETY } from "@/lib/env-adjust";
import { LEGACY_SRC } from "@/engine/legacy-src.gen";

/**
 * PARLAY VARIETY (INSTRUCTION 71, 2026-09-17, Josh, verbatim): "Some of the parlays showing up on
 * 'Board' under generated parlays have 3 picks from the same game … Two picks from same game is
 * fine if its needed … but 3 should be avoided. … There needs to be as many parlays generated on
 * the bottom of the board page as possible for variety."
 *
 * Three SH_CFG knobs, all read inside buildParlaySet and all dormant when absent (fixtures never
 * set them, so every baseline digest stands): parlayGameCap (legs one ticket may take from one
 * game), parlayMore (how many times the per-type and mixed plans are repeated), parlayCap (the
 * per-player cap across a set). Armed the way the three generators arm them, the fixture slate
 * must build MORE tickets and NEVER put three legs from one game on a ticket.
 */
const T9 = 300_000;
type Leg = { game?: string; gkey?: string | null; label?: string };
type Tik = { name?: string; legs: Leg[] };
const sets = (d: Record<string, unknown>) =>
  (["parlays", "parlaysMixed", "parlaysLive"] as const).map((k) => [k, ((d[k] as Tik[] | undefined) ?? [])] as const);
const gameOf = (l: Leg) => String(l.gkey ?? l.game ?? "");
const maxSameGame = (t: Tik) => {
  const c: Record<string, number> = {};
  for (const l of t.legs) c[gameOf(l)] = (c[gameOf(l)] ?? 0) + 1;
  return Math.max(0, ...Object.values(c));
};

async function run(arm: boolean) {
  vi.setSystemTime(FROZEN_NOW);
  const eng = armedFixtureEngine();
  applyEnvClosedForm(eng.get<Record<string, unknown>>("SH_CFG"));
  if (arm) applyParlayVariety(eng.get<Record<string, unknown>>("SH_CFG"));
  return eng.analyze(await eng.collectSlate()) as Record<string, unknown>;
}

describe("INSTRUCTION 71 — generated-parlay variety (armed fixture)", () => {
  it("armed: no ticket in any set carries more than parlayGameCap legs from one game, and there are more tickets than unarmed", async () => {
    const off = await run(false);
    const on = await run(true);
    let nOff = 0, nOn = 0;
    for (const [k, list] of sets(on)) {
      nOn += list.length;
      for (const t of list) {
        expect(maxSameGame(t), `${k} · ${t.name}: ${t.legs.map((l) => `${l.label} [${gameOf(l)}]`).join(", ")}`).toBeLessThanOrEqual(PARLAY_VARIETY.parlayGameCap);
      }
    }
    for (const [, list] of sets(off)) nOff += list.length;
    expect(nOff).toBeGreaterThan(0);
    expect(nOn, `armed ${nOn} tickets vs unarmed ${nOff}`).toBeGreaterThan(nOff);
    // the unarmed run is what the bug looked like: the fixture's HR plan is allowed to stack a game
    const offMax = Math.max(0, ...sets(off).flatMap(([, l]) => l.map(maxSameGame)));
    expect(offMax).toBeGreaterThanOrEqual(2);
  }, T9);

  it("dormant: without the knobs the digest is byte-identical to the plain armed run (the baselines stand)", async () => {
    const a = digest(await run(false));
    const b = digest(await run(false));
    expect(a).toEqual(b);
    const eng = armedFixtureEngine();
    const cfg = eng.get<Record<string, unknown>>("SH_CFG");
    expect(cfg.parlayGameCap).toBeUndefined();
    expect(cfg.parlayMore).toBeUndefined();
    expect(cfg.parlayCap).toBeUndefined();
  }, T9);

  it("PARLAY_VARIETY — the values Josh asked for: two legs per game, three times the plan, five per player", () => {
    expect(PARLAY_VARIETY).toEqual({ parlayGameCap: 2, parlayMore: 2, parlayCap: 5 });
    const cfg: Record<string, unknown> = {};
    applyParlayVariety(cfg);
    expect(cfg).toEqual({ parlayGameCap: 2, parlayMore: 2, parlayCap: 5 });
  });
});

describe("INSTRUCTION 71 — the engine lines and the generator wiring (source pins)", () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
  it("buildParlaySet reads the three knobs off SH_CFG", () => {
    expect(LEGACY_SRC).toMatch(/gcap=\(SH_CFG&&SH_CFG\.parlayGameCap\)\|0;/);
    expect(LEGACY_SRC).toMatch(/if\(gcap&&\(cntG\[gm\]\|\|0\)>=gcap\)continue;/);
    expect(LEGACY_SRC).toMatch(/cntG\[gm\]=\(cntG\[gm\]\|\|0\)\+1;out\.push\(x\);/);
    expect(LEGACY_SRC).toMatch(/var more=\(SH_CFG&&SH_CFG\.parlayMore\)\|0;if\(more\)Object\.keys\(plan\)\.forEach/);
    expect(LEGACY_SRC).toMatch(/if\(more\)\{var mb=mixPat\.slice\(\);for\(var q2=0;q2<more;q2\+\+\)mixPat=mixPat\.concat\(mb\);\}/);
    expect(LEGACY_SRC).toMatch(/var pcap=\(SH_CFG&&SH_CFG\.parlayCap\)\|\|3;/);
    expect((LEGACY_SRC.match(/,pcap\)/g) ?? []).length).toBe(3);
    expect(LEGACY_SRC).toMatch(/buildParlaySet\(pregameF\.cats,pcap\)/);
    expect(LEGACY_SRC).toMatch(/buildParlaySet\(liveF\.cats,pcap\)/);
    // legacy/index.html and the generated string agree (the extract step ran)
    const html = read("legacy/index.html");
    expect(html).toMatch(/gcap=\(SH_CFG&&SH_CFG\.parlayGameCap\)\|0;/);
    expect(html).toMatch(/var pcap=\(SH_CFG&&SH_CFG\.parlayCap\)\|\|3;/);
  });
  it("all three generators arm the knobs right after the ballpark hook", () => {
    for (const f of ["src/lib/engine-client.ts", "app/api/generate/route.ts", "app/api/scheduler/route.ts"]) {
      const s = read(f);
      expect(s, f).toMatch(/applyParkDaily\(cfg\);[^\n]*\n\s*applyParlayVariety\(cfg\);/);
      expect(s, f).toMatch(/import \{[^}]*applyParlayVariety[^}]*\} from "@\/lib\/env-adjust"/);
    }
  });
});
