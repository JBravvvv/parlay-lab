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
  /** INSTRUCTION 46 (2026-09-08): the shape slot this ticket seats (absent on pre-shape days) */
  shapeSlot?: number;
  res?: string;
  payout?: number;
  legs: CardLeg[];
};
/** INSTRUCTION 46: the day's shape as the public card reads it — id, label, how it was
    picked and why; slots are rehydrated from the menu by id, never trusted off the wire */
export type CardShapeView = { id: string; label: string; pick: string; reason: string };
export type CardSlotUnfilled = { slot: number; name: string; reason: string };
export type CardView = {
  date: string;
  paper: true;
  daily: number | null;
  allocSum: number | null;
  gatedSum: number | null;
  underShare: number | null;
  note: string | null;
  funNote: string | null;
  /** INSTRUCTION 46 (2026-09-08): the day's shape, its one-line print, which slots are still
      open and which the last fire could not fill — all optional so pre-shape days still serve */
  coreShape?: CardShapeView;
  shapeLine?: string;
  slotsOpen?: number[];
  slotsUnfilled?: CardSlotUnfilled[];
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
      ...(typeof (t as { shapeSlot?: unknown }).shapeSlot === "number" ? { shapeSlot: (t as { shapeSlot: number }).shapeSlot } : {}),
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
    ...shapeFields(entry),
    core: (entry.core ?? []).map(project),
    funT: ((entry.funT ?? []) as SyncTicket[]).map(project),
  };
}

/** the shape fields, projected only when the entry carries them (typed, never invented) */
function shapeFields(entry: SyncEntry): Pick<CardView, "coreShape" | "shapeLine" | "slotsOpen" | "slotsUnfilled"> {
  const e = entry as {
    coreShape?: { id?: unknown; label?: unknown; pick?: unknown; reason?: unknown };
    shapeLine?: unknown;
    slotsOpen?: unknown;
    slotsUnfilled?: unknown;
  };
  const out: Pick<CardView, "coreShape" | "shapeLine" | "slotsOpen" | "slotsUnfilled"> = {};
  const cs = e.coreShape;
  if (cs && typeof cs.id === "string" && typeof cs.label === "string") {
    out.coreShape = { id: cs.id, label: cs.label, pick: String(cs.pick ?? "rotation"), reason: String(cs.reason ?? "") };
  }
  if (typeof e.shapeLine === "string") out.shapeLine = e.shapeLine;
  if (Array.isArray(e.slotsOpen)) out.slotsOpen = (e.slotsOpen as unknown[]).filter((x): x is number => typeof x === "number");
  if (Array.isArray(e.slotsUnfilled)) {
    out.slotsUnfilled = (e.slotsUnfilled as unknown[])
      .filter((u): u is { slot: number; name?: unknown; reason?: unknown } => !!u && typeof u === "object" && typeof (u as { slot?: unknown }).slot === "number")
      .map((u) => ({ slot: u.slot, name: String(u.name ?? ""), reason: String(u.reason ?? "") }));
  }
  return out;
}
