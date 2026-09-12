import { currentValue, pnorm, type Boxscore, type GameStatus } from "@/engine2/grade";

/**
 * THE FREE HALF OF THE MLB LIVE PULL (INSTRUCTION 51, 2026-09-11).
 *
 * Josh's order, verbatim: "Authorize the live in-play odds pull for MLB". INSTRUCTION 50 shipped
 * the honest half of his complaint — a prop whose line the live tally has already cleared loses
 * its grade/EV/Kelly and carries a SETTLED tag (src/lib/leg-settled.ts). This module is the free
 * input to the half that costs money: it decides WHICH games are worth paying to re-price BEFORE
 * a single Odds credit is spent.
 *
 * EVERYTHING HERE IS KEYLESS AND COSTS ZERO CREDITS. `https://statsapi.mlb.com/api/v1` is the same
 * feed `src/lib/liveNow.ts` polls in the browser and `src/lib/server/slate.ts` reads on the server:
 *   /schedule?sportId=1&date=<d>&hydrate=linescore   state / score / inning per gamePk
 *   /game/<pk>/boxscore                              LIVE games only, capped at cfg.liveMaxEvents
 * That free read is the whole reason MLB can do what CFB cannot: CFB has no per-play state feed,
 * so `src/lib/server/football-props.ts` must re-price every live game on a timer and bind against
 * a rail. Here the divergence gate runs on free inputs and only then spends.
 *
 * THE PREDICATES ARE LIFTED VERBATIM, NOT RE-DERIVED. `isLive` / `isFinal` below are character-for
 * -character `src/lib/liveNow.ts` (the `live:` / `final:` fields of its snapshot), so the phone and
 * this route can never disagree about whether a game is under way — a disagreement would either
 * print a live price on a finished game or suppress one on a live game, and both are the class of
 * dishonesty INSTRUCTION 50 existed to remove. `isPostponed` is ADDITIVE and separate, precisely so
 * the two lifted predicates stay byte-identical to their source; eligibility is
 * `isLive && !isFinal && !isPostponed`.
 *
 * ONE STAT EXTRACTOR. The live tally comes from `currentValue(lkey, status, box)`
 * (src/engine2/grade.ts) — the same function the grader and `useLiveNow` call. A second extractor
 * here would drift from the grader, and the drift would be invisible until a bet was mis-settled.
 * Its honesty rule rides along unchanged: a player with no boxscore appearance reads `null`, never
 * `0`, so "no appearance" and "0 so far" stay different facts.
 *
 * THE SIM IS OPTIONAL AND NEVER FABRICATED. `liveInitOf` turns a linescore + boxscore into the
 * engine's resume state (`shLiveState`) and `liveLegP` resumes `shSimGames` from it for the
 * REMAINDER of the game. Both reach the legacy scope through `engine.get(name)` (src/engine/index.ts)
 * and both return null rather than a guess whenever any piece is missing — the engine's own rule
 * ("Returns null on any missing piece"). The caller's probability ladder is sim -> de-vigged market
 * fair -> no grade at all; it must NEVER fall back to the pregame number, which prices a different
 * bet at a different line.
 */

/** the keyless, free MLB feed — the same base `src/lib/liveNow.ts` uses */
export const STATSAPI = "https://statsapi.mlb.com/api/v1";

/**
 * Sim depth for a live re-price: the SERVER generate's own figure (`simN: 10000`,
 * app/api/generate/route.ts), never the browser's 25,000 (`SIM_PATHS`, src/lib/engine-client.ts).
 * This route runs inside the same 60 s serverless budget /api/generate does, and the depth
 * question was settled on 2026-07-24: marginals move nothing past 0.10pp from 10k to 50k.
 */
export const MLB_LIVE_SIM_PATHS = 10000;

/** how many schedule days one read will ever ask for — the same safety cap `useLiveNow` applies */
export const MAX_SCHEDULE_DATES = 4;

/* ---------------------------------------------------------------- shapes */

