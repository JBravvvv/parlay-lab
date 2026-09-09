import { americanFromProb, decFromAmerican, devigProportional, impliedFromAmerican, weightedMedian } from "@/engine2/devig";
import { gradeFromEv } from "@/lib/grade";
import { kickoffLabel } from "@/lib/cfb/dates";
import { evPct, kellyStake } from "@/lib/cfb/model";
import { normTeam } from "@/lib/cfb/names";
import { CFB_PROP_MARKETS, type CfbPropMarket, type CfbPropQuote, type CfbPropRow, type CfbPropSide } from "@/lib/cfb/props-types";
import { CFB_PROPS, CFB_RULES } from "@/lib/cfb/rules";
import type { CfbBoard, CfbGame } from "@/lib/cfb/types";
import type { LeagueProps, LeagueRules } from "@/lib/football/league";

/**
 * CFB PLAYER PROPS — the pure pricing (INSTRUCTION 39, 2026-09-05). `parseEventProps` turns one
 * Odds API per-event payload (`/v4/sports/americanfootball_ncaaf/events/<id>/odds`) into priced
 * rows for one ESPN game. No fetch, no clock, no storage: the route hands it the JSON, the
 * shaped game, `now`, the bankroll and (optionally) the ESPN season context.
 *
 * How a prop is priced:
 *   1. Outcomes are grouped by (market, player). Per book, an Over/Under pair AT THE SAME LINE
 *      is de-vigged proportionally → P(over) at that book's line (P(under) = 1 − P(over)).
 *   2. Anytime TD is a yes-only market at most US books. When a book posts Yes AND No they are
 *      de-vigged as a pair; when only Yes exists, the raw implied probability is divided by
 *      `ATD_YES_ONLY_OVERROUND` (1.08) — a stated ASSUMPTION about the hold a book carries on a
 *      one-sided TD price (a two-way market's hold sits in the 4–8 % band; a yes-only price has
 *      nowhere else to put it), not a measured figure. It is a constant, it is named, and The
 *      Sharp can print it.
 *   3. There is no distribution model for a player's yards or catches, so a fair probability
 *      exists only AT A LINE THE BOOKS PRICED: the fair at line L is the median of the de-vigged
 *      probabilities of the books posting exactly L, and it needs `CFB_PROPS.minBooks` books
 *      else it is null. Every book counts equally (Pinnacle rarely posts CFB props). It is the
 *      TRUE median (`median` below): on an even count the mean of the two middle reads, so the
 *      Over and Under sides of one row are priced symmetrically (fair(under) = 1 − fair(over)
 *      is then also the median of the under reads).
 *   4. The row's `line` is the median of the books' lines (lower-middle on an even count, so it
 *      is always a posted line); `fair` is the fair at that line.
 *      Every book is quoted at ITS OWN line, and its EV is the shared `evPct` at the book's
 *      price against the fair AT THE BOOK'S LINE — so a Caesars quote at a line no second book
 *      posts carries a price but a null EV, a null grade and a $0 Kelly. Nothing is interpolated.
 *   5. Push mass is not observable from a de-vigged pair, so `push` is 0 everywhere (half-point
 *      lines cannot push; the rare whole-number line is priced as if it could not).
 *   6. `best` = highest decimal among the books posting the consensus line (all books for the
 *      line-less anytime TD); `cz` = Caesars; `dk` / `fd` for reference; `grade` =
 *      gradeFromEv(evCz); `playable` = Caesars posts it ∧ status upcoming ∧ kickoff after `now`;
 *      `kelly` = ¼-Kelly of the bankroll, capped at 2 %, only when playable and priced.
 * Nothing here is a prediction. A row's `fair` is what the books, de-vigged, say the side is
 * worth at that line; the EV is that fair against a posted price. Missing values are null.
 *
 * TWO LEAGUES, ONE PRICER (2026-09-08, the NFL build): the module is shared by the College
 * Football and NFL desks. `parseEventProps` reads its knobs (`minBooks`, `settleBook`, the Kelly
 * fraction and cap) from `opts.props` / `opts.rules` — a LeagueProps / LeagueRules — and defaults
 * to CFB_PROPS / CFB_RULES so every existing CFB caller is unchanged; the server body
 * (src/lib/server/football-props.ts) passes the league's own. The six market keys are the SAME
 * six on both feeds (`CFB_PROP_MARKETS`; tests pin NFL_LEAGUE.feeds.oddsPropMarkets against
 * CFB_PROPS_ODDS_MARKETS), so the market table and labels stay one copy.
 */

