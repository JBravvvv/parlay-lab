import { NextRequest, NextResponse } from "next/server";
import { cronHeaderAuthed, redis, redisGetJson, redisSetJson, storeEnv } from "@/lib/server/store";
import { ptToday } from "@/lib/server/pt-date";

/**
 * WEEKEND CLOSE CAPTURE — the cheap route, and it reimplements nothing.
 *
 * THE PROBLEM. GitHub Actions on this account fires in two batches, ~06:00-08:30Z and
 * ~20:00-21:00Z. Weekend close windows open 16:00-18:35Z, between them, and the wait from the
 * morning batch (7.5-10 h) exceeds the 360-minute hosted-job ceiling. **Weekend closes are
 * unreachable from Actions** — a derived bound, not one observation. Wednesday and Thursday
 * matinees are lost the same way: measured against 52 days, a single 20:30Z fire reaches only
 * 64% of games (Mon/Tue/Fri 96-99%, Wed 65%, Thu 56%, Sat 49%, Sun 7%).
 *
 * WHY THIS ROUTE INSTEAD OF A repository_dispatch PAT. cron-job.org already authenticates to
 * this deployment with `CRON_SECRET` on four working entries. One more entry pointed here needs
 * **no new secret and no new auth surface**. `/api/clv` already does near-pitch sighting from
 * Vercel on the same clock, so the pattern is not novel here.
 *
 * ⚠️ IT STORES THE RAW ODDS PAYLOAD AND DE-VIGS NOTHING. The Shin/proportional de-vig lives in
 * `tools/snapshot_props.py` (`compact()`), and a second implementation of it in TypeScript would
 * be two versions of one calculation drifting apart — the failure this repo has already paid for
 * with `slopeMults` (merged inline in one route and read raw in another). So the only thing that
 * is time-critical — THE PRICES — is captured here, and the existing python folds it in later
 * with `--fold`. The archive stays byte-comparable with every other snapshot.
 *
 * Costs the same ~6 Odds credits per event as the GitHub sweep; it is the same request.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MARKETS =
  "batter_hits,batter_total_bases,batter_home_runs,batter_hits_runs_rbis,pitcher_strikeouts,pitcher_outs";
const KEY = (date: string) => `pl:propsnap:${date}`;
const TTL = String(4 * 86_400); // long enough for the next GitHub fold-in, short enough to self-clean
const MAX_EVENTS = 16;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type OddsEvent = { id: string; away_team: string; home_team: string; commence_time: string };
/** CLOSE_WINDOW_S in tools/snapshot_props.py — the same 95 minutes, deliberately duplicated as a
 *  constant rather than a second implementation of the decision. */
const CLOSE_WINDOW_MS = 95 * 60_000;
type Stored = { t: string; kind: "close" | "pre"; src: "vercel"; events: { id: string; away: string; home: string; start: string; raw: unknown }[] };

async function oddsFetch<T>(path: string): Promise<T | null> {
  const key = process.env.ODDS_API_KEY;
  if (!key) return null;
  const sep = path.includes("?") ? "&" : "?";
  try {
    const r = await fetch(`https://api.the-odds-api.com/v4/sports/baseball_mlb${path}${sep}apiKey=${key}`, {
      cache: "no-store",
    });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!storeEnv()) return NextResponse.json({ error: "sync-not-configured" }, { status: 503 });
  const date = req.nextUrl.searchParams.get("date");

  /* READ PATH — ungated, deliberately, on exactly the reasoning that leaves /api/board open:
     this is market prices and nothing else. No stakes, no ledger, nothing personal. Gating it
     would put a secret in the GitHub workflow that folds it in, which is the whole cost this
     route exists to avoid. */
  if (date) {
    if (!DATE_RE.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
    const snaps = (await redisGetJson<Stored[]>(KEY(date))) ?? [];
    return NextResponse.json({ date, snapshots: snaps });
  }

  /* WRITE PATH — cron-key only. No UA fallback: unlike /api/generate this is not something a
     human ever triggers from a browser, so there is no reason to widen it. */
  if (!cronHeaderAuthed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const today = ptToday();
  const events = await oddsFetch<OddsEvent[]>("/events");
  if (!events) return NextResponse.json({ error: "odds upstream unavailable" }, { status: 502 });

  const now = Date.now();
  /* Only games that have NOT started. A started game is gone from the upstream anyway; saying
     so explicitly keeps the count in the response honest rather than looking like a thin slate. */
  const upcoming = events
    .filter((e) => {
      const t = Date.parse(e.commence_time);
      return isFinite(t) && t > now && t - now < 20 * 3600_000;
    })
    .slice(0, MAX_EVENTS);
  if (!upcoming.length) {
    return NextResponse.json({ ok: true, date: today, stored: 0, note: "no unstarted games with props" });
  }

  const out: Stored["events"] = [];
  for (const e of upcoming) {
    const raw = await oddsFetch<{ bookmakers?: unknown[] }>(
      `/events/${e.id}/odds?regions=us&oddsFormat=american&markets=${MARKETS}`,
    );
    if (!raw?.bookmakers?.length) continue;
    out.push({ id: e.id, away: e.away_team, home: e.home_team, start: e.commence_time, raw });
  }
  if (!out.length) return NextResponse.json({ ok: true, date: today, stored: 0, note: "no props quoted" });

  const prev = (await redisGetJson<Stored[]>(KEY(today))) ?? [];
  /* DECIDE THE KIND FROM THE SLATE, never assume it (2026-07-27). The first version hardcoded
     `kind: "close"`, which would have labelled a 16:00Z fire against a 20:10Z first pitch — four
     hours out — as a close, and Phase 2 buckets on this field. A mislabelled close is worse than
     a missing one: it enters the close bucket and attenuates the slope invisibly. Same rule the
     python already follows in `_snapshot_kind`. */
  const lead0 = Math.min(...out.map((e) => Date.parse(e.start))) - now;
  const kind: Stored["kind"] = lead0 <= CLOSE_WINDOW_MS ? "close" : "pre";
  const snap: Stored = { t: new Date(now).toISOString(), kind, src: "vercel", events: out };
  await redisSetJson(KEY(today), [...prev, snap].slice(-6));
  await redis(["EXPIRE", KEY(today), TTL]);

  const lead = Math.min(...upcoming.map((e) => Date.parse(e.commence_time))) - now;
  return NextResponse.json({
    ok: true,
    date: today,
    stored: out.length,
    kind,
    snapshots: prev.length + 1,
    leadMin: Math.round(lead / 60_000),
  });
}
