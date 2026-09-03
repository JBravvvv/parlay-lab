import { ticketPayout, usd, type PayoutGrade, type PayoutTicket } from "@/lib/ticket-payout";

/** "Wins $x · Pays $y" before a grade, "Won $x · Paid $y" after — the same pair on every
 *  parlay card (builder, ledger). Renders nothing for an unpriced ticket. */
export function WonPaid({ t, grade, className = "" }: { t: PayoutTicket; grade?: PayoutGrade; className?: string }) {
  const v = ticketPayout(t, grade);
  if (!v) return null;
  const tone = !v.settled ? "text-muted" : v.pays > v.wins && v.wins > 0 ? "text-pos" : v.pays === 0 ? "text-neg" : "text-muted";
  return (
    <span className={`num whitespace-nowrap text-[10.5px] ${tone} ${className}`} data-testid="won-paid">
      <span className="uppercase tracking-wide text-faint">{v.settled ? "Won" : "Wins"}</span> {usd(v.wins)}
      <span className="text-faint"> · </span>
      <span className="uppercase tracking-wide text-faint">{v.settled ? "Paid" : "Pays"}</span> {usd(v.pays)}
    </span>
  );
}
