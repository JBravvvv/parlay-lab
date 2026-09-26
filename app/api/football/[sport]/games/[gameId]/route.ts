import { NextResponse } from "next/server";
import { shapeFootballGameDetail } from "@/lib/football/game-detail";

export async function GET(_request: Request, context: { params: Promise<{ sport: string; gameId: string }> }) {
  const { sport, gameId } = await context.params;
  if ((sport !== "nfl" && sport !== "cfb") || !/^\d{5,12}$/.test(gameId)) {
    return NextResponse.json({ error: "Invalid football game." }, { status: 400 });
  }
  const league = sport === "nfl" ? "nfl" : "college-football";
  try {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/${league}/summary?event=${gameId}`, {
      next: { revalidate: 15 }, signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 404) return NextResponse.json({ error: "Game coverage is not available from ESPN." }, { status: 404 });
    if (!response.ok) throw new Error("ESPN game feed unavailable");
    const payload = shapeFootballGameDetail(await response.json(), sport, gameId, new Date().toISOString());
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Football game coverage is unavailable right now. Try again shortly." }, { status: 502 });
  }
}
