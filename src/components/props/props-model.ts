/**
 * PARLAY BUILDER — the data model behind the sandbox prop board (moved verbatim
 * out of app/props/page.tsx in the 2026-09-03 UI rebuild; NO logic changed).
 *
 * Nothing is ever invented: prices are real posted quotes (Caesars when Caesars
 * posts the line, otherwise the best price in the feed, labelled with the book),
 * and the win % is either the engine's own model number for that line or the
 * de-vigged market fair, always tagged as one or the other.
 */

import type { PickRow, PropBoardRow } from "@/engine";
import type { SandboxLeg } from "@/lib/ticket-math";
import { parseMatchup } from "@/lib/mlb-visuals";

export const TABS = [
  { key: "games", label: "Games" },
  { key: "batter", label: "Batter Props" },
  { key: "pitcher", label: "Pitcher Props" },
] as const;
export type TabKey = (typeof TABS)[number]["key"];

/** cat = engine market key; null = posted at the book, not in the feed mirror. */
export const MARKETS: Record<TabKey, { key: string; label: string; cat: string | null }[]> = {
  games: [
    { key: "ml", label: "Moneyline", cat: "ml" },
    { key: "rl", label: "Run Line", cat: "rl" },
    { key: "r1st", label: "Run In 1st Inning", cat: null },
    { key: "fp", label: "First Pitch", cat: null },
    { key: "f3", label: "1st 3 Innings", cat: null },
    { key: "f5", label: "1st 5 Innings", cat: null },
  ],
  batter: [
    { key: "hr", label: "Anytime HR", cat: "batter_home_runs" },
    { key: "hits", label: "Hits", cat: "batter_hits" },
    { key: "tb", label: "Total Bases O/U", cat: "batter_total_bases" },
    { key: "hrr", label: "Hits + Runs + RBI O/U", cat: "batter_hits_runs_rbis" },
    { key: "rbi", label: "RBI", cat: null },
    { key: "runs", label: "Batter Runs", cat: null },
    { key: "xbh", label: "Extra-Base Hit", cat: null },
    { key: "singles", label: "Singles", cat: null },
  ],
  pitcher: [
    { key: "k", label: "Pitcher Strikeouts O/U", cat: "pitcher_strikeouts" },
    { key: "outs", label: "Outs Recorded O/U", cat: "pitcher_outs" },
    { key: "er", label: "Earned Runs Allowed O/U", cat: null },
    { key: "ha", label: "Hits Allowed O/U", cat: null },
    { key: "walks", label: "Pitcher Walks O/U", cat: null },
    { key: "mostk", label: "Most Strikeouts", cat: null },
  ],
};

export const MKT_LABEL: Record<string, string> = {
  batter_hits: "Hits",
  batter_total_bases: "Total Bases",
  batter_home_runs: "HR",
  batter_hits_runs_rbis: "H+R+RBI",
  pitcher_strikeouts: "K's",
  pitcher_outs: "Outs",
};

/** book titles as the feed spells them → the short tag that fits on a price button */
const BOOK_AB: Record<string, string> = {
  caesars: "CZ",
  "william hill (us)": "CZ",
  draftkings: "DK",
  fanduel: "FD",
  betmgm: "MGM",
  "espn bet": "ESPN",
  betrivers: "BR",
  fanatics: "FAN",
  bovada: "BOV",
  pinnacle: "PIN",
  betonlineag: "BOL",
  lowvig: "LOW",
  "betus": "BUS",
  mybookieag: "MYB",
  betfair: "BF",
};
export const bookAb = (b: string) => BOOK_AB[b.trim().toLowerCase()] ?? b.slice(0, 4).toUpperCase();

export const isGameMarket = (cat: string) => cat === "ml" || cat === "rl";
export const legId = (r: PickRow) => `${r.lkey ?? ""}|${r.label}|${r.sub}`;
/** accent/punctuation-proof search key */
export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, "");

/* ---------------------------------------------------------------- game markets */

export type GameGroup = { game: string; away: string; home: string; time: string; rows: PickRow[] };

export function groupByGame(rows: PickRow[]): GameGroup[] {
  const by = new Map<string, GameGroup>();
  for (const r of rows) {
    const g = String(r.game ?? "");
    if (!g) continue;
    const cur = by.get(g);
    if (cur) {
      cur.rows.push(r);
      continue;
    }
    const m = parseMatchup(g);
    by.set(g, { game: g, away: m.away, home: m.home, time: m.time, rows: [r] });
  }
  return [...by.values()].sort((a, b) => (a.game < b.game ? -1 : 1));
}

