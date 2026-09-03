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
  w: { name: string; wl: string | null; era: string | null } | null;
  l: { name: string; wl: string | null; era: string | null } | null;
  s: { name: string; saves: number | null } | null;
};

export type ShapedGame = {
  pk: number;
  start: string;
  status: GameStatus;
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
  const gkey = norm(g.teams.away.team.name) + norm(g.teams.home.team.name);
  const hits = rows.filter((r) => {
    const label = norm(String(r.label ?? ""));
    if (!label.endsWith("ml")) return false;
    const team = label.slice(0, -2);
    const teamOk = team === nameN || (abbrN !== "" && team === abbrN);
    if (!teamOk) return false;
    return r.gkey ? norm(String(r.gkey)) === gkey : true;
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
  const wl = (p: ApiPerson) => (p ? { name: p.fullName, wl: wlOf(stats[p.id]), era: eraOf(stats[p.id]) } : null);
  const w = wl(d.winner);
  const l = wl(d.loser);
  const s = d.save ? { name: d.save.fullName, saves: stats[d.save.id]?.saves ?? null } : null;
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

/* ---------- date strip (client + server share it) ---------- */

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
