/**
 * PROP MARKET LEAN (2026-09-18). Josh: "Add bet %/money % to the player props too somehow."
 *
 * No public source publishes ticket or handle splits on player props — scoresandodds carries the
 * prop LINES for NFL but no percentages, and Covers / Action Network publish game-market consensus
 * only (checked 2026-09-18). So a prop can never carry a SplitsChip: those numbers do not exist and
 * are not invented here. What a prop DOES have is a two-way price, and a two-way price is the
 * book's own read of where the money sits: the juice moves toward the side taking action. This
 * module turns the posted over/under pair into a vig-free share — "the market leans 57% Over" —
 * labelled as a PRICE-IMPLIED lean everywhere it is shown, never as a bet count or a money share.
 *
 *   share(over)  = implied(over)  / (implied(over) + implied(under))
 *   share(under) = 1 − share(over)
 *
 * Pure arithmetic on posted prices; one-sided markets (anytime HR, anytime TD) get no lean because
 * there is no second price to remove the vig against.
 */
import type { PropBoardRow } from "@/engine";
import type { CfbPropRow, CfbPropQuote } from "@/lib/cfb/props-types";

export type PropLean = {
  /** vig-free share of the Over (0..100, one decimal) */
  over: number;
  /** vig-free share of the Under (0..100) — always 100 − over */
  under: number;
  /** which side the price leans to; "even" inside ±2 points of 50 */
  side: "over" | "under" | "even";
  /** short tag of the book the pair was read at ("DK"), or null when it is the best-price pair */
  book: string | null;
};

/** the pick's own-side share and the pair behind it */
export type PropLeanSide = { lean: PropLean; pct: number; side: "over" | "under" };

/** American price → implied win % (0..100), vig still in it */
export function impliedPct(am: number): number {
  if (!Number.isFinite(am) || am === 0) return NaN;
  return am < 0 ? (-am / (-am + 100)) * 100 : (100 / (am + 100)) * 100;
}

/** vig-free share of the Over from a posted over/under pair; null unless BOTH prices are posted */
export function leanFromPair(over: number | null | undefined, under: number | null | undefined, book: string | null = null): PropLean | null {
  if (over == null || under == null) return null;
  const io = impliedPct(over);
  const iu = impliedPct(under);
  if (!Number.isFinite(io) || !Number.isFinite(iu) || io + iu <= 0) return null;
  const o = Math.round((io / (io + iu)) * 1000) / 10;
  const u = Math.round((100 - o) * 10) / 10;
  return { over: o, under: u, side: o >= 52 ? "over" : o <= 48 ? "under" : "even", book };
}

/** the share on one side of a lean */
export function leanPct(lean: PropLean, side: "o" | "u" | "over" | "under" | "yes"): number {
  return side === "u" || side === "under" ? lean.under : lean.over;
}

/**
 * MLB: the settlement-book pair (`cz`, DraftKings since INSTRUCTION 67) when both sides are posted
 * there, else the best-price pair across the feed. A pair split across two books (best over at DK,
 * best under at FD) is still a two-way price and still removes the vig, but it is tagged as such.
 */
export function mlbPropLean(r: Pick<PropBoardRow, "cz" | "o" | "u" | "oBook" | "uBook" | "settlementBook" | "displayBook">): PropLean | null {
  const cz = r.cz && r.cz.o != null && r.cz.u != null ? leanFromPair(r.cz.o, r.cz.u, bookTag(r.displayBook ?? r.settlementBook ?? "DK")) : null;
  if (cz) return cz;
  return leanFromPair(r.o, r.u, null);
}

/** "draftkings" → "DK", "fanduel" → "FD", anything else → first two letters upper-cased */
export function bookTag(book: string | null | undefined): string | null {
  if (!book) return null;
  const k = book.toLowerCase();
  if (k.includes("draftkings") || k === "dk") return "DK";
  if (k.includes("fanduel") || k === "fd") return "FD";
  if (k.includes("caesars") || k === "cz") return "CZ";
  if (k.includes("betmgm") || k === "mgm") return "MGM";
  return book.slice(0, 2).toUpperCase();
}

const sameLine = (a: number | null, b: number | null) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 1e-9);

/**
 * Football: the over row and the under row of one player/market, priced at ONE book at the SAME
 * line (a 245.5 over against a 249.5 under is not a two-way market). `mode` follows the desk's
 * price toggle: the selected book's quote, or the best price with the selected book as fallback.
 */
export function footballPropLean(sides: readonly CfbPropRow[], mode: "cz" | "best" = "cz"): PropLean | null {
  const over = sides.find((s) => s.side === "over");
  const under = sides.find((s) => s.side === "under");
  if (!over || !under) return null;
  const pick = (r: CfbPropRow): CfbPropQuote | null => (mode === "cz" ? r.cz : (r.best ?? r.cz));
  const qo = pick(over);
  const qu = pick(under);
  if (!qo || !qu || !sameLine(qo.line, qu.line)) return null;
  const book = mode === "cz" || qo.book === qu.book ? bookTag(qo.book) : null;
  return leanFromPair(qo.price, qu.price, book);
}

/** the football board's prop rows indexed by their own key → the pick's own-side share */
export function footballLeanIndex(rows: readonly CfbPropRow[] | null | undefined, mode: "cz" | "best" = "cz"): Map<string, PropLeanSide> {
  const out = new Map<string, PropLeanSide>();
  if (!rows?.length) return out;
  const groups = new Map<string, CfbPropRow[]>();
  for (const r of rows) {
    if (r.side === "yes") continue;
    // `${gameId}|${market}|${playerSlug}|${side}|${line}` → drop the side
    const parts = r.key.split("|");
    if (parts.length < 5) continue;
    const g = `${parts[0]}|${parts[1]}|${parts[2]}|${parts[4]}`;
    const arr = groups.get(g);
    if (arr) arr.push(r);
    else groups.set(g, [r]);
  }
  for (const sides of groups.values()) {
    const lean = footballPropLean(sides, mode);
    if (!lean) continue;
    for (const r of sides) {
      if (r.side === "yes") continue;
      out.set(r.key, { lean, pct: leanPct(lean, r.side), side: r.side });
    }
  }
  return out;
}

/** the MLB board's prop rows indexed by `${gkey}|${lkey}` → the row's lean (both sides) */
export function mlbLeanIndex(games: readonly { gkey: string | null; markets: Record<string, PropBoardRow[]> }[] | null | undefined): Map<string, PropLean> {
  const out = new Map<string, PropLean>();
  if (!games?.length) return out;
  for (const g of games) {
    for (const rows of Object.values(g.markets)) {
      for (const r of rows) {
        const lean = mlbPropLean(r);
        if (lean) out.set(`${g.gkey ?? ""}|${r.lkey}`, lean);
      }
    }
  }
  return out;
}
