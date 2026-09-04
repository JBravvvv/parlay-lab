import { NextRequest, NextResponse } from "next/server";
import { shapeBoxscore, type ApiBoxscore, type ApiLinescore, type ApiScheduleGame } from "@/lib/boxscore";

/**
 * BOX SCORE feed (2026-09-03, Josh: "You should also be able to click on any
 * game to see the box score"). One gamePk → the shaped box: header, linescore,
 * decisions, both batting boxes with the feed's notes, pitchers, game info.
 *
 * Public and unauthenticated — three reads of MLB's public Stats API, nothing
 * else. Every figure is the feed's own; the shaper never invents one.
 */

export const dynamic = "force-dynamic";
const API = "https://statsapi.mlb.com/api/v1";

async function getJson<T>(url: string, revalidate: number): Promise<T | null> {
  const r = await fetch(url, { next: { revalidate } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${url.split("/api/v1")[1]} ${r.status}`);
  return (await r.json()) as T;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ gamePk: string }> }) {
  const { gamePk } = await ctx.params;
  if (!/^\d{5,8}$/.test(gamePk)) return NextResponse.json({ error: "bad gamePk" }, { status: 400 });
  try {
    const [box, ls, sched] = await Promise.all([
      getJson<ApiBoxscore>(`${API}/game/${gamePk}/boxscore`, 15),
      getJson<ApiLinescore>(`${API}/game/${gamePk}/linescore`, 15),
      getJson<{ dates?: { games?: ApiScheduleGame[] }[] }>(
        `${API}/schedule?sportId=1&gamePk=${gamePk}&hydrate=team,linescore,decisions,probablePitcher`,
        15,
      ),
    ]);
    const game = sched?.dates?.flatMap((d) => d.games ?? []).find((g) => String(g.gamePk) === gamePk);
    if (!game || !box?.teams) return NextResponse.json({ error: "game not found" }, { status: 404 });
    return NextResponse.json(shapeBoxscore(game, box, ls), {
      headers: { "cache-control": "public, max-age=15, stale-while-revalidate=30" },
    });
  } catch (e) {
    return NextResponse.json({ error: `box score unavailable: ${(e as Error).message}` }, { status: 502 });
  }
}
