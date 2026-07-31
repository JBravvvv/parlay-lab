import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * THE READ-FIRST LIST MUST NAME EVERY DOC (2026-07-31, owner's item 3).
 *
 * WHAT THIS COST, measured: three turns of ration tables, a four-cadence sweep and a
 * "70% of the burn" claim were produced while `docs/credit-budget.md` — which had
 * already measured line-history at ~25/day, recorded that it feeds "nothing live", and
 * listed "Stop line-history.yml" as line 1 of a proposed budget — sat unread and unnamed
 * by the handoff. The handoff's read-first list was a PARTIAL index presented as
 * complete: 11 of 17 docs were absent from it.
 *
 * That is this project's own defect shape (a component reporting success while covering
 * a fraction of its domain) applied to its memory. The fix is not "remember to read more"
 * — it is this invariant.
 *
 * OBSERVED RED 2026-07-31 by removing a doc from the list.
 */

const HANDOFF = "docs/session-handoff.md";
/** Docs that are not inputs to a session: the handoff itself, and dated point-in-time records. */
const EXEMPT = new Set(["session-handoff.md"]);

describe("read-first index covers every doc", () => {
  it("every file in docs/ is named in the handoff's read-first list", () => {
    const handoff = readFileSync(HANDOFF, "utf8");
    const docs = readdirSync("docs").filter((f) => f.endsWith(".md") && !EXEMPT.has(f));
    const missing = docs.filter((f) => !handoff.includes(f));
    expect(
      missing,
      "DOCS ABSENT FROM THE READ-FIRST LIST — a session can reach a conclusion against a measurement " +
        "already on disk, which is exactly what happened on 2026-07-31 with credit-budget.md. " +
        "Add each to the read-first list in docs/session-handoff.md with one line on what it holds.",
    ).toEqual([]);
  });

  it("the list is not satisfied by a bare filename dump — each doc carries a one-line description", () => {
    const handoff = readFileSync(HANDOFF, "utf8");
    const block = handoff.slice(handoff.indexOf("READ-FIRST INDEX"));
    expect(block.length, "the READ-FIRST INDEX block is missing from the handoff").toBeGreaterThan(200);
    const docs = readdirSync("docs").filter((f) => f.endsWith(".md") && !EXEMPT.has(f));
    const undescribed = docs.filter((f) => {
      const i = block.indexOf(f);
      if (i < 0) return true;
      const line = block.slice(i, block.indexOf("\n", i));
      return line.replace(f, "").replace(/[—`|\-\s]/g, "").length < 15;
    });
    expect(undescribed, "docs listed without a description — a filename is an index entry, not a summary").toEqual([]);
  });

  it("PLANT: a doc removed from the list is detected", () => {
    const handoff = readFileSync(HANDOFF, "utf8");
    const docs = readdirSync("docs").filter((f) => f.endsWith(".md") && !EXEMPT.has(f));
    const victim = docs[0];
    const stripped = handoff.split(victim).join("REDACTED");
    expect(docs.filter((f) => !stripped.includes(f)), "the checker is blind to a removed doc").toContain(victim);
  });
});
