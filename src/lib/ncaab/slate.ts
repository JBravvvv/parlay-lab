import { footballCandidates } from "@/lib/anytime/football";
import type { Candidate } from "@/lib/anytime/types";
import { AZ_BOOKS, type AzBook } from "@/lib/az/books";
import { azEdge } from "@/lib/az/market";
import { ptDateOf } from "@/lib/cfb/dates";
import { matchOddsEvent, toOddsEvent, type OddsEvent } from "@/lib/cfb/names";
import { NCAAB_ID, NCAAB_LINES, NCAAB_MATCH_WINDOW_MS, NCAAB_VERSIONS } from "@/lib/ncaab/rules";

/**
 * THE COLLEGE BASKETBALL SLATE — pure (no network, no clock of its own).
 *
 * ESPN's scoreboard is the schedule and the score; The Odds API is the price. A game is priced
 * only when the two feeds can be tied to each other by team names and start time, because the
 * schedule row is what a pick is later graded against.
 *
 * The rows the desk shows are built from the SAME candidates the any-time engine picks from
 * (`ncaabCandidates`), so the page can never show an edge the engine would not see, or the
 * reverse.
 */

export type NcaabStatus = "upcoming" | "live" | "final" | "postponed" | "cancelled";

export type NcaabTeam = {
  id: string;
  /** "Duke Blue Devils" — ESPN displayName, the join key to the odds feed */
  name: string;
  /** "Duke" */
  short: string;
  abbr: string;
  logo: string | null;
  /** 1–25 when ranked, else null (ESPN writes 99 for unranked) */
  rank: number | null;
  /** "3-0" overall, or null */
  record: string | null;
  score: number | null;
  /** no rating on this desk: always null, so the pricing code reads the market alone */
  fpi: null;
};

export type NcaabGame = {
  /** ESPN event id */
  id: string;
  /** ISO tip-off */
  start: string;
  /** Pacific calendar date of tip-off */
  date: string;
  status: NcaabStatus;
  /** ESPN's own short status text ("7:00 PM", "12:41 - 2nd", "Final/OT") */
  detail: string;
  neutral: boolean;
  home: NcaabTeam;
  away: NcaabTeam;
  /** the odds event this game was tied to, or null */
  oddsEventId: string | null;
  /** true when the odds feed names the two teams the other way round (it happens at neutral sites):
      `home` and `away` here are then the ODDS FEED's, so a price always sits on the team it was
      quoted for, and the pick's grade reads the score the same way round (ncaabScores). */
  flipped?: boolean;
};

const obj = (x: unknown): Record<string, unknown> | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const str = (x: unknown): string | null => (typeof x === "string" && x ? x : null);

function teamOf(raw: unknown): NcaabTeam | null {
  const c = obj(raw);
  const t = obj(c?.team);
  if (!c || !t) return null;
  const name = str(t.displayName);
  const id = str(t.id);
  if (!name || !id) return null;
  const rankRaw = obj(c.curatedRank)?.current;
  const rank = typeof rankRaw === "number" && rankRaw >= 1 && rankRaw <= 25 ? rankRaw : null;
  const records = Array.isArray(c.records) ? c.records.map(obj) : [];
  const overall = records.find((r) => r?.type === "total") ?? null;
  /* ESPN sends the score as text; an empty or missing one is no score, never zero */
  const scoreText = typeof c.score === "string" ? c.score.trim() : typeof c.score === "number" ? String(c.score) : "";
  const score = scoreText !== "" && Number.isFinite(Number(scoreText)) ? Number(scoreText) : null;
  return {
    id,
    name,
    short: str(t.shortDisplayName) ?? str(t.location) ?? name,
    abbr: str(t.abbreviation) ?? "",
    logo: str(t.logo),
    rank,
    record: str(overall?.summary),
    score,
    fpi: null,
  };
}

/**
 * The status this desk acts on. Only two things are certain enough to act on: ESPN says the game
 * has not started, or ESPN says it is completed. Anything else that is not in play (postponed,
 * cancelled, suspended, a state this code has never seen) is held as not played: it gets no line
 * and no grade.
 */
function statusOf(type: Record<string, unknown> | null): NcaabStatus {
  const name = str(type?.name) ?? "";
  const state = str(type?.state) ?? "";
  if (/CANCEL/i.test(name)) return "cancelled";
  if (/POSTPONE/i.test(name)) return "postponed";
  if (state === "pre") return "upcoming";
  if (state === "in") return "live";
  if (state === "post" && type?.completed === true) return "final";
  return "postponed";
}

