/**
 * PARLAY GENERATOR — the pure core (INSTRUCTION 50, 2026-09-11, Josh's word, verbatim:
 * "Parlay builder should have a generator that I can select # of legs, prop category,
 * min & max odds then it will generate a parlay for me within those parameters; if I hit
 * regenerate then it regenerates a new parlay; each slot is clickable to keep that
 * player(s) in any round and spin the other slots").
 *
 * INSTRUCTION 52 (2026-09-12, Josh's word, verbatim: "Parlay Generator should be on CFB & NFL
 * just like it is on MLB"). This file is now PAYLOAD-OPAQUE: it knows about prices, sides,
 * players and games, and nothing at all about a board. Every field it reads is hoisted onto
 * `GenLeg` by a per-sport ADAPTER (src/components/props/mlb-gen-pool.ts for the MLB prop board,
 * src/lib/football/gen-pool.ts for the CFB/NFL prop rows), and the desk's own leg object rides
 * along untouched in `leg` so the slip still gets exactly the object it would from a tap.
 * Forking this logic per sport would have been the defect; there is one implementation.
 *
 * THE BAND IS PER LEG. Josh's own example settles it — his four legs
 *   -145 · -124 · -137 · -130  →  1.689655 × 1.806452 × 1.729927 × 1.769231 = 9.341931 = +834,
 * nowhere near the "-152 -> +110" he wrote on the same line, while EVERY leg sits inside
 * 1.657895..2.100000 on its own. So `legMinAm`/`legMaxAm` are the primary control and a
 * COMBINED payout band (`spec.payout`) is a second, opt-in mode over the same `bandDec`
 * predicate. Both are compared in DECIMAL: American odds are not ordered across the ±100
 * discontinuity (-150 and +150 are both "150" to a naive numeric compare).
 *
 * NOTHING IS INVENTED HERE. Every price is a posted quote the adapter read off a board row and
 * minted through the desk's OWN leg minter, which returns null when that side is not posted (MLB:
 * `playerLeg`; football: `propLegOf`, which also refuses a quote at a line the row has no fair
 * for — exactly the cell the board itself renders as an untappable dash); every probability is
 * the engine's own model number or the de-vigged market fair, tagged as one or the other
 * (`leg.src`). The generator picks among real legs — it never prices one. When it cannot satisfy
 * the request it says so with a typed failure carrying REAL pool numbers, and it NEVER silently
 * relaxes a rule to produce a ticket anyway (the legacy engine does exactly that on its second
 * pass, legacy/index.html:2687 — we do not).
 *
 * PURE: no React, no fetch, no Date.now, no Math.random, no engine sandbox. Same inputs →
 * byte-identical ticket, on any device, which is why the pool is sorted by leg id (board
 * order is device-dependent: `bestBoard` may hand back either the server or the cached
 * board, src/lib/engine-client.ts:290-297, and the page re-sorts rows by rank,
 * app/props/page.tsx:156).
 *
 * Sandbox only: nothing here writes anywhere, spends an Odds credit, or enters the ledger.
 */

import { strategyGenerate } from "./parlay-strategy";
import { inGameTimeWindow, type GameTimeWindow } from "./game-time-window";
import { SETTLE_BOOK_SHORT } from "@/lib/sportsbook/books";
import { mixBands, mixOrder, type MixBand, type MixStyle } from "./parlay-gen-mix";
import { amToDec, decToAm } from "@/lib/ticket-math";
import type { PropLean } from "@/lib/prop-lean";

/* ------------------------------------------------------------------ shapes */

/** which side of the posted line a leg is — an anytime-TD "yes" counts as an over */
export type GenSide = "o" | "u";

export type GenSides = GenSide | "both";

/**
 * One market the generator can be pointed at, in the desk's OWN vocabulary — the adapter
 * supplies the list (MLB_GEN_MARKETS / FOOTBALL_GEN_MARKETS) so the sheet never has to know
 * which sport it is looking at. `suspended` marks a market the engine keeps out of its own
 * auto-built tickets; the sheet still offers it, with the reason written on the page.
 */
export type GenMarket = {
  key: string;
  label: string;
  suspended?: boolean;
  /**
   * This market posts ONE side only — anytime TD is a price on the thing happening, and there is
   * no under to take (the adapter counts its "yes" as an over). The sheet hides its Overs /
   * Unders / Both control on such a market rather than offering a choice the board cannot honour
   * (INSTRUCTION 52 fix pass).
   */
  oneSided?: boolean;
};

export type GenPhase = "pregame" | "live" | "mixed";
/**
 * What the adapter needs to build the pool. `markets`, when present and non-empty, is the FULL
 * set of categories on the ticket (2026-09-18: "The parlay generator needs significantly more
 * customization") and the pool is their union; `market` alone is the single-category case and
 * every pre-existing caller.
 */
export type GenPoolSpec = { market: string; markets?: readonly string[]; includeStarted: boolean; phase?: GenPhase };

/** the categories a spec actually builds from: `markets` when set, else the one `market` */
export const specMarkets = (spec: Pick<GenSpec, "market" | "markets">): readonly string[] =>
  spec.markets?.length ? spec.markets : [spec.market];

export type GenSpec = {
  /** User-filtered engine recommendations; no grade or positive-EV floor. */
  betType?: "styles" | "model";
  strategies?: readonly string[];
  sports?: readonly string[];
  timing?: readonly string[];
  preferDiversity?: boolean;
  timeWindow?: GameTimeWindow;
  /** Explicit empty market selection differs from older saved single-market specs. */
  noMarkets?: boolean;
  phase?: GenPhase;
  /** Category-relative player rotation; omitted retains the historical sampler. */
  style?: MixStyle;
  /** the desk's own market key — "batter_hits_runs_rbis" (MLB), "pass_yds" (football). With
      `markets` set this is the one the rail is showing; the ticket draws from all of `markets`. */
  market: string;
  /** every category on the ticket (2026-09-18). Empty/omitted = just `market`. */
  markets?: readonly string[];
  /** with several categories: every selected category must appear at least once when the leg
      count allows it (default ON). Off = any mix the sampler lands on. */
  spread?: boolean;
  /** hit-rate floor, 0..1: only legs whose player cleared THIS line on THIS side in at least this
      share of his recent games (the window is the page's; the adapter stamps `hit` on the leg).
      A leg with no game-log data cannot clear a floor. null/omitted = no floor. */
  minHit?: number | null;
  /** restrict to these game keys; empty/omitted = every game on the board */
  games?: readonly string[];
  /** EXACT number of legs, clamped to LEG_MIN..LEG_MAX (the UI only offers 2..8) */
  legs: number;
  /** PER-LEG band in American odds, either order (-152 … +110) */
  legMinAm: number;
  legMaxAm: number;
  /** optional COMBINED payout band — off by default */
  payout: { minAm: number; maxAm: number } | null;
  sides: GenSides;
  /** Empty/omitted = all positions. An explicit filter also binds kept slots. */
  positions?: readonly string[];
  /** R2: at most one leg per game. Default ON, user-relaxable, never silently relaxed. */
  onePerGame: boolean;
  /**
   * R2b (2026-09-18, Josh: "Add filter on parlay generator alongside 'Two legs from one game' that
   * says 'Two legs from one team' so i can prevent a 3 teamer from having 2 players from same
   * team"): at most one leg per TEAM, read off the adapter's folded `team` tag — a leg with no
   * team tag is never blocked by it. Undefined = OFF, so a spec written before the control existed
   * (saved recipes, the pinned fixtures) still mints its exact ticket; both desks default it ON
   * and only the user relaxes it, from the sheet, never silently.
   */
  onePerTeam?: boolean;
  /** only legs whose price is the settlement book's quote (DraftKings since INSTRUCTION 67; the selected book on display surfaces) */
  czOnly: boolean;
  /** short tag of the book `czOnly` keeps ("DK" by default; the display selector overrides it) */
  pricingBook?: string;
  /** admit games that have already started (their prices are pregame quotes) */
  includeStarted: boolean;
  /** only legs whose win % is the engine's model number, not the de-vigged market fair */
  modelOnly: boolean;
  /** one entry per slot: a leg id to keep, or null to spin that slot */
  pinned: readonly (string | null)[];
};

