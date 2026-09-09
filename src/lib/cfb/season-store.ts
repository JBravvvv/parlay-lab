"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { CFB_SEASON, priceSeasonParlay, type SeasonLeg, type SeasonResult, type SeasonTicket } from "./season";

/**
 * THE SEASON LEDGER (INSTRUCTION 46, 2026-09-08 — "a bunch of season long tickets"). A zustand
 * store persisted under its OWN localStorage key, CFB_SEASON_KEY ("pl_cfb_season") — never the
 * CFB daily ledger's (CFB_KEYS.ledger, src/lib/cfb/rules.ts) and never an MLB key — so a season
 * ticket can neither enter the $150 / $25 daily rails nor be swept by the daily grader. The
 * daily CFB record stays exactly what src/lib/cfb/store.ts says it is.
 *
 * Paper only, hand-settled: season props settle in December and no feed carries the book's
 * line, so there is NO auto-grading here — `settle(id, result)` is Josh's thumb, and a settled
 * verdict can be re-settled (a mis-tap is the likelier event than a book reversal). The store
 * computes nothing about prices: `lock` takes the priced legs the builder already holds and
 * stamps the parlay math from ./season's `priceSeasonParlay` on the ticket at lock, so the
 * ledger prints what the ticket was worth WHEN it was locked, not what the projection says now
 * (the pace line is the live read; see `paceOf`).
 *
 * Storage is guarded exactly as the daily store's is: no `localStorage` (SSR, vitest's node
 * environment, a sealed private-mode browser) → a no-op storage, reads as empty, and the page
 * still renders. `skipHydration` keeps the first client render equal to the SSR HTML (the
 * hydration rule the desk follows everywhere); the page calls `rehydrateSeasonStore()` on mount.
 */

export const CFB_SEASON_KEY = "pl_cfb_season";

export type SeasonState = {
  tickets: SeasonTicket[];
  /** lock a paper ticket; the stake is clamped to whole dollars in [1, CFB_SEASON.ticketMax]; null on an empty slip */
  lock: (legs: SeasonLeg[], stake: number, now?: number) => SeasonTicket | null;
  settle: (id: string, result: SeasonResult, now?: number) => void;
  remove: (id: string) => void;
  /** wipe the season ledger on this device (Settings-style reset; nothing else is touched) */
  clear: () => void;
};

function storage(): Storage {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    /* sealed */
  }
  return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined, clear: () => undefined, key: () => null, length: 0 } as Storage;
}

/** the stake rule, pure: whole dollars, at least $1, never above the fun-money cap */
export function clampSeasonStake(stake: number): number {
  if (!Number.isFinite(stake)) return CFB_SEASON.ticketDefault;
  return Math.max(1, Math.min(CFB_SEASON.ticketMax, Math.round(stake)));
}

export function isSeasonTicket(x: unknown): x is SeasonTicket {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const t = x as Partial<SeasonTicket>;
  return typeof t.id === "string" && typeof t.lockedAt === "number" && typeof t.stake === "number" && Array.isArray(t.legs) && t.legs.length > 0 && typeof t.dec === "number";
}

let seq = 0;
const ticketId = (now: number) => `season-${now}-${++seq}`;

export const useSeasonStore = create<SeasonState>()(
  persist(
    (set, get) => ({
      tickets: [],
      lock: (legs, stake, now = Date.now()) => {
        const calc = priceSeasonParlay(legs);
        if (!calc) return null;
        const ticket: SeasonTicket = {
          id: ticketId(now),
          lockedAt: now,
          stake: clampSeasonStake(stake),
          legs: legs.map((l) => ({ ...l })),
          dec: calc.dec,
          prob: calc.probAdj,
          evPct: calc.evPct,
          result: "open",
          settledAt: null,
        };
        set({ tickets: [ticket, ...get().tickets] });
        return ticket;
      },
      settle: (id, result, now = Date.now()) =>
        set({ tickets: get().tickets.map((t) => (t.id === id ? { ...t, result, settledAt: result === "open" ? null : now } : t)) }),
      remove: (id) => set({ tickets: get().tickets.filter((t) => t.id !== id) }),
      clear: () => set({ tickets: [] }),
    }),
    {
      name: CFB_SEASON_KEY,
      version: 1,
      storage: createJSONStorage(storage),
      partialize: (s) => ({ tickets: s.tickets }),
      skipHydration: true,
      /* anything on the wire that is not a ticket is dropped, never crashes the page */
      merge: (persisted, current) => {
        const p = persisted as { tickets?: unknown } | undefined;
        const tickets = Array.isArray(p?.tickets) ? p!.tickets.filter(isSeasonTicket) : [];
        return { ...current, tickets };
      },
    },
  ),
);

/** Read the device record into the store (the page's mount effect). Safe to call anywhere. */
export function rehydrateSeasonStore(): void {
  try {
    void useSeasonStore.persist.rehydrate();
  } catch {
    /* no storage — the store stays empty */
  }
}
