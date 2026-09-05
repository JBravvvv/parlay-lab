import type { Grade } from "@/lib/grade";
import type { SyncEntry, SyncTicket } from "@/lib/ledger-merge";

/**
 * COLLEGE FOOTBALL DESK — the shared contract (INSTRUCTION 38, 2026-09-05, Josh's word,
 * verbatim: "Parlay Lab should now be FULLY FUNCTIONING for College Football. Make sure the
 * engine is optimized for each sport individually and make any adjustments you need to *
 * EVERYTHING for College Football (CFB) should be SEPARATE; Tickets for College Football in
 * the Builder should be SEPARATE; Board for CFB should be separate; Ledger & Allotted $ for
 * College Football should be separate (But still $150 Core & $25 Fun money)").
 *
 * Every CFB module (model, card, grade, ledger, route, components) builds against THESE
 * types. The MLB engine is never touched: CFB is its own desk, the way the UFC desk is —
 * a pure market+ratings model over free feeds (ESPN scoreboard + ESPN FPI) and The Odds
 * API's `americanfootball_ncaaf` game lines, with its own ledger, bank and allotment keys.
 *
 * Nothing here is ever fabricated: a price is a posted book quote, a rating is ESPN's own
 * FPI figure, a score is ESPN's own score. A missing feed value is null and renders "—".
 */

export type CfbMarketKey = "ml" | "spread" | "total";
export type CfbSideKey = "home" | "away" | "over" | "under";
export type CfbStatus = "upcoming" | "live" | "final" | "postponed";

export type CfbTeam = {
  /** ESPN team id (also the FPI join key) */
  id: string;
  /** "Indiana Hoosiers" — ESPN displayName (the Odds API join key, via names.ts) */
  name: string;
  /** "Indiana" — ESPN shortDisplayName / location */
  short: string;
  /** "IU" */
  abbr: string;
  /** ESPN CDN logo URL, or null */
  logo: string | null;
  /** AP/CFP curated rank 1–25 when ranked, else null (ESPN curatedRank 99 = unranked) */
  rank: number | null;
  /** "3-0" overall record or null */
  record: string | null;
  /** team color hex without '#', or null */
  color: string | null;
  /** ESPN FPI rating (expected margin vs an average FBS team); null for FCS / unlisted */
  fpi: number | null;
  fpiRank: number | null;
};

/** One posted price at one book. `line` is the book's own point (spread from the SIDE's
    perspective, e.g. -40.5 for the favorite side / +40.5 for the dog side; the total number
    for over/under); null for moneylines. `dec` is the decimal form of `price`. */
export type CfbQuote = { book: string; title: string; price: number; line: number | null; dec: number };

/** The margin model behind a game — every number the row EV is derived from, for The Sharp
    to explain. Margins are HOME − AWAY. `parts` are the inputs that existed for this game. */
export type CfbModel = {
  /** blended expected home margin (points), null when neither market nor FPI priced it */
  muMargin: number | null;
  /** blended expected total (points), null when the market has no total consensus */
  muTotal: number | null;
  sigma: number;
  sigmaTotal: number;
  /** blended home win probability (0..1), null when nothing priced the game */
  pHome: number | null;
  parts: {
    /** de-vigged moneyline consensus P(home), pre-blend */
    mkt: number | null;
    /** P(home) implied by the consensus spread through the normal margin model */
    spread: number | null;
    /** P(home) implied by FPI(home) − FPI(away) + HFA through the normal margin model */
    fpi: number | null;
    /** consensus spread margin (home perspective: +7 means home favored by 7) */
    mktMargin: number | null;
    fpiMargin: number | null;
    mktTotal: number | null;
  };
  /** books behind the consensus per market */
  books: { ml: number; spread: number; total: number };
};

/** One bettable side. `key` doubles as the ledger leg's `lkey`. */
export type CfbRow = {
  /** `${gameId}|${market}|${side}|${line ?? ""}` */
  key: string;
  gameId: string;
  market: CfbMarketKey;
  side: CfbSideKey;
  /** "Indiana ML" · "Indiana -40.5" · "Over 56.5" */
  label: string;
  /** "@ North Texas · Sat 9:00 AM" style context line for cards */
  sub: string;
  teamId: string | null;
  /** consensus line for this side (spread signed for the side; the total number; null for ML) */
  line: number | null;
  /** model probability the side WINS at `line` (0..1) — excludes the push mass */
  fair: number;
  /** push probability at `line` (integer spreads/totals only; 0 on half-points) */
  push: number;
  /** the no-vig American price of `fair` conditional on no push */
  fairAm: number;
  /** de-vigged market consensus probability for this side at `line`, pre-blend (null = none) */
  mkt: number | null;
  /** book count behind `mkt` */
  books: number;
  /** Caesars (williamhill_us), at ITS OWN line — the settling book */
  cz: CfbQuote | null;
  /** best price among books posting the consensus line (or the ML) */
  best: CfbQuote | null;
  dk: CfbQuote | null;
  fd: CfbQuote | null;
  /** Pinnacle when posted (the sharp anchor; weight 2 in the consensus) */
  pin: CfbQuote | null;
  /** % EV at the Caesars quote (fair re-evaluated at Caesars' line when it differs) */
  evCz: number | null;
  /** % EV at `best` */
  evBest: number | null;
  /** gradeFromEv(evCz) */
  grade: Grade | null;
  /** ¼-Kelly stake at Caesars in whole dollars, 2%-of-bankroll cap; 0 when not playable */
  kelly: number;
  /** cz posted AND the game has not kicked off */
  playable: boolean;
};

