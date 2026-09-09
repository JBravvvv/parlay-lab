import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NAV ORDER — Josh's instruction, verbatim (2026-09-03): "The order of the tabs on left side of
 * screen should be: Games, Stats, Board, Builder, Parlay Builder, Parlay Calculator (formerly
 * Calc) on Top Left & Ledger, The Sharp, Simulator, Settings on Bottom Left. You can remove
 * Dashboard tab as it does the same thing as pressing the ... logo in top left of screen."
 *
 * 2026-09-04 addendum: "Move the Ledger tab back up right below Parlay Calc (Rename it from
 * Parlay Calculator)".
 *
 * 2026-09-05, Josh, verbatim (supersedes the two group splits above):
 *   "'The Sharp' & 'Simulator' tabs can go back up right above Parlay Builder"
 *   "'Ledger' tab can be moved down to bottom of page right above Settings"
 *   "Add color to the Tab titles (ie: Board, The Sharp, Simulator, etc)"
 * → top: Games, Stats, Board, Builder, The Sharp, Simulator, Parlay Builder, Parlay Calc;
 *   bottom: Ledger, Settings; every entry carries a distinct `tone` hex.
 *
 * 2026-09-08, INSTRUCTION 46 (Josh: "Should be evaluating season long props and season long prop
 * parlays"): Season Lab (/season) joins the END of the top group, desktop rail + phone top-bar icon
 * (not a bottom tab — a 7th does not fit at 375px), tone #F5A524 (the CFB amber). Eleven entries.
 *
 * Source-scan pins on the NAV table in AppShell.tsx so a later edit cannot quietly reshuffle it.
 */

const shell = fs.readFileSync(path.join(process.cwd(), "src/components/shell/AppShell.tsx"), "utf8");

/** the NAV literal, parsed one entry per line into plain objects */
function navEntries() {
  const m = shell.match(/const NAV: readonly NavItem\[\] = \[([\s\S]*?)\n\];/);
  if (!m) throw new Error("NAV table not found");
  return m[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{"))
    .map((l) => ({
      href: /href: "([^"]+)"/.exec(l)![1],
      label: /label: "([^"]+)"/.exec(l)![1],
      group: /group: "(top|bottom)"/.exec(l)![1],
      mobile: /mobile: (true|false)/.exec(l)![1] === "true",
      mobileLabel: /mobileLabel: "([^"]+)"/.exec(l)?.[1],
      tone: /tone: "(#[0-9A-Fa-f]{6})"/.exec(l)?.[1],
      icon: /icon: (Icon\w+)/.exec(l)![1],
      cfbOnly: /cfbOnly: true/.test(l),
    }));
}

