/**
 * THE NFL DESK'S CONSTANTS — one copy, imported everywhere (2026-09-08, Josh, verbatim:
 * "2. NFL needs to be built NOW  3. Allocation should be set to $350").
 *
 * PURE: no React, no store, nothing but `import type` from the league contract. The shared
 * football engine (src/lib/cfb/*) runs the NFL desk through NFL_LEAGUE at the bottom; every
 * NFL surface, route and store reads its keys, routes and money from here and NEVER from the
 * CFB constants — the two desks share code, not knobs (tests/nfl-separation.test.ts scans this
 * tree for every CFB key string).
 *
 * Model constants are MODEL CONSTANTS, stated so The Sharp can print them:
 *   sigma 13.5     — the standard deviation of NFL final margins about the closing spread (the
 *                    pro game is tighter than FBS's 16.5); the normal margin model turns a spread
 *                    (or an FPI gap) into a win probability and a cover probability at any line.
 *   sigmaTotal 13.5 — the same for game totals.
 *   hfa 2.0        — home-field advantage in points, applied to the FPI margin only when the site
 *                    is not neutral (a London or Germany game; the market's spread already prices it).
 *   blend / spreadBlend / pinnacleWeight / minBooks / settleBook — as the CFB desk: the home win
 *                    probability blends the de-vigged moneyline consensus, the consensus spread
 *                    and the FPI gap; Pinnacle counts twice; two books make a consensus; Caesars
 *                    (`williamhill_us`) is the price every ticket settles at.
 */
import type { LeagueConfig, LeagueModel, LeagueParlays, LeagueProps, LeagueRules } from "@/lib/football/league";

/** The paper allotment: $350 core / $25 fun per locked slate date, from the 2026 opener (TNF 2026-09-10). */
export const NFL_PAPER = {
  since: "2026-09-10",
  daily: 350,
  fun: 25,
} as const;

export const NFL_RULES = {
  /** a core leg needs this % EV at Caesars */
  minEvPct: 2,
  maxLegs: 2,
  /** no core ticket settles above this decimal price */
  maxDec: 2.6,
  /** no core ticket carries more than this, top-up included: kellyCap 0.02 × NFL_BANK_BASE 2500 = $50 */
  maxStake: 50,
  minStake: 5,
  /** 10 × $50 = $500 ≥ the $350 allotment, so the day can always deploy in full */
  tickets: { min: 3, max: 10 },
  /** the forced top-up (the $350 must deploy) only adds short-priced tickets, by probability */
  forcedMaxDec: 1.75,
  /** the forced top-up admits legs down to this EV% at Caesars (never negative EV) */
  forcedMinEvPct: 0,
  /** one leg per game per ticket, and no two core tickets share a game */
  oneLegPerGame: true,
  /** fun money rides the likeliest sides — grade D or better at Caesars (never an F), by probability */
  fun: { legs: { min: 3, max: 5 }, minDec: 4, maxDec: 40, minEvPct: -3 },
  kellyFrac: 0.25,
  kellyCap: 0.02,
} as const satisfies LeagueRules;

/** Its own object — never CFB_MODEL by reference — so an NFL sigma can move without touching FBS. */
export const NFL_MODEL = {
  sigma: 13.5,
  sigmaTotal: 13.5,
  hfa: 2.0,
  blend: { mkt: 0.6, spread: 0.25, fpi: 0.15 },
  spreadBlend: { mkt: 0.75, fpi: 0.25 },
  pinnacleWeight: 2,
  minBooks: 2,
  settleBook: "williamhill_us",
  /** how far apart (ms) an ESPN kickoff and an odds-feed commence_time may sit and still match */
  matchWindowMs: 3 * 3600_000,
} as const satisfies LeagueModel;

/** The NFL paper bankroll initializes at the same base as the other desks. */
export const NFL_BANK_BASE = 2500;

