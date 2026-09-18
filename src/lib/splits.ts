/**
 * BETTING SPLITS — bet % and money % per side (Josh, 2026-09-18, verbatim: "Each pick anywhere on
 * the website should also tell me the bet % and Money % (Bet % = amount of bets on that bet vs the
 * opposing bet … Money % = The amount of money on that side of the handle)").
 *
 * SOURCE: scoresandodds.com's public consensus pages (`/{nfl|mlb|ncaaf}/consensus-picks`), which
 * republish Action Network's consensus — one card per game and market (moneyline / spread /
 * total) carrying two bars: "% of Bets" then "% of Money", left = AWAY (or OVER), right = HOME
 * (or UNDER). Verified against the MLB statsapi schedule on 2026-09-18 (Cubs @ Reds drew CHC left,
 * CIN right). Action Network's own API nulls these fields without a paid login and VSiN shows one
 * free game, so this page is the one free feed that carries both numbers for every game.
 *
 * NOTHING IS INVENTED: a market the page does not carry, or a game this desk cannot match to a
 * consensus card, simply shows no split. Player props have no public split anywhere — none is
 * shown. The page is scraped, so a markup change degrades to "no split", never to a wrong one.
 */

export type SplitsLeague = "nfl" | "mlb" | "ncaaf";
export type SplitMarket = "moneyline" | "spread" | "total";

/** one side's share of the tickets and of the handle, whole percentages */
export type SideSplit = { bets: number; money: number };

/** a market's two sides: `a` = away / over, `b` = home / under */
export type MarketSplit = { a: SideSplit; b: SideSplit; /** the consensus line printed beside the sides ("-3.5" for the away spread, "44.5" for the total) */ line: number | null };

export type SplitTeam = { abbr: string | null; name: string };

export type GameSplits = {
  /** scoresandodds / Action Network event id ("35985370") */
  id: string;
  league: SplitsLeague;
  /** kickoff / first pitch, ISO UTC */
  kickoff: string | null;
  away: SplitTeam;
  home: SplitTeam;
  markets: Partial<Record<SplitMarket, MarketSplit>>;
};

export type SplitsFeed = {
  league: SplitsLeague;
  source: "scoresandodds";
  fetchedAt: string;
  games: GameSplits[];
  /** set when the fetch or parse failed — the UI stays silent, never invents */
  error?: string;
};

export const SPLITS_SOURCE_URL = (league: SplitsLeague) => `https://www.scoresandodds.com/${league}/consensus-picks`;

/* ---------- parsing ---------- */

