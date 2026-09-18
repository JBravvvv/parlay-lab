/**
 * The season's player index (name → MLB id), fetched once a day and kept in memory. It used to be
 * private to app/api/player/resolve/route.ts; the hit-rate route (2026-09-18) needs the same
 * index to turn a board's names into ids, so it lives here and both routes call it. Free MLB
 * statsapi — never the Odds API.
 */
import { buildIndex, type IndexEntry } from "@/lib/player-card";

export const MLB_API = "https://statsapi.mlb.com/api/v1";
export const MLB_SEASON = 2026;
const INDEX_TTL = 86400;

let indexCache: { at: number; entries: IndexEntry[] } | null = null;

export async function loadPlayerIndex(): Promise<IndexEntry[]> {
  if (indexCache && Date.now() - indexCache.at < INDEX_TTL * 1000) return indexCache.entries;
  const r = await fetch(
    `${MLB_API}/sports/1/players?season=${MLB_SEASON}&fields=people,id,fullName,currentTeam,id,primaryPosition,abbreviation`,
    { next: { revalidate: INDEX_TTL }, headers: { accept: "application/json" } },
  );
  if (!r.ok) throw new Error(`MLB ${r.status} on players index`);
  const entries = buildIndex((await r.json()) as never);
  if (entries.length) indexCache = { at: Date.now(), entries };
  return entries;
}
