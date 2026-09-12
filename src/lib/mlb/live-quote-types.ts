/**
 * THE MLB LIVE-QUOTE OVERLAY — the shape stored in Redis and joined at render
 * (INSTRUCTION 51, 2026-09-11).
 *
 * WHY AN OVERLAY AND NOT THE BOARD. `pl:board:<date>` is a single gzipped blob written WHOLE by
 * `/api/generate` with no per-game merge and no `pricedAt`, and it is also the STAMPED, GRADED
 * population (`PredRecord.k = gkey|lkey|sub`, `src/lib/pred-serialize.ts:11`). Writing a live line
 * into it would re-grade a bet Josh never placed. So the live quotes live under their own key
 * (`MLB_LIVE_REDIS.board`), keyed `<gkey>|<lkey>`, and the Board joins them at render. `/api/board`,
 * `bestBoard` and `MAX_GENS_PER_DATE` gain no failure mode from this file existing.
 *
 * Field names deliberately track `CfbPropsBoard` (`src/lib/cfb/props-types.ts:85-126`) — events /
 * fetched / capped / budgeted / spentToday / stale / note / oddsMissing / pricedAt /
 * storeWriteFailed / quota all mean here exactly what they mean there, so the three desks read
 * alike and a reviewer who knows one knows the other.
 */

/**
 * One live in-play quote for one stored prop row.
 *
 * `lkey` is THE ORIGINAL STORED lkey — the join key back onto the board row. It is NEVER
 * rewritten: `ln` carries the line the book is posting now, and the stored lkey keeps the line the
 * row was stamped at. That separation is what makes INSTRUCTION 50's suppression fall away by
 * itself — `settledRead` reads the line out of the lkey it is handed, so a re-anchored row simply
 * stops being "cleared" once the surface hands it the live line.
 */
export type MlbLiveQuote = {
  /** the game this row belongs to, the board's own gkey */
  gkey: string;
  /** the ORIGINAL stored lkey (`player|market|line`) — the join key, NEVER rewritten */
  lkey: string;
  /** the line the book is posting NOW (modal point across books, Caesars breaking ties) */
  ln: number;
  /** Caesars' American price on the over at `ln`, null when Caesars posts no in-play quote */
  czAm: number | null;
  /** the opposite side's American price at `ln` from the same book, for the de-vig pair */
  oppAm: number | null;
  /** the basis book's American price at `ln` (the best of the non-settle books) */
  bsAm: number | null;
  /** which book `bsAm` came from */
  bsBk: string | null;
  /** how many books posted a two-sided quote at `ln` — below MLB_LIVE_PROPS.minBooks the quote is dropped */
  books: number;
  /** de-vigged consensus fair probability of the OVER at `ln` (median of per-book fairs) */
  fO: number | null;
  /** remaining-game probability of this leg, 0..1 */
  pLive: number | null;
  /**
   * Where `pLive` came from. "sim" is the engine's own remaining-game simulation and may be
   * presented as a model number; "market" is the de-vigged live pair and MUST NOT be — it has zero
   * edge over the market by construction and is labelled "market fair" wherever it is shown.
   * The pregame probability is NEVER used against a live line: that produces a confidently wrong
   * EV, which is worse than the dash it would replace.
   */
  pSrc: "sim" | "market";
  /** EV% of the Caesars OVER at `ln` against `pLive`; null when either input is missing */
  evCz: number | null;
  /**
   * EV% of the Caesars UNDER at `ln` — against `1 - pLive`, priced off `oppAm`.
   *
   * WHY THIS FIELD EXISTS (fix pass, 2026-09-11). The quote is sighted once per (player, market)
   * and the stored lkey carries NO SIDE (`shLegKey(row.p, mkt, row.ln)`, legacy/index.html:2503),
   * so the Over row and the Under row of the same player share ONE overlay key. Before this field
   * every live cell read the Over's line, the Over's price, P(over) and the Over's EV — onto a row
   * labelled Under. That is a confidently wrong number on the opposite side of the bet, which is
   * precisely what the probability ladder exists to prevent. The surfaces now pick the side off the
   * row's own `sub` (`liveSideOf`, src/lib/mlb/live-client.ts) and read this instead.
   */
  evOpp: number | null;
  /** THIS QUOTE'S OWN ISO stamp — the per-row clock the UI prints and quoteMaxAgeSec measures */
  at: string;
};

/** The overlay for one slate date: every live quote pulled, plus the full accounting of the spend. */
export type MlbLiveQuoteBoard = {
  /** the slate's Pacific date */
  date: string;
  /** when this overlay was assembled (ISO) */
  generatedAt: string;
  /**
   * Which pass spent this overlay's credits — the scheduler slot ("16:45"), "manual" for Josh's
   * own tap, or null for a plain browser read. `forwardMlbLivePull` has always SENT it
   * (src/lib/server/refill.ts); until the fix pass nothing read it, so the overlay could not say
   * which pass bought the day's prices.
   */
  slot?: string | null;
  /** eligible in-play events this pass considered */
  events: number;
  /** events actually re-priced this pass */
  fetched: number;
  /** true when eligible events exceeded MLB_LIVE_PROPS.liveMaxEvents */
  capped: boolean;
  /** games statsapi reported live (and not final) when this overlay was built */
  live: number;
  /** priced games that posted NO usable in-play market — not an error; they are held emptyHoldSec */
  noLive: number;
  /** live games with no confident Odds event match (doubleheader ambiguity included) — counted, never silently dropped */
  unmatched: number;
  /** the window (s) this overlay was written under */
  ttlSec: number;
  /** true when this answer carries quotes the current window would have re-pulled but could not */
  stale: boolean;
  /** true when the daily budget cut the pull short (fetched < events, possibly 0) */
  budgeted: boolean;
  /** credits spent on live MLB props this Pacific day; NULL means no store, which means NO SPEND HAPPENED */
  spentToday: number | null;
  /** plain-language remark on this answer (only set when there is something to say) */
  note?: string;
  /** true when the Odds API itself was unreachable / errored for this pass */
  oddsMissing: boolean;
  /** true when this overlay could not be persisted — never swallowed: the credits were still spent */
  storeWriteFailed?: boolean;
  /** ISO instant each game was last pulled, BY GAME — the per-game re-price window reads it */
  pricedAt: Record<string, string>;
  /** ISO instant each game last returned zero usable quotes — THE EMPTY-EVENT RULE reads it */
  emptyAt: Record<string, string>;
  /** every live quote, keyed `<gkey>|<lkey>` (see `liveQuoteKey`) */
  rows: Record<string, MlbLiveQuote>;
  /** the Odds API's own quota headers off the last response, when it gave them */
  quota: { remaining: number | null; used: number | null } | null;
};

/** The overlay's row key. One spelling, so the writer and the render join can never disagree. */
export const liveQuoteKey = (gkey: string, lkey: string): string => `${gkey}|${lkey}`;
