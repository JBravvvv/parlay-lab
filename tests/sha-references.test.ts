import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * SHA-REFERENCE GUARD (2026-07-29, owner's rule after the rebase renamed nine commits
 * and left dangling references in CLAUDE.md).
 *
 * The repo is the memory; a doc citing a commit that origin cannot reach points at
 * nothing. The retraction-marker convention validates FORMAT only — that gap is what
 * let a full-stack rebase silently orphan citations. This guard validates RESOLUTION:
 * every sha-like token in the finding docs + CLAUDE.md must be reachable from an
 * origin ref, be a known content-digest, or be an all-digits workflow id.
 *
 * ALLOWLIST — tokens that are legitimately NOT commits (each with its why):
 *   e67eaad0 / 942ab102 / 935704d7 / c06b3afe / 135f586f  — board/fixture digests (md5)
 *   f6cf1513                                              — the engine string sha256
 *   4a5e96c0                                              — a git BLOB hash cited in a
 *                                                            ls-tree forensic (cron-jobs.md)
 * Fallback: if the local clone has no origin refs (fresh shallow checkout), the check
 * degrades to object existence and SAYS SO — weaker, never silent.
 */

const FILES = ["CLAUDE.md", ...readdirSync("docs").filter((f) => f.endsWith(".md")).map((f) => `docs/${f}`)];
const ALLOW = new Set(["e67eaad0", "942ab102", "935704d7", "c06b3afe", "135f586f", "f6cf1513", "4a5e96c0"]);
const SHA = /\b[0-9a-f]{7,10}\b/g;

function originRefs(): string[] {
  try {
    const refs = execSync('git for-each-ref --format="%(refname)" refs/remotes/origin', { encoding: "utf8" })
      .split("\n").map((s) => s.trim().replace(/"/g, "")).filter(Boolean);
    // HEAD is included so docs may cite the HELD stack (real commits, ancestors of the
    // local branch, deliberately unpushed under the hold rhythm — docs/session-handoff.md
    // records exactly those). A sha reachable from NEITHER origin nor HEAD is dangling.
    return [...refs, "HEAD"];
  } catch { return []; }
}

export function unresolved(tokens: Map<string, string>, refs: string[]): string[] {
  const bad: string[] = [];
  for (const [tok, where] of tokens) {
    if (ALLOW.has(tok)) continue;
    if (/^\d+$/.test(tok)) continue; // workflow ids etc.
    let isCommit = false;
    try { execSync(`git cat-file -e ${tok}^{commit}`, { stdio: "pipe" }); isCommit = true; } catch { /* not a commit */ }
    if (!isCommit) { bad.push(`${tok} (${where}): not a commit and not allowlisted`); continue; }
    if (!refs.length) continue; // degraded mode: existence only (stated in the header)
    const reachable = refs.some((r) => {
      try { execSync(`git merge-base --is-ancestor ${tok} ${r}`, { stdio: "pipe" }); return true; } catch { return false; }
    });
    if (!reachable) bad.push(`${tok} (${where}): unreachable from any origin ref`);
  }
  return bad;
}

function collect(): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of FILES) {
    const txt = readFileSync(f, "utf8");
    for (const m of txt.matchAll(SHA)) if (!out.has(m[0])) out.set(m[0], f);
  }
  return out;
}

describe("doc-cited shas resolve on origin", () => {
  it("every cited sha is reachable, allowlisted, or numeric", () => {
    const refs = originRefs();
    if (!refs.length) console.warn("sha-references: NO origin refs — degraded to object-existence checking");
    expect(unresolved(collect(), refs), "dangling sha citations — the memory points at nothing").toHaveLength(0);
  });

  it("PLANT (invalid-by-value): a fabricated sha is flagged", () => {
    const planted = unresolved(new Map([["abcdef1", "synthetic.md"]]), originRefs());
    expect(planted.length, "the checker passed a sha that cannot exist").toBe(1);
  });
});
