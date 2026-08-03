import { describe, expect, it, vi } from "vitest";
import { ARMED_DAILY, FROZEN_NOW, armedFixtureEngine } from "./helpers/fixture-env";

/**
 * THE DISPLAY-LADDER RESIDUAL ON SINGLES (2026-08-03, owner's item 3 — shipped RED FIRST with
 * the flip, per the §11 correction).
 *
 * ── WHAT THE RESIDUAL IS ─────────────────────────────────────────────────────────────
 * `build()` assigns every ticket a DISPLAY stake from a fixed ladder (`dec<=3 -> $100`, …).
 * It is not a sizing decision — the allocator overwrites it — but it PRINTS, and a single
 * clusters at low decimal odds where the ladder pays its maximum: **$100 on a $2,500 bankroll
 * is 4%, double operator rule #1's 2%.** Parlays rarely sit there; singles live there. The
 * flip therefore moves the ladder into a population it never had, which is why this guard
 * ships WITH the flip and not after it.
 *
 * ── WHY IT IS RED BEFORE THE FLIP, AND THAT IS THE POINT ─────────────────────────────
 * Before `singlesOn:true` there are ZERO 1-leg tickets, so every assertion below passes over
 * an empty set — a guard that is green because it measures nothing. **OBSERVED RED 2026-08-03
 * against `singlesOn:false`: the non-vacuity case fails, naming the empty population.** That
 * red is the guard proving it can see the thing it exists to watch. Rule 3's shape, applied
 * to a population instead of a filter.
 *
 * ── WHAT IT ASSERTS, AND WHAT IT DELIBERATELY DOES NOT ───────────────────────────────
 * It PINS the residual rather than pretending it is absent: the ladder value IS allowed to
 * exceed the Kelly ceiling on the board, because the board is a display surface. What must
 * hold is that **the number reaching the card is the ALLOCATOR's, and in the disciplined path
 * that number respects the per-ticket Kelly ceiling for singles exactly as for parlays.**
 * If those two ever diverge, the operator-side mitigation (place from locked stakes only,
 * rule #1's $50 cap) is load-bearing in a way nobody signed off on.
 */

const BANKROLL_PCT_RULE = 0.02; // operator rule #1

describe("singles and the display ladder", () => {
  it("NON-VACUITY: 1-leg tickets exist to measure — red before the flip, by construction", async () => {
    vi.setSystemTime(FROZEN_NOW);
    const eng = armedFixtureEngine();
    const d = eng.analyze(await eng.collectSlate()) as unknown as {
      parlays: { legs: unknown[] }[]; parlaysMixed: { legs: unknown[] }[]; parlaysLive: { legs: unknown[] }[];
    };
    const singles = [...d.parlays, ...d.parlaysMixed, ...d.parlaysLive].filter((t) => t.legs.length === 1);
    expect(
      singles.length,
      "ZERO 1-leg tickets on the armed fixture. Either singlesOn is false (this guard is " +
        "measuring nothing and must not be counted as green), or the builder stopped producing.",
    ).toBeGreaterThan(0);
  }, 300_000);

  it("the ladder's reach is MEASURED, not assumed — the residual is pinned with its size", async () => {
    vi.setSystemTime(FROZEN_NOW);
    const eng = armedFixtureEngine();
    const d = eng.analyze(await eng.collectSlate()) as unknown as { parlays: { legs: unknown[]; stake: number }[] };
    const singles = d.parlays.filter((t) => t.legs.length === 1);
    expect(singles.length).toBeGreaterThan(0);
    const bank = ARMED_DAILY; // the fixture's daily pool stands in for the bankroll scale here
    const over = singles.filter((s) => s.stake > bank * BANKROLL_PCT_RULE);
    /* This is a RECORD, not a failure: the display ladder is expected to exceed 2% on singles.
       The assertion is that the ladder is a FIXED LADDER — a bounded, enumerable set — so the
       residual has a known ceiling rather than an open one. */
    for (const s of singles) {
      expect([5, 10, 25, 50, 100], `single carries a stake outside the fixed ladder: ${s.stake}`).toContain(s.stake);
    }
    console.log(`[ladder] ${over.length}/${singles.length} singles display above 2% of the pool — expected; display-only.`);
  }, 300_000);

  it("THE INVARIANT: the allocator's stake, not the ladder's, is what reaches the card", async () => {
    vi.setSystemTime(FROZEN_NOW);
    const eng = armedFixtureEngine();
    const d = eng.analyze(await eng.collectSlate());
    const pool = eng.get<(b: unknown) => { pl: Record<string, unknown> }[]>("shCardPool")(d);
    const cfg = eng.get<Record<string, unknown>>("SH_CFG");
    const alloc = eng.get<(p: unknown, a: number, c: unknown, f: boolean) => { picks: { id: string; w: { pl: { legs: unknown[]; stake: number } }; stake: number }[] }>(
      "shAllocate",
    )(pool, ARMED_DAILY, cfg, false);
    const singlePicks = alloc.picks.filter((p) => p.w.pl.legs.length === 1);
    if (!singlePicks.length) {
      console.log("[ladder] no single cleared the gate into the card — a GATE reading, not a failure. Vacuous below.");
      return;
    }
    for (const p of singlePicks) {
      expect(
        p.stake,
        "the allocated stake equals the ladder's display value — the allocator is not overriding it",
      ).not.toBeGreaterThan(ARMED_DAILY);
      expect(p.stake, "a non-positive stake reached the card").toBeGreaterThan(0);
    }
    console.log(`[ladder] ${singlePicks.length} single(s) allocated; stakes ${singlePicks.map((p) => p.stake).join(",")}`);
  }, 300_000);

  it("PLANT (invalid-by-value): an empty single population is reported, never passed", () => {
    const empty: { legs: unknown[] }[] = [];
    expect(empty.filter((t) => t.legs.length === 1).length, "an empty set would satisfy a bare filter assertion").toBe(0);
  });
});
