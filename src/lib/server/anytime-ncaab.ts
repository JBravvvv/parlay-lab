import type { FinalScore } from "@/lib/anytime/grade";
import { ANYTIME_RULES, type AnytimeRules } from "@/lib/anytime/rules";
import type { Adapter, ScoreProvider, ScoreRead } from "@/lib/anytime/run";
import type { PickRecord } from "@/lib/anytime/types";
import { addDays, espnDateParam, nextDate, ptDateOf } from "@/lib/cfb/dates";
import { normTeam, toOddsEvent } from "@/lib/cfb/names";
import { NCAAB_ESPN_QUERY, NCAAB_ESPN_SCOREBOARD, NCAAB_ESPN_TTL, NCAAB_ID, NCAAB_ODDS_URL } from "@/lib/ncaab/rules";
import { flipGame, ncaabCandidates, parseEspnGames, tieOdds, type NcaabGame } from "@/lib/ncaab/slate";
import { oddsFetch } from "@/lib/server/odds-client";

/**
 * COLLEGE BASKETBALL FOR THE ANY-TIME ENGINE, SERVER SIDE: where the numbers come from.
 *
 *   odds      ONE bulk Odds API call per run (moneyline, spread, total for every listed game),
 *             through the one odds client, so the request names the two books and any other book
 *             is dropped from the reply. 3 credits. Never cached here: a pick may only use prices
 *             fetched in its own run.
 *   schedule  ESPN's scoreboard, one request per calendar day that has a listed game (free).
 *   scores    the same scoreboard, read again once a pick's game has started.
 *
 * The feeds are an interface so every rule below is tested with invented data and no network.
 */

export type NcaabFeeds = {
  /** The sport's game lines, fetched NOW. Throws when the provider did not answer with odds. */
  odds(): Promise<{ events: unknown[]; fetchedAt: number }>;
  /** ESPN scoreboard events for one calendar day (YYYY-MM-DD). Throws when ESPN did not answer. */
  espnDay(date: string): Promise<unknown[]>;
};

/** One ESPN scoreboard day. `cache` is the caller's: the page route reuses a minute-old schedule, a pick run does not. */
export async function ncaabEspnDay(date: string, init: RequestInit & { next?: { revalidate: number } } = { next: { revalidate: NCAAB_ESPN_TTL } }): Promise<unknown[]> {
  const r = await fetch(`${NCAAB_ESPN_SCOREBOARD}?${NCAAB_ESPN_QUERY}&dates=${espnDateParam(date)}`, init);
  if (!r.ok) throw new Error(`espn scoreboard ${r.status} for ${NCAAB_ID} ${date}`);
  const j = (await r.json()) as { events?: unknown };
  return Array.isArray(j.events) ? j.events : [];
}

