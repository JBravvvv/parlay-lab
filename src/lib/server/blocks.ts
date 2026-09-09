import { LINEUP_LEAD_MS } from "@/lib/board-coverage";
import { SCHED_T } from "@/lib/server/scheduler-decide";
import { shapeById } from "@/lib/core-shapes";

/**
 * PER-BLOCK LOCKING (2026-08-08, operator requirement: the lock adapts to each day's
 * slate shape — no game block orphaned by a single fixed crossing).
 *
 * THE THRESHOLD IS DERIVED (§12Z.15, 139 dates / 1,819 games): the successive-start gap
 * histogram's valley is 60-89 min; the getaway-day separations measure 110-115 min; the
 * lineup lead is 180 min. 90 min sits above the wave structure and below every real
 * separation. AT 120 MIN THE MOTIVATING CASE DISSOLVES: 08-06's morning trio (gaps
 * 110/115 to its neighbours) would have merged into one 10-game block and the fix built
 * for it would have orphaned it. Season at 90 min: max 4 blocks/day (117/139 multi-block;
 * Sat+Sun 40/40) — MAX_BLOCKS = 4 = the raised MAX_RUNS_PER_DATE, and partitions beyond
 * it coalesce at the smallest gap so the run cap stays meaningful.
 *
 * SCALED FLOOR: blockMinReady = ceil(size/2) capped at the global 4, floored at 1 — a
 * 3-game block needs 2, the Sunday night game needs itself, and no block ever needs more
 * than the global rule asked of a full slate. T stays SCHED_T per block (the knobs table
 * in the handoff prices the alternatives; Josh's word moves them).
 *
 * BUDGET: pro-rata by block size over the day's slate, floors with the remainder to the
 * largest block — Σ ≤ daily EXACTLY (conservation guarded). What exists today is a
 * single-shot allocator per run (lock-card.ts shAllocate) with no cross-run draw-down,
 * so pro-rata is the default the operator named; sequential draw-down would need the
 * allocator to read the ledger, which it deliberately does not.
 */

export const BLOCK_GAP_MS = 90 * 60_000;
export const MAX_BLOCKS = 4;
/** registry of fired/orphaned blocks per date — written by generate (fires) and the
    scheduler (orphan reasons); the good-BLOCK-skip reads it */
export const BLOCKS_KEY = (date: string) => `pl:blocks:${date}`;

export type SlateBlock = { key: string; starts: number[] };

const keyOf = (t: number) => new Date(t).toISOString().slice(0, 16) + "Z";

export function partitionBlocks(startsIn: number[]): SlateBlock[] {
  const starts = startsIn.filter((s) => isFinite(s)).sort((a, b) => a - b);
  if (!starts.length) return [];
  const groups: number[][] = [[starts[0]]];
  for (const t of starts.slice(1)) {
    const last = groups[groups.length - 1];
    if (t - last[last.length - 1] >= BLOCK_GAP_MS) groups.push([t]);
    else last.push(t);
  }
  // coalesce beyond MAX_BLOCKS at the smallest inter-block gap — deterministic
  while (groups.length > MAX_BLOCKS) {
    let bi = 0;
    let bg = Infinity;
    for (let i = 1; i < groups.length; i++) {
      const gap = groups[i][0] - groups[i - 1][groups[i - 1].length - 1];
      if (gap < bg) {
        bg = gap;
        bi = i;
      }
    }
    groups[bi - 1] = [...groups[bi - 1], ...groups[bi]];
    groups.splice(bi, 1);
  }
  return groups.map((g) => ({ key: keyOf(g[0]), starts: g }));
}

/** ceil(size/2), capped at the global MIN_READY=4, floored at 1 — the printed scaling rule */
export function blockMinReady(size: number): number {
  return Math.min(4, Math.max(1, Math.ceil(size / 2)));
}

