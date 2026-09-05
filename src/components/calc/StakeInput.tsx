"use client";

/**
 * Stake (INSTRUCTION 40, 2026-09-05): one tall money box — 44px+ tap target, decimal
 * keypad — with four preset chips under it ($10 / $25 / $50 / $100). Tapping a chip sets
 * the stake outright; the box stays free-form for any amount.
 */
export const STAKE_PRESETS = [10, 25, 50, 100] as const;

export function StakeInput({
  value,
  onChange,
  valid,
}: {
  value: string;
  onChange: (v: string) => void;
  /** false paints the red rim; an empty box is neutral */
  valid: boolean;
}) {
  const empty = value.trim() === "";
  const current = Number(value);
  return (
    <div>
      <label className="relative block">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[18px] font-bold text-gold/80">$</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          type="text"
          autoComplete="off"
          placeholder="0.00"
          aria-label="Bet amount"
          aria-invalid={!empty && !valid}
          className={`num h-[52px] w-full rounded-2xl border bg-surface-2/80 pl-9 pr-4 text-[22px] font-bold text-text outline-none transition-[border-color,box-shadow] duration-(--dur-fast) placeholder:text-faint focus:shadow-[0_0_0_3px_rgba(199,154,59,0.18)] ${
            empty || valid ? "border-line-2 focus:border-gold/60" : "border-neg/60"
          }`}
        />
      </label>
      <div className="mt-2.5 grid grid-cols-4 gap-2">
        {STAKE_PRESETS.map((p) => {
          const on = valid && current === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => onChange(String(p))}
              aria-pressed={on}
              className={`press num h-[44px] rounded-xl border text-[14px] font-bold ${
                on
                  ? "border-gold/60 bg-gold/15 text-gold shadow-[0_0_18px_-6px_rgba(199,154,59,0.7)]"
                  : "border-line-2 bg-white/[0.03] text-muted hover:border-gold/40 hover:text-text"
              }`}
            >
              ${p}
            </button>
          );
        })}
      </div>
    </div>
  );
}
