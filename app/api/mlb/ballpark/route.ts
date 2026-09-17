import { NextRequest, NextResponse } from "next/server";
import { ptToday } from "@/lib/server/pt-date";
import { buildParkCards, type BallparkPayload, type PriorsParks, type SchedGameLite } from "@/lib/mlb/ballpark";

/**
 * BALLPARK FACTOR feed (INSTRUCTION 68, 2026-09-17, Josh: "a tab titled 'Ballpark Factor' that
 * shows daily ballpark factor for every stadium that is being used in the engine to calculate
 * bets"). Every stadium, today's Pacific date: the MLB schedule (free statsapi, hydrated with
 * weather / venue / probables — the same call the engine's own slate makes) joined to the
 * Savant season park index the engine reads (`/model/priors.json`, the artifact the nightly
 * model.yml rewrites) through the ONE model in src/lib/mlb/ballpark.ts. Nothing here is a
 * second opinion: the multipliers on the tab are the multipliers the engine puts on the rows.
 *
 * Public and unauthenticated — weather, park names and season indices; no stakes, no ledger.
 * Nothing is fabricated: a game whose weather is not posted yet says so and shows the season
 * index alone; a park missing from the priors shows "—" for its index.
 */
export const dynamic = "force-dynamic";
const API = "https://statsapi.mlb.com/api/v1";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function selfBase(): string {
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return prod ? `https://${prod}` : "https://parlay-lab-six.vercel.app";
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("date");
  const date = q && DATE_RE.test(q) ? q : ptToday();
  let games: SchedGameLite[] = [];
  let scheduleOk = true;
  try {
    const r = await fetch(`${API}/schedule?sportId=1&date=${date}&hydrate=weather,venue,probablePitcher,team`, { next: { revalidate: 300 } });
    if (!r.ok) throw new Error(`schedule ${r.status}`);
    const j = (await r.json()) as { dates?: { games?: SchedGameLite[] }[] };
    games = j.dates?.[0]?.games ?? [];
  } catch {
    scheduleOk = false;
  }
  let parks: PriorsParks = null;
  let priorsAt: string | null = null;
  let priorsSeason: number | null = null;
  try {
    const r = await fetch(`${selfBase()}/model/priors.json`, { next: { revalidate: 3600 } });
    if (r.ok) {
      const p = (await r.json()) as { generated_at?: string; season?: number; parks?: PriorsParks };
      parks = p.parks ?? null;
      priorsAt = p.generated_at ?? null;
      priorsSeason = p.season ?? null;
    }
  } catch {
    parks = null;
  }
  const body: BallparkPayload = {
    date,
    generatedAt: new Date().toISOString(),
    priorsAt,
    priorsSeason,
    scheduleOk,
    games: games.length,
    cards: buildParkCards(games, parks),
  };
  return NextResponse.json(body, { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
