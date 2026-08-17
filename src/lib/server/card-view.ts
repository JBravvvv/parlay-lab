import type { SyncEntry, SyncTicket } from "@/lib/ledger-merge";

/**
 * THE PUBLIC PAPER CARD (2026-08-16, Josh: "Show me the fun money HR tickets for
 * today too"). The paper card is the system's own hypothetical output — the same
 * publicity class as /api/picks — so the open board route serves it leg-by-leg.
 *
 * THE ONE HARD RULE: only entries stamped `paper: true` are ever projected. An
 * epoch-1 real-money entry (real stakes, Josh's placed/actualStake answers) returns
 * null unconditionally — the gate is here, in one place, not at the call sites.
 * The placement fields are stripped even on paper entries: placed/actualStake are
 * the ledger's business on every epoch.
 */

type CardLeg = { lkey: string | null; label: string | null; prop: string | null; cz: number | null; gkey?: string };
export type CardTicketView = {
  id: string | null;
  stake: number;
  name: string | null;
  type: string | null;
  czOdds: string | number | null;
  czDec: number | null;
  prob: number | null;
  czEv: number | null;
  forced?: true;
  res?: string;
  payout?: number;
  legs: CardLeg[];
};
export type CardView = {
  date: string;
  paper: true;
  daily: number | null;
  allocSum: number | null;
  gatedSum: number | null;
  underShare: number | null;
  note: string | null;
  funNote: string | null;
  core: CardTicketView[];
  funT: CardTicketView[];
};

export function publicCardView(entry: SyncEntry | null | undefined): CardView | null {
  if (!entry || (entry as { paper?: boolean }).paper !== true) return null;
  const grading = (entry.grading?.tickets ?? {}) as Record<string, { result?: string; payout?: number }>;
  const project = (t: SyncTicket): CardTicketView => {
    const g = t.id ? grading[String(t.id)] : undefined;
    return {
      id: (t.id as string) ?? null,
      stake: Number(t.stake) || 0,
      name: (t.name as string) ?? null,
      type: (t.type as string) ?? null,
      czOdds: (t as { czOdds?: string | number | null }).czOdds ?? null,
      czDec: (t.czDec as number) ?? null,
      prob: (t.prob as number) ?? null,
      czEv: (t.czEv as number) ?? null,
      ...((t as { forced?: boolean }).forced === true ? { forced: true as const } : {}),
      ...(g?.result ? { res: g.result, ...(g.payout != null ? { payout: g.payout } : {}) } : {}),
      legs: ((t.legs ?? []) as CardLeg[]).map((l) => ({
        lkey: l.lkey ?? null,
        label: l.label ?? null,
        prop: l.prop ?? null,
        cz: l.cz == null ? null : Number(l.cz),
        ...(l.gkey ? { gkey: l.gkey } : {}),
      })),
    };
  };
  return {
    date: entry.date,
    paper: true,
    daily: (entry.daily as number) ?? null,
    allocSum: (entry.allocSum as number) ?? null,
    gatedSum: ((entry as { gatedSum?: number }).gatedSum as number) ?? null,
    underShare: ((entry as { underShare?: number }).underShare as number) ?? null,
    note: ((entry as { note?: string }).note as string) ?? null,
    funNote: ((entry as { funNote?: string }).funNote as string) ?? null,
    core: (entry.core ?? []).map(project),
    funT: ((entry.funT ?? []) as SyncTicket[]).map(project),
  };
}