type SchedTeam = { team?: { id?: number; name?: string }; score?: number | null };
export type MlbSchedGame = {
  gamePk: number;
  gameDate?: string;
  officialDate?: string;
  gameNumber?: number;
  doubleHeader?: string;
  status?: { abstractGameState?: string; detailedState?: string };
  teams?: { away?: SchedTeam; home?: SchedTeam };
  linescore?: { currentInning?: number; currentInningOrdinal?: string; inningState?: string; inningHalf?: string } | null;
};
type SchedDoc = { dates?: { games?: MlbSchedGame[] }[] };

/** one game as this module reports it — everything the selector and the quote join need */
export type MlbLiveGameState = {
  pk: number;
  /** the engine's game key: pnorm(away)@pnorm(home) (+ "gm<n>" on a doubleheader) */
  gkey: string;
  away: string;
  home: string;
  gnum: number | null;
  /** first pitch in ms, or null when the feed gave no readable gameDate */
  start: number | null;
  state: string;
  live: boolean;
  final: boolean;
  postponed: boolean;
  /** statsapi says the game is in a delay — still "live" to the tally, NEVER priceable (see `isDelayed`) */
  delayed: boolean;
  /** "Top 4th" — display only, never a decision input */
  inning: string | null;
  /** the shape `currentValue` takes for ml_/rl_ legs */
  status: GameStatus;
  linescore: MlbSchedGame["linescore"];
};

export type MlbLiveStateRead = {
  at: number;
  games: MlbLiveGameState[];
  /** boxscores, LIVE games only, capped at the config's liveMaxEvents */
  boxes: Record<number, Boxscore>;
  /** dates whose schedule call failed — stated, never silently read as an empty slate */
  schedFailed: string[];
  /** live games whose boxscore call failed (their tallies are simply unavailable) */
  boxFailed: number[];
};

/* ---------------------------------------------------------------- predicates */

/** VERBATIM from src/lib/liveNow.ts — `live: abs === "Live" || /in progress|delayed/i.test(st)` */
export function isLive(abstractGameState: string, detailedState: string): boolean {
  return abstractGameState === "Live" || /in progress|delayed/i.test(detailedState);
}

/** VERBATIM from src/lib/liveNow.ts — `final: /final|game over|completed/i.test(st)` */
export function isFinal(detailedState: string): boolean {
  return /final|game over|completed/i.test(detailedState);
}

/**
 * ADDITIVE, deliberately not folded into the two lifted predicates above. A postponed or
 * suspended game is neither live nor final, and `/in progress|delayed/i` would read a
 * "Delayed Start: Rain" game as live — correct for the phone's tally, wrong for spending a
 * credit re-pricing a game that is not being played.
 */
export function isPostponed(detailedState: string): boolean {
  return /postponed|cancell?ed|suspended/i.test(detailedState);
}

/**
 * IN A DELAY, NOT IN PLAY (fix pass, 2026-09-11). `isLive` is lifted verbatim from
 * `src/lib/liveNow.ts` and that predicate reads "Delayed Start: Rain" / "Rain Delay" as LIVE —
 * which is right for the phone's tally (the boxscore is still the real number) and wrong for two
 * things this module governs:
 *   • BUYING. A book pulls its in-play markets the moment play stops, so a credit spent on a
 *     rain-delayed game buys an empty event — and the EMPTY-EVENT RULE would then hold that game
 *     for two hours, so a weather pause could cost the rest of the game's live pricing.
 *   • SHOWING. The last quote before the delay keeps rendering with a pulsing LIVE pill for the
 *     balance of `quoteMaxAgeSec` against a market that is no longer posted. That is a stale price
 *     presenting as a live one, which is the class of dishonesty INSTRUCTION 50 existed to remove.
 * So `delayed` is tracked separately and `isPriceable` excludes it, while `live` stays byte-
 * identical to the browser's predicate and keeps feeding the tally.
 */
export function isDelayed(detailedState: string): boolean {
  return /delay/i.test(detailedState);
}

/** A game this route may pay to re-price: under way, not over, not called off, not in a delay. */
export const isPriceable = (g: Pick<MlbLiveGameState, "live" | "final" | "postponed" | "delayed">): boolean =>
  g.live && !g.final && !g.postponed && !g.delayed;

