import { gunzipSync, gzipSync } from "node:zlib";
import { redis, storeEnv } from "@/lib/server/store";
import { CFB_PROPS } from "./rules";
import type { CfbPropRow, CfbPropsBoard } from "./props-types";
import type { LeagueProps } from "@/lib/football/league";

/**
 * THE CFB PROPS BOARD'S PERSISTENCE + CREDIT LEDGER (2026-09-05).
 *
 * Why: the per-event props pull was MEASURED at ~31 credits per event on prod (see CFB_PROPS),
 * and the Next data cache the route sat on is per deployment — every deploy re-spent the whole
 * slate. So the parsed board is now persisted in the same Upstash store the ledgers use, under
 * its own keys, and the credits each pull costs are tallied per Pacific day so the route can
 * refuse to spend past CFB_PROPS.dailyBudget.
 *
 *   pl:cfb:props:v1:<date>        the CfbPropsBoard for a slate date, EX CFB_PROPS.boardRetainSec
 *                                 (36 h) — RETAINED past its own window so the route can serve the
 *                                 last good board, flagged stale, once the daily budget is spent
 *                                 (2026-09-05 review fix). Freshness is decided by the reader:
 *                                 `boardFresh(board, now, windowSec)` — the board's own window
 *                                 (`board.ttlSec`: revalidateSec pre-kick, liveRevalidateSec when a
 *                                 priced event was in play, INSTRUCTION 40) capped by the CURRENT
 *                                 slate's window, so a pre-kick board stops being fresh the moment a
 *                                 game inside it kicks off.
 *   pl:cfb:props:spend:v1:<pt>    integer credits spent on props that Pacific day, EX 36 h
 *
 *   CHUNKED + COMPRESSED (INSTRUCTION 42, 2026-09-05, review fix): a 60-game board is ~3,000
 *   rows ≈ 2.5–3 MB of JSON, and Upstash's REST endpoint caps ONE request at 1 MB on the Free and
 *   Pay-as-you-go plans — a single `SET key <json>` would be refused (silently: the route wraps
 *   store errors), which would strip every credit saver (carried rows, per-game pricedAt, the
 *   empty-event hold, the stale fallback) for the rest of the day. So the board is written as an
 *   INDEX under the board key (`{ __chunks: [keys], board: {…board, rows: []} }`) plus one key
 *   per chunk of `CFB_PROPS_CHUNK_ROWS` rows, each chunk gzip + base64 (JSON rows compress ~8×),
 *   every key EX boardRetainSec. Chunk keys carry the board's generatedAt so a reader never mixes
 *   an old board's chunks with a new index; a missing chunk reads as no board. A legacy plain-JSON
 *   board under the same key still parses, so the deploy loses nothing already stored.
 *
 * Everything here is best-effort: a missing store env → `propsStore()` is null and the route
 * behaves exactly as before (data cache only); a store error never breaks the route's answer.
 * Nothing in this file touches an MLB key (pl:ledger / pl:bank / pl:noplay) or the CFB ledger.
 *
 * TWO LEAGUES, ONE STORE (2026-09-08, the NFL build): `propsStore(keys)` takes the league's own
 * board / spend prefixes (`PropsStoreKeys`, CFB_PROPS_REDIS by default — the NFL props route hands
 * it its `pl:nfl:props:*` literals), and every key helper takes the same `keys`. The retention
 * (EX CFB_PROPS.boardRetainSec, 36 h) and the Caesars-missing windows stay the CFB constants: both
 * leagues carry the SAME figures (tests/nfl-props-route.test.ts pins NFL_PROPS.boardRetainSec,
 * czMissingRevalidateSec and czMissingWindowSec equal to CFB_PROPS), and `czMissingDue` takes an
 * optional `props` for the day one of them moves.
 */

export const CFB_PROPS_REDIS = {
  board: "pl:cfb:props:v1:",
  spend: "pl:cfb:props:spend:v1:",
} as const;

