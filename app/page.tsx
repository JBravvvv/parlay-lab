"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

/* The books the engine's consensus actually reads (us + eu regions) — real
   sources, not decoration. */
const BOOKS = ["Pinnacle", "Caesars", "DraftKings", "FanDuel", "BetMGM", "Betfair"];

const NAV_LINKS = [
  { href: "/board", label: "Board", chevron: true },
  { href: "/stats", label: "Stats", chevron: true },
  { href: "/builder", label: "Builder", chevron: false },
  { href: "/ledger", label: "Ledger", chevron: false },
];

function Chevron() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="opacity-60"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function Hero() {
  return (
    <div className="relative">
      <div className="relative z-10 flex min-h-dvh flex-col">
        {/* navbar */}
        <header className="w-full px-5 py-5 md:px-8">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex select-none items-baseline gap-0.5">
              <span className="display text-[20px] font-semibold tracking-tight text-text">PARLAY</span>
              <span className="display text-gradient text-[20px] font-semibold">//</span>
              <span className="display text-[20px] font-semibold tracking-tight text-text">LAB</span>
            </Link>
            <nav className="hidden items-center gap-7 md:flex">
              {NAV_LINKS.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="flex items-center gap-1 text-[14px] font-medium text-text/90 transition-colors duration-(--dur-fast) hover:text-text"
                >
                  {n.label}
                  {n.chevron && <Chevron />}
                </Link>
              ))}
            </nav>
            <Link href="/sharp">
              <Pill variant="hero" className="!px-4 !py-2">
                The Sharp
              </Pill>
            </Link>
          </div>
        </header>
        <div className="mt-[3px] h-px w-full bg-gradient-to-r from-transparent via-text/20 to-transparent" />

        {/* hero content — a soft dark halo behind the type (NOT a slab: the
            ribbons must stay visible through it), section stays overflow-visible */}
        <section className="relative flex flex-1 items-center justify-center overflow-visible px-4">
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[527px] w-[984px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-bg/45 blur-[82px]" />
          <div className="relative text-center">
            <h1
              className="text-[clamp(64px,15vw,220px)] font-normal leading-[1.02] tracking-[-0.024em] text-text"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Parlay <span className="text-gradient">Lab</span>
            </h1>
            <p className="mx-auto mt-[9px] max-w-md text-lg leading-8 text-hero-sub opacity-80">
              A 10,000-simulation quant engine for MLB &amp; UFC — sharp-anchored fair prices,
              ¼-Kelly sizing, every bet graded against the close.
            </p>
            <Link href="/board" className="mt-[25px] inline-block">
              <Pill variant="hero" className="!px-[29px] !py-6 text-[14px]">
                Open Today&apos;s Board
              </Pill>
            </Link>
          </div>
        </section>

        {/* book marquee */}
        <div className="w-full px-5 pb-28 md:px-8 md:pb-10">
          <div className="mx-auto flex max-w-5xl items-center gap-12">
            <div className="shrink-0 text-sm leading-5 text-text/50">
              Priced across the books
              <br />
              the market respects
            </div>
            <div className="min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
              <div className="flex w-max animate-marquee">
                {[...BOOKS, ...BOOKS].map((b, i) => (
                  <div key={`${b}-${i}`} className="mr-16 flex shrink-0 items-center gap-3">
                    <div className="liquid-glass flex h-6 w-6 items-center justify-center rounded-lg text-[11px] font-bold text-text">
                      {b[0]}
                    </div>
                    <span className="text-base font-semibold text-text">{b}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { api } = useLedger();
  // localStorage-backed data only exists on the client; render the SSR
  // fallback until mounted so hydration sees identical markup.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const stats = useMemo(() => (mounted ? api?.stats("all") : undefined), [api, mounted]);
  const board = mounted ? cachedBoard() : null;
  const money = mounted ? getMoney() : { bankroll: 750, daily: 0, fun: 0 };

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
      <Hero />

      <div className="mx-auto w-full max-w-[1280px] px-4 pb-24 pt-10 md:px-8 md:pb-12">
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
      </div>
    </>
  );
}
