import { fmtPct } from "@/lib/format";

/** Horizontal probability bar with a mono % readout. */
export function ProbBar({ p, className = "" }: { p: number; className?: string }) {
  const pct = Math.max(0, Math.min(1, p));
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full bg-pos/80"
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      <span className="num w-11 text-right text-[11px] text-muted">{fmtPct(pct)}</span>
    </div>
  );
}
