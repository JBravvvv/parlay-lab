"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { FilterPill } from "@/components/ui/Pill";
import { Reveal } from "@/components/motion/Reveal";
import { useLedger } from "@/lib/useLedger";
import { clvByMarket, clvLegRows, clvTrend, filterClv, meanSE } from "@/lib/clv-report";
import type { SyncEntry } from "@/lib/ledger-merge";
import { todayStr } from "@/lib/engine-client";

/**
 * Hardening Phase 2 — the CLV scoreboard. Positive CLV through a losing
 * stretch = the system is working; negative CLV through a winning stretch =
 * luck, not edge. Every figure derives from prices stored live at lock and at
 * the last pre-pitch sighting; nothing is reconstructed (docs/clv.md).
 */

const MKT_LABEL: Record<string, string> = {
  ml: "Moneyline",
  rl: "Run line",
  batter_hits: "Hits",
  batter_total_bases: "Total bases",
  batter_home_runs: "HR",
  batter_hits_runs_rbis: "H+R+RBI",
  pitcher_strikeouts: "K's",
  pitcher_outs: "Outs",
};
const MODE_LABEL: Record<string, string> = {
  ev_gated: "EV-gated @ CZ",
  dk_fd: "DK/FD basis",
  probability: "True probability",
  caesars_ev: "Caesars EV",
};

