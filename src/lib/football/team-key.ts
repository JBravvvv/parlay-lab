/** One club identity for side markets and player props within a game. */
export function footballTeamKey(row: { teamId?: string | null; teamAbbr?: string | null; team?: string | null; side?: string }, game?: { home: { id: string; abbr: string }; away: { id: string; abbr: string } }): string | null {
  if (game) {
    if (row.teamId === game.home.id || row.side === "home") return game.home.abbr;
    if (row.teamId === game.away.id || row.side === "away") return game.away.abbr;
  }
  return row.teamAbbr ?? row.team ?? null;
}
