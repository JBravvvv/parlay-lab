import { NextRequest, NextResponse } from "next/server";
import { resolvePlayer } from "@/lib/player-card";
import { loadPlayerIndex } from "@/lib/mlb/player-index";

/**
 * Name → MLB id (2026-09-03). Most click sites only print a name (and maybe a
 * team abbreviation); this maps it onto the season's player index:
 *   ?name=Ronald%20Acu%C3%B1a%20Jr.&team=ATL → { id, fullName, team, position }
 * 404 when nothing matches unambiguously — a miss beats a wrong player.
 * The index (~1.4k active players) is fetched once a day and kept in memory.
 */
/* the index itself moved to src/lib/mlb/player-index.ts (2026-09-18) so the hit-rate route can
   share it — same fetch, same TTL, same in-memory cache */
const loadIndex = loadPlayerIndex;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const name = (sp.get("name") ?? "").trim();
  const team = sp.get("team");
  if (name.length < 2 || name.length > 80) return NextResponse.json({ error: "name required" }, { status: 400 });
  try {
    const index = await loadIndex();
    const hit = resolvePlayer(index, name, team);
    if (!hit) return NextResponse.json({ error: "no match", name, team: team ?? null }, { status: 404 });
    return NextResponse.json(hit);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upstream failure";
    return NextResponse.json({ error: `MLB Stats API didn't answer: ${msg}` }, { status: 502 });
  }
}
