/**
 * Stats tab GAME windows (INSTRUCTIONS 35–36, 2026-09-04).
 *
 * Josh's word: hitting filters become "Last 7 / 15 / 30 Games" and "should only
 * reflect games they played in" — a hitter who sat 3 of his team's last 18 has
 * exactly those 15 as his sample. Pitching filters become "Last 3 / 5 / 10 Games",
 * where for a starter the games are STARTS ("Gerrit Cole under 'Last 5 Games'
 * should show his last 5 Games Started") and for a reliever they are the games he
 * pitched in ("Aroldis Chapman … his last 5 RP, not just the last 5 games the Red
 * Sox played").
 *
 * The calendar windows this replaces (`stats=byDateRange`, last N days) counted
 * team games, off days and benchings alike. MLB's `lastXGames` stat type is the
 * per-player answer — but the league-wide `/api/v1/stats?stats=lastXGames`
 * endpoint pins X at 10 whatever `limit` says (observed 2026-09-05: every split
 * gamesPlayed=10 for limit 5/15/30), so the route batches every player id through
 * `/api/v1/people?personIds=…&hydrate=stats(type=[lastXGames],limit=N)`, which
 * honours N (Judge limit=15 → gamesPlayed 15; Cole limit=5 → 5 GS).
 *
 * `lastXGames` is the last N APPEARANCES. For a reliever that is the spec. For a
 * starter it is the spec whenever every appearance in the window was a start;
 * when one wasn't (an opener day, a rehab relief outing), the route pulls that
 * pitcher's game log and this module sums his last N STARTS instead — that is
 * `needsStartsOnly` + `aggregateStarts`. Rates are recomputed from the sums.
 *
 * Pure: no fetch. The route (app/api/stats/window/route.ts) does the I/O and the
 * Stats page consumes the league-shaped doc through the same parser it always had.
 */

export type WindowGroup = "hitting" | "pitching";

/** The game windows each group offers, in menu order. Season is the fourth option. */
export const WINDOW_GAMES: Record<WindowGroup, readonly number[]> = {
  hitting: [7, 15, 30],
  pitching: [3, 5, 10],
};

export const isWindowGroup = (g: unknown): g is WindowGroup => g === "hitting" || g === "pitching";

/** Timeframe select value for an N-game window ("g15"); "season" is the other value. */
export const windowValue = (n: number) => `g${n}`;
export function parseWindowValue(v: string | null | undefined): number | null {
  const m = /^g(\d{1,2})$/.exec(v ?? "");
  return m ? Number(m[1]) : null;
}
/** Translate a window across groups by menu position (Last 15 hitting ↔ Last 5 pitching). */
export function siblingWindow(from: WindowGroup, to: WindowGroup, n: number): number | null {
  const i = WINDOW_GAMES[from].indexOf(n);
  return i < 0 ? null : WINDOW_GAMES[to][i];
}

/** Same starter rule as the Stats page's SP/RP filter: started at least half his games (min 1). */
export const isStarter = (gamesPlayed: number, gamesStarted: number) =>
  gamesStarted >= Math.max(1, gamesPlayed * 0.5);

export type StatMap = Record<string, unknown>;
export type LeagueSplit = {
  player?: { id: number; fullName: string };
  team?: { id: number; name: string; abbreviation?: string };
  position?: { abbreviation?: string; code?: string; name?: string; type?: string };
  stat?: StatMap;
};
export type LeagueDoc = { stats?: { splits?: LeagueSplit[]; totalSplits?: number }[] };

export type PersonStats = {
  group?: { displayName?: string };
  type?: { displayName?: string };
  splits?: { date?: string; stat?: StatMap }[];
};
export type PeopleDoc = { people?: { id: number; fullName?: string; stats?: PersonStats[] }[] };

