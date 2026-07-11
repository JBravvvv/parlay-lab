import { fmtEv } from "@/lib/format";

/** Signed EV% chip. Green +EV, red-orange −EV, muted at zero. */
export function EvBadge({ ev, className = "" }: { ev: number; className?: string }) {
  const tone =
    ev > 0
      ? "text-pos border-pos/40 bg-pos/10"
      : ev < 0
        ? "text-neg border-neg/40 bg-neg/10"
        : "text-muted border-line-2 bg-surface-2";
  return (
    <span
      className={`num inline-flex items-center rounded-(--radius-chip) border px-1.5 py-0.5 text-[11px] font-semibold ${tone} ${className}`}
    >
      {fmtEv(ev)}
    </span>
  );
}
