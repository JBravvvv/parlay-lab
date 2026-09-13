import type { GenSpec } from "./parlay-gen";

/** A recipe stores preferences only: never quoted legs, forecasts or tickets. */
export function encodeSetup(spec: GenSpec): string {
  const { pinned: _pins, ...settings } = spec;
  return JSON.stringify({ version: 1, settings: { ...settings, style: settings.style ?? "safer" } });
}

export function decodeSetup(raw: string | null, markets: readonly string[], positions: readonly string[] = []): GenSpec | null {
  try {
    const saved = JSON.parse(raw ?? "null");
    if (saved?.version !== 1) return null;
    const s = saved.settings;
    const price = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) >= 100 && Math.abs(v) <= 1_000_000;
    if (!s || !markets.includes(s.market) || !Number.isInteger(s.legs) || s.legs < 2 || s.legs > 8
      || !price(s.legMinAm) || !price(s.legMaxAm) || !["o", "u", "both"].includes(s.sides)
      || !["safer", "balanced"].includes(s.style)
      || (s.positions !== undefined && (!Array.isArray(s.positions) || s.positions.length > positions.length
        || s.positions.some((p: unknown) => typeof p !== "string" || !positions.includes(p))))
      || [s.onePerGame, s.czOnly, s.includeStarted, s.modelOnly].some((v) => typeof v !== "boolean")
      || (s.payout !== null && (!price(s.payout?.minAm) || !price(s.payout?.maxAm)))) return null;
    return { market: s.market, legs: s.legs, legMinAm: s.legMinAm, legMaxAm: s.legMaxAm,
      sides: s.sides, style: s.style, onePerGame: s.onePerGame, czOnly: s.czOnly,
      includeStarted: s.includeStarted, modelOnly: s.modelOnly,
      ...(s.positions !== undefined ? { positions: [...new Set(s.positions as string[])].sort() } : {}),
      payout: s.payout ? { minAm: s.payout.minAm, maxAm: s.payout.maxAm } : null,
      pinned: Array.from({ length: s.legs }, () => null) };
  } catch { return null; }
}
