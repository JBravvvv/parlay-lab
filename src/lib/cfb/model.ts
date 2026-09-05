import { americanFromProb, decFromAmerican, devigProportional, impliedFromAmerican, weightedMedian } from "@/engine2/devig";
import { gradeFromEv } from "@/lib/grade";
import { CFB_MODEL, CFB_RULES } from "@/lib/cfb/rules";
import { kickoffLabel, ptDateOf } from "@/lib/cfb/dates";
import { matchOddsEvent, normTeam, toOddsEvent, type OddsEvent } from "@/lib/cfb/names";
import { normCdf, normInv } from "@/lib/cfb/normal";
import type {
  CfbBoard,
  CfbBuildInput,
  CfbGame,
  CfbMarketKey,
  CfbModel,
  CfbQuote,
  CfbRow,
  CfbSideKey,
  CfbStatus,
  CfbTeam,
} from "@/lib/cfb/types";

/**
 * THE CFB MODEL (INSTRUCTION 38, 2026-09-05) — `buildCfbBoard`, a pure function from three raw
 * feeds to a priced board. No fetch, no clock, no storage: the route (or a test) hands it the
 * ESPN scoreboard events, the Odds API events, the FPI payload, `now` and the bankroll.
 *
 * How a game is priced, in order:
 *   1. ESPN events → CfbGame skeletons (only kickoffs on the requested Pacific date).
 *   2. FPI joined by ESPN team id (FCS teams are absent → null, never invented).
 *   3. The odds event matched by name (names.ts), each event used at most once.
 *   4. Per book: the two-way moneyline de-vigged proportionally → P(home); the spread's two
 *      prices de-vigged → P(home covers) → an implied margin through the normal model
 *      (μ_b = −s_b + σ·Φ⁻¹(p)); the total likewise (μT_b = T_b + σT·Φ⁻¹(p_over)).
 *   5. Consensus = Pinnacle-weighted median across books (null under CFB_MODEL.minBooks).
 *   6. P(home) = blend of {ML consensus, spread-implied, FPI-implied} over what exists;
 *      expected margin = spreadBlend of {market margin, FPI margin}; expected total = market.
 *   7. One row per side per market at the consensus line, with every book's quote at ITS OWN
 *      line, EV at Caesars re-evaluated at Caesars' line, a letter grade on that EV, and a
 *      ¼-Kelly whole-dollar stake capped at 2% of the bankroll.
 * Nothing here is a prediction. A row's `fair` is what the blend says the side is worth; the
 * EV is that fair against a posted price. Missing feed values are null and render "—".
 */

type Rec = Record<string, unknown>;
const rec = (x: unknown): Rec | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Rec) : null);
const str = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x : null);
const num = (x: unknown): number | null => {
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  if (typeof x === "string" && x.trim()) {
    const v = Number(x);
    return Number.isFinite(v) ? v : null;
  }
  return null;
};
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const round = (v: number, dp: number) => {
  const k = 10 ** dp;
  return Math.round(v * k) / k;
};
const sameLine = (a: number | null, b: number | null) => a != null && b != null && Math.abs(a - b) < 1e-9;

/* ---------- the normal margin model ---------- */

/**
 * P(side wins) and P(push) when the side's score-difference X ~ N(μ, σ²) is settled at `line`:
 * the side wins when X + line > 0 and pushes when X + line = 0. Integer lines get the
 * continuity correction (X is integer-valued); half-point lines cannot push.
 */
export function coverProb(mu: number, sigma: number, line: number): { win: number; push: number } {
  if (Number.isInteger(line)) {
    const hi = normCdf((-line + 0.5 - mu) / sigma);
    const lo = normCdf((-line - 0.5 - mu) / sigma);
    return { win: 1 - hi, push: Math.max(0, hi - lo) };
  }
  return { win: 1 - normCdf((-line - mu) / sigma), push: 0 };
}

