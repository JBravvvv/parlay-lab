import { NextRequest, NextResponse } from "next/server";
import { ptToday } from "@/lib/server/pt-date";
import { evPct } from "@/lib/calc-math";
import { decFromAmerican, devigProportional } from "@/engine2/devig";
import { pnorm } from "@/engine2/grade";
import { impliedProb, matchEvent, type BookMarket, type Bookmaker, type OddsEvent } from "@/lib/server/clv-core";
import { MONOTONE_MARKETS } from "@/lib/leg-settled";
import { lineOf } from "@/lib/pred-serialize";
import { BOARD_KEY, decodeBoard, type StoredBoard } from "@/lib/server/board-store";
import { redis } from "@/lib/server/store";
import { MLB_LIVE_EVENTS_URL, MLB_LIVE_PROPS, mlbLiveEventUrl } from "@/lib/mlb/live-props-rules";
import {
  MLB_LIST_CALL_CREDITS,
  MLB_LIVE_LOCK_TTL_SEC,
  mlbAffordableEvents,
  mlbLiveCooldownKey,
  mlbLiveLockKey,
  mlbLiveSlotKey,
  mlbLiveStore,
  mlbPullCredits,
  secondsToPtMidnight,
  type MlbLiveStoreKeys,
} from "@/lib/mlb/live-props-store";
import { liveQuoteKey, type MlbLiveQuote, type MlbLiveQuoteBoard } from "@/lib/mlb/live-quote-types";
import { selectLiveEvents, type MlbLiveCandidate, type MlbStoredRow } from "@/lib/mlb/live-divergence";
import { isPriceable, liveTally, readMlbLiveState, type MlbLiveGameState, type MlbLiveStateRead } from "./mlb-live-state";

/**
 * THE MLB LIVE IN-PLAY ODDS PULL — THE BODY THAT SPENDS (INSTRUCTION 51, 2026-09-11).
 *
 *   GET /api/mlb/live-props?date=YYYY-MM-DD[&manual=1]   -> MlbLiveQuoteBoard
 *
 * Josh's order, verbatim: "Authorize the live in-play odds pull for MLB". INSTRUCTION 50 shipped the
 * honest half of his complaint — a prop whose line the live tally has cleared loses its grade / EV /
 * Kelly and carries a SETTLED tag. This is the half that costs money: pulling the in-play line and
 * price so the board can print "over 3.5 at -145" instead of suppressing a dead row.
 *
 * The body/deps split mirrors `footballPropsGet` (`src/lib/server/football-props.ts:15-22,153`):
 * the thin route owns its literal `pl:mlb:liveprops:*` prefixes and hands them in as
 * `deps.storeKeys`, so the store-separation scans keep working and nothing here can name another
 * desk's key.
 *
 * ── THE ORDER OF OPERATIONS, AND WHY IT IS NOT THE OBVIOUS ONE ──────────────────────────────────
 * Every rail that can refuse is checked BEFORE any Odds call, including the events list. The spec's
 * narrative order puts the `gkey -> oddsEventId` bridge before the cooldown check; that order would
 * spend the events call on a day the circuit breaker has already suspended. "Refuse free" has to
 * mean free, so the sequence actually implemented is:
 *
 *   1. parse the date, and refuse a malformed one
 *   2. `mlbLiveStore()` — NULL means NO REDIS means NO SPEND (see below), and returns before step 3
 *   3. the stored board (`pl:board:<date>`), READ-ONLY: its `gameInfo` and its prop rows
 *   4. the FREE statsapi live state (zero credits) + the stored overlay
 *   5. nothing priceable / cooldown armed / budget already gone -> return, ZERO fetch calls
 *   6. Call A: the events list (no `markets` param, the 1-credit class), then `matchEvent`
 *   7. `selectLiveEvents` (the free divergence gate) -> `mlbAffordableEvents` -> `probeEvents`
 *   8. Call B: one per-event in-play re-price per selected game, four at a time
 *   9. price, merge with the carried quotes, write the overlay, answer
 *
 * ── NO REDIS MEANS NO SPEND ─────────────────────────────────────────────────────────────────────
 * A DELIBERATE DEVIATION from CFB, which sets `allowed = need.length` when its store is missing
 * (`src/lib/cfb/props-store.ts:213-214`) because CFB has a legitimate pre-kick job that must survive
 * a store outage. THIS ROUTE EXISTS ONLY TO SPEND. With no store there is no spend counter, and an
 * uncapped in-play pull with no counter is exactly what the 600-credit rail exists to prevent. So a
 * missing store returns `{ budgeted: true, spentToday: null, note: "no spend tally available — live
 * pricing is off" }` having called `fetch` zero times.
 *
 * ── DIRECT, NOT THROUGH /api/odds ───────────────────────────────────────────────────────────────
 * `app/api/odds/route.ts:21` sets `TTL_SECONDS = 240` and `:47-50` degrades an unauthenticated
 * `fresh=1` to `next: { revalidate: 240 }` with `x-pl-stale: true`. A live price served out of a
 * four-minute cache LOOKS live and is not — the exact dishonesty INSTRUCTION 50 existed to remove.
 * So the key is read from `process.env.ODDS_API_KEY` in this module and every call is
 * `cache: "no-store"`, exactly as `/api/generate` and `/api/propsnap:46-58` already do. NO allowlist
 * change is needed for this: the six core markets are a strict subset of `PROP_MARKETS` and
 * `regions` is byte-equal "us", so `shapeAllowed` passes on the first shape and
 * `src/lib/server/odds-shape.ts` and `app/api/odds/route.ts` ARE NOT EDITED BY THIS BUILD.
 * THE KEY NEVER LEAVES THIS MODULE: not echoed into the body, not logged, and there is no
 * `console.*` anywhere in this file.
 *
 * ── THE PROBABILITY LADDER, AND THE ONE SOCKET IT IS STILL WAITING ON ───────────────────────────
 *   sim    `shSimGames(init).legP` — the engine's REMAINING-GAME probability. Presentable as a
 *          model number.
 *   market the de-vigged live O/U pair at the live line. `pSrc: "market"`, and the surfaces label it
 *          "market fair" — it has zero edge over the market by construction.
 *   none   show the price and NO grade at all.
 *
 * THE PREGAME NUMBER IS NEVER USED AGAINST A LIVE LINE. With 3 H+R+RBI banked in the top of the 4th,
 * P(over 3.5) is not the pregame `prob`; pairing them produces a confidently wrong EV, which is
 * worse than the dash it would replace.
 *
 * STATED PLAINLY: the sim rung is WIRED BUT UNFED IN PRODUCTION TODAY. `shSimGames` needs the
 * engine's per-game sim context — nine PA vectors a side, built inside the engine's analyze pass
 * from posted lineups and `lookupStats` — and that context is NOT recoverable from a stored board.
 * Rebuilding it here would mean re-running the slate collection, which is the 114-150 credit
 * `/api/generate`. So `deps.legPOf` is a SOCKET: a caller that already holds sims (a generate pass,
 * WI-4's tick wiring) supplies them and the sim rung lights up; with no socket filled the route
 * lands honestly on `pSrc: "market"`, and `drifted` — which is defined against `legP` — simply
 * never fires. That is a real limitation of today's build, not a rounding of one.
 *
 * ── ISOLATION, ASSERTED NOT ASSUMED ─────────────────────────────────────────────────────────────
 * The only key this module WRITES is the overlay / spend / cooldown trio under
 * `deps.storeKeys`. `pl:board:<date>` is read and never written — it is the stamped, graded
 * population (`PredRecord.k = gkey|lkey|sub`), and writing a live line into it would re-grade a bet
 * Josh never placed. Nothing touches `pl:picks:*`, `pl:ledger:v1`, `pl:clv:*`, `pl:cfb:props:*` or
 * `pl:nfl:props:*`, and no existing budget is lowered: `mlbAffordableEvents` / `mlbPullCredits` name
 * `MLB_LIVE_PROPS.dailyBudget` (600) and `measuredCreditsPerEvent` (6) explicitly, never CFB's 2500
 * and 31 (`src/lib/mlb/live-props-store.ts:157-168`).
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** four at a time, the same in-flight cap the football pull uses (`football-props.ts:107`) */
const CONCURRENCY = 4;
/** two Odds events for one matchup closer than this are INDISTINGUISHABLE — refuse, never guess */
export const DH_AMBIGUITY_MS = 30 * 60_000;
/** the window (s) this overlay is written under — a live game re-prices on its OWN pricedAt */
const TTL_SEC = MLB_LIVE_PROPS.liveRevalidateSec;

