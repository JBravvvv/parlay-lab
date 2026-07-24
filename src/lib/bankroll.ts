/**
 * Managed bankroll (fix-file Phase 6 + Correction 4, 2026-07-24).
 *
 * The bankroll is never a free-edit number again — hand-editing it was the wrong
 * lever for stake control ($750 → $2,000 → $2,500 → $350 in one week corrupted
 * every Kelly figure downstream; the DAILY field is the stake lever). It is a
 * COMPUTED value:
 *
 *   bankroll = base ($2,500, Correction 4)
 *            + logged deposits − logged withdrawals (each with timestamp + note)
 *            + realized P/L from graded ledger tickets on days ≥ the init date
 *
 * Pure math lives here; storage and engine stamping live in engine-client.
 */

export type BankAdjustment = {
  ts: number;
  kind: "deposit" | "withdrawal";
  amt: number; // positive dollars
  note: string;
};

export type BankStore = {
  base: number;
  asOf: string; // YYYY-MM-DD — P/L counts from this day forward
  log: BankAdjustment[];
};

/** Correction 4: the true figure the managed bankroll initializes at. */
export const BANK_BASE = 2500;

/** localStorage key for the device's mirror of the synced bank store. */
export const BANK_KEY = "pl_bank2";
export const BANK_MAX_LOG = 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Shape check for a bank store arriving over the wire or from disk. */
export function validateBankStore(x: unknown): { ok: true; store: BankStore } | { ok: false; error: string } {
  if (!x || typeof x !== "object" || Array.isArray(x)) return { ok: false, error: "bank store must be an object" };
  const s = x as BankStore;
  if (typeof s.base !== "number" || !isFinite(s.base)) return { ok: false, error: "bank base must be a number" };
  if (typeof s.asOf !== "string" || !DATE_RE.test(s.asOf)) return { ok: false, error: "bank asOf must be YYYY-MM-DD" };
  if (!Array.isArray(s.log)) return { ok: false, error: "bank log must be an array" };
  if (s.log.length > BANK_MAX_LOG) return { ok: false, error: `bank log over ${BANK_MAX_LOG} entries` };
  for (const a of s.log) {
    if (!a || typeof a !== "object") return { ok: false, error: "bank log entry is not an object" };
    if (typeof a.ts !== "number" || !(a.ts > 0)) return { ok: false, error: "bank log entry missing ts" };
    if (a.kind !== "deposit" && a.kind !== "withdrawal") return { ok: false, error: "bank log entry kind invalid" };
    if (typeof a.amt !== "number" || !(a.amt > 0) || !isFinite(a.amt)) return { ok: false, error: "bank log entry amt invalid" };
    if (typeof a.note !== "string") return { ok: false, error: "bank log entry note invalid" };
  }
  return { ok: true, store: { base: s.base, asOf: s.asOf, log: s.log.map((a) => ({ ts: a.ts, kind: a.kind, amt: a.amt, note: a.note })) } };
}

const adjKey = (a: BankAdjustment) => `${a.ts}|${a.kind}|${a.amt}|${a.note}`;

/**
 * Hardening Phase 1: merge two bank stores the way the ledger merges —
 * symmetric, deterministic, idempotent, and strictly append-only:
 * - log = union de-duplicated by (ts, kind, amt, note). Timestamps are
 *   millisecond-precision, so an identical tuple can only be the same entry
 *   seen from two devices; anything else is a genuinely distinct append and
 *   both survive. This union IS the device-local → cloud migration: a device's
 *   pre-sync entries simply merge in on its first sync.
 * - asOf = the EARLIER init date (the established baseline wins; a freshly
 *   initialized device converges to the season's real P/L window instead of
 *   shrinking it).
 * - base = min (both sides should be $2,500; min keeps ties deterministic
 *   and never inflates the bankroll).
 * Entries are never edited or deleted — a mistake is reversed by logging an
 * explicit offsetting entry with a note.
 */
export function mergeBankStores(a: BankStore, b: BankStore): BankStore {
  const seen = new Set<string>();
  const log: BankAdjustment[] = [];
  for (const adj of [...a.log, ...b.log]) {
    const k = adjKey(adj);
    if (seen.has(k)) continue;
    seen.add(k);
    log.push({ ts: adj.ts, kind: adj.kind, amt: adj.amt, note: adj.note });
  }
  log.sort((x, y) => x.ts - y.ts || (adjKey(x) < adjKey(y) ? -1 : 1));
  return {
    base: Math.min(a.base, b.base),
    asOf: a.asOf < b.asOf ? a.asOf : b.asOf,
    log,
  };
}

type GradedTicket = { result: string; payout?: number };
export type LedgerDayLike = {
  date: string;
  locked?: boolean;
  core?: { id?: string; stake: number }[];
  funT?: { id?: string; stake: number }[];
  grading?: { tickets?: Record<string, GradedTicket>; done?: boolean } | null;
};

/** Realized P/L of one graded ticket: won → payout − stake; lost → −stake;
    push/void/pending → 0 (stake returned or still live — never guessed). */
export function ticketPL(stake: number, g: GradedTicket | undefined): number {
  if (!g) return 0;
  if (g.result === "won") return (Number(g.payout) || 0) - stake;
  if (g.result === "lost") return -stake;
  return 0;
}

/** Realized P/L across the ledger for days on/after `asOf`. */
export function realizedPL(ledger: LedgerDayLike[], asOf: string): number {
  let pl = 0;
  for (const e of ledger) {
    if (!e.locked || e.date < asOf) continue;
    const g = e.grading?.tickets ?? {};
    for (const t of [...(e.core ?? []), ...(e.funT ?? [])]) pl += ticketPL(t.stake, t.id ? g[t.id] : undefined);
  }
  return Math.round(pl * 100) / 100;
}

export function computeBankroll(store: BankStore, ledger: LedgerDayLike[]): number {
  let v = store.base;
  for (const a of store.log) v += a.kind === "deposit" ? a.amt : -a.amt;
  v += realizedPL(ledger, store.asOf);
  return Math.max(0, Math.round(v));
}

/** Today's locked exposure (CORE + FUN stakes) as dollars. */
export function todayExposure(ledger: LedgerDayLike[], today: string): number {
  const e = ledger.find((d) => d.date === today && d.locked);
  if (!e) return 0;
  return [...(e.core ?? []), ...(e.funT ?? [])].reduce((s, t) => s + t.stake, 0);
}
