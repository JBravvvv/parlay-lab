import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * EVERY RETRACTION CARRIES A DATE — the convention that keeps the retraction ledger findable.
 *
 * 2026-07-27: fifteen retractions were located in two greps ONLY because the marker format was
 * consistent — and that consistency was a habit protected by nothing. This encodes it, per the
 * project's own closure standard (a finding is closed only when it names its test or its
 * measured number; `docs/harness-substitutions.md`, top).
 *
 * Scope was NARROWED after measuring: the naive scan (any retraction-ish language, all docs)
 * flagged 60 paragraphs of which ~half were false positives — future-tense ("expected to be
 * superseded"), pre-committed branch tables describing hypothetical retractions, and prose like
 * "does NOT hold still". The enforced rule is the measured-clean one: in the five
 * finding-carrying docs, a paragraph bearing a STRONG marker (the caps vocabulary the
 * convention actually uses, or the "an earlier version claimed" phrases) must carry a
 * YYYY-MM-DD date in the paragraph, its nearest heading, or the three lines above it.
 * On encoding day the narrowed scan found 25 marked paragraphs, 12 undated; all 12 were
 * genuine and were dated from `git log -S` (when the paragraph was introduced).
 */

const FILES = [
  "docs/collection-period.md",
  "docs/freeze-exit-bundle.md",
  "docs/harness-substitutions.md",
  "docs/hrr-recalibration.md",
  "docs/pitcher-outs-audit.md",
];
const STRONG =
  /\b(RETRACTED|WITHDRAWN|REFUTED|SUPERSEDED|CORRECTION)\b|An earlier version|The first version of this section|I WAS WRONG|Retracted, same day/;
const DATE = /\b20\d{2}-\d{2}-\d{2}\b/;

function undatedRetractions(text: string): { line: number; excerpt: string }[] {
  const lines = text.split("\n");
  const out: { line: number; excerpt: string }[] = [];
  let heading = "";
  let fence = false;
  let para: string[] = [];
  let start = 0;
  let hd = "";
  const flush = () => {
    if (!para.length) return;
    const block = para.join("\n");
    if (STRONG.test(block)) {
      const ctx = lines.slice(Math.max(0, start - 3), start).join("\n");
      if (!DATE.test(block) && !DATE.test(hd) && !DATE.test(ctx)) {
        out.push({ line: start + 1, excerpt: block.replace(/\n/g, " ").slice(0, 90) });
      }
    }
    para = [];
  };
  lines.forEach((ln, i) => {
    if (ln.trim().startsWith("```")) {
      fence = !fence;
      return;
    }
    if (fence) return;
    if (ln.trimStart().startsWith("#")) heading = ln;
    if (ln.trim() === "") flush();
    else {
      if (!para.length) {
        start = i;
        hd = heading;
      }
      para.push(ln);
    }
  });
  flush();
  return out;
}

describe("retraction markers — every retraction carries a date", () => {
  /* The guard is tested before it is trusted (the break-it-on-purpose rule): it must FIRE on a
     fabricated undated retraction and STAY QUIET on the dated and hypothetical forms. */
  it("the scanner itself fires on an undated retraction and passes dated ones", () => {
    expect(undatedRetractions("## A finding\n\nThis was **RETRACTED** because reasons.\n")).toHaveLength(1);
    expect(undatedRetractions("## A finding (2026-07-01)\n\nThis was **RETRACTED** because reasons.\n")).toHaveLength(0);
    expect(undatedRetractions("## A finding\n\nRETRACTED 2026-07-01 — reasons.\n")).toHaveLength(0);
    // future-tense / lowercase hypotheticals stay out of scope by construction
    expect(undatedRetractions("## Branches\n\nIf Phase 2 shows nothing, the finding is retracted.\n")).toHaveLength(0);
    // code fences never flag
    expect(undatedRetractions("```\nRETRACTED\n```\n")).toHaveLength(0);
  });

  for (const f of FILES) {
    it(`${f} has no undated retraction`, () => {
      const misses = undatedRetractions(readFileSync(f, "utf8"));
      expect(
        misses,
        misses.map((m) => `${f}:${m.line} ${m.excerpt}`).join("\n") +
          "\n→ add a YYYY-MM-DD to the paragraph or its heading (git log -S gives the true date).",
      ).toHaveLength(0);
    });
  }
});
