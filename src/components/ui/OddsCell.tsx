"use client";

import { useEffect, useRef, useState } from "react";
import { fmtAmerican } from "@/lib/format";

/**
 * A price. Renders mono/tabular and flashes green/red when the odds move.
 * `book`: "caesars" tints the price gold — the playable layer is always gold.
 */
export function OddsCell({
  odds,
  book,
  className = "",
}: {
  odds: number;
  book?: "caesars" | "best";
  className?: string;
}) {
  const prev = useRef(odds);
  const [flash, setFlash] = useState<"" | "flash-up" | "flash-down">("");

  useEffect(() => {
    if (prev.current !== odds) {
      setFlash(odds > prev.current ? "flash-up" : "flash-down");
      prev.current = odds;
      const t = setTimeout(() => setFlash(""), 950);
      return () => clearTimeout(t);
    }
  }, [odds]);

  const tone = book === "caesars" ? "text-gold" : "text-text";
  return (
    <span
      className={`num inline-block rounded px-1 py-0.5 text-[13px] font-semibold ${tone} ${flash} ${className}`}
    >
      {fmtAmerican(odds)}
    </span>
  );
}
