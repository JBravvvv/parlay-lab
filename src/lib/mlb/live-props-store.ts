import { gunzipSync, gzipSync } from "node:zlib";
import { redis, storeEnv } from "@/lib/server/store";
import { UPSTASH_MAX_REQUEST_BYTES, affordableEvents, pullCredits } from "@/lib/cfb/props-store";
import { MLB_LIVE_PROPS, MLB_LIVE_REDIS } from "./live-props-rules";
import type { MlbLiveQuoteBoard } from "./live-quote-types";

/**
 * THE MLB LIVE-QUOTE OVERLAY'S PERSISTENCE + ITS OWN CREDIT LEDGER (INSTRUCTION 51, 2026-09-11).
 *
 *   pl:mlb:liveprops:v1:<slateDate>      the MlbLiveQuoteBoard, gzip + base64, EX boardRetainSec (36 h)
 *   pl:mlb:liveprops:spend:v1:<ptDate>   integer credits spent on LIVE MLB props that Pacific day, EX 36 h
 *   pl:mlb:liveprops:429:<ptDate>        the circuit breaker — set on an Odds 429, EX to Pacific midnight
 *
 * NO CHUNKING, unlike `src/lib/cfb/props-store.ts`. A 60-game CFB board is ~3,000 rows and had to
 * be split under Upstash's 1 MB per-request cap; the whole 15-game MLB live overlay stores at about
 * 83 KB gzipped — a few hundred rows of ~120 bytes — against `MAX_STORED_BYTES` 2,000,000
 * (`src/lib/server/board-store.ts:48`) and the 1 MB transport cap guarded below. One SET, one GET.
 *
 * ── NO REDIS MEANS NO SPEND ─────────────────────────────────────────────────────────────────────
 * `mlbLiveStore()` returns NULL when the Upstash env is absent, and the route must then REFUSE TO
 * FETCH. This is a DELIBERATE DEVIATION from CFB, which sets `allowed = need.length` when its store
 * is missing (`src/lib/cfb/props-store.ts:213-214`) because CFB has a legitimate pre-kick job that
 * must survive a store outage. This route exists ONLY to spend money, so no tally must mean no
 * pull: without the store there is no spend counter, and an uncapped in-play pull with no counter
 * is precisely the failure the 600-credit rail exists to prevent.
 *
 * ── THE ARGUMENT DISCIPLINE, AND WHY IT IS LOAD-BEARING ─────────────────────────────────────────
 * `affordableEvents` and `pullCredits` are IMPORTED, never reimplemented — the arithmetic is
 * already reviewed and pinned on the football desks. But BOTH CARRY CFB DEFAULTS IN THEIR
 * SIGNATURES (`src/lib/cfb/props-store.ts:245`: `budget = CFB_PROPS.dailyBudget, perEvent =
 * CFB_PROPS.measuredCreditsPerEvent`; `:258`: the same `perEvent`), so a forgotten argument would
 * silently bill MLB against CFB's 2500-credit rail at 31 credits an event — five times the real
 * cost, against someone else's budget, with nothing on screen to show for it.
 *
 * So the bare functions are NOT re-exported from this module. The only MLB-facing spellings are
 * `mlbAffordableEvents` / `mlbPullCredits` below, which pass `MLB_LIVE_PROPS.dailyBudget` and
 * `MLB_LIVE_PROPS.measuredCreditsPerEvent` EXPLICITLY. `tests/mlb-live-rules.test.ts` scans this
 * file's source (comments stripped) and fails on any call to either function that does not name the
 * MLB constants, and carries a PLANT proving the scanner actually notices.
 *
 * Server-only: `node:zlib` and `Buffer`, exactly as `src/lib/server/board-store.ts:105-110` and the
 * CFB props store do. Nothing here is imported by a client component.
 *
 * ISOLATION: no key written here touches `pl:board:*`, `pl:picks:*`, `pl:ledger:v1`, `pl:clv:*`,
 * `pl:cfb:props:spend:v1:` or `pl:nfl:props:spend:v1:`. The MLB live spend cannot move another
 * desk's budget, and no budget anywhere is lowered by this build.
 */

/** The three prefixes one live-props store writes under (date-suffixed below). */
export type MlbLiveStoreKeys = { board: string; spend: string; cooldown: string };

/** The spend counter outlives its Pacific day by a margin, then is swept by Redis. */
export const MLB_LIVE_SPEND_TTL_SEC = 36 * 3600;

export const mlbLiveBoardKey = (date: string, keys: MlbLiveStoreKeys = MLB_LIVE_REDIS) => `${keys.board}${date}`;
export const mlbLiveSpendKey = (ptDate: string, keys: MlbLiveStoreKeys = MLB_LIVE_REDIS) => `${keys.spend}${ptDate}`;
export const mlbLiveCooldownKey = (ptDate: string, keys: MlbLiveStoreKeys = MLB_LIVE_REDIS) => `${keys.cooldown}${ptDate}`;

/** gzip + base64, the same encoding the board blob uses (`src/lib/server/board-store.ts:105-110`). */
export function encodeOverlay(board: MlbLiveQuoteBoard): string {
  return gzipSync(Buffer.from(JSON.stringify(board))).toString("base64");
}

