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
