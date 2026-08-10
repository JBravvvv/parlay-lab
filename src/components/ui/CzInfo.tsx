"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The ⓘ next to every pick (2026-08-09, Josh's spec): hover shows the question, click
 * opens the toggle — "Is this pick offered at Caesars sportsbook right now?" Defaults
 * YES; NO hides the pick from the board (device-local, reversible via the reset line).
 */
export function CzInfo({ pickKey, offered, onToggle }: { pickKey: string; offered: boolean; onToggle: (k: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <span ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-label="Is this pick offered at Caesars sportsbook right now?"
        title="Is this pick offered at Caesars sportsbook right now?"
        onClick={() => setOpen((o) => !o)}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 text-[9px] font-bold text-muted transition-colors hover:border-pos hover:text-pos"
      >
        i
      </button>
      {open && (
        <span className="liquid-glass absolute left-1/2 top-6 z-30 w-56 -translate-x-1/2 rounded-[14px] bg-surface-2/95 p-3 text-left shadow-xl backdrop-blur-xl">
          <span className="block text-[11px] leading-snug text-text">Is this pick offered at Caesars sportsbook right now?</span>
          <span className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!offered) onToggle(pickKey); // flipping back to yes
                setOpen(false);
              }}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold ${offered ? "bg-pos/20 text-pos ring-1 ring-pos/50" : "text-muted hover:text-text"}`}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => {
                if (offered) onToggle(pickKey); // hide it
                setOpen(false);
              }}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold ${!offered ? "bg-neg/20 text-neg ring-1 ring-neg/50" : "text-muted hover:text-text"}`}
            >
              No
            </button>
            <span className="text-[10px] text-faint">No hides it from your board</span>
          </span>
        </span>
      )}
    </span>
  );
}