type OppSide = { label: string; odds?: string | null; cz?: number | null; prob?: number; pt?: number | null; lkey?: string | null };
const sPt = (v: number) => (v > 0 ? `+${v}` : String(v));

/** The other team of an ML/RL row (real quotes the engine now exports). Boards
    generated before this shipped lack `opp` and just show the engine's side. */
export function oppRow(r: PickRow): PickRow | null {
  const o = r.opp as OppSide | null | undefined;
  if (!o || !o.label) return null;
  const rl = (r.lkey ?? "").startsWith("rl");
  return {
    label: o.label,
    sub: rl ? `RL ${o.pt != null ? sPt(o.pt) : ""} vs ${r.label}`.replace("  ", " ") : `ML vs ${r.label}`,
    cz: o.cz ?? null,
    prob: o.prob,
    game: r.game,
    gkey: r.gkey,
    lkey: o.lkey ?? null,
    live: r.live,
  } as PickRow;
}

/** Expand game-market rows to both sides, away listed first (Caesars order). */
export function bothSides(rows: PickRow[]): PickRow[] {
  const out: PickRow[] = [];
  for (const r of rows) {
    const o = oppRow(r);
    const pair = o ? [r, o] : [r];
    pair.sort((a, b) => ((a.lkey ?? "").endsWith("away") ? -1 : 1) - ((b.lkey ?? "").endsWith("away") ? -1 : 1));
    out.push(...pair);
  }
  return out;
}

/* --------------------------------------------------------------- player props */

export type Side = "o" | "u";

/** The price for one side: Caesars when Caesars posts it, else the feed's best. */
export function sidePrice(r: PropBoardRow, side: Side): { am: number; book: string } | null {
  const cz = r.cz ? (side === "o" ? r.cz.o : r.cz.u) : null;
  if (cz != null) return { am: cz, book: "CZ" };
  const am = side === "o" ? r.o : r.u;
  if (am == null) return null;
  const b = side === "o" ? r.oBook : r.uBook;
  return { am, book: b ? bookAb(b) : "BOOK" };
}

/** The win % for one side, and where it came from. */
export function sideProb(r: PropBoardRow, side: Side): { pct: number; src: "model" | "market" } | null {
  const base = r.pO != null ? { pct: r.pO, src: "model" as const } : r.fO != null ? { pct: r.fO, src: "market" as const } : null;
  if (!base) return null;
  return { pct: side === "o" ? base.pct : 100 - base.pct, src: base.src };
}

export const rankOf = (r: PropBoardRow) => (r.pO != null ? r.pO : r.fO != null ? r.fO : -1);

/** "Anytime HR" / "Over 1.5" — the bet as the book words it. */
export function sideLabel(cat: string, r: PropBoardRow, side: Side): string {
  if (cat === "batter_home_runs" && r.ln === 0.5) return side === "o" ? "Anytime HR" : "No HR";
  return `${side === "o" ? "Over" : "Under"} ${r.ln}`;
}

/** The same bet, abbreviated for a 32px button: "O 1.5" / "U 1.5" / "Any HR" / "No HR". */
export function sideShort(cat: string, r: PropBoardRow, side: Side): string {
  if (cat === "batter_home_runs" && r.ln === 0.5) return side === "o" ? "Any HR" : "No HR";
  return `${side === "o" ? "O" : "U"} ${r.ln}`;
}

/** The sandbox leg for one side of a player row — null when that side is not posted. */
export function playerLeg(
  r: PropBoardRow,
  cat: string,
  side: Side,
  game: string,
  gkey: string | null,
): SandboxLeg | null {
  const price = sidePrice(r, side);
  const prob = sideProb(r, side);
  if (!price) return null;
  return {
    id: `${gkey ?? game}|${r.lkey}|${side}`,
    label: r.p + (r.tm ? ` (${r.tm})` : ""),
    sub: `${MKT_LABEL[cat] ?? cat} ${sideLabel(cat, r, side)}`,
    game,
    cz: price.am,
    prob: prob?.pct ?? 0,
    market: cat,
    book: price.book,
    src: prob?.src,
  };
}
