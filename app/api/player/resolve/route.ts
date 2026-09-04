import { NextRequest, NextResponse } from "next/server";
import { buildIndex, resolvePlayer, type IndexEntry } from "@/lib/player-card";

/**
 * Name → MLB id (2026-09-03). Most click sites only print a name (and maybe a
 * team abbreviation); this maps it onto the season's player index:
 *   ?name=Ronald%20Acu%C3%B1a%20Jr.&team=ATL → { id, fullName, team, position }
 * 404 when nothing matches unambiguously — a miss beats a wrong player.
 * The index (~1.4k active players) is fetched once a day and kept in memory.
 */
const API = "https://statsapi.mlb.com/api/v1";
const SEASON = 2026;
const INDEX_TTL = 86400;

let indexCache: { at: number; entries: IndexEntry[] } | null = null;

async function loadIndex(): Promise<IndexEntry[]> {
  if (indexCache && Date.now() - indexCache.at < INDEX_TTL * 1000) return indexCache.entries;
  const r = await fetch(
    `${API}/sports/1/players?season=${SEASON}&fields=people,id,fullName,currentTeam,id,primaryPosition,abbreviation`,
    { next: { revalidate: INDEX_TTL }, headers: { accept: "application/json" } },
  );
  if (!r.ok) throw new Error(`MLB ${r.status} on players index`);
  const entries = buildIndex((await r.json()) as never);
  if (entries.length) indexCache = { at: Date.now(), entries };
  return entries;
}

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