/** the slot stamp's own TTL — an hour, comfortably past the 15-minute tick window it guards */
const SLOT_STAMP_TTL_SEC = 3600;

const DK = "draftkings";
const FD = "fanduel";

/**
 * The cooldown key's value once Josh's one manual override has been spent for the Pacific day.
 * `setCooldown` writes "1" (`src/lib/mlb/live-props-store.ts:147`); ANY value means armed, and this
 * distinct one means the single manual bypass is used up too.
 */
const MANUAL_USED = "manual-used";

/**
 * The stand-in `oddsEventId` for the FREE pre-gate pass. `divergenceOf` only tests this field for
 * presence, so any non-empty string gives the same verdict the real id will; it is never fetched
 * with and never leaves this module.
 */
const PENDING_ID = "pending";

/* ------------------------------------------------------------------ tiny shared math */

/**
 * The plain median. `src/lib/server/clv-core.ts` has this exact helper but does not export it, and
 * `weightedMedian` (`src/engine2/devig.ts:76`) is a DIFFERENT function on an even count — it returns
 * the upper middle rather than averaging the two. Six lines, matching clv-core's behaviour, is the
 * honest way to keep `fO` comparable with `consensusFair`.
 */
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** The proportional pair de-vig clv-core applies to a two-sided quote — `devigProportional` is it. */
function devigPair(over: number | null, under: number | null): number | null {
  if (over == null || under == null) return null;
  const io = impliedProb(over);
  const iu = impliedProb(under);
  if (!(io > 0 && iu > 0)) return null;
  return devigProportional([io, iu])[0];
}

/** Better of the DK/FD pair for one side; tie goes to DK — `basisOf` in clv-core, same rule. */
function basisOf(dk: number | null, fd: number | null): { am: number; bk: string } | null {
  if (dk == null && fd == null) return null;
  if (dk == null) return { am: fd as number, bk: "FD" };
  if (fd == null) return { am: dk, bk: "DK" };
  return decFromAmerican(fd) > decFromAmerican(dk) ? { am: fd, bk: "FD" } : { am: dk, bk: "DK" };
}

/* ------------------------------------------------------------------ sightLiveQuote */

/** One book's two-sided quote at one point. */
type BookPoint = { book: string; point: number; over: number; under: number };

/** What the live market is posting for one (player, market) right now. */
export type LiveSight = {
  /** the point the market is on NOW — modal across books, Caesars breaking a tie */
  ln: number;
  czAm: number | null;
  oppAm: number | null;
  bsAm: number | null;
  bsBk: string | null;
  books: number;
  fO: number | null;
};

