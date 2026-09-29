import { NextResponse } from "next/server";
import { loadPlayerIndex, MLB_SEASON } from "@/lib/mlb/player-index";
import type { PositionDoc } from "@/lib/mlb/positions";

/**
 * GET /api/mlb/positions (2026-09-28) — every MLB player's primary position, for the position tag on each pick.
 * The same daily player index the resolve and hit-rate routes read (free statsapi, never the Odds API), cut to
 * [name, team, position] rows (~1,500 players, a few kilobytes gzipped) and cached at the edge, so a phone fetches
 * it once and matches names itself. Read-only, keyless, no parameters.
 */
export async function GET() {
  try {
    const index = await loadPlayerIndex();
    const body: PositionDoc = { season: MLB_SEASON, players: index.map((e) => [e.fullName, e.team, e.pos] as const) };
    return NextResponse.json(body, {
      headers: { "Cache-Control": index.length ? "public, s-maxage=21600, stale-while-revalidate=86400" : "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upstream failure";
    return NextResponse.json({ error: `MLB Stats API didn't answer: ${msg}` }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
