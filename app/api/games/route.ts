import { NextRequest, NextResponse } from "next/server";
import { BOARD_KEY, decodeBoard } from "@/lib/server/board-store";
import { redis, storeEnv } from "@/lib/server/store";
import { ptToday } from "@/lib/server/pt-date";
import { SEASON_WINDOW, clampToWindow, inSeasonWindow, pitcherIds, shapeGames, type ApiGame, type MlRow, type PitcherStatsMap } from "@/lib/games";

/**
 * GAMES TAB feed (2026-09-03). Every game of a Pacific date, MLB-app style:
 * status, records, probables with season line, moneylines from the day's engine
 * board, linescore and decisions for live/final games.
 *
 * Public and unauthenticated: the schedule is MLB's public feed and the ML rows
 * are public market prices off the board the cron already stored — no stakes,
 * no ledger, no sync phrase. Nothing is fabricated: a missing board means
 * `ml: null` (rendered "—"), a missing season line means null.
 *
 * Calendar (2026-09-03, Josh): the tab covers 2026-09-01 through the last
 * regular-season day, Sunday 2026-09-27 — `SEASON_WINDOW`. A date outside it
 * is a 400, not an empty slate, so a stale link fails loudly.
 */

export const dynamic = "force-dynamic";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const API = "https://statsapi.mlb.com/api/v1";
const SEASON_OF = (date: string) => date.slice(0, 4);

async function scheduleFor(date: string): Promise<ApiGame[]> {
  const url = `${API}/schedule?sportId=1&date=${date}&hydrate=probablePitcher(note),linescore,team,decisions,broadcasts`;
  const r = await fetch(url, { next: { revalidate: 30 } });
  if (!r.ok) throw new Error(`schedule ${r.status}`);
  const j = (await r.json()) as { dates?: { games?: ApiGame[] }[] };
  return j.dates?.[0]?.games ?? [];
}

async function pitcherLines(ids: number[], season: string): Promise<PitcherStatsMap> {
  const out: PitcherStatsMap = {};
  await Promise.all(
    ids.map(async (id) => {
      try {
        const r = await fetch(`${API}/people/${id}/stats?stats=season&group=pitching&season=${season}`, {
          next: { revalidate: 600 },
        });
        if (!r.ok) return;
        const j = (await r.json()) as {
          stats?: { splits?: { stat?: { wins?: number; losses?: number; era?: string; saves?: number } }[] }[];
        };
        const s = j.stats?.[0]?.splits?.[0]?.stat;
        if (!s) return;
        out[id] = { wins: s.wins ?? 0, losses: s.losses ?? 0, era: s.era ?? null, saves: s.saves };
      } catch {
        /* one missing line never fails the page */
      }
    }),
  );
  return out;
}

/** the day's latest board ML rows, or undefined when there is no store / no board */
async function boardMl(date: string): Promise<MlRow[] | undefined> {
  if (!storeEnv()) return undefined;
  try {
    const blob = (await redis(["GET", BOARD_KEY(date)])) as string | null;
    const board = decodeBoard(blob);
    const ml = board?.data?.categories?.ml;
    return Array.isArray(ml) ? (ml as MlRow[]) : undefined;
  } catch {
    return undefined;
  }
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || clampToWindow(ptToday());
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  if (!inSeasonWindow(date)) {
    return NextResponse.json({ error: `date outside the Games window ${SEASON_WINDOW.start}..${SEASON_WINDOW.end}` }, { status: 400 });
  }
  try {
    const [games, ml] = await Promise.all([scheduleFor(date), boardMl(date)]);
    const stats = await pitcherLines(pitcherIds(games), SEASON_OF(date));
    return NextResponse.json(shapeGames(date, games, stats, ml), {
      headers: { "cache-control": "public, max-age=30, stale-while-revalidate=60" },
    });
  } catch (e) {
    return NextResponse.json({ error: `games unavailable: ${(e as Error).message}` }, { status: 502 });
  }
}
