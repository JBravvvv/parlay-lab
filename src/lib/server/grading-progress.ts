import { reopenDays } from "@/lib/gate-rebuild";
import { tabPure } from "@/lib/tab-purity";

/**
 * DAILY FULL-POPULATION GRADING — labels, cadence, progress (2026-08-06, operator
 * requirement: 150+/market in days, not months).
 *
 * Three pure pieces the routes share, each guarded by tests/daily-grading.test.ts:
 *
 *  - labelPopulation: selected / unselected / shadow. The HRR lesson encoded — fits and
 *    reviews read LABELED populations, never pooled silently. SHADOW OUTRANKS SELECTED:
 *    a suspended market's row is shadow even when an lkey collision matches a locked leg
 *    (suspension is a property of the market, not of the match).
 *  - decideGradePass: the scheduler's grading ticks — the FIRST tick after each GRADE_SLOTS_PT
 *    time, Pacific clock. Was UTC hours 15 and 2 through 2026-09-07; INSTRUCTION 46
 *    (2026-09-08, "Core Money should be calibrating itself more often") made it 15/18/22/2
 *    UTC; INSTRUCTION 46b the same day (Josh's word, verbatim: "run grading @ 8am, 9:30am,
 *    12pm, 3pm & 4:45pm") made it five Pacific slots, so the realized 2-leg vs 3+-leg record
 *    the shape picker tilts on is refreshed through the slate. The window is the only thing
 *    that can fire a pass: the cron-job.org ticker (docs/cron-jobs.md) pokes /api/scheduler
 *    every 15 min during UTC hours 15-23 and 0-2 ONLY, so a slot outside that window never
 *    ticks and would be dead. Five passes/day x MAX_BOX_FETCHES=14 covers a full slate;
 *    each pass reads ONLY statsapi.mlb.com (schedule + boxscore) and Redis — ZERO Odds
 *    credits (verified against app/api/calibrate/route.ts on 2026-09-08: grade=only returns
 *    before any Odds call). The fire path is untouched.
 *  - buildProgress: the LEARNING PROGRESS artifact — per-market graded n, hit rate vs
 *    implied, by-population split, days-to-150 at the measured 7-day rate. Vacuity rule:
 *    an empty settled population declares itself. Contradictions (a stored grade a fresh
 *    boxscore disagrees with — the impossible branch) ride the artifact LOUDLY.
 */

export const PROGRESS_KEY = "pl:grade:progress";
/** the operator's threshold: 150+ graded per market before the fit is trusted */
export const MARKET_MIN_N = 150;
/** the six prop markets the picks product covers (2026-08-07) — ml/rl are card markets, not picks */
export const PROP_MARKETS = new Set([
  "batter_hits",
  "batter_total_bases",
  "batter_home_runs",
  "batter_hits_runs_rbis",
  "pitcher_strikeouts",
  "pitcher_outs",
]);
/** the cohort size: the day's top-N overs per market (markets thinner than N ship whole) */
export const TOP_N = 50;
/** INSTRUCTION 46b (2026-09-08, Josh's word, verbatim: "Widen the cron-job.org window to run
    grading @ 8am, 9:30am, 12pm, 3pm & 4:45pm"): grading passes are now PACIFIC CLOCK SLOTS,
    not UTC hours. Each slot fires on the FIRST scheduler tick inside [slot, slot+15min)
    America/Los_Angeles, so the same five wall-clock times hold across the PDT->PST flip.
    No cron-job.org change was needed: 08:00-16:45 PT is 15:00-23:45 UTC in PDT and
    16:00-00:45 UTC in PST — every slot sits inside the ticker's window (every 15 min, UTC
    hours 15-23 and 0-2; docs/cron-jobs.md). A slot outside that window would never be poked
    and would be dead — tests/daily-grading.test.ts pins every slot inside it for BOTH
    offsets. The calibrate route's own 10-minute limiter keeps a double tick from grading twice. */
export const GRADE_SLOTS_PT = ["08:00", "09:30", "12:00", "15:00", "16:45"] as const;
/** a tick is "first" while it lands inside this many minutes after the slot */
export const GRADE_SLOT_WINDOW_MIN = 15;

export type Pop = "selected" | "unselected" | "shadow";

export type SelectedMatcher = (lkey: string | null | undefined, label: string | null | undefined) => boolean;

type LockLike = { core?: { legs?: { lkey?: string | null; label?: string | null }[] }[] } | null;

/** Build a matcher from the day's locked card. ML/RL lkeys (`ml_home` form) collide
 *  across games, so those require the LABEL to match as well; prop lkeys carry the
 *  player name and match alone. */
