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
import { MatchupBox } from "@/components/games/MatchupBox";
import { PitchingBox } from "@/components/games/PitchingBox";
import { PreviewBox } from "@/components/games/PreviewBox";
import { longDate } from "@/components/games/logo";
import type { BoxscorePayload } from "@/lib/boxscore";
import { clampToWindow } from "@/lib/games";

/* BOX SCORE PAGE (2026-09-03, Josh: "You should also be able to click on any game
   to see the box score"). Modelled on the MLB app: scoreboard header, linescore,
   W/L/S line, a team toggle over the batting box + notes, pitchers, game info.
   Every figure and every note string is statsapi's own; a missing figure is "—".
   Live games refetch every 30 s.

   GAME PREVIEW (INSTRUCTION 46, 2026-09-08), Josh's word, verbatim: "'Preview'
   should be named 'Game Preview' and has avg, ops stats but no AB, R, H, RBI, etc.
   it should also have batter vs pitcher matchup data on that page". So an
   unplayed game renders as "Game Preview": the lineup with season AVG / OPS
   (PreviewBox — no in-game columns), the probable's season line (PitchingBox
   pregame), and the Matchups section — each club's hitters vs the other club's
   probable, career lines from statsapi's vsPlayer feed (MatchupBox). The section
   is absent when no probable is named. */

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
  // INSTRUCTION 46: the page is the "Game Preview" until first pitch, the "Box Score" after
  const pageTitle = g ? (pregame ? "Game Preview" : "Box Score") : null;
  const matchup = g?.matchups ? g.matchups[side] : null;
  // the OTHER club's probable is the arm this side faces; a null side with a probable named means the feed failed, not "no probable"
  const other = side === "away" ? "home" : "away";
  const anyMatchup = !!(g?.matchups && (g.matchups.away || g.matchups.home));
  const winner = g && g.status === "final" ? ((g.away.score ?? 0) > (g.home.score ?? 0) ? "away" : (g.home.score ?? 0) > (g.away.score ?? 0) ? "home" : null) : null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <Link replace href={back} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted transition-colors hover:text-text">
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

      {pageTitle && <h1 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{pageTitle}</h1>}

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
        <ErrorState title="Couldn't load the game" body={(q.error as Error | null)?.message ?? "no data"} onRetry={() => void q.refetch()} />
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
            {pregame ? <PreviewBox t={g[side]} postponed={g.status === "postponed"} /> : <BattingBox t={g[side]} pregame={false} />}
            <div className="border-t border-white/[0.06]">
              <PitchingBox t={g[side]} pregame={pregame} />
            </div>
          </section>

          {anyMatchup && (
            <section className="glass min-w-0">
              <h2 className="px-4 pt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Matchups</h2>
              {matchup ? (
                <MatchupBox m={matchup} abbr={g[side].abbr} />
              ) : (
                <div className="px-4 py-6 text-center text-[12px] text-muted">
                  {g[other].probable ? "Matchup data unavailable right now." : `${g[other].abbr} has not named a probable pitcher.`}
                </div>
              )}
              <p className="border-t border-white/[0.06] px-4 py-2.5 text-[10px] text-faint">Career batter-vs-pitcher lines from MLB's vsPlayer feed, summed across seasons. Refreshes hourly.</p>
            </section>
          )}

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
          <p className="px-1 text-[10.5px] text-faint">
            Source: MLB Stats API, game {g.pk}. {g.status === "live" ? "Refreshes every 30 s while live." : pregame ? "Lineups and matchups refresh every 2 min until first pitch." : ""}
          </p>
        </div>
      )}
    </div>
  );
}
