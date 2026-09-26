import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// vitest compiles JSX with the classic runtime — the component output references a global React
(globalThis as { React?: typeof React }).React = React;
import { DataTable, type Column } from "../src/components/ui/DataTable";
import { PageHeader } from "../src/components/ui/PageHeader";
import { Panel } from "../src/components/ui/Panel";
import { StatTile } from "../src/components/ui/StatTile";

/**
 * DESKTOP DENSITY PASS (2026-09-19). Josh, verbatim: "On the web version of builder tab & every other tab, boxes
 * need to be shrunk. the way you put the daily board on a horizontal scroll with no scroll is embarrassing &
 * unacceptable. It all goes vertical & every box shrunk vertically"
 *
 * Measured on the production alias at 1280px before this pass (DOM-only headless Chrome, no screenshots): the
 * football Builder's ticket .carousel held 3,508px of tickets in a 1,003px box; the football Board's TOP EDGES
 * .carousel 2,324px in 1,005px and its category chip-row 1,166px in 1,005px; the Parlay Builder's game chips
 * 3,058–4,154px in 504px; the Games date rail 2,350px in 1,005px; the Calc quick-add chips 839px in 531px — all
 * with the scrollbar hidden. At 1,100px the MLB Board table itself overflowed its box (843px in 812px).
 *
 * The rules: from md (768px) NOTHING scrolls sideways — strips wrap into rows, the table's text cells wrap and
 * its box has no height cap, the football tickets are a grid — and every shared surface loses vertical padding.
 * Phones keep the shape shipped earlier the same day (the phone-density pass); every rule here is a `md:`/`sm:`
 * override or a min-width media block.
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const css = read("app/globals.css");
const desktopBlock = (() => {
  const i = css.indexOf("/* DESKTOP DENSITY (2026-09-19");
  expect(i).toBeGreaterThan(0);
  const start = css.indexOf("@media (min-width: 768px) {", i);
  return css.slice(start, css.indexOf("\n}\n", start) + 3);
})();

describe("no sideways scroll from md — strips wrap, the table box opens, the football tickets are a grid", () => {
  it(".chip-row and .carousel wrap into rows from 768px (the phone snap strips are the base rules, untouched)", () => {
    expect(desktopBlock).toMatch(/\.chip-row \{ flex-wrap: wrap; overflow-x: visible; overflow-y: visible; scroll-snap-type: none; row-gap: 6px; \}/);
    expect(desktopBlock).toMatch(/\.carousel \{ flex-wrap: wrap; overflow-x: visible; overflow-y: visible; scroll-snap-type: none; padding: 0; \}/);
    expect(desktopBlock).toMatch(/\.carousel > \* \{ scroll-snap-align: none; scroll-snap-stop: normal; \}/);
    // the base rules still scroll and snap on a phone
    expect(css).toMatch(/\n\.chip-row\s*\{[^}]*overflow-x: auto;[^}]*scrollbar-width: none;/);
    expect(css).toMatch(/\n\.carousel\s*\{[^}]*scroll-snap-type: x mandatory;/);
  });
  it("DataTable: the box has no height cap and no overflow from md; text cells wrap there, fit/numeric cells never do", () => {
    const src = read("src/components/ui/DataTable.tsx");
    expect(src).toMatch(/className="glass-table max-h-\(--dt-max-h\) overflow-auto rounded-\[16px\] border border-white\/\[0\.05\] md:max-h-none md:overflow-visible"/);
    expect(src).toMatch(/style=\{\{ "--dt-max-h": maxHeight \} as CSSProperties\}/);
    expect(src).not.toMatch(/style=\{\{ maxHeight \}\}/);
    expect(src).toMatch(/c\.fit \|\| c\.numeric \? "whitespace-nowrap" : "whitespace-nowrap md:whitespace-normal"/);
    type R = { a: string; n: number };
    const cols: Column<R>[] = [
      { key: "a", header: "Pick", cell: (r) => r.a },
      { key: "n", header: "EV", numeric: true, cell: (r) => String(r.n) },
      { key: "g", header: "Grade", fit: true, cell: () => "A" },
    ];
    const out = html(createElement(DataTable<R>, { columns: cols, rows: [{ a: "Long player prop label", n: 1 }], rowKey: (r) => r.a }));
    expect(out).toMatch(/class="glass-table max-h-\(--dt-max-h\) overflow-auto [^"]*md:max-h-none md:overflow-visible" style="--dt-max-h:62vh"/);
    expect(out).toMatch(/<td class="px-2 py-1\.5 md:py-1 whitespace-nowrap md:whitespace-normal[^"]*">Long player prop label<\/td>/);
    expect(out).toMatch(/<td class="px-2 py-1\.5 md:py-1 whitespace-nowrap num text-right[^"]*">1<\/td>/);
    expect(out).toMatch(/<td class="px-2 py-1\.5 md:py-1 whitespace-nowrap [^"]*w-px[^"]*">A<\/td>/);
    expect(out).toMatch(/<th [^>]*class="whitespace-nowrap border-b border-white\/\[0\.06\] px-2 py-1\.5 text-\[10px\] font-bold uppercase tracking-\[0\.12em\] md:py-1 /);
  });
  it("the football Builder's tickets are a vertical grid at every width — the md+ .carousel strip is gone", () => {
    const src = read("src/components/cfb/CfbBuilder.tsx");
    expect(src).toMatch(/<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" role="list" aria-label=\{label\}>/);
    expect(src).toMatch(/<div key=\{t\.id\} role="listitem" className="min-w-0">/);
    expect(src).not.toMatch(/className="carousel/);
    expect(src).not.toMatch(/md:w-\[340px\]/);
  });
  it("the football Board: featured cards fill thirds of the row from md, the parlay filter strip wraps, the desktop parlay grid runs three-up at xl", () => {
    const src = read("src/components/cfb/CfbPicksBoard.tsx");
    expect(src).toMatch(/w-\[78vw\] max-w-\[320px\] rounded-\[14px\] border px-3 pb-2 pt-2 md:w-\[calc\(33\.333%-8px\)\] md:max-w-none/);
    expect(src).toContain('<select aria-label="Ticket tier"');
    expect(src).toMatch(/<div className="hidden gap-2 md:grid md:grid-cols-2 xl:grid-cols-3">/);
    expect(src).toMatch(/<div className="space-y-3">/);
    expect(src).toMatch(/<div className="mt-5" data-testid="cfb-parlays">/);
    expect((src.match(/className="min-h-\[40px\] !px-3 !text-\[11px\] whitespace-nowrap md:min-h-\[32px\]"/g) ?? []).length).toBe(1);
    expect(src).toMatch(/text-\[16px\] text-text outline-none placeholder:text-faint focus:border-cfb\/60 data-\[league=nfl\]:focus:border-nfl\/60 md:h-9 md:text-\[13px\]"/);
  });
  it("every other desktop-visible strip wraps from md: the date rail, the generator's game chips, the ranked-list tabs", () => {
    expect(read("src/components/games/DateRail.tsx")).toMatch(/className="-mx-4 mb-5 overflow-x-auto px-4 md:mx-0 md:mb-3 md:overflow-visible md:px-0" style=\{\{ scrollbarWidth: "none" \}\}>\n\s+<div className="flex w-max gap-1\.5 md:w-auto md:flex-wrap">/);
    expect(read("src/components/props/GenSheet.tsx")).toMatch(/"-mx-3 overflow-x-auto px-3 \[scrollbar-width:none\] \[&::-webkit-scrollbar\]:hidden md:mx-0 md:flex-wrap md:overflow-visible md:px-0"/);
    expect(read("src/components/props/RankedPicks.tsx")).toContain("<DiscoveryFilters");
    expect(read("src/components/props/DiscoveryFilters.tsx")).toContain("flex flex-wrap gap-1");
    // no `w-max` strip is left without an md wrap override in the app's page-level UI
    for (const f of ["src/components/games/DateRail.tsx", "src/components/cfb/CfbPicksBoard.tsx"]) {
      const s = read(f);
      for (const m of s.matchAll(/className="([^"]*\bw-max\b[^"]*)"/g)) expect(m[1], f).toMatch(/md:w-auto md:flex-wrap/);
    }
  });
});

describe("every box shrunk vertically from sm/md — the shared surfaces", () => {
  it("Panel: 16px body padding and a 8px-tall header from sm (was 20px / 12px)", () => {
    const out = html(createElement(Panel, { title: "T", children: "body" }));
    expect(out).toMatch(/class="p-3 sm:p-4">body</);
    expect(out).toMatch(/px-3 py-2 sm:px-4 sm:py-2/);
    expect(out).not.toMatch(/sm:p-5|sm:py-3/);
  });
  it("PageHeader uses a 24px desktop title and collapses long introductory copy", () => {
    const out = html(createElement(PageHeader, { title: "Board", sub: "sub" }));
    expect(out).toContain('sm:text-[24px]');
    expect(out).toContain('mb-2 flex flex-wrap items-center');
    expect(out).toContain('<details class="page-description');
    expect(out).not.toContain('<details open');
  });
  it("StatTile: 20px figure one step under the label, 8px×12px tile padding from md", () => {
    const out = html(createElement(StatTile, { label: "Core", value: "$250", sub: "per slate day" }));
    expect(out).toMatch(/class="display num mt-1\.5 text-\[20px\] leading-none tracking-tight text-text">\$250</);
    expect(out).toMatch(/class="num mt-1 text-\[10\.5px\] leading-snug text-faint">per slate day</);
    expect(desktopBlock).toMatch(/\.stat-tile \{ padding: 8px 12px; border-radius: 14px; \}/);
    expect(css).toMatch(/\n\.stat-tile \{[^}]*padding: 12px 14px;/); // the phone tile is unchanged
  });
  it("SportsbookSelector, PaperBanner, Pill and the shell's main lose a step each from sm/md", () => {
    expect(read("src/components/sportsbook/SportsbookSelector.tsx")).toMatch(/flex min-w-0 items-center gap-2/);
    expect(read("src/components/sportsbook/SportsbookSelector.tsx")).toMatch(/min-h-9 rounded-lg [^"]*sm:min-h-9 sm:px-3 sm:text-sm/);
    expect(read("src/components/ui/PaperBanner.tsx")).toMatch(/sm:mb-3 sm:rounded-\(--radius-panel\) sm:px-4 sm:py-1\.5 sm:text-\[12px\]/);
    expect(read("src/components/ui/Pill.tsx")).toMatch(/rounded-full px-3 py-1\.5 text-\[12px\] font-semibold sm:px-3\.5 sm:py-1\.5 sm:text-\[12\.5px\]/);
    expect(read("src/components/shell/AppShell.tsx")).toContain('className="desk-content px-4 pb-24 pt-2 md:ml-[200px] md:px-8 md:pb-8 md:pt-2"');
    expect(desktopBlock).toMatch(/\.gen-player-card \{ min-height: 44px; \}/);
    expect((read("src/components/props/GenSheet.tsx").match(/sm:min-h-\[44px\]/g) ?? []).length).toBe(2);
    expect(read("src/components/props/GenSheet.tsx")).not.toMatch(/sm:min-h-\[52px\]/);
  });
});

describe("every box shrunk vertically — per tab", () => {
  it("Board (MLB): notes mb-3, the parlay section mt-5 with cards two-up from md and three-up from xl", () => {
    const board = read("app/board/page.tsx");
    expect(board).toMatch(/className="mb-3 flex items-center gap-2"/);
    expect(board).toMatch(/className="mb-3 rounded-\(--radius-panel\)/);
    expect(board).not.toMatch(/className="mb-4 /);
    const ps = read("src/components/mlb/ParlaysSection.tsx");
    expect(ps).toMatch(/<div className="mt-5">/);
    expect(ps).toMatch(/<div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">/);
    expect(ps).not.toMatch(/className="mt-8"|grid gap-3 md:grid-cols-2/);
  });
  it("Builder (MLB): space-y-3 sections, seven three-up ticket grids, a slimmer fun divider, manual slip mt-4, one-line ticket cards", () => {
    const src = read("app/builder/page.tsx");
    expect((src.match(/<div className="space-y-3">/g) ?? []).length).toBe(3); // the two converted section stacks + one that was already space-y-3
    expect(src).not.toMatch(/className="space-y-5"/);
    expect((src.match(/<div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">/g) ?? []).length).toBe(7);
    expect(src).not.toMatch(/md:gap-3/);
    expect(src).toMatch(/<div className="mt-4 border-t border-gold\/25 pt-3">/);
    expect(src).toMatch(/<Panel title="Manual slip — combine any playable picks" className="mt-4">/);
    expect(src).toMatch(/<div className="mb-3 flex flex-wrap items-center gap-2 sm:mb-4">/);
    expect(src).toMatch(/className=\{`pick-ticket glass px-3 py-1\.5 \$\{Number\(t\.czEv\) > 0 \? "ev-glow" : ""\}`\}/);
    expect(src).toMatch(/<div className="mt-3 text-\[10\.5px\] text-faint">/);
  });
  it("Football desk: the sandbox line mb-2 and a 36px search from md", () => {
    const src = read("src/components/cfb/CfbProps.tsx");
    expect(src).toContain('Paper sandbox · untracked');
    expect(src).toMatch(/bg-surface-2 px-3 text-\[16px\] text-text placeholder:text-faint md:h-9 md:text-\[13px\]"/);
  });
  it("Games, Stats, Ledger, Sharp, Simulator, Settings, Calc, Ballpark: tighter grids and section gaps", () => {
    expect(read("app/games/page.tsx")).toMatch(/<div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">/);
    expect(read("src/components/cfb/CfbGames.tsx")).toMatch(/<div className="space-y-4">[\s\S]*<div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">/);
    expect(read("src/components/cfb/CfbGames.tsx")).not.toMatch(/space-y-6/);
    const stats = read("app/stats/page.tsx");
    expect(stats).toMatch(/<Panel className="mb-3">/);
    expect(stats).toMatch(/<div className="mt-4 text-\[10\.5px\] text-faint">/);
    const ledger = read("app/ledger/page.tsx");
    expect(ledger).toMatch(/<div className="space-y-4">/);
    expect((ledger.match(/display num mt-1 text-\[22px\]/g) ?? []).length).toBe(5);
    expect(ledger).not.toMatch(/text-\[26px\]|space-y-6|gap-4 md:grid-cols-2|className="h-52"/);
    expect((ledger.match(/className="h-40"/g) ?? []).length).toBe(2);
    expect(ledger).toMatch(/<div className="h-44">/);
    const sharp = read("app/sharp/page.tsx");
    expect(sharp).toMatch(/<div className="space-y-3">/);
    expect(sharp).toMatch(/<div className="grid gap-2 md:grid-cols-2">/);
    expect((sharp.match(/"glass px-4 py-3/g) ?? []).length).toBe(3);
    expect(sharp).not.toMatch(/glass px-5 py-4/);
    for (const f of ["src/components/cfb/CfbSharp.tsx", "src/components/ufc/UfcSharp.tsx"]) {
      expect(read(f), f).toMatch(/"glass px-4 py-3/);
      expect(read(f), f).not.toMatch(/glass px-5 py-4/);
    }
    expect(read("app/simulator/page.tsx")).toMatch(/<div className="space-y-3">[\s\S]*<div className="grid gap-3 md:grid-cols-3">/);
    expect(read("app/settings/page.tsx")).toMatch(/<div className="space-y-3">/);
    const calc = read("app/calc/page.tsx");
    expect(calc).toMatch(/flex max-w-\[1100px\] flex-col gap-3 lg:grid lg:grid-cols-\[minmax\(0,1fr\)_minmax\(320px,420px\)\] lg:items-start lg:gap-4/);
    expect((calc.match(/className="space-y-3 lg:col-start-/g) ?? []).length).toBe(2);
    expect(read("src/components/calc/CalcHero.tsx")).toMatch(/shine relative overflow-hidden rounded-\[20px\] border px-4 pb-4 pt-3 \$\{/);
    expect(read("app/ballpark/page.tsx")).toMatch(/<div className="grid gap-3 px-4 py-2 md:grid-cols-\[minmax\(0,1\.1fr\)_minmax\(0,1\.4fr\)\]">/);
  });
});
