import type { SyncEntry } from "@/lib/ledger-merge";
import { pnorm } from "@/engine2/grade";

/**
 * Upgrade 03 — CLV sighting kernel. Pure functions: the /api/clv route feeds
 * odds-API payloads in and gets `clv` updates out. Hard guarantees:
 * - only legs whose game has NOT started are ever sighted (immutability:
 *   closing line means the last price BEFORE first pitch);
 * - the kernel writes `clv` and nothing else — grading, legs, and stakes are
 *   structurally out of reach;
 * - one entry per leg id; a later sighting overwrites an earlier one (the
 *   last look before first pitch IS the close we can honestly claim).
 * Each sighting stores the Caesars price AND the de-vigged multi-book
 * consensus fair probability, so CLV can be graded against both closes.
 */

export type ClvSight = { am: number; at: number; consensusFair: number | null };

export type BookOutcome = { name?: string; description?: string; price?: number; point?: number };
export type BookMarket = { key: string; outcomes?: BookOutcome[] };
export type Bookmaker = { key: string; title?: string; markets?: BookMarket[] };
export type OddsEvent = {
  id: string;
  away_team: string;
  home_team: string;
  commence_time: string;
  bookmakers?: Bookmaker[];
};

export const CAESARS_KEY = "williamhill_us";

export type PendingLeg = { lid: string; lkey: string; prop: string; gkey: string; start: number };

export const impliedProb = (am: number): number => (am > 0 ? 100 / (am + 100) : -am / (-am + 100)) as number;
const devigPair = (a: number | null, b: number | null): number | null =>
  a != null && b != null && a + b > 0 ? a / (a + b) : null;
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

type LedgerLeg = { label?: string; prop?: string; gkey?: string | null; lkey?: string | null };
type LedgerTicket = { legs?: LedgerLeg[] };

/** Every still-pregame leg of a locked entry whose game starts within horizonMs,
    deduped by leg id and grouped by game. */
export function pendingLegs(
  entry: SyncEntry,
  now: number,
  horizonMs: number,
): Map<string, { start: number; legs: PendingLeg[] }> {
  const games = (entry.games ?? {}) as Record<string, { start?: string | null }>;
  const out = new Map<string, { start: number; legs: PendingLeg[] }>();
  const seen = new Set<string>();
  const tickets = [...((entry.core as LedgerTicket[]) ?? []), ...((entry.funT as LedgerTicket[]) ?? [])];
  for (const t of tickets) {
    for (const l of t.legs ?? []) {
      if (!l.lkey || !l.gkey || !l.label || !l.prop) continue;
      const lid = `${l.label}|${l.prop}`;
      if (seen.has(lid)) continue;
      const startIso = games[l.gkey]?.start;
      if (!startIso) continue;
      const start = new Date(startIso).getTime();
      if (!(start > now) || start - now > horizonMs) continue; // started, or not in the window yet
      seen.add(lid);
      const g = out.get(l.gkey) ?? { start, legs: [] };
      g.legs.push({ lid, lkey: l.lkey, prop: l.prop, gkey: l.gkey, start });
      out.set(l.gkey, g);
    }
  }
  return out;
}

const isGameLeg = (lkey: string) => lkey === "ml_home" || lkey === "ml_away" || lkey === "rl_home" || lkey === "rl_away";

/** The odds-API market keys one game's prop legs need (plus Caesars' alternate ladders). */
export function marketsFor(legs: PendingLeg[]): string[] {
  const m = new Set<string>();
  for (const l of legs) {
    if (isGameLeg(l.lkey)) continue;
    const parts = l.lkey.split("|");
    if (parts.length === 3) {
      m.add(parts[1]);
      m.add(`${parts[1]}_alternate`);
    }
  }
  return [...m].sort();
}

/** This game's event among the API's events — doubleheader-aware: same matchup,
    closest first pitch to the ledger's stored start. */
