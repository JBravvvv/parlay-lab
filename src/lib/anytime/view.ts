import type { AzBook } from "@/lib/az/books";
import { HISTORY_DESK_NAME, type HistoryLine, type HistorySummary } from "@/lib/az/history";
import type { LedgerRow } from "@/lib/anytime/ledger";
import { clvAtOwnBook, payDec, returnOf, type CalBucket, type Interval, type Report, type Split, type Stats } from "@/lib/anytime/report";

/**
 * WHAT THE /anytime PAGE SHOWS, AS PLAIN VALUES (pure).
 *
 * The page renders these and computes nothing itself, so every figure on screen is one of:
 *   - a number out of `reportOf(rows)` (the server recomputes it from the raw ledger each read), or
 *   - a field stored on the pick, its grade or its close.
 * A missing value is the dash, never a zero: absent is not zero.
 */

export const DASH = "—";
export const BOOK_NAME: Record<AzBook | "combined", string> = { draftkings: "DraftKings", fanduel: "FanDuel", combined: "Combined" };
export const BOOK_ORDER = ["draftkings", "fanduel", "combined"] as const;

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "");

/** "+1.25u" / "−0.40u" / "0.00u" / dash. */
export function units(v: unknown, dp = 2): string {
  if (!fin(v)) return DASH;
  const r = Number(v.toFixed(dp));
  return `${sign(r)}${Math.abs(r).toFixed(dp)}u`;
}

/** A signed percentage of a fraction: 0.074 → "+7.4%". */
export function pct(v: unknown, dp = 1): string {
  if (!fin(v)) return DASH;
  const r = Number((v * 100).toFixed(dp));
  return `${sign(r)}${Math.abs(r).toFixed(dp)}%`;
}

/** An unsigned probability: 0.512 → "51.2%". */
export function prob(v: unknown, dp = 1): string {
  return fin(v) ? `${(v * 100).toFixed(dp)}%` : DASH;
}

/** American odds with their sign: -105 → "−105", 120 → "+120". */
export function american(v: unknown): string {
  if (!fin(v)) return DASH;
  return v > 0 ? `+${v}` : `−${Math.abs(v)}`;
}

/** "+2.1% (−6.0% to +10.2%, n 41)" — the mean never without its interval and its sample. */
export function interval(i: Interval | null | undefined, dp = 1): string {
  if (!i) return DASH;
  return `${pct(i.mean, dp)} (${pct(i.lo, dp)} to ${pct(i.hi, dp)}, n ${i.n})`;
}

export type Tone = "pos" | "neg" | "muted";
export const toneOf = (v: unknown): Tone => (fin(v) && v > 0 ? "pos" : fin(v) && v < 0 ? "neg" : "muted");

/* ---------- the record, by book ---------- */

export type RecordRow = {
  key: string;
  name: string;
  picks: number;
  graded: number;
  open: number;
  record: string;
  flatProfit: string;
  flatRoi: string;
  flatRoiRange: string;
  kellyProfit: string;
  kellyRoi: string;
  clv: string;
  clvN: number;
  beatClose: string;
  drawdown: string;
  tone: Tone;
};

export function recordRow(key: string, name: string, s: Stats): RecordRow {
  return {
    key,
    name,
    picks: s.picks,
    graded: s.graded,
    open: s.open,
    record: `${s.won}-${s.lost}${s.push ? `-${s.push}` : ""}`,
    flatProfit: s.graded ? units(s.flatProfit) : DASH,
    flatRoi: s.flatRoi ? pct(s.flatRoi.mean) : DASH,
    flatRoiRange: s.flatRoi ? `${pct(s.flatRoi.lo)} to ${pct(s.flatRoi.hi)}` : DASH,
    kellyProfit: s.graded ? units(s.kellyProfit) : DASH,
    kellyRoi: pct(s.kellyRoi),
    clv: s.clv ? pct(s.clv.mean, 2) : DASH,
    clvN: s.clv?.n ?? 0,
    beatClose: s.beatClose == null ? DASH : prob(s.beatClose, 0),
    drawdown: s.graded ? units(-Math.abs(s.maxDrawdown)) : DASH,
    tone: s.graded ? toneOf(s.flatProfit) : "muted",
  };
}

/** Always three rows, in this order: DraftKings, FanDuel, combined. */
export function bookRows(report: Report): RecordRow[] {
  return BOOK_ORDER.map((k) => recordRow(k, BOOK_NAME[k], report.byBook[k]));
}

export const SPLITS = [
  { key: "bySport", label: "Sport" },
  { key: "byMarket", label: "Market" },
  { key: "byTrigger", label: "Trigger" },
  { key: "byModel", label: "Model" },
  { key: "byBasis", label: "Basis" },
] as const;
export type SplitKey = (typeof SPLITS)[number]["key"];

export function splitRows(splits: Split[] | undefined): RecordRow[] {
  return (splits ?? []).map((s) => recordRow(s.key, s.key, s.stats));
}

/* ---------- calibration ---------- */

export type CalRow = { range: string; n: number; predicted: string; actual: string; gap: string };

