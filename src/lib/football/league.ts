/**
 * THE LEAGUE CONFIG — the one object a football desk (College Football or the NFL) runs on
 * (2026-09-08, Josh, verbatim: "1. Widen the CFB allocation to $250  2. NFL needs to be built
 * NOW  3. Allocation should be set to $350").
 *
 * PURE: types plus ONE runtime helper (`assertLeagueConfig`). No React, no store imports —
 * every Desk* type below is `import type` only, so this module can never create a runtime
 * cycle with the CFB engine that imports it. CFB_LEAGUE is built at the bottom of
 * src/lib/cfb/rules.ts FROM the existing CFB_* constants (the same objects, not copies, so
 * every literal-regex pin on that file keeps matching); NFL_LEAGUE is written as literals in
 * src/lib/nfl/rules.ts. The engine modules under src/lib/cfb take `cfg: LeagueConfig` with a
 * CFB default at the component layer and NO default at the server money seams, so a forgotten
 * argument on a route or the lock is a type error rather than a CFB card on an NFL ledger.
 */
import type {
  readCfbLedger,
  useCfbLedger,
  gradeCfb,
  lockCfb,
  wipeCfbDevice,
  importCfbLedger,
  exportCfbLedger,
  addCfbBankAdjustment,
  getCfbBankroll,
  cfbExposure,
} from "@/lib/cfb/store";
import type { syncCfbNow, useCfbSyncState } from "@/lib/cfb/sync";
import type {
  cfbQueryKey,
  cfbPropsQueryKey,
  loadCfbSlate,
  loadCfbFinals,
  loadCfbProps,
  cfbPropsStaleMs,
  cfbCacheLabel,
  cfbPricedAtLabel,
} from "@/lib/cfb/client";
import type { useCfbDesk, useCfbBankroll } from "@/lib/cfb/useCfbDesk";

export type League = "cfb" | "nfl";

export type LeaguePaper = { since: string; daily: number; fun: number };

export type LeagueRules = {
  minEvPct: number;
  maxLegs: number;
  maxDec: number;
  maxStake: number;
  minStake: number;
  tickets: { min: number; max: number };
  forcedMaxDec: number;
  forcedMinEvPct: number;
  oneLegPerGame: boolean;
  fun: { legs: { min: number; max: number }; minDec: number; maxDec: number; minEvPct: number };
  kellyFrac: number;
  kellyCap: number;
};

export type LeagueModel = {
  sigma: number;
  sigmaTotal: number;
  hfa: number;
  blend: { mkt: number; spread: number; fpi: number };
  spreadBlend: { mkt: number; fpi: number };
  pinnacleWeight: number;
  minBooks: number;
  settleBook: string;
  matchWindowMs: number;
};

export type LeagueLock = { leadMs: number; forwardTimeoutMs: number };

export type LeagueSettle = { maxDatesPerPoke: number; finishMs: number };

export type LeagueProps = {
  maxEvents: number;
  revalidateSec: number;
  liveRevalidateSec: number;
  liveMaxEvents: number;
  boardRetainSec: number;
  czMissingRevalidateSec: number;
  czMissingWindowSec: number;
  regions: string;
  minBooks: number;
  settleBook: string;
  dailyBudget: number;
  measuredCreditsPerEvent: number;
};

export type LeagueBand = { legs: { min: number; max: number }; minDec: number; maxDec: number };

export type LeagueParlays = {
  safer: { legs: { min: number; max: number }; minLegProb: number; maxDec: number };
  longshot: LeagueBand;
  mix: LeagueBand;
  minLegEvPct: number;
  setFloorEvPct: number;
  setBands: { anytime_td: LeagueBand };
  maxPerGame: number;
  perView: number;
  perCategory: number;
};

export type LeagueFeeds = {
  /** "americanfootball_ncaaf" | "americanfootball_nfl" */
  oddsSportKey: string;
  /** game-lines URL WITHOUT apiKey (today's CFB_ODDS_URL); the server appends &apiKey= from process.env only */
  oddsUrl: string;
  /** `https://api.the-odds-api.com/v4/sports/${oddsSportKey}/events` */
  oddsEventBase: string;
  /** comma list, today's CFB_PROPS_ODDS_MARKETS order */
  oddsPropMarkets: string;
  /** base URL, no query */
  espnScoreboard: string;
  /** "groups=80&limit=400" (CFB) | "limit=100" (NFL); the loader appends &dates=YYYYMMDD */
  espnScoreboardQuery: string;
  /** full powerindex URL */
  espnFpi: string;
  espnByAthleteUrl: (group: "passing" | "rushing" | "receiving", season?: number) => string;
  headshotUrl: (athleteId: string) => string;
};

