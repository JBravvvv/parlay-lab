/**
 * TEAM MARKS FOR THE ENGINE'S PICKS (2026-11-15, Josh: the card "still needs to follow the team
 * logo/headshot for every pick"). A stored pick names its game by ESPN's id and its two teams by
 * name; it carries no logo. This reads ESPN's own scoreboard events (free, the same feed the desks
 * read) into the two teams of each game, in the shape the app's TeamMark already draws.
 * Pure: no fetch, no clock. Nothing is invented: a team ESPN sends without a logo has `logo: null`
 * and the mark falls back to its abbreviation.
 */

export type MarkTeam = { id: string; name: string; short: string; abbr: string; logo: string | null; color: string | null; rank: null };
export type GameMarks = { home: MarkTeam; away: MarkTeam };
export type MarksById = Record<string, GameMarks>;

export const MARK_SPORTS = ["nfl", "cfb", "ncaab"] as const;
export type MarkSport = (typeof MARK_SPORTS)[number];
export const isMarkSport = (s: unknown): s is MarkSport => typeof s === "string" && (MARK_SPORTS as readonly string[]).includes(s);

/** the most days one request may ask for */
export const MARK_DAYS_MAX = 10;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function teamOf(c: Record<string, unknown>): MarkTeam | null {
  const t = obj(c.team);
  if (!t) return null;
  const name = str(t.displayName) || str(t.name) || str(t.location);
  const abbr = str(t.abbreviation) || name.slice(0, 4).toUpperCase();
  if (!name || !abbr) return null;
  const logos = Array.isArray(t.logos) ? t.logos : [];
  const logo = str(t.logo) || str(obj(logos[0])?.href);
  return {
    id: str(t.id),
    name,
    short: str(t.shortDisplayName) || str(t.location) || name,
    abbr,
    logo: /^https:\/\//.test(logo) ? logo : null,
    color: /^[0-9a-f]{6}$/i.test(str(t.color)) ? str(t.color) : null,
    rank: null,
  };
}

/** every game in the events that has an id and both teams; the first copy of a game wins */
export function parseMarks(events: readonly unknown[]): MarksById {
  const out: MarksById = {};
  for (const raw of events) {
    const e = obj(raw);
    const id = str(e?.id);
    if (!e || !id || out[id]) continue;
    const comp = obj(Array.isArray(e.competitions) ? e.competitions[0] : null);
    const sides = Array.isArray(comp?.competitors) ? comp!.competitors.map(obj).filter((c): c is Record<string, unknown> => !!c) : [];
    const home = sides.find((c) => c.homeAway === "home");
    const away = sides.find((c) => c.homeAway === "away");
    const h = home ? teamOf(home) : null;
    const a = away ? teamOf(away) : null;
    if (h && a) out[id] = { home: h, away: a };
  }
  return out;
}

/** the days asked for, valid, de-duplicated, sorted, capped; plus the day after each (ESPN files a late game under the US-Eastern day) */
export function markDays(asked: readonly string[]): { days: string[]; fetch: string[] } {
  const days = [...new Set(asked.filter((d) => DAY.test(d) && !Number.isNaN(Date.parse(`${d}T12:00:00Z`))))].sort().slice(0, MARK_DAYS_MAX);
  const next = (d: string) => {
    const t = new Date(`${d}T12:00:00Z`);
    t.setUTCDate(t.getUTCDate() + 1);
    return t.toISOString().slice(0, 10);
  };
  return { days, fetch: [...new Set(days.flatMap((d) => [d, next(d)]))].sort() };
}

/** what a pick shows: the picked team for a side, both teams for a total, null when the game's marks are not in hand */
export type PickMark = { kind: "team"; team: MarkTeam } | { kind: "pair"; home: MarkTeam; away: MarkTeam } | null;

export function pickMark(p: { side: string; gameId: string | null }, marks: MarksById | null | undefined): PickMark {
  const g = p.gameId && marks ? marks[p.gameId] : undefined;
  if (!g) return null;
  if (p.side === "home") return { kind: "team", team: g.home };
  if (p.side === "away") return { kind: "team", team: g.away };
  return { kind: "pair", home: g.home, away: g.away };
}

/** the stand-in when no logo is in hand: the picked team's (or the matchup's) letters, never a guessed logo */
export function fallbackAbbr(p: { side: string; home: string | null; away: string | null; event: string }): string {
  const letters = (name: string) => name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 3).toUpperCase();
  const name = p.side === "home" ? p.home : p.side === "away" ? p.away : null;
  return letters(name ?? p.event.replace(/@|vs\.?/gi, " ")) || "?";
}
