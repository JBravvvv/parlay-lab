import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { FROZEN_NOW, fixtureEngine } from "./helpers/fixture-env";
import type { BoardData, Engine, Ticket } from "@/engine";

/* Ledger-autopsy floors (2026-07-22). Selection still prices at the DK/FD basis;
   these are REFUSALS layered after the gate, each disclosed in alloc.blocked:
     - settlement floor: czEv must be ≥ coreCzEvMin (0) — NV tax never flips a lock negative
     - small-sample consensus gate: a ticket touching a market with <100 graded ledger
       legs also needs de-vigged consensus EV ≥ −1% at the basis
     - structure cap: core tickets stop at coreMaxLegs (3)
     - H+R+RBI alt ladder: lines above O0.5 barred from every auto-built ticket */

type Alloc = {
  picks: { id: string; stake: number; w: { pl: { name: string } } }[];
  sum: number;
  noPlay?: boolean;
  blocked?: { name: string; reason: string }[];
};

function mkTicket(o: {
  name: string;
  type?: string;
  legs?: { label: string; prop: string; lkey: string; gkey: string }[];
  prob?: number;
  bsEv?: number | null;
  czEv?: number | null;
  consEv?: number | null;
}) {
  const legs =
    o.legs ??
    [
      { label: `${o.name} A`, prop: "Hits O 0.5", lkey: `${o.name.toLowerCase()}a|batter_hits|0.5`, gkey: "g1" },
      { label: `${o.name} B`, prop: "Hits O 0.5", lkey: `${o.name.toLowerCase()}b|batter_hits|0.5`, gkey: "g2" },
    ];
  /* internally consistent pricing: the Kelly stake ceiling inside shAllocate is real,
     so prob × dec − 1 must MATCH the stated EVs or the stake collapses to zero.
     prob 58% at basis 1.9 → bsEv +10.2%; czEv picks the CZ decimal (czEv% = p·czDec−1). */
  const prob = o.prob ?? 58;
  const bsEv = o.bsEv === undefined ? 10.2 : o.bsEv;
  const czEv = o.czEv === undefined ? 3 : o.czEv;
  return {
    pl: {
      name: o.name,
      type: o.type ?? "batter_hits",
      tier: "SAFER",
      legs,
      prob,
      ev: bsEv,
      bsDec: 1.9,
      bsEv,
      czDec: Math.round(((1 + czEv / 100) / (prob / 100)) * 10000) / 10000,
      czEv,
      consEv: o.consEv === undefined ? 2 : o.consEv,
    },
  };
}

let eng: Engine;
beforeAll(() => {
  eng = fixtureEngine();
  // production sets the engine-global selMode; the Kelly ceiling prices at the basis there
  eng.get<Record<string, unknown>>("SH_CFG").selMode = "dk_fd";
});

const PROVEN = { batter_hits: 290, batter_total_bases: 299, batter_hits_runs_rbis: 273, ml: 64, rl: 65 };

function alloc(pool: unknown[], cfgOver: Record<string, unknown> = {}): Alloc {
  const cfg = {
    ...eng.get<Record<string, unknown>>("SH_CFG"),
    selMode: "dk_fd",
    minCoreTickets: 1,
    perParlayCap: 1,
    coreKsFillOnly: false,
    mktN: PROVEN,
    ...cfgOver,
  };
  return eng.get<(p: unknown[], a: number, c: unknown) => Alloc>("shAllocate")(pool, 100, cfg);
}

describe("settlement floor — czEv ≥ 0 required to lock, disclosed when it bites", () => {
  it("a basis-positive ticket that is negative at Caesars is refused with reason nv_tax", () => {
    const bad = mkTicket({ name: "TaxTrap", bsEv: 6, czEv: -1.2 });
    const good = mkTicket({ name: "Clean", bsEv: 5, czEv: 2 });
    const a = alloc([bad, good]);
    expect(a.picks.map((p) => p.w.pl.name)).toEqual(["Clean"]);
    expect(a.blocked).toEqual([{ name: "TaxTrap", bsEv: 6, czEv: -1.2, reason: "nv_tax" }]);
  });
  it("czEv exactly 0 clears the floor (the floor is ≥ 0, not > 0)", () => {
    const a = alloc([mkTicket({ name: "Breakeven", bsEv: 5, czEv: 0 })]);
    expect(a.picks.map((p) => p.w.pl.name)).toEqual(["Breakeven"]);
    expect(a.blocked).toEqual([]);
  });
  it("all tickets tax-blocked → NO-PLAY with every refusal disclosed", () => {
    const a = alloc([mkTicket({ name: "T1", czEv: -0.5 }), mkTicket({ name: "T2", czEv: -3 })]);
    expect(a.picks).toEqual([]);
    expect(a.noPlay).toBe(true);
    expect(a.blocked?.map((b) => b.reason)).toEqual(["nv_tax", "nv_tax"]);
  });
});

