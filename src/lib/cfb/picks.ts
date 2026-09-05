import { decToAm } from "@/lib/ticket-math";
import { gradeRank } from "@/lib/grade";
import { CFB_PARLAYS } from "@/lib/cfb/rules";
import { kellyStake, rowProbAt } from "@/lib/cfb/model";
import type { CfbBoard, CfbGame, CfbRow } from "@/lib/cfb/types";
import type { CfbParlay, CfbParlayLeg, CfbParlayTier, CfbParlayView, CfbPickRow, CfbPicks, CfbPropRow } from "@/lib/cfb/props-types";

/**
 * THE CFB PICKS + PARLAYS ENGINE (2026-09-05, Josh: "what should be on the 'Board' tab is all
 * of the prop parlay options like MLB has with live, mixed, safe. Longshots, etc").
 * `buildCfbPicks` is pure: a priced board (sides) plus the props board (player rows, null
 * while they load) → ranked pick categories and three parlay views. Every number comes from
 * the rows handed in — a leg's price is Caesars' posted price, its probability the model's
 * own figure at Caesars' line — nothing here is estimated in the feed's place.
 *
 * Categories — "all" (every playable side and prop with a Caesars price), "ml" / "spread" /
 * "total" (sides), one per prop market — each ranked S → F on the EV at Caesars, then EV,
 * then probability. A row only ever lands under its own market key.
 *
 * Parlay rules (CFB_PARLAYS), the same for every ticket:
 *   · legs are Caesars-priced rows with EV ≥ minLegEvPct (grade D or better, never an F);
 *   · cross-game: at most maxPerGame legs on one game, never two legs on the same market of
 *     one game (no Over + Under, no both moneylines), never two legs on the same player;
 *   · prob = Π leg no-push probabilities, dec = Π Caesars decimals, ev = 100·(prob·dec − 1);
 *   · every ticket in a view is a distinct leg set; up to perView per tier per view.
 *
 *   view "parlays" — upcoming games only:
 *     SAFER     2–3 side or prop legs, each ≥ safer.minLegProb to hit, dec ≤ safer.maxDec; every
 *               qualifying combination, ranked by combined probability.
 *     LONGSHOT  4–6 legs from sides + props, built likeliest-first (each candidate starts on
 *               a different leg and adds the next-likeliest legs that fit until the price
 *               clears longshot.minDec, never past longshot.maxDec), ranked by EV.
 *     MIX       3–5 legs seeded with one side + one prop, filled likeliest-first inside the
 *               mix price band, ranked by EV.
 *   view "mixed" — every ticket pairs at least one leg from a game in progress with at least
 *     one from an upcoming game (mix band); empty when nothing is live.
 *   view "live" — only legs from games in progress (in-play prices), 2–5 legs in the mix
 *     price band; empty when nothing is live.
 *   In the mixed and live views the tier is read off the finished ticket (SAFER when every
 *   leg ≥ safer.minLegProb and dec ≤ safer.maxDec; LONGSHOT at dec ≥ longshot.minDec; else MIX).
 */

export const CFB_PROP_CATEGORIES = ["anytime_td", "pass_tds", "pass_yds", "receptions", "rush_yds", "rec_yds"] as const;
export const CFB_PICK_CATEGORIES = ["all", "ml", "spread", "total", ...CFB_PROP_CATEGORIES] as const;

type Leg = CfbParlayLeg & { evCz: number; live: boolean };
type Draft = { legs: Leg[]; dec: number; prob: number; ev: number; key: string };
type Band = { legs: { min: number; max: number }; minDec: number; maxDec: number };

const round = (v: number, dp: number) => {
  const k = 10 ** dp;
  return Math.round(v * k) / k;
};
const playerKey = (p: string | null | undefined) => (p ?? "").trim().toLowerCase();

/* ---------- rows → pick rows ---------- */

function sidePick(row: CfbRow, game: CfbGame): CfbPickRow {
  return {
    kind: "side",
    key: row.key,
    gameId: row.gameId,
    market: row.market,
    label: row.label,
    sub: row.sub,
    line: row.line,
    fair: row.fair,
    fairAm: row.fairAm,
    cz: row.cz,
    best: row.best,
    evCz: row.evCz,
    evBest: row.evBest,
    grade: row.grade,
    kelly: row.playable ? row.kelly : null,
    playable: row.playable,
    status: game.status,
    prob: row.fair,
    push: row.push,
  };
}

