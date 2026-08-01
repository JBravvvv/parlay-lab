import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CAL_START } from "@/engine2/calibration";
import { stripComments } from "./helpers/source";

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

/* STRIP COMMENTS (2026-08-01). OBSERVED DEAD: with `summary.full = full` renamed in the
   calibrate route and the exact string left in a comment beside it, this guard passed 12/12.
   It pins the CALIBRATION WINDOW and its vintage stamping — `full.window`, `summary.window`,
   `capped`, SUMMARY_DAYS — every one a presence check that prose can satisfy. `doc` below is
   MARKDOWN and is deliberately NOT stripped. */
const ROUTE = stripComments(fs.readFileSync(path.join(__dirname, "..", "app", "api", "calibrate", "route.ts"), "utf8"));
/* ...and the UNSTRIPPED copy, for the one test that is deliberately ABOUT the comment.
   "the constant carries the date and the reason at its declaration" asserts that the
   CAUTION IS DOCUMENTED where the next editor will see it — a legitimate assertion about
   prose, and the reason this file needs both copies rather than one. Stripping revealed it
   by turning that test red; it is not collateral, it is the distinction. */
const ROUTE_RAW = fs.readFileSync(path.join(__dirname, "..", "app", "api", "calibrate", "route.ts"), "utf8");
const FREEZE_END = "2026-09-22";

const dayNum = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86_400_000);
const addDays = (d: string, k: number) => new Date((dayNum(d) + k) * 86_400_000).toISOString().slice(0, 10);
const SUMMARY_DAYS = Number(/const SUMMARY_DAYS = (\d+);/.exec(ROUTE)?.[1]);

