import { LINEUP_LEAD_MS } from "@/lib/board-coverage";
import { SCHED_T } from "@/lib/server/scheduler-decide";

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