/**
 * The engine's `shGkey(away, home, gnum)` mirrored byte for byte: `pnorm(away)+"@"+pnorm(home)+
 * (gnum ? "gm"+gnum : "")`. `gnum` carries the engine's OWN semantics — null on a normal day, the
 * game number only on a doubleheader (`shGm`'s note: "keys stay byte-identical to the single-game
 * format"). statsapi sets `gameNumber: 1` on every game, doubleheader or not, so `schedGnum` below
 * is what converts the feed's spelling into the engine's before this is called; passing the raw
 * `gameNumber` would mint `...gm1` for all 15 games and match nothing on the board.
 *
 * This is a FALLBACK identifier. The route's real join is `gameInfo[gkey].pk` — the board's own
 * gamePk — so a game already on the board never depends on reconstructing its key from team names.
 */
export const gkeyOf = (away: string, home: string, gnum?: number | null): string =>
  `${pnorm(away)}@${pnorm(home)}${gnum ? `gm${gnum}` : ""}`;

/** statsapi's `gameNumber` in the engine's grammar: the number on a doubleheader, null otherwise. */
export const schedGnum = (g: Pick<MlbSchedGame, "gameNumber" | "doubleHeader">): number | null => {
  const dh = String(g.doubleHeader ?? "N").toUpperCase();
  return dh !== "N" && Number.isFinite(g.gameNumber) ? Number(g.gameNumber) : null;
};

/** "Top 4th" — the same composition `useLiveNow`'s `inningTxt` performs */
function inningTxt(ls: MlbSchedGame["linescore"]): string | null {
  if (!ls?.currentInningOrdinal) return null;
  const half = ls.inningHalf ? `${ls.inningHalf.slice(0, 3)} ` : "";
  return `${half}${ls.currentInningOrdinal}`.trim();
}

/* ---------------------------------------------------------------- the read */

export type MlbLiveStateDeps = {
  /** injected so the route's own fetch discipline (and the tests') is the one that runs */
  fetchJson?: <T>(url: string) => Promise<T | null>;
  /** at most this many LIVE boxscores are read — the config's liveMaxEvents */
  maxBoxes: number;
  now?: number;
};

/** A free feed read that must never break the answer: any failure is `null`, never a throw. */
async function defaultFetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Parse one schedule day's games into the shape the selector reads. Pure. */
export function parseSchedule(doc: SchedDoc | null): MlbLiveGameState[] {
  const out: MlbLiveGameState[] = [];
  for (const day of doc?.dates ?? []) {
    for (const g of day.games ?? []) {
      const away = g.teams?.away?.team?.name ?? "";
      const home = g.teams?.home?.team?.name ?? "";
      if (!away || !home || !Number.isFinite(g.gamePk)) continue;
      const st = g.status?.detailedState ?? "";
      const abs = g.status?.abstractGameState ?? "";
      const start = g.gameDate ? Date.parse(g.gameDate) : NaN;
      const gnum = schedGnum(g);
      out.push({
        pk: g.gamePk,
        gkey: gkeyOf(away, home, gnum),
        away,
        home,
        gnum,
        start: Number.isFinite(start) ? start : null,
        state: st,
        live: isLive(abs, st),
        final: isFinal(st),
        postponed: isPostponed(st),
        delayed: isDelayed(st),
        inning: inningTxt(g.linescore),
        status: { state: st, away: g.teams?.away?.score ?? null, home: g.teams?.home?.score ?? null },
        linescore: g.linescore ?? null,
      });
    }
  }
  return out;
}

/**
 * The whole free read: one schedule call per involved date (deduped, capped at
 * MAX_SCHEDULE_DATES), then one boxscore call per PRICEABLE game, live first, at most
 * `maxBoxes` of them. Zero Odds credits; nothing here can spend.
 */
