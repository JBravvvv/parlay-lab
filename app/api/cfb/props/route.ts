import { NextRequest, NextResponse } from "next/server";
import { ptToday } from "@/lib/server/pt-date";
import { ctxLookup, loadCfbPropsContext } from "@/lib/cfb/props-context";
import { parseEventProps, selectPropEvents } from "@/lib/cfb/props";
import { affordableEvents, propsStore, pullCredits, type CfbPropsStore } from "@/lib/cfb/props-store";
import { CFB_PROPS_ODDS_MARKETS, type CfbPropRow, type CfbPropsBoard } from "@/lib/cfb/props-types";
import { CFB_BANK_BASE, CFB_PROPS } from "@/lib/cfb/rules";
import { espnEvents, quotaOf, slateFromEspn, type CfbQuota } from "@/lib/cfb/slate-server";
import type { CfbGame, CfbSlate } from "@/lib/cfb/types";

/**
 * THE CFB PLAYER-PROPS FEED (INSTRUCTION 39, 2026-09-05).
 *
 *   GET /api/cfb/props?date=YYYY-MM-DD&bankroll=N   → CfbPropsBoard
 *
 * Steps: the slate is built exactly the way /api/cfb builds it (src/lib/cfb/slate-server.ts —
 * same feeds, same cache windows, same model), `selectPropEvents` keeps the upcoming games with
 * an odds event and a Caesars side price (kickoff order, ranked teams first, at most
 * CFB_PROPS.maxEvents), and each kept event gets ONE per-event odds call for the six prop
 * markets, four at a time. The ESPN season context is fetched once alongside (best-effort).
 *
 * QUOTA (re-measured 2026-09-05 on prod): a fresh per-event call costs about 31 credits, not
 * the 6 the endpoint's pricing note suggests — a 24-event pull read ~753 credits off
 * x-requests-used. And the Next data cache is per deployment, so every deploy re-spent it.
 * Three rails now sit between a page load and the Odds API:
 *
 *   1. Redis first — `pl:cfb:props:v1:<date>` (src/lib/cfb/props-store.ts) holds the parsed
 *      board for CFB_PROPS.revalidateSec; a hit answers with `source: "redis"` and no fetch.
 *   2. The daily budget — `pl:cfb:props:spend:v1:<ptDate>` tallies the credits spent today; when
 *      spent + events × measuredCreditsPerEvent would pass CFB_PROPS.dailyBudget the route
 *      fetches only as many events as the budget still buys (possibly none) and says so
 *      (`budgeted: true`, `note`). Nothing is ever fabricated for the games it skips.
 *   3. The Next data cache on each event call, as before (CFB_PROPS.revalidateSec).
 *
 * After a pull the board is written back with EX and the spend counter grows by the real
 * x-requests-used delta across the pull (falling back to the measured rate). No store env →
 * rails 1–2 are skipped and the route behaves exactly as it did (data cache only). Missing key →
 * `{ oddsMissing: true, rows: [] }` and nothing is written. A failed event is skipped and
 * counted (`fetched` < `events`). The key never leaves `eventOdds`: not echoed, not logged.
 *
 * Date basis: `ptToday()` — the one Pacific helper.
 */

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PROPS_TTL = CFB_PROPS.revalidateSec;
const CONCURRENCY = 4;
const EVENT_ODDS_BASE = "https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/events";

async function eventOdds(id: string, key: string): Promise<{ json: unknown; quota: CfbQuota } | null> {
  const url =
    `${EVENT_ODDS_BASE}/${encodeURIComponent(id)}/odds?apiKey=${encodeURIComponent(key)}` +
    `&regions=${CFB_PROPS.regions}&markets=${CFB_PROPS_ODDS_MARKETS}&oddsFormat=american`;
  try {
    const r = await fetch(url, { next: { revalidate: PROPS_TTL } });
    const quota = quotaOf(r);
    if (!r.ok) return null;
    const json = (await r.json().catch(() => null)) as unknown;
    if (!json || typeof json !== "object") return null;
    return { json, quota };
  } catch {
    return null;
  }
}

