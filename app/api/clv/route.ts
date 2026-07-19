import { NextRequest, NextResponse } from "next/server";
import { MAX_BYTES, mergeLedgers, type SyncEntry } from "@/lib/ledger-merge";
import { cronKeyAuthed, redis, storeEnv, syncAuthed } from "@/lib/server/store";
import {
  applySights,
  marketsFor,
  matchEvent,
  pendingLegs,
  sightGameLeg,
  sightProp,
  type ClvSight,
  type OddsEvent,
} from "@/lib/server/clv-core";

/**
 * Upgrade 03 — automated closing-line capture. A CLV system that depends on
 * pressing a button before first pitch is not a system: this route sights the
 * last Caesars price + de-vigged consensus fair for every still-pregame leg
 * of today's locked card, and it only spends odds credits for games whose
 * first pitch is inside the next window (each game gets ~one sighting, right
 * where "closing" lives). Scheduled externally (cron-job.org every 30 min,
 * 09:00–20:00 PT — Vercel Hobby's two daily crons are taken) and nudged by
 * the in-app beacon whenever a synced device has the app open.
 *
 * Auth: ?key=<CRON_SECRET> or the sync phrase. Never open — it spends quota.
 * Odds calls go through our own /api/odds proxy, so they share the app's
 * 4-minute cache: a slate the board just pulled costs nothing to sight.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const K_LASTRUN = "pl:clv:lastRun";
const STORE_KEY = "pl:ledger:v1";
const WINDOW_MS = 45 * 60_000; // sight games starting within the next 45 min
const RATE_MS = 15 * 60_000;

function ptToday(): string {
  // the ledger's dates are Josh's local (Pacific) dates; the server runs UTC
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
}

function selfBase(): string {
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return prod ? `https://${prod}` : "https://parlay-lab-six.vercel.app";
}

async function viaProxy<T>(oddsUrl: string): Promise<T | null> {
  try {
    const r = await fetch(`${selfBase()}/api/odds?u=${encodeURIComponent(oddsUrl)}`, { cache: "no-store" });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

type Stored = { ledger: SyncEntry[]; at: number };

export async function GET(req: NextRequest) {
  if (!cronKeyAuthed(req) && !syncAuthed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!storeEnv()) return NextResponse.json({ error: "sync-not-configured" }, { status: 503 });
  if (!process.env.ODDS_API_KEY) return NextResponse.json({ error: "no ODDS_API_KEY" }, { status: 503 });

  try {
    const now = Date.now();
    const lastRun = Number(await redis(["GET", K_LASTRUN])) || 0;
    if (req.nextUrl.searchParams.get("force") !== "1" && now - lastRun < RATE_MS) {
      return NextResponse.json({ ok: true, skipped: "ran recently" });
    }
    await redis(["SET", K_LASTRUN, String(now)]);

    const raw = (await redis(["GET", STORE_KEY])) as string | null;
    const stored: Stored | null = raw ? (JSON.parse(raw) as Stored) : null;
    const date = ptToday();
    const entry = stored?.ledger?.find((e) => e.date === date && e.locked);
    if (!entry) return NextResponse.json({ ok: true, date, skipped: "no locked card today" });

    const byGame = pendingLegs(entry, now, WINDOW_MS);
    if (!byGame.size) return NextResponse.json({ ok: true, date, sighted: 0, skipped: "no legs inside the pre-pitch window" });

    const V4 = "https://api.the-odds-api.com/v4/sports/baseball_mlb";
    const sights: Record<string, ClvSight> = {};
    let gamesPulled = 0;

    const allLegs = [...byGame.values()].flatMap((g) => g.legs);
    const needsSlate = allLegs.some((l) => l.lkey.startsWith("ml_") || l.lkey.startsWith("rl_"));
    const needsProps = allLegs.some((l) => !(l.lkey.startsWith("ml_") || l.lkey.startsWith("rl_")));

    const slate = needsSlate
      ? await viaProxy<OddsEvent[]>(`${V4}/odds?regions=us,eu&markets=h2h,spreads&oddsFormat=american`)
      : null;
    const events = needsProps ? await viaProxy<OddsEvent[]>(`${V4}/events`) : null;

    for (const [gkey, g] of byGame) {
      const propLegs = g.legs.filter((l) => !(l.lkey.startsWith("ml_") || l.lkey.startsWith("rl_")));
      const gameLegs = g.legs.filter((l) => l.lkey.startsWith("ml_") || l.lkey.startsWith("rl_"));
      if (gameLegs.length && slate) {
        const ev = matchEvent(slate, gkey, g.start);
        if (ev) for (const l of gameLegs) {
          const s = sightGameLeg(ev, l, now);
          if (s) sights[l.lid] = s;
        }
      }
      if (propLegs.length && events) {
        const ev = matchEvent(events, gkey, g.start);
        if (ev) {
          const mkts = marketsFor(propLegs);
          const full = await viaProxy<OddsEvent>(`${V4}/events/${ev.id}/odds?regions=us&markets=${mkts.join(",")}&oddsFormat=american`);
          gamesPulled++;
          if (full) for (const l of propLegs) {
            const s = sightProp(full, l, now);
            if (s) sights[l.lid] = s;
          }
        }
      }
    }

    let updated = 0;
    if (Object.keys(sights).length) {
      const applied = applySights(entry, sights);
      updated = applied.updated;
      if (updated > 0) {
        const merged = mergeLedgers(stored?.ledger ?? [], [applied.entry]);
        const blob = JSON.stringify({ ledger: merged, at: Date.now() } satisfies Stored);
        if (blob.length <= MAX_BYTES) await redis(["SET", STORE_KEY, blob]);
      }
    }

    const totalLegs = new Set(
      [...(entry.core ?? []), ...(entry.funT ?? [])].flatMap((t) =>
        ((t as { legs?: { label?: string; prop?: string }[] }).legs ?? []).map((l) => `${l.label}|${l.prop}`),
      ),
    ).size;
    const totalSighted = Object.keys({ ...(entry.clv ?? {}), ...sights }).length;

    return NextResponse.json({
      ok: true,
      date,
      window_legs: allLegs.length,
      sighted_now: Object.keys(sights).length,
      updated,
      games_pulled: gamesPulled,
      coverage: `${totalSighted}/${totalLegs}`,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