export async function readMlbLiveState(dates: string[], deps: MlbLiveStateDeps): Promise<MlbLiveStateRead> {
  const getJson = deps.fetchJson ?? defaultFetchJson;
  const want = [...new Set(dates.filter(Boolean))].sort().slice(0, MAX_SCHEDULE_DATES);
  const games: MlbLiveGameState[] = [];
  const seen = new Set<number>();
  const schedFailed: string[] = [];
  for (const d of want) {
    const doc = await getJson<SchedDoc>(`${STATSAPI}/schedule?sportId=1&date=${d}&hydrate=linescore`);
    if (!doc) {
      schedFailed.push(d);
      continue;
    }
    for (const g of parseSchedule(doc)) {
      if (seen.has(g.pk)) continue; // a game can appear on two calendar days' answers
      seen.add(g.pk);
      games.push(g);
    }
  }

  const boxes: Record<number, Boxscore> = {};
  const boxFailed: number[] = [];
  const livePks = games.filter(isPriceable).map((g) => g.pk).slice(0, Math.max(0, deps.maxBoxes));
  for (const pk of livePks) {
    const bx = await getJson<Boxscore>(`${STATSAPI}/game/${pk}/boxscore`);
    if (bx) boxes[pk] = bx;
    else boxFailed.push(pk);
  }
  return { at: deps.now ?? Date.now(), games, boxes, schedFailed, boxFailed };
}

/**
 * This leg's live number right now — `currentValue` and nothing else. Null means UNDECIDED
 * (no boxscore, no appearance, an ml_/rl_ leg), never zero.
 */
export function liveTally(read: MlbLiveStateRead, pk: number | null | undefined, lkey: string | null | undefined): { txt: string; val: number | null } | null {
  if (pk == null || !lkey) return null;
  const g = read.games.find((x) => x.pk === pk);
  if (!g) return null;
  return currentValue(lkey, g.status, read.boxes[pk] ?? null);
}

/* ---------------------------------------------------------------- the optional sim */

/** the legacy scope's two live-sim bindings, as this module reaches them */
export type LiveSimEngine = { get<T = unknown>(name: string): T };

type ShLiveState = (linescore: unknown, boxscore: unknown) => Record<string, unknown> | null;
type ShSimGames = (ctx: unknown, n: number, seed: number) => { legP?: Record<string, number> } | null;

/**
 * The engine's RESUME STATE for an in-progress game: score, inning/half, outs, runners, next
 * batter, starter status and every player's real tally. `shLiveState` returns null on any missing
 * piece by its own design, and so does this — a guessed resume state would silently re-price the
 * whole remainder of a game off invented base-out state.
 */
export function liveInitOf(eng: LiveSimEngine, linescore: unknown, boxscore: unknown): Record<string, unknown> | null {
  if (!linescore || !boxscore) return null;
  try {
    const f = eng.get<ShLiveState>("shLiveState");
    return typeof f === "function" ? (f(linescore, boxscore) ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * Remaining-game probability per leg key, resumed from `init`. `simCtx` is the engine's own
 * per-game sim context (lineup PA vectors, leashes, legs) — it is built inside the engine's
 * analyze pass from posted lineups and is NOT recoverable from a stored board, so a caller
 * without one gets null here and MUST fall to the de-vigged market fair, labelled as a market
 * number. Returning a pregame probability instead would price a bet nobody can still make.
 */
export function liveLegP(
  eng: LiveSimEngine,
  simCtx: Record<string, unknown> | null,
  init: Record<string, unknown> | null,
  seed: number,
  paths: number = MLB_LIVE_SIM_PATHS,
): Record<string, number> | null {
  if (!simCtx || !init) return null;
  try {
    const run = eng.get<ShSimGames>("shSimGames");
    if (typeof run !== "function") return null;
    const out = run({ ...simCtx, init }, paths, seed);
    const legP = out?.legP;
    if (!legP || typeof legP !== "object") return null;
    const clean: Record<string, number> = {};
    for (const [k, v] of Object.entries(legP)) if (Number.isFinite(v)) clean[k] = v as number;
    return Object.keys(clean).length ? clean : null;
  } catch {
    return null;
  }
}