/** One game from one ESPN scoreboard event, or null when the event is not a readable two-team game. */
export function parseEspnGame(raw: unknown): NcaabGame | null {
  const e = obj(raw);
  const id = str(e?.id);
  const comp = obj(Array.isArray(e?.competitions) ? e!.competitions[0] : null);
  const start = str(comp?.date) ?? str(e?.date);
  if (!e || !id || !comp || !start || !Number.isFinite(Date.parse(start))) return null;
  const sides = Array.isArray(comp.competitors) ? comp.competitors : [];
  const home = teamOf(sides.find((c) => obj(c)?.homeAway === "home"));
  const away = teamOf(sides.find((c) => obj(c)?.homeAway === "away"));
  if (!home || !away) return null;
  const type = obj(obj(comp.status)?.type) ?? obj(obj(e.status)?.type);
  let status = statusOf(type);
  /* a "final" with a score missing is not a result */
  if (status === "final" && (home.score == null || away.score == null)) status = "postponed";
  /* ESPN writes "0" for a game that has not tipped; that is no score */
  if (status !== "live" && status !== "final") {
    home.score = null;
    away.score = null;
  }
  return {
    id,
    start: new Date(Date.parse(start)).toISOString(),
    date: ptDateOf(start),
    status,
    detail: str(type?.shortDetail) ?? str(type?.description) ?? "",
    neutral: comp.neutralSite === true,
    home,
    away,
    oddsEventId: null,
  };
}

/** Every readable game in the payload, once each, earliest first. */
export function parseEspnGames(events: readonly unknown[]): NcaabGame[] {
  const seen = new Map<string, NcaabGame>();
  for (const raw of events) {
    const g = parseEspnGame(raw);
    if (g && !seen.has(g.id)) seen.set(g.id, g);
  }
  return [...seen.values()].sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.id.localeCompare(b.id));
}

/** The same game with the two teams the other way round. */
export function flipGame(g: NcaabGame): NcaabGame {
  return { ...g, home: g.away, away: g.home, flipped: !g.flipped };
}

/**
 * Tie each scheduled game to its odds event (exact names, then the name aliases, then one exact
 * side plus a shared school token inside the start-time window). No odds event is used twice.
 *
 * Two passes. First every game the way ESPN lists it. Then, for the games still untied, the two
 * teams the other way round: the feeds can disagree about who is "home" at a neutral site, and it
 * is still the same game. Such a game comes back flipped to the odds feed's order. The first pass
 * runs for every game before the second starts, so a flipped tie can never take an odds event
 * that belongs to a game listed the usual way.
 *
 * Returns new game objects; `unmatchedOdds` counts the odds events no scheduled game claimed.
 */
export function tieOdds(games: readonly NcaabGame[], oddsEvents: readonly unknown[]): { games: NcaabGame[]; events: OddsEvent[]; unmatchedOdds: number } {
  const events = oddsEvents.map(toOddsEvent).filter((e): e is OddsEvent => !!e);
  const used = new Set<string>();
  const playable = (g: NcaabGame) => g.status !== "cancelled" && g.status !== "postponed";
  const out: NcaabGame[] = games.map((g) => {
    const ev = playable(g) ? matchOddsEvent({ home: g.home.name, away: g.away.name, start: g.start }, events, used, NCAAB_MATCH_WINDOW_MS) : null;
    return { ...g, oddsEventId: ev ? ev.id : null };
  });
  for (let i = 0; i < out.length; i++) {
    const g = out[i];
    if (g.oddsEventId || !playable(g)) continue;
    const ev = matchOddsEvent({ home: g.away.name, away: g.home.name, start: g.start }, events, used, NCAAB_MATCH_WINDOW_MS);
    if (ev) out[i] = { ...flipGame(g), oddsEventId: ev.id };
  }
  return { games: out, events, unmatchedOdds: events.filter((e) => !used.has(e.id)).length };
}

/** The candidates the any-time engine picks from: one per side per market per exact line either book posts, upcoming games only. */
export function ncaabCandidates(input: { games: readonly NcaabGame[]; oddsEvents: readonly unknown[]; snapshotId: string; fetchedAt: number }) {
  return footballCandidates({
    league: NCAAB_LINES,
    games: input.games.filter((g) => g.oddsEventId),
    oddsEvents: [...input.oddsEvents],
    snapshotId: input.snapshotId,
    fetchedAt: input.fetchedAt,
    versions: NCAAB_VERSIONS,
  });
}

/* ---------- what the desk shows ---------- */

export type NcaabMarket = "spread" | "total" | "ml";

export type NcaabRow = {
  market: NcaabMarket;
  /** "home" | "away" | "over" | "under" */
  side: string;
  /** "Duke -3.5", "Over 141.5", "Duke ML" */
  selection: string;
  line: number | null;
  /** American price at each book that posts this exact line */
  prices: Partial<Record<AzBook, number>>;
  /** The two books' fair probability for this selection at THIS line, pushes aside: each book's
      price with the vig taken out, carried to this line when the books post different ones, then
      averaged. It is the number `ev` is worked from. */
  fair: number;
  /** how many of the two books post this exact line */
  books: 1 | 2;
  /** the better of the two prices, and where */
  best: { book: AzBook; price: number };
  /** expected profit per 1 staked at the best price, by the two-book number (0.021 = +2.1%) */
  ev: number;
};

