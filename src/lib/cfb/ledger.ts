import { computeBankroll, todayExposure, type BankStore } from "@/lib/bankroll";
import { validateLedger } from "@/lib/ledger-merge";
import { ledgerStats } from "@/lib/ledger-stats";
import type { LedgerEntry, LedgerStats } from "@/lib/useLedger";
import { CFB_PAPER } from "@/lib/cfb/rules";
import type { CfbBoard, CfbCard, CfbLedgerEntry } from "@/lib/cfb/types";

/**
 * THE CFB LEDGER, PURE PART (INSTRUCTION 38, 2026-09-05). Storage, sync and the React hook
 * live in src/lib/cfb/store.ts / sync.ts; this file is the arithmetic both sides share —
 * how a card becomes a locked day, how locked days score, how the CFB bank is computed, and
 * what a valid CFB ledger is. The MLB kernels are reused where their shape fits, so the two
 * desks agree on what "net P/L", "drawdown" and "bankroll" mean while never sharing a key.
 */

/** A built card → the locked day. `now` is the lock instant (ms epoch). */
export function lockCfbCard(card: CfbCard, board: CfbBoard, now: number): CfbLedgerEntry {
  const byId = new Map(board.games.map((g) => [g.id, g]));
  const games: CfbLedgerEntry["games"] = {};
  for (const t of [...card.core, ...card.funT]) {
    for (const leg of t.legs) {
      if (games[leg.gkey]) continue;
      const g = byId.get(leg.gkey);
      if (!g) continue;
      games[leg.gkey] = { pk: Number(g.id), start: g.start, home: g.home.name, away: g.away.name };
    }
  }
  const entry: CfbLedgerEntry = {
    sport: "cfb",
    date: card.date,
    locked: true,
    daily: CFB_PAPER.daily,
    fun: CFB_PAPER.fun,
    core: card.core,
    funT: card.funT,
    lockedAt: now,
    games,
    grading: null,
  };
  if (card.noPlay) entry.noPlay = true;
  return entry;
}

/**
 * Scores over locked CFB days — the MLB kernel (`ledgerStats`) over the CFB shape, which is
 * structurally a LedgerEntry (same core/funT/grading fields). Pending / ungradable tickets
 * are counted but never staked; a push returns the stake; drawdown from the running peak.
 */
export function cfbLedgerStats(entries: CfbLedgerEntry[], scope: "core" | "fun" | "all" = "all"): LedgerStats {
  return ledgerStats(entries as unknown as LedgerEntry[], scope);
}

/** base + logged deposits − withdrawals + realized P/L of graded tickets since the bank's asOf. */
export function cfbBankroll(store: BankStore, entries: CfbLedgerEntry[]): number {
  return computeBankroll(store, entries);
}

/** The day's locked CORE + FUN stakes. */
export function cfbExposureOn(entries: CfbLedgerEntry[], date: string): number {
  return todayExposure(entries, date);
}

/** `validateLedger` plus the one CFB rule: every entry is stamped `sport: "cfb"`. */
export function validateCfbLedger(x: unknown): { ok: true; entries: CfbLedgerEntry[] } | { ok: false; error: string } {
  const v = validateLedger(x);
  if (!v.ok) return v;
  for (const e of v.entries) {
    if ((e as { sport?: unknown }).sport !== "cfb") return { ok: false, error: `entry ${e.date} is not a CFB entry (sport must be "cfb")` };
  }
  return { ok: true, entries: v.entries as CfbLedgerEntry[] };
}
