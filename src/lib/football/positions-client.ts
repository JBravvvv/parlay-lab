import type { League } from "./league";
import type { PositionFeed } from "./positions";

/** Cover large CFB slates with bounded requests; never truncate the eligible teams. */
export async function loadPositionFeed(league: League, teamIds: readonly string[], signal?: AbortSignal, request: typeof fetch = fetch): Promise<PositionFeed> {
  const teams = [...new Set(teamIds)].sort();
  const body: PositionFeed = { players: [], missingTeams: [] };
  // At most two 32-team requests in flight; each server request fetches four rosters at a time.
  for (let i = 0; i < teams.length; i += 64) {
    const chunks = [teams.slice(i, i + 32), teams.slice(i + 32, i + 64)].filter((c) => c.length);
    const pages = await Promise.all(chunks.map(async (chunk): Promise<PositionFeed> => {
      try {
        const r = await request(`/api/football/positions?league=${league}&teams=${encodeURIComponent(chunk.join(","))}`, { signal });
        if (!r.ok) return { players: [], missingTeams: chunk };
        return await r.json();
      } catch (error) {
        if (signal?.aborted) throw error;
        return { players: [], missingTeams: chunk };
      }
    }));
    for (const page of pages) { body.players.push(...page.players); body.missingTeams.push(...page.missingTeams); }
  }
  return body;
}
