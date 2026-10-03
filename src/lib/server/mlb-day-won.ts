import { gradePrediction, type Boxscore, type GameStatus } from "@/engine2/grade";
import { foundWonByOf, foundWonOf, mergeWonBy } from "@/lib/found-mode";
import { settlingDec } from "@/lib/ticket-payout";

/**
 * THE MLB DAY'S WINNINGS, READ ON THE SERVER (2026-10-03, Josh: "If a bet wins (Ie: $250 straight
 * bet wins $200) then that is added on top of what can be bet on the day").
 *
 * WHY THE SERVER READS THE BOX SCORES ITSELF. An MLB ticket's `grading` on the shared ledger is
 * written by the DEVICE (the Ledger tab grades and syncs) — nothing on the server grades a locked
 * MLB ticket. The found pass cannot wait for Josh to open the app, so it reads the same free
 * statsapi.mlb.com schedule + box scores /api/calibrate grades predictions from (zero Odds credits)
 * and grades each leg with the same `gradePrediction`.
 *
 * NEVER OVERSTATED. A ticket counts as won here only when EVERY leg graded "won" — a void or push
 * leg, an ungradable leg or a game not final counts nothing (the device's own grade, which divides
 * voids out, still counts once it syncs). A won ticket's profit is stake × its settling price − stake
 * (the locked price: confirmed, else czDec — ticket-payout.ts settlingDec, without the czOdds fallback the
 * device grader does not use). A settled grade on the entry always outranks this read, either way, and
 * the read is recorded per ticket (`foundWonBy`, src/lib/found-mode.ts).
 */

type Leg = { lkey?: unknown; prop?: unknown; gkey?: unknown };
type Ticket = { id?: unknown; stake?: unknown; legs?: unknown; czDec?: unknown; czOdds?: unknown; confirmed?: unknown };
export type MlbWonEntry = {
  date?: unknown;
  core?: readonly Ticket[] | null;
  funT?: readonly Ticket[] | null;
  grading?: { tickets?: Record<string, { result?: unknown; payout?: unknown } | undefined> | null } | null;
  games?: Record<string, { pk?: number | null } | undefined> | null;
  foundWonBy?: unknown;
};

const cents = (n: number) => Math.round(n * 100) / 100;
const FINAL = /final|game over|completed/i;

const legsOf = (t: Ticket): Leg[] => (Array.isArray(t.legs) ? (t.legs as Leg[]) : []);

/** the game pks whose box score the read needs: final games behind a prop leg on an ungraded ticket */
export function boxPksNeeded(entry: MlbWonEntry, statuses: Map<number, GameStatus>): number[] {
  const g = entry.grading?.tickets ?? {};
  const need = new Set<number>();
  for (const t of [...(entry.core ?? []), ...(entry.funT ?? [])]) {
    if (t.id != null && g[String(t.id)]?.result && g[String(t.id)]?.result !== "pending") continue;
    for (const l of legsOf(t)) {
      const pk = entry.games?.[String(l.gkey ?? "")]?.pk;
      const lk = String(l.lkey ?? "");
      if (!pk || !lk.includes("|")) continue;
      if (FINAL.test(statuses.get(pk)?.state ?? "")) need.add(pk);
    }
  }
  return [...need];
}

/** pure: this read's per-ticket verdicts — a ticket with no settled grade on the entry whose EVERY leg
    graded won counts its profit at the locked price (confirmed, else czDec — the price the device grader
    settles at); a ticket with a LOST leg reads 0, which cancels any earlier recorded win for it */
