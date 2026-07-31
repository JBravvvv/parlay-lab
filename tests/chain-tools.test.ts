import { describe, expect, it } from "vitest";
import { burnSeries, parseSeries } from "../tools/quota.mjs";
import { attribute, predCensus, propsCost } from "../tools/burn-report.mjs";
import { fieldCensus, hrrJoin, kellyFrac, overstake } from "../tools/ledger-report.mjs";
import { cfSelReport, outsCounts, reopenReport } from "../tools/board-report.mjs";

/**
 * GUARDS FOR THE FOUR CHAIN TOOLS (2026-07-31, owner's authorization).
 *
 * These replace prose steps that FEED OTHER NUMBERS — the class the 2026-07-31 audit
 * separated from tasks. Each assertion below is the specific failure that prose allowed:
 *   quota.mjs      — a burn SERIES, so one window can never again be generalised to a day
 *                    (the ~4x error of 2026-07-30)
 *   burn-report    — the residual is a NAMED UNKNOWN, never absorbed into a known line
 *   ledger-report  — the overstake ceiling is the engine's own shKellyFrac, floor included,
 *                    so a $0 ceiling reads as "stake nothing" rather than as missing data
 *   board-report   — the outs VACUITY branch fires before any count is believed
 *
 * OBSERVED RED before the tools landed: every import above threw MODULE_NOT_FOUND.
 */

describe("quota.mjs — the burn series", () => {
  it("computes per-hour rates between consecutive reads", () => {
    const rows = parseSeries(
      [
        JSON.stringify({ at: "2026-07-30T16:45:00Z", remaining: 1238, used: 18762 }),
        JSON.stringify({ at: "2026-07-31T01:25:00Z", remaining: 1038, used: 18962 }),
      ].join("\n"),
    );
    const s = burnSeries(rows);
    expect(s).toHaveLength(1);
    expect(s[0].spent).toBe(200);
    expect(s[0].hours).toBeCloseTo(8.67, 1);
    expect(s[0].perHour).toBeCloseTo(23.1, 0);
  });

  it("a FLAT stretch reads as zero, which is the shape that distinguishes scheduled from event-driven", () => {
    const rows = parseSeries(
      [
        JSON.stringify({ at: "2026-07-31T01:25:00Z", remaining: 1038, used: 18962 }),
        JSON.stringify({ at: "2026-07-31T05:51:00Z", remaining: 1038, used: 18962 }),
      ].join("\n"),
    );
    expect(burnSeries(rows)[0].spent).toBe(0);
    expect(burnSeries(rows)[0].perHour).toBe(0);
  });
});

describe("burn-report.mjs — the residual is named", () => {
  it("derives props cost from the archive, not from a schedule", () => {
    const day = { snapshots: [{ t: "2026-07-30T07:42:43Z", kind: "pre", events: new Array(10).fill({}) },
                              { t: "2026-07-30T23:35:53Z", kind: "close", events: new Array(4).fill({}) }] };
    const c = propsCost(day);
    expect(c.events).toBe(14);
    expect(c.credits).toBe(84);
  });

  it("never absorbs the residual into a known line", () => {
    const a = attribute({ spent: 423, props: 180, ticks: 24 });
    expect(a.known).toBe(204);
    expect(a.residual).toBe(219);
    expect(a.residualPct).toBeGreaterThan(50);
  });

  it("reading 15(c): a client row is counted and called out", () => {
    const c = predCensus({ records: [{ src: "cron", selMode: "ev_gated" }, { src: "client", selMode: "caesars_ev" }] });
    expect(c.clientRows).toBe(1);
    expect(c.byMode["client/caesars_ev"]).toBe(1);
  });
});

describe("ledger-report.mjs — reading 15 whole", () => {
  it("kellyFrac reproduces the engine's floor: non-positive edge gives EXACTLY zero", () => {
    // +100 at 40% true prob -> negative edge -> the engine floors at 0 ("stake nothing")
    expect(kellyFrac(40, 2.0)).toBe(0);
    // a real edge is capped at 2%
    expect(kellyFrac(80, 2.0)).toBeCloseTo(0.02, 5);
  });

  it("finds a realized overstake and the $0-ceiling tickets without needing selMode", () => {
    const entries = [{
      date: "2026-07-20", locked: true, bankroll: 750,
      core: [
        { id: "a", stake: 62, prob: 24.8, czDec: 4.26, czEv: 5.6, legs: [{ lkey: "x|batter_hits_runs_rbis|1.5" }] },
        { id: "b", stake: 62, prob: 42.5, czDec: 2.21, czEv: -6.2, legs: [{ lkey: "ml_home" }] },
      ],
      funT: [],
    }];
    const o = overstake(entries);
    expect(o.tickets).toBe(2);
    expect(o.over).toBeGreaterThanOrEqual(1);
    expect(o.zeroCeiling.length).toBe(1);      // the negative-edge ML ticket
    expect(o.negativeCzEv).toBe(1);
    expect(o.dollarsOver).toBeGreaterThan(0);
  });

  it("the HRR join counts only won/lost and averages the leg's own implied price", () => {
    const entries = [{
      date: "2026-07-18", locked: true, bankroll: 2500,
      core: [{ id: "t", stake: 10, prob: 50, czDec: 2, legs: [
        { label: "P1", prop: "H+R+RBI O 1.5", cz: -110, lkey: "p1|batter_hits_runs_rbis|1.5" },
        { label: "P2", prop: "H+R+RBI O 1.5", cz: -110, lkey: "p2|batter_hits_runs_rbis|1.5" },
      ] }],
      funT: [],
      grading: { legs: { "P1|H+R+RBI O 1.5": { result: "won" }, "P2|H+R+RBI O 1.5": { result: "lost" } } },
    }];
    const h = hrrJoin(entries);
    expect(h.won).toBe(1);
    expect(h.lost).toBe(1);
    expect(h.hit).toBe(50);
    expect(h.implied).toBeCloseTo(52.4, 0);
  });

  it("the field census sees a schema that changed mid-life", () => {
    const c = fieldCensus([
      { date: "2026-07-18", locked: true, core: [{ stake: 1 }] },
      { date: "2026-07-25", locked: true, selMode: "ev_gated", overrode: false, core: [{ stake: 1, bsOdds: -110 }] },
    ]);
    expect(c["2026-07-18"].selMode).toBe(false);
    expect(c["2026-07-25"].selMode).toBe(true);
    expect(c["2026-07-18"].basisFields).toBe(false);
    expect(c["2026-07-25"].basisFields).toBe(true);
  });
});

