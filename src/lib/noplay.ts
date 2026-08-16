import type { SyncEntry } from "./ledger-merge";

/**
 * Hardening Phase 3 — override accountability.
 *
 * The ledger has always stamped `overrode: true` on a day locked through the
 * NO-PLAY gate; what it could NOT see was a NO-PLAY day that was honored,
 * because honoring leaves no locked entry. This module adds the missing half
 * as a schema extension GOING FORWARD (history is never reconstructed):
 * whenever the Builder shows the NO-PLAY verdict, the date is recorded in a
 * tiny append-only log that cloud-syncs exactly like the ledger and the
 * bankroll adjustment log. Honored = recorded verdict + day ended with no
 * override lock. Derivations are pure; storage lives in engine-client and the
 * sync loop in ledgerSync.
 */

export type NoPlayDay = { at: number; mode?: string | null };
/** date (YYYY-MM-DD) → first sighting of that day's NO-PLAY verdict. */
export type NoPlayLog = Record<string, NoPlayDay>;

export const NOPLAY_KEY = "pl_noplay";
export const NOPLAY_MAX = 500;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateNoPlayLog(x: unknown): { ok: true; log: NoPlayLog } | { ok: false; error: string } {
  if (!x || typeof x !== "object" || Array.isArray(x)) return { ok: false, error: "noplay log must be an object" };
  const entries = Object.entries(x as Record<string, unknown>);
  if (entries.length > NOPLAY_MAX) return { ok: false, error: `noplay log over ${NOPLAY_MAX} days` };
  const log: NoPlayLog = {};
  for (const [date, v] of entries) {
    if (!DATE_RE.test(date)) return { ok: false, error: "noplay key must be YYYY-MM-DD" };
    if (!v || typeof v !== "object") return { ok: false, error: "noplay entry is not an object" };
    const d = v as NoPlayDay;
    if (typeof d.at !== "number" || !(d.at > 0)) return { ok: false, error: "noplay entry missing at" };
    log[date] = { at: d.at, mode: typeof d.mode === "string" ? d.mode : null };
  }
  return { ok: true, log };
}

/** Union by date; the EARLIER sighting wins (symmetric, idempotent, append-only). */
export function mergeNoPlayLogs(a: NoPlayLog, b: NoPlayLog): NoPlayLog {
  const out: NoPlayLog = { ...a };
  for (const [date, d] of Object.entries(b)) {
    const cur = out[date];
    out[date] = !cur || d.at < cur.at || (d.at === cur.at && String(d.mode) < String(cur.mode)) ? d : cur;
  }
  return out;
}

/* ---- the Discipline report ---- */

export type DiscSplit = {
  tickets: number;
  staked: number;
  settled: number; // stake with a final grade — the ROI denominator
  pl: number;
  roi: number | null; // pl / settled
};

/**
 * CORE/FUN SPLIT (2026-07-26) — this report was a live misread risk without it.
 *
 * FUN is EV-gate-exempt BY DESIGN, and `overrode` is stamped only when the owner forces
 * an allocation. So a NO-PLAY day on which only a FUN ticket was locked produced an entry
 * with `overrode: false`, and the old `addEntry` folded `[...core, ...funT]` into ONE
 * line — meaning that day counted as an **honored NO-PLAY** *and* contributed its stake
 * and P/L to the **`gated`** line, which is supposed to represent EV-gated core plays.
 * It read as "discipline held" while money moved, and it inflated the gated line's
 * denominator with action that never faced the gate.
 *
 * `core`/`fun` are additive; the top-level totals are unchanged, so nothing that already
 * read this type breaks.
 */
export type DiscLine = DiscSplit & {
  core: DiscSplit; // tickets that faced the EV gate, the settlement floor and the consensus gates
  fun: DiscSplit; // tickets that faced NONE of them (see the FUN table in docs/collection-period.md)
};

