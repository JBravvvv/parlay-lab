import type { LedgerEntry, LedgerStats } from "@/lib/useLedger";

/**
 * LEDGER ERAS (2026-09-04, Josh's word, verbatim: "Create a new net P/L for Core
 * & Fun money from today forward since things were changed. Don't remove the old
 * data just make the default view for each today forward (9/4/26) and create the
 * ability to click a tab that shows pre new ledger data which was 8/15-9/3").
 *
 * The CORE_RULES set (src/lib/paper-mode.ts) first governed a locked card on
 * 2026-09-04 — the 09-03 card was locked before that deploy — so the paper record
 * splits there. Era 1 is the 08-15..09-03 record, kept whole and read-only.
 */
export type LedgerEra = { key: "current" | "v1"; label: string; sub: string; from: string; to: string | null };

export const LEDGER_ERAS: readonly LedgerEra[] = [
  { key: "current", label: "9/4 →", sub: "new rules · since 2026-09-04", from: "2026-09-04", to: null },
  { key: "v1", label: "8/15 – 9/3", sub: "pre-rules record · 2026-08-15 → 2026-09-03", from: "2026-08-15", to: "2026-09-03" },
] as const;

export const DEFAULT_ERA: LedgerEra["key"] = "current";

export function inEra(date: string, era: LedgerEra): boolean {
  return date >= era.from && (era.to == null || date <= era.to);
}

export function eraEntries(entries: LedgerEntry[], era: LedgerEra): LedgerEntry[] {
  return entries.filter((e) => e.locked && inEra(e.date, era));
}

/**
 * Pure port of the engine's shLedgerStats(scope) over an explicit entry list, so
 * the page can score one era at a time. Same rules: pending / ungradable tickets
 * are counted but not staked; won returns the grader payout; push returns the
 * stake; day P/L and cumulative P/L rounded to cents; drawdown from the running
 * peak of cumulative P/L; the biggest FUN hit is always tracked.
 */
export function ledgerStats(entries: LedgerEntry[], scope: "all" | "core" | "fun"): LedgerStats {
  const L = entries.filter((e) => e.locked);
  const days: LedgerStats["days"] = [];
  let w = 0, l = 0, p = 0, pendT = 0, ungrT = 0;
  for (const e of L) {
    const tix = scope === "core" ? e.core : scope === "fun" ? e.funT : [...e.core, ...e.funT];
    if (!tix.length) continue;
    const g = e.grading?.tickets ?? {};
    const d = { date: e.date, staked: 0, ret: 0, pending: 0, ungradable: 0, w: 0, l: 0, p: 0, n: tix.length, pl: 0, cumPl: 0, cumRoi: null as number | null };
    for (const t of tix) {
      const r = g[t.id];
      if (!r || r.result === "pending") { d.pending++; pendT++; continue; }
      if (r.result === "ungradable") { d.ungradable++; ungrT++; continue; }
      d.staked += t.stake;
      if (r.result === "won") { d.ret += r.payout ?? 0; d.w++; w++; }
      else if (r.result === "lost") { d.l++; l++; }
      else { d.ret += t.stake; d.p++; p++; }
    }
    d.pl = Math.round((d.ret - d.staked) * 100) / 100;
    days.push(d);
  }
  let cs = 0, cr = 0, peak = 0, dd = 0;
  for (const d of days) {
    cs += d.staked; cr += d.ret;
    d.cumPl = Math.round((cr - cs) * 100) / 100;
    d.cumRoi = cs > 0 ? (cr - cs) / cs : null;
    if (d.cumPl > peak) peak = d.cumPl;
    if (peak - d.cumPl > dd) dd = peak - d.cumPl;
  }
  let bigHit: LedgerStats["bigHit"] = null;
  for (const e of L) {
    const g = e.grading?.tickets ?? {};
    for (const t of e.funT) {
      const r = g[t.id];
      if (r && r.result === "won" && (!bigHit || (r.payout ?? 0) > bigHit.payout)) bigHit = { payout: r.payout ?? 0, name: t.name, date: e.date };
    }
  }
  return {
    days,
    staked: Math.round(cs * 100) / 100,
    ret: Math.round(cr * 100) / 100,
    pl: Math.round((cr - cs) * 100) / 100,
    roi: cs > 0 ? (cr - cs) / cs : null,
    dd: Math.round(dd * 100) / 100,
    w, l, push: p, pending: pendT, ungradable: ungrT, bigHit,
  };
}
