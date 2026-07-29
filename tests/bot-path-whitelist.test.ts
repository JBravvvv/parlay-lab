import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * M17 GUARD — the automated writer stays on its data paths (2026-07-29, owner's rule).
 *
 * `engine-v2-bot` holds `contents: write` on the production branch and has committed
 * through the whole freeze window (15 commits since 2026-07-24 at encoding time) — BY
 * DESIGN: the shadow log depends on its daily context/priors commits. What was missing
 * is ENFORCEMENT that its writes stay data-only: nothing prevented a workflow bug or a
 * compromised action from writing engine code onto the branch Vercel builds. The
 * whole-window census (exactly three data files) was evidence by inspection, not by
 * guard. This encodes it.
 *
 * Whitelist = the three paths the designed pipeline writes (context.yml + model.yml).
 * A NEW bot workflow that legitimately writes a new path must extend this list in the
 * same commit — that is the point.
 */

const WHITELIST = new Set([
  "data/ump_k.json",
  "public/model/context.json",
  "public/model/priors.json",
]);

export function violations(commits: { sha: string; files: string[] }[]): string[] {
  const out: string[] = [];
  for (const c of commits) {
    for (const f of c.files) {
      if (!WHITELIST.has(f)) out.push(`${c.sha}: ${f}`);
    }
  }
  return out;
}

function botCommits(): { sha: string; files: string[] }[] {
  const raw = execSync(
    'git log --author="engine-v2-bot" --since="2026-07-24" --format="@%h" --name-only HEAD',
    { encoding: "utf8" },
  );
  const out: { sha: string; files: string[] }[] = [];
  let cur: { sha: string; files: string[] } | null = null;
  for (const line of raw.split("\n")) {
    if (line.startsWith("@")) {
      if (cur) out.push(cur);
      cur = { sha: line.slice(1), files: [] };
    } else if (line.trim() && cur) cur.files.push(line.trim());
  }
  if (cur) out.push(cur);
  return out;
}

describe("M17: bot commits touch only whitelisted data paths", () => {
  it("every engine-v2-bot commit since freeze start is data-only", () => {
    const commits = botCommits();
    expect(commits.length, "no bot commits found — the extraction broke or the bot stopped (both findings)").toBeGreaterThan(0);
    expect(violations(commits), "a bot commit touched a non-whitelisted path — engine change riding a data pipeline").toHaveLength(0);
  });

  it("PLANT (invalid-by-value): the checker sees a bot commit touching engine code", () => {
    const planted = violations([{ sha: "deadbee", files: ["public/model/context.json", "legacy/index.html"] }]);
    expect(planted, "the checker missed a planted engine-file write").toEqual(["deadbee: legacy/index.html"]);
  });
});
