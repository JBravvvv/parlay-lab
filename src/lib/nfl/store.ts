"use client";

import { makeDeviceStore } from "@/lib/football/store";
import { NFL_KEYS, NFL_LEAGUE } from "./rules";

/**
 * THE NFL DEVICE STORE (2026-09-08; Josh, verbatim: "NFL needs to be built NOW"). The NFL ledger
 * and bank live under their OWN two localStorage keys (NFL_KEYS) — never the CFB desk's and never
 * the MLB desk's — on the same rails the College Football record runs on
 * (src/lib/football/store.ts `makeDeviceStore`): append-only by date, a lock is once per date,
 * grades overlay through ONE rule, sync merges through the shared kernel. Every entry is stamped
 * `sport: "nfl"` and a record carrying any other stamp is refused on import.
 *
 * This instance owns its own version counter, snapshot cache and subscriptions: a CFB write on
 * the same page leaves the NFL snapshot untouched, and an NFL subscriber hears only NFL events.
 */

const S = makeDeviceStore({ ...NFL_LEAGUE, keys: NFL_KEYS });

export const NFL_CHANGE_EVENT = "pl:nfl-ledger-change";
/** dispatched by ./sync after a cloud merge rewrote the device record */
export const NFL_SYNC_EVENT = "pl:nfl-ledger-sync";

export type { CfbGrading as NflGrading, CfbImportResult as NflImportResult, CfbLedgerSnapshot as NflLedgerSnapshot } from "@/lib/football/store";

/** The NFL DeviceStore itself — the sync loop and the desk handles read through it. */
export const NFL_STORE = S;

export const readNflRaw = S.readRaw;
export const isNflEntry = S.isEntry;
/** Only NFL entries, funT defaulted, ascending by date. Anything else on the wire is dropped. */
export const nflEntriesOf = S.entriesOf;
export const readNflLedger = S.readLedger;
/** Replaces the device record. Returns false when the device could not persist it. */
export const writeNflLedger = S.writeLedger;
export const findNflEntry = S.findEntry;
export const upsertNflEntries = S.upsertEntries;
export const upsertNflEntry = S.upsertEntry;
export const applyNflGrading = S.applyGrading;
export const readNflBankStore = S.readBankStore;
export const writeNflBankStore = S.writeBankStore;
export const getNflBankStore = S.getBankStore;
export const addNflBankAdjustment = S.addBankAdjustment;
/** The one true NFL bankroll: base + logged adjustments + realized graded NFL P/L. */
export const getNflBankroll = S.getBankroll;
/** Locked exposure (CORE + FUN stakes) for a slate date, in dollars. */
export const nflExposure = S.exposure;
export const exportNflLedger = S.exportLedger;
/** Merge an exported record into this device; refuses any entry not stamped sport "nfl". */
export const importNflLedger = S.importLedger;
/** Drops the NFL ledger and bank from THIS device only (the cloud copy refills it on sync). */
export const wipeNflDevice = S.wipeDevice;
/** Lock a built card for its slate date. A date already locked is returned as-is with
    `refused: true` — the second press of LOCK can never re-stake a Sunday. */
export const lockNfl = S.lock;
/** Grade a locked date against ESPN finals and store the verdict. Null when nothing is locked. */
export const gradeNfl = S.grade;
/** Everything the NFL Ledger / Builder / Settings need, live from the device record. */
export const useNflLedger = S.useLedger;
