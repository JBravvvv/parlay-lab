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
    about N × 31 credits per 10 min; the daily budget still caps the total.

    EVERY ELIGIBLE GAME PRICED (INSTRUCTION 42, 2026-09-05) — Josh: "Its only showing ANYTIME TD
    picks for 3 games under 'ALL' ... There are a ton of games live and a ton of games the rest
    of the day. It should be grading every possible pick available on the board that falls under
    those props". The 12 / 6 caps were the bottleneck: a 60-plus-game Saturday priced twelve
    pre-kick games and six in play. The pools are now `maxEvents` 60 pre-kick and `liveMaxEvents`
    24 in play, so every game the slate can carry (odds event + a Caesars side) gets its props
    pull, and `dailyBudget` rises to 2500 to pay for it. The cost math, worst case: 60 × 31 =
    1860 credits per 2 h pre-kick re-price, plus up to 24 × 31 = 744 per 10-min live pull —
    uncapped that is far past any day, so the 2500/day rail stays the hard stop (spend past it
    serves the last board, stale). Two savers keep the real spend well under the worst case:
    (a) the EMPTY-EVENT RULE (route) — an event whose last pull returned ZERO rows is not
    re-pulled until `revalidateSec` after its own `pricedAt`, even when it is live, because many
    small games carry no player props at the API and re-asking every 10 min bought nothing;
    (b) per-event `pricedAt` on the stored board, so an upcoming game rides on its own 2 h window
    whatever the board's window is. Josh's Odds API month had 16,480 credits left when read
    2026-09-05.

    WHAT THE 2500/DAY RAIL MEANS ON A FULL SATURDAY (2026-09-05, review finding — a contract
    decision, not a code fix; the numbers below are pinned by the shared contract): one 60-game
    pre-kick pull books 1860 credits and leaves 640 = 20 event-pulls for the rest of the day. The
    first live pull with 24 in-play games that carry rows wants 744, so it gets 20 of them and every
    10-min pull after that gets none — the props board then serves its last priced lines, flagged
    `stale: true`, for the remainder of the Pacific day (the 2 h upcoming re-price is refused the
    same way). A mid-day cold start needing 60 + 24 events (2604) prices 80 and is done. Uncapped,
    24 live games for a 6-hour afternoon would be ~26,800 credits — more than the whole month left.
    The rail, the stale flag and the budget note all behave as designed; what they cannot do is
    fund a 24 × 10-min live cadence inside 2500 credits. Closing that gap means one of: a longer
    live cadence (30 min ≈ 8,900 per afternoon), a smaller live pool, or a daily budget reconciled
    with the monthly balance — and telling Josh plainly that live props freeze mid-afternoon until
    one of those is chosen.

    THE CAESARS-MISSING RULE (2026-09-05, Josh, verbatim: "It's still only showing ANYTIME TD picks
    for ARST @ MEM, WYO @ CSU, FIU @ USF, WMU @ MICH, SHSU @ TROY, BOISE @ ORE; They are still 12
    games today that haven't started w/ current Anytime TD odds"). Read on prod at ~15:45 PT: of 17
    games with rows, 11 carried DK / FD anytime-TD rows but NO Caesars quote on any row, while
    Caesars itself was posting those games. Caesars posts player props later than DK / FD, and an
    upcoming game rode its stored rows for the whole 2 h carry — priced once before Caesars posted,
    nothing re-asked. So: an UPCOMING game on the stored board that HAS rows and, on at least one
    MARKET with rows, carries no Caesars quote (`czMissingGameIds` — keyed on the market, so Caesars
    yardage props without a Caesars anytime TD still re-check), with kickoff inside
    `czMissingWindowSec` (4 h) ahead, is re-fetched once its own pricedAt is older than
    `czMissingRevalidateSec` (30 min) — instead of the 2 h carry. A game with ZERO rows is NOT
    Caesars-missing (review fix): it stays on the 2 h empty-event hold, upcoming or live — 29 of the
    46 priced games on the complaint day were FBS-vs-FCS games no book posts props on, and re-asking
    them every 30 min would have wanted ~7,200 credits. Outside the 4 h window the 2 h rule stands;
    live games keep theirs (a live game with rows re-prices only once ITS OWN pricedAt is older than
    `liveRevalidateSec`). Those re-pulls are part of the pull's "need", ordered AFTER the live games
    and the games never priced, so under a tight budget the cheapest wins still go first — which
    also means that on a busy live afternoon the re-checks are bought only when the live pulls leave
    room. Cost, honestly: per game at most one extra pull per 30 min in the 4 h before kickoff —
    8 × 31 = 248 credits worst case — but in AGGREGATE the 12 such games Josh named would want
    12 × 248 = 2,976, more than the 2,500 daily rail before a single live pull; the rail binds, and
    the games it refuses simply keep their last priced rows. A board that counts a Caesars-missing
    game answers `ttlSec` = min(window, 30 min) so the phone re-asks on the rule's cadence. */
export const CFB_PROPS = {
  /** pre-kick events priced per slate (INSTRUCTION 42, 2026-09-05: was 12 — every eligible game now) */
  maxEvents: 60,
  revalidateSec: 7200,
  /** the cache window (s) when any priced event is in play — in-game lines move */
  liveRevalidateSec: 600,
  /** in-play events a live re-price may fetch per pull (the upcoming games' rows are carried over; INSTRUCTION 42: was 6) */
  liveMaxEvents: 24,
  /** how long the last good board stays in Redis past its window — the stale fallback once the budget is spent */
  boardRetainSec: 36 * 3600,
  /** an upcoming game with rows but NO Caesars quote on some market it has rows for is re-asked this often (s) — Caesars posts props late; a game with no rows is never re-asked early */
  czMissingRevalidateSec: 1800,
  /** …but only inside this many seconds before its kickoff; earlier, the 2 h carry stands */
  czMissingWindowSec: 4 * 3600,
  regions: "us",
  minBooks: 2,
  settleBook: "williamhill_us",
  /** credits the props route may spend per Pacific day (INSTRUCTION 42, 2026-09-05: was 1200) */
  dailyBudget: 2500,
  /** measured 2026-09-05 (~753 credits / 24 events); the budget estimate's per-event cost */
  measuredCreditsPerEvent: 31,
} as const;

/** Suggested parlays by tier: leg counts, price bands, and the per-leg / per-game gates.

    INSTRUCTION 42 (2026-09-05, Josh, verbatim): "Under the 'generated parlays' on board tab,
    there needs to be A TON more. There should be 50 parlay options under each category (ML,
    spread, Anytime TD, Pass TD, Pass Yards, Receiving Yards, Combos, etc) The live parlay
    section and combo section (that has live & pregame picks on the same ticket) should still
    be generating picks as well". `perCategory` (50) caps each of the twelve category sets in
    CfbPicks.sets (CFB_PARLAY_CATEGORIES); `perView` stays for the legacy tiered "parlays"
    view. Single-market sets hold one leg per game; combo / mixed / live keep `maxPerGame`. Tier 2
    (below) applies to EVERY single-market set — ML, SPREAD and TOTAL included, not only anytime
    TD — on purpose: INSTRUCTION 42 asked for 50 tickets under every category, and each loosened
    ticket wears the EDGE − tag with its red EV, so nothing is passed off as a gated edge.

    TIERED LEG POOL (2026-09-05, Josh, verbatim: "It's also only showing 4 Anytime TD parlays in
    the generated parlays. It should be showing 50+ Anytime TD parlays"): Caesars shades anytime
    TD, so on the opening Saturday only six ATD legs across two games cleared the −3 gate, and
    SET_BAND's decimal cap of 60 made a third 3–8 leg impossible — four tickets. A single-market
    category set now builds from tier 1 (Caesars-priced, EV ≥ `minLegEvPct`) first and, when that
    yields fewer than `perCategory` tickets, extends its pool to tier 2 — any Caesars-priced,
    upcoming, non-live leg of that market with EV ≥ `setFloorEvPct` — until fifty or the pool runs
    dry. Tickets whose every leg passed the −3 gate rank first (by EV), then the rest by EV; each
    ticket carries `gated` so the Board can label the loosened ones honestly. The legacy tiered
    view, combo, mixed and live keep tier 1 only. `setBands` overrides the set band per market:
    anytime TD legs price 3–8 decimal, so its tickets are 2–4 legs, decimal 4–250. */
export const CFB_PARLAYS = {
  safer: { legs: { min: 2, max: 3 }, minLegProb: 0.58, maxDec: 3.5 },
  longshot: { legs: { min: 4, max: 6 }, minDec: 8, maxDec: 60 },
  mix: { legs: { min: 3, max: 5 }, minDec: 3, maxDec: 20 },
  /** a leg needs at least this % EV at Caesars (grade D or better, never an F) */
  minLegEvPct: -3,
  /** tier 2 for the single-market category sets only: a Caesars-priced upcoming leg admitted down to this % EV once tier 1 cannot fill the set */
  setFloorEvPct: -12,
  /** per-market set bands (leg count + decimal price); a market absent here uses the shared set band (2–6 legs, decimal 1.5–60) */
  setBands: { anytime_td: { legs: { min: 2, max: 4 }, minDec: 4, maxDec: 250 } },
  maxPerGame: 2,
  /** legacy tiered view: tickets per tier */
  perView: 6,
  /** INSTRUCTION 42: ranked tickets per category set */
  perCategory: 50,
} as const;

export const CFB_ROUTES = {
  props: "/api/cfb/props",
} as const;