export const num = (s: StatMap | undefined, k: string): number => {
  const v = s?.[k];
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/** "86.0" / "5.1" innings → outs (the .1/.2 are thirds, not tenths). */
export const ipToOuts = (ip: unknown): number => {
  const [w, f = "0"] = String(ip ?? "0").split(".");
  const whole = parseInt(w, 10) || 0;
  const third = parseInt(f, 10) || 0;
  return whole * 3 + Math.min(third, 2);
};
export const outsToIp = (outs: number) => `${Math.floor(outs / 3)}.${outs % 3}`;

/** id → the one split of `type` for `group` from a people hydrate doc. */
export function personSplits(doc: PeopleDoc, group: WindowGroup, type: "lastXGames" | "gameLog"): Map<number, PersonStats["splits"]> {
  const out = new Map<number, PersonStats["splits"]>();
  for (const p of doc.people ?? []) {
    const s = (p.stats ?? []).find(
      (x) => x.type?.displayName === type && (x.group?.displayName ?? group) === group,
    );
    if (s?.splits) out.set(p.id, s.splits);
  }
  return out;
}

/** A starter whose last-N-appearances window contains a non-start → sum his last N starts instead. */
export function needsStartsOnly(group: WindowGroup, season: StatMap | undefined, win: StatMap | undefined): boolean {
  if (group !== "pitching" || !season || !win) return false;
  if (!isStarter(num(season, "gamesPlayed"), num(season, "gamesStarted"))) return false;
  return num(win, "gamesStarted") < num(win, "gamesPlayed");
}

const PITCH_SUMS = [
  "gamesPlayed", "gamesStarted", "wins", "losses", "saves", "holds", "completeGames", "shutouts",
  "hits", "runs", "earnedRuns", "homeRuns", "hitBatsmen", "baseOnBalls", "strikeOuts",
  "atBats", "battersFaced", "outs", "numberOfPitches",
] as const;

const r = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d) : "—");

export type LogGame = { date?: string; stat?: StatMap };
/** Oldest→newest by date (MLB's game log already is; the sort makes it a contract). */
const chronological = (games: LogGame[]) => [...games].sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));

/**
 * Sum a pitcher's last `n` games from his season game log — his last `n`
 * STARTS when `startsOnly`, else his last `n` appearances. Derived rates are
 * recomputed the way the league endpoint reports them (strings: era "2.97",
 * whip "1.05", avg ".246"). Returns null when nothing qualifies.
 */
export function aggregatePitching(gameLog: LogGame[], n: number, startsOnly: boolean): StatMap | null {
  const pool = chronological(gameLog).filter((g) => g.stat && (!startsOnly || num(g.stat, "gamesStarted") >= 1));
  if (pool.length === 0) return null;
  const last = pool.slice(-n);
  const out: StatMap = {};
  for (const k of PITCH_SUMS) out[k] = last.reduce((a, g) => a + num(g.stat, k), 0);
  // a game log row carries `outs`; fall back to its inningsPitched when it doesn't
  if (!num(out, "outs")) out.outs = last.reduce((a, g) => a + ipToOuts(g.stat?.inningsPitched), 0);
  const outs = num(out, "outs");
  out.gamesPlayed = last.length;
  if (startsOnly) out.gamesStarted = last.length;
  out.inningsPitched = outsToIp(outs);
  out.era = outs > 0 ? r((num(out, "earnedRuns") * 27) / outs, 2) : "-.--";
  out.whip = outs > 0 ? r(((num(out, "hits") + num(out, "baseOnBalls")) * 3) / outs, 2) : "-.--";
  out.strikeoutsPer9Inn = outs > 0 ? r((num(out, "strikeOuts") * 27) / outs, 2) : "-.--";
  out.avg = num(out, "atBats") > 0 ? r(num(out, "hits") / num(out, "atBats"), 3).replace(/^0/, "") : ".---";
  out.windowSource = startsOnly ? "starts" : "appearances";
  return out;
}
/** The starts-only case the Stats table route needs. */
export const aggregateStarts = (gameLog: LogGame[], n: number) => aggregatePitching(gameLog, n, true);

const HIT_SUMS = [
  "plateAppearances", "atBats", "runs", "hits", "doubles", "triples", "homeRuns", "totalBases", "rbi",
  "baseOnBalls", "hitByPitch", "sacFlies", "stolenBases", "strikeOuts",
] as const;

/**
 * Sum a hitter's last `n` games PLAYED from his game log (every log row is a
 * game he appeared in) and recompute AVG/OBP/SLG/OPS from the sums — the feed's
 * per-game avg/obp/slg are season-to-date, never the window's.
 */
