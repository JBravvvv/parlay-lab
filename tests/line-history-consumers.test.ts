import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * "NOTHING READS IT" AS AN INVARIANT (2026-07-31, owner's item 4).
 *
 * `line-history.yml` was disabled on the strength of a grep. A grep is a result; this is
 * the invariant that keeps it true. The job wrote `data/YYYY-MM-DD.json` on the
 * `line-history` branch (game-line h2h/totals/spreads across us+eu). Three independent
 * checks agreed nothing consumed it — `close_fair.py`, `close_capture.py` and
 * `phase2_series_b.py` all read `data/props/` (the PROPS job's output, same branch,
 * different workflow), a repo-wide grep found zero readers of the day-file, and
 * `docs/credit-budget.md` L192 states it outright.
 *
 * If a consumer ever appears, the disable becomes a data loss rather than a saving, and
 * this test says so BEFORE the series that needs it starts reading empty days.
 *
 * OBSERVED RED 2026-07-31 with a planted consumer string.
 */

/** Paths that would indicate a reader of the line-history DAY-FILE (not data/props). */
const DAYFILE_PATTERNS = [
  "data/2026-",          // a hardcoded day-file path
  "line-history:data/2", // a git-show of the day-file
  "lineHistoryDay",      // a named accessor, should one appear
];

/** The props path is the LEGITIMATE sibling — matches here must not count. */
const PROPS = "data/props";

function grepRepo(pattern: string): string[] {
  try {
    const out = execSync(
      `grep -rn "${pattern}" tools/ src/ app/ tests/ 2>/dev/null || true`,
      { encoding: "utf8" },
    );
    return out.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

describe("the line-history day-file has no consumers", () => {
  it("no tool, source file or test reads data/YYYY-MM-DD.json", () => {
    const hits = DAYFILE_PATTERNS.flatMap(grepRepo)
      .filter((l) => !l.includes(PROPS))
      .filter((l) => !l.includes("tests/line-history-consumers.test.ts"))
      // the writer itself is not a consumer
      .filter((l) => !l.includes("tools/snapshot_odds.py"));
    expect(
      hits,
      "A CONSUMER OF THE LINE-HISTORY DAY-FILE APPEARED. The job's schedule is DISABLED " +
        "(.github/workflows/line-history.yml, 2026-07-31) on the measured basis that nothing read it. " +
        "Either re-enable the schedule in the same commit as this consumer, or point the consumer at " +
        "data/props. Silently reading a file whose writer is off produces empty days, not an error.",
    ).toEqual([]);
  });

  it("the schedule is disabled but the workflow is NOT deleted (redundancy stays recoverable)", () => {
    const wf = readFileSync(".github/workflows/line-history.yml", "utf8");
    expect(wf.includes("workflow_dispatch"), "manual dispatch was removed — the job is unrecoverable without a rewrite").toBe(true);
    expect(/^\s*schedule:/m.test(wf), "an ACTIVE schedule block is back — either intended (update this guard) or accidental").toBe(false);
    expect(wf.includes("DISABLED 2026-07-31"), "the disable lost its dated reason").toBe(true);
  });

  it("PLANT: a planted consumer string is detected", () => {
    const planted = ['tools/fake.py:1:path = "data/2026-07-31.json"'];
    const filtered = planted.filter((l) => !l.includes(PROPS));
    expect(filtered.length, "the checker is blind to a planted consumer").toBeGreaterThan(0);
  });
});
