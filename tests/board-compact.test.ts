import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import { renderToString } from "react-dom/server";

// vitest compiles JSX with the classic runtime — the component output references a global React
(globalThis as { React?: typeof React }).React = React;
import { DataTable, type Column } from "../src/components/ui/DataTable";

/**
 * COMPACT BOARD (2026-09-18). Josh: "On 'Board' tab, shrink the grade column horizontally so
 * everything in the box fits on one screen. There is no reason for it to be that long. If theres
 * explanations, make them individually expandable." Measured on prod before the change: at 1100px
 * the NFL board's table overflowed its box (838 vs 812) with the Grade column auto-widened to 78px
 * for a 24px chip; on the MLB board a settled row's explanation sat inside the nowrap Grade cell.
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("DataTable — shrink-to-fit columns and tighter cells", () => {
  it("`fit` puts w-px on the header and every cell of that column; the others keep their share", () => {
    type R = { id: string; g: string; name: string };
    const columns: Column<R>[] = [
      { key: "name", header: "Pick", cell: (r) => r.name },
      { key: "g", header: "Grade", fit: true, headerTitle: "EV tier", cell: (r) => r.g },
    ];
    const html = renderToString(createElement(DataTable<R>, { columns, rows: [{ id: "1", g: "A", name: "x" }], rowKey: (r) => r.id }));
    const ths = html.match(/<th [^>]*>/g)!;
    expect(ths[0]).not.toMatch(/w-px/);
    expect(ths[1]).toMatch(/w-px/);
    expect(ths[1]).toMatch(/title="EV tier"/);
    const tds = html.match(/<td [^>]*>/g)!;
    expect(tds[0]).not.toMatch(/w-px/);
    expect(tds[1]).toMatch(/w-px/);
  });
  it("cells pad px-2, not px-2.5 — every column gives back a few px", () => {
    const src = read("src/components/ui/DataTable.tsx");
    expect(src).not.toMatch(/px-2\.5/);
    expect(src).toMatch(/border-b border-white\/\[0\.06\] px-2 py-1\.5 text-\[10px\]/);
    expect(src).toMatch(/px-2 py-1\.5 md:py-1/); // desktop density 2026-09-19: rows lose 2px each from md; text cells may wrap there
  });
});

describe("football board — the grade and money columns shrink to their chips", () => {
  const src = read("src/components/cfb/CfbPicksBoard.tsx");
  it("Grade, Fair, Book, Best, EV and ¼-Kelly are all `fit`", () => {
    expect(src).toMatch(/key: "grade", header: "Grade", fit: true,/);
    for (const key of ["fair", "cz", "best", "kelly"]) {
      const i = src.indexOf(`key: "${key}",`);
      expect(i, key).toBeGreaterThan(0);
      expect(src.slice(i, i + 220), key).toMatch(/fit: true,/);
    }
    expect(src).toMatch(/key: "ev", header: "EV", headerTitle: "EV at the selected book's price", numeric: true, fit: true,/);
  });
  it("the wide headers are short, with the long meaning on hover", () => {
    expect(src).not.toMatch(/header: "Selected book"/);
    expect(src).toMatch(/header: "Book",\s*headerTitle: "Price at the selected sportsbook \(DraftKings settles every desk\)"/);
    expect(src).not.toMatch(/header: "EV @ book"/);
  });
  it("the Pick cell is capped on desktop too, so a long label truncates instead of widening the table", () => {
    expect(src).toMatch(/flex max-w-\[176px\] items-center gap-2 md:max-w-\[280px\]/);
    expect(src).not.toMatch(/gap-2 md:max-w-none/);
  });
});

describe("MLB board — fit grade columns, explanations expandable per row", () => {
  const src = read("app/board/page.tsx");
  it("both Grade columns are `fit`", () => {
    const hits = src.match(/key: "grade",\n\s+header: "Grade",\n\s+fit: true,/g) ?? [];
    expect(hits.length).toBe(2);
  });
  it("SettledGrade keeps the tag and the tooltip, and shows the sentence only behind its own toggle", () => {
    const cell = src.slice(src.indexOf("function SettledGrade"), src.indexOf("function SettledDash"));
    expect(cell).toMatch(/useState\(false\)/);
    expect(cell).toMatch(/aria-expanded=\{open\}/);
    expect(cell).toMatch(/data-testid="settled-why-toggle"/);
    expect(cell).toMatch(/\{open && \(/);
    expect(cell).toMatch(/whitespace-normal/); // open, it wraps inside the cell instead of widening the column
    expect(cell).toMatch(/title=\{txt\}/); // the sentence is always one hover away
    expect(cell).toMatch(/SETTLED/);
  });
  it("LiveGrade prints the market figure compactly with the words 'vs market' beside it", () => {
    const g = src.slice(src.indexOf("function LiveGrade"), src.indexOf("function LiveProb"));
    expect(g).toMatch(/<span className="text-\[9px\] text-faint">vs market<\/span>/);
    expect(g).toMatch(/data-testid="mlb-live-market-grade"/);
  });
});
