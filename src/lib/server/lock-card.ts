import { mergeLedgers, validateLedger, type SyncEntry, type SyncTicket } from "@/lib/ledger-merge";
import { redis } from "@/lib/server/store";
import { CORE_RULES, PAPER, slotMaxDec } from "@/lib/paper-mode";
import {
  CORE_SHAPES_SINCE,
  bucketRecordFromLedger,
  shapeById,
  shapeForDay,
  shapeLine,
  slotName,
  type CoreShape,
  type ShapeCalibration,
} from "@/lib/core-shapes";
import { FUN_LADDER, FUN_SHAPE, buildFunHrTickets, buildFunLadderTicket, type FunLegSrc } from "@/lib/fun-hr";
import { shrinkTicket } from "@/lib/shrink";
import { assertAppendOnly, type AoDay } from "@/lib/append-only";
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
 *
 * ── THE SHAPED CORE (INSTRUCTION 46, 2026-09-08, "Parlay Lab Baseball 1") ───────────
 * Josh's word, verbatim: "Core Money should be calibrating itself more often. It is doing
 * horrible. Should consider doing some higher $ 2 team parlays. Hypothetically could be 2
 * $60 2 leg parlays one day w/ 3 $10 3-4 leg parlays one day, 5 $30 2 leg parlays the next,
 * …". The flat "3-7 tickets, ≤ $25 each, 2 legs" core (INSTRUCTION 18) is replaced by SLOT
 * FILLING: the day runs one of his six shapes (core-shapes.ts), each slot is a stake and a
 * leg range, and buildModeCard seats exactly one ticket per slot — leg count inside the
 * slot's range, leg-disjoint from everything already seated, never more than the slot's
 * stake. A slot the gated pass cannot fill falls to the forced (true-probability) pass
 * under the same leg range; a slot neither can fill carries to the next fire or top-up
 * sweep and is NAMED on the entry ("$20 3-leg slot unfilled — …"). Block fires own the
 * unfilled slots that fit inside their budget share. The day's shape is chosen once
 * (rotation, tilted by the realized 2-leg vs 3+-leg record when it is thick enough) and
 * persisted on the entry so every fire of the day fills the same shape.
 */

/** MIRROR of app/api/ledger/route.ts STORE_KEY — guarded by tests/lock-card.test.ts. */
export const LEDGER_STORE_KEY = "pl:ledger:v1";

/** MIRROR of app/api/generate/route.ts CRON_SEL_MODE — the PRIMARY mode the system locks
    under. FLIPPED ev_gated → dk_fd 2026-08-21 (Josh's word, verbatim: "Change it to 'DK/FD'
    basis but track bets for both internally so it can calibrate either selection.") — the
    other disciplined mode's card now rides every entry as `alt`, same rules, own world. */
export const LOCK_SEL_MODE = "dk_fd";

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
  blocked?: { name?: string; reason?: string }[];
  unallocated?: number;
};

/** the shape as it rides the entry (`coreShape`) — the menu id plus the pick's reason,
    so a day's shape always explains itself; slots are rehydrated from the menu by id */
export type CoreShapeRecord = {
  id: string;
  label: string;
  slots: CoreShape["slots"];
  pick: "rotation" | "tilt:two" | "tilt:long";
  reason: string;
  menu: string[];
  dayIndex: number;
  since: string;
  calibration?: ShapeCalibration | null;
};

export function needsLockAction(s: { boardExists: boolean; lockExists: boolean; deadSlate: boolean }): "backfill" | "reason-record" | null {
  if (s.lockExists) return null;
  if (s.boardExists) return "backfill"; // a board without a lock is the exact 08-02..08-05 gap
  if (s.deadSlate) return "reason-record"; // nothing can be built any more — the day still gets a record
  return null; // slate alive, no board yet: generation (scheduler/entry 1) is still the path
}

/**
 * The realized 2-leg vs 3+-leg record the shape picker tilts on (INSTRUCTION 46). Reads
 * the ledger blob once and hands back the small pure record; callers pass it to
 * buildLockEntry as `shapeCal`. Trailing window: SHAPE_CAL_DAYS days ending the day
 * before `date` (today's tickets are pending by definition). Never throws — an unreadable
 * store reads as "no record", and the picker then runs the plain rotation.
 */
