"use client";

import { Fragment, useEffect, useRef, useId, useState } from "react";

export function MultiSelect({ label, options, value, onChange, title, single = false }: { single?: boolean; title?: string; label: string; options: readonly { key: string; label: string; group?: string }[]; value: readonly string[]; onChange: (value: string[]) => void }) {
  const groupId = useId();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [draft, setDraft] = useState<string[]>(() => [...value]);
  const selected = single ? value : draft;
  const close = () => {
    if (!detailsRef.current) return;
    detailsRef.current.open = false;
    detailsRef.current.querySelector("summary")?.focus();
  };
  const all = options.length > 0 && options.every(o => value.includes(o.key));

  const selection = !single && all ? "All" : value.length ? options.filter(o => value.includes(o.key)).map(o => o.label).join(", ") : "None";

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
    <details data-filter={label} ref={detailsRef} onToggle={e=>{const d=e.currentTarget;if(d.open){setDraft([...value]);const rect=d.getBoundingClientRect();d.dataset.align=rect.left+Math.max(rect.width,250)>window.innerWidth-12?"right":"left";d.dataset.side=window.innerHeight-rect.bottom<320 && rect.top>window.innerHeight-rect.bottom?"above":"below";}}} className="discovery-select relative min-w-0 flex-1">
      <summary title={title ?? `${label}: ${selection}`} className="discovery-trigger cursor-pointer text-[11px] font-bold text-text" aria-label={label}>
        <span className="discovery-trigger-label">{label}</span>
        <span className="discovery-trigger-value">{selection}</span>
        <svg className="discovery-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </summary>
      <div className="discovery-menu absolute left-0 top-full z-30 mt-2">
        <div className="discovery-menu-heading"><span>{label}</span><span className="discovery-count">{single ? "Choose one" : `${selected.length} selected`}</span></div>
        {!single && <div className="discovery-actions flex justify-between gap-3 text-[11px] font-bold">
          <button type="button" className="font-bold text-white" onClick={() => setDraft(options.map(o => o.key))}>Select All</button>
          <button type="button" className="font-bold text-text" onClick={() => setDraft([])}>Clear</button>
        </div>}
        <div className="discovery-options" role={single ? "radiogroup" : "group"} aria-label={`${label} options`}>
        {options.map((o, i) => (
          <Fragment key={o.key}>
          {o.group && o.group !== options[i-1]?.group && <div className="px-2 pb-1 pt-3 text-[11px] font-black uppercase tracking-wider text-violet-300">{o.group}</div>}
          <label key={o.key} data-selected={selected.includes(o.key)} className="discovery-option flex cursor-pointer items-center justify-between gap-3 text-[11px] font-bold text-text">
            <span className="min-w-0 flex-1">{o.label}</span>
            <input type={single ? "radio" : "checkbox"} name={single ? groupId : undefined} className="ml-auto shrink-0" checked={selected.includes(o.key)} onChange={() => {if(single){onChange([o.key]);close();}else setDraft(current => current.includes(o.key) ? current.filter(v => v !== o.key) : [...current, o.key]);}} />
          </label>
          </Fragment>
        ))}
        </div>
        {!single && <div className="flex gap-2 border-t border-white/15 px-2 py-2">
          <button type="button" className="press min-h-10 flex-1 rounded-lg border border-white/20 text-xs font-bold" onClick={close}>Cancel</button>
          <button type="button" className="press min-h-10 flex-1 rounded-lg bg-sky-300 px-3 text-xs font-black text-slate-950" onClick={() => {onChange(draft.filter(key => options.some(o => o.key === key)));close();}}>Apply</button>
        </div>}
      </div>
    </details>
  );
}
