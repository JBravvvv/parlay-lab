import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FROZEN_NOW, armedFixtureEngine } from "./helpers/fixture-env";

/**
 * THE HRR SUSPENSION IS MODE-CONDITIONAL — encoded, not reasoned about (2026-07-27 night,
 * owner's rule after the 11-leg scare).
 *
 * `hrrAltMax`'s bar lives inside `buildParlaySet`'s disciplined-modes branch. Under the
 * legacy posture (`selMode` undefined — the parity stance) the bar intentionally does not
 * apply: the first empirical check found 11 HRR legs in the pool and 4 in the FUN pick
 * exactly that way. "Production is unreachable from that posture" is the same shape as
 * "safe because it runs at 09:30 UTC" — so the coupling is a TEST, in the lid-coupling /
 * m2-interlock pattern:
 *
 *   under every production-reachable arming mode — extracted from SOURCE (open capture,
 *   never hardcoded): the app default in `getSelectionMode` and the cron's CRON_SEL_MODE —
 *   `buildParlaySet` must emit ZERO H+R+RBI legs into the pool and `shFunPick` must pick
 *   zero. A mode change that silently voids the suspension fails the build here.
 *
 * The PLANT (invalid-by-value): the legacy posture must still show HRR legs — proving this
 * check can SEE a bar-less world, and pinning legacy-unfiltered as intentional design.
 */

function productionModes(): string[] {
  const route = readFileSync("app/api/generate/route.ts", "utf8");
  const cron = /CRON_SEL_MODE\s*=\s*"(\w+)"/.exec(route);
  expect(cron, "CRON_SEL_MODE vanished from the generate route — re-point this extraction").toBeTruthy();
  const client = readFileSync("src/lib/engine-client.ts", "utf8");
  // the fallback returned when localStorage carries nothing — the app's default mode
  const fn = client.slice(client.indexOf("function getSelectionMode"));
  const dflt = /return\s+"(\w+)"/.exec(fn);
  expect(dflt, "getSelectionMode's default vanished — re-point this extraction").toBeTruthy();
  return [...new Set([cron![1], dflt![1]])];
}

type PoolTicket = { pl: { legs: { lkey?: string }[] } };

async function hrrCounts(mode: string | undefined) {
  const eng = armedFixtureEngine();
  const cfg = eng.get<Record<string, unknown>>("SH_CFG");
  if (mode !== undefined) eng.set("SH_CFG", { ...cfg, selMode: mode });
  const d = eng.analyze(await eng.collectSlate()) as never;
  const cfg2 = eng.get<Record<string, unknown>>("SH_CFG");
  const pool = eng.get<(b: unknown) => PoolTicket[]>("shCardPool")(d);
  const inPool = pool.flatMap((w) => w.pl.legs.filter((l) => (l.lkey ?? "").includes("batter_hits_runs_rbis"))).length;
  const alloc = eng.get<(p: unknown, a: number, c: unknown, f: boolean) => { picks: { id: string }[]; legs: unknown }>(
    "shAllocate",
  )(pool, 250, cfg2, false);
  const ids: Record<string, number> = {};
  alloc.picks.forEach((p) => (ids[p.id] = 1));
  const fun = eng.get<(p: unknown, a: number, c: unknown, i: unknown, l: unknown) => { picks: { w: PoolTicket }[] }>(
    "shFunPick",
  )(pool, 5, cfg2, ids, alloc.legs);
  const inFun = (fun.picks ?? []).flatMap((p) =>
    p.w.pl.legs.filter((l) => (l.lkey ?? "").includes("batter_hits_runs_rbis")),
  ).length;
  return { inPool, inFun, poolSize: pool.length };
}

describe("hrrAltMax suspension is coupled to the production arming modes", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FROZEN_NOW);
  });
  afterAll(() => vi.useRealTimers());

  it("every production-reachable mode emits ZERO HRR legs to pool and FUN", async () => {
    const modes = productionModes();
    expect(modes.length).toBeGreaterThanOrEqual(1);
    for (const mode of modes) {
      const { inPool, inFun, poolSize } = await hrrCounts(mode);
      expect(poolSize, `${mode}: the pool emptied — that is a different failure`).toBeGreaterThan(10);
      expect(inPool, `${mode}: HRR legs reached the pool — the suspension is voided in a production mode`).toBe(0);
      expect(inFun, `${mode}: FUN picked an HRR leg`).toBe(0);
    }
  }, 300_000);

  it("PLANT: the legacy posture still shows HRR legs — the check can see a bar-less world", async () => {
    const { inPool } = await hrrCounts(undefined);
    expect(
      inPool,
      "legacy posture shows no HRR legs — either the fixture lost its HRR rows (population!) " +
        "or the bar went unconditional (a deliberate change that should update this plant)",
    ).toBeGreaterThan(0);
  }, 300_000);
});
