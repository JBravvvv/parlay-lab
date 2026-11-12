import { footballCandidates } from "@/lib/anytime/football";
import type { FinalScore } from "@/lib/anytime/grade";
import { ANYTIME_RULES, type AnytimeRules } from "@/lib/anytime/rules";
import type { Adapter, OddsMeter, RunResult, ScoreProvider } from "@/lib/anytime/run";
import type { PickRecord } from "@/lib/anytime/types";
import { addDays, espnDateParam, nextDate, ptDateOf } from "@/lib/cfb/dates";
import { buildCfbBoard } from "@/lib/cfb/model";
import { normTeam, toOddsEvent } from "@/lib/cfb/names";
import type { CfbGame } from "@/lib/cfb/types";
import type { LeagueConfig } from "@/lib/football/league";
import { newOddsRun, oddsFetch, oddsRunSummary, withOddsRun, type OddsRun } from "@/lib/server/odds-client";

/**
 * FOOTBALL FOR THE ANY-TIME ENGINE, SERVER SIDE: where the numbers come from.
 *
 *   odds      ONE bulk Odds API call per league per run (h2h, spreads, totals for every listed
 *             game), through the one odds client, which asks for bookmakers=draftkings,fanduel
 *             and drops any other book from the reply. Never cached: a pick may only use a
 *             snapshot fetched in its own run, so a replayed 4-minute-old board is not an option.
 *   schedule  ESPN's scoreboard, one request per calendar day that has a listed game (free).
 *   FPI       ESPN's power index, once per league (free).
 *   scores    the same ESPN scoreboard, read again when a pick's game has started.
 *
 * The feeds are an interface so every rule below is tested with invented data and no network.
 */

export type FootballFeeds = {
  /** The league's game lines, fetched NOW. Throws when the provider did not answer with odds. */
  odds(L: LeagueConfig): Promise<{ events: unknown[]; fetchedAt: number }>;
  /** ESPN scoreboard events for one calendar day (YYYY-MM-DD). Throws when ESPN did not answer. */
  espnDay(L: LeagueConfig, date: string): Promise<unknown[]>;
  /** ESPN FPI payload, or null when it is unavailable (the model then prices from the market alone). */
  fpi(L: LeagueConfig): Promise<unknown | null>;
};

const ESPN_TTL = 60;
const FPI_TTL = 21_600;

