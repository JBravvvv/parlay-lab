/**
 * NFL_DESK — the NFL DeskHandles (2026-09-08, the NFL build): the NFL league config plus the
 * store / sync / client / hooks the shared football surfaces reach through `useLeague()`
 * (src/components/football/LeagueContext.tsx). An NFL surface is
 * `<LeagueProvider desk={NFL_DESK}><CfbX /></LeagueProvider>`; the CFB twin is src/lib/cfb/desk.ts.
 */
import type { DeskHandles } from "@/lib/football/league";
import { NFL_LEAGUE } from "./rules";
import {
  NFL_CHANGE_EVENT,
  NFL_SYNC_EVENT,
  readNflLedger,
  useNflLedger,
  gradeNfl,
  lockNfl,
  wipeNflDevice,
  importNflLedger,
  exportNflLedger,
  addNflBankAdjustment,
  getNflBankroll,
  nflExposure,
} from "./store";
import { syncNflNow, useNflSyncState } from "./sync";
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
import { useNflDesk, useNflBankroll } from "./useNflDesk";

export const NFL_DESK: DeskHandles = {
  ...NFL_LEAGUE,
  store: {
    CHANGE_EVENT: NFL_CHANGE_EVENT,
    SYNC_EVENT: NFL_SYNC_EVENT,
    readLedger: readNflLedger,
    useLedger: useNflLedger,
    grade: gradeNfl,
    lock: lockNfl,
    wipeDevice: wipeNflDevice,
    importLedger: importNflLedger,
    exportLedger: exportNflLedger,
    addBankAdjustment: addNflBankAdjustment,
    getBankroll: getNflBankroll,
    exposure: nflExposure,
  },
  sync: { syncNow: syncNflNow, useSyncState: useNflSyncState },
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
  useDesk: useNflDesk,
  useBankroll: useNflBankroll,
};
