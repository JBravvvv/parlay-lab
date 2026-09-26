/** Public team pages. Provider values stay nullable; a missing score never becomes zero. */
export type TeamProfileSport = "nfl" | "cfb" | "mlb";
export type TeamGameSelection = { id: string; date: string; status: string; label: string };
export type TeamScheduleGame = TeamGameSelection & {
  start: string; opponent: string; opponentAbbr: string; opponentLogo: string | null;
  home: boolean; score: string | null; result: "W" | "L" | "T" | null; detail: string; phase: string;
};
export type TeamRosterPlayer = { id: string; name: string; number: string | null; position: string; group: string; image: string | null; status: string | null; height: string | null; weight: string | null };
export type TeamStatGroup = { id: string; label: string; rows: { id: string; label: string; value: string; opponent: string | null }[] };
export type TeamProfileData = {
  sport: TeamProfileSport; season: number; id: string; name: string; abbr: string; logo: string | null; color: string | null;
  record: string | null; standing: string | null; schedule: TeamScheduleGame[]; roster: TeamRosterPlayer[]; stats: TeamStatGroup[];
  notices: string[]; source: string; updatedAt: string;
};
type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj => x && typeof x === "object" && !Array.isArray(x) ? x as Obj : {};
const arr = (x: unknown): unknown[] => Array.isArray(x) ? x : [];
const txt = (x: unknown): string | null => typeof x === "string" && x.trim() ? x : typeof x === "number" && Number.isFinite(x) ? String(x) : null;
const image = (x: unknown): string | null => typeof x === "string" && /^https:\/\//.test(x) ? x : null;
const logo = (x: Obj): string | null => image(x.logo) ?? image(obj(arr(x.logos)[0]).href);
const score = (x: unknown): string | null => txt(obj(x).displayValue) ?? txt(obj(x).value) ?? txt(x);
function datePT(start: string): string {
  const d = new Date(start);
  if (!Number.isFinite(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  return ["year", "month", "day"].map(type => parts.find(p => p.type === type)?.value).join("-");
}
function result(own: string | null, other: string | null, status: string): "W" | "L" | "T" | null {
  if (status !== "final" || own === null || other === null || !Number.isFinite(Number(own)) || !Number.isFinite(Number(other))) return null;
  return Number(own) > Number(other) ? "W" : Number(own) < Number(other) ? "L" : "T";
}
export function teamProfileSeason(sport: TeamProfileSport, now = new Date()): number {
  return now.getUTCFullYear() - (sport !== "mlb" && now.getUTCMonth() < 3 ? 1 : 0);
}
export function espnTeamSchedule(docs: unknown[], teamId: string, season: number): TeamScheduleGame[] {
  const games = new Map<string, TeamScheduleGame>();
  for (const doc of docs) for (const raw of arr(obj(doc).events)) {
    const e = obj(raw), c = obj(arr(e.competitions)[0]);
    const year = Number(obj(e.season).year ?? obj(obj(doc).season).year);
    if (Number.isFinite(year) && year !== season) continue;
    const sides = arr(c.competitors).map(obj);
    const own = sides.find(s => String(obj(s.team).id ?? s.id) === teamId);
    const opponent = sides.find(s => String(obj(s.team).id ?? s.id) !== teamId);
    const id = txt(e.id), start = txt(e.date ?? c.date);
    if (!own || !opponent || !id || !start || !datePT(start)) continue;
    const t = obj(opponent.team), st = obj(obj(c.status ?? e.status).type);
    const status = /postpon|cancel|suspend/i.test(String(st.name)) ? "postponed" : st.completed === true || st.state === "post" ? "final" : st.state === "in" ? "live" : "upcoming";
    const ownScore = status === "upcoming" ? null : score(own.score), oppScore = status === "upcoming" ? null : score(opponent.score);
    games.set(id, {
      id, start, date: datePT(start), status, label: txt(e.shortName ?? e.name) ?? "Game",
      opponent: txt(t.displayName ?? t.name) ?? "Opponent TBD", opponentAbbr: txt(t.abbreviation) ?? "TBD", opponentLogo: logo(t),
      home: own.homeAway === "home", score: ownScore !== null && oppScore !== null ? `${ownScore}–${oppScore}` : null,
      result: result(ownScore, oppScore, status), detail: txt(st.shortDetail ?? st.detail) ?? status,
      phase: txt(obj(e.seasonType).name) ?? txt(obj(obj(doc).season).name) ?? "Season",
    });
  }
  return [...games.values()].sort((a, b) => a.start.localeCompare(b.start));
}
export function espnTeamRoster(doc: unknown): TeamRosterPlayer[] {
  const seen = new Set<string>(), out: TeamRosterPlayer[] = [];
  for (const raw of arr(obj(doc).athletes)) {
    const group = obj(raw);
    for (const item of Array.isArray(group.items) ? group.items : [raw]) {
      const p = obj(item), id = txt(p.id), name = txt(p.displayName ?? p.fullName);
      if (!id || !name || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, name, number: txt(p.jersey), position: txt(obj(p.position).abbreviation) ?? "—", group: txt(group.position) ?? "Roster", image: image(obj(p.headshot).href), status: txt(obj(p.status).name), height: txt(p.displayHeight), weight: txt(p.displayWeight) });
    }
  }
  return out;
}
export function espnTeamStats(doc: unknown, season: number): TeamStatGroup[] {
  const d = obj(doc), year = Number(obj(d.season).year);
  if (Number.isFinite(year) && year !== season) return [];
  const data = obj(d.results), other = new Map<string, string>();
  for (const raw of arr(Array.isArray(data.opponent) ? data.opponent : obj(data.opponent).categories)) {
    const group = obj(raw);
    for (const item of arr(group.stats)) { const s = obj(item), v = txt(s.displayValue ?? s.value); if (v !== null) other.set(`${group.name}:${s.name}`, v); }
  }
  return arr(obj(data.stats).categories).map(raw => {
    const group = obj(raw), id = txt(group.name) ?? "stats", rows = new Map<string, TeamStatGroup["rows"][number]>();
    for (const item of arr(group.stats)) {
      const s = obj(item), key = txt(s.name), value = txt(s.displayValue ?? s.value);
      if (key && value !== null) rows.set(key, { id: key, label: txt(s.displayName ?? s.shortDisplayName) ?? key, value, opponent: other.get(`${id}:${key}`) ?? null });
    }
    return { id, label: txt(group.displayName) ?? id, rows: [...rows.values()] };
  }).filter(g => g.rows.length);
}
export function shapeEspnTeamProfile(input: { sport: "nfl" | "cfb"; teamId: string; season: number; team: unknown; schedules: unknown[]; roster: unknown; stats: unknown; notices?: string[]; now?: string }): TeamProfileData | null {
  const t = obj(obj(input.team).team);
  if (String(t.id) !== input.teamId || !txt(t.displayName)) return null;
  return { sport: input.sport, season: input.season, id: input.teamId, name: txt(t.displayName)!, abbr: txt(t.abbreviation) ?? "", logo: logo(t), color: typeof t.color === "string" && /^[0-9a-f]{6}$/i.test(t.color) ? `#${t.color}` : null,
    record: txt(obj(arr(obj(t.record).items).find(x => obj(x).type === "total")).summary), standing: txt(t.standingSummary),
    schedule: espnTeamSchedule(input.schedules, input.teamId, input.season), roster: espnTeamRoster(input.roster), stats: espnTeamStats(input.stats, input.season), notices: input.notices ?? [], source: "ESPN", updatedAt: input.now ?? new Date().toISOString() };
}
export function mlbTeamSchedule(doc: unknown, teamId: string, season: number): TeamScheduleGame[] {
  const out: TeamScheduleGame[] = [];
  for (const day of arr(obj(doc).dates)) for (const raw of arr(obj(day).games)) {
    const e = obj(raw), teams = obj(e.teams), home = obj(teams.home), away = obj(teams.away);
    if (txt(e.season) && Number(e.season) !== season) continue;
    const isHome = String(obj(home.team).id) === teamId;
    if (!isHome && String(obj(away.team).id) !== teamId) continue;
    const own = isHome ? home : away, opponent = isHome ? away : home, t = obj(opponent.team), st = obj(e.status), start = txt(e.gameDate), id = txt(e.gamePk);
    if (!id || !start || !datePT(start)) continue;
    const status = /postpon|cancel|suspend/i.test(String(st.detailedState)) ? "postponed" : st.abstractGameState === "Final" ? "final" : st.abstractGameState === "Live" ? "live" : "upcoming";
    const a = status === "upcoming" ? null : score(own.score), b = status === "upcoming" ? null : score(opponent.score);
    out.push({ id, start, date: datePT(start), status, label: `${txt(obj(away.team).abbreviation ?? obj(away.team).name) ?? "Away"} @ ${txt(obj(home.team).abbreviation ?? obj(home.team).name) ?? "Home"}`,
      opponent: txt(t.name) ?? "Opponent TBD", opponentAbbr: txt(t.abbreviation) ?? "TBD", opponentLogo: txt(t.id) ? `https://www.mlbstatic.com/team-logos/${t.id}.svg` : null,
      home: isHome, score: a !== null && b !== null ? `${a}–${b}` : null, result: result(a, b, status), detail: txt(st.detailedState) ?? status,
      phase: e.gameType === "S" ? "Spring training" : e.gameType === "R" ? "Regular season" : txt(e.seriesDescription) ?? "Postseason" });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}
export function mlbTeamRoster(doc: unknown): TeamRosterPlayer[] {
  return arr(obj(doc).roster).flatMap(raw => {
    const r = obj(raw), p = obj(r.person), id = txt(p.id), name = txt(p.fullName);
    return id && name ? [{ id, name, number: txt(r.jerseyNumber ?? p.primaryNumber), position: txt(obj(r.position).abbreviation) ?? "—", group: txt(obj(r.position).type) ?? "Roster", image: `https://img.mlbstatic.com/mlb-photos/image/upload/w_96,q_auto:best/v1/people/${id}/headshot/67/current`, status: txt(obj(r.status).description), height: txt(p.height), weight: txt(p.weight) ? `${p.weight} lbs` : null }] : [];
  });
}
const MLB_STAT_LABELS: Record<string, string> = { avg: "Batting average", obp: "On-base percentage", slg: "Slugging percentage", ops: "OPS", rbi: "RBI", era: "ERA", whip: "WHIP", fielding: "Fielding percentage" };
export function mlbTeamStats(doc: unknown, season: number): TeamStatGroup[] {
  return arr(obj(doc).stats).flatMap(raw => {
    const g = obj(raw), id = txt(obj(g.group).displayName) ?? "stats", split = arr(g.splits).map(obj).find(s => Number(s.season) === season);
    if (!split) return [];
    return [{ id, label: id.charAt(0).toUpperCase() + id.slice(1), rows: Object.entries(obj(split.stat)).flatMap(([key, value]) => txt(value) === null ? [] : [{ id: key, label: MLB_STAT_LABELS[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase()), value: txt(value)!, opponent: null }]) }];
  });
}
export function shapeMlbTeamProfile(input: { teamId: string; season: number; team: unknown; schedule: unknown; roster: unknown; stats: unknown; notices?: string[]; now?: string }): TeamProfileData | null {
  const t = arr(obj(input.team).teams).map(obj).find(t => String(t.id) === input.teamId);
  if (!t || !txt(t.name)) return null;
  const finalRegular = arr(obj(input.schedule).dates).flatMap(day => arr(obj(day).games)).map(obj).filter(g => g.gameType === "R" && obj(g.status).abstractGameState === "Final").sort((a, b) => String(b.gameDate).localeCompare(String(a.gameDate)))[0];
  const own = Object.values(obj(obj(finalRegular).teams)).map(obj).find(side => String(obj(side.team).id) === input.teamId);
  const record = obj(own?.leagueRecord), wins = txt(record.wins), losses = txt(record.losses);
  return { sport: "mlb", season: input.season, id: input.teamId, name: txt(t.name)!, abbr: txt(t.abbreviation) ?? "", logo: `https://www.mlbstatic.com/team-logos/${input.teamId}.svg`, color: null,
    record: wins !== null && losses !== null ? `${wins}–${losses}` : null, standing: txt(obj(t.division).name), schedule: mlbTeamSchedule(input.schedule, input.teamId, input.season), roster: mlbTeamRoster(input.roster), stats: mlbTeamStats(input.stats, input.season), notices: input.notices ?? [], source: "MLB Stats API", updatedAt: input.now ?? new Date().toISOString() };
}
