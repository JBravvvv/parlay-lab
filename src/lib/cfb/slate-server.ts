import { buildCfbBoard } from "@/lib/cfb/model";
import { espnDateParam, nextDate } from "@/lib/cfb/dates";
import { CFB_LEAGUE } from "@/lib/cfb/rules";
import type { CfbFinals, CfbGame, CfbSlate } from "@/lib/cfb/types";
import type { LeagueConfig } from "@/lib/football/league";

/**
 * THE FOOTBALL SLATE, SERVER SIDE (INSTRUCTION 38 → shared 2026-09-05 for the props feed → one
 * body for two leagues 2026-09-08, the NFL build). The upstream fetches and the slate assembly
 * that `/api/cfb` has always done, lifted out of the route file so `/api/cfb/props` can build the
 * very same slate (same three feeds, same cache windows, same pure model) without a second copy.
 * Behaviour is identical to the route before the lift — the route still parses the request,
 * validates, and shapes the HTTP answer.
 *
 * TWO LEAGUES, ONE BODY. Every fetch below is a `…Of(cfg, …)` function whose FIRST argument is
 * the league config and is REQUIRED — no default — so a server seam that forgets to say which
 * league it is fetching for is a type error rather than an NFL route reading the FBS scoreboard.
 * The feed URLs come from `cfg.feeds`: the ESPN scoreboard base plus its per-league query
 * (`groups=80&limit=400` for FBS, `limit=100` for the NFL) with `&dates=` appended here, the
 * powerindex URL, and the game-lines URL without a key (`cfg.feeds.oddsUrl`; CFB_LEAGUE's is
 * CFB_ODDS_URL) to which the server appends `&apiKey=` from process.env alone. The bare names this
 * file has always exported — `espnEvents`, `slateFromEspn`, `finalsFromEspn`, `fpiPayload`,
 * `oddsPayload` — stay, with their old signatures, as CFB_LEAGUE-bound wrappers: the CFB routes and
 * the two `vi.mock("@/lib/cfb/slate-server")` tests keep resolving them unchanged.
 *
 * Three upstreams, each on the Next data cache so page loads never spend quota:
 *   ESPN scoreboard  revalidate 60s   — the requested date AND the next calendar date
 *                                       (ESPN buckets by US-Eastern; a late West-coast
 *                                       kickoff sits on the next ESPN date — the model keeps
 *                                       only events whose PT kickoff date is the one asked for;
 *                                       for the NFL the same rule carries a Sunday-night or
 *                                       Monday-night kickoff that sits on the next UTC date)
 *   ESPN FPI         revalidate 6h    — failure → null → every fpi renders "—"
 *   The Odds API     revalidate 240s  — the server key, exactly the way /api/odds injects it;
 *                                       a missing key or a non-200 never throws: the board is
 *                                       scores-only with `oddsMissing: true`
 *
 * Nothing here is fabricated: every price is a posted book quote, every rating is ESPN's own
 * FPI figure, every score is ESPN's own score — the pure model (src/lib/cfb/model.ts) does the
 * shaping, and the finals map is derived from the same shaped games so grading keys and the
 * board's game ids can never disagree.
 */

export const ESPN_TTL = 60;
export const FPI_TTL = 21600;
export const ODDS_TTL = 240;

export type CfbQuota = { remaining: number | null; used: number | null };
export const NO_QUOTA: CfbQuota = { remaining: null, used: null };

