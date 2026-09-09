import { decToAm } from "@/lib/ticket-math";
import { gradeRank } from "@/lib/grade";
import { CFB_PARLAYS } from "@/lib/cfb/rules";
import { kellyStake, rowProbAt } from "@/lib/cfb/model";
import type { CfbBoard, CfbGame, CfbRow } from "@/lib/cfb/types";
import { CFB_PARLAY_CATEGORIES } from "@/lib/cfb/props-types";
import type { CfbParlay, CfbParlayCategory, CfbParlayLeg, CfbParlayTier, CfbParlayView, CfbPickRow, CfbPicks, CfbPropRow } from "@/lib/cfb/props-types";
import type { League, LeagueParlays, LeagueRules } from "@/lib/football/league";

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
 *     "ml" / "spread" / "total" / each prop market — pregame + in-game legs ALL from that one market,
 *               2–6 legs on distinct games, dec 1.5–60. Built from every seed leg (likeliest
 *               first) at every leg count 2..6 three ways — filled likeliest-first, filled with
 *               the legs that follow the seed, filled highest-EV-first — then deduped, so the
 *               set carries a spread of leg counts rather than fifty near-identical six-leggers.
 *     "combo"   pregame + in-game legs, at least one side AND one prop, 3–6 legs, dec 2–60.
 *     "mixed"   at least one live leg and one pregame leg, 2–6 legs, dec 1.5–60; empty when
 *               nothing is live.
 *     "live"    live legs only (in-play prices), 2–6 legs, dec 1.5–60; empty when nothing is live.
 *   `picks.mixed` and `picks.live` are the same tickets as sets.mixed / sets.live.
 *
 *   TIERED LEG POOL (2026-09-05, Josh: "It's also only showing 4 Anytime TD parlays in the
 *   generated parlays. It should be showing 50+ Anytime TD parlays"): a single-market set builds
 *   from tier 1 (the −3 gate above) first; when that yields fewer than perCategory tickets the
 *   pool extends to tier 2 — Caesars-priced, upcoming, non-live legs of that market down to
 *   CFB_PARLAYS.setFloorEvPct (−12) — and building continues (seeded fills, then a bounded
 *   exhaustive walk) until fifty or the pool runs dry. Every-leg-tier-1 tickets rank first (by
 *   EV), then the rest by EV; `gated` on the ticket says which. Per-market bands come from
 *   CFB_PARLAYS.setBands (anytime TD: 2–4 legs, dec 4–250 — its legs price 3–8 each, so the
 *   shared 60 cap forbade a third leg); other markets keep SET_BAND. The legacy tiered view,
 *   combo, mixed and live never loosen — tier 1 only.
 *
 *   INSTRUCTION 44 (2026-09-05, Josh, verbatim): "no they should be using in game lines as well;
 *   make it also use in game prop lines for all of the same props as they are available; which
 *   is through 3rd quarter in most games" — every single-market set AND combo now draws from
 *   BOTH pregame and in-game legs: tier 1 = upcoming + live legs with EV ≥ minLegEvPct, tier 2
 *   (single-market sets only) = upcoming + live legs down to setFloorEvPct. A live leg keeps
 *   `live: true` and the ticket counts them in `liveLegs`; tickets are ranked by EV exactly as
 *   before (a live leg is never pushed up or down), one leg per game and the per-market bands
 *   hold. MIXED stays live + pregame on one ticket, LIVE stays live-only, and the legacy tiered
 *   view (SAFER / LONGSHOT / MIX) stays pregame-only. Prod at 16:55 PT that day: Caesars anytime
 *   TD existed only on two live games and the ANYTIME TD set read 0 — this is the fix.
 *
 *   Work is capped (seeds per set, seed pairs per axis) so a 68-game slate with ~3,000 prop
 *   rows builds in well under a second in the browser; ordering is total and deterministic.
 *
 *   ONE PICKS ENGINE, TWO LEAGUES (2026-09-08, the NFL build). The parlay knobs `R` are
 *   `opts.parlays ?? CFB_PARLAYS` and are THREADED through every helper below (`sideLeg`, `propLeg`,
 *   `draftOf`'s gate, `fill`, `combos`, `walk`, the seeded / paired set builders, `tierOf`,
 *   `setBandOf`) — nothing inside the build reads CFB_PARLAYS by name, so an NFL set (perCategory
 *   25) can never fill to the CFB fifty. The exported helpers keep CFB defaults for the CFB
 *   components and tests. Ids are `${opts.idPrefix ?? "cfb"}-${date}-${view}-${n}` and
 *   `-${category}-${i}`; `opts.rules` (Kelly) sizes a prop pick's stake for the league.
 */

export const CFB_PROP_CATEGORIES = ["anytime_td", "pass_tds", "pass_yds", "receptions", "rush_yds", "rec_yds"] as const;
export const CFB_PICK_CATEGORIES = ["all", "ml", "spread", "total", ...CFB_PROP_CATEGORIES] as const;

type Leg = CfbParlayLeg & { evCz: number; live: boolean };
type Draft = { legs: Leg[]; dec: number; prob: number; ev: number; key: string; gated: boolean };
type Band = { legs: { min: number; max: number }; minDec: number; maxDec: number };
/** the knobs a leg / draft / set builder needs — CFB_PARLAYS or NFL_PARLAYS */
type Knobs = LeagueParlays;

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
    // INSTRUCTION 46 (2026-09-08): a side pick is marked with the team it is on; a total has none
    player: null,
    teamId: row.market === "total" ? null : row.teamId,
    headshot: null,
    pos: null,
  };
}

