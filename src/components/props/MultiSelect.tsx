"use client";
export function MultiSelect({ label, options, value, onChange, title }: { title?: string; label: string; options: readonly { key: string; label: string }[]; value: readonly string[]; onChange: (value: string[]) => void }) {
  const all = options.length > 0 && options.every(o => value.includes(o.key));
  return <details className="discovery-select relative min-w-0 flex-1 rounded-lg border border-white/10 bg-surface-2">
    <summary title={title} className="cursor-pointer truncate px-2 py-2 text-[11px] text-text" aria-label={label}>{label}: {all ? "All" : value.length ? options.filter(o => value.includes(o.key)).map(o => o.label).join(", ") : "None"}</summary>
    <div className="discovery-menu absolute left-0 top-full z-30 mt-1 max-h-64 min-w-48 overflow-y-auto rounded-lg border border-white/20 bg-surface p-2 shadow-xl">
      <div className="mb-1 flex justify-between gap-3 text-[11px]"><button type="button" onClick={() => onChange(options.map(o => o.key))}>Select all</button><button type="button" onClick={() => onChange([])}>Clear</button></div>
      {options.map(o => <label key={o.key} className="flex cursor-pointer items-center gap-2 min-h-8 py-1 text-[11px]"><input type="checkbox" checked={value.includes(o.key)} onChange={() => onChange(value.includes(o.key) ? value.filter(v => v !== o.key) : [...value, o.key])} />{o.label}</label>)}
    </div>
  </details>;
}
