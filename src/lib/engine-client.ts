"use client";

import { createEngine, type BoardData, type Engine } from "@/engine";
import { browserFetchJson } from "./fetcher";
import { logBoardPredictions } from "./predictions";
import { BANK_BASE, BANK_KEY, computeBankroll, todayExposure, type BankStore, type LedgerDayLike } from "./bankroll";
import { boardStale, mayAutoRun, type StaleVerdict } from "./board-stale";
import { liveCoverageOf, pricedGames, type GameInfoLike } from "./board-coverage";
import { NOPLAY_KEY, validateNoPlayLog, type NoPlayLog } from "./noplay";
import { applySuspensionLift } from "./paper-mode";
import { applyEnvClosedForm } from "@/lib/env-adjust";

/**
 * Browser-side engine singleton. Real localStorage is passed through, so the
 * engine reads/writes the same keys the legacy app used (pl_bankroll,
 * pl_daily, pl_fun, pl_ledger, ...) — data stays compatible.
 */
let engine: Engine | null = null;

/**
 * Per-game sim outputs. The engine keeps SIMS local to shAnalyzeLocal, so we
 * instrument the global shSimGames — same function, same inputs, same returns,
 * we just keep a reference to each output object (the caller stamps .gkey on
 * it afterwards). Zero effect on the math; the parity suite still passes.
 */
export type SimOut = {
  n: number;
  pHome: number;
  avgHome: number;
  avgAway: number;
  pHomeM15: number;
  pHomeP15: number;
  pAwayM15: number;
  pAwayP15: number;
  legP: Record<string, number>;
  gkey?: string;
};
let simCapture: SimOut[] = [];

export function getSims(): Record<string, SimOut> {
  const out: Record<string, SimOut> = {};
  for (const s of simCapture) if (s.gkey) out[s.gkey] = s;
  return out;
}

export type SelectionMode = "dk_fd" | "ev_gated" | "probability" | "caesars_ev";

export function getSelectionMode(): SelectionMode {
  try {
    const v = localStorage.getItem("pl_selmode");
    // ev_gated @ CZ is the default (user rule 2026-07-22): selection and settlement
    // both price at Caesars, so the EV gate IS the settlement floor. dk_fd (DK/FD
    // basis selection) stays selectable in Settings.
    return v === "caesars_ev" || v === "probability" || v === "dk_fd" ? v : "ev_gated";
  } catch {
    return "ev_gated";
  }
}

export function setSelectionMode(mode: SelectionMode) {
  try {
    localStorage.setItem("pl_selmode", mode);
  } catch {
    /* private mode */
  }
  if (engine) {
    const cfg = engine.get<Record<string, unknown>>("SH_CFG");
    if (cfg) cfg.selMode = mode;
  }
}

/* fix-file Phase 5: per-market direction preference — a directional filter is a
   deliberate user choice in Settings, never a hardcode. Default: both sides on. */
