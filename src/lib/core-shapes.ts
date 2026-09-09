/**
 * CORE DAY SHAPES — INSTRUCTION 46 (2026-09-08, "Parlay Lab Baseball 1", Josh's word,
 * verbatim: "Core Money should be calibrating itself more often. It is doing horrible.
 * Should consider doing some higher $ 2 team parlays. Hypothetically could be 2 $60 2 leg
 * parlays one day w/ 3 $10 3-4 leg parlays one day, 5 $30 2 leg parlays the next, 3 $40 2
 * leg parlays w/ $20 3 leg parlay & $10 4-5 leg parlay the next, 4 $30 2 leg parlays and a
 * $30 3-4 leg parlay the next, $90 2 leg parlay w/ $40 2 leg and $20 4 leg parlay the next,
 * $75 2 leg parlay w/ $50 2 leg, $15 3 leg and $10 5 leg parlay the next etc").
 *
 * Pure. No engine, no Redis, no dates other than the one handed in. The $150 core day is
 * no longer "3-7 tickets ≤ $25 each, 2 legs max" (INSTRUCTION 18, 2026-09-03) — it is a
 * SHAPE: an ordered list of SLOTS, each a stake and a leg range, summing to exactly $150.
 * lock-card.ts fills the slots (one ticket per slot, never more than the slot's stake);
 * this module only decides WHICH shape a date runs.
 *
 * ── THE MENU IS JOSH'S, VERBATIM ────────────────────────────────────────────────────
 * Six shapes, taken exactly from the examples above, in the order he listed them. Every
 * slot carries the leg range he named ("3-4 leg" → {3,4}; "2 leg" → {2,2}; "4-5 leg" →
 * {4,5}). Nothing is invented: no seventh shape, no re-weighted stakes. The sums are
 * asserted at module load and pinned in tests/core-shapes.test.ts.
 *
 * ── HOW A DAY PICKS ITS SHAPE ───────────────────────────────────────────────────────
 * Default: a deterministic ROTATION by date — day index (UTC days since the epoch) mod the
 * menu length — so consecutive days walk the menu the way Josh described ("one day …
 * the next … the next"), every device and every fire of a day agrees, and a re-run of a
 * date rebuilds the same shape.
 *
 * SELF-CALIBRATION (the "calibrating itself more often" half): the realized record is
 * split into two leg-count BUCKETS — `two` (exactly 2 legs; singles are not bucketed) and `long` (3+ legs) —
 * and once BOTH buckets hold at least TILT_MIN_N graded tickets, the rotation is TILTED:
 * when one bucket is beating the other by at least TILT_MIN_GAP of ROI, the date rotates
 * only through the half of the menu that puts the least money in the LOSING bucket (the
 * three shapes with the least 3+-leg money when 2-leg is running better; the three with
 * the most 3+-leg money when 3+-leg is running better). Below the sample floor, or inside
 * the gap, the full six-shape rotation runs — a record too thin to read never moves money.
 * The tilt never leaves the menu: every shape it can pick is one of Josh's six.
 *
 * WHY 20 AND 10 POINTS: 20 graded tickets in a bucket is the smallest sample at which a
 * ±10-point ROI gap is more than one ticket's swing (a single $60 2-leg at +1.6 moves a
 * 20-ticket bucket's ROI by ~5 points), and 10 points is roughly the gap the 09-03
 * diagnosis measured between 2-leg (−18%) and 3-leg (−53%) — a gap that size is a
 * signal, a smaller one is noise this record cannot yet resolve.
 */

export type LegRange = { min: number; max: number };
export type CoreSlot = { stake: number; legs: LegRange };
export type CoreShape = { id: string; label: string; slots: CoreSlot[] };

/** the day the shaped core replaced the flat $25-cap / 2-leg core */
export const CORE_SHAPES_SINCE = "2026-09-08";
/** the $150 every shape sums to — mirrors PAPER.daily (paper-mode.ts imports THIS file,
    so the number lives here to keep the import one-directional; pinned equal in tests) */