const CARD_SPLIT = /(?=<div class="trend-card consensus )/;

function pct(block: string, which: "a" | "b"): number | null {
  const m = new RegExp(`<span class="percentage-${which}"[^>]*style="[^"]*width:\\s*(\\d+(?:\\.\\d+)?)%`).exec(block);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function text(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** the consensus line off the sides strip: "GB (-3.5)" → -3.5; "Over (o44.5)" → 44.5; "GB" → null */
function lineOf(side: string): number | null {
  const m = /\(\s*[ou]?\s*([+-]?\d+(?:\.\d+)?)\s*\)/i.exec(side);
  return m ? Number(m[1]) : null;
}

/**
 * Parse one consensus page into games. Cards for the same event (moneyline / spread / total) are
 * folded onto one game keyed by the event id; a card missing either bar is skipped.
 */
export function parseConsensus(html: string, league: SplitsLeague): GameSplits[] {
  const out = new Map<string, GameSplits>();
  const cards = html.split(CARD_SPLIT).slice(1);
  for (const card of cards) {
    const mk = /consensus-table-(moneyline|spread|total)/.exec(card.slice(0, 200));
    if (!mk) continue;
    const market = mk[1] as SplitMarket;
    const ev = /data-event="(?:[a-z]+)\/(\d+)"/.exec(card);
    const header = card.slice(0, card.indexOf('<div class="module-body">') > 0 ? card.indexOf('<div class="module-body">') : 4000);
    const flags = [...header.matchAll(/<span class="team-flag"\s+([A-Z0-9]+)""/g)].map((m) => m[1]);
    const names = [...header.matchAll(/<span class="team-name">\s*<span>([^<]+)<\/span>/g)].map((m) => text(m[1]));
    if (names.length < 2) continue;
    const id = ev?.[1] ?? `${league}:${names[0]}@${names[1]}`;
    const kickoff = /data-role="localtime" data-value="([^"]+)"/.exec(header)?.[1] ?? null;
    const sides = /<span class="trend-graph-sides">([\s\S]*?)<\/span>\s*<span class="trend-graph-percentage"/.exec(card);
    const strongs = sides ? [...sides[1].matchAll(/<strong>([\s\S]*?)<\/strong>/g)].map((m) => text(m[1])) : [];
    const bars = [...card.matchAll(/<span class="trend-graph-percentage"[^>]*>([\s\S]*?)<\/span>\s*<\/span>/g)].map((m) => m[1]);
    if (bars.length < 2) continue;
    const betsA = pct(bars[0], "a"), betsB = pct(bars[0], "b"), moneyA = pct(bars[1], "a"), moneyB = pct(bars[1], "b");
    if (betsA == null || betsB == null || moneyA == null || moneyB == null) continue;
    const g = out.get(id) ?? {
      id,
      league,
      kickoff,
      away: { abbr: flags[0] ?? null, name: names[0] },
      home: { abbr: flags[1] ?? null, name: names[1] },
      markets: {},
    };
    g.markets[market] = { a: { bets: betsA, money: moneyA }, b: { bets: betsB, money: moneyB }, line: strongs[0] ? lineOf(strongs[0]) : null };
    out.set(id, g);
  }
  return [...out.values()];
}

/* ---------- matching a desk game to a consensus game ---------- */

/** abbreviation spellings that name the same club across ESPN, The Odds API, the engine and scoresandodds */
const ALIASES: string[][] = [
  // NFL
  ["was", "wsh"], ["jax", "jac"], ["lar", "la"], ["ari", "arz"], ["gb", "gnb"], ["kc", "kan"], ["ne", "nwe"], ["no", "nor"],
  ["sf", "sfo"], ["tb", "tam"], ["lv", "lvr"], ["hou", "hou"],
  // MLB
  ["ath", "oak"], ["cws", "chw"], ["az", "ari"], ["kc", "kcr"], ["sd", "sdp"], ["sf", "sfg"], ["tb", "tbr"], ["wsh", "was"],
  // CFB (scoresandodds flag vs common ESPN abbreviations)
  ["prst", "prs"], ["buff", "buf"], ["asu", "arst"], ["ariz", "ari"],
];
const ALIAS_OF = new Map<string, Set<string>>();
for (const group of ALIASES) for (const a of group) {
  const set = ALIAS_OF.get(a) ?? new Set<string>();
  for (const b of group) set.add(b);
  ALIAS_OF.set(a, set);
}

const compact = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]/g, "");

/** the tokens that identify one team: abbreviation (+ aliases), the compact name, its nickname */
export function teamKeys(t: { abbr?: string | null; name?: string | null; short?: string | null }): Set<string> {
  const keys = new Set<string>();
  const ab = (t.abbr ?? "").toLowerCase().trim();
  if (ab) {
    keys.add(ab);
    for (const x of ALIAS_OF.get(ab) ?? []) keys.add(x);
  }
  for (const n of [t.name, t.short]) {
    const s = (n ?? "").trim();
    if (!s) continue;
    const c = compact(s);
    if (c) keys.add(c);
    const words = s.replace(/\([^)]*\)/g, "").trim().split(/\s+/);
    if (words.length > 1) {
      const last = words[words.length - 1].toLowerCase();
      const nick = /^(sox|jays)$/.test(last) ? compact(words.slice(-2).join("")) : compact(last);
      if (nick.length >= 4) keys.add(nick);
    }
  }
  return keys;
}

