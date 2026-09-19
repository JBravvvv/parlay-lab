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
import { PaperBanner } from "../src/components/ui/PaperBanner";

/**
 * PHONE DENSITY PASS (2026-09-19). Josh, with eight home-screen screenshots, verbatim: "The mobile version that
 * is added to home screen is not optimized for iPhone whatsoever … The top header fades away; the 4 icons other
 * than settings in top right of header need to be a dropdown … You can hardly see ANY stats on the 'stats' tab and
 * only 7 players show on main view because filters box is so unbelievably big … On 'Board' tab, you have to scroll
 * down an entire page to see the picks … Selection for picks is a horizontal scroll bar when it could be a dropdown
 * … On 'Builder' tab, can only see half of a pick on the main view … the pick boxes are so unbelievably big. They
 * can be shrunk by 70% vertically … & the info can become expandable … It should be stuck in portrait mode at all
 * times." Every rule below is mobile-first Tailwind: the phone shape is the default, `sm:` (640px) restores the
 * desktop shape, so the desktop site is unchanged.
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("portrait lock — manifest, lock() where honoured, the rotate-back sheet where not (iOS)", () => {
  it("the manifest asks for portrait, right after display", () => {
    const m = read("public/manifest.webmanifest");
    expect(m).toMatch(/"display": "standalone",\n\s+"orientation": "portrait",/);
    expect(JSON.parse(m).orientation).toBe("portrait");
  });
  it("AppShell calls screen.orientation.lock('portrait') only in the installed app, guarded and swallowed", () => {
    const shell = read("src/components/shell/AppShell.tsx");
    expect(shell).toMatch(/window\.matchMedia\?\.\("\(display-mode: standalone\)"\)\.matches/);
    expect(shell).toMatch(/o\?\.lock\?\.\("portrait"\)\?\.catch\(\(\) => \{\}\);/);
  });
  it("the rotate-back sheet exists in the shell and is shown by CSS only for standalone + landscape + phone height", () => {
    const shell = read("src/components/shell/AppShell.tsx");
    expect(shell).toMatch(/className="rotate-lock fixed inset-0 z-\[100\] flex-col items-center justify-center/);
    expect(shell).toMatch(/Parlay Lab runs in portrait/);
    expect(shell).toMatch(/Turn your phone back upright to keep going\./);
    const css = read("app/globals.css");
    expect(css).toMatch(/\.rotate-lock \{ display: none; \}/);
    expect(css).toMatch(/@media \(display-mode: standalone\) and \(orientation: landscape\) and \(max-height: 500px\) \{\n\s+\.rotate-lock \{ display: flex; \}/);
  });
});

describe("phone header — ⋯ More menu, Settings gear, a bar that reads as a bar", () => {
  const shell = read("src/components/shell/AppShell.tsx");
  const header = shell.slice(shell.indexOf("<header"), shell.indexOf("</header>"));
  it("the More menu is derived from the NAV table minus the bottom tabs and Settings", () => {
    expect(shell).toMatch(/const MORE = NAV\.filter\(\(n\) => !n\.mobile && n\.href !== "\/settings"\);/);
    expect(header).toMatch(/\{MORE\.map\(/);
    // desk gating still applies inside the menu (Season Lab on CFB only, Ballpark Factor on MLB only)
    expect(header).toMatch(/shown\(\{ cfbOnly, mlbOnly \}\) \? \(/);
  });
  it("the ⋯ button is a real menu button and the popover is absolute (the header keeps its measured height)", () => {
    expect(header).toMatch(/aria-haspopup="menu"/);
    expect(header).toMatch(/aria-expanded=\{more\}/);
    expect(header).toMatch(/className="absolute right-0 top-\[calc\(100%\+8px\)\] z-40/);
    expect(header).toMatch(/<IconMore \/>/);
    expect(read("src/components/shell/icons.tsx")).toMatch(/export function IconMore\(/);
  });
  it("the ⋯ button wears the open page's tone, so the header still shows where you are", () => {
    expect(shell).toMatch(/const moreTone = MORE\.find\(\(n\) => isActive\(pathname, n\.href\)\)\?\.tone;/);
    expect(header).toMatch(/style=\{moreTone \? \{ color: moreTone \} : undefined\}/);
  });
  it("every menu row is a replace-Link (flat history) with the page's icon and name", () => {
    const menu = header.slice(header.indexOf('id="shell-more-menu"'));
    expect(menu).toMatch(/<Link\s+key=\{href\}\s+href=\{href\}\s+replace\s+role="menuitem"/);
    expect(menu).toMatch(/<Icon \/>\s*\{label\}/);
  });
  it("the bar's ground is 92%, not 70%", () => {
    expect(header).toMatch(/bg-bg\/92 px-3 pb-2 backdrop-blur-xl md:hidden/);
  });
});

describe("PageHeader — title and action share the phone row, one clamped sub under them", () => {
  it("renders the phone sub once and the desktop sub once, each behind its breakpoint class", () => {
    const out = html(createElement(PageHeader, { title: "Board", sub: "the long desktop sentence", subMobile: "short", action: createElement("button", null, "Go") }));
    expect(out).toMatch(/<h1 class="display text-\[22px\] leading-none text-text sm:text-\(length:--text-display\)">Board<\/h1>/);
    expect(out).toMatch(/class="mt-1 hidden max-w-xl text-\[13px\] leading-relaxed text-muted sm:block">the long desktop sentence</);
    expect(out).toMatch(/data-page-sub="phone" class="line-clamp-1 w-full text-\[11px\] leading-snug text-muted sm:hidden">short</);
    // the action is a direct child of the header row, before the phone sub — beside the title on a phone
    expect(out.indexOf("<button>Go</button>")).toBeLessThan(out.indexOf('data-page-sub="phone"'));
    expect(out).toMatch(/class="mb-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-1\.5 sm:mb-4 sm:gap-3"/);
  });
  it("without subMobile the phone row falls back to the sub; without either there is no phone line", () => {
    expect(html(createElement(PageHeader, { title: "Stats", sub: "one sentence" }))).toMatch(/data-page-sub="phone"[^>]*>one sentence</);
    expect(html(createElement(PageHeader, { title: "Stats" }))).not.toMatch(/data-page-sub/);
  });
});

describe("shared surfaces — Panel, Pill, SportsbookSelector, PaperBanner, DataTable", () => {
  it("Panel pads 12px on the phone and 20px from sm", () => {
    const out = html(createElement(Panel, { title: "T", children: "body" }));
    expect(out).toMatch(/class="p-3 sm:p-4">body</);
    expect(out).toMatch(/px-3 py-2 sm:px-4 sm:py-2/);
  });
  it("Pill is a size down on the phone", () => {
    expect(read("src/components/ui/Pill.tsx")).toMatch(/rounded-full px-3 py-1\.5 text-\[12px\] font-semibold sm:px-3\.5 sm:py-1\.5 sm:text-\[12\.5px\]/);
  });
  it("the sportsbook strip is one slim row on the phone and keeps its min-h-11 select from sm", () => {
    const src = read("src/components/sportsbook/SportsbookSelector.tsx");
    expect(src).toMatch(/mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-white\/10 bg-\[#111a18\] px-2\.5 py-1\.5 sm:mb-3 sm:px-3 sm:py-1\.5/);
    expect(src).toMatch(/min-h-9 rounded-lg [^"]*sm:min-h-9/);
  });
  it("PaperBanner is one short line on the phone and the full epoch sentence from sm", () => {
    const out = html(createElement(PaperBanner));
    expect(out).toMatch(/class="text-text\/80 sm:hidden">hypothetical \$\d+\/day \+ \$\d+ fun · nothing is real money</);
    expect(out).toMatch(/class="hidden text-text\/80 sm:inline">hypothetical \$\d+\/day on the card/);
    expect(out).toMatch(/class="mb-2 flex flex-wrap [^"]*px-3 py-1\.5 text-\[11px\] text-gold sm:mb-3/);
  });
  it("DataTable `hideBelowSm` drops that column's header and cells below 640px, and nothing else", () => {
    type R = { id: string; n: number; name: string };
    const columns: Column<R>[] = [
      { key: "rank", header: "#", numeric: true, hideBelowSm: true, cell: (r) => r.n },
      { key: "name", header: "Pick", cell: (r) => r.name },
    ];
    const out = html(createElement(DataTable<R>, { columns, rows: [{ id: "1", n: 1, name: "x" }], rowKey: (r) => r.id }));
    const ths = out.match(/<th [^>]*>/g)!;
    expect(ths[0]).toMatch(/hidden sm:table-cell/);
    expect(ths[1]).not.toMatch(/hidden sm:table-cell/);
    const tds = out.match(/<td [^>]*>/g)!;
    expect(tds[0]).toMatch(/hidden sm:table-cell/);
    expect(tds[1]).not.toMatch(/hidden sm:table-cell/);
    // the compact-board literals survive (board-compact.test.ts pins them too)
    const dt = read("src/components/ui/DataTable.tsx");
    expect(dt).toMatch(/px-2 py-1\.5 md:py-1/);
  });
  it("phone marks: 18px in tables and ticket legs, with the mark's py-1 wrapper squeezed to 1px", () => {
    const css = read("app/globals.css");
    const phone = css.slice(css.indexOf("@media (max-width: 639.98px)"));
    expect(phone).toMatch(/\.glass-table \[data-player-mark\], \.ticket-legs \[data-player-mark\] \{ width: 18px !important; height: 18px !important; \}/);
    expect(phone).toMatch(/\.glass-table span\.py-1:has\(\[data-player-mark\]\), \.ticket-legs span\.py-1:has\(\[data-player-mark\]\) \{ padding-block: 1px; \}/);
  });
});

describe("Stats — one chip strip, search + a Filters button, the selects folded on the phone", () => {
  const src = read("app/stats/page.tsx");
  it("the sport/scope/group chips are one horizontal strip below sm and wrap from sm", () => {
    expect(src).toMatch(/className="-mx-1 flex items-center gap-1\.5 overflow-x-auto px-1 pb-0\.5 \[scrollbar-width:none\] \[&::-webkit-scrollbar\]:hidden sm:mx-0 sm:flex-wrap sm:gap-2 sm:overflow-visible sm:px-0 sm:pb-0"/);
  });
  it("the selects and the min slider sit behind a Filters button on the phone and are `contents` from sm", () => {
    expect(src).toMatch(/const \[filtersOpen, setFiltersOpen\] = useState\(false\);/);
    expect(src).toMatch(/aria-controls="stats-filters"/);
    expect(src).toMatch(/className=\{`\$\{selectCls\} shrink-0 sm:hidden`\}/);
    expect(src).toMatch(/Filters \{filtersOpen \? "▴" : "▾"\}/);
    expect(src).toMatch(/<div id="stats-filters" className=\{`\$\{filtersOpen \? "flex" : "hidden"\} w-full flex-wrap items-center gap-2 sm:contents`\}>/);
    // the search box is the row's flex-1 on the phone, no 180px floor squeezing the Filters button off
    expect(src).toMatch(/className="min-w-0 flex-1 rounded-full [^"]*sm:min-w-\[180px\] sm:px-4 md:max-w-\[280px\]"/);
  });
  it("the filter panel and the status line lose a step of margin on the phone; the page has a short phone sub", () => {
    expect(src).toMatch(/<Panel className="mb-3">/);
    expect(src).toMatch(/className="num mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-\[10\.5px\] text-faint sm:mt-3"/);
    expect(src).toMatch(/subMobile=\{sport === "ufc" \? "UFC — rankings, pound-for-pound & the active roster" : `\$\{SPORTS\[tableSport\]\.label\} · \$\{season\} · tap a column to sort`\}/);
  });
});

describe("Board — market dropdown on the phone, pills from sm, the # column dropped below sm", () => {
  const src = read("app/board/page.tsx");
  it("one market-key list feeds both controls, with the same labels and counts", () => {
    expect(src).toMatch(/const marketKeys = \[\.\.\.new Set\(live \? \["all", \.\.\.Object\.keys\(MLB_BROWSE_MARKETS\)\] : \["all", "ml", "rl", \.\.\.Object\.keys\(MLB_BROWSE_MARKETS\), \.\.\.Object\.keys\(cats\)\]\)\]/);
    expect(src).toMatch(/const marketLabel = \(k: string\) => \(scope === "all" && k === "all" \? "EVERY MARKET" : CAT_LABELS\[k\] \?\? k\.toUpperCase\(\)\);/);
    expect(src).toMatch(/const marketCount = \(k: string\): number \| null =>/);
    expect((src.match(/marketKeys\.map\(/g) ?? []).length).toBe(2);
  });
  it("the phone select is sm:hidden and the pill row is hidden sm:flex, both beside the Top 50 / All switch", () => {
    const block = src.slice(src.indexOf('data-testid="board-scope"'), src.indexOf('data-testid="board-market-pills"'));
    expect(block).toMatch(/<select\s+aria-label="Market"\s+data-testid="board-market-select"/);
    expect(block).toMatch(/value=\{marketKeys\.includes\(cat\) \? cat : "all"\}/);
    expect(block).toMatch(/onChange=\{\(e\) => setCat\(e\.target\.value\)\}/);
    expect(block).toMatch(/className="board-market-select min-w-0 flex-1 rounded-full [^"]*sm:hidden"/);
    expect(src).toMatch(/<div className="hidden flex-wrap items-center gap-2 sm:flex" data-testid="board-market-pills">/);
    expect(read("app/globals.css")).toMatch(/\.board-market-select \{ color-scheme: dark; \}/);
  });
  it("the ranked table's # column is hideBelowSm; the page carries a short phone sub", () => {
    expect(src).toMatch(/\{ key: "rank", header: "#", numeric: true, hideBelowSm: true,/);
    expect(src).toMatch(/subMobile=\{\n\s+sport === "ufc" \|\| sport === "asg" \|\| !d\n\s+\? undefined/);
    expect(src).toMatch(/games · \$\{pickCount\} rows · \$\{selectedBookName\} prices · updated/);
  });
});

describe("Builder — one-line tickets with a ▾ drawer, the refused list folded, a tighter money row", () => {
  const src = read("app/builder/page.tsx");
  const card = src.slice(src.indexOf("function TicketCard"), src.indexOf("type BlockedRow"));
  it("TicketCard keeps stake · price · EV · result on the phone row and moves the rest behind aria-expanded", () => {
    expect(card).toMatch(/const \[open, setOpen\] = useState\(false\);/);
    expect(card).toMatch(/<span className="hidden sm:contents">\{detail\}<\/span>/);
    expect(card).toMatch(/<span className="hidden sm:contents">\{tax\}<\/span>/);
    expect(card).toMatch(/data-testid="ticket-detail-toggle"/);
    expect(card).toMatch(/aria-expanded=\{open\}/);
    expect(card).toMatch(/\{open && \(\n\s+<div data-testid="ticket-detail" className="mt-1 flex flex-wrap items-center gap-1\.5 sm:hidden">/);
    // the always-visible chips are still there, in order
    const row = card.slice(card.indexOf('<div className="flex items-center gap-1.5 sm:gap-2">'), card.indexOf("ticket-detail-toggle"));
    expect(row).toMatch(/\{fmtMoney\(stake\)\}[\s\S]*<OddsCell odds=[\s\S]*<EvBadge ev=\{primaryEv\} \/>[\s\S]*\{grade\.result\}/);
    // WonPaid, naive→joint, Kelly and basis render once in the source (the detail node), not copied per breakpoint
    expect((card.match(/<WonPaid /g) ?? []).length).toBe(1);
    expect((card.match(/naive \{String\(t\.probNaive\)\}%/g) ?? []).length).toBe(1);
  });
  it("legs are one text line on the phone and the hit-odds line follows the drawer", () => {
    expect(card).toMatch(/className="ticket-legs mt-1 space-y-px sm:mt-1\.5 sm:space-y-0\.5"/);
    expect(card).toMatch(/className=\{`num mt-1 text-\[10px\] text-faint \$\{open \? "" : "hidden sm:block"\}`\}/);
    expect(card).toMatch(/className=\{`glass px-3 py-1\.5 \$\{Number\(t\.czEv\) > 0 \? "ev-glow" : ""\}`\}/);
  });
  it("BlockedPanel keeps its summary and folds the list behind Show/Hide on the phone", () => {
    const bp = src.slice(src.indexOf("function BlockedPanel"), src.indexOf("export default function BuilderPage"));
    expect(bp).toMatch(/const \[open, setOpen\] = useState\(false\);/);
    expect(bp).toMatch(/data-testid="blocked-toggle"/);
    expect(bp).toMatch(/className="press shrink-0 rounded-full [^"]*sm:hidden"/);
    expect(bp).toMatch(/<div id="blocked-list" className=\{`mt-2 space-y-1\.5 \$\{open \? "" : "hidden sm:block"\}`\}>/);
    expect(bp).toMatch(/Cleared the gate, refused anyway/);
  });
  it("money row, bankroll pill, coverage note and ticket grids are a step tighter on the phone", () => {
    expect(src).toMatch(/<div className="mb-3 flex flex-wrap items-center gap-2 sm:mb-4">\n\s+<MoneyInput label="Daily"/);
    expect(src).toMatch(/rounded-full border border-line-2 bg-surface-2 px-3 py-1\.5 sm:px-4 sm:py-2"\n\s+title="Managed bankroll:/);
    expect(src).toMatch(/<label className="flex items-center gap-2 rounded-full border border-line-2 bg-surface-2 px-3 py-1\.5 sm:px-4 sm:py-2">/);
    expect(src).toMatch(/<span className="hidden sm:inline">\n\s+\{" — the rest usually post closer to first pitch/);
    expect((src.match(/<div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">/g) ?? []).length).toBe(7);
    expect(src).not.toMatch(/grid gap-3 md:grid-cols-2/);
  });
});

describe("Parlay Builder — 36px generator slots, hero hidden, buttons a size down on the phone", () => {
  const gen = read("src/components/props/GenSheet.tsx");
  it("a slot is min-h-9 on the phone and the 52px card from sm; the lock word hides but stays in markup", () => {
    expect(gen).toMatch(/gen-player-card flex min-h-9 items-center gap-1\.5 border-t border-white\/\[0\.04\] py-0\.5 sm:min-h-\[44px\] sm:gap-2/); // 44px from sm since the desktop density pass (2026-09-19); was 52px
    expect(gen).toMatch(/press flex h-7 w-7 shrink-0 flex-col items-center justify-center rounded-\[8px\] border text-\[7\.5px\] font-bold uppercase tracking-wide sm:h-9 sm:w-9 sm:rounded-\[10px\]/);
    expect(gen).toMatch(/<span className="mt-\[2px\] hidden leading-none sm:block">\{pinned \? "locked" : "lock in"\}<\/span>/);
    expect(gen).toMatch(/flex min-h-9 items-center gap-2 border-t border-l-2 border-white\/\[0\.04\] border-l-gold py-1 pl-1\.5 sm:min-h-\[44px\]/);
  });
  it("the hit chip rides the sub line on the phone; chip + dots keep their own line from sm", () => {
    expect(gen).toMatch(/<span className="shrink-0 sm:hidden">\n\s+<HitChip stat=\{l\.hit\} window=\{hitWindow\} \/>/);
    expect(gen).toMatch(/<div className="mt-\[3px\] hidden items-center gap-1\.5 sm:flex">\n\s+<HitChip stat=\{l\.hit\} window=\{hitWindow\} \/>\n\s+<HitDots dots=\{l\.hit\.dots\} \/>/);
  });
  it("the hero band is sm-only; Regenerate / Add to slip are 40px on the phone, 48px from sm; Prev/Next 32px", () => {
    expect(gen).toMatch(/gen-studio-hero -mx-3 -mt-2\.5 hidden items-center justify-between gap-2 px-3 py-2 sm:flex/);
    expect(gen).toMatch(/gen-roll press flex min-h-10 flex-1 [^"]*sm:min-h-12/);
    expect(gen).toMatch(/press min-h-10 shrink-0 rounded-\[12px\] border px-3 text-\[12px\] font-semibold sm:min-h-12/);
    expect((gen.match(/press h-8 flex-1 rounded-full border border-white\/10 text-\[11px\] font-semibold disabled:opacity-35 sm:h-9/g) ?? []).length).toBe(2);
  });
  it("globals.css shrinks the phone slot chrome: 36px card, 22px mark, 16px number, 20px combined odds", () => {
    const css = read("app/globals.css");
    const phone = css.slice(css.indexOf("@media (max-width: 639.98px)"));
    expect(phone).toMatch(/\.gen-player-card \{ min-height: 36px; padding: 3px 6px; border-radius: 10px; \}/);
    expect(phone).toMatch(/\.gen-player-card \[data-player-mark\] \{ width: 22px !important; height: 22px !important; \}/);
    expect(phone).toMatch(/\.gen-slot-no \{ width: 16px; height: 16px; font-size: 9px; \}/);
    expect(phone).toMatch(/\.gen-combined-odds \{ font-size: 20px; \}/);
    // the desktop rules are untouched
    expect(css).toMatch(/\.gen-player-card \{ border:1px solid #ffffff0d; border-radius:12px; padding:5px 7px; [^}]*min-height:52px; \}/);
  });
});
