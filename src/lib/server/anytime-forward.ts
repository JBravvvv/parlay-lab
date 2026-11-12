/**
 * THE SCHEDULER AS ONE CALLER AMONG SEVERAL (any-time engine, 2026-11-12).
 *
 * The 15-minute scheduler poke forwards to POST /api/anytime/run with the cron header it already
 * holds, beside the football lock forwards. It is the same route the app button and the command
 * line call; the scheduler gets no special path, no slot and no window. The engine's own cadence
 * decides whether a poke prices anything (a game days away is looked at every 12 hours, a game
 * inside the last hour every 5 minutes), so a poke that has nothing due costs zero Odds credits
 * and still writes the heartbeat.
 *
 * FIRE AND LEAVE THE ANSWER ALONE: nothing here throws, and the scheduler puts nothing of this in
 * its own reply (that reply is pinned field for field by its tests). An engine failure is reported
 * by the engine itself: the heartbeat, GET /api/anytime/health, the run record and the push alert.
 */

export const ANYTIME_FORWARD_TIMEOUT_MS = 25_000;

export type AnytimeForwardResult = { forwarded: true; status: number; result: Record<string, unknown> } | { forwarded: false; error: string };

type FetchLike = (input: URL, init: RequestInit) => Promise<Response>;

const count = (v: unknown) => (Array.isArray(v) ? v.length : 0);

/** The few fields of a run a caller keeps for its own log (the run record holds the rest). */
export function runLineOf(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "anytime run returned non-JSON" };
  const b = body as Record<string, unknown>;
  const odds = (b.odds && typeof b.odds === "object" ? b.odds : {}) as Record<string, unknown>;
  return {
    status: b.status ?? null,
    runId: b.runId ?? null,
    picks: count(b.picks),
    candidates: b.candidates ?? null,
    graded: count(b.graded),
    skipped: b.skipped ?? [],
    credits: odds.credits ?? 0,
    remaining: odds.remaining ?? null,
    errors: Array.isArray(b.errors) ? b.errors.slice(0, 5) : b.error ? [b.error] : [],
  };
}

export async function forwardAnytimeRun(origin: string, secret: string, fetchImpl: FetchLike = (u, i) => fetch(u, i)): Promise<AnytimeForwardResult> {
  try {
    const r = await fetchImpl(new URL("/api/anytime/run", origin), {
      method: "POST",
      headers: { "x-cron-key": secret },
      cache: "no-store",
      signal: AbortSignal.timeout(ANYTIME_FORWARD_TIMEOUT_MS),
    });
    let body: unknown = null;
    try {
      body = await r.json();
    } catch {
      body = null;
    }
    return { forwarded: true, status: r.status, result: runLineOf(body) };
  } catch (e) {
    return { forwarded: false, error: (e as Error).message };
  }
}
