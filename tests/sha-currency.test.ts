import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * SHA-CURRENCY GUARD (2026-08-02, owner's item 2).
 *
 * ── THE GAP THIS CLOSES, MEASURED ────────────────────────────────────────────────────
 * `sha-references` asserts that a cited sha **RESOLVES** (`git cat-file -e <tok>^{commit}`,
 * L76) — NOT that it is CURRENT. `50d0f7a` sat in this file's own state header for 29
 * commits, resolving perfectly the whole time, and the only instrument that reads shas
 * never looked at it. **Resolution is not currency** — standing rule 8.
 *
 * ── WHY A MARKER AND NOT "EVERY SHA" ─────────────────────────────────────────────────
 * Most shas in the docs are HISTORY and must stay stale: `03c4ae4` anchors the fire block,
 * `8aaad6d` records what ran, and the STRUCK `50d0f7a` is preserved deliberately. A guard
 * over every sha would demand the memory forget. So currency is asserted only where the doc
 * CLAIMS current state, and the claim is opt-in: the line says `STATE-CLAIM`.
 * **Historical citations are exempt by not carrying the marker — that is the whole design.**
 *
 * ── LINE-SCOPED, NOT BLOCK-SCOPED. A MEASURED DESIGN CONSTRAINT. ─────────────────────
 * The first draft scoped the marker to its markdown block (marker line → next blank line).
 * That is WRONG HERE and the file proves it: at the top of `session-handoff.md` the struck
 * `~~...50d0f7a...~~` original and the live correction sit in ONE blockquote with no blank
 * line between them, so block-scoping would sweep the deliberately-preserved stale sha into
 * the claim and go red on the record it exists to protect. **The marker and the sha must be
 * on the SAME LINE.** State claims are therefore written one per line.
 *
 * ── K, AND WHY IT IS NOT 3 ───────────────────────────────────────────────────────────
 * A state line records HEAD *at the moment of writing*; the commit that carries it then makes
 * the claim exactly 1 behind. That offset is structural, not staleness — the sha of a commit
 * cannot be written into the commit. So K must absorb it, plus whatever moves HEAD without
 * anyone making a claim. MEASURED 2026-08-02 on `origin/frontend-rebuild`:
 *   · `engine-v2-bot` lands **up to 3 commits/day** (3/day 07-25→07-29, 1/day since 07-30) —
 *     these advance HEAD after a pull while every doc claim stays truthful.
 *   · the handoff is touched by **every** recent session commit — the last 8 handoff-touching
 *     commits are consecutive (distances 0,1,2,…,7 from HEAD), so a claim is refreshed each
 *     time and the self-inflicted gap never exceeds 1.
 * **K = 10** therefore tolerates a full day of bot drift plus a pull, and still catches the
 * real failure (29) with ~3× margin. K=3, the value first proposed, would FALSE-RED on any
 * 3-bot-commit day after a fetch — a guard that cries wolf every morning gets disabled.
 *
 * ── ANCESTRY IS NOT ASSUMED ──────────────────────────────────────────────────────────
 * MEASURED: `b1f17d2` (`origin/main`) is **NOT** an ancestor of `origin/frontend-rebuild` —
 * the branches diverged. A HEAD-only distance would report a cited `main` sha as unreachable
 * and fail on a correct claim. Distance is therefore the MINIMUM over every ref the sha is an
 * ancestor of, so a `main` claim is scored against `main`.
 */

/** Absorbs the structural 1-commit offset + a day of bot drift. Derived above, not chosen. */
const K = 10;

const DOC = "docs/session-handoff.md";
const MARKER = "STATE-CLAIM";
const SHA = /\b[0-9a-f]{7,40}\b/g;

function refs(): string[] {
  const out = ["HEAD"];
  try {
    out.push(
      ...execSync('git for-each-ref --format="%(refname)" refs/remotes/origin', { encoding: "utf8" })
        .split("\n").map((s) => s.trim().replace(/"/g, "")).filter(Boolean),
    );
  } catch { /* no origin refs — HEAD alone, and the vacuity assertion below still holds */ }
  return out;
}

/**
 * A claim line OPENS with the marker, once list/quote/emphasis punctuation is stripped.
 *
 * POSITION IS LOAD-BEARING, AND THE GUARD PROVED IT ON ITS FIRST RUN. The first version asked
 * only whether the marker appeared ANYWHERE on the line, and immediately went red on
 * `> 1. **Step 2 names `50d0f7a`.** Current origin is the **STATE-CLAIM** pair at the top…` —
 * a sentence ABOUT the convention, carrying a deliberately-historical sha, promoted to a live
 * claim by the act of naming the marker. **A marker that prose cannot mention without tripping
 * is a marker no one can document.** Requiring it in the opening position separates the claim
 * from talk about claims, and costs nothing: a real claim is written as its own line.
 */
export function isClaimLine(ln: string): boolean {
  return /^[>\s]*(?:[-*+]|\d+\.)?\s*(?:\*\*|__|`)?\s*STATE-CLAIM\b/.test(ln);
}

/** Lines that CLAIM current state, with the shas that sit on them. Line-scoped by design. */
export function stateClaims(text: string): { line: number; sha: string; text: string }[] {
  const out: { line: number; sha: string; text: string }[] = [];
  text.split("\n").forEach((ln, i) => {
    if (!isClaimLine(ln)) return;
    for (const m of ln.matchAll(SHA)) out.push({ line: i + 1, sha: m[0], text: ln.trim().slice(0, 100) });
  });
  return out;
}

/** Smallest number of commits between `sha` and the tip of any ref it is an ancestor of. */
export function distanceToNearestTip(sha: string, rs: string[]): number | null {
  let best: number | null = null;
  for (const r of rs) {
    try {
      execSync(`git merge-base --is-ancestor ${sha} ${r}`, { stdio: "pipe" });
    } catch { continue; }
    const n = Number(execSync(`git rev-list --count ${sha}..${r}`, { encoding: "utf8" }).trim());
    if (Number.isFinite(n) && (best === null || n < best)) best = n;
  }
  return best;
}

describe("state-claim shas are CURRENT, not merely resolvable", () => {
  const text = readFileSync(DOC, "utf8");
  const claims = stateClaims(text);

  it("the marker convention is not vacuous — it still matches real lines", () => {
    /* RULE 3, APPLIED TO THIS GUARD'S OWN FILTER. If the marker is renamed, reformatted, or
       edited out of the doc, `claims` goes empty and every assertion below passes over nothing.
       Nothing else in the suite would notice. This is the assertion that fires on that. */
    expect(
      claims.length,
      `no ${MARKER} lines carry a sha in ${DOC}. The convention has gone inert and the currency ` +
        `check is now vacuous — every state header is unguarded again.`,
    ).toBeGreaterThanOrEqual(2);
  });

  it(`every ${MARKER} sha is within K=${K} commits of a ref tip`, () => {
    const rs = refs();
    const stale: string[] = [];
    for (const c of claims) {
      const d = distanceToNearestTip(c.sha, rs);
      if (d === null) { stale.push(`L${c.line}: ${c.sha} is an ancestor of NO ref — ${c.text}`); continue; }
      if (d > K) stale.push(`L${c.line}: ${c.sha} is ${d} commits behind (K=${K}) — ${c.text}`);
    }
    expect(
      stale,
      `STALE STATE CLAIM — the doc asserts current repo state with a superseded sha:\n  ${stale.join("\n  ")}\n` +
        `These shas RESOLVE, so sha-references passes them. Update the claim or drop the ${MARKER} ` +
        `marker if the line is meant as history.`,
    ).toEqual([]);
  });

  it("historical shas are exempt — the struck header sha is NOT treated as a claim", () => {
    /* The struck `50d0f7a` at the top of the doc is preserved deliberately and is 29 commits
       back. If it ever gets scored, the convention has started demanding the memory forget. */
    expect(claims.some((c) => c.sha.startsWith("50d0f7a")), "the STRUCK original is being scored as a live claim").toBe(false);
    expect(text).toContain("50d0f7a"); // and it is still on disk, not quietly deleted
  });

  it("PLANT (invalid-by-value): a sha 29 commits back is flagged on a marked line", () => {
    const planted = stateClaims(`> **${MARKER} 2026-08-02:** origin is \`50d0f7a\``);
    expect(planted.length, "the extractor missed a sha on a marked line").toBe(1);
    const d = distanceToNearestTip(planted[0].sha, refs());
    expect(d, "50d0f7a should be reachable").not.toBeNull();
    expect(d as number, `the currency check would pass a sha ${d} commits behind`).toBeGreaterThan(K);
  });

  it("PLANT (invalid-by-value): an UNMARKED line carrying a stale sha is invisible, by design", () => {
    expect(stateClaims("origin was `50d0f7a` at the time").length).toBe(0);
  });

  it("PLANT (regression): prose that MENTIONS the marker is not a claim — the first-run failure", () => {
    /* OBSERVED RED 2026-08-02: with `includes(MARKER)`, this exact line failed the suite. */
    const prose = "> 1. **Step 2 names `50d0f7a`.** Current origin is the **STATE-CLAIM** pair at the top of this file";
    expect(stateClaims(prose).length, "a sentence about the convention is being scored as a claim").toBe(0);
    // …while a genuine claim in every punctuation shape this doc uses IS scored
    for (const real of [
      "- **STATE-CLAIM 2026-08-02:** `origin/main` = `b1f17d2ef6bff3a8c62e9de5a6c6165eb4bf6221`",
      "> - **STATE-CLAIM 2026-08-02:** `origin/main` = `b1f17d2ef6bff3a8c62e9de5a6c6165eb4bf6221`",
      "STATE-CLAIM: `b1f17d2ef6bff3a8c62e9de5a6c6165eb4bf6221`",
    ]) expect(stateClaims(real).length, `a real claim was not scored: ${real}`).toBe(1);
  });
});
