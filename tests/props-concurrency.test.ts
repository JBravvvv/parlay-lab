import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { stripHashComments } from "./helpers/source";
import { describe, expect, it } from "vitest";

/**
 * PROPS-HISTORY CONCURRENCY GUARD (2026-07-29, owner's authorization — same
 * conditions as MIN_GAP: guard observed red first, vintage stamp, every cron entry
 * stays, queue rather than cancel).
 *
 * WHY: MIN_GAP reads the last paid timestamp from the COMMITTED day-file
 * (tools/snapshot_props.py L143–151). props-history.yml declared NO concurrency
 * group and its Commit step was a plain `git push` with no retry — so overlapping
 * runners all read stale state and ALL PAY, and a rejected second pusher's snapshot
 * is PAID AND LOST (strictly worse than the duplicate MIN_GAP replaced). The fix:
 * a workflow-level `concurrency:` group with `cancel-in-progress: false` (queue,
 * never cancel — every cron entry stays) plus a pull-rebase retry around the push.
 *
 * Enforced on BOTH copies: the local (frontend-rebuild) file and — when origin refs
 * exist — origin/main's copy, because SCHEDULES FIRE FROM THE DEFAULT BRANCH and
 * main's copy is the one that executes. Degrades to local-only with a printed
 * warning when origin is unreachable (the sha-references pattern).
 *
 * OBSERVED RED before the edits (both assertions), GREEN after, same commit set.
 */

const REQ_GROUP = /concurrency:\s*\n\s*group:\s*props-history\s*\n\s*cancel-in-progress:\s*false/;
const REQ_RETRY = /git pull --rebase origin line-history/;

function checks(src: string): string[] {
  const bad: string[] = [];
  if (!REQ_GROUP.test(src)) bad.push("no queue-mode concurrency group");
  if (!REQ_RETRY.test(src)) bad.push("no pull-rebase retry around the push");
  return bad;
}

describe("props-history: concurrency group + push retry", () => {
  it("the local (frontend-rebuild) copy carries both", () => {
    /* STRIP `#` COMMENTS (2026-08-01). MEASURED: this guard is HALF DEAD. With the push
       retry commented out — the exact failure the retry exists for, a concurrent push no
       longer retried — it passed 3/3, because REQ_RETRY is a plain substring test.
       REQ_GROUP survived the same treatment, and the reason is the lesson: it is a
       MULTI-LINE STRUCTURAL regex encoding YAML indentation, which a `#` prefix breaks.
       Structure beats containment; the filter is only needed where structure was not used. */
    expect(checks(stripHashComments(readFileSync(".github/workflows/props-history.yml", "utf8")))).toHaveLength(0);
  });

  /* PENDING-ENFORCEMENT (2026-07-29): the main-branch push is the owner's (this
     session cannot push to the default branch). Until his push lands, origin/main's
     copy is truthfully still the groupless one — so this half WARNS instead of
     failing. PRE-COMMITTED FLIP: the commit that records the fix's landing (the
     08:02Z window reading) deletes the warn path and makes this assertion enforcing
     — the same flip discipline as every it.fails guard. */
  it("origin/main's copy — the one schedules actually fire — carries both (or the fix is pending the owner's push)", () => {
    let src: string | null = null;
    try {
      src = execSync("git show origin/main:.github/workflows/props-history.yml", {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      console.warn("props-concurrency: origin/main unreadable — degraded to local-only");
    }
    if (src != null && checks(src).length > 0) {
      console.warn(
        "props-concurrency: origin/main copy is UNFIXED — the fix commit awaits the owner's " +
          "main push; this warn flips to an enforcing failure in the landing commit",
      );
    }
    expect(true).toBe(true);
  });

  it("PLANT (invalid-by-value): a groupless workflow is flagged", () => {
    const stripped = "name: x\non:\n  schedule:\n    - cron: '0 0 * * *'\n";
    expect(checks(stripped).length).toBe(2);
  });
});
