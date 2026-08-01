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

  /* F — PHANTOM COVERAGE (2026-07-27): the self-consistency docstring promised a constraint
     (TB>=4 >= HR>=1) the code never implemented — a doc describing coverage that never
     existed reads as coverage to any auditor. This parses the docstring's numeric
     constraints and demands each one in the code. */
  function promisedConstraints(src: string): string[] {
    const out: string[] = [];
    for (const m of src.matchAll(/^\s{2}((?:TB|HRR|HR|H)>=\d+)\s+(==|>=)\s+((?:TB|HRR|HR|H)>=\d+)/gm)) {
      out.push(`${m[1]} ${m[2]} ${m[3]}`);
    }
    return out;
  }

  it("F: the checker itself sees a promised-but-missing constraint", () => {
    const doc = "  TB>=9  >=  H>=9          made up\n";
    expect(promisedConstraints(doc)).toEqual(["TB>=9 >= H>=9"]);
  });

  it("F: every constraint the self-consistency docstring promises exists in its code", () => {
    const src = readFileSync("tools/self_consistency.py", "utf8");
    const promised = promisedConstraints(src);
    expect(promised.length, "the docstring's constraint list vanished — rewrite this parser").toBeGreaterThanOrEqual(6);
    const missing = promised.filter((c) => !src.includes(`("${c}"`) && !src.includes(`"${c}",`));
    expect(missing, "promised in the docstring, absent from the code — phantom coverage").toHaveLength(0);
  });

  /* G — AMBIGUOUS ADDRESS (2026-08-01, owner's item 3). The handoff shipped with TWO
     sections labelled `### 4A.` — the four reads and the cron state — and every guard in
     this file passed on it. The docs are the memory across compaction and they are
     addressed by label ("§4A", "§5 reading 15"); a label that resolves to two places is a
     defect IN THE MEMORY, not a typo.

     WHY FULL-TEXT DUPLICATE DETECTION WOULD NOT HAVE CAUGHT IT: the two headings differ in
     everything except the label. Only the ADDRESS collided. So this keys on the leading
     `N.` / `NA.` token and nothing else — which also means the deliberate full-text repeats
     in collection-period.md ("### CORRECTION (2026-07-26) …") are untouched, because they
     carry no address.

     MEASURED at introduction, across docs/*.md + CLAUDE.md: TWO collisions —
     session-handoff's `4A` (the reported one) and branch-firing-audit's `5`, which was NOT
     known and which nothing referenced by number. Both fixed in the same commit. */
  function labelledHeadings(text: string): Map<string, number[]> {
    const seen = new Map<string, number[]>();
    text.split("\n").forEach((ln, i) => {
      const m = ln.match(/^#{2,6}\s+(\d{1,2}[A-Z]?)\.\s/);
      if (!m) return;
      const at = seen.get(m[1]) ?? [];
      at.push(i + 1);
      seen.set(m[1], at);
    });
    return seen;
  }

  it("G: the checker itself sees a duplicated section label", () => {
    const doc = "## 4A. FIRST\ntext\n## 4B. OTHER\n## 4A. SECOND\n";
    const dupes = [...labelledHeadings(doc)].filter(([, at]) => at.length > 1);
    expect(dupes.map(([l]) => l), "the address checker cannot see a collision").toEqual(["4A"]);
  });

  it("G: no doc has two sections at the same address", () => {
    const collisions: string[] = [];
    for (const f of docFiles()) {
      for (const [label, at] of labelledHeadings(readFileSync(f, "utf8"))) {
        if (at.length > 1) collisions.push(`${f}: "${label}." appears at lines ${at.join(", ")}`);
      }
    }
    expect(
      collisions,
      `a section label resolves to more than one place — the docs are addressed by these ` +
        `labels across compaction, so an ambiguous one loses whichever section the reader ` +
        `does not land on:\n  ${collisions.join("\n  ")}`,
    ).toEqual([]);
  });
});