describe("board-report.mjs — the vacuity branch fires first", () => {
  it("zero outs rows is reported as VACUOUS, not as a pass", () => {
    const o = outsCounts({ categories: { ml: [{ lkey: "ml_home" }] }, parlays: [], parlaysMixed: [] });
    expect(o.rowsPresent).toBe(0);
    expect(o.vacuous).toBe(true);
    expect(o.legsInTickets).toBe(0);   // trivially satisfied — which is exactly the trap
  });

  it("counts outs legs that reach built tickets", () => {
    const o = outsCounts({
      categories: { outs: [{ lkey: "p|pitcher_outs|17.5", susp: true, cfSel: { pool: true, card: false } }] },
      parlays: [{ legs: [{ lkey: "p|pitcher_outs|17.5" }] }], parlaysMixed: [],
    });
    expect(o.rowsPresent).toBe(1);
    expect(o.vacuous).toBe(false);
    expect(o.susp).toBe(1);
    expect(o.legsInTickets).toBe(1);
  });

  it("cfSel: a card:true stamp without rank/stake is flagged, and dollars are summed per market", () => {
    const c = cfSelReport({ categories: { hrr: [
      { lkey: "a|batter_hits_runs_rbis|1.5", susp: true, cfSel: { pool: true, card: true, rank: 1, stake: 62 } },
      { lkey: "b|pitcher_outs|17.5", susp: true, cfSel: { pool: true, card: true } },
    ] } });
    expect(c.carded).toBe(2);
    expect(c.missingRank).toBe(1);
    expect(c.dollarsByMarket.batter_hits_runs_rbis).toBe(62);
  });

  it("reopen: consensus blocks and mktN are read together", () => {
    const r = reopenReport(
      { blocked: [{ reason: "consensus", type: "pitcher_strikeouts" }, { reason: "nv_tax", type: "ml" }] },
      { mktN: { pitcher_strikeouts: 61, batter_hits: 117 }, consMinN: 100 },
    );
    expect(r.byReason.consensus).toBe(1);
    expect(r.crossed.pitcher_strikeouts.crossed).toBe(false);
    expect(r.crossed.batter_hits.crossed).toBe(true);
  });
});

/**
 * PLANT ADDED 2026-07-31 (owner's item 2). This file's original observed-red was "every import
 * threw MODULE_NOT_FOUND before the tools landed" — a one-time historical act that cannot be
 * re-run now the modules exist. These are invalid-by-value plants: each asserts the checker
 * REJECTS a value that must never pass, so the red is a standing property rather than a memory.
 *
 * It does NOT prove wiring — these are pure functions with no file input, which is why
 * tests/guard-wiring.test.ts lists chain-tools under UNCOVERED with that reason.
 */
describe("PLANT (invalid-by-value): each chain tool refuses a value that must never pass", () => {
  it("kellyFrac cannot return a positive fraction on a non-positive edge", () => {
    expect(kellyFrac(10, 2.0)).toBe(0);            // 10% at evens — deeply negative edge
    expect(kellyFrac(50, 1.0)).toBeNull();         // dec <= 1 is not a price
    expect(kellyFrac(50, 2.0)).not.toBe(0.25);     // the 0.25x and 2% caps must both bite
  });

  it("attribute cannot hide a residual by folding it into a known line", () => {
    const a = attribute({ spent: 1000, props: 1, ticks: 1 });
    expect(a.known).toBe(2);
    expect(a.residual).toBe(998);                   // never absorbed, never clamped
    expect(a.residualPct).toBeGreaterThan(99);
  });

  it("outsCounts cannot report a pass on an empty board", () => {
    const o = outsCounts({ categories: {}, parlays: [], parlaysMixed: [] });
    expect(o.vacuous).toBe(true);                   // the branch that must fire before any count
    expect(o.rowsPresent).toBe(0);
  });

  it("predCensus cannot report zero client rows when a client row exists", () => {
    expect(predCensus({ records: [{ src: "client" }] }).clientRows).toBe(1);
    expect(predCensus({ records: [] }).clientRows).toBe(0);
  });

  it("burnSeries cannot report spend where the quota did not move", () => {
    const rows = parseSeries([
      JSON.stringify({ at: "2026-07-31T01:00:00Z", remaining: 100, used: 900 }),
      JSON.stringify({ at: "2026-07-31T02:00:00Z", remaining: 100, used: 900 }),
    ].join("\n"));
    expect(burnSeries(rows)[0].spent).toBe(0);
    expect(burnSeries(rows)[0].perHour).toBe(0);
  });
});