export function numHeader(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Read the Odds API quota headers off any of its responses. */
export function quotaOf(r: Response): CfbQuota {
  return { remaining: numHeader(r.headers.get("x-requests-remaining")), used: numHeader(r.headers.get("x-requests-used")) };
}

async function espnDay(cfg: LeagueConfig, date: string): Promise<unknown[]> {
  const url = `${cfg.feeds.espnScoreboard}?${cfg.feeds.espnScoreboardQuery}&dates=${espnDateParam(date)}`;
  const r = await fetch(url, { next: { revalidate: ESPN_TTL } });
  if (!r.ok) throw new Error(`espn scoreboard ${r.status} for ${date}`);
  const j = (await r.json()) as { events?: unknown };
  return Array.isArray(j.events) ? j.events : [];
}

/** The requested date plus the next calendar date, concatenated (see the header). Both must
    land — a silently missing second day would drop the late slate, the obSameDay class.
    Throws when ESPN is down; the route answers 502. `cfg` is required: it names the scoreboard. */
export async function espnEventsOf(cfg: LeagueConfig, date: string): Promise<unknown[]> {
  const [today, tomorrow] = await Promise.all([espnDay(cfg, date), espnDay(cfg, nextDate(date))]);
  return [...today, ...tomorrow];
}

/** CFB-bound: `espnEventsOf(CFB_LEAGUE, date)`. */
export async function espnEvents(date: string): Promise<unknown[]> {
  return espnEventsOf(CFB_LEAGUE, date);
}

export async function fpiPayloadOf(cfg: LeagueConfig): Promise<unknown | null> {
  try {
    const r = await fetch(cfg.feeds.espnFpi, { next: { revalidate: FPI_TTL } });
    if (!r.ok) return null;
    return (await r.json()) as unknown;
  } catch {
    return null;
  }
}

/** CFB-bound: `fpiPayloadOf(CFB_LEAGUE)`. */
export async function fpiPayload(): Promise<unknown | null> {
  return fpiPayloadOf(CFB_LEAGUE);
}

/** The one game-lines Odds API call of a football desk. The key never leaves this function: it is
    not echoed in any error, header or body, and the URL it was appended to is never logged. */
export async function oddsPayloadOf(cfg: LeagueConfig): Promise<{ events: unknown[]; missing: boolean; quota: CfbQuota }> {
  const key = process.env.ODDS_API_KEY;
  if (!key) return { events: [], missing: true, quota: NO_QUOTA };
  try {
    const r = await fetch(`${cfg.feeds.oddsUrl}&apiKey=${encodeURIComponent(key)}`, { next: { revalidate: ODDS_TTL } });
    const quota = quotaOf(r);
    if (!r.ok) return { events: [], missing: true, quota };
    const j = (await r.json().catch(() => null)) as unknown;
    if (!Array.isArray(j)) return { events: [], missing: true, quota };
    return { events: j, missing: false, quota };
  } catch {
    return { events: [], missing: true, quota: NO_QUOTA };
  }
}

/** CFB-bound: `oddsPayloadOf(CFB_LEAGUE)`. */
export async function oddsPayload(): Promise<{ events: unknown[]; missing: boolean; quota: CfbQuota }> {
  return oddsPayloadOf(CFB_LEAGUE);
}

/** Final scores keyed by ESPN event id, from the model's shaped games. A game that ESPN calls
    final without both scores is left OUT rather than graded on a made-up number — the grader
    then reports it pending / ungradable, which is the honest state. Pre-kick and live games
    carry ESPN's running score with `final: false`, so nothing settles on them. */
export function finalsOf(games: CfbGame[]): CfbFinals {
  const out: CfbFinals = {};
  for (const g of games) {
    const final = g.status === "final";
    if (final && (g.homeScore == null || g.awayScore == null)) continue;
    out[g.id] = { home: g.homeScore ?? 0, away: g.awayScore ?? 0, final, status: g.status };
  }
  return out;
}

/** Scores only — NO odds call, no quota. `espn` is the concatenated ESPN payload. */
export function finalsFromEspnOf(cfg: LeagueConfig, date: string, espn: unknown[], now: number, bankroll: number): { date: string; finals: CfbFinals } {
  const board = buildCfbBoard({ date, espnEvents: espn, oddsEvents: [], fpi: null, now, bankroll, league: cfg });
  return { date, finals: finalsOf(board.games) };
}

/** CFB-bound: `finalsFromEspnOf(CFB_LEAGUE, …)`. */
export function finalsFromEspn(date: string, espn: unknown[], now: number, bankroll: number): { date: string; finals: CfbFinals } {
  return finalsFromEspnOf(CFB_LEAGUE, date, espn, now, bankroll);
}

/** The full slate: FPI and the game lines in parallel, then the pure model over all three feeds. */
export async function slateFromEspnOf(cfg: LeagueConfig, date: string, espn: unknown[], now: number, bankroll: number): Promise<CfbSlate> {
  const [fpi, odds] = await Promise.all([fpiPayloadOf(cfg), oddsPayloadOf(cfg)]);
  const board = buildCfbBoard({ date, espnEvents: espn, oddsEvents: odds.events, fpi, now, bankroll, league: cfg });
  return { ...board, finals: finalsOf(board.games), quota: odds.quota, oddsMissing: odds.missing };
}

/** CFB-bound: `slateFromEspnOf(CFB_LEAGUE, …)`. */
export async function slateFromEspn(date: string, espn: unknown[], now: number, bankroll: number): Promise<CfbSlate> {
  return slateFromEspnOf(CFB_LEAGUE, date, espn, now, bankroll);
}