function propPick(row: CfbPropRow, bankroll: number, live: boolean, rules?: LeagueRules): CfbPickRow {
  const kelly = live
    ? null
    : row.kelly != null
      ? row.kelly
      : row.playable && row.fair != null && row.cz
        ? kellyStake(row.fair, 0, row.cz.dec, bankroll, rules)
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
    // INSTRUCTION 46 (2026-09-08): the player's own headshot + HIS team, never both logos
    player: row.player,
    teamId: row.teamId,
    headshot: row.headshot,
    pos: row.pos,
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

/** `floor` is the EV gate: minLegEvPct (tier 1) everywhere except the single-market sets' tier-2 pool (setFloorEvPct); the builder gathers at the floor and filters tier 1 from it */
function sideLeg(row: CfbRow, game: CfbGame, live: boolean, floor: number = CFB_PARLAYS.minLegEvPct): Leg | null {
  if (!row.cz || row.evCz == null || row.evCz < floor) return null;
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

function propLeg(row: CfbPropRow, live: boolean, floor: number = CFB_PARLAYS.minLegEvPct): Leg | null {
  if (!row.cz || row.fair == null || row.evCz == null || row.evCz < floor) return null;
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
    headshot: row.headshot,
    pos: row.pos,
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

function draftOf(legs: Leg[], R: Knobs): Draft {
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
  return { legs, dec, prob, ev: 100 * (prob * dec - 1), key, gated: legs.every((l) => l.evCz >= R.minLegEvPct) };
}

const inBand = (d: Draft, band: Band) => d.legs.length >= band.legs.min && d.legs.length <= band.legs.max && d.dec >= band.minDec && d.dec <= band.maxDec;

/** Seeded greedy fill: from the seed legs, add the next-likeliest legs that fit until the
    ticket has the minimum legs AND clears minDec; never past maxDec or the leg cap. */
function fill(seed: Leg[], pool: Leg[], band: Band, R: Knobs): Draft | null {
  const legs = [...seed];
  let dec = legs.reduce((d, l) => d * l.dec, 1);
  for (const leg of pool) {
    if (legs.length >= band.legs.max) break;
    if (legs.length >= band.legs.min && dec >= band.minDec) break;
    if (!legFits(leg, legs, R.maxPerGame)) continue;
    if (dec * leg.dec > band.maxDec) continue;
    legs.push(leg);
    dec *= leg.dec;
  }
  const d = draftOf(legs, R);
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
function combos(pool: Leg[], maxLegs: number, maxDec: number, R: Knobs): Draft[] {
  const out: Draft[] = [];
  const walk = (start: number, legs: Leg[], dec: number) => {
    for (let i = start; i < pool.length; i++) {
      const leg = pool[i];
      if (!legFits(leg, legs, R.maxPerGame) || dec * leg.dec > maxDec) continue;
      const next = [...legs, leg];
      if (next.length >= 2) out.push(draftOf(next, R));
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

/** The tiered ranking (2026-09-05): every-leg-tier-1 (`gated`) tickets first — spread across leg
    counts and EV-ranked like any set — then, only when they fall short of `cap`, the tier-2
    tickets the same way in the remaining slots. A leg set is either gated or not, so the two
    halves never share a key. */
function tieredSpread(drafts: Draft[], cap: number): Draft[] {
  const gated = spread(
    drafts.filter((d) => d.gated).sort(draftByEv),
    cap,
  );
  if (gated.length >= cap) return gated;
  const rest = spread(
    drafts.filter((d) => !d.gated).sort(draftByEv),
    cap - gated.length,
  );
  return [...gated, ...rest];
}

/** Bounded exhaustive walk over `pool` in its own order: every in-band combination that respects
    the rules, until `budget` drafts are collected — the "until the pool runs dry" backstop when the
    seeded fills alone leave a tiered set short. Deterministic (pool order is total). */
function walk(pool: Leg[], band: Band, maxPerGame: number, budget: number, R: Knobs): Draft[] {
  const out: Draft[] = [];
  const step = (start: number, legs: Leg[], dec: number) => {
    for (let i = start; i < pool.length && out.length < budget; i++) {
      const leg = pool[i];
      if (!legFits(leg, legs, maxPerGame) || dec * leg.dec > band.maxDec) continue;
      const next = [...legs, leg];
      const nd = dec * leg.dec;
      if (next.length >= band.legs.min && nd >= band.minDec) out.push(draftOf(next, R));
      if (next.length < band.legs.max) step(i + 1, next, nd);
    }
  };
  step(0, [], 1);
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

function tierOf(d: Draft, R: Knobs): CfbParlayTier {
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
    gated: d.gated,
    liveLegs: d.legs.filter((l) => l.live).length,
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
/** the band a single-market set builds in: `parlays.setBands[market]` (CFB_PARLAYS when omitted) when pinned there, else SET_BAND */
export function setBandOf(category: CfbParlayCategory, parlays: Knobs = CFB_PARLAYS): Band {
  const bands = parlays.setBands as Partial<Record<CfbParlayCategory, Band>>;
  return bands[category] ?? SET_BAND;
}
/** tier-2 exhaustive walk: raw in-band drafts collected before the walk stops (the pool "runs dry" inside this budget) */
const WALK_BUDGET = 400;
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

const pushDraft = (out: Draft[], legs: Leg[] | null, band: Band, R: Knobs) => {
  if (!legs) return;
  const d = draftOf(legs, R);
  if (inBand(d, band)) out.push(d);
};

/** Single-seed sets: every seed at every leg count, filled three ways — likeliest-first, forward
    from the seed's own position, highest-EV-first. Seeds are the SET_SEEDS likeliest legs AND the
    SET_SEEDS highest-EV legs (2026-09-05: a band with a real price floor — anytime TD's 4 — never
    saw a two-legger from the likeliest seeds alone, since two favourites' decimals fall short of it). */
function seededSet(byP: Leg[], band: Band, maxPerGame: number, R: Knobs): Draft[] {
  const out: Draft[] = [];
  if (byP.length < band.legs.min) return out;
  const byE = [...byP].sort(byEv);
  const seeds = Math.min(byP.length, SET_SEEDS);
  const seeded = new Set<string>();
  const from = (order: Leg[], i: number) => {
    const leg = order[i];
    if (seeded.has(leg.rowKey)) return;
    seeded.add(leg.rowKey);
    const seed = [leg];
    const at = byP.indexOf(leg);
    for (let n = band.legs.min; n <= band.legs.max; n++) {
      pushDraft(out, fillTo(seed, byP, n, band.maxDec, maxPerGame, 0), band, R);
      pushDraft(out, fillTo(seed, byP, n, band.maxDec, maxPerGame, at + 1), band, R);
      pushDraft(out, fillTo(seed, byE, n, band.maxDec, maxPerGame, 0), band, R);
    }
  };
  for (let i = 0; i < seeds; i++) from(byP, i);
  for (let i = 0; i < seeds; i++) from(byE, i);
  return out;
}

/** Paired sets: one leg from each axis seeds the ticket (so the set's defining pair is on every
    ticket), then every leg count is filled likeliest-first and highest-EV-first from `pool`. */
function pairedSet(a: Leg[], b: Leg[], pool: Leg[], band: Band, maxPerGame: number, R: Knobs): Draft[] {
  const out: Draft[] = [];
  if (a.length === 0 || b.length === 0) return out;
  const byE = [...pool].sort(byEv);
  for (const x of a.slice(0, PAIR_SEEDS)) {
    for (const y of b.slice(0, PAIR_SEEDS)) {
      if (!legFits(y, [x], maxPerGame) || x.dec * y.dec > band.maxDec) continue;
      const seed = [x, y];
      for (let n = Math.max(2, band.legs.min); n <= band.legs.max; n++) {
        pushDraft(out, fillTo(seed, pool, n, band.maxDec, maxPerGame, 0), band, R);
        pushDraft(out, fillTo(seed, byE, n, band.maxDec, maxPerGame, 0), band, R);
      }
    }
  }
  return out;
}

/* ---------- the builder ---------- */

export function buildCfbPicks(
  board: CfbBoard,
  props: CfbPropRow[] | null,
  opts: { now: number; bankroll: number; parlays?: LeagueParlays; idPrefix?: League; rules?: LeagueRules },
): CfbPicks {
  const R: Knobs = opts.parlays ?? CFB_PARLAYS;
  const idPrefix = opts.idPrefix ?? "cfb";
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
    const pick = propPick(r, opts.bankroll, isLive, opts.rules);
    if (isLive) liveRows++;
    categories.all.push(pick);
    categories[r.market].push(pick);
  }
  for (const k of Object.keys(categories)) categories[k] = rankPicks(categories[k]);

  /* ----- legs ----- */
  // upcoming AND live legs are gathered down to the tier-2 floor; tier 1 (the −3 gate) is filtered
  // from them. INSTRUCTION 44: the tiered pool serves the single-market sets with pregame and
  // in-game legs alike; combo, mixed and live take tier 1 of their own axes.
  const gate = (l: Leg) => l.evCz >= R.minLegEvPct;
  const floorSides: Leg[] = [];
  const floorLiveSides: Leg[] = [];
  for (const g of board.games) {
    const kicked = kickedOff(g.start);
    const isLive = g.status === "live";
    const isUpcoming = g.status === "upcoming" && !kicked;
    if (!isLive && !isUpcoming) continue;
    for (const r of g.rows) {
      const leg = sideLeg(r, g, isLive, R.setFloorEvPct);
      if (!leg) continue;
      (isLive ? floorLiveSides : floorSides).push(leg);
    }
  }
  const floorProps: Leg[] = [];
  const floorLiveProps: Leg[] = [];
  for (const r of props ?? []) {
    const g = games.get(r.gameId);
    const status = g?.status ?? r.status;
    const kicked = kickedOff(g?.start ?? r.kickoff);
    const isLive = status === "live";
    const isUpcoming = status === "upcoming" && !kicked;
    if (!isLive && !isUpcoming) continue;
    const leg = propLeg(r, isLive, R.setFloorEvPct);
    if (!leg) continue;
    (isLive ? floorLiveProps : floorProps).push(leg);
  }
  const upcomingSides = floorSides.filter(gate).sort(byProb);
  const upcomingProps = floorProps.filter(gate).sort(byProb);
  /** tier-1 pregame legs — the legacy tiered view's whole pool, and the pregame axis of mixed */
  const upcoming = [...upcomingSides, ...upcomingProps].sort(byProb);
  const liveSides = floorLiveSides.filter(gate).sort(byProb);
  const liveProps = floorLiveProps.filter(gate).sort(byProb);
  /** tier-1 in-game legs — the live set's whole pool, and the live axis of mixed */
  const live = [...liveSides, ...liveProps].sort(byProb);
  /** INSTRUCTION 44: tier 1 pregame + in-game legs — the single-market sets' first pass and combo's pool */
  const tier1Sides = [...upcomingSides, ...liveSides].sort(byProb);
  const tier1Props = [...upcomingProps, ...liveProps].sort(byProb);
  const tier1 = [...tier1Sides, ...tier1Props].sort(byProb);
  /** tier 1 + tier 2 pregame + in-game legs (single-market sets only) */
  const tieredFloor = [...floorSides, ...floorLiveSides, ...floorProps, ...floorLiveProps].sort(byProb);

  /* ----- view "parlays" (legacy tiers) ----- */
  const parlays: CfbParlay[] = [];
  let n = 0;
  const push = (drafts: Draft[], tier: CfbParlayTier, view: CfbParlayView, list: CfbParlay[], name?: (d: Draft) => string) => {
    for (const d of drafts) {
      n++;
      const legs = `${d.legs.length} legs`;
      list.push(finish(d, view, tier, categoryOf(d.legs), name ? name(d) : `${tier} · ${legs}`, `${idPrefix}-${board.date}-${view}-${n}`));
    }
  };

  // SAFER — sides AND props (2026-09-05: Caesars posts no moneyline on the big favourites, so a
  // sides-only pool was empty on the opening slate; the likeliest anytime-TD favourites qualify),
  // likeliest legs, every qualifying pair / triple, by combined probability
  const saferPool = upcoming.filter((l) => l.prob >= R.safer.minLegProb).slice(0, SAFER_POOL);
  const safer = distinct(combos(saferPool, R.safer.legs.max, R.safer.maxDec, R).filter((d) => d.legs.length >= R.safer.legs.min).sort(draftByProb), R.perView);
  push(safer, "SAFER", "parlays", parlays);

  // LONGSHOT — sides + props, each candidate starts on a different leg, filled likeliest-first, by EV
  const longshotSeeds = upcoming.slice(0, SEED_POOL);
  const longshot = distinct(
    longshotSeeds.map((seed) => fill([seed], upcoming, R.longshot, R)).filter((d): d is Draft => d != null).sort(draftByEv),
    R.perView,
  );
  push(longshot, "LONGSHOT", "parlays", parlays);

  // MIX — one side + one prop seeded, filled likeliest-first inside the mix band, by EV
  const mixDrafts: Draft[] = [];
  for (const s of upcomingSides.slice(0, MIX_SEEDS)) {
    for (const p of upcomingProps.slice(0, MIX_SEEDS)) {
      if (!legFits(p, [s], R.maxPerGame) || s.dec * p.dec > R.mix.maxDec) continue;
      const d = fill([s, p], upcoming, R.mix, R);
      if (d) mixDrafts.push(d);
    }
  }
  push(distinct(mixDrafts.sort(draftByEv), R.perView), "MIX", "parlays", parlays);

  /* ----- INSTRUCTION 42: the twelve category sets ----- */
  const sets = {} as Record<CfbParlayCategory, CfbParlay[]>;
  /** INSTRUCTION 44 review fix: since the single-market sets and combo draw in-game legs too, one
      leg set could be built by a single-market set AND by LIVE, or by combo AND by MIXED / LIVE.
      Every ticket is emitted under exactly one category — the first in CFB_PARLAY_CATEGORIES order
      (single-market > combo > mixed > live) — so the twelve sets stay disjoint and the Board's
      counts stay honest. A draft already taken is dropped BEFORE the pick, so the later set still
      fills from its remaining candidates. */
  const taken = new Set<string>();
  const emit = (category: CfbParlayCategory, drafts: Draft[], pick: (drafts: Draft[], cap: number) => Draft[] = (d, cap) => spread(d.sort(draftByEv), cap)) => {
    const view: CfbParlayView = category === "mixed" ? "mixed" : category === "live" ? "live" : "parlays";
    const list: CfbParlay[] = [];
    let i = 0;
    for (const d of pick(drafts.filter((d) => !taken.has(d.key)), R.perCategory)) {
      i++;
      taken.add(d.key);
      list.push(finish(d, view, tierOf(d, R), category, `${SET_LABEL[category]} · ${d.legs.length} legs`, `${idPrefix}-${board.date}-${category}-${i}`));
    }
    sets[category] = list;
  };

  // single-market sets — one leg per game, only that market, pregame AND in-game legs
  // (INSTRUCTION 44), the tiered pool: tier 1 first; tier 2 (down to setFloorEvPct) only when
  // tier 1 leaves the set short of fifty
  for (const category of CFB_PARLAY_CATEGORIES) {
    if (category === "combo" || category === "mixed" || category === "live") continue;
    const band = setBandOf(category, R);
    const first = tier1.filter((l) => l.market === category); // already in byProb order
    let drafts = seededSet(first, band, 1, R);
    if (tieredSpread(drafts, R.perCategory).length < R.perCategory) {
      const pool = tieredFloor.filter((l) => l.market === category);
      if (pool.length > first.length) {
        drafts = [...drafts, ...seededSet(pool, band, 1, R)];
        if (tieredSpread(drafts, R.perCategory).length < R.perCategory) drafts = [...drafts, ...walk(pool, band, 1, WALK_BUDGET, R)];
      }
    }
    emit(category, drafts, tieredSpread);
  }

  // combo — a side beside a prop on one ticket, pregame or in-game legs (INSTRUCTION 44), tier 1 only
  emit("combo", pairedSet(tier1Sides, tier1Props, tier1, COMBO_BAND, R.maxPerGame, R));

  // mixed — a live leg beside a pregame leg
  if (live.length > 0 && upcoming.length > 0) {
    const both = [...live, ...upcoming].sort(byProb);
    emit("mixed", pairedSet(live, upcoming, both, SET_BAND, R.maxPerGame, R));
  } else sets.mixed = [];

  // live — in-play legs only
  if (live.length > 0) emit("live", seededSet(live, SET_BAND, R.maxPerGame, R));
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