export function aggregateHitting(gameLog: LogGame[], n: number): StatMap | null {
  const pool = chronological(gameLog).filter((g) => g.stat);
  if (pool.length === 0) return null;
  const last = pool.slice(-n);
  const out: StatMap = {};
  for (const k of HIT_SUMS) out[k] = last.reduce((a, g) => a + num(g.stat, k), 0);
  out.gamesPlayed = last.length;
  const ab = num(out, "atBats"), h = num(out, "hits");
  const obpDen = ab + num(out, "baseOnBalls") + num(out, "hitByPitch") + num(out, "sacFlies");
  const avg = ab > 0 ? h / ab : NaN;
  const obp = obpDen > 0 ? (h + num(out, "baseOnBalls") + num(out, "hitByPitch")) / obpDen : NaN;
  const slg = ab > 0 ? num(out, "totalBases") / ab : NaN;
  const r3 = (v: number) => (Number.isFinite(v) ? v.toFixed(3).replace(/^0/, "") : "—");
  out.avg = r3(avg);
  out.obp = r3(obp);
  out.slg = r3(slg);
  out.ops = Number.isFinite(obp) && Number.isFinite(slg) ? r3(obp + slg) : "—";
  out.windowSource = "games";
  return out;
}

/** The columns the Stats table shows (plus what its SP/RP filter and min-slider read). A full
    people hydrate is ~1.1 MB for 845 pitchers; keeping only these makes the response phone-sized. */
export const KEEP_STAT: Record<WindowGroup, readonly string[]> = {
  hitting: [
    "gamesPlayed", "plateAppearances", "atBats", "avg", "hits", "doubles", "triples", "homeRuns", "totalBases",
    "rbi", "runs", "obp", "slg", "ops", "baseOnBalls", "strikeOuts", "stolenBases",
  ],
  pitching: [
    "gamesPlayed", "gamesStarted", "era", "wins", "losses", "saves", "holds", "inningsPitched", "outs", "hits", "runs",
    "earnedRuns", "homeRuns", "hitBatsmen", "baseOnBalls", "strikeOuts", "strikeoutsPer9Inn", "whip",
    "completeGames", "shutouts", "avg", "windowSource",
  ],
};
export function slimStat(group: WindowGroup, stat: StatMap): StatMap {
  const out: StatMap = {};
  for (const k of KEEP_STAT[group]) if (stat[k] !== undefined) out[k] = stat[k];
  return out;
}

/**
 * Build the league-shaped doc the Stats table parses, one split per player who
 * has a window: season list (ids, team, position) × people windows × game logs
 * for the starters that need them.
 */
export function shapeWindow(args: {
  group: WindowGroup;
  n: number;
  seasonDoc: LeagueDoc;
  peopleDoc: PeopleDoc;
  gameLogDoc?: PeopleDoc | null;
}): LeagueDoc & { window: { group: WindowGroup; n: number; players: number; startsOnly: number } } {
  const { group, n } = args;
  const wins = personSplits(args.peopleDoc, group, "lastXGames");
  const logs = args.gameLogDoc ? personSplits(args.gameLogDoc, group, "gameLog") : new Map<number, PersonStats["splits"]>();
  const splits: LeagueSplit[] = [];
  let startsOnly = 0;
  for (const s of args.seasonDoc.stats?.[0]?.splits ?? []) {
    const id = s.player?.id;
    if (!id) continue;
    const win = wins.get(id)?.[0]?.stat;
    if (!win || num(win, "gamesPlayed") === 0) continue;
    let stat: StatMap = win;
    if (needsStartsOnly(group, s.stat, win)) {
      const agg = aggregateStarts(logs.get(id) ?? [], n);
      if (agg) {
        stat = agg;
        startsOnly++;
      }
    }
    splits.push({
      player: s.player ? { id: s.player.id, fullName: s.player.fullName } : undefined,
      team: s.team ? { id: s.team.id, name: s.team.name, abbreviation: s.team.abbreviation } : undefined,
      position: s.position ? { abbreviation: s.position.abbreviation } : undefined,
      stat: slimStat(group, stat),
    });
  }
  return { stats: [{ splits, totalSplits: splits.length }], window: { group, n, players: splits.length, startsOnly } };
}

/** Ids of the starters whose window needs the game-log pass (the route fetches only these). */
export function startsOnlyIds(group: WindowGroup, seasonDoc: LeagueDoc, peopleDoc: PeopleDoc): number[] {
  const wins = personSplits(peopleDoc, group, "lastXGames");
  const ids: number[] = [];
  for (const s of seasonDoc.stats?.[0]?.splits ?? []) {
    const id = s.player?.id;
    if (id && needsStartsOnly(group, s.stat, wins.get(id)?.[0]?.stat)) ids.push(id);
  }
  return ids;
}

/** One-line explanation for the filter row. */
export const windowNote = (group: WindowGroup, n: number) =>
  group === "hitting"
    ? `Last ${n} games each hitter played in — off days and benchings don't count`
    : `SP: last ${n} starts · RP/CP: last ${n} appearances`;
