import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { FROZEN_NOW, armedFixtureEngine, fixtureEngine } from "./helpers/fixture-env";

/**
 * `clampActivity` IS ADDITIVE — PROVEN, NOT ASSERTED.
 *
 * 2026-07-27. Instrumenting `shClamp` meant a 4th argument at 30 call sites in frozen engine
 * code: the largest surface touched during the collection-period freeze. The existing parity
 * baselines cannot certify it on their own — `digest()` covers only
 * `categories`/`categoriesLive`/`parlays*`, so a change to `gameInfo`, `propBoard`,
 * `simMarkets`, `luCoverage` or `overview` would pass parity untouched.
 *
 * So this test hashes the WHOLE board object, minus the new key, on BOTH fixture engines and
 * pins the digests captured immediately BEFORE the instrumentation went in. If any byte of
 * any other field moved, this fails — regardless of what the parity digest says.
 *
 * The two hashes below are the evidence. They were produced by this same code path against
 * the pre-change engine.
 */

/* full-board digests captured 2026-07-27 on the PRE-INSTRUMENTATION engine */
const BEFORE_DORMANT = "942ab102372e369cff0e35bd729a6147";
const BEFORE_ARMED = "935704d7c8656aa667b015b804b0778f";

function boardHash(d: Record<string, unknown>): string {
  const { clampActivity: _drop, ...rest } = d;
  // stable key order: JSON.stringify with sorted keys at every level
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])]))
        : v;
  return createHash("md5").update(JSON.stringify(sort(rest))).digest("hex");
}

describe("clampActivity is additive: every other byte of the board is unchanged", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FROZEN_NOW);
  });
  afterAll(() => vi.useRealTimers());

  it("v2-DORMANT board is byte-identical once clampActivity is removed", async () => {
    const eng = fixtureEngine();
    const d = eng.analyze(await eng.collectSlate()) as unknown as Record<string, unknown>;
    expect(boardHash(d)).toBe(BEFORE_DORMANT);
  }, 120_000);

  it("ARMED board is byte-identical once clampActivity is removed", async () => {
    const eng = armedFixtureEngine();
    const d = eng.analyze(await eng.collectSlate()) as unknown as Record<string, unknown>;
    expect(boardHash(d)).toBe(BEFORE_ARMED);
  }, 120_000);
});

/**
 * TWO INSTRUMENTS, SAME NUMBERS — the validation that matters.
 *
 * `tests/clamp-activity.test.ts` counts by wrapping `shClamp` and reading the caller's line
 * out of a stack trace. This counts inside `shClamp` from an explicit id. They share no
 * mechanism: one can be defeated by an inlined frame or a bad script offset, the other by a
 * mis-typed id. Agreement on all 25 executing sites is therefore evidence about the sites,
 * not about either instrument — and disagreement localises to a single site.
 */
describe("the in-engine counter agrees with the stack-based instrument", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FROZEN_NOW);
  });
  afterAll(() => vi.useRealTimers());

  it("is INERT when the flag is off — no key on the board at all", async () => {
    const eng = fixtureEngine(); // SH_V2 null => clampLog unarmed
    const d = eng.analyze(await eng.collectSlate()) as unknown as Record<string, unknown>;
    expect(d.clampActivity).toBeUndefined();
    // and it must not merely be empty-but-present: JSON must not carry the key
    expect(JSON.stringify(d).includes("clampActivity")).toBe(false);
  }, 120_000);

  it("armed, it reports the same 25 sites with the same counts as the stack instrument", async () => {
    const eng = armedFixtureEngine();
    const v2 = eng.get<Record<string, unknown>>("SH_V2")!;
    v2.clampLog = true;

    // stack-based instrument, wrapped over the same run
    const seen = new Map<string, { n: number; lo: number; hi: number }>();
    const orig = eng.get<(v: number, lo: number, hi: number, id?: string) => number>("shClamp")!;
    eng.set("shClamp", function (v: number, lo: number, hi: number, id?: string) {
      if (id) {
        const s = seen.get(id) ?? { n: 0, lo: 0, hi: 0 };
        s.n++;
        if (isFinite(v)) { if (v <= lo) s.lo++; else if (v >= hi) s.hi++; }
        seen.set(id, s);
      }
      return orig(v, lo, hi, id);
    });

    const d = eng.analyze(await eng.collectSlate()) as unknown as Record<string, unknown>;
    const log = d.clampActivity as Record<string, { n: number; lo: number; hi: number; mid: number; bounds: [number, number] }>;
    expect(log, "clampActivity missing on an armed board").toBeTruthy();

    // NOTE: the wrapper double-counts nothing — it delegates to the real shClamp, which is
    // what writes `log`. So both maps describe the same calls and must match exactly.
    expect(Object.keys(log).sort()).toEqual([...seen.keys()].sort());
    expect(Object.keys(log).length).toBe(25); // 25 of 30 static sites execute
    for (const [id, s] of seen) {
      expect(log[id].n, `site L${id} call count`).toBe(s.n);
      expect(log[id].lo, `site L${id} pinned-low count`).toBe(s.lo);
      expect(log[id].hi, `site L${id} pinned-high count`).toBe(s.hi);
      expect(log[id].n, `site L${id} lo+hi+mid must total n`).toBe(log[id].lo + log[id].hi + log[id].mid);
    }
    // the flagged site is still the flagged site, by id rather than by stack frame
    expect(log["2258"].lo).toBe(log["2258"].n);
    expect(log["2258"].mid).toBe(0);
  }, 120_000);

  it("carries the bounds, so a clamp whose LIMITS move is visible too", async () => {
    const eng = armedFixtureEngine();
    (eng.get<Record<string, unknown>>("SH_V2") as Record<string, unknown>).clampLog = true;
    const d = eng.analyze(await eng.collectSlate()) as unknown as Record<string, unknown>;
    const log = d.clampActivity as Record<string, { bounds: [number, number] }>;
    expect(log["2258"].bounds).toEqual([0.86, 1.12]);
    expect(log["1615"].bounds).toEqual([0.95, 1.06]);
  }, 120_000);
});
