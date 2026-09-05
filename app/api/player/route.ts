import { NextRequest, NextResponse } from "next/server";
import { ptToday } from "@/lib/server/pt-date";
import { isIntId, isPitcherPos, shapeCard, type PersonDoc } from "@/lib/player-card";

/**
 * Player profile card (2026-09-03). Read-only proxy over statsapi.mlb.com:
 *   ?id=<mlbId>[&group=hitting|pitching]
 * → person (team, position, roster status), season line and the full season
 * game log — the game windows (hitters last 7/15/30 games played, SP last
 * 3/5/10 starts, RP last 3/5/10 appearances; INSTRUCTION 37) are cut from the
 * log by src/lib/player-card.ts. Public route: nothing but MLB's numbers.
 */
const API = "https://statsapi.mlb.com/api/v1";
const TTL = 300;
const SEASON = 2026;

class UpstreamError extends Error {
  constructor(public status: number, path: string) {
    super(`MLB ${status} on ${path}`);
  }
}

async function mlb(path: string): Promise<unknown> {
  const r = await fetch(`${API}${path}`, { next: { revalidate: TTL }, headers: { accept: "application/json" } });
  if (!r.ok) throw new UpstreamError(r.status, path);
  return r.json();
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const id = sp.get("id");
  if (!isIntId(id)) return NextResponse.json({ error: "id must be an integer MLB id" }, { status: 400 });
  const pid = Number(id);
  try {
    let person: PersonDoc;
    try {
      person = (await mlb(`/people/${pid}?hydrate=currentTeam,rosterEntries`)) as PersonDoc;
    } catch (e) {
      // an id MLB has never issued → honest 404 (the sheet shows "couldn't match"), not a 502
      if (e instanceof UpstreamError && e.status === 404) return NextResponse.json({ error: "unknown player id" }, { status: 404 });
      throw e;
    }
    const p = person.people?.[0];
    if (!p) return NextResponse.json({ error: "unknown player id" }, { status: 404 });

    // two-way players (Ohtani: TWP) default to hitting; ?group=pitching flips it
    const wanted = sp.get("group");
    const isPitcher = wanted === "pitching" ? true : wanted === "hitting" ? false : isPitcherPos(p.primaryPosition?.abbreviation);
    const group = isPitcher ? "pitching" : "hitting";
    const today = ptToday();
    const stats = (kind: string, extra = "") => mlb(`/people/${pid}/stats?stats=${kind}&group=${group}&season=${SEASON}${extra}`);
    const [seasonDoc, gameLog] = await Promise.all([stats("season"), stats("gameLog")]);
    const card = shapeCard({ person, isPitcher, season: SEASON, today, seasonDoc: seasonDoc as never, gameLog: gameLog as never });
    if (!card) return NextResponse.json({ error: "unknown player id" }, { status: 404 });
    return NextResponse.json({ card, today });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upstream failure";
    return NextResponse.json({ error: `MLB Stats API didn't answer: ${msg}` }, { status: 502 });
  }
}
