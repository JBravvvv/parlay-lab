import { playerSlug } from "@/lib/cfb/props";

export const FOOTBALL_POSITIONS = ["QB", "RB", "WR", "TE", "FB"] as const;
export type FootballPosition = (typeof FOOTBALL_POSITIONS)[number];
/** `position: null` = rostered at a spot the pick tags never verify (ATH, LB, K…): the name still counts as taken */
export type RosterPosition = { athleteId: string; player: string; teamId: string; position: FootballPosition | null; headshot?: string };
export type PositionFeed = { players: RosterPosition[]; missingTeams: string[] };

export function footballPosition(value: unknown): FootballPosition | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toUpperCase();
  const aliases: Record<string, FootballPosition> = { HB: "RB", TB: "RB", "RUNNING BACK": "RB", "WIDE RECEIVER": "WR", "TIGHT END": "TE", QUARTERBACK: "QB", FULLBACK: "FB" };
  return (FOOTBALL_POSITIONS as readonly string[]).includes(key) ? key as FootballPosition : aliases[key] ?? null;
}

/**
 * ESPN's current roster, scoped to the requested team. No inferred positions. Every rostered name comes back
 * (2026-09-28): a player at a spot the pick tags never verify (ATH, LB, K…) with `position: null` and no headshot, so
 * the lookup below can see that a name is shared — before, an own-roster ATH was invisible and the other side's
 * offensive namesake became the "one" match.
 */
export function rosterPositions(json: unknown, teamId: string): RosterPosition[] {
  const data = json as { team?: { id?: unknown }; athletes?: { items?: { id?: unknown; displayName?: unknown; headshot?: { href?: unknown }; position?: { abbreviation?: unknown } }[] }[] } | null;
  if (!data || String(data.team?.id) !== teamId || !Array.isArray(data.athletes)) return [];
  return data.athletes.flatMap((group) => (Array.isArray(group.items) ? group.items : []).flatMap((p) => {
    if (typeof p.displayName !== "string" || p.id == null) return [];
    const position = footballPosition(p.position?.abbreviation);
    return [{ athleteId: String(p.id), player: p.displayName, teamId, position, ...(position && typeof p.headshot?.href === "string" && /^https:\/\//.test(p.headshot.href) ? { headshot: p.headshot.href } : {}) }];
  }));
}

/**
 * Match only within the given teams; ambiguous names stay unknown. A name-only listing (`position: null`) never
 * answers — it only makes a shared name ambiguous — so a unique match is always an offensive player, as before.
 */
export function rosterLookup(players: readonly RosterPosition[]) {
  const byName = new Map<string, RosterPosition[]>();
  for (const p of players) {
    const key = playerSlug(p.player);
    byName.set(key, [...(byName.get(key) ?? []), p]);
  }
  return (name: string, teamIds: readonly string[]): RosterPosition | null => {
    const matches = (byName.get(playerSlug(name)) ?? []).filter((p) => teamIds.includes(p.teamId));
    const ids = new Set(matches.map((p) => p.athleteId));
    const one = ids.size === 1 && new Set(matches.map((p) => p.teamId)).size === 1 && new Set(matches.map((p) => p.position)).size === 1 ? matches[0] : null;
    return one?.position ? one : null;
  };
}

export function positionLookup(players: readonly RosterPosition[]) {
  const lookup = rosterLookup(players);
  return (name: string, teamIds: readonly string[]) => lookup(name, teamIds)?.position ?? null;
}

/** the teams a feed actually answered for: a team with players in it that the route did not report missing */
export function answeredTeams(feed: PositionFeed | null | undefined): Set<string> {
  const missing = new Set(feed?.missingTeams ?? []);
  return new Set((feed?.players ?? []).map((p) => p.teamId).filter((id) => !missing.has(id)));
}

/**
 * A pick's roster position inside its own game (2026-09-28). The feed keeps offensive players only, so a same-named
 * player on the OTHER side at a position it drops (ATH, LB…) is invisible to the ambiguity check: the pick's own team
 * is searched alone whenever the row names one of the game's two teams. An unknown team searches both, and only once
 * both rosters answered — a missing roster could hide the real player behind the other side's namesake.
 */
export function gamePosition(
  lookup: (name: string, teamIds: readonly string[]) => FootballPosition | null,
  answered: ReadonlySet<string>,
  player: string,
  teamId: string | null | undefined,
  pair: readonly [string, string],
): FootballPosition | null {
  if (teamId && pair.includes(teamId)) return lookup(player, [teamId]);
  return pair.every((id) => answered.has(id)) ? lookup(player, pair) : null;
}