describe("the calibration window declares itself, and the exit reading is not the sliding one", () => {
  it("nothing is pruned: no DEL, no SREM, no TTL on the prediction store", () => {
    const files = ["app/api/calibrate/route.ts", "app/api/predictions/route.ts", "app/api/generate/route.ts"];
    /* NON-EMPTY GUARD (2026-07-27): this only inspects lines that CONTAIN a DEL/SREM/EXPIRE, so
       zero such lines would pass having checked nothing. The board keys legitimately expire, so
       a positive count is the expected state and its absence means the scan broke. */
    let seen = 0;
    for (const f of files) {
      /* stripped for the same reason, plus one of its own: a COMMENTED-OUT "DEL" line would
         increment `seen`, which is this test's non-empty guard — prose could satisfy the very
         check that exists to prove the scan matched something. */
      const src = stripComments(fs.readFileSync(path.join(__dirname, "..", f), "utf8"));
      for (const line of src.split("\n")) {
        if (!/"DEL"|"SREM"|"EXPIRE"/.test(line)) continue;
        seen++;
        // the only expiring keys are the BOARD ones (3-day TTL, hence the board archive)
        expect(/BOARD_|runsKey/.test(line), `${f} expires or deletes a non-board key: ${line.trim()}`).toBe(true);
      }
      // and the day blob is written with a bare SET
      expect(src.includes('redisSetJson(dayKey(date)') || !src.includes("dayKey(date)")).toBe(true);
    }
    expect(seen, "no DEL/SREM/EXPIRE line found at all — the scan is matching nothing").toBeGreaterThan(0);
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
    expect(ROUTE).not.toMatch(/applyWeeklyAdjustment\(\s*full\b/);
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

  /**
   * THE CONSTANT AND THE DOC MOVE TOGETHER, OR THE BUILD BREAKS.
   *
   * "If SUMMARY_DAYS is ever raised it must land before 2026-09-08" was a caution in prose,
   * which is the exact failure mode this project has now hit five times. So the dates are
   * DERIVED from the constant and checked against the SYNCED-WINDOW table in
   * docs/collection-period.md: change 45 to anything else and this test fails until the
   * table is recomputed — which forces whoever changes it to look at the cap date.
   *
   * Same shape as tests/lid-coupling.test.ts: the invariant breaks the build, it does not
   * sit beside the code hoping to be read.
   */
  it("SYNCED-WINDOW: the doc's table is derived from the code constant", () => {
    const doc = fs.readFileSync(path.join(__dirname, "..", "docs", "collection-period.md"), "utf8");
    const marker = doc.indexOf("SYNCED-WINDOW");
    expect(marker, "the SYNCED-WINDOW block is gone from docs/collection-period.md").toBeGreaterThan(0);

    const row = /\|\s*(\d+)\s*\|\s*(\d{4}-\d{2}-\d{2}|never)\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(\d+)\s*\|/.exec(
      doc.slice(marker),
    );
    expect(row, "the SYNCED-WINDOW table row is missing or malformed").not.toBeNull();
    const [, docDays, docCaps, docStart, docDropped] = row!;

    // every figure recomputed from the constant — clamped, so the table stays checkable
    // if the window is ever widened past the whole collection period
    const logged = dayNum(FREEZE_END) - dayNum(CAL_START) + 1;
    const caps = addDays(CAL_START, SUMMARY_DAYS);
    const start = SUMMARY_DAYS >= logged ? CAL_START : addDays(FREEZE_END, -(SUMMARY_DAYS - 1));
    const dropped = Math.max(0, dayNum(start) - dayNum(CAL_START));

    expect(Number(docDays), "SYNCED-WINDOW: SUMMARY_DAYS in the doc != the code").toBe(SUMMARY_DAYS);
    expect(docCaps, "SYNCED-WINDOW: recompute the first-caps date").toBe(caps);
    expect(docStart, "SYNCED-WINDOW: recompute the freeze-exit window start").toBe(start);
    expect(Number(docDropped), "SYNCED-WINDOW: recompute the dropped-dates count").toBe(dropped);
  });

  it("the constant carries the date and the reason at its declaration", () => {
    // a test can only fire when it is run; the comment is what the next person editing
    // the line actually sees. Both, not either.
    const decl = ROUTE_RAW.slice(0, ROUTE_RAW.indexOf("const SUMMARY_DAYS"));
    expect(decl).toContain("2026-09-08");
    expect(decl).toContain("BEFORE 2026-09-08");
    expect(decl).toContain("SYNCED-WINDOW");
  });

  it("the reading channel is unwindowed by construction, not by a bigger number", () => {
    // `limit: null` is the claim "no window", and it must not be a larger constant that
    // would itself expire — the failure mode this whole test file exists to prevent
    expect(ROUTE).toMatch(/full\.window = \{[\s\S]*?limit: null/);
    expect(ROUTE).toMatch(/summary\.window = \{[\s\S]*?limit: SUMMARY_DAYS/);
  });
});

/**
 * THE STALE-SUMMARY CLASS — every persisted aggregate says WHEN and WHAT wrote it.
 *
 * `at` alone answers "when", and that is not enough: `tools/gate_activity.py` once read
 * `significant: true` out of a summary written BEFORE `SIG_MIN_N = 50` shipped, and a stale
 * artifact is indistinguishable from a live gate unless the code version is on it. Added 2026-07-27:
 * `rev` = the 7-char commit sha (`"local"` off Vercel).
 *
 * This is the same guardrail shape as tests/workflow-timing.test.ts and
 * tests/factor-classification.test.ts — the build refuses work that has not answered a question
 * this project has already learned to ask.
 */
describe("every persisted aggregate carries a timestamp AND a code stamp", () => {
  it("the calibration summary is stamped with both", () => {
    expect(ROUTE).toContain("summary.rev = process.env.VERCEL_GIT_COMMIT_SHA");
    expect(ROUTE).toMatch(/summary\.window = \{/); // `at` rides on the summary root, already pinned
    expect(ROUTE).toContain('?? "local"'); // a local run says so rather than reading as unstamped
  });

  it("the weight state is stamped too — it is the thing the summary MOVES", () => {
    expect(ROUTE).toContain("weights.rev = summary.rev");
    expect(ROUTE).toContain("weights.at = now");
  });

  /* OPENED 2026-07-27: the first version captured (K_SUMMARY|K_WEIGHTS) — the valid set baked
     into the scanner, so a NEW persisted aggregate was invisible to it. Same class as the
     doc-structure scanner that could not see a planted unknown id. Now: OPEN capture on any
     redisSetJson target, with the exclusions enumerated and justified — open candidates,
     closed exceptions, never the reverse. */
  const STAMP_EXEMPT = new Set([
    "dayKey", // per-day GRADING blob — data, not an aggregate; grading provenance rides the rows
  ]);
  function unstampedWrites(src: string): string[] {
    const lines = src.split("\n");
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const m = /redisSetJson\((\w+)/.exec(lines[i]);
      if (!m || STAMP_EXEMPT.has(m[1])) continue;
      const above = lines.slice(Math.max(0, i - 6), i).join("\n");
      if (!/\.rev\s*=/.test(above)) out.push(`${m[1]} at line ${i + 1}`);
    }
    return out;
  }

  it("PLANT: a NEW unstamped aggregate is visible to the opened scanner", () => {
    expect(unstampedWrites("x\nawait redisSetJson(K_NEWTHING, blob);\n")).toHaveLength(1);
    expect(unstampedWrites("s.rev = REV;\nawait redisSetJson(K_NEWTHING, s);\n")).toHaveLength(0);
    expect(unstampedWrites("await redisSetJson(dayKey(d), blob);\n")).toHaveLength(0); // exempt
  });

  it("SOURCE SCAN: no persisted aggregate is written without a stamp", () => {
    expect(
      unstampedWrites(ROUTE),
      "persisted without a `rev` stamp within 6 lines above — a summary that cannot say " +
        "which code wrote it is unreadable once the code changes",
    ).toHaveLength(0);
  });
});
