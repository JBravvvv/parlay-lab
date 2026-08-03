import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { FROZEN_NOW, armedFixtureEngine } from "./helpers/fixture-env";
import { stripComments } from "./helpers/source";

/**
 * THE SINGLES VINTAGE (2026-08-02, owner's word: "SINGLES manifest — YES, ship").
 *
 * WHAT SHIPPED: the 2-leg floor became CONFIGURED (`sel.length < (SH_CFG.singlesOn?1:2)`), a
 * per-type singles builder rides behind the same flag, and the per-group simJoint j2/pm pair
 * emits behind `SH_CFG.sjEmit`. ~~**BOTH FLAGS SHIP FALSE.**~~ *Struck 2026-08-03 — see below.*
 *
 * FLIPPED 2026-08-03 (owner's word: SINGLES ON). Both flags now ship TRUE. The 08-02 ship
 * deliberately separated the STRUCTURE from the BEHAVIOUR so the two could be verified apart;
 * this file inverts with the flip and keeps testing BOTH states via the established
 * `eng.get("SH_CFG")` override. The invariant that survives the flip unchanged is the one that
 * mattered on 08-02: **turning singles off reproduces the pre-flip parlay set exactly**, so the
 * flip's delta is attributable to singles and to nothing else.
 *
 * ── THE DISCIPLINE TABLE ON A 1-LEG TICKET, printed before the ship (owner's item 1) ────
 * | discipline                        | covers a single? | mechanism |
 * | Kelly ceiling (M24's two modes)   | YES              | shKellyFrac(s.w.pl) is shape-blind |
 * | per-ticket caps / player caps     | YES              | pick() enforces uPlayer; capG general |
 * | coreEvMin / coreCzEvMin           | YES              | ev/czEv computed for 1 leg like any |
 * | market suspension (outs/HRR bars) | YES              | the bar tests lp[1] PER LEG |
 * | consensus gate (consMinN)         | YES              | per-market, leg-count-blind |
 * | projected-lineup rule (noParlay)  | YES              | pick() skips flagged rows, unchanged |
 * | legacy-mode exposure (M24/M25)    | SAME AS PARLAYS  | named, not new: the ceiling still
 * |                                   |                  | applies in only two modes — a single
 * |                                   |                  | is as exposed as a parlay, no more |
 * | display stake ladder ($100 @ dec≤3) | DISPLAY ONLY   | allocator stakes override it |
 * **No structure a discipline does not cover was found; the M24/M25 exposure is inherited,
 * not widened.**
 */

const src = stripComments(readFileSync("legacy/index.html", "utf8"));