export type NcaabSlateGame = NcaabGame & { rows: NcaabRow[] };

export type NcaabQuota = { remaining: number | null; used: number | null };

export type NcaabSlate = {
  sport: typeof NCAAB_ID;
  /** Pacific date of the slate */
  date: string;
  generatedAt: string;
  games: NcaabSlateGame[];
  /** games on the date carrying at least one price row */
  priced: number;
  /** upcoming games on the date the odds feed had no event for */
  unpriced: number;
  /** no key on the server, or the odds feed did not answer: the schedule is shown without prices */
  oddsMissing: boolean;
  quota: NcaabQuota | null;
  /** how long the prices may be reused before a reload can pay for new ones (seconds) */
  ttlSec: number;
};

const MARKET_ORDER: Record<NcaabMarket, number> = { spread: 0, total: 1, ml: 2 };
const SIDE_ORDER: Record<string, number> = { away: 0, home: 1, over: 0, under: 1 };

export function rowOf(c: Candidate): NcaabRow | null {
  if (c.market !== "ml" && c.market !== "spread" && c.market !== "total") return null;
  const edge = azEdge(c.model, c.quotes);
  if (!edge) return null;
  const prices: Partial<Record<AzBook, number>> = {};
  for (const b of AZ_BOOKS) {
    const q = c.quotes[b];
    if (q) prices[b] = q.price;
  }
  return {
    market: c.market,
    side: c.side,
    selection: c.selection,
    line: c.line,
    prices,
    fair: edge.modelP,
    books: Object.keys(prices).length === 2 ? 2 : 1,
    best: { book: edge.best.book, price: edge.best.price },
    ev: edge.ev,
  };
}

const rowSort = (a: NcaabRow, b: NcaabRow) =>
  MARKET_ORDER[a.market] - MARKET_ORDER[b.market] || Math.abs(a.line ?? 0) - Math.abs(b.line ?? 0) || (SIDE_ORDER[a.side] ?? 9) - (SIDE_ORDER[b.side] ?? 9);

export type NcaabSlateInput = {
  /** Pacific date wanted */
  date: string;
  /** ESPN scoreboard events for that date AND the next one (ESPN files a game under its US-Eastern day) */
  espnEvents: readonly unknown[];
  oddsEvents: readonly unknown[];
  oddsMissing: boolean;
  quota: NcaabQuota | null;
  now: number;
  ttlSec: number;
};

export function buildNcaabSlate(input: NcaabSlateInput): NcaabSlate {
  const onDate = parseEspnGames(input.espnEvents).filter((g) => g.date === input.date);
  const tied = tieOdds(onDate, input.oddsMissing ? [] : input.oddsEvents);
  /* a game is only bet before it starts: the feed's own status AND this clock both have to agree */
  const open = tied.games.filter((g) => g.status === "upcoming" && Date.parse(g.start) > input.now);
  const snapshotId = `${NCAAB_ID}-slate-${input.date}`;
  const cands = ncaabCandidates({ games: open, oddsEvents: input.oddsEvents, snapshotId, fetchedAt: input.now }).candidates;
  const rowsByEvent = new Map<string, NcaabRow[]>();
  for (const c of cands) {
    const r = rowOf(c);
    if (!r) continue;
    const list = rowsByEvent.get(c.eventId) ?? [];
    list.push(r);
    rowsByEvent.set(c.eventId, list);
  }
  const openIds = new Set(open.map((g) => g.id));
  const games: NcaabSlateGame[] = tied.games.map((g) => ({
    ...g,
    rows: openIds.has(g.id) && g.oddsEventId ? (rowsByEvent.get(g.oddsEventId) ?? []).sort(rowSort) : [],
  }));
  return {
    sport: NCAAB_ID,
    date: input.date,
    generatedAt: new Date(input.now).toISOString(),
    games,
    priced: games.filter((g) => g.rows.length > 0).length,
    unpriced: games.filter((g) => openIds.has(g.id) && g.rows.length === 0).length,
    oddsMissing: input.oddsMissing,
    quota: input.quota,
    ttlSec: input.ttlSec,
  };
}

/* ---------- the board: every priced selection of the slate, best edge first ---------- */

export type NcaabBoardRow = NcaabRow & { gameId: string; event: string; start: string };

/** Rows whose best price beats the two-book number by at least `minEv`, best first. Ties: earlier game, then selection. */
export function boardRows(slate: Pick<NcaabSlate, "games">, minEv = 0): NcaabBoardRow[] {
  const out: NcaabBoardRow[] = [];
  for (const g of slate.games) {
    for (const r of g.rows) {
      if (!(r.ev > minEv)) continue;
      out.push({ ...r, gameId: g.id, event: `${g.away.short} @ ${g.home.short}`, start: g.start });
    }
  }
  return out.sort((a, b) => b.ev - a.ev || Date.parse(a.start) - Date.parse(b.start) || a.selection.localeCompare(b.selection));
}