export type DisciplineScope = {
  gated: DiscLine; // tickets locked on days that passed the gate
  override: DiscLine; // tickets locked on days stamped overrode
  noPlay: {
    honored: number;
    overridden: number;
    /** NO-PLAY days that were locked with FUN only. Counted inside `honored` — the core
        gate WAS honored — but surfaced separately, because "I bet nothing" and "I bet the
        lottery ticket" are different days and the panel must not show them as one. */
    funOnly: number;
  };
};

export type Discipline = { month: DisciplineScope; lifetime: DisciplineScope };

type Grade = { result?: string; payout?: number };
type Ticket = { id?: string; stake?: number };

const emptySplit = (): DiscSplit => ({ tickets: 0, staked: 0, settled: 0, pl: 0, roi: null });
const emptyLine = (): DiscLine => ({ ...emptySplit(), core: emptySplit(), fun: emptySplit() });

function addTickets(into: DiscSplit[], tix: Ticket[], grades: Record<string, Grade>) {
  for (const t of tix) {
    const stake = Number(t.stake) || 0;
    const g = t.id ? grades[t.id] : undefined;
    const settled = !(!g || g.result === "pending" || g.result === "ungradable");
    const pl = settled ? (Number(g.payout) || 0) - stake : 0;
    for (const l of into) {
      l.tickets++;
      l.staked += stake;
      if (settled) {
        l.settled += stake;
        l.pl += pl;
      }
    }
  }
}

function addEntry(line: DiscLine, e: SyncEntry) {
  const grades = ((e.grading as { tickets?: Record<string, Grade> } | null)?.tickets ?? {}) as Record<string, Grade>;
  // each ticket lands in the total AND in its bucket — one pass, so they cannot diverge
  addTickets([line, line.core], (e.core as Ticket[]) ?? [], grades);
  addTickets([line, line.fun], (e.funT as Ticket[]) ?? [], grades);
}

/**
 * Month + lifetime discipline buckets. `today` (YYYY-MM-DD) bounds the honored
 * count: a NO-PLAY verdict only counts as honored once its day is OVER without
 * an override lock — today's verdict is still pending. Overridden days come
 * from the ledger's own `overrode` stamp (the tracking that already existed),
 * so history stays exactly as it was recorded.
 */
export function discipline(entries: SyncEntry[], noplay: NoPlayLog, today: string): Discipline {
  const month = today.slice(0, 7);
  /* PAPER EPOCH (2026-08-15): hypothetical entries never pollute the real-money
     discipline record — the ledger page tracks their P&L, this panel does not. */
  const locked = entries.filter((e) => e.locked && (e as { paper?: boolean }).paper !== true);
  const ovDates = new Set(locked.filter((e) => (e as { overrode?: boolean }).overrode === true).map((e) => e.date));

  const scope = (inScope: (date: string) => boolean): DisciplineScope => {
    const gated = emptyLine();
    const override = emptyLine();
    for (const e of locked) {
      if (!inScope(e.date)) continue;
      addEntry((e as { overrode?: boolean }).overrode === true ? override : gated, e);
    }
    for (const l of [gated, override, gated.core, gated.fun, override.core, override.fun])
      l.roi = l.settled > 0 ? l.pl / l.settled : null;
    const honoredDays = Object.keys(noplay).filter((d) => inScope(d) && d < today && !ovDates.has(d));
    const honored = honoredDays.length;
    // a NO-PLAY day locked with FUN and no core: the gate was honored, but it was not a
    // day with no action, and the panel must be able to say so
    const funOnlyDates = new Set(
      locked
        .filter((e) => ((e.core as Ticket[]) ?? []).length === 0 && ((e.funT as Ticket[]) ?? []).length > 0)
        .map((e) => e.date),
    );
    const funOnly = honoredDays.filter((d) => funOnlyDates.has(d)).length;
    const overridden = [...ovDates].filter(inScope).length;
    return { gated, override, noPlay: { honored, overridden, funOnly } };
  };

  return {
    month: scope((d) => d.slice(0, 7) === month),
    lifetime: scope(() => true),
  };
}