export function liveFootballFeeds(): FootballFeeds {
  return {
    async odds(L) {
      const key = process.env.ODDS_API_KEY;
      if (!key) throw new Error("ODDS_API_KEY not set");
      const r = await oddsFetch(`${L.feeds.oddsUrl}&apiKey=${encodeURIComponent(key)}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`Odds API ${r.status} for ${L.id}`);
      const j = (await r.json()) as unknown;
      if (!Array.isArray(j)) throw new Error(`Odds API: unexpected reply for ${L.id}`);
      /* stamped AFTER the reply landed: the freshness guard counts from when the prices were in hand */
      return { events: j, fetchedAt: Date.now() };
    },
    async espnDay(L, date) {
      const r = await fetch(`${L.feeds.espnScoreboard}?${L.feeds.espnScoreboardQuery}&dates=${espnDateParam(date)}`, { next: { revalidate: ESPN_TTL } });
      if (!r.ok) throw new Error(`espn scoreboard ${r.status} for ${L.id} ${date}`);
      const j = (await r.json()) as { events?: unknown };
      return Array.isArray(j.events) ? j.events : [];
    },
    async fpi(L) {
      try {
        const r = await fetch(L.feeds.espnFpi, { next: { revalidate: FPI_TTL } });
        if (!r.ok) return null;
        return (await r.json()) as unknown;
      } catch {
        return null;
      }
    },
  };
}

/**
 * One run's view of the free feeds: each ESPN day and each FPI table is fetched at most once, however
 * many dates, leagues and picks ask. Odds are NOT remembered here (the odds client keeps the run's
 * own memory, and a second look inside one run must not pretend to be a second snapshot).
 * A failed request is forgotten so a later ask in the same run may try again.
 */
export function oncePerRun(feeds: FootballFeeds): FootballFeeds {
  const days = new Map<string, Promise<unknown[]>>();
  const fpis = new Map<string, Promise<unknown | null>>();
  return {
    odds: (L) => feeds.odds(L),
    espnDay(L, date) {
      const k = `${L.id}|${date}`;
      let p = days.get(k);
      if (!p) {
        p = feeds.espnDay(L, date);
        days.set(k, p);
        p.catch(() => days.delete(k));
      }
      return p;
    },
    fpi(L) {
      let p = fpis.get(L.id);
      if (!p) {
        p = feeds.fpi(L);
        fpis.set(L.id, p);
        p.catch(() => fpis.delete(L.id));
      }
      return p;
    },
  };
}

type OddsRow = { raw: unknown; id: string; start: number; date: string };

/** The league's listed games that have not started and start inside the horizon. */
function upcomingOf(events: unknown[], now: number, horizonMs: number): { rows: OddsRow[]; beyond: number } {
  const rows: OddsRow[] = [];
  let beyond = 0;
  for (const raw of events) {
    const e = toOddsEvent(raw);
    if (!e) continue;
    const start = Date.parse(e.commence_time);
    if (!Number.isFinite(start) || start <= now) continue;
    if (start > now + horizonMs) {
      beyond++;
      continue;
    }
    rows.push({ raw, id: e.id, start, date: ptDateOf(e.commence_time) });
  }
  return { rows, beyond };
}

const rawStart = (raw: unknown): string | null => {
  const d = raw && typeof raw === "object" ? (raw as { date?: unknown }).date : null;
  return typeof d === "string" && Number.isFinite(Date.parse(d)) ? d : null;
};

/**
 * The adapter the run calls for one league. One Odds API call (3 credits with two books), then free
 * ESPN reads for the days that have a game.
 *
 * A schedule or odds failure THROWS: the run records the league as failed, raises the alert and the
 * next trigger tries again. It never prices a game it could not tie to the schedule, because the
 * schedule row is what the pick is later graded against.
 */
export function footballAdapter(L: LeagueConfig, feeds: FootballFeeds, rules: AnytimeRules = ANYTIME_RULES): Adapter {
  return {
    sport: L.id,
    async candidates(ctx) {
      const pull = await feeds.odds(L);
      const snapshotId = `${L.id}-${ctx.runId}`;
      const { rows, beyond } = upcomingOf(pull.events, ctx.now, rules.horizonMs);
      const notes: string[] = [];
      if (beyond) notes.push(`${L.id}: ${beyond} listed game(s) start beyond the ${Math.round(rules.horizonMs / 86_400_000)}-day horizon and were not priced`);
      if (!rows.length) return { candidates: [], events: [], notes, snapshot: { id: snapshotId, fetchedAt: pull.fetchedAt, events: 0 } };

      /* ESPN files a game under its US-Eastern day, so a late Pacific kickoff sits on the next ESPN date */
      const oddsDates = [...new Set(rows.map((r) => r.date))].sort();
      const days = [...new Set(oddsDates.flatMap((d) => [d, nextDate(d)]))].sort();
      const [fpi, ...perDay] = await Promise.all([feeds.fpi(L), ...days.map((d) => feeds.espnDay(L, d))]);
      const espn = perDay.flat();

      /* a board per Pacific date the SCHEDULE puts a game on: the odds feed and the schedule can
         disagree about a kickoff near midnight, and a game must not be lost to that */
      const boardDates = new Set<string>(oddsDates);
      for (const raw of espn) {
        const s = rawStart(raw);
        if (!s) continue;
        const d = ptDateOf(s);
        if (oddsDates.includes(d) || oddsDates.includes(addDays(d, 1)) || oddsDates.includes(addDays(d, -1))) boardDates.add(d);
      }
      const oddsEvents = rows.map((r) => r.raw);
      const games: CfbGame[] = [];
      const taken = new Set<string>();
      for (const date of [...boardDates].sort()) {
        const board = buildCfbBoard({ date, espnEvents: espn, oddsEvents, fpi, now: ctx.now, bankroll: 0, league: L });
        for (const g of board.games) {
          /* one odds event prices one scheduled game */
          if (g.oddsEventId) {
            if (taken.has(g.oddsEventId)) continue;
            taken.add(g.oddsEventId);
          }
          games.push(g);
        }
      }

      const out = footballCandidates({ league: L, games: games.filter((g) => g.oddsEventId), oddsEvents, snapshotId, fetchedAt: pull.fetchedAt });
      const unscheduled = rows.filter((r) => !taken.has(r.id)).length;
      if (unscheduled) notes.push(`${L.id}: ${unscheduled} listed game(s) could not be tied to the ESPN schedule and were not priced`);
      return { candidates: out.candidates, events: out.events, notes: [...notes, ...out.notes], snapshot: { id: snapshotId, fetchedAt: pull.fetchedAt, events: rows.length } };
    },
  };
}

/* ---------- scores ---------- */

/** How far past its scheduled day a moved game is looked for. */
export const SCORE_SEARCH_DAYS = 8;
/** A game the schedule has no row for this long after its start is reported `missing` (void at the book's deadline). */
export const SCORE_MISSING_MS = 9 * 86_400_000;

const scoreOf = (g: CfbGame): FinalScore => ({
  home: g.homeScore ?? 0,
  away: g.awayScore ?? 0,
  final: g.status === "final" && g.homeScore != null && g.awayScore != null,
  status: g.status,
  start: g.start,
});

/** The game is the one the pick was made on: same schedule id AND, where the pick stored them, the same two teams. */
function sameGame(p: PickRecord, g: CfbGame): boolean {
  const ref = p.gradeRef;
  if (!ref || ref.id !== g.id) return false;
  if (ref.home && normTeam(ref.home) !== normTeam(g.home.name)) return false;
  if (ref.away && normTeam(ref.away) !== normTeam(g.away.name)) return false;
  return true;
}

/**
 * Final scores from ESPN for football picks, keyed by pick id.
 *
 * Each pick is looked up by the schedule id it stored at pick time, on the Pacific day it was due to
 * start. Not there (the game was moved): the following days are searched, up to today. The answer
 * carries the start time the schedule shows NOW, which is what the book's postponement window is
 * measured against. A pick with no answer stays open; one the schedule has dropped for nine days is
 * reported `missing`, which the grader voids once the book's window has closed.
 *
 * A day that cannot be read leaves that day's picks open for the next run and is returned as an
 * error beside the scores that WERE read, so one bad request never blocks the rest.
 */
export function footballScores(leagues: readonly LeagueConfig[], feeds: Pick<FootballFeeds, "espnDay">): ScoreProvider {
  return async (picks, now) => {
    const out = new Map<string, FinalScore>();
    const failures: string[] = [];
    const today = ptDateOf(new Date(now).toISOString());

    for (const L of leagues) {
      const mine = picks.filter((p) => p.gradeRef?.source === "espn" && p.gradeRef.league === L.id);
      if (!mine.length) continue;
      const boards = new Map<string, Promise<Map<string, CfbGame> | null>>();
      const gamesOn = (date: string) => {
        let p = boards.get(date);
        if (!p) {
          p = (async () => {
            try {
              const [a, b] = await Promise.all([feeds.espnDay(L, date), feeds.espnDay(L, nextDate(date))]);
              const board = buildCfbBoard({ date, espnEvents: [...a, ...b], oddsEvents: [], fpi: null, now, bankroll: 0, league: L });
              return new Map(board.games.map((g) => [g.id, g]));
            } catch (e) {
              failures.push(`${L.id} ${date}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200));
              return null;
            }
          })();
          boards.set(date, p);
        }
        return p;
      };

      for (const p of mine) {
        const start = Date.parse(p.commence);
        if (!Number.isFinite(start)) continue;
        const due = ptDateOf(p.commence);
        let found: CfbGame | null = null;
        let unread = false;
        /* its own day first, the day before (a kickoff near midnight), then forward to today */
        const order = [due, addDays(due, -1)];
        for (let i = 1; i <= SCORE_SEARCH_DAYS; i++) order.push(addDays(due, i));
        for (const date of order) {
          if (date > today) continue;
          const games = await gamesOn(date);
          if (!games) {
            unread = true;
            continue;
          }
          const g = games.get(p.gradeRef!.id);
          if (g && sameGame(p, g)) {
            found = g;
            break;
          }
        }
        if (found) out.set(p.id, scoreOf(found));
        else if (!unread && now > start + SCORE_MISSING_MS) out.set(p.id, { home: 0, away: 0, final: false, status: "missing", start: null });
      }
    }
    return failures.length ? { scores: out, errors: failures } : out;
  };
}

