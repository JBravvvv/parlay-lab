"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { EvBadge } from "@/components/ui/EvBadge";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import { loadSharpBoard, type SharpGame } from "@/engine2/sharpBoard";
import { getSelectionMode } from "@/lib/engine-client";

/* ENGINE V2 · sharp desk — Shin de-vig + Pinnacle/exchange-weighted consensus
   on tonight's games, judged at the Caesars line. Market layer only, no model:
   a green number means Caesars is beating the sharp consensus price. */

const fmtAm = (a: number | null) => (a == null ? "—" : a > 0 ? `+${a}` : `${a}`);
const fmtPct = (p: number | null) => (p == null ? "—" : `${(p * 100).toFixed(1)}%`);
const tLabel = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function SideRow({ s, basis }: { s: SharpGame["away"]; basis: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[12px]">
      <span className="min-w-0 flex-1 truncate text-text">{s.name}</span>
      <span className="num flex shrink-0 items-center gap-2.5 text-[11.5px]">
        <span className="text-muted">{fmtPct(s.fairP)} · fair {fmtAm(s.fairAm)}</span>
        {basis && (
          <span className="font-bold text-text" title="DK/FD basis — the price selection shops at">
            {fmtAm(s.bsAm)}{s.bsBk ? <span className="ml-1 text-[9px] font-normal uppercase text-muted">{s.bsBk}</span> : null}
          </span>
        )}
        <span className="font-bold text-gold">{fmtAm(s.cz)}</span>
        {basis ? (
          s.bsEv != null ? <EvBadge ev={s.bsEv * 100} /> : <span className="text-faint">—</span>
        ) : s.czEv != null ? (
          <EvBadge ev={s.czEv * 100} />
        ) : (
          <span className="text-faint">—</span>
        )}
      </span>
    </div>
  );
}

export function SharpDesk() {
  const qc = useQueryClient();
  // dk_fd: mounted-gated read (hydration rule) — EV judged at the DK/FD basis,
  // Caesars kept visible as the settlement price
  const [basis, setBasis] = useState(false);
  useEffect(() => setBasis(getSelectionMode() === "dk_fd"), []);
  const q = useQuery({
    queryKey: ["sharp-board"],
    queryFn: loadSharpBoard,
    staleTime: 240_000,
    retry: 1,
  });

  return (
    <Reveal>
      <div className="mt-8">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              Engine v2 · sharp desk — Shin de-vig, Pinnacle-weighted
            </h2>
            <div className="text-[11px] text-muted">
              {basis
                ? "Fair price = sharp-consensus with the longshot bias stripped; EV is at the DK/FD basis (bold), Caesars in gold settles. Pure market read — the quant board above is the model view."
                : "Fair price = sharp-consensus with the longshot bias stripped; EV is at the Caesars line. Pure market read — the quant board above is the model view."}
            </div>
          </div>
          <Pill variant="ghost" onClick={() => qc.invalidateQueries({ queryKey: ["sharp-board"] })} disabled={q.isFetching}>
            {q.isFetching ? "Reading sharps…" : "↻ Refresh sharps"}
          </Pill>
        </div>

        {q.isPending ? (
          <Panel><SkeletonRows rows={6} /></Panel>
        ) : q.isError ? (
          <Panel><ErrorState title="Sharp consensus unavailable" onRetry={() => q.refetch()} /></Panel>
        ) : q.data.games.length === 0 ? (
          <Panel><EmptyState title="No upcoming games in the feed" body="The desk lights up when tomorrow's lines post." /></Panel>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {q.data.games.map((g) => (
              <Panel
                key={g.id}
                className={
                  (basis
                    ? (g.away.bsEv ?? -1) > 0.01 || (g.home.bsEv ?? -1) > 0.01 || (g.total.bsOverEv ?? -1) > 0.01 || (g.total.bsUnderEv ?? -1) > 0.01
                    : (g.away.czEv ?? -1) > 0.01 || (g.home.czEv ?? -1) > 0.01 || (g.total.overEv ?? -1) > 0.01 || (g.total.underEv ?? -1) > 0.01)
                    ? "glow-pos"
                    : ""
                }
              >
                <div className="mb-2 flex items-center justify-between text-[10.5px] text-faint">
                  <span className="num">{tLabel(g.start)} · {g.books} books{g.hasSharp ? " · sharp anchored" : " · no sharp posted yet"}</span>
                </div>
                <div className="space-y-1.5">
                  <SideRow s={g.away} basis={basis} />
                  <SideRow s={g.home} basis={basis} />
                </div>
                <div className="num mt-2.5 flex flex-wrap items-center gap-2.5 border-t border-line pt-2 text-[11px] text-muted">
                  {g.total.point != null ? (
                    <>
                      <span>O/U {g.total.point} · fair over {fmtPct(g.total.overFairP)}</span>
                      {basis && (g.total.bsOver != null || g.total.bsUnder != null) && (
                        <span className="text-text" title="DK/FD basis at the consensus point">
                          basis {fmtAm(g.total.bsOver)}{g.total.bsOverBk ? ` ${g.total.bsOverBk}` : ""}/
                          {fmtAm(g.total.bsUnder)}{g.total.bsUnderBk ? ` ${g.total.bsUnderBk}` : ""}
                        </span>
                      )}
                      {g.total.czPoint != null && (
                        <span className="text-gold">
                          CZ {g.total.czPoint}: {fmtAm(g.total.czOver)}/{fmtAm(g.total.czUnder)}
                        </span>
                      )}
                      {basis ? (
                        <>
                          {g.total.bsOverEv != null && <span>O <EvBadge ev={g.total.bsOverEv * 100} /></span>}
                          {g.total.bsUnderEv != null && <span>U <EvBadge ev={g.total.bsUnderEv * 100} /></span>}
                        </>
                      ) : (
                        <>
                          {g.total.overEv != null && <span>O <EvBadge ev={g.total.overEv * 100} /></span>}
                          {g.total.underEv != null && <span>U <EvBadge ev={g.total.underEv * 100} /></span>}
                        </>
                      )}
                      {g.total.czPoint != null && g.total.point !== g.total.czPoint && (
                        <span className="text-faint">CZ hangs a different number — not comparable, shop it</span>
                      )}
                    </>
                  ) : (
                    <span className="text-faint">no totals posted yet</span>
                  )}
                </div>
              </Panel>
            ))}
          </div>
        )}

        <div className="mt-2 text-[10.5px] text-faint">
          Consensus = per-book Shin de-vig, then a weighted median (Pinnacle ×3, Betfair/Matchbook ×2). Games without a
          sharp book posted show the retail consensus and say so. Informational only, not betting advice.
        </div>
      </div>
    </Reveal>
  );
}
