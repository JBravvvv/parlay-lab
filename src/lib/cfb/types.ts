import type { Grade } from "@/lib/grade";
import type { SyncEntry, SyncTicket } from "@/lib/ledger-merge";
import type { League, LeagueConfig, LeagueRules } from "@/lib/football/league";

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
  /** INSTRUCTION 46 fix round (2026-09-08, additive, optional): a PROP pick carries its player /
      headshot / position / team abbreviation so `legOf` (card.ts) can copy them onto the ticket
      leg and the Ledger draws the PlayerMark. Side rows never set these. */
  player?: string | null;
  headshot?: string | null;
  pos?: string | null;
  teamAbbr?: string | null;
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
  /** INSTRUCTION 46 (2026-09-08, additive): a PROP leg's player / headshot / position — absent
      on every side leg and on tickets locked before this shipped */
  player?: string | null;
  headshot?: string | null;
  pos?: string | null;
  teamAbbr?: string | null;
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

/** The receipt a wager the merge REFUSED leaves on the day (INSTRUCTION 45, 2026-09-06). A
    structural mirror of the kernel's module-local `DroppedPL` (src/lib/ledger-merge.ts, read this
    turn: `type DroppedPL = { result: string; payout: number; stake: number; placed?: boolean;
    actualStake?: number };`), which is not exported and so cannot be imported. `result` is a grade
    word — an unsettled drop is recorded as `"pending"` by `receiptOf`, whose first line reads
    `const r: DroppedPL = { result: v ? v.result : "pending", payout: v ? v.payout : 0, stake:
    Number(t.stake) || 0 };`. The two placement answers are OMITTED when the ticket has neither, so
    a settled drop carrying neither is byte-for-byte the receipt that shipped before them. */
export type CfbMergeDropPL = { result: string; payout: number; stake: number; placed?: boolean; actualStake?: number };

/** A refused stake raise, per shared ticket id: the stake that STANDS and the one the merge would
    not honour. Mirrors the kernel's module-local `type StakeConflict = { kept: number; refused:
    number };` (src/lib/ledger-merge.ts, read this turn). */
export type CfbMergeStakeConflict = { kept: number; refused: number };

/**
 * CLOSING THE ENTRY SO THE MARKER NAMES ARE ACTUALLY CHECKED (INSTRUCTION 45, 2026-09-06, Josh
 * verbatim: "Parlay Lab CFB should've been running the same $150 per day theoretical Core money
 * and $25 Fun money per day").
 *
 * WHAT WENT WRONG. Declaring the seven merge markers on `CfbLedgerEntry` (below) bought LESS
 * protection than the docblock beside them claimed. The INNER shapes are checked — a probe
 * writing `{ id: { kept: 10, refusedd: 25 } }` into `stakeConflict` errors. The OUTER NAMES were
 * not: `CfbLedgerEntry` was `SyncEntry & { … }`, `SyncEntry` ends in `[k: string]: unknown`
 * (src/lib/ledger-merge.ts, read this turn), and an intersection inherits that index signature —
 * so `e.coreDroped = ["a"]` (one dropped `p`) typechecked as a brand-new string-keyed member.
 * MEASURED this turn, before this change: that exact probe compiled with `npx tsc --noEmit`
 * exiting 0. A marker is a RECEIPT FOR REFUSED MONEY; a misspelled one is a refusal disclosed to
 * nobody, which is the precise failure the declarations were added to stop.
 *
 * WHY THE FIX IS SHAPED THIS WAY. `NoIndex` drops ONLY the index signature from `SyncEntry`,
 * keeping every one of its declared members (`date`, `locked`, `core`, `funT`, `grading`, `clv`,
 * `blocks`, `alt`) with their optionality intact — it is homomorphic (`[K in keyof T as …]`), so
 * `?` and `readonly` are preserved. The index signature is removed HERE ONLY, on the CFB entry;
 * `SyncEntry` itself is untouched, so the MLB desk and the merge kernel are unaffected.
 *
 * NOTHING BREAKS BY DROPPING IT, and that was measured rather than assumed:
 *   · ASSIGNABILITY IS KEPT. A type alias of object-literal shape gets an IMPLICIT index signature
 *     when it is checked against one, so `CfbLedgerEntry` is still assignable to `SyncEntry` and
 *     still satisfies the `T extends SyncEntry` constraint on `unionCore` / `unionFun` /
 *     `mergeLedgers`. A probe asserting exactly that compiled clean this turn.
 *   · THE `as Record<string, unknown>` READERS ARE UNAFFECTED — e.g. the settle queue's
 *     `const stampOf = (e: CfbLedgerEntry, k: string) => Number((e as Record<string, unknown>)[k]) || 0;`
 *     (app/api/cfb/lock/route.ts, grepped this turn) goes through a cast, not the index signature.
 *   · ONE undeclared field was in real use and is now declared rather than smuggled: `gradedAt`
 *     (see below). Closing the type is what SURFACED it; a whole-tree `npx tsc --noEmit` named it
 *     as the single error, and it is the single addition made in response.
 *
 * This is purely a declaration change: no runtime behaviour moves, no existing field is widened
 * or loosened, and no refusal is scoped any differently than it was.
 */
