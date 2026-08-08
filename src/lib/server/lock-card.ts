import { mergeLedgers, validateLedger, type SyncEntry, type SyncTicket } from "@/lib/ledger-merge";
import { redis } from "@/lib/server/store";

/**
 * LOCK-AT-GENERATION (2026-08-05, operator requirement: every day produces a locked card).
 *
 * The generate path calls buildLockEntry + writeLock as part of board creation — one artifact,
 * one commit of the run. This module exists because the lock was AUTHORIZED 2026-08-02 and then
 * carried as an asterisk through two turns while three slate days (08-03/04/05) produced zero
 * boards and zero locks. A promise in a footnote is not a ship.
 *
 * ── WHAT A SERVER LOCK IS ────────────────────────────────────────────────────────────
 * The same SyncEntry shape the client's shLockCard writes and /api/ledger merges: date,
 * locked:true, core tickets with stakes, the games map the grader keys off, and — per the
 * placed-field ship — `placed:null` / `actualStake:null` THROUGHOUT. Null is UNANSWERED;
 * the system never places and never answers for Josh.
 *
 * ── EMPTY-GATE DAYS LOCK TOO ─────────────────────────────────────────────────────────
 * A zero-ticket card with the blocked-reason histogram attached is the honest form of
 * "a locked card every day no matter what": a no-bet day is a DECISION RECORD, not a gap.
 *
 * ── THE IMPOSSIBLE BRANCH LIVES HERE, WHERE IT CAN FIRE ──────────────────────────────
 * Locked stakes differing from the allocator's computed stakes would mean TWO ALLOCATORS.
 * buildLockEntry re-reads each pick's stake at assembly and THROWS on any mismatch, printing
 * both numbers — a crash, never a quietly wrong card.
 */

/** MIRROR of app/api/ledger/route.ts STORE_KEY — guarded by tests/lock-card.test.ts. */
export const LEDGER_STORE_KEY = "pl:ledger:v1";

/** MIRROR of app/api/generate/route.ts CRON_SEL_MODE — the one mode the system locks under. */
export const LOCK_SEL_MODE = "ev_gated";

/**
 * The record a day gets when NOTHING could be built any more — dead slate, no board, no lock.
 * Zero-ticket, locked, with the reason where the card would be. "No silent days" means every
 * date carries either a locked card or this.
 */
export function buildReasonRecord(date: string, now: number, reason: string): SyncEntry {
  const entry: SyncEntry = {
    date,
    locked: true,
    lockedAt: now,
    trigger: "self-check-reason",
    source: "server-lock",
    core: [],
    funT: [],
    games: {},
    blockedReasons: {},
    note: `no-bet day — no card could exist: ${reason}`,
  };
  const v = validateLedger([entry]);
  if (!v.ok) throw new Error(`reason record failed the validator: ${v.error}`);
  return entry;
}

type EngineLike = {
  get<T>(k: string): T;
};

type AllocPick = {
  id: string;
  stake: number;
  w: { pl: Record<string, unknown> & { legs: { lkey?: string; label?: string; prop?: string; cz?: unknown; gkey?: string }[] } };
};
type AllocResult = {
  picks: AllocPick[];
  sum: number;
  blocked?: { reason?: string }[];
  unallocated?: number;
};

export function needsLockAction(s: { boardExists: boolean; lockExists: boolean; deadSlate: boolean }): "backfill" | "reason-record" | null {
  if (s.lockExists) return null;
  if (s.boardExists) return "backfill"; // a board without a lock is the exact 08-02..08-05 gap
  if (s.deadSlate) return "reason-record"; // nothing can be built any more — the day still gets a record
  return null; // slate alive, no board yet: generation (scheduler/entry 1) is still the path
}

