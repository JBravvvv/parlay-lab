import { playerSlug } from "@/lib/cfb/props";

export const FOOTBALL_POSITIONS = ["QB", "RB", "WR", "TE", "FB"] as const;
export type FootballPosition = (typeof FOOTBALL_POSITIONS)[number];
export type RosterPosition = { athleteId: string; player: string; teamId: string; position: FootballPosition };
export type PositionFeed = { players: RosterPosition[]; missingTeams: string[] };

export function footballPosition(value: unknown): FootballPosition | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toUpperCase();
  const aliases: Record<string, FootballPosition> = { HB: "RB", TB: "RB", "RUNNING BACK": "RB", "WIDE RECEIVER": "WR", "TIGHT END": "TE", QUARTERBACK: "QB", FULLBACK: "FB" };
  return (FOOTBALL_POSITIONS as readonly string[]).includes(key) ? key as FootballPosition : aliases[key] ?? null;
}

/** ESPN's current roster, scoped to the requested team. No inferred positions. */
export function rosterPositions(json: unknown, teamId: string): RosterPosition[] {
  const data = json as { team?: { id?: unknown }; athletes?: { items?: { id?: unknown; displayName?: unknown; position?: { abbreviation?: unknown } }[] }[] } | null;
  if (!data || String(data.team?.id) !== teamId || !Array.isArray(data.athletes)) return [];
  return data.athletes.flatMap((group) => (Array.isArray(group.items) ? group.items : []).flatMap((p) => {
    const position = footballPosition(p.position?.abbreviation);
    return position && typeof p.displayName === "string" && p.id != null
      ? [{ athleteId: String(p.id), player: p.displayName, teamId, position }] : [];
  }));
}

/** Match only within the two teams in this game; ambiguous names stay unknown. */
export function positionLookup(players: readonly RosterPosition[]) {
  const byName = new Map<string, RosterPosition[]>();
  for (const p of players) {
    const key = playerSlug(p.player);
    byName.set(key, [...(byName.get(key) ?? []), p]);
  }
  return (name: string, teamIds: readonly string[]): FootballPosition | null => {
    const matches = (byName.get(playerSlug(name)) ?? []).filter((p) => teamIds.includes(p.teamId));
    const ids = new Set(matches.map((p) => p.athleteId));
    return ids.size === 1 && new Set(matches.map((p) => p.position)).size === 1 ? matches[0].position : null;
  };
}
