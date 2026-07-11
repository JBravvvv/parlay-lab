"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { OddsCell } from "@/components/ui/OddsCell";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import { getMoney } from "@/lib/engine-client";
import { loadUfcBoard, fmtAm } from "@/lib/ufc";

/* Stats-page view of the next UFC card: records first, prices as context.
   Shares the ["ufc-board"] cache with the Board tab — one pull feeds both. */
export function UfcCard() {
  const bankroll = typeof window !== "undefined" ? getMoney().bankroll : 750;
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["ufc-board"],
    queryFn: () => loadUfcBoard({ bankroll }),
    staleTime: 240_000,
    retry: 1,
  });
  const d = q.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold text-text">{d?.eventName ?? "Next UFC card"}</div>
          <div className="text-[11px] text-muted">Records live from ESPN · moneylines are Caesars</div>
        </div>
        <Pill variant="ghost" onClick={() => qc.invalidateQueries({ queryKey: ["ufc-board"] })} disabled={q.isFetching}>
          {q.isFetching ? "Refreshing…" : "↻ Refresh UFC"}
        </Pill>
      </div>

      {q.isPending ? (
        <Panel><SkeletonRows rows={8} /></Panel>
      ) : q.isError ? (
        <Panel><ErrorState title="Couldn't load the UFC card" onRetry={() => q.refetch()} /></Panel>
      ) : !d || d.fights.length === 0 ? (
        <Panel><EmptyState title="No upcoming UFC card in the feed" body="Check back closer to fight week." /></Panel>
      ) : (
        <Reveal>
          <div className="grid gap-2.5 md:grid-cols-2">
            {d.fights.map((f) => (
              <Panel key={f.id} className="!py-3.5">
                <div className="flex items-center justify-between gap-2 text-[10.5px] text-faint">
                  <span>{f.weightClass ?? "Bout"}</span>
                  <span className="num">
                    {new Date(f.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
                {[f.a, f.b].map((s) => (
                  <div key={s.name} className="mt-2 flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-text">
                      {s.name}
                      <span className="num ml-1.5 text-[10.5px] text-muted">{s.record ? `(${s.record})` : ""}</span>
                    </span>
                    {s.czOdds != null ? (
                      <OddsCell odds={fmtAm(s.czOdds) as never} book="caesars" />
                    ) : (
                      <span className="text-[11px] text-faint">—</span>
                    )}
                  </div>
                ))}
              </Panel>
            ))}
          </div>
        </Reveal>
      )}
    </div>
  );
}