export function makeSelectedMatcher(lock: LockLike): SelectedMatcher {
  const propKeys = new Set<string>();
  const gameKeys = new Set<string>(); // `${lkey}|${label}` for ml_/rl_
  for (const t of lock?.core ?? []) {
    for (const l of t.legs ?? []) {
      const k = l.lkey ?? "";
      if (!k) continue;
      if (k.startsWith("ml_") || k.startsWith("rl_")) gameKeys.add(`${k}|${l.label ?? ""}`);
      else propKeys.add(k);
    }
  }
  return (lkey, label) => {
    const k = lkey ?? "";
    if (!k) return false;
    if (k.startsWith("ml_") || k.startsWith("rl_")) return gameKeys.has(`${k}|${label ?? ""}`);
    return propKeys.has(k);
  };
}

export function labelPopulation(
  rec: { lkey?: string | null; label?: string | null; susp?: boolean },
  selected: SelectedMatcher,
): Pop {
  if (rec.susp) return "shadow"; // outranks selected, by design
  return selected(rec.lkey, rec.label) ? "selected" : "unselected";
}

/** Pacific wall-clock minutes-of-day for an instant (DST-correct via Intl). */
export function ptMinutesOfDay(nowMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(nowMs));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

const slotMinutes = (slot: string) => {
  const [h, m] = slot.split(":").map(Number);
  return h * 60 + m;
};

/** INSTRUCTION 49 (2026-09-09, Josh's word, verbatim: "It shouldn't be refreshing every 15
    minutes. It should be 8am, 9:30am, 12pm, 3pm & 4:45pm"): the five grading slots are ALSO the
    refill slots — one calendar, the same array object, so the two can never drift apart. */
export const REFILL_SLOTS_PT = GRADE_SLOTS_PT;
export type RefillSlot = (typeof REFILL_SLOTS_PT)[number] | "manual";
/** first tick inside [slot, slot + windowMin) for any slot — the one calendar grading and refills share */
export function decideSlotTick(
  nowMs: number,
  slots: readonly string[] = GRADE_SLOTS_PT,
  windowMin = GRADE_SLOT_WINDOW_MIN,
): { fire: boolean; slot: string | null } {
  const m = ptMinutesOfDay(nowMs);
  const slot =
    slots.find((s) => {
      const sm = slotMinutes(s);
      return m >= sm && m < sm + windowMin;
    }) ?? null;
  return { fire: slot !== null, slot };
}
/** How many named refill slots are still AHEAD of this instant today (Pacific) — the headroom a
    manual refill must leave: a manual attempt is refused free when it would spend an attempt one of
    the remaining automatic slots still needs (INSTRUCTION 49 fix round, 2026-09-09). After the 16:45
    slot this is 0 and a manual click is always honoured up to the cap. */
export function slotsAheadPT(nowMs: number, slots: readonly string[] = REFILL_SLOTS_PT): string[] {
  const m = ptMinutesOfDay(nowMs);
  return slots.filter((s) => slotMinutes(s) > m);
}
/** the headroom count itself: slots ahead that no recorded attempt is already stamped with (a
    stamped slot has run and needs no reserve; in production a slot ahead in time is never stamped,
    so this equals slotsAheadPT(now).length — the subtraction only matters to a replayed day) */
export function unstampedSlotsAhead(nowMs: number, stamped: Iterable<string | undefined>): number {
  const seen = new Set<string>();
  for (const s of stamped) if (s) seen.add(s);
  return slotsAheadPT(nowMs).filter((s) => !seen.has(s)).length;
}
/** the exact refusal string both deciders print for that case (blocks.ts and cfb/lock-server.ts) */
export const manualHeadroomRefusal = (left: number, ahead: number) =>
  `manual refill would spend a slot's attempt — ${left} attempt${left === 1 ? "" : "s"} left, ${ahead} automatic slot${ahead === 1 ? "" : "s"} still ahead today`;
/** The scheduler's REFILL cadence (INSTRUCTION 49) — pure. Fires on the first tick inside
    [slot, slot+15min) after each REFILL_SLOTS_PT time, Pacific; Josh's own Refresh runs the
    same server pass with slot "manual" and is never gated by this. */
