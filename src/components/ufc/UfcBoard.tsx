"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { OddsCell } from "@/components/ui/OddsCell";
import { EvBadge } from "@/components/ui/EvBadge";
import { ProbBar } from "@/components/ui/ProbBar";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import { getMoney } from "@/lib/engine-client";
import { loadUfcBoard, fmtAm, type UfcFight, type UfcSide } from "@/lib/ufc";

const fmtPct = (p: number) => `${(p * 100).toFixed(1)}%`;
const fmtMoney = (n: number) => `$${n.toFixed(2)}`;
const startLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

type SideRow = { fightId: string; start: string; weightClass?: string; side: UfcSide; opp: UfcSide; rounds: UfcFight["rounds"] };

export function UfcBoard() {
  const bankroll = typeof window !== "undefined" ? getMoney().bankroll : 750;
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["ufc-board"],
    queryFn: () => loadUfcBoard({ bankroll }),
    staleTime: 240_000,
    retry: 1,
  });

  const rows: SideRow[] = useMemo(() => {
    if (!q.data) return [];
    return q.data.fights.flatMap((f) => [
      { fightId: f.id, start: f.start, weightClass: f.weightClass, side: f.a, opp: f.b, rounds: f.rounds },
      { fightId: f.id, start: f.start, weightClass: f.weightClass, side: f.b, opp: f.a, rounds: f.rounds },
    ]);
  }, [q.data]);

  const columns: Column<SideRow>[] = useMemo(
    () => [
      {
        key: "fighter",
        header: "Fighter",
        stickyLeft: 0,
        sortValue: (r) => r.side.name,
        cell: (r) => (
          <div className="max-w-[190px] md:max-w-none">
            <div className="truncate font-medium text-text">
              {r.side.name}
              {r.side.record && <span className="num ml-1.5 text-[10.5px] text-muted">({r.side.record})</span>}
            </div>
            <div className="truncate text-[10.5px] text-faint">
              vs {r.opp.name} · {r.weightClass ?? "bout"} · {startLabel(r.start)}
            </div>
          </div>
        ),
      },
      {
        key: "prob",
        header: "Consensus %",
        numeric: true,
        sortValue: (r) => r.side.prob ?? -1,
        cell: (r) =>
          r.side.prob != null ? (
            <ProbBar p={r.side.prob} className="w-28 justify-end md:w-36" />
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      {
        key: "cz",
        header: "Caesars",
        numeric: true,
        sortValue: (r) => r.side.czOdds ?? -100000,
        cell: (r) =>
          r.side.czOdds != null ? (
            <OddsCell odds={fmtAm(r.side.czOdds) as never} book="caesars" />
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      {
        key: "ev",
        header: "EV @ CZR",
        numeric: true,
        sortValue: (r) => r.side.czEv ?? -9,
        cell: (r) => (r.side.czEv != null ? <EvBadge ev={r.side.czEv * 100} /> : <span className="text-faint">—</span>),
      },
      {
        key: "best",
        header: "Best price",
        numeric: true,
        sortValue: (r) => r.side.bestOdds ?? -100000,
        cell: (r) =>
          r.side.bestOdds != null ? (
            <span className="num text-[12px] text-muted">
              {fmtAm(r.side.bestOdds)} <span className="text-[9.5px] text-faint">{r.side.bestBook}</span>
            </span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      {
        key: "rounds",
        header: "Rounds O/U",
        numeric: true,
        sortValue: (r) => r.rounds?.point ?? -1,
        cell: (r) =>
          r.rounds ? (
            <span className="num text-[11.5px] text-muted">
              {r.rounds.point} <span className="text-[9.5px] text-faint">{r.rounds.book} · not CZ</span>
            </span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
    ],
    [],
  );

  const d = q.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold text-text">{d?.eventName ?? "Next UFC card"}</div>
          <div className="text-[11px] text-muted">
            Moneylines de-vigged across every US book in the feed; EV priced at Caesars. No fight model — edges are
            price gaps, not predictions.
          </div>
        </div>
        <Pill variant="primary" onClick={() => qc.invalidateQueries({ queryKey: ["ufc-board"] })} disabled={q.isFetching}>
          {q.isFetching ? "Pulling the card…" : "↻ Refresh UFC"}
        </Pill>
      </div>

      {q.isPending ? (
        <Panel><SkeletonRows rows={8} /></Panel>
      ) : q.isError ? (
        <Panel><ErrorState title="Couldn't load UFC odds" onRetry={() => q.refetch()} /></Panel>
      ) : !d || d.fights.length === 0 ? (
        <Panel>
          <EmptyState title="No upcoming UFC card in the feed" body="Check back closer to fight week — the board lights up as soon as books post lines." />
        </Panel>
      ) : (
        <>
          <Reveal>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => `${r.fightId}|${r.side.name}`}
              maxHeight="56vh"
              rowClassName={(r) => ((r.side.czEv ?? -1) > 0 ? "ev-glow" : "")}
            />
          </Reveal>

          <Reveal>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              Suggested parlays — Caesars moneylines only
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {d.tickets.map((t) => (
                <Panel key={t.name} className={t.ev > 0 ? "glow-pos" : ""}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="display text-[15px] text-text">{t.name}</div>
                      <div className="mt-0.5 text-[11px] leading-relaxed text-muted">{t.note}</div>
                    </div>
                    <span className="num shrink-0 text-[15px] font-bold text-gold">{fmtAm(t.american)}</span>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {t.legs.map((l) => (
                      <div key={l.pick} className="flex items-center justify-between gap-2 text-[12px]">
                        <span className="truncate text-text">
                          {l.pick}
                          {l.record && <span className="num ml-1 text-[10px] text-muted">({l.record})</span>}
                          <span className="ml-1.5 text-[10.5px] text-faint">{l.fight.replace(`${l.pick} vs `, "vs ").replace(` vs ${l.pick}`, " vs")}</span>
                        </span>
                        <span className="num shrink-0 text-muted">
                          {fmtAm(l.czOdds)} · {fmtPct(l.prob)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="num mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-2.5 text-[11.5px]">
                    <span className="text-text">{fmtPct(t.prob)} true</span>
                    <EvBadge ev={t.ev * 100} />
                    <span className="text-muted">¼-Kelly {t.kellyStake > 0 ? fmtMoney(t.kellyStake) : "$0 (no edge)"}</span>
                  </div>
                </Panel>
              ))}
            </div>
            {d.tickets.length === 0 && (
              <Panel>
                <EmptyState title="No Caesars-priced fights yet" body="Caesars hasn't posted moneylines for this card in the feed." />
              </Panel>
            )}
          </Reveal>

          <div className="text-[10.5px] leading-relaxed text-faint">
            Fight props (method of victory, round betting) aren&apos;t carried for Caesars in this odds feed — only
            moneylines are, so parlays here stick to what you can actually verify at the window. Rounds O/U shown is
            another book&apos;s line for reference. Fights are treated as independent. Informational only, not betting
            advice.
          </div>
        </>
      )}
    </div>
  );
}
