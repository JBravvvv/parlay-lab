/**
 * CFB PLAYER PROPS + PARLAYS — the shared contract (types and constants only; no runtime
 * dependency beyond `./types` and the shared letter-grade type). Every CFB props module (route, model, components) builds
 * against these. Nothing here is ever fabricated: a price is a posted book quote, a line is
 * the book's own number, a missing value is null and renders "—".
 */
import type { Grade } from "@/lib/grade";
import type { CfbQuote, CfbStatus } from "./types";

export type CfbPropMarket = "anytime_td" | "pass_tds" | "pass_yds" | "receptions" | "rush_yds" | "rec_yds";

export const CFB_PROP_MARKETS: readonly {
  id: CfbPropMarket;
  /** The Odds API market key */
  odds: string;
  label: string;
  short: string;
  /** "ou" = over/under on a line; "yes" = a yes-only market (anytime TD) */
  kind: "ou" | "yes";
  stat: "passing" | "rushing" | "receiving" | "td";
}[] = [
  { id: "anytime_td", odds: "player_anytime_td", label: "Anytime TD", short: "ATD", kind: "yes", stat: "td" },
  { id: "pass_tds", odds: "player_pass_tds", label: "Pass TDs", short: "PTD", kind: "ou", stat: "passing" },
  { id: "pass_yds", odds: "player_pass_yds", label: "Pass Yds", short: "PYD", kind: "ou", stat: "passing" },
  { id: "receptions", odds: "player_receptions", label: "Receptions", short: "REC", kind: "ou", stat: "receiving" },
  { id: "rush_yds", odds: "player_rush_yds", label: "Rush Yds", short: "RYD", kind: "ou", stat: "rushing" },
  { id: "rec_yds", odds: "player_reception_yds", label: "Rec Yds", short: "RCY", kind: "ou", stat: "receiving" },
] as const;

/** the six Odds API market keys, comma-joined for the `markets=` query */
export const CFB_PROPS_ODDS_MARKETS: string = CFB_PROP_MARKETS.map((m) => m.odds).join(",");

export type CfbPropSide = "over" | "under" | "yes";

/** One posted prop price at one book; `line` is the book's own number (null for anytime TD). */
export type CfbPropQuote = { book: string; title: string; price: number; line: number | null; dec: number };

export type CfbPropRow = {
  /** `${gameId}|${market}|${playerSlug}|${side}|${line ?? ""}` */
  key: string;
  gameId: string;
  oddsEventId: string;
  market: CfbPropMarket;
  side: CfbPropSide;
  player: string;
  team: string | null;
  teamId: string | null;
  teamAbbr: string | null;
  opp: string | null;
  /** ISO kickoff instant */
  kickoff: string;
  status: CfbStatus;
  /** "Ty Simpson O 245.5 Pass Yds" | "R. Williams Anytime TD" */
  label: string;
  /** "ALA vs ECU · Sat 9:00 AM" */
  sub: string;
  line: number | null;
  /** model probability (0..1) the side hits, null when unpriced */
  fair: number | null;
  fairAm: number | null;
  /** books behind the consensus */
  books: number;
  cz: CfbPropQuote | null;
  best: CfbPropQuote | null;
  dk: CfbPropQuote | null;
  fd: CfbPropQuote | null;
  /** % EV at Caesars */
  evCz: number | null;
  /** % EV at `best` */
  evBest: number | null;
  grade: Grade | null;
  kelly: number | null;
  playable: boolean;
  /** season context for the player's stat: games played, per-game average, season total */
  ctx: { g: number; perGame: number | null; season: number | null } | null;
};

export type CfbPropsBoard = {
  date: string;
  /** eligible events on the slate */
  events: number;
  /** events actually priced */
  fetched: number;
  /** true when `events` exceeded the per-slate fetch cap */
  capped: boolean;
  rows: CfbPropRow[];
  quota: { remaining: number | null; used: number | null } | null;
  oddsMissing: boolean;
  generatedAt: string;
  /** where the rows came from: the Redis-persisted board, a fresh pull, or nothing (no key / budget used up) */
  source?: "redis" | "fetch" | "none";
  /** true when today's credit budget cut the pull short (fetched < events, possibly 0) */
  budgeted?: boolean;
  /** credits the props route has spent this Pacific day, null when no store is configured */
  spentToday?: number | null;
  /** a plain-language remark on the answer (only set when there is something to say) */
  note?: string;
  /** priced events that were in play when the board was built (INSTRUCTION 40) */
  live?: number;
  /** the cache window (s) this board was written under — CFB_PROPS.liveRevalidateSec when `live` > 0, else revalidateSec */
  ttlSec?: number;
  /** ids of the games whose rows are on this board (fetched this pull or carried over from the stored one) */
  priced?: string[];
  /** true when the answer carries lines the current window would have re-priced but the daily budget refused — read `generatedAt` */
  stale?: boolean;
  /** ISO instant each game in `priced` was last pulled from the API (INSTRUCTION 42, 2026-09-05) — the
      empty-event rule and the per-game carry window read it; a game absent here (boards written
      before the field existed) is dated by `generatedAt` */
  pricedAt?: Record<string, string>;
  /** INSTRUCTION 42 (2026-09-05, review fix): true when this answer's board could not be persisted to
      the store (the write threw) — the next request then has no carried rows / pricedAt to lean on */
  storeWriteFailed?: boolean;
  /** THE CAESARS-MISSING RULE (2026-09-05): priced UPCOMING games on this answer that carry rows and, on
      some market with rows, no Caesars quote (other books posted, Caesars not yet — `czMissingGameIds`) —
      re-asked every CFB_PROPS.czMissingRevalidateSec inside czMissingWindowSec of kickoff, and while > 0
      the board's `ttlSec` is shortened to that cadence. Counted over the games in `priced`, never over
      unpriced ones; a game with zero rows is `noProps`, never `czMissing`. */
  czMissing: number;
  /** priced games on this answer with ZERO rows — no two-sided quote on a tracked market at the books we price (the small games) */
  noProps: number;
};

