import { CFB_MODEL } from "@/lib/cfb/rules";
import { ptDateOf } from "@/lib/cfb/dates";

/**
 * TEAM-NAME JOIN: ESPN ↔ The Odds API (INSTRUCTION 38, 2026-09-05).
 *
 * The odds feed names teams by ESPN's `displayName` for 128 of the 136 teams on the 9/5
 * slate. The rest differ by a spelling the feed inherited from somewhere else ("Sam Houston
 * State Bearkats", "Houston Baptist Huskies" — the school renamed itself in 2022 and the odds
 * feed never followed). `normTeam` folds case, punctuation, diacritics and "St." → "State";
 * `ALIASES` carries the spellings that no normalisation reaches, each one verified against
 * the raw 2026-09-05 odds capture (see tests/cfb-names.test.ts for what was found); and
 * `matchOddsEvent` walks three tiers — exact both names, alias both names, one exact side
 * plus a token overlap on the other within the kickoff window — never reusing an odds event.
 */

/* ---------- the raw Odds API event shape (only what the desk reads) ---------- */

export type OddsOutcome = { name: string; price: number; point?: number };
export type OddsMarket = { key: string; outcomes: OddsOutcome[] };
export type OddsBookmaker = { key: string; title: string; last_update?: string; markets: OddsMarket[] };
export type OddsEvent = {
  id: string;
  sport_key?: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsBookmaker[];
};

/** Defensive parse of one raw odds event; null when the shape is not usable. */
export function toOddsEvent(x: unknown): OddsEvent | null {
  if (!x || typeof x !== "object") return null;
  const e = x as Record<string, unknown>;
  if (typeof e.id !== "string" || typeof e.commence_time !== "string") return null;
  if (typeof e.home_team !== "string" || typeof e.away_team !== "string") return null;
  if (Number.isNaN(Date.parse(e.commence_time))) return null;
  const bookmakers: OddsBookmaker[] = [];
  for (const b of Array.isArray(e.bookmakers) ? e.bookmakers : []) {
    if (!b || typeof b !== "object") continue;
    const bk = b as Record<string, unknown>;
    if (typeof bk.key !== "string") continue;
    const markets: OddsMarket[] = [];
    for (const m of Array.isArray(bk.markets) ? bk.markets : []) {
      if (!m || typeof m !== "object") continue;
      const mk = m as Record<string, unknown>;
      if (typeof mk.key !== "string") continue;
      const outcomes: OddsOutcome[] = [];
      for (const o of Array.isArray(mk.outcomes) ? mk.outcomes : []) {
        if (!o || typeof o !== "object") continue;
        const oc = o as Record<string, unknown>;
        if (typeof oc.name !== "string" || typeof oc.price !== "number" || !Number.isFinite(oc.price)) continue;
        const point = typeof oc.point === "number" && Number.isFinite(oc.point) ? oc.point : undefined;
        outcomes.push(point == null ? { name: oc.name, price: oc.price } : { name: oc.name, price: oc.price, point });
      }
      markets.push({ key: mk.key, outcomes });
    }
    bookmakers.push({
      key: bk.key,
      title: typeof bk.title === "string" ? bk.title : bk.key,
      last_update: typeof bk.last_update === "string" ? bk.last_update : undefined,
      markets,
    });
  }
  return {
    id: e.id,
    sport_key: typeof e.sport_key === "string" ? e.sport_key : undefined,
    commence_time: e.commence_time,
    home_team: e.home_team,
    away_team: e.away_team,
    bookmakers,
  };
}

/* ---------- normalisation ---------- */

/**
 * Canonical form of a team name for equality: lowercase, diacritics and apostrophes dropped
 * ("Hawai'i" → "hawaii", "Ragin'" → "ragin"), every other punctuation mark a space
 * ("Miami (OH)" → "miami oh"), "&" → "and", the tokens "st" / "st." → "state", spaces
 * collapsed. Both feeds go through the same function, so what matters is consistency, not
 * that the output reads well.
 */
export function normTeam(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u0027\u0060\u2018\u2019]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((t) => (t === "st" ? "state" : t))
    .join(" ");
}

/**
 * ESPN displayName → the odds feed's spelling. Every entry was read out of the raw
 * 2026-09-05 `americanfootball_ncaaf` capture (158 events); none is guessed. The two
 * apostrophe-only cases are listed for the record — `normTeam` alone already joins them.
 */
