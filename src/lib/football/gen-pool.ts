/**
 * THE FOOTBALL ADAPTER for the parlay generator (INSTRUCTION 52, 2026-09-12, Josh's word,
 * verbatim: "Parlay Generator should be on CFB & NFL just like it is on MLB").
 *
 * One pool builder for BOTH football desks, because there is only one football board: CfbProps
 * is the shared surface and NflProps is an 18-line wrapper around it (INSTRUCTION 47). Writing
 * a second copy for the NFL would be the fork, and the thing that keeps going wrong here is
 * forks — so there is exactly one of these and the league never enters it.
 *
 * IT READS WHAT IS ALREADY ON THE DEVICE AND NOTHING ELSE. The rows are the prop board the desk
 * already fetched; the price is the quote the board already shows at the price mode Josh already
 * picked; the win % is the row's own `fair`, which the props model only has AT THE ROW'S LINE.
 * A cell the board draws as an untappable dash — Caesars alone at 249.5 against a 245.5
 * consensus, so there is no fair for that line — gets no leg here either, because the leg comes
 * from the desk's OWN minter (`propLegOf`, injected as `legOf`), the same function a tap calls.
 * No fetch, no extra market on any pull, not one Odds credit, no ledger write.
 *
 * WHY THE INJECTION. `propQuote` and `propLegOf` live inside a "use client" component, and this
 * module is pure library code that tests import directly — so the desk passes them in rather
 * than this file reaching into the component (or, worse, a second copy of their rules drifting
 * out of step with the board's own cells).
 *
 * ONE LEG PER ROW, not two. An MLB board row carries both sides of a line, so the MLB adapter
 * mints an over AND an under from it; a football row IS one side already (`row.side`), so this
 * mints one leg from one row. That difference lives here, in the adapters, and never in the core.
 *
 * PURE: no React, no fetch, no clock, no Math.random. `nowMs` is passed in.
 */

import { amToDec } from "@/lib/ticket-math";
import { poolOf, type GenLeg, type GenMarket, type GenPool, type GenSide, type GenPoolSpec } from "@/lib/parlay-gen";
import { playerSlug } from "@/lib/cfb/props";
import { CFB_PROP_MARKETS, type CfbPropQuote, type CfbPropRow } from "@/lib/cfb/props-types";
import { footballPosition } from "./positions";

/** the price column Josh is reading the board at — the desk's own PriceMode */
export type FootballPriceMode = "cz" | "best";

/** the six player-prop markets the football board prices, in the board's own rail order */
export const FOOTBALL_GEN_MARKETS: readonly GenMarket[] = CFB_PROP_MARKETS.map((m) => ({
  key: m.id,
  label: m.label,
  /* anytime TD is the board's one yes-only market: every row is a "yes", which this adapter
     counts as an over, so there is no under on it to offer (INSTRUCTION 52 fix pass) */
  oneSided: m.kind === "yes",
}));

const MARKET_LABEL = new Map(CFB_PROP_MARKETS.map((m) => [m.id as string, m.label]));

/**
 * The bet line as the board words it: "Pass Yds O 245.5" / "Anytime TD". The PLAYER is not in
 * here and must not be — the sheet prints the hoisted `label` (his name) and the hoisted `team`
 * separately, and `parseBoardLabel` would otherwise try to read a football team abbreviation out
 * of an MLB table and come back empty.
 */
function subOf(row: CfbPropRow, line: number | null): string {
  const label = MARKET_LABEL.get(row.market) ?? row.market;
  if (row.side === "yes") return label;
  return `${label} ${row.side === "under" ? "U" : "O"} ${line ?? row.line ?? "—"}`;
}

/**
 * Over or under. An anytime-TD row's side is "yes" — there is no under to take, and the price is
 * plus money on a thing happening, so it counts as an OVER. That mapping is why the core reads a
 * hoisted `side` instead of the old trick of reading the last character of the leg id: a football
 * row key ends in its line ("…|over|245.5"), and the id-suffix read called every one of them an
 * under, quietly inverting the one control Josh sets most.
 */
export const footballSide = (side: CfbPropRow["side"]): GenSide => (side === "under" ? "u" : "o");

