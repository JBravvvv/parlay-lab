/**
 * BOX SCORE — pure shaping (2026-09-03, Josh: "You should also be able to click
 * on any game to see the box score").
 *
 * Input is three MLB Stats API payloads for one gamePk:
 *   /api/v1/game/{pk}/boxscore   — teams.away/home: teamStats, players, batters[],
 *                                  pitchers[], battingOrder[], info[], note[]; info[]
 *   /api/v1/game/{pk}/linescore  — innings[], totals, current inning/state
 *   /api/v1/schedule?gamePk=…    — status, records, decisions, probables, start time
 *
 * Nothing here invents a figure: every number and every note string is copied from
 * the feed. A figure the feed does not carry is null and renders as "—"; a note block
 * the feed does not carry is simply absent. No server imports — unit-tested on
 * trimmed real payloads under tests/fixtures/boxscore-*.json.
 */
import { mapStatus, recordOf, type ApiGame, type GameStatus } from "@/lib/games";

/* ---------- loose input types (statsapi shape, only the fields we read) ---------- */

type LabelValue = { label: string; value?: string };
type ApiBoxPlayer = {
  person: { id: number; fullName: string; boxscoreName?: string };
  jerseyNumber?: string;
  position?: { code?: string; abbreviation?: string; type?: string };
  battingOrder?: string;
  stats?: {
    batting?: Record<string, number | string | undefined>;
    pitching?: Record<string, number | string | undefined>;
  };
  seasonStats?: {
    batting?: Record<string, number | string | undefined>;
    pitching?: Record<string, number | string | undefined>;
  };
  gameStatus?: { isSubstitute?: boolean; isCurrentBatter?: boolean; isCurrentPitcher?: boolean };
  allPositions?: { code?: string; abbreviation?: string }[];
};
export type ApiBoxTeam = {
  team: { id: number; name: string; abbreviation?: string; teamName?: string };
  teamStats?: {
    batting?: Record<string, number | string | undefined>;
    pitching?: Record<string, number | string | undefined>;
  };
  players: Record<string, ApiBoxPlayer>;
  batters?: number[];
  pitchers?: number[];
  bench?: number[];
  bullpen?: number[];
  battingOrder?: number[];
  info?: { title?: string; fieldList?: LabelValue[] }[];
  note?: LabelValue[];
};
export type ApiBoxscore = {
  teams: { away: ApiBoxTeam; home: ApiBoxTeam };
  info?: LabelValue[];
  pitchingNotes?: string[];
};
type ApiLsSide = { runs?: number; hits?: number; errors?: number; leftOnBase?: number };
export type ApiLinescore = {
  currentInning?: number;
  currentInningOrdinal?: string;
  inningState?: string;
  scheduledInnings?: number;
  balls?: number;
  strikes?: number;
  outs?: number;
  innings?: { num: number; ordinalNum?: string; home?: ApiLsSide; away?: ApiLsSide }[];
  teams?: { home?: ApiLsSide; away?: ApiLsSide };
};
/** the schedule game for this pk; the same shape the Games list reads plus officialDate */
export type ApiScheduleGame = ApiGame & { officialDate?: string; scheduledInnings?: number };

/* ---------- output ---------- */

export type BoxBatter = {
  id: number;
  name: string;
  /** "Acuña Jr." — the feed's own short form, what the MLB app prints */
  boxName: string;
  /** "RF", or "PH-CF" for a sub who moved (every position the feed lists, in order) */
  pos: string;
  /** feed battingOrder "501" → 501; null for a pitcher with no slot */
  order: number | null;
  sub: boolean;
  /** "a-" style note key from stats.batting.note, when the feed sets one */
  note: string | null;
  ab: number | null;
  r: number | null;
  h: number | null;
  rbi: number | null;
  bb: number | null;
  k: number | null;
  avg: string | null;
  ops: string | null;
};