/**
 * One mintable leg. Everything the core reads is HOISTED here by the adapter; `leg` is the
 * desk's own object and this file never looks inside it.
 */
export type GenLeg<P = unknown> = {
  /** the leg's identity — the canonical sort key, the pin id, and the dedupe key */
  id: string;
  /** the posted American price (the same number the slip prices) */
  am: number;
  /** win % (0..100) at that price */
  prob: number;
  /** Push probability in percentage points; a push returns this leg’s stake. */
  push?: number;
  /** where `prob` came from: the engine's model, or the de-vigged market fair */
  src?: "model" | "market";
  /** over or under ("yes" markets are overs) — the side filter reads THIS, never a string suffix */
  side: GenSide;
  /** the name line: "Bryce Harper (PHI)" / "Ty Simpson" */
  label: string;
  /** the bet line: "H+R+RBI Over 1.5" / "Pass Yds O 245.5" */
  sub: string;
  /** the desk's own leg object — the exact object the slip prices and renders */
  leg: P;
  /** amToDec(am) — the posted price in decimal */
  dec: number;
  gameKey: string;
  start?: string | null;
  /** accent/punctuation-proof player identity (R1 is enforced on this) */
  playerKey: string;
  /** Verified position from the sport's player data; unknown is never guessed. */
  position?: string | null;
  /** the row's team tag, folded to ONE spelling per club by the adapter */
  team: string | null;
  /** its game had started at the nowMs the pool was built with */
  started: boolean;
  context?: import("@/components/props/PickContext").PickContextRef;
  sport?: "mlb" | "nfl" | "cfb";
  quoteAt?: string;
  /** an alternate/milestone-ladder line ("2+ hits") rather than a standard O/U */
  alt: boolean;
  /** short book tag: "DK" when the settlement book posts it */
  book: string;
  /** prob/100 × dec − 1, as a FRACTION (same convention as TicketCalc.ev) */
  ev: number;
  /** the market this leg is in — hoisted so a multi-category ticket can spread across them */
  market?: string;
  /** the posted line (0.5 for anytime HR); null on a yes-only market */
  line?: number | null;
  /** the matchup as the board prints it ("NYY @ BOS · 7:05p"), for the games filter chips */
  gameLabel?: string;
  /** cleared-the-line rate over the page's window, stamped by the adapter from the game log;
      undefined = no data for this player (a floor then excludes him, honestly) */
  hit?: { n: number; hits: number; rate: number; dots?: readonly boolean[] } | null;
  /** PROP MARKET LEAN (2026-09-18): the vig-free share of the row's two-way price at the settlement
      book, stamped by the adapter — price-implied, never a bet count; null/undefined = one-sided market */
  lean?: PropLean | null;
};

export type GenPool<P = unknown> = {
  /** every mintable leg for this market, sorted by leg id (canonical, device-independent) */
  legs: readonly GenLeg<P>[];
  byId: ReadonlyMap<string, GenLeg<P>>;
  /** board rows scanned for this market in the games that were kept */
  rows: number;
  /** distinct games represented in `legs` */
  games: number;
  /** rows skipped because their game had started and includeStarted was off */
  startedDropped: number;
  /** rows the book or the engine itself refuses on tickets (legacy/index.html:2682) */
  noParlayDropped: number;
  /**
   * Rows skipped because their game is OVER (final) or was called off (postponed). A separate
   * counter from `noParlayDropped` on purpose (INSTRUCTION 52 fix pass): the sheet prints that
   * one as "the book bars from parlays", which is a statement about Caesars, and filing a
   * finished Saturday-morning game under it told Josh the book had barred legs nobody barred.
   */
  finishedDropped: number;
};

export type GenTicket<P = unknown> = {
  /** slot order: index i is slot i, so a pinned slot keeps its position across spins */
  legs: readonly GenLeg<P>[];
  /** product of the leg decimals, multiplied in slot order exactly as combineTicket does */
  dec: number;
  am: number;
  /** naive product of the leg win %s — legs treated independent, same as the slip */
  trueProb: number;
  /** set identity: the leg ids sorted and joined (two spins with the same legs share a key) */
  key: string;
  /** the seed that actually produced this ticket (may differ from the asked seed via `avoid`) */
  seed: number;
  /** leg ids the payout repair swapped OUT of the first fill, in the order removed */
  dropped: readonly string[];
  /** PINNED leg ids sitting outside the per-leg band — the only legs allowed to, always flagged */
  outsideLegBand: readonly string[];
  /** legs whose win % is the market estimate (not independent evidence of model edge) */
  marketPriced: number;
  /** game keys carrying more than one leg (only possible with onePerGame off) */
  sameGame: readonly string[];
  /** team tags carrying more than one leg (only possible with onePerTeam off) */
  sameTeam: readonly string[];
};

