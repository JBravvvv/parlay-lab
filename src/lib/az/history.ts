import { bookTagOf, isAzBook } from "@/lib/az/books";

/**
 * EVERY OLD PICK, TAGGED WITH ITS BOOK (pure; reads only, writes nothing).
 *
 * The older desks (MLB, CFB, NFL cards and the archived first-era ledger) keep their history exactly
 * as stored. Nothing here edits, deletes or re-saves a ticket: the tag is derived each time the
 * history is read, so it is reversible by construction and can never drift from the stored record.
 *
 *   book      the ticket's own `settlementBook` stamp when it carries one, otherwise the rule in
 *             `bookTagOf`: Caesars up to and including 2026-09-16, DraftKings from 2026-09-17
 *   legacy    true when that book is not DraftKings or FanDuel. A legacy pick stays visible here and
 *             stays OUT of every go-forward number, chart and bankroll.
 *   inferred  true when the book came from the date rule rather than a stamp on the ticket
 *
 * The any-time engine's own ledger (`pl:at:*`) never passes through this file: it is two-book by
 * construction. These older tickets are listed beside it, never added into it — they are dollar
 * tickets (often parlays) from a different model, so mixing them into a per-unit record of single
 * picks would make both numbers meaningless.
 *
 * MONEY RULE, the same one the Ledger page uses (src/lib/ledger-stats.ts): a won ticket returns its
 * stored `payout`, a lost one returns nothing, anything else settled returns the stake.
 */

export type HistoryDesk = "mlb" | "cfb" | "nfl" | "mlb-era1";
export const HISTORY_DESKS: readonly HistoryDesk[] = ["mlb", "cfb", "nfl", "mlb-era1"];
export const HISTORY_DESK_NAME: Record<HistoryDesk, string> = { mlb: "MLB", cfb: "CFB", nfl: "NFL", "mlb-era1": "MLB (first era, archived)" };

export type HistoryResult = "won" | "lost" | "push" | "open" | "ungradable";

export type HistoryPick = {
  desk: HistoryDesk;
  date: string;
  id: string;
  bucket: string;
  name: string;
  legs: number;
  book: string;
  legacy: boolean;
  inferred: boolean;
  /** dollars; NaN when the ticket carries no readable stake */
  stake: number;
  result: HistoryResult;
  /** dollars returned once settled; null while open or ungradable */
  returned: number | null;
  /** returned minus stake; null while open or ungradable */
  profit: number | null;
};

export type HistoryLine = {
  key: string;
  picks: number;
  graded: number;
  won: number;
  lost: number;
  push: number;
  open: number;
  ungradable: number;
  staked: number;
  returned: number;
  profit: number;
  /** profit over dollars staked on settled tickets; null with nothing settled */
  roi: number | null;
  /** how many of these picks got their book from the date rule, not a stamp */
  inferred: number;
  /** settled tickets that could not be counted in dollars (no readable stake) */
  unpriced: number;
  from: string | null;
  to: string | null;
};

export type HistorySource = { desk: HistoryDesk; entries: unknown; missing?: boolean; unreadable?: boolean };

export type HistorySummary = {
  picks: number;
  /** one line per book that appears, legacy books first */
  byBook: (HistoryLine & { book: string; legacy: boolean })[];
  /** every pick at a book other than the two */
  legacy: HistoryLine;
  /** every older-desk pick at DraftKings or FanDuel */
  twoBook: HistoryLine;
  byDesk: (HistoryLine & { desk: HistoryDesk; legacy: HistoryLine; twoBook: HistoryLine })[];
  /** what each stored ledger looked like when it was read */
  sources: { desk: HistoryDesk; state: "read" | "missing" | "unreadable"; days: number; picks: number }[];
};

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * The book one ticket was priced at. Ticket stamp first, then its legs' stamps when they all agree,
 * then the day's own stamp, then the date rule. Legs that name different books make the ticket
 * "mixed", which is legacy: a ticket priced across books cannot be placed at either one.
 */
export function ticketBookOf(ticket: Record<string, unknown>, entry: Record<string, unknown>): { book: string; legacy: boolean; inferred: boolean } {
  const own = str(ticket.settlementBook);
  if (own) return bookTagOf(own, null);
  const legs = Array.isArray(ticket.legs) ? ticket.legs : [];
  const stamps = [...new Set(legs.map((l) => str(obj(l)?.settlementBook)).filter((s): s is string => !!s))];
  if (stamps.length > 1) return { book: "mixed", legacy: true, inferred: false };
  if (stamps.length === 1 && legs.every((l) => str(obj(l)?.settlementBook))) return bookTagOf(stamps[0], null);
  return bookTagOf(str(entry.settlementBook), str(entry.date));
}