function teamsMatch(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) {
    if (b.has(x)) return true;
    // "newyorkyankees" ends with the consensus nickname "yankees"; "pennstate" equals "pennstate"
    for (const y of b) if (y.length >= 4 && x.length > y.length && x.endsWith(y)) return true;
    for (const y of b) if (x.length >= 4 && y.length > x.length && y.endsWith(x)) return true;
  }
  return false;
}

export type SplitTeamRef = { abbr?: string | null; name?: string | null; short?: string | null };

/**
 * The consensus game for a desk game — both sides must match (away↔away, home↔home; a swapped
 * pair is accepted for neutral-site football). With several candidates the nearest kickoff wins.
 */
export function findGameSplits(feed: Pick<SplitsFeed, "games"> | null | undefined, away: SplitTeamRef, home: SplitTeamRef, kickoff?: string | null): GameSplits | null {
  if (!feed?.games?.length) return null;
  const ka = teamKeys(away), kh = teamKeys(home);
  if (!ka.size || !kh.size) return null;
  const hits: GameSplits[] = [];
  for (const g of feed.games) {
    const ga = teamKeys(g.away), gh = teamKeys(g.home);
    if ((teamsMatch(ka, ga) && teamsMatch(kh, gh)) || (teamsMatch(ka, gh) && teamsMatch(kh, ga))) hits.push(g);
  }
  if (hits.length === 0) return null;
  if (hits.length === 1 || !kickoff) return hits[0];
  const t = Date.parse(kickoff);
  if (!Number.isFinite(t)) return hits[0];
  return hits.slice().sort((x, y) => Math.abs((Date.parse(x.kickoff ?? "") || 0) - t) - Math.abs((Date.parse(y.kickoff ?? "") || 0) - t))[0];
}

export type SplitSide = "away" | "home" | "over" | "under";

/** one side's split off a matched game, or null when the market is not on the page */
export function sideSplit(g: GameSplits | null | undefined, market: "ml" | "spread" | "total", side: SplitSide): SideSplit | null {
  if (!g) return null;
  const m = g.markets[market === "ml" ? "moneyline" : market];
  if (!m) return null;
  if (market === "total") return side === "over" ? m.a : side === "under" ? m.b : null;
  // a desk team that matched the consensus HOME slot while the desk called it away (neutral site) still reads its own bar
  return side === "away" ? m.a : side === "home" ? m.b : null;
}

/* ---------- MLB legs: "New York Yankees ML" / "RL" on gkey "newyorkyankees@losangelesdodgers" ---------- */

/** the split for an MLB club leg from the engine's own label + gkey; null for a prop or an unmatched game */
export function mlbLegSplit(feed: Pick<SplitsFeed, "games"> | null | undefined, leg: { label?: string | null; sub?: string | null; gkey?: string | null }): SideSplit | null {
  if (!feed?.games?.length) return null;
  const gkey = (leg.gkey ?? "").split(" ")[0];
  const [awayKey, homeKey] = gkey.split("@");
  if (!awayKey || !homeKey) return null;
  const label = (leg.label ?? "").trim();
  const sub = (leg.sub ?? "").trim();
  const isRl = /\bRL\b/i.test(label) || /\bRL\b/i.test(sub) || /run line/i.test(sub);
  const isMl = /\bML\b/i.test(label) || /\bML\b/i.test(sub) || /moneyline/i.test(sub);
  if (!isRl && !isMl) return null;
  const club = compact(label.replace(/\b(ML|RL)\b.*$/i, ""));
  if (!club) return null;
  const g = findGameSplits(feed, { name: awayKey }, { name: homeKey });
  if (!g) return null;
  const side: SplitSide | null = teamsMatch(new Set([club]), teamKeys({ name: awayKey })) || teamsMatch(new Set([club]), teamKeys(g.away))
    ? "away"
    : teamsMatch(new Set([club]), teamKeys({ name: homeKey })) || teamsMatch(new Set([club]), teamKeys(g.home))
      ? "home"
      : null;
  if (!side) return null;
  return sideSplit(g, isRl ? "spread" : "ml", side);
}

/** "78% bets · 62% $" — the chip text */
export function splitText(s: SideSplit): string {
  return `${s.bets}% bets · ${s.money}% $`;
}
