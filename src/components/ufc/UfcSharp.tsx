"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { OddsCell } from "@/components/ui/OddsCell";
import { EvBadge } from "@/components/ui/EvBadge";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import { getMoney } from "@/lib/engine-client";
import { loadUfcBoard, fmtAm, type UfcSide } from "@/lib/ufc";

/* The Sharp's UFC read — same market desk as the Board's UFC tab (de-vigged
   consensus, no fight model), framed as a daily card: overview, value spots,
   the trap, and the ticket suggestions. Every number is market-derived. */

const fmtPct = (p: number) => `${(p * 100).toFixed(1)}%`;
const fmtMoney = (n: number) => `$${n.toFixed(2)}`;

type Spot = { side: UfcSide; fight: string; start: string };

export function UfcSharp() {
  const bankroll = typeof window !== "undefined" ? getMoney().bankroll : 750;
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["ufc-board"],
    queryFn: () => loadUfcBoard({ bankroll }),
    staleTime: 240_000,
    retry: 1,
  });
  const d = q.data;

  const spots: Spot[] = useMemo(() => {
    if (!d) return [];
    return d.fights
      .flatMap((f) => [
        { side: f.a, fight: `${f.a.name} vs ${f.b.name}`, start: f.start },
        { side: f.b, fight: `${f.a.name} vs ${f.b.name}`, start: f.start },
      ])
      .filter((s) => s.side.czOdds != null && s.side.czEv != null);
  }, [d]);

  const byEv = useMemo(() => [...spots].sort((a, b) => (b.side.czEv ?? -9) - (a.side.czEv ?? -9)), [spots]);
  const value = byEv.slice(0, 4);
  const trap = byEv[byEv.length - 1];
  const posCount = spots.filter((s) => (s.side.czEv ?? -1) > 0).length;

  const overview = d
    ? `${d.fights.length} fights left on ${d.eventName ?? "the card"}. Consensus across every US book prices this ` +
      `card ${posCount === 0 ? "tight — no Caesars line beats the market right now" : `with ${posCount} Caesars line${posCount === 1 ? "" : "s"} above consensus`}. ` +
      `Everything below is price-gap analysis, not fight prediction — the desk has no MMA model and says so.`
    : "";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold text-text">{d?.eventName ?? "Next UFC card"}</div>
          <div className="text-[11px] text-muted">Market read only — de-vigged 7-book consensus vs the Caesars line</div>
        </div>
        <Pill variant="primary" onClick={() => qc.invalidateQueries({ queryKey: ["ufc-board"] })} disabled={q.isFetching}>
          {q.isFetching ? "Reading the card…" : "↻ Refresh UFC read"}
        </Pill>
      </div>

      {q.isPending ? (
        <Panel><SkeletonRows rows={7} /></Panel>
      ) : q.isError ? (
        <Panel><ErrorState title="Couldn't load the UFC card" onRetry={() => q.refetch()} /></Panel>
      ) : !d || spots.length === 0 ? (
        <Panel><EmptyState title="No upcoming UFC card in the feed" body="The read appears as soon as books post the next card." /></Panel>
      ) : (
        <>
          <Reveal>
            <Panel title="The desk's overview">
              <p className="text-[13px] leading-relaxed text-muted">{overview}</p>
            </Panel>
          </Reveal>

          <Reveal>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              Best Caesars prices vs the market
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {value.map((s, i) => (
                <Panel key={s.side.name} className={(s.side.czEv ?? -1) > 0 && i === 0 ? "glow-pos" : ""}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="display text-[15px] text-text">
                        {s.side.name}
                        {s.side.record && <span className="num ml-1.5 text-[11px] text-muted">({s.side.record})</span>}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted">
                        {s.fight} · {new Date(s.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </div>
                    </div>
                    <OddsCell odds={fmtAm(s.side.czOdds!) as never} book="caesars" />
                  </div>
                  <div className="num mt-2.5 flex flex-wrap items-center gap-3 text-[11.5px]">
                    <span className="text-text">{fmtPct(s.side.prob!)} consensus</span>
                    <EvBadge ev={(s.side.czEv ?? 0) * 100} />
                    {s.side.bestOdds != null && (
                      <span className="text-muted">
                        best {fmtAm(s.side.bestOdds)} <span className="text-[9.5px] text-faint">{s.side.bestBook}</span>
                      </span>
                    )}
                  </div>
                </Panel>
              ))}
            </div>
          </Reveal>

          {trap && (trap.side.czEv ?? 0) < -0.03 && (
            <Reveal>
              <Panel title="Worst price on the card" className="border-neg/20">
                <div className="text-[13px] font-semibold text-neg">
                  {trap.side.name} {fmtAm(trap.side.czOdds!)} at Caesars
                </div>
                <div className="mt-1 text-[12px] leading-relaxed text-muted">
                  Consensus says {fmtPct(trap.side.prob!)} — Caesars&apos; price gives up{" "}
                  {(Math.abs(trap.side.czEv!) * 100).toFixed(1)}% to the market
                  {trap.side.bestOdds != null ? ` (${fmtAm(trap.side.bestOdds)} available at ${trap.side.bestBook})` : ""}.
                  If you like this fighter anyway, this is the leg your parlay bleeds on.
                </div>
              </Panel>
            </Reveal>
          )}

          <Reveal>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              The desk&apos;s tickets
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
                        </span>
                        <span className="num shrink-0 text-muted">{fmtAm(l.czOdds)} · {fmtPct(l.prob)}</span>
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
          </Reveal>

          <Reveal>
            <details className="glass px-5 py-4">
              <summary className="cursor-pointer select-none text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                How the UFC read works (and what it deliberately doesn&apos;t do)
              </summary>
              <div className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-muted">
                <p>
                  <b className="text-text">The market is the whole model.</b> Every book&apos;s moneyline is de-vigged;
                  the median is the consensus &quot;true&quot; probability. Caesars&apos; price is then judged against it —
                  a positive gap is a real, checkable edge; there is no fight model and none is faked.
                </p>
                <p>
                  <b className="text-text">Parlays are straight products.</b> Different fights are independent, so
                  combined probability and fair price are exact. Both sides of one fight never share a ticket.
                </p>
                <p>
                  <b className="text-text">Sizing stays disciplined.</b> ¼-Kelly capped at 2% of bankroll, and $0 when
                  the math says no edge — passing is a position. Started fights drop off automatically.
                </p>
              </div>
            </details>
          </Reveal>
        </>
      )}
    </div>
  );
}