/**
 * THE SERVER LOCK WINDOW AND WHAT THE TICKER CAN REACH (2026-09-08).
 *
 * `/api/nfl/lock` is forwarded by `/api/scheduler` (src/lib/server/nfl-lock-forward.ts, run
 * CONCURRENTLY with the CFB forward under Promise.allSettled) on every poke of the EXTERNAL
 * cron-job.org ticker, which runs every 15 minutes during UTC hours 15–23 and 0–2 only
 * (docs/cron-jobs.md; vercel.json's own crons are not part of this). The lock window opens
 * `leadMs` (60 min) before a date's FIRST kickoff, so what the ticker can lock on time is:
 *
 *   · the 17:00Z Sunday early window (16:00–17:00Z)         — COVERED: locks at the 16:00Z tick;
 *   · the 20:25Z late-afternoon games (19:25–20:25Z)        — covered by the 19:30Z tick;
 *   · SNF 00:20Z (23:20–00:20Z)                             — covered (the ticker runs 0–2Z);
 *   · TNF / MNF 00:35Z (23:35–00:35Z)                       — covered the same way;
 *   · London 13:30Z kickoffs (12:30–13:30Z)                 — NOT COVERED. The first poke of the
 *     day lands at 15:00Z and sees the London game already kicked off, so it is EXCLUDED from
 *     that date's card (buildCfbCard prices only games still ahead) and the rest of the Sunday
 *     slate locks as normal at 16:00Z; a London-ONLY date (no other kickoff that PT date) is
 *     swept as a missed-window NO-PLAY claim row. OPEN ITEM FOR JOSH — widening the ticker's
 *     hours is a cron-job.org change, not a code change (docs/nfl-desk.md, written by the
 *     Integrate stage, records it).
 *
 * `forwardTimeoutMs` bounds the NFL forward's own share of the scheduler tick to 25 s. It runs
 * side by side with the CFB forward (also 25 s), so the pair costs the tick max(25, 25) = 25 s,
 * not 50: with the untimed ~60 s generate forward ahead of it that is 85 s of the 90 s
 * maxDuration, exactly the CFB budget (see CFB_LOCK in src/lib/cfb/rules.ts). The route's own
 * maxDuration (app/api/nfl/lock/route.ts, 60 s) sits above this cap on purpose, so the CALLER's
 * abort is the binding one and a poke the caller gave up on can still finish writing the day.
 */
export const NFL_LOCK = {
  leadMs: 60 * 60_000,
  forwardTimeoutMs: 25_000,
} as const;

/**
 * How many previous PT dates one poke may sweep. The NFL week spreads its money over Thursday,
 * Sunday and Monday, so a walk of four PT dates from any poke reaches back across a full
 * long-weekend ticker outage (Tue − 4 = Fri, which still sees Thursday's date through the
 * next-day concat). Cost bound as on CFB: at most this many keyless ESPN reads per poke, ZERO
 * Odds API credits, and only on a genuinely unrecorded history.
 */
export const NFL_SWEEP_DAYS = 4;

/** Top-up bound, mirrored as literals rather than imported so the desks can never share a knob.
 *  INSTRUCTION 48 (2026-09-09): max 2 → 6 per arm — the card only grows; see CFB_TOPUP_MAX.
 *  INSTRUCTION 49 (2026-09-09): retryMs 45 min → 0 — the refill slot calendar (REFILL_SLOTS_PT:
 *  08:00/09:30/12:00/15:00/16:45 PT, plus Josh's manual Refresh) is the only pacing; see
 *  CFB_TOPUP_RETRY_MS. */
export const NFL_TOPUP = { max: 6, retryMs: 0 } as const;

/**
 * The settle pass: at most two dates read per poke (one keyless ESPN scoreboard read each, zero
 * Odds credits); a date counts as finished five hours after its LAST kickoff — an NFL game runs
 * about three and a quarter hours, and five clears overtime plus a weather delay.
 */
export const NFL_SETTLE = {
  maxDatesPerPoke: 2,
  finishMs: 5 * 3600_000,
} as const;

/** a leg still pending this long past kickoff is `ungradable` (a provisional void) */
export const NFL_UNGRADABLE_MS = 48 * 3600_000;
/** how long a voided date stays a settle candidate past its last kickoff — a postponed NFL game is replayed inside the week */
export const NFL_VOID_RECHECK_MS = 7 * 24 * 3600_000;

/** Device storage — DISTINCT from every MLB and CFB key. */
export const NFL_KEYS = {
  ledger: "pl_nfl_ledger",
  bank: "pl_nfl_bank2",
} as const;

/** Window events the NFL device store dispatches. */
export const NFL_EVENTS = {
  change: "pl:nfl-ledger-change",
  sync: "pl:nfl-ledger-sync",
} as const;

/** Cloud storage — DISTINCT from the MLB and CFB blobs. `oddsGap` is a PREFIX: `${oddsGap}:${date}`. */
export const NFL_REDIS = {
  ledger: "pl:nfl:ledger:v1",
  bank: "pl:nfl:bank:v1",
  oddsGap: "pl:nfl:oddsgap:v1",
} as const;