export type CfbParlayTier = "SAFER" | "LONGSHOT" | "MIX";
export type CfbParlayView = "parlays" | "mixed" | "live";

/** INSTRUCTION 42 (2026-09-05): the twelve parlay category sets, in the Board's pill order —
    one per side market, one per prop market, COMBOS (side + prop on one ticket), MIXED
    (a live leg beside pregame legs) and LIVE (in-play legs only). INSTRUCTION 44 (2026-09-05):
    the single-market sets and COMBOS draw from pregame AND in-game legs. Up to CFB_PARLAYS.perCategory
    ranked tickets each. */
export const CFB_PARLAY_CATEGORIES = ["ml", "spread", "total", "anytime_td", "pass_tds", "pass_yds", "receptions", "rush_yds", "rec_yds", "combo", "mixed", "live"] as const;
export type CfbParlayCategory = (typeof CFB_PARLAY_CATEGORIES)[number];

export type CfbParlayLeg = {
  kind: "side" | "prop";
  rowKey: string;
  gameId: string;
  label: string;
  sub: string;
  /** Caesars American price */
  cz: number;
  dec: number;
  /** 0..1, conditional on no push */
  prob: number;
  push: number;
  market: string;
  player?: string | null;
  teamId?: string | null;
  /** INSTRUCTION 42 (2026-09-05, review fix): true when the leg's game was in play when priced —
      a MIXED ticket tags that leg instead of badging the whole ticket LIVE */
  live?: boolean;
};

export type CfbParlay = {
  id: string;
  view: CfbParlayView;
  tier: CfbParlayTier;
  /** INSTRUCTION 42: the category set the ticket belongs to (legacy tiered tickets are classified by their legs) */
  category: CfbParlayCategory;
  /** "SIDES" | "PROPS" | "MIXED" | "LIVE" */
  type: string;
  name: string;
  legs: CfbParlayLeg[];
  dec: number;
  am: number;
  /** 0..1 */
  prob: number;
  /** percent */
  ev: number;
  /** true when EVERY leg cleared CFB_PARLAYS.minLegEvPct (−3, grade D or better). False only on a
      single-market category-set ticket built from the tier-2 pool (legs down to `setFloorEvPct`)
      once tier 1 could not fill the set (2026-09-05) — the Board labels those honestly. Legacy
      tiered, combo, mixed and live tickets are always gated. */
  gated: boolean;
  /** INSTRUCTION 44 (2026-09-05): how many legs were priced while their game was in play. The
      single-market sets and combo draw from pregame AND in-game legs, so a ticket here can carry
      1..n live legs beside pregame ones; the Board says "N in-game" on the ticket. A ticket with
      any live leg is never a paper stake — like a live pick row it carries no Kelly figure. */
  liveLegs: number;
  note?: string;
};

export type CfbPickRow = {
  kind: "side" | "prop";
  key: string;
  gameId: string;
  market: string;
  label: string;
  sub: string;
  line: number | null;
  fair: number | null;
  fairAm: number | null;
  cz: CfbPropQuote | CfbQuote | null;
  best: CfbPropQuote | CfbQuote | null;
  evCz: number | null;
  evBest: number | null;
  grade: Grade | null;
  kelly: number | null;
  playable: boolean;
  status: CfbStatus;
  prob: number | null;
  push: number;
};

export type CfbPicks = {
  date: string;
  generatedAt: string;
  /** the legacy tiered upcoming set (SAFER / LONGSHOT / MIX, perView each) */
  parlays: CfbParlay[];
  /** = sets.mixed */
  mixed: CfbParlay[];
  /** = sets.live */
  live: CfbParlay[];
  /** INSTRUCTION 42 (2026-09-05): up to CFB_PARLAYS.perCategory ranked tickets per category */
  sets: Record<CfbParlayCategory, CfbParlay[]>;
  /** INSTRUCTION 42: live rows admitted to the pick categories (kelly null, playable false) */
  liveRows: number;
  /** keys: all, ml, spread, total, anytime_td, pass_tds, pass_yds, receptions, rush_yds, rec_yds — upcoming AND live rows (INSTRUCTION 42) */
  categories: Record<string, CfbPickRow[]>;
};
