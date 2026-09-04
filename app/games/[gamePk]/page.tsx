"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { FilterPill } from "@/components/ui/Pill";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { BattingBox } from "@/components/games/BattingBox";
import { BoxHeader } from "@/components/games/BoxHeader";
import { InfoBlock } from "@/components/games/InfoBlock";
import { LinescoreTable } from "@/components/games/LinescoreTable";
import { PitchingBox } from "@/components/games/PitchingBox";
import { longDate } from "@/components/games/logo";
import type { BoxscorePayload } from "@/lib/boxscore";
import { clampToWindow } from "@/lib/games";

/* BOX SCORE PAGE (2026-09-03, Josh: "You should also be able to click on any game
   to see the box score"). Modelled on the MLB app: scoreboard header, linescore,
   W/L/S line, a team toggle over the batting box + notes, pitchers, game info.
   Every figure and every note string is statsapi's own; a missing figure is "—".
   Live games refetch every 30 s. */

export default function BoxScorePage() {
  // useSearchParams is read on both server and client, so the back href hydrates cleanly
  return (
    <Suspense fallback={null}>
      <BoxScore />
    </Suspense>
  );
}

function BoxScore() {
  const params = useParams<{ gamePk: string }>();
  const pk = String(params?.gamePk ?? "");
  const qDate = useSearchParams().get("date");
  const backDate = qDate && /^\d{4}-\d{2}-\d{2}$/.test(qDate) ? clampToWindow(qDate) : null;
  const [side, setSide] = useState<"away" | "home">("away");

  const q = useQuery<BoxscorePayload>({
    queryKey: ["boxscore", pk],
    enabled: /^\d+$/.test(pk),
    queryFn: async () => {
      const r = await fetch(`/api/games/${pk}`);
      const j = (await r.json().catch(() => null)) as (BoxscorePayload & { error?: string }) | null;
      if (!r.ok || !j || j.error) throw new Error(j?.error ?? `box score ${r.status}`);
      return j;
    },
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "live" ? 30_000 : s === "upcoming" ? 120_000 : false;
    },
    staleTime: 15_000,
  });

  const g = q.data;
  const backTo = backDate ?? g?.date ?? null;
  const back = backTo ? `/games?date=${backTo}` : "/games";
  const pregame = g?.status === "upcoming" || g?.status === "postponed";
  const winner = g && g.status === "final" ? ((g.away.score ?? 0) > (g.home.score ?? 0) ? "away" : (g.home.score ?? 0) > (g.away.score ?? 0) ? "home" : null) : null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <Link href={back} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted transition-colors hover:text-text">
          <span aria-hidden className="text-[15px] leading-none">‹</span> Games
        </Link>
        {g && (
          <span className="num text-[11px] text-faint">
            {longDate(g.date)}
            {g.doubleHeader && g.gameNumber ? ` · Game ${g.gameNumber}` : ""}
            {g.venue ? ` · ${g.venue}` : ""}
          </span>
        )}
      </div>

      {q.isPending ? (
        <div className="space-y-3">
          <div className="glass p-4">
            <Skeleton className="mx-auto mb-3 h-11 w-2/3" />
            <Skeleton className="mb-2 h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
          <div className="glass p-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="mb-2 h-4 w-full" />
            ))}
          </div>
        </div>
      ) : q.isError || !g ? (
        <ErrorState title="Couldn't load the box score" body={(q.error as Error | null)?.message ?? "no data"} onRetry={() => void q.refetch()} />
      ) : (
        <div className="space-y-3">
          <section className="glass min-w-0">
            <BoxHeader g={g} />
            {g.linescore && (
              <div className="border-t border-white/[0.06] px-4 py-3">
                <LinescoreTable ls={g.linescore} away={g.away.abbr} home={g.home.abbr} winner={winner} />
              </div>
            )}
          </section>

          <section className="glass min-w-0">
            <div className="flex gap-1.5 px-4 pt-4 pb-3">
              {(["away", "home"] as const).map((k) => (
                <FilterPill key={k} selected={side === k} onClick={() => setSide(k)} className="flex-1">
                  {g[k].short}
                </FilterPill>
              ))}
            </div>
            <BattingBox t={g[side]} pregame={pregame} postponed={g.status === "postponed"} />
            <div className="border-t border-white/[0.06]">
              <PitchingBox t={g[side]} pregame={pregame} />
            </div>
          </section>

          {(g.info.length > 0 || g.pitchingNotes.length > 0) && (
            <section className="glass min-w-0">
              <InfoBlock title="Game info" items={g.info} />
              {g.pitchingNotes.length > 0 && (
                <div className="border-t border-white/[0.06] px-4 py-3 text-[11.5px] leading-snug text-muted">
                  {g.pitchingNotes.map((n, i) => (
                    <div key={i}>{n}</div>
                  ))}
                </div>
              )}
            </section>
          )}
          <p className="px-1 text-[10.5px] text-faint">Source: MLB Stats API, game {g.pk}. {g.status === "live" ? "Refreshes every 30 s while live." : ""}</p>
        </div>
      )}
    </div>
  );
}
