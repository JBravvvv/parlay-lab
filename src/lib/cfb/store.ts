"use client";

import { makeDeviceStore } from "@/lib/football/store";
import { CFB_KEYS, CFB_LEAGUE } from "./rules";

/**
 * THE CFB DEVICE STORE (INSTRUCTION 38, 2026-09-05, Josh: "Ledger & Allotted $ for College
 * Football should be separate"). The College Football ledger and bank live under their OWN
 * two localStorage keys (CFB_KEYS) — never the MLB desk's — with the same shape rules the MLB
 * record follows: append-only by date, a lock is once per date, grades overlay, sync merges.
 *
 * SINCE 2026-09-08 (the NFL build) the rails themselves live in src/lib/football/store.ts as
 * `makeDeviceStore(cfg)`; this file is the College Football INSTANCE of them — every one of the
 * names below is today's export, same name, same signature, bound to CFB_KEYS / the CFB events /
 * the CFB sport stamp / the CFB bank base through CFB_LEAGUE. The NFL instance is
 * src/lib/nfl/store.ts and owns its own version counter, snapshot cache and subscriptions, so the
 * two desks on one page never share state.
 */

const S = makeDeviceStore({ ...CFB_LEAGUE, keys: { ledger: CFB_KEYS.ledger, bank: CFB_KEYS.bank } });

export const CFB_CHANGE_EVENT = "pl:cfb-ledger-change";
/** dispatched by ./sync after a cloud merge rewrote the device record */
export const CFB_SYNC_EVENT = "pl:cfb-ledger-sync";

export type { CfbGrading, CfbStats, CfbImportResult, CfbLedgerSnapshot } from "@/lib/football/store";

/** The CFB DeviceStore itself — the sync loop and the desk handles read through it. */
export const CFB_STORE = S;

/** The raw stored strings — ./sync's change detector compares these between ticks. */
export const readCfbRaw = S.readRaw;
export const isCfbEntry = S.isEntry;
/** Only CFB entries, funT defaulted, ascending by date. Anything else on the wire is dropped. */
export const cfbEntriesOf = S.entriesOf;
export const readCfbLedger = S.readLedger;
/** Replaces the device record. Returns false when the device could not persist it. */
export const writeCfbLedger = S.writeLedger;
export const findCfbEntry = S.findEntry;
export const upsertCfbEntries = S.upsertEntries;
export const upsertCfbEntry = S.upsertEntry;
export const applyCfbGrading = S.applyGrading;
export const readCfbBankStore = S.readBankStore;
export const writeCfbBankStore = S.writeBankStore;
/** The persisted bank store, initialized on first use. */
export const getCfbBankStore = S.getBankStore;
export const addCfbBankAdjustment = S.addBankAdjustment;
/** The one true CFB bankroll: base + logged adjustments + realized graded CFB P/L. Read-only
    (no first-use write) so it is safe to call from a render body or a query key. */
export const getCfbBankroll = S.getBankroll;
/** Locked exposure (CORE + FUN stakes) for a slate date, in dollars. */
export const cfbExposure = S.exposure;
export const exportCfbLedger = S.exportLedger;
/** Merge an exported record into this device (union by date, richer day wins, accruals
    overlaid — the same kernel sync uses). Refuses any entry not stamped sport "cfb". */
export const importCfbLedger = S.importLedger;
/** Drops the CFB ledger and bank from THIS device only (the cloud copy refills it on sync). */
export const wipeCfbDevice = S.wipeDevice;
/** Lock a built card for its slate date. A date already locked is returned as-is with
    `refused: true` — the second press of LOCK can never re-stake a Saturday. */
export const lockCfb = S.lock;
/** Grade a locked date against ESPN finals and store the verdict. Null when nothing is locked. */
export const gradeCfb = S.grade;
/** Everything the CFB Ledger / Builder / Settings need, live from the device record. Empty on
    the server and during hydration; the real record appears right after mount. */
export const useCfbLedger = S.useLedger;
