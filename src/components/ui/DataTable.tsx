"use client";

import { useMemo, useState, type ReactNode } from "react";

export type Column<T> = {
  key: string;
  header: string;
  /** right-align numeric columns (they also render .num) */
  numeric?: boolean;
  sortValue?: (row: T) => number | string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** pin the column at this px offset while the table scrolls sideways */
  stickyLeft?: number;
  /** shrink the column to its content (a grade chip, a price) instead of taking a share of the
      table's spare width — Josh (2026-09-18): "shrink the grade column horizontally so everything
      in the box fits on one screen. There is no reason for it to be that long." */
  fit?: boolean;
  /** hover text on the header — lets a short header ("Book") keep its long meaning */
  headerTitle?: string;
  /** drop the column below 640px (2026-09-19: the phone board "can only see Pick, Grade and Fair") */
  hideBelowSm?: boolean;
};

/**
 * Dense-but-breathable table: sticky header, sortable columns, hover rows,
 * horizontal scroll contained inside the panel (the page never scrolls
 * sideways). `stagger` reveals rows with a fast cascade on first render —
 * the delay is capped at STAGGER_CAP rows so a long table (the CFB picks
 * ALL scope, the MLB board) never leaves rows invisible for seconds;
 * `rowClassName` lets callers light rows up (e.g. .ev-glow on +EV rows).
 */
/** rows past this index share one delay: 12 × 45 ms = 0.54 s, then everything is on screen */
export const STAGGER_CAP = 12;

export type SortState = { key: string; dir: 1 | -1 };

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  maxHeight = "62vh",
  stagger = false,
  rowClassName,
  defaultSort = null,
  resetKey,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  maxHeight?: string;
  stagger?: boolean;
  rowClassName?: (row: T) => string;
  /** the column the table opens sorted on, arrow shown — so the FIRST tap visibly flips it (INSTRUCTION 69) */
  defaultSort?: SortState | null;
  /** when this changes (a different view: scope, tab, book) the sort goes back to `defaultSort` —
      one view's ▲ never silently rides into the next (INSTRUCTION 69) */
  resetKey?: string;
}) {
  const [sort, setSort] = useState<SortState | null>(defaultSort);
  const [seenReset, setSeenReset] = useState(resetKey);
  if (seenReset !== resetKey) {
    setSeenReset(resetKey);
    setSort(defaultSort);
  }

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const sv = col.sortValue;
    return [...rows].sort((a, b) => {
      const va = sv(a);
      const vb = sv(b);
      if (va === vb) return 0;
      // NaN compares false both ways and would freeze the order — an unreadable value sinks
      if (typeof va === "number" && Number.isNaN(va)) return 1;
      if (typeof vb === "number" && Number.isNaN(vb)) return -1;
      return (va < vb ? -1 : 1) * sort.dir;
    });
  }, [rows, sort, columns]);

  return (
    <div
      className="glass-table overflow-auto rounded-[16px] border border-white/[0.05]"
      style={{ maxHeight }}
    >
      <table className="w-full border-collapse text-[12.5px]">
        <thead className="sticky top-0 z-10 bg-surface-2/95">
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  onClick={
                    c.sortValue
                      ? () =>
                          setSort((s) =>
                            s?.key === c.key
                              ? { key: c.key, dir: s.dir === 1 ? -1 : 1 }
                              : { key: c.key, dir: -1 },
                          )
                      : undefined
                  }
                  className={`whitespace-nowrap border-b border-white/[0.06] px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] ${
                    c.numeric ? "text-right" : "text-left"
                  } ${active ? "text-pos" : "text-muted"} ${c.sortValue ? "cursor-pointer select-none hover:text-text" : ""} ${
                    c.stickyLeft != null ? "sticky z-20 bg-surface-2" : ""
                  } ${c.fit ? "w-px" : ""} ${c.hideBelowSm ? "hidden sm:table-cell" : ""}`}
                  style={c.stickyLeft != null ? { left: c.stickyLeft } : undefined}
                  title={c.headerTitle}
                >
                  {c.header}
                  {active && <span className="ml-1">{sort!.dir === 1 ? "▲" : "▼"}</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr
              key={rowKey(r)}
              className={`border-b border-white/[0.04] transition-colors duration-(--dur-fast) last:border-0 hover:bg-white/[0.04] ${
                stagger ? "row-in" : ""
              } ${rowClassName?.(r) ?? ""}`}
              style={stagger ? { animationDelay: `${Math.min(i, STAGGER_CAP) * 45}ms` } : undefined}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`whitespace-nowrap px-2 py-1.5 ${c.numeric ? "num text-right" : ""} ${
                    c.stickyLeft != null ? "sticky z-10 bg-bg" : ""
                  } ${c.fit ? "w-px" : ""} ${c.hideBelowSm ? "hidden sm:table-cell" : ""} ${c.className ?? ""}`}
                  style={c.stickyLeft != null ? { left: c.stickyLeft } : undefined}
                >
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