/** The inverse; null on a corrupt or legacy value, so a bad blob reads as "no overlay", never as a throw. */
export function decodeOverlay(raw: string | null): MlbLiveQuoteBoard | null {
  if (!raw) return null;
  try {
    return JSON.parse(gunzipSync(Buffer.from(raw, "base64")).toString("utf8")) as MlbLiveQuoteBoard;
  } catch {
    return null;
  }
}

const PT_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/**
 * Seconds from `now` to the next Pacific midnight — the 429 circuit breaker's TTL, so the cooldown
 * expires exactly when the Pacific day it suspends does.
 *
 * STATED, NOT HIDDEN: this is wall-clock arithmetic on the Pacific time-of-day, so on the two DST
 * transition days (a 23 h or 25 h Pacific day) it is up to an hour early or late. It is always
 * positive and always bounded by a day, the key is re-set by the next 429 either way, and an hour
 * of slack on a spend brake is not a correctness problem. Floored at 60 s so a set at 23:59:59
 * cannot write a zero-or-negative EX.
 */
export function secondsToPtMidnight(now: number): number {
  const parts = PT_CLOCK.formatToParts(new Date(now));
  const num = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const secs = (num("hour") % 24) * 3600 + num("minute") * 60 + num("second");
  return Math.max(60, 86400 - secs);
}

export type MlbLiveStore = {
  /** the stored overlay for the slate date, ANY age (the route decides freshness), or null */
  readOverlay(date: string): Promise<MlbLiveQuoteBoard | null>;
  /** persist the overlay, retained for MLB_LIVE_PROPS.boardRetainSec — the stale fallback */
  writeOverlay(date: string, board: MlbLiveQuoteBoard): Promise<void>;
  /** credits spent on live MLB props this Pacific day (0 when nothing recorded) */
  readSpend(ptDate: string): Promise<number>;
  /** add `credits` to the day's tally; resolves to the new total */
  addSpend(ptDate: string, credits: number): Promise<number>;
  /** true while the Pacific day's 429 cooldown is set — the fast cadence is suspended */
  readCooldown(ptDate: string): Promise<boolean>;
  /** arm the cooldown for the rest of the Pacific day */
  setCooldown(ptDate: string, now?: number): Promise<void>;
};

/**
 * The live-props store, or NULL when the Upstash env is not configured — and null means the route
 * refuses to fetch (see the module note). Never call this expecting a data-cache fallback.
 */
export function mlbLiveStore(keys: MlbLiveStoreKeys = MLB_LIVE_REDIS): MlbLiveStore | null {
  if (!storeEnv()) return null;
  return {
    async readOverlay(date) {
      const raw = (await redis(["GET", mlbLiveBoardKey(date, keys)])) as string | null;
      return decodeOverlay(raw);
    },
    async writeOverlay(date, board) {
      const blob = encodeOverlay(board);
      // base64 is ASCII, so length IS the byte count; one request, no chunking (see the module note)
      if (blob.length > UPSTASH_MAX_REQUEST_BYTES) throw new Error(`live overlay over 1 MB (${blob.length} bytes)`);
      await redis(["SET", mlbLiveBoardKey(date, keys), blob, "EX", MLB_LIVE_PROPS.boardRetainSec]);
    },
    async readSpend(ptDate) {
      const raw = (await redis(["GET", mlbLiveSpendKey(ptDate, keys)])) as string | number | null;
      const n = Number(raw ?? 0);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
    },
    async addSpend(ptDate, credits) {
      const n = Math.max(0, Math.round(credits));
      const total = (await redis(["INCRBY", mlbLiveSpendKey(ptDate, keys), n])) as number;
      await redis(["EXPIRE", mlbLiveSpendKey(ptDate, keys), MLB_LIVE_SPEND_TTL_SEC]);
      return Number.isFinite(Number(total)) ? Number(total) : n;
    },
    async readCooldown(ptDate) {
      const raw = (await redis(["GET", mlbLiveCooldownKey(ptDate, keys)])) as string | null;
      return raw != null;
    },
    async setCooldown(ptDate, now = Date.now()) {
      await redis(["SET", mlbLiveCooldownKey(ptDate, keys), "1", "EX", secondsToPtMidnight(now)]);
    },
  };
}

/**
 * How many of `wanted` in-play events THE MLB LIVE BUDGET still buys today (0..wanted).
 * The arithmetic is CFB's, reviewed and pinned; the budget and the per-event rate are MLB's, passed
 * explicitly so the CFB defaults in that signature can never apply here.
 */
export function mlbAffordableEvents(wanted: number, spent: number): number {
  return affordableEvents(wanted, spent, MLB_LIVE_PROPS.dailyBudget, MLB_LIVE_PROPS.measuredCreditsPerEvent);
}

