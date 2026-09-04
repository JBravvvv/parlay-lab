"use client";

import { useEffect, useRef } from "react";
import { FilterPill } from "@/components/ui/Pill";
import { railLabel } from "@/lib/games";

/**
 * The Games tab's calendar: one pill per day of the season window, scrolling
 * sideways inside itself, the selected day centred on mount. "Today" replaces
 * the label on the current Pacific date.
 */
export function DateRail({ dates, date, today, onPick }: { dates: string[]; date: string; today: string; onPick: (d: string) => void }) {
  const selected = useRef<HTMLSpanElement | null>(null);
  const first = useRef(true);
  useEffect(() => {
    const el = selected.current;
    if (!el) return;
    el.scrollIntoView({ inline: "center", block: "nearest", behavior: first.current ? "instant" : "smooth" });
    first.current = false;
  }, [date]);
  return (
    <div className="-mx-4 mb-5 overflow-x-auto px-4 md:mx-0 md:px-0" style={{ scrollbarWidth: "none" }}>
      <div className="flex w-max gap-1.5">
        {dates.map((d) => (
          <span key={d} ref={d === date ? selected : undefined} className="inline-flex">
            <FilterPill
              selected={d === date}
              onClick={() => onPick(d)}
              className={`num whitespace-nowrap ${d === today && d !== date ? "border-live/50 text-live" : ""}`}
            >
              {d === today ? "Today" : railLabel(d)}
            </FilterPill>
          </span>
        ))}
      </div>
    </div>
  );
}
