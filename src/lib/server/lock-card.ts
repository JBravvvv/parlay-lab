import { mergeLedgers, validateLedger, type SyncEntry, type SyncTicket } from "@/lib/ledger-merge";
import { redis } from "@/lib/server/store";
import { PAPER, ticketWindow } from "@/lib/paper-mode";
import { buildFunHrTickets, type FunLegSrc } from "@/lib/fun-hr";
import { UNDER_BIAS, pruneOutsUnder, underStats, worstUnderTicket } from "@/lib/under-bias";

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
  /* PAPER EPOCH (2026-08-15, Josh's word): the daily is a FIXED hypothetical $150 — it
     was round(dailyBankrollCap × bankroll) = $75 through epoch 1. On a block fire,
     dailyOverride carries the block's pro-rata share (splitBudget of PAPER.daily) and
     `daily` on the ENTRY stays the day ceiling. */
  const dayCeiling = PAPER.daily;
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
  const shAllocate = eng.get<(p: unknown, a: number, c: unknown, f: boolean) => AllocResult>("shAllocate");
  const tid = eng.get<(pl: unknown) => string>("shTicketId");
  type PoolItem = { pl: Record<string, unknown> & { legs: { lkey?: string; label?: string; prop?: string; cz?: unknown; gkey?: string }[] } };
  const legKey = (l: { label?: string | null; prop?: string | null }) => `${l.label}|${l.prop}`;

  /* "It can be anywhere from 3-10 tickets for the $150 per day" (Josh, 2026-08-15).
     The window shapes ONLY the forced pass — the disciplined call keeps its own cfg
     (min 4 / max 6, the engine's numbers) because that system is the one being
     tracked. Pro-rata on block days; ceiling hard; floor best-effort on thin pools. */
  const carriedCount = (carry?.core ?? []).length;
  const win = ticketWindow(daily, carriedCount);

  /* THE UNDER BIAS (2026-08-16, Josh's word; the 3-day side-split behind it lives in
     under-bias.ts). Rule 1: tickets carrying a pitcher_outs UNDER leg leave the paper
     pool — re-admitted least-under-heavy first ONLY if the remainder cannot seat this
     fire's minimum ("not included very often", literally). */
  const biasView = (pool as PoolItem[]).map((w) => ({
    w,
    name: String(w.pl.name ?? ""),
    czEv: (w.pl.czEv as number | null) ?? null,
    legs: w.pl.legs as { lkey?: string | null; prop?: string | null; label?: string | null }[],
  }));
  const prunedB = pruneOutsUnder(biasView, win.minNew);
  let biasPool: PoolItem[] = prunedB.pool.map((b) => b.w);

  /* PAPER EPOCH (2026-08-15, Josh's word): "$150 every single day no matter what." The
     disciplined ev_gated allocation runs FIRST — that is the calibrated system the
     record exists to track. Whatever the gate leaves unstaked is then FORCED onto the
     remaining pool via the legacy caesars_ev allocator: no EV gate, exact-sum guarantee,
     the engine's own dedupe/cap rules. Leg-disjointness across the two passes is
     enforced HERE. Forced tickets carry forced:true so gated performance and forced
     deployment can always be split.
     Rule 2 of the under bias wraps both passes: the staked card (carried legs included)
     may run at most 25% under prop legs — over quota, the most under-heavy picked
     ticket is EVICTED from the pool and both passes re-run. Bounded: every iteration
     removes a picked ticket, so the loop cannot spin. */
  const carriedBias = (carry?.core ?? []).map((t) => ({
    name: String(t.name ?? ""),
    czEv: (t.czEv as number | null) ?? null,
    legs: ((t.legs as { lkey?: string | null; prop?: string | null }[] | undefined) ?? []),
  }));
  let alloc: AllocResult = { picks: [], sum: 0 };
  let forced: AllocResult = { picks: [], sum: 0 };
  let underShare = 0;
  let quotaEvicted = 0;
  for (let attempt = 0; ; attempt++) {
    alloc = shAllocate(biasPool, daily, cfg, false);
    forced = { picks: [], sum: 0 };
    const gatedIds = new Set<string>(alloc.picks.map((p) => p.id));
    const gatedLegs = new Set<string>();
    for (const p of alloc.picks) for (const l of p.w.pl.legs) gatedLegs.add(legKey(l));
    for (const t of carry?.core ?? []) {
      if (t.id) gatedIds.add(String(t.id));
      for (const l of (t.legs as { label?: string | null; prop?: string | null }[] | undefined) ?? []) gatedLegs.add(legKey(l));
    }
    const shortfall = daily - alloc.sum;
    const forcedMax = Math.max(0, win.maxNew - alloc.picks.length);
    if (shortfall > 0 && forcedMax > 0) {
      const rest = biasPool.filter(
        (w) => !gatedIds.has(tid(w.pl)) && !w.pl.legs.some((l) => gatedLegs.has(legKey(l))),
      );
      forced = shAllocate(rest, shortfall, {
        ...cfg,
        selMode: "caesars_ev",
        maxCoreTickets: forcedMax,
        minCoreTickets: Math.max(1, win.minNew - alloc.picks.length),
      }, false);
    }
    const staged = [...alloc.picks, ...forced.picks].map((p) => ({
      __id: p.id,
      name: String(p.w.pl.name ?? ""),
      czEv: (p.w.pl.czEv as number | null) ?? null,
      legs: p.w.pl.legs as { lkey?: string | null; prop?: string | null }[],
    }));
    underShare = underStats([...carriedBias, ...staged]).share;
    if (underShare <= 1 - UNDER_BIAS.overShare + 1e-9 || attempt >= 12) break;
    const worst = worstUnderTicket(staged);
    if (!worst) break;
    quotaEvicted++;
    biasPool = biasPool.filter((w) => tid(w.pl) !== worst.__id);
  }
  const usedIds = new Set<string>(alloc.picks.map((p) => p.id));
  const usedLegs = new Set<string>();
  for (const p of alloc.picks) for (const l of p.w.pl.legs) usedLegs.add(legKey(l));
  for (const t of carry?.core ?? []) {
    if (t.id) usedIds.add(String(t.id));
    for (const l of (t.legs as { label?: string | null; prop?: string | null }[] | undefined) ?? []) usedLegs.add(legKey(l));
  }
  const gatedCount = alloc.picks.length;
  const shortfall = daily - alloc.sum;
  const forcedMax = Math.max(0, win.maxNew - gatedCount);

  const toTicket = (p: AllocPick, isForced: boolean): SyncTicket => {
    const pl = p.w.pl;
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
      tier: pl.tier ?? null,
      legs: (pl.legs ?? []).map((l) => ({ lkey: l.lkey ?? null, label: l.label ?? null, prop: l.prop ?? null, cz: l.cz ?? null, ...(l.gkey ? { gkey: l.gkey } : {}) })),
      paper: true,
      ...(isForced ? { forced: true } : {}),
      /* Josh's standing word, 2026-08-15: "I will not be taking ANY of the bets." Paper
         tickets are born placed:false/actualStake:0 — a decision on record, not the
         epoch-1 null-means-unanswered state. */
      placed: false,
      actualStake: 0,
    };
  };

  const newCore: SyncTicket[] = [
    ...alloc.picks.map((p, i) => {
      const stake = args.__plantStakeSkew && i === 0 ? p.stake + 1 : p.stake;
      if (stake !== p.stake) {
        throw new Error(
          `TWO ALLOCATORS: locked stake ${stake} != allocator stake ${p.stake} on ${String(p.w.pl.name)} — ` +
            `the card being locked is not the card the allocator sized. STOP.`,
        );
      }
      return toTicket(p, false);
    }),
    ...forced.picks.map((p) => toTicket(p, true)),
  ];
  /* block fires APPEND: the date's entry accumulates each block's card; dedupe by id */
  const carried = (carry?.core ?? []).filter((t) => !newCore.some((n) => n.id === t.id));
  const core: SyncTicket[] = [...carried, ...newCore];

  /* $25 FUN, once per day — RESHAPED 2026-08-15 (Josh's word): 2–5 tickets of HR-over
     longshots, 3–8 hitters each, one team per ticket, players on at most 2 tickets.
     Composed deterministically from the board's own HR rows (engine prob + Caesars
     price, products only — see fun-hr.ts), leg-disjoint from everything staked above.
     The board's categories are the FULL slate even on block fires, so the first fire
     of the day composes from the whole day's HR pool. */
  let funT: SyncTicket[] = carry?.funT ?? [];
  let funNote: string | undefined;
  if (funT.length === 0) {
    for (const p of forced.picks) {
      for (const l of p.w.pl.legs) usedLegs.add(legKey(l));
    }
    const hrRows = ((data.categories as Record<string, unknown[]> | undefined)?.batter_home_runs ?? []) as Array<Record<string, unknown>>;
    const funPool: FunLegSrc[] = hrRows
      .filter((r) => !r.susp && String(r.sub ?? "").includes(" O "))
      .map((r) => {
        const label = String(r.label ?? "");
        const team = /\(([A-Z]{2,3})\)\s*$/.exec(label)?.[1] ?? null;
        const cz = r.cz == null ? null : Number(r.cz);
        const dec = cz == null || !Number.isFinite(cz) || cz === 0 ? null : cz > 0 ? 1 + cz / 100 : 1 + 100 / Math.abs(cz);
        return {
          player: label.replace(/\s*\([A-Z]{2,3}\)\s*$/, ""),
          team,
          label,
          prop: String(r.sub ?? ""),
          prob: r.prob == null ? null : Number(r.prob),
          dec,
          cz,
          lkey: (r.lkey as string | undefined) ?? null,
          gkey: (r.gkey as string | undefined) ?? null,
        };
      });
    const fun = buildFunHrTickets(funPool, PAPER.fun, usedLegs);
    funNote = fun.note;
    funT = fun.tickets.map((t) => ({
      id: tid({ type: t.type, legs: t.legs.map((l) => ({ label: l.label, prop: l.prop })) }),
      stake: t.stake,
      prob: Math.round(t.prob * 100) / 100,
      czDec: Math.round(t.czDec * 100) / 100,
      czEv: Math.round(t.czEv * 10) / 10,
      czOdds: t.czOdds,
      bsDec: null,
      bsEv: null,
      name: t.name,
      type: t.type,
      legs: t.legs.map((l) => ({ lkey: l.lkey, label: l.label, prop: l.prop, cz: l.cz, ...(l.gkey ? { gkey: l.gkey } : {}) })),
      paper: true,
      placed: false,
      actualStake: 0,
    }));
  }

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

  const deployed = alloc.sum + forced.sum;
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
    /* PAPER: hypothetical throughout; gated vs forced split is per-ticket (forced:true) */
    paper: true,
    paperCfg: { daily: PAPER.daily, fun: PAPER.fun, since: PAPER.since },
    allocSum: Number(carry?.allocSum ?? 0) + deployed,
    gatedSum: Number((carry as { gatedSum?: number } | null | undefined)?.gatedSum ?? 0) + alloc.sum,
    unallocated: alloc.unallocated ?? 0,
    core,
    funT,
    games: { ...(carry?.games ?? {}), ...games },
    blockedReasons,
    /* the under bias, on the record: the card's measured under share and what the
       bias removed to get there (0/absent = the rules never had to act) */
    underShare: Math.round(underShare * 1000) / 1000,
    ...(prunedB.dropped + prunedB.readmitted + quotaEvicted > 0
      ? { biasDropped: { outsUnder: prunedB.dropped, outsUnderReadmitted: prunedB.readmitted, quotaEvicted } }
      : {}),
    ...(funNote ? { funNote } : {}),
    ...(blocks ? { blocks } : {}),
    ...(core.length === 0
      ? { note: `paper day — $0 of $${daily} deployed: no CZ-playable pregame pool remained; blockedReasons is the histogram` }
      : deployed < daily
        ? {
            note:
              shortfall > 0 && forcedMax === 0
                ? `paper day — deployed $${deployed} of $${daily}: the ${ticketWindow(PAPER.daily, 0).maxNew}-ticket day ceiling was reached before the budget`
                : `paper day — deployed $${deployed} of $${daily}: the leg-disjoint pool exhausted before the budget`,
          }
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
  let epoch: number | undefined;
  try {
    const s = raw ? (JSON.parse(raw) as { ledger?: SyncEntry[]; epoch?: number }) : null;
    if (s && Array.isArray(s.ledger)) cur = s.ledger;
    epoch = s?.epoch; // the epoch MUST ride through — dropping it would reopen resurrection
  } catch {
    cur = [];
  }
  const existedBefore = cur.some((e) => e.date === entry.date);
  const merged = mergeLedgers(cur, [entry]);
  await redis(["SET", LEDGER_STORE_KEY, JSON.stringify({ ledger: merged, at: entry.lockedAt, ...(epoch != null ? { epoch } : {}) })]);
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
