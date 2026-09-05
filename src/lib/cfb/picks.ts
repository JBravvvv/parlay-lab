import { decToAm } from "@/lib/ticket-math";
import { gradeRank } from "@/lib/grade";
import { CFB_PARLAYS } from "@/lib/cfb/rules";
import { kellyStake, rowProbAt } from "@/lib/cfb/model";
import type { CfbBoard, CfbGame, CfbRow } from "@/lib/cfb/types";
import { CFB_PARLAY_CATEGORIES } from "@/lib/cfb/props-types";
import type { CfbParlay, CfbParlayCategory, CfbParlayLeg, CfbParlayTier, CfbParlayView, CfbPickRow, CfbPicks, CfbPropRow } from "@/lib/cfb/props-types";

/**
 * THE CFB PICKS + PARLAYS ENGINE (2026-09-05, Josh: "what should be on the 'Board' tab is all
 * of the prop parlay options like MLB has with live, mixed, safe. Longshots, etc").
 * `buildCfbPicks` is pure: a priced board (sides) plus the props board (player rows, null
 * while they load) → ranked pick categories, the legacy tiered view and twelve category sets.
 * Every number comes from the rows handed in — a leg's price is Caesars' posted price, its
 * probability the model's own figure at Caesars' line — nothing here is estimated in the
 * feed's place.
 *
 * Categories — "all" (every side and prop with a Caesars price), "ml" / "spread" / "total"
 * (sides), one per prop market — each ranked S → F on the EV at Caesars, then EV, then
 * probability. A row only ever lands under its own market key.
 *
 *   INSTRUCTION 42 (2026-09-05, Josh, verbatim): "Its only showing ANYTIME TD picks for 3 games
 *   under 'ALL' button on 'Board'. There are a ton of games live and a ton of games the rest of
 *   the day. It should be grading every possible pick available on the board that falls under
 *   those props and displaying them." — the categories now admit LIVE rows too: sides from
 *   games in progress and props whose game is in progress (status adopted from the slate game
 *   when it is known), graded exactly like upcoming rows on the EV at Caesars, with kelly null
 *   and playable false (in-play lines are not the desk's paper stakes). A Caesars price is still
 *   required. Upcoming rows are unchanged; final / postponed games never appear; a game whose
 *   status still reads "upcoming" after its kickoff instant is skipped as before.
 *
 * Parlay rules (CFB_PARLAYS), the same for every ticket:
 *   · legs are Caesars-priced rows with EV ≥ minLegEvPct (grade D or better, never an F);
 *   · cross-game: at most maxPerGame legs on one game (ONE per game in the single-market sets),
 *     never two legs on the same market of one game (no Over + Under, no both moneylines),
 *     never two legs on the same player;
 *   · prob = Π leg no-push probabilities, dec = Π Caesars decimals, ev = 100·(prob·dec − 1);
 *   · every ticket in a view or set is a distinct leg set.
 *
 *   view "parlays" (legacy tiers, perView per tier) — upcoming games only:
 *     SAFER     2–3 side or prop legs, each ≥ safer.minLegProb to hit, dec ≤ safer.maxDec; every
 *               qualifying combination, ranked by combined probability.
 *     LONGSHOT  4–6 legs from sides + props, built likeliest-first (each candidate starts on
 *               a different leg and adds the next-likeliest legs that fit until the price
 *               clears longshot.minDec, never past longshot.maxDec), ranked by EV.
 *     MIX       3–5 legs seeded with one side + one prop, filled likeliest-first inside the
 *               mix price band, ranked by EV.
 *
 *   sets (INSTRUCTION 42: "There should be 50 parlay options under each category (ML, spread,
 *   Anytime TD, Pass TD, Pass Yards, Receiving Yards, Combos, etc) The live parlay section and
 *   combo section (that has live & pregame picks on the same ticket) should still be generating
 *   picks as well") — up to perCategory (50) distinct tickets per key of CFB_PARLAY_CATEGORIES,
 *   ranked by EV then probability (the fifty are chosen round-robin across leg counts so a slate
 *   of +EV legs does not fill the set with six-leggers), tier read off the finished ticket (tierOf):
 *     "ml" / "spread" / "total" / each prop market — pregame legs ALL from that one market,
 *               2–6 legs on distinct games, dec 1.5–60. Built from every seed leg (likeliest
 *               first) at every leg count 2..6 three ways — filled likeliest-first, filled with
 *               the legs that follow the seed, filled highest-EV-first — then deduped, so the
 *               set carries a spread of leg counts rather than fifty near-identical six-leggers.
 *     "combo"   pregame, at least one side AND one prop, 3–6 legs, dec 2–60.
 *     "mixed"   at least one live leg and one pregame leg, 2–6 legs, dec 1.5–60; empty when
 *               nothing is live.
 *     "live"    live legs only (in-play prices), 2–6 legs, dec 1.5–60; empty when nothing is live.
 *   `picks.mixed` and `picks.live` are the same tickets as sets.mixed / sets.live.
 *
 *   Work is capped (seeds per set, seed pairs per axis) so a 68-game slate with ~3,000 prop
 *   rows builds in well under a second in the browser; ordering is total and deterministic.
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

function sidePick(row: CfbRow, game: CfbGame, live: boolean): CfbPickRow {
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
    kelly: live ? null : row.playable ? row.kelly : null,
    playable: live ? false : row.playable,
    status: live ? "live" : game.status,
    prob: row.fair,
    push: row.push,
  };
}

function propPick(row: CfbPropRow, bankroll: number, live: boolean): CfbPickRow {
  const kelly = live
    ? null
    : row.kelly != null
      ? row.kelly
      : row.playable && row.fair != null && row.cz
        ? kellyStake(row.fair, 0, row.cz.dec, bankroll)
        : null;
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
    playable: live ? false : row.playable,
    status: live ? "live" : row.status,
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

const keyCmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** likeliest first; ties by EV, then key — a total order so the output never depends on input order */
const byProb = (a: Leg, b: Leg) => b.prob - a.prob || b.evCz - a.evCz || keyCmp(a.rowKey, b.rowKey);
/** highest EV first; ties by probability, then key */
const byEv = (a: Leg, b: Leg) => b.evCz - a.evCz || b.prob - a.prob || keyCmp(a.rowKey, b.rowKey);
const draftByEv = (a: Draft, b: Draft) => b.ev - a.ev || b.prob - a.prob || keyCmp(a.key, b.key);
const draftByProb = (a: Draft, b: Draft) => b.prob - a.prob || b.ev - a.ev || keyCmp(a.key, b.key);

