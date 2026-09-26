"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilterPill } from "@/components/ui/Pill";
import { ErrorState, Skeleton } from "@/components/ui/states";
import type { MlbPlay, MlbPlaysPayload } from "@/lib/mlb-play-by-play";

function inningLabel(play: MlbPlay) {
  return `${play.half === "top" ? "Top" : play.half === "bottom" ? "Bottom" : "Inning"} ${play.inning ?? "—"}`;
}

function PitchSequence({ play }: { play: MlbPlay }) {
  if (!play.pitches.length) return <p className="text-[11px] text-muted">Pitch details have not been reported.</p>;
  return <ol aria-label="Pitch sequence" className="space-y-1.5">
    {play.pitches.map((pitch) => <li key={pitch.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px]">
      <span className="num min-w-4 text-faint">{pitch.number ?? "—"}</span>
      <span className="font-semibold text-text">{pitch.result ?? "Pitch"}</span>
      {pitch.type && <span className="text-muted">{pitch.type}</span>}
      {pitch.speed !== null && <span className="num text-pos">{pitch.speed.toFixed(1)} mph</span>}
      <span className="num ml-auto text-muted">{pitch.balls ?? "—"}-{pitch.strikes ?? "—"}</span>
    </li>)}
  </ol>;
}

function PlayRow({ play, away, home, current = false }: { play: MlbPlay; away: string; home: string; current?: boolean }) {
  return <article className={`rounded-xl border p-3 ${play.scoring ? "border-amber-300/30 bg-amber-300/[0.06]" : current ? "border-cyan-300/30 bg-cyan-300/[0.06]" : "border-white/10 bg-white/[0.025]"}`}>
    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
      <span className="font-semibold text-muted">{current ? (play.complete ? "Latest at-bat · " : "Current at-bat · ") : ""}{inningLabel(play)}</span>
      <span className="num text-text">{away} {play.awayScore ?? "—"} · {home} {play.homeScore ?? "—"}</span>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      {play.scoring && <span className="rounded bg-amber-300/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">Scoring play</span>}
      <h3 className="text-[12px] font-bold text-text">{play.event ?? (play.complete ? "At-bat" : "At bat")}</h3>
    </div>
    {play.description && <p className="mt-1 text-[12px] leading-relaxed text-text">{play.description}</p>}
    {(play.batter || play.pitcher) && <p className="mt-1 text-[11px] text-muted">{play.batter ?? "Batter unavailable"} <span className="text-faint">vs</span> {play.pitcher ?? "Pitcher unavailable"}</p>}
    {current && !play.complete && <p className="num mt-2 text-[11px] text-pos">Count {play.balls ?? "—"}-{play.strikes ?? "—"} · {play.outs ?? "—"} outs</p>}
    {current ? <div className="mt-3 border-t border-white/10 pt-2"><PitchSequence play={play} /></div> : play.pitches.length > 0 && <details className="mt-2 text-[11px] text-muted">
      <summary className="cursor-pointer py-1 font-semibold text-pos">{play.pitches.length} pitches</summary>
      <div className="pt-1"><PitchSequence play={play} /></div>
    </details>}
  </article>;
}

export function PlayByPlay({ pk, live, away, home }: { pk: string; live: boolean; away: string; home: string }) {
  const [scoringOnly, setScoringOnly] = useState(false);
  const query = useQuery<MlbPlaysPayload>({
    queryKey: ["mlb-play-by-play", pk, live ? "live" : "final"],
    enabled: /^\d{5,8}$/.test(pk),
    queryFn: async () => {
      const response = await fetch(`/api/games/${pk}/plays`);
      const data = await response.json().catch(() => null) as (MlbPlaysPayload & { error?: string }) | null;
      if (!response.ok || !data || data.error) throw new Error(data?.error ?? `Play-by-play ${response.status}`);
      return data;
    },
    refetchInterval: live ? 30_000 : false,
    staleTime: 15_000,
  });
  const data = query.data;
  const current = live ? data?.current : null;
  const plays = [...(data?.plays ?? [])].reverse().filter((play) => (!scoringOnly || play.scoring) && (!current || play.id !== current.id || scoringOnly));
  if (!data && query.isPending) return <div className="glass space-y-3 p-4" aria-label="Loading play-by-play"><Skeleton className="h-12 w-full" /><Skeleton className="h-20 w-full" /></div>;
  if (!data) return <ErrorState title="Play-by-play is unavailable" body={(query.error as Error | null)?.message ?? "MLB has not returned this game’s plays."} onRetry={() => void query.refetch()} />;
  return <section className="glass min-w-0 p-3" aria-label="MLB play-by-play">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-1.5">
        <FilterPill selected={!scoringOnly} onClick={() => setScoringOnly(false)}>All plays</FilterPill>
        <FilterPill selected={scoringOnly} onClick={() => setScoringOnly(true)}>Scoring</FilterPill>
      </div>
      <span className="text-[11px] text-muted">Latest first{live ? " · Updates every 30s" : ""}</span>
    </div>
    {query.isError && <p role="status" className="mb-3 rounded-lg border border-amber-300/30 p-2 text-[11px] text-amber-200">The latest refresh failed. Showing the last available plays. <button type="button" onClick={() => void query.refetch()} className="underline">Retry</button></p>}
    <div className="space-y-2">
      {current && !scoringOnly && <PlayRow play={current} away={away} home={home} current />}
      {plays.map((play) => <PlayRow key={play.id} play={play} away={away} home={home} />)}
      {!plays.length && (!current || scoringOnly) && <p className="py-6 text-center text-[12px] text-muted">{scoringOnly ? "No scoring plays have been reported." : "MLB has not posted any plays yet. The box score remains available."}</p>}
    </div>
  </section>;
}
