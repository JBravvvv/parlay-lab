"use client";

import { makeSync } from "@/lib/football/sync";
import { NFL_LEAGUE } from "./rules";
import { NFL_STORE, NFL_SYNC_EVENT } from "./store";

/**
 * Client side of NFL ledger sync (2026-09-08) — the NFL record's own pull → merge → push loop
 * against its own route (NFL_ROUTES.ledger) and its own cloud blobs, behind the ONE sync phrase
 * Josh already entered in Settings. The loop body is src/lib/football/sync.ts `makeSync`; this
 * instance owns its own state cell, change detector and in-flight latch, so it never blocks or
 * mislabels the CFB loop running beside it.
 */

const L = makeSync({ ...NFL_LEAGUE, store: NFL_STORE });

export { NFL_SYNC_EVENT };
/** the route this loop talks to — NFL_ROUTES.ledger, pinned by tests/nfl-desk.test.ts */
export const NFL_SYNC_ENDPOINT = L.ENDPOINT;
export const useNflSyncState = L.useSyncState;
export const syncNflNow = L.syncNow;
/** Mounted once in the app shell on its OWN line next to the CFB beacon — the whole NFL auto-sync loop. */
export const useNflSyncBeacon = L.useSyncBeacon;
