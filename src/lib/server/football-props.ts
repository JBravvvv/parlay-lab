import { NextRequest, NextResponse } from "next/server";
import { ptToday } from "@/lib/server/pt-date";
import { ctxLookup, loadPropsContext } from "@/lib/cfb/props-context";
import { czMissingGameIds, parseEventProps, propsCoverage, propsWindowSec, selectPropEvents } from "@/lib/cfb/props";
import { affordableEvents, boardFresh, czMissingDue, liveReserveCredits, pricedAgeMs, propsStore, pullCredits, type CfbPropsStore } from "@/lib/cfb/props-store";
import type { CfbPropRow, CfbPropsBoard } from "@/lib/cfb/props-types";
import { espnEventsOf, quotaOf, slateFromEspnOf, type CfbQuota } from "@/lib/cfb/slate-server";
import type { CfbGame, CfbSlate } from "@/lib/cfb/types";
import type { LeagueConfig } from "@/lib/football/league";

/**
 * THE FOOTBALL PLAYER-PROPS FEED — one body, two desks (INSTRUCTION 39, 2026-09-05; shared with
 * the NFL desk 2026-09-08, Josh: "NFL needs to be built NOW").
 *
 *   GET /api/cfb/props?date=YYYY-MM-DD&bankroll=N   → CfbPropsBoard   (footballPropsGet(CFB_LEAGUE, …))
 *   GET /api/nfl/props?date=YYYY-MM-DD&bankroll=N   → CfbPropsBoard   (footballPropsGet(NFL_LEAGUE, …))
 *
 * `cfg` is REQUIRED (no default): every feed URL, cap, window, budget and Kelly knob below is read
 * off it — `cfg.feeds.oddsEventBase` / `oddsPropMarkets`, `cfg.props.*`, `cfg.rules`,
 * `cfg.bankBase` — and the store keys arrive as `deps.storeKeys` so each thin route keeps its own
 * literal `pl:<desk>:props:*` prefixes (the separation scans pin them). The prose below says
 * "CFB_PROPS"; read it as `cfg.props` — the CFB figures are the ones the rules were measured on.
 *
 * Steps: the slate is built exactly the way /api/cfb builds it (src/lib/cfb/slate-server.ts —
 * same feeds, same cache windows, same model — through `espnEventsOf(cfg, …)` /
 * `slateFromEspnOf(cfg, …)`), `selectPropEvents` keeps the upcoming AND live
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
 * THE CAESARS-MISSING RULE (2026-09-05, Josh: "They are still 12 games today that haven't started w/
 * current Anytime TD odds"): Caesars posts player props later than the other books, and an upcoming
 * game priced before Caesars posted rode its Caesars-less rows for the whole 2 h carry. Now an
 * UPCOMING game on the stored board that HAS rows and, on at least one MARKET with rows, carries no
 * Caesars quote (`czMissingGameIds`, props.ts — keyed on the market, so a game with Caesars yardage
 * props but no Caesars anytime TD yet still re-checks), with kickoff inside CFB_PROPS.czMissingWindowSec
 * (4 h), is re-fetched once its own pricedAt is older than CFB_PROPS.czMissingRevalidateSec (30 min) —
 * `czMissingDue` (props-store.ts). A game with ZERO rows is never Caesars-missing: it stays on the 2 h
 * empty-event hold, upcoming or live (review fix — 29 of 46 priced games on the complaint day were
 * FBS-vs-FCS games no book posts props on; re-asking them every 30 min would have cost ~7,200 credits
 * against a 2,500 rail). That check runs BEFORE rail 1, because a whole-board "fresh" answer would
 * otherwise hide it for 2 h — and skipping rail 1 does NOT re-queue the live games: a live game with
 * rows is fetched only when its own pricedAt is older than liveRevalidateSec (`why`). The pull's
 * "need" is ordered live → never priced → Caesars-missing → 2 h-expired, so a tight budget buys the
 * cheapest wins first. THE DATA CACHE ON A RE-PULL: Next's data cache is stale-while-revalidate — a
 * stale entry answers with the OLD body and refreshes in the background — so a Caesars-missing or
 * live re-pull of a game already on the board is sent `cache: "no-store"` (the store and pricedAt
 * already bound its cadence; a cached answer would have landed Caesars one interval late); a first
 * pull, or a game whose 2 h carry expired, keeps `next.revalidate` at the pull's window. A re-pull
 * that FAILS (non-2xx, network) keeps the game's stored rows and its old pricedAt on the answer and
 * the written board — never dropped to "unpriced". The answer counts what it does not carry, over the
 * priced games only: `czMissing` and `noProps` (zero rows) — `propsCoverage` — and when `czMissing`
 * > 0 its `ttlSec` is min(window, czMissingRevalidateSec) so the phone's own staleness follows the
 * 30-min rule (nothing else calls this route; a 2 h staleTime would have hidden the re-check).
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
 *      THE LIVE-ONLY RESERVE (2026-09-12): that budget is now handed out in TWO allowances, not one
 *      — the in-play games against the whole rail, everything else against
 *      `dailyBudget - liveReserveCredits`. Ranking live games first (WHY_RANK below) never helped,
 *      because one allowance returns ZERO for every game alike once the day is spent, and the board
 *      then served carried pre-kick rows re-stamped "live": a frozen in-game line. No budget is
 *      lowered by this; see `liveReserveCredits` in src/lib/cfb/props-store.ts and the split at
 *      Rail 2 below, which is byte-identical to the old single allowance when the reserve is 0.
 *      The hold is also capped at what the in-play-or-still-to-kick games could spend, so a dead or
 *      2-game slate holds back nothing it could not use (review round, 2026-09-12).
 *   3. The Next data cache on each event call, as before (the pull's window).
 *
 * After a pull the merged board is written back (EX boardRetainSec) and the spend counter grows
 * by the real x-requests-used delta across the pull (falling back to the measured rate). No
 * store env → rails 1–2 are skipped and the route behaves exactly as it did (data cache only).
 * Missing key → `{ oddsMissing: true, rows: [] }` and nothing is written. A failed event is
 * skipped and counted (`fetched` < `events`). The key is read from process.env.ODDS_API_KEY
 * inside this body and never leaves `eventOdds`: not echoed, not logged.
 *
 * Date basis: `ptToday()` — the one Pacific helper.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CONCURRENCY = 4;

/** how one event call meets the Next data cache: a first / expired pull rides the pull's window; a re-pull bypasses it */
type EventCache = { next: { revalidate: number } } | { cache: "no-store" };

