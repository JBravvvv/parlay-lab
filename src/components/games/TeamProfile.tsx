"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ErrorState, Skeleton } from "@/components/ui/states";
import type { TeamGameSelection, TeamProfileData, TeamProfileSport, TeamRosterPlayer, TeamScheduleGame } from "@/lib/team-profile";

function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : date;
}
function startLabel(start: string): string {
  return new Date(start).toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" }) + " PT";
}
function Portrait({ player, logo }: { player: TeamRosterPlayer; logo: string | null }) {
  const [failed, setFailed] = useState(false);
  const src = !failed ? (player.image ?? logo) : logo;
  return <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-xs font-bold text-muted">
    {player.name.split(" ").map(s => s[0]).slice(0, 2).join("")}
    {src && <img src={src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-contain" onError={e => { if (!failed) setFailed(true); else e.currentTarget.style.display = "none"; }} />}
  </span>;
}
function Schedule({ data, onGameSelect }: { data: TeamProfileData; onGameSelect: (game: TeamGameSelection) => void }) {
  const [view, setView] = useState<"recent" | "upcoming" | "all">("recent");
  const completed = data.schedule.filter(g => g.status === "final"), future = data.schedule.filter(g => g.status !== "final");
  const shown = view === "all" ? data.schedule : view === "upcoming" ? future : [...data.schedule.filter(g => g.status === "live"), ...completed.slice().reverse()];
  const games = view === "recent" && shown.length === 0 ? future : shown;
  const open = (g: TeamScheduleGame) => onGameSelect({ id: g.id, date: g.date, status: g.status, label: g.label });
  return <div>
    <div className="mb-3 flex flex-wrap gap-1.5" aria-label="Schedule range">
      {([{ id: "recent", label: "Results" }, { id: "upcoming", label: "Upcoming" }, { id: "all", label: "Full season" }] as const).map(v => <button type="button" key={v.id} aria-pressed={view === v.id} onClick={() => setView(v.id)} className={`min-h-10 rounded-xl border px-3 text-xs font-semibold ${view === v.id ? "border-accent/50 bg-accent/15 text-accent" : "border-white/15 bg-white/5 text-muted"}`}>{v.label}</button>)}
    </div>
    <p className="mb-2 text-[11px] text-muted">{data.season} · {games.length} games · tap a score for the box score</p>
    {games.length ? <div className="overflow-hidden rounded-xl border border-white/10 divide-y divide-white/10">
      {games.map(g => <button type="button" key={g.id} onClick={() => open(g)} aria-label={`Open ${g.label}, ${dayLabel(g.date)}, ${g.status === "live" ? "live game" : g.status === "final" ? "box score" : "game preview"}${g.score ? `, ${g.result ? g.result + " " : ""}${g.score}` : ""}`} className="grid w-full grid-cols-[3.3rem_minmax(0,1fr)_auto] items-center gap-2 bg-white/[0.025] px-3 py-2.5 text-left transition-colors hover:bg-accent/10 focus-visible:bg-accent/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
        <span className="text-[11px] text-muted">{dayLabel(g.date)}</span>
        <span className="flex min-w-0 items-center gap-2">
          {g.opponentLogo && <img src={g.opponentLogo} alt="" className="h-6 w-6 shrink-0 object-contain" loading="lazy" onError={e => { e.currentTarget.style.display = "none"; }} />}
          <span className="min-w-0"><span className="block text-[13px] font-semibold leading-snug"><span className="mr-1 font-normal text-muted">{g.home ? "vs" : "@"}</span>{g.opponent}</span><span className="block text-[10px] text-faint">{g.phase}{g.status === "live" ? ` · ${g.detail}` : ""}</span></span>
        </span>
        <span className="text-right"><span className={`block whitespace-nowrap font-mono text-[13px] font-bold ${g.status === "live" || g.result === "W" ? "text-emerald-300" : g.result === "L" ? "text-rose-300" : "text-accent"}`}>{g.result && <span className="mr-1">{g.result}</span>}{g.score ?? (g.status === "upcoming" ? startLabel(g.start) : "—")}</span><span className="block text-[10px] text-muted">{g.status === "live" ? "LIVE · Open ›" : g.status === "final" ? "Box score ›" : g.status === "postponed" ? g.detail : "Preview ›"}</span></span>
      </button>)}
    </div> : <p className="rounded-xl bg-white/5 p-5 text-sm text-muted">No {view === "upcoming" ? "upcoming games" : "games"} are available from {data.source} for this season.</p>}
  </div>;
}
function Roster({ data }: { data: TeamProfileData }) {
  const [search, setSearch] = useState("");
  const rows = data.roster.filter(p => `${p.name} ${p.position} ${p.number ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  return <div>
    <label className="mb-3 block"><span className="sr-only">Search roster</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search roster or position…" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-text placeholder:text-faint focus:border-accent/60 focus:outline-none" /></label>
    <p className="mb-2 text-[11px] text-muted">{data.season} · {data.sport === "mlb" ? "Active roster" : "Team roster"} · {rows.length} players</p>
    {rows.length ? <div className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10">{rows.map(p => <div key={p.id} className="flex items-center gap-2.5 bg-white/[0.025] px-3 py-2">
      <Portrait player={p} logo={data.logo} />
      <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold">{p.name}</span><span className="block text-[11px] text-muted">{[p.height, p.weight].filter(Boolean).join(" · ")}{p.status && p.status !== "Active" ? ` · ${p.status}` : ""}</span></span>
      <span className="text-right"><span className="block text-xs font-bold text-violet-300">{p.position}</span><span className="block font-mono text-[11px] text-muted">{p.number ? `#${p.number}` : "—"}</span></span>
    </div>)}</div> : <p className="rounded-xl bg-white/5 p-5 text-sm text-muted">{search ? "No players match this search." : `Roster data is not available from ${data.source} right now.`}</p>}
  </div>;
}
function Stats({ data }: { data: TeamProfileData }) {
  return <div className="space-y-2">
    <p className="pb-1 text-[11px] text-muted">{data.season} regular-season team statistics</p>
    {data.stats.length ? data.stats.map((g, i) => <details key={g.id} open={i === 0} className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.025]">
      <summary className="cursor-pointer px-3 py-3 text-sm font-semibold text-violet-200">{g.label}<span className="ml-2 text-[11px] font-normal text-muted">{g.rows.length} stats</span></summary>
      <div className="overflow-x-auto"><table className="w-full text-[12px]"><thead><tr className="bg-white/5 text-[10px] uppercase tracking-wide text-muted"><th className="px-3 py-2 text-left font-medium">Statistic</th><th className="px-3 py-2 text-right font-medium">{data.abbr}</th>{data.sport !== "mlb" && <th className="px-3 py-2 text-right font-medium">Opponents</th>}</tr></thead><tbody>{g.rows.map(s => <tr key={s.id} className="border-t border-white/5"><th className="px-3 py-2 text-left font-normal text-muted">{s.label}</th><td className="px-3 py-2 text-right font-mono font-semibold text-accent">{s.value}</td>{data.sport !== "mlb" && <td className="px-3 py-2 text-right font-mono text-text">{s.opponent ?? "—"}</td>}</tr>)}</tbody></table></div>
    </details>) : <p className="rounded-xl bg-white/5 p-5 text-sm text-muted">Team statistics are not available from {data.source} for this season.</p>}
  </div>;
}
export function TeamProfile({ sport, teamId, season, onGameSelect }: { sport: TeamProfileSport; teamId: string; season?: number; onGameSelect: (game: TeamGameSelection) => void }) {
  const [tab, setTab] = useState<"schedule" | "roster" | "stats">("schedule");
  const q = useQuery<TeamProfileData>({ queryKey: ["team-profile", sport, teamId, season], queryFn: async () => {
    const res = await fetch(`/api/teams/${sport}/${encodeURIComponent(teamId)}${season ? `?season=${season}` : ""}`);
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error ?? "The team page is unavailable.");
    return data;
  }, staleTime: 30_000, refetchInterval: query => query.state.data?.schedule.some(g => g.status === "live") ? 30_000 : 300_000 });
  if (q.isPending) return <div className="space-y-3" aria-label="Loading team page"><Skeleton className="h-20 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-48 w-full" /></div>;
  if (!q.data) return <ErrorState title="Couldn't load the team" body={q.error instanceof Error ? q.error.message : "Please try again."} onRetry={() => void q.refetch()} />;
  const data = q.data;
  return <div className="min-w-0" data-testid="team-profile">
    <div className="mb-4 flex items-center gap-3 rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/15 to-violet-500/5 p-3">
      {data.logo && <img src={data.logo} alt="" className="h-14 w-14 shrink-0 object-contain" onError={e => { e.currentTarget.style.display = "none"; }} />}
      <div className="min-w-0"><p className="mb-0.5 text-[10px] font-bold uppercase tracking-[.15em] text-accent">{sport.toUpperCase()} · {data.season}</p><h2 className="text-lg font-bold leading-tight text-text">{data.name}</h2><p className="mt-1 text-[12px] text-muted">{[data.record, data.standing].filter(Boolean).join(" · ")}</p></div>
    </div>
    <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl border border-white/15 bg-black/20 p-1" role="tablist" aria-label="Team page">
      {(["schedule", "roster", "stats"] as const).map(t => <button key={t} type="button" role="tab" id={`team-${sport}-${teamId}-${t}`} aria-selected={tab === t} aria-controls={`team-${sport}-${teamId}-panel`} onClick={() => setTab(t)} className={`min-h-11 rounded-lg text-sm font-bold capitalize transition-colors ${tab === t ? "bg-accent/20 text-accent ring-1 ring-accent/40" : "text-muted hover:bg-white/5 hover:text-text"}`}>{t}</button>)}
    </div>
    {q.isError && <p role="status" className="mb-3 text-[11px] text-amber-200">Refresh failed. Showing the last available team update. <button type="button" className="underline" onClick={() => void q.refetch()}>Retry</button></p>}
    {data.notices.length > 0 && <p className="mb-3 rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-[11px] text-amber-200">{data.notices.join(" ")}</p>}
    <div role="tabpanel" id={`team-${sport}-${teamId}-panel`} aria-labelledby={`team-${sport}-${teamId}-${tab}`}>
      {tab === "schedule" ? <Schedule key={`${sport}:${teamId}`} data={data} onGameSelect={onGameSelect} /> : tab === "roster" ? <Roster key={`${sport}:${teamId}`} data={data} /> : <Stats data={data} />}
    </div>
    <p className="mt-4 text-[10px] text-faint">Source: {data.source}. Scores refresh every 30 seconds while a game is live.</p>
  </div>;
}
