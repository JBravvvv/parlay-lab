import { NextRequest, NextResponse } from "next/server";
import { rosterPositions, type PositionFeed } from "@/lib/football/positions";
export const maxDuration = 60;

/** Keyless roster metadata only. Fixed ESPN host, bounded teams/concurrency, one-hour cache. */
export async function GET(req: NextRequest) {
  const league = req.nextUrl.searchParams.get("league");
  const sport = league === "nfl" ? "nfl" : league === "cfb" ? "college-football" : null;
  const teams = [...new Set((req.nextUrl.searchParams.get("teams") ?? "").split(","))].sort();
  if (!sport || teams.length > 32 || teams.some((id) => !/^\d{1,6}$/.test(id))) {
    return NextResponse.json({ error: "Choose a football league and 1–32 team IDs." }, { status: 400 });
  }
  const body: PositionFeed = { players: [], missingTeams: [] };
  for (let i = 0; i < teams.length; i += 4) {
    await Promise.all(teams.slice(i, i + 4).map(async (id) => {
      try {
        const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/${sport}/teams/${id}/roster`,
          { next: { revalidate: 3600 }, signal: AbortSignal.timeout(5000) });
        const players = r.ok ? rosterPositions(await r.json(), id) : [];
        if (players.length) body.players.push(...players);
        else body.missingTeams.push(id);
      } catch { body.missingTeams.push(id); }
    }));
  }
  body.players.sort((a, b) => a.teamId.localeCompare(b.teamId) || a.athleteId.localeCompare(b.athleteId));
  body.missingTeams.sort();
  return NextResponse.json(body, { headers: { "Cache-Control": body.missingTeams.length ? "no-store" : "public, s-maxage=3600, stale-while-revalidate=300" } });
}