/** pro-rata by size, floors, remainder to the largest block; Σ ≤ daily exactly */
export function splitBudget(daily: number, blocks: SlateBlock[]): Record<string, number> {
  const total = blocks.reduce((a, b) => a + b.starts.length, 0);
  const out: Record<string, number> = {};
  if (!total || daily <= 0) {
    for (const b of blocks) out[b.key] = 0;
    return out;
  }
  let used = 0;
  for (const b of blocks) {
    out[b.key] = Math.floor((daily * b.starts.length) / total);
    used += out[b.key];
  }
  const largest = blocks.slice().sort((a, b) => b.starts.length - a.starts.length || a.starts[0] - b.starts[0])[0];
  out[largest.key] += daily - used;
  return out;
}

export type BlockDecision = {
  key: string;
  size: number;
  fire: boolean;
  reason: string;
  ready: number;
  unstarted: number;
  started: number;
  achievable: number;
  minReady: number;
};

export function decideBlock(args: { block: SlateBlock; now: number }): BlockDecision {
  const { block, now } = args;
  const size = block.starts.length;
  const minReady = blockMinReady(size);
  const unstartedArr = block.starts.filter((s) => s > now);
  const ready = unstartedArr.filter((s) => s - LINEUP_LEAD_MS <= now).length;
  const unstarted = unstartedArr.length;
  const started = size - unstarted;
  const achievable = unstarted ? ready / unstarted : 0;
  const base = { key: block.key, size, ready, unstarted, started, achievable, minReady };
  if (!unstarted) return { ...base, fire: false, reason: "dead-block — every game started; the orphan shape if it never fired" };
  if (achievable >= SCHED_T && ready >= minReady) return { ...base, fire: true, reason: "both conditions hold for this block" };
  if (ready < minReady && achievable >= SCHED_T) {
    return { ...base, fire: false, reason: `ready ${ready} < blockMinReady ${minReady} — the block burned down; the ratio is not the population` };
  }
  return { ...base, fire: false, reason: `achievable ${achievable.toFixed(3)} < ${SCHED_T} AND/OR ready ${ready} < ${minReady} — this block's lineups are not posted yet` };
}

export type BlockRegistry = Record<string, { firedAt?: number; tickets?: number; budget?: number; reason?: string; at: number }>;

/**
 * DEFICIT CARRY-FORWARD (2026-08-19, Josh's word: "I said $150 every day no matter what
 * so we could track and calibrate off of it" — said after the 08-19 card deployed $49).
 *
 * The old scheme handed each block its static splitBudget share; a fire that could not
 * seat its share simply STRANDED the difference — nothing later ever picked it up. A
 * fire's effective budget is now everything the day still owes, minus what stays
 * reserved for blocks that can still fire on their own:
 *
 *   budget = daily − allocSoFar − Σ shares(unfired, alive blocks other than this one)
 *
 * Pro-rata still shapes a normal day (each block fires into roughly its share); any
 * under-deployment flows to the next fire; the day's last live fire gets exactly the
 * remainder. Σ deployed ≤ daily by construction because allocSoFar subtracts. A block
 * is "alive" while it has an unstarted game; fired and dead blocks reserve nothing.
 * `currentKey: ""` prices a whole-slate or top-up fire (reserve every pending block).
 */
export function effectiveBlockBudget(args: {
  daily: number;
  blocks: SlateBlock[];
  currentKey: string;
  registry: BlockRegistry | null | undefined;
  now: number;
  allocSoFar: number;
}): { budget: number; reserved: number } {
  const { daily, blocks, currentKey, registry, now, allocSoFar } = args;
  const shares = splitBudget(daily, blocks);
  let reserved = 0;
  for (const b of blocks) {
    if (b.key === currentKey) continue;
    if (registry?.[b.key]?.firedAt) continue; // already fired — its spend is inside allocSoFar
    if (!canStillFire(b, now)) continue; // dead or burned down — no fire will ever spend there
    reserved += shares[b.key] ?? 0;
  }
  return { budget: Math.max(0, daily - reserved - Math.max(0, allocSoFar)), reserved };
}

/**
 * A block can still fire only while its unstarted games can reach the scaled floor —
 * ready never exceeds unstarted, and unstarted only shrinks, so once
 * unstarted < blockMinReady the two-condition window is closed FOREVER even though
 * games remain pregame. OBSERVED LIVE 2026-08-19: block C sat at 3 unstarted < floor 4
 * ("burned down"), could never fire, and an aliveness-only check would have reserved
 * its $100 and held the top-up sweep exactly while its last games were still seatable.
 */
