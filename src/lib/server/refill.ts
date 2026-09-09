import { redisGetJson } from "@/lib/server/store";
import { slateStarts } from "@/lib/server/slate";
import { BLOCKS_KEY, dayConsumed, decideTopUp, partitionBlocks, type BlockRegistry, type SlateBlock } from "@/lib/server/blocks";
import { getLockEntry } from "@/lib/server/lock-card";
import { PAPER, TOPUP_MAX } from "@/lib/paper-mode";

/**
 * MLB REFILL (INSTRUCTION 49, 2026-09-09, Josh's word, verbatim: "It shouldn't be refreshing
 * every 15 minutes. It should be 8am, 9:30am, 12pm, 3pm & 4:45pm. Other than that I can
 * manually do it and it can function the same way whether I manually refresh it or it
 * refreshes itself automatically").
 *
 * One server pass, two triggers. The scheduler runs it on the first tick inside each
 * REFILL_SLOTS_PT window (src/lib/server/grading-progress.ts, decideRefillTick) with the
 * slot's name; POST /api/refill?desk=mlb runs the SAME pass with slot "manual" when Josh
 * clicks Refresh with his sync phrase stored. The decision is free (Redis + statsapi); only
 * forwardMlbRefill spends, and only after decideMlbRefill said fire. The slot is stamped on
 * the `topup-N` registry row by /api/generate so a second poke inside the same window is
 * refused free (decideTopUp's same-slot gate); "manual" is never refused on that ground.
 * No cooldown: TOPUP_EMPTY_RETRY_MS is not passed — the slot calendar is the only pacing.
 */
export type RefillTrigger = "slot" | "manual";

export type TopUpDecision = { fire: boolean; reason: string; owed: number; used: number };

export type MlbDay = {
  lockEntry: Record<string, unknown> | null;
  blocksArr: SlateBlock[];
  reg: BlockRegistry;
  starts: number[];
};

/** the reads the scheduler's MLB tick makes before it decides a top-up — lifted here so the
    manual route and the tick read the SAME things; `pre` lets the tick hand over a slate it
    already fetched (statsapi is keyless, but one call is one call) */
export async function readMlbDay(date: string, pre?: { starts?: number[]; reg?: BlockRegistry }): Promise<MlbDay> {
  const starts = pre?.starts ?? (await slateStarts(date));
  const blocksArr = partitionBlocks(starts);
  const reg = pre?.reg ?? (((await redisGetJson<BlockRegistry>(BLOCKS_KEY(date))) ?? {}) as BlockRegistry);
  const lockEntry = (await getLockEntry(date)) as unknown as Record<string, unknown> | null;
  return { lockEntry, blocksArr, reg, starts };
}

/** CANNOT FILL FURTHER IS TERMINAL (fix round 2026-09-08, INSTRUCTION 46 seating): when every
    open slot the day still carries is named `cannot fill further` — carried legacy money that
    no slot could seat is occupying their share of the $150 — a top-up would rebuild the same
    seating, deploy $0 and spend a full generate (114-150 Odds credits measured,
    app/api/generate/route.ts:47) doing it. Checked first, before decideTopUp reads the
    shortfall as money it can still place. Then the pure decideTopUp with TOPUP_MAX and the
    slot — and NO emptyRetryMs (INSTRUCTION 49). */
/** `slot` omitted = an off-slot ticker poke printing the day's free reason (never "manual", which
    would apply the manual-headroom gate to a tick that is not Josh's click) */
export function decideMlbRefill(a: MlbDay & { now: number; slot?: string }): TopUpDecision {
  const { lockEntry, blocksArr, reg, starts, now, slot } = a;
  const unfilled = ((lockEntry as { slotsUnfilled?: { reason?: unknown }[] } | null)?.slotsUnfilled ?? []).filter((u) => u && typeof u === "object");
  const cannotFill = unfilled.length > 0 && unfilled.every((u) => String(u.reason ?? "").includes("cannot fill further"));
  if (cannotFill) {
    return {
      fire: false,
      reason: `cannot fill further — the day's ${unfilled.length} open slot${unfilled.length === 1 ? "" : "s"} hold no seat for the carried money; a top-up would change nothing`,
      owed: Math.max(0, PAPER.daily - dayConsumed(lockEntry)),
      used: Object.keys(reg ?? {}).filter((k) => k.startsWith("topup-")).length,
    };
  }
  return decideTopUp({ entry: lockEntry, blocks: blocksArr, registry: reg, starts, now, daily: PAPER.daily, max: TOPUP_MAX, slot });
}

/** the one spending forward: /api/generate?topup=1&slot=<slot>, same x-cron-key contract the
    block fires use; the secret rides in the header, never the query */
export async function forwardMlbRefill(a: {
  origin: string;
  secret: string;
  slot: string;
  fetchImpl?: typeof fetch;
}): Promise<{ generateStatus: number; generate: unknown }> {
  const f = a.fetchImpl ?? fetch;
  const gen = await f(new URL(`/api/generate?topup=1&slot=${encodeURIComponent(a.slot)}`, a.origin), {
    headers: { "x-cron-key": a.secret },
    cache: "no-store",
  });
  let generate: unknown = null;
  try {
    generate = await gen.json();
  } catch {
    generate = { error: "generate returned non-JSON" };
  }
  return { generateStatus: gen.status, generate };
}
