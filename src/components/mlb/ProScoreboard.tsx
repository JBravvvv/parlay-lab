"use client";

import { useQuery } from "@tanstack/react-query";
import { Panel } from "@/components/ui/Panel";
import { Reveal } from "@/components/motion/Reveal";
import type { LedgerEntry } from "@/lib/useLedger";

/* Pro scoreboard — the professional's health metrics, computed from the REAL
   ledger against the prop line-history archive (line-history branch):
   - CLV: our locked Caesars price vs the de-vigged cross-book close (the last
     prop snapshot before first pitch). The founding doc's north star.
   - Calibration: predicted ticket probability vs realized win rate, bucketed.
   Every number carries its sample size; under ~500 graded bets ROI is mostly
   noise and the panel says so. Nothing here is ever estimated when data is
   missing — coverage is disclosed instead. */

const RAW = "https://raw.githubusercontent.com/JBravvvv/parlay-lab/line-history/data/props";
const imp = (am: number) => (am > 0 ? 100 / (am + 100) : Math.abs(am) / (Math.abs(am) + 100));
const dec = (am: number) => (am > 0 ? 1 + am / 100 : 1 + 100 / Math.abs(am));

type SnapRow = { fair: number | null; n: number; cz: { o: number | null; u: number | null } | null };
type SnapDay = { snapshots: { t: string; events: { start: string; markets: Record<string, Record<string, SnapRow>> }[] }[] };

const MKT_OF = (prop: string): string | null => {
  const p = prop.toLowerCase();
  if (p.includes("h+r+rbi") || p.includes("hrr")) return "batter_hits_runs_rbis";
  if (p.includes("total bases") || /\btb\b/.test(p)) return "batter_total_bases";
  if (p.includes("hr") || p.includes("home run")) return "batter_home_runs";
  if (p.includes("k's") || p.includes("strikeout") || /\bk\b/.test(p)) return "pitcher_strikeouts";
  if (p.includes("out")) return "pitcher_outs";
  if (p.includes("hit")) return "batter_hits";
  return null;
};

function closeFor(day: SnapDay | null, player: string, prop: string) {
  if (!day) return null;
  const mkt = MKT_OF(prop);
  const line = prop.match(/([OU])\s*([\d.]+)/i);
  if (!mkt || !line) return null;
  const side = line[1].toUpperCase() === "U" ? "u" : "o";
  const key = `${player}|${line[2]}`;
  // walk snapshots newest-first; use the latest one taken BEFORE that game's start
  for (let i = day.snapshots.length - 1; i >= 0; i--) {
    const s = day.snapshots[i];
    for (const ev of s.events) {
      const row = ev.markets[mkt]?.[key];
      if (!row) continue;
      if (new Date(s.t).getTime() >= new Date(ev.start).getTime()) continue; // in-play snapshot — not a close
      const fair = row.fair != null ? (side === "o" ? row.fair : 1 - row.fair) : null;
      const czClose = row.cz ? (side === "o" ? row.cz.o : row.cz.u) : null;
      return { fair, czClose };
    }
  }
  return null;
}

export type Score = {
  graded: number;
  wins: number;
  clvN: number;
  clvCovered: number;
  clvAvg: number | null;
  beatClose: number | null;
  buckets: { label: string; n: number; predicted: number; actual: number }[];
};