/** the assumed hold on a yes-only anytime-TD price (see the header, point 2) */
export const ATD_YES_ONLY_OVERROUND = 1.08;

/** A player's ESPN identity from the season tables (INSTRUCTION 46, 2026-09-08) — values or null. */
export type CfbPropPlayerMeta = {
  athleteId: string | null;
  /** ESPN's full-size headshot href; `headshotThumb` in TeamMark sizes it through the combiner */
  headshot: string | null;
  /** ESPN team id — the slate's `CfbTeam.id` */
  teamId: string | null;
  teamAbbr: string | null;
  pos: string | null;
};

/**
 * The season-context join. A plain function still works (older callers / tests); the route's
 * `ctxLookup` also hangs `.player` on it so one lookup carries both the stat line and the
 * identity (INSTRUCTION 46) without changing the `parseEventProps` call shape.
 */
export type CfbPropCtxLookup = {
  (market: CfbPropMarket, player: string): CfbPropRow["ctx"];
  player?: (player: string) => CfbPropPlayerMeta | null;
};

export type ParsePropsOpts = {
  /** ms epoch the rows are built at (kickoff-passed checks) */
  now: number;
  /** CFB bankroll for Kelly sizing */
  bankroll: number;
  /** optional ESPN season context join; null / omitted → every `ctx` is null */
  ctx?: CfbPropCtxLookup | null;
  /** the league's props knobs (`minBooks`, `settleBook`); CFB_PROPS when omitted */
  props?: LeagueProps;
  /** the league's Kelly fraction / cap; CFB_RULES when omitted */
  rules?: LeagueRules;
};

type Rec = Record<string, unknown>;
const rec = (x: unknown): Rec | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Rec) : null);
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x.trim() : null);
const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const round = (v: number, dp: number) => {
  const k = 10 ** dp;
  return Math.round(v * k) / k;
};
const validPrice = (p: number) => Number.isFinite(p) && Math.abs(p) >= 100;
const sameLine = (a: number | null, b: number | null) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 1e-9);

/** "ty-simpson" — the player's slug for row keys. */
export function playerSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u0027\u0060\u2018\u2019.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const MARKET_BY_ODDS = new Map(CFB_PROP_MARKETS.map((m) => [m.odds, m] as const));

/** one book's de-vigged reading of one (market, player) */
type BookRead = { book: string; title: string; line: number | null; pOver: number; priceOver: number; priceUnder: number | null };

type Group = { market: (typeof CFB_PROP_MARKETS)[number]; player: string; team: string | null; reads: BookRead[] };

/** Group the payload's outcomes by (market, player) and de-vig each book's pair. */
function readEvent(eventJson: unknown): Group[] {
  const ev = rec(eventJson);
  const groups = new Map<string, Group>();
  if (!ev) return [];
  for (const b of arr(ev.bookmakers)) {
    const bk = rec(b);
    const key = bk ? str(bk.key) : null;
    if (!bk || !key) continue;
    const title = str(bk.title) ?? key;
    for (const m of arr(bk.markets)) {
      const mk = rec(m);
      const market = mk ? MARKET_BY_ODDS.get(str(mk.key) ?? "") : undefined;
      if (!mk || !market) continue;
      // per player: the book's Over/Yes and Under/No prices, by line
      const perPlayer = new Map<string, { team: string | null; byLine: Map<string, { a: number | null; b: number | null; line: number | null }> }>();
      for (const o of arr(mk.outcomes)) {
        const oc = rec(o);
        if (!oc) continue;
        const player = str(oc.description);
        const name = (str(oc.name) ?? "").toLowerCase();
        const price = num(oc.price);
        if (!player || price == null || !validPrice(price)) continue;
        const line = market.kind === "ou" ? num(oc.point) : null;
        if (market.kind === "ou" && line == null) continue;
        const team = str(oc.team);
        const entry = perPlayer.get(player) ?? { team: null, byLine: new Map() };
        if (team && !entry.team) entry.team = team;
        const lk = line == null ? "" : String(line);
        const slot = entry.byLine.get(lk) ?? { a: null, b: null, line };
        if (name === "over" || name === "yes") slot.a = price;
        else if (name === "under" || name === "no") slot.b = price;
        entry.byLine.set(lk, slot);
        perPlayer.set(player, entry);
      }
      for (const [player, entry] of perPlayer) {
        const gk = `${market.id}|${playerSlug(player)}`;
        const g = groups.get(gk) ?? { market, player, team: null, reads: [] };
        if (entry.team && !g.team) g.team = entry.team;
        for (const slot of entry.byLine.values()) {
          if (slot.a == null) continue;
          let pOver: number;
          if (slot.b != null) {
            [pOver] = devigProportional([impliedFromAmerican(slot.a), impliedFromAmerican(slot.b)]);
          } else if (market.kind === "yes") {
            pOver = impliedFromAmerican(slot.a) / ATD_YES_ONLY_OVERROUND;
          } else continue; // an Over with no Under at the same line is not a pair
          if (!(pOver > 0 && pOver < 1)) continue;
          // one reading per book per line (a duplicated outcome keeps the first)
          if (g.reads.some((r) => r.book === key && sameLine(r.line, slot.line))) continue;
          g.reads.push({ book: key, title, line: slot.line, pOver, priceOver: slot.a, priceUnder: slot.b });
        }
        groups.set(gk, g);
      }
    }
  }
  return [...groups.values()];
}

