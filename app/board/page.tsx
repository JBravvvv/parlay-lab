"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Pill, FilterPill } from "@/components/ui/Pill";
import { OddsCell } from "@/components/ui/OddsCell";
import { EvBadge } from "@/components/ui/EvBadge";
import { ProbBar } from "@/components/ui/ProbBar";
import { KellyChip } from "@/components/ui/KellyChip";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import { useBoard, useRegenerateBoard } from "@/lib/useBoard";
import { getMoney } from "@/lib/engine-client";
import { quotaRemaining } from "@/lib/fetcher";
import type { PickRow } from "@/engine";

const CAT_LABELS: Record<string, string> = {
  all: "TOP 50",
  ml: "MONEYLINE",
  rl: "RUN LINE",
  batter_hits: "HITS",
  batter_total_bases: "TOTAL BASES",
  batter_home_runs: "HOME RUNS",
  batter_hits_runs_rbis: "H+R+RBI",
  pitcher_strikeouts: "STRIKEOUTS",
  pitcher_outs: "OUTS",
};

export default function BoardPage() {
  const { data: board, isPending, isError, refetch } = useBoard();
  const regen = useRegenerateBoard();
  const [cat, setCat] = useState("all");
  const [live, setLive] = useState(false);

  const d = board?.data;
  const cats = (live ? d?.categoriesLive : d?.categories) ?? {};
  const rows: PickRow[] = useMemo(() => cats[cat] ?? [], [cats, cat]);
  const playable = useMemo(() => rows.filter((r) => r.cz != null), [rows]);
  const offBook = rows.length - playable.length;
  const bankroll = typeof window !== "undefined" ? getMoney().bankroll : 750;

  const columns: Column<PickRow>[] = useMemo(
    () => [
      {
        key: "pick",
        header: "Pick",
        sortValue: (r) => r.label,
        cell: (r) => (
          <div>
            <div className="font-medium text-text">{r.label}</div>
            <div className="text-[11px] text-muted">{r.sub}</div>
          </div>
        ),
      },
      {
        key: "prob",
        header: "True %",
        numeric: true,
        sortValue: (r) => Number(r.prob) || 0,
        cell: (r) => <ProbBar p={(Number(r.prob) || 0) / 100} className="w-28 justify-end md:w-36" />,
      },
      {
        key: "best",
        header: "Best",
        numeric: true,
        sortValue: (r) => Number(String(r.odds).replace(/[^\d.-]/g, "")) || 0,
        cell: (r) => (r.odds != null ? <OddsCell odds={r.odds as never} /> : <span className="text-faint">—</span>),
      },
      {
        key: "cz",
        header: "Caesars",
        numeric: true,
        sortValue: (r) => Number(String(r.czOdds ?? "").replace(/[^\d.-]/g, "")) || 0,
        cell: (r) => <OddsCell odds={r.czOdds as never} book="caesars" />,
      },
      {
        key: "czEv",
        header: "EV @ CZR",
        numeric: true,
        sortValue: (r) => Number(r.czEv) || 0,
        cell: (r) => (r.czEv != null ? <EvBadge ev={Number(r.czEv)} /> : <span className="text-faint">—</span>),
      },
      {
        key: "stake",
        header: "¼-Kelly",
        numeric: true,
        sortValue: (r) => Number(r.czKellyF) || 0,
        cell: (r) =>
          r.czKellyF != null && Number(r.czKellyF) > 0 ? (
            <KellyChip stake={Number(r.czKellyF) * bankroll} />
          ) : (
            <span className="text-faint">—</span>
          ),
      },
    ],
    [bankroll],
  );

  const gameCount = d?.gameInfo ? Object.keys(d.gameInfo).length : 0;
  const pickCount = d ? Object.entries(d.categories).filter(([k]) => k !== "all").reduce((s, [, v]) => s + v.length, 0) : 0;
  const quota = quotaRemaining();

  return (
    <>
      <PageHeader
        title="Board"
        sub={
          d
            ? `${gameCount} games · ${pickCount} picks · consensus is multi-book, prices are Caesars · updated ${new Date(board!.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
            : "Consensus de-vigged probability vs the Caesars line"
        }
        action={
          <Pill variant="primary" onClick={() => regen.mutate()} disabled={regen.isPending || isPending}>
            {regen.isPending ? "Scanning slate…" : d ? "Refresh board" : "Generate board"}
          </Pill>
        }
      />

      {typeof d?.overview === "string" && d.overview && (
        <Reveal>
          <div className="mb-4 rounded-(--radius-panel) border border-white/[0.05] bg-white/[0.02] px-4 py-3 text-[12.5px] leading-relaxed text-muted">
            {d.overview}
          </div>
        </Reveal>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {Object.keys(cats)
          .sort((a, b) => (a === "all" ? -1 : b === "all" ? 1 : 0))
          .map((k) => (
            <FilterPill key={k} selected={cat === k} onClick={() => setCat(k)}>
              {CAT_LABELS[k] ?? k.toUpperCase()}
              <span className="num ml-1 text-[10px] opacity-70">{(cats[k] ?? []).length}</span>
            </FilterPill>
          ))}
        {d?.categoriesLive && Object.values(d.categoriesLive).some((v) => v.length) && (
          <FilterPill
            selected={live}
            onClick={() => {
              setLive(!live);
              setCat("all");
            }}
            className={live ? "" : "!text-live"}
          >
            ● LIVE
          </FilterPill>
        )}
      </div>

      {isPending || regen.isPending ? (
        <Panel title={regen.isPending ? "Scanning today's slate" : "Loading board"}>
          <div className="mb-3 text-[12px] text-muted">
            Pulling schedule, lineups, multi-book odds and player form — then de-vigging, simulating and
            ranking. ~15–30 seconds on a full slate.
          </div>
          <SkeletonRows rows={10} />
        </Panel>
      ) : isError ? (
        <ErrorState
          title="Couldn't build the board"
          body="The odds feed or MLB stats API didn't answer. Nothing is fabricated on failure."
          onRetry={() => refetch()}
        />
      ) : rows.length === 0 ? (
        <Panel>
          <EmptyState
            title="No picks in this category"
            body="Either the slate is empty right now or every candidate failed the engine's thresholds (see another tab)."
          />
        </Panel>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={playable}
            rowKey={(r) => `${r.label}|${r.sub}`}
            stagger
            rowClassName={(r) => (Number(r.czEv) > 0 ? "ev-glow" : "")}
          />
          {offBook > 0 && (
            <details className="mt-3 rounded-(--radius-panel) border border-white/[0.05] bg-white/[0.02] px-4 py-3">
              <summary className="cursor-pointer select-none text-[12px] font-semibold text-muted">
                Not at Caesars ({offBook}) — real picks, no playable price
              </summary>
              <div className="mt-3 space-y-1.5">
                {rows
                  .filter((r) => r.cz == null)
                  .map((r) => (
                    <div key={`${r.label}|${r.sub}`} className="flex items-baseline justify-between gap-3 text-[12px]">
                      <span className="text-text">
                        {r.label} <span className="text-muted">{r.sub}</span>
                      </span>
                      <span className="num text-muted">
                        {String(r.odds ?? "")} best · {Number(r.prob).toFixed(1)}%
                      </span>
                    </div>
                  ))}
              </div>
            </details>
          )}
        </>
      )}

      <div className="mt-4 text-[10.5px] text-faint">
        {quota && <>Odds API quota remaining: <span className="num">{quota}</span> · </>}
        Prices are Caesars&apos; US feed via The Odds API; the NV app can differ — confirm at lock.
        Informational only, not betting advice.
      </div>
    </>
  );
}