/** the spend counter outlives its Pacific day by a margin, then is swept by Redis */
export const CFB_PROPS_SPEND_TTL_SEC = 36 * 3600;

/** the board / spend key prefixes of one league's props store (date-suffixed below) */
export type PropsStoreKeys = { board: string; spend: string };

export const propsBoardKey = (date: string, keys: PropsStoreKeys = CFB_PROPS_REDIS) => `${keys.board}${date}`;
export const propsSpendKey = (ptDate: string, keys: PropsStoreKeys = CFB_PROPS_REDIS) => `${keys.spend}${ptDate}`;

/** rows per stored chunk: 400 rows ≈ 380 KB of JSON ≈ 50 KB gzip+base64 — far under Upstash's 1 MB request cap */
export const CFB_PROPS_CHUNK_ROWS = 400;
/** the hard rail every stored request must clear (Upstash Free / Pay-as-you-go REST request cap) */
export const UPSTASH_MAX_REQUEST_BYTES = 1_000_000;

type StoredIndex = { __chunks: string[]; board: CfbPropsBoard };

const utf8Len = (s: string) => Buffer.byteLength(s, "utf8");
export const encodeRows = (rows: CfbPropRow[]): string => gzipSync(Buffer.from(JSON.stringify(rows), "utf8")).toString("base64");
export const decodeRows = (raw: string): CfbPropRow[] | null => {
  try {
    const rows = JSON.parse(gunzipSync(Buffer.from(raw, "base64")).toString("utf8")) as unknown;
    return Array.isArray(rows) ? (rows as CfbPropRow[]) : null;
  } catch {
    return null;
  }
};

/**
 * The board split for the store: the index value (under `propsBoardKey(date)`) and each chunk's
 * key + value. Pure, so a test can check every value against UPSTASH_MAX_REQUEST_BYTES.
 */
export function encodeBoard(date: string, board: CfbPropsBoard, keys: PropsStoreKeys = CFB_PROPS_REDIS): { index: string; chunks: { key: string; value: string }[] } {
  const stamp = Number.isFinite(Date.parse(board.generatedAt)) ? String(Date.parse(board.generatedAt)) : "0";
  const chunks: { key: string; value: string }[] = [];
  for (let i = 0; i < board.rows.length; i += CFB_PROPS_CHUNK_ROWS) {
    chunks.push({ key: `${propsBoardKey(date, keys)}:c:${stamp}:${chunks.length}`, value: encodeRows(board.rows.slice(i, i + CFB_PROPS_CHUNK_ROWS)) });
  }
  const index: StoredIndex = { __chunks: chunks.map((c) => c.key), board: { ...board, rows: [] } };
  return { index: JSON.stringify(index), chunks };
}

/** the chunk keys a stored index names — [] for a legacy plain-JSON board or unreadable input */
export function storedChunkKeys(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const j = JSON.parse(raw) as Partial<StoredIndex>;
    return Array.isArray(j.__chunks) && j.__chunks.every((k) => typeof k === "string") ? j.__chunks : [];
  } catch {
    return [];
  }
}

/**
 * Rebuild a board from the stored index value and its chunk values (in `storedChunkKeys` order):
 * a legacy plain-JSON board reads as itself; a chunked index needs every chunk present and
 * decodable, else null (treated as no stored board). Validates the shape the route relies on.
 */
export function assembleStoredBoard(raw: string | null, chunks: (string | null)[]): CfbPropsBoard | null {
  if (!raw) return null;
  let j: unknown;
  try {
    j = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!j || typeof j !== "object") return null;
  let b: CfbPropsBoard;
  if (Array.isArray((j as StoredIndex).__chunks)) {
    const idx = j as StoredIndex;
    if (!idx.board || typeof idx.board !== "object") return null;
    if (chunks.length !== idx.__chunks.length) return null;
    const rows: CfbPropRow[] = [];
    for (const c of chunks) {
      if (typeof c !== "string") return null;
      const part = decodeRows(c);
      if (!part) return null;
      rows.push(...part);
    }
    b = { ...idx.board, rows };
  } else b = j as CfbPropsBoard;
  if (!Array.isArray(b.rows) || typeof b.generatedAt !== "string") return null;
  if (!Number.isFinite(Date.parse(b.generatedAt))) return null;
  return b;
}

