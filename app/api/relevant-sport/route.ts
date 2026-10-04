import { NextResponse } from "next/server";
import { pacificDate, relevantSport, weekdayFor, type SportSchedule } from "@/lib/relevant-sport";
export const dynamic = "force-dynamic";
async function read(url: string) {
  try { const response = await fetch(url, { next: { revalidate: 300 }, signal: AbortSignal.timeout(3500) });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}
export async function GET() {
  const date = pacificDate();
  if ([0, 6].includes(weekdayFor(date))) return NextResponse.json({ date, sport: relevantSport(date), source: "weekly-priority" });
  const [nfl, cfb, mlb] = await Promise.all([
    read(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${date.replaceAll("-", "")}`),
    read(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=${date.replaceAll("-", "")}&groups=80&limit=200`),
    read(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`),
  ]);
  const events = (data: { events?: { status?: { type?: { name?: string } } }[] } | null) => Array.isArray(data?.events) ? data.events.filter(e => !/POSTPONED|CANCELED/.test(e.status?.type?.name ?? "")).length : null;
  const baseball = Array.isArray(mlb?.dates) ? mlb.dates.flatMap((d: { games?: { gameType?: string; status?: { detailedState?: string } }[] }) => d.games ?? []).filter((g: { status?: { detailedState?: string } }) => !/Postponed|Cancelled/.test(g.status?.detailedState ?? "")) : null;
  const games: SportSchedule = { nfl: events(nfl), cfb: events(cfb), mlb: baseball?.length ?? null,
    mlbPlayoffs: baseball?.filter((g: { gameType?: string }) => ["F", "D", "L", "W"].includes(g.gameType ?? "")).length ?? null };
  return NextResponse.json({ date, sport: relevantSport(date, games), games, source: "schedule" });
}
