/**
 * CFB_DESK — the College Football DeskHandles (2026-09-08, the NFL build): the CFB league
 * config plus the store / sync / client / hooks the shared football surfaces reach through
 * `useLeague()` (src/components/football/LeagueContext.tsx, whose default value is this
 * object, so every existing CFB surface keeps working without a provider). Every handle is
 * today's named export, unchanged in name and signature; the NFL twin is src/lib/nfl/desk.ts.
 */
import type { DeskHandles } from "@/lib/football/league";
import { CFB_LEAGUE } from "@/lib/cfb/rules";
import {
  CFB_CHANGE_EVENT,
  CFB_SYNC_EVENT,
  readCfbLedger,
  useCfbLedger,
  gradeCfb,
  lockCfb,
  wipeCfbDevice,
  importCfbLedger,
  exportCfbLedger,
  addCfbBankAdjustment,
  getCfbBankroll,
  cfbExposure,
} from "@/lib/cfb/store";
import { syncCfbNow, useCfbSyncState } from "@/lib/cfb/sync";
import {
  CFB_STALE_MS,
  CFB_PROPS_STALE_MS,
  cfbQueryKey,
  cfbPropsQueryKey,
  loadCfbSlate,
  loadCfbFinals,
  loadCfbProps,
  cfbPropsStaleMs,
  cfbCacheLabel,
  cfbPricedAtLabel,
} from "@/lib/cfb/client";
import { useCfbDesk, useCfbBankroll } from "@/lib/cfb/useCfbDesk";

export const CFB_DESK: DeskHandles = {
  ...CFB_LEAGUE,
  store: {
    CHANGE_EVENT: CFB_CHANGE_EVENT,
    SYNC_EVENT: CFB_SYNC_EVENT,
    readLedger: readCfbLedger,
    useLedger: useCfbLedger,
    grade: gradeCfb,
    lock: lockCfb,
    wipeDevice: wipeCfbDevice,
    importLedger: importCfbLedger,
    exportLedger: exportCfbLedger,
    addBankAdjustment: addCfbBankAdjustment,
    getBankroll: getCfbBankroll,
    exposure: cfbExposure,
  },
  sync: { syncNow: syncCfbNow, useSyncState: useCfbSyncState },
  client: {
    STALE_MS: CFB_STALE_MS,
    PROPS_STALE_MS: CFB_PROPS_STALE_MS,
    queryKey: cfbQueryKey,
    propsQueryKey: cfbPropsQueryKey,
    loadSlate: loadCfbSlate,
    loadFinals: loadCfbFinals,
    loadProps: loadCfbProps,
    propsStaleMs: cfbPropsStaleMs,
    cacheLabel: cfbCacheLabel,
    pricedAtLabel: cfbPricedAtLabel,
  },
  useDesk: useCfbDesk,
  useBankroll: useCfbBankroll,
};
