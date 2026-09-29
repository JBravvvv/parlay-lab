import type { PropBoardGame } from "@/engine";
import { parseBoardLabel } from "@/lib/player-card";
import { hitKey } from "@/lib/prop-hit-rate";

/**
 * WHO THE HIT-RATE CHIPS ASK ABOUT (2026-09-28). The list the free statsapi game-log read
 * (useHitRates → /api/mlb/hit-rates) is asked for: every player on the whole prop board, in every
 * market given, spelled as the book spells him, with the engine's team or null.
 *
 * The Props page has asked for exactly that since the chips shipped (2026-09-18). The Board asked
 * only for its STAMPED picks, and only the ones whose label carried a team. A team-less player
 * (the engine's bare label: the book's spelling is missing from the stats pull) therefore never
 * had a chip, and on the ALL view nobody outside the stamped top-50-per-market pool did either.
 *
 * A team-less player is asked for by name alone. The route resolves him through resolvePlayer,
 * which answers only on a unique name, so a shared name (the two Luis Garcias) stays blank rather
 * than showing another player's games.
 *
 * `stamped` appends the day's stored picks after the board, so a pick the current board no longer
 * carries keeps its chip: "Name (TEAM)" as that name and team, a bare label as the name alone — a
 * bare label only in a market given here, since a club or a total is not a player. Board rows go
 * first and the board loop is the Props page's own, so while every stamped player is on the board
 * the Board asks for the Props page's list exactly and the two pages share one cached request.
 */
export type HitPlayer = { name: string; team: string | null };

export function hitPlayersOf(
  board: readonly PropBoardGame[],
  markets: readonly string[],
  stamped?: Readonly<Record<string, readonly { player?: string | null }[] | null | undefined>> | null,
): HitPlayer[] {
  const seen = new Map<string, HitPlayer>();
  for (const g of board) for (const m of markets) for (const r of g.markets?.[m] ?? []) {
    if (!seen.has(r.p)) seen.set(r.p, { name: r.p, team: r.tm ?? null });
  }
  const prop = new Set(markets);
  for (const [cat, list] of Object.entries(stamped ?? {})) for (const p of list ?? []) {
    if (!p.player) continue;
    const parsed = parseBoardLabel(p.player);
    const who = parsed ? { name: parsed.name, team: parsed.team } : prop.has(cat) ? { name: p.player, team: null } : null;
    if (who && !seen.has(who.name)) seen.set(who.name, who);
  }
  return [...seen.values()];
}

/** The key a printed Board label reads its game log under: "Name (TEAM)" by the name, a bare label as it is. */
export function hitLogKey(label: string): string {
  return hitKey(parseBoardLabel(label)?.name ?? label);
}