export type BoxPitcher = {
  id: number;
  name: string;
  boxName: string;
  /** "(W, 2-0)" / "(L, 2-2)" / "(S, 3)" / "(H, 5)" — the feed's stats.pitching.note, else built from decisions */
  tag: string | null;
  ip: string | null;
  h: number | null;
  r: number | null;
  er: number | null;
  bb: number | null;
  k: number | null;
  hr: number | null;
  era: string | null;
  pitches: number | null;
  strikes: number | null;
};

export type StatTotals = { ab: number | null; r: number | null; h: number | null; rbi: number | null; bb: number | null; k: number | null };
export type PitchTotals = { ip: string | null; h: number | null; r: number | null; er: number | null; bb: number | null; k: number | null; hr: number | null };

export type BoxTeam = {
  id: number;
  abbr: string;
  name: string;
  /** "Braves" */
  short: string;
  record: string;
  score: number | null;
  probable: { id: number; name: string; wl: string | null; era: string | null } | null;
  /** true once the feed has a battingOrder for the club */
  lineupPosted: boolean;
  batters: BoxBatter[];
  battingTotals: StatTotals;
  /** the feed's a-/b- substitution notes, verbatim */
  notes: { label: string; value: string }[];
  /** BATTING / BASERUNNING / FIELDING blocks, verbatim label+value pairs */
  info: { title: string; items: { label: string; value: string }[] }[];
  pitchers: BoxPitcher[];
  pitchingTotals: PitchTotals;
};

export type BoxLinescore = {
  /** every inning column the table prints: played innings padded to max(9, scheduled) */
  innings: { n: number; away: number | null; home: number | null }[];
  totals: { away: { r: number; h: number; e: number }; home: { r: number; h: number; e: number } };
  /** the bottom half the home club never had to bat — printed as "x" */
  xBottom: number | null;
};

export type DecisionLine = { id: number; name: string; wl: string | null; era: string | null };
export type BoxDecisions = {
  w: DecisionLine | null;
  l: DecisionLine | null;
  s: { id: number; name: string; saves: number | null } | null;
};

export type BoxscorePayload = {
  pk: number;
  /** MLB's official game date (YYYY-MM-DD) — where the back link lands */
  date: string;
  start: string;
  status: GameStatus;
  detail: string;
  inning: { num: number; ordinal: string; state: string; balls: number | null; strikes: number | null; outs: number | null } | null;
  venue: string | null;
  gameNumber: number | null;
  doubleHeader: boolean;
  away: BoxTeam;
  home: BoxTeam;
  linescore: BoxLinescore | null;
  decisions: BoxDecisions | null;
  /** game info block (WP, Pitches-strikes, Umpires, Weather, …) — every labelled item the feed carries */
  info: { label: string; value: string }[];
  pitchingNotes: string[];
};

/* ---------- helpers ---------- */

const num = (v: number | string | undefined | null): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: number | string | undefined | null): string | null => (v == null || v === "" ? null : String(v));

function wlOf(p: ApiBoxPlayer | undefined): string | null {
  const s = p?.seasonStats?.pitching;
  const w = num(s?.wins);
  const l = num(s?.losses);
  return w != null && l != null ? `${w}-${l}` : null;
}
const eraOf = (p: ApiBoxPlayer | undefined): string | null => str(p?.seasonStats?.pitching?.era);

export function playerOf(box: ApiBoxscore, id: number): ApiBoxPlayer | undefined {
  return box.teams.away.players[`ID${id}`] ?? box.teams.home.players[`ID${id}`];
}

/** every position the player took, "PH-CF" — the feed's allPositions in order, else the primary */
function posOf(p: ApiBoxPlayer): string {
  const all = (p.allPositions ?? []).map((x) => x.abbreviation).filter((x): x is string => !!x);
  if (all.length) return all.join("-");
  return p.position?.abbreviation ?? "";
}

export function shapeBatter(p: ApiBoxPlayer): BoxBatter {
  const b = p.stats?.batting ?? {};
  const s = p.seasonStats?.batting ?? {};
  return {
    id: p.person.id,
    name: p.person.fullName,
    boxName: p.person.boxscoreName ?? p.person.fullName,
    pos: posOf(p),
    order: num(p.battingOrder),
    sub: p.gameStatus?.isSubstitute === true,
    note: str(b.note),
    ab: num(b.atBats),
    r: num(b.runs),
    h: num(b.hits),
    rbi: num(b.rbi),
    bb: num(b.baseOnBalls),
    k: num(b.strikeOuts),
    avg: str(s.avg),
    ops: str(s.ops),
  };
}

