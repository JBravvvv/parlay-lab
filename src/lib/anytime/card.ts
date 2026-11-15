import { kickoffLabel, ptDateOf } from "@/lib/cfb/dates";
import type { LedgerRow } from "@/lib/anytime/ledger";
import { payDec, returnOf } from "@/lib/anytime/report";
import { ANYTIME_RULES } from "@/lib/anytime/rules";
import { BOOK_NAME, american, dollars, pickView, type PickView } from "@/lib/anytime/view";
import { BANK_BASE } from "@/lib/bankroll";

/**
 * DOLLARS ON EVERY BET (2026-11-15, Josh: "the card should be assigning exact dollar amounts for each bet").
 *
 * The engine sizes each pick in UNITS on its fractional-Kelly bankroll (ANYTIME_RULES.kelly: a 100-unit
 * bankroll, quarter Kelly, at most 2% of the bankroll on one pick). The card turns those units into
 * dollars on the paper bankroll the desks already use (BANK_BASE): the whole bankroll is the engine's
 * starting bankroll, so one unit is BANK_BASE / kelly.start dollars. Nothing is re-sized here: the
 * stake is the engine's own stored Kelly stake, in whole dollars, never below one dollar while the
 * engine staked anything at all. A pick the engine trimmed to nothing (its per-game cap was already
 * used up) shows $0 and says so. Paper only.
 */
export const UNIT_DOLLARS = BANK_BASE / ANYTIME_RULES.kelly.start;

/** the engine's Kelly units as whole paper dollars; 0 stays 0 */
export function stakeDollarsOf(stakeKelly: number, unit: number = UNIT_DOLLARS): number {
  if (!Number.isFinite(stakeKelly) || stakeKelly <= 0) return 0;
  return Math.max(1, Math.round(stakeKelly * unit));
}
const whole = (n: number) => "$" + n.toLocaleString("en-US");

/** how a bet's dollars are set, in one line, from the same numbers the card uses */
export const UNIT_TEXT = "the engine's quarter-Kelly stake on a " + whole(BANK_BASE) + " bankroll, " + whole(Math.round(BANK_BASE * ANYTIME_RULES.kelly.maxPct)) + " at most on one bet";

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

export type CardPick = PickView & {
  commence: string;
  gameDate: string;
  kickoff: string;
  /** "home" | "away" for a side, "over" | "under" for a total: which logo the card draws */
  side: string;
  market: string;
  /** ESPN's id for the game (the key the team marks are looked up by), and the two teams as stored */
  gameId: string | null;
  home: string | null;
  away: string | null;
  /** the book and the price taken, apart, so the card can set the price large */
  bookName: string;
  price: string;
  /** the bet in whole paper dollars ("$31"), what it wins at the price taken ("$29.52"), and the dollars themselves */
  stakeDollars: number;
  bet: string;
  toWin: string;
  /** dollars won or lost once graded ("+$29.52", "−$31.00", "$0.00"); null while open or void */
  result: string | null;
  resultDollars: number | null;
};
export type CardDay = { date: string; label: string; picks: CardPick[] };
export type EngineCard = {
  sport: CardSport;
  /** locked and not yet graded, earliest game day first */
  days: CardDay[];
  open: number;
  /** whole paper dollars on the open picks, and the same as text */
  atRisk: number;
  atRiskText: string;
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

function moneyOf(r: LedgerRow): Pick<CardPick, "stakeDollars" | "bet" | "toWin" | "result" | "resultDollars"> {
  const stake = stakeDollarsOf(r.pick.stakeKelly);
  const dec = payDec(r.pick);
  const res = r.void || !r.grade ? null : r.grade.result;
  const won = res === "won" || res === "lost" || res === "push" ? Number((stake * returnOf(res, dec)).toFixed(2)) : null;
  return { stakeDollars: stake, bet: whole(stake), toWin: "$" + (stake * (dec - 1)).toFixed(2), result: won == null ? null : dollars(won), resultDollars: won };
}

export function engineCard(rows: readonly LedgerRow[], sport: CardSport, now: number): EngineCard {
  const today = ptDateOf(new Date(now).toISOString());
  const mine = rows.filter((r) => r.pick.sport === sport && Number.isFinite(Date.parse(r.pick.commence)));
  const picks: CardPick[] = mine.map((r) => ({
    ...pickView(r),
    commence: r.pick.commence,
    gameDate: ptDateOf(r.pick.commence),
    kickoff: kickoffLabel(r.pick.commence),
    side: r.pick.side,
    market: r.pick.market,
    gameId: r.pick.gradeRef?.id ?? null,
    home: r.pick.gradeRef?.home ?? null,
    away: r.pick.gradeRef?.away ?? null,
    bookName: BOOK_NAME[r.pick.book],
    price: american(r.pick.price),
    ...moneyOf(r),
  }));
  const byGame = (a: CardPick, b: CardPick) => Date.parse(a.commence) - Date.parse(b.commence) || a.event.localeCompare(b.event) || a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id);
  const open = picks.filter((p) => p.status === "open").sort(byGame);
  const days: CardDay[] = [];
  for (const p of open) {
    const last = days[days.length - 1];
    if (last && last.date === p.gameDate) last.picks.push(p);
    else days.push({ date: p.gameDate, label: dayLabel(p.gameDate, today), picks: [p] });
  }
  const settledAll = picks.filter((p) => p.status === "won" || p.status === "lost" || p.status === "push").sort((a, b) => -byGame(a, b));
  const atRisk = open.reduce((t, p) => t + p.stakeDollars, 0);
  return { sport, days, open: open.length, atRisk, atRiskText: whole(atRisk), settled: settledAll.slice(0, SETTLED_SHOWN), settledTotal: settledAll.length, voided: picks.filter((p) => p.status === "void").length };
}

/** which paths are "the card" for a desk: the Builder and the Ledger */
export function isCardPath(pathname: string): boolean {
  return ["/builder", "/ledger"].some((b) => pathname === b || pathname.startsWith(`${b}/`));
}

/** the game days the card is showing (open picks and the graded ones listed), for the team-mark lookup */
export function cardDays(card: Pick<EngineCard, "days" | "settled">): string[] {
  return [...new Set([...card.days.map((d) => d.date), ...card.settled.map((p) => p.gameDate)])].sort();
}
