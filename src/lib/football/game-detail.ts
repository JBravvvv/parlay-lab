/** Public ESPN summary → display-only game coverage. Missing statistics stay missing. */
export type FootballDetailSport = "nfl" | "cfb";
export type FootballGamePhase = "live" | "final" | "upcoming" | "postponed";
export type FootballDetailTeam = {
  id: string; name: string; abbr: string; logo: string | null; score: string | null;
  record: string | null; winner: boolean; possession: boolean; periods: (string | null)[];
};
export type FootballPlayerTable = {
  key: string; title: string; labels: string[]; descriptions: string[];
  players: { id: string; name: string; jersey: string | null; stats: (string | null)[] }[];
  totals: (string | null)[];
};
export type FootballGamePlay = {
  id: string; text: string; type: string | null; period: number | null; clock: string | null;
  teamId: string | null; downDistance: string | null; scoring: boolean;
  awayScore: string | null; homeScore: string | null;
};
export type FootballGameDetailPayload = {
  id: string; sport: FootballDetailSport; date: string | null; phase: FootballGamePhase;
  status: string; venue: string | null; situation: string | null; fetchedAt: string;
  away: FootballDetailTeam; home: FootballDetailTeam;
  boxscore: { away: FootballPlayerTable[]; home: FootballPlayerTable[] };
  teamStats: { key: string; label: string; away: string | null; home: string | null }[];
  /** Newest first; includes the current drive, not only completed drives. */
  plays: FootballGamePlay[]; scoringPlays: FootballGamePlay[];
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Obj : {};
const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const str = (v: unknown): string | null => typeof v === "string" && v.trim() ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : null;
const num = (v: unknown): number | null => { const s = str(v); return s !== null && Number.isFinite(Number(s)) ? Number(s) : null; };
const display = (v: unknown): string | null => str(v) ?? str(obj(v).displayValue) ?? str(obj(v).value);
const logoOf = (t: Obj) => str(t.logo) ?? str(obj(arr(t.logos)[0]).href);

function teamOf(raw: Obj, phase: FootballGamePhase): FootballDetailTeam {
  const team = obj(raw.team);
  const records = [...arr(raw.record), ...arr(raw.records)].map(obj);
  const record = records.find((r) => r.type === "total") ?? records[0] ?? {};
  return {
    id: str(team.id) ?? str(raw.id) ?? "", name: str(team.displayName) ?? str(team.name) ?? "Team",
    abbr: str(team.abbreviation) ?? str(team.shortDisplayName) ?? str(team.name) ?? "Team",
    logo: logoOf(team), score: phase === "upcoming" || phase === "postponed" ? null : display(raw.score),
    record: str(record.summary) ?? str(record.displayValue), winner: raw.winner === true,
    possession: raw.possession === true, periods: arr(raw.linescores).map(display),
  };
}

function tablesOf(raw: Obj): FootballPlayerTable[] {
  return arr(raw.statistics).map(obj).map((group, index) => {
    const labels = arr(group.labels).map((v) => str(v) ?? "—");
    const players = arr(group.athletes).map(obj).map((row, athleteIndex) => {
      const athlete = obj(row.athlete);
      return { id: str(athlete.id) ?? `player-${athleteIndex}`, name: str(athlete.displayName) ?? str(athlete.fullName) ?? "Player", jersey: str(athlete.jersey), stats: labels.map((_, i) => display(arr(row.stats)[i])) };
    });
    return { key: str(group.name) ?? `stats-${index}`, title: str(group.text) ?? str(group.name) ?? "Player stats", labels, descriptions: arr(group.descriptions).map((v) => str(v) ?? ""), players, totals: labels.map((_, i) => display(arr(group.totals)[i])) };
  }).filter((g) => g.labels.length > 0 && g.players.length > 0);
}

function clockSeconds(value: unknown): number | null {
  const s = str(value); if (!s || !/^\d+:\d{2}$/.test(s)) return null;
  const [m, sec] = s.split(":").map(Number); return m * 60 + sec;
}

function playsOf(raw: unknown[], driveTeams = new Map<unknown, string>(), scoring = false): FootballGamePlay[] {
  const deduped = new Map<string, { play: FootballGamePlay; sequence: number | null; ordinal: number }>();
  raw.forEach((value, ordinal) => {
    const p = obj(value), text = str(p.text) ?? str(p.shortText); if (!text) return;
    const clock = str(obj(p.clock).displayValue), period = num(obj(p.period).number);
    const id = str(p.id) ?? `${period ?? "?"}:${clock ?? "?"}:${text}`;
    const start = obj(p.start), team = obj(p.team);
    const play: FootballGamePlay = { id, text, type: str(obj(p.type).text), period, clock,
      teamId: str(team.id) ?? str(obj(start.team).id) ?? driveTeams.get(value) ?? null,
      downDistance: str(start.shortDownDistanceText) ?? str(start.downDistanceText),
      scoring: scoring || p.scoringPlay === true, awayScore: display(p.awayScore), homeScore: display(p.homeScore) };
    deduped.set(id, { play, sequence: num(p.sequenceNumber), ordinal });
  });
  return [...deduped.values()].sort((a, b) => {
    if (a.sequence !== null && b.sequence !== null && a.sequence !== b.sequence) return b.sequence - a.sequence;
    if (a.play.period !== null && b.play.period !== null && a.play.period !== b.play.period) return b.play.period - a.play.period;
    const ac = clockSeconds(a.play.clock), bc = clockSeconds(b.play.clock);
    if (ac !== null && bc !== null && ac !== bc) return ac - bc;
    return b.ordinal - a.ordinal;
  }).map(({ play }) => play);
}

/** Validates the event identity so an upstream miss can never render a different game's box score. */
export function shapeFootballGameDetail(raw: unknown, sport: FootballDetailSport, gameId: string, fetchedAt: string): FootballGameDetailPayload {
  const root = obj(raw), header = obj(root.header), competition = obj(arr(header.competitions)[0]);
  const id = str(header.id) ?? str(competition.id);
  const teams = arr(competition.competitors).map(obj);
  const homeRaw = teams.find((t) => t.homeAway === "home"), awayRaw = teams.find((t) => t.homeAway === "away");
  if (id !== gameId || !homeRaw || !awayRaw) throw new Error("Game coverage is not available from ESPN.");
  const statusObj = obj(competition.status), type = obj(statusObj.type);
  const status = str(type.detail) ?? str(type.shortDetail) ?? str(type.description) ?? "Scheduled";
  const phase: FootballGamePhase = type.completed === true || type.state === "post" ? "final"
    : /postponed|cancelled|canceled/i.test(`${str(type.name) ?? ""} ${status}`) ? "postponed"
    : type.state === "in" ? "live" : "upcoming";
  const away = teamOf(awayRaw, phase), home = teamOf(homeRaw, phase);
  const box = obj(root.boxscore), playerTeams = arr(box.players).map(obj), statTeams = arr(box.teams).map(obj);
  const getPlayers = (team: FootballDetailTeam) => tablesOf(playerTeams.find((t) => str(obj(t.team).id) === team.id) ?? {});
  const getStats = (team: FootballDetailTeam) => arr(statTeams.find((t) => str(obj(t.team).id) === team.id)?.statistics).map(obj);
  const awayStats = getStats(away), homeStats = getStats(home);
  const keys = [...new Set([...awayStats, ...homeStats].flatMap((r) => str(r.name) ? [String(r.name)] : []))];
  const teamStats = keys.map((key) => {
    const a = awayStats.find((r) => r.name === key), h = homeStats.find((r) => r.name === key);
    return { key, label: str(a?.label) ?? str(h?.label) ?? key, away: display(a?.displayValue ?? a?.value), home: display(h?.displayValue ?? h?.value) };
  });
  const drives = obj(root.drives), current = Array.isArray(drives.current) ? drives.current : drives.current ? [drives.current] : [];
  const allDrives = [...arr(drives.previous), ...current].map(obj), driveTeams = new Map<unknown, string>();
  const drivePlays = allDrives.flatMap((d) => arr(d.plays).map((p) => { const teamId = str(obj(d.team).id); if (teamId) driveTeams.set(p, teamId); return p; }));
  const situation = obj(competition.situation ?? root.situation);
  const down = str(situation.downDistanceText) ?? str(situation.shortDownDistanceText), possession = str(situation.possessionText);
  return { id: gameId, sport, date: str(competition.date), phase, status,
    venue: str(obj(obj(root.gameInfo).venue).fullName), situation: [down, possession].filter(Boolean).join(" · ") || null,
    fetchedAt, away, home, boxscore: { away: getPlayers(away), home: getPlayers(home) }, teamStats,
    plays: playsOf([...drivePlays, ...arr(root.plays)], driveTeams), scoringPlays: playsOf(arr(root.scoringPlays), driveTeams, true) };
}

export function footballCoverageRefreshInterval(phase: FootballGamePhase | undefined): number | false {
  return phase === "live" ? 30_000 : phase === "upcoming" ? 120_000 : false;
}
