/**
 * CFB DATE HELPERS (INSTRUCTION 38, 2026-09-05). Every date the desk means is a PACIFIC
 * calendar date — the ledger is keyed by Josh's local day and ESPN's `dates=` day is
 * US-Eastern, so a late West-coast kickoff sits on the next ESPN date. These are pure
 * functions over ISO strings; nothing here reads a clock (the route derives "today" from
 * `ptToday()` in src/lib/server/pt-date.ts, never from `new Date()` date strings).
 */

const PT = "America/Los_Angeles";

const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: PT, year: "numeric", month: "2-digit", day: "2-digit" });
const kick = new Intl.DateTimeFormat("en-US", { timeZone: PT, weekday: "short", hour: "numeric", minute: "2-digit", hour12: true });

/** YYYY-MM-DD in America/Los_Angeles for an ISO instant ("2026-09-06T02:00Z" → "2026-09-05"). */
export function ptDateOf(iso: string): string {
  return ymd.format(new Date(iso));
}

/** "Sat 9:00 AM" — the kickoff in Pacific time, the way the row `sub` and game cards print it. */
export function kickoffLabel(iso: string): string {
  const parts = kick.formatToParts(new Date(iso));
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("weekday")} ${get("hour")}:${get("minute")} ${get("dayPeriod")}`.trim();
}

/** ESPN's `dates=` parameter: "2026-09-05" → "20260905". */
export function espnDateParam(date: string): string {
  return date.replace(/-/g, "");
}

/** Pure calendar arithmetic on the YYYY-MM-DD string — no clock, no timezone. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const cur = new Date(Date.UTC(y, m - 1, d + n));
  return cur.toISOString().slice(0, 10);
}

/** The next calendar date ("2026-09-30" → "2026-10-01"). */
export function nextDate(date: string): string {
  return addDays(date, 1);
}
