"use client";

import { createEngine, type BoardData, type Engine } from "@/engine";
import { browserFetchJson } from "./fetcher";

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

export function getEngine(): Engine {
  if (!engine) {
    engine = createEngine({ fetchJson: browserFetchJson, storage: window.localStorage });
    const orig = engine.get<(ctx: unknown, n: number, seed: number) => SimOut>("shSimGames");
    engine.set("shSimGames", (ctx: unknown, n: number, seed: number) => {
      const res = orig(ctx, n, seed);
      simCapture.push(res);
      return res;
    });
  }
  return engine;
}

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
  const [priors, ctx] = await Promise.all([grab("/model/priors.json"), grab("/model/context.json")]);
  eng.set("SH_PRIORS", priors);
  eng.set("SH_CTX", ctx);
  eng.set("SH_V2", { priors: !!priors, ctx: !!ctx, shin: true, sharpW: true, regions: "us,eu" });
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
  return board;
}

/** The lock/allocator path reads the board from the engine's SH global. */
function syncEngineBoard(b: Board) {
  const eng = getEngine();
  const SH = eng.get<Record<string, unknown>>("SH");
  if (SH) SH.board = { date: b.date, data: b.data };
}

/** Money state lives in the same legacy keys. */
export function getMoney() {
  const eng = getEngine();
  const SH = eng.get<{ daily?: number; fun?: number; bankroll?: number }>("SH") || {};
  return {
    daily: Number(SH.daily) || 0,
    fun: Number(SH.fun) || 0,
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
  }
  if (patch.bankroll != null) {
    SH.bankroll = patch.bankroll;
    LS?.set("pl_bankroll", patch.bankroll);
  }
}