/** the knobs `sightLiveQuote` reads — a structural subset, so `MLB_LIVE_PROPS` fits */
export type LiveSightCfg = { minBooks: number; settleBook: string };

/**
 * THE INVERSE OF `sightProp`'S LINE FILTER.
 *
 * `sightProp` (`src/lib/server/clv-core.ts:127-205`) exists to sight a leg at the line it was
 * STAMPED at, so it walks the same `bookmakers[].markets[].outcomes[]` tree, normalises names with
 * `pnorm`, normalises integer milestone points to the standard half-line, and then throws away
 * everything that is not the stored line (`:160`, `if (ptN !== ln) continue`). That single line is
 * precisely what cannot happen here: the whole point of an in-play pull is to learn the point the
 * book has MOVED to. Everything else — the tree walk, `pnorm`, the milestone normalisation, the
 * Caesars / DK / FD capture, the proportional pair de-vig — is lifted, not reinvented.
 *
 * WHICH POINT IS "THE" LINE. Books disagree in play, so `ln` is the MODAL point across books with a
 * two-sided quote. A tie breaks to the point Caesars is posting when Caesars is one of the tied
 * books — Caesars is the settle book (`src/lib/cfb/props.ts` uses the same `settleBook` rule), so
 * when the market is genuinely split, the number that can actually be bet wins. With no Caesars
 * quote among the tied points it breaks to their median, which is deterministic and takes no side.
 *
 * `books` counts only TWO-SIDED quotes at `ln`, and a sight with fewer than `cfg.minBooks` of them
 * is DROPPED rather than shown: a lone book's in-play line is not a market, and printing it as one
 * would be the same overclaim as printing a pregame line as live.
 *
 * ALTERNATE LADDERS: this build never requests one (`MLB_LIVE_MARKETS` is the six core markets), so
 * the `alt` branch below is inert in production. It is kept, byte-faithful to clv-core including the
 * integer-milestone half-line normalisation, for the one thing it is allowed to do — fill a Caesars
 * or DK/FD price at an ALREADY CHOSEN `ln`. A ladder rung never votes on the modal point and never
 * counts toward `books`: "2+ hits" is a different product from the O/U line and would corrupt both.
 */
export function sightLiveQuote(ev: OddsEvent, player: string, market: string, cfg: LiveSightCfg): LiveSight | null {
  const core: BookPoint[] = [];
  /** alt-derived one-sided fills, usable only once `ln` is decided */
  const alt: { book: string; point: number; over: number | null; under: number | null }[] = [];

  for (const bk of (ev.bookmakers ?? []) as Bookmaker[]) {
    for (const mk of (bk.markets ?? []) as BookMarket[]) {
      const isAlt = mk.key === `${market}_alternate`;
      if (mk.key !== market && !isAlt) continue;
      // clv-core's rule: a ladder is only ever read at Caesars / DK / FD
      if (isAlt && bk.key !== cfg.settleBook && bk.key !== DK && bk.key !== FD) continue;
      const at = new Map<number, { o: number | null; u: number | null }>();
      for (const x of mk.outcomes ?? []) {
        if (pnorm(x.description ?? x.name ?? "") !== player) continue;
        const pt0 = x.point ?? null;
        if (pt0 == null) continue;
        // integer milestone points normalize to the standard half-line (1+ -> 0.5) — ladders only
        const ptN = isAlt && pt0 % 1 === 0 && pt0 >= 1 ? pt0 - 0.5 : pt0;
        const cur = at.get(ptN) ?? { o: null, u: null };
        if ((x.name ?? "").toLowerCase().includes("over") || x.name === "Yes") cur.o = x.price ?? null;
        else cur.u = x.price ?? null;
        at.set(ptN, cur);
      }
      for (const [point, v] of at) {
        if (isAlt) alt.push({ book: bk.key, point, over: v.o, under: v.u });
        else if (v.o != null && v.u != null) core.push({ book: bk.key, point, over: v.o, under: v.u });
      }
    }
  }
  if (!core.length) return null;

  // the modal point across books, ties to Caesars' point, else the median of the tied points
  const counts = new Map<number, number>();
  for (const c of core) counts.set(c.point, (counts.get(c.point) ?? 0) + 1);
  const top = Math.max(...counts.values());
  const tied = [...counts.entries()].filter(([, n]) => n === top).map(([p]) => p).sort((a, b) => a - b);
  const czPoints = new Set(core.filter((c) => c.book === cfg.settleBook).map((c) => c.point));
  const ln = tied.length === 1 ? tied[0] : (tied.find((p) => czPoints.has(p)) ?? (median(tied) as number));

  const atLn = core.filter((c) => c.point === ln);
  if (atLn.length < cfg.minBooks) return null;

  const fairs: number[] = [];
  for (const c of atLn) {
    const f = devigPair(c.over, c.under);
    if (f != null) fairs.push(f);
  }
  const cz = atLn.find((c) => c.book === cfg.settleBook) ?? null;
  const altAt = (book: string) => alt.find((a) => a.book === book && a.point === ln) ?? null;
  const czAlt = altAt(cfg.settleBook);
  const dk = atLn.find((c) => c.book === DK) ?? null;
  const fd = atLn.find((c) => c.book === FD) ?? null;
  const dkAlt = altAt(DK);
  const fdAlt = altAt(FD);
  // standard-market quote wins per book; a milestone rung only fills in (the same bet)
  const bs = basisOf(dk?.over ?? dkAlt?.over ?? null, fd?.over ?? fdAlt?.over ?? null);

  return {
    ln,
    czAm: cz?.over ?? czAlt?.over ?? null,
    oppAm: cz?.under ?? czAlt?.under ?? null,
    bsAm: bs?.am ?? null,
    bsBk: bs?.bk ?? null,
    books: atLn.length,
    fO: median(fairs),
  };
}

