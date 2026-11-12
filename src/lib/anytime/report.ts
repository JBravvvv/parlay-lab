import { AZ_BOOKS, type AzBook } from "@/lib/az/books";
import { amDec, clvOf, noVig, priceClvOf } from "@/lib/az/market";
import { ANYTIME_RULES, type AnytimeRules } from "@/lib/anytime/rules";
import type { LedgerRow } from "@/lib/anytime/ledger";

/**
 * REPORTING, RECOMPUTED FROM THE RAW LEDGER EVERY TIME (pure).
 *
 * Every number the UI shows comes out of `reportOf(rows)`, and `rows` are the stored pick, grade,
 * close and void records and nothing else. There is no running total kept anywhere that the report
 * trusts; the bankroll cache the engine sizes Kelly stakes on is CHECKED against this recomputation
 * (`bankOf`), never the other way round.
 *
 * Profit and ROI are always side by side, so volume cannot pass for edge. Every split carries its
 * sample size and a 95% interval.
 */

export type Interval = { mean: number; lo: number; hi: number; n: number };

/** Mean with a 95% normal interval (per-pick values treated as independent draws; picks on the
    same game are not independent, so the true interval is somewhat wider). Null when empty. */
export function intervalOf(xs: number[]): Interval | null {
  const n = xs.length;
  if (!n) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { mean, lo: mean, hi: mean, n };
  const v = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const half = 1.96 * Math.sqrt(v / n);
  return { mean, lo: mean - half, hi: mean + half, n };
}

/** The decimal a book pays on a win: from the American price taken, never from the rounded `dec` kept for display. */
export const payDec = (p: { price: number }): number => amDec(p.price);

/** Profit per 1 staked for a settled pick: win pays dec-1, loss costs 1, push and void return the stake. */
export function returnOf(result: "won" | "lost" | "push" | "void", dec: number): number {
  return result === "won" ? dec - 1 : result === "lost" ? -1 : 0;
}

export type Stats = {
  /** Picks recorded (voided ones excluded). */
  picks: number;
  /** Picks settled won / lost / push. */
  graded: number;
  won: number;
  lost: number;
  push: number;
  open: number;
  winRate: number | null;
  /** Flat bankroll: 1 unit a pick. */
  flatStaked: number;
  flatProfit: number;
  flatRoi: Interval | null;
  /** Kelly bankroll: the fractional-Kelly units recorded on each pick. */
  kellyStaked: number;
  kellyProfit: number;
  kellyRoi: number | null;
  /** Largest peak-to-trough fall of the flat bankroll, in units, in settlement order. */
  maxDrawdown: number;
  /** Closing line value at the SAME book the pick was taken at: against that book's closing no-vig
      number (`clv`), and price against price (`priceClv`). Same line only. */
  clv: Interval | null;
  priceClv: Interval | null;
  /** Share of picks with a same-line close at the pick's own book that beat it on price. */
  beatClose: number | null;
  /** Picks whose pick-book close was at a different line (not in the CLV means above). */
  lineMoved: number;
  /** Average model EV and model-free price EV claimed at pick time. */
  claimedEv: number | null;
  claimedPriceEv: number | null;
  /** Calibration of the MODEL probability and of the two-book MARKET probability on the same picks. */
  brierModel: number | null;
  brierMarket: number | null;
  logLossModel: number | null;
  logLossMarket: number | null;
};

const clamp = (p: number) => Math.min(1 - 1e-9, Math.max(1e-9, p));