/**
 * The model's (win, push) for a side of a game at an arbitrary line — the consensus line for
 * the row's `fair`, a book's own line for that book's EV. Null when the model has nothing for
 * that market (no expected margin / total / win probability).
 */
export function rowProbAt(model: CfbModel, market: CfbMarketKey, side: CfbSideKey, line: number | null): { win: number; push: number } | null {
  if (market === "ml") {
    if (model.pHome == null) return null;
    return { win: side === "home" ? model.pHome : 1 - model.pHome, push: 0 };
  }
  if (line == null) return null;
  if (market === "spread") {
    if (model.muMargin == null) return null;
    return coverProb(side === "home" ? model.muMargin : -model.muMargin, model.sigma, line);
  }
  if (model.muTotal == null) return null;
  return side === "over" ? coverProb(model.muTotal, model.sigmaTotal, -line) : coverProb(-model.muTotal, model.sigmaTotal, line);
}

/** % EV of a side at a decimal price: win·(dec−1) − loss, the push mass returning the stake. */
export function evPct(win: number, push: number, dec: number): number {
  const loss = Math.max(0, 1 - win - push);
  return 100 * (win * (dec - 1) - loss);
}

/** Whole-dollar ¼-Kelly stake at a price, capped at CFB_RULES.kellyCap of the bankroll; 0 when the edge is ≤ 0. */
export function kellyStake(win: number, push: number, dec: number, bankroll: number): number {
  const loss = Math.max(0, 1 - win - push);
  const b = dec - 1;
  if (!(b > 0) || !(bankroll > 0)) return 0;
  const f = CFB_RULES.kellyFrac * ((win * b - loss) / b);
  if (!(f > 0)) return 0;
  return Math.round(Math.min(f, CFB_RULES.kellyCap) * bankroll);
}

/** "-40.5" · "+40.5" · "PK" — a side-signed spread for labels. */
export function fmtLine(line: number): string {
  if (line === 0) return "PK";
  return line > 0 ? `+${line}` : `${line}`;
}

/** The row label for a side at a given line ("Indiana ML" · "Indiana -40.5" · "Over 56.5"). */
export function sideLabel(game: Pick<CfbGame, "home" | "away">, market: CfbMarketKey, side: CfbSideKey, line: number | null): string {
  if (market === "total") return `${side === "over" ? "Over" : "Under"} ${line ?? "—"}`;
  const team = side === "home" ? game.home : game.away;
  if (market === "ml") return `${team.short} ML`;
  return `${team.short} ${line == null ? "—" : fmtLine(line)}`;
}

/* ---------- ESPN → skeleton ---------- */

type FpiIndex = Map<string, { fpi: number | null; fpiRank: number | null }>;

function fpiIndex(fpi: unknown): { index: FpiIndex; updated: string | null } {
  const index: FpiIndex = new Map();
  const root = rec(fpi);
  if (!root) return { index, updated: null };
  for (const t of arr(root.teams)) {
    const tr = rec(t);
    const team = rec(tr?.team);
    const id = team ? (str(team.id) ?? (num(team.id) != null ? String(num(team.id)) : null)) : null;
    if (!id) continue;
    let rating: number | null = null;
    let rank: number | null = null;
    for (const c of arr(tr?.categories)) {
      const cr = rec(c);
      if (!cr || cr.name !== "fpi") continue;
      const values = arr(cr.values);
      rating = num(values[0]);
      rank = num(values[1]);
    }
    index.set(id, { fpi: rating, fpiRank: rank != null && rank > 0 ? Math.round(rank) : null });
  }
  return { index, updated: str(root.lastUpdated) };
}

function statusOf(name: string | null, state: string | null, completed: boolean): CfbStatus {
  const n = (name ?? "").toUpperCase();
  if (n.includes("POSTPONED") || n.includes("CANCEL")) return "postponed";
  if (n === "STATUS_FINAL" || completed || state === "post") return "final";
  if (state === "in" || n === "STATUS_IN_PROGRESS" || n.includes("HALFTIME") || n.includes("END_PERIOD")) return "live";
  return "upcoming";
}

