import { PAPER } from "@/lib/paper-mode";

/**
 * The paper-regime banner (2026-08-15, Josh's word: "all hypothetical money to track").
 * Sits under the page header on every money surface so no number on the page can be
 * mistaken for a real-money position.
 */
export function PaperBanner() {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-(--radius-panel) border border-gold/40 bg-gold/10 px-4 py-2.5 text-[12px] text-gold">
      <span className="font-bold uppercase tracking-[0.12em]">Paper mode</span>
      <span className="text-text/80">
        hypothetical ${PAPER.daily}/day on the card + ${PAPER.fun}/day fun since {PAPER.since} — locked and graded daily,
        nothing is placed with real money
      </span>
    </div>
  );
}
