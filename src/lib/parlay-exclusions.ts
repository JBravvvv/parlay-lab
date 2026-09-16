import { poolOf, type GenLeg, type GenPool, type GenSpec } from "./parlay-gen";

// Football prefixes identity with game ID; exclusions cover the player across games.
export const exclusionKey = (leg: Pick<GenLeg, "playerKey">) => leg.playerKey.split("|").at(-1)!;
export function excludePlayers<P>(pool: GenPool<P>, keys: ReadonlySet<string>): GenPool<P> {
  return keys.size ? poolOf(pool.legs.filter(l => !keys.has(exclusionKey(l))), pool) : pool;
}
export function exclusionFilterKey(spec: GenSpec): string {
  const { pinned: _pins, ...filters } = spec;
  return JSON.stringify(filters);
}
