"use client";

import { useEffect, useRef, useState } from "react";
import { fmtAmerican } from "@/lib/format";

function display(odds: number | string): string {
  return typeof odds === "number" ? fmtAmerican(odds) : String(odds);
}
function numeric(odds: number | string): number {
  return typeof odds === "number" ? odds : Number(String(odds).replace(/[^\d.-]/g, "")) || 0;
}

/**
 * A price. Renders mono/tabular and flashes green/red when the odds move.
 * Accepts the engine's American strings ("+126") or plain numbers.
 * `book`: "caesars" tints the price gold — the playable layer is always gold.
 */
export function OddsCell({
  odds,
  book,
  className = "",
}: {
  odds: number | string;
  book?: "caesars" | "best";
  className?: string;
}) {
  const n = numeric(odds);
  const prev = useRef(n);
  const [flash, setFlash] = useState<"" | "flash-up" | "flash-down">("");

  useEffect(() => {
    if (prev.current !== n) {
      setFlash(n > prev.current ? "flash-up" : "flash-down");
      prev.current = n;
      const t = setTimeout(() => setFlash(""), 950);
      return () => clearTimeout(t);
    }
  }, [n]);

  const tone = book === "caesars" ? "text-gold" : "text-text";
  return (
    <span
      className={`num inline-block rounded px-1 py-0.5 text-[13px] font-semibold ${tone} ${flash} ${className}`}
    >
      {display(odds)}
    </span>
  );
}
