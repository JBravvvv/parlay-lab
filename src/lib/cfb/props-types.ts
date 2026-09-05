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
};

export type CfbParlayTier = "SAFER" | "LONGSHOT" | "MIX";
export type CfbParlayView = "parlays" | "mixed" | "live";

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
};

export type CfbParlay = {
  id: string;
  view: CfbParlayView;
  tier: CfbParlayTier;
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
  parlays: CfbParlay[];
  mixed: CfbParlay[];
  live: CfbParlay[];
  /** keys: all, ml, spread, total, anytime_td, pass_tds, pass_yds, receptions, rush_yds, rec_yds */
  categories: Record<string, CfbPickRow[]>;
};
