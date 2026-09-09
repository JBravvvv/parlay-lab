import { NFL_LOCK } from "@/lib/nfl/rules";

/**
 * THE SCHEDULER'S NFL SELF-FORWARD (2026-09-08, the NFL build) — the sibling of
 * src/lib/server/cfb-lock-forward.ts, on the NFL rails. No new external ticker: the MLB
 * scheduler poke, once its own decision is made, forwards to /api/nfl/lock with the same cron
 * header it already sends /api/generate, CONCURRENTLY with the CFB forward, and reports the
 * answer under `nfl`.
 *
 * FIRE-AND-REPORT. Nothing in here throws: a refused, slow, offline or non-JSON NFL answer
 * becomes `{ forwarded: false, error }` or `{ forwarded: true, status, result }`, and
 * `attachNfl` copies the body and status through untouched — the NFL desk can never change an
 * MLB (or CFB) outcome or status code. The forward aborts at NFL_LOCK.forwardTimeoutMs (25 s):
 * because the two football forwards run side by side, the tick's worst case stays
 * max(cfb 25 s, nfl 25 s) + the ~60 s generate = 85 s inside the scheduler's 90 s budget.
 */

export type NflForwardResult = { forwarded: true; status: number; result: unknown } | { forwarded: false; error: string };

type FetchLike = (input: URL, init: RequestInit) => Promise<Response>;

export async function forwardNflLock(origin: string, secret: string, fetchImpl: FetchLike = (u, i) => fetch(u, i)): Promise<NflForwardResult> {
  try {
    const r = await fetchImpl(new URL("/api/nfl/lock", origin), {
      headers: { "x-cron-key": secret },
      cache: "no-store",
      signal: AbortSignal.timeout(NFL_LOCK.forwardTimeoutMs),
    });
    let result: unknown = null;
    try {
      result = await r.json();
    } catch {
      result = { error: "nfl lock returned non-JSON" };
    }
    return { forwarded: true, status: r.status, result };
  } catch (e) {
    return { forwarded: false, error: (e as Error).message };
  }
}

/**
 * The response with `nfl` added to its JSON body — same status, every other field as it was.
 * A body that is not a JSON object (never, from NextResponse.json — but stated) is returned
 * as-is with the NFL result dropped rather than risk the answer already built.
 */
export async function attachNfl(res: Response, nfl: NflForwardResult): Promise<{ status: number; body: Record<string, unknown> } | null> {
  let parsed: unknown;
  try {
    parsed = await res.clone().json();
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return { status: res.status, body: { ...(parsed as Record<string, unknown>), nfl } };
}
