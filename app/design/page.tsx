"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { EvBadge } from "@/components/ui/EvBadge";
import { OddsCell } from "@/components/ui/OddsCell";
import { KellyChip } from "@/components/ui/KellyChip";
import { ProbBar } from "@/components/ui/ProbBar";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from "@/components/ui/states";

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
  ["bg", "var(--color-bg)", "#0A0B0D — base"],
  ["surface", "var(--color-surface)", "panels"],
  ["surface-2", "var(--color-surface-2)", "raised"],
  ["surface-3", "var(--color-surface-3)", "highest"],
  ["line", "var(--color-line)", "1px borders"],
  ["pos", "var(--color-pos)", "+EV / wins"],
  ["neg", "var(--color-neg)", "−EV / losses"],
  ["gold", "var(--color-gold)", "Caesars layer"],
  ["live", "var(--color-live)", "in-game"],
] as const;

export default function DesignPage() {
  const [tick, setTick] = useState(0);
  const movedOdds = [-310, -298, -325][tick % 3];

  return (
    <>
      <PageHeader
        title="Design system"
        sub="Phase 1 review page — every token and component in one place"
        action={
          <span className="rounded-(--radius-chip) border border-gold/50 bg-gold/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-gold">
            Sample data only
          </span>
        }
      />

      <div className="space-y-4">
        <Panel title="Colors">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-9">
            {SWATCHES.map(([name, v, note]) => (
              <div key={name}>
                <div className="h-12 rounded-lg border border-line" style={{ background: v }} />
                <div className="mt-1.5 text-[11px] font-semibold text-text">{name}</div>
                <div className="text-[10px] text-faint">{note}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Typography">
          <div className="space-y-3">
            <div className="text-[20px] font-bold tracking-tight">Space Grotesk — UI, headings, labels</div>
            <div className="text-[13px] text-muted">
              Body copy stays quiet and readable. Numbers never render in the sans face.
            </div>
            <div className="num text-[20px] font-semibold">
              JetBrains Mono 0123456789 <span className="text-pos">+118</span>{" "}
              <span className="text-neg">-310</span> <span className="text-gold">$37</span> 74.1%
            </div>
            <div className="num text-[12px] text-muted">
              tabular figures: 1111.11 vs 8888.88 align perfectly in columns
            </div>
          </div>
        </Panel>

        <Panel
          title="Odds cells — flash on line movement"
          action={
            <button
              onClick={() => setTick((t) => t + 1)}
              className="rounded-(--radius-chip) border border-line-2 bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-text hover:bg-surface-3"
            >
              Simulate a line move
            </button>
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
            <EvBadge ev={0} />
            <KellyChip stake={14} />
          </div>
        </Panel>

        <Panel title="Board table — dense but breathable">
          <DataTable columns={COLUMNS} rows={SAMPLE_ROWS} rowKey={(r) => r.id} maxHeight="none" />
          <div className="mt-2 text-[10px] text-faint">
            Sticky header, sortable columns, hover rows, horizontal scroll contained. All rows above are fabricated
            placeholders for layout review — the real board only ever shows engine output.
          </div>
        </Panel>

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

        <Panel title="Probability bars">
          <div className="max-w-sm space-y-2">
            <ProbBar p={0.741} />
            <ProbBar p={0.512} />
            <ProbBar p={0.118} />
          </div>
        </Panel>

        <Panel title="Misc">
          <div className="flex flex-wrap items-center gap-4 text-[12px]">
            <span className="flex items-center gap-1.5">
              <span className="pulse-dot h-2 w-2 rounded-full bg-live" />
              <span className="text-live">LIVE</span>
            </span>
            <Skeleton className="h-5 w-24" />
            <span className="rounded-(--radius-chip) border border-gold/50 bg-gold/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-gold">
              @ Caesars
            </span>
          </div>
        </Panel>
      </div>
    </>
  );
}
