/**
 * MARKETS NOT OFFERED TO ARIZONA BETTORS (config-driven, 2026-11-12).
 *
 * The Odds API returns each book's general US lines. Those can include markets the Arizona apps do
 * not show. A market type on this list is never picked (`az_excluded`), whatever the model says.
 *
 * Two sources feed the list:
 *   1. AZ_DEFAULT_EXCLUSIONS below: rules known ahead of time, each with where it comes from.
 *   2. The stored list (`pl:at:azx`): market types Josh marked "not available in AZ" from the UI.
 *      Marking a pick also voids that pick, so it leaves every result.
 *
 * MARKET TYPES are `<sport>:<class>` with an optional finer tail, e.g. `nfl:spread`,
 * `cfb:player_prop`, `cfb:player_prop:pass_yds`. An entry excludes its own type and everything
 * under it: `cfb:player_prop` excludes `cfb:player_prop:pass_yds`; it does not exclude `cfb:spread`.
 */

export type AzExclusion = {
  marketType: string;
  reason: string;
  /** Where the rule comes from, so it can be re-checked. */
  source: string;
  /** Date the source was last read (YYYY-MM-DD). */
  checked: string;
};

/**
 * COLLEGE PROPOSITION BETS. The Arizona Department of Gaming's own event-wagering FAQ ("What types
 * of wagers will be prohibited?", gaming.az.gov/node/1255) lists collegiate proposition bets among
 * the prohibited wagers, beside injuries, penalties and high-school events. So no college prop of
 * any kind is ever a pick here. College sides, totals and moneylines are allowed.
 */
const ADG = "Arizona Department of Gaming FAQ, gaming.az.gov/node/1255";

export const AZ_DEFAULT_EXCLUSIONS: readonly AzExclusion[] = [
  { marketType: "cfb:player_prop", reason: "College player props are prohibited in Arizona", source: ADG, checked: "2026-11-12" },
  { marketType: "cfb:prop", reason: "College proposition bets are prohibited in Arizona", source: ADG, checked: "2026-11-12" },
  { marketType: "ncaab:player_prop", reason: "College player props are prohibited in Arizona", source: ADG, checked: "2026-11-12" },
  { marketType: "ncaab:prop", reason: "College proposition bets are prohibited in Arizona", source: ADG, checked: "2026-11-12" },
];

const clean = (s: string) => s.trim().toLowerCase();

/** Does `entry` exclude `marketType`? Its own type, or anything under it. */
export function excludes(entry: string, marketType: string): boolean {
  const e = clean(entry);
  const m = clean(marketType);
  if (!e) return false;
  return m === e || m.startsWith(`${e}:`);
}

/** The exclusion test the engine runs: the defaults plus the stored list. */
export function excludedBy(stored: readonly { marketType: string }[] = [], defaults: readonly { marketType: string }[] = AZ_DEFAULT_EXCLUSIONS): (marketType: string) => boolean {
  const entries = [...defaults, ...stored].map((x) => x.marketType);
  return (marketType) => entries.some((e) => excludes(e, marketType));
}

/** A market type is well formed when it is `<sport>:<class>[:<tail>...]` in lower-case key characters. */
export function validMarketType(s: unknown): s is string {
  return typeof s === "string" && /^[a-z0-9_]{2,20}(:[a-z0-9_]{1,40}){1,3}$/.test(s);
}