export function decideRefillTick(nowMs: number): { fire: boolean; slot: string | null; reason: string } {
  const t = decideSlotTick(nowMs, REFILL_SLOTS_PT);
  return t.fire
    ? {
        fire: true,
        slot: t.slot,
        reason: `refill slot ${t.slot} PT — the scheduler re-prices and appends on the first tick after each of ${REFILL_SLOTS_PT.join("/")} PT`,
      }
    : {
        fire: false,
        slot: null,
        reason: `not a refill slot (automatic refills run on the first tick after ${REFILL_SLOTS_PT.join("/")} PT; Josh's own Refresh runs the same pass any time)`,
      };
}

/** The scheduler's grading cadence — pure, so the guard exercises it without a server.
    Fires on the first tick (within GRADE_SLOT_WINDOW_MIN minutes) after each GRADE_SLOTS_PT
    time, Pacific. A wrapper over decideSlotTick since INSTRUCTION 49; the strings are unchanged. */
export function decideGradePass(nowMs: number): { fire: boolean; reason: string } {
  const t = decideSlotTick(nowMs, GRADE_SLOTS_PT, GRADE_SLOT_WINDOW_MIN);
  if (t.fire) return { fire: true, reason: `first tick of grading slot ${t.slot} PT` };
  return { fire: false, reason: `not a grading tick (grading runs on the first tick after ${GRADE_SLOTS_PT.join("/")} PT)` };
}

type PickLike = { market: string; res: "won" | "lost"; pMkt?: number | null; p?: number; pop?: string };
type PerDay = { date: string; byMarket: Record<string, number>; n: number };

export type Progress = {
  at: number;
  /** which code wrote it — the stale-summary class; stamped by the calibrate route */
  rev?: string;
  need: number;
  perMarket: Record<
    string,
    {
      n: number;
      hits: number;
      hitRate: number | null;
      /** mean implied probability (0-1): pMkt where logged, model p as fallback — source counted */
      impliedMean: number | null;
      impliedFromPMkt: number;
      byPop: { selected: number; unselected: number; shadow: number };
      hitRateByPop: { selected: number | null; unselected: number | null; shadow: number | null };
      perDay7: number;
      need: number;
      daysTo150: number | null;
    }
  >;
  rateDays: number;
  contradictions: number;
  /** the picks product's running record (2026-08-07) — attached by the calibrate route */
  cohorts?: CohortRecord;
  flag?: string;
  vacuous?: string;
};

/* ── THE PICKS COHORT (2026-08-07, operator: ship picks with a graded running record) ──
   The cohort is "the day's top-N overs per prop market". Two sources, split and labeled,
   never pooled silently:
     STAMPED-AT-LOCK            — rows carrying mrank (stamped at generation, append-only)
     RECONSTRUCTED-FROM-STORED-BOARD — pre-stamp dates: a re-sort of stored IMMUTABLE p
        over non-superseded rows. Approximation stated: supersession collapses to the
        surviving statement; the sort is over stored values, never recomputed ones.
   IMPOSSIBLE BRANCH, SCOPED BY THE REVIEW (2026-08-07 adversarial pass, finding 1): two
   row classes are rankless BY DESIGN and must never fire it — impure rows (stamped with
   NO rank on purpose; re-checked here via tabPure and counted `impure`), and rows written
   before/during the stamp ship (dates <= STAMP_SHIP_DATE; counted `preStamp` — the
   deploy-transition day can legitimately hold both vintages). The red flag fires only for
   a PURE settled row with no rank on a POST-ship date whose market carries stamped rows —
   the true two-writers shape. Excluded rather than guessed, printed, never silent. */

/** the date the mrank stamp shipped — rankless rows on or before it are expected */
export const STAMP_SHIP_DATE = "2026-08-07";

type CohortRow = {
  market?: string;
  lkey?: string | null;
  res?: string;
  superseded?: boolean;
  mrank?: number;
  p?: number;
  pMkt?: number | null;
};

export type CohortDay = {
  date: string;
  markets: Record<string, { n: number; w: number; l: number; source: string; impliedSum: number; impliedN: number }>;
  impossible: { date: string; market: string; lkey: string | null }[];
  /** impure rows (cross-market lkey) — rankless BY DESIGN, excluded and counted, never flagged */
  impure: number;
  /** pure rankless rows on dates <= STAMP_SHIP_DATE — the pre-ship/transition vintage, expected */
  preStamp: number;
};

