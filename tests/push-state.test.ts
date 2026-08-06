import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

/**
 * PUSH-STATE GUARD (2026-08-06, operator: "why is anything holding" — answer it from the
 * suite). An unpushed commit fails the gate.
 *
 * THE RHYTHM THIS ENCODES: edit -> gate (HEAD == origin, tree dirty with the new work) ->
 * commit -> push. At gate time HEAD must already BE on origin; the only commit allowed to
 * be ahead is the one that does not exist yet. A commit sitting ahead of the remote when
 * the gate runs is exactly the state "holding" must never mean — work the operator cannot
 * see. (Session resting state is not this; unpushed WORK is this.)
 *
 * OBSERVED RED on its own ship: this file's own commit, gated after commit and before
 * push, is the red case — recorded in the ship note. Green again the moment it is pushed.
 *
 * SKIP-WITH-DECLARATION when no origin ref exists (fresh clone mid-fetch, CI without
 * remotes): a guard that cannot read its instrument says so rather than passing silently.
 */

const git = (cmd: string) => execSync(`git ${cmd}`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

describe("push state — an unpushed commit fails the suite", () => {
  it("HEAD is contained in origin/<branch> (resolution is not currency; containment is the push test)", () => {
    let originRef: string;
    const branch = git("branch --show-current") || "frontend-rebuild";
    try {
      originRef = git(`rev-parse --verify origin/${branch}`);
    } catch {
      // eslint-disable-next-line no-console
      console.warn(`[push-state] DECLARED SKIP: origin/${branch} not readable here — the guard cannot see its instrument`);
      return;
    }
    const head = git("rev-parse HEAD");
    let contained = true;
    try {
      execSync(`git merge-base --is-ancestor ${head} ${originRef}`, { stdio: "ignore" });
    } catch {
      contained = false;
    }
    if (!contained) {
      const ahead = git(`rev-list --count origin/${branch}..HEAD`);
      throw new Error(
        `UNPUSHED STATE: HEAD ${head.slice(0, 12)}… is ${ahead} commit(s) ahead of origin/${branch} ` +
          `(${originRef.slice(0, 12)}…). Push before resting — "holding" is a session state, never unpushed work.`,
      );
    }
    expect(contained).toBe(true);
  });
});
