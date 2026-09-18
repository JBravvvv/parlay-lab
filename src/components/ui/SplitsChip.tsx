import type { SideSplit } from "@/lib/splits";

/**
 * SPLITS CHIP (2026-09-18): "78% bets · 62% $" for the pick's OWN side — the share of tickets and
 * the share of the handle (scoresandodds / Action Network consensus). Green when the money share
 * runs ahead of the ticket share by 5+ points (bigger bets on this side), red when the tickets run
 * ahead of the money (small public bets), neutral otherwise. Renders nothing without a split —
 * a player prop, or a game the consensus page does not carry, shows no chip.
 */
export function SplitsChip({ split, className = "", compact = false }: { split: SideSplit | null | undefined; className?: string; compact?: boolean }) {
  if (!split) return null;
  const gap = split.money - split.bets;
  const tone = gap >= 5 ? "border-pos/40 bg-pos/10 text-pos" : gap <= -5 ? "border-neg/40 bg-neg/10 text-neg" : "border-line-2 bg-white/[0.04] text-muted";
  const title = `${split.bets}% of bets and ${split.money}% of the money are on this side (consensus via scoresandodds.com / Action Network)${gap >= 5 ? " — the money is heavier than the ticket count" : gap <= -5 ? " — many small tickets, less of the handle" : ""}`;
  return (
    <span data-splits-chip className={`num inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-px text-[9px] font-semibold leading-tight ${tone} ${className}`} title={title}>
      {compact ? (
        <>
          <span>{split.bets}%</span>
          <span className="opacity-60">·</span>
          <span>{split.money}%$</span>
        </>
      ) : (
        <>
          <span>{split.bets}% bets</span>
          <span className="opacity-60">·</span>
          <span>{split.money}% $</span>
        </>
      )}
    </span>
  );
}
