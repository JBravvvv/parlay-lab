import { NextRequest, NextResponse } from "next/server";
import { mapStatus } from "@/lib/games";
import { shapeBoxscore, type ApiBoxscore, type ApiLinescore, type ApiScheduleGame, type ApiVsPlayer, type ApiVsPlayerPair } from "@/lib/boxscore";

/**
 * BOX SCORE feed (2026-09-03, Josh: "You should also be able to click on any
 * game to see the box score"). One gamePk → the shaped box: header, linescore,
 * decisions, both batting boxes with the feed's notes, pitchers, game info.
 *
 * GAME PREVIEW (INSTRUCTION 46, 2026-09-08, Josh: "'Preview' should be named
 * 'Game Preview' … it should also have batter vs pitcher matchup data on that
 * page"): for an UPCOMING game only, two more reads — each probable pitcher's
 * vsPlayer splits against the opposing club — fetched in parallel after the
 * schedule names the probables. Live and final games skip them: the box page
 * polls every 30 s while live and the matchup table is a pregame surface.
 *
 * Public and unauthenticated — three (pregame: up to five) reads of MLB's public
 * Stats API, nothing else, no paid API. Every figure is the feed's own; the
 * shaper never invents one.
 */

export const dynamic = "force-dynamic";
const API = "https://statsapi.mlb.com/api/v1";
/** career batter-vs-pitcher lines move once a game at most — an hour of cache is honest */
const VS_REVALIDATE = 3600;

async function getJson<T>(url: string, revalidate: number): Promise<T | null> {
  const r = await fetch(url, { next: { revalidate } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${url.split("/api/v1")[1]} ${r.status}`);
  return (await r.json()) as T;
}

/** the vsPlayer feed for one BATTING side: the other club's probable vs this club; null when there is no probable or the read fails */
async function vsFeed(game: ApiScheduleGame, side: "away" | "home"): Promise<ApiVsPlayer | null> {
  const pitcher = game.teams[side === "away" ? "home" : "away"].probablePitcher;
  const teamId = game.teams[side].team.id;
  if (!pitcher?.id || !teamId) return null;
  try {
    return await getJson<ApiVsPlayer>(`${API}/people/${pitcher.id}/stats?stats=vsPlayer&group=pitching&opposingTeamId=${teamId}`, VS_REVALIDATE);
  } catch {
    // a failed matchup read must not take the whole preview down — the section is simply absent for that side
    return null;
  }
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
    // GAME PREVIEW: the matchup feeds need the probables, so they follow the schedule read — both sides in parallel
    let vs: ApiVsPlayerPair | null = null;
    if (mapStatus(game.status) === "upcoming") {
      const [away, home] = await Promise.all([vsFeed(game, "away"), vsFeed(game, "home")]);
      vs = { away, home };
    }
    return NextResponse.json(shapeBoxscore(game, box, ls, vs), {
      headers: { "cache-control": "public, max-age=15, stale-while-revalidate=30" },
    });
  } catch (e) {
    return NextResponse.json({ error: `box score unavailable: ${(e as Error).message}` }, { status: 502 });
  }
}
