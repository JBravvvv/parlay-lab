/**
 * APPEND ONLY — INSTRUCTION 48 (2026-09-09, Josh's word, verbatim: "The Card for today is
 * 'locked' which is fine, but it only played $25 today. I understand thats all it had
 * meeting the criteria at this time which is completely fine. Throughout the rest of the
 * day refresh, if it analyzes more picks/parlays that meet the betting criteria, it can
 * continue to add to the card up to the daily allotted amount. It can lock multiple times
 * per day, but it can never remove a pick it can only add to it").
 *
 * Pure. No imports, no I/O, no desk knowledge. A day's card may only GROW between two
 * writes: every ticket id the previous day carried (core ∪ funT) must still be present in
 * the next (core ∪ funT) at a numerically equal stake. A missing id is a removal; a
 * changed stake — lowered OR raised — is a resize, which is neither "add" nor "keep".
 * Compares id + stake only (no leg comparison). A ticket moving between core and funT with
 * the same id and stake is not a violation. Called at the server write sites
 * (lock-card.ts buildLockEntry/writeLock, cfb lock-server applyTopUp, football-lock
 * topUpDate) BEFORE any write, so a violation throws and nothing is stored.
 */
export type AoTicket = { id: string; stake: number };
export type AoDay = { core?: AoTicket[]; funT?: AoTicket[] } | null | undefined;

const EPS = 1e-9;

const allTickets = (d: AoDay): AoTicket[] => [...(d?.core ?? []), ...(d?.funT ?? [])];

/** null when `next` preserves every ticket of `prev` at an equal stake; otherwise the FIRST
    violation as a sentence naming the id and both stakes (or "missing"). prev null/undefined
    → null (a first lock has nothing to preserve). */
export function appendOnlyViolation(prev: AoDay, next: AoDay): string | null {
  if (!prev) return null;
  const after = new Map<string, number>();
  for (const t of allTickets(next)) {
    if (!t || typeof t.id !== "string") continue;
    if (!after.has(t.id)) after.set(t.id, Number(t.stake));
  }
  for (const t of allTickets(prev)) {
    if (!t || typeof t.id !== "string") continue;
    const was = Number(t.stake);
    if (!after.has(t.id)) return `ticket ${t.id} ($${was}) was locked and is now missing`;
    const now = after.get(t.id)!;
    if (!(Math.abs(was - now) < EPS)) return `ticket ${t.id} was locked at $${was} and is now $${now}`;
  }
  return null;
}

/** throws `APPEND ONLY (${where}): ${violation}` */
export function assertAppendOnly(prev: AoDay, next: AoDay, where: string): void {
  const v = appendOnlyViolation(prev, next);
  if (v) throw new Error(`APPEND ONLY (${where}): ${v}`);
}

/**
 * THE DEVICE SYNC ROUTES ARE THE ENFORCEMENT POINT THAT MATTERS (fix round 2026-09-09, defect 1).
 * The server rails (buildLockEntry / writeLock / applyTopUp / topUpDate) only ever append, so the
 * asserts there are contracts. The one writer that CAN shrink a locked day is a phone: a Builder
 * lock minted before the server card reached it (same positional id namespace) wins `pickBase` on
 * a graded early game and `mergeLedgers` drops every server ticket the phone lacks — the measured
 * 2026-09-05 outcome. So each ledger PUT runs the merged ledger through this after `mergeLedgers`
 * and BEFORE the SET: for every stored day `isProtected` names, a day the merge shrank or resized
 * is put back byte-for-byte as it was stored. Both sync loops adopt the server's reply, so the
 * phone converges on the server card instead of the other way round. Pure; deep-copies.
 */
export function restoreShrunkDays<E extends { date: string; locked?: boolean }>(
  stored: E[],
  merged: E[],
  isProtected: (e: E) => boolean,
): { ledger: E[]; restored: { date: string; violation: string }[] } {
  const restored: { date: string; violation: string }[] = [];
  const out = merged.map((m) => {
    const s = stored.find((e) => e.date === m.date);
    if (!s || !s.locked || !isProtected(s)) return m;
    const v = appendOnlyViolation(s as unknown as AoDay, m as unknown as AoDay);
    if (!v) return m;
    restored.push({ date: m.date, violation: v });
    return JSON.parse(JSON.stringify(s)) as E;
  });
  /* a protected stored day the merge dropped outright is put back too */
  for (const s of stored) {
    if (!s.locked || !isProtected(s) || out.some((m) => m.date === s.date)) continue;
    restored.push({ date: s.date, violation: `day ${s.date} was locked and is now missing` });
    out.push(JSON.parse(JSON.stringify(s)) as E);
  }
  return { ledger: out, restored };
}