/**
 * What a live pull actually cost: the real `x-requests-used` delta when two or more event responses
 * carried the header, else `fetched` x the MLB measured rate (the safe direction is to over-count).
 * `MLB_LIVE_PROPS.measuredCreditsPerEvent` is passed explicitly — NEVER CFB's 31.
 *
 * THE FLOOR IS NOT DECORATION (fix pass, 2026-09-11). `pullCredits` returns ZERO when every
 * `x-requests-used` reading is identical, on CFB's premise that an all-equal reading means the
 * Next data cache answered and nothing was billed. THAT PREMISE IS FALSE HERE: every call in
 * `src/lib/server/mlb-live-quote.ts` is `cache: "no-store"`, and with CONCURRENCY 4 four in-flight
 * requests can easily read the same counter snapshot — the probe pass (3 events, one round, all
 * concurrent) is the single most likely case of all. Billing that as 0 would let real credits go
 * unrecorded and the 600-credit rail would never advance. So the answer is floored at
 * `fetched x` the measured rate: a pull that fetched something can never be recorded as free.
 */
/**
 * CALL A's OWN CREDIT — the events list, billed (fix pass, 2026-09-11).
 *
 * `/v4/sports/baseball_mlb/events` carries no `markets` param, so it is the 1-credit class. It is
 * NOT handed to `pullCredits`: that helper is built around PER-EVENT readings (its delta covers
 * every call after the first, so it adds the first call's own per-event rate back,
 * `src/lib/cfb/props-store.ts:166-174`), and feeding the list's reading in would add a 6-credit
 * per-event rate on top of a delta that already covered the 1-credit list call. So it is added
 * separately, once per pass that reached the upstream — about 100 credits a day at the 15-minute
 * cadence, previously invisible against a 600-credit rail.
 */
export const MLB_LIST_CALL_CREDITS = 1;

/**
 * What a pull actually cost, in credits.
 *
 * THE DELTA IS PREFERRED, BUT ONLY WHEN IT IS EVIDENCE (fix pass, 2026-09-11). `pullCredits` reads
 * the spread of `x-requests-used` across the per-event responses, which is the real number when the
 * upstream counted each call separately. It is NOT evidence when the readings do not distinguish the
 * calls: every request here is `cache: "no-store"` and CONCURRENCY is 4, so four responses can carry
 * the SAME snapshot of the counter — most of all on the 3-event probe — and a zero spread is then a
 * measurement artifact, not a free pull. Worse, `pullCredits` returns 0 when every reading is equal,
 * which writes no spend row at all and hands the next pass a clean budget it has not got.
 *
 * So the delta is trusted only when there are at least as many DISTINCT readings as events fetched —
 * i.e. every call moved the counter — and otherwise the measured per-event rate is the floor. A real
 * delta is never overridden: three events, readings 4 apart, bills the measured 14 and not 18.
 */
export function mlbPullCredits(usedReadings: number[], fetched: number): number {
  const byDelta = pullCredits(usedReadings, fetched, MLB_LIVE_PROPS.measuredCreditsPerEvent);
  const distinct = new Set(usedReadings.filter((n) => Number.isFinite(n))).size;
  if (fetched > 0 && distinct >= fetched) return byDelta;
  return Math.max(byDelta, Math.max(0, fetched) * MLB_LIVE_PROPS.measuredCreditsPerEvent);
}

/**
 * THE IN-FLIGHT LEASE (fix pass, 2026-09-11) — one paid pass at a time, per Pacific day.
 *
 * The budget gate is a read-modify-write: `spent` is read, affordability is decided, the pulls
 * happen, and only then does `addSpend` (the one atomic step) land. Two concurrent authed passes —
 * the 16:45 scheduler poke arriving while Josh taps Refresh, two phone tabs, a cron-job.org retry —
 * each read the same stale `spent` and each take up to `liveMaxEvents` events, so N passes can
 * spend N times the remaining budget. A 60-second `SET NX` lease costs one free Redis round trip
 * and makes that impossible; a pass that cannot take the lease answers from the stored overlay and
 * says so, exactly as the budget rail does.
 *
 * 60 s is deliberately longer than the pull's own worst case (three sequential rounds of upstream
 * latency) and far shorter than the re-price window, so a crashed pass cannot wedge the day.
 */
export const MLB_LIVE_LOCK_TTL_SEC = 60;
export const mlbLiveLockKey = (ptDate: string, keys: MlbLiveStoreKeys = MLB_LIVE_REDIS) => `${keys.board}lock:${ptDate}`;

/**
 * THE SLOT STAMP (fix pass, 2026-09-11) — an automatic pass fires at most ONCE per PT slot.
 *
 * `decideSlotTick` answers a raw time-window question: every poke landing in [slot, slot+15) gets
 * `fire: true`. The refill it rides beside is protected because its slot is stamped on the registry
 * row, but the live poke had no such marker, so a cron-job.org retry or a second vercel poke inside
 * the same quarter hour bought a whole second pull. One `SET NX` per (Pacific day, slot) settles it
 * — free, and visible in the answer's own note.
 */
export const mlbLiveSlotKey = (ptDate: string, slot: string, keys: MlbLiveStoreKeys = MLB_LIVE_REDIS) =>
  `${keys.board}slot:${ptDate}:${slot}`;