/**
 * The true equal-weight median: the middle value, or the MEAN of the two middle values on an even
 * count. engine2's `weightedMedian` returns the lower-middle value on an even count; used on the
 * over-side probabilities that biases fair(over) low and fair(under) = 1 − fair(over) high on the
 * common 2- and 4-book slates, so the Under side would grade better than the Over side on the same
 * quotes. This estimator is symmetric: median(1 − reads) = 1 − median(reads).
 */
export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** median of the de-vigged over probabilities of the books posting exactly `line`; null under `minBooks` */
function fairAt(reads: BookRead[], line: number | null, minBooks: number): { p: number; n: number } | null {
  const at = reads.filter((r) => sameLine(r.line, line));
  if (at.length < minBooks) return null;
  return { p: median(at.map((r) => r.pOver)), n: at.length };
}

function quote(book: string, title: string, price: number, line: number | null): CfbPropQuote {
  return { book, title, price, line, dec: decFromAmerican(price) };
}

const SHORT: Record<CfbPropMarket, string> = {
  anytime_td: "Anytime TD",
  pass_tds: "Pass TDs",
  pass_yds: "Pass Yds",
  receptions: "Receptions",
  rush_yds: "Rush Yds",
  rec_yds: "Rec Yds",
};

/** "Ty Simpson O 245.5 Pass Yds" · "Ty Simpson U 1.5 Pass TDs" · "Ryan Williams Anytime TD" */
export function propLabel(player: string, market: CfbPropMarket, side: CfbPropSide, line: number | null): string {
  if (side === "yes") return `${player} ${SHORT[market]}`;
  return `${player} ${side === "over" ? "O" : "U"} ${line ?? "—"} ${SHORT[market]}`;
}

/**
 * Every priced prop row of one game from one per-event odds payload. Rows come out grouped by
 * player, over before under; a (market, player) with no de-vigged pair at any book yields nothing.
 */