export function calRows(buckets: CalBucket[] | undefined): CalRow[] {
  return (buckets ?? [])
    .filter((b) => b.n > 0)
    .map((b) => ({
      range: `${Math.round(b.lo * 100)}–${Math.min(100, Math.round(b.hi * 100))}%`,
      n: b.n,
      predicted: prob(b.predicted),
      actual: prob(b.actual),
      gap: fin(b.predicted) && fin(b.actual) ? pct(b.actual - b.predicted) : DASH,
    }));
}

/* ---------- one pick ---------- */

export type PickStatus = "open" | "won" | "lost" | "push" | "void";
export const STATUS_WORD: Record<PickStatus, string> = { open: "open", won: "won", lost: "lost", push: "push", void: "void" };

export function statusOf(r: LedgerRow): PickStatus {
  if (r.void) return "void";
  if (!r.grade) return "open";
  return r.grade.result === "won" || r.grade.result === "lost" || r.grade.result === "push" ? r.grade.result : "void";
}

const VOID_WORD: Record<string, string> = {
  not_available_az: "not available in AZ",
  postponed: "postponed past the book's window",
  no_action: "no action",
};

export type PickView = {
  id: string;
  ts: string;
  sport: string;
  event: string;
  selection: string;
  /** "FanDuel −105" */
  taken: string;
  /** "DraftKings −110" or "DraftKings: not offered" */
  other: string;
  model: string;
  fair: string;
  ev: string;
  priceEv: string;
  stake: string;
  status: PickStatus;
  statusLine: string;
  /** Flat profit in units once settled, dash while open or void. */
  profit: string;
  profitTone: Tone;
  /** Same-book closing line value, or why there is none. */
  clv: string;
  trigger: string;
  basis: string;
  modelKind: string;
  reentry: string | null;
  marketType: string;
  /** A pick can be marked "not available in AZ" until it is void. */
  canVoid: boolean;
};

export function pickView(r: LedgerRow): PickView {
  const p = r.pick;
  const status = statusOf(r);
  const settled = status === "won" || status === "lost" || status === "push";
  const ret = settled ? returnOf(r.grade!.result, payDec(p)) : null;
  const c = clvAtOwnBook(r);
  const reason = r.void?.reason ?? r.grade?.reason ?? "";
  return {
    id: p.id,
    ts: p.ts,
    sport: p.sport.toUpperCase(),
    event: p.event,
    selection: p.selection,
    taken: `${BOOK_NAME[p.book]} ${american(p.price)}`,
    other: p.otherPrice == null ? `${BOOK_NAME[p.otherBook]}: not offered` : `${BOOK_NAME[p.otherBook]} ${american(p.otherPrice)}`,
    model: prob(p.modelP),
    fair: prob(p.fairP),
    ev: pct(p.ev),
    priceEv: pct(p.priceEv),
    stake: `1u flat · ${fin(p.stakeKelly) ? `${p.stakeKelly.toFixed(2)}u` : DASH} Kelly`,
    status,
    statusLine: status === "void" ? `void${reason ? ` · ${VOID_WORD[reason] ?? reason.replace(/_/g, " ")}` : ""}` : settled && r.grade?.detail ? `${STATUS_WORD[status]} · ${r.grade.detail}` : STATUS_WORD[status],
    profit: ret == null ? DASH : units(ret),
    profitTone: ret == null ? "muted" : toneOf(ret),
    clv: c.lineMoved ? "line moved" : c.clv != null ? `${pct(c.clv, 2)} vs ${BOOK_NAME[p.book]} close` : c.priceClv != null ? `${pct(c.priceClv, 2)} price vs close` : r.close ? "no close at this line" : "close not stored yet",
    trigger: p.trigger,
    basis: p.basis === "price" ? "price: the two books' own number says it pays" : "model only: the two-book market disagrees",
    modelKind: p.modelKind === "independent" ? `${p.modelVersion} (independent signal)` : `${p.modelVersion} (market only)`,
    reentry: p.seq > 1 ? `re-entry #${p.seq}` : null,
    marketType: p.marketType,
    canVoid: status !== "void",
  };
}

/* ---------- time ---------- */

