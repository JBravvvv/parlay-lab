"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilterPill } from "@/components/ui/Pill";
import { ErrorState, Skeleton } from "@/components/ui/states";
import {
  footballCoverageRefreshInterval,
  type FootballDetailSport, type FootballDetailTeam, type FootballGameDetailPayload,
  type FootballGamePlay, type FootballPlayerTable,
} from "@/lib/football/game-detail";

type Props = { sport: FootballDetailSport; gameId: string };
type Tab = "box" | "plays" | "team";
const shown = (value: string | null | undefined) => value ?? "—";
const periodName = (period: number | null) => period === null ? "" : period <= 4 ? `Q${period}` : period === 5 ? "OT" : `${period - 4}OT`;

function TeamScore({ team, live }: { team: FootballDetailTeam; live: boolean }) {
  return <div className="flex min-w-0 items-center gap-2.5">
    {team.logo && <img src={team.logo} alt="" className="h-9 w-9 shrink-0 object-contain" />}
    <div className="min-w-0 flex-1">
      <div className="text-[13px] font-bold leading-snug text-text">{team.name}</div>
      <div className="mt-0.5 text-[11px] text-muted">{team.record ?? team.abbr}{live && team.possession ? " · Possession" : ""}</div>
    </div>
    <span className={`num text-[26px] font-extrabold ${team.winner ? "text-pos" : "text-text"}`}>{shown(team.score)}</span>
  </div>;
}

function PlayerTable({ table }: { table: FootballPlayerTable }) {
  return <section className="overflow-hidden rounded-xl border border-white/10 bg-[#16212b]">
    <h3 className="border-b border-white/10 bg-pos/[0.07] px-3 py-2 text-[12px] font-bold text-pos">{table.title}</h3>
    <div className="overflow-x-auto overscroll-x-contain">
      <table className="w-full whitespace-nowrap text-[12px]">
        <thead><tr className="text-[10.5px] uppercase tracking-wide text-muted">
          <th className="sticky left-0 z-10 bg-[#18232e] px-3 py-2 text-left font-semibold">Player</th>
          {table.labels.map((label, i) => <th key={`${label}-${i}`} title={table.descriptions[i]} className="px-2.5 py-2 text-right font-semibold">{label}</th>)}
        </tr></thead>
        <tbody>{table.players.map((player) => <tr key={player.id} className="border-t border-white/[0.06]">
          <th scope="row" className="sticky left-0 z-10 bg-[#16212b] px-3 py-2 text-left text-[12px] font-semibold text-text">{player.name}</th>
          {table.labels.map((label, i) => <td key={`${label}-${i}`} className="num px-2.5 py-2 text-right text-text">{shown(player.stats[i])}</td>)}
        </tr>)}</tbody>
        {table.totals.some((value) => value !== null) && <tfoot><tr className="border-t border-white/15 text-pos">
          <th scope="row" className="sticky left-0 z-10 bg-[#18232e] px-3 py-2 text-left font-bold">Team</th>
          {table.labels.map((label, i) => <td key={`${label}-${i}`} className="num px-2.5 py-2 text-right font-semibold">{shown(table.totals[i])}</td>)}
        </tr></tfoot>}
      </table>
    </div>
  </section>;
}

function PlayRow({ play, game }: { play: FootballGamePlay; game: FootballGameDetailPayload }) {
  const team = play.teamId === game.away.id ? game.away : play.teamId === game.home.id ? game.home : null;
  return <li className={`border-b border-white/[0.07] px-3 py-3 last:border-0 ${play.scoring ? "bg-gold/[0.06]" : ""}`}>
    <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] font-semibold text-muted">
      <span className="num text-pos">{[periodName(play.period), play.clock].filter(Boolean).join(" · ") || "Game update"}</span>
      {team && <span>{team.abbr}</span>}
      {play.downDistance && <span>{play.downDistance}</span>}
      {play.scoring && <span className="text-gold">SCORE</span>}
      {play.scoring && play.awayScore !== null && play.homeScore !== null && <span className="num ml-auto text-gold">{game.away.abbr} {play.awayScore} · {game.home.abbr} {play.homeScore}</span>}
    </div>
    <p className="text-[12px] leading-relaxed text-text">{play.text}</p>
  </li>;
}