export type GenFail =
  /** Mixed has no leg on one side of the fence; `pregame` / `live` are the eligible counts per phase, so the sheet can say WHICH is missing */
  | { code: "phase-empty"; pregame: number; live: number }
  | { code: "no-rows" }
  /**
   * The market HAS legs, and every one of them is on the other side from the one asked for —
   * football's anytime TD posts a YES and no under at all, so "unders" there can never fill a
   * slot (INSTRUCTION 52 fix pass). Told apart from `no-rows` because "no lines on this board"
   * is a statement about the board, and saying it while the board shows dozens of prices is
   * exactly the contradiction the diagnostic line exists to prevent. `has` is the side that IS
   * posted, so the sheet can offer it as a one-tap fix.
   */
  | { code: "one-sided"; want: GenSide; has: GenSide; rows: number }
  | { code: "band-empty"; rows: number; nearest: { belowAm: number | null; aboveAm: number | null } }
  | { code: "short-pool"; have: number; want: number; relax: "same-game" | "same-team" | "started" | "cz" | "model" | "positions" | "hit" | "games" | null }
  | { code: "payout-unreachable"; reach: { minAm: number; maxAm: number } }
  | { code: "payout-not-found"; reach: { minAm: number; maxAm: number } }
  | { code: "pin-missing"; ids: readonly string[] }
  | { code: "pin-position"; ids: readonly string[] }
  | { code: "pin-conflict"; ids: readonly string[]; why: "same-player" | "same-game" | "same-team" };

export type GenResult<P = unknown> = { ok: true; ticket: GenTicket<P> } | { ok: false; fail: GenFail };

export const LEG_MIN = 2;
export const LEG_MAX = 8;
/** bounded payout repair: at most this many swaps, scanning at most this many candidates each */
export const REPAIR_TRIES = 240;
export const REPAIR_SCAN = 400;
/** how many re-seeds a spin may burn trying to avoid the last few tickets before giving up */
export const ROLL_RETRIES = 8;

/** EV preference temperature, in percentage points of edge (w = exp(ev% / 3)). */
const EV_TEMP = 3;

/* ------------------------------------------------------------------- primitives */

/**
 * mulberry32 — the repo's own PRNG, the same algorithm as legacy `shMulberry`
 * (legacy/index.html:1768). Seeded, so a spin is reproducible and testable.
 */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit — the same hash the engine seeds its sims with (legacy/index.html:1767). */
function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The seed for one spin: every knob that can change the answer, plus the board's own key
 * (so a fresh board re-rolls) and the roll counter (so "Regenerate" moves).
 *
 * `spec.pinned` is DELIBERATELY NOT IN THE HASH (INSTRUCTION 50 fix pass). Josh's word is
 * "each slot is clickable to keep that player(s) in any round and spin the other slots" —
 * keeping is a LOCK, spinning is the next button press. Folding the pins into the seed made
 * the act of keeping one slot re-roll the three he had not touched, which is the opposite of
 * what he asked for. The pins do not need to be in the seed to bind: `generate` seats them
 * first and `fits`/`clashes` enforce them, so the answer is still fully determined. A spin
 * still moves, because `roll` is here.
 */
export function specSeed(spec: GenSpec, boardKey: string, roll: number): number {
  const parts = [
    boardKey,
    spec.market,
    String(spec.legs),
    String(spec.legMinAm),
    String(spec.legMaxAm),
    spec.payout ? `${spec.payout.minAm}..${spec.payout.maxAm}` : "-",
    spec.sides,
    spec.onePerGame ? "g1" : "g*",
    spec.czOnly ? "cz" : "any",
    spec.includeStarted ? "live" : "pre",
    spec.modelOnly ? "model" : "both",
    String(roll),
  ];
  if (spec.betType === "model") parts.push("betType:model");
  if (spec.strategies) parts.push(`strategies:${spec.strategies.join(",")}`);
  if (spec.sports) parts.push(`sports:${spec.sports.join(",")}`);
  if (spec.timing) parts.push(`timing:${spec.timing.join(",")}`);
  if (spec.timeWindow) parts.push(`time:${spec.timeWindow.join(":")}`);
  if (spec.noMarkets) parts.push("markets:none");
  if (spec.style) parts.push(spec.style);
  if (spec.phase) parts.push(`phase:${spec.phase}`);
  if (spec.markets?.length) parts.push(`markets:${[...new Set(spec.markets)].sort().join(",")}`);
  if (spec.spread === false) parts.push("spread:off");
  /* only when ON — a spec without the control keeps the seed (and the ticket) it always had */
  if (spec.onePerTeam) parts.push("t1");
  if (spec.minHit != null) parts.push(`hit:${spec.minHit}`);
  if (spec.games?.length) parts.push(`games:${[...new Set(spec.games)].sort().join(",")}`);
  if (spec.positions?.length) parts.push(`positions:${[...new Set(spec.positions)].sort().join(",")}`);
  return fnv1a(parts.join("|"));
}

/**
 * A price band in DECIMAL, order-insensitive: bandDec(-152, 110) and bandDec(110, -152)
 * are both { lo: 1.657895…, hi: 2.1 }. American numbers cannot be compared directly
 * across ±100, so every band comparison in this file happens on decimals.
 */
export function bandDec(aAm: number, bAm: number): { lo: number; hi: number } {
  const a = amToDec(aAm);
  const b = amToDec(bAm);
  return a <= b ? { lo: a, hi: b } : { lo: b, hi: a };
}

const inDec = (dec: number, b: { lo: number; hi: number }) => dec >= b.lo && dec <= b.hi;

const sidesOf = (s: GenSides): GenSide[] => (s === "both" ? ["o", "u"] : [s]);

const clampLegs = (n: number) => Math.max(LEG_MIN, Math.min(LEG_MAX, Math.round(n)));

/* ------------------------------------------------------------------------ pool */

/**
 * THE ONE POOL SHAPE, shared by every adapter (INSTRUCTION 52). An adapter's only job is to
 * turn its own board rows into `GenLeg`s; the canonical ordering, the id map and the counters
 * are this function's, so two sports cannot drift on the part that makes the answer
 * reproducible.
 *
 * CANONICAL ORDER — load-bearing. Board row order differs between the server board and the
 * locally cached one, and both desks re-sort rows for display (by rank on MLB, by EV on
 * football); sorting by the leg id here is what makes "same seed → same ticket" true on two
 * different devices. `legs` is sorted IN PLACE, so pass a fresh array.
 */
export function poolOf<P>(
  legs: GenLeg<P>[],
  counts: { rows: number; startedDropped: number; noParlayDropped: number; finishedDropped?: number },
): GenPool<P> {
  legs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const byId = new Map<string, GenLeg<P>>();
  for (const l of legs) byId.set(l.id, l);
  return {
    legs,
    byId,
    rows: counts.rows,
    games: new Set(legs.map((l) => l.gameKey)).size,
    startedDropped: counts.startedDropped,
    noParlayDropped: counts.noParlayDropped,
    /* a board with no notion of a finished game (MLB's prop board drops those upstream) passes
       nothing and the count is 0 — it is never folded into another counter's meaning */
    finishedDropped: counts.finishedDropped ?? 0,
  };
}

