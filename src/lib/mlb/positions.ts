import { canonicalAbbr, normalizeName, parseBoardLabel } from "@/lib/player-card";

/**
 * MLB POSITIONS ON EVERY PICK (2026-09-28, Josh: "Add players position to every pick on parlay lab").
 *
 * The position is MLB's own `primaryPosition` from the season's player index (src/lib/mlb/player-index.ts, free
 * statsapi — never the Odds API), served compactly by GET /api/mlb/positions and resolved on the device. Pure and
 * client-safe: no fetch, no state.
 *
 * The name match is exactly `resolvePlayer`'s (src/lib/player-card.ts): an exact accent/suffix-proof match, a second
 * exact match broken only by the pick's team, then last name + first initial. Anything ambiguous resolves to NOTHING —
 * a missing tag beats another player's position. It is precomputed into maps so a 400-name board resolves in a few
 * milliseconds instead of normalising 1,500 names per lookup.
 */

/** the wire row: [full name, team abbreviation, primary position] */
export type PositionRow = readonly [name: string, team: string | null, pos: string | null];
export type PositionDoc = { season: number; players: readonly PositionRow[] };
export type PositionResolver = ((name: string, team?: string | null) => string | null) & {
  /** exact (normalised) full-name matches only: undefined = no such player, null = two players share the name */
  exact?: (name: string) => string | null | undefined;
};

type Entry = { team: string | null; pos: string | null };

export function positionResolver(rows: readonly PositionRow[]): PositionResolver {
  const exact = new Map<string, Entry[]>();
  const loose = new Map<string, Entry[]>();
  const add = (m: Map<string, Entry[]>, k: string, e: Entry) => {
    const list = m.get(k);
    if (list) list.push(e);
    else m.set(k, [e]);
  };
  for (const [name, team, pos] of rows) {
    if (typeof name !== "string") continue;
    const e: Entry = { team: team ?? null, pos: pos ?? null };
    const key = normalizeName(name);
    add(exact, key, e);
    const parts = key.split(" ");
    if (parts.length >= 2) add(loose, `${parts[parts.length - 1]}|${parts[0][0]}`, e);
  }
  const resolve: PositionResolver = (name, team) => {
    const key = normalizeName(name);
    if (!key) return null;
    const abbr = canonicalAbbr(team);
    const byTeam = (list: readonly Entry[]) => (abbr ? list.filter((e) => e.team === abbr) : []);
    const hit = exact.get(key);
    if (hit?.length === 1) return hit[0].pos;
    if (hit && hit.length > 1) {
      const t = byTeam(hit);
      return t.length === 1 ? t[0].pos : null;
    }
    const parts = key.split(" ");
    if (parts.length < 2) return null;
    const near = loose.get(`${parts[parts.length - 1]}|${parts[0][0]}`) ?? [];
    if (near.length === 1) return near[0].pos;
    if (near.length > 1) {
      const t = byTeam(near);
      if (t.length === 1) return t[0].pos;
    }
    return null;
  };
  resolve.exact = (name) => {
    const hit = exact.get(normalizeName(name));
    return !hit ? undefined : hit.length === 1 ? hit[0].pos : null;
  };
  return resolve;
}

/**
 * The tag a pick shows. MLB's only two-way player is indexed "TWP"; on a pick he is either pitching or hitting, so a
 * pitcher market reads "P" and a hitter's market "DH" (the only way he hits). With no market to say which, he stays
 * "TWP". Every other position is MLB's own, as is.
 */
export function mlbPickPosition(pos: string | null | undefined, market?: string | null): string | null {
  if (!pos) return null;
  if (pos === "TWP" && market) return market.startsWith("pitcher_") ? "P" : "DH";
  return pos;
}

/**
 * A free-text pick that STARTS with the player's name and carries no team — the engine's trap / pass lines, "Aaron
 * Judge Hits O 1.5 (-150)". The longest 2–4-word lead that is exactly one indexed player's full name is the name;
 * nothing looser (no initials, no partial match) and a name two players share gives no position.
 */
export function mlbLeadingName(resolve: PositionResolver | null | undefined, text: string): { name: string; pos: string | null; rest: string } | null {
  if (!resolve?.exact) return null;
  const words = text.trim().split(/\s+/);
  for (let k = Math.min(4, words.length - 1); k >= 2; k--) {
    const name = words.slice(0, k).join(" ");
    const pos = resolve.exact(name);
    if (pos !== undefined) return { name, pos, rest: words.slice(k).join(" ") };
  }
  return null;
}

/** a pick that only knows its printed label: "Aaron Judge (NYY)" → his tag, the printed team breaking any tie */
export function mlbLabelPosition(resolve: PositionResolver | null | undefined, label: string | null | undefined, market?: string | null): string | null {
  if (!resolve || !label) return null;
  if (market != null && !/^(batter|pitcher)_/.test(market)) return null;
  const parsed = parseBoardLabel(label);
  return mlbPickPosition(resolve(parsed?.name ?? label, parsed?.team ?? null), market);
}
