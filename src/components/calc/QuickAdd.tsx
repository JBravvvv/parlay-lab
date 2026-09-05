"use client";

/**
 * Quick-add strip (INSTRUCTION 40, 2026-09-05): the prices a bettor reaches for most,
 * one tap each. Tapping fills the first empty leg, or adds a new leg when every box is
 * full. A `.chip-row` — one horizontal line, hidden scrollbar, snap per chip.
 */
export const QUICK_PRICES = [-110, -115, -120, -150, -200, 100, 120, 150, 200, 250, 300, 400] as const;

export function QuickAdd({ onPick }: { onPick: (american: number) => void }) {
  return (
    <div className="chip-row -mx-1 px-1" role="group" aria-label="Quick add a common price">
      {QUICK_PRICES.map((p) => {
        const plus = p > 0;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            className={`press num h-[44px] rounded-xl border px-3.5 text-[13.5px] font-bold ${
              plus
                ? "border-pos/30 bg-pos/[0.07] text-pos hover:bg-pos/[0.14]"
                : "border-line-2 bg-white/[0.04] text-text hover:bg-white/[0.08]"
            }`}
          >
            {plus ? `+${p}` : p}
          </button>
        );
      })}
    </div>
  );
}
