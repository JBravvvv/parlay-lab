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
 * horizontal scroll contained inside the panel (the page never scrolls sideways).
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  maxHeight = "62vh",
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  maxHeight?: string;
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
    <div className="overflow-auto rounded-(--radius-panel) border border-line" style={{ maxHeight }}>
      <table className="w-full border-collapse text-[12.5px]">
        <thead className="sticky top-0 z-10 bg-surface-2">
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
                  className={`whitespace-nowrap border-b border-line px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] ${
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
          {sorted.map((r) => (
            <tr key={rowKey(r)} className="border-b border-line/60 last:border-0 hover:bg-surface-2/60">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`whitespace-nowrap px-3 py-2 ${c.numeric ? "num text-right" : ""} ${c.className ?? ""}`}
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