/**
 * What the generator sees while its panel is CLOSED: nothing, at no cost. The adapters are pure
 * but not free, and a reader who never opens the sheet should not pay for a full pool build plus
 * a seeded fill on every board or spec change (INSTRUCTION 50 fix pass). `generate` answers this
 * with `no-rows`.
 */
export function emptyPool<P>(): GenPool<P> {
  return { legs: [], byId: new Map(), rows: 0, games: 0, startedDropped: 0, noParlayDropped: 0, finishedDropped: 0 };
}

/* ---------------------------------------------------------------------- ticket */

/**
 * Price a set of legs exactly the way the slip does. The multiplication order and the
 * clamping are combineTicket's (src/lib/ticket-math.ts:42-58) so the generator's headline
 * price can never disagree with the slip it hands the legs to — pinned by a test.
 */
export function ticketOf<P>(legs: readonly GenLeg<P>[], spec: GenSpec, seed: number): GenTicket<P> {
  const band = bandDec(spec.legMinAm, spec.legMaxAm);
  let dec = 1;
  let p = 1;
  const seenGame = new Map<string, number>();
  const seenTeam = new Map<string, number>();
  const outsideLegBand: string[] = [];
  let marketPriced = 0;
  for (const l of legs) {
    dec *= amToDec(l.am);
    p *= Math.min(1, Math.max(0, l.prob / 100));
    seenGame.set(l.gameKey, (seenGame.get(l.gameKey) ?? 0) + 1);
    if (l.team != null) seenTeam.set(l.team, (seenTeam.get(l.team) ?? 0) + 1);
    if (!inDec(l.dec, band)) outsideLegBand.push(l.id);
    if (l.src === "market") marketPriced++;
  }
  return {
    legs,
    dec,
    am: decToAm(dec),
    trueProb: p,
    key: legs
      .map((l) => l.id)
      .slice()
      .sort()
      .join("+"),
    seed,
    dropped: [],
    outsideLegBand,
    marketPriced,
    sameGame: [...seenGame.entries()].filter(([, n]) => n > 1).map(([k]) => k),
    sameTeam: [...seenTeam.entries()].filter(([, n]) => n > 1).map(([k]) => k),
  };
}

/**
 * The four numbers behind the sheet's diagnostic line — "pool → eligible → after band →
 * games" — so Josh can see WHICH control is binding before he reads a failure. Computed
 * through the same filters `generate` uses, so the line can never disagree with the answer.
 */


export function poolCounts<P>(
  pool: GenPool<P>,
  spec: GenSpec,
): { pool: number; eligible: number; inBand: number; games: number } {
  const band = bandDec(spec.legMinAm, spec.legMaxAm);
  const elig = eligible(pool, spec);
  const inBand = elig.filter((l) => inDec(l.dec, band));
  return {
    pool: pool.legs.length,
    eligible: elig.length,
    inBand: inBand.length,
    games: new Set(inBand.map((l) => l.gameKey)).size,
  };
}

/** The UI's relative bands use the generator's exact eligibility and odds bounds. */
export function mixCandidates<P>(pool: GenPool<P>, spec: GenSpec): GenLeg<P>[] {
  const band = bandDec(spec.legMinAm, spec.legMaxAm);
  return eligible(pool, spec).filter((l) => inDec(l.dec, band));
}

/* ---------------------------------------------------------------------- search */

type Ctx<P> = {
  spec: GenSpec;
  n: number;
  band: { lo: number; hi: number };
  pins: (GenLeg<P> | null)[];
  /**
   * The set the seeded order is drawn from: in-band and eligible, id-sorted, and DELIBERATELY
   * pin-independent — it still contains the pinned legs and the legs that clash with them
   * (`fits` rejects those at seating time).
   *
   * That independence is what makes "keep this one, spin the others" mean what Josh means by it
   * (INSTRUCTION 50 fix pass). Removing a pinned leg from the sampling set changes the walk for
   * every draw after it, so merely tapping "keep" on slot 0 re-rolled slots 1-3 — the opposite
   * of a lock. With the set fixed, seating a pin consumes it from the same order the unpinned
   * run already followed, and the other slots stay exactly where they were.
   */
  cands: GenLeg<P>[];
  crossGamePlayers: boolean;
};

/**
 * Eligibility that is NOT the band: side, book and price-source filters.
 *
 * The side is read off the HOISTED field (INSTRUCTION 52). It used to be recovered from the leg
 * id by string suffix (`id.endsWith("|o")`), which only worked because MLB's `playerLeg` happens
 * to mint its ids that way — a football row key ("g1|pass_yds|ty-simpson|over|245.5") would have
 * been silently read as an under, quietly breaking the one control Josh sets most.
 */
export function availableLegBand<P>(pool: GenPool<P>, spec: GenSpec): Pick<GenSpec, "legMinAm" | "legMaxAm"> | null {
  const legs = eligible(pool, spec).sort((a, b) => a.dec - b.dec);
  if (!legs.length) return null;
  return { legMinAm: legs[0].am, legMaxAm: legs[legs.length - 1].am };
}

function eligible<P>(pool: GenPool<P>, spec: GenSpec): GenLeg<P>[] {
  const want = new Set<GenSide>(sidesOf(spec.sides));
  return pool.legs.filter((l) => {
    if (spec.timing && !spec.timing.includes(l.started ? "live" : "pregame")) return false;
    if (spec.sports && l.sport && !spec.sports.includes(l.sport)) return false;
    if (spec.noMarkets || !inGameTimeWindow(l.start, spec.timeWindow)) return false;
    if (spec.phase === "live" && !l.started) return false;
    if (spec.phase === "pregame" && l.started) return false;
    if (!want.has(l.side)) return false;
    if (spec.czOnly && l.book !== (spec.pricingBook ?? SETTLE_BOOK_SHORT)) return false;
    if (spec.modelOnly && l.src !== "model") return false;
    if (spec.positions?.length && (!l.position || !spec.positions.includes(l.position))) return false;
    /* the hit-rate floor (2026-09-18): a leg whose player has no game-log data cannot clear it —
       excluded rather than waved through, and the relax hint names the floor as the cause */
    if (spec.minHit != null && !(l.hit && l.hit.rate >= spec.minHit)) return false;
    if (spec.games?.length && !spec.games.includes(l.gameKey)) return false;
    return true;
  });
}

/** the categories the spread rule must cover: every selected market that has a candidate at all */
/* A Ctx is built once per Prep and never mutated, so these per-ctx derivations are computed once
   and read by every seeded fill that shares it (2026-09-26 perf pass). */
