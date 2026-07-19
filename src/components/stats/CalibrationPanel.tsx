"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { FilterPill } from "@/components/ui/Pill";
import { EmptyState } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import { useCalibration } from "@/lib/useCalibration";
import type { BucketStat } from "@/engine2/calibration";

/**
 * Calibration spec 3C/3E — the reliability read. Everything shown is computed
 * from graded predictions (real box scores); nothing here is ever estimated
 * for display. Tier language matches the guardrails: MONITOR < 50 graded,
 * SOFT FLAG 50–99, HARD FLAG 100–149, ADJUST only at 150+ with significance.
 */

const MKT_LABEL: Record<string, string> = {
  ml: "Moneyline",
  rl: "Run line",
  batter_hits: "Hits",
  batter_total_bases: "Total bases",
  batter_home_runs: "HR (anytime)",
  batter_hits_runs_rbis: "H+R+RBI",
  pitcher_strikeouts: "Pitcher K's",
  pitcher_outs: "Pitcher outs",
};

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function TierChip({ tier, significant, direction }: { tier: string; significant: boolean; direction: string }) {
  if (!significant || tier === "MONITOR") {
    return (
      <span className="rounded-full border border-line-2 bg-surface-2 px-2 py-0.5 text-[9.5px] font-bold text-muted">
        {tier === "MONITOR" ? "MONITOR" : "OK"}
      </span>
    );
  }
  const hot = direction === "hot";
  const tone =
    tier === "SOFT"
      ? "border-gold/40 bg-gold/10 text-gold"
      : "border-neg/40 bg-neg/10 text-neg";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[9.5px] font-bold ${tone}`}>
      {tier === "SOFT" ? `RUNNING ${hot ? "HOT" : "COLD"}` : tier === "HARD" ? "MISCALIBRATED" : hot ? "OVERCONFIDENT" : "UNDERCONFIDENT"}
    </span>
  );
}

function ReliabilityDots({ buckets }: { buckets: BucketStat[] }) {
  // predicted (x) vs actual (y) — a well-calibrated market sits on the diagonal
  const pts = buckets.filter((b) => b.kind === "prob" && b.lu === "all");
  if (pts.length < 2) return null;
  const size = 180;
  const sc = (v: number) => 14 + v * (size - 28);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-[180px] w-[180px] shrink-0">
      <line x1={sc(0)} y1={size - sc(0)} x2={sc(1)} y2={size - sc(1)} stroke="var(--color-line-2)" strokeDasharray="3 3" />
      {pts.map((b, i) => (
        <circle
          key={i}
          cx={sc(b.predicted)}
          cy={size - sc(b.actual)}
          r={Math.min(8, 2.5 + Math.log10(Math.max(1, b.n)) * 2)}
          fill={b.significant ? "var(--color-gold)" : "var(--color-pos)"}
          opacity={0.75}
        >
          <title>{`predicted ${pct(b.predicted)} → actual ${pct(b.actual)} (n=${b.n})`}</title>
        </circle>
      ))}
    </svg>
  );
}

export function CalibrationPanel() {
  const cal = useCalibration();
  const s = cal.summary;
  const markets = s?.markets ?? [];
  const [mkt, setMkt] = useState<string | null>(null);
  const active = mkt && markets.includes(mkt) ? mkt : markets[0] ?? null;

  const probRows = useMemo(
    () => (s && active ? s.buckets.filter((b) => b.market === active && b.kind === "prob" && b.lu === "all") : []),
    [s, active],
  );
  const edgeRows = useMemo(
    () => (s && active ? s.buckets.filter((b) => b.market === active && b.kind === "edge") : []),
    [s, active],
  );
  const luRows = useMemo(
    () => (s && active ? s.buckets.filter((b) => b.market === active && b.kind === "prob" && b.lu !== "all") : []),
    [s, active],
  );

  if (!s || !s.graded) {
    return (
      <Panel>
        <EmptyState
          title="No graded predictions yet"
          body="Every board the engine generates is now logged in full — played or not — and graded nightly against official box scores. The first reliability table appears after the first graded slate; adjustment decisions need 150+ graded picks per market, so early numbers are strictly informational."
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Reveal>
        <Panel title={`Reliability by market — ${s.graded.toLocaleString()} graded predictions`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-faint">
                  <th className="pb-2">Market</th>
                  <th className="pb-2 text-right">Graded</th>
                  <th className="pb-2 text-right">Predicted</th>
                  <th className="pb-2 text-right">Actual</th>
                  <th className="pb-2 text-right">Brier</th>
                  <th className="pb-2 text-right" title="Consensus-only baseline Brier over the same records — the model has earned a raise the day it beats this">
                    vs market
                  </th>
                  <th className="pb-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="num">
                {markets.map((m) => {
                  const pm = s.perMarket[m];
                  if (!pm) return null;
                  return (
                    <tr key={m} className="border-t border-white/[0.04]">
                      <td className="py-1.5 font-sans text-text">
                        {MKT_LABEL[m] ?? m}
                        {s.quarantine.includes(m) && (
                          <span className="ml-2 rounded-full border border-neg/50 bg-neg/10 px-2 py-0.5 text-[9px] font-bold text-neg">
                            UNDER REVIEW
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-right text-muted">{pm.n}</td>
                      <td className="py-1.5 text-right">{pct(pm.predicted)}</td>
                      <td className={`py-1.5 text-right ${pm.significant ? (pm.direction === "hot" ? "text-gold" : "text-live") : "text-pos"}`}>
                        {pct(pm.actual)}
                      </td>
                      <td className="py-1.5 text-right text-muted">{pm.brier.toFixed(3)}</td>
                      <td className="py-1.5 text-right">
                        {pm.mktCmp ? (
                          <span
                            className={pm.mktCmp.model < pm.mktCmp.consensus ? "text-pos" : "text-muted"}
                            title={`Model ${pm.mktCmp.model.toFixed(3)} vs consensus ${pm.mktCmp.consensus.toFixed(3)} over the same ${pm.mktCmp.n} records`}
                          >
                            {pm.mktCmp.consensus.toFixed(3)}
                            {pm.mktCmp.model < pm.mktCmp.consensus ? " ▲" : ""}
                          </span>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                      <td className="py-1.5 text-right">
                        <TierChip tier={pm.tier} significant={pm.significant} direction={pm.direction} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-[10.5px] leading-relaxed text-faint">
            Statistical significance = the predicted rate falls outside the 95% confidence interval of the actual
            rate. Under 50 graded picks a bucket is pure variance and shows MONITOR no matter the gap; automatic
            adjustment needs 150+ AND significance, is capped at ±10% per week, and can only pull the model TOWARD
            the market consensus — never away from it. <b className="text-muted">vs market</b> is the consensus-only
            Brier over the same records (lower is better): the day the model&apos;s Brier beats it in a market (▲) is
            the day that market&apos;s blend weight has earned a raise — until then, shrink-only stands.
          </div>
        </Panel>
      </Reveal>

      {active && (
        <Reveal>
          <Panel title={`${MKT_LABEL[active] ?? active} — buckets`}>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {markets.map((m) => (
                <FilterPill key={m} selected={m === active} onClick={() => setMkt(m)}>
                  {MKT_LABEL[m] ?? m}
                </FilterPill>
              ))}
            </div>
            <div className="flex flex-wrap items-start gap-6">
              <div className="min-w-0 flex-1 overflow-x-auto">
                <table className="w-full min-w-[430px] text-[11.5px]">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-faint">
                      <th className="pb-1.5">Stated prob</th>
                      <th className="pb-1.5 text-right">n</th>
                      <th className="pb-1.5 text-right">Predicted</th>
                      <th className="pb-1.5 text-right">Actual</th>
                      <th className="pb-1.5 text-right">95% CI</th>
                      <th className="pb-1.5 text-right">Tier</th>
                    </tr>
                  </thead>
                  <tbody className="num">
                    {probRows.map((b, i) => (
                      <tr key={i} className="border-t border-white/[0.04]">
                        <td className="py-1">{b.range[0]}–{Math.min(b.range[1], 100)}%</td>
                        <td className="py-1 text-right text-muted">{b.n}</td>
                        <td className="py-1 text-right">{pct(b.predicted)}</td>
                        <td className={`py-1 text-right ${b.significant ? "text-gold" : ""}`}>{pct(b.actual)}</td>
                        <td className="py-1 text-right text-faint">{pct(b.ciLo)}–{pct(b.ciHi)}</td>
                        <td className="py-1 text-right text-faint">{b.tier}</td>
                      </tr>
                    ))}
                    {edgeRows.length > 0 && (
                      <tr>
                        <td colSpan={6} className="pt-3 pb-1 font-sans text-[10px] uppercase tracking-wider text-faint">
                          By stated edge
                        </td>
                      </tr>
                    )}
                    {edgeRows.map((b, i) => (
                      <tr key={`e${i}`} className="border-t border-white/[0.04]">
                        <td className="py-1">{b.range[0] <= -100 ? "<0" : b.range[0]}–{b.range[1] >= 1000 ? "∞" : b.range[1]}% edge</td>
                        <td className="py-1 text-right text-muted">{b.n}</td>
                        <td className="py-1 text-right">{pct(b.predicted)}</td>
                        <td className={`py-1 text-right ${b.significant ? "text-gold" : ""}`}>{pct(b.actual)}</td>
                        <td className="py-1 text-right text-faint">{pct(b.ciLo)}–{pct(b.ciHi)}</td>
                        <td className="py-1 text-right text-faint">{b.tier}</td>
                      </tr>
                    ))}
                    {luRows.map((b, i) => (
                      <tr key={`l${i}`} className="border-t border-white/[0.04]">
                        <td className="py-1">
                          {b.range[0]}–{Math.min(b.range[1], 100)}% · <span className={b.lu === "projected" ? "text-gold" : "text-muted"}>{b.lu}</span>
                        </td>
                        <td className="py-1 text-right text-muted">{b.n}</td>
                        <td className="py-1 text-right">{pct(b.predicted)}</td>
                        <td className={`py-1 text-right ${b.significant ? "text-gold" : ""}`}>{pct(b.actual)}</td>
                        <td className="py-1 text-right text-faint">{pct(b.ciLo)}–{pct(b.ciHi)}</td>
                        <td className="py-1 text-right text-faint">{b.tier}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <ReliabilityDots buckets={s.buckets.filter((b) => b.market === active)} />
                <div className="mt-1 text-center text-[9.5px] text-faint">predicted → vs actual ↑ · dot = bucket</div>
              </div>
            </div>
          </Panel>
        </Reveal>
      )}

      <Reveal>
        <Panel title="Self-correction — automatic blend-weight adjustments">
          {cal.log.length === 0 ? (
            <div className="text-[12px] text-muted">
              None yet — and by design none can happen until a market has 150+ graded picks with statistically
              significant miscalibration. Every adjustment that ever fires is listed here with before/after weights;
              nothing changes invisibly. Auto-calibration is {cal.auto === "off" ? "OFF (reporting still runs)" : "ON"}.
            </div>
          ) : (
            <div className="space-y-1.5 text-[11.5px]">
              {cal.log
                .slice()
                .reverse()
                .map((a, i) => (
                  <div key={i} className="num flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.04] pb-1.5 last:border-0">
                    <span className="font-sans text-text">{MKT_LABEL[a.market] ?? a.market}</span>
                    <span className="text-muted">
                      model weight ×{a.before.toFixed(2)} → ×{a.after.toFixed(2)} · trigger: predicted{" "}
                      {pct(a.bucket.predicted)} vs actual {pct(a.bucket.actual)} over n={a.bucket.n} ·{" "}
                      {new Date(a.at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </Panel>
      </Reveal>
    </div>
  );
}
