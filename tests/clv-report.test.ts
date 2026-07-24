import { describe, expect, it } from "vitest";
import { centsScale, clvByMarket, clvLegRows, clvTrend, filterClv, meanSE } from "@/lib/clv-report";
import type { SyncEntry } from "@/lib/ledger-merge";

/* Hardening Phase 2: CLV derives ONLY from prices stored live at lock and at the
   last pre-pitch sighting — a missing input keeps the leg out (no backfill). */

type LegIn = { label: string; prop: string; lkey: string; cz?: number | null; imp?: number | null };

const entry = (
  date: string,
  legs: LegIn[],
  clv: Record<string, { am: number; at: number; consensusFair?: number | null }>,
  opts: { selMode?: string; fun?: LegIn[] } = {},
): SyncEntry =>
  ({
    date,
    locked: true,
    selMode: opts.selMode,
    core: [{ id: "t1", legs }],
    funT: opts.fun ? [{ id: "f1", legs: opts.fun }] : [],
    clv,
  }) as unknown as SyncEntry;

describe("CLV report (hardening Phase 2)", () => {
  it("cents scale removes the ±100 american seam", () => {
    expect(centsScale(-105)).toBe(95);
    expect(centsScale(105)).toBe(105);
    expect(centsScale(-105) - centsScale(105)).toBe(-10); // −105 is 10 cents worse than +105
    expect(centsScale(-120) - centsScale(-130)).toBe(10); // −120 beats −130 by 10
    expect(centsScale(150) - centsScale(140)).toBe(10);
  });

  it("fair points: positive = the market moved toward our side (both directions)", () => {
    const rows = clvLegRows([
      entry(
        "2026-07-24",
        [
          // OVER locked at fair 40%, closes fair 43% → +3.00 (we beat the close)
          { label: "A. Over", prop: "Hits O 0.5", lkey: "aover|batter_hits|0.5", cz: -150, imp: 40 },
          // UNDER locked at fair 55%, closes fair 52% → −3.00 (close beat us)
          { label: "B. Under", prop: "K's U 5.5", lkey: "bunder|pitcher_strikeouts|5.5", cz: 110, imp: 55 },
        ],
        {
          "A. Over|Hits O 0.5": { am: -170, at: 5, consensusFair: 0.43 },
          "B. Under|K's U 5.5": { am: 120, at: 6, consensusFair: 0.52 },
        },
        { selMode: "ev_gated" },
      ),
    ]);
    expect(rows).toHaveLength(2);
    const over = rows.find((r) => r.dir === "O")!;
    const under = rows.find((r) => r.dir === "U")!;
    expect(over.fairPts).toBeCloseTo(3);
    expect(over.czCents).toBeCloseTo(centsScale(-150) - centsScale(-170)); // +20 — locked better than close
    expect(under.fairPts).toBeCloseTo(-3);
    expect(under.czCents).toBeCloseTo(centsScale(110) - centsScale(120)); // −10
    expect(over.mode).toBe("ev_gated");
    expect(over.market).toBe("batter_hits");
    expect(under.market).toBe("pitcher_strikeouts");
  });

  it("no backfill: a leg without a sighting, or without a stored input, stays out of that column", () => {
    const rows = clvLegRows([
      entry(
        "2026-07-24",
        [
          { label: "NoSight", prop: "Hits O 0.5", lkey: "nosight|batter_hits|0.5", cz: -150, imp: 40 },
          { label: "NoImp", prop: "TB O 1.5", lkey: "noimp|batter_total_bases|1.5", cz: -110, imp: null },
          { label: "NoCz", prop: "HR O 0.5", lkey: "nocz|batter_home_runs|0.5", cz: null, imp: 20 },
        ],
        {
          "NoImp|TB O 1.5": { am: -120, at: 1, consensusFair: 0.5 },
          "NoCz|HR O 0.5": { am: 300, at: 2, consensusFair: 0.24 },
        },
      ),
    ]);
    expect(rows.find((r) => r.lid.startsWith("NoSight"))).toBeUndefined(); // no close at all
    const noImp = rows.find((r) => r.lid.startsWith("NoImp"))!;
    expect(noImp.fairPts).toBeNull(); // cents only
    expect(noImp.czCents).not.toBeNull();
    const noCz = rows.find((r) => r.lid.startsWith("NoCz"))!;
    expect(noCz.czCents).toBeNull(); // fair only
    expect(noCz.fairPts).toBeCloseTo(4);
  });

  it("filters slice by market, tier, direction, and selection mode", () => {
    const e1 = entry(
      "2026-07-23",
      [{ label: "A", prop: "Hits O 0.5", lkey: "a|batter_hits|0.5", cz: -150, imp: 40 }],
      { "A|Hits O 0.5": { am: -150, at: 1, consensusFair: 0.42 } },
      {
        selMode: "ev_gated",
        fun: [{ label: "F", prop: "HR O 0.5", lkey: "f|batter_home_runs|0.5", cz: 320, imp: 22 }],
      },
    );
    e1.clv = { ...e1.clv, "F|HR O 0.5": { am: 300, at: 2, consensusFair: 0.25 } } as never;
    const e2 = entry(
      "2026-07-24",
      [{ label: "B", prop: "K's U 5.5", lkey: "b|pitcher_strikeouts|5.5", cz: 100, imp: 55 }],
      { "B|K's U 5.5": { am: 100, at: 3, consensusFair: 0.53 } },
      { selMode: "dk_fd" },
    );
    const rows = clvLegRows([e1, e2]);
    expect(rows).toHaveLength(3);
    expect(filterClv(rows, { market: "batter_hits" })).toHaveLength(1);
    expect(filterClv(rows, { tier: "fun" }).map((r) => r.lid)).toEqual(["F|HR O 0.5"]);
    expect(filterClv(rows, { dir: "U" }).map((r) => r.lid)).toEqual(["B|K's U 5.5"]);
    expect(filterClv(rows, { mode: "dk_fd" }).map((r) => r.mode)).toEqual(["dk_fd"]);
    expect(filterClv(rows, { mode: "ev_gated", tier: "core" })).toHaveLength(1);
  });

  it("meanSE: mean, n and standard error; null SE below n=2", () => {
    expect(meanSE([])).toEqual({ n: 0, mean: null, se: null });
    expect(meanSE([2]).se).toBeNull();
    const r = meanSE([1, 2, 3, 4]);
    expect(r.n).toBe(4);
    expect(r.mean).toBeCloseTo(2.5);
    expect(r.se).toBeCloseTo(Math.sqrt(5 / 3 / 4)); // sd/√n with sample variance 5/3
  });

  it("by-market table and 30-day trend bucket correctly", () => {
    const mk = (date: string, label: string, imp: number, close: number) =>
      entry(date, [{ label, prop: "Hits O 0.5", lkey: `${label.toLowerCase()}|batter_hits|0.5`, cz: -120, imp }], {
        [`${label}|Hits O 0.5`]: { am: -120, at: 1, consensusFair: close },
      });
    const rows = clvLegRows([
      mk("2026-07-20", "A", 40, 0.42), // +2
      mk("2026-07-20", "B", 40, 0.44), // +4
      mk("2026-07-24", "C", 40, 0.39), // −1
      mk("2026-05-01", "Old", 40, 0.5), // outside the 30-day window
    ]);
    const byM = clvByMarket(rows);
    expect(byM).toHaveLength(1);
    expect(byM[0].market).toBe("batter_hits");
    expect(byM[0].fair.n).toBe(4);
    const trend = clvTrend(rows, "2026-07-24", 30);
    expect(trend.map((p) => p.date)).toEqual(["2026-07-20", "2026-07-24"]);
    expect(trend[0].mean).toBeCloseTo(3);
    expect(trend[0].n).toBe(2);
    expect(trend[1].mean).toBeCloseTo(-1);
  });
});
