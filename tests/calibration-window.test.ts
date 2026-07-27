import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CAL_START } from "@/engine2/calibration";

/**
 * THE CALIBRATION WINDOW IS A DENOMINATOR, AND IT SLIDES (2026-07-27).
 *
 * `SUMMARY_DAYS = 45` is a READ window, not a prune. This matters and was previously stated
 * the other way round, so the correction is pinned here: `pl:pred:{date}` is written with a
 * plain `SET` (no TTL), nothing ever `DEL`s it, and nothing ever `SREM`s `pl:pred:days`.
 * Every prediction row ever logged is still in the store. See the source scan below.
 *
 * What DOES move is `allDays.slice(-SUMMARY_DAYS)`. The collection period runs CAL_START
 * (2026-07-25) to freeze exit (~2026-09-22) — 60 logged dates against a 45-date window. So
 * from ~2026-09-08 the summary silently stops containing the first two weeks of the period
 * the freeze exists to collect, and on 09-22 the exit reading — reliability, disagreement,
 * per-market gaps — would have covered 2026-08-09 onward while presenting as "the freeze".
 *
 * docs/collection-period.md already recorded the MECHANISM ("CAL_START goes inert around
 * 2026-09-08") and stopped one step short of the CONSEQUENCE. Same shape as the
 * coverage-denominator series: the audit was run on the instance and not on what the
 * instance implied.
 *
 * FIX SHIPPED: the two consumers are separated. `graded` keeps the 45-date window and still
 * trains the blend weights (frozen behaviour, byte-identical); `gradedAll` covers every
 * eligible date and produces `summary.full`, which is the reading. Both stamp their bounds.
 * Widening the TRAINING window is a frozen-parameter change and stays unshipped.
 */

const ROUTE = fs.readFileSync(path.join(__dirname, "..", "app", "api", "calibrate", "route.ts"), "utf8");
const FREEZE_END = "2026-09-22";

const dayNum = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86_400_000);
const addDays = (d: string, k: number) => new Date((dayNum(d) + k) * 86_400_000).toISOString().slice(0, 10);
const SUMMARY_DAYS = Number(/const SUMMARY_DAYS = (\d+);/.exec(ROUTE)?.[1]);

describe("the calibration window declares itself, and the exit reading is not the sliding one", () => {
  it("nothing is pruned: no DEL, no SREM, no TTL on the prediction store", () => {
    const files = ["app/api/calibrate/route.ts", "app/api/predictions/route.ts", "app/api/generate/route.ts"];
    for (const f of files) {
      const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
      for (const line of src.split("\n")) {
        if (!/"DEL"|"SREM"|"EXPIRE"/.test(line)) continue;
        // the only expiring keys are the BOARD ones (3-day TTL, hence the board archive)
        expect(/BOARD_|runsKey/.test(line), `${f} expires or deletes a non-board key: ${line.trim()}`).toBe(true);
      }
      // and the day blob is written with a bare SET
      expect(src.includes('redisSetJson(dayKey(date)') || !src.includes("dayKey(date)")).toBe(true);
    }
  });

  it("the collection period is LONGER than the training window — so it really does cap", () => {
    expect(SUMMARY_DAYS).toBe(45);
    expect(CAL_START).toBe("2026-07-25");
    const logged = dayNum(FREEZE_END) - dayNum(CAL_START) + 1; // inclusive
    expect(logged).toBe(60);
    expect(logged).toBeGreaterThan(SUMMARY_DAYS); // the defect is real, not hypothetical
  });

  it("the window caps on 2026-09-08 and the exit reading would have started 2026-08-09", () => {
    // the 45th logged date after CAL_START is the last day the window still reaches back to it
    expect(addDays(CAL_START, SUMMARY_DAYS - 1)).toBe("2026-09-07");
    expect(addDays(CAL_START, SUMMARY_DAYS)).toBe("2026-09-08"); // first date something falls off
    // at freeze exit: last 45 of 60 logged dates
    const firstKept = addDays(FREEZE_END, -(SUMMARY_DAYS - 1));
    expect(firstKept).toBe("2026-08-09");
    const droppedCount = dayNum(firstKept) - dayNum(CAL_START);
    expect(droppedCount).toBe(15); // 2026-07-25 .. 2026-08-08
    expect(addDays(firstKept, -1)).toBe("2026-08-08");
  });

  it("the route builds BOTH windows, and only the narrow one trains the weights", () => {
    // the wide reading exists...
    expect(ROUTE).toContain("const gradedAll: GradedPick[] = []");
    expect(ROUTE).toContain("const full = computeCalibration(gradedAll)");
    expect(ROUTE).toContain("summary.full = full");
    // ...and the weight adjuster still sees only the 45-date summary
    expect(ROUTE).toContain("applyWeeklyAdjustment(summary, weights, now)");
    expect(ROUTE).not.toContain("applyWeeklyAdjustment(full");
    // both stamp their bounds
    expect(ROUTE).toContain("summary.window = {");
    expect(ROUTE).toContain("full.window = {");
    expect(ROUTE).toContain("capped: usedDays.length >= SUMMARY_DAYS");
  });

  it("the ledger join feeds BOTH windows — the wider reading is never missing rows", () => {
    // a pick built once and pushed to both, rather than two literals that can drift apart
    expect(ROUTE).toContain("const pick: GradedPick = {");
    expect(ROUTE).toContain("graded.push(pick);");
    expect(ROUTE).toContain("gradedAll.push(pick);");
  });

  it("the reading channel is unwindowed by construction, not by a bigger number", () => {
    // `limit: null` is the claim "no window", and it must not be a larger constant that
    // would itself expire — the failure mode this whole test file exists to prevent
    expect(ROUTE).toMatch(/full\.window = \{[\s\S]*?limit: null/);
    expect(ROUTE).toMatch(/summary\.window = \{[\s\S]*?limit: SUMMARY_DAYS/);
  });
});
