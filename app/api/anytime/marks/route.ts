import { NextRequest, NextResponse } from "next/server";
import { MARKS_TTL, handleMarks } from "@/lib/server/anytime-marks";

/**
 * GET /api/anytime/marks?sport=nfl&dates=2026-11-15,2026-11-16
 *
 * The team logos for the any-time engine's picks on those game days, from ESPN's free scoreboard.
 * Public and read-only: it holds no pick, no price and no secret, spends no Odds API credit and
 * reads nothing from the store.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const out = await handleMarks(q.get("sport"), q.get("dates"));
  return NextResponse.json(out.body, { status: out.status, headers: { "cache-control": out.status === 200 ? `public, max-age=${MARKS_TTL}` : "no-store" } });
}
