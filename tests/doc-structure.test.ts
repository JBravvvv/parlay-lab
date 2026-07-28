import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * THE DOCS ARE LOAD-BEARING MEMORY — structurally guarded like everything else (2026-07-27).
 *
 * A batch-edit defect discarded five doc edits silently while reporting success, twice, and
 * only the second failure surfaced it. The docs are the project's memory across compaction,
 * every finding lands as a doc edit, and — the project's own conclusion — written rules have
 * not been sufficient; encoded invariants have. This applies it to the docs themselves:
 *
 *   A. every amendment id referenced anywhere (M1–M12, A1–A4, ranges expanded) has a row in
 *      freeze-exit-bundle.md — a referenced-but-absent entry is a lost finding;
 *   B. every bundle row carries a non-trivial measured effect (a verdict without a magnitude
 *      cannot be re-checked — the bundle's own first paragraph);
 *   C. every bundle id appears in the MEASUREMENT VINTAGE table — the dependency ordering
 *      that decides what can be specced now;
 *   D. every "rule N" reference resolves to an existing numbered methodology rule;
 *   E. every dated open item in CLAUDE.md carries a date and a named trigger.
 */

const BUNDLE = "docs/freeze-exit-bundle.md";
const CLAUDE = "CLAUDE.md";
const docFiles = () => [
  ...readdirSync("docs").filter((f) => f.endsWith(".md")).map((f) => `docs/${f}`),
  CLAUDE,
];

function referencedIds(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b([MA])(\d{1,2})[–-]\1?(\d{1,2})\b/g)) {
    for (let i = Number(m[2]); i <= Number(m[3]); i++) out.add(`${m[1]}${i}`);
  }
  // OPEN capture — any M/A-number token, not just the known-valid set. The first version
  // baked M1–M12 into the pattern and the break-test's planted "M13" was INVISIBLE to it:
  // a membership check whose scanner can only see members is vacuous. Teeth-tested now.
  for (const m of text.matchAll(/\b(M\d{1,3}|A\d{1,3})\b/g)) out.add(m[1]);
  return out;
}

function bundleRows(text: string): { id: string; cells: string[] }[] {
  const rows: { id: string; cells: string[] }[] = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("|")) continue;
    const idm = line.match(/^\|\s*(?:\*\*|~~)((?:M|A)\d{1,2})/);
    if (idm) rows.push({ id: idm[1], cells: line.split("|").map((c) => c.trim()) });
  }
  return rows;
}

function vintageSection(text: string): string {
  const start = text.indexOf("## MEASUREMENT VINTAGE AND DEPENDENCY ORDER");
  if (start < 0) return "";
  const rest = text.slice(start + 10);
  const end = rest.search(/\n### /);
  return rest.slice(0, end < 0 ? undefined : end);
}

function maxRule(text: string): number {
  let max = 0;
  for (const m of text.matchAll(/^(\d{1,2})\. \*\*/gm)) max = Math.max(max, Number(m[1]));
  return max;
}

function datedItemViolations(text: string): string[] {
  const start = text.indexOf("## Dated open items");
  if (start < 0) return ["the Dated open items table is missing"];
  const section = text.slice(start, text.indexOf("\n## ", start + 10));
  const out: string[] = [];
  for (const line of section.split("\n")) {
    if (!line.startsWith("| ") || line.startsWith("| date") || line.startsWith("|--")) continue;
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 3) continue;
    if (!/20\d{2}-\d{2}(-\d{2})?|this week/.test(cells[1])) out.push(`no date: ${line.slice(0, 60)}`);
    else if (cells[2].length < 10) out.push(`no trigger: ${line.slice(0, 60)}`);
  }
  return out;
}

describe("doc structure — the memory is guarded like the code", () => {
  it("the checkers themselves fire on broken synthetic docs", () => {
    expect(referencedIds("M3 and A1–A4 and the M9–M11 range")).toEqual(
      new Set(["M3", "A1", "A2", "A3", "A4", "M9", "M10", "M11"]),
    );
    // the case the first version could not see: an UNKNOWN id must be captured to be flagged
    expect(referencedIds("M13 will fix everything").has("M13")).toBe(true);
    expect(bundleRows("| **M99** | x | a measured effect over fifteen chars | dep | s |")[0].id).toBe("M99");
    expect(maxRule("preamble\n1. **a**\n2. **b**\n")).toBe(2);
    expect(datedItemViolations("## Dated open items\n| date | item |\n|--|--|\n| **soon** | thing that will happen |\n## next")).toHaveLength(1);
  });

  const bundle = readFileSync(BUNDLE, "utf8");
  const rows = bundleRows(bundle);
  const bundleIds = new Set(rows.map((r) => r.id).concat(["M7", "M9", "M2"])); // M7+M9 + "M2 / M2′" compound rows

  it("A: every referenced amendment id has a bundle entry", () => {
    const missing = new Set<string>();
    for (const f of docFiles()) {
      for (const id of referencedIds(readFileSync(f, "utf8"))) {
        if (!bundleIds.has(id)) missing.add(`${id} (seen in ${f})`);
      }
    }
    expect([...missing], "referenced but absent from the bundle — a lost finding").toHaveLength(0);
  });

  it("B: every bundle row carries a measured effect", () => {
    const thin = rows.filter((r) => r.cells.length < 5 || (r.cells[3] ?? "").length < 15);
    expect(
      thin.map((r) => r.id),
      "a verdict without a magnitude cannot be re-checked",
    ).toHaveLength(0);
  });

  it("C: every bundle id appears in the vintage table", () => {
    const vint = referencedIds(vintageSection(bundle));
    const missing = rows.map((r) => r.id).filter((id) => id !== "M99" && !vint.has(id.replace("M7+M9", "M7")));
    expect(missing.filter((id) => !vint.has(id)), "no vintage stamp — its dependency order is unstated").toHaveLength(0);
  });

  it("D: every 'rule N' reference resolves", () => {
    const max = maxRule(readFileSync(CLAUDE, "utf8"));
    expect(max).toBeGreaterThanOrEqual(23);
    const bad: string[] = [];
    for (const f of docFiles()) {
      for (const m of readFileSync(f, "utf8").matchAll(/\brules?\s+(\d{1,2})\b/gi)) {
        if (Number(m[1]) > max) bad.push(`rule ${m[1]} in ${f}`);
      }
    }
    expect(bad, "a rule referenced that does not exist").toHaveLength(0);
  });

  it("E: every dated open item has a date and a named trigger", () => {
    expect(datedItemViolations(readFileSync(CLAUDE, "utf8"))).toHaveLength(0);
  });
});