export function cohortDay(blob: { records?: Record<string, CohortRow> } | null, date: string): CohortDay {
  const out: CohortDay = { date, markets: {}, impossible: [], impure: 0, preStamp: 0 };
  /* MEMBERSHIP is decided over the day's FULL stored population (2026-08-07 review,
     medium #3): reconstruction must rank ALL non-superseded pure rows — settled or not —
     and then grade the settled members. Ranking only settled rows would promote rank-60
     rows into "the top 50" whenever higher-ranked rows went void or are still pending. */
  const all: CohortRow[] = [];
  for (const r of Object.values(blob?.records ?? {})) {
    if (r.superseded || !PROP_MARKETS.has(r.market ?? "")) continue;
    if (!tabPure(r.market!, r.lkey ?? null)) {
      if (r.res === "won" || r.res === "lost") out.impure++; // contamination, counted, never flagged
      continue;
    }
    all.push(r);
  }
  const byMarket = new Map<string, CohortRow[]>();
  for (const r of all) {
    if (!byMarket.has(r.market!)) byMarket.set(r.market!, []);
    byMarket.get(r.market!)!.push(r);
  }
  const isSettled = (r: CohortRow) => r.res === "won" || r.res === "lost";
  for (const [m, rows] of byMarket) {
    const stamped = rows.filter((r) => r.mrank != null);
    let cohort: CohortRow[]; // the SETTLED members of the day's membership
    let source: string;
    if (stamped.length) {
      /* MULTI-GENERATION SEMANTICS, stated (review high #1 — accepted and named, not
         hidden): on a day with several passes the merged blob holds each pick at the rank
         IT WAS PUBLISHED AT, so the graded cohort is the UNION of top-N statements across
         the day's generations — every row here was a published pick when stated. That
         union DELIBERATELY includes: rows a later pass froze (game started), rows marked
         `stale` (their line moved — the statement stands; you would have bet the stated
         line), and duplicate rank VALUES from different passes. Restated same-line rows
         collapse to the survivor (supersession). Per-day n prints the union's size —
         a 100-row "top-50" day is visible, never silent; there is no single "the top 50"
         on a multi-pass day and this does not pretend otherwise. */
      cohort = stamped.filter((r) => (r.mrank as number) <= TOP_N && isSettled(r));
      source = "STAMPED-AT-LOCK";
      for (const r of rows) {
        if (r.mrank != null || !isSettled(r)) continue;
        /* pure + rankless in a stamped-era market: the transition day holds both vintages
           legitimately; only a POST-ship date makes this the two-writers impossible shape */
        if (date <= STAMP_SHIP_DATE) out.preStamp++;
        else out.impossible.push({ date, market: m, lkey: r.lkey ?? null });
      }
    } else {
      const membership = rows
        .slice()
        .sort((a, b) => (b.p ?? 0) - (a.p ?? 0) || String(a.lkey).localeCompare(String(b.lkey)))
        .slice(0, TOP_N);
      cohort = membership.filter(isSettled);
      source = "RECONSTRUCTED-FROM-STORED-BOARD";
    }
    if (!cohort.length) continue;
    const w = cohort.filter((r) => r.res === "won").length;
    /* pMkt carries a 0 sentinel for null implied (pred-serialize L244's `?? 0`) — a true
       implied of 0 does not exist, so 0 means absent (review finding, low #2) */
    const implied = cohort
      .map((r) => (r.pMkt != null && r.pMkt > 0 ? r.pMkt : (r.p ?? null)))
      .filter((v): v is number => v != null && v > 0);
    out.markets[m] = {
      n: cohort.length,
      w,
      l: cohort.length - w,
      source,
      impliedSum: implied.reduce((a, v) => a + v, 0),
      impliedN: implied.length,
    };
  }
  return out;
}

export type CohortRecord = {
  markets: Record<
    string,
    {
      days: number;
      n: number;
      w: number;
      l: number;
      hitRate: number | null;
      impliedMean: number | null;
      bySource: { stamped: number; reconstructed: number };
      perDay: { date: string; n: number; w: number; l: number; source: string }[];
    }
  >;
  impossible: CohortDay["impossible"];
  /** designed-rankless populations, counted not flagged (review finding 1) */
  impure: number;
  preStamp: number;
  flag?: string;
  vacuous?: string;
};

