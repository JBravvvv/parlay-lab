/**
 * THE CFB DESK'S CONSTANTS — one copy, imported everywhere (INSTRUCTION 38, 2026-09-05).
 *
 * Allotment: "Ledger & Allotted $ for College Football should be separate (But still $150
 * Core & $25 Fun money)" — the same daily paper allotment as MLB's PAPER set, on its own
 * ledger, its own bank and its own storage keys. A CFB slate day is a Pacific date with
 * at least one kickoff; the allotment is per locked slate day.
 *
 * Model constants are MODEL CONSTANTS, stated here so The Sharp can print them:
 *   sigma 16.5     — the standard deviation of FBS final margins about the closing spread
 *                    (college margins are wider than the NFL's ~13.5); used by the normal
 *                    margin model that turns a spread (or an FPI gap) into a win probability
 *                    and a cover probability at any line.
 *   sigmaTotal 18  — the same for game totals.
 *   hfa 2.6        — home-field advantage in points, applied to the FPI margin only when
 *                    the site is not neutral (the market's own spread already prices it).
 *   blend          — the home win probability is a weighted average of what exists for the
 *                    game: the de-vigged moneyline consensus, the consensus spread through
 *                    the margin model, and the FPI gap through the margin model. Weights
 *                    renormalize over the inputs that exist (a game with no moneyline — the
 *                    -40.5 blowouts post "OFF" — blends spread + FPI only).
 *   spreadBlend    — the expected margin the cover probabilities price off: mostly the
 *                    market's consensus margin, nudged by FPI.
 *   pinnacleWeight — Pinnacle counts twice in the consensus median (the sharp anchor).
 *   minBooks 2     — a consensus needs two books at the line, else the market is null.
 *   settleBook     — Caesars (The Odds API key `williamhill_us`): the price every ticket
 *                    settles at, exactly as the MLB card does.
 */
export const CFB_PAPER = {
  since: "2026-09-05",
  daily: 150,
  fun: 25,
} as const;

export const CFB_RULES = {
  /** a core leg needs this % EV at Caesars */
  minEvPct: 2,
  maxLegs: 2,
  /** no core ticket settles above this decimal price */
  maxDec: 2.6,
  /** no core ticket carries more than this, top-up included */
  maxStake: 25,
  minStake: 5,
  tickets: { min: 3, max: 7 },
  /** the forced top-up (the $150 must deploy) only adds short-priced tickets, by probability */
  forcedMaxDec: 1.75,
  /** the forced top-up admits legs down to this EV% at Caesars (never negative EV) */
  forcedMinEvPct: 0,
  /** one leg per game per ticket, and no two core tickets share a game */
  oneLegPerGame: true,
  /** fun money rides the likeliest sides — grade D or better at Caesars (never an F), by probability */
  fun: { legs: { min: 3, max: 5 }, minDec: 4, maxDec: 40, minEvPct: -3 },
  kellyFrac: 0.25,
  kellyCap: 0.02,
} as const;

export const CFB_MODEL = {
  sigma: 16.5,
  sigmaTotal: 18,
  hfa: 2.6,
  blend: { mkt: 0.6, spread: 0.25, fpi: 0.15 },
  spreadBlend: { mkt: 0.75, fpi: 0.25 },
  pinnacleWeight: 2,
  minBooks: 2,
  settleBook: "williamhill_us",
  /** how far apart (ms) an ESPN kickoff and an odds-feed commence_time may sit and still match */
  matchWindowMs: 3 * 3600_000,
} as const;

/** Correction 4's figure, mirrored: the CFB paper bankroll initializes at the same base. */
export const CFB_BANK_BASE = 2500;

/** Device storage — DISTINCT from every MLB key (pl_ledger / pl_bank2 / pl_noplay). */
export const CFB_KEYS = {
  ledger: "pl_cfb_ledger",
  bank: "pl_cfb_bank2",
} as const;

/** Cloud storage — DISTINCT from pl:ledger:v1 / pl:bank:v1 / pl:noplay:v1. */
export const CFB_REDIS = {
  ledger: "pl:cfb:ledger:v1",
  bank: "pl:cfb:bank:v1",
} as const;