export const ALIASES: Record<string, string> = {
  "Sam Houston Bearkats": "Sam Houston State Bearkats",
  "Southern Miss Golden Eagles": "Southern Mississippi Golden Eagles",
  "Houston Christian Huskies": "Houston Baptist Huskies",
  "App State Mountaineers": "Appalachian State Mountaineers",
  "SE Louisiana Lions": "Southeastern Louisiana Lions",
  "The Citadel Bulldogs": "Citadel Bulldogs",
  "Youngstown State Penguins": "Youngstown St Penguins",
  "Nicholls Colonels": "Nicholls State Colonels",
  "Louisiana Ragin' Cajuns": "Louisiana Ragin Cajuns",
  "Hawai'i Rainbow Warriors": "Hawaii Rainbow Warriors",
};

/** Tokens that say nothing about WHICH school a name is. */
const GENERIC = new Set(["university", "state", "the", "of", "and", "at", "college", "a", "u"]);

/**
 * The tokens a name can be recognised by: normalised, minus the trailing nickname token
 * (both feeds write "<School> <Nickname>"), minus GENERIC words. "Sam Houston State Bearkats"
 * → {sam, houston}; "Nicholls Colonels" → {nicholls}; "Army Black Knights" → {army, black}.
 */
export function overlapTokens(name: string): Set<string> {
  const toks = normTeam(name).split(" ").filter(Boolean);
  const body = toks.length > 1 ? toks.slice(0, -1) : toks;
  const out = new Set<string>();
  for (const t of body) if (!GENERIC.has(t)) out.add(t);
  if (!out.size && toks.length) out.add(toks[0]);
  return out;
}

function candidates(espnName: string): string[] {
  const out = [normTeam(espnName)];
  const alias = ALIASES[espnName];
  if (alias) out.push(normTeam(alias));
  return out;
}

function tokenOverlap(a: string, b: string): boolean {
  const ta = overlapTokens(a);
  for (const t of overlapTokens(b)) if (ta.has(t)) return true;
  return false;
}

/* ---------- the matcher ---------- */

export type MatchGame = { home: string; away: string; start: string };

/**
 * Find the odds event for an ESPN game.
 *   1. exact both names (normalised)
 *   2. alias both names (ALIASES applied, then normalised)
 *   3. one side exact (raw or alias) + the other side sharing ≥ 1 non-generic token, on the
 *      same Pacific date and with |commence − kickoff| ≤ CFB_MODEL.matchWindowMs
 * Ties inside a tier go to the event whose commence_time is nearest the kickoff. A matched
 * id is added to `usedIds` here, so no two ESPN games can ever claim the same odds event.
 */
export function matchOddsEvent(game: MatchGame, oddsEvents: OddsEvent[], usedIds: Set<string>): OddsEvent | null {
  const kickoff = Date.parse(game.start);
  const homeRaw = normTeam(game.home);
  const awayRaw = normTeam(game.away);
  const homeAny = candidates(game.home);
  const awayAny = candidates(game.away);
  const pool = oddsEvents.filter((e) => !usedIds.has(e.id));
  const pick = (list: OddsEvent[]): OddsEvent | null => {
    if (!list.length) return null;
    const sorted = [...list].sort(
      (a, b) => Math.abs(Date.parse(a.commence_time) - kickoff) - Math.abs(Date.parse(b.commence_time) - kickoff),
    );
    usedIds.add(sorted[0].id);
    return sorted[0];
  };

  const exact = pool.filter((e) => normTeam(e.home_team) === homeRaw && normTeam(e.away_team) === awayRaw);
  const t1 = pick(exact);
  if (t1) return t1;

  const aliased = pool.filter((e) => homeAny.includes(normTeam(e.home_team)) && awayAny.includes(normTeam(e.away_team)));
  const t2 = pick(aliased);
  if (t2) return t2;

  if (!Number.isFinite(kickoff)) return null;
  const date = ptDateOf(game.start);
  const fuzzy = pool.filter((e) => {
    const t = Date.parse(e.commence_time);
    if (!Number.isFinite(t) || Math.abs(t - kickoff) > CFB_MODEL.matchWindowMs) return false;
    if (ptDateOf(e.commence_time) !== date) return false;
    const homeExact = homeAny.includes(normTeam(e.home_team));
    const awayExact = awayAny.includes(normTeam(e.away_team));
    if (homeExact && !awayExact) return tokenOverlap(game.away, e.away_team);
    if (awayExact && !homeExact) return tokenOverlap(game.home, e.home_team);
    return false;
  });
  return pick(fuzzy);
}