export type LeagueConfig = {
  readonly id: League;
  /** ticket/pick ids: `${idPrefix}-${date}-core-${i}` / `-fun-1` / `-topup${n}-core-${i}` / `-${view}-${n}` */
  readonly idPrefix: League;
  /** "College Football" | "NFL" */
  readonly label: string;
  /** "CFB" | "NFL" */
  readonly short: string;
  /** "FBS" | "NFL" — the "No FBS games on …" copy */
  readonly noun: string;
  readonly paper: LeaguePaper;
  readonly rules: LeagueRules;
  readonly model: LeagueModel;
  readonly bankBase: number;
  readonly lock: LeagueLock;
  readonly sweepDays: number;
  readonly settle: LeagueSettle;
  readonly ungradableMs: number;
  readonly voidRecheckMs: number;
  readonly topUp: { max: number; retryMs: number };
  readonly props: LeagueProps;
  readonly parlays: LeagueParlays;
  /** props-context (byathlete) pull */
  readonly ctx: { season: number; limit: number; ttlSec: number };
  /** localStorage */
  readonly keys: { ledger: string; bank: string };
  /** window events */
  readonly events: { change: string; sync: string };
  readonly redis: { ledger: string; bank: string; oddsGap: string; propsBoard: string; propsSpend: string };
  /** (sweepDays + 1) * 24 * 3600 */
  readonly oddsGapTtlSec: number;
  /** react-query first key segment */
  readonly queryPrefix: League;
  /** "/api/cfb", "/api/cfb/ledger", "/api/cfb/lock", "/api/cfb/props" */
  readonly routes: { slate: string; ledger: string; lock: string; props: string };
  readonly feeds: LeagueFeeds;
  readonly lockSource: "server-lock";
  /** "cfb-lock","cfb-lock-odds-gap","cfb-lock-sweep","cfb-lock-sweep-odds" / nfl-* */
  readonly triggers: { lock: string; oddsGap: string; sweep: string; sweepOdds: string };
  /** ESPN name -> odds-feed name; NFL {} */
  readonly aliases: Readonly<Record<string, string>>;
};

/**
 * The money invariants every league must satisfy, thrown at import time by the config tests and
 * callable by any writer that wants to refuse a mis-sized league before it prices a board:
 *   · kellyCap × bankBase === maxStake — the Kelly ceiling at the base bankroll IS the per-ticket
 *     max (CFB: 0.02 × 2500 = $50; NFL: 0.02 × 2500 = $50), so a full-bankroll day can deploy
 *     without the stake cap and the Kelly cap disagreeing about a ticket;
 *   · tickets.max × maxStake >= paper.daily — the allotment can actually deploy in full
 *     (CFB: 10 × $50 = $500 ≥ $250; NFL: 10 × $50 = $500 ≥ $350);
 *   · idPrefix === id — the ticket ids a desk mints name the desk they belong to.
 */
export function assertLeagueConfig(cfg: LeagueConfig): void {
  const { rules, paper, bankBase, id, idPrefix } = cfg;
  const kellyMax = rules.kellyCap * bankBase;
  if (Math.abs(kellyMax - rules.maxStake) > 1e-9) {
    throw new Error(`${id}: kellyCap ${rules.kellyCap} × bankBase ${bankBase} = ${kellyMax}, not maxStake ${rules.maxStake}`);
  }
  if (rules.tickets.max * rules.maxStake < paper.daily) {
    throw new Error(`${id}: tickets.max ${rules.tickets.max} × maxStake ${rules.maxStake} cannot deploy daily ${paper.daily}`);
  }
  if (idPrefix !== id) {
    throw new Error(`${id}: idPrefix "${idPrefix}" must equal id "${id}"`);
  }
}

/* ---------- DeskHandles: the per-league store / sync / client / hooks a surface reads through LeagueContext ---------- */

export type DeskStore = {
  CHANGE_EVENT: string;
  SYNC_EVENT: string;
  readLedger: typeof readCfbLedger;
  useLedger: typeof useCfbLedger;
  grade: typeof gradeCfb;
  lock: typeof lockCfb;
  wipeDevice: typeof wipeCfbDevice;
  importLedger: typeof importCfbLedger;
  exportLedger: typeof exportCfbLedger;
  addBankAdjustment: typeof addCfbBankAdjustment;
  getBankroll: typeof getCfbBankroll;
  exposure: typeof cfbExposure;
};

export type DeskSync = { syncNow: typeof syncCfbNow; useSyncState: typeof useCfbSyncState };

export type DeskClient = {
  STALE_MS: number;
  PROPS_STALE_MS: number;
  /** react-query keys; the first segment is the desk's own `queryPrefix` (the CFB client's
      `as const` tuples narrow to "cfb", which is assignable here — the NFL factory's are "nfl"). */
  queryKey: (date: string | null | undefined, bankroll: number) => readonly [League, "slate", string, number];
  propsQueryKey: (date: string | null | undefined, bankroll: number) => readonly [League, "props", string, number];
  loadSlate: typeof loadCfbSlate;
  loadFinals: typeof loadCfbFinals;
  loadProps: typeof loadCfbProps;
  propsStaleMs: typeof cfbPropsStaleMs;
  cacheLabel: typeof cfbCacheLabel;
  pricedAtLabel: typeof cfbPricedAtLabel;
};

export type DeskHandles = LeagueConfig & {
  store: DeskStore;
  sync: DeskSync;
  client: DeskClient;
  /** () => { today, date, pick, rail, bankroll, q, slate } */
  useDesk: typeof useCfbDesk;
  /** () => number | null */
  useBankroll: typeof useCfbBankroll;
};
