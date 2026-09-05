"use client";

import { motion, useReducedMotion } from "motion/react";
import { fmtAmericanOdds, fmtCents, fmtDecimal, type LadderRung } from "@/lib/calc-math";

/**
 * Payout ladder (INSTRUCTION 40, 2026-09-05): what the SAME stake pays at 2, 3, 4 … N
 * legs, cumulative in the order entered. The full ticket (the last rung) is lit gold;
 * bar widths scale to the top rung so the compounding is visible, not just listed.
 */
export function CalcLadder({ rungs, stake }: { rungs: LadderRung[]; stake: number }) {
  const reduced = useReducedMotion();
  if (rungs.length === 0) {
    return <div className="text-[11.5px] text-faint">Two or more live legs and a stake light the ladder.</div>;
  }
  const top = rungs[rungs.length - 1].pays || 1;
  return (
    <ol className="space-y-1.5" aria-label="Payout by number of legs">
      {rungs.map((r, i) => {
        const last = i === rungs.length - 1;
        const w = Math.max(6, (r.pays / top) * 100);
        return (
          <li
            key={r.legs}
            className={`relative overflow-hidden rounded-xl border px-3 py-2 ${
              last ? "border-gold/40 bg-gold/[0.07]" : "border-white/[0.05] bg-white/[0.02]"
            }`}
          >
            <motion.div
              aria-hidden
              className={`absolute inset-y-0 left-0 ${last ? "bg-gold/15" : "bg-white/[0.04]"}`}
              initial={false}
              animate={{ width: `${w}%` }}
              transition={reduced ? { duration: 0 } : { duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: i * 0.03 }}
            />
            <div className="relative flex items-center gap-3">
              <span className={`num w-[54px] shrink-0 text-[11px] font-bold uppercase tracking-widest ${last ? "text-gold" : "text-muted"}`}>
                {r.legs} leg{r.legs === 1 ? "" : "s"}
              </span>
              <span className="num min-w-0 flex-1 truncate text-[11.5px] text-muted">
                {fmtAmericanOdds(r.american)} · {fmtDecimal(r.decimal)}×
              </span>
              <span className={`num shrink-0 text-[14px] font-bold ${last ? "text-gold" : "text-text"}`}>{fmtCents(r.pays)}</span>
            </div>
          </li>
        );
      })}
      <li className="num pt-1 text-right text-[10px] text-faint">on {fmtCents(stake)} · pushes removed</li>
    </ol>
  );
}
