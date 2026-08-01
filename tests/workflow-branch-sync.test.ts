import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * SCHEDULED BEHAVIOUR FIRES FROM `main`. WE SHIP TO `frontend-rebuild`. ENFORCED, NOT REMEMBERED.
 *
 * 2026-07-31, owner's items 1 and 4. GitHub Actions runs a scheduled workflow only from the
 * DEFAULT branch's copy (`git symbolic-ref refs/remotes/origin/HEAD` -> `refs/remotes/origin/
 * main`; corroborated by every run reporting `headBranch: main`). Every operational change this
 * window was committed to `frontend-rebuild`, which is 326 commits AHEAD of main and fires
 * nothing. main has been updated BY HAND nine times since 2026-07-11 with no sync mechanism.
 *
 * WHAT THAT COST, from the Actions run log: the line-history disable ("effective now") never
 * reached the firing copy and the job kept delivering; props-history's 2026-07-27 redesign never
 * reached it either, so production runs the TEN-cron file and invokes `snapshot_props.py` WITH NO
 * ARGUMENTS — `--wait` has never executed and `--fold-only` has never folded a Vercel capture.
 *
 * WHAT IS NOT AFFECTED: every workflow on main pulls its SCRIPT from `origin/frontend-rebuild` at
 * run time and `tools/` does not exist on main at all, so SCRIPT-level changes are live on push
 * (MIN_GAP proved it: 10 runs -> 5 paid on 07-30). Only YML-level things can be stale —
 * schedules, concurrency, checkout targets, STEP ARGUMENTS, timeouts. That is what this compares.
 *
 * THE ALLOW-LIST EXPIRES (owner's item 4). A permanently red suite hides the next real red; a
 * permanent exemption hides the divergence. So every entry is dated, names the divergence, names
 * the decision it waits on, and DIES: past MAX_AGE_DAYS the entry itself fails the build. An
 * unresolved divergence becomes a build failure rather than a standing waiver. Entries that no
 * longer diverge also fail — a stale exemption is a lie about the state of the world.
 */

const REPO = path.join(__dirname, "..");
const FIRING_REF = "origin/main";

/** 14 days: long enough for a decision that needs a board or a quiet day, short enough that no
 *  divergence survives a full collection week unexamined. Stated, not derived. */
export const MAX_AGE_DAYS = 14;

const git = (args: string[]) => execFileSync("git", args, { cwd: REPO, encoding: "utf8" });

/** filename -> content for every workflow on a ref. */
export function workflowsOnRef(ref: string): Record<string, string> {
  const names = git(["ls-tree", "--name-only", ref, ".github/workflows/"])
    .split("\n")
    .filter((n) => n.endsWith(".yml"));
  return Object.fromEntries(names.map((n) => [path.basename(n), git(["show", `${ref}:${n}`])]));
}

export type Waiver = { since: string; divergence: string; awaiting: string };

/**
 * INTENTIONAL-FOR-NOW divergence. Not a permission — a countdown. Empty is the healthy state.
 * Populated 2026-07-31 with the seven the audit found; each carries the decision that ends it.
 */
export const ALLOWED_DIVERGENCE: Record<string, Waiver> = {
  "props-history.yml": {
    since: "2026-07-31",
    divergence:
      "TWO divergences now. (1) main runs the 2026-07-26 base file with no step arguments; " +
      "frontend-rebuild carries the 07-27 redesign (--wait, --fold-only, timeout-minutes 330), " +
      "which has NEVER executed anywhere: 0 of 66 props-history runs were workflow_dispatch. " +
      "(2) main's schedule was CUT ten -> four on 2026-07-31 (7bfb6b3), keeping 0 17 / 0 20 / " +
      "0 21 / 30 22 — the two close-producing bands plus one same-day pre and one queued opener " +
      "— while frontend-rebuild still declares the redesign's own four (0 17 --wait, 0 13, " +
      "0 23, 0 3 --fold-only). The two branches now disagree on the cron SET as well as on args. " +
      "(3) ADDED 2026-08-01, owner signed off from the diff: main gains a TARGETED PAIR — " +
      "`10 18` (-> ~21:1x) and `55 18` (-> ~21:5x), both passing `--window 120` — to populate the " +
      "60-120-minutes-to-first-pitch bucket, which is STRUCTURALLY EMPTY in the archive because a " +
      "price path needs TWO captures inside the window and the cadence delivers one " +
      "(docs/auto-lock-memo.md §M1, §M12). frontend-rebuild carries the `--window` FLAG (default " +
      "off, so the four existing crons are byte-identical) but NOT the two cron entries, because " +
      "scheduled behaviour lives on the firing copy. main is now at SIX crons, frontend-rebuild " +
      "at four.",
    awaiting:
      "owner's choice on the redesign — either a manual workflow_dispatch run on an affordable " +
      "day and then ship it (superseding the cut), or fold the cut's chosen four back onto " +
      "frontend-rebuild so the two agree. Priced in docs/branch-firing-audit.md PART THREE §8. " +
      "AND SEPARATELY for divergence (3): the pre-committed landing test — first day the pair " +
      "runs, `node tools/price-path.mjs <props-dir>` must print n > 0 in the 60-120 bucket. Zero " +
      "means the SPACING is wrong, not that prices do not move; ONE cron delivering is a PARTIAL " +
      "landing that produces no pair and therefore no observation, and reads as a failure. " +
      "NOTE: `since` deliberately NOT bumped to 2026-08-01 — divergences (1) and (2) are still " +
      "open and their countdown must not be extended by a new one.",
  },
  "line-history.yml": {
    since: "2026-07-31",
    divergence:
      "schedule now disabled on BOTH copies (3356c54 cherry-picked it to main); frontend-rebuild " +
      "additionally carries the TIMING: INSENSITIVE classification block.",
    awaiting:
      "the comment reconciliation that also corrects '~7.5 runs/day x 6 = ~45/day' to the " +
      "measured 3-4 runs/day (~22/day) on both copies in one pass — owner's item 5.",
  },
  "context.yml": {
    since: "2026-07-31",
    divergence:
      "main carries the 07-29 pause (git add data/ump_k.json only) and TWO crons; frontend-rebuild " +
      "carries the unpaused git add (context.json + pen_quality.json) and a THIRD cron, `0 12`, " +
      "aimed at weekend umpire resolution before first pitch. The weekend cron has never fired.",
    awaiting:
      "owner's decision on whether the `0 12` weekend cron ships to the firing copy (it costs 0 " +
      "Odds credits) and how the pause is represented on the ship branch so the two can agree.",
  },
  "model.yml": {
    since: "2026-07-31",
    divergence:
      "the M18 data-vintage pause (schedule commented out) exists ONLY on main. frontend-rebuild's " +
      "copy still reads `30 9 * * *` — inert, but it is what a reader sees, and it is what misled " +
      "this doc's own §5/§6 on 2026-07-31.",
    awaiting: "owner's word to mirror the pause onto frontend-rebuild so the file cannot mislead again.",
  },
  "board-archive.yml": {
    since: "2026-07-31",
    divergence: "TIMING: SENSITIVE classification comment on frontend-rebuild only. No behavioural difference.",
    awaiting: "the comment reconciliation sweep (same pass as line-history.yml).",
  },
  "hr-overround.yml": {
    since: "2026-07-31",
    divergence: "TIMING: INSENSITIVE classification comment on frontend-rebuild only. No behavioural difference.",
    awaiting: "the comment reconciliation sweep (same pass as line-history.yml).",
  },
  "ufc.yml": {
    since: "2026-07-31",
    divergence:
      "the whole workflow is absent from main, so its two declared crons (`0 15 * * 3`, `0 15 * * 6`) " +
      "HAVE NEVER FIRED. It reaches no Odds API itself; the spend on that feature is client-side " +
      "(src/lib/ufc.ts L84-86, with a fresh=1 path that bypasses the cache).",
    awaiting:
      "owner's decision on whether it should be scheduled at all, or deleted so the inventory stops " +
      "listing a job that cannot run.",
  },
};

export type Divergence = {
  file: string;
  kind: "differs" | "missing-on-firing" | "missing-on-ship" | "waiver-expired" | "waiver-stale";
  detail?: string;
};

const daysBetween = (fromIso: string, now: Date) =>
  (now.getTime() - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000;

/** Pure. Reports live divergence AND waivers that have expired or gone stale. */
export function diffWorkflows(
  ship: Record<string, string>,
  firing: Record<string, string>,
  allow: Record<string, Waiver> = ALLOWED_DIVERGENCE,
  now: Date = new Date(),
  maxAgeDays: number = MAX_AGE_DAYS,
): Divergence[] {
  const out: Divergence[] = [];
  const diverging = new Set<string>();
  for (const f of new Set([...Object.keys(ship), ...Object.keys(firing)])) {
    const kind = !(f in firing)
      ? "missing-on-firing"
      : !(f in ship)
        ? "missing-on-ship"
        : ship[f] !== firing[f]
          ? "differs"
          : null;
    if (!kind) continue;
    diverging.add(f);
    if (f in allow) {
      const age = daysBetween(allow[f].since, now);
      if (age > maxAgeDays) {
        out.push({
          file: f,
          kind: "waiver-expired",
          detail: `waived ${allow[f].since} (${Math.floor(age)}d ago, limit ${maxAgeDays}d) — still awaiting: ${allow[f].awaiting}`,
        });
      }
      continue;
    }
    out.push({ file: f, kind: kind as Divergence["kind"] });
  }
  /* a waiver for something that no longer diverges is a lie about the state of the world */
  for (const f of Object.keys(allow)) {
    if (!diverging.has(f)) out.push({ file: f, kind: "waiver-stale", detail: `${f} no longer diverges — remove its waiver` });
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

describe("the comparator itself (every branch, on synthetics)", () => {
  const A = { "a.yml": "x", "b.yml": "y" };
  const NOW = new Date("2026-07-31T06:00:00Z");
  const W = (since: string): Waiver => ({ since, divergence: "d", awaiting: "a" });

  it("identical trees are clean", () => {
    expect(diffWorkflows(A, { ...A }, {}, NOW)).toEqual([]);
  });

  it("a content difference is reported, and a FRESH waiver suppresses exactly it", () => {
    const B = { "a.yml": "x", "b.yml": "CHANGED" };
    expect(diffWorkflows(A, B, {}, NOW)).toEqual([{ file: "b.yml", kind: "differs" }]);
    expect(diffWorkflows(A, B, { "b.yml": W("2026-07-25") }, NOW)).toEqual([]);
  });

  it("AN EXPIRED WAIVER FAILS — the exemption dies, the divergence does not become permanent", () => {
    const B = { "a.yml": "x", "b.yml": "CHANGED" };
    const r = diffWorkflows(A, B, { "b.yml": W("2026-07-01") }, NOW); // 30d > 14d
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe("waiver-expired");
    expect(r[0].detail).toContain("limit 14d");
    /* and it is the AGE that fails it, not the difference: one day inside the limit is green */
    expect(diffWorkflows(A, B, { "b.yml": W("2026-07-18") }, NOW)).toEqual([]); // 13d
  });

  it("a waiver for something that no longer diverges is reported as stale", () => {
    expect(diffWorkflows(A, { ...A }, { "b.yml": W("2026-07-30") }, NOW)).toEqual([
      { file: "b.yml", kind: "waiver-stale", detail: "b.yml no longer diverges — remove its waiver" },
    ]);
  });

  it("a file present on only one side is reported with the side named", () => {
    expect(diffWorkflows(A, { "a.yml": "x" }, {}, NOW)).toEqual([{ file: "b.yml", kind: "missing-on-firing" }]);
    expect(diffWorkflows({ "a.yml": "x" }, A, {}, NOW)).toEqual([{ file: "b.yml", kind: "missing-on-ship" }]);
  });
});

describe("every waiver is a countdown, not a permission", () => {
  it("each entry names a divergence and the decision that ends it", () => {
    for (const [f, w] of Object.entries(ALLOWED_DIVERGENCE)) {
      expect(w.since, `${f} needs an ISO date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(w.divergence.length, `${f} needs a real description`).toBeGreaterThan(40);
      expect(w.awaiting.length, `${f} must name the decision it waits on`).toBeGreaterThan(20);
    }
  });
});

