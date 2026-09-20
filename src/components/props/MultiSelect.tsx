"use client";

import { useEffect, useRef } from "react";

export function MultiSelect({ label, options, value, onChange, title }: { title?: string; label: string; options: readonly { key: string; label: string }[]; value: readonly string[]; onChange: (value: string[]) => void }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const all = options.length > 0 && options.every(o => value.includes(o.key));

  useEffect(() => {
    const closeOutside = (event: Event) => {
      const details = detailsRef.current;
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) {
        details.open = false;
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      const details = detailsRef.current;
      if (event.key !== "Escape" || !details?.open) return;
      const restoreFocus = details.contains(document.activeElement);
      details.open = false;
      if (restoreFocus) details.querySelector("summary")?.focus();
    };
    // Capture also dismisses when another control stops propagation. Checkbox clicks stay inside.
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("focusin", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("focusin", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <details ref={detailsRef} className="discovery-select relative min-w-0 flex-1 rounded-lg border border-white/10 bg-surface-2">
      <summary title={title} className="cursor-pointer truncate px-2 py-2 text-[11px] font-bold text-text" aria-label={label}>
        {label}: {all ? "All" : value.length ? options.filter(o => value.includes(o.key)).map(o => o.label).join(", ") : "None"}
      </summary>
      <div className="discovery-menu absolute left-0 top-full z-30 mt-1 max-h-64 min-w-48 overflow-y-auto rounded-lg border border-white/20 bg-surface p-2 shadow-xl">
        <div className="mb-1 flex justify-between gap-3 text-[11px] font-bold">
          <button type="button" className="font-bold text-white" onClick={() => onChange(options.map(o => o.key))}>Select All</button>
          <button type="button" className="font-bold text-text" onClick={() => onChange([])}>Clear</button>
        </div>
        {options.map(o => (
          <label key={o.key} className="flex min-h-8 cursor-pointer items-center justify-between gap-3 py-1 text-[11px] font-bold text-text">
            <span className="min-w-0 flex-1">{o.label}</span>
            <input type="checkbox" className="ml-auto shrink-0" checked={value.includes(o.key)} onChange={() => onChange(value.includes(o.key) ? value.filter(v => v !== o.key) : [...value, o.key])} />
          </label>
        ))}
      </div>
    </details>
  );
}
