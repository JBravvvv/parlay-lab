import { NextRequest, NextResponse } from "next/server";
import { ptToday } from "@/lib/server/pt-date";
import { buildCfbBoard } from "@/lib/cfb/model";
import { espnDateParam, nextDate } from "@/lib/cfb/dates";
import { CFB_BANK_BASE, CFB_ESPN_FPI, CFB_ESPN_SCOREBOARD, CFB_ODDS_URL } from "@/lib/cfb/rules";
import type { CfbFinals, CfbGame, CfbSlate } from "@/lib/cfb/types";

/**
 * THE COLLEGE FOOTBALL SLATE FEED (INSTRUCTION 38, 2026-09-05). One public GET that
 * assembles everything the CFB desk renders for one Pacific date:
 *
 *   GET /api/cfb?date=YYYY-MM-DD&bankroll=N            → CfbSlate (board + finals + quota)
 *   GET /api/cfb?date=YYYY-MM-DD&mode=finals            → { date, finals }  (scores only, NO odds call)
 *
 * Three upstreams, each on the Next data cache so page loads never spend quota:
 *   ESPN scoreboard  revalidate 60s   — the requested date AND the next calendar date
 *                                       (ESPN buckets by US-Eastern; a late West-coast
 *                                       kickoff sits on the next ESPN date — the model keeps
 *                                       only events whose PT kickoff date is the one asked for)
 *   ESPN FPI         revalidate 6h    — failure → null → every fpi renders "—"
 *   The Odds API     revalidate 240s  — the server key, exactly the way /api/odds injects it;
 *                                       a missing key or a non-200 never 500s: the board is
 *                                       scores-only with `oddsMissing: true`
 *
 * Nothing here is fabricated: every price is a posted book quote, every rating is ESPN's own
 * FPI figure, every score is ESPN's own score — the pure model (src/lib/cfb/model.ts) does the
 * shaping, and the finals map is derived from the same shaped games so grading keys and the
 * board's game ids can never disagree.
 *
 * Date basis: `ptToday()` — the one Pacific helper (tests/server-date-basis.test.ts).
 */

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ESPN_TTL = 60;
const FPI_TTL = 21600;
const ODDS_TTL = 240;

type Quota = { remaining: number | null; used: number | null };
const NO_QUOTA: Quota = { remaining: null, used: null };

function numHeader(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function espnDay(date: string): Promise<unknown[]> {
  const url = `${CFB_ESPN_SCOREBOARD}?groups=80&limit=400&dates=${espnDateParam(date)}`;
  const r = await fetch(url, { next: { revalidate: ESPN_TTL } });
  if (!r.ok) throw new Error(`espn scoreboard ${r.status} for ${date}`);
  const j = (await r.json()) as { events?: unknown };
  return Array.isArray(j.events) ? j.events : [];
}

/** The requested date plus the next calendar date, concatenated (see the header). Both must
    land — a silently missing second day would drop the late slate, the obSameDay class. */
async function espnEvents(date: string): Promise<unknown[]> {
  const [today, tomorrow] = await Promise.all([espnDay(date), espnDay(nextDate(date))]);
  return [...today, ...tomorrow];
}

async function fpiPayload(): Promise<unknown | null> {
  try {
    const r = await fetch(CFB_ESPN_FPI, { next: { revalidate: FPI_TTL } });
    if (!r.ok) return null;
    return (await r.json()) as unknown;
  } catch {
    return null;
  }
}

/** The one Odds API call of the CFB desk. The key never leaves this function: it is not
    echoed in any error, header or body, and the URL it was appended to is never logged. */
async function oddsPayload(): Promise<{ events: unknown[]; missing: boolean; quota: Quota }> {
  const key = process.env.ODDS_API_KEY;
  if (!key) return { events: [], missing: true, quota: NO_QUOTA };
  try {
    const r = await fetch(`${CFB_ODDS_URL}&apiKey=${encodeURIComponent(key)}`, { next: { revalidate: ODDS_TTL } });
    const quota: Quota = {
      remaining: numHeader(r.headers.get("x-requests-remaining")),
      used: numHeader(r.headers.get("x-requests-used")),
    };
    if (!r.ok) return { events: [], missing: true, quota };
    const j = (await r.json().catch(() => null)) as unknown;
    if (!Array.isArray(j)) return { events: [], missing: true, quota };
    return { events: j, missing: false, quota };
  } catch {
    return { events: [], missing: true, quota: NO_QUOTA };
  }
}

/** Final scores keyed by ESPN event id, from the model's shaped games. A game that ESPN calls
    final without both scores is left OUT rather than graded on a made-up number — the grader
    then reports it pending / ungradable, which is the honest state. Pre-kick and live games
    carry ESPN's running score with `final: false`, so nothing settles on them. */
function finalsOf(games: CfbGame[]): CfbFinals {
  const out: CfbFinals = {};
  for (const g of games) {
    const final = g.status === "final";
    if (final && (g.homeScore == null || g.awayScore == null)) continue;
    out[g.id] = { home: g.homeScore ?? 0, away: g.awayScore ?? 0, final, status: g.status };
  }
  return out;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const date = q.get("date") || ptToday();
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  const mode = q.get("mode") || "board";
  if (mode !== "board" && mode !== "finals") return NextResponse.json({ error: "bad mode" }, { status: 400 });
  const bankRaw = Number(q.get("bankroll"));
  const bankroll = Number.isFinite(bankRaw) && bankRaw > 0 ? bankRaw : CFB_BANK_BASE;
  const now = Date.now();

  let espn: unknown[];
  try {
    espn = await espnEvents(date);
  } catch (e) {
    return NextResponse.json({ error: `espn unavailable: ${(e as Error).message}` }, { status: 502 });
  }

  if (mode === "finals") {
    try {
      const board = buildCfbBoard({ date, espnEvents: espn, oddsEvents: [], fpi: null, now, bankroll });
      return NextResponse.json({ date, finals: finalsOf(board.games) }, { headers: { "cache-control": "no-store" } });
    } catch (e) {
      return NextResponse.json({ error: `finals failed: ${(e as Error).message}` }, { status: 502 });
    }
  }

  const [fpi, odds] = await Promise.all([fpiPayload(), oddsPayload()]);
  let slate: CfbSlate;
  try {
    const board = buildCfbBoard({ date, espnEvents: espn, oddsEvents: odds.events, fpi, now, bankroll });
    slate = { ...board, finals: finalsOf(board.games), quota: odds.quota, oddsMissing: odds.missing };
  } catch (e) {
    return NextResponse.json({ error: `board failed: ${(e as Error).message}` }, { status: 502 });
  }
  const res = NextResponse.json(slate, { headers: { "cache-control": "no-store" } });
  if (odds.quota.remaining != null) res.headers.set("x-requests-remaining", String(odds.quota.remaining));
  if (odds.quota.used != null) res.headers.set("x-requests-used", String(odds.quota.used));
  return res;
}