/** The cross-game rules: per-game cap, one leg per market per game, one leg per player.
    INSTRUCTION 42 (2026-09-05, review fix): the one-market-per-game rule applies to PROP legs too —
    two players' anytime TDs (or two pass-TD overs) from the same game used to share a combo /
    mixed / live ticket because the check was gated on both legs being sides. */
export function legFits(leg: Leg, legs: Leg[], maxPerGame: number = CFB_PARLAYS.maxPerGame): boolean {
  let perGame = 0;
  for (const l of legs) {
    if (l.rowKey === leg.rowKey) return false;
    if (l.gameId === leg.gameId) {
      perGame++;
      if (l.market === leg.market) return false;
    }
    if (leg.player && l.player && playerKey(l.player) === playerKey(leg.player)) return false;
  }
  return perGame < maxPerGame;
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

/** Fill to EXACTLY `n` legs from `pool[from..]` in pool order, skipping legs that break the
    rules or price the ticket past maxDec; null when the pool runs dry first. */
function fillTo(seed: Leg[], pool: Leg[], n: number, maxDec: number, maxPerGame: number, from = 0): Leg[] | null {
  if (seed.length > n) return null;
  const legs = [...seed];
  let dec = legs.reduce((d, l) => d * l.dec, 1);
  for (let i = from; i < pool.length && legs.length < n; i++) {
    const leg = pool[i];
    if (!legFits(leg, legs, maxPerGame)) continue;
    if (dec * leg.dec > maxDec) continue;
    legs.push(leg);
    dec *= leg.dec;
  }
  return legs.length === n ? legs : null;
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

/** INSTRUCTION 42's "spread of leg counts": dedupe, bucket the drafts by leg count (each bucket
    keeps the incoming EV order), take one from every bucket in turn until `cap`, then rank the
    chosen tickets by EV then probability. Without the round-robin a slate of +EV legs would
    fill all fifty slots with six-leggers, since every extra +EV leg raises the ticket's EV. */
function spread(drafts: Draft[], cap: number): Draft[] {
  const seen = new Set<string>();
  const buckets = new Map<number, Draft[]>();
  for (const d of drafts) {
    if (seen.has(d.key)) continue;
    seen.add(d.key);
    const b = buckets.get(d.legs.length);
    if (b) b.push(d);
    else buckets.set(d.legs.length, [d]);
  }
  const counts = [...buckets.keys()].sort((a, b) => a - b);
  const out: Draft[] = [];
  for (let i = 0; out.length < cap; i++) {
    let any = false;
    for (const c of counts) {
      const b = buckets.get(c)!;
      if (i >= b.length) continue;
      out.push(b[i]);
      any = true;
      if (out.length >= cap) break;
    }
    if (!any) break;
  }
  return out.sort(draftByEv);
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

const isCategory = (m: string): m is CfbParlayCategory => (CFB_PARLAY_CATEGORIES as readonly string[]).includes(m);

/** The category a legacy tiered ticket reads as from its legs: live + pregame → mixed; all live
    → live; one market throughout → that market; anything else (side + prop, or several side
    markets) → combo. */
function categoryOf(legs: Leg[]): CfbParlayCategory {
  const live = legs.some((l) => l.live);
  const pregame = legs.some((l) => !l.live);
  if (live && pregame) return "mixed";
  if (live) return "live";
  const m = legs[0]?.market ?? "";
  if (legs.every((l) => l.market === m) && isCategory(m)) return m;
  return "combo";
}

function finish(d: Draft, view: CfbParlayView, tier: CfbParlayTier, category: CfbParlayCategory, name: string, id: string): CfbParlay {
  return {
    id,
    view,
    tier,
    category,
    type: view === "live" ? "LIVE" : typeOf(d.legs),
    name,
    // `live` stays on the leg (INSTRUCTION 42 review fix) so a MIXED ticket can tag its in-play leg
    legs: d.legs.map(({ evCz: _e, ...leg }) => leg),
    dec: round(d.dec, 4),
    am: decToAm(round(d.dec, 4)), // from the rounded dec the card shows, so am and dec agree on the half-cent edge
    prob: d.prob,
    ev: round(d.ev, 2),
  };
}

const SAFER_POOL = 12;
const SEED_POOL = 24;
const MIX_SEEDS = 8;

/* ---------- INSTRUCTION 42 category sets ---------- */

/** leg-count range every set shares */
const SET_LEGS = { min: 2, max: 6 } as const;
/** single-market, mixed and live sets: any price from a modest two-leg favourite to a 60/1 shot */
const SET_BAND: Band = { legs: SET_LEGS, minDec: 1.5, maxDec: 60 };
/** combo: the legacy mix band widened (3–6 legs, dec 2–60) */
const COMBO_BAND: Band = { legs: { min: 3, max: SET_LEGS.max }, minDec: 2, maxDec: 60 };
/** seed legs per single-seed set (each seed × leg counts 2..6 × three fill orders) */
const SET_SEEDS = 60;
/** seed legs per axis of a paired set (side × prop, live × pregame) */
const PAIR_SEEDS = 12;
const SET_LABEL: Record<CfbParlayCategory, string> = {
  ml: "ML",
  spread: "SPREAD",
  total: "TOTAL",
  anytime_td: "ANYTIME TD",
  pass_tds: "PASS TDS",
  pass_yds: "PASS YDS",
  receptions: "RECEPTIONS",
  rush_yds: "RUSH YDS",
  rec_yds: "REC YDS",
  combo: "COMBO",
  mixed: "MIXED",
  live: "LIVE",
};

const pushDraft = (out: Draft[], legs: Leg[] | null, band: Band) => {
  if (!legs) return;
  const d = draftOf(legs);
  if (inBand(d, band)) out.push(d);
};

/** Single-seed sets: every seed (likeliest first, capped) at every leg count, filled three
    ways — likeliest-first, forward from the seed's own position, highest-EV-first. */
function seededSet(byP: Leg[], band: Band, maxPerGame: number): Draft[] {
  const out: Draft[] = [];
  if (byP.length < band.legs.min) return out;
  const byE = [...byP].sort(byEv);
  const seeds = Math.min(byP.length, SET_SEEDS);
  for (let i = 0; i < seeds; i++) {
    const seed = [byP[i]];
    for (let n = band.legs.min; n <= band.legs.max; n++) {
      pushDraft(out, fillTo(seed, byP, n, band.maxDec, maxPerGame, 0), band);
      pushDraft(out, fillTo(seed, byP, n, band.maxDec, maxPerGame, i + 1), band);
      pushDraft(out, fillTo(seed, byE, n, band.maxDec, maxPerGame, 0), band);
    }
  }
  return out;
}

/** Paired sets: one leg from each axis seeds the ticket (so the set's defining pair is on every
    ticket), then every leg count is filled likeliest-first and highest-EV-first from `pool`. */
function pairedSet(a: Leg[], b: Leg[], pool: Leg[], band: Band, maxPerGame: number): Draft[] {
  const out: Draft[] = [];
  if (a.length === 0 || b.length === 0) return out;
  const byE = [...pool].sort(byEv);
  for (const x of a.slice(0, PAIR_SEEDS)) {
    for (const y of b.slice(0, PAIR_SEEDS)) {
      if (!legFits(y, [x], maxPerGame) || x.dec * y.dec > band.maxDec) continue;
      const seed = [x, y];
      for (let n = Math.max(2, band.legs.min); n <= band.legs.max; n++) {
        pushDraft(out, fillTo(seed, pool, n, band.maxDec, maxPerGame, 0), band);
        pushDraft(out, fillTo(seed, byE, n, band.maxDec, maxPerGame, 0), band);
      }
    }
  }
  return out;
}

/* ---------- the builder ---------- */

export function buildCfbPicks(board: CfbBoard, props: CfbPropRow[] | null, opts: { now: number; bankroll: number }): CfbPicks {
  const R = CFB_PARLAYS;
  const games = new Map(board.games.map((g) => [g.id, g]));
  const kickedOff = (start: string) => !(Date.parse(start) > opts.now);

  /* ----- categories (upcoming AND live rows — INSTRUCTION 42) ----- */
  const categories: Record<string, CfbPickRow[]> = {};
  for (const k of CFB_PICK_CATEGORIES) categories[k] = [];
  let liveRows = 0;
  for (const g of board.games) {
    const isLive = g.status === "live";
    const isUpcoming = g.status === "upcoming" && !kickedOff(g.start);
    if (!isLive && !isUpcoming) continue;
    for (const r of g.rows) {
      if (!r.cz) continue;
      if (!isLive && !r.playable) continue;
      const pick = sidePick(r, g, isLive);
      if (isLive) liveRows++;
      categories.all.push(pick);
      categories[r.market].push(pick);
    }
  }
  for (const r of props ?? []) {
    const g = games.get(r.gameId);
    const status = g?.status ?? r.status;
    const isLive = status === "live";
    const isUpcoming = status === "upcoming" && !kickedOff(g?.start ?? r.kickoff);
    if (!isLive && !isUpcoming) continue;
    if (!r.cz || !(r.market in categories)) continue;
    if (!isLive && !r.playable) continue;
    const pick = propPick(r, opts.bankroll, isLive);
    if (isLive) liveRows++;
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

  /* ----- view "parlays" (legacy tiers) ----- */
  const parlays: CfbParlay[] = [];
  let n = 0;
  const push = (drafts: Draft[], tier: CfbParlayTier, view: CfbParlayView, list: CfbParlay[], name?: (d: Draft) => string) => {
    for (const d of drafts) {
      n++;
      const legs = `${d.legs.length} legs`;
      list.push(finish(d, view, tier, categoryOf(d.legs), name ? name(d) : `${tier} · ${legs}`, `cfb-${board.date}-${view}-${n}`));
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

  /* ----- INSTRUCTION 42: the twelve category sets ----- */
  const sets = {} as Record<CfbParlayCategory, CfbParlay[]>;
  const emit = (category: CfbParlayCategory, drafts: Draft[]) => {
    const view: CfbParlayView = category === "mixed" ? "mixed" : category === "live" ? "live" : "parlays";
    const list: CfbParlay[] = [];
    let i = 0;
    for (const d of spread(drafts.sort(draftByEv), R.perCategory)) {
      i++;
      list.push(finish(d, view, tierOf(d), category, `${SET_LABEL[category]} · ${d.legs.length} legs`, `cfb-${board.date}-${category}-${i}`));
    }
    sets[category] = list;
  };

  // single-market pregame sets — one leg per game, only that market
  for (const category of CFB_PARLAY_CATEGORIES) {
    if (category === "combo" || category === "mixed" || category === "live") continue;
    const pool = upcoming.filter((l) => l.market === category); // already in byProb order
    emit(category, seededSet(pool, SET_BAND, 1));
  }

  // combo — a side beside a prop on one pregame ticket
  emit("combo", pairedSet(upcomingSides, upcomingProps, upcoming, COMBO_BAND, R.maxPerGame));

  // mixed — a live leg beside a pregame leg
  if (live.length > 0 && upcoming.length > 0) {
    const both = [...live, ...upcoming].sort(byProb);
    emit("mixed", pairedSet(live, upcoming, both, SET_BAND, R.maxPerGame));
  } else sets.mixed = [];

  // live — in-play legs only
  if (live.length > 0) emit("live", seededSet(live, SET_BAND, R.maxPerGame));
  else sets.live = [];

  return {
    date: board.date,
    generatedAt: new Date(opts.now).toISOString(),
    parlays,
    mixed: sets.mixed,
    live: sets.live,
    sets,
    liveRows,
    categories,
  };
}