describe("small-sample consensus gate — unproven markets need the market on side", () => {
  const mlLegs = [
    { label: "Team A", prop: "ML", lkey: "ml_away", gkey: "g1" },
    { label: "Team B", prop: "ML", lkey: "ml_home", gkey: "g2" },
  ];
  it("an ML ticket (64 graded legs) with consensus EV −5% is refused", () => {
    const a = alloc([mkTicket({ name: "MLFade", type: "ml", legs: mlLegs, consEv: -5 })]);
    expect(a.picks).toEqual([]);
    expect(a.blocked?.[0]).toMatchObject({ name: "MLFade", reason: "consensus" });
  });
  it("the same ticket at consensus EV −0.5% (≥ −1%) plays", () => {
    const a = alloc([mkTicket({ name: "MLOk", type: "ml", legs: mlLegs, consEv: -0.5 })]);
    expect(a.picks.map((p) => p.w.pl.name)).toEqual(["MLOk"]);
  });
  it("a proven market (hits, 290 legs) is exempt — consensus may disagree", () => {
    const a = alloc([mkTicket({ name: "HitsProven", consEv: -5 })]);
    expect(a.picks.map((p) => p.w.pl.name)).toEqual(["HitsProven"]);
  });
  it("no mktN at all (calibration store unreachable) → every market counts as small", () => {
    const a = alloc([mkTicket({ name: "Unknown", consEv: -5 })], { mktN: null });
    expect(a.picks).toEqual([]);
    expect(a.blocked?.[0]?.reason).toBe("consensus");
  });
});

describe("structure cap — core stops at 3 legs", () => {
  const legs4 = [1, 2, 3, 4].map((i) => ({
    label: `P${i}`, prop: "Hits O 0.5", lkey: `p${i}|batter_hits|0.5`, gkey: `g${i}`,
  }));
  it("a 4-leg ticket never takes daily money, however good its EV", () => {
    const a = alloc([mkTicket({ name: "FourLegs", legs: legs4, bsEv: 25 }), mkTicket({ name: "TwoLegs" })]);
    expect(a.picks.map((p) => p.w.pl.name)).toEqual(["TwoLegs"]);
  });
  it("a 3-leg ticket still qualifies", () => {
    const a = alloc([mkTicket({ name: "ThreeLegs", legs: legs4.slice(0, 3) })]);
    expect(a.picks.map((p) => p.w.pl.name)).toEqual(["ThreeLegs"]);
  });
});

describe("H+R+RBI alt-ladder suspension — no auto ticket above O0.5", () => {
  let d: BoardData;
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FROZEN_NOW);
    const e2 = fixtureEngine();
    e2.get<Record<string, unknown>>("SH_CFG").selMode = "dk_fd";
    const slate = await e2.collectSlate();
    d = e2.analyze(slate);
  });
  afterAll(() => vi.useRealTimers());

  const hrrLine = (lkey: string | null | undefined): number | null => {
    const p = (lkey ?? "").split("|");
    return p[1] === "batter_hits_runs_rbis" ? Number(p[2]) : null;
  };

  it("every auto-built parlay leg's H+R+RBI line is O0.5 — O1.5+ is suspended", () => {
    const all: Ticket[] = [...(d.parlays ?? []), ...(d.parlaysMixed ?? []), ...(d.parlaysLive ?? [])];
    expect(all.length).toBeGreaterThan(0);
    for (const t of all) {
      for (const l of t.legs) {
        const ln = hrrLine((l as { lkey?: string | null }).lkey);
        if (ln != null) expect(ln).toBeLessThanOrEqual(0.5);
      }
    }
  });
  it("the Board itself still shows the suspended lines (visibility ≠ selectability)", () => {
    const rows = (d.categories?.batter_hits_runs_rbis ?? []) as { lkey?: string | null }[];
    expect(rows.some((r) => (hrrLine(r.lkey) ?? 0) > 0.5)).toBe(true);
  });
});
