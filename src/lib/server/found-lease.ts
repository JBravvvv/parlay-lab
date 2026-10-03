import { redis } from "@/lib/server/store";

/**
 * THE MLB FOUND-DAY LEASE (2026-10-03, src/lib/found-mode.ts): on a found day every card-touching run
 * (a generate lock pass, the scheduler's backfill) appends what it finds, so two overlapping runs could
 * each read the same carry and seat the same open room twice. One run at a time holds
 * `pl:found:lease:<date>` for at most five minutes (the generate budget).
 *
 * The value is a per-run token and the release deletes the key only while it still holds THIS run's
 * token, so a run that outlived the five minutes can never delete the lease of the run after it.
 * Kept out of app/api/generate/route.ts on purpose: that route's DEL/EXPIRE lines are pinned to the
 * board keys (tests/calibration-window.test.ts — the prediction store is never pruned).
 */
export const FOUND_LEASE_PX = 300_000;
export const foundLeaseKey = (date: string) => `pl:found:lease:${date}`;

/** the run's token when the lease was taken, null when another run holds it */
export async function takeFoundLease(date: string, who: string, now: number): Promise<string | null> {
  const token = `${who}-${now}-${Math.random().toString(36).slice(2, 10)}`;
  const r = await redis(["SET", foundLeaseKey(date), token, "NX", "PX", String(FOUND_LEASE_PX)]);
  return r === "OK" ? token : null;
}

/** release the lease only if it is still ours — best effort, never throws (it expires on its own) */
export async function releaseFoundLease(date: string, token: string | null): Promise<void> {
  if (!token) return;
  try {
    const key = foundLeaseKey(date);
    if ((await redis(["GET", key])) === token) await redis(["DEL", key]);
  } catch {
    /* the lease expires on its own five minutes after it was taken */
  }
}