const spreadMemo = new WeakMap<object, readonly string[]>();
const byPriceMemo = new WeakMap<object, readonly GenLeg<unknown>[]>();
function spreadTargets<P>(ctx: Ctx<P>): readonly string[] {
  let hit = spreadMemo.get(ctx);
  if (!hit) spreadMemo.set(ctx, (hit = spreadTargetsOf(ctx)));
  return hit;
}
function spreadTargetsOf<P>(ctx: Ctx<P>): readonly string[] {
  const wanted = specMarkets(ctx.spec);
  if (wanted.length < 2 || ctx.spec.spread === false) return [];
  const present = new Set(ctx.cands.map((l) => l.market).filter((m): m is string => !!m));
  for (const p of ctx.pins) if (p?.market) present.add(p.market);
  const targets = wanted.filter((m) => present.has(m));
  /* fewer legs than categories: cover as many as the legs allow — never fail a 2-leg ticket for
     not carrying three categories */
  return targets.slice(0, Math.min(targets.length, ctx.n));
}

/** Exact player-to-game matching. Separate player/game counts can overstate
 * capacity on doubleheaders when several players share their only available game.
 *
 * Under R2b (one per team) the unit that owns a seat is the TEAM rather than the player — two
 * players of one club can never both sit, so the club is one node with the union of its players'
 * games — and a leg with no team tag stays its own player node. The matching below is then exact
 * for every combination of the two rules. */
function capacity<P>(cands: readonly GenLeg<P>[], pins: readonly GenLeg<P>[], onePerGame: boolean, onePerTeam = false): number {
  const usedP = new Set(pins.map((p) => p.playerKey));
  const usedG = new Set(pins.map((p) => p.gameKey));
  const usedT = new Set(pins.flatMap((p) => (p.team != null ? [p.team] : [])));
  const choices = new Map<string, Set<string>>();
  for (const c of cands) {
    if (usedP.has(c.playerKey) || (onePerGame && usedG.has(c.gameKey))) continue;
    if (onePerTeam && c.team != null && usedT.has(c.team)) continue;
    const node = onePerTeam && c.team != null ? `team:${c.team}` : `player:${c.playerKey}`;
    if (!choices.has(node)) choices.set(node, new Set());
    choices.get(node)!.add(c.gameKey);
  }
  if (!onePerGame) return pins.length + choices.size;
  const owner = new Map<string, string>();
  const seat = (player: string, seen: Set<string>): boolean => {
    for (const game of choices.get(player) ?? []) {
      if (seen.has(game)) continue;
      seen.add(game);
      const prior = owner.get(game);
      if (prior === undefined || seat(prior, seen)) { owner.set(game, player); return true; }
    }
    return false;
  };
  for (const player of choices.keys()) seat(player, new Set());
  return pins.length + owner.size;
}

function crossesGames(legs: readonly GenLeg[], keyOf: (l: GenLeg) => string | null = (l) => l.playerKey): boolean {
  const games = new Map<string, string>();
  for (const l of legs) {
    const k = keyOf(l);
    if (k == null) continue;
    if (games.has(k) && games.get(k) !== l.gameKey) return true;
    games.set(k, l.gameKey);
  }
  return false;
}

/** Fisher-Yates over a copy, drawing from the seeded stream. */
function shuffled<T>(xs: readonly T[], rng: () => number): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/**
 * The order the fill walks: the highest-EV slice sampled WITHOUT replacement with weight
 * exp(ev% / 3), then everything else in a plain seeded shuffle.
 *
 * This is a PREFERENCE FOR GENUINE EDGE, never a claim of one: `ev` is the engine's own
 * model number against the posted price where it has one, and market-priced legs (the
 * de-vigged fair) sit at EV ≈ 0 by construction and are weighted accordingly — not dressed
 * up, not hidden.
 */
const byEvOrder = <P,>(cands: readonly GenLeg<P>[]): GenLeg<P>[] =>
  cands.slice().sort((a, b) => b.ev - a.ev || (a.id < b.id ? -1 : 1));

/* `byEv` is seed-independent, so a caller that walks one candidate set under many seeds sorts it
   once (see Prep); it is only read here, never mutated. */
function sampleOrder<P>(cands: readonly GenLeg<P>[], rng: () => number, legs: number, byEv: readonly GenLeg<P>[] = byEvOrder(cands)): GenLeg<P>[] {
  const topN = Math.max(40, 8 * legs);
  const head = byEv.slice(0, topN);
  const tail = byEv.slice(topN);
  const out: GenLeg<P>[] = [];
  const w = head.map((l) => Math.exp((l.ev * 100) / EV_TEMP));
  const live = head.slice();
  let total = w.reduce((a, b) => a + b, 0);
  while (live.length) {
    let r = rng() * total;
    let i = 0;
    for (; i < live.length - 1; i++) {
      r -= w[i];
      if (r <= 0) break;
    }
    out.push(live[i]);
    total -= w[i];
    live.splice(i, 1);
    w.splice(i, 1);
  }
  out.push(...shuffled(tail, rng));
  return out;
}

type Slots<P> = { legs: (GenLeg<P> | null)[]; usedP: Set<string>; usedG: Set<string>; usedT: Set<string>; ids: Set<string> };

/** the rules a seat is checked against — R2 (one per game) and R2b (one per team) */
type SeatRules = Pick<GenSpec, "onePerGame" | "onePerTeam">;

/** R1 / R2 / R2b in ONE place: would seating `l` beside an already-seated `p` break a rule that is on? */
const exclusiveScorers = <P,>(a: GenLeg<P>, b: GenLeg<P>) =>
  a.gameKey === b.gameKey && a.market === "first_td" && b.market === "first_td";
const blocks = <P,>(rules: SeatRules, p: GenLeg<P>, l: GenLeg<P>) =>
  p.playerKey === l.playerKey
  || exclusiveScorers(p, l)
  || (rules.onePerGame && p.gameKey === l.gameKey)
  || (!!rules.onePerTeam && l.team != null && p.team === l.team);

function seatPins<P>(ctx: Ctx<P>): Slots<P> {
  const legs: (GenLeg<P> | null)[] = new Array(ctx.n).fill(null);
  const usedP = new Set<string>();
  const usedG = new Set<string>();
  const usedT = new Set<string>();
  const ids = new Set<string>();
  ctx.pins.forEach((p, i) => {
    if (!p) return;
    legs[i] = p;
    usedP.add(p.playerKey);
    usedG.add(p.gameKey);
    if (p.team != null) usedT.add(p.team);
    ids.add(p.id);
  });
  return { legs, usedP, usedG, usedT, ids };
}

const fits = <P,>(s: Slots<P>, c: GenLeg<P>, rules: SeatRules) =>
  !s.legs.some(l => l != null && exclusiveScorers(l, c)) && !s.ids.has(c.id) && !s.usedP.has(c.playerKey) && !(rules.onePerGame && s.usedG.has(c.gameKey))
  && !(rules.onePerTeam && c.team != null && s.usedT.has(c.team));