export function statsOf(rows: LedgerRow[]): Stats {
  /* a pick marked void, or settled void (postponed past the book's window), is in no number */
  const live = rows.filter((r) => !r.void && r.grade?.result !== "void");
  const settled = live.filter((r) => r.grade);
  const decided = settled.filter((r) => r.grade!.result === "won" || r.grade!.result === "lost");
  const won = settled.filter((r) => r.grade!.result === "won").length;
  const lost = settled.filter((r) => r.grade!.result === "lost").length;
  const push = settled.filter((r) => r.grade!.result === "push").length;
  const rets = settled.map((r) => returnOf(r.grade!.result, payDec(r.pick)));
  const flatProfit = rets.reduce((a, b) => a + b, 0);
  const kellyStaked = settled.reduce((a, r) => a + r.pick.stakeKelly, 0);
  const kellyProfit = settled.reduce((a, r) => a + r.pick.stakeKelly * returnOf(r.grade!.result, payDec(r.pick)), 0);

  /* drawdown in the order the picks settled */
  const order = [...settled].sort((a, b) => (a.grade!.gradedAt < b.grade!.gradedAt ? -1 : a.grade!.gradedAt > b.grade!.gradedAt ? 1 : a.pick.id < b.pick.id ? -1 : 1));
  let run = 0;
  let peak = 0;
  let dd = 0;
  for (const r of order) {
    run += returnOf(r.grade!.result, payDec(r.pick));
    peak = Math.max(peak, run);
    dd = Math.max(dd, peak - run);
  }

  const clvs: number[] = [];
  const pclvs: number[] = [];
  let beat = 0;
  let lineMoved = 0;
  for (const r of live) {
    const c = clvAtOwnBook(r);
    if (c.lineMoved) lineMoved++;
    if (c.clv != null) clvs.push(c.clv);
    if (c.priceClv != null) {
      pclvs.push(c.priceClv);
      if (c.priceClv > 0) beat++;
    }
  }

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const y = (r: LedgerRow) => (r.grade!.result === "won" ? 1 : 0);
  return {
    picks: live.length,
    graded: settled.length,
    won,
    lost,
    push,
    open: live.length - live.filter((r) => r.grade).length,
    winRate: decided.length ? won / decided.length : null,
    flatStaked: settled.length,
    flatProfit,
    flatRoi: intervalOf(rets),
    kellyStaked,
    kellyProfit,
    kellyRoi: kellyStaked > 0 ? kellyProfit / kellyStaked : null,
    maxDrawdown: dd,
    clv: intervalOf(clvs),
    priceClv: intervalOf(pclvs),
    beatClose: pclvs.length ? beat / pclvs.length : null,
    lineMoved,
    claimedEv: mean(live.map((r) => r.pick.ev)),
    claimedPriceEv: mean(live.map((r) => r.pick.priceEv)),
    brierModel: mean(decided.map((r) => (r.pick.modelP - y(r)) ** 2)),
    brierMarket: mean(decided.map((r) => (r.pick.fairP - y(r)) ** 2)),
    logLossModel: mean(decided.map((r) => -Math.log(y(r) ? clamp(r.pick.modelP) : 1 - clamp(r.pick.modelP)))),
    logLossMarket: mean(decided.map((r) => -Math.log(y(r) ? clamp(r.pick.fairP) : 1 - clamp(r.pick.fairP)))),
  };
}

const sameLine = (a: number | null, b: number | null) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 1e-9);

/** CLV of one pick against the close AT THE BOOK IT WAS TAKEN AT. The other book's close is kept on
    the record for reference and is not what the pick is judged by. */
export function clvAtOwnBook(r: LedgerRow): { clv: number | null; priceClv: number | null; lineMoved: boolean; otherPriceClv: number | null } {
  const own = r.close?.books?.[r.pick.book];
  const otherBook: AzBook = r.pick.book === "draftkings" ? "fanduel" : "draftkings";
  const other = r.close?.books?.[otherBook];
  const otherPriceClv = other && sameLine(other.line, r.pick.line) ? priceClvOf(r.pick.price, other.price) : null;
  if (!own) return { clv: null, priceClv: null, lineMoved: false, otherPriceClv };
  if (!sameLine(own.line, r.pick.line)) return { clv: null, priceClv: null, lineMoved: true, otherPriceClv };
  const nv = noVig(own.price, own.opp);
  return { clv: nv ? clvOf(r.pick.price, nv.p) : null, priceClv: priceClvOf(r.pick.price, own.price), lineMoved: false, otherPriceClv };
}