export function parseEventProps(eventJson: unknown, game: CfbGame, opts: ParsePropsOpts): CfbPropRow[] {
  const P: LeagueProps = opts.props ?? CFB_PROPS;
  const R: LeagueRules = opts.rules ?? CFB_RULES;
  const ev = rec(eventJson);
  const oddsEventId = (ev && str(ev.id)) ?? game.oddsEventId ?? "";
  const kickoff = Date.parse(game.start);
  const upcoming = game.status === "upcoming" && Number.isFinite(kickoff) && kickoff > opts.now;
  const sub = `${game.away.abbr} @ ${game.home.abbr} · ${kickoffLabel(game.start)}`;
  const homeN = normTeam(game.home.name);
  const awayN = normTeam(game.away.name);
  const rows: CfbPropRow[] = [];

  for (const g of readEvent(eventJson)) {
    if (!g.reads.length) continue;
    // the row's line must be a line some book POSTED (a fair exists only there), so the line median
    // is engine2's lower-middle weightedMedian, never an average of two posted lines
    const line = g.market.kind === "ou" ? weightedMedian(g.reads.map((r) => r.line as number), g.reads.map(() => 1)) : null;
    const consensus = fairAt(g.reads, line, P.minBooks);
    const teamN = g.team ? normTeam(g.team) : null;
    // INSTRUCTION 46 (2026-09-08): the odds feed rarely names a prop's team; ESPN's season table
    // knows the player's teamId, and that id IS the slate's team id, so a row whose feed team is
    // missing (or unrecognised) resolves to the game side ESPN puts him on. Never a guess: a
    // teamId matching neither side leaves the team null and the row draws initials, not a logo.
    const found = opts.ctx?.player?.(g.player) ?? null;
    const byName = teamN === homeN ? game.home : teamN === awayN ? game.away : null;
    const espnId = found?.teamId == null ? null : String(found.teamId);
    const byEspn = espnId == null ? null : espnId === String(game.home.id) ? game.home : espnId === String(game.away.id) ? game.away : null;
    // INSTRUCTION 46 fix round (2026-09-08): the ESPN line is joined on NAME, so a same-named
    // player on a FOREIGN roster (teamId on neither side of this game) — or one ESPN puts on the
    // other side from the odds feed — is not this man. His headshot / position are dropped with
    // the team, so the row draws initials rather than the wrong face.
    const trusted = found != null && (espnId == null || byEspn != null) && (byName == null || byEspn == null || byName === byEspn);
    const meta = trusted ? found : null;
    const teamObj = byName ?? byEspn;
    const opp = teamObj ? (teamObj === game.home ? game.away.short : game.home.short) : null;
    const sides: CfbPropSide[] = g.market.kind === "yes" ? ["yes"] : ["over", "under"];

    for (const side of sides) {
      const pOf = (p: number) => (side === "under" ? 1 - p : p);
      const quotes: CfbPropQuote[] = [];
      for (const r of g.reads) {
        if (side === "under") {
          if (r.priceUnder == null) continue;
          quotes.push(quote(r.book, r.title, r.priceUnder, r.line));
        } else quotes.push(quote(r.book, r.title, r.priceOver, r.line));
      }
      const find = (k: string) => quotes.find((q) => q.book === k) ?? null;
      const cz = find(P.settleBook);
      let best: CfbPropQuote | null = null;
      for (const q of quotes) {
        if (!sameLine(q.line, line)) continue;
        if (!best || q.dec > best.dec) best = q;
      }
      const evAt = (q: CfbPropQuote | null): { ev: number; p: number } | null => {
        if (!q) return null;
        const f = fairAt(g.reads, q.line, P.minBooks);
        if (!f) return null;
        const p = pOf(f.p);
        return { ev: round(evPct(p, 0, q.dec), 2), p };
      };
      const czEv = evAt(cz);
      const bestEv = evAt(best);
      const playable = !!cz && upcoming;
      const fair = consensus ? pOf(consensus.p) : null;
      const clamped = fair == null ? null : Math.min(1 - 1e-6, Math.max(1e-6, fair));
      const kelly = playable && cz && czEv ? kellyStake(czEv.p, 0, cz.dec, opts.bankroll, R) : 0;
      rows.push({
        key: `${game.id}|${g.market.id}|${playerSlug(g.player)}|${side}|${line ?? ""}`,
        gameId: game.id,
        oddsEventId,
        market: g.market.id,
        side,
        player: g.player,
        team: teamObj?.name ?? g.team ?? null,
        teamId: teamObj?.id ?? null,
        teamAbbr: teamObj?.abbr ?? null,
        headshot: meta?.headshot ?? null,
        pos: meta?.pos ?? null,
        opp,
        kickoff: game.start,
        status: game.status,
        label: propLabel(g.player, g.market.id, side, line),
        sub,
        line,
        fair,
        fairAm: clamped == null ? null : americanFromProb(clamped),
        books: consensus?.n ?? 0,
        cz,
        best,
        dk: find("draftkings"),
        fd: find("fanduel"),
        evCz: czEv?.ev ?? null,
        evBest: bestEv?.ev ?? null,
        grade: gradeFromEv(czEv?.ev ?? null),
        kelly: playable ? kelly : null,
        playable,
        ctx: opts.ctx ? opts.ctx(g.market.id, g.player) : null,
      });
    }
  }
  return rows;
}

/**
 * Which games get a per-event props pull (INSTRUCTION 40, 2026-09-05: live games included).
 * A game qualifies when it is UPCOMING with its kickoff still ahead, or LIVE (in play) — never
 * final or postponed — AND it is matched to an odds event AND Caesars posts a price on at least
 * one side (no Caesars → nothing to settle at).
 *
 * Two pools (2026-09-05, same-day follow-up to INSTRUCTION 40, read on prod: with one sorted list
 * capped at `max`, nine in-play afternoon games filled the whole list and the twenty-plus evening
 * kickoffs got no props at all): the in-play games, at most `liveMax` of them (`liveMaxEvents`),
 * then the pre-kick games, at most `max` of them (`maxEvents`). Inside each pool the order is
 * kickoff, then ranked teams first (best rank of the two), then ESPN id. `capped` is true when
 * either pool overflowed. Rows from a live game keep status "live" (parseEventProps copies the
 * game's status), so the Board's LIVE / MIXED parlays keep working off the same feed.
 */
