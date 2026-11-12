import { AZ_BOOKS, isAzBook, type AzBook } from "@/lib/az/books";
import { noVig, type AzQuotes } from "@/lib/az/market";
import { coverProb } from "@/lib/cfb/model";
import { normTeam, toOddsEvent, type OddsEvent } from "@/lib/cfb/names";
import { normCdf, normInv } from "@/lib/cfb/normal";
import type { CfbGame } from "@/lib/cfb/types";
import type { LeagueConfig } from "@/lib/football/league";
import type { Candidate } from "@/lib/anytime/types";

/**
 * FOOTBALL (NFL + CFB) GAME LINES FOR THE ANY-TIME ENGINE — pure.
 *
 * Takes the league's shaped games (ESPN schedule + FPI, from buildCfbBoard) and the raw odds events
 * and returns one Candidate per side of each market at each exact line DraftKings or FanDuel is
 * quoting. It prices with two books only and never reads another book, whatever the feed carries.
 *
 * HOW THE NUMBER IS MADE (the league's existing constants; nothing here is newly fitted):
 *   - each book's own no-vig probability for its own line (src/lib/az/market.ts `noVig`)
 *   - each book's implied expected margin: its spread line moved by sigma x the normal quantile of
 *     its no-vig cover probability. A book at -2.5 (-120) and a book at -3 (+100) imply nearly the
 *     same margin, so a half-point difference in LINE is not read as an edge.
 *   - the market margin / total / win probability = the MEAN of the two books' numbers (one book
 *     when only one posts the market)
 *   - ESPN FPI is the only signal that is not a price. Where both teams have one, the expected
 *     margin is `spreadBlend.mkt` market + `spreadBlend.fpi` FPI and the win probability is the
 *     league's `blend` of moneyline, spread-implied and FPI numbers. The audit (finding B2-1) found
 *     this signal has never been validated; every pick it creates is stamped `fb-fpi-1` so the
 *     paper record can show whether it beats the close.
 *   - without FPI on both teams, and for EVERY total, the model is the two-book market and nothing
 *     else (`modelKind: "market-only"`, version `fb-market-1`): such a pick exists only when one
 *     book's price beats the two-book no-vig number, i.e. line shopping.
 */

export const FB_MODEL_FPI = "fb-fpi-1";
export const FB_MODEL_MARKET = "fb-market-1";

type BookSide = { price: number; opp: number; line: number | null; at: string | null };
type BookRead = {
  ml?: { home: BookSide; away: BookSide; pHome: number };
  spread?: { home: BookSide; away: BookSide; mu: number };
  total?: { over: BookSide; under: BookSide; muT: number };
};

const validPrice = (p: number) => Number.isFinite(p) && Math.abs(p) >= 100;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** What each of the two books posts for the three full-game markets of one event. */
export function readTwoBooks(ev: OddsEvent, sigma: number, sigmaTotal: number): Partial<Record<AzBook, BookRead>> {
  const homeN = normTeam(ev.home_team);
  const awayN = normTeam(ev.away_team);
  const out: Partial<Record<AzBook, BookRead>> = {};
  for (const b of ev.bookmakers) {
    if (!isAzBook(b.key)) continue;
    const read: BookRead = {};
    const at = b.last_update ?? null;
    for (const m of b.markets) {
      if (m.key === "h2h") {
        const h = m.outcomes.find((o) => normTeam(o.name) === homeN);
        const a = m.outcomes.find((o) => normTeam(o.name) === awayN);
        if (!h || !a || !validPrice(h.price) || !validPrice(a.price)) continue;
        const nv = noVig(h.price, a.price);
        if (!nv) continue;
        read.ml = { home: { price: h.price, opp: a.price, line: null, at }, away: { price: a.price, opp: h.price, line: null, at }, pHome: nv.p };
      } else if (m.key === "spreads") {
        const h = m.outcomes.find((o) => normTeam(o.name) === homeN);
        const a = m.outcomes.find((o) => normTeam(o.name) === awayN);
        if (!h || !a || h.point == null || a.point == null || !validPrice(h.price) || !validPrice(a.price)) continue;
        if (Math.abs(h.point + a.point) > 1e-9) continue; // the two sides must be the same line
        const nv = noVig(h.price, a.price);
        if (!nv) continue;
        read.spread = {
          home: { price: h.price, opp: a.price, line: h.point, at },
          away: { price: a.price, opp: h.price, line: a.point, at },
          mu: -h.point + sigma * normInv(nv.p),
        };
      } else if (m.key === "totals") {
        const o = m.outcomes.find((x) => x.name.toLowerCase() === "over");
        const u = m.outcomes.find((x) => x.name.toLowerCase() === "under");
        if (!o || !u || o.point == null || u.point == null || !validPrice(o.price) || !validPrice(u.price)) continue;
        if (Math.abs(o.point - u.point) > 1e-9) continue;
        const nv = noVig(o.price, u.price);
        if (!nv) continue;
        read.total = {
          over: { price: o.price, opp: u.price, line: o.point, at },
          under: { price: u.price, opp: o.price, line: u.point, at },
          muT: o.point + sigmaTotal * normInv(nv.p),
        };
      }
    }
    if (read.ml || read.spread || read.total) out[b.key] = read;
  }
  return out;
}