async function build(entries: LedgerEntry[]): Promise<Score> {
  const days = new Map<string, SnapDay | null>();
  const getDay = async (date: string) => {
    if (!days.has(date)) {
      days.set(
        date,
        await fetch(`${RAW}/${date}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      );
    }
    return days.get(date)!;
  };

  let graded = 0, wins = 0, clvN = 0, clvCovered = 0, clvSum = 0, beatN = 0, beatYes = 0;
  const B = [
    { label: "<15%", lo: 0, hi: 0.15, n: 0, p: 0, w: 0 },
    { label: "15–30%", lo: 0.15, hi: 0.3, n: 0, p: 0, w: 0 },
    { label: "30–45%", lo: 0.3, hi: 0.45, n: 0, p: 0, w: 0 },
    { label: "45–60%", lo: 0.45, hi: 0.6, n: 0, p: 0, w: 0 },
    { label: "60%+", lo: 0.6, hi: 1.01, n: 0, p: 0, w: 0 },
  ];

  for (const e of entries) {
    const day = await getDay(e.date);
    for (const t of [...(e.core ?? []), ...(e.funT ?? [])]) {
      const g = e.grading?.tickets?.[t.id];
      const res = (g?.result ?? "").toLowerCase();
      if (res.includes("win") || res.includes("loss") || res === "w" || res === "l") {
        graded++;
        const won = res.includes("win") || res === "w";
        if (won) wins++;
        const p = t.prob != null ? (t.prob > 1 ? t.prob / 100 : t.prob) : null;
        if (p != null) {
          const b = B.find((x) => p >= x.lo && p < x.hi);
          if (b) {
            b.n++;
            b.p += p;
            b.w += won ? 1 : 0;
          }
        }
      }
      // CLV per leg (props only; ML/RL legs won't match and count as uncovered)
      for (const l of t.legs ?? []) {
        if (l.cz == null) continue;
        clvN++;
        const player = l.label.replace(/\s*\([A-Z]{2,3}\)\s*$/, "").trim();
        const close = closeFor(day, player, l.prop);
        if (!close || close.fair == null) continue;
        clvCovered++;
        clvSum += close.fair - imp(l.cz);
        if (close.czClose != null) {
          beatN++;
          if (dec(l.cz) > dec(close.czClose)) beatYes++;
        }
      }
    }
  }

  return {
    graded,
    wins,
    clvN,
    clvCovered,
    clvAvg: clvCovered ? clvSum / clvCovered : null,
    beatClose: beatN ? beatYes / beatN : null,
    buckets: B.filter((b) => b.n > 0).map((b) => ({ label: b.label, n: b.n, predicted: b.p / b.n, actual: b.w / b.n })),
  };
}

export function ProScoreboard({ entries }: { entries: LedgerEntry[] }) {
  const q = useQuery({
    queryKey: ["scoreboard", entries.length, entries.map((e) => e.date).join()],
    queryFn: () => build(entries),
    staleTime: 300_000,
    enabled: entries.length > 0,
  });
  if (!entries.length || !q.data) return null;
  const s = q.data;
  const pct = (x: number | null, dp = 1) => (x == null ? "—" : `${(x * 100).toFixed(dp)}%`);

  return (
    <Reveal>
      <Panel title="Pro scoreboard — CLV & calibration (the numbers that decide if this works)" className="mt-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-muted">Avg CLV vs close</div>
            <div className={`num text-[19px] font-bold ${(s.clvAvg ?? 0) > 0 ? "text-pos" : "text-text"}`}>
              {s.clvAvg == null ? "—" : `${s.clvAvg >= 0 ? "+" : ""}${(s.clvAvg * 100).toFixed(2)}pp`}
            </div>
            <div className="num text-[10px] text-faint">{s.clvCovered}/{s.clvN} legs covered</div>
          </div>
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-muted">Beat the CZ close</div>
            <div className="num text-[19px] font-bold text-text">{pct(s.beatClose)}</div>
            <div className="num text-[10px] text-faint">price better than closing price</div>
          </div>
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-muted">Graded tickets</div>
            <div className="num text-[19px] font-bold text-text">{s.graded}</div>
            <div className="num text-[10px] text-faint">{s.graded ? `${s.wins}W-${s.graded - s.wins}L` : ""}</div>
          </div>
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-muted">Verdict maturity</div>
            <div className="num text-[19px] font-bold text-gold">{Math.min(100, Math.round((s.graded / 500) * 100))}%</div>
            <div className="num text-[10px] text-faint">of the ~500 bets ROI needs</div>
          </div>
        </div>

        {s.buckets.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
              Calibration — predicted vs actual win rate
            </div>
            <div className="space-y-1">
              {s.buckets.map((b) => (
                <div key={b.label} className="num flex items-center gap-3 text-[11.5px]">
                  <span className="w-14 text-muted">{b.label}</span>
                  <span className="w-24 text-text">pred {pct(b.predicted, 0)}</span>
                  <span className={`w-24 ${Math.abs(b.actual - b.predicted) < 0.1 ? "text-pos" : "text-gold"}`}>
                    actual {pct(b.actual, 0)}
                  </span>
                  <span className="text-faint">n={b.n}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
          CLV = de-vigged cross-book closing probability minus the probability implied by your locked Caesars price
          (positive = you consistently beat the close — the strongest known predictor of long-term betting profit).
          Coverage grows as the prop-snapshot archive accumulates (it started 2026-07-12; earlier days can&apos;t be
          scored). Calibration within ±10 points of predicted is healthy. Under ~500 graded tickets, win rate and ROI
          are mostly variance — CLV converges much faster and is the number to watch.
        </p>
      </Panel>
    </Reveal>
  );
}
