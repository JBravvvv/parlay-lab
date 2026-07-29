import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FROZEN_NOW, armedFixtureEngine } from "./helpers/fixture-env";

/**
 * THE OUTS SUSPENSION FLAG — guard written BEFORE the flag, observed RED (2026-07-28).
 *
 * Calendar: the outs fix (M2 interlocked pair) was due Tue 07-28; nothing was built by
 * end of Tuesday, so per the owner's pre-commitment outs takes a SUSPENSION FLAG pending
 * the Wednesday go/no-go — spec in docs/pitcher-outs-audit.md ("THE SUSPENSION FLAG").
 *
 * This is the hrr-suspension-coupling pattern verbatim: under every production-reachable
 * arming mode (extracted from SOURCE, never hardcoded), `buildParlaySet` must emit ZERO
 * pitcher_outs legs into the pool and `shFunPick` must pick zero. The legacy posture
 * (PLANT) must still show them — proving the check can see an unfiltered world.
 *
 * `it.fails` DOCUMENTS THE FLAG AS NOT YET APPLIED: run as a plain `it` on 2026-07-28 it
 * FAILED (outs legs present in the pool under both production modes) — the observed-red
 * requirement. WHEN THE FLAG SHIPS (owner's go): flip `it.fails` → `it` in the same
 * commit that applies the spec's three same-line edits. If the go/no-go lands "no"
 * (the M2 pair ships Thursday instead), DELETE this file in that commit — the fix
 * supersedes the flag.
 */

function productionModes(): string[] {
  const route = readFileSync("app/api/generate/route.ts", "utf8");
  const cron = /CRON_SEL_MODE\s*=\s*"(\w+)"/.exec(route);
  expect(cron, "CRON_SEL_MODE vanished from the generate route — re-point this extraction").toBeTruthy();
  const client = readFileSync("src/lib/engine-client.ts", "utf8");
  const fn = client.slice(client.indexOf("function getSelectionMode"));
  const dflt = /return\s+"(\w+)"/.exec(fn);
  expect(dflt, "getSelectionMode's default vanished — re-point this extraction").toBeTruthy();
  return [...new Set([cron![1], dflt![1]])];
}

type PoolTicket = { pl: { legs: { lkey?: string }[] } };

async function outsCounts(mode: string | undefined) {
  const eng = armedFixtureEngine();
  const cfg = eng.get<Record<string, unknown>>("SH_CFG");
  if (mode !== undefined) eng.set("SH_CFG", { ...cfg, selMode: mode });
  const d = eng.analyze(await eng.collectSlate()) as never;
  const pool = eng.get<(b: unknown) => PoolTicket[]>("shCardPool")(d);
  const inPool = pool.flatMap((w) => w.pl.legs.filter((l) => (l.lkey ?? "").includes("|pitcher_outs|"))).length;
  return { inPool, poolSize: pool.length };
}

describe("outs suspension flag is coupled to the production arming modes (SPEC — not yet applied)", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FROZEN_NOW);
  });
  afterAll(() => vi.useRealTimers());

  it.fails("every production-reachable mode emits ZERO outs legs to the pool (open — awaits Wednesday go/no-go)", async () => {
    const modes = productionModes();
    expect(modes.length).toBeGreaterThanOrEqual(1);
    for (const mode of modes) {
      const { inPool, poolSize } = await outsCounts(mode);
      expect(poolSize, `${mode}: the pool emptied — that is a different failure`).toBeGreaterThan(10);
      expect(inPool, `${mode}: outs legs reached the pool — the flag is not applied (expected while open)`).toBe(0);
    }
  }, 300_000);

  it("PLANT: the legacy posture shows outs legs — the check can see an unfiltered world", async () => {
    const { inPool } = await outsCounts(undefined);
    expect(
      inPool,
      "legacy posture shows no outs legs — either the fixture lost its outs rows (population!) " +
        "or a bar went unconditional (a deliberate change that should update this plant)",
    ).toBeGreaterThan(0);
  }, 300_000);
});