export type FootballModel = {
  /** Two-book market numbers (means), null when neither book posts the market. */
  mktPHome: number | null;
  mktMargin: number | null;
  mktTotal: number | null;
  fpiMargin: number | null;
  /** The numbers picks are priced on. */
  pHome: number | null;
  muMargin: number | null;
  muTotal: number | null;
  /** True when FPI moved the side numbers off the market. */
  fpi: boolean;
};

export function footballModelOf(game: Pick<CfbGame, "home" | "away" | "neutral">, books: Partial<Record<AzBook, BookRead>>, L: LeagueConfig): FootballModel {
  const M = L.model;
  const reads = AZ_BOOKS.map((b) => books[b]).filter((r): r is BookRead => !!r);
  const mktPHome = mean(reads.filter((r) => r.ml).map((r) => r.ml!.pHome));
  const mktMargin = mean(reads.filter((r) => r.spread).map((r) => r.spread!.mu));
  const mktTotal = mean(reads.filter((r) => r.total).map((r) => r.total!.muT));
  const fpiMargin = game.home.fpi != null && game.away.fpi != null ? game.home.fpi - game.away.fpi + (game.neutral ? 0 : M.hfa) : null;

  if (fpiMargin == null) {
    /* market only: every number is the two books' own */
    return { mktPHome, mktMargin, mktTotal, fpiMargin, pHome: mktPHome, muMargin: mktMargin, muTotal: mktTotal, fpi: false };
  }
  const parts: [number, number | null][] = [
    [M.blend.mkt, mktPHome],
    [M.blend.spread, mktMargin != null ? normCdf(mktMargin / M.sigma) : null],
    [M.blend.fpi, normCdf(fpiMargin / M.sigma)],
  ];
  let w = 0;
  let p = 0;
  for (const [wt, v] of parts) {
    if (v == null) continue;
    w += wt;
    p += wt * v;
  }
  /* a win probability needs a moneyline to be bet against; a margin needs a spread */
  const pHome = mktPHome != null && w > 0 ? p / w : null;
  const muMargin = mktMargin != null ? (M.spreadBlend.mkt * mktMargin + M.spreadBlend.fpi * fpiMargin) / (M.spreadBlend.mkt + M.spreadBlend.fpi) : null;
  return { mktPHome, mktMargin, mktTotal, fpiMargin, pHome, muMargin, muTotal: mktTotal, fpi: true };
}

const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export type FootballInput = {
  league: LeagueConfig;
  /** Shaped games (buildCfbBoard) carrying `oddsEventId` for the ones the odds feed matched. */
  games: CfbGame[];
  /** The raw odds events of the same pull. */
  oddsEvents: unknown[];
  snapshotId: string;
  /** When the odds were fetched from the provider (ms). */
  fetchedAt: number;
};

export type FootballOutput = {
  candidates: Candidate[];
  events: { sport: string; eventId: string; commence: string }[];
  notes: string[];
};