function seat<P>(s: Slots<P>, c: GenLeg<P>, i: number) {
  s.legs[i] = c;
  s.usedP.add(c.playerKey);
  s.usedG.add(c.gameKey);
  if (c.team != null) s.usedT.add(c.team);
  s.ids.add(c.id);
}

/**
 * Fill the free slots from `order`. `maxDec` prunes candidates that would price the
 * ticket past the combined band's ceiling (the same pruning the CFB builder does,
 * src/lib/cfb/picks.ts:301,317); null when the order runs out before the slots fill.
 */
function fillSlots<P>(ctx: Ctx<P>, order: readonly GenLeg<P>[], maxDec: number | null): GenLeg<P>[] | null {
  const s = seatPins(ctx);
  const spread = spreadTargets(ctx);
  let byPrice = (maxDec == null ? [] : byPriceMemo.get(ctx)) as readonly GenLeg<P>[] | undefined;
  if (!byPrice) byPriceMemo.set(ctx, (byPrice = ctx.cands.slice().sort((a, b) => a.dec - b.dec)));
  let dec = s.legs.reduce((d, l) => (l ? d * l.dec : d), 1);
  for (const c of order) {
    const i = s.legs.indexOf(null);
    if (i < 0) break;
    if (!fits(s, c, ctx.spec)) continue;
    if (maxDec != null) {
      let floor = dec * c.dec;
      const remaining = ctx.n - s.ids.size - 1;
      let found = 0;
      for (const next of byPrice) {
        if (found >= remaining) break;
        if (!fits(s, next, ctx.spec) || blocks(ctx.spec, c, next)) continue;
        floor *= next.dec;
        found++;
      }
      // Optimistic remaining price: it can understate the true minimum when
      // alternate lines clash, but can never reject a feasible cheaper ticket.
      if (floor > maxDec || found < remaining) continue;
    }
    // On a doubleheader, preserve a completion for the other slots. Ordinary
    // slates take the fast path; no matching lookahead is needed there.
    if (ctx.spec.onePerGame && ctx.crossGamePlayers && capacity(ctx.cands,
      [...s.legs.filter((l): l is GenLeg<P> => l !== null), c], true, ctx.spec.onePerTeam) < ctx.n) continue;
    /* SPREAD ACROSS CATEGORIES (2026-09-18): with several markets selected, every one of them
       lands on the ticket at least once. A completion check — a
       candidate is skipped when seating it would leave more uncovered categories than free
       slots, or would strand a category with no seatable leg left. */
    if (spread.length) {
      const selected = [...s.legs.filter((l): l is GenLeg<P> => !!l), c];
      const covered = new Set(selected.map((l) => l.market));
      const missing = spread.filter((m) => !covered.has(m));
      const free = ctx.n - selected.length;
      if (missing.length > free) continue;
      if (missing.some((m) => !ctx.cands.some((l) => l.market === m && !selected.some((p) => blocks(ctx.spec, p, l))))) continue;
    }
    seat(s, c, i);
    dec *= c.dec;
  }
  if (spread.length && !spread.every((m) => s.legs.some((l) => l?.market === m))) return null;
  return s.legs.every((l): l is GenLeg<P> => !!l) ? (s.legs as GenLeg<P>[]) : null;
}

/** The cheapest and dearest combined prices R1/R2 allow from this candidate set. */
function reachOf<P>(ctx: Ctx<P>): { minDec: number; maxDec: number } | null {
  const pick = (dir: 1 | -1): number | null => {
    const order = ctx.cands.slice().sort((a, b) => dir * (a.dec - b.dec) || (a.id < b.id ? -1 : 1));
    const legs = fillSlots(ctx, order, null);
    return legs ? legs.reduce((d, l) => d * l.dec, 1) : null;
  };
  const lo = pick(1);
  const hi = pick(-1);
  return lo != null && hi != null ? { minDec: lo, maxDec: hi } : null;
}

/**
 * Bounded repair toward the combined band: swap one free slot at a time for the candidate
 * that moves log(price) closest to the band's geometric centre. Deterministic, capped by
 * REPAIR_TRIES × REPAIR_SCAN, and it never touches a pinned slot.
 */
function repairPayout<P>(
  ctx: Ctx<P>,
  start: readonly GenLeg<P>[],
  order: readonly GenLeg<P>[],
  band: { lo: number; hi: number },
): { legs: GenLeg<P>[]; dropped: string[] } | null {
  const target = Math.sqrt(band.lo * band.hi);
  const cur = start.slice();
  const dropped: string[] = [];
  const free = cur.map((_, i) => i).filter((i) => !ctx.pins[i]);
  let dec = cur.reduce((d, l) => d * l.dec, 1);
  /* ALREADY THERE. This test must come BEFORE the "nothing to swap" bail: with every slot
     pinned there is no free slot, but the pinned ticket may price squarely inside the target
     band — bailing first reported "only just out of reach" about a ticket that was in range
     (INSTRUCTION 50 fix pass). Nothing to repair is a success when there is nothing to fix. */
  if (dec >= band.lo && dec <= band.hi) return { legs: cur, dropped };
  if (!free.length) return null;
  for (let t = 0; t < REPAIR_TRIES; t++) {
    if (dec >= band.lo && dec <= band.hi) return { legs: cur, dropped };
    const slot = free[t % free.length];
    const base = dec / cur[slot].dec;
    const others = cur.filter((_, i) => i !== slot);
    const ids = new Set(others.map((l) => l.id));
    const players = new Set(others.map((l) => l.playerKey));
    const games = new Set(others.map((l) => l.gameKey));
    const teams = new Set(others.flatMap((l) => (l.team != null ? [l.team] : [])));
    let best: GenLeg<P> | null = null;
    let bestGap = Math.abs(Math.log(dec) - Math.log(target));
    let scanned = 0;
    for (const c of order) {
      if (scanned >= REPAIR_SCAN) break;
      if (ids.has(c.id) || players.has(c.playerKey) || others.some(l => exclusiveScorers(l, c))) continue;
      if (ctx.spec.onePerGame && games.has(c.gameKey)) continue;
      if (ctx.spec.onePerTeam && c.team != null && teams.has(c.team)) continue;
      scanned++;
      const gap = Math.abs(Math.log(base * c.dec) - Math.log(target));
      if (gap < bestGap - 1e-12) {
        bestGap = gap;
        best = c;
      }
    }
    if (!best) break;
    dropped.push(cur[slot].id);
    cur[slot] = best;
    dec = base * best.dec;
  }
  return dec >= band.lo && dec <= band.hi ? { legs: cur, dropped } : null;
}