function resultOf(grade: Record<string, unknown> | null): HistoryResult {
  const r = grade ? grade.result : null;
  if (r == null || r === "pending") return "open";
  if (r === "ungradable") return "ungradable";
  if (r === "won" || r === "lost") return r;
  return "push";
}

/** One stored ledger, as tagged picks. Anything that is not a day with tickets is skipped, never guessed at. */
export function tagEntries(desk: HistoryDesk, entries: unknown): HistoryPick[] {
  const out: HistoryPick[] = [];
  if (!Array.isArray(entries)) return out;
  for (const raw of entries) {
    const e = obj(raw);
    const date = e ? str(e.date) : null;
    if (!e || !date) continue;
    const grades = obj(obj(e.grading)?.tickets) ?? {};
    for (const side of ["core", "funT"] as const) {
      const tix = Array.isArray(e[side]) ? (e[side] as unknown[]) : [];
      for (const rawT of tix) {
        const t = obj(rawT);
        const id = t ? str(t.id) : null;
        if (!t || !id) continue;
        const tag = ticketBookOf(t, e);
        const stake = fin(t.stake) ? t.stake : NaN;
        const g = obj(grades[id]);
        const result = resultOf(g);
        const settled = result === "won" || result === "lost" || result === "push";
        const returned = !settled || !fin(stake) ? null : result === "won" ? (fin(g?.payout) ? (g!.payout as number) : 0) : result === "lost" ? 0 : stake;
        out.push({
          desk,
          date,
          id,
          bucket: str(t.bucket) ?? (side === "core" ? "core" : "fun"),
          name: str(t.name) ?? "",
          legs: Array.isArray(t.legs) ? t.legs.length : 0,
          ...tag,
          stake,
          result,
          returned: returned == null ? null : cents(returned),
          profit: returned == null ? null : cents(returned - stake),
        });
      }
    }
  }
  return out;
}

export function historyLine(key: string, picks: HistoryPick[]): HistoryLine {
  const line: HistoryLine = { key, picks: picks.length, graded: 0, won: 0, lost: 0, push: 0, open: 0, ungradable: 0, staked: 0, returned: 0, profit: 0, roi: null, inferred: 0, unpriced: 0, from: null, to: null };
  for (const p of picks) {
    if (p.inferred) line.inferred++;
    if (line.from == null || p.date < line.from) line.from = p.date;
    if (line.to == null || p.date > line.to) line.to = p.date;
    if (p.result === "open") { line.open++; continue; }
    if (p.result === "ungradable") { line.ungradable++; continue; }
    line.graded++;
    line[p.result]++;
    if (p.returned == null || !fin(p.stake)) { line.unpriced++; continue; }
    line.staked += p.stake;
    line.returned += p.returned;
  }
  line.staked = cents(line.staked);
  line.returned = cents(line.returned);
  line.profit = cents(line.returned - line.staked);
  line.roi = line.staked > 0 ? line.profit / line.staked : null;
  return line;
}

/** Every stored ledger tagged, in desk order then date order. */
export function tagHistory(sources: HistorySource[]): HistoryPick[] {
  const picks = sources.flatMap((s) => tagEntries(s.desk, s.entries));
  const rank = (d: HistoryDesk) => HISTORY_DESKS.indexOf(d);
  return picks.sort((a, b) => rank(a.desk) - rank(b.desk) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function summarizeHistory(sources: HistorySource[], picks: HistoryPick[] = tagHistory(sources)): HistorySummary {
  const books = [...new Set(picks.map((p) => p.book))].sort((a, b) => Number(isAzBook(a)) - Number(isAzBook(b)) || (a < b ? -1 : 1));
  const split = (set: HistoryPick[]) => ({ legacy: historyLine("legacy", set.filter((p) => p.legacy)), twoBook: historyLine("two-book", set.filter((p) => !p.legacy)) });
  return {
    picks: picks.length,
    byBook: books.map((book) => ({ ...historyLine(book, picks.filter((p) => p.book === book)), book, legacy: !isAzBook(book) })),
    ...split(picks),
    byDesk: HISTORY_DESKS.filter((d) => sources.some((s) => s.desk === d)).map((desk) => {
      const set = picks.filter((p) => p.desk === desk);
      return { ...historyLine(desk, set), desk, ...split(set) };
    }),
    sources: sources.map((s) => ({
      desk: s.desk,
      state: s.unreadable ? "unreadable" : s.missing ? "missing" : "read",
      days: Array.isArray(s.entries) ? s.entries.length : 0,
      picks: picks.filter((p) => p.desk === s.desk).length,
    })),
  };
}
