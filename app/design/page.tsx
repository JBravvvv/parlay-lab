"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { EvBadge } from "@/components/ui/EvBadge";
import { OddsCell } from "@/components/ui/OddsCell";
import { KellyChip } from "@/components/ui/KellyChip";
import { ProbBar } from "@/components/ui/ProbBar";
import { Pill, FilterPill } from "@/components/ui/Pill";
import { Glow } from "@/components/ui/Glow";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import { CountUp } from "@/components/motion/CountUp";
import { fmtMoney } from "@/lib/format";

/* Everything on this page is SAMPLE data for design review only —
   no real prices, players, or edges. The banner says so. */

type SampleRow = {
  id: string;
  pick: string;
  market: string;
  prob: number;
  fair: number;
  cz: number;
  ev: number;
};

const SAMPLE_ROWS: SampleRow[] = [
  { id: "1", pick: "Sample Batter A (AAA)", market: "Hits O 0.5", prob: 0.741, fair: -286, cz: -310, ev: 2.4 },
  { id: "2", pick: "Sample Batter B (BBB)", market: "TB O 1.5", prob: 0.512, fair: 105, cz: 118, ev: 4.1 },
  { id: "3", pick: "Sample Pitcher C (CCC)", market: "Ks O 5.5", prob: 0.633, fair: -172, cz: -155, ev: 3.2 },
  { id: "4", pick: "Sample Batter D (DDD)", market: "H+R+RBI O 1.5", prob: 0.581, fair: -139, cz: -150, ev: -1.6 },
  { id: "5", pick: "Sample Batter E (EEE)", market: "HR O 0.5", prob: 0.118, fair: 748, cz: 650, ev: -5.8 },
];

const COLUMNS: Column<SampleRow>[] = [
  { key: "pick", header: "Pick", cell: (r) => <span className="font-medium text-text">{r.pick}</span> },
  { key: "market", header: "Market", cell: (r) => <span className="text-muted">{r.market}</span> },
  {
    key: "prob",
    header: "True %",
    numeric: true,
    sortValue: (r) => r.prob,
    cell: (r) => <ProbBar p={r.prob} className="w-32 justify-end" />,
  },
  { key: "fair", header: "Fair", numeric: true, sortValue: (r) => r.fair, cell: (r) => <OddsCell odds={r.fair} /> },
  { key: "cz", header: "Caesars", numeric: true, sortValue: (r) => r.cz, cell: (r) => <OddsCell odds={r.cz} book="caesars" /> },
  { key: "ev", header: "EV", numeric: true, sortValue: (r) => r.ev, cell: (r) => <EvBadge ev={r.ev} /> },
];

const SWATCHES = [
  ["bg", "var(--color-bg)"],
  ["surface", "var(--color-surface)"],
  ["surface-2", "var(--color-surface-2)"],
  ["surface-3", "var(--color-surface-3)"],
  ["line", "var(--color-line)"],
  ["pos", "var(--color-pos)"],
  ["neg", "var(--color-neg)"],
  ["gold", "var(--color-gold)"],
  ["live", "var(--color-live)"],
] as const;

const MARKETS = ["ALL", "HITS", "TB", "KS", "HR", "ML / RL"];