function propPick(row: CfbPropRow, bankroll: number): CfbPickRow {
  const kelly =
    row.kelly != null ? row.kelly : row.playable && row.fair != null && row.cz ? kellyStake(row.fair, 0, row.cz.dec, bankroll) : null;
  return {
    kind: "prop",
    key: row.key,
    gameId: row.gameId,
    market: row.market,
    label: row.label,
    sub: row.sub,
    line: row.line,
    fair: row.fair,
    fairAm: row.fairAm,
    cz: row.cz,
    best: row.best,
    evCz: row.evCz,
    evBest: row.evBest,
    grade: row.grade,
    kelly,
    playable: row.playable,
    status: row.status,
    prob: row.fair,
    push: 0,
  };
}

/** S → F on the EV at Caesars, then EV, then probability, then key (total order — deterministic). */
export function rankPicks(rows: CfbPickRow[]): CfbPickRow[] {
  return [...rows].sort((a, b) => {
    const g = gradeRank(b.grade) - gradeRank(a.grade);
    if (g !== 0) return g;
    // compare, never subtract: (-Infinity) - (-Infinity) is NaN, which sort reads as "equal" and
    // would skip the prob / key tiebreaks for two null-EV rows
    const ea = a.evCz ?? -Infinity;
    const eb = b.evCz ?? -Infinity;
    if (ea !== eb) return eb > ea ? 1 : -1;
    const p = (b.prob ?? -1) - (a.prob ?? -1);
    if (p !== 0) return p;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}

/* ---------- rows → legs ---------- */

function sideLeg(row: CfbRow, game: CfbGame, live: boolean): Leg | null {
  if (!row.cz || row.evCz == null || row.evCz < CFB_PARLAYS.minLegEvPct) return null;
  const line = row.market === "ml" ? null : row.cz.line;
  const p = rowProbAt(game.model, row.market, row.side, line) ?? { win: row.fair, push: row.push };
  const prob = p.win / Math.max(1e-9, 1 - p.push);
  if (!(prob > 0) || !(prob < 1)) return null;
  return {
    kind: "side",
    rowKey: row.key,
    gameId: row.gameId,
    label: row.label,
    sub: row.sub,
    cz: row.cz.price,
    dec: row.cz.dec,
    prob,
    push: p.push,
    market: row.market,
    player: null,
    teamId: row.teamId,
    evCz: row.evCz,
    live,
  };
}

function propLeg(row: CfbPropRow, live: boolean): Leg | null {
  if (!row.cz || row.fair == null || row.evCz == null || row.evCz < CFB_PARLAYS.minLegEvPct) return null;
  if (!(row.fair > 0) || !(row.fair < 1)) return null;
  return {
    kind: "prop",
    rowKey: row.key,
    gameId: row.gameId,
    label: row.label,
    sub: row.sub,
    cz: row.cz.price,
    dec: row.cz.dec,
    prob: row.fair,
    push: 0,
    market: row.market,
    player: row.player,
    teamId: row.teamId,
    evCz: row.evCz,
    live,
  };
}

/** likeliest first; ties by EV, then key — a total order so the output never depends on input order */
const byProb = (a: Leg, b: Leg) => b.prob - a.prob || b.evCz - a.evCz || (a.rowKey < b.rowKey ? -1 : a.rowKey > b.rowKey ? 1 : 0);
const draftByEv = (a: Draft, b: Draft) => b.ev - a.ev || b.prob - a.prob || (a.key < b.key ? -1 : 1);
const draftByProb = (a: Draft, b: Draft) => b.prob - a.prob || b.ev - a.ev || (a.key < b.key ? -1 : 1);

/** The cross-game rules: per-game cap, one leg per market per game, one leg per player. */
export function legFits(leg: Leg, legs: Leg[]): boolean {
  let perGame = 0;
  for (const l of legs) {
    if (l.rowKey === leg.rowKey) return false;
    if (l.gameId === leg.gameId) {
      perGame++;
      if (l.kind === "side" && leg.kind === "side" && l.market === leg.market) return false;
    }
    if (leg.player && l.player && playerKey(l.player) === playerKey(leg.player)) return false;
  }
  return perGame < CFB_PARLAYS.maxPerGame;
}

function draftOf(legs: Leg[]): Draft {
  let dec = 1;
  let prob = 1;
  for (const l of legs) {
    dec *= l.dec;
    prob *= l.prob;
  }
  const key = legs
    .map((l) => l.rowKey)
    .sort()
    .join("+");
  return { legs, dec, prob, ev: 100 * (prob * dec - 1), key };
}

const inBand = (d: Draft, band: Band) => d.legs.length >= band.legs.min && d.legs.length <= band.legs.max && d.dec >= band.minDec && d.dec <= band.maxDec;

/** Seeded greedy fill: from the seed legs, add the next-likeliest legs that fit until the
    ticket has the minimum legs AND clears minDec; never past maxDec or the leg cap. */
function fill(seed: Leg[], pool: Leg[], band: Band): Draft | null {
  const legs = [...seed];
  let dec = legs.reduce((d, l) => d * l.dec, 1);
  for (const leg of pool) {
    if (legs.length >= band.legs.max) break;
    if (legs.length >= band.legs.min && dec >= band.minDec) break;
    if (!legFits(leg, legs)) continue;
    if (dec * leg.dec > band.maxDec) continue;
    legs.push(leg);
    dec *= leg.dec;
  }
  const d = draftOf(legs);
  return inBand(d, band) ? d : null;
}

/** every 2..max-leg combination of the pool that respects the rules and the price cap */
function combos(pool: Leg[], maxLegs: number, maxDec: number): Draft[] {
  const out: Draft[] = [];
  const walk = (start: number, legs: Leg[], dec: number) => {
    for (let i = start; i < pool.length; i++) {
      const leg = pool[i];
      if (!legFits(leg, legs) || dec * leg.dec > maxDec) continue;
      const next = [...legs, leg];
      if (next.length >= 2) out.push(draftOf(next));
      if (next.length < maxLegs) walk(i + 1, next, dec * leg.dec);
    }
  };
  walk(0, [], 1);
  return out;
}

/** distinct leg sets, in order, capped */
function distinct(drafts: Draft[], cap: number): Draft[] {
  const seen = new Set<string>();
  const out: Draft[] = [];
  for (const d of drafts) {
    if (seen.has(d.key)) continue;
    seen.add(d.key);
    out.push(d);
    if (out.length >= cap) break;
  }
  return out;
}

function typeOf(legs: Leg[]): string {
  const sides = legs.some((l) => l.kind === "side");
  const props = legs.some((l) => l.kind === "prop");
  return sides && props ? "MIXED" : props ? "PROPS" : "SIDES";
}

function tierOf(d: Draft): CfbParlayTier {
  const R = CFB_PARLAYS;
  if (d.dec <= R.safer.maxDec && d.legs.every((l) => l.prob >= R.safer.minLegProb)) return "SAFER";
  if (d.dec >= R.longshot.minDec) return "LONGSHOT";
  return "MIX";
}

function finish(d: Draft, view: CfbParlayView, tier: CfbParlayTier, name: string, id: string): CfbParlay {
  return {
    id,
    view,
    tier,
    type: view === "live" ? "LIVE" : typeOf(d.legs),
    name,
    legs: d.legs.map(({ evCz: _e, live: _l, ...leg }) => leg),
    dec: round(d.dec, 4),
    am: decToAm(round(d.dec, 4)), // from the rounded dec the card shows, so am and dec agree on the half-cent edge
    prob: d.prob,
    ev: round(d.ev, 2),
  };
}

const SAFER_POOL = 12;
const SEED_POOL = 24;
const MIX_SEEDS = 8;

/* ---------- the builder ---------- */

export function buildCfbPicks(board: CfbBoard, props: CfbPropRow[] | null, opts: { now: number; bankroll: number }): CfbPicks {
  const R = CFB_PARLAYS;
  const games = new Map(board.games.map((g) => [g.id, g]));

  /* ----- categories ----- */
  const categories: Record<string, CfbPickRow[]> = {};
  for (const k of CFB_PICK_CATEGORIES) categories[k] = [];
  const kickedOff = (start: string) => !(Date.parse(start) > opts.now);
  for (const g of board.games) {
    if (g.status !== "upcoming" || kickedOff(g.start)) continue;
    for (const r of g.rows) {
      if (!r.playable || !r.cz) continue;
      const pick = sidePick(r, g);
      categories.all.push(pick);
      categories[r.market].push(pick);
    }
  }
  for (const r of props ?? []) {
    const g = games.get(r.gameId);
    if ((g ?? r).status !== "upcoming" || kickedOff(g?.start ?? r.kickoff)) continue;
    if (!r.playable || !r.cz || !(r.market in categories)) continue;
    const pick = propPick(r, opts.bankroll);
    categories.all.push(pick);
    categories[r.market].push(pick);
  }
  for (const k of Object.keys(categories)) categories[k] = rankPicks(categories[k]);

  /* ----- legs ----- */
  const upcomingSides: Leg[] = [];
  const liveSides: Leg[] = [];
  for (const g of board.games) {
    const kicked = kickedOff(g.start);
    const isLive = g.status === "live";
    const isUpcoming = g.status === "upcoming" && !kicked;
    if (!isLive && !isUpcoming) continue;
    for (const r of g.rows) {
      const leg = sideLeg(r, g, isLive);
      if (!leg) continue;
      (isLive ? liveSides : upcomingSides).push(leg);
    }
  }
  const upcomingProps: Leg[] = [];
  const liveProps: Leg[] = [];
  for (const r of props ?? []) {
    const g = games.get(r.gameId);
    const status = g?.status ?? r.status;
    const kicked = kickedOff(g?.start ?? r.kickoff);
    const isLive = status === "live";
    const isUpcoming = status === "upcoming" && !kicked;
    if (!isLive && !isUpcoming) continue;
    const leg = propLeg(r, isLive);
    if (!leg) continue;
    (isLive ? liveProps : upcomingProps).push(leg);
  }
  upcomingSides.sort(byProb);
  upcomingProps.sort(byProb);
  const upcoming = [...upcomingSides, ...upcomingProps].sort(byProb);
  const live = [...liveSides, ...liveProps].sort(byProb);

  /* ----- view "parlays" ----- */
  const parlays: CfbParlay[] = [];
  let n = 0;
  const push = (drafts: Draft[], tier: CfbParlayTier, view: CfbParlayView, list: CfbParlay[], name?: (d: Draft) => string) => {
    for (const d of drafts) {
      n++;
      const legs = `${d.legs.length} legs`;
      list.push(finish(d, view, tier, name ? name(d) : `${tier} · ${legs}`, `cfb-${board.date}-${view}-${n}`));
    }
  };

  // SAFER — sides AND props (2026-09-05: Caesars posts no moneyline on the big favourites, so a
  // sides-only pool was empty on the opening slate; the likeliest anytime-TD favourites qualify),
  // likeliest legs, every qualifying pair / triple, by combined probability
  const saferPool = upcoming.filter((l) => l.prob >= R.safer.minLegProb).slice(0, SAFER_POOL);
  const safer = distinct(combos(saferPool, R.safer.legs.max, R.safer.maxDec).filter((d) => d.legs.length >= R.safer.legs.min).sort(draftByProb), R.perView);
  push(safer, "SAFER", "parlays", parlays);

  // LONGSHOT — sides + props, each candidate starts on a different leg, filled likeliest-first, by EV
  const longshotSeeds = upcoming.slice(0, SEED_POOL);
  const longshot = distinct(
    longshotSeeds.map((seed) => fill([seed], upcoming, R.longshot)).filter((d): d is Draft => d != null).sort(draftByEv),
    R.perView,
  );
  push(longshot, "LONGSHOT", "parlays", parlays);

  // MIX — one side + one prop seeded, filled likeliest-first inside the mix band, by EV
  const mixDrafts: Draft[] = [];
  for (const s of upcomingSides.slice(0, MIX_SEEDS)) {
    for (const p of upcomingProps.slice(0, MIX_SEEDS)) {
      if (!legFits(p, [s]) || s.dec * p.dec > R.mix.maxDec) continue;
      const d = fill([s, p], upcoming, R.mix);
      if (d) mixDrafts.push(d);
    }
  }
  push(distinct(mixDrafts.sort(draftByEv), R.perView), "MIX", "parlays", parlays);

  /* ----- view "mixed": a live leg beside an upcoming one ----- */
  const mixed: CfbParlay[] = [];
  n = 0;
  if (live.length > 0 && upcoming.length > 0) {
    const drafts: Draft[] = [];
    const both = [...live, ...upcoming].sort(byProb);
    for (const l of live.slice(0, MIX_SEEDS)) {
      for (const u of upcoming.slice(0, MIX_SEEDS)) {
        if (!legFits(u, [l]) || l.dec * u.dec > R.mix.maxDec) continue;
        const d = fill([l, u], both, R.mix);
        if (d) drafts.push(d);
      }
    }
    const chosen = distinct(drafts.sort(draftByEv), R.perView);
    for (const d of chosen) {
      n++;
      mixed.push(finish(d, "mixed", tierOf(d), `MIXED · ${d.legs.length} legs`, `cfb-${board.date}-mixed-${n}`));
    }
  }

  /* ----- view "live": in-play legs only ----- */
  const liveOut: CfbParlay[] = [];
  n = 0;
  if (live.length > 0) {
    const band: Band = { legs: { min: 2, max: R.mix.legs.max }, minDec: R.mix.minDec, maxDec: R.mix.maxDec };
    const drafts = live
      .slice(0, SEED_POOL)
      .map((seed) => fill([seed], live, band))
      .filter((d): d is Draft => d != null);
    const chosen = distinct(drafts.sort(draftByEv), R.perView);
    for (const d of chosen) {
      n++;
      liveOut.push(finish(d, "live", tierOf(d), `LIVE · ${d.legs.length} legs`, `cfb-${board.date}-live-${n}`));
    }
  }

  return {
    date: board.date,
    generatedAt: new Date(opts.now).toISOString(),
    parlays,
    mixed,
    live: liveOut,
    categories,
  };
}
