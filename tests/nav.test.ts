import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NAV ORDER — Josh's instruction, verbatim (2026-09-03): "The order of the tabs on left side of
 * screen should be: Games, Stats, Board, Builder, Parlay Builder, Parlay Calculator (formerly
 * Calc) on Top Left & Ledger, The Sharp, Simulator, Settings on Bottom Left. You can remove
 * Dashboard tab as it does the same thing as pressing the ... logo in top left of screen."
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
    }));
}

describe("nav — desktop side rail", () => {
  const nav = navEntries();
  it("top group is Games, Stats, Board, Builder, Parlay Builder, Parlay Calculator — in that order", () => {
    expect(nav.filter((n) => n.group === "top").map((n) => n.label)).toEqual([
      "Games",
      "Stats",
      "Board",
      "Builder",
      "Parlay Builder",
      "Parlay Calculator",
    ]);
    expect(nav.filter((n) => n.group === "top").map((n) => n.href)).toEqual([
      "/games",
      "/stats",
      "/board",
      "/builder",
      "/props",
      "/calc",
    ]);
  });
  it("bottom group is Ledger, The Sharp, Simulator, Settings — in that order", () => {
    expect(nav.filter((n) => n.group === "bottom").map((n) => n.label)).toEqual([
      "Ledger",
      "The Sharp",
      "Simulator",
      "Settings",
    ]);
    expect(nav.filter((n) => n.group === "bottom").map((n) => n.href)).toEqual([
      "/ledger",
      "/sharp",
      "/simulator",
      "/settings",
    ]);
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
    // the brand still links home
    expect(shell).toMatch(/<Link href="\/" className="flex items-baseline/);
  });
  it("Calc was renamed Parlay Calculator", () => {
    expect(nav.find((n) => n.href === "/calc")!.label).toBe("Parlay Calculator");
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
  it("every route not in the bottom bar is an icon in the mobile top bar (all 10 pages reachable on a phone)", () => {
    expect(nav.filter((n) => !n.mobile).map((n) => n.href)).toEqual(["/calc", "/sharp", "/simulator", "/settings"]);
    // the header row derives from the same table, so nothing can fall off
    const header = shell.slice(shell.indexOf("<header"), shell.indexOf("</header>"));
    expect(header).toMatch(/NAV\.filter\(\(n\) => !n\.mobile\)\.map/);
    expect(header).toMatch(/aria-label=\{label\}/);
  });
  it("isActive semantics are unchanged", () => {
    expect(shell).toMatch(/return href === "\/" \? pathname === "\/" : pathname\.startsWith\(href\);/);
  });
});
