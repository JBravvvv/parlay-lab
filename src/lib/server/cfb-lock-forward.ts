import { CFB_LOCK } from "@/lib/cfb/rules";

/**
 * THE SCHEDULER'S CFB SELF-FORWARD (INSTRUCTION 45, 2026-09-05). No new external ticker: the
 * MLB scheduler poke, once its own decision is made, forwards to /api/cfb/lock with the same
 * cron header it already sends /api/generate, and reports the answer under `cfb`.
 *
 * FIRE-AND-REPORT. Nothing in here throws: a refused, slow, offline or non-JSON CFB answer
 * becomes `{ forwarded: false, error }` or `{ forwarded: true, status, result }`, and
 * `attachCfb` copies the MLB body and status through untouched — the CFB desk can never change
 * an MLB outcome or status code. The forward aborts at CFB_LOCK.forwardTimeoutMs so it can never
 * cost the poke its 90 s function budget.
 */

export type CfbForwardResult = { forwarded: true; status: number; result: unknown } | { forwarded: false; error: string };

type FetchLike = (input: URL, init: RequestInit) => Promise<Response>;

/** `slot` (INSTRUCTION 49 fix round, 2026-09-09): the refill slot the scheduler's tick decided at
    ITS clock (decideRefillTick), forwarded as ?slot= so the lock route honours the same slot even
    when this forward lands past slot + 15 min; null/undefined sends no query at all. */
export async function forwardCfbLock(origin: string, secret: string, fetchImpl: FetchLike = (u, i) => fetch(u, i), slot?: string | null): Promise<CfbForwardResult> {
  try {
    const url = new URL("/api/cfb/lock", origin);
    if (slot) url.searchParams.set("slot", slot);
    const r = await fetchImpl(url, {
      headers: { "x-cron-key": secret },
      cache: "no-store",
      signal: AbortSignal.timeout(CFB_LOCK.forwardTimeoutMs),
    });
    let result: unknown = null;
    try {
      result = await r.json();
    } catch {
      result = { error: "cfb lock returned non-JSON" };
    }
    return { forwarded: true, status: r.status, result };
  } catch (e) {
    return { forwarded: false, error: (e as Error).message };
  }
}

/**
 * The MLB response with `cfb` added to its JSON body — same status, every MLB field as it was.
 * A body that is not a JSON object (never, from NextResponse.json — but stated) is returned
 * as-is with the CFB result dropped rather than risk the MLB answer.
 */
export async function attachCfb(res: Response, cfb: CfbForwardResult): Promise<{ status: number; body: Record<string, unknown> } | null> {
  let parsed: unknown;
  try {
    parsed = await res.clone().json();
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return { status: res.status, body: { ...(parsed as Record<string, unknown>), cfb } };
}