export type FootballGenOpts<P> = {
  /** the board's price column: Caesars only, or the best posted price */
  mode: FootballPriceMode;
  /** set once after mount by the caller; SSR passes 0, which marks nothing started */
  nowMs: number;
  /** the row's team tag, folded to ONE spelling per club ("ALA") */
  teamOf: (row: CfbPropRow) => string | null;
  positionOf?: (row: CfbPropRow) => string | null;
  /** the desk's own quote picker (`propQuote`) — null when that book posts nothing */
  quoteOf: (row: CfbPropRow, mode: FootballPriceMode) => CfbPropQuote | null;
  /** the desk's own leg minter (`propLegOf`) — null for the cell the board draws as a dash */
  legOf: (row: CfbPropRow, q: CfbPropQuote) => P | null;
};

/**
 * Every leg the football board can currently produce in one market.
 *
 * A game already under way is off by default, exactly as on MLB: the board's prop prices are the
 * pregame quotes until a live pull re-anchors them, so those legs are admitted only when Josh
 * asks for them. A FINAL or POSTPONED game is never offered at all — no book takes a ticket on
 * one, so it is not a band or a filter question and `includeStarted` does not reach it.
 */
export function footballGenPool<P extends { prob: number; book: string }>(
  rows: readonly CfbPropRow[],
  spec: GenPoolSpec,
  opts: FootballGenOpts<P>,
): GenPool<P> {
  const legs: GenLeg<P>[] = [];
  let scanned = 0;
  let startedDropped = 0;
  let finishedDropped = 0;

  for (const row of rows) {
    if (row.market !== spec.market) continue;

    /* A finished or called-off game is not bettable at any price — and it is counted on ITS OWN
       line (INSTRUCTION 52 fix pass). These used to go into `noParlayDropped`, which the sheet
       prints as "the book bars from parlays": on a Saturday evening CFB board, where the morning
       windows are final while the night games are still upcoming, that told Josh Caesars had
       barred legs nobody barred. The counter now says what actually happened. */
    if (row.status === "final" || row.status === "postponed") {
      finishedDropped++;
      continue;
    }
    /* Date.parse of an unparseable kickoff is NaN, and NaN <= nowMs is false — an unknown
       kickoff is never guessed into "started". */
    const started = row.status === "live" || (!!row.kickoff && Date.parse(row.kickoff) <= opts.nowMs);
    if (started && !spec.includeStarted) {
      startedDropped++;
      continue;
    }
    scanned++;

    const q = opts.quoteOf(row, opts.mode);
    if (!q) continue; // that book posts nothing on this row — the board shows a dash too
    const leg = opts.legOf(row, q);
    if (!leg) continue; // no fair at this quote's line — the board shows a dash, so neither do we
    if (!(leg.prob > 0)) continue; // nothing to weigh

    const dec = amToDec(q.price);
    legs.push({
      id: row.key,
      am: q.price,
      prob: leg.prob,
      /* the win % is the de-vigged consensus across the books that posted this line, never a
         simulation — so it is market-sourced, and the sheet says so in the desk's own words */
      src: "market",
      side: footballSide(row.side),
      label: row.player,
      sub: subOf(row, q.line),
      leg,
      dec,
      gameKey: row.gameId,
      /* PER GAME, not per name. "J. Williams" at two different schools on the same Saturday is
         two different men, and a global name key would refuse to put both on one ticket. */
      playerKey: `${row.gameId}|${playerSlug(row.player)}`,
      team: opts.teamOf(row),
      position: footballPosition(opts.positionOf?.(row) ?? row.pos),
      started,
      /* the football board carries no alternate ladders — every row is the book's own line */
      alt: false,
      book: leg.book,
      ev: (leg.prob / 100) * dec - 1,
    });
  }

  /* the canonical id sort, the byId map and the game count are poolOf's — the same function the
     MLB adapter calls, so the two sports cannot drift on the part that makes "same seed → same
     ticket" true on two different devices */
  /* the football board carries no book-side parlay restriction flag, so `noParlayDropped` is 0
     here and stays 0 — that counter means one thing and only the book can set it */
  return poolOf(legs, { rows: scanned, startedDropped, noParlayDropped: 0, finishedDropped });
}
