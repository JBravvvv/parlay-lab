import { espnDateParam } from "@/lib/cfb/dates";
import { CFB_LEAGUE } from "@/lib/cfb/rules";
import { NFL_LEAGUE } from "@/lib/nfl/rules";
import { NCAAB_ESPN_QUERY, NCAAB_ESPN_SCOREBOARD } from "@/lib/ncaab/rules";
import { isMarkSport, markDays, parseMarks, type MarkSport, type MarksById } from "@/lib/anytime/marks";

/**
 * The team logos for the engine's picks, read from ESPN's free scoreboard (no Odds API call, no
 * store read, no secret). Logos do not change during a day, so each scoreboard day is kept an hour.
 */
export const MARKS_TTL = 3600;

const BOARD: Record<MarkSport, { url: string; query: string }> = {
  nfl: { url: NFL_LEAGUE.feeds.espnScoreboard, query: NFL_LEAGUE.feeds.espnScoreboardQuery },
  cfb: { url: CFB_LEAGUE.feeds.espnScoreboard, query: CFB_LEAGUE.feeds.espnScoreboardQuery },
  ncaab: { url: NCAAB_ESPN_SCOREBOARD, query: NCAAB_ESPN_QUERY },
};

export const marksUrl = (sport: MarkSport, date: string) => `${BOARD[sport].url}?${BOARD[sport].query}&dates=${espnDateParam(date)}`;

type FetchLike = (url: string, init: { next: { revalidate: number } }) => Promise<Response>;

export type MarksReply = { status: number; body: { sport: string; days: string[]; games: MarksById; missed: string[] } | { error: string } };

/** One day that fails is named in `missed` and the rest still answer: a logo is never worth a 500. */
export async function handleMarks(sport: string | null, dates: string | null, fetchImpl: FetchLike = (u, i) => fetch(u, i)): Promise<MarksReply> {
  if (!isMarkSport(sport)) return { status: 400, body: { error: "sport must be nfl, cfb or ncaab" } };
  const { days, fetch: toFetch } = markDays((dates ?? "").split(","));
  if (!days.length) return { status: 400, body: { error: "dates must be one or more YYYY-MM-DD, comma separated" } };
  const missed: string[] = [];
  const pages = await Promise.all(
    toFetch.map(async (d) => {
      try {
        const r = await fetchImpl(marksUrl(sport, d), { next: { revalidate: MARKS_TTL } });
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as { events?: unknown };
        return Array.isArray(j.events) ? j.events : [];
      } catch {
        missed.push(d);
        return [];
      }
    }),
  );
  return { status: 200, body: { sport, days, games: parseMarks(pages.flat()), missed: missed.sort() } };
}
