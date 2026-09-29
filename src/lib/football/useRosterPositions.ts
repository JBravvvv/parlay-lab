"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useReadQueryClient } from "@/lib/use-read-query-client";
import type { League } from "./league";
import { answeredTeams, footballPosition, gamePosition, positionLookup, rosterLookup } from "./positions";
import { loadPositionFeed } from "./positions-client";

type RowLike = { gameId: string; player: string; pos?: string | null; headshot?: string | null; teamId?: string | null };
type GameLike = { id: string; status: string; home: { id: string }; away: { id: string } };

/**
 * ESPN's current rosters for the teams whose prop rows are missing a position, headshot or team (a player ESPN's
 * season stat tables did not list, so the props context could not join him) — keyless roster metadata through our own
 * /api/football/positions, cached an hour at the edge; never an Odds credit. Moved out of CfbProps (2026-09-28) so the
 * Board fills the same gaps the Parlay Builder does, and no longer waits for the generator to open: every pick shows
 * its position (Josh: "Add players position to every pick on parlay lab").
 *
 * `positionOf` is the verified position — the row's own when it is one of QB/RB/WR/TE/FB, else the roster's inside
 * that game only (`gamePosition`: the row's own team when it names one, both sides only once both answered), and an
 * ambiguous name stays unknown. The query key is the sorted team list, so two surfaces reading the same board share
 * one fetch. A final game keeps its teams in the list — its picks still show — so the key only grows as games get
 * priced, and a grown key keeps the rosters in hand until its own answer lands (same league only: an NFL and a CFB
 * team can share an ESPN id). `pending` is true until the CURRENT list has answered.
 */
export function useRosterPositions(league: League, rows: readonly RowLike[] | null | undefined, games: readonly GameLike[], enabled = true) {
  const teams = useMemo(() => {
    const needsPosition = new Set((rows ?? []).filter((r) => !footballPosition(r.pos) || !r.headshot || !r.teamId).map((r) => r.gameId));
    return [...new Set(games.filter((g) => needsPosition.has(g.id)).flatMap((g) => [g.home.id, g.away.id]))].sort().join(",");
  }, [rows, games]);
  const client = useReadQueryClient();
  const q = useQuery({
    queryKey: [league, "roster-positions", teams],
    queryFn: ({ signal }) => loadPositionFeed(league, teams.split(","), signal),
    enabled: enabled && !!teams,
    staleTime: (query) => (query.state.data?.missingTeams.length ? 60_000 : 3_600_000),
    retry: 1,
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[0] === league ? prev : undefined),
  }, client);
  const rosterPlayer = useMemo(() => rosterLookup(q.data?.players ?? []), [q.data]);
  const rosterPosition = useMemo(() => positionLookup(q.data?.players ?? []), [q.data]);
  const answered = useMemo(() => answeredTeams(q.data), [q.data]);
  const gameById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const positionOf = useCallback(
    (row: RowLike) => {
      const game = gameById.get(row.gameId);
      return footballPosition(row.pos) ?? (game ? gamePosition(rosterPosition, answered, row.player, row.teamId, [game.home.id, game.away.id]) : null);
    },
    [gameById, rosterPosition, answered],
  );
  const pending = enabled && !!teams && (q.isPending || q.isPlaceholderData);
  return { teams, query: q, pending, rosterPlayer, positionOf };
}

/** the position a pick SHOWS: the verified one, else the feed's own abbreviation as sent ("ATH") — never a guess */
export const shownFootballPosition = (verified: string | null | undefined, raw: string | null | undefined) => verified ?? raw ?? null;
