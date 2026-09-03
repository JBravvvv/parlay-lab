import { parseAmerican } from "@/lib/parlay-calc";
import { amToDec } from "@/lib/ticket-math";

/**
 * WON / PAID ON EVERY PARLAY (2026-09-02, Josh's word, verbatim: "All of the parlays on
 * builder, ledger etc should have 'Won' and 'Paid'").
 *
 * One reading for every ticket card, the calculator's convention: **wins** is the profit,
 * **pays** is the total return (stake + profit), cents rounded once. Before a grade the
 * pair is the ticket's potential at its settling price (NV-confirmed price beats the
 * Caesars quote, exactly as the ledger's old "to win" did); once graded it is what
 * actually happened — the grader's payout is the TOTAL RETURN (a $10 winner at +200
 * carries payout 30), a loss pays $0, a push hands the stake back.
 */
export type PayoutView = {
  /** true once the ticket is won/lost/pushed — labels read Won/Paid instead of Wins/Pays */
  settled: boolean;
  wins: number;
  pays: number;
};

export type PayoutTicket = {
  stake: number;
  czDec?: number | null;
  czOdds?: string | number | null;
  confirmed?: number | null;
};

export type PayoutGrade = { result: string; payout: number } | null | undefined;

const cents = (n: number) => Math.round(n * 100) / 100;

/** settling decimal price: confirmed NV → czDec → parsed czOdds; null when unpriced */
export function settlingDec(t: PayoutTicket): number | null {
  if (t.confirmed != null && Number.isFinite(Number(t.confirmed)) && Math.abs(Number(t.confirmed)) >= 100)
    return amToDec(Number(t.confirmed));
  if (t.czDec != null && Number(t.czDec) > 1) return Number(t.czDec);
  if (t.czOdds != null && String(t.czOdds).trim() !== "") {
    const am = parseAmerican(String(t.czOdds));
    if (am != null) return amToDec(am);
  }
  return null;
}

export function ticketPayout(t: PayoutTicket, g?: PayoutGrade): PayoutView | null {
  const stake = Number(t.stake);
  if (!(stake > 0)) return null;
  const r = g?.result;
  if (r === "won") {
    const pays = cents(Number(g?.payout) || 0);
    return { settled: true, wins: cents(pays - stake), pays };
  }
  if (r === "lost") return { settled: true, wins: 0, pays: 0 };
  if (r === "push") return { settled: true, wins: 0, pays: cents(stake) };
  const dec = settlingDec(t);
  if (dec == null) return null;
  const gross = stake * dec;
  return { settled: false, wins: cents(gross - stake), pays: cents(gross) };
}

export const usd = (n: number) => `$${n.toFixed(2)}`;
