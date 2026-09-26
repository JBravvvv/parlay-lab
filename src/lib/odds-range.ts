export type OddsRange = { min: number | null; max: number | null };
export const OPEN_RANGE: OddsRange = { min: null, max: null };
export function inOddsRange(am: number, r: OddsRange): boolean {
  return Number.isFinite(am) && (r.min == null || am >= r.min) && (r.max == null || am <= r.max);
}