export type CfbGame = {
  /** ESPN event id — the ledger's `gkey` and `games[].pk` */
  id: string;
  /** Pacific calendar date YYYY-MM-DD of kickoff */
  date: string;
  /** ISO kickoff instant */
  start: string;
  status: CfbStatus;
  /** ESPN's short status text ("Sat 9:00 AM", "Final", "3rd 4:12") or null */
  detail: string | null;
  period: number | null;
  clock: string | null;
  neutral: boolean;
  venue: string | null;
  /** first national broadcast name, or null */
  tv: string | null;
  home: CfbTeam;
  away: CfbTeam;
  homeScore: number | null;
  awayScore: number | null;
  /** ESPN's embedded DraftKings line — CONTEXT ONLY (rendered when the odds feed has no match) */
  espnLine: { spread: number | null; total: number | null; details: string | null } | null;
  /** the matched Odds API event id, null when the feed had no event for this game */
  oddsEventId: string | null;
  model: CfbModel;
  /** every priced side of this game (empty when unmatched) */
  rows: CfbRow[];
};

export type CfbBoard = {
  /** the Pacific date the slate is for */
  date: string;
  /** every Pacific date with an upcoming event in the odds feed, ascending (the date rail) */
  slateDates: string[];
  games: CfbGame[];
  /** ESPN games on the date that no odds event matched */
  unmatched: number;
  /** ESPN's FPI `lastUpdated` stamp, or null when FPI was unavailable */
  fpiUpdated: string | null;
  generatedAt: number;
};

/* ---------- the CFB paper card (its own ledger, its own bank) ---------- */

export type CfbTicketLeg = {
  /** row.label */
  label: string;
  /** "ML" · "Spread" · "Total" market word for the leg line */
  prop: string;
  /** Caesars American price captured at lock */
  cz: number;
  /** game id */
  gkey: string;
  /** row.key */
  lkey: string;
  market: CfbMarketKey;
  side: CfbSideKey;
  line: number | null;
  teamId: string | null;
  /** model win probability (0..1) at lock */
  prob: number;
  push: number;
};

export type CfbTicket = SyncTicket & {
  id: string;
  bucket: "core" | "fun";
  name: string;
  /** whole dollars */
  stake: number;
  /** combined Caesars American price */
  czOdds: number;
  czDec: number;
  /** combined win probability in PERCENT (0..100), the MLB ticket convention */
  prob: number;
  /** % EV at Caesars */
  czEv: number;
  legs: CfbTicketLeg[];
};

export type CfbGrade = { result: "won" | "lost" | "push" | "pending" | "ungradable"; payout: number; dec?: number; detail?: string };

export type CfbLedgerEntry = SyncEntry & {
  sport: "cfb";
  date: string;
  locked: true;
  daily: number;
  fun: number;
  core: CfbTicket[];
  funT: CfbTicket[];
  lockedAt: number;
  /** true when the day locked with an empty core (NO-PLAY recorded, nothing staked) */
  noPlay?: boolean;
  games: Record<string, { pk: number; start: string; home: string; away: string }>;
  grading?: { tickets: Record<string, CfbGrade>; legs: Record<string, { result: string; detail: string }>; done: boolean } | null;
};

/** The built card before it is locked. `noPlay` is true when no playable +EV leg exists. */
export type CfbCard = {
  date: string;
  core: CfbTicket[];
  funT: CfbTicket[];
  coreSum: number;
  funSum: number;
  noPlay: boolean;
  /** why the card is what it is — surfaced on the Builder */
  notes: string[];
  /** rows that cleared the EV gate but were left off (one leg per game, ticket cap…) */
  benched: { label: string; evCz: number; reason: string }[];
};

/** Final scores keyed by ESPN event id, for grading. */
export type CfbFinals = Record<string, { home: number; away: number; final: boolean; status: CfbStatus }>;

/* ---------- module contracts (pinned so owners can build in parallel) ---------- */

/** Raw feed input to the pure model — exactly what the route (or a test) hands it. */
export type CfbBuildInput = {
  /** Pacific date the board is for */
  date: string;
  /** ESPN scoreboard JSON (`events[]` at the root) — one or more days' payloads, concatenated events */
  espnEvents: unknown[];
  /** The Odds API `americanfootball_ncaaf` odds JSON array (every upcoming event) */
  oddsEvents: unknown[];
  /** ESPN FPI powerindex JSON (`teams[]` + `lastUpdated`), or null when unavailable */
  fpi: unknown | null;
  /** ms epoch the board is built at (kickoff-passed checks) */
  now: number;
  /** CFB bankroll for Kelly sizing */
  bankroll: number;
};

/** What `loadCfbSlate` (src/lib/cfb/client.ts) resolves to — the route's full payload. */
export type CfbSlate = CfbBoard & {
  finals: CfbFinals;
  quota: { remaining: number | null; used: number | null };
  /** true when the server had no Odds API key or the odds fetch failed — the board is scores-only */
  oddsMissing: boolean;
};

export type CfbCardOpts = { bankroll: number; daily: number; fun: number; now: number };
