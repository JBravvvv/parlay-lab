import { STRATEGIES, SPORT_OPTIONS, TIMING_OPTIONS } from "./discovery";
import { LEG_MAX, LEG_MIN, type GenSpec } from "./parlay-gen";

/**
 * A recipe stores preferences only: never quoted legs, forecasts or tickets.
 *
 * Version 2 (2026-09-18): the build-style field is gone (Josh: the Safer / Balanced mixes and the
 * Favorites / Even / Longshots presets "aren't consistent across props"), and the new controls —
 * several categories, the spread rule, the hit-rate floor and the games filter — are saved. A
 * version-1 recipe still loads: its style is dropped and the new fields take their defaults.
 */
export function encodeSetup(spec: GenSpec): string {
  const { pinned: _pins, style: _style, games: _games, ...settings } = spec;
  return JSON.stringify({ version: 2, settings });
}

const isPrice = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) >= 100 && Math.abs(v) <= 1_000_000;

export function decodeSetup(raw: string | null, markets: readonly string[], positions: readonly string[] = []): GenSpec | null {
  try {
    const saved = JSON.parse(raw ?? "null");
    if (saved?.version !== 1 && saved?.version !== 2) return null;
    const s = saved.settings;
    if (!s || !markets.includes(s.market) || !Number.isInteger(s.legs) || s.legs < LEG_MIN || s.legs > LEG_MAX
      || !isPrice(s.legMinAm) || !isPrice(s.legMaxAm) || !["o", "u", "both"].includes(s.sides)
      || (s.positions !== undefined && (!Array.isArray(s.positions) || s.positions.length > positions.length
        || s.positions.some((p: unknown) => typeof p !== "string" || !positions.includes(p))))
      || [s.onePerGame, s.czOnly, s.includeStarted, s.modelOnly].some((v) => typeof v !== "boolean")
      || (s.payout !== null && (!isPrice(s.payout?.minAm) || !isPrice(s.payout?.maxAm)))) return null;
    if (s.phase !== undefined && !["pregame", "live", "mixed"].includes(s.phase)) return null;
    if (saved.version === 1 && !["safer", "balanced"].includes(s.style)) return null;
    if (s.markets !== undefined && (!Array.isArray(s.markets) || (!s.markets.length && !s.noMarkets)
      || s.markets.some((m: unknown) => typeof m !== "string" || !markets.includes(m)))) return null;
    if (s.spread !== undefined && typeof s.spread !== "boolean") return null;
    if (s.onePerTeam !== undefined && typeof s.onePerTeam !== "boolean") return null;
    if (s.minHit !== undefined && s.minHit !== null && (typeof s.minHit !== "number" || !(s.minHit >= 0 && s.minHit <= 1))) return null;
    if (s.noMarkets !== undefined && typeof s.noMarkets !== "boolean") return null;
    if (s.timeWindow !== undefined && (!Array.isArray(s.timeWindow) || s.timeWindow.length !== 2
      || !s.timeWindow.every((v: unknown) => Number.isInteger(v)) || s.timeWindow[0] < 0
      || s.timeWindow[1] > 24 || s.timeWindow[1] - s.timeWindow[0] < 1)) return null;
    for (const [key, options] of [["strategies", STRATEGIES], ["sports", SPORT_OPTIONS], ["timing", TIMING_OPTIONS]] as const) {
      if (s[key] !== undefined && (!Array.isArray(s[key]) || s[key].some((v: unknown) => !options.some(o => o.key === v)))) return null;
    }
    const mkts = s.markets !== undefined ? [...new Set(s.markets as string[])] : undefined;
    return { ...(s.betType === "model" || s.betType === "styles" ? {betType:s.betType} : {}), ...(s.strategies ? { strategies: s.strategies } : {}), ...(s.sports ? { sports: s.sports } : {}), ...(s.timing ? { timing: s.timing } : {}), ...(typeof s.preferDiversity === "boolean" ? {preferDiversity:s.preferDiversity} : {}), ...(s.phase ? {phase:s.phase} : {}), market: s.market, legs: s.legs, legMinAm: s.legMinAm, legMaxAm: s.legMaxAm,
      ...(s.timeWindow ? { timeWindow: [s.timeWindow[0], s.timeWindow[1]] as const } : {}),
      ...(s.noMarkets !== undefined ? { noMarkets: s.noMarkets } : {}),
      sides: s.sides, onePerGame: s.onePerGame, czOnly: s.czOnly,
      /* R2b (2026-09-18): a recipe saved before the team rule existed loads with the desks' default, ON */
      onePerTeam: typeof s.onePerTeam === "boolean" ? s.onePerTeam : true,
      includeStarted: s.includeStarted, modelOnly: s.modelOnly,
      ...(s.positions !== undefined ? { positions: [...new Set(s.positions as string[])].sort() } : {}),
      ...(mkts && mkts.length > 1 ? { markets: [s.market, ...mkts.filter((m) => m !== s.market)] } : {}),
      ...(s.spread !== undefined ? { spread: s.spread } : {}),
      ...(s.minHit !== undefined ? { minHit: s.minHit } : {}),
      payout: s.payout ? { minAm: s.payout.minAm, maxAm: s.payout.maxAm } : null,
      pinned: Array.from({ length: s.legs }, () => null) };
  } catch { return null; }
}
