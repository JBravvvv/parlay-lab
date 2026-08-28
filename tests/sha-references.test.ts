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
 *   fd73ad6d / 4151ad25                                   — the same, re-cut at the 08-03 flip
 *   f6cf1513                                              — the engine string sha256
 *   4a5e96c0                                              — a git BLOB hash cited in a
 *                                                            ls-tree forensic (cron-jobs.md)
 * Fallback: if the local clone has no origin refs (fresh shallow checkout), the check
 * degrades to object existence and SAYS SO — weaker, never silent.
 */

const FILES = ["CLAUDE.md", ...readdirSync("docs").filter((f) => f.endsWith(".md")).map((f) => `docs/${f}`)];
/* 2026-08-01: `3fdd34b` is deliberately unresolvable HERE. It arrived in a relay brief written
   for a DIFFERENT repository, and §12Y prints the failed `git cat-file` as the diagnostic's
   OUTPUT — the point of quoting it is that it does not resolve. Allowlisted with that reason
   rather than mangled out of the prose, so the exception is explicit and this guard keeps its
   teeth on every other citation. */
const ALLOW = new Set(["e67eaad0", "942ab102", "935704d7", "c06b3afe", "135f586f", "f6cf1513", "4a5e96c0", "3fdd34b",
  /* 2026-08-03 singles flip: the re-cut board digests. The superseded pair stays allowlisted
     above because the tests quote both old and new — a retired digest is still a citation. */
  "fd73ad6d", "4151ad25",
  /* 2026-08-15: `82262cf` is a PRE-REBASE sha this guard itself caught dangling — the parlay
     mode-alignment addendum cited it before the ship was rebased onto bot commits and landed
     as a6d1ad0. The handoff keeps the bad sha inside its dated correction note (the catch is
     part of the record), so the literal must stay quotable without resolving. */
  "82262cf", "16c635b", /* 16c635b: the core/fun split's pre-rebase sha, kept in the dated correction note */
  /* 2026-08-16: ENGINE-STRING sha256 prefixes from the side-aware calibration ship
     (39fc8681… → cb2cdebc…) — same class as f6cf1513 above: hashes of the engine
     source, not commits. */
  "39fc8681", "cb2cdebc",
  /* 2026-08-27: env->closed-form engine ship string sha */ "bb6be52d"]);
const SHA = /\b[0-9a-f]{7,10}\b/g;

/**
 * NARROWED 2026-07-31 (M27, owner's word). `ea7445a` widened this to `[...refs, "HEAD"]` so docs
 * could cite the HELD stack — real commits, ancestors of the local branch, deliberately unpushed
 * under the hold rhythm. That widening rode inside a commit titled "Session handoff before
 * compaction" and was never reviewed as a guard change; its original survived as an UNTRACKED
 * orphan (`tests/sha-references.test 2.ts`) that vitest's glob does not run.
 *
 * THE HOLE IT OPENED: a doc could cite a sha that exists only on a local commit. A later reset or
 * rebase dangles the citation and this guard has ALREADY PASSED.
 *
 * THE NARROWING: HEAD counts only for shas the handoff RECORDS as held. `heldStack()` reads the
 * git-state section of docs/session-handoff.md for shas the doc itself calls held/unpushed; if it
 * names none — the normal state, and the state today — HEAD is NOT consulted and this is the
 * strict guard the orphan preserved. The hold rhythm keeps working; the hole does not.
 */
function heldStack(): Set<string> {
  try {
    const doc = readFileSync("docs/session-handoff.md", "utf8");
    const held = new Set<string>();
    for (const line of doc.split("\n")) {
      if (!/\bheld\b|\bunpushed\b|HELD STACK/i.test(line)) continue;
      if (/nothing held/i.test(line)) continue;
      for (const m of line.matchAll(/\b[0-9a-f]{7,40}\b/g)) held.add(m[0].slice(0, 10));
    }
    return held;
  } catch { return new Set(); }
}

function originRefs(): string[] {
  try {
    const refs = execSync('git for-each-ref --format="%(refname)" refs/remotes/origin', { encoding: "utf8" })
      .split("\n").map((s) => s.trim().replace(/"/g, "")).filter(Boolean);
    // HEAD only when the handoff actually records a held stack (M27). Empty => strict.
    return heldStack().size ? [...refs, "HEAD"] : refs;
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