export const CFB_ODDS_URL =
  "https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/odds?regions=us,eu&markets=h2h,spreads,totals&oddsFormat=american";
export const CFB_ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard";
export const CFB_ESPN_FPI = "https://site.web.api.espn.com/apis/fitt/v3/sports/football/college-football/powerindex?region=us&lang=en&limit=400";

/** Player props (INSTRUCTION 39): the Odds API event-odds endpoint is one call per event,
    so a slate is capped at `maxEvents` priced events; `settleBook` is Caesars, as everywhere.

    QUOTA RAILS (2026-09-05, measured on prod): one fresh 24-event pull cost ~753 credits —
    about 31 credits per event (x-requests-used 2428 → 3187 across the pull plus one 6-credit
    slate call), NOT the 6 per event the endpoint's "[markets] × [regions]" note suggests. The
    Next data cache is per deployment, so every deploy re-spent it. Hence: 12 events, a 2 h
    window, the parsed board persisted in Redis across deploys (src/lib/cfb/props-store.ts),
    and a hard daily budget the route may spend, estimated at `measuredCreditsPerEvent` per
    event (worst case without the budget: 12 × 31 × 12 pulls/day = 4464; with it, 1200).

    LIVE WINDOW (INSTRUCTION 40, 2026-09-05): props used to vanish the moment the slate kicked
    off — `selectPropEvents` admitted only pre-kick games. It now admits LIVE games too (never
    final / postponed), live first. In-game lines move, so a board whose priced set holds a live
    event is held for `liveRevalidateSec` (10 min) instead of the 2 h `revalidateSec`: the
    stored board's staleness check and each event call's data-cache window read that shorter
    figure through `propsWindowSec` (src/lib/cfb/props.ts).

    SIZED FOR THE LIVE CADENCE (2026-09-05, review fix): a full 12-event re-price every 10 min
    would burn the 1200-credit day in four pulls (12 × 31 = 372 each), after which the props
    board used to collapse to nothing for the rest of the Pacific day — the same symptom
    INSTRUCTION 40 asked to fix, only later in the afternoon. So (1) a live pull re-prices
    ONLY the games that moved: the in-play events, at most `liveMaxEvents` of them, while the
    upcoming games' rows are carried over from the stored board for as long as their own 2 h
    window allows (the route merges the two sets); (2) the stored board is retained in Redis
    for `boardRetainSec`, well past its window, and when the budget refuses a pull the route
    serves that last good board flagged `stale: true` instead of an empty one — lines a bettor
    can read, honestly dated, never fabricated. A Saturday with N games in play at once costs
    about N × 31 credits per 10 min; the daily budget still caps the total. */
export const CFB_PROPS = {
  maxEvents: 12,
  revalidateSec: 7200,
  /** the cache window (s) when any priced event is in play — in-game lines move */
  liveRevalidateSec: 600,
  /** in-play events a live re-price may fetch per pull (the upcoming games' rows are carried over) */
  liveMaxEvents: 6,
  /** how long the last good board stays in Redis past its window — the stale fallback once the budget is spent */
  boardRetainSec: 36 * 3600,
  regions: "us",
  minBooks: 2,
  settleBook: "williamhill_us",
  /** credits the props route may spend per Pacific day */
  dailyBudget: 1200,
  /** measured 2026-09-05 (~753 credits / 24 events); the budget estimate's per-event cost */
  measuredCreditsPerEvent: 31,
} as const;

/** Suggested parlays by tier: leg counts, price bands, and the per-leg / per-game gates. */
export const CFB_PARLAYS = {
  safer: { legs: { min: 2, max: 3 }, minLegProb: 0.58, maxDec: 3.5 },
  longshot: { legs: { min: 4, max: 6 }, minDec: 8, maxDec: 60 },
  mix: { legs: { min: 3, max: 5 }, minDec: 3, maxDec: 20 },
  /** a leg needs at least this % EV at Caesars (grade D or better, never an F) */
  minLegEvPct: -3,
  maxPerGame: 2,
  perView: 6,
} as const;

export const CFB_ROUTES = {
  props: "/api/cfb/props",
} as const;
