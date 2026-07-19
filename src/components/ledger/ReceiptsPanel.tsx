"use client";

import { Panel } from "@/components/ui/Panel";
import { ledgerSegments, type SegRow } from "@/lib/ledger-segments";
import type { SyncEntry } from "@/lib/ledger-merge";

/**
 * Upgrade 03 — the ledger's receipt layer. P/L needs months to mean anything
 * under parlay variance; CLV points and per-market calibration mean something
 * in weeks. Every row shows n; unsighted legs are counted, never averaged.
 */

const MKT_NAME: Record<string, string> = {
  ml: "Moneyline",
  rl: "Run line",
  batter_hits: "Hits",
  batter_total_bases: "Total bases",
  batter_home_runs: "Home runs",
  batter_hits_runs_rbis: "H+R+RBI",
  pitcher_strikeouts: "Pitcher K's",
  pitcher_outs: "Pitcher outs",
};

const pts = (v: number | null) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)} pts`);
const ptsClass = (v: number | null) => (v == null ? "text-faint" : v >= 0 ? "text-pos" : "text-neg");
const money = (v: number) => `${v < 0 ? "−" : "+"}$${Math.abs(v).toFixed(0)}`;

function ClvTable({ rows, label }: { rows: SegRow[]; label: string }) {
  const shown = rows.filter((r) => r.legs > 0);
  if (!shown.length) return null;
  return (
    <div>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted">{label}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11.5px]">
          <thead>
            <tr className="text-left text-[9.5px] uppercase tracking-wider text-faint">
              <th className="py-1 pr-2">Segment</th>
              <th className="py-1 pr-2">CLV vs CZ close</th>
              <th className="py-1 pr-2">vs consensus fair</th>
              <th className="py-1">Sighted</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.seg} className="border-t border-white/[0.04]">
                <td className="py-1 pr-2 text-text">{MKT_NAME[r.seg] ?? r.seg}</td>
                <td className={`num py-1 pr-2 ${ptsClass(r.clvPts)}`}>
                  {pts(r.clvPts)}
                  {r.clvPts != null && <span className="ml-1 text-faint">(n={r.sighted})</span>}
                </td>
                <td className={`num py-1 pr-2 ${ptsClass(r.fairPts)}`}>
                  {pts(r.fairPts)}
                  {r.fairPts != null && <span className="ml-1 text-faint">(n={r.fairN})</span>}
                </td>
                <td className="num py-1 text-muted">
                  {r.sighted}/{r.legs}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ReceiptsPanel({ entries }: { entries: SyncEntry[] }) {
  const s = ledgerSegments(entries);
  if (!s.coverage.legs) return null;
  return (
    <Panel title="Receipts — CLV & leg calibration by segment">
      <div className="space-y-4">
        <div className="text-[11px] text-muted">
          Closing line sighted on <b className="num text-text">{s.coverage.sighted}/{s.coverage.legs}</b> legs
          (sightings run automatically before each first pitch). CLV is in probability points: positive = the card beat
          the close. Only sighted legs enter averages — coverage is never hidden.
        </div>

        <ClvTable rows={s.byMarket} label="By market" />
        <ClvTable rows={s.byBucket} label="By bucket" />

        {s.overrideDays.days > 0 && (
          <div className="rounded-(--radius-panel) border border-neg/30 bg-neg/5 px-3 py-2 text-[11.5px]">
            <span className="font-bold text-neg">Override days</span>{" "}
            <span className="num text-muted">
              {s.overrideDays.days} day{s.overrideDays.days === 1 ? "" : "s"} · staked ${s.overrideDays.staked} · P/L{" "}
              <b className={s.overrideDays.pl >= 0 ? "text-pos" : "text-neg"}>{money(s.overrideDays.pl)}</b> · CLV{" "}
              <span className={ptsClass(s.overrideDays.clvPts)}>{pts(s.overrideDays.clvPts)}</span>
            </span>
            <span className="ml-1 text-faint">— what allocating on NO-PLAY days actually returned</span>
          </div>
        )}

        {s.calibration.length > 0 && (
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted">
              Leg calibration — stated probability vs what happened
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr className="text-left text-[9.5px] uppercase tracking-wider text-faint">
                    <th className="py-1 pr-2">Market</th>
                    <th className="py-1 pr-2">n</th>
                    <th className="py-1 pr-2">Predicted</th>
                    <th className="py-1 pr-2">Hit (95% CI)</th>
                    <th className="py-1">Brier</th>
                  </tr>
                </thead>
                <tbody>
                  {s.calibration.map((r) => (
                    <tr key={r.market} className="border-t border-white/[0.04]">
                      <td className="py-1 pr-2 text-text">{MKT_NAME[r.market] ?? r.market}</td>
                      <td className="num py-1 pr-2 text-muted">{r.n}</td>
                      <td className="num py-1 pr-2 text-text">{(r.predicted * 100).toFixed(1)}%</td>
                      <td className="num py-1 pr-2 text-text">
                        {(r.actual * 100).toFixed(1)}%{" "}
                        <span className="text-faint">
                          ({(r.ciLo * 100).toFixed(0)}–{(r.ciHi * 100).toFixed(0)}%)
                        </span>
                      </td>
                      <td className="num py-1 text-muted">{r.brier.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-1 text-[10px] text-faint">
              Small n means wide intervals — that&apos;s the honest read, not a bug. Voids and pushes carry no
              information and are excluded.
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
