import { kickoffLabel } from "@/lib/cfb/dates";
import { H1_ODDS_KEY_OF, H1_SIGMA_SCALE, isH1Market } from "@/lib/cfb/markets";
import { bookQuote, consensusMedian, coverProb, readBooksOf, sideRow } from "@/lib/cfb/model";
import { toOddsEvent } from "@/lib/cfb/names";
import { normCdf, normInv } from "@/lib/cfb/normal";
import type { CfbGame, CfbH1Game, CfbH1Side, CfbRow } from "@/lib/cfb/types";
import type { LeagueConfig } from "@/lib/football/league";

/**
 * FIRST-HALF LINES (2026-09-19, Josh: "1H bets should be included on NFL & CFB").
 *
 * Two pure functions, one per seam:
 *
 *   parseH1(eventJson, game, league, now)   the props route's per-event answer (which now asks for
 *       h2h_h1 / spreads_h1 / totals_h1 beside the six player markets) → the game's 1H consensus
 *       and every book's 1H quote, or null when no book posted a first-half line. The SAME reader
 *       as the full game (model.ts readBooksOf) under the first-half keys and the half's σ
 *       (H1_SIGMA_SCALE); the same Pinnacle-weighted median (minBooks); the market P(side) of each
 *       side through the same coverProb. Consensus-only: no FPI blend (FPI rates the full game).
 *
 *   attachH1(games, h1Games, ctx)   the slate seam: the stored 1H set (props-store readH1) is
 *       joined onto the board's games by ESPN id — each game gets model.h1 and up to six more rows
 *       (ml_1h / spread_1h / total_1h × side) built by model.ts sideRow, the very code that prices
 *       the full-game rows: same EV at the settle book, same ¼-Kelly, same playable rule
 *       (settle-book quote AND kickoff still ahead). Idempotent — a game that already carries 1H
 *       rows is left alone. Returns the number of games it attached to.
 *
 * Nothing here is ever fabricated: a 1H row exists only for a half the books actually posted.
 */

export function parseH1(eventJson: unknown, game: CfbGame, league: LeagueConfig, now: number): CfbH1Game | null {
  const ev = toOddsEvent(eventJson);
  if (!ev) return null;
  const M = league.model;
  const sigma = M.sigma * H1_SIGMA_SCALE;
  const sigmaTotal = M.sigmaTotal * H1_SIGMA_SCALE;
  const books = readBooksOf(ev, M, H1_ODDS_KEY_OF, sigma, sigmaTotal);
  const mkt = consensusMedian(books.mls, (b) => b.pHome, (b) => b.w, M.minBooks);
  const mktMargin = consensusMedian(books.spreads, (b) => b.mu, (b) => b.w, M.minBooks);
  const spreadLine = consensusMedian(books.spreads, (b) => b.s, (b) => b.w, M.minBooks);
  const mktTotal = consensusMedian(books.totals, (b) => b.muT, (b) => b.w, M.minBooks);
  const totalLine = consensusMedian(books.totals, (b) => b.T, (b) => b.w, M.minBooks);
  if (mkt == null && mktMargin == null && mktTotal == null) return null;
  // the full-game blend minus its FPI term: the moneyline consensus and the spread-implied win chance,
  // at the league's own blend weights (FPI rates the whole game, so it has no say over a half)
  const pSpread = mktMargin != null ? normCdf(mktMargin / sigma) : null;
  let wsum = 0;
  let psum = 0;
  if (mkt != null) {
    wsum += M.blend.mkt;
    psum += M.blend.mkt * mkt;
  }
  if (pSpread != null) {
    wsum += M.blend.spread;
    psum += M.blend.spread * pSpread;
  }
  const pHome = wsum > 0 ? psum / wsum : null;
  const muMargin = mktMargin ?? (mkt != null ? sigma * normInv(mkt) : null);

  const sides: CfbH1Side[] = [];
  if (mkt != null && pHome != null) {
    sides.push({ market: "ml_1h", side: "home", line: null, mkt, books: books.mls.length, quotes: books.mls.map((b) => bookQuote(b.key, b.title, b.priceH, null)) });
    sides.push({ market: "ml_1h", side: "away", line: null, mkt: 1 - mkt, books: books.mls.length, quotes: books.mls.map((b) => bookQuote(b.key, b.title, b.priceA, null)) });
  }
  if (mktMargin != null && spreadLine != null) {
    const homeMkt = coverProb(mktMargin, sigma, spreadLine).win;
    const awayMkt = coverProb(-mktMargin, sigma, -spreadLine).win;
    sides.push({ market: "spread_1h", side: "home", line: spreadLine, mkt: homeMkt, books: books.spreads.length, quotes: books.spreads.map((b) => bookQuote(b.key, b.title, b.priceH, b.s)) });
    sides.push({ market: "spread_1h", side: "away", line: -spreadLine, mkt: awayMkt, books: books.spreads.length, quotes: books.spreads.map((b) => bookQuote(b.key, b.title, b.priceA, -b.s)) });
  }
  if (mktTotal != null && totalLine != null) {
    const overMkt = coverProb(mktTotal, sigmaTotal, -totalLine).win;
    const underMkt = coverProb(-mktTotal, sigmaTotal, totalLine).win;
    sides.push({ market: "total_1h", side: "over", line: totalLine, mkt: overMkt, books: books.totals.length, quotes: books.totals.map((b) => bookQuote(b.key, b.title, b.priceO, b.T)) });
    sides.push({ market: "total_1h", side: "under", line: totalLine, mkt: underMkt, books: books.totals.length, quotes: books.totals.map((b) => bookQuote(b.key, b.title, b.priceU, b.T)) });
  }
  return {
    gameId: game.id,
    oddsEventId: ev.id,
    model: {
      muMargin,
      muTotal: mktTotal,
      sigma,
      sigmaTotal,
      pHome,
      books: { ml: books.mls.length, spread: books.spreads.length, total: books.totals.length },
      pricedAt: new Date(now).toISOString(),
    },
    sides,
  };
}

export function attachH1(games: CfbGame[], h1: readonly CfbH1Game[] | null | undefined, ctx: { now: number; bankroll: number; league: LeagueConfig }): number {
  if (!h1 || h1.length === 0) return 0;
  const byGame = new Map(h1.map((e) => [e.gameId, e] as const));
  let attached = 0;
  for (const g of games) {
    const e = byGame.get(g.id);
    if (!e || g.rows.some((r) => isH1Market(r.market))) continue;
    const model = { ...g.model, h1: e.model };
    const kickoff = Date.parse(g.start);
    const upcoming = g.status === "upcoming" && Number.isFinite(kickoff) && kickoff > ctx.now;
    const when = kickoffLabel(g.start);
    const rows: CfbRow[] = [];
    for (const s of e.sides) {
      const row = sideRow({ game: g, model, upcoming, when, bankroll: ctx.bankroll, league: ctx.league }, s.market, s.side, s.line, s.mkt, s.books, s.quotes);
      if (row) rows.push(row);
    }
    if (rows.length === 0) continue;
    g.model = model;
    g.rows = [...g.rows, ...rows];
    attached++;
  }
  return attached;
}