export const SHAPE_CAL_DAYS = 30;
export async function readShapeCalibration(date: string): Promise<ShapeCalibration | null> {
  try {
    const raw = (await redis(["GET", LEDGER_STORE_KEY])) as string | null;
    const s = raw ? (JSON.parse(raw) as { ledger?: SyncEntry[] }) : null;
    if (!s?.ledger) return null;
    const to = new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const from = new Date(Date.parse(`${date}T00:00:00Z`) - SHAPE_CAL_DAYS * 86_400_000).toISOString().slice(0, 10);
    return bucketRecordFromLedger(s.ledger as never, { from, to });
  } catch {
    return null;
  }
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
  /** INSTRUCTION 46 (2026-09-08): the realized 2-leg vs 3+-leg record the shape picker
      tilts on (readShapeCalibration). Optional — absent means the plain rotation. Ignored
      when `carry` already carries the day's shape (a day never changes shape mid-day). */
  shapeCal?: ShapeCalibration | null;
  /** PLANT hook for the impossible branch — skews one stake so the throw is observable */
  __plantStakeSkew?: boolean;
}): SyncEntry {
  const { eng, data, date, now, trigger, blockKey, blockGkeys, carry } = args;
  const cfg = eng.get<Record<string, unknown>>("SH_CFG") ?? {};
  const sh = eng.get<{ bankroll?: number }>("SH") ?? {};
  const bankroll = Number(sh.bankroll) > 0 ? Number(sh.bankroll) : PAPER.bankroll;
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

  /* THE POOL IS SLATE-WIDE, BY THE RECORD (corrected 2026-08-19): shCardPool returns
     {pl,src,idx} wrappers, and the 08-08 per-block filter read `p.w?.pl` — undefined on
     every pool item, so `(… ?? []).every(...)` was vacuously TRUE and the filter NEVER
     FILTERED. Every block fire since 08-08 drew from the whole pregame pool; the tracked
     record was built that way. The dead filter is REMOVED rather than "fixed": actually
     scoping the pool to in-block games is exactly what would starve the paper budget,
     and blocks remain what they have really been all along — fire-timing and budget
     bookkeeping, not card scope. blockGkeys still guards the partition (TWO CARDS ONE
     GAME above) and stamps the entry's blocks map. */
  const rawPool = eng.get<(b: unknown) => unknown[]>("shCardPool")(data);
  /* INSTRUCTION 18 (2026-09-03) — the pool is SHRUNK ONCE, here, before the under-bias
     prune, so the primary world, the alt world, the forced pass and the ticket record
     all read the same market-blended numbers (shrink.ts carries the diagnosis: model
     said 56.0 wins, 46 landed). Pure: the engine's own pool objects are untouched. */
  const pool = (rawPool as { pl: Record<string, unknown> & { legs: Record<string, unknown>[] } }[]).map((w) => ({
    ...w,
    pl: shrinkTicket(w.pl as never, CORE_RULES.shrinkW) as unknown as Record<string, unknown> & { legs: Record<string, unknown>[] },
  }));
  const shAllocate = eng.get<(p: unknown, a: number, c: unknown, f: boolean) => AllocResult>("shAllocate");
  const tid = eng.get<(pl: unknown) => string>("shTicketId");
  type PoolItem = { pl: Record<string, unknown> & { legs: { lkey?: string; label?: string; prop?: string; cz?: unknown; gkey?: string }[] } };
  const legKey = (l: { label?: string | null; prop?: string | null }) => `${l.label}|${l.prop}`;

  /* THE DAY'S SHAPE (INSTRUCTION 46, 2026-09-08). Chosen ONCE per day: a fire that
     appends to a locked day reuses the shape the day already carries (`carry.coreShape`,
     rehydrated from the menu by id so the slots are always the menu's own), so the
     calibration moving between fires cannot split a day across two shapes — the $150
     proof below depends on every fire filling the same slot list. A fresh day asks the
     picker: rotation by date, tilted by the realized record when it is thick enough. */
  const storedShape = (carry as { coreShape?: CoreShapeRecord } | null | undefined)?.coreShape;
  const storedMenuShape = storedShape ? shapeById(storedShape.id) : null;
  const shapePick = storedMenuShape ? null : shapeForDay(date, args.shapeCal);
  const shape: CoreShape = storedMenuShape ?? shapePick!.shape;
  const shapeRecord: CoreShapeRecord = storedMenuShape
    ? { ...(storedShape as CoreShapeRecord), slots: storedMenuShape.slots }
    : {
        id: shape.id,
        label: shape.label,
        slots: shape.slots,
        pick: shapePick!.pick,
        reason: shapePick!.reason,
        menu: shapePick!.menu,
        dayIndex: shapePick!.dayIndex,
        since: CORE_SHAPES_SINCE,
        calibration: args.shapeCal ?? null,
      };

  /* THE UNDER BIAS (2026-08-16, Josh's word; the 3-day side-split behind it lives in
     under-bias.ts). Rule 1: tickets carrying a pitcher_outs UNDER leg leave the paper
     pool — re-admitted least-under-heavy first ONLY if the remainder cannot seat this
     fire's minimum ("not included very often", literally). */
  /* INSTRUCTION 18, rule 5 — H+R+RBI OVERS OUT OF CORE (121 of 231 core legs; 54% hit
     vs 61% market-implied; the claimed-edge buckets hit WORSE the more edge was claimed).
     Any ticket carrying an HRR over leaves the core pool before either pass, counted in
     blockedReasons.hrr_over_suspended so a zero-ticket day still explains itself. HRR
     unders, TB, hits, ML and RL stay. */
  /* INSTRUCTION 46 (2026-09-08): the shape filter is now PER SLOT — a ticket is eligible
     for a slot when its leg count sits inside the slot's range and BOTH its prices sit
     under the slot's ceiling (slotMaxDec: 2.6 for 2-leg slots, 1.75^legs for 3+-leg
     slots; the 09-03 diagnosis measured settlement, so the settling price is held under
     the ceiling here as well as the allocator's own selection-price gate). A ticket that
     fits NO slot of the day's shape leaves the pool up front, counted as
     core_shape_rules — the counter keeps its name so the histogram reads across the
     09-08 split. */
  const isHrrOver = (l: { lkey?: string | null; prop?: string | null }) =>
    String(l.lkey ?? "").split("|")[1] === "batter_hits_runs_rbis" && String(l.prop ?? "").includes(" O ");
  const decOf = (pl: Record<string, unknown>, k: "czDec" | "bsDec") => (typeof pl[k] === "number" && Number.isFinite(pl[k] as number) ? (pl[k] as number) : null);
  const overDec = (pl: Record<string, unknown>, cap: number) => {
    const cz = decOf(pl, "czDec");
    const bs = decOf(pl, "bsDec");
    return (cz != null && cz > cap) || (bs != null && bs > cap);
  };
  const inRange = (w: PoolItem, legs: { min: number; max: number }) => w.pl.legs.length >= legs.min && w.pl.legs.length <= legs.max;
  const fitsSomeSlot = (w: PoolItem) => shape.slots.some((s) => inRange(w, s.legs) && !overDec(w.pl, slotMaxDec(s.legs, "gated")));
  let hrrOverDropped = 0;
  let shapeDropped = 0;
  const rulePool = (pool as PoolItem[]).filter((w) => {
    if (CORE_RULES.noHrrOver && w.pl.legs.some(isHrrOver)) {
      hrrOverDropped++;
      return false;
    }
    if (!fitsSomeSlot(w)) {
      shapeDropped++;
      return false;
    }
    return true;
  });
  const biasView = rulePool.map((w) => ({
    w,
    name: String(w.pl.name ?? ""),
    czEv: (w.pl.czEv as number | null) ?? null,
    legs: w.pl.legs as { lkey?: string | null; prop?: string | null; label?: string | null }[],
  }));

  /* SLOT BOOKKEEPING (INSTRUCTION 46). Carried tickets fill slots: a ticket stamped
     `shapeSlot` keeps its slot; a ticket without one (a day locked before 2026-09-08, or a
     client copy) is seated BY MONEY — best fit, the smallest free slot whose stake is at
     least the ticket's stake (fix round 2026-09-08: seating in shape order regardless of
     stake parked a $10 legacy ticket in a $60 slot, the fire could then never seat the
     other $50, and decideTopUp kept buying top-ups — ~120 Odds credits each, TOPUP_MAX 6 (INSTRUCTION 49) —
     that could not change the answer). A legacy ticket bigger than every free slot is
     STRANDED: it holds no slot, its money still counts against the day (the OVER THE DAY
     guard below sums every carried ticket), and the slots its money displaces are named
     `cannot fill further` in slotsUnfilled — the scheduler reads that phrase as TERMINAL
     for the top-up sweep, because no later fire under the same shape can seat them either.
     A fire OWNS the unfilled slots, walked in shape order, whose stake fits inside what
     remains of its budget share AFTER the stranded money — the same pro-rating
     ticketWindow did by count, now by money: a $10 block takes a $10 slot, a $46 top-up
     takes what it can, a whole-day fire takes every slot. Σ(stranded + owned stakes) ≤
     daily by construction, so a day can never seat more than $150 across its fires. */
  type Filled = Map<number, SyncTicket>;
  type Seating = { filled: Filled; stranded: SyncTicket[] };
  const seatCarried = (tix: SyncTicket[]): Seating => {
    const filled: Filled = new Map();
    const unslotted: SyncTicket[] = [];
    const stranded: SyncTicket[] = [];
    for (const t of tix) {
      const s = (t as { shapeSlot?: unknown }).shapeSlot;
      if (typeof s === "number" && Number.isInteger(s) && s >= 0 && s < shape.slots.length && !filled.has(s)) filled.set(s, t);
      else unslotted.push(t);
    }
    for (const t of unslotted) {
      const stake = Number(t.stake) || 0;
      let best = -1;
      for (let i = 0; i < shape.slots.length; i++) {
        if (filled.has(i)) continue;
        const st = shape.slots[i].stake;
        if (st + 1e-9 < stake) continue; // the ticket carries more than this slot holds
        if (best < 0 || st < shape.slots[best].stake) best = i;
      }
      if (best < 0) stranded.push(t); // no seat fits — an over-full or over-sized legacy day
      else filled.set(best, t);
    }
    return { filled, stranded };
  };
  const strandedSum = (st: Seating) => st.stranded.reduce((a, t) => a + (Number(t.stake) || 0), 0);
  const ownSlots = (seating: Seating): number[] => {
    /* STRANDED MONEY IS SUBTRACTED ONCE (fix round 2026-09-08): a block fire's dailyOverride
       is already PAPER.daily − reserved − allocSoFar, and allocSoFar holds the stranded
       tickets' stakes — subtracting them again froze a partly-fillable legacy day at $0
       with every slot named `cannot fill further`. Only a whole-day fire (no override,
       daily = the ceiling) has to net the stranded money itself. */
    let rem = args.dailyOverride != null ? daily : daily - strandedSum(seating);
    const out: number[] = [];
    for (let i = 0; i < shape.slots.length; i++) {
      if (seating.filled.has(i)) continue;
      const st = shape.slots[i].stake;
      if (st <= rem + 1e-9) {
        out.push(i);
        rem -= st;
      }
    }
    return out;
  };
  /* the `cannot fill further` list: open slots a fire does NOT own because stranded money
     already occupies their share of the day. Named once per fire so the entry (and the
     scheduler's top-up decision) can read the day as finished rather than short. */
  const strandedUnfilled = (seating: Seating, owned: number[]): { slot: number; name: string; reason: string }[] => {
    const money = strandedSum(seating);
    if (money <= 0) return [];
    const out: { slot: number; name: string; reason: string }[] = [];
    for (let i = 0; i < shape.slots.length; i++) {
      if (seating.filled.has(i) || owned.includes(i)) continue;
      const nm = slotName(shape.slots[i]);
      out.push({
        slot: i,
        name: nm,
        reason: `${nm} unfilled — cannot fill further: $${money} of carried money sits outside the shape's slots (${seating.stranded.length} legacy ticket${seating.stranded.length === 1 ? "" : "s"} no slot could seat), so the day has no room left for it`,
      });
    }
    return out;
  };
  const primarySeating = seatCarried(carry?.core ?? []);
  const primaryOwned = ownSlots(primarySeating);
  const prunedB = pruneOutsUnder(biasView, Math.max(1, primaryOwned.length));
  const basePool: PoolItem[] = prunedB.pool.map((b) => b.w);

  /* PAPER EPOCH (2026-08-15, Josh's word): "$150 every single day no matter what." The
     disciplined allocation runs FIRST for every slot — that is the calibrated system the
     record exists to track. A slot it cannot fill is then FORCED under the same leg range
     by true probability (INSTRUCTION 18 rule 4). Forced tickets carry forced:true so gated
     performance and forced deployment can always be split. Leg-disjointness across slots,
     passes and carried tickets is enforced HERE.
     Rule 2 of the under bias wraps the whole fill: the staked card (carried legs included)
     may run at most 25% under prop legs — over quota, the most under-heavy picked
     ticket is EVICTED from the pool and the fill re-runs. Bounded: every iteration
     removes a picked ticket, so the loop cannot spin. */
  type Staged = { __id: string; name: string; czEv: number | null; legs: { lkey?: string | null; prop?: string | null }[] };
  type Seat = { slot: number; pick: AllocPick; forced: boolean; topUp: number; slotUnder: number };
  type Unfilled = { slot: number; name: string; reason: string };
  type ModeCard = {
    seated: Seat[];
    unfilled: Unfilled[];
    owned: number[];
    blocked: { name?: string; reason?: string }[];
    underShare: number;
    quotaEvicted: number;
    biasYielded: boolean;
    capResidue: number;
    slotUnderSum: number;
    deployed: number;
    gatedSizing: number;
    unallocated: number;
  };
  const biasViewOf = (tix: SyncTicket[]) =>
    tix.map((t) => ({
      name: String(t.name ?? ""),
      czEv: (t.czEv as number | null) ?? null,
      legs: ((t.legs as { lkey?: string | null; prop?: string | null }[] | undefined) ?? []),
    }));

  /* ONE PIPELINE, TWO WORLDS (2026-08-21, Josh's word, verbatim: "Change it to 'DK/FD'
     basis but track bets for both internally so it can calibrate either selection.")
     buildModeCard runs the full paper machinery — slot filling in the given selection
     mode with the true-probability forced fallback per slot, the under-bias quota loop,
     and the budget-over-bias yield — against its OWN carried tickets, so the primary
     selection and the alt selection get identical rules and independent leg-disjoint
     worlds. */
  const buildModeCard = (mode: string, carriedTix: SyncTicket[]): ModeCard => {
    const carriedB = biasViewOf(carriedTix);
    const seating = seatCarried(carriedTix);
    const owned = ownSlots(seating);
    const terminal = strandedUnfilled(seating, owned);
    const run = (p: PoolItem[]) => {
      const ids = new Set<string>();
      const legs = new Set<string>();
      for (const t of carriedTix) {
        if (t.id) ids.add(String(t.id));
        for (const l of (t.legs as { label?: string | null; prop?: string | null }[] | undefined) ?? []) legs.add(legKey(l));
      }
      const seated: Seat[] = [];
      const unfilled: Unfilled[] = [];
      const blocked: { name?: string; reason?: string }[] = [];
      let unallocated = 0;
      for (const si of owned) {
        const slot = shape.slots[si];
        const free = (x: PoolItem) => !ids.has(tid(x.pl)) && !x.pl.legs.some((l) => legs.has(legKey(l)));
        const gCeil = slotMaxDec(slot.legs, "gated");
        const fCeil = slotMaxDec(slot.legs, "forced");
        const ranged = p.filter((x) => inRange(x, slot.legs) && free(x));
        const gPool = ranged.filter((x) => !overDec(x.pl, gCeil));
        /* one seat, the slot's stake as the amount, cap = 100% of the slot (perParlayCap 1
           → capG = amount). The allocator's own leg cap is the slot's max; the slot's min
           is held by the `ranged` filter (the engine has no lower bound). Under the
           disciplined modes the Kelly ceiling may size the pick UNDER the slot — the
           difference rides the same ticket as a stamped topUp (allocator sizing stays
           recoverable as stake − topUp), never a second ticket, never past the slot. */
        const slotCfg = (sel: string, maxDec: number) => ({
          ...cfg,
          selMode: sel,
          maxCoreTickets: 1,
          minCoreTickets: 1,
          coreMaxLegs: slot.legs.max,
          coreMaxDec: maxDec,
          perParlayCap: 1,
        });
        const a: AllocResult = gPool.length ? shAllocate(gPool, slot.stake, slotCfg(mode, gCeil), false) : { picks: [], sum: 0, blocked: [] };
        blocked.push(...(a.blocked ?? []));
        let pick: AllocPick | null = a.picks[0] ?? null;
        let forced = false;
        let fPoolN = 0;
        if (!pick) {
          /* INSTRUCTION 18 rule 4: the forced pass selects by TRUE PROBABILITY ("probability"
             mode — read in shAllocate: evGated=false, disciplined=false under that mode, so
             force=false trips no gate, no nv_tax floor, no Kelly ceiling; exact-sum stays)
             and only among tickets priced under the slot's forced ceiling at BOTH quotes
             (1.75 for 2-leg slots — the $915 caesars_ev forced pass ran −27%; the 1.75^legs
             product for 3+-leg slots). */
          const fPool = ranged.filter((x) => !overDec(x.pl, fCeil));
          fPoolN = fPool.length;
          const f: AllocResult = fPool.length ? shAllocate(fPool, slot.stake, slotCfg(CORE_RULES.forcedSelMode, fCeil), false) : { picks: [], sum: 0 };
          pick = f.picks[0] ?? null;
          forced = pick != null;
        }
        if (!pick) {
          const why =
            ranged.length === 0
              ? `no leg-disjoint ${slot.legs.min === slot.legs.max ? `${slot.legs.min}-leg` : `${slot.legs.min}-${slot.legs.max} leg`} ticket priced under ${gCeil} in the pool`
              : gPool.length === 0 && fPoolN === 0
                ? `every candidate priced above the ${fCeil} forced ceiling`
                : `no ticket cleared the gate and none priced under ${fCeil} for the forced pass`;
          unfilled.push({ slot: si, name: slotName(slot), reason: `${slotName(slot)} unfilled — ${why}` });
          continue;
        }
        /* IMPOSSIBLE BRANCH: the allocator was asked for the slot's stake and handed back
           more — a ticket carrying more than its slot is exactly what this ship forbids,
           so it is a THROW with both numbers, never a clamp. */
        if (Number(pick.stake) > slot.stake + 1e-9) {
          throw new Error(`TWO ALLOCATORS: allocator sized $${pick.stake} into the $${slot.stake} slot ${si} (${String(pick.w.pl.name)}) — a ticket may never carry more than its slot. STOP.`);
        }
        /* CAP AT KELLY (Josh, 2026-09-08, verbatim: "Cap at Kelly, don't ride the full slot;
           I was just suggesting that if there was a reason for a ticket to be much larger
           than another one day that's okay"). The slot's stake is a CEILING, not a target:
           the ticket carries the allocator's own sizing (Kelly under the disciplined modes,
           exact-sum on the forced pass), and the gap between that and the slot is RETIRED
           for the day — it is not a top-up, not residue, and never a second ticket. topUp
           is stamped 0 so the ledger's shared-id raise (ledger-merge.ts) has nothing to
           raise; `slotUnder` records what Kelly declined. */
        const slotUnder = Math.max(0, slot.stake - Number(pick.stake));
        seated.push({ slot: si, pick, forced, topUp: 0, slotUnder });
        ids.add(pick.id);
        for (const l of pick.w.pl.legs) legs.add(legKey(l));
        if (!forced) unallocated += Number(a.unallocated ?? 0);
      }
      const staged: Staged[] = seated.map((s) => ({
        __id: s.pick.id,
        name: String(s.pick.w.pl.name ?? ""),
        czEv: (s.pick.w.pl.czEv as number | null) ?? null,
        legs: s.pick.w.pl.legs as { lkey?: string | null; prop?: string | null }[],
      }));
      /* the fire's money: every seated slot deploys the TICKET's stake (Kelly-capped);
         the slot's own money is CONSUMED whether or not Kelly used all of it, so the
         residue (capResidue, the 09-03 name) is only the UNFILLED owned slots — money
         Kelly declined inside a seated slot is retired, never re-bought by a top-up fire */
      const deployed = seated.reduce((acc, s) => acc + Number(s.pick.stake), 0);
      const slotsConsumed = seated.reduce((acc, s) => acc + shape.slots[s.slot].stake, 0);
      const slotUnderSum = seated.reduce((acc, s) => acc + s.slotUnder, 0);
      const gatedSizing = seated.filter((s) => !s.forced).reduce((acc, s) => acc + Number(s.pick.stake), 0);
      return { seated, unfilled, blocked, staged, share: underStats([...carriedB, ...staged]).share, deployed, capResidue: Math.max(0, daily - slotsConsumed), slotUnderSum, gatedSizing, unallocated };
    };
    let pool = basePool;
    let cur = run(pool);
    let evicted = 0;
    /* Rule 2 of the under bias: over quota, evict the most under-heavy picked ticket and
       re-run. Bounded: every iteration removes a picked ticket, so the loop cannot spin. */
    for (let attempt = 0; ; attempt++) {
      if (cur.share <= 1 - UNDER_BIAS.overShare + 1e-9 || attempt >= 12) break;
      const worst = worstUnderTicket(cur.staged);
      if (!worst) break;
      evicted++;
      pool = pool.filter((x) => tid(x.pl) !== worst.__id);
      cur = run(pool);
    }
    /* BUDGET OVER BIAS (2026-08-19). The under quota is a stated preference ("I would
       prefer them not to be included very often"); the $150 is "no matter what". When the
       quota's evictions leave the fire short of its budget, the evicted tickets come back
       and the passes run once more without the quota — stamped yieldedToBudget, never silent. */
    let yielded = false;
    /* short = an owned slot left unfilled (capResidue), NOT Kelly sizing under a seated slot */
    if (cur.capResidue > 0 && evicted > 0) {
      yielded = true;
      cur = run(basePool);
    }
    return {
      seated: cur.seated,
      unfilled: [...cur.unfilled, ...terminal],
      owned,
      blocked: cur.blocked,
      underShare: cur.share,
      quotaEvicted: evicted,
      biasYielded: yielded,
      capResidue: cur.capResidue,
      slotUnderSum: cur.slotUnderSum,
      deployed: cur.deployed,
      gatedSizing: cur.gatedSizing,
      unallocated: cur.unallocated,
    };
  };

  const primaryMode = String(cfg.selMode ?? LOCK_SEL_MODE);
  const primaryCard = buildModeCard(primaryMode, carry?.core ?? []);
  const underShare = primaryCard.underShare;
  const quotaEvicted = primaryCard.quotaEvicted;
  const biasYielded = primaryCard.biasYielded;

  /* THE ALT SELECTION (2026-08-21, Josh's word above): the OTHER disciplined mode's card,
     built by the same pipeline against its own carried world, recorded on the entry as
     `alt` — never in core, never in any net, never on the public card. Its tickets are
     pool parlays, so the prediction store's grade-only pass already settles their
     outcomes (join by ticket id / leg lkeys); this record is what makes the
     selection-level comparison readable. Fun money is mode-independent, primary-only. */
  const ALT_MODE = primaryMode === "dk_fd" ? "ev_gated" : "dk_fd";
  const altPrev = carry?.alt;
  const altCard = buildModeCard(ALT_MODE, altPrev?.core ?? []);
  const usedLegs = new Set<string>();
  for (const s of primaryCard.seated) for (const l of s.pick.w.pl.legs) usedLegs.add(legKey(l));
  for (const t of carry?.core ?? []) {
    for (const l of (t.legs as { label?: string | null; prop?: string | null }[] | undefined) ?? []) usedLegs.add(legKey(l));
  }
  const gatedDeployed = primaryCard.gatedSizing;

  const toTicket = (s: Seat): SyncTicket => {
    const p = s.pick;
    const pl = p.w.pl;
    const stake = Number(p.stake);
    return {
      id: p.id,
      stake,
      /* INSTRUCTION 18: shrunk numbers on the record, raw numbers recoverable beside them */
      prob: pl.prob ?? null,
      probRaw: pl.probRaw ?? null,
      czDec: pl.czDec ?? null,
      czEv: pl.czEv ?? null,
      czEvRaw: pl.czEvRaw ?? null,
      bsDec: pl.bsDec ?? null,
      bsEv: pl.bsEv ?? null,
      bsEvRaw: pl.bsEvRaw ?? null,
      name: pl.name ?? null,
      type: pl.type ?? null,
      tier: pl.tier ?? null,
      legs: (pl.legs ?? []).map((l) => ({ lkey: l.lkey ?? null, label: l.label ?? null, prop: l.prop ?? null, cz: l.cz ?? null, ...(l.gkey ? { gkey: l.gkey } : {}) })),
      paper: true,
      /* INSTRUCTION 46: the slot this ticket seats — persisted so later fires fill around it */
      shapeSlot: s.slot,
      ...(s.forced ? { forced: true } : {}),
      /* Josh's standing word, 2026-08-15: "I will not be taking ANY of the bets." Paper
         tickets are born placed:false/actualStake:0 — a decision on record, not the
         epoch-1 null-means-unanswered state. */
      placed: false,
      actualStake: 0,
    };
  };

  /* NO SLOT TOP-UP (Josh, 2026-09-08: "Cap at Kelly, don't ride the full slot"). The
     INSTRUCTION 46 build first rode a pick up to its slot's stake (a Kelly-$12 pick in a
     $90 slot staked $90, topUp 78); Josh reversed that the same day — the shapes say how
     BIG a ticket MAY be, not how big it must be. withTopUp is kept (topUp is always 0 from
     the slot pass now) so the ledger-merge raise contract and the legacy entries that carry
     topUp stamps keep reading the same way. */
  const withTopUp = (t: SyncTicket, tu: number): SyncTicket => (tu > 0 ? { ...t, stake: Number(t.stake) + tu, topUp: tu } : t);
  const newCore: SyncTicket[] = primaryCard.seated
    .map((s, i) => {
      const stake = args.__plantStakeSkew && i === 0 ? s.pick.stake + 1 : s.pick.stake;
      if (stake !== s.pick.stake) {
        throw new Error(
          `TWO ALLOCATORS: locked stake ${stake} != allocator stake ${s.pick.stake} on ${String(s.pick.w.pl.name)} — ` +
            `the card being locked is not the card the allocator sized. STOP.`,
        );
      }
      return withTopUp(toTicket(s), s.topUp);
    });
  /* block fires APPEND: the date's entry accumulates each block's card; dedupe by id */
  const carried = (carry?.core ?? []).filter((t) => !newCore.some((n) => n.id === t.id));
  const core: SyncTicket[] = [...carried, ...newCore];

  /* the alt world accumulates the same way, in its own lane */
  const altNew: SyncTicket[] = altCard.seated.map((s) => withTopUp(toTicket(s), s.topUp));
  const altCore: SyncTicket[] = [
    ...(altPrev?.core ?? []).filter((t) => !altNew.some((n) => n.id === t.id)),
    ...altNew,
  ];

  /* $25 FUN, once per day — RESHAPED 2026-08-15 (Josh's word): 2–5 tickets of HR-over
     longshots, 3–8 hitters each, one team per ticket, players on at most 2 tickets.
     Composed deterministically from the board's own HR rows (engine prob + Caesars
     price, products only — see fun-hr.ts), leg-disjoint from everything staked above.
     The board's categories are the FULL slate even on block fires, so the first fire
     of the day composes from the whole day's HR pool. */
  let funT: SyncTicket[] = carry?.funT ?? [];
  let funNote: string | undefined;
  if (funT.length === 0) {
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
    /* INSTRUCTION 18 rule 6 (2026-09-03, Josh: "8-15 leg H+R+RBI etc as one or more of
       the fun tickets daily" / "I dont want to change that $25 fun money"): one 8–12 leg
       H+R+RBI + Hits O 0.5 ladder takes $10 of the $25 when the board can seat it; the HR
       composer gets the other $15 with one fewer seat so the day stays ≤ 5 fun tickets.
       If the ladder cannot seat, the whole $25 goes to the HR tickets exactly as before.
       The fun total is PAPER.fun every day, either way. */
    const catRows = (k: string) => (((data.categories as Record<string, unknown[]> | undefined)?.[k] ?? []) as Array<Record<string, unknown>>);
    const ladderPool: FunLegSrc[] = [...catRows("batter_hits_runs_rbis"), ...catRows("batter_hits")]
      .filter((r) => !r.noParlay && /\bO 0\.5$/.test(String(r.sub ?? "")))
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
    const ladder = buildFunLadderTicket(ladderPool, FUN_LADDER.amount, usedLegs);
    if (ladder) for (const l of ladder.legs) usedLegs.add(legKey(l));
    const hrAmount = ladder ? PAPER.fun - FUN_LADDER.amount : PAPER.fun;
    const fun = buildFunHrTickets(funPool, hrAmount, usedLegs, ladder ? FUN_SHAPE.tickets.max - 1 : FUN_SHAPE.tickets.max);
    funNote = fun.note;
    funT = [...(ladder ? [ladder] : []), ...fun.tickets].map((t) => ({
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
  /* INSTRUCTION 18: the rule counters are ALWAYS numbers on the record (0 included) */
  blockedReasons.hrr_over_suspended = Number(blockedReasons.hrr_over_suspended ?? 0) + hrrOverDropped;
  blockedReasons.core_shape_rules = Number(blockedReasons.core_shape_rules ?? 0) + shapeDropped;
  /* a ticket the gate refused is counted ONCE per fire, whichever slots it was tried in */
  const seenBlocked = new Set<string>();
  for (const b of primaryCard.blocked) {
    const r = b?.reason ?? "unknown";
    const k = `${b?.name ?? ""}|${r}`;
    if (seenBlocked.has(k)) continue;
    seenBlocked.add(k);
    blockedReasons[r] = (blockedReasons[r] ?? 0) + 1;
  }

  const gi = (data.gameInfo ?? {}) as Record<string, { pk?: number | null; start?: string | null }>;
  const games: Record<string, { pk: number | null; start: string | null }> = {};
  for (const [k, g] of Object.entries(gi)) games[k] = { pk: g?.pk ?? null, start: g?.start ?? null };

  const blocks = blockKey
    ? {
        ...(carry?.blocks ?? {}),
        [blockKey]: { budget: daily, tickets: newCore.length, gkeys: [...(blockGkeys ?? [])], firedAt: now, slots: primaryCard.owned },
      }
    : carry?.blocks;

  const topUpAmt = primaryCard.seated.reduce((a, s) => a + s.topUp, 0); // always 0 since the cap-at-Kelly reversal
  const deployed = newCore.reduce((a, t) => a + Number(t.stake), 0);
  if (deployed !== primaryCard.deployed) {
    throw new Error(`TWO ALLOCATORS: locked card deploys $${deployed} but the slot-filling pass computed $${primaryCard.deployed}. STOP.`);
  }
  /* IMPOSSIBLE BRANCH (INSTRUCTION 46, pre-committed): the day past $150. Σ(owned slot
     stakes) ≤ daily and the route prices daily as what the day still owes, so this cannot
     fire on a sound day — when it does, a second writer or a broken carry exists. */
  const carriedSum = carried.reduce((a, t) => a + (Number(t.stake) || 0), 0);
  if (carriedSum + deployed > dayCeiling + 1e-9) {
    throw new Error(`OVER THE DAY: carried $${carriedSum} + this fire's $${deployed} exceeds the $${dayCeiling} day — a second writer or a broken carry exists. STOP.`);
  }
  /* APPEND ONLY (INSTRUCTION 48, 2026-09-09, Josh: "it can never remove a pick it can only
     add to it"): every ticket the day already locked must ride through this fire at the
     same stake. Throws before the entry exists, so nothing is written. */
  assertAppendOnly(carry as AoDay, { core, funT } as AoDay, "buildLockEntry");
  const dayAt = Number(carry?.allocSum ?? 0) + deployed;
  /* the day's slot map after this fire: which slots hold a ticket, which are still open */
  const filledAfter = seatCarried(core).filled;
  const openSlots = shape.slots.map((_, i) => i).filter((i) => !filledAfter.has(i));
  const unfilledNames = primaryCard.unfilled.map((u) => u.reason);
  const entry: SyncEntry = {
    date,
    locked: true,
    lockedAt: carry?.lockedAt ?? now,
    trigger,
    source: "server-lock",
    selMode: cfg.selMode ?? null,
    /* the DAY ceiling, always — a fire's own budget lives in blocks[key].budget.
       (Was `blockKey ? dayCeiling : daily`; since 2026-08-19 top-up fires append with a
       reduced dailyOverride and no blockGkeys, so the ceiling is unconditional.) */
    daily: dayCeiling,
    bankroll,
    /* PAPER: hypothetical throughout; gated vs forced split is per-ticket (forced:true) */
    paper: true,
    paperCfg: { daily: PAPER.daily, fun: PAPER.fun, since: PAPER.since },
    allocSum: Number(carry?.allocSum ?? 0) + deployed,
    gatedSum: Number((carry as { gatedSum?: number } | null | undefined)?.gatedSum ?? 0) + gatedDeployed,
    unallocated: primaryCard.unallocated,
    /* INSTRUCTION 46: what this fire could not seat into its slots (carries forward) */
    capResidue: primaryCard.capResidue,
    coreRules: CORE_RULES,
    /* INSTRUCTION 46 (2026-09-08): the day's shape, how it was picked, and the slot map —
       the ledger/card prints shapeLine(); the unfilled list names each open slot */
    coreShape: shapeRecord,
    shapeLine: shapeLine(shape),
    slotsOpen: openSlots,
    slotsUnfilled: primaryCard.unfilled.map((u) => ({ slot: u.slot, name: u.name, reason: u.reason })),
    /* residue top-ups across the day's fires (0 = every pick was sized to its slot outright) */
    topUpSum: Number((carry as { topUpSum?: number } | null | undefined)?.topUpSum ?? 0) + topUpAmt,
    /* money Kelly declined inside seated slots today (slot stake − ticket stake), retired */
    slotUnderSum: Number((carry as { slotUnderSum?: number } | null | undefined)?.slotUnderSum ?? 0) + primaryCard.slotUnderSum,
    core,
    funT,
    games: { ...(carry?.games ?? {}), ...games },
    blockedReasons,
    /* the under bias, on the record: the card's measured under share and what the
       bias removed to get there (0/absent = the rules never had to act) */
    underShare: Math.round(underShare * 1000) / 1000,
    ...(prunedB.dropped + prunedB.readmitted + quotaEvicted > 0
      ? { biasDropped: { outsUnder: prunedB.dropped, outsUnderReadmitted: prunedB.readmitted, quotaEvicted, ...(biasYielded ? { yieldedToBudget: true } : {}) } }
      : {}),
    /* the other selection's card, tracked internally (2026-08-21, Josh's word) */
    alt: {
      selMode: ALT_MODE,
      core: altCore,
      allocSum: Number(altPrev?.allocSum ?? 0) + altNew.reduce((a, t) => a + Number(t.stake), 0),
      gatedSum: Number(altPrev?.gatedSum ?? 0) + altCard.gatedSizing,
      underShare: Math.round(altCard.underShare * 1000) / 1000,
    },
    ...(funNote ? { funNote } : {}),
    ...(blocks ? { blocks } : {}),
    ...(core.length === 0
      ? {
          note: `paper day — $0 of $${daily} deployed under ${shapeLine(shape)}: ${unfilledNames.length ? unfilledNames.join("; ") : "no slot fit this fire's budget"} (H+R+RBI overs out, per-slot leg range and price ceiling, then the EV gate); blockedReasons is the histogram`,
        }
      : primaryCard.capResidue > 0 // an owned slot went unfilled — Kelly sizing under a seated slot is not a shortfall
        ? {
            /* the note is DAY-AWARE (2026-08-19): a fire's shortfall names its cause AND
               where the day stands, because the deficit now carries forward — the next
               fire's budget picks it up, and the scheduler's top-up sweep retries while
               unstarted games remain. INSTRUCTION 46: the cause is the SLOT — each open
               slot is named with why nothing seated in it. */
            note:
              unfilledNames.length > 0
                ? `paper day — this fire deployed $${deployed} of its $${daily} budget (day at $${dayAt} of $${dayCeiling}) under ${shapeLine(shape)}: ${unfilledNames.join("; ")}; the deficit carries to the next fire or top-up sweep`
                : primaryCard.owned.length === 0 && openSlots.length > 0
                  ? `paper day — this fire deployed $0 of its $${daily} budget (day at $${dayAt} of $${dayCeiling}) under ${shapeLine(shape)}: no open slot fits inside this fire's budget (open: ${openSlots.map((i) => slotName(shape.slots[i])).join(", ")}); the deficit carries to the next fire or top-up sweep`
                  : openSlots.length === 0
                    ? `paper day — this fire deployed $${deployed} of its $${daily} budget (day at $${dayAt} of $${dayCeiling}) under ${shapeLine(shape)}: every slot of the day's shape is seated — nothing more to fill`
                    : `paper day — this fire deployed $${deployed} of its $${daily} budget (day at $${dayAt} of $${dayCeiling}) under ${shapeLine(shape)}: the open slots (${openSlots.map((i) => slotName(shape.slots[i])).join(", ")}) did not fit inside this fire's remaining budget; the deficit carries to the next fire or top-up sweep`,
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
  /* APPEND ONLY (INSTRUCTION 48): the merge kernel has lowering paths (rival lock, allotment
     overflow, receiptless smaller stake) that cannot arise from a verbatim carry; if a racing
     second writer ever makes one fire, throw BEFORE the SET — generate reports lock.error,
     the registry key is not written, and the next poke retries on a fresh carry. */
  const stored = cur.find((e) => e.date === entry.date);
  const out = merged.find((e) => e.date === entry.date);
  assertAppendOnly(stored as AoDay, out as AoDay, "writeLock/stored");
  assertAppendOnly(entry as unknown as AoDay, out as AoDay, "writeLock/fire");
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
