import { hitTone, windowLabel } from "@/lib/prop-hit-rate";

/**
 * THE HIT-RATE CHIP (2026-09-18, Josh: "incorporate analytics on how often players are achieving
 * the selected prop we are viewing over the last 7, 15, 30 60 & 120 games"). One small badge —
 * "L15 · 11/15 · 73%" — drawn wherever a prop line is shown: the board row, a generated slot, a
 * Picks-page pick. The numbers are a count over games already played (src/lib/prop-hit-rate.ts),
 * never a projection, and the colour is only a reading aid: pink from 60%, gold from 45%, red
 * below. Pure render: no fetch, no state.
 */
const TONE = {
  pos: "border-pos/40 bg-pos/10 text-pos",
  gold: "border-gold/40 bg-gold/10 text-gold",
  neg: "border-neg/40 bg-neg/10 text-neg",
} as const;

export function HitChip({
  stat,
  window,
  className = "",
}: {
  stat: { n: number; hits: number; rate: number } | null | undefined;
  window: number;
  className?: string;
}) {
  if (!stat || stat.n <= 0) return null;
  const pct = Math.round(stat.rate * 100);
  return (
    <span
      data-hit-chip
      title={`Cleared this line in ${stat.hits} of the last ${stat.n} games that counted`}
      className={`num inline-flex h-[15px] shrink-0 items-center gap-[3px] rounded-[4px] border px-1 text-[8.5px] font-bold leading-none ${TONE[hitTone(stat.rate)]} ${className}`}
    >
      <span className="opacity-70">{windowLabel(window)}</span>
      <span>{stat.hits}/{stat.n}</span>
      <span>{pct}%</span>
    </span>
  );
}

/** the last ten games as a strip of dots, oldest on the left — a glance says "hot" or "cold" */
export function HitDots({ dots, className = "" }: { dots: readonly boolean[] | null | undefined; className?: string }) {
  if (!dots?.length) return null;
  return (
    <span data-hit-dots aria-hidden className={`inline-flex shrink-0 items-center gap-[2px] ${className}`}>
      {dots.map((hit, i) => (
        <span key={i} className={`h-[5px] w-[5px] rounded-full ${hit ? "bg-pos" : "bg-white/15"}`} />
      ))}
    </span>
  );
}
