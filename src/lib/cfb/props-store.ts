import { redis, storeEnv } from "@/lib/server/store";
import { CFB_PROPS } from "./rules";
import type { CfbPropsBoard } from "./props-types";

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
 * Everything here is best-effort: a missing store env → `propsStore()` is null and the route
 * behaves exactly as before (data cache only); a store error never breaks the route's answer.
 * Nothing in this file touches an MLB key (pl:ledger / pl:bank / pl:noplay) or the CFB ledger.
 */

export const CFB_PROPS_REDIS = {
  board: "pl:cfb:props:v1:",
  spend: "pl:cfb:props:spend:v1:",
} as const;

/** the spend counter outlives its Pacific day by a margin, then is swept by Redis */
export const CFB_PROPS_SPEND_TTL_SEC = 36 * 3600;

export const propsBoardKey = (date: string) => `${CFB_PROPS_REDIS.board}${date}`;
export const propsSpendKey = (ptDate: string) => `${CFB_PROPS_REDIS.spend}${ptDate}`;

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

/** The store, or null when the Upstash env is not configured (the route then runs data-cache only). */
export function propsStore(): CfbPropsStore | null {
  if (!storeEnv()) return null;
  return {
    async readBoard(date) {
      const raw = (await redis(["GET", propsBoardKey(date)])) as string | null;
      if (!raw) return null;
      let b: CfbPropsBoard;
      try {
        b = JSON.parse(raw) as CfbPropsBoard;
      } catch {
        return null;
      }
      if (!b || typeof b !== "object" || !Array.isArray(b.rows) || typeof b.generatedAt !== "string") return null;
      if (!Number.isFinite(Date.parse(b.generatedAt))) return null;
      return b;
    },
    async writeBoard(date, board) {
      await redis(["SET", propsBoardKey(date), JSON.stringify(board), "EX", CFB_PROPS.boardRetainSec]);
    },
    async readSpend(ptDate) {
      const raw = (await redis(["GET", propsSpendKey(ptDate)])) as string | number | null;
      const n = Number(raw ?? 0);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
    },
    async addSpend(ptDate, credits) {
      const n = Math.max(0, Math.round(credits));
      const total = (await redis(["INCRBY", propsSpendKey(ptDate), n])) as number;
      await redis(["EXPIRE", propsSpendKey(ptDate), CFB_PROPS_SPEND_TTL_SEC]);
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