/** The two real posted prices nearest the band — one below it, one above it. */
function nearestPosted<P>(cands: readonly GenLeg<P>[], band: { lo: number; hi: number }) {
  let below: GenLeg<P> | null = null;
  let above: GenLeg<P> | null = null;
  for (const c of cands) {
    if (c.dec < band.lo && (!below || c.dec > below.dec)) below = c;
    if (c.dec > band.hi && (!above || c.dec < above.dec)) above = c;
  }
  return { belowAm: below ? below.am : null, aboveAm: above ? above.am : null };
}

/** Which single relaxation — and only one that is actually engaged — would open the pool up. */
type Relax = "same-game" | "same-team" | "started" | "cz" | "model" | "positions" | "hit" | "games" | null;

function relaxHint<P>(pool: GenPool<P>, spec: GenSpec, pins: GenLeg<P>[], want: number): Relax {
  const band = bandDec(spec.legMinAm, spec.legMaxAm);
  const pinIds = new Set(pins.map((p) => p.id));
  const cands = (s: GenSpec) =>
    eligible(pool, s).filter((l) => !pinIds.has(l.id) && inDec(l.dec, band) && !clashes(l, pins, s));
  const fitsWith = (s: GenSpec) => capacity(cands(s), pins, s.onePerGame, s.onePerTeam) >= want;
  /* R2 first, and it is named when the game switch — alone, or together with the team switch
     behind it — would fit: on an ordinary slate one-per-game already implies one-per-team, so the
     game switch is always the first step, and the next spin names the team switch if it is still
     the one binding. R2b on its own is named only when it is the one that actually binds (two
     legs from one game already on, or a doubleheader). */
  if (spec.onePerGame && (fitsWith({ ...spec, onePerGame: false })
    || (spec.onePerTeam && fitsWith({ ...spec, onePerGame: false, onePerTeam: false })))) return "same-game";
  if (spec.onePerTeam && fitsWith({ ...spec, onePerTeam: false })) return "same-team";
  if (spec.czOnly && fitsWith({ ...spec, czOnly: false })) return "cz";
  if (spec.modelOnly && fitsWith({ ...spec, modelOnly: false })) return "model";
  if (spec.positions?.length && fitsWith({ ...spec, positions: [] })) return "positions";
  if (spec.minHit != null && fitsWith({ ...spec, minHit: null })) return "hit";
  if (spec.games?.length && fitsWith({ ...spec, games: [] })) return "games";
  /* started rows were dropped before the pool existed, so this one is a SUGGESTION — the
     caller has to rebuild the pool to find out, and may still land on an honest failure. */
  if (!spec.phase && !spec.includeStarted && pool.startedDropped > 0) return "started";
  return null;
}

const clashes = <P,>(l: GenLeg<P>, pins: readonly GenLeg<P>[], rules: SeatRules) =>
  pins.some((p) => blocks(rules, p, l));

/**
 * Generate one ticket. Honours the leg count EXACTLY, the market, the per-leg band and
 * (when set) the combined payout band; pins keep their slot; everything else spins off the
 * seed. Returns a typed failure rather than a ticket that quietly broke one of them.
 *
 * `avoid` holds the keys of the last few tickets so "Regenerate" moves — but a spin is
 * never failed merely because the pool is small: after ROLL_RETRIES re-seeds the ticket is
 * returned anyway.
 */
export function generate<P>(
  pool: GenPool<P>,
  spec: GenSpec,
  seed: number,
  avoid?: ReadonlySet<string>,
  recentPlayers?: ReadonlyMap<string, number>,
  memo?: GenMemo,
): GenResult<P> {
  if (spec.betType === "model" || spec.strategies || spec.preferDiversity) return strategyGenerate(pool, spec, seed, avoid, recentPlayers, generate);
  const prep = (memo?.prep as Prep<P> | undefined) ?? prepare(pool, spec);
  if (memo) memo.prep = prep;
  if (prep.done) return prep.done;
  const { n, seated, have, ctx, payoutBand, reachAm } = prep;
  const orderFor = (s: number) => spec.style
    ? mixOrder(ctx.cands, spec.style, mulberry32(s), recentPlayers, (prep.tiers ??= mixBands(ctx.cands)))
    : sampleOrder(ctx.cands, mulberry32(s), n, (prep.byEv ??= byEvOrder(ctx.cands)));

  if (payoutBand) {
    for (let roll = 0; roll <= ROLL_RETRIES; roll++) {
      const s = (seed + roll) >>> 0;
      const order = orderFor(s);
      const first = fillSlots(ctx, order, payoutBand.hi) ?? fillSlots(ctx, order, null);
      if (!first) continue;
      const fixed = repairPayout(ctx, first, order, payoutBand);
      if (!fixed) continue;
      const t = ticketOf(fixed.legs, ctx.spec, s);
      const ticket: GenTicket<P> = { ...t, dropped: fixed.dropped };
      if (avoid?.has(ticket.key) && roll < ROLL_RETRIES) continue;
      return { ok: true, ticket };
    }
    return { ok: false, fail: { code: "payout-not-found", reach: reachAm! } };
  }

  let last: GenTicket<P> | null = null;
  for (let roll = 0; roll <= ROLL_RETRIES; roll++) {
    const s = (seed + roll) >>> 0;
    const legs = fillSlots(ctx, orderFor(s), null);
    if (!legs) break; // capacity said this cannot happen; if it ever does, fail honestly below
    const ticket = ticketOf(legs, ctx.spec, s);
    last = ticket;
    if (!avoid?.has(ticket.key)) return { ok: true, ticket };
  }
  if (last) return { ok: true, ticket: last }; // a small pool may only have one answer — say it by repeating it
  return { ok: false, fail: { code: "short-pool", have, want: n, relax: relaxHint(pool, spec, seated, n) } };
}

/**
 * Handed from `strategyGenerate` to its 32-64 `generate` runs, which share ONE pool and ONE spec
 * and differ only by seed. The first run fills it with the seed-independent setup; the rest reuse
 * it. 2026-09-26 perf pass (Josh: "Parlay Builder is moving EXTREMELY SLOW") — a single-strategy
 * spec re-derived eligibility, capacity, the mix bands and the payout reach 32 times per render.
 * Output is unchanged: seed, `avoid` and `recentPlayers` all enter after this point.
 */
export type GenMemo = { prep?: unknown };

type Prep<P> =
  | { done: GenResult<P> }
  | {
      done: null;
      n: number;
      seated: GenLeg<P>[];
      have: number;
      ctx: Ctx<P>;
      payoutBand: { lo: number; hi: number } | null;
      reachAm: { minAm: number; maxAm: number } | null;
      byEv?: GenLeg<P>[];
      tiers?: Map<string, MixBand>;
    };

/** Everything in `generate` that is a pure function of (pool, spec): rule checks, eligibility,
 * the band, capacity and — with a payout band — its reach. A failure is carried as `done`. */
