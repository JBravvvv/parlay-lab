import { PAPER } from "@/lib/paper-mode";

/**
 * The paper-regime banner (2026-08-15, Josh's word: "all hypothetical money to track").
 * Sits under the page header on every money surface so no number on the page can be
 * mistaken for a real-money position.
 *
 * PHONE (2026-09-19): one short line below 640px — the full sentence, with the epoch dates, from sm up.
 */
export function PaperBanner() {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl border border-gold/40 bg-gold/10 px-3 py-1.5 text-[11px] text-gold sm:mb-4 sm:rounded-(--radius-panel) sm:px-4 sm:py-2.5 sm:text-[12px]">
      <span className="font-bold uppercase tracking-[0.12em]">Paper mode</span>
      <span className="text-text/80 sm:hidden">
        hypothetical ${PAPER.daily}/day + ${PAPER.fun} fun · nothing is real money
      </span>
      <span className="hidden text-text/80 sm:inline">
        hypothetical ${PAPER.daily}/day on the card (${PAPER.dailyBefore}/day before {PAPER.dailySince}) + ${PAPER.fun}/day fun since{" "}
        {PAPER.since} — locked and graded daily, nothing is placed with real money
      </span>
    </div>
  );
}