export function buildLockEntry(args: {
  eng: EngineLike;
  data: Record<string, unknown>;
  date: string;
  now: number;
  trigger: string;
  /** test hook: force the empty-gate path (0) without faking a fixture */
  dailyOverride?: number;
  /** PER-BLOCK LOCKING (2026-08-08): restrict the card to this block's games; the entry
      APPENDS to `carry` (the date's existing lock) instead of replacing it. */
  blockKey?: string;
  blockGkeys?: Set<string>;
  carry?: SyncEntry | null;
  /** PLANT hook for the impossible branch — skews one stake so the throw is observable */
  __plantStakeSkew?: boolean;
}): SyncEntry {
  const { eng, data, date, now, trigger, blockKey, blockGkeys, carry } = args;
  const cfg = eng.get<Record<string, unknown>>("SH_CFG") ?? {};
  const sh = eng.get<{ bankroll?: number }>("SH") ?? {};
  const bankroll = Number(sh.bankroll) > 0 ? Number(sh.bankroll) : 750;
  /* the engine's own daily ceiling (L3363): dailyBankrollCap × bankroll. The server has no
     "entered daily", so the ceiling IS the daily — recorded on the entry so the number used
     is never a mystery. On a block fire, dailyOverride carries the block's pro-rata share
     (splitBudget) and `daily` on the ENTRY stays the day ceiling. */
  const capFrac = Number(cfg.dailyBankrollCap) > 0 ? Number(cfg.dailyBankrollCap) : 0.1;
  const dayCeiling = Math.max(1, Math.round(capFrac * bankroll));
  const daily = args.dailyOverride ?? dayCeiling;

  /* IMPOSSIBLE BRANCH (2026-08-08, pre-committed): two cards containing the same game.
     Blocks partition the slate, so a new block's games intersecting an already-locked
     block's games means the partition broke or a second writer exists — THROW, never a
     quietly double-exposed day. */
  if (blockKey && blockGkeys && carry?.blocks) {
    for (const [k, b] of Object.entries(carry.blocks)) {
      if (k === blockKey) continue;
      const overlap = (b.gkeys ?? []).filter((g) => blockGkeys.has(g));
      if (overlap.length) {
        throw new Error(`TWO CARDS ONE GAME: block ${blockKey} intersects locked block ${k} on ${overlap.join(",")} — the partition broke or a second writer exists. STOP.`);
      }
    }
  }

  let pool = eng.get<(b: unknown) => unknown[]>("shCardPool")(data);
  if (blockGkeys) {
    /* the block's card draws only from tickets whose EVERY leg is a block game — a leg
       without a gkey cannot prove membership and keeps the ticket out (conservative) */
    pool = (pool as AllocPick[]).filter((p) => (p.w?.pl?.legs ?? []).every((l) => l.gkey && blockGkeys.has(l.gkey)));
  }
  const alloc = eng.get<(p: unknown, a: number, c: unknown, f: boolean) => AllocResult>("shAllocate")(
    pool,
    daily,
    cfg,
    false, // never force: the disciplined path is the only path the system locks by itself
  );

  const newCore: SyncTicket[] = alloc.picks.map((p, i) => {
    const pl = p.w.pl;
    const stake = args.__plantStakeSkew && i === 0 ? p.stake + 1 : p.stake;
    if (stake !== p.stake) {
      throw new Error(
        `TWO ALLOCATORS: locked stake ${stake} != allocator stake ${p.stake} on ${String(pl.name)} — ` +
          `the card being locked is not the card the allocator sized. STOP.`,
      );
    }
    return {
      id: p.id,
      stake: p.stake,
      prob: pl.prob ?? null,
      czDec: pl.czDec ?? null,
      czEv: pl.czEv ?? null,
      bsDec: pl.bsDec ?? null,
      bsEv: pl.bsEv ?? null,
      name: pl.name ?? null,
      type: pl.type ?? null,
      legs: (pl.legs ?? []).map((l) => ({ lkey: l.lkey ?? null, label: l.label ?? null, prop: l.prop ?? null, cz: l.cz ?? null, ...(l.gkey ? { gkey: l.gkey } : {}) })),
      placed: null, // UNANSWERED — never defaulted, never answered by the system
      actualStake: null,
    };
  });
  /* block fires APPEND: the date's entry accumulates each block's card; dedupe by id */
  const carried = (carry?.core ?? []).filter((t) => !newCore.some((n) => n.id === t.id));
  const core: SyncTicket[] = [...carried, ...newCore];

  /* blocked-reason histogram — the decision record on a no-bet day, present on every day;
     on block fires the day's histogram SUMS across blocks */
  const blockedReasons: Record<string, number> = { ...(carry?.blockedReasons ?? {}) };
  for (const b of alloc.blocked ?? []) {
    const r = b?.reason ?? "unknown";
    blockedReasons[r] = (blockedReasons[r] ?? 0) + 1;
  }

  const gi = (data.gameInfo ?? {}) as Record<string, { pk?: number | null; start?: string | null }>;
  const games: Record<string, { pk: number | null; start: string | null }> = {};
  for (const [k, g] of Object.entries(gi)) games[k] = { pk: g?.pk ?? null, start: g?.start ?? null };

  const blocks = blockKey
    ? {
        ...(carry?.blocks ?? {}),
        [blockKey]: { budget: daily, tickets: newCore.length, gkeys: [...(blockGkeys ?? [])], firedAt: now },
      }
    : carry?.blocks;

  const entry: SyncEntry = {
    date,
    locked: true,
    lockedAt: carry?.lockedAt ?? now,
    trigger,
    source: "server-lock",
    selMode: cfg.selMode ?? null,
    /* the DAY ceiling, always — a block's own budget lives in blocks[key].budget */
    daily: blockKey ? dayCeiling : daily,
    bankroll,
    allocSum: Number(carry?.allocSum ?? 0) + alloc.sum,
    unallocated: alloc.unallocated ?? 0,
    core,
    funT: carry?.funT ?? [],
    games: { ...(carry?.games ?? {}), ...games },
    blockedReasons,
    ...(blocks ? { blocks } : {}),
    ...(core.length === 0
      ? { note: `no-bet day — zero-ticket decision record (the gate cleared nothing at daily $${daily}); blockedReasons is the histogram` }
      : {}),
  };
  const v = validateLedger([entry]);
  if (!v.ok) throw new Error(`lock entry failed the ledger's own validator: ${v.error}`);
  return entry;
}

