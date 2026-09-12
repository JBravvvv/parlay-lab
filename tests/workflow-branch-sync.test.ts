import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { readdirSync, readFileSync } from "node:fs";

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
// Reconciled with the firing branch on 2026-09-12: active cadence and pauses retained.
export const ALLOWED_DIVERGENCE: Record<string, Waiver> = {};

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
    const dir = path.join(REPO, ".github/workflows");
    const working = Object.fromEntries(readdirSync(dir).filter((n) => n.endsWith(".yml")).map((n) => [n, readFileSync(path.join(dir, n), "utf8")]));
    const drift = diffWorkflows(working, firing);
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