function shapeTeam(competitor: Rec, fpi: FpiIndex): CfbTeam | null {
  const team = rec(competitor.team);
  if (!team) return null;
  const id = str(team.id) ?? (num(team.id) != null ? String(num(team.id)) : null);
  if (!id) return null;
  const name = str(team.displayName) ?? [str(team.location), str(team.name)].filter(Boolean).join(" ");
  if (!name) return null;
  const rankRaw = num(rec(competitor.curatedRank)?.current);
  const records = arr(competitor.records).map(rec).filter((r): r is Rec => !!r);
  const overall = records.find((r) => r.name === "overall" || r.type === "total") ?? records[0];
  const f = fpi.get(id);
  return {
    id,
    name,
    short: str(team.shortDisplayName) ?? str(team.location) ?? name,
    abbr: str(team.abbreviation) ?? name.slice(0, 4).toUpperCase(),
    logo: str(team.logo),
    rank: rankRaw != null && rankRaw >= 1 && rankRaw <= 25 ? Math.round(rankRaw) : null,
    record: overall ? str(overall.summary) : null,
    color: str(team.color),
    fpi: f?.fpi ?? null,
    fpiRank: f?.fpiRank ?? null,
  };
}

const EMPTY_MODEL = (): CfbModel => ({
  muMargin: null,
  muTotal: null,
  sigma: CFB_MODEL.sigma,
  sigmaTotal: CFB_MODEL.sigmaTotal,
  pHome: null,
  parts: { mkt: null, spread: null, fpi: null, mktMargin: null, fpiMargin: null, mktTotal: null },
  books: { ml: 0, spread: 0, total: 0 },
});

function shapeGame(raw: unknown, fpi: FpiIndex): CfbGame | null {
  const ev = rec(raw);
  if (!ev) return null;
  const id = str(ev.id) ?? (num(ev.id) != null ? String(num(ev.id)) : null);
  const comp = rec(arr(ev.competitions)[0]);
  const start = str(ev.date) ?? (comp ? str(comp.date) : null);
  if (!id || !comp || !start || Number.isNaN(Date.parse(start))) return null;
  const competitors = arr(comp.competitors).map(rec).filter((c): c is Rec => !!c);
  const homeC = competitors.find((c) => c.homeAway === "home");
  const awayC = competitors.find((c) => c.homeAway === "away");
  if (!homeC || !awayC) return null;
  const home = shapeTeam(homeC, fpi);
  const away = shapeTeam(awayC, fpi);
  if (!home || !away) return null;

  const st = rec(ev.status) ?? rec(comp.status);
  const type = rec(st?.type);
  const status = statusOf(str(type?.name), str(type?.state), type?.completed === true);
  const shortDetail = str(type?.shortDetail) ?? str(type?.detail);
  const detail = status === "upcoming" ? kickoffLabel(start) : shortDetail;
  const period = num(st?.period);
  const clock = status === "live" ? str(st?.displayClock) : null;
  const scored = status === "live" || status === "final";

  const broadcasts = arr(comp.broadcasts).map(rec).filter((b): b is Rec => !!b);
  const tv = broadcasts.map((b) => str(arr(b.names)[0])).find((n): n is string => !!n) ?? null;

  const odds = rec(arr(comp.odds)[0]);
  const provider = odds ? rec(odds.provider) : null;
  const espnLine = odds && provider && str(provider.name) ? { spread: num(odds.spread), total: num(odds.overUnder), details: str(odds.details) } : null;

  return {
    id,
    date: ptDateOf(start),
    start,
    status,
    detail,
    period: period != null && period > 0 ? period : null,
    clock,
    neutral: comp.neutralSite === true,
    venue: str(rec(comp.venue)?.fullName),
    tv,
    home,
    away,
    homeScore: scored ? num(homeC.score) : null,
    awayScore: scored ? num(awayC.score) : null,
    espnLine,
    oddsEventId: null,
    model: EMPTY_MODEL(),
    rows: [],
  };
}