/** Props board + spend keys (prefixes, date-suffixed by the props store). */
export const NFL_PROPS_REDIS = {
  board: "pl:nfl:props:v1:",
  spend: "pl:nfl:props:spend:v1:",
} as const;

/** How long an odds-gap marker lives: outlasts the sweep window ((NFL_SWEEP_DAYS + 1) days). */
export const NFL_ODDS_GAP_TTL_SEC = (NFL_SWEEP_DAYS + 1) * 24 * 3600;

/** The Odds API game-lines URL WITHOUT the key — the server appends `&apiKey=` from process.env only. */
export const NFL_ODDS_URL =
  "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?regions=us,eu&markets=h2h,spreads,totals&oddsFormat=american";
/** ESPN scoreboard base; the loader appends `?limit=100&dates=YYYYMMDD` (NO groups=80 — that is the FBS filter). */
export const NFL_ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
/** ESPN FPI for all 32 teams; columns are read BY NAME from the root `categories[].names` (fpi, fpirank). */
export const NFL_ESPN_FPI = "https://site.web.api.espn.com/apis/fitt/v3/sports/football/nfl/powerindex?region=us&lang=en&limit=40";

/**
 * Player props: the Odds API event-odds endpoint is one call per event. An NFL slate is at most
 * 16 games, so `maxEvents` / `liveMaxEvents` are 16 — every game the slate can carry.
 *
 * `measuredCreditsPerEvent` 31 is the CFB MEASUREMENT (2026-09-05, prod: ~753 credits / 24
 * events on `americanfootball_ncaaf`) and is UNMEASURED ON THE NFL — the same six markets over
 * the same `us` region should cost about the same, but nobody has read the NFL number off a
 * quota header yet. Worst case under it: 16 × 31 = 496 per full pre-kick re-price, so a
 * `dailyBudget` of 1000 pays for two full boards plus change; past it the route serves the last
 * board flagged `stale: true`, exactly as the CFB desk does.
 */
export const NFL_PROPS = {
  maxEvents: 16,
  revalidateSec: 7200,
  liveRevalidateSec: 600,
  liveMaxEvents: 16,
  boardRetainSec: 36 * 3600,
  czMissingRevalidateSec: 1800,
  czMissingWindowSec: 4 * 3600,
  regions: "us",
  minBooks: 2,
  settleBook: "williamhill_us",
  dailyBudget: 1000,
  measuredCreditsPerEvent: 31,
  /**
   * THE LIVE-ONLY RESERVE (2026-09-12) — 248 = half of liveMaxEvents 16 x measuredCreditsPerEvent
   * 31: EIGHT in-play event-pulls held open at all times. The CFB twin (372) carries the full
   * reasoning; the defect and the fix are the same on both desks.
   *
   * WHY 248 AND NOT A FULL CYCLE (review round, 2026-09-12). The first cut reserved 496 and claimed
   * it "costs the pre-kick board nothing at all" — which its own next sentence then contradicted, and
   * so did the docblock above ("a `dailyBudget` of 1000 pays for two full boards plus change"). At
   * 496 the pre-kick rail is 1000 - 496 = 504 = floor(504/31) = 16 event-pulls: EXACTLY one 16-game
   * board and not one pull more, so the SECOND pre-kick pass a Sunday needs — the 2 h carry expires
   * across a 10:00/13:25/17:20 ET slate, and late kickoffs are re-asked as `czMissing` — was refused
   * outright. That is not "nothing at all"; that is a Sunday with the 17:20 game's props never
   * re-priced. At 248 the rail is 752 = 24 event-pulls: the full 16-game board plus 8 pulls of
   * re-pricing. The live floor it holds open is 8 in-play games, and a live pass is NOT capped at
   * 248 — it is sized against the whole 1,000 rail, so all 16 can be bought live when the day's
   * spend leaves room.
   *
   * IT LOWERS NOTHING: `dailyBudget` stays 1000 and a LIVE pass may still spend all of it. The only
   * number that moved is this restriction on the PRE-KICK pass, and it moved DOWN — 504 credits of
   * pre-kick allowance became 752.
   *
   * THE `satisfies` IS WIDENED BY ONE OPTIONAL FIELD, not loosened: the reserve is read through
   * `liveReserveCredits(props)` (src/lib/cfb/props-store.ts), which declares it as OPTIONAL so
   * src/lib/football/league.ts needs no edit and a config without the field behaves exactly as it
   * does today. `satisfies LeagueProps` alone would reject the extra key on a fresh literal, so the
   * shape is spelled out here rather than imported — nothing on the NFL desk depends on CFB code.
   *
   * ALSO NOT STATIC: src/lib/server/football-props.ts caps the reserve at what the games actually in
   * play or about to start could spend, so a dead slate holds back NOTHING.
   */
  liveReserveCredits: 248,
} as const satisfies LeagueProps & { liveReserveCredits: number };

