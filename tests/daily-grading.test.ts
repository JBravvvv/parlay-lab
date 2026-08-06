import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildProgress,
  decideGradePass,
  labelPopulation,
  makeSelectedMatcher,
  PROGRESS_KEY,
} from "@/lib/server/grading-progress";

/**
 * DAILY FULL-POPULATION GRADING (2026-08-06, operator requirement: 150+/market needs
 * full-board grading daily — card-leg-only is months to threshold).
 *
 * WHAT ALREADY EXISTED, from disk: /api/calibrate grades EVERY prediction-store row
 * (records incl. suspended shadow rows) + parlays from statsapi boxscores — full board,
 * not card-only. What was missing: CADENCE (nothing poked it but Sunday 10:00Z) and
 * POPULATION LABELS. This ship adds:
 *   - grade=only mode: grades blobs + writes pl:grade:progress, touches NEITHER
 *     pl:cal:summary NOR pl:cal:weights — the engine reads those (third freeze point) and
 *     applyWeeklyAdjustment's lastAdjust=0 would fire the FIRST fit on the first daily
 *     pass, violating reading 33 (first fit Sunday 2026-08-09). Separability is enforced
 *     here at the write layer, not assumed at the schedule layer.
 *   - population labels: selected (entered the locked card) / unselected (board-only) /
 *     shadow (suspended market) — the HRR lesson: fits and reviews read LABELED
 *     populations, never pooled silently. Shadow OUTRANKS selected by design (a suspended
 *     market's row is shadow even if an lkey collision matches a ticket).
 *   - scheduler cadence: first tick of hours 15 and 2 UTC (settled games grade next
 *     morning / same night).
 *
 * OBSERVED RED FIRST: module-not-found; the shadow-outranks-selected plant; vacuity on an
 * empty settled population.
 */

describe("labelPopulation — the three-label taxonomy", () => {
  const matcher = makeSelectedMatcher({
    core: [
      { legs: [{ lkey: "smith|batter_hits|0.5", label: "Smith o0.5 H" }, { lkey: "ml_home", label: "PHI ML" }] },
    ],
  } as never);

  it("selected: a row whose lkey entered the locked card", () => {
    expect(labelPopulation({ lkey: "smith|batter_hits|0.5", label: "Smith o0.5 H" }, matcher)).toBe("selected");
  });
  it("unselected: board-only row", () => {
    expect(labelPopulation({ lkey: "jones|batter_hits|0.5", label: "Jones o0.5 H" }, matcher)).toBe("unselected");
  });
  it("PLANT — shadow outranks selected: a suspended row matching a ticket lkey is STILL shadow", () => {
    expect(labelPopulation({ lkey: "smith|batter_hits|0.5", label: "Smith o0.5 H", susp: true }, matcher)).toBe("shadow");
  });
  it("ml/rl lkeys collide across games — selection requires the label to match too", () => {
    expect(labelPopulation({ lkey: "ml_home", label: "PHI ML" }, matcher)).toBe("selected");
    expect(labelPopulation({ lkey: "ml_home", label: "ATL ML" }, matcher)).toBe("unselected");
  });
});

describe("decideGradePass — first tick of hours 15 and 2 UTC", () => {
  const at = (iso: string) => Date.parse(iso);
  it("fires on the first tick of the morning hour (15:00-15:14Z) and the late hour (02:00-02:14Z)", () => {
    expect(decideGradePass(at("2026-08-07T15:00:30Z")).fire).toBe(true);
    expect(decideGradePass(at("2026-08-07T15:14:59Z")).fire).toBe(true);
    expect(decideGradePass(at("2026-08-07T02:01:00Z")).fire).toBe(true);
  });
  it("does not fire mid-hour or in other hours — the fire path stays undisturbed", () => {
    expect(decideGradePass(at("2026-08-07T15:15:00Z")).fire).toBe(false);
    expect(decideGradePass(at("2026-08-07T20:45:00Z")).fire).toBe(false);
    expect(decideGradePass(at("2026-08-07T10:00:00Z")).fire).toBe(false);
  });
  it("every decision names its reason", () => {
    expect(decideGradePass(at("2026-08-07T20:45:00Z")).reason).toMatch(/not a grading tick/);
  });
});