type NoIndex<T> = { [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K] };

export type CfbLedgerEntry = NoIndex<SyncEntry> & {
  /** the football desk the day belongs to — "cfb" or, since the NFL build (2026-09-08), "nfl"; the shared engine stamps it from `cfg.id` */
  sport: "cfb" | "nfl";
  date: string;
  locked: true;
  daily: number;
  fun: number;
  core: CfbTicket[];
  funT: CfbTicket[];
  lockedAt: number;
  /** true when the day locked with an empty core (NO-PLAY recorded, nothing staked) */
  noPlay?: boolean;
  /** INSTRUCTION 45 (2026-09-05): "server-lock" when /api/cfb/lock wrote the day — the same
      field name and value the MLB scheduler stamps (src/lib/server/lock-card.ts); absent on a
      day a person locked in the Builder */
  source?: "server-lock";
  /** what fired the server lock ("cfb-lock"); absent on a Builder lock */
  trigger?: string;
  /** the server lock's one-line record of HOW the day locked (on time / after the first
      kickoff / window missed) — shown under the locked card in the Builder */
  note?: string;

  /* ── THE MERGE MARKERS — DECLARED, NOT GUESSED ──────────────────────────────────────────────
     INSTRUCTION 45 (2026-09-06), Josh verbatim: "Parlay Lab CFB should've been running the same
     $150 per day theoretical Core money and $25 Fun money per day".

     WHAT WENT WRONG. `mergeDay` (src/lib/ledger-merge.ts) writes SEVEN bookkeeping fields onto the
     day it returns — every one of them a record of money it had to refuse — and NOT ONE was
     declared anywhere. The CFB entry was a bare intersection with `SyncEntry`, which ends in
     `[k: string]: unknown`, and an intersection INHERITS that index signature — so every write
     typechecked whatever its shape and every read came back `unknown`; the consumer's only way
     through was a cast. (Both halves of that are now closed: the seven fields are declared below,
     and the `NoIndex` wrapper above drops the inherited index signature, so `CfbLedgerEntry` no
     longer carries one. This paragraph describes the state BEFORE that, and the citations in it
     are of the reader, which still validates values at runtime — see WHY A READER in
     src/components/cfb/CfbLedger.tsx.) `cfbDayMarks` (src/components/cfb/CfbLedger.tsx) reads them
     through casts to this day — grepped this turn:
     `const cb = (e as { capBreach?: unknown }).capBreach;` and, beside it,
     `const sc = (e as { stakeConflict?: unknown }).stakeConflict;`. A cast asserts a name; it does
     not check one. So a typo on EITHER side — a kernel writing `capBreech`, a card reading
     `funDropedPL` — compiled green and silently rendered nothing, which on these particular fields
     means a refused wager disclosed to nobody.

     MEASURED, this turn, against the tree as it stood: a probe assigning
     `e.capBreach = { core: { sum: "one hundred and eighty", cap: 150 } }`, `e.stakeConflict =
     { "id": { kept: 10, refusedd: 25 } }` and `e.coreDropped = 7` produced NO error from
     `npx tsc --noEmit`; the only error in the probe was on the READ, TS2322 "Type 'unknown' is not
     assignable to…". That is the whole defect in one run: garbage in, and nothing legible out.

     WHY THE FIX IS SHAPED THIS WAY. Declaring the fields here — on the one entry type both the
     kernel's CFB callers and the CFB card build against — makes producer and consumer answer to a
     single declaration, so a mis-spelled or mis-shaped marker is a compile error rather than a
     silent no-op. It is PURELY a declaration: no runtime behaviour changes, no existing field is
     widened, and the `as` casts in files this change does not own keep working unchanged (they now
     assert something the type actually says). Every shape below was read out of
     src/lib/ledger-merge.ts this turn and is reproduced from its own source:
       · `type DroppedPL = { result: string; payout: number; stake: number; placed?: boolean; actualStake?: number };`
       · `type StakeConflict = { kept: number; refused: number };`
       · `const breach: { core?: { sum: number; cap: number }; fun?: { sum: number; cap: number } } = {};`
     Both `DroppedPL` and `StakeConflict` are module-local to the kernel (not exported), so they are
     mirrored structurally here rather than imported; the two names below exist to keep that mirror
     in one place. `betConflict` is the odd one out and is declared for the same reason as the rest:
     the kernel writes it through a cast of its own — `if (stillBetConflict.length) (out as
     Record<string, unknown>).betConflict = stillBetConflict;` — which is precisely the pattern that
     leaves a name unchecked on both ends.

     ALL SEVEN ARE OPTIONAL AND ARE DELETED WHEN THEY NO LONGER HOLD (the kernel pairs each write
     with an `else delete`), so `undefined` is the normal state of a clean day and no writer of a
     CfbLedgerEntry is obliged to produce one. */
  /** core ids the day's allotment refused, sorted — never seated on the merged card. */
  coreDropped?: string[];
  /** what each refused CORE wager was worth, keyed by ticket id. */
  coreDroppedPL?: Record<string, CfbMergeDropPL>;
  /** fun ids the fun allotment refused, sorted. */
  funDropped?: string[];
  /** what each refused FUN wager was worth, keyed by ticket id. */
  funDroppedPL?: Record<string, CfbMergeDropPL>;
  /** A shared id whose two copies named different stakes and the merge would not seat the raise:
      `kept` is the stake it SEATED, `refused` the one it turned away.

      BOTH HALVES OF THIS DOC WERE FALSE UNTIL NOW (INSTRUCTION 45, defect U3, 2026-09-06 —
      self-reported by two agents the round before and shipped anyway). It read "disagreed on stake
      with no `topUp` receipt: the SMALLER stake stands as `kept`". `unionCore`
      (src/lib/ledger-merge.ts) writes this record under TWO RULES, spread across the arms of one
      chain, read again this turn:
        · the RECEIPTLESS rule, the chain's last `else` — reached when no `topUp` receipt accounts
          for the difference and no id on the day is disputed. `kept` is the smaller of the two stakes and
          `refused` the larger, which is where the old sentence came from; and
        · the KEPT-MINE rule, written from more than one arm above it — it keeps THIS card's own
          stake (the base's), which is the LARGER whenever the base holds the larger of the two.
          It is reached on RIVAL CARDS, where no receipt is consulted at all, and reached again WITH a valid receipt: a
          receipted raise is honoured only while the projected core stays inside the day's
          allotment, and is refused onto this channel when it would not.
      So neither "the smaller stands" nor "with no receipt" is true of the channel. Consumers must
      read `kept` as "what is seated", not as "the smaller": `cfbDayMarks`
      (src/components/cfb/CfbLedger.tsx) does not trust either figure and re-measures the cut
      against the ticket actually on the day, disclosing nothing when `refused` is not above it. */
  stakeConflict?: Record<string, CfbMergeStakeConflict>;
  /** shared ids the two copies mean DIFFERENT BETS by — rival cards are never mixed. */
  betConflict?: string[];
  /** the merged day is over an allotment and was KEPT, not truncated: the sum it carries and the
      cap it broke, per bucket. Absent once the day fits again. */
  capBreach?: { core?: { sum: number; cap: number }; fun?: { sum: number; cap: number } };
  /** WHEN THE DAY WAS LAST GRADED. Written in exactly one place on the device —
      `next[i] = { ...entries[i], grading: overlayGrading(entries[i].grading, grading, entries[i]), gradedAt: Date.now() };`
      in `applyCfbGrading` (src/lib/cfb/store.ts, grepped this turn) — and cleared to `null` by the
      kernel's `repairEntry` (`out.gradedAt = null;`, src/lib/ledger-merge.ts, grepped this turn),
      which is why the type is `number | null` and not `number`. Undeclared until this turn: it rode
      the index signature this file has now closed, and closing it is what surfaced the field. */
  gradedAt?: number | null;
  /** WHEN THE SETTLE SWEEP LAST *TRIED* the day, success or throw — the queue's tier, with
      `gradedAt` as its pre-DEFECT-S2 fallback: `const attempted = (e: CfbLedgerEntry) =>
      Math.max(stampOf(e, "attemptedAt"), stampOf(e, "gradedAt")) || (e.grading ? 1 : 0);`
      (app/api/cfb/lock/route.ts, grepped this turn). Declared alongside `gradedAt` because it is
      the same fact's other half; the route writes it through a `as SyncEntry` literal. */
  attemptedAt?: number;
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
  /** the league the board is for (model constants, aliases, match window); CFB_LEAGUE when absent (2026-09-08, the NFL build) */
  league?: LeagueConfig;
};

/** What `loadCfbSlate` (src/lib/cfb/client.ts) resolves to — the route's full payload. */
export type CfbSlate = CfbBoard & {
  finals: CfbFinals;
  quota: { remaining: number | null; used: number | null };
  /** true when the server had no Odds API key or the odds fetch failed — the board is scores-only */
  oddsMissing: boolean;
};

/** `rules` / `idPrefix` default to the CFB desk at the component layer (2026-09-08, the NFL build); the server seams pass them from their LeagueConfig */
export type CfbCardOpts = { bankroll: number; daily: number; fun: number; now: number; rules?: LeagueRules; idPrefix?: League };