/* ---------- odds → per-book readings ---------- */

type BookMl = { key: string; title: string; pHome: number; priceH: number; priceA: number; w: number };
type BookSpread = { key: string; title: string; s: number; priceH: number; priceA: number; mu: number; w: number };
type BookTotal = { key: string; title: string; T: number; priceO: number; priceU: number; muT: number; w: number };

const validPrice = (p: number) => Number.isFinite(p) && Math.abs(p) >= 100;
const weightOf = (key: string) => (key === "pinnacle" ? CFB_MODEL.pinnacleWeight : 1);

function readBooks(ev: OddsEvent) {
  const homeN = normTeam(ev.home_team);
  const awayN = normTeam(ev.away_team);
  const mls: BookMl[] = [];
  const spreads: BookSpread[] = [];
  const totals: BookTotal[] = [];
  for (const b of ev.bookmakers) {
    const w = weightOf(b.key);
    for (const m of b.markets) {
      if (m.key === "h2h") {
        const h = m.outcomes.find((o) => normTeam(o.name) === homeN);
        const a = m.outcomes.find((o) => normTeam(o.name) === awayN);
        if (!h || !a || !validPrice(h.price) || !validPrice(a.price)) continue;
        const [ph] = devigProportional([impliedFromAmerican(h.price), impliedFromAmerican(a.price)]);
        if (!(ph > 0 && ph < 1)) continue;
        mls.push({ key: b.key, title: b.title, pHome: ph, priceH: h.price, priceA: a.price, w });
      } else if (m.key === "spreads") {
        const h = m.outcomes.find((o) => normTeam(o.name) === homeN);
        const a = m.outcomes.find((o) => normTeam(o.name) === awayN);
        if (!h || !a || h.point == null || !validPrice(h.price) || !validPrice(a.price)) continue;
        const [pc] = devigProportional([impliedFromAmerican(h.price), impliedFromAmerican(a.price)]);
        if (!(pc > 0 && pc < 1)) continue;
        const mu = -h.point + CFB_MODEL.sigma * normInv(pc);
        spreads.push({ key: b.key, title: b.title, s: h.point, priceH: h.price, priceA: a.price, mu, w });
      } else if (m.key === "totals") {
        const o = m.outcomes.find((x) => x.name.toLowerCase() === "over");
        const u = m.outcomes.find((x) => x.name.toLowerCase() === "under");
        if (!o || !u || o.point == null || !validPrice(o.price) || !validPrice(u.price)) continue;
        const [po] = devigProportional([impliedFromAmerican(o.price), impliedFromAmerican(u.price)]);
        if (!(po > 0 && po < 1)) continue;
        const muT = o.point + CFB_MODEL.sigmaTotal * normInv(po);
        totals.push({ key: b.key, title: b.title, T: o.point, priceO: o.price, priceU: u.price, muT, w });
      }
    }
  }
  return { mls, spreads, totals };
}

function median<T>(items: T[], value: (t: T) => number, weight: (t: T) => number): number | null {
  if (items.length < CFB_MODEL.minBooks) return null;
  return weightedMedian(items.map(value), items.map(weight));
}

/* ---------- the per-game model ---------- */

function quote(key: string, title: string, price: number, line: number | null): CfbQuote {
  return { book: key, title, price, line, dec: decFromAmerican(price) };
}

type SideQuotes = { all: CfbQuote[]; cz: CfbQuote | null; dk: CfbQuote | null; fd: CfbQuote | null; pin: CfbQuote | null };

function collect(quotes: CfbQuote[]): SideQuotes {
  const find = (k: string) => quotes.find((q) => q.book === k) ?? null;
  return { all: quotes, cz: find(CFB_MODEL.settleBook), dk: find("draftkings"), fd: find("fanduel"), pin: find("pinnacle") };
}

function bestOf(quotes: CfbQuote[], line: number | null): CfbQuote | null {
  let best: CfbQuote | null = null;
  for (const q of quotes) {
    if (line != null && !sameLine(q.line, line)) continue;
    if (!best || q.dec > best.dec) best = q;
  }
  return best;
}

