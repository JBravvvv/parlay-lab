import { addDays } from "@/lib/cfb/dates";
import type { NcaabMarket, NcaabRow, NcaabSlate, NcaabSlateGame } from "@/lib/ncaab/slate";

/**
 * COLLEGE BASKETBALL DESK — what the page shows, as pure functions (no React, no clock of its own).
 * The page formats with these and does no arithmetic of its own.
 */

/** Which of the desk's own pages a path opens. null = the path is not a desk page (Settings, the calculator, the any-time record): the app's own page shows. */
export type NcaabView = "games" | "board" | "ledger" | "other";

const OTHER = ["/stats", "/builder", "/sharp", "/simulator", "/props", "/ballpark", "/season", "/first-sunday-six"];

export function ncaabViewOf(pathname: string): NcaabView | null {
  const at = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  if (pathname === "/board") return "board";
  if (at("/board")) return "other";
  if (at("/games")) return "games";
  if (at("/ledger")) return "ledger";
  return OTHER.some(at) ? "other" : null;
}

export const NCAAB_TITLE: Record<NcaabView, string> = { games: "Games", board: "Board", ledger: "Ledger", other: "College Basketball" };

/** What each tab the desk does not have yet is called, for the "not on this desk" note. */
export const NCAAB_TAB_NAME: Record<string, string> = {
  "/stats": "Stats",
  "/builder": "The Card",
  "/sharp": "The Sharp",
  "/simulator": "Simulator",
  "/props": "Parlay Builder",
  "/board": "Parlays",
  "/ballpark": "Ballpark Factor",
  "/season": "Season Lab",
  "/first-sunday-six": "First Sunday Six",
};

export function tabNameOf(pathname: string): string {
  const hit = Object.keys(NCAAB_TAB_NAME).find((base) => pathname === base || pathname.startsWith(`${base}/`));
  return hit ? NCAAB_TAB_NAME[hit] : "This page";
}

/* ---------- the date strip ---------- */

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type DayChip = { date: string; label: string };

/** Yesterday (for scores), today, then the days ahead. Labels are calendar arithmetic on the date string: no clock, no time zone. */
export function dayChips(today: string, ahead = 5): DayChip[] {
  const out: DayChip[] = [];
  for (let i = -1; i <= ahead; i++) {
    const date = addDays(today, i);
    const [y, m, d] = date.split("-").map(Number);
    const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    out.push({ date, label: i === -1 ? "Yesterday" : i === 0 ? "Today" : `${dow} ${d}` });
  }
  return out;
}

/** "7:00 PM" in the reader's own time zone (the device's, unless one is named). */
export function tipLabel(iso: string, timeZone?: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) }).format(new Date(t));
}

/* ---------- a game ---------- */

export type GameSections = { live: NcaabSlateGame[]; upcoming: NcaabSlateGame[]; final: NcaabSlateGame[]; off: NcaabSlateGame[] };

/** In play first, then still to tip, then finished, then called off. Order inside each is the slate's (tip time). */
export function sectionsOf(games: readonly NcaabSlateGame[]): GameSections {
  const s: GameSections = { live: [], upcoming: [], final: [], off: [] };
  for (const g of games) {
    if (g.status === "live") s.live.push(g);
    else if (g.status === "upcoming") s.upcoming.push(g);
    else if (g.status === "final") s.final.push(g);
    else s.off.push(g);
  }
  return s;
}

export const MARKET_TITLE: Record<NcaabMarket, string> = { spread: "Spread", total: "Total", ml: "Moneyline" };

export type RowGroup = { market: NcaabMarket; title: string; rows: NcaabRow[] };

/** A game's rows under their market, in the order spread, total, moneyline; a market with no row is left out. */
export function rowGroups(rows: readonly NcaabRow[]): RowGroup[] {
  return (["spread", "total", "ml"] as const)
    .map((market) => ({ market, title: MARKET_TITLE[market], rows: rows.filter((r) => r.market === market) }))
    .filter((g) => g.rows.length > 0);
}

/** Why a game that has not tipped shows no line, in words. null when it has one. */
export function noLineReason(g: Pick<NcaabSlateGame, "status" | "rows" | "oddsEventId">, slate: Pick<NcaabSlate, "oddsMissing">): string | null {
  if (g.rows.length > 0) return null;
  if (g.status === "live") return "In play — this desk prices before tip-off only.";
  if (g.status !== "upcoming") return null;
  if (slate.oddsMissing) return "Prices are not loaded right now.";
  return g.oddsEventId ? "Neither book has a full line up yet." : "Neither book lists this game.";
}

/** The one line under the header that says what the slate holds. */
export function slateLine(slate: Pick<NcaabSlate, "games" | "priced" | "oddsMissing">): string {
  const n = slate.games.length;
  if (!n) return "No Division I games on this date.";
  const games = `${n} game${n === 1 ? "" : "s"}`;
  if (slate.oddsMissing) return `${games} · prices are not loaded right now, schedule and scores only`;
  return `${games} · ${slate.priced} with a line at DraftKings or FanDuel`;
}
