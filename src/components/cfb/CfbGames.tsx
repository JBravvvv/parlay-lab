"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DateRail } from "@/components/games/DateRail";
import { Reveal } from "@/components/motion/Reveal";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { loadCfbFinals } from "@/lib/cfb/client";
import { addDays } from "@/lib/cfb/dates";
import type { CfbFinals, CfbGame } from "@/lib/cfb/types";
import { railLabel } from "@/lib/games";
import { useCfbDesk } from "./CfbBoard";
import { CfbGameCard, timeLabelPT } from "./CfbGameCard";

/**
 * CFB GAMES (INSTRUCTION 38, 2026-09-05): the schedule-and-scores view for a Pacific date —
 * every FBS game grouped by its kickoff hour, a live pulse on anything in progress, finals with
 * the score, and ESPN's embedded line on each card as context. Tapping a game opens its card
 * with the full model.
 *
 * Scores come from two feeds so the odds quota stays untouched: the slate (one call per cache
 * window) carries clocks and lines; while any game is live, the finals endpoint (ESPN only, no
 * odds call) is polled every minute and its scores / statuses overlay the cards.
 */

const FINALS_POLL_MS = 60_000;

/** The slate's games with live finals laid over them (score + status only — the model stays). */
function overlay(games: CfbGame[], finals: CfbFinals | undefined): CfbGame[] {
  if (!finals) return games;
  return games.map((g) => {
    const f = finals[g.id];
    if (!f) return g;
    const status = f.final ? "final" : f.status;
    if (status === g.status && f.home === g.homeScore && f.away === g.awayScore) return g;
    const scored = status === "live" || status === "final";
    return { ...g, status, homeScore: scored ? f.home : g.homeScore, awayScore: scored ? f.away : g.awayScore };
  });
}

type Group = { key: string; label: string; games: CfbGame[] };

/** Games in kickoff order, grouped by Pacific kickoff time ("9:00 AM", "12:30 PM", …). */
function groupByKickoff(games: CfbGame[]): Group[] {
  const sorted = [...games].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const groups: Group[] = [];
  for (const g of sorted) {
    const label = timeLabelPT(g.start);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.games.push(g);
    else groups.push({ key: `${label}-${g.start}`, label, games: [g] });
  }
  return groups;
}

export function CfbGames() {
  const { today, date, pick, rail, bankroll, q, slate } = useCfbDesk();
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = useCallback((id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const anyLive = !!slate?.games.some((g) => g.status === "live");
  const finalsQ = useQuery({
    queryKey: ["cfb", "finals", date],
    queryFn: () => loadCfbFinals(date),
    enabled: anyLive,
    staleTime: 30_000,
    refetchInterval: anyLive ? FINALS_POLL_MS : false,
  });

  const games = useMemo(() => overlay(slate?.games ?? [], finalsQ.data?.date === date ? finalsQ.data.finals : slate?.finals), [slate, finalsQ.data, date]);
  const groups = useMemo(() => groupByKickoff(games), [games]);
  const counts = useMemo(
    () => ({
      live: games.filter((g) => g.status === "live").length,
      upcoming: games.filter((g) => g.status === "upcoming").length,
      final: games.filter((g) => g.status === "final").length,
      postponed: games.filter((g) => g.status === "postponed").length,
    }),
    [games],
  );

  const loading = bankroll == null || q.isPending;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <DateRail dates={rail} date={date} today={today} onPick={pick} />
        </div>
        <div className="mb-5 flex shrink-0 items-center gap-1">
          <Pill variant="ghost" className="press h-[30px] !px-3 py-0" onClick={() => pick(addDays(date, -1))} aria-label="Previous day" title="Previous day">
            ‹
          </Pill>
          <Pill variant="ghost" className="press h-[30px] !px-3 py-0" onClick={() => pick(addDays(date, 1))} aria-label="Next day" title="Next day">
            ›
          </Pill>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass p-4">
              <Skeleton className="mb-3 h-3 w-24" />
              <Skeleton className="mb-2 h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ))}
        </div>
      ) : q.isError ? (
        <Panel>
          <ErrorState title="Couldn't load the slate" body={(q.error as Error).message} onRetry={() => void q.refetch()} />
        </Panel>
      ) : games.length === 0 ? (
        <Panel>
          <EmptyState title="No FBS games" body={`Nothing on ESPN's college football scoreboard for ${railLabel(date)}. Use the rail or the arrows to move days.`} />
        </Panel>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.14em]">
            {counts.live > 0 && (
              <span className="inline-flex items-center gap-1.5 text-live">
                <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-live" aria-hidden />
                {counts.live} live
              </span>
            )}
            <span className="text-muted">
              <span className="num text-text">{counts.upcoming}</span> upcoming
            </span>
            <span className="text-muted">
              <span className="num text-text">{counts.final}</span> final
            </span>
            {counts.postponed > 0 && (
              <span className="text-gold">
                <span className="num">{counts.postponed}</span> postponed
              </span>
            )}
            {slate?.oddsMissing && <span className="text-neg normal-case tracking-normal">scores only — no odds feed this load</span>}
            {anyLive && (
              <span className="ml-auto text-[10px] font-medium normal-case tracking-normal text-faint">
                scores refresh every minute{finalsQ.isFetching ? "…" : ""}
              </span>
            )}
          </div>

          {groups.map((grp, gi) => {
            const live = grp.games.filter((g) => g.status === "live").length;
            return (
              <Reveal key={grp.key} delay={Math.min(gi * 0.05, 0.25)}>
                <section>
                  <h2 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                    {live > 0 && <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-live" aria-hidden />}
                    <span className={`num ${live > 0 ? "text-live" : "text-text"}`}>{grp.label}</span>
                    <span className="text-faint">PT</span>
                    <span className="num text-faint">{grp.games.length}</span>
                  </h2>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {grp.games.map((g) => (
                      <CfbGameCard key={g.id} game={g} expanded={open.has(g.id)} onToggle={() => toggle(g.id)} />
                    ))}
                  </div>
                </section>
              </Reveal>
            );
          })}

          <div className="text-[10.5px] leading-relaxed text-faint">
            Schedule, scores, clocks and records are ESPN&apos;s college football scoreboard; ESPN&apos;s embedded line on a card is context,
            not a priced quote. Prices, fair odds and grades are the CFB desk&apos;s own board (Caesars settles). Informational only, not
            betting advice.
          </div>
        </div>
      )}
    </div>
  );
}