/* ------------------------------------------------------------------ the route body */

/** the store prefixes one thin route hands the body — its own literals */
export type MlbLivePropsDeps = {
  storeKeys: MlbLiveStoreKeys;
  /**
   * THE SIM SOCKET (see the module note). Given a gkey and its live state, return the engine's
   * remaining-game probability per stored lkey, 0..1. Unset in production today because the sim
   * context is not recoverable from a stored board; when it is supplied, `pSrc` becomes "sim" and
   * the `drifted` rung of the divergence gate starts firing. It is never filled with a guess.
   */
  legPOf?: (gkey: string, state: MlbLiveStateRead) => Record<string, number | null> | null;
};

type BoardRow = MlbStoredRow & { gkey: string; sub: string | null };

/** Every stored PROP row on the board, reduced to what this route reads. Read-only, never written. */
export function storedPropRows(board: StoredBoard | null): Map<string, BoardRow[]> {
  const out = new Map<string, BoardRow[]>();
  const seen = new Set<string>();
  const cats = [board?.data?.categories, board?.data?.categoriesLive];
  for (const group of cats) {
    for (const rows of Object.values(group ?? {})) {
      for (const r of rows ?? []) {
        const lkey = typeof r?.lkey === "string" ? r.lkey : null;
        const gkey = typeof r?.gkey === "string" ? r.gkey : null;
        if (!lkey || !gkey) continue;
        const parts = lkey.split("|");
        if (parts.length !== 3 || !MONOTONE_MARKETS.has(parts[1]) || lineOf(lkey) == null) continue;
        const id = liveQuoteKey(gkey, lkey);
        if (seen.has(id)) continue;
        seen.add(id);
        const list = out.get(gkey) ?? [];
        list.push({ lkey, gkey, prob: typeof r.prob === "number" && Number.isFinite(r.prob) ? r.prob : null, sub: typeof r.sub === "string" ? r.sub : null });
        out.set(gkey, list);
      }
    }
  }
  return out;
}

/**
 * This game's Odds event — `matchEvent` VERBATIM, plus the ambiguity refusal.
 *
 * `matchEvent` (`src/lib/server/clv-core.ts:107-124`) is already doubleheader-aware: it strips the
 * `gmN` suffix and takes the candidate whose `commence_time` is closest to the board's stored start.
 * That is right when the two games are hours apart and WRONG when they are not — a split
 * doubleheader whose two Odds events sit minutes apart can be picked either way by a stored start
 * that is itself only approximate, and a wrong event id prints ANOTHER GAME'S PLAYER PRICES, which
 * is invisible on screen and strictly worse than no price at all. So when the two nearest candidates
 * are within DH_AMBIGUITY_MS of each other, this refuses and the game is counted `unmatched`.
 */
export function bridgeEvent(events: OddsEvent[], gkey: string, start: number): { id: string | null; ambiguous: boolean } {
  const base = gkey.replace(/gm\d+$/, "");
  const cands = events
    .filter((e) => `${pnorm(e.away_team)}@${pnorm(e.home_team)}` === base)
    .sort((a, b) => Math.abs(Date.parse(a.commence_time) - start) - Math.abs(Date.parse(b.commence_time) - start));
  if (!cands.length) return { id: null, ambiguous: false };
  if (cands.length >= 2) {
    const gap = Math.abs(Date.parse(cands[0].commence_time) - Date.parse(cands[1].commence_time));
    if (Number.isFinite(gap) && gap < DH_AMBIGUITY_MS) return { id: null, ambiguous: true };
  }
  return { id: matchEvent(events, gkey, start)?.id ?? null, ambiguous: false };
}

/** Run `fn` over `items` with at most `limit` in flight, preserving order — `football-props.ts:130`. */
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

/** One per-event in-play call. Never throws; the shape says what happened. */
type EventPull =
  | { ok: true; json: OddsEvent; used: number | null; remaining: number | null }
  | { ok: false; rate: boolean; used: number | null; remaining: number | null };

async function pullEvent(id: string, key: string): Promise<EventPull> {
  const num = (v: string | null) => {
    const n = Number(v);
    return v != null && Number.isFinite(n) ? n : null;
  };
  try {
    const r = await fetch(mlbLiveEventUrl(id, key), { cache: "no-store" });
    const used = num(r.headers.get("x-requests-used"));
    const remaining = num(r.headers.get("x-requests-remaining"));
    if (!r.ok) return { ok: false, rate: r.status === 429, used, remaining };
    const json = (await r.json().catch(() => null)) as OddsEvent | null;
    if (!json || typeof json !== "object") return { ok: false, rate: false, used, remaining };
    return { ok: true, json, used, remaining };
  } catch {
    return { ok: false, rate: false, used: null, remaining: null };
  }
}

const iso = (ms: number) => new Date(ms).toISOString();

/** The overlay every early return needs — the carried quotes and an honest accounting. */
function emptyBoard(date: string, now: number, over: Partial<MlbLiveQuoteBoard>): MlbLiveQuoteBoard {
  return {
    date,
    generatedAt: iso(now),
    events: 0,
    fetched: 0,
    capped: false,
    live: 0,
    noLive: 0,
    unmatched: 0,
    ttlSec: TTL_SEC,
    stale: false,
    budgeted: false,
    spentToday: null,
    oddsMissing: false,
    pricedAt: {},
    emptyAt: {},
    rows: {},
    quota: null,
    ...over,
  };
}