/** "just now", "12 min ago", "3 h ago", "2 d ago". */
export function ago(iso: string | null | undefined, now: number): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return DASH;
  const m = Math.max(0, Math.round((now - t) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}

/* ---------- a run's answer, in one line ---------- */

type RunBody = { status?: string; picks?: unknown; graded?: unknown; candidates?: unknown; skipped?: unknown; errors?: unknown; error?: unknown; odds?: { credits?: unknown; remaining?: unknown } | null };

export function runLine(httpStatus: number, body: RunBody | null): { tone: Tone; text: string } {
  if (httpStatus === 401) return { tone: "neg", text: "Your sync phrase didn't match. Set it in Settings." };
  if (httpStatus === 503) return { tone: "neg", text: "The pick engine is not configured on the server yet." };
  if (!body) return { tone: "neg", text: `The server answered ${httpStatus} with nothing readable.` };
  const n = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  const errs = Array.isArray(body.errors) ? (body.errors as unknown[]).map(String) : body.error ? [String(body.error)] : [];
  if (body.status === "busy") return { tone: "muted", text: "Another run is already in progress. Nothing was recorded twice; try again in a minute." };
  if (body.status === "failed" || httpStatus >= 400) return { tone: "neg", text: `Run failed: ${errs[0] ?? `HTTP ${httpStatus}`}` };
  const credits = body.odds && fin(body.odds.credits) ? `${body.odds.credits} Odds credit${body.odds.credits === 1 ? "" : "s"}` : "no Odds call";
  const picks = n(body.picks);
  const head = picks ? `${picks} new pick${picks === 1 ? "" : "s"}` : "No new pick: nothing cleared the bar";
  const tail = [`${fin(body.candidates) ? body.candidates : DASH} prices checked`, n(body.graded) ? `${n(body.graded)} graded` : "", credits, body.status === "partial" ? `partial: ${errs[0] ?? "one feed failed"}` : ""].filter(Boolean);
  return { tone: body.status === "partial" ? "neg" : picks ? "pos" : "muted", text: `${head} · ${tail.join(" · ")}` };
}

/* ---------- the older desks' tickets, tagged by book (never counted above) ---------- */

/** Signed dollars: 12.5 → "+$12.50", -376.91 → "−$376.91". */
export function dollars(v: unknown): string {
  if (!fin(v)) return DASH;
  const r = Number(v.toFixed(2));
  return `${sign(r)}$${Math.abs(r).toFixed(2)}`;
}

export type HistoryRow = {
  key: string;
  name: string;
  /** "legacy · not counted" for a book other than the two, otherwise "older desks · listed, not added in" */
  tag: string;
  legacy: boolean;
  picks: number;
  graded: number;
  open: number;
  record: string;
  staked: string;
  profit: string;
  roi: string;
  dates: string;
  /** how the book was decided, when it was not stamped on every ticket */
  how: string;
  tone: Tone;
};

export type HistoryData = { ok?: boolean; error?: string; summary?: HistorySummary; names?: Record<string, string> };

function historyRow(key: string, name: string, legacy: boolean, l: HistoryLine): HistoryRow {
  const priced = l.graded > 0 && l.staked > 0;
  return {
    key,
    name,
    tag: legacy ? "legacy · not counted" : "older desks · listed, not added in",
    legacy,
    picks: l.picks,
    graded: l.graded,
    open: l.open + l.ungradable,
    record: `${l.won}-${l.lost}${l.push ? `-${l.push}` : ""}`,
    staked: l.staked > 0 ? `$${l.staked.toFixed(2)}` : DASH,
    profit: priced ? dollars(l.profit) : DASH,
    roi: pct(l.roi),
    dates: l.from && l.to ? (l.from === l.to ? l.from : `${l.from} to ${l.to}`) : DASH,
    how: l.picks === 0 ? "" : l.inferred === 0 ? "book stamped on every ticket" : l.inferred === l.picks ? "book from the ticket's date" : `book from the ticket's date on ${l.inferred} of ${l.picks}`,
    tone: priced ? toneOf(l.profit) : "muted",
  };
}

/** One row per book found in the stored tickets: legacy books first, then DraftKings / FanDuel. */
export function historyBookRows(h: HistoryData | null | undefined): HistoryRow[] {
  const s = h?.summary;
  if (!s) return [];
  return s.byBook.map((b) => historyRow(b.book, h?.names?.[b.book] ?? b.book, b.legacy, b));
}

/** Up to two rows per desk that has tickets: its legacy part and its two-book part. */
export function historyDeskRows(h: HistoryData | null | undefined): HistoryRow[] {
  const s = h?.summary;
  if (!s) return [];
  return s.byDesk.flatMap((d) => [
    ...(d.legacy.picks ? [historyRow(`${d.desk}:legacy`, HISTORY_DESK_NAME[d.desk], true, d.legacy)] : []),
    ...(d.twoBook.picks ? [historyRow(`${d.desk}:two-book`, HISTORY_DESK_NAME[d.desk], false, d.twoBook)] : []),
  ]);
}

/** The sentence above the table: what was read, and anything that could not be. */
export function historyNote(h: HistoryData | null | undefined): { tone: Tone; text: string } {
  if (!h) return { tone: "muted", text: "Not loaded." };
  if (!h.ok || !h.summary) return { tone: "neg", text: `Couldn't read the older ledgers: ${h.error ?? "no answer"}.` };
  const s = h.summary;
  const bad = s.sources.filter((x) => x.state === "unreadable").map((x) => HISTORY_DESK_NAME[x.desk]);
  const none = s.sources.filter((x) => x.state === "missing").map((x) => HISTORY_DESK_NAME[x.desk]);
  const head = `${s.picks} older ticket${s.picks === 1 ? "" : "s"}: ${s.legacy.picks} legacy (another book), ${s.twoBook.picks} at DraftKings or FanDuel.`;
  const tail = [bad.length ? `UNREADABLE, not counted as empty: ${bad.join(", ")}.` : "", none.length ? `Nothing stored for: ${none.join(", ")}.` : ""].filter(Boolean).join(" ");
  return { tone: bad.length ? "neg" : "muted", text: tail ? `${head} ${tail}` : head };
}