export function canStillFire(b: SlateBlock, now: number): boolean {
  return b.starts.filter((s) => s > now).length >= blockMinReady(b.starts.length);
}

/**
 * THE TOP-UP SWEEP DECISION (2026-08-19, same instruction). Fires a plain (no-block)
 * generate when the paper day is short, no block fire is still coming to carry the
 * deficit, pregame games remain to seat it, and the day's top-up cap is not spent.
 * Pure — the scheduler passes what it already read; generate's own limiter, run cap
 * and registry cap still govern the actual spend.
 *
 * WHY THE `pending` HOLD STAYS (INSTRUCTION 48 correction, 2026-09-09): a block fire is a
 * FULL-SLATE generate (collectSlate takes no scope) at the same 114-150-credit cost a sweep
 * pays — it is not cheaper. The hold stays because the pending block's own fire ALREADY
 * carries the whole deficit (effectiveBlockBudget = daily − reserved − dayConsumed), so a
 * sweep before it would buy a second board for money the block fire seats anyway, and
 * could seat a late-block game before that block's own gate has judged it. canStillFire
 * releases the hold for burned-down blocks.
 *
 * INSTRUCTION 48 (2026-09-09, "it can lock multiple times per day, but it can never remove
 * a pick it can only add to it"): up to TOPUP_MAX (4) sweeps a day; two FREE refusals below
 * (slot-fit, empty-sweep cooldown) keep the extra attempts from re-buying the same board.
 */
/** THE DAY'S CONSUMED MONEY (cap at Kelly, Josh 2026-09-08). A seated slot is spent whether
    Kelly used all of it or not: allocSum is what the tickets carry, slotUnderSum is what
    Kelly declined inside seated slots — their sum is the slot money gone from the $150.
    Every budget read (block share, top-up owed) uses THIS, never allocSum alone, or the
    sweep would buy top-ups (a full generate, 114-150 credits each) to re-fill slots that are already seated. */
export const dayConsumed = (entry: Record<string, unknown> | null | undefined): number =>
  Number(entry?.allocSum ?? 0) + Number(entry?.slotUnderSum ?? 0);

/**
 * OPEN SLOTS OF A LOCKED DAY (INSTRUCTION 48, 2026-09-09). Mirrors lock-card.ts seatCarried
 * exactly: a ticket with an integer `shapeSlot` in range takes that slot if free; every other
 * ticket takes the SMALLEST free slot whose stake ≥ its own; a ticket that fits nowhere is
 * stranded (ignored here). Returns the stakes of the slots still free, in shape order; null
 * when the entry carries no `coreShape` (a pre-09-08 day — the caller behaves as before).
 * Pure: `@/lib/core-shapes` is pure, so no cycle and no I/O.
 */
export function openSlotStakes(entry: Record<string, unknown> | null | undefined): number[] | null {
  const cs = entry?.coreShape as { id?: unknown; slots?: unknown } | null | undefined;
  if (!cs || typeof cs !== "object") return null;
  let slots: { stake: number }[] | null = null;
  if (Array.isArray(cs.slots) && cs.slots.length) slots = cs.slots as { stake: number }[];
  else if (typeof cs.id === "string") slots = shapeById(cs.id)?.slots ?? null;
  if (!slots) return null;
  const core = Array.isArray(entry?.core) ? (entry!.core as { stake?: unknown; shapeSlot?: unknown }[]) : [];
  const filled = new Set<number>();
  const unslotted: { stake?: unknown }[] = [];
  for (const t of core) {
    const s = t?.shapeSlot;
    if (typeof s === "number" && Number.isInteger(s) && s >= 0 && s < slots.length && !filled.has(s)) filled.add(s);
    else unslotted.push(t);
  }
  for (const t of unslotted) {
    const stake = Number(t?.stake) || 0;
    let best = -1;
    for (let i = 0; i < slots.length; i++) {
      if (filled.has(i)) continue;
      const st = slots[i].stake;
      if (st + 1e-9 < stake) continue;
      if (best < 0 || st < slots[best].stake) best = i;
    }
    if (best >= 0) filled.add(best); // else stranded — ignored
  }
  return slots.map((s, i) => (filled.has(i) ? null : s.stake)).filter((x): x is number => x != null);
}