describe("every workflow we ship is the workflow that fires", () => {
  it(`working tree === ${FIRING_REF}, or waived with a live, dated reason`, () => {
    let firing: Record<string, string>;
    try {
      firing = workflowsOnRef(FIRING_REF);
    } catch (e) {
      throw new Error(
        `cannot read ${FIRING_REF} — run \`git fetch origin main\`. This test compares the copies ` +
          `that FIRE against the copies we edit; without the ref it cannot make that comparison ` +
          `and must not pass by default. (${e})`,
      );
    }
    const drift = diffWorkflows(workflowsOnRef("HEAD"), firing);
    expect(
      drift,
      `\n\nWORKFLOW DRIFT AGAINST THE COPIES THAT FIRE (${FIRING_REF}).\n` +
        drift.map((d) => `  ${d.file}: ${d.kind}${d.detail ? ` — ${d.detail}` : ""}`).join("\n") +
        `\n\nSchedules fire ONLY from the default branch. A change on frontend-rebuild alone ` +
        `changes nothing in production. Cherry-pick it to main (never merge — main is 326 commits ` +
        `behind and a merge is an unreviewed deploy of the whole window), or add a dated waiver ` +
        `naming the decision it waits on. Waivers expire after ${MAX_AGE_DAYS} days.\n`,
    ).toEqual([]);
  });
});
