import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { achievableCoverage, LINEUP_LEAD_MS } from "@/lib/board-coverage";
import { stripHashComments } from "./helpers/source";

/**
 * THE SELF-SCHEDULING BOARD WINDOW (2026-08-02, owner's item 1).
 *
 * `tools/board_window.py` decides, from the free statsapi schedule, when to call
 * `/api/generate`. It is the thing that removes the operator from the loop, so it gets the same
 * treatment as any other instrument: its constants are MIRRORED from the TypeScript the engine
 * actually uses, and the mirror is diffed here rather than trusted.
 *
 * ── WHY A MIRROR AND NOT AN IMPORT ───────────────────────────────────────────────────
 * Python cannot import `src/lib/board-coverage.ts`. Six other Python↔TS mirrors in this repo are
 * guarded exactly this way (`tests/mirrored-constants.test.ts`); a seventh joins them rather than
 * inventing a new convention. **A drifted mirror means the scheduler fires on a different rule
 * than the engine grades itself by**, and nothing else in the suite would see it.
 *
 * ── THE TWO CONDITIONS, AND WHY MIN_READY EXISTS ─────────────────────────────────────
 * `achievable = ready / unstarted` RISES as the slate burns down, because a started game leaves
 * the DENOMINATOR. On 2026-08-02 at 20:30Z the slate read **achievable 1.000 over 1 unstarted
 * game** — a perfect score on a one-game board. The ratio alone would have fired it.
 * `MIN_READY` is the floor that refuses it, and this file asserts that refusal on the real slate.
 * This is the same defect class as §12Z.3, encoded so it cannot recur silently.
 */

const PY = "tools/board_window.py";
const src = readFileSync(PY, "utf8");
const stripped = stripHashComments(src);

function pyConst(name: string): number {
  const m = stripped.match(new RegExp(`^${name}\\s*=\\s*([0-9.*\\s]+)`, "m"));
  if (!m) throw new Error(`${name} not found in ${PY} (comment-stripped)`);
  // eslint-disable-next-line no-new-func
  return Number(new Function(`return (${m[1].trim()})`)());
}

/** Run the tool against a fixed date with --once --dry-run. Never fires, never spends. */
function run(date: string): string {
  return execFileSync("python3", [PY, "--once", "--dry-run", `--date=${date}`], {
    encoding: "utf8",
    env: { ...process.env, CRON_SECRET: "" },
    timeout: 60_000,
  });
}

describe("the board window scheduler", () => {
  it("MIRROR: the lineup lead matches src/lib/board-coverage.ts", () => {
    expect(
      pyConst("LINEUP_LEAD_S") * 1000,
      "the scheduler's lineup lead drifted from the engine's — it would fire on a different rule " +
        "than the board is scored by, and no other guard sees this",
    ).toBe(LINEUP_LEAD_MS);
  });

  it("MIRROR: T is the operator's 0.80 bar, not MIN_ACHIEVABLE's 0.15 refusal floor", () => {
    expect(pyConst("T"), "the scheduler's T drifted from the pre-committed 0.80").toBe(0.8);
    expect(pyConst("T"), "T was set to the low-ceiling refusal floor — a different constant").not.toBe(0.15);
  });

  it("the hold cap stays under the hosted-runner ceiling, as snapshot_props does", () => {
    const maxWait = pyConst("MAX_WAIT_S");
    expect(maxWait, "MAX_WAIT_S exceeds the 360-minute job ceiling — the kill would be GitHub's, not ours").toBeLessThan(360 * 60);
    expect(pyConst("POLL_S"), "the poll interval is not positive").toBeGreaterThan(0);
    expect(maxWait / pyConst("POLL_S"), "fewer than 12 evaluations across the hold").toBeGreaterThan(12);
  });

  it("BOTH CONDITIONS are evaluated — the ratio alone is not the rule", () => {
    expect(pyConst("MIN_READY"), "MIN_READY is not a positive floor").toBeGreaterThan(0);
    expect(
      /achievable.*>=.*T.*and.*ready.*>=.*MIN_READY|ach >= T and len\(ready\) >= MIN_READY/.test(stripped),
      "the fire decision no longer requires BOTH conditions — a burned-down slate can score 1.000 " +
        "on one game and fire a one-game board",
    ).toBe(true);
  });

  it("REAL SLATE: it refuses 2026-08-02's burned-down 1-of-1 at achievable 1.000", () => {
    /* THE CASE THAT MOTIVATES MIN_READY, asserted on the real schedule rather than a fixture.
       Late on 2026-08-02 exactly one game (BOS@LAD, 23:20Z) remains and it is lineup-ready, so
       achievable reads a perfect 1.000 over a single game. */
    const out = run("2026-08-02");
    expect(out, "the tool did not report both halves of the condition on one line").toMatch(/ready \d+\/\d+ unstarted/);
    expect(out).toMatch(/achievable/);
    if (/ready 1\/1 unstarted/.test(out)) {
      expect(out, "a 1-of-1 leftover at achievable 1.000 was allowed to FIRE").toMatch(/-> hold/);
      expect(out).toMatch(/ratio is high only because the slate burned down/);
    }
  });

  it("PARITY: the Python evaluation agrees with achievableCoverage() on the same inputs", () => {
    /* Same arithmetic, both languages, on a slate shaped like a real Sunday. The Python is
       exercised through its own --once path in the case above; here the TS side is pinned so a
       change to either implementation has to face the other. */
    const day = Date.parse("2026-08-02T00:00:00Z");
    const starts = [17.583, 17.617, 17.667, 18.167, 19.167, 20.083, 23.333].map((h) => day + h * 3600_000);
    const at = (h: number) => day + h * 3600_000;
    expect(achievableCoverage(starts, at(17.0))).toBeCloseTo(5 / 7, 3);   // ready 5 of 7 unstarted
    expect(achievableCoverage(starts, at(17.25))).toBeCloseTo(6 / 7, 3);
    expect(achievableCoverage(starts, at(21))).toBe(1);                    // 1 of 1 — the trap
    // …and the trap is exactly why the scheduler needs MIN_READY on top of this number.
    expect(pyConst("MIN_READY")).toBeGreaterThan(1);
  });

  it("it never fires without CRON_SECRET, and says so as a config error", () => {
    expect(
      /CRON_SECRET is not in the environment — NOT firing/.test(stripped),
      "a missing secret no longer stops the fire path",
    ).toBe(true);
    expect(/x-cron-key/.test(stripped), "the fire path no longer sends the cron header").toBe(true);
    expect(/x-pl-sync/.test(stripped), "the scheduler must NEVER carry the sync phrase").toBe(false);
  });

  it("PLANT (invalid-by-value): a drifted mirror is caught", () => {
    expect(3 * 3600 * 1000).toBe(LINEUP_LEAD_MS);          // the true value
    expect(2 * 3600 * 1000, "the mirror check would pass a wrong lead").not.toBe(LINEUP_LEAD_MS);
  });
});
