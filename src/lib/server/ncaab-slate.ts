import { nextDate } from "@/lib/cfb/dates";
import { NCAAB_ODDS_TTL, NCAAB_ODDS_URL } from "@/lib/ncaab/rules";
import { buildNcaabSlate, parseEspnGames, type NcaabQuota, type NcaabSlate } from "@/lib/ncaab/slate";
import { ncaabEspnDay } from "@/lib/server/anytime-ncaab";
import { oddsFetch } from "@/lib/server/odds-client";

/**
 * THE COLLEGE BASKETBALL SLATE, SERVER SIDE (the body of GET /api/ncaab).
 *
 * WHAT IT COSTS. The schedule is ESPN's and free. The prices are one Odds API call for the whole
 * sport (3 credits), answered from the data cache for NCAAB_ODDS_TTL seconds, and the URL carries no
 * date, so every date and every visitor share that one cached answer: at most one paid call per
 * window however the route is called. The call is not made at all when the date asked for has no
 * game still to tip, so a look back at yesterday's scores is free.
 *
 * The key is read from the server's environment inside `pullOdds`, appended to the request there,
 * and appears in no error, header, log line or body.
 */

export type NcaabSlateFeeds = {
  espnDay(date: string): Promise<unknown[]>;
  /** null when no key is configured */
  odds(): Promise<{ events: unknown[]; quota: NcaabQuota } | null>;
};

const num = (v: string | null): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function pullOdds(): Promise<{ events: unknown[]; quota: NcaabQuota } | null> {
  const key = process.env.ODDS_API_KEY;
  if (!key) return null;
  const r = await oddsFetch(`${NCAAB_ODDS_URL}&apiKey=${encodeURIComponent(key)}`, { next: { revalidate: NCAAB_ODDS_TTL } });
  const quota: NcaabQuota = { remaining: num(r.headers.get("x-requests-remaining")), used: num(r.headers.get("x-requests-used")) };
  if (!r.ok) throw new Error(`odds feed ${r.status}`);
  const j = (await r.json()) as unknown;
  if (!Array.isArray(j)) throw new Error("odds feed: unexpected reply");
  return { events: j, quota };
}

export const liveNcaabSlateFeeds: NcaabSlateFeeds = { espnDay: (d) => ncaabEspnDay(d), odds: pullOdds };

/**
 * The slate for one Pacific date. Throws only when the SCHEDULE cannot be read (the route answers
 * 502). A missing key or a failed odds call is not an error here: the schedule is returned without
 * prices and says so (`oddsMissing`), which is the truth and still useful.
 */
export async function ncaabSlate(date: string, now: number, feeds: NcaabSlateFeeds = liveNcaabSlateFeeds): Promise<NcaabSlate> {
  /* ESPN files a game under its US-Eastern day, so a late Pacific tip sits on the next ESPN date */
  const [a, b] = await Promise.all([feeds.espnDay(date), feeds.espnDay(nextDate(date))]);
  const espnEvents = [...a, ...b];
  const toTip = parseEspnGames(espnEvents).some((g) => g.date === date && g.status === "upcoming" && Date.parse(g.start) > now);
  let odds: { events: unknown[]; quota: NcaabQuota } | null = null;
  let missing = false;
  if (toTip) {
    try {
      odds = await feeds.odds();
      missing = odds == null;
    } catch {
      missing = true;
    }
  }
  return buildNcaabSlate({ date, espnEvents, oddsEvents: odds?.events ?? [], oddsMissing: missing, quota: odds?.quota ?? null, now, ttlSec: NCAAB_ODDS_TTL });
}
