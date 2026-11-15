import { kickoffLabel, ptDateOf } from "@/lib/cfb/dates";
import type { LedgerRow } from "@/lib/anytime/ledger";
import { pickView, type PickView } from "@/lib/anytime/view";

/**
 * THE ENGINE'S PICKS ON THE CARD (2026-11-15, Josh: "Nothing is locking on the card").
 *
 * Since the cutover the any-time engine is the only thing that records a new pick, and it keeps its
 * own append-only ledger. The card pages (Builder, Ledger) read the older ledgers, which seat nothing
 * new, so the card looked empty while the engine had picks locked. This turns the engine's ledger rows
 * into what the card shows for one desk. Pure: no clock of its own, no fetch, no arithmetic on money.
 *
 *   - a pick belongs to the day its GAME is played (Pacific), never the day it was recorded: the
 *     engine looks eight days ahead, so Sunday's picks are usually locked on Saturday or earlier;
 *   - the sport is matched on the stored value ("nfl", "cfb", "ncaab");
 *   - nothing is ever dropped for age: an open pick stays listed until it is graded, and a pick
 *     marked "not available in AZ" is counted, not shown.
 */

export type CardSport = "nfl" | "cfb" | "ncaab";
export const CARD_SPORTS: readonly CardSport[] = ["nfl", "cfb", "ncaab"];
export const isCardSport = (s: unknown): s is CardSport => typeof s === "string" && (CARD_SPORTS as readonly string[]).includes(s);

export type CardPick = PickView & { commence: string; gameDate: string; kickoff: string };
export type CardDay = { date: string; label: string; picks: CardPick[] };
export type EngineCard = {
  sport: CardSport;
  /** locked and not yet graded, earliest game day first */
  days: CardDay[];
  open: number;
  /** graded picks, latest game first, capped at SETTLED_SHOWN */
  settled: CardPick[];
  settledTotal: number;
  voided: number;
};

export const SETTLED_SHOWN = 30;

const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const WEEKDAY = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });

/** "Today", "Tomorrow", "Yesterday", else "Sun, Nov 15" */
export function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  if (date === addDays(today, -1)) return "Yesterday";
  return WEEKDAY.format(new Date(`${date}T12:00:00Z`));
}

export function engineCard(rows: readonly LedgerRow[], sport: CardSport, now: number): EngineCard {
  const today = ptDateOf(new Date(now).toISOString());
  const mine = rows.filter((r) => r.pick.sport === sport && Number.isFinite(Date.parse(r.pick.commence)));
  const picks: CardPick[] = mine.map((r) => ({ ...pickView(r), commence: r.pick.commence, gameDate: ptDateOf(r.pick.commence), kickoff: kickoffLabel(r.pick.commence) }));
  const byGame = (a: CardPick, b: CardPick) => Date.parse(a.commence) - Date.parse(b.commence) || a.event.localeCompare(b.event) || a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id);
  const open = picks.filter((p) => p.status === "open").sort(byGame);
  const days: CardDay[] = [];
  for (const p of open) {
    const last = days[days.length - 1];
    if (last && last.date === p.gameDate) last.picks.push(p);
    else days.push({ date: p.gameDate, label: dayLabel(p.gameDate, today), picks: [p] });
  }
  const settledAll = picks.filter((p) => p.status === "won" || p.status === "lost" || p.status === "push").sort((a, b) => -byGame(a, b));
  return { sport, days, open: open.length, settled: settledAll.slice(0, SETTLED_SHOWN), settledTotal: settledAll.length, voided: picks.filter((p) => p.status === "void").length };
}

/** which paths are "the card" for a desk: the Builder and the Ledger */
export function isCardPath(pathname: string): boolean {
  return ["/builder", "/ledger"].some((b) => pathname === b || pathname.startsWith(`${b}/`));
}
