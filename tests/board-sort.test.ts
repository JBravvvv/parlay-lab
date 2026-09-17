import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { GRADE_BAND, SETTLED_SINK, gradeFromEv, gradeRank, gradeSortKey } from "@/lib/grade";

/**
 * COLUMN SORTING (INSTRUCTION 69, 2026-09-17, Josh's word, verbatim: "When sorting by column on
 * board or any other page, it needs to function correctly. On board tab, when switching from 'Top
 * 50' to 'ALL' then selecting a prop, it does not sort from highest grade to lowest grade when you
 * press on the grade column enough times to have it going top to bottom").
 *
 * Reproduced on prod 2026-09-17 (DOM read through the browser): the letter band ordered, but every
 * unlettered row keyed to 0 and rows inside a letter kept arrival order, and the table's ▲ from one
 * view rode silently into the next. Three pins: the composite key, the table's default/reset
 * contract, and the Board / CFB board wiring.
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("gradeSortKey — by letter, then by EV inside the letter; unlettered by figure; settled last", () => {
  it("a higher letter always beats a lower one, whatever the EVs", () => {
    expect(gradeSortKey(gradeRank("B"), -40)).toBeGreaterThan(gradeSortKey(gradeRank("C"), 400));
    expect(gradeSortKey(gradeRank("F"), -400)).toBeGreaterThan(gradeSortKey(gradeRank(null), 400));
  });
  it("inside a letter the row with the better EV sorts first", () => {
    expect(gradeSortKey(gradeRank("A"), 4.2)).toBeGreaterThan(gradeSortKey(gradeRank("A"), 3.1));
    expect(gradeSortKey(gradeRank(null), 3.1)).toBeGreaterThan(gradeSortKey(gradeRank(null), -2.0)); // "+3.1% vs market" above "−2.0% vs market"
  });
  it("the EV can never cross a band — ±(band/2 − 1) is the clamp, and a null / NaN EV keys to the band's centre", () => {
    expect(gradeSortKey(gradeRank("C"), 99999)).toBe(gradeRank("C") * GRADE_BAND + (GRADE_BAND / 2 - 1));
    expect(gradeSortKey(gradeRank("C"), -99999)).toBe(gradeRank("C") * GRADE_BAND - (GRADE_BAND / 2 - 1));
    expect(gradeSortKey(gradeRank("C"), null)).toBe(gradeRank("C") * GRADE_BAND);
    expect(gradeSortKey(gradeRank("C"), Number.NaN)).toBe(gradeRank("C") * GRADE_BAND);
  });
  it("a settled leg (gradeRank(null) − SETTLED_SINK) sinks below the worst unlettered live row", () => {
    expect(gradeRank(null) - SETTLED_SINK).toBeLessThan(gradeSortKey(gradeRank(null), -499));
  });
  it("a full day's mix sorts to one true highest → lowest under a plain numeric descending sort", () => {
    const rows = [
      { id: "live-market +3.1", key: gradeSortKey(gradeRank(null), 3.1) },
      { id: "C −0.5", key: gradeSortKey(gradeRank(gradeFromEv(-0.5)), -0.5) },
      { id: "settled", key: gradeRank(null) - SETTLED_SINK },
      { id: "A 4.9", key: gradeSortKey(gradeRank(gradeFromEv(4.9)), 4.9) },
      { id: "live-market −2.0", key: gradeSortKey(gradeRank(null), -2.0) },
      { id: "A 3.2", key: gradeSortKey(gradeRank(gradeFromEv(3.2)), 3.2) },
      { id: "F −9", key: gradeSortKey(gradeRank(gradeFromEv(-9)), -9) },
      { id: "unpriced", key: gradeSortKey(gradeRank(null), null) },
    ];
    expect(rows.sort((a, b) => b.key - a.key).map((r) => r.id)).toEqual([
      "A 4.9", "A 3.2", "C −0.5", "F −9", "live-market +3.1", "unpriced", "live-market −2.0", "settled",
    ]);
  });
});

describe("DataTable — opens on the caller's default sort and returns to it when the view changes", () => {
  const dt = read("src/components/ui/DataTable.tsx");
  it("carries defaultSort / resetKey and re-seeds the sort state when resetKey changes (no effect, no flash)", () => {
    expect(dt).toMatch(/defaultSort\?: SortState \| null;/);
    expect(dt).toMatch(/resetKey\?: string;/);
    expect(dt).toMatch(/const \[sort, setSort\] = useState<SortState \| null>\(defaultSort\);/);
    expect(dt).toMatch(/if \(seenReset !== resetKey\) \{\s*setSeenReset\(resetKey\);\s*setSort\(defaultSort\);\s*\}/);
  });
  it("the header tap still flips the active column and opens a new column descending", () => {
    expect(dt).toMatch(/s\?\.key === c\.key\s*\? \{ key: c\.key, dir: s\.dir === 1 \? -1 : 1 \}\s*: \{ key: c\.key, dir: -1 \}/);
  });
  it("an unreadable (NaN) sort value sinks instead of freezing the comparator", () => {
    expect(dt).toMatch(/if \(typeof va === "number" && Number\.isNaN\(va\)\) return 1;/);
    expect(dt).toMatch(/if \(typeof vb === "number" && Number\.isNaN\(vb\)\) return -1;/);
  });
});

describe("Board wiring — both tables open on Grade ▼ and reset per view; the Grade keys are composite", () => {
  const src = read("app/board/page.tsx");
  it("the stamped / ALL-scope table and the live board table both pass defaultSort + resetKey (scope, tab, live, book)", () => {
    expect((src.match(/defaultSort=\{\{ key: "grade", dir: -1 \}\}/g) ?? []).length).toBe(2);
    expect((src.match(/resetKey=\{`\$\{scope\}\|\$\{cat\}\|\$\{live\}\|\$\{selectedBook\}`\}/g) ?? []).length).toBe(2);
  });
  it("the live-board Grade key: settled sinks by SETTLED_SINK, a live row keys on its live EV, a pregame row on the EV the mode displays", () => {
    const col = src.slice(src.indexOf('key: "grade",'), src.indexOf('key: "prob",'));
    expect(col).toMatch(/\? gradeRank\(null\) - SETTLED_SINK/);
    expect(col).toMatch(/gradeSortKey\(gradeRank\(v\.pSrc === "sim" \? gradeFromEv\(v\.ev\) : null\), v\.ev\)/);
    expect(col).toMatch(/gradeSortKey\(gradeRank\(gradeFromEv\(ev0\)\), ev0\)/);
  });
  it("the stamped-picks Grade key: the same three-way shape on the pick's edge", () => {
    const col = src.slice(src.indexOf("const pickColumns"), src.indexOf('key: "pick",', src.indexOf("const pickColumns")));
    expect(col).toMatch(/\? gradeRank\(null\) - SETTLED_SINK/);
    expect(col).toMatch(/gradeSortKey\(gradeRank\(v\.pSrc === "sim" \? gradeFromEv\(v\.ev\) : null\), v\.ev\)/);
    expect(col).toMatch(/gradeSortKey\(gradeRank\(gradeFromEv\(edge0\)\), edge0\)/);
  });
  it("the CFB picks board (\"or any other page\") sorts Grade on the same composite key and resets per scope / tab", () => {
    const cfb = read("src/components/cfb/CfbPicksBoard.tsx");
    expect(cfb).toMatch(/sortValue: \(r\) => gradeSortKey\(gradeRank\(r\.grade\), r\.evCz\)/);
    expect(cfb).toMatch(/defaultSort=\{\{ key: "grade", dir: -1 \}\} resetKey=\{`\$\{scope\}\|\$\{cat\}`\}/);
  });
});