function prepare<P>(pool: GenPool<P>, spec: GenSpec): Prep<P> {
  const fail = (f: GenFail): Prep<P> => ({ done: { ok: false, fail: f } });
  if (spec.noMarkets) return fail({ code: "no-rows" });
  const n = clampLegs(spec.legs);
  const band = bandDec(spec.legMinAm, spec.legMaxAm);

  /* ---- pins first: a pin the board no longer carries is a failure, never a silent drop */
  const slotPins = spec.pinned.slice(0, n);
  const missing: string[] = [];
  const pins: (GenLeg<P> | null)[] = new Array(n).fill(null);
  slotPins.forEach((id, i) => {
    if (!id) return;
    const l = pool.byId.get(id);
    if (!l || (spec.sports && l.sport && !spec.sports.includes(l.sport)) || (spec.timing && !spec.timing.includes(l.started ? "live" : "pregame")) || !inGameTimeWindow(l.start, spec.timeWindow) || (spec.phase==="pregame" && l.started) || (spec.phase==="live" && !l.started)) missing.push(id);
    else pins[i] = l;
  });
  if (missing.length) return fail({ code: "pin-missing", ids: missing });

  const seated = pins.filter((p): p is GenLeg<P> => !!p);
  const wrongPosition = seated.filter((p) => spec.positions?.length && (!p.position || !spec.positions.includes(p.position)));
  if (wrongPosition.length) return fail({ code: "pin-position", ids: wrongPosition.map((p) => p.id) });
  for (let i = 0; i < seated.length; i++) {
    for (let j = i + 1; j < seated.length; j++) {
      if (seated[i].playerKey === seated[j].playerKey)
        return fail({ code: "pin-conflict", ids: [seated[i].id, seated[j].id], why: "same-player" });
      if (exclusiveScorers(seated[i], seated[j]) || (spec.onePerGame && seated[i].gameKey === seated[j].gameKey))
        return fail({ code: "pin-conflict", ids: [seated[i].id, seated[j].id], why: "same-game" });
      if (spec.onePerTeam && seated[i].team != null && seated[i].team === seated[j].team)
        return fail({ code: "pin-conflict", ids: [seated[i].id, seated[j].id], why: "same-team" });
    }
  }

  /* ---- eligibility, then the band */
  const elig = eligible(pool, spec);
  if (!elig.length && seated.length < n) {
    /* WHICH filter emptied it (INSTRUCTION 52 fix pass). `no-rows` reads on the page as "No
       Anytime TD lines on this board", a statement ABOUT THE BOARD — and football made that
       reachable on a board that is full of them: anytime TD posts a YES and no under, so asking
       for unders there emptied `elig` while the rows sat plainly on screen underneath. The pool
       itself says whether the board was empty; when it was not, the side filter is named when it
       is the cause (with the posted side, so the sheet can offer it as one tap), and the book /
       price-source filters fall through to short-pool, which names the relaxation that opens it
       up. Nothing is relaxed here — only reported. */
    if (pool.legs.length) {
      const want = spec.sides;
      if (want !== "both") {
        const has: GenSide = want === "u" ? "o" : "u";
        const other = eligible(pool, { ...spec, sides: has });
        if (other.length) return fail({ code: "one-sided", want, has, rows: other.length });
      }
      return fail({ code: "short-pool", have: seated.length, want: n, relax: relaxHint(pool, spec, seated, n) });
    }
    return fail({ code: "no-rows" });
  }
  const pinIds = new Set(seated.map((p) => p.id));
  const free = elig.filter((l) => !pinIds.has(l.id) && !clashes(l, seated, spec));
  /* the sampling set (pin-independent — see Ctx.cands) and the CAPACITY set (what is actually
     still seatable given the pins) are two different questions and are counted separately */
  const sampleSet = elig.filter((l) => inDec(l.dec, band));
  const cands = free.filter((l) => inDec(l.dec, band));
  /* TWO DIFFERENT FAILURES, TOLD APART (INSTRUCTION 50 fix pass). `cands` has already had the
     legs that clash with a pin removed, so an empty `cands` can mean either "no leg is priced
     in this band" (a PRICE problem — widen the band) or "the pins have consumed every game the
     band offers" (a CAPACITY problem — widening the band cannot help). Reporting the second as
     band-empty quoted "the closest posted prices" while in-band legs plainly existed, and
     handed Josh a remedy that does nothing. band-empty is now raised only when the band really
     is empty of un-pinned eligible legs; otherwise this falls through to the capacity check
     below, which says short-pool and names the relaxation that would actually open it up. */
  const inBandAll = elig.filter((l) => !pinIds.has(l.id) && inDec(l.dec, band));
  if (!inBandAll.length && seated.length < n) {
    return fail({ code: "band-empty", rows: elig.length, nearest: nearestPosted(free, band) });
  }


  /* ---- can the rules even be satisfied? exact, so the message is never a guess */
  const have = capacity(cands, seated, spec.onePerGame, spec.onePerTeam);
  if (have < n) {
    return fail({ code: "short-pool", have, want: n, relax: relaxHint(pool, spec, seated, n) });
  }

  /* the doubleheader lookahead also arms when a TEAM has legs in two games and R2b is on — on such
     a slate a greedy seat can strand the fill even though no single player crosses games */
  const ctx: Ctx<P> = { spec: { ...spec, legs: n }, n, band, pins, cands: sampleSet,
    crossGamePlayers: crossesGames(sampleSet) || (!!spec.onePerTeam && crossesGames(sampleSet, (l) => l.team)) };
  const payoutBand = spec.payout ? bandDec(spec.payout.minAm, spec.payout.maxAm) : null;

  let reachAm: { minAm: number; maxAm: number } | null = null;
  if (payoutBand) {
    const reach = reachOf(ctx);
    if (!reach) return fail({ code: "short-pool", have, want: n, relax: relaxHint(pool, spec, seated, n) });
    reachAm = { minAm: decToAm(reach.minDec), maxAm: decToAm(reach.maxDec) };
    // Greedy feasible examples are not mathematical bounds. Ignore conflicts to
    // obtain safe outer bounds before declaring a payout impossible.
    const freeSlots = n - seated.length;
    const loose = ctx.cands.filter((l) => !pinIds.has(l.id)).map((l) => l.dec).sort((a, b) => a - b);
    const base = seated.reduce((d, l) => d * l.dec, 1);
    const lower = base * loose.slice(0, freeSlots).reduce((d, price) => d * price, 1);
    const upper = base * (freeSlots ? loose.slice(-freeSlots).reduce((d, price) => d * price, 1) : 1);
    if (upper < payoutBand.lo || lower > payoutBand.hi) {
      return fail({ code: "payout-unreachable", reach: reachAm });
    }
  }
  return { done: null, n, seated, have, ctx, payoutBand, reachAm };
}
