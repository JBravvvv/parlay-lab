import { fmtMoney } from "@/lib/format";

/** Suggested stake chip — always whole dollars, always labeled ¼K. */
export function KellyChip({ stake, className = "" }: { stake: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-(--radius-chip) border border-line-2 bg-surface-2 px-1.5 py-0.5 ${className}`}
    >
      <span className="text-[9px] font-bold uppercase tracking-wide text-faint">¼K</span>
      <span className="num text-[11px] font-semibold text-text">{fmtMoney(stake)}</span>
    </span>
  );
}