/** Suggested parlays by tier — the CFB shape; `perCategory` is 25 because a 16-game slate has fewer legs to draw on. */
export const NFL_PARLAYS = {
  safer: { legs: { min: 2, max: 3 }, minLegProb: 0.58, maxDec: 3.5 },
  longshot: { legs: { min: 4, max: 6 }, minDec: 8, maxDec: 60 },
  mix: { legs: { min: 3, max: 5 }, minDec: 3, maxDec: 20 },
  minLegEvPct: -3,
  setFloorEvPct: -12,
  setBands: { anytime_td: { legs: { min: 2, max: 4 }, minDec: 4, maxDec: 250 } },
  maxPerGame: 2,
  perView: 6,
  perCategory: 25,
} as const satisfies LeagueParlays;

export const NFL_ROUTES = {
  slate: "/api/nfl",
  ledger: "/api/nfl/ledger",
  lock: "/api/nfl/lock",
  props: "/api/nfl/props",
} as const;

export const NFL_TRIGGERS = {
  lock: "nfl-lock",
  oddsGap: "nfl-lock-odds-gap",
  sweep: "nfl-lock-sweep",
  sweepOdds: "nfl-lock-sweep-odds",
} as const;

/**
 * THE NFL LEAGUE CONFIG — what the shared football engine runs the NFL desk on. Every value is
 * one of the literal constants above; nothing here is a CFB object by reference. `aliases` is
 * empty: ESPN's `displayName` and The Odds API both use the full NFL team names ("Cincinnati
 * Bengals"), so `normTeam` alone joins every one of the 32.
 */
export const NFL_LEAGUE: LeagueConfig = {
  id: "nfl",
  idPrefix: "nfl",
  label: "NFL",
  short: "NFL",
  noun: "NFL",
  paper: NFL_PAPER,
  rules: NFL_RULES,
  model: NFL_MODEL,
  bankBase: NFL_BANK_BASE,
  lock: NFL_LOCK,
  sweepDays: NFL_SWEEP_DAYS,
  settle: NFL_SETTLE,
  ungradableMs: NFL_UNGRADABLE_MS,
  voidRecheckMs: NFL_VOID_RECHECK_MS,
  topUp: NFL_TOPUP,
  props: NFL_PROPS,
  parlays: NFL_PARLAYS,
  ctx: { season: 2026, limit: 150, ttlSec: 3600 },
  keys: NFL_KEYS,
  events: NFL_EVENTS,
  redis: { ...NFL_REDIS, propsBoard: NFL_PROPS_REDIS.board, propsSpend: NFL_PROPS_REDIS.spend },
  oddsGapTtlSec: NFL_ODDS_GAP_TTL_SEC,
  queryPrefix: "nfl",
  routes: NFL_ROUTES,
  feeds: {
    oddsSportKey: "americanfootball_nfl",
    oddsUrl: NFL_ODDS_URL,
    oddsEventBase: "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events",
    oddsPropMarkets: "player_anytime_td,player_pass_tds,player_pass_yds,player_receptions,player_rush_yds,player_reception_yds",
    espnScoreboard: NFL_ESPN_SCOREBOARD,
    espnScoreboardQuery: "limit=100",
    espnFpi: NFL_ESPN_FPI,
    espnByAthleteUrl: (group, season = 2026) => {
      const q = `?region=us&lang=en&contentorigin=espn&season=${season}&seasontype=2`;
      const srt = { passing: "passing.passingYards", rushing: "rushing.rushingYards", receiving: "receiving.receivingYards" }[group];
      return `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/statistics/byathlete${q}&isqualified=true&page=1&limit=150&category=offense%3A${group}&sort=${srt}%3Adesc`;
    },
    headshotUrl: (athleteId) => `https://a.espncdn.com/i/headshots/nfl/players/full/${athleteId}.png`,
  },
  lockSource: "server-lock",
  triggers: NFL_TRIGGERS,
  aliases: {},
} as const;