export const SHAPE_TOTAL = 150;

const L = (min: number, max: number): LegRange => ({ min, max });
const S = (stake: number, legs: LegRange): CoreSlot => ({ stake, legs });

/** Josh's six examples, verbatim, in his order. Big slots first inside each shape, as he
    wrote them — lock-card fills slots in this order, so the fire with the deepest pool
    (the first big block) seats the big 2-leg tickets. */
export const CORE_SHAPES: readonly CoreShape[] = [
  /* "2 $60 2 leg parlays one day w/ 3 $10 3-4 leg parlays" */
  { id: "A", label: "2x$60 2-leg + 3x$10 3-4 leg", slots: [S(60, L(2, 2)), S(60, L(2, 2)), S(10, L(3, 4)), S(10, L(3, 4)), S(10, L(3, 4))] },
  /* "5 $30 2 leg parlays the next" */
  { id: "B", label: "5x$30 2-leg", slots: [S(30, L(2, 2)), S(30, L(2, 2)), S(30, L(2, 2)), S(30, L(2, 2)), S(30, L(2, 2))] },
  /* "3 $40 2 leg parlays w/ $20 3 leg parlay & $10 4-5 leg parlay the next" */
  { id: "C", label: "3x$40 2-leg + $20 3-leg + $10 4-5 leg", slots: [S(40, L(2, 2)), S(40, L(2, 2)), S(40, L(2, 2)), S(20, L(3, 3)), S(10, L(4, 5))] },
  /* "4 $30 2 leg parlays and a $30 3-4 leg parlay the next" */
  { id: "D", label: "4x$30 2-leg + $30 3-4 leg", slots: [S(30, L(2, 2)), S(30, L(2, 2)), S(30, L(2, 2)), S(30, L(2, 2)), S(30, L(3, 4))] },
  /* "$90 2 leg parlay w/ $40 2 leg and $20 4 leg parlay the next" */
  { id: "E", label: "$90 2-leg + $40 2-leg + $20 4-leg", slots: [S(90, L(2, 2)), S(40, L(2, 2)), S(20, L(4, 4))] },
  /* "$75 2 leg parlay w/ $50 2 leg, $15 3 leg and $10 5 leg parlay the next" */
  { id: "F", label: "$75 2-leg + $50 2-leg + $15 3-leg + $10 5-leg", slots: [S(75, L(2, 2)), S(50, L(2, 2)), S(15, L(3, 3)), S(10, L(5, 5))] },
] as const;

/* the sums are checked ONCE, at load — a menu edit that breaks $150 is a crash, never a
   quietly over- or under-deployed day (the same posture as lock-card's TWO ALLOCATORS) */
for (const sh of CORE_SHAPES) {
  const sum = sh.slots.reduce((a, s) => a + s.stake, 0);
  if (sum !== SHAPE_TOTAL) throw new Error(`CORE_SHAPES ${sh.id} sums to $${sum}, not $${SHAPE_TOTAL}`);
  for (const s of sh.slots) if (!(s.legs.min >= 1 && s.legs.max >= s.legs.min)) throw new Error(`CORE_SHAPES ${sh.id} has a bad leg range`);
}

/** the number of tickets a day runs, derived from the menu (paper-mode's PAPER_TICKETS
    reads this — the count is no longer a rule of its own) */
export const SHAPE_TICKETS = {
  min: Math.min(...CORE_SHAPES.map((s) => s.slots.length)),
  max: Math.max(...CORE_SHAPES.map((s) => s.slots.length)),
} as const;

/** a slot's leg bucket for the calibration read: exactly 2 legs is `two`, 3+ is `long`.
    A 1-leg ticket (or a malformed 0-leg one) is NULL — Josh's shapes have no 1-leg slot, so
    a single is nobody's record; it used to fall into `two` and pollute the 2-leg ROI the
    tilt reads (fix round 2026-09-08). Callers skip null. */
