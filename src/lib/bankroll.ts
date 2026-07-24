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
