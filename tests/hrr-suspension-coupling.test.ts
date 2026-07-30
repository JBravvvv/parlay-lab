import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FROZEN_NOW, armedFixtureEngine } from "./helpers/fixture-env";
import { deviceReachableModes, isDisciplined, overrideReachable } from "./helpers/modes";

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

type PoolTicket = { pl: { legs: { lkey?: string }[] } };

async function hrrCounts(mode: string | undefined, force = false) {
  const eng = armedFixtureEngine();
  const cfg = eng.get<Record<string, unknown>>("SH_CFG");
  if (mode !== undefined) eng.set("SH_CFG", { ...cfg, selMode: mode });
  const d = eng.analyze(await eng.collectSlate()) as never;
  const cfg2 = eng.get<Record<string, unknown>>("SH_CFG");
  const pool = eng.get<(b: unknown) => PoolTicket[]>("shCardPool")(d);
  const inPool = pool.flatMap((w) => w.pl.legs.filter((l) => (l.lkey ?? "").includes("batter_hits_runs_rbis"))).length;
  const alloc = eng.get<(p: unknown, a: number, c: unknown, f: boolean) => { picks: { id: string }[]; legs: unknown }>(
    "shAllocate",
  )(pool, 250, cfg2, force);
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

  it("every DISCIPLINED mode emits ZERO HRR legs to pool and FUN — with and without the override", async () => {
    const modes = deviceReachableModes().filter(isDisciplined);
    expect(modes.length, "no disciplined mode in the reachable domain — re-point the extraction").toBeGreaterThanOrEqual(2);
    for (const mode of modes) {
      for (const force of overrideReachable() ? [false, true] : [false]) {
        const { inPool, inFun, poolSize } = await hrrCounts(mode, force);
        console.log(`MODE ${mode} force=${force}: pool=${poolSize} hrrPool=${inPool} hrrFun=${inFun}`);
        expect(poolSize, `${mode}/force=${force}: the pool emptied — that is a different failure`).toBeGreaterThan(10);
        expect(inPool, `${mode}/force=${force}: HRR legs reached the pool — the suspension is voided`).toBe(0);
        expect(inFun, `${mode}/force=${force}: FUN picked an HRR leg`).toBe(0);
      }
    }
  }, 600_000);

  /**
   * THE LEGACY PAIR, MEASURED RATHER THAN ASSUMED (2026-07-30). `probability` and
   * `caesars_ev` are DEVICE-REACHABLE in ~2 taps (Settings → mode) and the suspension
   * bars do NOT apply there — the parity stance, by design. This pins the counts so the
   * exposure is a number in CI rather than a sentence in a doc, and so a future change
   * that silently extends OR removes the bar there fails here.
   */
  it("CENSUS: the legacy pair is unfiltered (device-reachable, by design) — counts pinned", async () => {
    const legacy = deviceReachableModes().filter((m) => !isDisciplined(m));
    expect(legacy.length, "no legacy mode found — re-point the extraction").toBeGreaterThanOrEqual(1);
    for (const mode of legacy) {
      const { inPool, inFun, poolSize } = await hrrCounts(mode);
      console.log(`MODE ${mode} force=false: pool=${poolSize} hrrPool=${inPool} hrrFun=${inFun}`);
      expect(poolSize, `${mode}: the pool emptied — that is a different failure`).toBeGreaterThan(10);
      expect(
        inPool,
        `${mode}: HRR legs no longer reach the pool — either the bar went unconditional ` +
          `(a deliberate change that should update this census) or the fixture lost its HRR rows`,
      ).toBeGreaterThan(0);
    }
  }, 600_000);

  it("PLANT: the unset posture still shows HRR legs — the check can see a bar-less world", async () => {
    const { inPool } = await hrrCounts(undefined);
    expect(
      inPool,
      "legacy posture shows no HRR legs — either the fixture lost its HRR rows (population!) " +
        "or the bar went unconditional (a deliberate change that should update this plant)",
    ).toBeGreaterThan(0);
  }, 300_000);
});
