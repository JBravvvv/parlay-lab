import { NextRequest, NextResponse } from "next/server";
import { ptToday } from "@/lib/server/pt-date";
import { ctxLookup, loadCfbPropsContext } from "@/lib/cfb/props-context";
import { parseEventProps, propsWindowSec, selectPropEvents } from "@/lib/cfb/props";
import { affordableEvents, boardFresh, pricedAgeMs, propsStore, pullCredits, type CfbPropsStore } from "@/lib/cfb/props-store";
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
 * same feeds, same cache windows, same model), `selectPropEvents` keeps the upcoming AND live
 * games with an odds event and a Caesars side price (live first, then kickoff order, ranked
 * teams first, at most CFB_PROPS.maxEvents — INSTRUCTION 40: props no longer vanish once the
 * slate kicks off), and each kept event gets ONE per-event odds call for the six prop markets,
 * four at a time. The ESPN season context is fetched once alongside (best-effort).
 *
 * THE WINDOW: `propsWindowSec(events)` — CFB_PROPS.revalidateSec (2 h) for a pre-kick set,
 * CFB_PROPS.liveRevalidateSec (10 min) once any selected event is in play, because in-game lines
 * move. It is the per-event data-cache revalidate, the body's `ttlSec` (the client's staleTime and
 * the footnote's "cached N min") and the cap on the stored board's freshness (`boardFresh`): a
 * board written pre-kick under 7200 s is fresh for only 600 s once a game inside it kicks off, so
 * the first request after kickoff re-prices (2026-09-05 review fix — the stored pre-kick board
 * used to be honoured for its full 2 h while the games were in the 3rd quarter).
 *
 * A LIVE PULL RE-PRICES ONLY WHAT MOVED: the in-play events (at most CFB_PROPS.liveMaxEvents,
 * live first) plus any upcoming event the stored board has no rows for; every other upcoming
 * game's rows are carried over from the stored board while that board is inside revalidateSec.
 * A full 12-event pull every 10 min would have spent the day's 1200 credits in four pulls.
 *
 * EVERY ELIGIBLE GAME, PER-GAME WINDOWS (INSTRUCTION 42, 2026-09-05): the pools are now 60 pre-kick
 * and 24 in play (CFB_PROPS), the budget 2500/day. Two savers pay for that: (1) the stored board
 * carries `pricedAt[gameId]` — the instant each game was last pulled — so an upcoming game rides on
 * ITS OWN 2 h window (`pricedAgeMs`, falling back to `generatedAt` for boards written before the
 * field existed) rather than the board's, which under a live slate was only 10 min and had every
 * upcoming game re-priced each pull; (2) the EMPTY-EVENT RULE — an event whose last pull returned
 * ZERO rows (many small games carry no player props at the API) is not asked again until
 * revalidateSec after its pricedAt, live or not. A live event WITH rows still re-prices every
 * liveRevalidateSec, as before.
 *
 * QUOTA (re-measured 2026-09-05 on prod): a fresh per-event call costs about 31 credits, not
 * the 6 the endpoint's pricing note suggests — a 24-event pull read ~753 credits off
 * x-requests-used. And the Next data cache is per deployment, so every deploy re-spent it.
 * Three rails now sit between a page load and the Odds API:
 *
 *   1. Redis first — `pl:cfb:props:v1:<date>` (src/lib/cfb/props-store.ts) holds the last board
 *      written, retained for CFB_PROPS.boardRetainSec; when it is fresh for the CURRENT window
 *      (`boardFresh`) it answers with `source: "redis"` and no fetch.
 *   2. The daily budget — `pl:cfb:props:spend:v1:<ptDate>` tallies the credits spent today; when
 *      spent + events × measuredCreditsPerEvent would pass CFB_PROPS.dailyBudget the route
 *      fetches only as many events as the budget still buys (possibly none) and says so
 *      (`budgeted: true`, `note`). The games it skips keep their LAST PRICED rows from the stored
 *      board, flagged `stale: true` (never fabricated, honestly dated by `generatedAt`); with
 *      nothing stored they are simply absent.
 *   3. The Next data cache on each event call, as before (the pull's window).
 *
 * After a pull the merged board is written back (EX boardRetainSec) and the spend counter grows
 * by the real x-requests-used delta across the pull (falling back to the measured rate). No
 * store env → rails 1–2 are skipped and the route behaves exactly as it did (data cache only).
 * Missing key → `{ oddsMissing: true, rows: [] }` and nothing is written. A failed event is
 * skipped and counted (`fetched` < `events`). The key never leaves `eventOdds`: not echoed,
 * not logged.
 *
 * Date basis: `ptToday()` — the one Pacific helper.
 */

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CONCURRENCY = 4;
const EVENT_ODDS_BASE = "https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/events";

/** one per-event odds call, cached by the Next data cache for `revalidateSec` (the pull's window) */
async function eventOdds(id: string, key: string, revalidateSec: number): Promise<{ json: unknown; quota: CfbQuota } | null> {
  const url =
    `${EVENT_ODDS_BASE}/${encodeURIComponent(id)}/odds?apiKey=${encodeURIComponent(key)}` +
    `&regions=${CFB_PROPS.regions}&markets=${CFB_PROPS_ODDS_MARKETS}&oddsFormat=american`;
  try {
    const r = await fetch(url, { next: { revalidate: revalidateSec } });
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
  const liveEvents = events.filter((g) => g.status === "live").length;
  // the window the CURRENT slate calls for: 10 min once any selected event is in play, else 2 h
  const windowSec = propsWindowSec(events);
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
    live: liveEvents,
    ttlSec: windowSec,
    priced: [],
    pricedAt: {},
  });
  if (!key || slate.oddsMissing) {
    return NextResponse.json(empty(true, slate.quota), { headers });
  }

  // Rail 1: the persisted board. A store error reads as a miss — never a failed answer. The board
  // is fresh only inside min(its own window, the current window) — a pre-kick board is not
  // honoured past liveRevalidateSec once a game inside it has kicked off.
  const store: CfbPropsStore | null = propsStore();
  const ptDate = ptToday(new Date(now));
  const stored = store ? await quiet(store.readBoard(date), null) : null;
  if (stored && boardFresh(stored, now, windowSec)) {
    const spentToday = await quiet(store!.readSpend(ptDate), null);
    const body: CfbPropsBoard = {
      ...stored,
      source: "redis",
      budgeted: stored.budgeted ?? false,
      stale: stored.stale ?? false,
      spentToday,
      ttlSec: Math.min(windowSec, stored.ttlSec ?? windowSec),
    };
    return NextResponse.json(body satisfies CfbPropsBoard, { headers });
  }

  // What needs a fresh price this pull (INSTRUCTION 42, 2026-09-05 — per-game windows): a game is
  // CARRIED from the stored board when it is on it and its own `pricedAt` (else the board's
  // generatedAt) is inside revalidateSec — whatever window the board as a whole was written under.
  // An UPCOMING game inside that window rides on its stored rows (lines did not move, credits
  // saved). A LIVE game re-prices every pull — UNLESS its last pull returned zero rows: the
  // EMPTY-EVENT RULE holds it for the same 2 h, because a game with no player props at the API
  // does not grow any by being asked every 10 min. Never priced, or priced too long ago → fetched.
  const storedIds = new Set(stored ? (stored.priced ?? stored.rows.map((r) => r.gameId)) : []);
  const storedRowCount = new Map<string, number>();
  for (const r of stored?.rows ?? []) storedRowCount.set(r.gameId, (storedRowCount.get(r.gameId) ?? 0) + 1);
  const insideOwnWindow = (g: CfbGame): boolean => {
    if (!stored || !storedIds.has(g.id)) return false;
    const age = pricedAgeMs(stored, g.id, now);
    return age != null && age <= CFB_PROPS.revalidateSec * 1000;
  };
  // live games held by the empty-event rule this pull (they are carried, and carry no stale lines)
  const emptyHeld = new Set<string>();
  const need = events.filter((g) => {
    if (!insideOwnWindow(g)) return true;
    if (g.status !== "live") return false;
    if ((storedRowCount.get(g.id) ?? 0) > 0) return true;
    emptyHeld.add(g.id);
    return false;
  });

  // Rail 2: the daily budget. Without a store there is no tally, so the cap cannot apply.
  const spentBefore = store ? await quiet(store.readSpend(ptDate), 0) : 0;
  const allowed = store ? affordableEvents(need.length, spentBefore, CFB_PROPS.dailyBudget, CFB_PROPS.measuredCreditsPerEvent) : need.length;
  const budgeted = allowed < need.length;
  const toFetch = need.slice(0, allowed);
  const refused = need.slice(allowed);
  // the games this answer carries from the stored board: everything selected that is not fetched now
  const fetchIds = new Set(toFetch.map((g) => g.id));
  const carriedNow = stored ? events.filter((g) => !fetchIds.has(g.id) && storedIds.has(g.id)) : [];
  // carried rows adopt the CURRENT slate's status: a game that kicked off since its rows were
  // priced is reported live (the Board's LIVE parlays read it) and is no longer "playable" — a
  // pre-kick Kelly on an in-play line would be a fiction (2026-09-05 follow-up)
  const statusNow = new Map(carriedNow.map((g) => [g.id, g.status] as const));
  const carriedRows: CfbPropRow[] = stored
    ? stored.rows
        .filter((r) => statusNow.has(r.gameId))
        .map((r) => (statusNow.get(r.gameId) === "live" && r.status !== "live" ? { ...r, status: "live", playable: false } : r))
    : [];
  // stale: a carried game whose lines the current window would have re-priced — one the budget
  // refused, or an in-play game riding on rows older than the live window (honestly dated)
  const stale = carriedNow.some((g) => (g.status === "live" && !emptyHeld.has(g.id)) || refused.some((r) => r.id === g.id));
  const budgetNote = budgeted
    ? allowed === 0
      ? `today's props budget (${CFB_PROPS.dailyBudget} credits) is used up — ${stale ? "showing the last priced lines" : "more games price again tomorrow"}`
      : `today's props budget (${CFB_PROPS.dailyBudget} credits) covers ${allowed} of ${need.length} games — the rest ${stale ? "show their last priced lines" : "price again tomorrow"}`
    : undefined;
  const priced = (rows: CfbPropRow[], fetchedIds: string[]) => Array.from(new Set([...fetchedIds, ...rows.map((r) => r.gameId)]));
  // when each game on the answer was last pulled: now for the games fetched this pull, the stored
  // board's own stamp (else its generatedAt) for the carried ones (INSTRUCTION 42)
  const nowIso = new Date(now).toISOString();
  const pricedAt = (ids: string[], fetchedIds: string[]): Record<string, string> => {
    const fetchedSet = new Set(fetchedIds);
    const out: Record<string, string> = {};
    for (const id of ids) out[id] = fetchedSet.has(id) ? nowIso : (stored?.pricedAt?.[id] ?? stored?.generatedAt ?? nowIso);
    return out;
  };

  if (toFetch.length === 0) {
    // nothing to fetch: the stored board (any age) with every selected game it carries, or an empty answer
    if (stored && carriedRows.length > 0) {
      const body: CfbPropsBoard = {
        ...empty(false, stored.quota ?? slate.quota),
        fetched: 0,
        rows: carriedRows,
        generatedAt: stored.generatedAt,
        source: "redis",
        budgeted,
        stale,
        spentToday: store ? spentBefore : null,
        priced: priced(carriedRows, carriedNow.map((g) => g.id)),
        pricedAt: pricedAt(priced(carriedRows, carriedNow.map((g) => g.id)), []),
        ...(budgetNote ? { note: budgetNote } : {}),
      };
      return NextResponse.json(body, { headers });
    }
    const body: CfbPropsBoard = { ...empty(false, slate.quota), budgeted, stale: false, spentToday: store ? spentBefore : null, ...(budgetNote ? { note: budgetNote } : {}) };
    return NextResponse.json(body, { headers });
  }

  // ESPN season context is only fetched once we know there is a key, an odds feed and budget —
  // a keyless/oddsMissing/budgeted-out call must not pull three season tables for an empty board.
  const lookup = ctxLookup(await loadCfbPropsContext());
  // the pull's window: 10 min once any event being priced is in play, else the 2 h default
  const ttlSec = propsWindowSec(toFetch);
  let quota: CfbQuota | null = slate.quota;
  let fetched = 0;
  const fetchedIds: string[] = [];
  const usedReadings: number[] = [];
  const perEvent = await mapLimit(toFetch, CONCURRENCY, async (game: CfbGame): Promise<CfbPropRow[]> => {
    const r = await eventOdds(game.oddsEventId as string, key, ttlSec);
    if (!r) return [];
    fetched++;
    fetchedIds.push(game.id);
    if (r.quota.remaining != null) quota = r.quota;
    if (r.quota.used != null) usedReadings.push(r.quota.used);
    try {
      return parseEventProps(r.json, game, { now, bankroll, ctx: lookup });
    } catch {
      return [];
    }
  });
  // fresh rows first (live games lead the selection), then the carried upcoming rows
  const rows = [...perEvent.flat(), ...carriedRows];
  const live = events.filter((g) => g.status === "live" && (fetchIds.has(g.id) || carriedNow.some((c) => c.id === g.id))).length;

  // Rail 3 (after the pull): persist the merged board and tally what it cost.
  let spentToday: number | null = store ? spentBefore : null;
  if (store && fetched > 0) {
    const credits = pullCredits(usedReadings, fetched, CFB_PROPS.measuredCreditsPerEvent);
    spentToday = await quiet(store.addSpend(ptDate, credits), spentBefore + credits);
  }
  const body: CfbPropsBoard = {
    ...empty(false, quota),
    fetched: fetched + carriedNow.length,
    rows,
    source: "fetch",
    budgeted,
    stale,
    spentToday,
    live,
    ttlSec: windowSec,
    priced: priced(rows, [...fetchedIds, ...carriedNow.map((g) => g.id)]),
    pricedAt: pricedAt(priced(rows, [...fetchedIds, ...carriedNow.map((g) => g.id)]), fetchedIds),
    ...(budgetNote ? { note: budgetNote } : {}),
  };
  // INSTRUCTION 42 (2026-09-05, review fix): a failed board write is no longer swallowed silently —
  // the answer says so, because the next request then has no carried rows or pricedAt to lean on
  if (store && fetched > 0 && !(await quiet(store.writeBoard(date, body).then(() => true), false))) body.storeWriteFailed = true;
  const res = NextResponse.json(body, { headers });
  if (quota?.remaining != null) res.headers.set("x-requests-remaining", String(quota.remaining));
  if (quota?.used != null) res.headers.set("x-requests-used", String(quota.used));
  return res;
}