export function footballCandidates(input: FootballInput): FootballOutput {
  const L = input.league;
  const M = L.model;
  const byId = new Map<string, OddsEvent>();
  for (const raw of input.oddsEvents) {
    const e = toOddsEvent(raw);
    if (e) byId.set(e.id, e);
  }
  const candidates: Candidate[] = [];
  const events: FootballOutput["events"] = [];
  const notes: string[] = [];
  let unmatched = 0;

  for (const g of input.games) {
    const ev = g.oddsEventId ? byId.get(g.oddsEventId) : undefined;
    if (!ev) {
      unmatched++;
      continue;
    }
    /* the EARLIER of the schedule's kickoff and the odds feed's commence_time is the start the engine guards on */
    const tEspn = Date.parse(g.start);
    const tOdds = Date.parse(ev.commence_time);
    const commence = Number.isFinite(tEspn) && tEspn < tOdds ? g.start : ev.commence_time;
    if (g.status !== "upcoming") continue;
    const books = readTwoBooks(ev, M.sigma, M.sigmaTotal);
    if (!Object.keys(books).length) continue;
    const model = footballModelOf(g, books, L);
    events.push({ sport: L.id, eventId: ev.id, commence });
    const eventLabel = `${g.away.short || g.away.name} @ ${g.home.short || g.home.name}`;
    const base = {
      sport: L.id,
      eventId: ev.id,
      event: eventLabel,
      commence,
      snapshotId: input.snapshotId,
      fetchedAt: input.fetchedAt,
      live: false,
      gradeRef: { source: "espn" as const, league: L.id, id: g.id, home: g.home.name, away: g.away.name },
    };
    const sideKind = model.fpi ? ("independent" as const) : ("market-only" as const);
    const sideVersion = model.fpi ? FB_MODEL_FPI : FB_MODEL_MARKET;

    /* moneyline */
    if (model.pHome != null) {
      for (const side of ["home", "away"] as const) {
        const quotes: AzQuotes = {};
        for (const b of AZ_BOOKS) {
          const q = books[b]?.ml?.[side];
          if (q) quotes[b] = { price: q.price, opp: q.opp, ...(q.at ? { at: q.at } : {}) };
        }
        if (!Object.keys(quotes).length) continue;
        const team = side === "home" ? g.home : g.away;
        candidates.push({
          ...base,
          market: "ml",
          marketType: `${L.id}:ml`,
          side,
          selection: `${team.short || team.name} ML`,
          line: null,
          model: { win: side === "home" ? model.pHome : 1 - model.pHome, push: 0 },
          modelVersion: sideVersion,
          modelKind: sideKind,
          quotes,
        });
      }
    }

    /* spread: one candidate per side per distinct line either book posts */
    if (model.muMargin != null) {
      for (const side of ["home", "away"] as const) {
        const lines = new Set<number>();
        for (const b of AZ_BOOKS) {
          const q = books[b]?.spread?.[side];
          if (q && q.line != null) lines.add(q.line);
        }
        for (const line of lines) {
          const quotes: AzQuotes = {};
          for (const b of AZ_BOOKS) {
            const q = books[b]?.spread?.[side];
            if (q && q.line != null && Math.abs(q.line - line) < 1e-9) quotes[b] = { price: q.price, opp: q.opp, ...(q.at ? { at: q.at } : {}) };
          }
          const team = side === "home" ? g.home : g.away;
          candidates.push({
            ...base,
            market: "spread",
            marketType: `${L.id}:spread`,
            side,
            selection: `${team.short || team.name} ${fmt(line)}`,
            line,
            model: coverProb(side === "home" ? model.muMargin : -model.muMargin, M.sigma, line),
            modelVersion: sideVersion,
            modelKind: sideKind,
            quotes,
          });
        }
      }
    }

    /* total: the model is the two-book market and nothing else */
    if (model.muTotal != null) {
      for (const side of ["over", "under"] as const) {
        const lines = new Set<number>();
        for (const b of AZ_BOOKS) {
          const q = books[b]?.total?.[side];
          if (q && q.line != null) lines.add(q.line);
        }
        for (const line of lines) {
          const quotes: AzQuotes = {};
          for (const b of AZ_BOOKS) {
            const q = books[b]?.total?.[side];
            if (q && q.line != null && Math.abs(q.line - line) < 1e-9) quotes[b] = { price: q.price, opp: q.opp, ...(q.at ? { at: q.at } : {}) };
          }
          candidates.push({
            ...base,
            market: "total",
            marketType: `${L.id}:total`,
            side,
            selection: `${side === "over" ? "Over" : "Under"} ${line}`,
            line,
            model: side === "over" ? coverProb(model.muTotal, M.sigmaTotal, -line) : coverProb(-model.muTotal, M.sigmaTotal, line),
            modelVersion: FB_MODEL_MARKET,
            modelKind: "market-only",
            quotes,
          });
        }
      }
    }
  }
  if (unmatched) notes.push(`${L.id}: ${unmatched} scheduled game(s) had no odds event`);
  return { candidates, events, notes };
}