/* ---------- calibration ---------- */

export type CalBucket = { lo: number; hi: number; n: number; predicted: number | null; actual: number | null };

/** Reliability table: picks bucketed by predicted probability, predicted vs actual win rate. */
export function calibrationOf(rows: LedgerRow[], which: "model" | "market" = "model", edges: number[] = [0, 0.3, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 1.0001]): CalBucket[] {
  const decided = rows.filter((r) => !r.void && r.grade && (r.grade.result === "won" || r.grade.result === "lost"));
  const out: CalBucket[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i];
    const hi = edges[i + 1];
    const inb = decided.filter((r) => {
      const p = which === "model" ? r.pick.modelP : r.pick.fairP;
      return p >= lo && p < hi;
    });
    out.push({
      lo,
      hi: Math.min(1, hi),
      n: inb.length,
      predicted: inb.length ? inb.reduce((a, r) => a + (which === "model" ? r.pick.modelP : r.pick.fairP), 0) / inb.length : null,
      actual: inb.length ? inb.filter((r) => r.grade!.result === "won").length / inb.length : null,
    });
  }
  return out;
}

/* ---------- splits ---------- */

export type Split = { key: string; stats: Stats };

function splitBy(rows: LedgerRow[], keyOf: (r: LedgerRow) => string): Split[] {
  const groups = new Map<string, LedgerRow[]>();
  for (const r of rows) {
    const k = keyOf(r);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([key, rs]) => ({ key, stats: statsOf(rs) }));
}

export type Report = {
  generatedAt: string;
  /** DraftKings, FanDuel, combined: always all three. */
  byBook: Record<AzBook | "combined", Stats>;
  bySport: Split[];
  byMarket: Split[];
  byTrigger: Split[];
  byModel: Split[];
  byBasis: Split[];
  byEngine: Split[];
  calibration: { model: CalBucket[]; market: CalBucket[] };
  bank: Bank;
  /** Picks marked void (not available in AZ, postponed, no action): listed, never counted. */
  voided: number;
};

export type Bank = { kelly: number; flat: number; graded: number };

/** The two bankrolls, from scratch: Kelly starts at `rules.kelly.start` units, flat starts at 0. */
export function bankOf(rows: LedgerRow[], rules: AnytimeRules = ANYTIME_RULES): Bank {
  let kelly: number = rules.kelly.start;
  let flat = 0;
  let graded = 0;
  for (const r of rows) {
    if (r.void || !r.grade || r.grade.result === "void") continue;
    const ret = returnOf(r.grade.result, payDec(r.pick));
    kelly += r.pick.stakeKelly * ret;
    flat += ret;
    graded++;
  }
  return { kelly: Math.round(kelly * 100) / 100, flat: Math.round(flat * 1e4) / 1e4, graded };
}

export function reportOf(rows: LedgerRow[], now: number, rules: AnytimeRules = ANYTIME_RULES): Report {
  const byBook = { combined: statsOf(rows) } as Report["byBook"];
  for (const b of AZ_BOOKS) byBook[b] = statsOf(rows.filter((r) => r.pick.book === b));
  return {
    generatedAt: new Date(now).toISOString(),
    byBook,
    bySport: splitBy(rows, (r) => r.pick.sport),
    byMarket: splitBy(rows, (r) => `${r.pick.sport}:${r.pick.market}`),
    byTrigger: splitBy(rows, (r) => r.pick.trigger),
    byModel: splitBy(rows, (r) => r.pick.modelVersion),
    byBasis: splitBy(rows, (r) => r.pick.basis),
    byEngine: splitBy(rows, (r) => r.pick.engine),
    calibration: { model: calibrationOf(rows, "model"), market: calibrationOf(rows, "market") },
    bank: bankOf(rows, rules),
    voided: rows.filter((r) => r.void || r.grade?.result === "void").length,
  };
}

/** Decimal of an American price, exported for the UI so it never re-derives payout math. */
export const decOf = amDec;
