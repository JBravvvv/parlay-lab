/**
 * POSTED-LINEUP CROSS-CHECK (2026-09-04, INSTRUCTION 28 — Josh: "It keeps showing Jose
 * Caballero on the board even with a refresh yet he's not in the yankees starting lineup
 * so there's no bets available for him at any book").
 *
 * WHAT WAS HAPPENING: the board is generated whenever the scheduler fires; a game whose
 * lineup is not posted yet gets its rows from the PROJECTED lineup (row.lu = "projected",
 * engine rule @~199372). Once the real lineup posts and excludes the player, the books
 * pull his props — but the stored board (and the day's stamped picks, which are that board)
 * keeps the row with its stale generation-time price. A "Refresh" reruns the engine, which
 * re-reads lineups, but the prop tabs render the stored stamped picks, not the rerun.
 *
 * THE FIX IS RENDER-TIME AND PURE: the Board page reads the statsapi schedule with
 * hydrate=lineups (through /api/stats, keyless, 180 s cache) and every batter row whose
 * game has a POSTED lineup that does not contain him is marked OUT and hidden by default
 * (a "show scratched" toggle keeps the stamped data visible — nothing is deleted; the
 * graded cohort is untouched). The legacy rule this mirrors: "a POSTED lineup missing the
 * player means he's ruled out today -> off the board entirely (Caesars voids the leg)".
 *
 * PITCHERS ARE EXEMPT: statsapi lineups carry the nine batters only, so a pitcher row can
 * never be judged by them (status "unknown", never "out"). Unposted games are "unknown" too.
 */
import { normalizeName } from "./player-card";

export type PostedLineup = { posted: boolean; names: Set<string> };
export type PostedLineups = Record<number, PostedLineup>;
export type LineupStatus = "in" | "out" | "unknown";

type SchedulePlayer = { id?: number; fullName?: string };
type ScheduleGame = {
  gamePk?: number;
  lineups?: { awayPlayers?: SchedulePlayer[]; homePlayers?: SchedulePlayer[] };
};
export type ScheduleWithLineups = { dates?: { games?: ScheduleGame[] }[] };

/** statsapi schedule?hydrate=lineups -> { pk: { posted, names(normalized) } }. */
export function shapeLineups(j: ScheduleWithLineups | null | undefined): PostedLineups {
  const out: PostedLineups = {};
  for (const d of j?.dates ?? []) {
    for (const g of d.games ?? []) {
      if (g.gamePk == null) continue;
      const players = [...(g.lineups?.awayPlayers ?? []), ...(g.lineups?.homePlayers ?? [])];
      const names = new Set(players.map((p) => normalizeName(p.fullName ?? "")).filter(Boolean));
      // a lineup counts as POSTED only when BOTH sides are up — one side alone (some
      // feeds post the home nine first) must not scratch the other side's batters
      const posted = (g.lineups?.awayPlayers?.length ?? 0) >= 9 && (g.lineups?.homePlayers?.length ?? 0) >= 9;
      out[g.gamePk] = { posted, names };
    }
  }
  return out;
}

/** Batter markets only — pitchers never appear in a statsapi lineup. */
export function isBatterMarket(market: string | null | undefined): boolean {
  return typeof market === "string" && market.startsWith("batter_");
}

/**
 * The verdict for one row. `market` gates pitchers out of the check; `pk` is the board's
 * gameInfo[gkey].pk; `name` is the bare player name (board label without the "(TEAM)").
 */
export function lineupStatus(
  name: string | null | undefined,
  market: string | null | undefined,
  pk: number | null | undefined,
  lineups: PostedLineups | null | undefined,
): LineupStatus {
  if (!name || !isBatterMarket(market) || pk == null || !lineups) return "unknown";
  const lu = lineups[pk];
  if (!lu || !lu.posted) return "unknown";
  return lu.names.has(normalizeName(name)) ? "in" : "out";
}

/** market from an lkey "player|market|line" */
export function marketOfLkey(lkey: string | null | undefined): string | null {
  if (!lkey) return null;
  const parts = lkey.split("|");
  return parts.length >= 2 ? parts[1] : null;
}

export const SCRATCHED_LABEL = "OUT — not in the posted lineup (books void or pull this)";