/**
 * A carried quote may be served at any age — the render drops it past `quoteMaxAgeSec` — but it may
 * NEVER outlive its game. A final game's "live" price is not a live price, so quotes for games that
 * statsapi no longer reports in play are dropped here, at the source.
 */
function carryQuotes(prev: MlbLiveQuoteBoard | null, liveGkeys: Set<string>): Record<string, MlbLiveQuote> {
  const out: Record<string, MlbLiveQuote> = {};
  for (const [k, q] of Object.entries(prev?.rows ?? {})) if (liveGkeys.has(q.gkey)) out[k] = q;
  return out;
}

export async function mlbLivePropsGet(req: NextRequest, deps: MlbLivePropsDeps): Promise<NextResponse> {
  const cfg = MLB_LIVE_PROPS;
  const q = req.nextUrl.searchParams;
  const now = Date.now();
  const date = q.get("date") || ptToday(new Date(now));
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  const ptDate = ptToday(new Date(now));
  const manual = q.get("manual") === "1";
  /* WHICH PASS IS THIS (fix pass, 2026-09-11). `forwardMlbLivePull` has always SENT the slot
     (src/lib/server/refill.ts) and nothing read it, so the overlay could not say which pass bought
     the day's prices and an automatic slot had no idempotence marker at all. Both are fixed here:
     the slot is stamped on the answer, and RAIL 1b refuses a second automatic pass on the same
     slot for free. "manual" is Josh's own act and is never de-duplicated. */
  const slot = (q.get("slot") || "").trim() || null;

  /* RAIL 0 — no store, no spend. Returns before anything can fetch. */
  const store = mlbLiveStore(deps.storeKeys);
  if (!store) {
    return NextResponse.json(
      emptyBoard(date, now, { budgeted: true, spentToday: null, note: "no spend tally available — live pricing is off" }),
    );
  }

  /* The stored board: READ-ONLY. Its gameInfo is the pk/gkey/start join and its prop rows are the
     population a live quote can re-anchor. No stored row for a game means nothing to re-anchor. */
  const stored = decodeBoard((await quiet(redis(["GET", BOARD_KEY(date)]), null)) as string | null);
  const gameInfo = (stored?.data?.gameInfo ?? {}) as Record<string, { pk: number | null; start: string; away: string; home: string }>;
  const rowsByGame = storedPropRows(stored);

  /* The FREE live state — statsapi, keyless, zero Odds credits. The dates asked for are the slate
     date plus each stored start's own calendar day, the same derivation `useLiveNow` performs, so
     the phone and this route read the same schedule days. */
  const dates = [date, ...Object.values(gameInfo).map((g) => (g.start ? String(g.start).slice(0, 10) : ""))].filter(Boolean);
  const state = await readMlbLiveState(dates, { maxBoxes: cfg.liveMaxEvents, now });
  const byPk = new Map(state.games.map((g) => [g.pk, g]));
  const byGkey = new Map(state.games.map((g) => [g.gkey, g]));

  /** the board's games that statsapi says are being played right now */
  type Candidate = { gkey: string; start: number; g: MlbLiveGameState; rows: BoardRow[] };
  const candidates: Candidate[] = [];
  for (const [gkey, gi] of Object.entries(gameInfo)) {
    const g = (gi.pk != null ? byPk.get(gi.pk) : undefined) ?? byGkey.get(gkey);
    if (!g || !isPriceable(g)) continue;
    const rows = rowsByGame.get(gkey) ?? [];
    const start = Date.parse(gi.start ?? "");
    candidates.push({ gkey, start: Number.isFinite(start) ? start : (g.start ?? now), g, rows });
  }
  const liveGkeys = new Set(candidates.map((c) => c.gkey));
  const prev = await quiet(store.readOverlay(date), null);
  const carried = carryQuotes(prev, liveGkeys);
  const spent = await quiet(store.readSpend(ptDate), 0);
  const liveCount = candidates.length;

  const base = (over: Partial<MlbLiveQuoteBoard>): MlbLiveQuoteBoard =>
    emptyBoard(date, now, {
      live: liveCount,
      slot,
      rows: carried,
      pricedAt: { ...(prev?.pricedAt ?? {}) },
      emptyAt: { ...(prev?.emptyAt ?? {}) },
      spentToday: spent,
      ...over,
    });

  /* RAIL 1 — nothing is being played, or nothing on the board can be re-anchored. Free. */
  if (!candidates.length || !candidates.some((c) => c.rows.length)) {
    return NextResponse.json(
      base({ note: liveCount ? "no stored prop rows on the games under way — nothing to re-anchor" : "no MLB game is under way" }),
    );
  }

  /* RAIL 1b — ONE PASS PER SLOT (fix pass, 2026-09-11). The scheduler fires every 15 minutes and
     `decideSlotTick` re-fires the same slot for the whole GRADE_SLOT_WINDOW_MIN window, so a slot
     could be bought twice; /api/refill and a vercel poke can land on the same slot too. An NX stamp
     against the Pacific day makes the second pass free and says so. Refused BEFORE the 429 check so
     a duplicate never consumes Josh's one manual override — and `manual` never de-duplicates at
     all, because a tap is his own act. A Redis failure returns null here and the pass proceeds:
     this rail saves credits, it must never be the thing that blocks a pull. */
  if (slot && !manual) {
    const stamped = await quiet(
      redis(["SET", mlbLiveSlotKey(ptDate, slot, deps.storeKeys), iso(now), "NX", "EX", SLOT_STAMP_TTL_SEC]),
      "OK",
    );
    if (stamped == null) {
      return NextResponse.json(base({ note: `the ${slot} live pull already ran today — showing the prices it bought` }));
    }
  }

  /* RAIL 2 — the 429 circuit breaker. An Odds 429 means the plan is dry, and hammering it takes
     /api/clv (the scoreboard) down with it, so the fast cadence is suspended for the rest of the
     Pacific day. Josh's own manual refresh is still allowed through ONCE — his explicit act, not an
     automatic one — and the key is then marked so a second tap the same day is refused too. */
  const cooldownKey = mlbLiveCooldownKey(ptDate, deps.storeKeys);
  const cooldown = (await quiet(redis(["GET", cooldownKey]), null)) as string | null;
  if (cooldown != null) {
    if (!manual || cooldown === MANUAL_USED) {
      return NextResponse.json(
        base({
          stale: true,
          note: manual
            ? "the Odds API returned 429 today and your one manual override is already used — live pricing resumes tomorrow (Pacific)"
            : "the Odds API returned 429 today — live pricing is suspended for the rest of the Pacific day",
        }),
      );
    }
    await quiet(redis(["SET", cooldownKey, MANUAL_USED, "EX", secondsToPtMidnight(now)]), null);
  }

  /* RAIL 3 — the daily budget, checked BEFORE the events call so an exhausted day costs nothing. */
  if (mlbAffordableEvents(1, spent) === 0) {
    return NextResponse.json(
      base({
        budgeted: true,
        stale: true,
        note: `today's live-odds budget of ${cfg.dailyBudget} credits is used up (${spent} spent) — showing the last prices pulled`,
      }),
    );
  }

  /* RAIL 4 — THE FREE DIVERGENCE GATE, RUN ONCE BEFORE ANY CREDIT IS SPENT.
     `divergenceOf` needs an `oddsEventId` to return a reason at all, and the id only exists after
     Call A — so a single-pass design pays a credit for the event list even on a slate where nothing
     has moved, which on a quiet evening is EVERY poll. So the gate runs twice: first with a
     PENDING placeholder, purely to learn whether any game is worth a credit, and again with the
     real ids once Call A has happened. The placeholder cannot affect a verdict — `oddsEventId` is
     only ever tested for presence (`live-divergence.ts:158`) — and the second pass is the one that
     decides what gets fetched. */
  const prepared = candidates.map((c) => {
    const tallies: Record<string, number | null> = {};
    for (const r of c.rows) tallies[r.lkey] = liveTally(state, c.g.pk, r.lkey)?.val ?? null;
    return { c, tallies, legP: deps.legPOf?.(c.gkey, state) ?? {} };
  });
  const gateWith = (id: (gkey: string) => string | null): MlbLiveCandidate[] =>
    prepared.map(({ c, tallies, legP }) => ({
      game: { gkey: c.gkey, pk: c.g.pk, live: c.g.live, final: c.g.final, oddsEventId: id(c.gkey) },
      rows: c.rows,
      tallies,
      legP,
      overlay: prev,
    }));

  const pre = selectLiveEvents(gateWith(() => PENDING_ID), now, cfg);
  if (!pre.events.length) {
    return NextResponse.json(
      base({ note: "no game in play has moved past its stored line or its re-price window — nothing worth a credit" }),
    );
  }

  const key = process.env.ODDS_API_KEY;
  if (!key) return NextResponse.json(base({ oddsMissing: true, note: "no Odds API key configured" }));

  /* THE LEASE (fix pass, 2026-09-11). `spent` was read ~300ms earlier, before two network calls, so
     two overlapping passes could both read the same tally and both spend a full budget against it.
     An NX lease serialises the window between the budget check and `addSpend`; a pass that cannot
     take it returns the carried board for free rather than racing. 60s covers a pull (maxDuration
     is 60) and expires on its own if a lambda dies holding it. Redis down => `quiet` yields "OK"
     and the pass proceeds unserialised, which is the old behaviour, not a worse one. */
  const lockKey = mlbLiveLockKey(ptDate, deps.storeKeys);
  const leased = await quiet(redis(["SET", lockKey, iso(now), "NX", "EX", MLB_LIVE_LOCK_TTL_SEC]), "OK");
  if (leased == null) {
    return NextResponse.json(base({ note: "another live pull is in flight — showing the prices it is replacing" }));
  }

  /* CALL A — the events list. No `markets` param, so the 1-credit class. */
  let events: OddsEvent[] = [];
  let quota: MlbLiveQuoteBoard["quota"] = null;
  try {
    const r = await fetch(`${MLB_LIVE_EVENTS_URL}?apiKey=${key}`, { cache: "no-store" });
    const rem = Number(r.headers.get("x-requests-remaining"));
    const used = Number(r.headers.get("x-requests-used"));
    quota = { remaining: Number.isFinite(rem) ? rem : null, used: Number.isFinite(used) ? used : null };
    if (r.status === 429) {
      await quiet(store.setCooldown(ptDate, now), undefined);
      return NextResponse.json(base({ oddsMissing: true, stale: true, quota, note: "the Odds API returned 429 — live pricing is suspended for the rest of the Pacific day" }));
    }
    const j = r.ok ? ((await r.json().catch(() => null)) as OddsEvent[] | null) : null;
    if (Array.isArray(j)) events = j;
    else return NextResponse.json(base({ oddsMissing: true, stale: true, quota, note: "the Odds API event list was unavailable — showing the last prices pulled" }));
  } catch {
    return NextResponse.json(base({ oddsMissing: true, stale: true, note: "the Odds API event list could not be reached — showing the last prices pulled" }));
  }

  /* THE BRIDGE, then the gate again on the real ids. A game with no event — or with two events too
     close together to tell apart — drops out here and is counted `unmatched`, never guessed at. */
  const ids = new Map<string, string | null>();
  const unmatchedGkeys: string[] = [];
  let unmatched = 0;
  for (const { c } of prepared) {
    const b = bridgeEvent(events, c.gkey, c.start);
    ids.set(c.gkey, b.id);
    if (!b.id) {
      unmatched++;
      /* NO EVENT MEANS NO PRICE, AND ASKING AGAIN IN 30 SECONDS WILL NOT CONJURE ONE (fix pass,
         2026-09-11). An unmatched game stayed `unpriced` forever, so it re-qualified the whole
         slate on every single poll and re-bought Call A each time with no backoff. It is held on
         the same rail as a game whose books post nothing: `emptyHoldSec`. */
      unmatchedGkeys.push(c.gkey);
    }
  }
  const byGkeyCand = new Map(prepared.map(({ c }) => [c.gkey, c] as const));
  const sel = selectLiveEvents(gateWith((gkey) => ids.get(gkey) ?? null), now, cfg);

  /* THE CREDIT RAILS. `mlbAffordableEvents` names the MLB budget and rate explicitly (a forgotten
     argument would bill MLB against CFB's 2500 rail at 31 an event). `probeEvents` then caps the
     day's FIRST pull, because CFB measures 31 on the same nominal shape and nothing in this tree
     explains the 5.3x gap: if MLB bills like CFB, the day's first mistake costs ~93, not ~550. */
  /* RE-READ THE TALLY INSIDE THE LEASE. The `spent` above gated RAIL 3 before Call A; this is the
     number the per-event buy is actually sized against. */
  const spentNow = await quiet(store.readSpend(ptDate), spent);
  const affordable = mlbAffordableEvents(sel.events.length, spentNow);
  /* THE PROBE CAP. Until a real `x-requests-used` delta for MLB is written into
     docs/credit-budget.md and `rateMeasured` is flipped, EVERY pass is capped at `probeEvents`, not
     just the day's first: CFB measures 31 on the same nominal shape and nothing in this tree
     explains the 5.3x gap, so a mistaken pass must cost ~93, never ~372. */
  const probing = !cfg.rateMeasured || spentNow === 0;
  const allowed = probing ? Math.min(affordable, cfg.probeEvents) : affordable;
  /* WHICH RAIL BOUND THIS PASS — reported separately, because they are different facts and the old
     single `!probing` gate silenced the budget note entirely once `rateMeasured` made every pass a
     probe (fix pass, 2026-09-11). */
  const capByProbe = probing && cfg.probeEvents < affordable;
  const capByBudget = affordable < sel.events.length;
  const take = sel.events.slice(0, allowed);
  const refused = sel.events.slice(allowed);

  const pulls = await mapLimit(take, CONCURRENCY, (s) => pullEvent(s.game.oddsEventId as string, key));

  const rows: Record<string, MlbLiveQuote> = { ...carried };
  const pricedAt: Record<string, string> = { ...(prev?.pricedAt ?? {}) };
  const emptyAt: Record<string, string> = { ...(prev?.emptyAt ?? {}) };
  const used: number[] = [];
  let fetched = 0;
  let noLive = 0;
  let rated = false;
  let failed = 0;

  take.forEach((s, i) => {
    const p = pulls[i];
    const c = byGkeyCand.get(s.game.gkey);
    if (!p.ok || !c) {
      // A FAILED EVENT KEEPS ITS STORED QUOTES AND ITS OLD pricedAt, and records NO SPEND.
      failed++;
      if (p && !p.ok && p.rate) rated = true;
      return;
    }
    fetched++;
    /* THIS GAME'S CARRIED QUOTES DIE HERE (fix pass, 2026-09-11). A successful re-pull is the whole
       truth about this game's prices: a line the books have taken down must not survive as a
       carried row wearing this pull's fresh `pricedAt`, which is exactly what made a stale quote
       print as just-pulled. Sighted rows are re-written immediately below. */
    for (const r of c.rows) delete rows[liveQuoteKey(c.gkey, r.lkey)];
    if (p.used != null) used.push(p.used);
    if (p.remaining != null || p.used != null) quota = { remaining: p.remaining, used: p.used };
    const legP = deps.legPOf?.(c.gkey, state) ?? {};
    let got = 0;
    for (const r of c.rows) {
      const [player, market] = r.lkey.split("|");
      const sight = sightLiveQuote(p.json, player, market, cfg);
      if (!sight) continue;
      got++;
      /* THE LADDER: sim, else the de-vigged live pair labelled as a market number, else no grade.
         Never the pregame probability against the new price. */
      const simP = legP[r.lkey];
      const pLive = simP != null && Number.isFinite(simP) ? simP : sight.fO;
      const pSrc: MlbLiveQuote["pSrc"] = simP != null && Number.isFinite(simP) ? "sim" : "market";
      const dec = sight.czAm != null ? decFromAmerican(sight.czAm) : null;
      const ev = pLive != null && dec != null ? evPct(pLive, dec) : NaN;
      /* THE UNDER'S OWN NUMBER (fix pass, 2026-09-11). The overlay key is `gkey|lkey` and an lkey
         carries NO SIDE, so an Over row and an Under row on the same player/market/line share one
         quote. Pricing the Under off `evCz` handed it the Over's edge with the sign kept — the
         single most dangerous thing this overlay could print. `evOpp` is the Caesars UNDER at the
         same live line, against `1 - pLive`, so the UI can show each side its own number. */
      const decU = sight.oppAm != null ? decFromAmerican(sight.oppAm) : null;
      const evU = pLive != null && decU != null ? evPct(1 - pLive, decU) : NaN;
      rows[liveQuoteKey(c.gkey, r.lkey)] = {
        gkey: c.gkey,
        lkey: r.lkey,
        ln: sight.ln,
        czAm: sight.czAm,
        oppAm: sight.oppAm,
        bsAm: sight.bsAm,
        bsBk: sight.bsBk,
        books: sight.books,
        fO: sight.fO,
        pLive: pLive ?? null,
        pSrc,
        evCz: Number.isFinite(ev) ? Math.round(ev * 100) / 100 : null,
        evOpp: Number.isFinite(evU) ? Math.round(evU * 100) / 100 : null,
        at: iso(now),
      };
    }
    pricedAt[c.gkey] = iso(now);
    if (got === 0) {
      // THE EMPTY-EVENT RULE: books take in-play markets down, and asking again in 30 min does not
      // bring them back. Not an error — counted, and the game is held for emptyHoldSec.
      noLive++;
      emptyAt[c.gkey] = iso(now);
      /* this game's carried rows are already gone — the successful-pull delete above is
         unconditional, precisely so a taken-down line cannot survive a pull that saw none */
    } else delete emptyAt[c.gkey];
  });

  if (rated) await quiet(store.setCooldown(ptDate, now), undefined);

  /* THE SPEND — the real x-requests-used delta when the headers gave us two or more readings, else
     fetched x the MLB measured rate (floored at that rate by `mlbPullCredits`, because identical
     no-store readings across a 4-wide burst are not evidence that nothing was billed) — PLUS Call
     A's own credit.

     THE UNDERCOUNT IS CLOSED (fix pass, 2026-09-11). Call A used to go unbilled entirely: only the
     per-event readings are passed to `pullCredits`, which is built around that shape (its delta
     covers every call after the first, so it adds the first call's rate back,
     `src/lib/cfb/props-store.ts:166-174`) — handing it the list call's reading would add a
     per-event rate on top of a delta that already covered the list. So the list is not handed to
     it at all; its flat credit is added afterwards. The consequence is that a pull which reached
     the upstream and fetched NOTHING now records 1 rather than 0, which is what actually happened:
     roughly 100 credits a day at the 15-minute cadence, and previously invisible. The probe in
     docs/credit-budget.md still replaces the per-event assumption with a measurement. */
  const credits = mlbPullCredits(used, fetched) + MLB_LIST_CALL_CREDITS;
  const spentToday = await quiet(store.addSpend(ptDate, credits), spentNow + credits);

  /* THE STAMPS ARE PART OF THE GATE, SO THEY ARE PRUNED WITH IT (fix pass, 2026-09-11). A gkey that
     is no longer in play can never be selected again today, and its `pricedAt` is what the phone's
     "priced HH:MM" label reads — an all-day accumulation made the label quote a finished game and
     grew the stored overlay without bound. Only games under way right now keep a stamp. */
  for (const k of Object.keys(pricedAt)) if (!liveGkeys.has(k)) delete pricedAt[k];
  for (const g of unmatchedGkeys) emptyAt[g] = iso(now);
  for (const k of Object.keys(emptyAt)) if (!liveGkeys.has(k)) delete emptyAt[k];

  const notes: string[] = [];
  if (capByProbe) notes.push(`every pull is capped at ${cfg.probeEvents} events until a real credit reading lands`);
  if (capByBudget) notes.push(`today's live-odds budget of ${cfg.dailyBudget} credits bought ${allowed} of ${sel.events.length} in-play games (${spentToday} spent)`);
  if (sel.capped) notes.push(`more than ${cfg.liveMaxEvents} games in play — priced the ${cfg.liveMaxEvents} that moved most`);
  if (unmatched) notes.push(`${unmatched} live game${unmatched === 1 ? "" : "s"} could not be matched to an odds event`);
  if (noLive) notes.push(`${noLive} game${noLive === 1 ? "" : "s"} post no in-play market`);
  if (failed) notes.push(`${failed} in-play call${failed === 1 ? "" : "s"} failed — those games kept their last prices`);
  if (rated) notes.push("the Odds API returned 429 — live pricing is suspended for the rest of the Pacific day");

  const board: MlbLiveQuoteBoard = {
    date,
    generatedAt: iso(now),
    /* WHICH PASS BOUGHT THESE PRICES — the slot `forwardMlbLivePull` has always sent and nothing
       read until the fix pass. "manual" is Josh's tap; null is a direct browser read. */
    slot,
    events: sel.events.length,
    fetched,
    capped: sel.capped,
    live: sel.liveCount,
    noLive,
    unmatched,
    ttlSec: TTL_SEC,
    stale: refused.length > 0 || failed > 0,
    budgeted: refused.length > 0,
    spentToday,
    oddsMissing: false,
    pricedAt,
    emptyAt,
    rows,
    quota,
    ...(notes.length ? { note: notes.join(" · ") } : {}),
  };

  let storeWriteFailed = false;
  try {
    await store.writeOverlay(date, board);
  } catch {
    // NEVER SWALLOWED: the credits were spent, so the caller is told the overlay did not persist.
    storeWriteFailed = true;
  }

  /* The lease is released rather than left to expire, so Josh's second Refresh tap is not told a
     pull is in flight for a minute after the first one finished. */
  await quiet(redis(["DEL", lockKey]), null);

  const res = NextResponse.json(storeWriteFailed ? { ...board, storeWriteFailed: true } : board);
  if (quota?.remaining != null) res.headers.set("x-requests-remaining", String(quota.remaining));
  if (quota?.used != null) res.headers.set("x-requests-used", String(quota.used));
  return res;
}

