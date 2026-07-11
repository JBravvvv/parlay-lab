"use client";

import { useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Pill, FilterPill } from "@/components/ui/Pill";
import { EmptyState } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import { useLedger, roiPct, type LedgerEntry, type TicketGrade } from "@/lib/useLedger";
import { fmtMoneyExact, fmtMoney } from "@/lib/format";

const TIP = {
  contentStyle: {
    background: "var(--color-surface-2)",
    border: "1px solid var(--color-line-2)",
    borderRadius: 10,
    fontSize: 11,
    fontFamily: "var(--font-mono)",
  },
  labelStyle: { color: "var(--color-muted)" },
} as const;

function GradePill({ g }: { g?: TicketGrade }) {
  const r = g?.result ?? "pending";
  const tone =
    r === "won"
      ? "text-pos border-pos/40 bg-pos/10"
      : r === "lost"
        ? "text-neg border-neg/40 bg-neg/10"
        : r === "push"
          ? "text-muted border-line-2 bg-surface-2"
          : r === "ungradable"
            ? "text-gold border-gold/40 bg-gold/10"
            : "text-live border-live/40 bg-live/10";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${tone}`}>
      {r}
      {r === "won" && g ? ` ${fmtMoneyExact(g.payout)}` : ""}
    </span>
  );
}

function DayCard({ e }: { e: LedgerEntry }) {
  const g = e.grading?.tickets ?? {};
  const tix = [...e.core, ...e.funT];
  return (
    <details className="glass px-4 py-3">
      <summary className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-2">
        <span className="num text-[13px] font-semibold text-text">{e.date}</span>
        <span className="flex items-center gap-2 text-[11px] text-muted">
          {e.lateLock && <span className="text-gold">late lock</span>}
          <span className="num">{tix.length} tickets · ${e.daily + e.fun}</span>
        </span>
      </summary>
      <div className="mt-3 space-y-2">
        {tix.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.04] pt-2">
            <div className="min-w-0">
              <div className="text-[12px] font-medium text-text">
                {t.bucket === "fun" && <span className="mr-1 text-gold">🎟</span>}
                {t.name}
              </div>
              <div className="text-[10.5px] text-muted">
                {t.legs.map((l) => l.label).join(" · ")}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="num text-[11px] text-muted">${t.stake}</span>
              <span className="num text-[11px] text-gold">{String(t.czOdds ?? "")}</span>
              <GradePill g={g[t.id]} />
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

export default function LedgerPage() {
  const { api } = useLedger();
  const [scope, setScope] = useState<"all" | "core" | "fun">("all");
  const [grading, setGrading] = useState(false);
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => api?.stats(scope), [api, scope]);
  const proj = api?.projection ?? null;
  const clv = api?.clv;

  const equity = useMemo(
    () => (stats?.days ?? []).map((d) => ({ date: d.date.slice(5), pl: d.cumPl, roi: d.cumRoi != null ? d.cumRoi * 100 : null })),
    [stats],
  );
  const fan = useMemo(
    () =>
      proj
        ? proj.mid.map((m, i) => ({ i, lo: proj.lo[i], mid: m, hi: proj.hi[i] }))
        : [],
    [proj],
  );

  const doGrade = async () => {
    if (!api) return;
    setGrading(true);
    try {
      const n = await api.grade();
      setNote(n > 0 ? `Grades updated for ${n} day${n === 1 ? "" : "s"}.` : "Nothing new to grade yet.");
    } finally {
      setGrading(false);
    }
  };

  const doExport = () => {
    if (!api) return;
    const blob = new Blob([api.exportText()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `parlay-lab-ledger-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setNote("Ledger exported — keep this file safe; it's your season record.");
  };

  const doImport = async (f: File) => {
    if (!api) return;
    api.importText(await f.text());
    setNote("Import merged. Locked days already here were never overwritten.");
  };

  if (!api) return null;
  const empty = api.entries.length === 0;

  return (
    <>
      <PageHeader
        title="Ledger"
        sub={`Locked cards only, since ${api.seed} — append-only, auto-graded from official MLB box scores under Caesars void rules.`}
        action={
          <div className="flex gap-2">
            <Pill variant="primary" onClick={doGrade} disabled={grading || empty}>
              {grading ? "Grading…" : "Grade now"}
            </Pill>
            <Pill variant="ghost" onClick={doExport} disabled={empty}>
              Export
            </Pill>
            <Pill variant="ghost" onClick={() => fileRef.current?.click()}>
              Import
            </Pill>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])}
            />
          </div>
        }
      />
      {note && <div className="mb-4 text-[12px] text-pos">{note}</div>}

      {empty ? (
        <Panel>
          <EmptyState
            title="No locked cards yet"
            body="Set DAILY $ / FUN $ on the Builder, lock a card, and every day lands here with results, ROI and the closing-line record. Moving from the old app? Export the ledger there and Import it here — locked days are never overwritten."
          />
        </Panel>
      ) : (
        <div className="space-y-6">
          <div className="flex gap-2">
            {(["all", "core", "fun"] as const).map((s) => (
              <FilterPill key={s} selected={scope === s} onClick={() => setScope(s)}>
                {s.toUpperCase()}
              </FilterPill>
            ))}
          </div>

          <Reveal>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Panel className={stats!.pl >= 0 ? "glow-pos" : ""}>
                <div className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-muted">Net P/L</div>
                <div className={`display num mt-1 text-[26px] ${stats!.pl >= 0 ? "text-pos" : "text-neg"}`}>
                  {fmtMoneyExact(stats!.pl)}
                </div>
              </Panel>
              <Panel>
                <div className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-muted">ROI</div>
                <div className={`display num mt-1 text-[26px] ${(stats!.roi ?? 0) >= 0 ? "text-pos" : "text-neg"}`}>
                  {roiPct(stats!.roi)}
                </div>
              </Panel>
              <Panel>
                <div className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-muted">Record</div>
                <div className="display num mt-1 text-[26px] text-text">
                  {stats!.w}-{stats!.l}
                  {stats!.push ? `-${stats!.push}` : ""}
                </div>
              </Panel>
              <Panel>
                <div className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-muted">Max drawdown</div>
                <div className="display num mt-1 text-[26px] text-text">{fmtMoney(-stats!.dd)}</div>
              </Panel>
              <Panel>
                <div className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-muted">CLV (last-seen)</div>
                <div className="display num mt-1 text-[26px] text-text">
                  {clv && clv.avg != null ? `${clv.avg >= 0 ? "+" : ""}${(clv.avg * 100).toFixed(2)}%` : "n/a"}
                </div>
                {clv && (
                  <div className="num mt-0.5 text-[10px] text-faint">
                    {clv.sighted}/{clv.tot} legs sighted pre-pitch
                  </div>
                )}
              </Panel>
            </div>
          </Reveal>

          {equity.length > 0 && (
            <Reveal>
              <div className="grid gap-4 md:grid-cols-2">
                <Panel title="Equity (cumulative P/L)">
                  <div className="h-44">
                    <ResponsiveContainer>
                      <LineChart data={equity} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                        <XAxis dataKey="date" stroke="var(--color-faint)" fontSize={10} tickLine={false} />
                        <YAxis stroke="var(--color-faint)" fontSize={10} tickLine={false} />
                        <Tooltip {...TIP} />
                        <Line type="monotone" dataKey="pl" stroke="var(--color-pos)" strokeWidth={2} dot={false} isAnimationActive />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
                <Panel title="Cumulative ROI %">
                  <div className="h-44">
                    <ResponsiveContainer>
                      <LineChart data={equity} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                        <XAxis dataKey="date" stroke="var(--color-faint)" fontSize={10} tickLine={false} />
                        <YAxis stroke="var(--color-faint)" fontSize={10} tickLine={false} />
                        <Tooltip {...TIP} />
                        <Line type="monotone" dataKey="roi" stroke="var(--color-live)" strokeWidth={2} dot={false} isAnimationActive />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
              </div>
            </Reveal>
          )}

          {proj && fan.length > 0 && (
            <Reveal>
              <Panel title={`Rest-of-season projection — ${proj.days} days at ${fmtMoney(proj.dayAmt)}/day (2,000 seeded paths)`}>
                <div className="h-52">
                  <ResponsiveContainer>
                    <AreaChart data={fan} margin={{ top: 6, right: 8, bottom: 0, left: -14 }}>
                      <XAxis dataKey="i" hide />
                      <YAxis stroke="var(--color-faint)" fontSize={10} tickLine={false} />
                      <Tooltip {...TIP} />
                      <Area type="monotone" dataKey="hi" stroke="none" fill="var(--color-pos)" fillOpacity={0.1} />
                      <Area type="monotone" dataKey="lo" stroke="none" fill="var(--color-bg)" fillOpacity={1} />
                      <Line type="monotone" dataKey="mid" stroke="var(--color-pos)" strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="mid" stroke="var(--color-pos)" strokeWidth={2} fill="none" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="num mt-2 text-[11px] text-muted">
                  Season end: 10th pct {fmtMoney(proj.endLo)} · median {fmtMoney(proj.endMid)} · 90th pct{" "}
                  {fmtMoney(proj.endHi)} — a distribution, never a promise. Paths that hit $0 stop betting.
                </div>
              </Panel>
            </Reveal>
          )}

          {stats!.bigHit && scope !== "core" && (
            <Reveal>
              <Panel className="glow-gold">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold">Biggest FUN hit</div>
                <div className="mt-1 text-[14px] text-text">
                  <span className="num font-semibold text-gold">{fmtMoneyExact(stats!.bigHit.payout)}</span> —{" "}
                  {stats!.bigHit.name} <span className="text-muted">({stats!.bigHit.date})</span>
                </div>
              </Panel>
            </Reveal>
          )}

          <Reveal>
            <div className="space-y-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Locked days</h2>
              {[...api.entries].reverse().map((e) => (
                <DayCard key={e.date} e={e} />
              ))}
            </div>
          </Reveal>
        </div>
      )}

      <div className="mt-6 text-[10.5px] text-faint">
        CLV compares your locked price to the last Caesars price seen before first pitch — the true closing
        line isn&apos;t visible without paid odds history, so coverage is disclosed. Informational only.
      </div>
    </>
  );
}