/* ---------- the Odds API tally for a run ---------- */

/** One Odds API tally, memory and credit budget per run, read back into the run record. */
export function oddsMeter(): OddsMeter {
  let run: OddsRun | null = null;
  return {
    run(runId, budget, fn) {
      run = newOddsRun(runId, budget);
      return withOddsRun(run, fn);
    },
    spend() {
      if (!run) return null;
      const s = oddsRunSummary(run);
      return { calls: s.calls, cacheHits: s.cacheHits, credits: s.credits, unmetered: s.unmetered, remaining: s.remaining, used: s.used, budget: s.budget, refused: s.refused, errors: s.errors, regionFallback: s.regionFallback };
    },
  };
}

/* ---------- the failure alert ---------- */

export type AlertSend = (payload: { title: string; body: string; url?: string; tag?: string }) => Promise<unknown>;

/** What the phone is told when a run fails or is partial. No pick, price or secret is in it. */
export function alertPayloadOf(r: Pick<RunResult, "status" | "trigger" | "errors" | "runId">): { title: string; body: string; url: string; tag: string } {
  const first = r.errors[0] ?? "no error text";
  const more = r.errors.length > 1 ? ` (+${r.errors.length - 1} more)` : "";
  return {
    title: r.status === "failed" ? "Parlay Lab: pick run FAILED" : "Parlay Lab: pick run had errors",
    body: `${first}${more}`.slice(0, 180),
    url: "/anytime",
    tag: "anytime-run",
  };
}

export function runAlert(send: AlertSend): (r: RunResult) => Promise<void> {
  return async (r) => {
    try {
      await send(alertPayloadOf(r));
    } catch {
      /* an alert that cannot be sent must not turn a recorded failure into an unrecorded one */
    }
  };
}