export default function DesignPage() {
  const [tick, setTick] = useState(0);
  const [market, setMarket] = useState("ALL");
  const [tableKey, setTableKey] = useState(0);
  const movedOdds = [-310, -298, -325][tick % 3];

  return (
    <div className="space-y-16 pb-10">
      {/* ---- hero: oversized type, glow from behind, count-up numerals ---- */}
      <section className="pt-6 md:pt-14">
        <Reveal>
          <div className="flex justify-center md:justify-start">
            <span className="rounded-full border border-gold/50 bg-gold/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
              Phase 1 review · sample data only
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.08}>
          <Glow tone="pos" className="mt-6 text-center md:text-left">
            <h1 className="display text-(length:--text-display-xl) uppercase text-text">
              The edge,
              <br />
              <span className="text-pos">quantified.</span>
            </h1>
          </Glow>
        </Reveal>
        <Reveal delay={0.16}>
          <p className="mx-auto mt-5 max-w-lg text-center text-[14px] leading-relaxed text-muted md:mx-0 md:text-left">
            De-vigged consensus, Monte Carlo sims, ¼-Kelly discipline — priced at the window you
            actually bet. Informational only, never advice.
          </p>
        </Reveal>

        {/* bento: extreme hierarchy — one focal number per screenful */}
        <div className="mt-10 grid gap-4 md:grid-cols-5">
          <Reveal delay={0.2} className="md:col-span-3">
            <Panel className="glow-pos h-full">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
                Bankroll <span className="text-faint">· sample</span>
              </div>
              <div className="display mt-3 text-[clamp(3rem,7vw,5rem)] leading-none text-text">
                <CountUp value={1284} format={(n) => fmtMoney(n)} />
              </div>
              <div className="num mt-3 text-[13px] text-pos">
                +<CountUp value={534} format={(n) => fmtMoney(n).slice(1)} duration={1.6} /> since open
              </div>
            </Panel>
          </Reveal>
          <div className="grid gap-4 md:col-span-2">
            <Reveal delay={0.28}>
              <Panel>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
                  Season ROI <span className="text-faint">· sample</span>
                </div>
                <div className="display mt-2 text-[clamp(2rem,4vw,2.9rem)] leading-none text-pos">
                  +<CountUp value={12.4} format={(n) => n.toFixed(1)} duration={1.6} />%
                </div>
              </Panel>
            </Reveal>
            <Reveal delay={0.36}>
              <Panel className="glow-gold">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
                    The Sharp · featured
                  </div>
                  <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-gold">
                    @ Caesars
                  </span>
                </div>
                <div className="mt-2 text-[14px] font-semibold text-text">
                  Sample spotlight card — glassy, gold-lit, one clear focal point.
                </div>
              </Panel>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---- type scale ---- */}
      <Reveal>
        <Panel title="Type scale — display sizes are statements">
          <div className="space-y-5 overflow-x-auto">
            <div className="display text-(length:--text-display-xl) leading-none">Aa 47%</div>
            <div className="display text-(length:--text-display) leading-none text-muted">
              Display — Unbounded
            </div>
            <div className="text-(length:--text-title) font-semibold">Title — Space Grotesk</div>
            <div className="max-w-md text-[13px] leading-relaxed text-muted">
              Body — quiet and readable. Numbers never render in the sans face:
            </div>
            <div className="num text-[18px]">
              <span className="text-pos">+118</span> <span className="text-neg">-310</span>{" "}
              <span className="text-gold">$37</span> 74.1% · tabular: 1111.11 / 8888.88
            </div>
          </div>
        </Panel>
      </Reveal>

      {/* ---- background + glow system ---- */}
      <Reveal>
        <Panel title="Background & glow — dark with depth, not flat dark">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <div className="mb-3 text-[12px] text-muted">
                The page floats on layered radial glows + film grain (look behind this panel).
                Halos put light behind hero elements:
              </div>
              <div className="flex flex-wrap items-center gap-8 py-6">
                <Glow tone="pos">
                  <div className="display text-[34px] text-pos">+EV</div>
                </Glow>
                <Glow tone="gold">
                  <div className="display text-[34px] text-gold">CZR</div>
                </Glow>
                <Glow tone="live">
                  <div className="display text-[34px] text-live">LIVE</div>
                </Glow>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {SWATCHES.map(([name, v]) => (
                <div key={name}>
                  <div className="h-10 rounded-xl border border-white/[0.07]" style={{ background: v }} />
                  <div className="mt-1 text-[10.5px] font-semibold text-muted">{name}</div>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </Reveal>

      {/* ---- pills ---- */}
      <Reveal>
        <Panel title="Pill controls — buttons, filters, tabs">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <Pill variant="primary">Generate board</Pill>
              <Pill variant="ghost">Refresh odds</Pill>
              <Pill variant="gold">Lock card</Pill>
              <Pill variant="danger">Clear slip</Pill>
              <Pill variant="ghost" disabled>
                Disabled
              </Pill>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {MARKETS.map((m) => (
                <FilterPill key={m} selected={market === m} onClick={() => setMarket(m)}>
                  {m}
                </FilterPill>
              ))}
            </div>
            <div className="text-[11px] text-faint">
              Hover brightens, press scales down 4% — every interactive element in the product is a pill.
            </div>
          </div>
        </Panel>
      </Reveal>

      {/* ---- odds motion ---- */}
      <Reveal>
        <Panel
          title="Odds cells — flash on line movement"
          action={
            <Pill variant="ghost" onClick={() => setTick((t) => t + 1)} className="!px-3 !py-1 text-[11px]">
              Simulate a line move
            </Pill>
          }
        >
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted">best price</span>
              <OddsCell odds={movedOdds} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted">Caesars (gold, always)</span>
              <OddsCell odds={movedOdds - 12} book="caesars" />
            </div>
            <EvBadge ev={4.2} />
            <EvBadge ev={-1.8} />
            <KellyChip stake={14} />
          </div>
        </Panel>
      </Reveal>

      {/* ---- the board stays a terminal ---- */}
      <Reveal>
        <Panel
          title="Board table — density kept, rows cascade in, +EV rows lit"
          action={
            <Pill variant="ghost" onClick={() => setTableKey((k) => k + 1)} className="!px-3 !py-1 text-[11px]">
              Replay reveal
            </Pill>
          }
        >
          <DataTable
            key={tableKey}
            columns={COLUMNS}
            rows={SAMPLE_ROWS}
            rowKey={(r) => r.id}
            maxHeight="none"
            stagger
            rowClassName={(r) => (r.ev > 0 ? "ev-glow" : "")}
          />
          <div className="mt-3 text-[10.5px] leading-relaxed text-faint">
            All rows are fabricated placeholders for layout review — the real board only ever shows
            engine output. Monospace tabular numerals, sticky header, contained scroll: unchanged.
          </div>
        </Panel>
      </Reveal>

      {/* ---- states ---- */}
      <Reveal>
        <div className="grid gap-4 md:grid-cols-3">
          <Panel title="Loading state">
            <SkeletonRows rows={4} />
          </Panel>
          <Panel title="Empty state">
            <EmptyState title="No games today" body="The slate is empty. Check back tomorrow morning." />
          </Panel>
          <Panel title="Error state">
            <ErrorState
              title="Odds feed unreachable"
              body="Nothing is fabricated on failure — the page says so and offers a retry."
              onRetry={() => {}}
            />
          </Panel>
        </div>
      </Reveal>

      {/* ---- motion notes ---- */}
      <Reveal>
        <div className="text-center text-[11px] leading-relaxed text-faint">
          Motion system: one shared easing (cubic-bezier .16,1,.3,1) · scroll reveals (fade + rise,
          once) · count-ups land exactly · row cascades at 45ms — all disabled under
          prefers-reduced-motion.
        </div>
      </Reveal>
    </div>
  );
}