/** Run `fn` over `items` with at most `limit` in flight, preserving order in the result. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** A store call that must never break the answer: any error reads as `fallback`. */
async function quiet<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const date = q.get("date") || ptToday();
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  const bankRaw = Number(q.get("bankroll"));
  const bankroll = Number.isFinite(bankRaw) && bankRaw > 0 ? bankRaw : CFB_BANK_BASE;
  const now = Date.now();
  const headers = { "cache-control": "no-store" };

  let espn: unknown[];
  try {
    espn = await espnEvents(date);
  } catch (e) {
    return NextResponse.json({ error: `espn unavailable: ${(e as Error).message}` }, { status: 502 });
  }

  let slate: CfbSlate;
  try {
    slate = await slateFromEspn(date, espn, now, bankroll);
  } catch (e) {
    return NextResponse.json({ error: `board failed: ${(e as Error).message}` }, { status: 502 });
  }

  const key = process.env.ODDS_API_KEY;
  const { events, capped } = selectPropEvents(slate, now);
  const empty = (oddsMissing: boolean, quota: CfbQuota | null): CfbPropsBoard => ({
    date,
    events: events.length,
    fetched: 0,
    capped,
    rows: [],
    quota,
    oddsMissing,
    generatedAt: new Date(now).toISOString(),
    source: "none",
    budgeted: false,
    spentToday: null,
  });
  if (!key || slate.oddsMissing) {
    return NextResponse.json(empty(true, slate.quota), { headers });
  }

  // Rail 1: the persisted board. A store error reads as a miss — never a failed answer.
  const store: CfbPropsStore | null = propsStore();
  const ptDate = ptToday(new Date(now));
  if (store) {
    const cached = await quiet(store.readBoard(date, now), null);
    if (cached) {
      const spentToday = await quiet(store.readSpend(ptDate), null);
      return NextResponse.json({ ...cached, source: "redis", budgeted: cached.budgeted ?? false, spentToday } satisfies CfbPropsBoard, { headers });
    }
  }

  // Rail 2: the daily budget. Without a store there is no tally, so the cap cannot apply.
  const spentBefore = store ? await quiet(store.readSpend(ptDate), 0) : 0;
  const allowed = store ? affordableEvents(events.length, spentBefore, CFB_PROPS.dailyBudget, CFB_PROPS.measuredCreditsPerEvent) : events.length;
  const budgeted = allowed < events.length;
  const toFetch = events.slice(0, allowed);
  const budgetNote = budgeted
    ? allowed === 0
      ? `today's props budget (${CFB_PROPS.dailyBudget} credits) is used up — more games price again tomorrow`
      : `today's props budget (${CFB_PROPS.dailyBudget} credits) covers ${allowed} of ${events.length} games — the rest price again tomorrow`
    : undefined;
  if (toFetch.length === 0) {
    const body: CfbPropsBoard = { ...empty(false, slate.quota), budgeted, spentToday: store ? spentBefore : null, ...(budgetNote ? { note: budgetNote } : {}) };
    return NextResponse.json(body, { headers });
  }

  // ESPN season context is only fetched once we know there is a key, an odds feed and budget —
  // a keyless/oddsMissing/budgeted-out call must not pull three season tables for an empty board.
  const lookup = ctxLookup(await loadCfbPropsContext());
  let quota: CfbQuota | null = slate.quota;
  let fetched = 0;
  const usedReadings: number[] = [];
  const perEvent = await mapLimit(toFetch, CONCURRENCY, async (game: CfbGame): Promise<CfbPropRow[]> => {
    const r = await eventOdds(game.oddsEventId as string, key);
    if (!r) return [];
    fetched++;
    if (r.quota.remaining != null) quota = r.quota;
    if (r.quota.used != null) usedReadings.push(r.quota.used);
    try {
      return parseEventProps(r.json, game, { now, bankroll, ctx: lookup });
    } catch {
      return [];
    }
  });
  const rows = perEvent.flat();

  // Rail 3 (after the pull): persist the board for the window and tally what it cost.
  let spentToday: number | null = store ? spentBefore : null;
  if (store && fetched > 0) {
    const credits = pullCredits(usedReadings, fetched, CFB_PROPS.measuredCreditsPerEvent);
    spentToday = await quiet(store.addSpend(ptDate, credits), spentBefore + credits);
  }
  const body: CfbPropsBoard = {
    ...empty(false, quota),
    fetched,
    rows,
    source: "fetch",
    budgeted,
    spentToday,
    ...(budgetNote ? { note: budgetNote } : {}),
  };
  if (store && fetched > 0) await quiet(store.writeBoard(date, body), undefined);
  const res = NextResponse.json(body, { headers });
  if (quota?.remaining != null) res.headers.set("x-requests-remaining", String(quota.remaining));
  if (quota?.used != null) res.headers.set("x-requests-used", String(quota.used));
  return res;
}
