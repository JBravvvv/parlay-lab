import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  CAL_START,
  calibrationEligible,
  effectiveCalibration,
  slopeMults,
  type CalibrationSummary,
  type WeightState,
} from "@/engine2/calibration";
import { boardToPredictions, lineOf } from "@/lib/pred-serialize";
import type { BoardData } from "@/engine";

/**
 * PHASE 0.5 (2026-07-24) — the app and the Vercel cron are two generators arming
 * one engine. For six days they armed it differently: /api/generate set no
 * SH_CFG.selMode at all, so it emitted the LEGACY overs-only board (~30% of rows
 * on the opposite side of the app's), with no mktN and no calG, while the frozen
 * table says the selection mode is ev_gated. These tests pin the three pieces of
 * the fix: one shared calibration computation, provenance on every logged row,
 * and the dated training-window cutoff.
 */

const rel = (n: number, slope: number | null, se: number | null) => ({ n, slope, se });

function summary(over: Partial<CalibrationSummary> = {}): CalibrationSummary {
  return {
    at: 1,
    graded: 500,
    markets: ["batter_hits"],
    buckets: [],
    perMarket: {},
    quarantine: [],
    reliability: {
      all: rel(2000, 1.02, 0.2),
      batter_hits: rel(400, 0.6, 0.1), // significantly overconfident → slopeMults acts
      batter_home_runs: rel(300, 1.4, 0.3), // over 1 → no shrink
    },
    globalShrink: { s: 0.85, n: 1800, slopeBefore: 1.3, slopeAfter: 1.05 },
    ...over,
  } as CalibrationSummary;
}

const weights = (mults: Record<string, number>): WeightState => ({ mults, lastAdjust: 0, log: [] });

describe("effectiveCalibration — one computation for every generator", () => {
  it("reproduces what /api/calibration serves the app: weekly mults min slope mults", () => {
    const s = summary();
    const w = weights({ batter_hits: 0.9, pitcher_outs: 0.8 });
    const armed = effectiveCalibration(s, w, "on");
    // the shipped merge: start from the weekly state, take the stricter slope fit
    const expected: Record<string, number> = { ...w.mults };
    for (const [m, v] of Object.entries(slopeMults(s.reliability!))) expected[m] = Math.min(expected[m] ?? 1, v);
    expect(armed.mults).toEqual(expected);
    expect(armed.mults.batter_hits).toBeLessThan(0.9); // slope fit is the stricter one
    expect(armed.mults.pitcher_outs).toBe(0.8); // untouched by the fit
    expect(armed.mults.batter_home_runs).toBeUndefined(); // slope above 1 never raises
  });

  it("passes calG through — the field the cron never set", () => {
    expect(effectiveCalibration(summary(), weights({}), "on").globalS).toBe(0.85);
    expect(effectiveCalibration(summary({ globalShrink: undefined }), weights({}), "on").globalS).toBe(null);
  });

  it("derives mktN (the consensus gate's input) from the reliability counts", () => {
    expect(effectiveCalibration(summary(), weights({}), "on").mktN).toEqual({
      all: 2000,
      batter_hits: 400,
      batter_home_runs: 300,
    });
  });

  it("honors the kill switch: auto off zeroes mults and calG but still reports counts", () => {
    const armed = effectiveCalibration(summary(), weights({ batter_hits: 0.9 }), "off");
    expect(armed.mults).toEqual({});
    expect(armed.globalS).toBe(null);
    expect(armed.mktN?.batter_hits).toBe(400);
  });

  it("with no stored summary, mktN is null — the engine reads that as 'every market is small'", () => {
    const armed = effectiveCalibration(null, null, "on");
    expect(armed.mktN).toBe(null); // never assumes a market is proven
    expect(armed.mults).toEqual({});
    expect(armed.globalS).toBe(null);
  });
});

describe("prediction provenance — which generator, which mode", () => {
  const board = (): BoardData =>
    ({
      categories: {
        batter_hits: [
          { label: "A Judge (NYY)", sub: "Hits O 1.5", prob: 44.1, implied: 42, lkey: "ajudge|batter_hits|1.5", gkey: "g1", odds: "+120" },
        ],
        all: [{ label: "dupe", sub: "Hits O 1.5", prob: 44.1, lkey: "x", gkey: "g1" }],
      },
      parlays: [],
      parlaysMixed: [],
      gameInfo: { g1: { pk: 1, start: "2026-07-25T23:00:00Z", away: "NYY", home: "BOS" } },
    }) as unknown as BoardData;

  it("stamps src + selMode on every record", () => {
    const { records } = boardToPredictions(board(), { src: "cron", selMode: "ev_gated" });
    expect(records).toHaveLength(1);
    expect(records[0].src).toBe("cron");
    expect(records[0].selMode).toBe("ev_gated");
  });

  it("stamps the client's own mode", () => {
    const { records } = boardToPredictions(board(), { src: "client", selMode: "dk_fd" });
    expect(records[0].src).toBe("client");
    expect(records[0].selMode).toBe("dk_fd");
  });

  it("without provenance the record shape is unchanged (older callers, older rows)", () => {
    const { records } = boardToPredictions(board());
    expect(records[0].src).toBeUndefined();
    expect(records[0].selMode).toBeUndefined();
    expect(records[0].p).toBe(44.1); // everything else identical
  });
});

