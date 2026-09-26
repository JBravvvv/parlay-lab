import { NextRequest, NextResponse } from "next/server";
import { shapeMlbPlays } from "@/lib/mlb-play-by-play";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ gamePk: string }> }) {
  const { gamePk } = await ctx.params;
  if (!/^\d{5,8}$/.test(gamePk)) return NextResponse.json({ error: "bad gamePk" }, { status: 400 });
  try {
    const response = await fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/playByPlay`, {
      next: { revalidate: 15 },
      signal: AbortSignal.timeout(12_000),
    });
    if (response.status === 404) return NextResponse.json({ error: "game not found" }, { status: 404 });
    if (!response.ok) throw new Error(`MLB feed returned ${response.status}`);
    const payload = shapeMlbPlays(Number(gamePk), await response.json(), new Date().toISOString());
    return NextResponse.json(payload, { headers: { "cache-control": "public, max-age=15, stale-while-revalidate=15" } });
  } catch (error) {
    return NextResponse.json({ error: `Play-by-play unavailable: ${(error as Error).message}` }, { status: 502 });
  }
}