export function selectPropEvents(
  board: CfbBoard,
  now: number,
  max: number = CFB_PROPS.maxEvents,
  liveMax: number = CFB_PROPS.liveMaxEvents,
): { events: CfbGame[]; capped: boolean } {
  const bestRank = (g: CfbGame) => Math.min(g.home.rank ?? 99, g.away.rank ?? 99);
  const eligible = board.games.filter((g) => {
    if (!g.oddsEventId || !g.rows.some((r) => !!r.cz)) return false;
    if (g.status === "live") return true;
    const t = Date.parse(g.start);
    return g.status === "upcoming" && Number.isFinite(t) && t > now;
  });
  eligible.sort(
    (a, b) =>
      Date.parse(a.start) - Date.parse(b.start) ||
      bestRank(a) - bestRank(b) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const live = eligible.filter((g) => g.status === "live");
  const upcoming = eligible.filter((g) => g.status !== "live");
  const liveCap = Math.max(0, liveMax);
  const upCap = Math.max(0, max);
  return {
    events: [...live.slice(0, liveCap), ...upcoming.slice(0, upCap)],
    capped: live.length > liveCap || upcoming.length > upCap,
  };
}

/**
 * THE CAESARS-MISSING RULE'S TEST, keyed on the MARKET (2026-09-05 review fix): the ids of the games
 * that have rows AND at least one market with rows on that game whose rows carry NO Caesars quote —
 * so a game with Caesars yardage props but no Caesars anytime TD yet is missing, and a game with zero
 * rows never is (it has no market to be missing on). One helper feeds `czMissingDue` (the re-check)
 * and `propsCoverage` (the count), so the two can never disagree.
 */
export function czMissingGameIds(rows: readonly Pick<CfbPropRow, "gameId" | "market" | "cz">[]): Set<string> {
  // gameId → market → has a Caesars quote on any row
  const seen = new Map<string, Map<string, boolean>>();
  for (const r of rows) {
    const m = seen.get(r.gameId) ?? new Map<string, boolean>();
    m.set(r.market, (m.get(r.market) ?? false) || !!r.cz);
    seen.set(r.gameId, m);
  }
  const out = new Set<string>();
  for (const [gameId, markets] of seen) for (const hasCz of markets.values()) if (!hasCz) out.add(gameId);
  return out;
}

/**
 * What the answer does NOT carry, honestly counted (2026-09-05, THE CAESARS-MISSING RULE) — over the
 * PRICED games only (`pricedIds`: fetched this pull or carried from the store), never over games the
 * budget refused, which are simply unpriced:
 *   czMissing — upcoming games with rows where some market with rows has no Caesars quote on any of
 *               them (`czMissingGameIds`: other books posted, Caesars not yet — on that market)
 *   noProps   — games with zero rows (no two-sided quote on a tracked market at the books we price)
 */
export function propsCoverage(
  events: readonly Pick<CfbGame, "id" | "status">[],
  rows: readonly Pick<CfbPropRow, "gameId" | "market" | "cz">[],
  pricedIds: Iterable<string>,
): { czMissing: number; noProps: number } {
  const total = new Map<string, number>();
  for (const r of rows) total.set(r.gameId, (total.get(r.gameId) ?? 0) + 1);
  const missing = czMissingGameIds(rows);
  const priced = new Set(pricedIds);
  let czMissing = 0;
  let noProps = 0;
  for (const g of events) {
    if (!priced.has(g.id)) continue;
    if ((total.get(g.id) ?? 0) === 0) noProps++;
    else if (g.status === "upcoming" && missing.has(g.id)) czMissing++;
  }
  return { czMissing, noProps };
}

/** true when any of the priced events is in play */
export function hasLiveEvent(events: readonly Pick<CfbGame, "status">[]): boolean {
  return events.some((g) => g.status === "live");
}

/**
 * The cache window (seconds) a props board built from `events` may be held for: the 2 h
 * `revalidateSec` for a pre-kick set, the 10 min `liveRevalidateSec` once any priced event is in
 * play (in-game lines move). One helper feeds the Redis EX, the stored board's staleness check
 * and each event call's data-cache revalidate, so the three can never disagree. `props` is the
 * league's knobs (CFB_PROPS by default; the server body passes the league's own).
 */
export function propsWindowSec(events: readonly Pick<CfbGame, "status">[], props: Pick<LeagueProps, "revalidateSec" | "liveRevalidateSec"> = CFB_PROPS): number {
  return hasLiveEvent(events) ? props.liveRevalidateSec : props.revalidateSec;
}
