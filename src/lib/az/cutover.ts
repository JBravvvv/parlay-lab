/* ==========================================================================================
 * THE CUTOVER — one pick generator, not two.
 *
 * From ANYTIME_SINCE (a CARD date, Pacific, the same kind of gate as FOUND_SINCE and
 * STRAIGHT_SINCE in src/lib/found-mode.ts) the any-time engine (src/lib/anytime/run.ts) is the
 * only thing that records a new pick. The older desks' "found" passes still run, still read their
 * boards and still grade what they hold, but they seat NOTHING NEW on a card dated on or after it:
 *
 *   MLB        src/lib/server/lock-card.ts   buildFoundLockEntry   (empty pool, no fun ticket)
 *   CFB + NFL  src/lib/cfb/found.ts          planFound             (no candidates, no fun ticket)
 *
 * WHY: two generators recording the same games would double-count every result, and the older
 * passes carry the limits the brief removes (08:00–18:45 PT slots, the $2,500 day, DraftKings as
 * the only price on football).
 *
 * WHAT IT DOES NOT DO: it deletes nothing and rewrites nothing. Every ticket already locked, on any
 * date, stays exactly as locked and is graded as before (append-only still holds). Cards dated
 * before ANYTIME_SINCE behave byte-for-byte as they did.
 *
 * REVERSIBLE: set ANYTIME_SINCE to null and the older passes seat bets again on every date. Move
 * the date later and they resume up to it. No stored data depends on the value.
 * ========================================================================================== */

/** first card date (YYYY-MM-DD, Pacific) on which only the any-time engine records new picks; null = off */
export const ANYTIME_SINCE: string | null = "2026-11-13";

/** true when a card dated `date` gets its new picks from the any-time engine alone */
export function anytimeOwns(date: string | null | undefined, since: string | null = ANYTIME_SINCE): boolean {
  return typeof since === "string" && typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= since;
}

/** the one plain line an older desk shows when the cutover is why it added nothing */
export function cutoverNote(since: string | null = ANYTIME_SINCE): string {
  return `new picks come from the any-time engine since ${since ?? "the cutover"} — this desk adds nothing new; see the Any-time page.`;
}
