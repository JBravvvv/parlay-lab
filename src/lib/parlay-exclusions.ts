import { poolOf, type GenLeg, type GenPool, type GenSpec } from "./parlay-gen";

// Football prefixes identity with game ID; exclusions cover the player across games.
export const exclusionKey = (leg: Pick<GenLeg, "playerKey" | "sport">) => `${leg.sport?leg.sport+":" : ""}${leg.playerKey.split("|").at(-1)!}`;
export function excludePlayers<P>(pool: GenPool<P>, keys: ReadonlySet<string>): GenPool<P> {
  return keys.size ? poolOf(pool.legs.filter(l => !keys.has(exclusionKey(l))), pool) : pool;
}
/* The rail's category is display only while several categories are on the ticket — the pool is their union — so a
   browse tap inside the set is the same filter (2026-09-28: it wiped the ✕ exclusions and re-rolled the held ticket,
   the same normalisation requestKey in useParlayGen already makes). Collapsing the set to one category still resets. */
export function exclusionFilterKey(spec: GenSpec): string {
  const { pinned: _pins, ...filters } = spec;
  return JSON.stringify({ ...filters, market: (spec.markets?.length ?? 0) > 1 ? null : spec.market });
}
