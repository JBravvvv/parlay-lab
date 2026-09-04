/**
 * GAMES TAB — pure shaping (2026-09-03, Josh: "There should be a tab called
 * "Games" that has every game for the day listed kind of like the mlb app").
 *
 * Input is the MLB Stats API schedule (hydrate=probablePitcher,linescore,team,
 * decisions,broadcasts), a map of pitcher season lines, and the day's engine
 * board ML rows. Nothing here invents a number: every figure is copied from the
 * schedule feed or the board; a missing figure is null and renders as "—".
 *
 * No server imports — this file is unit-tested with an inline fixture.
 */

export type GameStatus = "upcoming" | "live" | "final" | "postponed";

export type PitcherLine = { wins: number; losses: number; era: string | null; saves?: number };
export type PitcherStatsMap = Record<number, PitcherLine | undefined>;

export type MlPrice = { odds: string; book: string | null; cz: string | null };

export type GameTeam = {
  id: number;
  abbr: string;
  name: string;
  record: string;
  score: number | null;
  ml: MlPrice | null;
  probable: { id: number; name: string; wl: string | null; era: string | null } | null;
};

export type Linescore = {
  innings: { n: number; away: number | null; home: number | null }[];
  totals: { away: { r: number; h: number; e: number }; home: { r: number; h: number; e: number } };
};

export type Decisions = {
  w: { id: number; name: string; wl: string | null; era: string | null } | null;
  l: { id: number; name: string; wl: string | null; era: string | null } | null;
  s: { id: number; name: string; saves: number | null } | null;
};

export type ShapedGame = {
  pk: number;
  start: string;
  status: GameStatus;
  /** 1 or 2 on a doubleheader day (schedule doubleHeader Y/S), else null */
  gameNumber: number | null;
  detail: string;
  inning: { num: number; ordinal: string; state: string } | null;
  venue: string | null;
  broadcasts: string[];
  away: GameTeam;
  home: GameTeam;
  linescore: Linescore | null;
  decisions: Decisions | null;
};

export type GamesPayload = {
  date: string;
  games: ShapedGame[];
  counts: { upcoming: number; live: number; final: number };
};

/* ---------- loose input types (statsapi shape, only the fields we read) ---------- */

type ApiPerson = { id: number; fullName: string } | undefined | null;
type ApiTeamSide = {
  team: { id: number; name: string; abbreviation?: string; teamName?: string };
  leagueRecord?: { wins?: number; losses?: number };
  score?: number;
  probablePitcher?: ApiPerson;
};
type ApiInningSide = { runs?: number; hits?: number; errors?: number };
export type ApiGame = {
  gamePk: number;
  gameDate: string;
  /** "N" single game, "Y" traditional doubleheader, "S" split doubleheader */
  doubleHeader?: string;
  /** 1, or 2 for the second game of a doubleheader */
  gameNumber?: number;
  status: { abstractGameState?: string; detailedState?: string };
  teams: { away: ApiTeamSide; home: ApiTeamSide };
  linescore?: {
    currentInning?: number;
    currentInningOrdinal?: string;
    inningState?: string;
    innings?: { num: number; home?: ApiInningSide; away?: ApiInningSide }[];
    teams?: { home?: ApiInningSide; away?: ApiInningSide };
  };
  decisions?: { winner?: ApiPerson; loser?: ApiPerson; save?: ApiPerson };
  broadcasts?: { name?: string; type?: string }[];
  venue?: { name?: string };
};

/** One engine ML row, as the board's `data.categories.ml` carries it (loosely typed). */
export type MlRow = {
  label?: string;
  odds?: number | string | null;
  book?: string | null;
  cz?: number | string | null;
  gkey?: string | null;
  [k: string]: unknown;
};

/* ---------- helpers ---------- */

const POSTPONED = /postponed|cancel|suspend/i;

export function mapStatus(status: ApiGame["status"]): GameStatus {
  const detail = status.detailedState ?? "";
  if (POSTPONED.test(detail)) return "postponed";
  switch (status.abstractGameState) {
    case "Live":
      return "live";
    case "Final":
      return "final";
    default:
      return "upcoming";
  }
}

export function recordOf(side: ApiTeamSide): string {
  const w = side.leagueRecord?.wins;
  const l = side.leagueRecord?.losses;
  return Number.isFinite(w) && Number.isFinite(l) ? `${w}-${l}` : "—";
}

/** American odds as the app prints them: "+150" / "-116"; null for junk. */
export function fmtAm(v: number | string | null | undefined): string | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d+-.]/g, ""));
  if (!Number.isFinite(n) || n === 0) return null;
  const r = Math.round(n);
  return r > 0 ? `+${r}` : String(r);
}