/** Read the store, merge the lock in (append-only by date, richer day wins), write back. */
export async function writeLock(entry: SyncEntry): Promise<{ merged: number; existedBefore: boolean }> {
  const raw = (await redis(["GET", LEDGER_STORE_KEY])) as string | null;
  let cur: SyncEntry[] = [];
  try {
    const s = raw ? (JSON.parse(raw) as { ledger?: SyncEntry[] }) : null;
    if (s && Array.isArray(s.ledger)) cur = s.ledger;
  } catch {
    cur = [];
  }
  const existedBefore = cur.some((e) => e.date === entry.date);
  const merged = mergeLedgers(cur, [entry]);
  await redis(["SET", LEDGER_STORE_KEY, JSON.stringify({ ledger: merged, at: entry.lockedAt })]);
  return { merged: merged.length, existedBefore };
}

export async function lockExists(date: string): Promise<boolean> {
  return (await getLockEntry(date)) != null;
}

/** The stored locked entry for a date, for the self-reading repair path (2026-08-06). */
export async function getLockEntry(date: string): Promise<SyncEntry | null> {
  const raw = (await redis(["GET", LEDGER_STORE_KEY])) as string | null;
  try {
    const s = raw ? (JSON.parse(raw) as { ledger?: SyncEntry[] }) : null;
    return s?.ledger?.find((e) => e.date === date && e.locked) ?? null;
  } catch {
    return null;
  }
}
