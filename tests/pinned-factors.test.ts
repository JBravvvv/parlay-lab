import { describe, expect, it } from "vitest";
import { createEngine, type Engine } from "@/engine";

/**
 * PINNED FACTORS + SHADOW LOGGING (2026-07-25)
 *
 * `shPenQF` and `shUmpKf` are both frozen off for the collection period
 * (`SH_CFG.penQFrozen` / `SH_CFG.umpKFrozen`). Their shadow counterparts still compute
 * the counterfactual value so freeze exit can backtest an activation.
 *
 * WHY THESE TESTS HAD TO EXIST SEPARATELY FROM THE BOARD SUITE: the fixture harness
 * (`tests/helpers/fixture-env.ts`) has **no route for context.json**, so `SH_CTX` is
 * absent in every full-board test. Both factors therefore already returned 1 there
 * regardless of the pin — a green parity digest proves nothing about either flag. That
 * is the harness-substitution class again (docs/harness-substitutions.md), and the only
 * honest coverage is a direct test that injects `SH_CTX` and asserts the guard.
 */

const stubFetch = () => Promise.resolve({ ok: false, body: {} });
function armed(): Engine {
  const e = createEngine({ fetchJson: stubFetch, today: "2026-07-25" });
  e.set("SH_V2", { sim: true, ctx: true });
  return e;
}
function cfg(e: Engine, patch: Record<string, unknown>) {
  e.set("SH_CFG", { ...e.get<Record<string, unknown>>("SH_CFG"), ...patch });
}

const GAME = { away: "Boston Red Sox", home: "New York Yankees" };
const ctxWith = (hpUmp: unknown) => ({ games: [{ ...GAME, hpUmp }] });

describe("shUmpKf — pinned off, and it would NOT be a no-op if it were not", () => {
  it("returns identity even when a live kFactor is present", () => {
    const e = armed();
    e.set("SH_CTX", ctxWith({ name: "X", g: 9, kFactor: 1.07, kRaw: 1.07 }));
    expect(e.get<(g: unknown) => number>("shUmpKf")(GAME)).toBe(1);
    expect(e.get<Record<string, unknown>>("SH_CFG").umpKFrozen).toBe(true);
  });

  /* The pin is load-bearing, not decorative: unfrozen, that same board row moves 7%.
     This is the assertion that distinguishes "pinned" from "happens to be inert". */
  it("unfrozen, the SAME input moves the factor — so the pin is doing real work", () => {
    const e = armed();
    cfg(e, { umpKFrozen: false });
    e.set("SH_CTX", ctxWith({ name: "X", g: 9, kFactor: 1.07, kRaw: 1.07 }));
    expect(e.get<(g: unknown) => number>("shUmpKf")(GAME)).toBeCloseTo(1.07, 10);
  });

  it("unfrozen, still honours the g>=5 gate upstream (kFactor null) and the ±8% clamp", () => {
    const e = armed();
    cfg(e, { umpKFrozen: false });
    e.set("SH_CTX", ctxWith({ name: "X", g: 3, kFactor: null, kRaw: 1.31 }));
    expect(e.get<(g: unknown) => number>("shUmpKf")(GAME)).toBe(1); // gate, not clamp
    e.set("SH_CTX", ctxWith({ name: "X", g: 40, kFactor: 1.31, kRaw: 1.31 }));
    expect(e.get<(g: unknown) => number>("shUmpKf")(GAME)).toBeCloseTo(1.08, 10); // clamped
  });
});

describe("shadow readers — record the counterfactual, never apply it", () => {
  it("shUmpKfShadow reports the UNGATED raw ratio and its sample size", () => {
    const e = armed();
    e.set("SH_CTX", ctxWith({ name: "X", g: 3, kFactor: null, kRaw: 1.042 }));
    const s = e.get<(g: unknown) => { kf: number | null; raw: number | null; g: number | null } | null>(
      "shUmpKfShadow",
    )(GAME);
    expect(s?.raw).toBeCloseTo(1.042, 10);
    expect(s?.kf).toBeCloseTo(1.042, 10); // clamped view, still never multiplied
    expect(s?.g).toBe(3); // the number that makes "what g is enough" answerable
    // and the live factor is unmoved by any of it
    expect(e.get<(g: unknown) => number>("shUmpKf")(GAME)).toBe(1);
  });

  it("shPenQFShadow reports a value BELOW the 15-IP guard that blocks the live factor", () => {
    const e = armed();
    e.set("SH_CTX", {
      pen_quality: { __league: { era: 4.0, whip: 1.3, ip: 900 }, "Boston Red Sox": { era: 6.0, whip: 1.5, ip: 9 } },
    });
    const s = e.get<(t: string) => { f: number; era: number; ip: number | null } | null>("shPenQFShadow")(
      "Boston Red Sox",
    );
    expect(s?.ip).toBe(9); // exactly the case the live guard refuses
    expect(s?.f).toBeCloseTo(1.06, 10);
    expect(e.get<(t: string) => number>("shPenQF")("Boston Red Sox")).toBe(1);
  });

  it("shadow readers return null on missing context rather than a fabricated 1", () => {
    const e = armed();
    expect(e.get<(g: unknown) => unknown>("shUmpKfShadow")(GAME)).toBeNull();
    expect(e.get<(t: string) => unknown>("shPenQFShadow")("Boston Red Sox")).toBeNull();
  });
});
