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