export type LegBucket = "two" | "long";
export const legBucket = (legs: number): LegBucket | null => (legs < 2 ? null : legs === 2 ? "two" : "long");
/** the money a shape puts in the 3+-leg bucket (the tilt's ranking key) */
export const longMoney = (sh: CoreShape): number => sh.slots.filter((s) => legBucket(s.legs.max) === "long").reduce((a, s) => a + s.stake, 0);

/**
 * The calibration input — a small pure record, so the picker never touches Redis.
 * `bucketRoi` is realized ROI per bucket ((returned − staked) / staked), null when the
 * bucket has no settled stake; `n` is graded (won/lost/push) ticket count per bucket.
 */
export type ShapeCalibration = {
  bucketRoi: { two: number | null; long: number | null };
  n: { two: number; long: number };
  /** the window the record was read over, for the stamp (free text, e.g. "2026-08-19..09-07") */
  window?: string | null;
};

/** graded tickets a bucket needs before its ROI may steer the rotation */
export const TILT_MIN_N = 20;
/** the ROI gap (as a fraction, 0.10 = 10 points) below which the record is treated as a tie */
export const TILT_MIN_GAP = 0.1;
/** how many shapes the tilted rotation walks — half the menu */
export const TILT_SHAPES = 3;

export type ShapePick = {
  shape: CoreShape;
  /** which rule chose it — on the entry, so a day's shape always explains itself */
  pick: "rotation" | "tilt:two" | "tilt:long";
  reason: string;
  /** the menu the rotation walked (ids) and the day index that indexed it */
  menu: string[];
  dayIndex: number;
};

/** UTC day count of a YYYY-MM-DD string — the rotation's index; NaN-safe (a bad date
    reads as day 0 rather than throwing inside a lock) */
export function dayIndexOf(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return 0;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? Math.floor(t / 86_400_000) : 0;
}

