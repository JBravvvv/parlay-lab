"use client";

import { createEngine, type BoardData, type Engine } from "@/engine";
import { browserFetchJson } from "./fetcher";
import { logBoardPredictions } from "./predictions";

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
    // dk_fd is the new default: ev_gated discipline priced at the better of DK/FD
    // (the selection basis) — Caesars stays display + settlement only
    return v === "caesars_ev" || v === "probability" || v === "ev_gated" ? v : "dk_fd";
  } catch {
    return "dk_fd";
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
    if (cfg) cfg.selMode = getSelectionMode();
  }
  return engine;
}

/** The engine's Monte Carlo depth (user rule 2026-07-20) — ONE constant feeds
    armV2's simN/simNHR and every piece of static UI copy, so the number shown
    can never drift from the number run. */
export const SIM_PATHS = 50000;
export const SIM_PATHS_TXT = SIM_PATHS.toLocaleString("en-US");

export type Board = { date: string; at: number; data: BoardData };

const BOARD_KEY = "pl_board_r1";

export function todayStr(): string {
  return getEngine().get<() => string>("shToday")();
}

export function cachedBoard(): Board | null {
  try {
    const raw = localStorage.getItem(BOARD_KEY);
    if (!raw) return null;
    const b = JSON.parse(raw) as Board;
    if (b.date !== todayStr()) return null;
    syncEngineBoard(b);
    return b;
  } catch {
    return null;
  }
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
  // calibration 3A: log the full board (fire-and-forget, fail-silent by spec)
  void logBoardPredictions(board.date, data);
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

/** Money state lives in the same legacy keys. */
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
  return {
    daily: Number(SH.daily) || 0,
    fun,
    bankroll: Number(SH.bankroll) || 750,
  };
}

export function setMoney(patch: { daily?: number; fun?: number; bankroll?: number }) {
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
  if (patch.bankroll != null) {
    SH.bankroll = patch.bankroll;
    LS?.set("pl_bankroll", patch.bankroll);
  }
}