export function buildCohortRecord(days: CohortDay[]): CohortRecord {
  const rec: CohortRecord = {
    markets: {},
    impossible: days.flatMap((d) => d.impossible),
    impure: days.reduce((a, d) => a + d.impure, 0),
    preStamp: days.reduce((a, d) => a + d.preStamp, 0),
  };
  if (rec.impossible.length) {
    rec.flag = `🔴 IMPOSSIBLE BRANCH: ${rec.impossible.length} PURE settled row(s) without a stored rank on POST-ship dates (> ${STAMP_SHIP_DATE}) inside stamped-era cohorts — two writers, membership undecidable; rows EXCLUDED and printed here. STOP AND READ.`;
  }
  let any = false;
  for (const d of days.slice().sort((a, b) => (a.date < b.date ? -1 : 1))) {
    for (const [m, v] of Object.entries(d.markets)) {
      any = true;
      const cur = (rec.markets[m] ??= {
        days: 0,
        n: 0,
        w: 0,
        l: 0,
        hitRate: null,
        impliedMean: null,
        bySource: { stamped: 0, reconstructed: 0 },
        perDay: [],
      });
      cur.days++;
      cur.n += v.n;
      cur.w += v.w;
      cur.l += v.l;
      if (v.source === "STAMPED-AT-LOCK") cur.bySource.stamped += v.n;
      else cur.bySource.reconstructed += v.n;
      cur.perDay.push({ date: d.date, n: v.n, w: v.w, l: v.l, source: v.source });
      if (cur.perDay.length > 10) cur.perDay.shift();
    }
  }
  for (const m of Object.values(rec.markets)) {
    m.hitRate = m.n ? m.w / m.n : null;
  }
  // impliedMean per market needs the sums — recompute in a second pass over days
  const impSum: Record<string, { s: number; n: number }> = {};
  for (const d of days)
    for (const [m, v] of Object.entries(d.markets)) {
      (impSum[m] ??= { s: 0, n: 0 }).s += v.impliedSum;
      impSum[m].n += v.impliedN;
    }
  for (const [m, v] of Object.entries(impSum)) {
    if (rec.markets[m]) rec.markets[m].impliedMean = v.n ? v.s / v.n / 100 : null;
  }
  if (!any) rec.vacuous = "VACUOUS — zero settled cohort rows on any date; the record has no population";
  return rec;
}

export function buildProgress(picks: PickLike[], perDay: PerDay[], today: string, now: number, contradictions: number): Progress {
  const out: Progress = { at: now, need: MARKET_MIN_N, perMarket: {}, rateDays: 0, contradictions };
  if (contradictions > 0) {
    out.flag = `🔴 IMPOSSIBLE BRANCH: ${contradictions} graded row(s) contradict a fresh statsapi boxscore — stored grades were NOT overwritten; both readings are in the calibrate log. STOP AND READ.`;
  }
  if (!picks.length) {
    out.vacuous = "VACUOUS — zero settled graded rows; every per-market check below has no population";
    return out;
  }
  const complete = perDay.filter((d) => d.date < today);
  const window7 = complete.slice(-7);
  out.rateDays = window7.length;

  const markets = new Map<string, PickLike[]>();
  for (const p of picks) {
    if (!markets.has(p.market)) markets.set(p.market, []);
    markets.get(p.market)!.push(p);
  }
  for (const [m, rows] of markets) {
    const hits = rows.filter((r) => r.res === "won").length;
    /* pMkt's 0 is a stored null-sentinel (pred-serialize `?? 0`), never a real implied */
    const withImplied = rows
      .map((r) => {
        const fromPMkt = r.pMkt != null && r.pMkt > 0;
        return { v: fromPMkt ? (r.pMkt as number) : (r.p ?? null), fromPMkt };
      })
      .filter((x) => x.v != null && (x.v as number) > 0);
    const byPop = { selected: 0, unselected: 0, shadow: 0 };
    const hitsByPop = { selected: 0, unselected: 0, shadow: 0 };
    for (const r of rows) {
      const pop = (r.pop === "selected" || r.pop === "unselected" || r.pop === "shadow" ? r.pop : null) as Pop | null;
      if (pop) {
        byPop[pop]++;
        if (r.res === "won") hitsByPop[pop]++;
      }
    }
    const rate = out.rateDays ? window7.reduce((a, d) => a + (d.byMarket[m] ?? 0), 0) / out.rateDays : 0;
    out.perMarket[m] = {
      n: rows.length,
      hits,
      hitRate: rows.length ? hits / rows.length : null,
      impliedMean: withImplied.length ? withImplied.reduce((a, x) => a + (x.v as number), 0) / withImplied.length / 100 : null,
      impliedFromPMkt: withImplied.filter((x) => x.fromPMkt).length,
      byPop,
      hitRateByPop: {
        selected: byPop.selected ? hitsByPop.selected / byPop.selected : null,
        unselected: byPop.unselected ? hitsByPop.unselected / byPop.unselected : null,
        shadow: byPop.shadow ? hitsByPop.shadow / byPop.shadow : null,
      },
      perDay7: Math.round(rate * 100) / 100,
      need: MARKET_MIN_N,
      daysTo150: reopenDays(rows.length, rate, MARKET_MIN_N),
    };
  }
  return out;
}