/** the tilt decision alone (exported so the test can pin it without a date) */
export function tiltFor(cal: ShapeCalibration | null | undefined): { tilt: LegBucket | null; reason: string } {
  if (!cal) return { tilt: null, reason: "no calibration record handed in — full rotation" };
  const { two, long } = cal.bucketRoi;
  if (cal.n.two < TILT_MIN_N || cal.n.long < TILT_MIN_N || two == null || long == null) {
    return { tilt: null, reason: `record too thin to tilt (2-leg n=${cal.n.two}, 3+-leg n=${cal.n.long}; both need ≥ ${TILT_MIN_N}) — full rotation` };
  }
  const gap = two - long;
  const pct = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 1000) / 10}%`;
  if (Math.abs(gap) < TILT_MIN_GAP) {
    return { tilt: null, reason: `2-leg ${pct(two)} vs 3+-leg ${pct(long)} (n ${cal.n.two}/${cal.n.long}) — inside the ${Math.round(TILT_MIN_GAP * 100)}-point band, full rotation` };
  }
  const tilt: LegBucket = gap > 0 ? "two" : "long";
  return {
    tilt,
    reason: `2-leg ${pct(two)} vs 3+-leg ${pct(long)} (n ${cal.n.two}/${cal.n.long}) — ${tilt === "two" ? "2-leg" : "3+-leg"} is running better by ${pct(Math.abs(gap))}, rotating the ${TILT_SHAPES} shapes with the ${tilt === "two" ? "least" : "most"} 3+-leg money`,
  };
}

/** the menu a tilt walks: the TILT_SHAPES shapes with the least (tilt two) or most (tilt
    long) 3+-leg money, ties broken by menu order so the walk is deterministic */
export function tiltedMenu(tilt: LegBucket): CoreShape[] {
  const idx = CORE_SHAPES.map((s, i) => ({ s, i, lm: longMoney(s) }));
  idx.sort((a, b) => (tilt === "two" ? a.lm - b.lm : b.lm - a.lm) || a.i - b.i);
  return idx.slice(0, TILT_SHAPES).map((x) => x.s).sort((a, b) => CORE_SHAPES.indexOf(a) - CORE_SHAPES.indexOf(b));
}

/**
 * The day's shape. Pure: (date, calibration) → shape, and the reason. A day whose entry
 * already carries a shape must keep it across fires — lock-card reads `carry.coreShape`
 * before calling this, so the calibration moving mid-day cannot split a day across two
 * shapes (the day's total would no longer be provably $150).
 */
export function shapeForDay(date: string, cal: ShapeCalibration | null | undefined): ShapePick {
  const dayIndex = dayIndexOf(date);
  const t = tiltFor(cal);
  const menu = t.tilt ? tiltedMenu(t.tilt) : [...CORE_SHAPES];
  const shape = menu[((dayIndex % menu.length) + menu.length) % menu.length];
  return {
    shape,
    pick: t.tilt ? (`tilt:${t.tilt}` as const) : "rotation",
    reason: t.reason,
    menu: menu.map((s) => s.id),
    dayIndex,
  };
}

/** a shape by id (a stored entry's shape is rehydrated by id so the slots are always the
    menu's own, never a hand-edited copy); null when the id is not on the menu */
export function shapeById(id: string | null | undefined): CoreShape | null {
  return CORE_SHAPES.find((s) => s.id === id) ?? null;
}

/** the human line the ledger/card prints: "shape: 2x$60 2-leg + 3x$10 3-4 leg" */
export function shapeLine(sh: CoreShape): string {
  return `shape: ${sh.label}`;
}

/** one slot, named the way the note names it: "$20 3-leg slot", "$10 3-4 leg slot" */
export function slotName(s: CoreSlot): string {
  const legs = s.legs.min === s.legs.max ? `${s.legs.min}-leg` : `${s.legs.min}-${s.legs.max} leg`;
  return `$${s.stake} ${legs} slot`;
}

/**
 * The realized record per leg bucket, read off ledger entries (pure — the caller reads
 * the store). Same money rules as ledger-stats.ts: pending/ungradable tickets are not
 * staked; won returns the grader's payout (stake included); push returns the stake.
 * Only locked paper core tickets count — fun money and the alt world are other records.
 * `from`/`to` bound the window by entry date (inclusive); either may be omitted.
 */
export function bucketRecordFromLedger(
  entries: ReadonlyArray<{
    date: string;
    locked?: boolean;
    paper?: boolean;
    core?: ReadonlyArray<{ id?: string; stake?: number; legs?: ReadonlyArray<unknown> }>;
    grading?: { tickets?: Record<string, { result?: string; payout?: number }> } | null;
  }>,
  opts: { from?: string; to?: string } = {},
): ShapeCalibration {
  const acc = { two: { staked: 0, ret: 0, n: 0 }, long: { staked: 0, ret: 0, n: 0 } };
  let lo: string | null = null;
  let hi: string | null = null;
  for (const e of entries) {
    if (!e.locked || e.paper !== true) continue;
    if (opts.from && e.date < opts.from) continue;
    if (opts.to && e.date > opts.to) continue;
    const g = e.grading?.tickets ?? {};
    for (const t of e.core ?? []) {
      const r = t.id ? g[t.id] : undefined;
      if (!r || !r.result || r.result === "pending" || r.result === "ungradable") continue;
      const bk = legBucket((t.legs ?? []).length);
      if (!bk) continue; // a 1-leg ticket sits in no shape slot — it is not the 2-leg record
      const b = acc[bk];
      const stake = Number(t.stake) || 0;
      b.staked += stake;
      b.n++;
      if (r.result === "won") b.ret += Number(r.payout) || 0;
      else if (r.result !== "lost") b.ret += stake; // push / void — the stake comes back
      if (lo == null || e.date < lo) lo = e.date;
      if (hi == null || e.date > hi) hi = e.date;
    }
  }
  const roi = (b: { staked: number; ret: number }) => (b.staked > 0 ? (b.ret - b.staked) / b.staked : null);
  return {
    bucketRoi: { two: roi(acc.two), long: roi(acc.long) },
    n: { two: acc.two.n, long: acc.long.n },
    window: lo && hi ? `${lo}..${hi}` : null,
  };
}
