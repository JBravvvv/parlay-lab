/**
 * THE ONE DATE BASIS FOR SERVER ROUTES (2026-07-25)
 *
 * Every date this product means is a **Pacific** date: the ledger is keyed by Josh's
 * local day, MLB's official game date follows the ballpark's local day, and the app
 * on his phone derives "today" from a Pacific clock. The server runs UTC, so anything
 * that derives a date from the server's own clock is wrong for ~7 hours out of every
 * 24 — and wrong in the direction that silently writes to *tomorrow*.
 *
 * This is the THIRD server-local date defect in this codebase:
 *   1. `obSameDay` — dropped ~24% of every server board (the late slate).
 *   2. `CAL_START` — the calibration boundary, caught before it shipped.
 *   3. `/api/generate` — wrote the board and its prediction rows under tomorrow's
 *      date on any run after 00:00 UTC, so a Pacific client asking for today's board
 *      got a miss and paid to generate its own.
 *
 * `/api/clv` already had this right. Import it; never re-derive a date from
 * `new Date()` in a route.
 */
export function ptToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
}

/**
 * The date plus its N-1 predecessors as PT calendar dates, newest first — the fallback
 * walk for surfaces bounded by the board's 3-day TTL (2026-08-07, the morning dark
 * window: today has no board until the day's first fire, but yesterday's is still
 * stored and honestly labeled). Pure calendar arithmetic on the YYYY-MM-DD string —
 * no clock is read here, so no server-local defect class applies.
 */
export function prevPtDates(date: string, n: number): string[] {
  const out: string[] = [];
  const [y, m, d] = date.split("-").map(Number);
  const cur = new Date(Date.UTC(y, m - 1, d));
  for (let i = 0; i < n; i++) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() - 1);
  }
  return out;
}