function priceGame(game: CfbGame, ev: OddsEvent | null, now: number, bankroll: number): void {
  const model = EMPTY_MODEL();
  const books = ev ? readBooks(ev) : { mls: [], spreads: [], totals: [] };
  const { sigma, sigmaTotal } = model;

  const mkt = median(books.mls, (b) => b.pHome, (b) => b.w);
  const mktMargin = median(books.spreads, (b) => b.mu, (b) => b.w);
  const spreadLine = median(books.spreads, (b) => b.s, (b) => b.w);
  const mktTotal = median(books.totals, (b) => b.muT, (b) => b.w);
  const totalLine = median(books.totals, (b) => b.T, (b) => b.w);
  const fpiMargin = game.home.fpi != null && game.away.fpi != null ? game.home.fpi - game.away.fpi + (game.neutral ? 0 : CFB_MODEL.hfa) : null;

  const pSpread = mktMargin != null ? normCdf(mktMargin / sigma) : null;
  const pFpi = fpiMargin != null ? normCdf(fpiMargin / sigma) : null;
  let wsum = 0;
  let psum = 0;
  if (mkt != null) {
    wsum += CFB_MODEL.blend.mkt;
    psum += CFB_MODEL.blend.mkt * mkt;
  }
  if (pSpread != null) {
    wsum += CFB_MODEL.blend.spread;
    psum += CFB_MODEL.blend.spread * pSpread;
  }
  if (pFpi != null) {
    wsum += CFB_MODEL.blend.fpi;
    psum += CFB_MODEL.blend.fpi * pFpi;
  }
  const pHome = wsum > 0 ? psum / wsum : null;

  let muMargin: number | null = null;
  if (mktMargin != null || fpiMargin != null) {
    let ws = 0;
    let ms = 0;
    if (mktMargin != null) {
      ws += CFB_MODEL.spreadBlend.mkt;
      ms += CFB_MODEL.spreadBlend.mkt * mktMargin;
    }
    if (fpiMargin != null) {
      ws += CFB_MODEL.spreadBlend.fpi;
      ms += CFB_MODEL.spreadBlend.fpi * fpiMargin;
    }
    muMargin = ms / ws;
  } else if (mkt != null) {
    muMargin = sigma * normInv(mkt);
  }

  model.muMargin = muMargin;
  model.muTotal = mktTotal;
  model.pHome = pHome;
  model.parts = { mkt, spread: pSpread, fpi: pFpi, mktMargin, fpiMargin, mktTotal };
  model.books = { ml: books.mls.length, spread: books.spreads.length, total: books.totals.length };
  game.model = model;
  game.oddsEventId = ev?.id ?? null;

  const kickoff = Date.parse(game.start);
  const upcoming = game.status === "upcoming" && Number.isFinite(kickoff) && kickoff > now;
  const when = kickoffLabel(game.start);
  const rows: CfbRow[] = [];

  const push = (market: CfbMarketKey, side: CfbSideKey, line: number | null, mktProb: number | null, nBooks: number, quotes: CfbQuote[]) => {
    const fairAt = rowProbAt(model, market, side, line);
    if (!fairAt) return;
    const sq = collect(quotes);
    const best = bestOf(sq.all, market === "ml" ? null : line);
    const evAt = (q: CfbQuote | null): number | null => {
      if (!q) return null;
      const p = market === "ml" ? fairAt : rowProbAt(model, market, side, q.line);
      if (!p) return null;
      return round(evPct(p.win, p.push, q.dec), 2);
    };
    const evCz = evAt(sq.cz);
    const evBest = evAt(best);
    const playable = !!sq.cz && upcoming;
    let kelly = 0;
    if (playable && sq.cz) {
      const p = market === "ml" ? fairAt : rowProbAt(model, market, side, sq.cz.line);
      if (p) kelly = kellyStake(p.win, p.push, sq.cz.dec, bankroll);
    }
    const noPush = fairAt.win / Math.max(1e-9, 1 - fairAt.push);
    const clamped = Math.min(1 - 1e-6, Math.max(1e-6, noPush));
    const team = side === "home" ? game.home : side === "away" ? game.away : null;
    const sub =
      market === "total"
        ? `${game.away.abbr} @ ${game.home.abbr} · ${when}`
        : side === "home"
          ? `vs ${game.away.short} · ${when}`
          : `@ ${game.home.short} · ${when}`;
    rows.push({
      key: `${game.id}|${market}|${side}|${line ?? ""}`,
      gameId: game.id,
      market,
      side,
      label: sideLabel(game, market, side, line),
      sub,
      teamId: team?.id ?? null,
      line,
      fair: fairAt.win,
      push: fairAt.push,
      fairAm: americanFromProb(clamped),
      mkt: mktProb,
      books: nBooks,
      cz: sq.cz,
      best,
      dk: sq.dk,
      fd: sq.fd,
      pin: sq.pin,
      evCz,
      evBest,
      grade: gradeFromEv(evCz),
      kelly,
      playable,
    });
  };

  if (mkt != null && pHome != null) {
    push("ml", "home", null, mkt, books.mls.length, books.mls.map((b) => quote(b.key, b.title, b.priceH, null)));
    push("ml", "away", null, 1 - mkt, books.mls.length, books.mls.map((b) => quote(b.key, b.title, b.priceA, null)));
  }
  if (mktMargin != null && spreadLine != null && muMargin != null) {
    const homeMkt = coverProb(mktMargin, sigma, spreadLine).win;
    const awayMkt = coverProb(-mktMargin, sigma, -spreadLine).win;
    push("spread", "home", spreadLine, homeMkt, books.spreads.length, books.spreads.map((b) => quote(b.key, b.title, b.priceH, b.s)));
    push("spread", "away", -spreadLine, awayMkt, books.spreads.length, books.spreads.map((b) => quote(b.key, b.title, b.priceA, -b.s)));
  }
  if (mktTotal != null && totalLine != null) {
    const overMkt = coverProb(mktTotal, sigmaTotal, -totalLine).win;
    const underMkt = coverProb(-mktTotal, sigmaTotal, totalLine).win;
    push("total", "over", totalLine, overMkt, books.totals.length, books.totals.map((b) => quote(b.key, b.title, b.priceO, b.T)));
    push("total", "under", totalLine, underMkt, books.totals.length, books.totals.map((b) => quote(b.key, b.title, b.priceU, b.T)));
  }
  game.rows = rows;
}