export function decideTopUp(args: {
  /** the date's locked SyncEntry (paper/allocSum read off its index signature) */
  entry: Record<string, unknown> | null;
  blocks: SlateBlock[];
  registry: BlockRegistry | null | undefined;
  starts: number[];
  now: number;
  daily: number;
  max: number;
  /** INSTRUCTION 48: an empty sweep (registry row `tickets: 0`) holds the next sweep off this
      long; omitted/0 → no cooldown (the pre-09-09 behaviour and the test fixtures' rows). */
  emptyRetryMs?: number;
}): { fire: boolean; reason: string; owed: number; used: number } {
  const { entry, blocks, registry, starts, now, daily, max, emptyRetryMs } = args;
  const used = Object.keys(registry ?? {}).filter((k) => k.startsWith("topup-")).length;
  if (entry?.paper !== true) return { fire: false, reason: "no paper lock for the date yet — block fires come first", owed: 0, used };
  const owed = daily - dayConsumed(entry);
  if (owed <= 0) return { fire: false, reason: "day fully deployed", owed: 0, used };
  const pending = blocks.some(
    (b) => !registry?.[b.key]?.firedAt && !registry?.[b.key]?.reason && canStillFire(b, now),
  );
  if (pending) return { fire: false, reason: "a block can still fire — its own fire carries the deficit", owed, used };
  if (!starts.some((s) => s > now)) return { fire: false, reason: "every game started — nothing pregame left to seat", owed, used };
  if (used >= max) return { fire: false, reason: `top-up cap spent (${used}/${max})`, owed, used };
  /* SLOT-FIT (INSTRUCTION 48, free): a sweep's budget is effectiveBlockBudget(currentKey:"")
     = owed once no block is pending, and lock-card's ownSlots owns any open slot with
     stake ≤ that budget — so "some open slot ≤ owed" ⇔ "the sweep owns ≥ 1 slot". Otherwise
     the run would deploy $0 for a full generate (114-150 credits) and write the shortfall
     note. No coreShape (pre-09-08 day) → skipped. */
  const open = openSlotStakes(entry);
  if (open !== null && open.length === 0) {
    return { fire: false, reason: "every slot of the day's shape is seated — nothing more to fill", owed, used };
  }
  if (open !== null && open.length > 0) {
    const min = Math.min(...open);
    if (owed + 1e-9 < min) {
      return {
        fire: false,
        reason: `no open slot fits the day's remaining $${owed} — the smallest open slot is $${min}; the shortfall is Kelly sizing inside seated slots, not an unfilled seat`,
        owed,
        used,
      };
    }
  }
  /* EMPTY-SWEEP COOLDOWN (INSTRUCTION 48, free): the latest topup-* row that priced a board
     and seated nothing (numeric `tickets === 0`, written by generate) holds the next sweep
     off emptyRetryMs; a sweep that seated anything does not — the board is moving. Rows
     without a numeric `tickets` never arm it. */
  let last: { key: string; firedAt: number; tickets?: unknown } | null = null;
  for (const [k, row] of Object.entries(registry ?? {})) {
    if (!k.startsWith("topup-") || typeof row?.firedAt !== "number") continue;
    if (!last || row.firedAt > last.firedAt) last = { key: k, firedAt: row.firedAt, tickets: row.tickets };
  }
  if (last && last.tickets === 0 && (emptyRetryMs ?? 0) > 0 && now - last.firedAt < (emptyRetryMs ?? 0)) {
    const m = Math.round((now - last.firedAt) / 60_000);
    const w = Math.ceil(((emptyRetryMs ?? 0) - (now - last.firedAt)) / 60_000);
    return {
      fire: false,
      reason: `top-up ${last.key} priced a board ${m} min ago and seated nothing — the next sweep waits ${w} more min rather than re-buy the same prices`,
      owed,
      used,
    };
  }
  return { fire: true, reason: `day short $${owed} with no pending block and pregame games remaining`, owed, used };
}
