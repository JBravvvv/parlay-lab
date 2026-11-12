import { redis } from "@/lib/server/store";
import { EPOCH_ARCHIVE_KEY, LEDGER_EPOCH, decideEpochMigration } from "@/lib/ledger-epoch";
import { LEDGER_STORE_KEY } from "@/lib/server/lock-card";
import { readStoredLedger } from "@/lib/server/ledger-read";

/**
 * The server half of the epoch-2 migration (2026-08-15, Josh: "Clear the ledger").
 * Idempotent and lazy: the ledger route runs it on every authed request and the
 * scheduler on every poke, so whichever arrives first performs the one-time
 * archive-then-reset and every later call is a cheap no-op read.
 *
 * ARCHIVE BEFORE RESET, always: the epoch-1 blob (the real-money season, with Josh's
 * placed/actualStake answers) is copied to EPOCH_ARCHIVE_KEY with SET NX — the first
 * archive wins and a re-run can never clobber it with the post-reset empty blob.
 */
export async function ensureLedgerEpoch(): Promise<{ migrated: boolean; archived: boolean }> {
  /* AUDIT D-1: a stored value nothing can parse is NOT an epoch-1 ledger to clear. readStoredLedger
     copies it aside once and throws, so the reset below is never reached over a record that may
     still be recoverable. Absent stays null and migrates exactly as before. */
  const read = await readStoredLedger<unknown>(LEDGER_STORE_KEY);
  const raw = read?.raw ?? null;
  const stored: { epoch?: number; ledger?: unknown[] } | null = read?.stored ?? null;
  const d = decideEpochMigration(stored);
  if (!d.migrate) return { migrated: false, archived: false };
  if (d.archive && raw) {
    await redis(["SET", EPOCH_ARCHIVE_KEY, raw, "NX"]);
  }
  await redis(["SET", LEDGER_STORE_KEY, JSON.stringify({ ledger: [], epoch: LEDGER_EPOCH, at: Date.now() })]);
  return { migrated: true, archived: d.archive };
}
