import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * UI OVERLAY + ODDS GRID PINS (INSTRUCTION 40, 2026-09-05) — source-level guards on the
 * shared Caesars-grammar primitives. The Overlay is the FPI pop-out ("covers 60% of the
 * screen, disappears on the × top-right or a tap outside"); it must never reintroduce a
 * backdrop-filter (the iOS compositor freeze) and must keep its close affordances.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const BLUR = /backdrop-filter|backdrop-blur/;

describe("ui-overlay — Overlay.tsx", () => {
  const src = read("src/components/ui/Overlay.tsx");
  it("carries no backdrop-filter / backdrop-blur", () => {
    expect(src).not.toMatch(BLUR);
  });
  it("has the × button with aria-label \"Close\"", () => {
    expect(src).toMatch(/aria-label="Close"/);
  });
  it("closes on Escape", () => {
    expect(src).toMatch(/e\.key === "Escape"/);
  });
  it("renders through createPortal onto document.body", () => {
    expect(src).toMatch(/import \{ createPortal \} from "react-dom"/);
    expect(src).toMatch(/createPortal\(/);
    expect(src).toMatch(/document\.body,?\s*\)/);
  });
  it("backdrop click closes and the panel stops propagation", () => {
    expect(src).toMatch(/className="sheet-backdrop"[\s\S]*?onClick=\{onClose\}/);
    expect(src).toMatch(/onClick=\{\(e\) => e\.stopPropagation\(\)\}/);
  });
  it("locks body scroll, moves focus into the panel, is a labelled modal dialog", () => {
    expect(src).toMatch(/document\.body\.style\.overflow = "hidden"/);
    expect(src).toMatch(/panelRef\.current\?\.focus\(/);
    expect(src).toMatch(/role="dialog"/);
    expect(src).toMatch(/aria-modal="true"/);
    expect(src).toMatch(/aria-labelledby=\{titleId\}/);
  });
  it("is reduced-motion safe (useReducedMotion gates the translateY)", () => {
    expect(src).toMatch(/useReducedMotion\(\)/);
    expect(src).toMatch(/reduced \? 0 : \d+/);
  });
  it("exports Overlay, useOverlay and the size union", () => {
    expect(src).toMatch(/export function Overlay\(/);
    expect(src).toMatch(/export function useOverlay\(/);
    expect(src).toMatch(/export type OverlaySize = "sixty" \| "full"/);
  });
});

describe("ui-overlay — OddsGrid.tsx", () => {
  const src = read("src/components/ui/OddsGrid.tsx");
  it("is pure presentation (no fetch, no react-query, no store)", () => {
    expect(src).not.toMatch(/fetch\(|useQuery|zustand|useStore/);
    expect(src).not.toMatch(BLUR);
  });
  it("exports OddsGrid, OddsCellButton and the cell/row types", () => {
    expect(src).toMatch(/export function OddsGrid\(/);
    expect(src).toMatch(/export function OddsCellButton\(/);
    expect(src).toMatch(/export type OddsGridCell = \{/);
    expect(src).toMatch(/export type OddsGridRow = \{/);
    expect(src).toMatch(/export type OddsCellTone = "plus" \| "minus" \| "ev" \| "muted"/);
  });
  it("every cell is a real <button> that renders a muted — when empty", () => {
    expect(src).toMatch(/<button\s[\s\S]*?className=\{toneClass\(cell\)\}/);
    expect(src).toMatch(/>—</);
    expect(src).toMatch(/"is-muted"/);
    expect(src).toMatch(/"is-selected"/);
  });
});

describe("ui-overlay — globals.css classes", () => {
  const css = read("app/globals.css");
  /** all declaration blocks whose selector list mentions `.cls` */
  function rulesFor(cls: string): string {
    const esc = cls.replace(/[.-]/g, "\\$&");
    return [...css.matchAll(new RegExp(`(?:^|\\n)([^{}\\n]*\\.${esc}(?![\\w-])[^{}]*)\\{([^}]*)\\}`, "g"))].map((m) => m[2]).join("\n");
  }
  for (const cls of ["odds-cell", "odds-cell.is-plus", "odds-cell.is-selected", "odds-cell.is-muted", "carousel", "chip-row", "hero-price", "sheet-60", "sheet-backdrop"]) {
    it(`.${cls} is declared and carries no blur`, () => {
      const r = rulesFor(cls);
      expect(r.length, `.${cls} present`).toBeGreaterThan(0);
      expect(r).not.toMatch(BLUR);
    });
  }
  it(".odds-cell is a 44px touch target; .carousel snaps; .chip-row hides its scrollbar", () => {
    expect(rulesFor("odds-cell")).toMatch(/min-height:\s*44px/);
    expect(rulesFor("carousel")).toMatch(/scroll-snap-type:\s*x mandatory/);
    expect(rulesFor("chip-row")).toMatch(/scrollbar-width:\s*none/);
  });
  it(".sheet-60 is 60vh (phone) and the desktop rule caps it at 60vw", () => {
    expect(rulesFor("sheet-60")).toMatch(/height:\s*60vh/);
    expect(css).toMatch(/\.sheet-60 \{ width: min\(60vw/);
  });
  it("the INSTRUCTION 40 block as a whole has no backdrop-filter", () => {
    const i = css.indexOf("INSTRUCTION 40");
    expect(i).toBeGreaterThan(0);
    expect(css.slice(i)).not.toMatch(BLUR);
  });
});

describe("ui-overlay — TeamMark sizes", () => {
  const src = read("src/components/cfb/TeamMark.tsx");
  it("exposes xs / sm / md / lg with md between sm and lg", () => {
    expect(src).toMatch(/export type TeamMarkSize = "xs" \| "sm" \| "md" \| "lg"/);
    const m = /const PX: Record<TeamMarkSize, number> = \{ xs: (\d+), sm: (\d+), md: (\d+), lg: (\d+) \}/.exec(src);
    expect(m).not.toBeNull();
    const [xs, sm, md, lg] = m!.slice(1).map(Number);
    expect(xs < sm && sm < md && md < lg).toBe(true);
    expect(src).toMatch(/export function TeamMark\(/);
    expect(src).toMatch(/export function PairMark\(/);
    expect(src).toMatch(/export function teamHex\(/);
  });
});
