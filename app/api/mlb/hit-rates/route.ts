import { NextRequest, NextResponse } from "next/server";
import { resolvePlayer } from "@/lib/player-card";
import { loadPlayerIndex, MLB_API, MLB_SEASON } from "@/lib/mlb/player-index";
import { hitKey, type BatGame, type PitGame, type PlayerLog } from "@/lib/prop-hit-rate";

/**
 * PROP HIT-RATE GAME LOGS (2026-09-18). POST { players: [{ name, team? }] } → the season game log
 * of every player the board names, as compact per-game tuples the client folds into "cleared the
 * line in N of the last M games" (src/lib/prop-hit-rate.ts) for any market, line, side and window.
 *
 * FREE MLB statsapi only — one `people?personIds=…&hydrate=stats(gameLog)` call per 40 ids, with
 * `fields=` trimming the answer to the eight stats the props settle on. Never the Odds API, never a
 * credit. Per-id in-memory cache, 10 minutes, so a board's second open costs nothing upstream.
 *
 * The answer is keyed by the CLIENT'S spelling of the name (hitKey), so a board row finds its own
 * log without a second resolve. A name the index cannot match unambiguously is simply absent — a
 * miss beats a wrong player's numbers.
 */
const LOG_TTL_MS = 10 * 60 * 1000;
const CHUNK = 40;
const MAX_PLAYERS = 400;
const MAX_GAMES = 120;

type Split = { date?: string; stat?: Record<string, unknown> };
type Person = { id: number; primaryPosition?: { abbreviation?: string }; stats?: { group?: { displayName?: string }; splits?: Split[] }[] };

const logCache = new Map<number, { at: number; log: PlayerLog }>();
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function shape(p: Person): PlayerLog {
  let bat: BatGame[] = [];
  let pit: PitGame[] = [];
  for (const s of p.stats ?? []) {
    const splits = (s.splits ?? []).slice().sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    if (s.group?.displayName === "hitting") {
      bat = splits.slice(0, MAX_GAMES).map((x) => {
        const t = x.stat ?? {};
        return [num(t.hits), num(t.runs), num(t.rbi), num(t.homeRuns), num(t.totalBases), num(t.atBats)] as const;
      });
    } else if (s.group?.displayName === "pitching") {
      pit = splits.slice(0, MAX_GAMES).map((x) => {
        const t = x.stat ?? {};
        return [num(t.strikeOuts), num(t.outs), num(t.gamesStarted)] as const;
      });
    }
  }
  return { id: p.id, pos: p.primaryPosition?.abbreviation ?? null, bat, pit };
}

async function fetchLogs(ids: number[]): Promise<Map<number, PlayerLog>> {
  const out = new Map<number, PlayerLog>();
  const now = Date.now();
  const need: number[] = [];
  for (const id of ids) {
    const c = logCache.get(id);
    if (c && now - c.at < LOG_TTL_MS) out.set(id, c.log);
    else need.push(id);
  }
  for (let i = 0; i < need.length; i += CHUNK) {
    const chunk = need.slice(i, i + CHUNK);
    const url =
      `${MLB_API}/people?personIds=${chunk.join(",")}` +
      `&hydrate=stats(group=[hitting,pitching],type=[gameLog],season=${MLB_SEASON})` +
      `&fields=people,id,primaryPosition,abbreviation,stats,group,displayName,splits,date,stat,hits,runs,rbi,homeRuns,totalBases,atBats,strikeOuts,outs,gamesStarted`;
    const r = await fetch(url, { next: { revalidate: 600 }, headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`MLB ${r.status} on game logs`);
    const doc = (await r.json()) as { people?: Person[] };
    for (const p of doc.people ?? []) {
      const log = shape(p);
      logCache.set(p.id, { at: now, log });
      out.set(p.id, log);
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  let body: { players?: { name?: unknown; team?: unknown }[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "json body required" }, { status: 400 });
  }
  const asked = (body.players ?? [])
    .filter((p) => typeof p?.name === "string" && (p.name as string).trim().length >= 2)
    .slice(0, MAX_PLAYERS)
    .map((p) => ({ name: (p.name as string).trim(), team: typeof p.team === "string" ? p.team : null }));
  if (!asked.length) return NextResponse.json({ season: MLB_SEASON, players: {} });
  try {
    const index = await loadPlayerIndex();
    const idFor = new Map<string, number>();
    for (const p of asked) {
      const key = hitKey(p.name);
      if (idFor.has(key)) continue;
      const hit = resolvePlayer(index, p.name, p.team);
      if (hit) idFor.set(key, hit.id);
    }
    const logs = await fetchLogs([...new Set(idFor.values())]);
    const players: Record<string, PlayerLog> = {};
    for (const [key, id] of idFor) {
      const log = logs.get(id);
      if (log) players[key] = log;
    }
    return NextResponse.json({ season: MLB_SEASON, players }, { headers: { "cache-control": "public, max-age=300" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upstream failure";
    return NextResponse.json({ error: `MLB Stats API didn't answer: ${msg}` }, { status: 502 });
  }
}
