import { AZ_BOOKMAKERS_PARAM } from "@/lib/az/books";

/**
 * EVERY ODDS API REQUEST ASKS FOR THE TWO BOOKS BY NAME (2026-11-12, Josh's brief: "Request only
 * the two books from The Odds API using the bookmakers parameter: bookmakers=draftkings,fanduel.
 * Do not request by region.").
 *
 * The provider's own rule (the-odds-api.com v4 guide): "If both bookmakers and regions are both
 * specified, bookmakers takes priority" and "Every group of 10 bookmakers is the equivalent of 1
 * region". So two named books bill as ONE region: a game-lines call that asked `regions=us,eu`
 * (2 regions x 3 markets = 6 credits) costs 3, and a props call that asked `regions=us` costs the
 * same as before while returning only the two books.
 *
 * This is string surgery on purpose: the URL's other bytes (market order, the apiKey position,
 * commas) are left exactly as the caller wrote them, so cache keys and logs differ from the old
 * URL only in the one parameter.
 *
 * A URL with neither `markets` nor `regions` (the events list, scores) has no bookmaker dimension
 * and is returned unchanged. A URL on any other host is returned unchanged.
 */
const ODDS_HOST = "api.the-odds-api.com";
const REGIONS_RE = /([?&])regions=[^&#]*/;
const BOOKMAKERS_RE = /([?&])bookmakers=[^&#]*/;

export function isOddsApiUrl(url: string): boolean {
  try {
    return new URL(url).hostname === ODDS_HOST;
  } catch {
    return false;
  }
}

export function azOddsUrl(url: string): string {
  if (!isOddsApiUrl(url)) return url;
  const hasRegions = REGIONS_RE.test(url);
  const hasMarkets = /[?&]markets=/.test(url);
  if (!hasRegions && !hasMarkets) return url;
  const param = `bookmakers=${AZ_BOOKMAKERS_PARAM}`;
  /* a caller-supplied bookmakers list is replaced, never merged: no third book can ride along */
  let out = url.replace(BOOKMAKERS_RE, (_m, sep: string) => `${sep}__AZ_BOOKS__`);
  if (hasRegions) {
    out = out.includes("__AZ_BOOKS__")
      ? out.replace(REGIONS_RE, (_m, sep: string) => (sep === "?" ? "?" : "")).replace("?&", "?")
      : out.replace(REGIONS_RE, (_m, sep: string) => `${sep}__AZ_BOOKS__`);
  }
  if (!out.includes("__AZ_BOOKS__")) {
    const hash = out.indexOf("#");
    const head = hash < 0 ? out : out.slice(0, hash);
    const tail = hash < 0 ? "" : out.slice(hash);
    out = `${head}${head.includes("?") ? "&" : "?"}__AZ_BOOKS__${tail}`;
  }
  return out.replace("__AZ_BOOKS__", param);
}

/**
 * The provider's guide marks `bookmakers` optional and does not say whether `regions` may be
 * omitted. If the provider ever refuses a request for the missing parameter, the client retries
 * once with this form: `regions=us` beside the two named books. `bookmakers` takes priority, so
 * the answer still carries only DraftKings and FanDuel and bills as one region.
 */
export function azOddsUrlWithRegionFallback(url: string): string {
  const u = azOddsUrl(url);
  if (!isOddsApiUrl(u) || !/[?&]bookmakers=/.test(u) || REGIONS_RE.test(u)) return u;
  return u.replace(/([?&])bookmakers=/, (_m, sep: string) => `${sep}regions=us&bookmakers=`);
}

/** The bookmaker keys a URL asks for, or null when it names none (used by the guard test). */
export function bookmakersOf(url: string): string[] | null {
  try {
    const v = new URL(url).searchParams.get("bookmakers");
    return v == null ? null : v.split(",").map((s) => s.trim()).filter(Boolean);
  } catch {
    return null;
  }
}