describe("nav — desktop side rail", () => {
  const nav = navEntries();
  // 2026-09-05, Josh: "'The Sharp' & 'Simulator' tabs can go back up right above Parlay Builder"
  // (this rewrites the 2026-09-04 pin "Ledger right below Parlay Calc" — Ledger now lives in
  // the bottom group, see the next pin)
  // 2026-09-08 (INSTRUCTION 46): Season Lab appended after Parlay Calc — the eight-entry order above is unchanged ahead of it
  it("top group is Games, Stats, Board, Builder, The Sharp, Simulator, Parlay Builder, Parlay Calc, Season Lab — in that order", () => {
    expect(nav.filter((n) => n.group === "top").map((n) => n.label)).toEqual([
      "Games",
      "Stats",
      "Board",
      "Builder",
      "The Sharp",
      "Simulator",
      "Parlay Builder",
      "Parlay Calc",
      "Season Lab",
    ]);
    expect(nav.filter((n) => n.group === "top").map((n) => n.href)).toEqual([
      "/games",
      "/stats",
      "/board",
      "/builder",
      "/sharp",
      "/simulator",
      "/props",
      "/calc",
      "/season",
    ]);
  });
  it("The Sharp and Simulator sit immediately above Parlay Builder", () => {
    const labels = nav.map((n) => n.label);
    const pb = labels.indexOf("Parlay Builder");
    expect(labels.slice(pb - 2, pb)).toEqual(["The Sharp", "Simulator"]);
  });
  // 2026-09-05, Josh: "'Ledger' tab can be moved down to bottom of page right above Settings"
  it("bottom group is Ledger, Settings — in that order", () => {
    expect(nav.filter((n) => n.group === "bottom").map((n) => n.label)).toEqual(["Ledger", "Settings"]);
    expect(nav.filter((n) => n.group === "bottom").map((n) => n.href)).toEqual(["/ledger", "/settings"]);
  });
  it("Ledger is in the bottom group, immediately before Settings (the last entry)", () => {
    const ledger = nav.find((n) => n.href === "/ledger")!;
    expect(ledger.group).toBe("bottom");
    const i = nav.indexOf(ledger);
    expect(nav[i + 1]?.href).toBe("/settings");
    expect(nav.at(-1)!.href).toBe("/settings");
  });
  it("the table is top group first, then bottom group (source order = render order)", () => {
    const groups = nav.map((n) => n.group);
    const firstBottom = groups.indexOf("bottom");
    expect(groups.slice(0, firstBottom).every((g) => g === "top")).toBe(true);
    expect(groups.slice(firstBottom).every((g) => g === "bottom")).toBe(true);
  });
  it("Dashboard is gone; '/' is never a rail entry, so it is never highlighted", () => {
    expect(nav.some((n) => n.href === "/")).toBe(false);
    expect(nav.some((n) => /dashboard/i.test(n.label))).toBe(false);
    expect(shell).not.toMatch(/IconDash/);
    // the brand still links home — `replace` since 2026-09-05 (iOS freeze fix: every
    // internal Link is replace-only so the back-swipe recognizer never arms; see nav-flat.test.ts)
    expect(shell).toMatch(/<Link replace href="\/" className="flex items-baseline/);
  });
  it("Calc was renamed Parlay Calc (2026-09-04; briefly 'Parlay Calculator' on 09-03)", () => {
    expect(nav.find((n) => n.href === "/calc")!.label).toBe("Parlay Calc");
    expect(nav.some((n) => n.label === "Parlay Calculator")).toBe(false);
    expect(nav.some((n) => n.label === "Calc")).toBe(false);
  });
  it("the rail renders the two groups with a flex spacer between them, above the footer disclaimer", () => {
    const top = shell.indexOf('NAV.filter((n) => n.group === "top")');
    const spacer = shell.indexOf('<div className="flex-1" aria-hidden />');
    const bottom = shell.indexOf('NAV.filter((n) => n.group === "bottom")');
    const footer = shell.indexOf("informational only, not betting advice");
    expect(top).toBeGreaterThan(0);
    expect(spacer).toBeGreaterThan(top);
    expect(bottom).toBeGreaterThan(spacer);
    expect(footer).toBeGreaterThan(bottom);
  });
});

describe("nav — mobile (375px)", () => {
  const nav = navEntries();
  it("bottom tab bar is Games, Stats, Board, Builder, Parlays, Ledger (6 tabs)", () => {
    const tabs = nav.filter((n) => n.mobile);
    expect(tabs.map((n) => n.href)).toEqual(["/games", "/stats", "/board", "/builder", "/props", "/ledger"]);
    expect(tabs.map((n) => n.mobileLabel ?? n.label)).toEqual(["Games", "Stats", "Board", "Builder", "Parlays", "Ledger"]);
  });
  it("every bottom-bar label fits the 9.5px type (≤ 9 chars)", () => {
    for (const n of nav.filter((n) => n.mobile)) expect((n.mobileLabel ?? n.label).length).toBeLessThanOrEqual(9);
  });
  it("the bottom bar renders the short label and sizes its grid from the mobile entry count", () => {
    expect(shell).toMatch(/\{mobileLabel \?\? label\}/);
    expect(shell).toMatch(/gridTemplateColumns: `repeat\(\$\{NAV\.filter\(\(n\) => n\.mobile\)\.length\}/);
  });
  // 2026-09-08 (INSTRUCTION 46): /season rides the top-bar icon row — 11 pages now
  it("every route not in the bottom bar is an icon in the mobile top bar (all 11 pages reachable on a phone)", () => {
    expect(nav.filter((n) => !n.mobile).map((n) => n.href)).toEqual(["/sharp", "/simulator", "/calc", "/season", "/settings"]);
    // the header row derives from the same table, so nothing can fall off
    const header = shell.slice(shell.indexOf("<header"), shell.indexOf("</header>"));
    expect(header).toMatch(/NAV\.filter\(\(n\) => !n\.mobile\)\.map/);
    expect(header).toMatch(/aria-label=\{label\}/);
  });
  it("isActive semantics are unchanged", () => {
    expect(shell).toMatch(/return href === "\/" \? pathname === "\/" : pathname\.startsWith\(href\);/);
  });
});

describe("nav — Season Lab (INSTRUCTION 46 fix round, 2026-09-08)", () => {
  const nav = navEntries();
  it("every entry has its own glyph — Season Lab wears IconSeason, not the Ledger's", () => {
    expect(nav.find((n) => n.href === "/season")!.icon).toBe("IconSeason");
    expect(new Set(nav.map((n) => n.icon)).size).toBe(nav.length);
    expect(fs.readFileSync(path.join(process.cwd(), "src/components/shell/icons.tsx"), "utf8")).toMatch(/export function IconSeason\(/);
  });
  it("Season Lab is the only CFB-only entry, and both nav surfaces drop CFB-only entries while the switch is on MLB", () => {
    expect(nav.filter((n) => n.cfbOnly).map((n) => n.href)).toEqual(["/season"]);
    expect(shell).toMatch(/const shown = \(n: Pick<NavItem, "cfbOnly">\) => !n\.cfbOnly \|\| cfb;/);
    const rail = shell.slice(shell.indexOf('NAV.filter((n) => n.group === "top")'), shell.indexOf('<div className="flex-1" aria-hidden />'));
    expect(rail).toMatch(/shown\(item\) \? <RailLink/);
    const header = shell.slice(shell.indexOf("<header"), shell.indexOf("</header>"));
    expect(header).toMatch(/shown\(\{ cfbOnly \}\) \? \(/);
  });
});

describe("nav — tab-title colour (2026-09-05, Josh: \"Add color to the Tab titles\")", () => {
  const nav = navEntries();
  it("every tab carries a tone hex, and every tone is distinct", () => {
    for (const n of nav) expect(n.tone, n.label).toMatch(/^#[0-9A-F]{6}$/);
    expect(new Set(nav.map((n) => n.tone)).size).toBe(nav.length);
    // 10 → 11 on 2026-09-08 (INSTRUCTION 46, Season Lab)
    expect(nav.length).toBe(11);
  });
  it("tones are the agreed palette (Board keeps the lime brand green)", () => {
    expect(Object.fromEntries(nav.map((n) => [n.label, n.tone]))).toEqual({
      Games: "#7DD3FC",
      Stats: "#C4B5FD",
      Board: "#B6FF3D",
      Builder: "#FCD34D",
      "The Sharp": "#FDA4AF",
      Simulator: "#67E8F9",
      "Parlay Builder": "#FDBA74",
      "Parlay Calc": "#5EEAD4",
      // 2026-09-08 (INSTRUCTION 46): the CFB amber, --color-cfb — Season Lab is a CFB-only page
      "Season Lab": "#F5A524",
      Ledger: "#FDE68A",
      Settings: "#D4D4D8",
    });
  });
  it("the tone is the label colour in the rail and the phone bar, and the icon colour in the top-bar row — idle at 70%, active at full", () => {
    expect(shell).toMatch(/const IDLE_LABEL = 0\.7;/);
    expect(shell).toMatch(/function tint\(hex: string, alpha: number\)/);
    const rail = shell.slice(shell.indexOf("function RailLink"), shell.indexOf("export function AppShell"));
    expect(rail).toMatch(/<span className="relative group-hover:\[color:var\(--tone\)\]!" style=\{\{ color: active \? tone : tint\(tone, IDLE_LABEL\) \}\}>/);
    // review fix: the desktop rail brightens on hover again — the tone rides a CSS variable on the Link (`group`), and the
    // spans' group-hover colour is !important so it beats the inline idle colour (Tailwind v4 trailing-! syntax)
    expect(rail).toMatch(/className=\{`press group relative flex/);
    expect(rail).toMatch(/style=\{\{ "--tone": tone \} as CSSProperties\}/);
    expect(rail).toMatch(/<span className="relative flex group-hover:\[color:var\(--tone\)\]!" style=\{\{ color: active \? tone : tint\(tone, IDLE_ICON\) \}\}>/);
    expect((rail.match(/group-hover:\[color:var\(--tone\)\]!/g) ?? []).length).toBe(2);
    const header = shell.slice(shell.indexOf("<header"), shell.indexOf("</header>"));
    expect(header).toMatch(/style=\{\{ color: isActive\(pathname, href\) \? tone : tint\(tone, IDLE_LABEL\) \}\}/);
    const bar = shell.slice(shell.lastIndexOf("<nav"), shell.lastIndexOf("</nav>"));
    expect(bar).toMatch(/style=\{\{ color: active \? tone : tint\(tone, IDLE_LABEL\) \}\}/);
    // the always-lime classes are gone from the nav surfaces
    for (const seg of [rail, header, bar]) {
      expect(seg).not.toMatch(/text-pos/);
      expect(seg).not.toMatch(/bg-pos/);
      expect(seg).not.toMatch(/182,255,61/);
    }
  });
  it("the active pill and rail bar glow in the tab's tone (motion layoutId pills kept)", () => {
    const rail = shell.slice(shell.indexOf("function RailLink"), shell.indexOf("export function AppShell"));
    expect(rail).toMatch(/layoutId="rail-active"[\s\S]*?backgroundColor: tint\(tone, 0\.1\)/);
    expect(rail).toMatch(/layoutId="rail-bar"[\s\S]*?backgroundColor: tone, boxShadow: `0 0 10px \$\{tint\(tone, 0\.7\)\}`/);
    const bar = shell.slice(shell.lastIndexOf("<nav"), shell.lastIndexOf("</nav>"));
    expect(bar).toMatch(/layoutId="tab-active"[\s\S]*?backgroundColor: tint\(tone, 0\.15\)/);
  });
  it("press affordance and reduced-motion (INSTANT transition) survive", () => {
    expect(shell).toMatch(/const slide = reduced \? INSTANT : SLIDE;/);
    expect((shell.match(/className="press |className=\{`press /g) ?? []).length).toBe(3);
  });
});
