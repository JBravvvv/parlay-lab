import { NextRequest, NextResponse } from "next/server";
import type { DayBlob, DayGames, ParlayPred, PredRecord } from "@/lib/predictions";
import { redis, redisGetJson, redisSetJson, syncAuthed, syncConfigMissing } from "@/lib/server/store";

/**
 * Calibration spec 3A (store): one blob per date holding every priced pick +
 * suggested parlay the engine emitted that day. Merge rules protect honesty:
 * - a graded record is frozen forever;
 * - once a pick's game has started, its pre-start statement is frozen too
 *   (a post-start regenerate can't rewrite what the engine claimed when the
 *   bet was actually playable);
 * - otherwise latest write wins (lines move all morning — the last pre-start
 *   statement is the one that gets graded).
 */

export const dynamic = "force-dynamic";

const dayKey = (d: string) => `pl:pred:${d}`;
const DAYS_SET = "pl:pred:days";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RECORDS = 800;
const MAX_PARLAYS = 300;
const MAX_BYTES = 3_000_000;

function gate(req: NextRequest): NextResponse | null {
  const missing = syncConfigMissing();
  if (missing.length) return NextResponse.json({ error: "sync-not-configured", missing }, { status: 503 });
  if (!syncAuthed(req)) return NextResponse.json({ error: "bad-sync-key" }, { status: 401 });
  return null;
}

function gameStarted(games: DayGames, gkey: string | null, now: number): boolean {
  if (!gkey) return false;
  const start = games[gkey]?.start;
  return !!start && new Date(start).getTime() <= now;
}

export async function GET(req: NextRequest) {
  const blocked = gate(req);
  if (blocked) return blocked;
  const date = req.nextUrl.searchParams.get("date");
  try {
    if (date && DATE_RE.test(date)) {
      const blob = await redisGetJson<DayBlob>(dayKey(date));
      return NextResponse.json(blob ?? { date, at: null, records: {}, parlays: {}, games: {} });
    }
    const days = ((await redis(["SMEMBERS", DAYS_SET])) as string[] | null) ?? [];
    return NextResponse.json({ days: days.sort() });
  } catch (e) {
    return NextResponse.json({ error: `store unreachable: ${(e as Error).message}` }, { status: 502 });
  }
}

export async function PUT(req: NextRequest) {
  const blocked = gate(req);
  if (blocked) return blocked;
  let body: { date?: string; records?: PredRecord[]; parlays?: ParlayPred[]; games?: DayGames };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  const date = body.date ?? "";
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  const records = Array.isArray(body.records) ? body.records.slice(0, MAX_RECORDS) : [];
  const parlays = Array.isArray(body.parlays) ? body.parlays.slice(0, MAX_PARLAYS) : [];
  const games = body.games && typeof body.games === "object" ? body.games : {};

  try {
    const now = Date.now();
    const cur =
      (await redisGetJson<DayBlob>(dayKey(date))) ??
      ({ date, at: 0, records: {}, parlays: {}, games: {} } satisfies DayBlob);
    cur.games = { ...cur.games, ...games };
    let written = 0;
    for (const r of records) {
      if (!r || typeof r.k !== "string" || !isFinite(Number(r.p))) continue;
      const prev = cur.records[r.k];
      if (prev?.res && prev.res !== "pending") continue; // graded = frozen
      if (prev && gameStarted(cur.games, prev.gkey, now)) continue; // pre-start statement = frozen
      if (gameStarted(cur.games, r.gkey, now)) continue; // never log a pick after first pitch
      cur.records[r.k] = { ...r, res: prev?.res ?? "pending" };
      written++;
    }
    for (const t of parlays) {
      if (!t || typeof t.k !== "string" || !isFinite(Number(t.prob))) continue;
      const prev = cur.parlays[t.k];
      if (prev?.res && prev.res !== "pending") continue;
      const anyStarted = (t.legs ?? []).some((l) => gameStarted(cur.games, l.gkey, now));
      if (anyStarted) continue;
      cur.parlays[t.k] = { ...t, res: prev?.res ?? "pending" };
    }
    cur.at = now;
    const json = JSON.stringify(cur);
    if (json.length > MAX_BYTES) return NextResponse.json({ error: "day blob too large" }, { status: 413 });
    await redisSetJson(dayKey(date), cur);
    await redis(["SADD", DAYS_SET, date]);
    return NextResponse.json({ ok: true, written, total: Object.keys(cur.records).length });
  } catch (e) {
    return NextResponse.json({ error: `store unreachable: ${(e as Error).message}` }, { status: 502 });
  }
}