/** the window a stored board is good for: its own `ttlSec` when it carries one, else the 2 h default */
export function boardWindowSec(board: Pick<CfbPropsBoard, "ttlSec">): number {
  const t = board.ttlSec;
  return typeof t === "number" && Number.isFinite(t) && t > 0 ? Math.round(t) : CFB_PROPS.revalidateSec;
}

/** age of a stored board in ms, or null when `generatedAt` is unreadable or in the future */
export function boardAgeMs(board: Pick<CfbPropsBoard, "generatedAt">, now: number): number | null {
  const age = now - Date.parse(board.generatedAt);
  return Number.isFinite(age) && age >= 0 ? age : null;
}

/**
 * Is a stored board still inside its window? The window is the board's OWN `ttlSec` capped by
 * `windowSec` — the window the CURRENT slate calls for (`propsWindowSec(events)`), so a board
 * written pre-kick (7200) is fresh for only liveRevalidateSec once a game inside it is in play.
 */
export function boardFresh(board: Pick<CfbPropsBoard, "generatedAt" | "ttlSec">, now: number, windowSec: number = Number.POSITIVE_INFINITY): boolean {
  const age = boardAgeMs(board, now);
  if (age == null) return false;
  const window = Math.min(boardWindowSec(board), windowSec);
  return age <= window * 1000;
}

/**
 * When was one game's props last pulled from the API? The board's own `pricedAt[gameId]`
 * (INSTRUCTION 42, 2026-09-05), else the board's `generatedAt` for boards written before the field
 * existed. Returns the age in ms, or null when unreadable / in the future (then treated as unpriced).
 */
export function pricedAgeMs(board: Pick<CfbPropsBoard, "generatedAt" | "pricedAt">, gameId: string, now: number): number | null {
  const stamp = board.pricedAt?.[gameId] ?? board.generatedAt;
  const age = now - Date.parse(stamp);
  return Number.isFinite(age) && age >= 0 ? age : null;
}

/**
 * THE CAESARS-MISSING RULE (2026-09-05): is this UPCOMING game due a re-pull ahead of its 2 h carry?
 * Yes when it is on the stored board, `czMissing` is true — the caller's `czMissingGameIds(rows)`
 * verdict: the game HAS rows and some market with rows on it carries no Caesars quote (review fix:
 * keyed on the market, and a game with ZERO rows is never missing — it stays on the 2 h empty-event
 * hold, because a game no book posts props on does not grow any by being asked every 30 min) — its
 * kickoff (`kickoffMs`) is inside CFB_PROPS.czMissingWindowSec ahead of `now`, and its own pricedAt
 * is older than CFB_PROPS.czMissingRevalidateSec (an unreadable stamp reads as due). A live game, a
 * game with Caesars on every market it has, or a kickoff past the window → false: the existing rules
 * decide those.
 */
export function czMissingDue(
  board: Pick<CfbPropsBoard, "generatedAt" | "pricedAt">,
  game: { id: string; status: string; kickoffMs: number },
  czMissing: boolean,
  now: number,
  props: Pick<LeagueProps, "czMissingWindowSec" | "czMissingRevalidateSec"> = CFB_PROPS,
): boolean {
  if (game.status !== "upcoming" || !czMissing) return false;
  const ahead = game.kickoffMs - now;
  if (!Number.isFinite(ahead) || ahead < 0 || ahead > props.czMissingWindowSec * 1000) return false;
  const age = pricedAgeMs(board, game.id, now);
  return age == null || age > props.czMissingRevalidateSec * 1000;
}