export type DirPref = "both" | "over" | "under";
export const DIR_MARKETS: { id: string; label: string }[] = [
  { id: "batter_hits", label: "Hits" },
  { id: "batter_total_bases", label: "Total Bases" },
  { id: "batter_hits_runs_rbis", label: "H+R+RBI" },
  { id: "pitcher_strikeouts", label: "Pitcher K's" },
  { id: "pitcher_outs", label: "Pitcher Outs" },
];
export function getDirPref(): Record<string, DirPref> {
  try {
    const v = JSON.parse(localStorage.getItem("pl_dirpref") ?? "{}") as Record<string, DirPref>;
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
export function setDirPref(mkt: string, v: DirPref) {
  const all = getDirPref();
  if (v === "both") delete all[mkt];
  else all[mkt] = v;
  try {
    localStorage.setItem("pl_dirpref", JSON.stringify(all));
  } catch {
    /* private mode */
  }
  if (engine) {
    const cfg = engine.get<Record<string, unknown>>("SH_CFG");
    if (cfg) cfg.dirPref = all;
  }
}

export function getEngine(): Engine {
  if (!engine) {
    engine = createEngine({ fetchJson: browserFetchJson, storage: window.localStorage });
    const orig = engine.get<(ctx: unknown, n: number, seed: number) => SimOut>("shSimGames");
    engine.set("shSimGames", (ctx: unknown, n: number, seed: number) => {
      const res = orig(ctx, n, seed);
      simCapture.push(res);
      return res;
    });
    // selection_mode (calibration spec Update 1): probability is the default;
    // the legacy Caesars-EV ranking stays selectable in Settings
    const cfg = engine.get<Record<string, unknown>>("SH_CFG");
    if (cfg) {
      cfg.selMode = getSelectionMode();
      cfg.dirPref = getDirPref();
      /* PAPER EPOCH (2026-08-15, Josh's word): H+R+RBI and pitcher_outs back on tickets */
      applySuspensionLift(cfg);
      applyEnvClosedForm(cfg); // park/weather -> closed form (2026-08-27, Josh's word)
    }
  }
  return engine;
}

/** The engine's Monte Carlo depth (user rule 2026-07-20) — ONE constant feeds
    armV2's simN/simNHR and every piece of static UI copy, so the number shown
    can never drift from the number run.
    2026-09-04, Josh's word, verbatim: "Make everything like the Board refresh only
    25K sims instead of 50K" — 50,000 → 25,000 (was 50,000 from 2026-07-20). */
export const SIM_PATHS = 25000;
export const SIM_PATHS_TXT = SIM_PATHS.toLocaleString("en-US");

export type Board = { date: string; at: number; data: BoardData };

const BOARD_KEY = "pl_board_r1";

export function todayStr(): string {
  return getEngine().get<() => string>("shToday")();
}

const AUTO_KEY = "pl_autogen"; // {date, n} — automatic regenerates spent today

function autoRuns(date: string): number {
  try {
    const v = JSON.parse(localStorage.getItem(AUTO_KEY) ?? "{}") as { date?: string; n?: number };
    return v.date === date ? Number(v.n) || 0 : 0;
  } catch {
    return 0;
  }
}

/* Every generate on this device today, automatic or manual. The SERVER's per-date cap
   (MAX_RUNS_PER_DATE) bounds /api/generate only — an in-app regenerate runs the engine
   in the browser and never reaches that route, so it is unbounded by design. This
   counter exists to make the spend VISIBLE, never to block it: the price-age lock
   guard depends on being able to regenerate, and nothing should stop a bet. */
const GEN_KEY = "pl_gencount";

export function generatesToday(): number {
  try {
    const v = JSON.parse(localStorage.getItem(GEN_KEY) ?? "{}") as { date?: string; n?: number };
    return v.date === todayStr() ? Number(v.n) || 0 : 0;
  } catch {
    return 0;
  }
}

/** ~114-150 Odds credits each (measured). Counted for visibility, not enforcement. */
export const GEN_CREDITS_EST = 140;

function noteGenerate() {
  try {
    localStorage.setItem(GEN_KEY, JSON.stringify({ date: todayStr(), n: generatesToday() + 1 }));
  } catch {
    /* private mode — the counter just stays at 0 */
  }
}

/** Count an automatic (staleness-triggered) regenerate against today's cap. */
function noteAutoRun(date: string) {
  try {
    localStorage.setItem(AUTO_KEY, JSON.stringify({ date, n: autoRuns(date) + 1 }));
  } catch {
    /* storage full — the cap fails closed on the next read */
  }
}

export function cachedBoard(): Board | null {
  try {
    const raw = localStorage.getItem(BOARD_KEY);
    if (!raw) return null;
    const b = JSON.parse(raw) as Board;
    const today = todayStr();
    if (b.date !== today) return null;
    /* Phase 1c: a board priced before lineups posted is a different instrument from
       one priced after — and the old cache rule (same date ⇒ serve it) is how you
       open the app at 6pm and lock a card built at 9am off projected lineups. */
    const gi = (b.data?.gameInfo ?? {}) as Record<string, { start?: string | null }>;
    const verdict = boardStale({
      pct: coverageOf(b),
      at: b.at,
      starts: Object.values(gi)
        .map((g) => (g?.start ? Date.parse(g.start) : NaN))
        .filter((n) => isFinite(n)),
      autoRuns: autoRuns(today),
      now: Date.now(),
    });
    /* PROMPT-ONLY while MAX_AUTO_RUNS_PER_DAY is 0: a stale verdict is surfaced by
       the UI ("lineups have posted — regenerate?"), never acted on by spending.
       The auto path stays wired and tested so raising the cap is one character. */
    if (verdict.stale && mayAutoRun(autoRuns(today))) {
      noteAutoRun(today);
      return null; // useBoard falls through to a fresh generate
    }
    syncEngineBoard(b);
    return b;
  } catch {
    return null;
  }
}

/**
 * A board's LIVE lineup coverage — over games that haven't started yet, never the
 * whole-day `luCoverage.pct`. Whole-day lies in one direction: a 9am board can read
 * high coverage entirely on games that are now underway, and would win a comparison
 * against the evening board that actually prices what's still open. Same basis the
 * conditional skip uses, same reason.
 */
export function coverageOf(b: Board | null | undefined, now = Date.now()): number {
  if (!b) return -1;
  const cov = liveCoverageOf(b.data?.gameInfo as GameInfoLike, now);
  // -1 = unknown (board predates the per-game lu flag). It loses every comparison
  // against a board that actually carries lineup data, and the staleness gate
  // reads it as "can't judge" rather than "0% covered".
  return cov.known ? cov.pct : -1;
}

/**
 * The board the Vercel cron built for today, if there is one. Costs ZERO Odds
 * credits — the cron already paid for it. Never throws: any failure here leaves
 * the caller on exactly the path it had before (its own cache, or a generate).
 */
export async function serverBoard(): Promise<Board | null> {
  try {
    const r = await fetch(`/api/board?date=${encodeURIComponent(todayStr())}`, { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { board?: Board | null };
    const b = j?.board ?? null;
    return b && b.date === todayStr() && b.data ? b : null;
  } catch {
    return null;
  }
}

/**
 * Today's board, cheapest acceptable source first.
 *
 * Order matters and the rule is never to DOWNGRADE: the server board is preferred
 * only when it carries strictly better lineup coverage than what is already cached.
 * A cached board built after lineups posted must not be replaced by an earlier cron
 * board just because the cron board is "official".
 *
 * If neither source has anything, the old behaviour stands exactly: generate. No
 * new way to end up without a board.
 */
export async function bestBoard(): Promise<Board> {
  const cached = cachedBoard();
  const server = await serverBoard();
  const now = Date.now();
  /* Three tests, in this order:
       1. COMPLETENESS — how many still-bettable games the board actually priced.
          Coverage is computed from the schedule and is blind to whether a game has
          odds at all, so an incomplete board can score 82% while missing a quarter
          of the slate. Never take fewer priced games, however good the coverage.
       2. LIVE COVERAGE — lineups, over unstarted games only.
       3. FRESHNESS — coverage is a lineup metric, but prices move independently and
          EV is computed on prices at lock, so equal boards go to the newer one. */
  const pricedS = server ? pricedGames(server.data?.categories, server.data?.gameInfo as GameInfoLike, now) : -1;
  const pricedC = cached ? pricedGames(cached.data?.categories, cached.data?.gameInfo as GameInfoLike, now) : -1;
  const covS = coverageOf(server, now);
  const covC = coverageOf(cached, now);
  const better =
    !!server &&
    (!cached ||
      pricedS > pricedC ||
      (pricedS === pricedC &&
        (covS > covC || (covS === covC && server.at > cached.at))));
  const pick = better ? server : cached;
  if (pick) {
    if (pick === server) {
      // adopt it locally so the next open is instant and offline-safe
      try {
        localStorage.setItem(BOARD_KEY, JSON.stringify(server));
      } catch {
        /* storage full — it will be re-fetched next open */
      }
      syncEngineBoard(server);
    }
    return pick;
  }
  return generateBoard();
}

/** Ask whether a board on screen has been overtaken by posted lineups. Pure read —
    never spends. Surfaces the prompt that replaces the old auto-regenerate. */
export function boardNeedsRefresh(b: Board | null | undefined): StaleVerdict | null {
  if (!b) return null;
  const gi = (b.data?.gameInfo ?? {}) as Record<string, { start?: string | null }>;
  return boardStale({
    pct: coverageOf(b),
    at: b.at,
    starts: Object.values(gi)
      .map((g) => (g?.start ? Date.parse(g.start) : NaN))
      .filter((n) => isFinite(n)),
    autoRuns: 0,
    now: Date.now(),
  });
}

/* ENGINE V2: feed Statcast priors + daily context into the engine and switch
   the integrated pipeline on (skill-prior shrinkage, Shin de-vig, Pinnacle-
   weighted consensus, us+eu books, ump/temperature context). Best-effort —
   a missing artifact degrades that piece to classic behavior and the engine's
   own overview says which mode ran. */
async function armV2(eng: Engine) {
  const grab = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [priors, ctx, cal] = await Promise.all([
    grab("/model/priors.json"),
    grab("/model/context.json"),
    grab("/api/calibration"),
  ]);
  eng.set("SH_PRIORS", priors);
  eng.set("SH_CTX", ctx);
  eng.set("SH_V2", {
    priors: !!priors,
    ctx: !!ctx,
    shin: true,
    sharpW: true,
    regions: "us,eu",
    sim: true, // log5/platoon/park×hand/TTO/hook/pen-fatigue + totals/F5 pricing
    // user rule 2026-07-20: SIM_PATHS seeded paths per game, everywhere the sim
    // is consumed (Board, The Sharp, Simulator all read this same run's SIMS).
    // simNHR (the sub-5%-leg/HR bump) matches — 50k is already the ceiling.
    simN: SIM_PATHS,
    simNHR: SIM_PATHS,
    // projected lineups (user rule 2026-07-17): everyday starters count before
    // lineups post; a posted lineup missing the player scratches him entirely
    projLineup: true,
    // calibration self-correction (3D): per-market shrink-only multipliers on
    // the model blend weight; empty when auto_calibration is off or no data
    calW: (cal as { mults?: Record<string, number> } | null)?.mults ?? null,
    // global model-confidence shrink fitted by the nightly calibration cron;
    // null (dormant) whenever the store is empty or auto_calibration is off
    calG: (cal as { global?: { s?: number } | null } | null)?.global?.s ?? null,
  });
  // small-sample consensus gate (2026-07-22): graded-leg counts per market from the
  // nightly calibration summary. Missing store → null → every market counts as small,
  // which only ever tightens selection — a market is never assumed proven.
  const cfg = eng.get<Record<string, unknown>>("SH_CFG");
  if (cfg) {
    const rel = (cal as { summary?: { reliability?: Record<string, { n?: number }> } } | null)?.summary?.reliability ?? null;
    cfg.mktN = rel ? Object.fromEntries(Object.entries(rel).map(([k, v]) => [k, v?.n ?? 0])) : null;
  }
}

/** Full engine run: slate collection (via the odds proxy) + analysis. */
export async function generateBoard(): Promise<Board> {
  const eng = getEngine();
  noteGenerate();
  await armV2(eng);
  const slate = await eng.collectSlate();
  simCapture = [];
  const data = eng.analyze(slate);
  const board: Board = { date: todayStr(), at: Date.now(), data };
  try {
    localStorage.setItem(BOARD_KEY, JSON.stringify(board));
  } catch {
    /* board too big for storage — regenerate next open instead */
  }
  syncEngineBoard(board);
  // calibration 3A: log the full board (fire-and-forget, fail-silent by spec).
  // Phase 0.5: rows are stamped with this generator and the mode it armed.
  void logBoardPredictions(board.date, data, getSelectionMode());
  return board;
}

/** The lock/allocator path reads the board from the engine's SH global. */
function syncEngineBoard(b: Board) {
  const eng = getEngine();
  const SH = eng.get<Record<string, unknown>>("SH");
  if (SH) SH.board = { date: b.date, data: b.data };
}

/** FUN bucket daily default (2026-07-22): the graded FUN record is 0-13 for −$220 —
    58% of all losses. A FUN amount typed in the field holds for THAT day; every new
    day opens back at this default. The field stays fully editable. */
export const FUN_DEFAULT = 5;

/* ---- managed bankroll (fix-file Phase 6 + Correction 4) ----
   Hardening Phase 1: pl_bank2 is the device's MIRROR of the cloud-synced
   adjustment log (same pattern as pl_ledger) — ledgerSync merges it with the
   server copy on every sync, so no device-local value feeds the bankroll. */
export function getBankStore(): BankStore {
  try {
    const raw = localStorage.getItem(BANK_KEY);
    if (raw) {
      const v = JSON.parse(raw) as BankStore;
      if (v && typeof v.base === "number" && Array.isArray(v.log)) return v;
    }
  } catch {
    /* fall through to init */
  }
  // first run on this device: initialize at the true figure (Correction 4) —
  // the old free-edited pl_bankroll number is deliberately NOT carried over
  const store: BankStore = { base: BANK_BASE, asOf: todayStr(), log: [] };
  try {
    localStorage.setItem(BANK_KEY, JSON.stringify(store));
  } catch {
    /* private mode */
  }
  return store;
}
export function addBankAdjustment(kind: "deposit" | "withdrawal", amt: number, note: string): BankStore {
  const store = getBankStore();
  const clean = Math.max(0, Math.round(Number(amt) || 0));
  if (clean > 0) {
    store.log.push({ ts: Date.now(), kind, amt: clean, note: (note || "").slice(0, 120) });
    try {
      localStorage.setItem(BANK_KEY, JSON.stringify(store));
    } catch {
      /* private mode */
    }
  }
  return store;
}
/** The one true bankroll: base + logged adjustments + realized graded P/L. */
export function getBankroll(): number {
  const eng = getEngine();
  const ledger = eng.get<() => LedgerDayLike[]>("shLedger")();
  return computeBankroll(getBankStore(), ledger);
}
/** Today's locked exposure in dollars (CORE + FUN). */
export function getTodayExposure(): number {
  const eng = getEngine();
  return todayExposure(eng.get<() => LedgerDayLike[]>("shLedger")(), todayStr());
}

/* ---- NO-PLAY verdict log (hardening Phase 3) ---- */
export function getNoPlayLog(): NoPlayLog {
  try {
    const raw = localStorage.getItem(NOPLAY_KEY);
    if (raw) {
      const v = validateNoPlayLog(JSON.parse(raw));
      if (v.ok) return v.log;
    }
  } catch {
    /* absent */
  }
  return {};
}

/** Record today's NO-PLAY verdict (write-once per date; syncs like the ledger). */
export function markNoPlay(date: string, mode: string | null) {
  const log = getNoPlayLog();
  if (log[date]) return;
  log[date] = { at: Date.now(), mode };
  try {
    localStorage.setItem(NOPLAY_KEY, JSON.stringify(log));
  } catch {
    /* private mode — the verdict is re-marked next open */
  }
}

/** Money state lives in the same legacy keys — except bankroll, which is MANAGED
    (Phase 6): computed from base + logged adjustments + graded P/L, stamped into
    the engine so every Kelly/cap figure prices off the honest number. */
export function getMoney() {
  const eng = getEngine();
  const SH = eng.get<{ daily?: number; fun?: number; bankroll?: number }>("SH") || {};
  const LS = eng.get<{ get: (k: string, d: unknown) => unknown }>("LS");
  // fun is day-scoped: yesterday's override never silently carries forward
  let fun = Number(SH.fun) || 0;
  if (LS?.get("pl_fun_day", "") !== todayStr()) {
    fun = FUN_DEFAULT;
    if (SH) (SH as { fun?: number }).fun = fun; // engine must agree with what the field shows
  }
  const bankroll = getBankroll();
  if (SH) (SH as { bankroll?: number }).bankroll = bankroll;
  return {
    daily: Number(SH.daily) || 0,
    fun,
    bankroll,
  };
}

/* Phase 6: bankroll is managed — no free-edit path exists anymore. Deposits and
   withdrawals go through addBankAdjustment; everything else is graded P/L. */
export function setMoney(patch: { daily?: number; fun?: number }) {
  const eng = getEngine();
  const SH = eng.get<Record<string, unknown>>("SH");
  const LS = eng.get<{ set: (k: string, v: unknown) => void }>("LS");
  if (!SH) return;
  if (patch.daily != null) {
    SH.daily = patch.daily;
    LS?.set("pl_daily", patch.daily);
  }
  if (patch.fun != null) {
    SH.fun = patch.fun;
    LS?.set("pl_fun", patch.fun);
    LS?.set("pl_fun_day", todayStr()); // fun overrides are for today only (FUN_DEFAULT rule)
  }
}
