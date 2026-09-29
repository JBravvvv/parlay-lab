import { NextResponse } from "next/server";
import { SEASON_WINDOW } from "@/lib/games";

/** Keyless MLB schedule: round shortcuts follow the feed, including unassigned opponents. */
export async function GET() {
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${SEASON_WINDOW.start}&endDate=${SEASON_WINDOW.end}&gameTypes=F,D,L,W`, { next: { revalidate: 300 } });
    if (!res.ok) throw new Error(`MLB calendar ${res.status}`);
    const doc = await res.json();
    const labels: Record<string, string> = { F: "Wild Card", D: "Division Series", L: "Championship Series", W: "World Series" };
    const first = new Map<string, string>();
    for (const day of doc.dates ?? []) for (const game of day.games ?? []) {
      if (labels[game.gameType] && (!first.has(game.gameType) || day.date < first.get(game.gameType)!)) first.set(game.gameType, day.date);
    }
    return NextResponse.json({ rounds: Object.entries(labels).flatMap(([key, name]) => first.has(key) ? [{ name, date: first.get(key)! }] : []) }, { headers: { "cache-control": "public, max-age=300" } });
  } catch { return NextResponse.json({ error: "Postseason calendar unavailable" }, { status: 502 }); }
}
