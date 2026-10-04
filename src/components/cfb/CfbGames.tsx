"use client";
import { useSessionState } from "@/lib/use-session-state";
import {useFootballPrices,useFootballPropsPrices} from "@/lib/sportsbook/useFootballPrices";
import {resizeFootballStakes} from "@/lib/sportsbook/football";
import {useSportsbook} from "@/lib/sportsbook/store";
import {bookName} from "@/lib/sportsbook/books";

import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DateRail } from "@/components/games/DateRail";
import { Reveal } from "@/components/motion/Reveal";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useLeague } from "@/components/football/LeagueContext";
import { addDays } from "@/lib/cfb/dates";
import type { CfbFinals, CfbGame, CfbSlate } from "@/lib/cfb/types";
import { railLabel } from "@/lib/games";
import { CfbGameCard, timeLabelPT } from "./CfbGameCard";
import { findGameSplits } from "@/lib/splits";
import { useSplits } from "@/lib/use-splits";

/**
 * CFB GAMES (INSTRUCTION 38, 2026-09-05): the schedule-and-scores view for a Pacific date —
 * every FBS game grouped by its kickoff hour, a live pulse on anything in progress, finals with
 * the score, and ESPN's embedded line on each card as context. Each card is the Caesars-grammar
 * OddsGrid (INSTRUCTION 40); tapping a game (or a price) opens its card with the full model.
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

/**
 * HOLD THE DAY'S SLATE THROUGH A BANKROLL RE-KEY (2026-09-28). The slate query is keyed on (date, bankroll) and the bankroll is
 * a running figure (base + graded P/L), so a ledger sync that grades a ticket re-keys it: q went pending with no data, the list
 * swapped to skeletons and every card unmounted — taking an open game sheet or team page with it. The slate to render is this
 * key's own, else the last one seen for the SAME date, never another day's. A held slate's stakes were sized at the bankroll it
 * was fetched at: on the settle book useFootballPrices returns those rows untouched, so CfbGames re-sizes them first
 * (resizeFootballStakes) whenever the bankroll has moved. Scoped to Games on purpose: Board, Builder and Sharp act on
 * bankroll-dependent Kelly stakes, so useDesk gets no placeholderData.
 */
export function heldSlate(raw: CfbSlate | undefined, last: { date: string; slate: CfbSlate } | null, date: string): CfbSlate | undefined {
  return raw ?? (last?.date === date ? last.slate : undefined);
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
  /* the league seam (2026-09-08): desk hook, finals loader, query prefix and copy all come off useLeague() */
  const L = useLeague();
  const { today, date, pick, rail, bankroll, q, slate: rawSlate } = L.useDesk();
  const bank = bankroll ?? L.bankBase;
  const lastSlate = useRef<{ date: string; bankroll: number; slate: CfbSlate } | null>(null);
  if (rawSlate) lastSlate.current = { date, bankroll: bank, slate: rawSlate };
  const held = heldSlate(rawSlate, lastSlate.current, date);
  const heldAt = lastSlate.current?.bankroll;
  /* the route sizes at the whole-dollar figure loadSlate sends, so the re-size does too */
  const shownSlate = useMemo(() => (!rawSlate && held && heldAt !== bank ? resizeFootballStakes(held, Math.round(bank), L.rules) : held), [rawSlate, held, heldAt, bank, L.rules]);
  const slate=useFootballPrices(shownSlate,bank,L.rules);
  const selectedBook=bookName(useSportsbook());
  /* bet % / money % per side (2026-09-18) — one feed per league, matched per game below */
  const splitsFeed = useSplits(L.id);
  const [open, setOpen] = useSessionState<ReadonlySet<string>>("games:open", () => new Set());
  /* the team page open over a card, held here beside `open` (2026-09-28) so it survives the card remounting under it */
  const [profile, setProfile] = useSessionState<{ gameId: string; team: CfbGame["home"] } | null>("games:profile", null);
  const toggle = useCallback((id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [setOpen]);

  const anyLive = !!slate?.games.some((g) => g.status === "live");
  const finalsQ = useQuery({
    queryKey: [L.queryPrefix, "finals", date],
    queryFn: () => L.client.loadFinals(date),
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

  const loading = bankroll == null || (q.isPending && !shownSlate);

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

      {/* a failed refresh keeps the slate on screen (TanStack keeps data while isError), so say so in one line */}
      {!loading && q.isError && shownSlate && (
        <p role="status" className="text-[11px] text-muted">
          Refresh failed · showing the last loaded slate ·{" "}
          <button type="button" onClick={() => void q.refetch()} className="font-semibold underline underline-offset-2 hover:text-text">
            Retry
          </button>
        </p>
      )}

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
      ) : q.isError && !shownSlate ? (
        <Panel>
          <ErrorState title="Couldn't load the slate" body={(q.error as Error).message} onRetry={() => void q.refetch()} />
        </Panel>
      ) : games.length === 0 ? (
        <Panel>
          <EmptyState title={`No ${L.noun} games`} body={`Nothing on ESPN's ${L.label} scoreboard for ${railLabel(date)}. Use the rail or the arrows to move days.`} />
        </Panel>
      ) : (
        <div className="space-y-4">
          {/* the day at a glance — Caesars-style count chips on one scrolling strip */}
          <div className="chip-row -mx-1 px-1 text-[10.5px] font-semibold uppercase tracking-[0.12em]">
            {counts.live > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-live/40 bg-live/10 px-2.5 py-1 text-live">
                <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-live" aria-hidden />
                <span className="num">{counts.live}</span> live
              </span>
            )}
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${L.id === "nfl" ? "border-nfl/30 bg-nfl/[0.08] text-nfl" : "border-cfb/30 bg-cfb/[0.08] text-cfb"}`}>
              <span className="num">{counts.upcoming}</span> upcoming
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line-2 bg-white/[0.04] px-2.5 py-1 text-muted">
              <span className="num text-text">{counts.final}</span> final
            </span>
            {counts.postponed > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-gold">
                <span className="num">{counts.postponed}</span> postponed
              </span>
            )}
            {slate?.oddsMissing && (
              <span className="inline-flex items-center rounded-full border border-neg/40 bg-neg/10 px-2.5 py-1 normal-case tracking-normal text-neg">
                scores only — no odds feed this load
              </span>
            )}
            {anyLive && (
              <span className="inline-flex items-center self-center text-[10px] font-medium normal-case tracking-normal text-faint">
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
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {grp.games.map((g) => (
                      <CfbGameCard key={g.id} game={g} expanded={open.has(g.id)} onToggle={() => toggle(g.id)} profileTeam={profile?.gameId === g.id ? profile.team : null} onProfileTeam={(t) => setProfile(t ? { gameId: g.id, team: t } : null)} splits={findGameSplits(splitsFeed, g.away, g.home, g.date)} />
                    ))}
                  </div>
                </section>
              </Reveal>
            );
          })}

          <div className="text-[10.5px] leading-relaxed text-faint">
            Schedule, scores, clocks and records are ESPN&apos;s {L.label} scoreboard; ESPN&apos;s embedded line on a card is context,
            not a priced quote. Prices, fair odds and grades are the {L.short} desk&apos;s board at the selected sportsbook. Informational only, not
            betting advice.
          </div>
        </div>
      )}
    </div>
  );
}
