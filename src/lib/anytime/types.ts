import type { AzBook } from "@/lib/az/books";
import type { AzQuotes, ModelProb } from "@/lib/az/market";

/**
 * THE ANY-TIME PICK ENGINE — record shapes (2026-11-12).
 *
 * PAPER TRADING ONLY. Nothing in src/lib/anytime places, or can place, a wager: it reads prices,
 * writes records to the app's own store and reports on them.
 */

/** Who asked for the run. Every trigger calls the same function; this is only recorded. */
export type Trigger = "manual-ui" | "manual-api" | "cli" | "cron" | `event:${string}`;

export function isTrigger(t: unknown): t is Trigger {
  return typeof t === "string" && (t === "manual-ui" || t === "manual-api" || t === "cli" || t === "cron" || /^event:[a-z0-9-]{1,40}$/.test(t));
}

/** One bet the engine could take: one side of one market at ONE exact line, as quoted right now. */
export type Candidate = {
  sport: string;
  /** The Odds API event id when there is one, else the schedule feed's id. */
  eventId: string;
  /** "Away @ Home". */
  event: string;
  /** ISO start time of the event (the Odds API `commence_time` / the schedule feed's kickoff). */
  commence: string;
  /** Market key: "ml" | "spread" | "total" | a prop market key. */
  market: string;
  /** Market type for the Arizona exclusion list, e.g. "nfl:spread", "cfb:player_prop". */
  marketType: string;
  /** Side key: "home" | "away" | "over" | "under". */
  side: string;
  /** Player the prop is on, when it is one. */
  player?: string | null;
  /** Human label: "Chiefs -2.5", "Over 47.5", "P. Mahomes Over 265.5 pass yds". */
  selection: string;
  /** The line this candidate is at (side-signed spread, the total number, the prop line; null on ML). */
  line: number | null;
  /** Model probability at THIS line. */
  model: ModelProb;
  modelVersion: string;
  /** Whether the model carries a signal of its own, or only restates the two books' prices. */
  modelKind: "independent" | "market-only";
  /** DraftKings' and FanDuel's quotes on this selection at this exact line. */
  quotes: AzQuotes;
  /** Id of the odds snapshot the quotes came from. */
  snapshotId: string;
  /** When that snapshot was fetched from the provider (ms). */
  fetchedAt: number;
  /** True only when the event has started AND live odds and a live model both exist for it. */
  live: boolean;
  /** Where the final result is read from when the pick is graded. */
  gradeRef?: GradeRef | null;
};

/** The results feed and id a pick is graded against (e.g. ESPN's scoreboard id for the game). */
export type GradeRef = { source: "espn" | "mlb-statsapi"; league: string; id: string; home?: string; away?: string };

/** The selection family a re-entry is judged against: the same side of the same market of the
    same event (any line). A second pick in a family is a RE-ENTRY. */
export function familyKeyOf(c: Pick<Candidate, "sport" | "eventId" | "market" | "side" | "player">): string {
  return [c.sport, c.eventId, c.market, c.side, (c.player ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "")].join("|");
}

export type PickBasis =
  /** The two books' own no-vig number says this price pays more than fair (line shopping). */
  | "price"
  /** Only the model says so; the two-book market disagrees. */
  | "model";

/** One recorded pick. Written once, never rewritten: grades, closes and voids live in their own keys. */
export type PickRecord = {
  v: 1;
  id: string;
  /** 1 for the first pick in the family, 2+ for a re-entry. */
  seq: number;
  /** The earlier pick this one re-enters, or null. */
  reentryOf: string | null;
  runId: string;
  trigger: Trigger;
  /** ISO time the pick was recorded (server clock). */
  ts: string;
  sport: string;
  eventId: string;
  event: string;
  commence: string;
  market: string;
  marketType: string;
  side: string;
  player: string | null;
  selection: string;
  line: number | null;
  family: string;
  /** The book the pick is taken at. */
  book: AzBook;
  /** American price taken, and its decimal. */
  price: number;
  dec: number;
  /** The other book and its price on the same selection at the same line at that moment (null = not offered). */
  otherBook: AzBook;
  otherPrice: number | null;
  /** Model probability the pick wins / pushes (unconditional), and the win probability given no push. */
  modelWin: number;
  modelPush: number;
  modelP: number;
  /** The two books' no-vig probability (given no push) and how many of the two were behind it. */
  fairP: number;
  fairN: 1 | 2;
  /** modelP - fairP, in probability points. */
  edge: number;
  /** Expected profit per 1 staked by the model's probability. */
  ev: number;
  /** Expected profit per 1 staked by the two-book no-vig probability (model-free). */
  priceEv: number;
  basis: PickBasis;
  /** Flat stake: always 1 unit. */
  stakeFlat: 1;
  /** Fractional-Kelly stake in units, sized on the Kelly bankroll at pick time (0 when trimmed to nothing). */
  stakeKelly: number;
  /** The Kelly bankroll (units) the stake was sized on. */
  kellyBankroll: number;
  modelVersion: string;
  modelKind: "independent" | "market-only";
  snapshotId: string;
  /** ISO time the odds snapshot was fetched, and each book's own last-update stamp when carried. */
  fetchedAt: string;
  quoteAt: Partial<Record<AzBook, string | null>>;
  live: boolean;
  gradeRef: GradeRef | null;
  /** Engine rule-set version that made the pick. */
  engine: string;
};

export type RejectReason =
  | "started"
  | "bad_commence"
  | "stale_snapshot"
  | "no_book"
  | "one_sided_no_fair"
  | "bad_model"
  | "az_excluded"
  | "live_unsupported"
  | "below_ev"
  | "not_best_in_family"
  | "duplicate"
  | "lost_race";

export type Reject = { family: string; selection: string; reason: RejectReason; detail?: string };

/** What the engine remembers about a family: its latest pick, for the re-entry rule. */
export type FamilyState = { id: string; seq: number; dec: number; ev: number; line: number | null; book: AzBook; ts: string };

export type GradeResult = "won" | "lost" | "push" | "void";

/** A pick's settlement. Its own key; the pick record is not touched. */
export type GradeRecord = {
  id: string;
  result: GradeResult;
  /** Why a void was a void ("postponed", "no_action", "not_available_az", ...). */
  reason?: string;
  /** The final numbers the grade was read from. */
  detail?: string;
  gradedAt: string;
  source: string;
};

/** The closing line at both books for a pick. Rewritten until the event starts, frozen after. */
export type CloseRecord = {
  id: string;
  /** ISO time of the snapshot this close was read from (the last one before the start). */
  at: string;
  snapshotId: string;
  /** Each book's closing price on the pick's selection at the pick's line, and the opposite side's. */
  books: Partial<Record<AzBook, { price: number; opp: number | null; line: number | null }>>;
  /** The two-book closing no-vig probability at the pick's line, when one exists. */
  fairP: number | null;
  fairN: 0 | 1 | 2;
  /** True once the event has started: the record is final. */
  final: boolean;
};
