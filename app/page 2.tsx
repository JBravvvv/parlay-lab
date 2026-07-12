"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { Glow } from "@/components/ui/Glow";
import { EvBadge } from "@/components/ui/EvBadge";
import { OddsCell } from "@/components/ui/OddsCell";
import { EmptyState } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import { CountUp } from "@/components/motion/CountUp";
import { useLedger, roiPct } from "@/lib/useLedger";
import { cachedBoard, getMoney } from "@/lib/engine-client";
import { fmtMoneyExact } from "@/lib/format";
import type { PickRow } from "@/engine";

export default function DashboardPage() {
  const { api } = useLedger();
  const stats = useMemo(() => api?.stats("all"), [api]);
  const board = typeof window !== "undefined" ? cachedBoard() : null;
  const money = typeof window !== "undefined" ? getMoney() : { bankroll: 750, daily: 0, fun: 0 };

  const equity = money.bankroll + (stats?.pl ?? 0);
  const spark = (stats?.days ?? []).map((d) => ({ pl: d.cumPl }));

  const topEdges: PickRow[] = useMemo(() => {
    if (!board) return [];
    return Object.entries(board.data.categories)
      .filter(([k]) => k !== "all")
      .flatMap(([, v]) => v)
      .filter((r) => r.cz != null && Number(r.czEv) > 0)
      .sort((a, b) => Number(b.czEv) - Number(a.czEv))
      .slice(0, 5);
  }, [board]);
  const featured = topEdges[0];

  return (
    <>
      <PageHeader
        title="Dashboard"
        sub={board ? `Board generated today at ${new Date(board.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "No board yet today"}
        action={
          <Link href="/board">
            <Pill variant="primary">{board ? "Open board" : "Generate today's board"}</Pill>
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-5">
        <Reveal className="md:col-span-3">
          <Panel className={`${(stats?.pl ?? 0) >= 0 ? "glow-pos" : ""} h-full`}>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Equity</div>
            <Glow tone="pos" className="inline-block">
              <div className="display num mt-2 text-[clamp(2.6rem,6vw,4.4rem)] leading-none text-text">
                <CountUp value={equity} format={(n) => `$${Math.round(n).toLocaleString()}`} />
              </div>
            </Glow>
            <div className="num mt-2 text-[13px]">
              <span className={(stats?.pl ?? 0) >= 0 ? "text-pos" : "text-neg"}>
                {stats ? fmtMoneyExact(stats.pl) : "$0.00"}
              </span>{" "}
              <span className="text-muted">season P/L on a ${money.bankroll} bankroll</span>
            </div>
            {spark.length > 1 && (
              <div className="mt-4 h-16">
                <ResponsiveContainer>
                  <LineChart data={spark}>
                    <Line type="monotone" dataKey="pl" stroke="var(--color-pos)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </Reveal>

        <div className="grid gap-4 md:col-span-2">
          <Reveal delay={0.08}>
            <Panel>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Season ROI</div>
              <div className={`display num mt-1 text-[clamp(1.8rem,3.4vw,2.6rem)] leading-none ${(stats?.roi ?? 0) >= 0 ? "text-pos" : "text-neg"}`}>
                {stats ? roiPct(stats.roi) : "—"}
              </div>
              <div className="num mt-1 text-[11px] text-muted">
                {stats ? `${stats.w}-${stats.l}${stats.push ? `-${stats.push}` : ""} · ${stats.days.length} locked days` : "no locked days yet"}
              </div>
            </Panel>
          </Reveal>
          <Reveal delay={0.16}>
            <Panel className="glow-gold h-full">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Featured edge</div>
                <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-gold">
                  @ Caesars
                </span>
              </div>
              {featured ? (
                <div className="mt-2">
                  <div className="text-[15px] font-semibold text-text">{featured.label}</div>
                  <div className="text-[12px] text-muted">{featured.sub}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <OddsCell odds={featured.czOdds as never} book="caesars" />
                    <EvBadge ev={Number(featured.czEv)} />
                    <span className="num text-[11px] text-muted">{Number(featured.prob).toFixed(1)}% true</span>
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-[12px] text-muted">Generate today&apos;s board to surface the best playable edge.</div>
              )}
            </Panel>
          </Reveal>
        </div>
      </div>

      <Reveal>
        <Panel title="Today's top playable edges" className="mt-4">
          {topEdges.length ? (
            <div className="space-y-2">
              {topEdges.map((r) => (
                <div key={`${r.label}|${r.sub}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.04] pb-2 last:border-0 last:pb-0">
                  <div>
                    <span className="text-[13px] font-medium text-text">{r.label}</span>{" "}
                    <span className="text-[12px] text-muted">{r.sub}</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="num text-[11px] text-muted">{Number(r.prob).toFixed(1)}%</span>
                    <OddsCell odds={r.czOdds as never} book="caesars" />
                    <EvBadge ev={Number(r.czEv)} />
                  </div>
                </div>
              ))}
              <div className="pt-1 text-right">
                <Link href="/board" className="text-[12px] font-semibold text-pos hover:underline">
                  Full board →
                </Link>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No board yet today"
              body="Generate the board to see ranked edges here — everything is engine output, nothing is ever fabricated."
              action={
                <Link href="/board">
                  <Pill variant="primary">Generate board</Pill>
                </Link>
              }
            />
          )}
        </Panel>
      </Reveal>

      <div className="mt-4 text-[10.5px] text-faint">Informational only, not betting advice.</div>
    </>
  );
}
