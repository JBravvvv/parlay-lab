import { NextResponse } from "next/server";
import { parseConsensus, SPLITS_SOURCE_URL, type SplitsFeed, type SplitsLeague } from "@/lib/splits";

/**
 * GET /api/splits?league=nfl|mlb|ncaaf — bet % and money % per side, parsed from
 * scoresandodds.com's public consensus page (see src/lib/splits.ts for the source note).
 * Cached ten minutes at the edge and in Next's fetch cache; a failed fetch or an unparsable page
 * returns an EMPTY feed with `error` set (HTTP 200) so every surface simply shows no split.
 * Free and keyless — never the Odds API.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_SEC = 600;
const LEAGUES: readonly SplitsLeague[] = ["nfl", "mlb", "ncaaf"];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = (url.searchParams.get("league") ?? "").toLowerCase();
  const league = (raw === "cfb" ? "ncaaf" : raw) as SplitsLeague;
  if (!LEAGUES.includes(league)) return NextResponse.json({ error: "league must be nfl, mlb or ncaaf" }, { status: 400 });
  const fetchedAt = new Date().toISOString();
  const base: SplitsFeed = { league, source: "scoresandodds", fetchedAt, games: [] };
  try {
    const res = await fetch(SPLITS_SOURCE_URL(league), {
      headers: { "user-agent": "Mozilla/5.0 (Macintosh) ParlayLab/1.0", accept: "text/html" },
      next: { revalidate: TTL_SEC },
    });
    if (!res.ok) return NextResponse.json({ ...base, error: `source ${res.status}` }, { headers: cache(60) });
    const html = await res.text();
    const games = parseConsensus(html, league);
    return NextResponse.json({ ...base, games, ...(games.length ? {} : { error: "no consensus cards parsed" }) }, { headers: cache(games.length ? TTL_SEC : 60) });
  } catch (e) {
    return NextResponse.json({ ...base, error: e instanceof Error ? e.message : String(e) }, { headers: cache(60) });
  }
}

function cache(sec: number): HeadersInit {
  return { "cache-control": `public, s-maxage=${sec}, stale-while-revalidate=${sec * 3}` };
}