describe("the singles vintage — source state", () => {
  it("both flags ship TRUE — the flip is live in the shipped engine", () => {
    expect(/singlesOn:\s*true/.test(src), "singlesOn is not true — the flip did not land in the engine string").toBe(true);
    expect(/sjEmit:\s*true/.test(src), "sjEmit is not true").toBe(true);
  });

  it("the floor is configured, not constant — and not simply deleted", () => {
    expect(/sel\.length<\(SH_CFG\.singlesOn\?1:2\)/.test(src), "the configured floor expression moved").toBe(true);
    expect(/sel\.length<2\)return null/.test(src), "a hard 2-leg floor is back").toBe(false);
  });

  it("the j2/pm emission is inside the group loop and gated", () => {
    expect(/if\(SH_CFG\.sjEmit\)sjG\.push\(\{g:gk2,j2:/.test(src)).toBe(true);
    expect(/if\(SH_CFG\.sjEmit&&sjG\.length\)T9\.simJointG=sjG/.test(src), "the conditional attach is gone — an unconditional key breaks every pinned baseline").toBe(true);
  });
});

describe("the singles vintage — BOTH states, live on the shipped engine", () => {
  it("flag OFF (in-test override): no single is built anywhere", async () => {
    vi.setSystemTime(FROZEN_NOW);
    const eng = armedFixtureEngine();
    eng.get<Record<string, unknown>>("SH_CFG").singlesOn = false;
    const d = eng.analyze(await eng.collectSlate()) as unknown as {
      parlays: { name: string; legs: unknown[] }[]; parlaysMixed: { name: string }[]; parlaysLive: { name: string }[];
    };
    const all = [...d.parlays, ...d.parlaysMixed, ...d.parlaysLive];
    expect(all.length).toBeGreaterThan(0);
    expect(all.filter((t) => t.legs && (t.legs as unknown[]).length < 2), "a sub-2-leg ticket exists with the flag OFF").toEqual([]);
    expect(all.filter((t) => /single/i.test(t.name)), "a ticket named single exists with the flag OFF").toEqual([]);
  }, 300_000);

  it("flag ON (shipped default): singles enter, parlay composition is untouched, disciplines hold", async () => {
    vi.setSystemTime(FROZEN_NOW);
    const off = armedFixtureEngine();
    off.get<Record<string, unknown>>("SH_CFG").singlesOn = false;
    const dOff = off.analyze(await off.collectSlate()) as unknown as { parlays: { name: string; legs: { prob: number }[]; prob: number; stake: number }[] };

    vi.setSystemTime(FROZEN_NOW);
    const on = armedFixtureEngine();
    const dOn = on.analyze(await on.collectSlate()) as unknown as { parlays: { name: string; type: string; legs: { prob: number; label: string }[] }[] };

    const singles = dOn.parlays.filter((t) => t.legs.length === 1);
    expect(singles.length, "flag ON built no single on a 15-game armed slate — the builder is not wired").toBeGreaterThan(0);
    for (const s of singles) {
      expect(s.name).toMatch(/single/i);
      expect(s.legs.length).toBe(1);
    }
    /* PARLAY COMPOSITION UNTOUCHED: singles are built after the ENTIRE set (per-type AND
       mixed), so every >=2-leg ticket must be identical to the flag-off board. This is the
       scope-by-diff invariant, and it went RED on the first placement — singles inside the
       per-cat loop consumed player caps ahead of the mixed build and removed a parlay
       (94 -> 93). OBSERVED RED 2026-08-02, placement moved, green. The invariant is not
       decoration; it is what caught the design error before it shipped. */
    const offP = dOff.parlays.filter((t) => t.legs.length >= 2).map((t) => JSON.stringify(t));
    const onP = dOn.parlays.filter((t) => t.legs.length >= 2).map((t) => JSON.stringify(t));
    expect(onP, "the flag CHANGED a parlay — the boundary is wider than the flag's doc claims").toEqual(offP);
  }, 300_000);

  it("sjEmit ON (shipped default): j2/pm pairs appear only on simJoint tickets, both factors finite", async () => {
    vi.setSystemTime(FROZEN_NOW);
    const on = armedFixtureEngine();
    const d = on.analyze(await on.collectSlate()) as unknown as {
      parlays: { simJoint: boolean; simJointG?: { g: string; j2: number; pm: number }[] }[];
      parlaysMixed: { simJoint: boolean; simJointG?: { g: string; j2: number; pm: number }[] }[];
    };
    const all = [...d.parlays, ...d.parlaysMixed];
    const withG = all.filter((t) => t.simJointG != null);
    for (const t of all) {
      if (t.simJointG) {
        expect(t.simJoint, "simJointG on a ticket the sim did not grade").toBe(true);
        for (const g of t.simJointG) {
          expect(Number.isFinite(g.j2), "j2 not finite").toBe(true);
          expect(g.pm, "pm not positive — the ratio was undefined and should have fallen back").toBeGreaterThan(0);
        }
      } else {
        expect((t as Record<string, unknown>).simJointG, "an empty simJointG key leaked — pinned baselines would see it").toBeUndefined();
      }
    }
    /* the armed fixture sims same-game groups, so at least one ticket must carry the pair —
       a zero here means the emission is dead code, declared rather than silently passed */
    expect(withG.length, "sjEmit ON produced zero emissions on the armed fixture — VACUOUS, the wire is dead").toBeGreaterThan(0);
  }, 300_000);
});