export type CfbPropsStore = {
  /** the stored board for the date, or null when absent / unparsable — ANY age; the route decides freshness with `boardFresh` */
  readBoard(date: string): Promise<CfbPropsBoard | null>;
  /** persist the board, retained for CFB_PROPS.boardRetainSec (past its window — the stale fallback) */
  writeBoard(date: string, board: CfbPropsBoard): Promise<void>;
  /** credits spent on props this Pacific day (0 when nothing recorded) */
  readSpend(ptDate: string): Promise<number>;
  /** add `credits` to the day's tally; resolves to the new total */
  addSpend(ptDate: string, credits: number): Promise<number>;
};

/** The store for one league's `keys` (CFB_PROPS_REDIS by default), or null when the Upstash env is not configured (the route then runs data-cache only). */
export function propsStore(keys: PropsStoreKeys = CFB_PROPS_REDIS): CfbPropsStore | null {
  if (!storeEnv()) return null;
  return {
    async readBoard(date) {
      const raw = (await redis(["GET", propsBoardKey(date, keys)])) as string | null;
      if (!raw) return null;
      const chunkKeys = storedChunkKeys(raw);
      const chunks = chunkKeys.length > 0 ? ((await redis(["MGET", ...chunkKeys])) as (string | null)[]) : [];
      return assembleStoredBoard(raw, Array.isArray(chunks) ? chunks : []);
    },
    async writeBoard(date, board) {
      const { index, chunks } = encodeBoard(date, board, keys);
      for (const c of [...chunks.map((x) => x.value), index]) if (utf8Len(c) > UPSTASH_MAX_REQUEST_BYTES) throw new Error("store chunk over 1 MB");
      // chunks first, then the index that names them — a reader never sees an index whose chunks are not there yet
      await Promise.all(chunks.map((c) => redis(["SET", c.key, c.value, "EX", CFB_PROPS.boardRetainSec])));
      await redis(["SET", propsBoardKey(date, keys), index, "EX", CFB_PROPS.boardRetainSec]);
    },
    async readSpend(ptDate) {
      const raw = (await redis(["GET", propsSpendKey(ptDate, keys)])) as string | number | null;
      const n = Number(raw ?? 0);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
    },
    async addSpend(ptDate, credits) {
      const n = Math.max(0, Math.round(credits));
      const total = (await redis(["INCRBY", propsSpendKey(ptDate, keys), n])) as number;
      await redis(["EXPIRE", propsSpendKey(ptDate, keys), CFB_PROPS_SPEND_TTL_SEC]);
      return Number.isFinite(Number(total)) ? Number(total) : n;
    },
  };
}

/** How many of `wanted` events the day's budget still buys at `perEvent` credits each (0..wanted). */
export function affordableEvents(wanted: number, spent: number, budget: number = CFB_PROPS.dailyBudget, perEvent: number = CFB_PROPS.measuredCreditsPerEvent): number {
  if (wanted <= 0) return 0;
  if (spent + wanted * perEvent <= budget) return wanted;
  const room = Math.floor((budget - spent) / perEvent);
  return Math.max(0, Math.min(wanted, room));
}

/**
 * Credits a pull cost. When two or more event responses carried `x-requests-used`, the real
 * delta (last − first) covers every call but the first, so the first call's own cost is added
 * back at the measured rate; an all-equal reading means the data cache answered (free). With
 * fewer than two readings, fetched × the measured rate — the safe direction is to over-count.
 */
export function pullCredits(usedReadings: number[], fetched: number, perEvent: number = CFB_PROPS.measuredCreditsPerEvent): number {
  if (fetched <= 0) return 0;
  const used = usedReadings.filter((n) => Number.isFinite(n));
  if (used.length >= 2) {
    const delta = Math.max(...used) - Math.min(...used);
    return delta > 0 ? delta + perEvent : 0;
  }
  return fetched * perEvent;
}