export function shapePitcher(p: ApiBoxPlayer, tag: string | null): BoxPitcher {
  const t = p.stats?.pitching ?? {};
  return {
    id: p.person.id,
    name: p.person.fullName,
    boxName: p.person.boxscoreName ?? p.person.fullName,
    tag: str(t.note) ?? tag,
    ip: str(t.inningsPitched),
    h: num(t.hits),
    r: num(t.runs),
    er: num(t.earnedRuns),
    bb: num(t.baseOnBalls),
    k: num(t.strikeOuts),
    hr: num(t.homeRuns),
    era: eraOf(p),
    pitches: num(t.numberOfPitches),
    strikes: num(t.strikes),
  };
}

/**
 * The batting box lists the feed's `batters[]` in order — that order already
 * interleaves substitutes under the starter they replaced (501 after 500). A
 * pitcher listed there with no lineup slot and no plate appearance (the DH game's
 * pitchers) is not a batter and is dropped, exactly as the MLB app does.
 */
export function battingRows(t: ApiBoxTeam): BoxBatter[] {
  const out: BoxBatter[] = [];
  for (const id of t.batters ?? []) {
    const p = t.players[`ID${id}`];
    if (!p) continue;
    const pa = num(p.stats?.batting?.plateAppearances) ?? 0;
    if (p.battingOrder == null && pa === 0) continue;
    out.push(shapeBatter(p));
  }
  return out;
}

/** decision tag for a pitcher the feed did not annotate itself: "(W, 2-0)", "(L, 2-2)", "(S, 3)" */
export function decisionTag(id: number, d: BoxDecisions | null): string | null {
  if (!d) return null;
  if (d.w?.id === id) return `(W${d.w.wl ? `, ${d.w.wl}` : ""})`;
  if (d.l?.id === id) return `(L${d.l.wl ? `, ${d.l.wl}` : ""})`;
  if (d.s?.id === id) return `(S${d.s.saves != null ? `, ${d.s.saves}` : ""})`;
  return null;
}

function totalsOf(t: ApiBoxTeam): StatTotals {
  const b = t.teamStats?.batting ?? {};
  return { ab: num(b.atBats), r: num(b.runs), h: num(b.hits), rbi: num(b.rbi), bb: num(b.baseOnBalls), k: num(b.strikeOuts) };
}
function pitchTotalsOf(t: ApiBoxTeam): PitchTotals {
  const p = t.teamStats?.pitching ?? {};
  return { ip: str(p.inningsPitched), h: num(p.hits), r: num(p.runs), er: num(p.earnedRuns), bb: num(p.baseOnBalls), k: num(p.strikeOuts), hr: num(p.homeRuns) };
}

/** BATTING / BASERUNNING / FIELDING blocks, keeping only items that carry a value */
export function infoBlocks(t: ApiBoxTeam): BoxTeam["info"] {
  return (t.info ?? [])
    .map((blk) => ({
      title: blk.title ?? "",
      items: (blk.fieldList ?? []).filter((f): f is { label: string; value: string } => !!f.label && !!f.value),
    }))
    .filter((blk) => blk.items.length > 0);
}

export function shapeDecisions(game: ApiScheduleGame, box: ApiBoxscore, status: GameStatus): BoxDecisions | null {
  if (status !== "final" || !game.decisions) return null;
  const d = game.decisions;
  const line = (p: { id: number; fullName: string } | null | undefined): DecisionLine | null =>
    p ? { id: p.id, name: p.fullName, wl: wlOf(playerOf(box, p.id)), era: eraOf(playerOf(box, p.id)) } : null;
  const w = line(d.winner);
  const l = line(d.loser);
  const s = d.save ? { id: d.save.id, name: d.save.fullName, saves: num(playerOf(box, d.save.id)?.seasonStats?.pitching?.saves) } : null;
  if (!w && !l && !s) return null;
  return { w, l, s };
}

