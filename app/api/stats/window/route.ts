import { NextRequest, NextResponse } from "next/server";
import {
  WINDOW_GAMES, isWindowGroup, shapeWindow, startsOnlyIds,
  type LeagueDoc, type PeopleDoc, type WindowGroup,
} from "@/lib/stats-window";

/**
 * Stats tab GAME windows (INSTRUCTIONS 35–36, 2026-09-04) — read-only over
 * statsapi.mlb.com, no keys:
 *   ?group=hitting|pitching&n=<one of WINDOW_GAMES[group]>[&season=2026]
 * → the league-shaped `{stats:[{splits:[…]}]}` the Stats table already parses,
 *   where each player's line is his own last N games (hitters: games he played
 *   in; SP: last N starts; RP: last N appearances). See src/lib/stats-window.ts
 *   for why this can't be one league call.
 *
 * Three upstream shapes: the season list (every id, team, position, season GS),
 * the people hydrate carrying each id's lastXGames(limit=N), and — only for the
 * starters whose window holds a relief outing — the same hydrate with gameLog.
 * One people call takes every id in the league (845 pitchers → ~3 MB upstream,
 * 1.2 s observed 2026-09-05); chunked at 400 anyway so a URL never nears 8 KB.
 */
const API = "https://statsapi.mlb.com/api/v1";
const TTL = 180;
const CHUNK = 400;

async function mlb(path: string): Promise<unknown> {
  const r = await fetch(`${API}${path}`, { next: { revalidate: TTL }, headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`MLB ${r.status} on ${path.slice(0, 80)}`);
  return r.json();
}

function chunks<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/** `stat` is the type clause of the hydrate: "type=[lastXGames],limit=5" or "type=[gameLog]". */
async function people(ids: number[], group: WindowGroup, season: number, stat: string): Promise<PeopleDoc> {
  const docs = await Promise.all(
    chunks(ids, CHUNK).map((c) =>
      mlb(`/people?personIds=${c.join(",")}&hydrate=stats(group=[${group}],${stat},season=${season})`) as Promise<PeopleDoc>,
    ),
  );
  return { people: docs.flatMap((d) => d.people ?? []) };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const group = sp.get("group");
  if (!isWindowGroup(group)) return NextResponse.json({ error: "group must be hitting or pitching" }, { status: 400 });
  const n = Number(sp.get("n"));
  if (!WINDOW_GAMES[group].includes(n)) {
    return NextResponse.json({ error: `n must be one of ${WINDOW_GAMES[group].join(", ")}` }, { status: 400 });
  }
  const season = Number(sp.get("season") ?? 2026);
  if (!Number.isInteger(season) || season < 2015 || season > 2030) return NextResponse.json({ error: "bad season" }, { status: 400 });

  try {
    const seasonDoc = (await mlb(
      `/stats?stats=season&group=${group}&season=${season}&sportId=1&playerPool=All&limit=2500`,
    )) as LeagueDoc;
    const ids = (seasonDoc.stats?.[0]?.splits ?? []).map((s) => s.player?.id).filter((x): x is number => !!x);
    if (ids.length === 0) return NextResponse.json({ stats: [{ splits: [] }], window: { group, n, players: 0, startsOnly: 0 } });

    const peopleDoc = await people(ids, group, season, `type=[lastXGames],limit=${n}`);
    const needLog = startsOnlyIds(group, seasonDoc, peopleDoc);
    const gameLogDoc = needLog.length ? await people(needLog, group, season, "type=[gameLog]") : null;

    const doc = shapeWindow({ group, n, seasonDoc, peopleDoc, gameLogDoc });
    return NextResponse.json(doc, { headers: { "cache-control": `public, s-maxage=${TTL}, stale-while-revalidate=60` } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upstream failure";
    return NextResponse.json({ error: `MLB Stats API didn't answer: ${msg}` }, { status: 502 });
  }
}
