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
};

/**
 * Dense-but-breathable table: sticky header, sortable columns, hover rows,
 * horizontal scroll contained inside the panel (the page never scrolls
 * sideways). `stagger` reveals rows with a fast cascade on first render;
 * `rowClassName` lets callers light rows up (e.g. .ev-glow on +EV rows).
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  maxHeight = "62vh",
  stagger = false,
  rowClassName,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  maxHeight?: string;
  stagger?: boolean;
  rowClassName?: (row: T) => string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const sv = col.sortValue;
    return [...rows].sort((a, b) => {
      const va = sv(a);
      const vb = sv(b);
      if (va === vb) return 0;
      return (va < vb ? -1 : 1) * sort.dir;
    });
  }, [rows, sort, columns]);

  return (
    <div
      className="overflow-auto rounded-[16px] border border-white/[0.05]"
      style={{ maxHeight }}
    >
      <table className="w-full border-collapse text-[12.5px]">
        <thead className="sticky top-0 z-10 bg-surface-2/90 backdrop-blur">
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
                  className={`whitespace-nowrap border-b border-white/[0.06] px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] ${
                    c.numeric ? "text-right" : "text-left"
                  } ${active ? "text-pos" : "text-muted"} ${c.sortValue ? "cursor-pointer select-none hover:text-text" : ""}`}
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
              style={stagger ? { animationDelay: `${i * 45}ms` } : undefined}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`whitespace-nowrap px-3 py-2.5 ${c.numeric ? "num text-right" : ""} ${c.className ?? ""}`}
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
