"use client";

import type { ReactNode } from "react";

/**
 * ODDS GRID (INSTRUCTION 40, 2026-09-05): the Caesars-style market grid a game card carries —
 * the two teams stacked on the left, N price columns on the right (Spread / Money / Total), every
 * price a tappable pill with the line small above the price. Pure presentation: the caller owns
 * selection state, the slip, and every number. A missing cell renders a muted "—" and is inert.
 *
 * CSS lives in app/globals.css: .odds-grid, .odds-grid-head, .odds-grid-row, .odds-cell
 * (+ .is-plus / .is-minus / .is-ev / .is-selected / .is-muted). No blur filter anywhere.
 */
export type OddsCellTone = "plus" | "minus" | "ev" | "muted";

export type OddsGridCell = {
  /** the line, drawn small above the price ("-3.5", "O 52.5") */
  line?: string;
  /** the price, mono bold ("+126", "-110") */
  price?: string;
  /** "plus" lights the price in the accent; "ev" lights the whole pill; "muted" dims it */
  tone?: OddsCellTone;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  /** accessible name — defaults to "<line> <price>" */
  aria?: string;
};

export type OddsGridRow = {
  /** the team block (TeamMark + name + QB/pitcher line), any node */
  team: ReactNode;
  cells: OddsGridCell[];
  key?: string;
};

export type OddsGridProps = {
  columns: string[];
  rows: OddsGridRow[];
  /** "cfb" swaps the selected ring + plus tint to amber, "nfl" to blue; default lime */
  tone?: "pos" | "cfb" | "nfl";
  /** width of the team column (CSS length); default "minmax(96px, 1fr)" — a floor, because the
      price tracks below grow to their max BEFORE the fr track is sized (CSS Grid §12.6 before
      §12.7): at 375px the team column collapsed to 49px and the abbreviation vanished */
  teamWidth?: string;
  className?: string;
};

function toneClass(c: OddsGridCell): string {
  const empty = c.price == null && c.line == null;
  const parts: string[] = ["odds-cell", "press"];
  if (empty || c.tone === "muted") parts.push("is-muted");
  else if (c.tone === "plus") parts.push("is-plus");
  else if (c.tone === "minus") parts.push("is-minus");
  else if (c.tone === "ev") parts.push("is-ev");
  if (c.selected) parts.push("is-selected");
  return parts.join(" ");
}

export function OddsCellButton({ cell }: { cell: OddsGridCell }) {
  const empty = cell.price == null && cell.line == null;
  const label = cell.aria ?? [cell.line, cell.price].filter(Boolean).join(" ");
  const inert = empty || cell.disabled || !cell.onClick;
  return (
    <button
      type="button"
      className={toneClass(cell)}
      onClick={inert ? undefined : cell.onClick}
      disabled={inert}
      aria-pressed={cell.onClick ? !!cell.selected : undefined}
      aria-label={empty ? "no line" : label || undefined}
    >
      {empty ? (
        <span className="odds-cell-price num">—</span>
      ) : (
        <>
          {cell.line != null && <span className="odds-cell-line num">{cell.line}</span>}
          {cell.price != null && <span className="odds-cell-price num">{cell.price}</span>}
        </>
      )}
    </button>
  );
}

export function OddsGrid({ columns, rows, tone = "pos", teamWidth = "minmax(96px, 1fr)", className = "" }: OddsGridProps) {
  const n = Math.max(1, columns.length);
  // measured at a 319px card (375px phone): team 96px, three 68px price pills — the 32px mark + abbreviation + score fit
  const template = `${teamWidth} repeat(${n}, minmax(60px, 72px))`;
  return (
    <div className={`odds-grid ${tone === "cfb" ? "is-cfb" : tone === "nfl" ? "is-nfl" : ""} ${className}`} role="table" aria-label="Odds">
      <div className="odds-grid-head" role="row" style={{ gridTemplateColumns: template }}>
        <span aria-hidden />
        {columns.map((c) => (
          <span key={c} role="columnheader">
            {c}
          </span>
        ))}
      </div>
      {rows.map((r, i) => (
        <div key={r.key ?? i} className="odds-grid-row" role="row" style={{ gridTemplateColumns: template }}>
          <div className="min-w-0" role="rowheader">
            {r.team}
          </div>
          {columns.map((c, j) => (
            <div key={c} role="cell">
              <OddsCellButton cell={r.cells[j] ?? {}} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
