import { leanPct, type PropLean } from "@/lib/prop-lean";

export const LEAN_TITLE_PREFIX = "Price-implied lean, not a bet count";

/**
 * LEAN CHIP (2026-09-18) — the player-prop sibling of SplitsChip. Books publish no ticket / handle
 * splits on props, so this chip shows what the two-way price implies instead: the vig-free share of
 * the over/under pair at the settlement book ("lean 57% O · 43% U"). The juice moves toward the side
 * taking money, so it is a real read of where the market sits — but it is derived from a price,
 * never counted, and the tooltip says so in the first five words. Renders nothing without a pair
 * (anytime HR / anytime TD have no under to remove the vig against).
 *
 * `side` narrows it to the pick's own side ("57% lean") for a ranked pick or a Board row.
 */
export function LeanChip({
  lean,
  side,
  className = "",
  compact = false,
}: {
  lean: PropLean | null | undefined;
  side?: "o" | "u" | "over" | "under" | "yes";
  className?: string;
  compact?: boolean;
}) {
  if (!lean) return null;
  const own = side ? leanPct(lean, side) : null;
  const at = lean.book ? ` at ${lean.book}` : " across the posted books";
  const title = `${LEAN_TITLE_PREFIX}: the vig-free share of the over/under price${at} — ${lean.over}% Over · ${lean.under}% Under. Books do not publish ticket or money splits on player props; the juice moves toward the side taking action, so this is the market's own read.`;
  const tone = "border-line-2 bg-white/[0.04] text-muted";
  return (
    <span data-lean-chip className={`num inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-px text-[9px] font-semibold leading-tight ${tone} ${className}`} title={title}>
      {own != null ? (
        <>
          <span className="font-bold text-text/90">{`${own.toFixed(0)}%`}</span>
          <span className="opacity-70">{compact ? "lean" : "mkt lean"}</span>
        </>
      ) : (
        <>
          {!compact && <span className="opacity-70">lean</span>}
          <span className={lean.side === "over" ? "font-bold text-text/90" : ""}>{`${lean.over.toFixed(0)}% O`}</span>
          <span className="opacity-60">·</span>
          <span className={lean.side === "under" ? "font-bold text-text/90" : ""}>{`${lean.under.toFixed(0)}% U`}</span>
        </>
      )}
    </span>
  );
}
