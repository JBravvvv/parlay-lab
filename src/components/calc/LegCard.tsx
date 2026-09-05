"use client";

import { motion, useReducedMotion } from "motion/react";
import { fmtAmericanOdds, fmtDecimal, parseConfidence, parseOdds } from "@/lib/calc-math";

/**
 * Leg card (INSTRUCTION 40, 2026-09-05): one leg of the ticket. The odds box takes
 * EITHER spelling — "+150" / "-110" American or "2.50" decimal — and the card shows the
 * other one beside it, plus the leg's implied hit rate. A ± button flips the sign (the
 * phone's decimal keypad has no minus key). Optional: a "your %" confidence box (turns on
 * true probability + EV up top) and a PUSH toggle that voids the leg the way a book
 * would — it drops out of the multiplication but stays on the ticket, struck through.
 * No blur, no history navigation; every tap target is 44px tall.
 */
export type LegValue = {
  odds: string;
  conf: string;
  push: boolean;
};

export function LegCard({
  index,
  value,
  onChange,
  onRemove,
  removable,
  autoFocus,
}: {
  index: number;
  value: LegValue;
  onChange: (next: LegValue) => void;
  onRemove: () => void;
  removable: boolean;
  autoFocus?: boolean;
}) {
  const reduced = useReducedMotion();
  const parsed = parseOdds(value.odds);
  const typed = value.odds.trim() !== "";
  const bad = typed && parsed == null;
  const conf = parseConfidence(value.conf);
  const confBad = value.conf.trim() !== "" && conf == null;
  const set = (patch: Partial<LegValue>) => onChange({ ...value, ...patch });

  const flipSign = () => {
    const t = value.odds.trim();
    if (t === "") return set({ odds: "-" });
    if (t.startsWith("-")) return set({ odds: `+${t.slice(1)}` });
    if (t.startsWith("+")) return set({ odds: `-${t.slice(1)}` });
    if (/^\d+$/.test(t)) return set({ odds: `-${t}` });
  };

  const other =
    parsed == null ? null : parsed.kind === "american" ? `${fmtDecimal(parsed.decimal)}×` : fmtAmericanOdds(parsed.american);
  const implied = parsed == null ? null : (100 / parsed.decimal).toFixed(1);
  const plus = parsed != null && parsed.american > 0;

  return (
    <motion.div
      layout={!reduced}
      initial={reduced ? false : { opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? undefined : { opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className={`relative rounded-2xl border px-3.5 pb-3 pt-2.5 transition-colors ${
        value.push
          ? "border-white/[0.06] bg-white/[0.02]"
          : bad
            ? "border-neg/50 bg-neg/[0.04]"
            : parsed
              ? "border-gold/30 bg-gold/[0.05]"
              : "border-line-2 bg-surface-2/50"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="num flex h-6 min-w-6 items-center justify-center rounded-full border border-gold/40 bg-gold/10 px-1.5 text-[10.5px] font-bold text-gold">
            {index + 1}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-faint">Leg</span>
          {value.push && (
            <span className="rounded-full border border-line-2 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-widest text-muted">
              Push · voided
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => set({ push: !value.push })}
            aria-pressed={value.push}
            aria-label={`Mark leg ${index + 1} as a push`}
            className={`press h-[36px] rounded-full px-3 text-[10.5px] font-bold uppercase tracking-widest ${
              value.push ? "bg-white/[0.1] text-text" : "text-faint hover:bg-white/[0.06] hover:text-text"
            }`}
          >
            Push
          </button>
          {removable && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove leg ${index + 1}`}
              className="press flex h-[36px] w-[36px] items-center justify-center rounded-full text-[14px] text-muted hover:bg-neg/10 hover:text-neg"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className={`mt-2 flex items-stretch gap-2 ${value.push ? "opacity-45" : ""}`}>
        <button
          type="button"
          onClick={flipSign}
          aria-label={`Flip the sign of leg ${index + 1}`}
          className="press num h-[48px] w-[48px] shrink-0 rounded-xl border border-line-2 bg-white/[0.04] text-[17px] font-bold text-muted hover:text-text"
        >
          ±
        </button>
        <div className="relative min-w-0 flex-1">
          <input
            value={value.odds}
            onChange={(e) => set({ odds: e.target.value })}
            inputMode="decimal"
            type="text"
            autoComplete="off"
            autoFocus={autoFocus}
            placeholder="+150 · -110 · 2.50"
            aria-label={`Leg ${index + 1} odds`}
            aria-invalid={bad}
            disabled={value.push}
            className={`num h-[48px] w-full rounded-xl border bg-surface-2/80 px-3.5 pr-[92px] text-[19px] font-bold outline-none transition-[border-color,box-shadow] duration-(--dur-fast) placeholder:text-[13px] placeholder:font-medium placeholder:text-faint focus:shadow-[0_0_0_3px_rgba(199,154,59,0.18)] ${
              value.push ? "line-through" : ""
            } ${bad ? "border-neg/60 text-neg" : "border-line-2 focus:border-gold/60"} ${plus ? "text-pos" : "text-text"}`}
          />
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-right">
            <div className="num text-[13px] font-semibold leading-none text-gold">{other ?? "—"}</div>
            <div className="num mt-1 text-[9.5px] leading-none text-faint">{implied ? `${implied}% implied` : bad ? "not a price" : "or decimal"}</div>
          </div>
        </div>
      </div>

      <div className={`mt-2 flex items-center gap-2 ${value.push ? "opacity-45" : ""}`}>
        <span className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-faint">Your %</span>
        <input
          value={value.conf}
          onChange={(e) => set({ conf: e.target.value })}
          inputMode="decimal"
          type="text"
          autoComplete="off"
          placeholder="optional · e.g. 55"
          aria-label={`Leg ${index + 1} confidence percent`}
          aria-invalid={confBad}
          disabled={value.push}
          className={`num h-[44px] min-w-0 flex-1 rounded-xl border bg-surface-2/60 px-3 text-[14px] font-semibold text-text outline-none transition-[border-color] duration-(--dur-fast) placeholder:text-[11.5px] placeholder:font-medium placeholder:text-faint ${
            confBad ? "border-neg/60" : "border-line-2 focus:border-gold/50"
          }`}
        />
        <span className="num w-[54px] shrink-0 text-right text-[11px] text-muted">
          {conf != null && parsed ? `${((conf * parsed.decimal - 1) * 100).toFixed(0)}% EV` : ""}
        </span>
      </div>
    </motion.div>
  );
}
