import { describe, expect, it } from "vitest";
import { impliedPct, ledgerSegments } from "../src/lib/ledger-segments";
import type { SyncEntry } from "../src/lib/ledger-merge";

/* Upgrade 03 spec tests 2-3 — segment math reproduces hand-computed CLV and
   Brier numbers; unsighted legs are excluded from averages but counted in
   coverage. Fixture: two locked days, one an override day. */

const NOW = Date.parse("2026-07-19T23:00:00Z");

// day 1 (override day): two hits legs, one sighted with consensus fair
const day1: SyncEntry = {
  date: "2026-07-18",
  locked: true,
  overrode: true,
  core: [
    {
      id: "t1",
      stake: 40,
      legs: [
        { label: "A One", prop: "Hits O 0.5", lkey: "aone|batter_hits|0.5", gkey: "g1", cz: -200, est: "66.0" },
        { label: "B Two", prop: "Hits O 0.5", lkey: "btwo|batter_hits|0.5", gkey: "g2", cz: -150, est: "58.0" },
      ],
    },
  ],
  funT: [],
  games: { g1: { pk: 1, start: "2026-07-18T17:00:00Z" }, g2: { pk: 2, start: "2026-07-18T17:00:00Z" } },
  grading: {
    done: true,
    tickets: { t1: { result: "lost", payout: 0 } },
    legs: { "A One|Hits O 0.5": { result: "won" }, "B Two|Hits O 0.5": { result: "lost" } },
  },
  clv: { "A One|Hits O 0.5": { am: -250, at: 1, consensusFair: 0.72 } }, // B Two unsighted
} as never;

// day 2: an ML leg sighted without fair, and a void K's leg (excluded from calibration)
const day2: SyncEntry = {
  date: "2026-07-19",
  locked: true,
  core: [
    {
      id: "t2",
      stake: 30,
      legs: [
        { label: "Cleveland Guardians", prop: "ML vs PIT", lkey: "ml_home", gkey: "g3", cz: -145, est: "60.0" },
        { label: "K Guy (SEA)", prop: "Pitcher K's O 5.5", lkey: "kguy|pitcher_strikeouts|5.5", gkey: "g4", cz: -120, est: "55.0" },
      ],
    },
  ],
  funT: [{ id: "f1", stake: 10, legs: [{ label: "HR Guy (NYY)", prop: "HR O 0.5", lkey: "hrguy|batter_home_runs|0.5", gkey: "g4", cz: 400, est: "20.0" }] }],
  games: { g3: { pk: 3, start: "2026-07-19T17:00:00Z" }, g4: { pk: 4, start: "2026-07-19T17:00:00Z" } },
  grading: {
    done: true,
    tickets: { t2: { result: "won", payout: 75 }, f1: { result: "pending", payout: 0 } },
    legs: {
      "Cleveland Guardians|ML vs PIT": { result: "won" },
      "K Guy (SEA)|Pitcher K's O 5.5": { result: "void" },
    },
  },
  clv: { "Cleveland Guardians|ML vs PIT": { am: -160, at: 2, consensusFair: null } },
} as never;

const S = ledgerSegments([day1, day2], NOW);

describe("coverage — unsighted legs counted, never averaged", () => {
  it("2 of 5 legs sighted", () => {
    expect(S.coverage).toEqual({ sighted: 2, legs: 5 });
  });
});

describe("CLV points, hand-computed", () => {
  // A One: implied(-250)=250/350=71.4286%, implied(-200)=200/300=66.6667% → +4.7619 pts
  const aOnePts = impliedPct(-250) - impliedPct(-200);
  // ML: implied(-160)=160/260=61.5385%, implied(-145)=145/245=59.1837% → +2.3548 pts
  const mlPts = impliedPct(-160) - impliedPct(-145);

  it("by market: hits averages only its sighted leg; ml likewise; unsighted markets report null", () => {
    const hits = S.byMarket.find((r) => r.seg === "batter_hits")!;
    expect(hits.legs).toBe(2);
    expect(hits.sighted).toBe(1);
    expect(hits.clvPts).toBeCloseTo(aOnePts, 10);
    // consensus-fair grading: 72% fair vs 66.667% locked = +5.333 pts
    expect(hits.fairPts).toBeCloseTo(72 - impliedPct(-200), 10);
    expect(hits.fairN).toBe(1);
    const ml = S.byMarket.find((r) => r.seg === "ml")!;
    expect(ml.clvPts).toBeCloseTo(mlPts, 10);
    expect(ml.fairPts).toBeNull(); // sighting had no consensus stored
    const ks = S.byMarket.find((r) => r.seg === "pitcher_strikeouts")!;
    expect(ks.sighted).toBe(0);
    expect(ks.clvPts).toBeNull();
  });

  it("by bucket: core carries both sightings, fun none", () => {
    const core = S.byBucket.find((r) => r.seg === "core")!;
    expect(core.sighted).toBe(2);
    expect(core.clvPts).toBeCloseTo((aOnePts + mlPts) / 2, 10);
    const fun = S.byBucket.find((r) => r.seg === "fun")!;
    expect(fun.legs).toBe(1);
    expect(fun.clvPts).toBeNull();
  });

  it("override days segment separately (file 01's stamp)", () => {
    expect(S.overrideDays.days).toBe(1);
    expect(S.overrideDays.staked).toBe(40);
    expect(S.overrideDays.pl).toBe(-40);
    expect(S.overrideDays.clvPts).toBeCloseTo(aOnePts, 10);
  });
});

describe("per-market leg calibration, hand-computed", () => {
  it("hits: predicted 62%, hit 50%, Brier from the two legs; voids excluded entirely", () => {
    const hits = S.calibration.find((r) => r.market === "batter_hits")!;
    expect(hits.n).toBe(2);
    expect(hits.predicted).toBeCloseTo(0.62, 10); // (66+58)/2
    expect(hits.actual).toBe(0.5);
    // Brier: ((.66-1)^2 + (.58-0)^2)/2 = (.1156+.3364)/2 = .226
    expect(hits.brier).toBeCloseTo(0.226, 10);
    expect(hits.ciLo).toBeGreaterThan(0);
    expect(hits.ciHi).toBeLessThan(1);
    // the void K's leg produces NO calibration row (no won/lost sample)
    expect(S.calibration.find((r) => r.market === "pitcher_strikeouts")).toBeUndefined();
    // the pending HR leg likewise
    expect(S.calibration.find((r) => r.market === "batter_home_runs")).toBeUndefined();
  });
});

describe("7-day receipt", () => {
  it("staked, settled and P/L split pending from settled; override P/L named", () => {
    expect(S.week.days).toBe(2);
    expect(S.week.staked).toBe(80); // 40 + 30 + 10
    expect(S.week.settled).toBe(70); // the $10 fun ticket is pending
    expect(S.week.pl).toBe(5); // -40 + (75-30)
    expect(S.week.overridePl).toBe(-40);
    expect(S.week.sighted).toBe(2);
  });

  it("old days age out of the week window but stay in season segments", () => {
    const later = ledgerSegments([day1, day2], NOW + 9 * 86_400_000);
    expect(later.week.days).toBe(0);
    expect(later.coverage.legs).toBe(5);
  });
});