/** one per-event odds call on the league's event base, through the Next data cache per `cache` (see THE DATA CACHE ON A RE-PULL above) */
async function eventOddsOf(cfg: LeagueConfig, id: string, key: string, cache: EventCache): Promise<{ json: unknown; quota: CfbQuota } | null> {
  const url =
    `${cfg.feeds.oddsEventBase}/${encodeURIComponent(id)}/odds?apiKey=${encodeURIComponent(key)}` +
    `&regions=${cfg.props.regions}&markets=${cfg.feeds.oddsPropMarkets}&oddsFormat=american`;
  try {
    const r = await fetch(url, cache);
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

/** the store keys one thin route hands the body — its own literal prefixes */
export type PropsRouteDeps = { storeKeys: { board: string; spend: string } };

/** The GET body for one league. `cfg` is required on purpose: a forgotten league is a type error, never a CFB board on the NFL route. */
export async function footballPropsGet(cfg: LeagueConfig, req: NextRequest, deps: PropsRouteDeps): Promise<NextResponse> {
  /** the league's per-event odds call — `eventOdds(id, key, cache)` as the pins read it */
  const eventOdds = (id: string, key: string, cache: EventCache) => eventOddsOf(cfg, id, key, cache);
  const q = req.nextUrl.searchParams;
  const date = q.get("date") || ptToday();
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  const bankRaw = Number(q.get("bankroll"));
  const bankroll = Number.isFinite(bankRaw) && bankRaw > 0 ? bankRaw : cfg.bankBase;
  const now = Date.now();
  const headers = { "cache-control": "no-store" };

  let espn: unknown[];
  try {
    espn = await espnEventsOf(cfg, date);
  } catch (e) {
    return NextResponse.json({ error: `espn unavailable: ${(e as Error).message}` }, { status: 502 });
  }

  let slate: CfbSlate;
  try {
    slate = await slateFromEspnOf(cfg, date, espn, now, bankroll);
  } catch (e) {
    return NextResponse.json({ error: `board failed: ${(e as Error).message}` }, { status: 502 });
  }

  const key = process.env.ODDS_API_KEY;
  const { events, capped } = selectPropEvents(slate, now, cfg.props.maxEvents, cfg.props.liveMaxEvents);
  const liveEvents = events.filter((g) => g.status === "live").length;
  // the window the CURRENT slate calls for: 10 min once any selected event is in play, else 2 h
  const windowSec = propsWindowSec(events, cfg.props);
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
    czMissing: 0,
    noProps: 0,
  });
  if (!key || slate.oddsMissing) {
    return NextResponse.json(empty(true, slate.quota), { headers });
  }

  // Rail 1: the persisted board. A store error reads as a miss — never a failed answer. The board
  // is fresh only inside min(its own window, the current window) — a pre-kick board is not
  // honoured past liveRevalidateSec once a game inside it has kicked off.
  const store: CfbPropsStore | null = propsStore(deps.storeKeys);
  const ptDate = ptToday(new Date(now));
  const stored = store ? await quiet(store.readBoard(date), null) : null;

  // What the stored board says about each selected game: is it on the board, how many rows, and is it
  // Caesars-missing on some market it has rows for — the three facts every carry rule below reads.
  const storedIds = new Set(stored ? (stored.priced ?? stored.rows.map((r) => r.gameId)) : []);
  const storedRowCount = new Map<string, number>();
  for (const r of stored?.rows ?? []) storedRowCount.set(r.gameId, (storedRowCount.get(r.gameId) ?? 0) + 1);
  const storedCzMissing = czMissingGameIds(stored?.rows ?? []);
  // THE CAESARS-MISSING RULE: an upcoming game on the board with rows, some market of which has no
  // Caesars quote, inside 4 h of kickoff, whose own stamp is older than 30 min — due a re-pull now
  const czDue = (g: CfbGame): boolean =>
    !!stored && storedIds.has(g.id) && czMissingDue(stored, { id: g.id, status: g.status, kickoffMs: Date.parse(g.start) }, storedCzMissing.has(g.id), now, cfg.props);
  const czDueIds = new Set(events.filter(czDue).map((g) => g.id));
  // the window the answer is good for: the slate's, shortened to the 30-min rule while it counts a
  // Caesars-missing game — the phone's staleTime reads it, and nothing else asks this route
  const ttlFor = (czMissing: number): number => (czMissing > 0 ? Math.min(windowSec, cfg.props.czMissingRevalidateSec) : windowSec);

  // Rail 1 answers only when the board is fresh AND no game is due under the Caesars-missing rule —
  // a fresh 2 h board would otherwise hide the 30-min re-check
  if (stored && boardFresh(stored, now, windowSec) && czDueIds.size === 0) {
    const spentToday = await quiet(store!.readSpend(ptDate), null);
    const coverage = propsCoverage(events, stored.rows, stored.priced ?? stored.rows.map((r) => r.gameId));
    const body: CfbPropsBoard = {
      ...stored,
      source: "redis",
      budgeted: stored.budgeted ?? false,
      stale: stored.stale ?? false,
      spentToday,
      ttlSec: Math.min(ttlFor(coverage.czMissing), stored.ttlSec ?? windowSec),
      ...coverage,
    };
    return NextResponse.json(body satisfies CfbPropsBoard, { headers });
  }

  // What needs a fresh price this pull (INSTRUCTION 42, 2026-09-05 — per-game windows): a game is
  // CARRIED from the stored board when it is on it and its own `pricedAt` (else the board's
  // generatedAt) is inside revalidateSec — whatever window the board as a whole was written under.
  // An UPCOMING game inside that window rides on its stored rows (lines did not move, credits
  // saved) — UNLESS the Caesars-missing rule says it is due. A LIVE game with rows re-prices once its
  // OWN pricedAt is older than liveRevalidateSec (review fix: it used to re-queue on every pull that
  // got past rail 1, so one Caesars-missing game turning due re-fetched every fresh live game) —
  // UNLESS its last pull returned zero rows: the EMPTY-EVENT RULE holds it for the same 2 h, because
  // a game with no player props at the API does not grow any by being asked every 10 min. Never
  // priced, or priced too long ago → fetched.
  const ownAgeMs = (g: CfbGame): number | null => (stored && storedIds.has(g.id) ? pricedAgeMs(stored, g.id, now) : null);
  const insideOwnWindow = (g: CfbGame): boolean => {
    const age = ownAgeMs(g);
    return age != null && age <= cfg.props.revalidateSec * 1000;
  };
  // live games carried this pull (held empty, or re-priced inside the last liveRevalidateSec) — they carry no stale lines
  const liveCarried = new Set<string>();
  // why a game is fetched — and the order the budget buys them in: live games first (lines moving),
  // then games never priced (nothing to show at all), then the Caesars-missing re-checks, then the
  // games whose 2 h carry simply expired (they still carry last-priced lines meanwhile)
  type Why = "live" | "unpriced" | "czMissing" | "expired";
  const WHY_RANK: Record<Why, number> = { live: 0, unpriced: 1, czMissing: 2, expired: 3 };
  const why = (g: CfbGame): Why | null => {
    if (!stored || !storedIds.has(g.id)) return "unpriced";
    if (g.status === "live") {
      if (!insideOwnWindow(g)) return "live";
      const age = ownAgeMs(g) ?? Number.POSITIVE_INFINITY;
      if ((storedRowCount.get(g.id) ?? 0) > 0 && age > cfg.props.liveRevalidateSec * 1000) return "live";
      liveCarried.add(g.id);
      return null;
    }
    if (!insideOwnWindow(g)) return "expired";
    return czDueIds.has(g.id) ? "czMissing" : null;
  };
  const whyOf = new Map<string, Why>();
  const need = events
    .map((g, i) => ({ g, i, why: why(g) }))
    .filter((x): x is { g: CfbGame; i: number; why: Why } => x.why != null)
    .sort((a, b) => WHY_RANK[a.why] - WHY_RANK[b.why] || a.i - b.i)
    .map((x) => (whyOf.set(x.g.id, x.why), x.g));

  // Rail 2: the daily budget. Without a store there is no tally, so the cap cannot apply.
  const spentBefore = store ? await quiet(store.readSpend(ptDate), 0) : 0;
  /* THE LIVE-ONLY RESERVE (2026-09-12) — WHY ONE ALLOWANCE WAS NOT ENOUGH.
     `need` is already ordered live → unpriced → czMissing → expired (WHY_RANK above), and that
     ordering was the whole of the live pass's protection. It protects nothing: a single
     `affordableEvents` over the whole day's tally returns ZERO once the spend leaves less than one
     event of room, and zero takes the live games down with everything else. A 60-game CFB pre-kick
     pull books 1,860 of the 2,500 rail and the afternoon's carry expiries finish it, so from
     mid-afternoon every in-play pull was refused — and the answer below then served carried rows
     re-stamped `status: "live"` with `playable: false`, which on the phone is a frozen in-game line.

     So the allowance is split in two, against two different rails:
       · the LIVE partition is sized against the FULL `dailyBudget` — an in-play re-price may spend
         the last credit of the day, because a moving line is the only thing worth buying late;
       · the REST partition is sized against `dailyBudget - reserve` AND against what the live
         partition is about to spend this pass, so at least the reserve is still unspent when this
         pass ends — `reserve` being `liveReserveCredits` capped at what today's live-or-upcoming
         games could actually spend.
     NO BUDGET IS LOWERED: `dailyBudget` is untouched and all of it remains spendable. What changes
     is WHICH pass gets the last slice.

     AT `liveReserveCredits` 0 THIS IS BYTE-IDENTICAL to the single allowance it replaced — same
     count, same games, same order — because the rest partition is then sized against
     `dailyBudget - 0 - spentBefore - liveSpend`, whose events-allowed sum is exactly the old
     `affordableEvents(need.length, spentBefore, dailyBudget, perEvent)`. Proved both branches in
     tests/live-reserve.test.ts, which is also why `spentBefore + liveSpend` is passed below rather
     than `spentBefore` twice: sizing BOTH partitions off the same untouched tally would hand the
     same room out twice and could spend up to one reserve MORE than the day's budget. */
  const perEventCost = cfg.props.measuredCreditsPerEvent;
  /* THE RESERVE IS CAPPED AT WHAT A LIVE PASS COULD ACTUALLY SPEND TODAY (review round, 2026-09-12).
     The configured figure is a CEILING, not a standing charge. Held flat it was charged to the
     pre-kick pass on slates that can never use it: a 2-game Thursday night CFB card gave up 372
     credits to protect at most 62 credits of in-play pulls, and a slate whose every game is final or
     postponed gave up all 372 to protect nothing at all. That is a budget quietly reduced, which is
     exactly what this reserve was promised not to do. So the hold is the SMALLER of the configured
     ceiling and what the games that are in play or still to kick off could spend at the measured
     rate, capped by `liveMaxEvents` (a live pass cannot pull more events than that in one window).
     On a full Saturday the cap is far above the ceiling, so a game day is unchanged. */
  const liveSoon = Math.min(
    events.filter((g) => g.status === "live" || g.status === "upcoming").length,
    cfg.props.liveMaxEvents,
  );
  const reserve = Math.min(liveReserveCredits(cfg.props), liveSoon * perEventCost);
  /* THE PARTITION IS THE GAME'S STATUS, NOT ITS `why` RANK — and that distinction is the whole fix.
     `why()` returns "unpriced" for ANY game the stored board does not carry, live or not (line 278),
     so on the first pull of a day, or after the board's TTL lapsed, an IN-PLAY game is ranked
     "unpriced" and a `why === "live"` partition would leave the most frozen case of all — an in-play
     game with no rows at all — in the pre-kick half, sized against the reduced rail. Asking
     `g.status === "live"` instead cannot miss it. `why === "live"` implies `status === "live"`, so
     this is a strict widening of the live half, never a narrowing.
     ORDER: each half keeps `need`'s own order (live → unpriced → czMissing → expired), so the only
     ordering change is that an in-play game now outranks a pregame one that shares its `why`. On a
     truncated pull that is the intended preference: an in-play line is the one that has moved. */
  const liveNeed = need.filter((g) => g.status === "live");
  const restNeed = need.filter((g) => g.status !== "live");
  const allowedLive = store ? affordableEvents(liveNeed.length, spentBefore, cfg.props.dailyBudget, perEventCost) : liveNeed.length;
  // what the live half of this pass commits, at the estimated rate — the rest half may not spend it twice
  const liveSpend = allowedLive * perEventCost;
  const allowedRest = store
    ? affordableEvents(restNeed.length, spentBefore + liveSpend, cfg.props.dailyBudget - reserve, perEventCost)
    : restNeed.length;
  const toFetch = [...liveNeed.slice(0, allowedLive), ...restNeed.slice(0, allowedRest)];
  const refused = [...liveNeed.slice(allowedLive), ...restNeed.slice(allowedRest)];
  /* the count the honest note and the stale flag below already read — unchanged in meaning: how many
     of the games that needed a price this pass actually get one */
  const allowed = toFetch.length;
  const budgeted = allowed < need.length;
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
  // stale: a carried game whose LINES the current window would have re-priced — one the budget
  // refused while it carries rows, or an in-play game riding on rows older than the live window
  // (honestly dated); a refused game with no stored rows carries nothing that could be out of date
  const staleCarried = carriedNow.some(
    (g) => (g.status === "live" && !liveCarried.has(g.id)) || (refused.some((r) => r.id === g.id) && (storedRowCount.get(g.id) ?? 0) > 0),
  );
  /* THE NOTE HAS TO NAME THE RESERVE, or it claims a budget is spent that is not (2026-09-12).
     With `liveReserveCredits` set, a refused PRE-KICK game can now be refused while hundreds of
     credits are still unspent — they are held for the games that will be under way tonight. Saying
     "today's props budget (2500 credits) is used up" there would be false. `reserveBit` is
     appended only when the reserve is what bound this pass: every live game this pass wanted was
     affordable and a pre-kick game was not. With `liveReserveCredits` absent or 0 the note is
     byte-identical to the one this replaced. */
  /* BOUND BY THE RESERVE, MEASURED RATHER THAN ASSUMED (review round, 2026-09-12). The first cut
     read "every live game was afforded AND a pre-kick game was refused", which is also true when the
     DAY'S BUDGET is what refused it — the reserve then got the blame for games it did not cost, and
     the note promised credits were waiting when in truth the rail was empty. The honest test is
     counterfactual: re-size the pre-kick half against the FULL budget and see whether it would have
     bought more. Only the difference is the reserve's doing. */
  const allowedRestNoReserve = store
    ? affordableEvents(restNeed.length, spentBefore + liveSpend, cfg.props.dailyBudget, perEventCost)
    : restNeed.length;
  const reserveBound = reserve > 0 && allowedRest < allowedRestNoReserve;
  const reserveBit = reserveBound
    ? ` (${reserve} credits are being held for the games under way so their in-play lines can still be re-priced — that much of the budget is not spent)`
    : "";
  const budgetNote = budgeted
    ? allowed === 0
      ? `today's props budget (${cfg.props.dailyBudget} credits) is used up${reserveBit} — ${staleCarried ? "showing the last priced lines" : "more games price again tomorrow"}`
      : `today's props budget (${cfg.props.dailyBudget} credits) covers ${allowed} of ${need.length} games${reserveBit} — the rest ${staleCarried ? "show their last priced lines" : "price again tomorrow"}`
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
      const carriedIds = priced(carriedRows, carriedNow.map((g) => g.id));
      const coverage = propsCoverage(events, carriedRows, carriedIds);
      const body: CfbPropsBoard = {
        ...empty(false, stored.quota ?? slate.quota),
        fetched: 0,
        rows: carriedRows,
        generatedAt: stored.generatedAt,
        source: "redis",
        budgeted,
        stale: staleCarried,
        spentToday: store ? spentBefore : null,
        ttlSec: ttlFor(coverage.czMissing),
        priced: carriedIds,
        pricedAt: pricedAt(carriedIds, []),
        ...coverage,
        ...(budgetNote ? { note: budgetNote } : {}),
      };
      return NextResponse.json(body, { headers });
    }
    const body: CfbPropsBoard = { ...empty(false, slate.quota), budgeted, stale: false, spentToday: store ? spentBefore : null, ...(budgetNote ? { note: budgetNote } : {}) };
    return NextResponse.json(body, { headers });
  }

  // ESPN season context is only fetched once we know there is a key, an odds feed and budget —
  // a keyless/oddsMissing/budgeted-out call must not pull three season tables for an empty board.
  const lookup = ctxLookup(await loadPropsContext(cfg));
  // the pull's window: 10 min once any event being priced is in play, else the 2 h default
  const pullSec = propsWindowSec(toFetch, cfg.props);
  // THE DATA CACHE ON A RE-PULL: a Caesars-missing re-check, or a live game already on the board, is
  // asked with `cache: "no-store"` — Next's data cache is stale-while-revalidate and would answer the
  // re-pull with the body it is re-pulling to replace; a first pull or an expired carry rides the
  // pull's window (Redis + pricedAt bound the re-pull cadence, so the cache buys nothing there)
  const cacheFor = (g: CfbGame): EventCache => {
    const w = whyOf.get(g.id);
    return w === "czMissing" || (w === "live" && storedIds.has(g.id)) ? { cache: "no-store" } : { next: { revalidate: pullSec } };
  };
  // a re-pull that fails keeps the game's stored rows (re-stamped with the current status) — never dropped
  const keptRows = (g: CfbGame): CfbPropRow[] =>
    (stored?.rows ?? []).filter((r) => r.gameId === g.id).map((r) => (g.status === "live" && r.status !== "live" ? { ...r, status: "live", playable: false } : r));
  let quota: CfbQuota | null = slate.quota;
  let fetched = 0;
  const fetchedIds: string[] = [];
  const kept: CfbGame[] = [];
  const usedReadings: number[] = [];
  const perEvent = await mapLimit(toFetch, CONCURRENCY, async (game: CfbGame): Promise<CfbPropRow[]> => {
    const r = await eventOdds(game.oddsEventId as string, key, cacheFor(game));
    if (!r) {
      if ((storedRowCount.get(game.id) ?? 0) === 0) return [];
      kept.push(game);
      return keptRows(game);
    }
    fetched++;
    fetchedIds.push(game.id);
    if (r.quota.remaining != null) quota = r.quota;
    if (r.quota.used != null) usedReadings.push(r.quota.used);
    try {
      return parseEventProps(r.json, game, { now, bankroll, ctx: lookup, props: cfg.props, rules: cfg.rules });
    } catch {
      return [];
    }
  });
  // fresh rows first (live games lead the selection), then the carried upcoming rows
  const rows = [...perEvent.flat(), ...carriedRows];
  const live = events.filter((g) => g.status === "live" && (fetchIds.has(g.id) || carriedNow.some((c) => c.id === g.id))).length;
  // a live game whose re-pull failed rides rows older than the live window — honestly flagged
  const stale = staleCarried || kept.some((g) => g.status === "live");

  // Rail 3 (after the pull): persist the merged board and tally what it cost.
  let spentToday: number | null = store ? spentBefore : null;
  if (store && fetched > 0) {
    const credits = pullCredits(usedReadings, fetched, cfg.props.measuredCreditsPerEvent);
    spentToday = await quiet(store.addSpend(ptDate, credits), spentBefore + credits);
  }
  const pricedIds = priced(rows, [...fetchedIds, ...carriedNow.map((g) => g.id)]);
  const coverage = propsCoverage(events, rows, pricedIds);
  const body: CfbPropsBoard = {
    ...empty(false, quota),
    fetched: fetched + carriedNow.length,
    rows,
    source: "fetch",
    budgeted,
    stale,
    spentToday,
    live,
    ttlSec: ttlFor(coverage.czMissing),
    priced: pricedIds,
    pricedAt: pricedAt(pricedIds, fetchedIds),
    ...coverage,
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