/* ---------- the board ---------- */

export function buildCfbBoard(input: CfbBuildInput): CfbBoard {
  const { index, updated } = fpiIndex(input.fpi);
  const games: CfbGame[] = [];
  const seen = new Set<string>();
  for (const raw of input.espnEvents) {
    const g = shapeGame(raw, index);
    if (!g || g.date !== input.date || seen.has(g.id)) continue;
    seen.add(g.id);
    games.push(g);
  }
  games.sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const oddsEvents: OddsEvent[] = [];
  for (const raw of input.oddsEvents) {
    const e = toOddsEvent(raw);
    if (e) oddsEvents.push(e);
  }

  const used = new Set<string>();
  let unmatched = 0;
  for (const g of games) {
    const ev = matchOddsEvent({ home: g.home.name, away: g.away.name, start: g.start }, oddsEvents, used);
    if (!ev) unmatched++;
    priceGame(g, ev, input.now, input.bankroll);
  }

  const dates = new Set<string>([input.date]);
  for (const e of oddsEvents) {
    const t = Date.parse(e.commence_time);
    if (Number.isFinite(t) && t > input.now) dates.add(ptDateOf(e.commence_time));
  }

  return {
    date: input.date,
    slateDates: [...dates].sort(),
    games,
    unmatched,
    fpiUpdated: updated,
    generatedAt: input.now,
  };
}