export function matchEvent<T extends { away_team: string; home_team: string; commence_time: string }>(
  events: T[],
  gkey: string,
  start: number,
): T | null {
  const base = gkey.replace(/gm\d+$/, "");
  let best: T | null = null;
  let bd = Infinity;
  for (const e of events) {
    if (pnorm(e.away_team) + "@" + pnorm(e.home_team) !== base) continue;
    const d = Math.abs(new Date(e.commence_time).getTime() - start);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

/** Sight a batter/pitcher prop leg from a per-event odds payload. */
export function sightProp(ev: OddsEvent, leg: PendingLeg, at: number): ClvSight | null {
  const parts = leg.lkey.split("|");
  if (parts.length !== 3) return null;
  const [player, market, lnS] = parts;
  const ln = Number(lnS);
  const under = / U /.test(leg.prop);
  const fairs: number[] = [];
  let czOver: number | null = null;
  let czUnder: number | null = null;
  let czAltOver: number | null = null;
  let czAltUnder: number | null = null;
  for (const bk of ev.bookmakers ?? []) {
    for (const mk of bk.markets ?? []) {
      const alt = mk.key === `${market}_alternate`;
      if (mk.key !== market && !alt) continue;
      if (alt && bk.key !== CAESARS_KEY) continue; // ladders only ever fill the Caesars price
      let o: number | null = null;
      let u: number | null = null;
      for (const x of mk.outcomes ?? []) {
        if (pnorm(x.description ?? x.name ?? "") !== player) continue;
        if ((x.point ?? null) !== ln) continue;
        if ((x.name ?? "").toLowerCase().includes("over") || x.name === "Yes") o = x.price ?? null;
        else u = x.price ?? null;
      }
      if (alt) {
        if (o != null) czAltOver = o;
        if (u != null) czAltUnder = u;
        continue;
      }
      const f = devigPair(o != null ? impliedProb(o) : null, u != null ? impliedProb(u) : null);
      if (f != null) fairs.push(f);
      if (bk.key === CAESARS_KEY) {
        if (o != null) czOver = o;
        if (u != null) czUnder = u;
      }
    }
  }
  const am = under ? (czUnder ?? czAltUnder) : (czOver ?? czAltOver);
  if (am == null) return null;
  const fairOver = fairs.length >= 2 ? median(fairs) : null;
  return { am, at, consensusFair: fairOver == null ? null : under ? 1 - fairOver : fairOver };
}

/** Sight an ML or RL leg from the slate game-odds payload (h2h + spreads). */
export function sightGameLeg(ev: OddsEvent, leg: PendingLeg, at: number): ClvSight | null {
  const home = leg.lkey === "ml_home" || leg.lkey === "rl_home";
  const ml = leg.lkey === "ml_home" || leg.lkey === "ml_away";
  const ptM = leg.prop.match(/RL ([+-][\d.]+)/);
  const pt = ptM ? Number(ptM[1]) : null;
  if (!ml && pt == null) return null;
  const fairs: number[] = [];
  let cz: number | null = null;
  for (const bk of ev.bookmakers ?? []) {
    for (const mk of bk.markets ?? []) {
      if (mk.key !== (ml ? "h2h" : "spreads")) continue;
      let mine: BookOutcome | null = null;
      let other: BookOutcome | null = null;
      for (const x of mk.outcomes ?? []) {
        const isHome = x.name === ev.home_team;
        if (isHome === home) mine = x;
        else other = x;
      }
      if (!mine?.price || !other?.price) continue;
      if (!ml && (mine.point ?? null) !== pt) continue; // only books quoting the leg's exact point
      const f = devigPair(impliedProb(mine.price), impliedProb(other.price));
      if (f != null) fairs.push(f);
      if (bk.key === CAESARS_KEY) cz = mine.price;
    }
  }
  if (cz == null) return null;
  return { am: cz, at, consensusFair: fairs.length >= 2 ? median(fairs) : null };
}

/** Merge sightings into a COPY of the entry: clv only, latest wins, everything
    else byte-identical. Returns how many leg ids changed. */
export function applySights(entry: SyncEntry, sights: Record<string, ClvSight>): { entry: SyncEntry; updated: number } {
  const out: SyncEntry = JSON.parse(JSON.stringify(entry));
  const clv = { ...(out.clv ?? {}) } as Record<string, ClvSight>;
  let updated = 0;
  for (const [lid, s] of Object.entries(sights)) {
    if (JSON.stringify(clv[lid]) !== JSON.stringify(s)) updated++;
    clv[lid] = s;
  }
  out.clv = clv as never;
  return { entry: out, updated };
}