/* Values matching today is not the invariant — calW matched "today" right up until
   the day the slope fit started acting, and then it didn't. The invariant is that
   both generators go through the SAME CALL SITE. These read the route sources and
   fail if either one starts computing its own arming again. */
describe("arming call sites (structural, not value-based)", () => {
  const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
  const GEN = "app/api/generate/route.ts";
  const CAL = "app/api/calibration/route.ts";

  it("both generators arm from effectiveCalibration()", () => {
    expect(src(GEN)).toMatch(/effectiveCalibration\(/);
    expect(src(CAL)).toMatch(/effectiveCalibration\(/);
  });

  it("neither route re-implements the mults merge locally", () => {
    // the pre-Phase-0.5 bug: /api/calibration merged slopeMults inline and
    // /api/generate read pl:cal:weights raw, so the cron silently ran without
    // the nightly slope fit
    expect(src(CAL)).not.toMatch(/slopeMults\(/);
    expect(src(GEN)).not.toMatch(/slopeMults\(/);
    expect(src(GEN)).not.toMatch(/weights\?\.mults/);
  });

  it("the cron sets the frozen selection mode explicitly", () => {
    // SH_CFG has no engine-side selMode default; unset silently means legacy
    expect(src(GEN)).toMatch(/CRON_SEL_MODE\s*=\s*"ev_gated"/);
    expect(src(GEN)).toMatch(/cfg\.selMode\s*=\s*CRON_SEL_MODE/);
  });

  it("the cron stamps provenance on what it logs", () => {
    expect(src(GEN)).toMatch(/boardToPredictions\(data,\s*\{\s*src:\s*"cron"/);
  });
});

/* Phase 0.6: line + suspension capture. Neither threshold in the freeze docs is
   computable without them — the panel's per-market count cannot tell an H+R+RBI
   O0.5 (bettable, "watch") from an O1.5+ (suspended from every ticket), and on a
   real board ~93% of that market's rows are the suspended ones. */
describe("line + suspension capture", () => {
  const boardWith = (rows: Record<string, unknown>[]): BoardData =>
    ({
      categories: { batter_hits_runs_rbis: rows },
      parlays: [],
      parlaysMixed: [],
      gameInfo: { g1: { pk: 1, start: "2026-07-26T23:00:00Z", away: "NYY", home: "BOS" } },
    }) as unknown as BoardData;

  it("stamps the line off lkey and flags suspended rows", () => {
    const { records } = boardToPredictions(
      boardWith([
        { label: "A", sub: "H+R+RBI O 0.5", prob: 71, lkey: "a|batter_hits_runs_rbis|0.5", gkey: "g1", odds: "-140" },
        { label: "B", sub: "H+R+RBI O 1.5", prob: 40, lkey: "b|batter_hits_runs_rbis|1.5", gkey: "g1", odds: "+150", susp: true },
      ]),
      { src: "cron", selMode: "ev_gated" },
    );
    expect(records.map((r) => [r.ln, r.susp])).toEqual([
      [0.5, undefined],
      [1.5, true],
    ]);
  });

  it("game markets have no line rather than a fake one", () => {
    const { records } = boardToPredictions(
      ({
        categories: { ml: [{ label: "NYY", sub: "ML vs BOS", prob: 55, lkey: "ml_home", gkey: "g1", odds: "-120" }] },
        parlays: [],
        parlaysMixed: [],
        gameInfo: { g1: { pk: 1, start: "2026-07-26T23:00:00Z", away: "NYY", home: "BOS" } },
      }) as unknown as BoardData,
    );
    expect(records[0].ln).toBe(null);
  });

  it("lineOf parses exactly what shLegKey builds", () => {
    expect(lineOf("aaronjudge|batter_hits|1.5")).toBe(1.5);
    expect(lineOf("ml_away")).toBe(null);
    expect(lineOf(null)).toBe(null);
    expect(lineOf("garbage|only")).toBe(null);
  });
});

describe("CAL_START — the dated training cutoff", () => {
  it("excludes the two-generator window and admits everything after it", () => {
    expect(CAL_START).toBe("2026-07-25");
    expect(calibrationEligible("2026-07-17")).toBe(false); // client-only logging began
    expect(calibrationEligible("2026-07-18")).toBe(false); // cron joined — mixed from here
    expect(calibrationEligible("2026-07-24")).toBe(false); // last mixed day
    expect(calibrationEligible("2026-07-25")).toBe(true); // first clean day
    expect(calibrationEligible("2026-08-01")).toBe(true);
  });

  it("is a filter, not a delete — the rule is date-based with no per-row guessing", () => {
    // an over-side row could have come from either generator; the cutoff never
    // tries to tell them apart, it just excludes the whole ambiguous window
    const dates = ["2026-07-10", "2026-07-19", "2026-07-25", "2026-07-26"];
    expect(dates.filter(calibrationEligible)).toEqual(["2026-07-25", "2026-07-26"]);
  });
});
