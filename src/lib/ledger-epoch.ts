/**
 * LEDGER EPOCHS (2026-08-15, Josh: "Clear the ledger"). A plain delete cannot clear this
 * ledger: the sync merge is append-only by design ("no device can ever erase another's
 * locked days"), so any device holding the old season would push it straight back on its
 * next heartbeat. An epoch bump is the clear that cannot resurrect:
 *
 *   - the SERVER archives the old blob under an immutable key (SET NX — first archive
 *     wins), then resets to {ledger: [], epoch: 2};
 *   - CLIENTS that see a newer epoch archive their local copy, drop it, and adopt;
 *   - PUTs carrying an older epoch (stale cached bundles) are answered with the current
 *     state but their entries are NEVER merged.
 *
 * Nothing is destroyed — epoch 1 (the real-money record, including Josh's placed /
 * actualStake answers) lives forever under the archive keys. Epoch 2 is the PAPER era
 * (see paper-mode.ts). Pure module: client and server both import it.
 */

export const LEDGER_EPOCH = 2;

/** server: the immutable snapshot of the epoch-1 blob */
export const EPOCH_ARCHIVE_KEY = "pl:ledger:archive:e1";
/** client: localStorage keys for the local epoch + the local archive */
export const LOCAL_EPOCH_KEY = "pl_ledger_epoch";
export const LOCAL_ARCHIVE_KEY = "pl_ledger_archive_e1";

export function decideEpochMigration(stored: { epoch?: number; ledger?: unknown[] } | null | undefined): {
  migrate: boolean;
  archive: boolean;
} {
  const cur = Number(stored?.epoch ?? 1) || 1;
  if (cur >= LEDGER_EPOCH) return { migrate: false, archive: false };
  return { migrate: true, archive: (stored?.ledger?.length ?? 0) > 0 };
}

/** A PUT may merge ledger entries only if the sender knows the current epoch. */
export function mergeAllowed(bodyEpoch: unknown): boolean {
  const n = Number(bodyEpoch ?? 1);
  return Number.isFinite(n) && n >= LEDGER_EPOCH;
}
