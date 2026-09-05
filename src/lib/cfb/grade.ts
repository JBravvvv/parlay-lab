import { decFromAmerican } from "@/engine2/devig";
import type { CfbFinals, CfbGrade, CfbLedgerEntry, CfbTicketLeg } from "@/lib/cfb/types";

/**
 * CFB GRADING (INSTRUCTION 38, 2026-09-05) — pure, from ESPN final scores to ticket results.
 * A leg is graded exactly the way the book settles it: moneyline by the winner, spread by
 * the side's margin plus its line (> 0 won, = 0 push, < 0 lost), total by the sum against
 * the number. A ticket wins only when every non-push leg wins; a pushed leg drops out of the
 * payout (stake × Π dec of the legs that stood); every leg pushing hands the stake back.
 * Pending while any leg's game is not final; ungradable when a game is missing from the
 * finals more than 48 hours after its kickoff (or sits postponed that long) — a void, never a
 * guess. The score is ESPN's; nothing here invents one.
 */

export type CfbLegResult = { result: "won" | "lost" | "push" | "pending" | "ungradable"; detail: string };

export const CFB_UNGRADABLE_MS = 48 * 3600_000;

const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);

export function gradeCfbLeg(leg: CfbTicketLeg, f: CfbFinals[string] | undefined): CfbLegResult {
  if (!f) return { result: "pending", detail: "no final yet" };
  if (!f.final) return { result: "pending", detail: f.status === "postponed" ? "postponed" : "not final" };
  const home = Number(f.home);
  const away = Number(f.away);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return { result: "pending", detail: "score unavailable" };
  const score = `${home}-${away}`;

  if (leg.market === "ml") {
    const margin = leg.side === "home" ? home - away : away - home;
    if (margin > 0) return { result: "won", detail: `${score} · won by ${margin}` };
    if (margin < 0) return { result: "lost", detail: `${score} · lost by ${-margin}` };
    return { result: "push", detail: `${score} · tie` };
  }

  if (leg.market === "spread") {
    if (leg.line == null) return { result: "ungradable", detail: `${score} · spread leg has no line` };
    const margin = leg.side === "home" ? home - away : away - home;
    const v = margin + leg.line;
    const detail = `${score} · margin ${signed(margin)} vs ${signed(leg.line)}`;
    if (v > 0) return { result: "won", detail: `${detail} · covered by ${v}` };
    if (v < 0) return { result: "lost", detail: `${detail} · short by ${-v}` };
    return { result: "push", detail: `${detail} · push` };
  }

  if (leg.line == null) return { result: "ungradable", detail: `${score} · total leg has no line` };
  const sum = home + away;
  const v = leg.side === "over" ? sum - leg.line : leg.line - sum;
  const detail = `${score} · total ${sum} vs ${leg.line}`;
  if (v > 0) return { result: "won", detail: `${detail} · ${leg.side} by ${v}` };
  if (v < 0) return { result: "lost", detail: `${detail} · ${leg.side} missed by ${-v}` };
  return { result: "push", detail: `${detail} · push` };
}

function kickoffOf(entry: CfbLedgerEntry, gkey: string): number {
  const start = entry.games?.[gkey]?.start;
  const t = start ? Date.parse(start) : Number.NaN;
  if (Number.isFinite(t)) return t;
  return Date.parse(`${entry.date}T23:59:59Z`);
}

/**
 * Grade every ticket of a locked day. `now` decides the 48-hour ungradable window and
 * defaults to the wall clock; tests pass it explicitly.
 */
export function gradeCfbEntry(entry: CfbLedgerEntry, finals: CfbFinals, now: number = Date.now()): NonNullable<CfbLedgerEntry["grading"]> {
  const tickets: Record<string, CfbGrade> = {};
  const legs: Record<string, { result: string; detail: string }> = {};
  for (const t of [...entry.core, ...entry.funT]) {
    const results: CfbLegResult[] = [];
    for (const leg of t.legs) {
      let r = gradeCfbLeg(leg, finals[leg.gkey]);
      if (r.result === "pending" && now - kickoffOf(entry, leg.gkey) > CFB_UNGRADABLE_MS && (!finals[leg.gkey] || finals[leg.gkey].status === "postponed")) {
        r = { result: "ungradable", detail: `${r.detail} · 48h past kickoff — void` };
      }
      legs[leg.lkey] = r;
      results.push(r);
    }
    tickets[t.id] = settle(t.stake, t.legs, results);
  }
  const done = Object.values(tickets).every((g) => g.result !== "pending");
  return { tickets, legs, done };
}

function settle(stake: number, legs: CfbTicketLeg[], results: CfbLegResult[]): CfbGrade {
  if (results.some((r) => r.result === "lost")) return { result: "lost", payout: 0, detail: "a leg lost" };
  if (results.some((r) => r.result === "ungradable")) return { result: "ungradable", payout: 0, detail: "a leg is void" };
  if (results.some((r) => r.result === "pending")) return { result: "pending", payout: 0, detail: "awaiting a final" };
  let dec = 1;
  let stood = 0;
  for (let i = 0; i < legs.length; i++) {
    if (results[i].result === "push") continue;
    dec *= decFromAmerican(legs[i].cz);
    stood++;
  }
  if (stood === 0) return { result: "push", payout: stake, dec: 1, detail: "every leg pushed — stake returned" };
  const payout = Math.round(stake * dec * 100) / 100;
  const pushed = legs.length - stood;
  return { result: "won", payout, dec: Math.round(dec * 10000) / 10000, detail: pushed ? `won · ${pushed} leg${pushed === 1 ? "" : "s"} pushed and dropped out` : "won" };
}
