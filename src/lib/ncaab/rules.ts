import { AZ_BOOKMAKERS_PARAM } from "@/lib/az/books";
import type { GameLineLeague, GameLineVersions } from "@/lib/anytime/football";

/**
 * THE COLLEGE BASKETBALL DESK (2026-11-12, Josh: "Add NCAAB to the site").
 *
 * Men's Division I game lines at the two books Josh can bet: moneyline, spread and total, full
 * game, before tip-off. That is the whole desk:
 *
 *   - NO player props. Arizona does not allow proposition bets on college games (the Arizona
 *     Department of Gaming FAQ, checked 2026-11-12), and the any-time engine already excludes
 *     `ncaab:player_prop` and `ncaab:prop` by default (src/lib/az/exclusions.ts).
 *   - NO in-play prices. A game that has tipped shows its score and no line.
 *   - NO rating of its own. Nothing on this desk has been tested against results, so every
 *     number is the two books' own prices with the vig taken out. A row is "+EV" only when one
 *     book pays more than the two books' shared fair number says it should (line shopping). Picks
 *     made from it are stamped `bb-market-1`, so the paper record can show what that is worth.
 *
 * One Odds API call prices the whole sport: three markets at one bookmaker group = 3 credits.
 */

export const NCAAB_ID = "ncaab";

/** The Odds API sport key (the-odds-api.com sports list, checked 2026-11-12). */
export const NCAAB_ODDS_SPORT_KEY = "basketball_ncaab";

/** Game lines for every listed game, WITHOUT the key; the server appends it from its own environment only. */
export const NCAAB_ODDS_URL = `https://api.the-odds-api.com/v4/sports/${NCAAB_ODDS_SPORT_KEY}/odds?bookmakers=${AZ_BOOKMAKERS_PARAM}&markets=h2h,spreads,totals&oddsFormat=american`;

/** ESPN's scoreboard. Without `groups=50` it returns only the featured games, not the Division I slate. */
export const NCAAB_ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard";
export const NCAAB_ESPN_QUERY = "groups=50&limit=400";

/** How long one game-lines answer is reused before the next page load may pay for another (seconds). */
export const NCAAB_ODDS_TTL = 240;
export const NCAAB_ESPN_TTL = 60;

/** An odds event and a scheduled game are the same game only when their start times are this close. */
export const NCAAB_MATCH_WINDOW_MS = 3 * 3600_000;

/**
 * The spread of a final margin around the line, and of a final total around its line, in points.
 * ASSUMPTIONS, NOT FITTED: about 11 and 17 are the figures usually quoted for this sport; nothing
 * here was measured on this app's data. They do one job only: when the two books post DIFFERENT
 * lines (-3.5 at one, -4 at the other) they turn each book's price into the margin it implies, so
 * a half-point difference in line is not read as an edge. When both books post the same line the
 * fair number is the mean of their two no-vig prices and these figures do not enter it.
 */
export const NCAAB_LINES: GameLineLeague = {
  id: NCAAB_ID,
  model: { sigma: 11, sigmaTotal: 17, hfa: 0, blend: { mkt: 1, spread: 0, fpi: 0 }, spreadBlend: { mkt: 1, fpi: 0 } },
};

export const NCAAB_MODEL_MARKET = "bb-market-1";
/** No rating exists on this desk, so `rated` is never stamped; it is named so one cannot be added silently. */
export const NCAAB_VERSIONS: GameLineVersions = { rated: "bb-rated-unused", market: NCAAB_MODEL_MARKET };

export const NCAAB_ROUTE = "/api/ncaab";
export const NCAAB_QUERY_PREFIX = "ncaab";
