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
 *
 * SCOPE BY DIFF (2026-07-30, owner's rule — encoded, not written): a vintage
 * boundary's SCOPE is established by diffing the shipped change's output, never by
 * the shipping component's own doc. For this flag the claimed scope is
 * selection-level: prices/est/EV and every other row-level field byte-identical with
 * the flag on and off; the only row-level touch is the hrrAltMax-precedent tag set
 * ({susp, watch, bsBadge, czBadge, edgeBadge}) on pitcher_outs rows, and only there.
 * The "scope by diff" test below asserts exactly that and must be GREEN both before
 * the ship (flag inert → outputs identical) and after it (tag-set-only delta); the
 * comparator plant proves a single pricing-field change is visible through the
 * stripping. The tag half ("flag-on tags every outs row") is `it.fails` until the
 * ship commit, which flips BOTH it.fails tests in the same commit. If, with the
 * shipped flag on, the pool/ticket half still shows outs legs (or the tag half shows
 * no tagged rows over a non-empty outs population), the flag does nothing and does
 * not deploy — the owner's impossible branch, made mechanical here.
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

/* ---- SCOPE BY DIFF (2026-07-30) ---- */

const TAG_FIELDS = ["susp", "watch", "bsBadge", "czBadge", "edgeBadge"];

function isOutsRow(r: Record<string, unknown>): boolean {
  return ((r.lkey as string) || "").split("|")[1] === "pitcher_outs";
}

/** Deep-copy the analyze output, removing ONLY the hrrAltMax-precedent tag set from
 *  pitcher_outs rows in categories/categoriesLive. Everything else — every pricing
 *  field on every row, non-outs rows in full, clampActivity, tickets — is compared
 *  byte-for-byte. */
function stripOutsTags(d: unknown): unknown {
  const c = JSON.parse(JSON.stringify(d)) as Record<string, Record<string, unknown[]>>;
  for (const catsKey of ["categories", "categoriesLive"]) {
    const cats = c[catsKey];
    if (!cats) continue;
    for (const mkt of Object.keys(cats)) {
      for (const row of cats[mkt] as Record<string, unknown>[]) {
        if (isOutsRow(row)) for (const f of TAG_FIELDS) delete row[f];
      }
    }
  }
  return c;
}

async function analyzeWith(mode: string, outsSusp: boolean | undefined) {
  const eng = armedFixtureEngine();
  const cfg = eng.get<Record<string, unknown>>("SH_CFG");
  eng.set("SH_CFG", { ...cfg, selMode: mode, outsSusp });
  return eng.analyze(await eng.collectSlate()) as Record<string, unknown>;
}

describe("scope by diff: the flag's boundary is measured, not self-declared", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FROZEN_NOW);
  });
  afterAll(() => vi.useRealTimers());

  it("flag on/off leaves every row-level field byte-identical outside the outs tag set (green BEFORE and AFTER the ship)", async () => {
    const mode = productionModes()[0];
    const off = await analyzeWith(mode, undefined);
    const on = await analyzeWith(mode, true);
    // the outs population must exist, or identity proves nothing (zero-over-empty)
    const outsRows = Object.values((off.categories as Record<string, unknown[]>) || {})
      .flat()
      .filter((r) => isOutsRow(r as Record<string, unknown>)).length;
    expect(outsRows, "no pitcher_outs rows in the fixture cats — population gone, identity vacuous").toBeGreaterThan(0);
    expect(
      JSON.stringify(stripOutsTags(on)),
      "flag-on changed a row-level field OUTSIDE the tag set — the boundary is wider than the flag's doc claims; " +
        "the outs flag then resets the row-level window too and the vintage consequence restates",
    ).toBe(JSON.stringify(stripOutsTags(off)));
  }, 600_000);

  it("PLANT (comparator): a single pricing-field change IS visible through the stripping", async () => {
    const mode = productionModes()[0];
    const off = await analyzeWith(mode, undefined);
    const mutated = JSON.parse(JSON.stringify(off)) as Record<string, Record<string, Record<string, unknown>[]>>;
    const rows = Object.values(mutated.categories || {}).flat();
    const victim = rows.find((r) => r && (r as Record<string, unknown>).prob != null) as Record<string, unknown>;
    expect(victim, "no cats row with a prob field — the plant lost its substrate").toBeTruthy();
    victim.prob = (victim.prob as number) + 0.1;
    expect(JSON.stringify(stripOutsTags(mutated))).not.toBe(JSON.stringify(stripOutsTags(off)));
  }, 600_000);

  it.fails("flag-on tags every outs cats row and drops its badges (open — flips in the ship commit with the pool half)", async () => {
    const mode = productionModes()[0];
    const on = await analyzeWith(mode, true);
    const outsRows = Object.values((on.categories as Record<string, unknown[]>) || {})
      .flat()
      .filter((r) => isOutsRow(r as Record<string, unknown>)) as Record<string, unknown>[];
    expect(outsRows.length, "outs population empty — a tag count over nothing is not a pass").toBeGreaterThan(0);
    for (const r of outsRows) {
      expect(r.susp, `untagged outs row with the flag on: ${r.label}`).toBe(true);
      for (const b of ["bsBadge", "czBadge", "edgeBadge"]) {
        expect(r[b], `badge ${b} survived suspension on: ${r.label}`).not.toBe(true);
      }
    }
  }, 600_000);
});
