import type { CfbPropMarket, CfbPropRow } from "@/lib/cfb/props-types";
import { playerSlug, type CfbPropCtxLookup, type CfbPropPlayerMeta } from "@/lib/cfb/props";
import { CFB_LEAGUE } from "@/lib/cfb/rules";
import type { LeagueConfig } from "@/lib/football/league";

/**
 * ESPN SEASON CONTEXT FOR PROPS (INSTRUCTION 39, 2026-09-05) — best-effort, no key, never an
 * error. The season `byathlete` tables for passing / rushing / receiving (the same URLs the
 * Stats page reads) are joined by normalised player name so a prop row can show "5 G · 271.4
 * per game · 1,357 season" beside the line. The join is by NAME — ESPN's table and the odds
 * feed's `description` are two spellings of one player and can disagree (a "Jr.", an initial) —
 * so a miss is a null `ctx`, never a guess. A fetch failure is a null context; every row then
 * renders "—" for context and the prices are untouched.
 *
 * INSTRUCTION 46 (2026-09-08, Josh's word, verbatim: "Board & Builder should have player headshot
 * as well as team logo"): the same byathlete rows carry the player's identity — `athlete.id`,
 * `athlete.headshot.href` (verified 2026-09-08: the full-size PNG answers 200), `athlete.teamId`
 * (ESPN's team id, the SAME id the slate's `CfbTeam.id` carries), `athlete.teamShortName` and
 * `athlete.position.abbreviation`. They ride along in the season line so a prop row can draw the
 * player's headshot with his OWN team's logo and, when the odds feed named no team, resolve the
 * team from ESPN's id against the game's home/away ids. Every field is ESPN's own value or null;
 * no extra fetch, no paid-API spend — the tables were already loading for the context join.
 *
 * TWO LEAGUES, ONE JOIN (2026-09-08, the NFL build): `loadPropsContext(cfg)` reads the three
 * tables through the league's own `feeds.espnByAthleteUrl(group, ctx.season)` (the NFL tables live
 * under football/nfl; `ctx.limit` is carried by that URL) on a `ctx.ttlSec` data-cache window;
 * `loadCfbPropsContext()` is the CFB-bound call every existing caller keeps. `espnByAthleteUrl`
 * below stays the CFB feed's URL builder (app/api/cfb/season/route.ts reads it).
 */

export const CFB_CTX_TTL = 3600;
export const CFB_CTX_SEASON = 2026;
/**
 * Rows per season table. Next's data cache refuses fetch bodies over 2MB (observed: receiving at
 * limit=350 was 2,111,628 bytes and logged "items over 2MB can not be cached", so it was refetched
 * on every request). 250 keeps every table well under the cap; tables are sorted by yards desc so
 * the players Caesars prices are near the top.
 */
export const CFB_CTX_LIMIT = 250;
const CTX_GROUPS = ["passing", "rushing", "receiving"] as const;
type CtxGroup = (typeof CTX_GROUPS)[number];

export function espnByAthleteUrl(group: CtxGroup, season: number = CFB_CTX_SEASON): string {
  const q = `?region=us&lang=en&contentorigin=espn&season=${season}&seasontype=2`;
  const srt = { passing: "passing.passingYards", rushing: "rushing.rushingYards", receiving: "receiving.receivingYards" }[group];
  return `https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/statistics/byathlete${q}&isqualified=true&page=1&limit=${CFB_CTX_LIMIT}&category=offense%3A${group}&sort=${srt}%3Adesc`;
}

/** one player's season line — every field ESPN's own value or null */
export type CfbSeasonLine = {
  g: number;
  passYds: number | null;
  passTds: number | null;
  rushYds: number | null;
  rushTds: number | null;
  rec: number | null;
  recYds: number | null;
  recTds: number | null;
  /** INSTRUCTION 46 identity — ESPN's own values or null */
  athleteId: string | null;
  headshot: string | null;
  teamId: string | null;
  teamAbbr: string | null;
  pos: string | null;
};

export type CfbPropsContext = Map<string, CfbSeasonLine>;

type Rec = Record<string, unknown>;
const rec = (x: unknown): Rec | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Rec) : null);
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
/** ESPN sends ids as strings, sometimes numbers — either way a non-empty string or null */
const idStr = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x.trim() : typeof x === "number" && Number.isFinite(x) ? String(x) : null);

/**
 * Parse one byathlete payload into (slug → season line). The top-level `categories[].names`
 * name the columns; each athlete's `categories[].values` carry the numbers in the same order.
 */