describe("buildProgress — per-market n, hit vs implied, days to 150, labels never pooled", () => {
  const g = (market: string, res: "won" | "lost", pMkt: number | null, pop?: string) =>
    ({ market, res, p: 55, pMkt, edge: null, lu: "confirmed" as const, ...(pop ? { pop } : {}) }) as never;

  it("counts, splits by label, and computes hit-vs-implied per market", () => {
    const picks = [
      g("batter_hits", "won", 60, "selected"),
      g("batter_hits", "won", 50, "unselected"),
      g("batter_hits", "lost", 55, "unselected"),
      g("pitcher_outs", "won", null, "shadow"),
    ];
    const perDay = [{ date: "2026-08-05", byMarket: { batter_hits: 3, pitcher_outs: 1 }, n: 4 }];
    const p = buildProgress(picks, perDay, "2026-08-06", Date.parse("2026-08-06T15:00:00Z"), 0);
    const bh = p.perMarket["batter_hits"];
    expect(bh.n).toBe(3);
    expect(bh.hitRate).toBeCloseTo(2 / 3, 10);
    expect(bh.impliedMean).toBeCloseTo((60 + 50 + 55) / 3 / 100, 10);
    expect(bh.byPop).toEqual({ selected: 1, unselected: 2, shadow: 0 });
    expect(p.perMarket["pitcher_outs"].byPop.shadow).toBe(1);
    expect(bh.need).toBe(150);
    expect(bh.daysTo150).toBe(Math.ceil((150 - 3) / 3));
  });

  it("VACUITY — an empty settled population declares itself instead of a silent zero table", () => {
    const p = buildProgress([], [], "2026-08-06", Date.parse("2026-08-06T15:00:00Z"), 0);
    expect(p.vacuous).toMatch(/VACUOUS/);
  });

  it("a market with zero 7-day rate gets daysTo150 null, never Infinity-as-a-date", () => {
    const p = buildProgress([g("pitcher_outs", "won", null)], [{ date: "2026-08-05", byMarket: {}, n: 0 }], "2026-08-06", 0, 0);
    expect(p.perMarket["pitcher_outs"].daysTo150).toBeNull();
  });

  it("contradictions ride the progress artifact loudly", () => {
    const p = buildProgress([], [], "2026-08-06", 0, 2);
    expect(p.contradictions).toBe(2);
    expect(JSON.stringify(p)).toMatch(/IMPOSSIBLE/);
  });
});

describe("wired — source scans, comment-stripped", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const read = (p: string) => strip(fs.readFileSync(path.join(process.cwd(), p), "utf8"));

  it("calibrate honors grade=only: progress written, summary/weights writes gated behind !gradeOnly", () => {
    const src = read("app/api/calibrate/route.ts");
    expect(src).toMatch(/gradeOnly/);
    expect(src).toMatch(/PROGRESS_KEY/);
    // the two engine-feeding writes must sit behind the gradeOnly return
    const gateIdx = src.indexOf("if (gradeOnly)");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(src.indexOf("K_SUMMARY, summary")).toBeGreaterThan(gateIdx);
    expect(src.indexOf("K_WEIGHTS, weights")).toBeGreaterThan(gateIdx);
  });
  it("scheduler forwards grading ticks; board serves the learning block beside the card", () => {
    const sched = read("app/api/scheduler/route.ts");
    expect(sched).toMatch(/decideGradePass\(/);
    expect(sched).toMatch(/grade=only/);
    const board = read("app/api/board/route.ts");
    expect(board).toMatch(/learning/);
  });
  it("PROGRESS_KEY is the one namespace", () => {
    expect(PROGRESS_KEY).toBe("pl:grade:progress");
  });
});