export function shapeTeam(game: ApiScheduleGame, box: ApiBoxscore, side: "away" | "home", status: GameStatus, decisions: BoxDecisions | null): BoxTeam {
  const t = box.teams[side];
  const sg = game.teams[side];
  const played = status === "live" || status === "final";
  const pp = sg.probablePitcher;
  const ppPlayer = pp ? playerOf(box, pp.id) : undefined;
  const pitchers = (t.pitchers ?? [])
    .map((id) => t.players[`ID${id}`])
    .filter((p): p is ApiBoxPlayer => !!p)
    .map((p) => shapePitcher(p, decisionTag(p.person.id, decisions)));
  return {
    id: t.team.id,
    abbr: t.team.abbreviation ?? sg.team.abbreviation ?? "",
    name: t.team.name,
    short: t.team.teamName ?? sg.team.teamName ?? t.team.name,
    record: recordOf(sg),
    score: played ? num(sg.score) : null,
    probable: pp ? { id: pp.id, name: pp.fullName, wl: wlOf(ppPlayer), era: eraOf(ppPlayer) } : null,
    lineupPosted: (t.battingOrder ?? []).length > 0,
    batters: battingRows(t),
    battingTotals: totalsOf(t),
    notes: (t.note ?? []).filter((n): n is { label: string; value: string } => !!n.label && !!n.value),
    info: infoBlocks(t),
    pitchers,
    pitchingTotals: pitchTotalsOf(t),
  };
}

/**
 * Inning columns: every inning the feed lists, padded to max(9, scheduledInnings).
 * A half the club never batted has no `runs` key in the feed — null here. For a
 * final game whose last listed inning has no home runs (the home side led after
 * the top), that cell is the MLB "x".
 */
export function shapeLinescore(ls: ApiLinescore | null | undefined, status: GameStatus): BoxLinescore | null {
  if (status !== "live" && status !== "final") return null;
  if (!ls?.teams) return null;
  const listed = ls.innings ?? [];
  const n = Math.max(9, ls.scheduledInnings ?? 9, listed.length);
  const innings = Array.from({ length: n }, (_, i) => {
    const inn = listed[i];
    return { n: i + 1, away: inn?.away?.runs ?? null, home: inn?.home?.runs ?? null };
  });
  const tot = (s?: ApiLsSide) => ({ r: s?.runs ?? 0, h: s?.hits ?? 0, e: s?.errors ?? 0 });
  const last = listed[listed.length - 1];
  const xBottom = status === "final" && last && last.away?.runs != null && last.home?.runs == null ? last.num : null;
  return { innings, totals: { away: tot(ls.teams.away), home: tot(ls.teams.home) }, xBottom };
}

export function shapeBoxscore(game: ApiScheduleGame, box: ApiBoxscore, ls: ApiLinescore | null | undefined): BoxscorePayload {
  const status = mapStatus(game.status);
  const decisions = shapeDecisions(game, box, status);
  const inning =
    status === "live" && ls?.currentInning
      ? {
          num: ls.currentInning,
          ordinal: ls.currentInningOrdinal ?? String(ls.currentInning),
          state: ls.inningState ?? "",
          balls: ls.balls ?? null,
          strikes: ls.strikes ?? null,
          outs: ls.outs ?? null,
        }
      : null;
  return {
    pk: game.gamePk,
    date: game.officialDate ?? game.gameDate.slice(0, 10),
    start: game.gameDate,
    status,
    detail: game.status.detailedState ?? "",
    inning,
    venue: game.venue?.name ?? null,
    gameNumber: game.gameNumber ?? null,
    doubleHeader: game.doubleHeader === "Y" || game.doubleHeader === "S",
    away: shapeTeam(game, box, "away", status, decisions),
    home: shapeTeam(game, box, "home", status, decisions),
    linescore: shapeLinescore(ls, status),
    decisions,
    info: (box.info ?? []).filter((i): i is { label: string; value: string } => !!i.label && !!i.value),
    pitchingNotes: box.pitchingNotes ?? [],
  };
}