export function parseByAthlete(json: unknown, into: CfbPropsContext = new Map()): CfbPropsContext {
  const root = rec(json);
  if (!root) return into;
  const columns = new Map<string, string[]>();
  for (const c of arr(root.categories)) {
    const cr = rec(c);
    const name = cr && typeof cr.name === "string" ? cr.name : null;
    if (!cr || !name) continue;
    columns.set(name, arr(cr.names).map((n) => (typeof n === "string" ? n : "")));
  }
  const pick = (cats: Rec[], cat: string, field: string): number | null => {
    const cols = columns.get(cat);
    if (!cols) return null;
    const i = cols.indexOf(field);
    if (i < 0) return null;
    const own = cats.find((c) => c.name === cat && !(typeof c.displayName === "string" && c.displayName.startsWith("Opponent")));
    return own ? num(arr(own.values)[i]) : null;
  };
  for (const a of arr(root.athletes)) {
    const ar = rec(a);
    const ath = ar ? rec(ar.athlete) : null;
    const name = ath && typeof ath.displayName === "string" ? ath.displayName : null;
    if (!ar || !ath || !name) continue;
    const cats = arr(ar.categories).map(rec).filter((c): c is Rec => !!c);
    const g = pick(cats, "general", "gamesPlayed");
    if (g == null || g <= 0) continue;
    const slug = playerSlug(name);
    const prev = into.get(slug);
    const headshot = idStr(rec(ath.headshot)?.href);
    const line: CfbSeasonLine = {
      g,
      passYds: pick(cats, "passing", "passingYards") ?? prev?.passYds ?? null,
      passTds: pick(cats, "passing", "passingTouchdowns") ?? prev?.passTds ?? null,
      rushYds: pick(cats, "rushing", "rushingYards") ?? prev?.rushYds ?? null,
      rushTds: pick(cats, "rushing", "rushingTouchdowns") ?? prev?.rushTds ?? null,
      rec: pick(cats, "receiving", "receptions") ?? prev?.rec ?? null,
      recYds: pick(cats, "receiving", "receivingYards") ?? prev?.recYds ?? null,
      recTds: pick(cats, "receiving", "receivingTouchdowns") ?? prev?.recTds ?? null,
      // identity (INSTRUCTION 46): only http(s) headshots are kept; a table that lacks the field
      // keeps whatever an earlier table already said about the same player
      athleteId: idStr(ath.id) ?? prev?.athleteId ?? null,
      headshot: (headshot && /^https?:\/\//.test(headshot) ? headshot : null) ?? prev?.headshot ?? null,
      teamId: idStr(ath.teamId) ?? prev?.teamId ?? null,
      teamAbbr: idStr(ath.teamShortName) ?? prev?.teamAbbr ?? null,
      pos: idStr(rec(ath.position)?.abbreviation) ?? prev?.pos ?? null,
    };
    into.set(slug, line);
  }
  return into;
}

/** The row's `ctx` for a market from a player's season line: the stat the prop is on. */
export function ctxFor(line: CfbSeasonLine | undefined, market: CfbPropMarket): CfbPropRow["ctx"] {
  if (!line) return null;
  let season: number | null;
  switch (market) {
    case "pass_yds":
      season = line.passYds;
      break;
    case "pass_tds":
      season = line.passTds;
      break;
    case "rush_yds":
      season = line.rushYds;
      break;
    case "receptions":
      season = line.rec;
      break;
    case "rec_yds":
      season = line.recYds;
      break;
    case "anytime_td":
      season = line.rushTds == null && line.recTds == null ? null : (line.rushTds ?? 0) + (line.recTds ?? 0);
      break;
  }
  const perGame = season == null || line.g <= 0 ? null : Math.round((season / line.g) * 10) / 10;
  return { g: line.g, perGame, season };
}

/** The player's identity from a season line (INSTRUCTION 46) — null when the line is unknown. */
export function playerMetaFor(line: CfbSeasonLine | undefined): CfbPropPlayerMeta | null {
  if (!line) return null;
  return { athleteId: line.athleteId, headshot: line.headshot, teamId: line.teamId, teamAbbr: line.teamAbbr, pos: line.pos };
}

/**
 * A lookup over the merged context, for `parseEventProps`. The callable is the season-stat join
 * the route has always passed; `.player` (INSTRUCTION 46) is the identity join on the same map.
 */
export function ctxLookup(ctx: CfbPropsContext | null): CfbPropCtxLookup | null {
  if (!ctx || !ctx.size) return null;
  const lookup: CfbPropCtxLookup = (market, player) => ctxFor(ctx.get(playerSlug(player)), market);
  lookup.player = (player) => playerMetaFor(ctx.get(playerSlug(player)));
  return lookup;
}

/** Fetch and merge the league's three season tables. Any failure → null (context is optional). */
export async function loadPropsContext(cfg: LeagueConfig): Promise<CfbPropsContext | null> {
  try {
    const pages = await Promise.all(
      CTX_GROUPS.map(async (group) => {
        const r = await fetch(cfg.feeds.espnByAthleteUrl(group, cfg.ctx.season), { next: { revalidate: cfg.ctx.ttlSec } });
        if (!r.ok) return null;
        return (await r.json().catch(() => null)) as unknown;
      }),
    );
    const ctx: CfbPropsContext = new Map();
    for (const page of pages) if (page) parseByAthlete(page, ctx);
    return ctx.size ? ctx : null;
  } catch {
    return null;
  }
}

/** The CFB desk's season context — `loadPropsContext(CFB_LEAGUE)`. */
export function loadCfbPropsContext(): Promise<CfbPropsContext | null> {
  return loadPropsContext(CFB_LEAGUE);
}