export function liveNcaabFeeds(): NcaabFeeds {
  return {
    async odds() {
      const key = process.env.ODDS_API_KEY;
      if (!key) throw new Error("ODDS_API_KEY not set");
      const r = await oddsFetch(`${NCAAB_ODDS_URL}&apiKey=${encodeURIComponent(key)}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`Odds API ${r.status} for ${NCAAB_ID}`);
      const j = (await r.json()) as unknown;
      if (!Array.isArray(j)) throw new Error(`Odds API: unexpected reply for ${NCAAB_ID}`);
      /* stamped AFTER the reply landed: the freshness guard counts from when the prices were in hand */
      return { events: j, fetchedAt: Date.now() };
    },
    espnDay: (date) => ncaabEspnDay(date),
  };
}

/** One run's view of the schedule: each ESPN day is fetched at most once; a failed day may be asked for again. Odds are not remembered. */
export function ncaabOncePerRun(feeds: NcaabFeeds): NcaabFeeds {
  const days = new Map<string, Promise<unknown[]>>();
  return {
    odds: () => feeds.odds(),
    espnDay(date) {
      let p = days.get(date);
      if (!p) {
        p = feeds.espnDay(date);
        days.set(date, p);
        p.catch(() => days.delete(date));
      }
      return p;
    },
  };
}

/**
 * The adapter the run calls. One Odds API call, then free ESPN reads for the days that have a game.
 *
 * A schedule or odds failure THROWS: the run records the sport as failed, raises the alert and the
 * next trigger tries again. A listed game that cannot be tied to the schedule is never priced,
 * because the schedule row is what the pick is graded against; it is counted in the notes.
 */
export function ncaabAdapter(feeds: NcaabFeeds, rules: AnytimeRules = ANYTIME_RULES): Adapter {
  return {
    sport: NCAAB_ID,
    async candidates(ctx) {
      const pull = await feeds.odds();
      const snapshotId = `${NCAAB_ID}-${ctx.runId}`;
      const notes: string[] = [];
      const upcoming: unknown[] = [];
      const dates = new Set<string>();
      let beyond = 0;
      for (const raw of pull.events) {
        const e = toOddsEvent(raw);
        if (!e) continue;
        const start = Date.parse(e.commence_time);
        if (!Number.isFinite(start) || start <= ctx.now) continue;
        if (start > ctx.now + rules.horizonMs) {
          beyond++;
          continue;
        }
        upcoming.push(raw);
        dates.add(ptDateOf(e.commence_time));
      }
      if (beyond) notes.push(`${NCAAB_ID}: ${beyond} listed game(s) start beyond the ${Math.round(rules.horizonMs / 86_400_000)}-day horizon and were not priced`);
      if (!upcoming.length) return { candidates: [], events: [], notes, snapshot: { id: snapshotId, fetchedAt: pull.fetchedAt, events: 0 } };

      /* ESPN files a game under its US-Eastern day, so a late Pacific tip sits on the next ESPN date */
      const days = [...new Set([...dates].flatMap((d) => [d, nextDate(d)]))].sort();
      const espn = (await Promise.all(days.map((d) => feeds.espnDay(d)))).flat();
      const tied = tieOdds(parseEspnGames(espn), upcoming);
      if (tied.unmatchedOdds) notes.push(`${NCAAB_ID}: ${tied.unmatchedOdds} listed game(s) could not be tied to the ESPN schedule and were not priced`);
      const open = tied.games.filter((g) => g.status === "upcoming" && Date.parse(g.start) > ctx.now);
      const out = ncaabCandidates({ games: open, oddsEvents: upcoming, snapshotId, fetchedAt: pull.fetchedAt });
      return { candidates: out.candidates, events: out.events, notes, snapshot: { id: snapshotId, fetchedAt: pull.fetchedAt, events: upcoming.length } };
    },
  };
}

/* ---------- scores ---------- */

/** How far past its scheduled day a moved game is looked for. */
export const NCAAB_SCORE_SEARCH_DAYS = 8;
/** A game the schedule has no row for this long after its start is reported `missing` (void at the book's deadline). */
export const NCAAB_SCORE_MISSING_MS = 9 * 86_400_000;

const scoreOf = (g: NcaabGame): FinalScore => ({
  home: g.home.score ?? 0,
  away: g.away.score ?? 0,
  final: g.status === "final" && g.home.score != null && g.away.score != null,
  status: g.status,
  start: g.start,
});

/**
 * The schedule row as the PICK names its teams, or null when it is not the pick's game.
 * Same schedule id AND the same two teams. A pick made on a game the odds feed listed the other
 * way round stored the odds feed's order (slate.ts `tieOdds`), so the row is turned to match and
 * "home" in the score is the team the pick called home.
 */
export function gameForPick(p: Pick<PickRecord, "gradeRef">, g: NcaabGame): NcaabGame | null {
  const ref = p.gradeRef;
  if (!ref || ref.id !== g.id) return null;
  if (!ref.home || !ref.away) return ref.home || ref.away ? null : g;
  const [rh, ra, gh, ga] = [ref.home, ref.away, g.home.name, g.away.name].map(normTeam);
  if (rh === gh && ra === ga) return g;
  if (rh === ga && ra === gh) return flipGame(g);
  return null;
}

/**
 * Final scores from ESPN for College Basketball picks, keyed by pick id. Same rules as football's
 * provider: the pick's own Pacific day first, the day before, then forward to today for a game that
 * was moved; a pick with no answer stays open; one the schedule has dropped for nine days is
 * reported `missing`. A day that cannot be read leaves its picks open and comes back as an error
 * beside the scores that were read.
 */
export function ncaabScores(feeds: Pick<NcaabFeeds, "espnDay">): ScoreProvider {
  return async (picks, now) => {
    const out = new Map<string, FinalScore>();
    const failures: string[] = [];
    const mine = picks.filter((p) => p.gradeRef?.source === "espn" && p.gradeRef.league === NCAAB_ID);
    if (!mine.length) return out;
    const today = ptDateOf(new Date(now).toISOString());
    const boards = new Map<string, Promise<Map<string, NcaabGame> | null>>();
    const gamesOn = (date: string) => {
      let p = boards.get(date);
      if (!p) {
        p = (async () => {
          try {
            const [a, b] = await Promise.all([feeds.espnDay(date), feeds.espnDay(nextDate(date))]);
            return new Map(parseEspnGames([...a, ...b]).map((g) => [g.id, g]));
          } catch (e) {
            failures.push(`${NCAAB_ID} ${date}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200));
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
      let found: NcaabGame | null = null;
      let unread = false;
      const order = [due, addDays(due, -1)];
      for (let i = 1; i <= NCAAB_SCORE_SEARCH_DAYS; i++) order.push(addDays(due, i));
      for (const date of order) {
        if (date > today) continue;
        const games = await gamesOn(date);
        if (!games) {
          unread = true;
          continue;
        }
        const g = games.get(p.gradeRef!.id);
        const row = g ? gameForPick(p, g) : null;
        if (row) {
          found = row;
          break;
        }
      }
      if (found) out.set(p.id, scoreOf(found));
      else if (!unread && now > start + NCAAB_SCORE_MISSING_MS) out.set(p.id, { home: 0, away: 0, final: false, status: "missing", start: null });
    }
    return failures.length ? { scores: out, errors: failures } : out;
  };
}

/**
 * Several score providers as one: each reads the picks that are its own, the answers are merged,
 * and every provider's errors are kept. A provider that throws costs only its own picks this run.
 */
export function scoreProviders(...providers: ScoreProvider[]): ScoreProvider {
  return async (picks, now) => {
    const scores = new Map<string, FinalScore>();
    const errors: string[] = [];
    const reads = await Promise.all(
      providers.map(async (p): Promise<ScoreRead> => {
        try {
          return await p(picks, now);
        } catch (e) {
          return { scores: new Map(), errors: [`scores: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200)] };
        }
      }),
    );
    for (const r of reads) {
      const m = r instanceof Map ? r : r.scores;
      for (const [id, s] of m) scores.set(id, s);
      if (!(r instanceof Map)) errors.push(...r.errors);
    }
    return errors.length ? { scores, errors } : scores;
  };
}