const signed = (v: number | null, digits = 2, unit = "") =>
  v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(digits)}${unit}`;

function TrendLine({ pts }: { pts: { date: string; mean: number; n: number }[] }) {
  if (pts.length < 2) {
    return <div className="text-[11px] text-muted">Trend appears once two or more days carry sighted legs.</div>;
  }
  const w = 560;
  const h = 96;
  const pad = 8;
  const lo = Math.min(0, ...pts.map((p) => p.mean));
  const hi = Math.max(0, ...pts.map((p) => p.mean));
  const span = Math.max(0.5, hi - lo);
  const x = (i: number) => pad + (i / (pts.length - 1)) * (w - 2 * pad);
  const y = (v: number) => pad + (1 - (v - lo) / span) * (h - 2 * pad);
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.mean).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" preserveAspectRatio="none">
      <line x1={pad} y1={y(0)} x2={w - pad} y2={y(0)} stroke="var(--color-line-2)" strokeDasharray="3 3" />
      <polyline points={line} fill="none" stroke="var(--color-pos)" strokeWidth="1.5" />
      {pts.map((p, i) => (
        <circle key={p.date} cx={x(i)} cy={y(p.mean)} r="2.4" fill={p.mean >= 0 ? "var(--color-pos)" : "var(--color-neg)"}>
          <title>{`${p.date}: ${signed(p.mean)} pts over ${p.n} legs`}</title>
        </circle>
      ))}
    </svg>
  );
}

export function ClvPanel() {
  const { api } = useLedger();
  const rows = useMemo(() => clvLegRows(((api?.entries ?? []) as unknown) as SyncEntry[]), [api]);

  const [mkt, setMkt] = useState<string | null>(null);
  const [tier, setTier] = useState<"core" | "fun" | null>(null);
  const [dir, setDir] = useState<"O" | "U" | null>(null);
  const [mode, setMode] = useState<string | null>(null);

  const markets = useMemo(() => [...new Set(rows.map((r) => r.market))].sort(), [rows]);
  const modes = useMemo(() => [...new Set(rows.map((r) => r.mode).filter((m): m is string => m != null))].sort(), [rows]);
  const sel = useMemo(() => filterClv(rows, { market: mkt, tier, dir, mode }), [rows, mkt, tier, dir, mode]);

  const fair = useMemo(() => meanSE(sel.map((r) => r.fairPts).filter((x): x is number => x != null)), [sel]);
  const cents = useMemo(() => meanSE(sel.map((r) => r.czCents).filter((x): x is number => x != null)), [sel]);
  const byMkt = useMemo(() => clvByMarket(sel), [sel]);
  const trend = useMemo(() => clvTrend(sel, todayStr(), 30), [sel]);

  if (!rows.length) {
    return (
      <Reveal>
        <Panel title="Closing line value">
          <div className="text-[12px] leading-relaxed text-muted">
            No CLV legs yet. CLV starts clean from this deploy: a leg enters the dataset only when its lock-time
            prices AND a pre-pitch closing snapshot were both captured live — nothing is reconstructed from memory.
            The first rows appear after the next locked card&apos;s games go off.
          </div>
        </Panel>
      </Reveal>
    );
  }

  const pill = (cur: string | null, set: (v: string | null) => void, v: string | null, label: string) => (
    <FilterPill key={label} selected={cur === v} onClick={() => set(v)}>
      {label}
    </FilterPill>
  );
  const setTierS = (v: string | null) => setTier(v as "core" | "fun" | null);
  const setDirS = (v: string | null) => setDir(v as "O" | "U" | null);

  return (
    <Reveal>
      <Panel title="Closing line value — the real scoreboard">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {pill(mkt, setMkt, null, "ALL MARKETS")}
            {markets.map((m) => pill(mkt, setMkt, m, MKT_LABEL[m] ?? m))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {pill(tier, setTierS, null, "CORE + FUN")}
            {pill(tier, setTierS, "core", "CORE")}
            {pill(tier, setTierS, "fun", "FUN")}
            <span className="w-2" />
            {pill(dir, setDirS, null, "BOTH SIDES")}
            {pill(dir, setDirS, "O", "OVERS")}
            {pill(dir, setDirS, "U", "UNDERS")}
            {modes.length > 0 && <span className="w-2" />}
            {modes.length > 0 && pill(mode, setMode, null, "ALL MODES")}
            {modes.map((m) => pill(mode, setMode, m, MODE_LABEL[m] ?? m))}
          </div>
        </div>

        <div className="num mt-4 flex flex-wrap gap-8">
          <div>
            <div className="font-sans text-[9.5px] font-bold uppercase tracking-[0.18em] text-muted">
              Avg CLV · prob points
            </div>
            <div className={`text-[22px] font-semibold ${fair.mean == null ? "text-faint" : fair.mean >= 0 ? "text-pos" : "text-neg"}`}>
              {signed(fair.mean)}
            </div>
            <div className="text-[10.5px] text-faint">
              n={fair.n}
              {fair.se != null ? ` · SE ±${fair.se.toFixed(2)}` : ""}
            </div>
          </div>
          <div>
            <div className="font-sans text-[9.5px] font-bold uppercase tracking-[0.18em] text-muted">
              Avg CLV · cents vs CZ close
            </div>
            <div className={`text-[22px] font-semibold ${cents.mean == null ? "text-faint" : cents.mean >= 0 ? "text-pos" : "text-neg"}`}>
              {signed(cents.mean, 1, "¢")}
            </div>
            <div className="text-[10.5px] text-faint">
              n={cents.n}
              {cents.se != null ? ` · SE ±${cents.se.toFixed(1)}¢` : ""}
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-faint">
                <th className="pb-2">Market</th>
                <th className="pb-2 text-right">n (fair)</th>
                <th className="pb-2 text-right" title="100 × (closing consensus fair − locked consensus fair); positive = we beat the close">
                  Fair pts
                </th>
                <th className="pb-2 text-right">±SE</th>
                <th className="pb-2 text-right">n (CZ)</th>
                <th className="pb-2 text-right" title="Locked Caesars price vs the last pre-pitch Caesars price, in cents; positive = we beat the close">
                  CZ cents
                </th>
              </tr>
            </thead>
            <tbody className="num">
              {byMkt.map((r) => (
                <tr key={r.market} className="border-t border-white/[0.04]">
                  <td className="py-1.5 font-sans text-text">{MKT_LABEL[r.market] ?? r.market}</td>
                  <td className="py-1.5 text-right text-muted">{r.fair.n}</td>
                  <td className={`py-1.5 text-right ${r.fair.mean == null ? "text-faint" : r.fair.mean >= 0 ? "text-pos" : "text-neg"}`}>
                    {signed(r.fair.mean)}
                  </td>
                  <td className="py-1.5 text-right text-faint">{r.fair.se != null ? r.fair.se.toFixed(2) : "—"}</td>
                  <td className="py-1.5 text-right text-muted">{r.cents.n}</td>
                  <td className={`py-1.5 text-right ${r.cents.mean == null ? "text-faint" : r.cents.mean >= 0 ? "text-pos" : "text-neg"}`}>
                    {signed(r.cents.mean, 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5">
          <div className="mb-1 font-sans text-[9.5px] font-bold uppercase tracking-[0.18em] text-muted">
            Rolling 30 days — daily mean CLV (prob points)
          </div>
          <TrendLine pts={trend} />
        </div>

        <div className="mt-3 text-[10.5px] leading-relaxed text-faint">
          The &quot;close&quot; is the last automated pre-pitch sighting (typically inside T−45); when the feed offers
          no truer close, that last look stands and is never interpolated. Positive CLV through a losing stretch means
          the system is finding real edge; negative CLV through a winning stretch means luck. Full definitions:
          docs/clv.md.
        </div>
      </Panel>
    </Reveal>
  );
}
