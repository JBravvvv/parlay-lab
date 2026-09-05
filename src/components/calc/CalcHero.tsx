"use client";

import { motion, useReducedMotion } from "motion/react";
import { RollingNumber } from "@/components/calc/RollingNumber";
import { fmtAmericanOdds, fmtCents, fmtDecimal } from "@/lib/calc-math";

/**
 * The PAYS hero (INSTRUCTION 40, 2026-09-05): one enormous gold number — the full
 * return with the stake back in — that rolls on every change, over the ticket's
 * combined price, its multiple, and what it WINS (profit). This is the first thing on
 * the page; everything below explains it. Gold accent (the Caesars layer): the calc is
 * sport-neutral, so it borrows neither lime (MLB) nor amber (CFB).
 *
 * `live` false → the number greys out and a hint replaces the sub-line. No blur anywhere.
 */
export function CalcHero({
  live,
  legs,
  pays,
  wins,
  american,
  decimal,
  implied,
  hint,
}: {
  live: boolean;
  legs: number;
  pays: number;
  wins: number;
  american: number;
  decimal: number;
  /** implied probability 0..1 of the whole ticket */
  implied: number;
  hint: string;
}) {
  const reduced = useReducedMotion();
  const pct = Number.isFinite(implied) ? Math.max(0, Math.min(1, implied)) : 0;
  return (
    <motion.section
      layout={!reduced}
      className={`shine relative overflow-hidden rounded-[20px] border px-5 pb-5 pt-4 ${live ? "glow-gold border-gold/35" : "border-white/[0.08]"}`}
      style={{
        background:
          "linear-gradient(155deg, rgba(199,154,59,0.16), rgba(199,154,59,0.05) 55%, rgba(241,211,138,0.08)), color-mix(in srgb, var(--color-surface) 86%, transparent)",
      }}
      aria-live="polite"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full"
        style={{ background: "radial-gradient(closest-side, rgba(199,154,59,0.22), transparent 72%)" }}
      />
      <div className="relative flex items-center justify-between gap-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-gold/80">Pays</div>
        <div className="num rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-[10.5px] font-semibold text-gold">
          {legs} {legs === 1 ? "leg" : "legs"}
        </div>
      </div>

      <div className={`hero-price is-gold relative mt-2 ${live ? "" : "opacity-35"}`} data-testid="calc-pays">
        <RollingNumber value={live ? pays : 0} format={fmtCents} />
      </div>

      <div className="relative mt-3 grid grid-cols-3 gap-2">
        <Mini label="Wins" value={live ? fmtCents(wins) : "—"} tone="pos" />
        <Mini label="Price" value={live ? fmtAmericanOdds(american) : "—"} />
        <Mini label="Multiple" value={live ? `${fmtDecimal(decimal)}×` : "—"} />
      </div>

      <div className="relative mt-4">
        <div className="flex items-center justify-between text-[9.5px] font-bold uppercase tracking-[0.18em] text-faint">
          <span>Implied hit rate</span>
          <span className="num text-muted">{live ? `${(pct * 100).toFixed(1)}%` : "—"}</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <motion.div
            className="h-full rounded-full"
            style={{ background: "linear-gradient(90deg, #c79a3b, #f1d38a)" }}
            initial={false}
            animate={{ width: `${live ? pct * 100 : 0}%` }}
            transition={reduced ? { duration: 0 } : { duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      </div>

      {!live && <div className="relative mt-3 text-[11.5px] leading-snug text-faint">{hint}</div>}
    </motion.section>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "pos" }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
      <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-faint">{label}</div>
      <div className={`num mt-0.5 truncate text-[15px] font-bold ${tone === "pos" ? "text-pos" : "text-text"}`}>{value}</div>
    </div>
  );
}