export function mlbReadWonBy(entry: MlbWonEntry | null | undefined, statuses: Map<number, GameStatus>, boxes: Map<number, Boxscore>): Record<string, number> {
  const out: Record<string, number> = {};
  if (!entry) return out;
  const g = entry.grading?.tickets ?? {};
  for (const t of [...(entry.core ?? []), ...(entry.funT ?? [])]) {
    const id = t.id == null ? "" : String(t.id);
    if (!id) continue;
    const dev = g[id];
    if (dev?.result && dev.result !== "pending") continue;
    const legs = legsOf(t);
    if (!legs.length) continue;
    const results = legs.map((l) => {
      const pk = entry.games?.[String(l.gkey ?? "")]?.pk;
      if (!pk) return "pending";
      return gradePrediction(String(l.lkey ?? ""), String(l.prop ?? ""), statuses.get(pk) ?? null, boxes.get(pk) ?? null).result;
    });
    if (results.includes("lost")) {
      out[id] = 0;
      continue;
    }
    if (!results.every((r) => r === "won")) continue;
    const dec = settlingDec({ stake: Number(t.stake), czDec: t.czDec as number | null, confirmed: t.confirmed as number | null });
    const stake = Number(t.stake) || 0;
    if (dec != null && dec > 1 && stake > 0) out[id] = cents(stake * dec - stake);
  }
  return out;
}

/** pure: the entry's per-ticket wins with this read folded in (a settled grade still decides its ticket) */
export function mlbWonByFrom(entry: MlbWonEntry | null | undefined, statuses: Map<number, GameStatus>, boxes: Map<number, Boxscore>): Record<string, number> {
  if (!entry) return {};
  const read = mlbReadWonBy(entry, statuses, boxes);
  /* this read's verdict replaces the recorded one per ticket (a 0 cancels it); tickets it could not decide keep theirs */
  const rec = mergeWonBy(entry.foundWonBy);
  for (const [id, v] of Object.entries(read)) {
    if (v > 0) rec[id] = v;
    else delete rec[id];
  }
  return foundWonByOf({ ...(entry as object), foundWonBy: rec } as never);
}

/** pure: the day's realized winnings, as one number */
export function mlbWonFrom(entry: MlbWonEntry | null | undefined, statuses: Map<number, GameStatus>, boxes: Map<number, Boxscore>): number {
  return cents(Object.values(mlbWonByFrom(entry, statuses, boxes)).reduce((a, b) => a + b, 0));
}

type FetchJson = <T>(url: string) => Promise<T | null>;
const fetchJsonDefault: FetchJson = async <T,>(url: string) => {
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
};

/** at most this many box scores per read — a postseason day holds a handful of games */
const MAX_BOXES = 16;

/**
 * The day's per-ticket winnings with the free statsapi read folded in. Never throws — an unreachable
 * statsapi reads as "nothing new won", never as more room. The box scores are read IN PARALLEL, so a
 * poke spends at most two timeouts (schedule, then boxes) on this, never one per game.
 */
export async function mlbDayWonBy(entry: MlbWonEntry | null | undefined, fetchJson: FetchJson = fetchJsonDefault): Promise<Record<string, number>> {
  const floor = foundWonByOf(entry as never);
  if (!entry || typeof entry.date !== "string") return floor;
  try {
    const j = await fetchJson<{ dates?: { games?: { gamePk: number; status?: { detailedState?: string }; teams?: { away?: { score?: number }; home?: { score?: number } } }[] }[] }>(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${entry.date}`,
    );
    const statuses = new Map<number, GameStatus>();
    for (const g of j?.dates?.[0]?.games ?? []) {
      statuses.set(g.gamePk, { state: g.status?.detailedState ?? "", away: g.teams?.away?.score ?? null, home: g.teams?.home?.score ?? null });
    }
    const boxes = new Map<number, Boxscore>();
    const pks = boxPksNeeded(entry, statuses).slice(0, MAX_BOXES);
    const got = await Promise.all(pks.map((pk) => fetchJson<Boxscore>(`https://statsapi.mlb.com/api/v1/game/${pk}/boxscore`).catch(() => null)));
    pks.forEach((pk, i) => {
      if (got[i]) boxes.set(pk, got[i]!);
    });
    return mlbWonByFrom(entry, statuses, boxes);
  } catch {
    return floor;
  }
}

/** the same read as one number — what the MLB refill gate adds to the $2,500 room */
export async function mlbDayWon(entry: MlbWonEntry | null | undefined, fetchJson: FetchJson = fetchJsonDefault): Promise<number> {
  return foundWonOf({ ...(entry ?? {}), foundWonBy: await mlbDayWonBy(entry, fetchJson) } as never);
}
