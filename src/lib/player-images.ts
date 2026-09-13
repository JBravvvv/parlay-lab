/** Public identity/imagery only; no fantasy accounts or betting data. */
export type ImageLeague = "mlb" | "nfl" | "cfb";
export type ImageTeam = { id: string; abbr: string; name: string; logo: string | null; color: string | null; rank: null };
export type PlayerImage = { id: string; name: string; position: string | null; team: ImageTeam; srcs: string[] };
export const imageNameKey = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\.?$/g, "").replace(/[^a-z0-9]/g, "");
export const imageTeamKey = (team: string) => ({ WAS:"WSH", JAC:"JAX", LA:"LAR", ATH:"OAK", CWS:"CHW" }[team.toUpperCase()] ?? team.toUpperCase());

const nameIndexes = new WeakMap<readonly PlayerImage[], Map<string, PlayerImage[]>>();

export function matchPlayerImage(players: readonly PlayerImage[], name: string, team?: string | null, teamIds: readonly string[] = []): PlayerImage | null {
  let index = nameIndexes.get(players);
  if (!index) {
    index = new Map();
    for (const p of players) { const key=imageNameKey(p.name); const bucket=index.get(key); if(bucket)bucket.push(p);else index.set(key,[p]); }
    nameIndexes.set(players,index);
  }
  const matches = (index.get(imageNameKey(name)) ?? []).filter(p => (!teamIds.length || teamIds.includes(p.team.id)) && (!team || imageTeamKey(p.team.abbr) === imageTeamKey(team) || p.team.id === team || imageNameKey(p.team.name) === imageNameKey(team)));
  return matches.length === 1 ? matches[0] : null;
}

/** Roster Lab's ESPN-first headshot source, using ESPN roster identity rather than cross-provider IDs. */
export function parseImageRoster(data: unknown, team: ImageTeam, league: ImageLeague): PlayerImage[] {
  const json = data as { team?: {id?:string}; athletes?: Array<{items?: unknown[]}> } | null;
  if (!json || String(json.team?.id) !== team.id || !Array.isArray(json.athletes)) return [];
  const sport = league === "cfb" ? "college-football" : league;
  return json.athletes.flatMap(group => Array.isArray(group.items) ? group.items : [group]).flatMap(value => {
    const p = value as {id?:string; displayName?:string; position?:{abbreviation?:string}; headshot?:{href?:string}};
    if (!/^\d+$/.test(String(p.id)) || typeof p.displayName !== "string") return [];
    const photo = `https://a.espncdn.com/combiner/i?img=/i/headshots/${sport}/players/full/${p.id}.png&w=96&h=96`;
    return [{id:String(p.id),name:p.displayName,position:p.position?.abbreviation ?? null,team,srcs:[league === "cfb" && p.headshot?.href?.startsWith("https://a.espncdn.com/") ? p.headshot.href : photo]}];
  });
}

/** Sleeper IDs are used only after a unique name + club match, never as ESPN IDs. */
export function addSleeperFallback(players: PlayerImage[], data: unknown): PlayerImage[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return players;
  const rows = Object.entries(data).flatMap(([id,value]) => {
    const p = value as {full_name?:string;first_name?:string;last_name?:string;team?:string;position?:string};
    return /^\d+$/.test(id) && p && typeof p.team === "string" ? [{id,name:p.full_name ?? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),team:p.team,position:p.position}] : [];
  });
  const index = new Map<string, typeof rows>();
  for (const row of rows) { const key=`${imageNameKey(row.name)}|${imageTeamKey(row.team)}`; const bucket=index.get(key);if(bucket)bucket.push(row);else index.set(key,[row]); }
  return players.map(p => {
    const matches = (index.get(`${imageNameKey(p.name)}|${imageTeamKey(p.team.abbr)}`) ?? []).filter(r=>!p.position || r.position===p.position);
    return matches.length===1 ? {...p,srcs:[...p.srcs,`https://sleepercdn.com/content/nfl/players/${matches[0].id}.jpg`]} : p;
  });
}
