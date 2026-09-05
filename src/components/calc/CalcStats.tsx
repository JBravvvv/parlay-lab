"use client";

import { StatTile } from "@/components/ui/StatTile";
import { EdgeMeter } from "@/components/ui/EdgeMeter";
import { ProbBar } from "@/components/ui/ProbBar";
import { fmtAmericanOdds, fmtCents, fmtDecimal } from "@/lib/calc-math";
import { fmtEv, fmtPct } from "@/lib/format";

/**
 * Live stat tiles (INSTRUCTION 40, 2026-09-05): the ticket in seven numbers. True
 * probability and EV light up only when EVERY live leg carries a "your %" — a partial
 * set is not a joint probability, so those two tiles read "—" with a nudge instead of
 * a half-truth. Below them, the model-vs-market meter (your joint % over the implied
 * line) when the user has one, else the plain implied probability bar.
 */
export function CalcStats({
  live,
  american,
  decimal,
  implied,
  trueProb,
  ev,
  pays,
  wins,
  legsFilled,
  legsLive,
}: {
  live: boolean;
  american: number;
  decimal: number;
  implied: number;
  /** joint probability from per-leg confidences, or null when not every leg has one */
  trueProb: number | null;
  /** EV % per $1 vs the implied line, or null */
  ev: number | null;
  pays: number;
  wins: number;
  /** how many legs have a per-leg confidence */
  legsFilled: number;
  legsLive: number;
}) {
  const dash = "—";
  const evTone = ev == null ? "muted" : ev > 0 ? "pos" : ev < 0 ? "neg" : "muted";
  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <StatTile label="Combined odds" value={live ? fmtAmericanOdds(american) : dash} tone="gold" />
        <StatTile label="Decimal" value={live ? `${fmtDecimal(decimal)}×` : dash} />
        <StatTile label="Implied prob" value={live ? fmtPct(implied) : dash} sub="what the price says" />
        <StatTile
          label="True prob"
          value={live && trueProb != null ? fmtPct(trueProb) : dash}
          sub={trueProb != null ? "your legs, multiplied" : `your % on ${legsFilled}/${legsLive} legs`}
          tone={trueProb != null ? "gold" : "muted"}
        />
        <StatTile
          label="EV vs implied"
          value={live && ev != null ? fmtEv(ev) : dash}
          sub={ev != null ? "per $1, your read vs the line" : "needs your % on every leg"}
          tone={evTone}
        />
        <StatTile label="Payout" value={live ? fmtCents(pays) : dash} tone="gold" sub={live ? `wins ${fmtCents(wins)}` : undefined} />
      </div>
      <div className="mt-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
        {live && trueProb != null ? (
          <EdgeMeter fair={trueProb} mkt={implied} />
        ) : (
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[9.5px] font-bold uppercase tracking-[0.18em] text-faint">
              <span>Implied hit rate</span>
              <span>add your % per leg to see edge</span>
            </div>
            <ProbBar p={live ? implied : 0} />
          </div>
        )}
      </div>
    </div>
  );
}