function Coverage({ sport, gameId }: Props) {
  const [tab, setTab] = useState<Tab>("box");
  const [side, setSide] = useState<"away" | "home">("away");
  const [playCount, setPlayCount] = useState(40);
  const valid = /^\d{5,12}$/.test(gameId);
  const q = useQuery<FootballGameDetailPayload>({
    queryKey: ["football-game-detail", sport, gameId], enabled: valid,
    queryFn: async () => {
      const response = await fetch(`/api/football/${sport}/games/${gameId}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as (FootballGameDetailPayload & { error?: string }) | null;
      if (!response.ok || !payload || payload.error) throw new Error(payload?.error ?? "Couldn't load game coverage.");
      return payload;
    },
    refetchInterval: (query) => footballCoverageRefreshInterval(query.state.data?.phase),
    staleTime: 15_000,
  });
  const game = q.data;
  if (!valid) return <ErrorState title="Game unavailable" body="This game does not have a valid ESPN game ID." />;
  if (!game && q.isPending) return <div className="space-y-3" aria-label="Loading game coverage"><Skeleton className="h-36 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (!game) return <ErrorState title="Couldn't load the game" body={(q.error as Error | null)?.message ?? "Game coverage is unavailable."} onRetry={() => void q.refetch()} />;
  const live = game.phase === "live", pregame = game.phase === "upcoming" || game.phase === "postponed";
  const periods = Math.max(game.away.periods.length, game.home.periods.length);
  const tables = game.boxscore[side], primary = tables.filter((t) => ["passing", "rushing", "receiving"].includes(t.key));
  const other = tables.filter((t) => !["passing", "rushing", "receiving"].includes(t.key));
  const lastPlay = game.plays[0];
  const updated = new Date(game.fetchedAt);
  return <div className="min-w-0 space-y-3" data-testid="football-game-detail">
    <div className="flex items-center justify-between gap-3 text-[11px]">
      <span className={`font-bold ${live ? "text-pos" : "text-muted"}`}>{live ? "● LIVE · " : ""}{game.status}</span>
      <button type="button" onClick={() => void q.refetch()} disabled={q.isFetching} className="rounded-full border border-white/15 bg-white/[0.05] px-3 py-1.5 font-semibold text-text disabled:opacity-50">{q.isFetching ? "Updating…" : "Refresh"}</button>
    </div>
    {q.isError && <p role="status" className="rounded-lg border border-gold/30 bg-gold/10 p-2.5 text-[11px] text-gold">The latest refresh failed. Showing the last received game update.</p>}
    <section className="overflow-hidden rounded-2xl border border-pos/25 bg-[#14222e]">
      <div className="grid gap-3 p-3.5"><TeamScore team={game.away} live={live} /><TeamScore team={game.home} live={live} /></div>
      {!pregame && periods > 0 && <div className="overflow-x-auto border-t border-white/10 px-3 py-2">
        <table className="w-full text-center text-[11px]"><thead><tr className="text-muted"><th className="py-1 text-left">Team</th>{Array.from({ length: periods }, (_, i) => <th key={i} className="px-2 py-1">{periodName(i + 1)}</th>)}<th className="px-2 py-1 text-pos">T</th></tr></thead>
          <tbody>{[game.away, game.home].map((team) => <tr key={team.id}><th scope="row" className="py-1 text-left text-text">{team.abbr}</th>{Array.from({ length: periods }, (_, i) => <td key={i} className="num px-2 py-1 text-muted">{shown(team.periods[i])}</td>)}<td className="num px-2 py-1 font-bold text-pos">{shown(team.score)}</td></tr>)}</tbody>
        </table>
      </div>}
      {(game.situation || game.venue) && <div className="border-t border-white/10 px-3.5 py-2 text-[11px] text-muted">{game.situation && <div className="mb-1 font-semibold text-pos">{game.situation}</div>}{game.venue}</div>}
    </section>
    {live && lastPlay && <section className="rounded-xl border border-pos/25 bg-pos/[0.07] px-3 py-2.5" aria-label="Latest play">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-pos">Latest play · {periodName(lastPlay.period)} {lastPlay.clock}</div>
      <p className="text-[12px] leading-relaxed text-text">{lastPlay.text}</p>
    </section>}
    <div className="grid grid-cols-3 gap-1.5" aria-label="Game coverage views">
      {([['box', 'Box score'], ['plays', 'Play-by-play'], ['team', 'Team stats']] as const).map(([key, label]) => <FilterPill key={key} selected={tab === key} onClick={() => setTab(key)} className="min-w-0 px-1.5! text-[11px]!">{label}</FilterPill>)}
    </div>
    {tab === "box" && <div className="space-y-3">
      <div className="flex gap-2">{(["away", "home"] as const).map((key) => <FilterPill key={key} selected={side === key} onClick={() => setSide(key)} className="flex-1">{game[key].abbr}</FilterPill>)}</div>
      {tables.length === 0 ? <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-[12px] text-muted">{pregame ? "Player box scores appear after kickoff." : "Player box scores have not been published for this game yet."}</p> : <>
        {primary.map((table) => <PlayerTable key={table.key} table={table} />)}
        {other.length > 0 && <details className="rounded-xl border border-white/10 bg-white/[0.03] p-3" open={primary.length === 0 || undefined}>
          <summary className="cursor-pointer text-[12px] font-semibold text-text">Defense & special teams</summary>
          <div className="mt-3 space-y-3">{other.map((table) => <PlayerTable key={table.key} table={table} />)}</div>
        </details>}
      </>}
      {game.scoringPlays.length > 0 && <section className="overflow-hidden rounded-xl border border-gold/20 bg-[#18212b]">
        <h3 className="border-b border-white/10 px-3 py-2.5 text-[12px] font-bold text-gold">Scoring summary · newest first</h3>
        <ol>{game.scoringPlays.map((play) => <PlayRow key={play.id} play={play} game={game} />)}</ol>
      </section>}
    </div>}
    {tab === "plays" && <section className="overflow-hidden rounded-xl border border-white/10 bg-[#18212b]">
      <h3 className="border-b border-white/10 px-3 py-2.5 text-[11px] font-semibold text-muted">Play-by-play · newest first</h3>
      {game.plays.length ? <><ol>{game.plays.slice(0, playCount).map((play) => <PlayRow key={play.id} play={play} game={game} />)}</ol>{game.plays.length > playCount && <button type="button" onClick={() => setPlayCount((n) => n + 40)} className="w-full border-t border-white/10 bg-pos/10 px-3 py-3 text-[12px] font-bold text-pos">Load earlier plays · {game.plays.length - playCount} remaining</button>}</> : <p className="p-4 text-[12px] text-muted">{pregame ? "Play-by-play begins after kickoff." : "ESPN has not provided play-by-play for this game yet."}</p>}
    </section>}
    {tab === "team" && <section className="overflow-hidden rounded-xl border border-white/10 bg-[#18212b]">
      {game.teamStats.length ? <table className="w-full text-[12px]"><thead><tr className="bg-pos/[0.07] text-pos"><th className="px-3 py-2.5 text-left">Team stats</th><th className="px-2 py-2.5 text-right">{game.away.abbr}</th><th className="px-3 py-2.5 text-right">{game.home.abbr}</th></tr></thead>
        <tbody>{game.teamStats.map((stat) => <tr key={stat.key} className="border-t border-white/[0.07]"><th scope="row" className="px-3 py-2 text-left text-[11px] font-medium text-muted">{stat.label}</th><td className="num px-2 py-2 text-right text-text">{shown(stat.away)}</td><td className="num px-3 py-2 text-right text-text">{shown(stat.home)}</td></tr>)}</tbody>
      </table> : <p className="p-4 text-[12px] text-muted">{pregame ? "Game statistics appear after kickoff." : "Team statistics have not been published for this game yet."}</p>}
    </section>}
    <p className="px-1 text-[10.5px] leading-relaxed text-faint">ESPN game coverage{Number.isNaN(updated.getTime()) ? "" : ` · Retrieved ${updated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}`}. {live ? "Refreshes every 30 seconds while live." : pregame ? "Checks for kickoff every 2 minutes." : "Final game."}</p>
  </div>;
}

/** The parent owns the overlay; changing games resets the view without disturbing the Games scroll. */
export function FootballGameDetail(props: Props) {
  return <Coverage key={`${props.sport}:${props.gameId}`} {...props} />;
}
