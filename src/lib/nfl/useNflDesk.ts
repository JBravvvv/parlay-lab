"use client";

import { useBankrollOf, useDeskOf, type DeskHookHandles } from "@/lib/football/useDesk";
import {
  NFL_STALE_MS,
  NFL_PROPS_STALE_MS,
  nflQueryKey,
  nflPropsQueryKey,
  loadNflSlate,
  loadNflFinals,
  loadNflProps,
  nflPropsStaleMs,
  nflCacheLabel,
  nflPricedAtLabel,
} from "./client";
import { NFL_BANK_BASE } from "./rules";
import { NFL_STORE } from "./store";

/**
 * THE NFL DESK HOOKS (2026-09-08): one date, one bankroll and one cached slate query per
 * (date, bankroll) shared by every NFL surface. Bodies in src/lib/football/useDesk.ts; the
 * handles are built here from the NFL client and device store directly (not from ./desk.ts,
 * which imports this file).
 */

const NFL_HANDLES: DeskHookHandles = {
  client: {
    STALE_MS: NFL_STALE_MS,
    PROPS_STALE_MS: NFL_PROPS_STALE_MS,
    queryKey: nflQueryKey,
    propsQueryKey: nflPropsQueryKey,
    loadSlate: loadNflSlate,
    loadFinals: loadNflFinals,
    loadProps: loadNflProps,
    propsStaleMs: nflPropsStaleMs,
    cacheLabel: nflCacheLabel,
    pricedAtLabel: nflPricedAtLabel,
  },
  store: NFL_STORE,
  bankBase: NFL_BANK_BASE,
};

/** The NFL bankroll off the device store — null until mount so SSR and the first client render agree. */
export function useNflBankroll(): number | null {
  return useBankrollOf(NFL_STORE);
}

/** Date + slate for the NFL desk: today (Pacific), advancing once to the next slate date the feed
    lists when today is empty — Tuesday shows Thursday night's board. */
export function useNflDesk() {
  return useDeskOf(NFL_HANDLES);
}
