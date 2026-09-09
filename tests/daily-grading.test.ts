import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildProgress,
  decideGradePass,
  GRADE_SLOTS_PT,
  GRADE_SLOT_WINDOW_MIN,
  ptMinutesOfDay,
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

describe("decideGradePass — first tick after 08:00/09:30/12:00/15:00/16:45 PACIFIC (all inside the poke window)", () => {
  const at = (iso: string) => Date.parse(iso);
  /* PIN UPDATED 2026-09-08 (INSTRUCTION 46b, Josh's word, verbatim: "Widen the cron-job.org
     window to run grading @ 8am, 9:30am, 12pm, 3pm & 4:45pm"): the cadence was the first tick
     of UTC hours 15/18/22/2 (INSTRUCTION 46, earlier the same day). It is now five PACIFIC
     wall-clock slots, each firing on the first ticker tick inside [slot, slot+15min)
     America/Los_Angeles — so the same five times hold in PDT and PST. OBSERVED RED against the
     GRADE_HOURS build before this update (GRADE_HOURS undefined; 19:00Z did not fire; 02:01Z
     did). No cron-job.org change was needed: the ticker pokes every 15 min during UTC hours
     15-23 and 0-2 (docs/cron-jobs.md) and every slot lands inside that window under BOTH
     offsets — pinned below, because a slot outside it would never tick and be dead. Zero Odds
     credits: grade=only reads statsapi + Redis only (app/api/calibrate/route.ts). */
  const POKE_WINDOW_HOURS = new Set([15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2]);
  it("the five slots are Josh's, verbatim, with a 15-minute first-tick window", () => {
    expect(GRADE_SLOTS_PT).toEqual(["08:00", "09:30", "12:00", "15:00", "16:45"]);
    expect(GRADE_SLOT_WINDOW_MIN).toBe(15);
  });
  it("ptMinutesOfDay is DST-correct: 15:00Z is 08:00 PT in September and 07:00 PT in December", () => {
    expect(ptMinutesOfDay(at("2026-09-08T15:00:00Z"))).toBe(8 * 60);
    expect(ptMinutesOfDay(at("2026-12-08T15:00:00Z"))).toBe(7 * 60);
    expect(ptMinutesOfDay(at("2026-09-09T06:59:00Z"))).toBe(23 * 60 + 59); // no "24:xx" from h23
  });
  it("fires on the first tick (slot .. slot+14min) of each slot, PDT", () => {
    expect(decideGradePass(at("2026-09-08T15:00:30Z")).fire).toBe(true); // 08:00 PT
    expect(decideGradePass(at("2026-09-08T15:14:59Z")).fire).toBe(true);
    expect(decideGradePass(at("2026-09-08T16:30:00Z")).fire).toBe(true); // 09:30 PT
    expect(decideGradePass(at("2026-09-08T16:44:00Z")).fire).toBe(true);
    expect(decideGradePass(at("2026-09-08T19:00:01Z")).fire).toBe(true); // 12:00 PT
    expect(decideGradePass(at("2026-09-08T22:05:00Z")).fire).toBe(true); // 15:00 PT
    expect(decideGradePass(at("2026-09-08T23:45:00Z")).fire).toBe(true); // 16:45 PT
    expect(decideGradePass(at("2026-09-08T23:59:59Z")).fire).toBe(true);
  });
  it("the same wall-clock slots hold in PST (December): 08:00 PT is 16:00Z, 16:45 PT is 00:45Z", () => {
    expect(decideGradePass(at("2026-12-08T16:00:00Z")).fire).toBe(true);
    expect(decideGradePass(at("2026-12-08T15:00:00Z")).fire).toBe(false); // 07:00 PST — not a slot
    expect(decideGradePass(at("2026-12-09T00:45:00Z")).fire).toBe(true);
    expect(decideGradePass(at("2026-12-09T00:59:00Z")).fire).toBe(true);
    expect(decideGradePass(at("2026-12-09T01:00:00Z")).fire).toBe(false);
  });
  it("every slot sits inside the cron-job.org poke window (15-23, 0-2 UTC) under BOTH offsets — a slot outside it would never tick", () => {
    for (const slot of GRADE_SLOTS_PT) {
      const [h, m] = slot.split(":").map(Number);
      for (const off of [7, 8]) {
        const utcH = (h + off) % 24;
        expect(POKE_WINDOW_HOURS.has(utcH), `slot ${slot} PT at UTC-${off} is ${utcH}:${m}Z — outside the poke window, it can never fire`).toBe(true);
      }
    }
  });
  it("does not fire between slots, once the 15-minute window closes, or in the hours the ticker never pokes", () => {
    expect(decideGradePass(at("2026-09-08T15:15:00Z")).fire).toBe(false); // 08:15 PT — window closed
    expect(decideGradePass(at("2026-09-08T16:45:00Z")).fire).toBe(false); // 09:45 PT
    expect(decideGradePass(at("2026-09-08T18:27:00Z")).fire).toBe(false); // 11:27 PT — the scheduler-route pin
    expect(decideGradePass(at("2026-09-08T18:00:00Z")).fire).toBe(false); // 11:00 PT — was a grading hour under INSTRUCTION 46
    expect(decideGradePass(at("2026-09-08T20:45:00Z")).fire).toBe(false);
    expect(decideGradePass(at("2026-09-09T00:00:00Z")).fire).toBe(false); // 17:00 PT
    expect(decideGradePass(at("2026-09-09T02:01:00Z")).fire).toBe(false); // 19:01 PT — was the night pass
    expect(decideGradePass(at("2026-09-08T06:00:30Z")).fire).toBe(false); // outside the window — never poked
    expect(decideGradePass(at("2026-09-08T14:59:59Z")).fire).toBe(false); // 07:59 PT
  });
  it("every decision names its reason", () => {
    expect(decideGradePass(at("2026-09-08T20:45:00Z")).reason).toBe("not a grading tick (grading runs on the first tick after 08:00/09:30/12:00/15:00/16:45 PT)");
    expect(decideGradePass(at("2026-09-08T16:31:00Z")).reason).toBe("first tick of grading slot 09:30 PT");
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
