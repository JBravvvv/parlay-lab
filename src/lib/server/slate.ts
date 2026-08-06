import { LINEUP_LEAD_MS } from "@/lib/board-coverage";

/**
 * THE ONE COPY OF THE STATSAPI SLATE READ (2026-08-06, operator items 2+3).
 *
 * Extracted verbatim from /api/scheduler's private slateStarts so /api/generate can stamp
 * gen.slate without a second feed-URL literal. Keyless, zero Odds credits.
 *
 * TWO CALLERS, TWO FAILURE SEMANTICS, BY DESIGN:
 *  - slateStarts -> [] on failure. The scheduler's decide() maps [] to "empty schedule —
 *    VACUOUS, not a clean zero" and never fires; unchanged semantics from the 08-05 ship.
 *  - slateScope  -> NULL on failure. The scope stamp is a RECORD; a failed read stamping
 *    {total:0} on an 11-game day would be a false one. Null says "the read failed", loudly
 *    distinguishable from a genuinely empty slate.
 *
 * THE THREE-NUMBER RULE (2026-08-06 ledger, third appearance of the population class):
 * every window statement prints total / started / ready-unstarted together, so a partial
 * population can never read as the whole. decide() already prints them in every scheduler
 * response (scheduler-decide.ts L26-31); slateScope carries the same three into the board
 * artifact itself. ready is a subset of unstarted: `start > now` first, then the lead test.
 */

const SCHEDULE = "https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=";

type Fetcher = typeof fetch;

async function fetchStarts(date: string, f: Fetcher): Promise<number[] | null> {
  try {
    const r = await f(SCHEDULE + date, { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { dates?: { games?: { gameDate?: string; status?: { detailedState?: string } }[] }[] };
    return (j.dates?.[0]?.games ?? [])
      .filter((g) => !/Postponed|Cancelled/i.test(g.status?.detailedState ?? ""))
      .map((g) => (g.gameDate ? Date.parse(g.gameDate) : NaN))
      .filter((n) => isFinite(n));
  } catch {
    return null;
  }
}

/** The scheduler's read: [] on failure (decide() treats [] as VACUOUS empty-schedule). */
export async function slateStarts(date: string, f: Fetcher = fetch): Promise<number[]> {
  return (await fetchStarts(date, f)) ?? [];
}

export type SlateScope = { total: number; started: number; ready: number; unstarted: number };

/** The artifact's read: the full-slate three numbers, or NULL when the feed cannot be read. */
export async function slateScope(date: string, now: number, f: Fetcher = fetch): Promise<SlateScope | null> {
  const starts = await fetchStarts(date, f);
  if (starts == null) return null;
  const unstartedArr = starts.filter((s) => s > now);
  return {
    total: starts.length,
    started: starts.length - unstartedArr.length,
    ready: unstartedArr.filter((s) => s - LINEUP_LEAD_MS <= now).length,
    unstarted: unstartedArr.length,
  };
}