/** decimal payout of an American price — used only to rank "best price" */
function amDec(v: number | string | null | undefined): number {
  const s = fmtAm(v);
  if (!s) return -Infinity;
  const n = Number(s);
  return n > 0 ? 1 + n / 100 : 1 + 100 / -n;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Does a board gkey name this schedule game? The engine's gkey is
 * "awayname@homename", with "gm1" / "gm2" appended on a doubleheader day
 * (2026-09-03 reviewer note: the suffix used to defeat the match, so both DH
 * games printed "—"). Strip the suffix before comparing; when it is present
 * it must agree with the schedule's gameNumber so game 1's price never lands
 * on game 2's card.
 */
export function gkeyMatches(gkey: string, g: ApiGame): boolean {
  const k = norm(gkey);
  const m = k.match(/gm(\d)$/);
  const base = m ? k.slice(0, -m[0].length) : k;
  if (base !== norm(g.teams.away.team.name) + norm(g.teams.home.team.name)) return false;
  if (m && g.gameNumber != null && Number(m[1]) !== g.gameNumber) return false;
  return true;
}

/**
 * Pick the board's ML rows for one team of one game. Match on the row label
 * ("New York Yankees ML") by team name, the short "NYY ML" form by abbreviation,
 * and — when the row carries a gkey — require the game to match too, so a
 * doubleheader or a team-name substring ("Athletics") can't cross-wire.
 */
export function mlFor(rows: MlRow[] | undefined, g: ApiGame, sideKey: "away" | "home"): MlPrice | null {
  if (!rows?.length) return null;
  const side = g.teams[sideKey];
  const nameN = norm(side.team.name);
  const abbrN = norm(side.team.abbreviation ?? "");
  const hits = rows.filter((r) => {
    const label = norm(String(r.label ?? ""));
    if (!label.endsWith("ml")) return false;
    const team = label.slice(0, -2);
    const teamOk = team === nameN || (abbrN !== "" && team === abbrN);
    if (!teamOk) return false;
    return r.gkey ? gkeyMatches(String(r.gkey), g) : true;
  });
  if (!hits.length) return null;
  const best = hits.reduce((a, b) => (amDec(b.odds) > amDec(a.odds) ? b : a));
  const odds = fmtAm(best.odds);
  if (!odds) return null;
  const czRow = hits.find((r) => fmtAm(r.cz) != null);
  return { odds, book: best.book ?? null, cz: czRow ? fmtAm(czRow.cz) : null };
}

function wlOf(p: PitcherLine | undefined): string | null {
  return p && Number.isFinite(p.wins) && Number.isFinite(p.losses) ? `${p.wins}-${p.losses}` : null;
}
function eraOf(p: PitcherLine | undefined): string | null {
  return p?.era != null && p.era !== "" ? String(p.era) : null;
}

function teamOf(g: ApiGame, sideKey: "away" | "home", stats: PitcherStatsMap, ml: MlRow[] | undefined, status: GameStatus): GameTeam {
  const side = g.teams[sideKey];
  // the feed posts score: 0 on an unplayed game — that is not a score, so only live/final carry one
  const played = status === "live" || status === "final";
  const pp = side.probablePitcher;
  const line = pp ? stats[pp.id] : undefined;
  return {
    id: side.team.id,
    abbr: side.team.abbreviation ?? "",
    name: side.team.name,
    record: recordOf(side),
    score: played && Number.isFinite(side.score) ? (side.score as number) : null,
    ml: mlFor(ml, g, sideKey),
    probable: pp ? { id: pp.id, name: pp.fullName, wl: wlOf(line), era: eraOf(line) } : null,
  };
}

export function linescoreOf(g: ApiGame, status: GameStatus): Linescore | null {
  if (status !== "live" && status !== "final") return null;
  const ls = g.linescore;
  if (!ls?.teams) return null;
  const tot = (s?: ApiInningSide) => ({ r: s?.runs ?? 0, h: s?.hits ?? 0, e: s?.errors ?? 0 });
  return {
    innings: (ls.innings ?? []).map((i) => ({
      n: i.num,
      away: i.away?.runs ?? null,
      home: i.home?.runs ?? null,
    })),
    totals: { away: tot(ls.teams.away), home: tot(ls.teams.home) },
  };
}

function decisionsOf(g: ApiGame, status: GameStatus, stats: PitcherStatsMap): Decisions | null {
  if (status !== "final" || !g.decisions) return null;
  const d = g.decisions;
  const wl = (p: ApiPerson) => (p ? { id: p.id, name: p.fullName, wl: wlOf(stats[p.id]), era: eraOf(stats[p.id]) } : null);
  const w = wl(d.winner);
  const l = wl(d.loser);
  const s = d.save ? { id: d.save.id, name: d.save.fullName, saves: stats[d.save.id]?.saves ?? null } : null;
  if (!w && !l && !s) return null;
  return { w, l, s };
}

/** every pitcher id the day's cards will print a season line for */
export function pitcherIds(games: ApiGame[]): number[] {
  const ids = new Set<number>();
  for (const g of games) {
    for (const k of ["away", "home"] as const) {
      const p = g.teams[k].probablePitcher;
      if (p?.id) ids.add(p.id);
    }
    for (const p of [g.decisions?.winner, g.decisions?.loser, g.decisions?.save]) if (p?.id) ids.add(p.id);
  }
  return [...ids];
}

export function shapeGame(g: ApiGame, stats: PitcherStatsMap, ml: MlRow[] | undefined): ShapedGame {
  const status = mapStatus(g.status);
  const ls = g.linescore;
  const inning =
    status === "live" && ls?.currentInning
      ? { num: ls.currentInning, ordinal: ls.currentInningOrdinal ?? String(ls.currentInning), state: ls.inningState ?? "" }
      : null;
  return {
    pk: g.gamePk,
    start: g.gameDate,
    gameNumber: g.doubleHeader === "Y" || g.doubleHeader === "S" ? (g.gameNumber ?? null) : null,
    status,
    detail: g.status.detailedState ?? "",
    inning,
    venue: g.venue?.name ?? null,
    broadcasts: [...new Set((g.broadcasts ?? []).filter((b) => b.type === "TV" || !b.type).map((b) => b.name).filter((n): n is string => !!n))],
    away: teamOf(g, "away", stats, ml, status),
    home: teamOf(g, "home", stats, ml, status),
    linescore: linescoreOf(g, status),
    decisions: decisionsOf(g, status, stats),
  };
}

const RANK: Record<GameStatus, number> = { live: 0, upcoming: 1, final: 2, postponed: 3 };

export function sortGames(games: ShapedGame[]): ShapedGame[] {
  return [...games].sort((a, b) => RANK[a.status] - RANK[b.status] || a.start.localeCompare(b.start) || a.pk - b.pk);
}

export function shapeGames(date: string, games: ApiGame[], stats: PitcherStatsMap, ml: MlRow[] | undefined): GamesPayload {
  const shaped = sortGames(games.map((g) => shapeGame(g, stats, ml)));
  const counts = { upcoming: 0, live: 0, final: 0 };
  for (const g of shaped) if (g.status in counts) counts[g.status as keyof typeof counts]++;
  return { date, games: shaped, counts };
}

/* ---------- season window + date rail (client + server share it) ---------- */

/**
 * The Games tab's calendar (2026-09-03, Josh, verbatim): "the list should keep
 * going through the last regular season game of the year which is Sunday Sept
 * 27 … Only games from Sept 1 on need to be included in this tab." Inclusive
 * on both ends; /api/games rejects anything outside it and the page clamps a
 * URL date into it.
 */
export const SEASON_WINDOW = { start: "2026-09-01", end: "2026-09-27" } as const;

export const inSeasonWindow = (date: string): boolean => date >= SEASON_WINDOW.start && date <= SEASON_WINDOW.end;

/** the nearest in-window date (string compare is safe on YYYY-MM-DD) */
export function clampToWindow(date: string): string {
  if (date < SEASON_WINDOW.start) return SEASON_WINDOW.start;
  if (date > SEASON_WINDOW.end) return SEASON_WINDOW.end;
  return date;
}

/** every calendar day of the window, start → end, as YYYY-MM-DD; pure UTC arithmetic */
export function seasonDates(win: { start: string; end: string } = SEASON_WINDOW): string[] {
  const [y, m, d] = win.start.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; ; i++) {
    const s = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
    if (s > win.end) break;
    out.push(s);
  }
  return out;
}

/** "Tue 9/1" — the rail label */
export function railLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const wd = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
  return `${wd} ${m}/${d}`;
}

/** `date` ± n calendar days, as YYYY-MM-DD strings; pure string arithmetic. */
export function dateStrip(date: string, n = 2): string[] {
  const [y, m, d] = date.split("-").map(Number);
  const out: string[] = [];
  for (let i = -n; i <= n; i++) {
    const t = new Date(Date.UTC(y, m - 1, d + i));
    out.push(t.toISOString().slice(0, 10));
  }
  return out;
}
