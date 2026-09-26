import { NextRequest, NextResponse } from "next/server";
import { shapeEspnTeamProfile, shapeMlbTeamProfile, teamProfileSeason, type TeamProfileSport } from "@/lib/team-profile";

export const maxDuration = 30;
type Feed = { key: string; label: string; url: string; ttl: number };
async function read(feed: Feed): Promise<unknown> {
  const res = await fetch(feed.url, { next: { revalidate: feed.ttl }, signal: AbortSignal.timeout(9000), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${feed.label} ${res.status}`);
  return res.json();
}
export async function GET(req: NextRequest, { params }: { params: Promise<{ sport: string; teamId: string }> }) {
  const { sport: rawSport, teamId } = await params;
  if (!["nfl", "cfb", "mlb"].includes(rawSport) || !/^[1-9]\d{0,8}$/.test(teamId)) return NextResponse.json({ error: "Choose a valid sport and numeric team ID." }, { status: 400 });
  const sport = rawSport as TeamProfileSport;
  const seasonParam = req.nextUrl.searchParams.get("season"), current = teamProfileSeason(sport);
  if (seasonParam !== null && (!/^\d{4}$/.test(seasonParam) || Number(seasonParam) < 2000 || Number(seasonParam) > current + 1)) return NextResponse.json({ error: "Choose a valid season." }, { status: 400 });
  const season = seasonParam === null ? current : Number(seasonParam);
  const base = sport === "mlb" ? "https://statsapi.mlb.com/api/v1" : `https://site.api.espn.com/apis/site/v2/sports/football/${sport === "nfl" ? "nfl" : "college-football"}`;
  const feeds: Feed[] = sport === "mlb" ? [
    { key: "team", label: "Team", url: `${base}/teams/${teamId}?season=${season}`, ttl: 3600 },
    { key: "schedule", label: "Schedule", url: `${base}/schedule?sportId=1&teamId=${teamId}&season=${season}&hydrate=team`, ttl: 30 },
    { key: "roster", label: "Roster", url: `${base}/teams/${teamId}/roster?rosterType=active&season=${season}&hydrate=person`, ttl: 300 },
    { key: "stats", label: "Team statistics", url: `${base}/teams/${teamId}/stats?stats=season&group=hitting,pitching,fielding&season=${season}&sportIds=1`, ttl: 300 },
  ] : [
    { key: "team", label: "Team", url: `${base}/teams/${teamId}?season=${season}`, ttl: 300 },
    ...[1, 2, 3].map(type => ({ key: `schedule${type}`, label: `${["Preseason", "Regular-season", "Postseason"][type - 1]} schedule`, url: `${base}/teams/${teamId}/schedule?season=${season}&seasontype=${type}`, ttl: 30 })),
    { key: "roster", label: "Roster", url: `${base}/teams/${teamId}/roster?season=${season}`, ttl: 300 },
    { key: "stats", label: "Team statistics", url: `${base}/teams/${teamId}/statistics?season=${season}&seasontype=2`, ttl: 300 },
  ];
  const settled = await Promise.allSettled(feeds.map(read)), data: Record<string, unknown> = {}, notices: string[] = [];
  settled.forEach((result, i) => { if (result.status === "fulfilled") data[feeds[i].key] = result.value; else notices.push(`${feeds[i].label} is temporarily unavailable.`); });
  if (!data.team) return NextResponse.json({ error: "The team feed is unavailable. Please try again." }, { status: 502 });
  const profile = sport === "mlb"
    ? shapeMlbTeamProfile({ teamId, season, team: data.team, schedule: data.schedule, roster: data.roster, stats: data.stats, notices })
    : shapeEspnTeamProfile({ sport, teamId, season, team: data.team, schedules: [data.schedule1, data.schedule2, data.schedule3], roster: data.roster, stats: data.stats, notices });
  if (!profile) return NextResponse.json({ error: "That team could not be found." }, { status: 404 });
  return NextResponse.json(profile, { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=15" } });
}
