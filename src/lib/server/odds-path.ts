/**
 * AUDIT E2-2 — WHICH UPSTREAM REQUESTS THE /api/odds PROXY WILL MAKE.
 *
 * The proxy used to take the caller's whole URL, check only the host and the `markets x regions`
 * shape, and send the rest on as written. So the provider's historical endpoint (about ten times
 * the price), every other sport, and any extra query parameter all went through on the server's
 * key, and a second `markets=` could ride past the shape check.
 *
 * Now the proxy sends nothing the caller wrote. It reads the caller's URL, decides which of four
 * request kinds it is, and BUILDS the upstream request from the parts it recognises:
 *
 *   sports      /v4/sports                               (free; the quota tool reads its headers)
 *   events      /v4/sports/<sport>/events                (free)
 *   odds        /v4/sports/<sport>/odds                  (markets x regions credits)
 *   event-odds  /v4/sports/<sport>/events/<id>/odds      (markets returned x regions credits)
 *
 * `<sport>` is one of the four sports a caller in this repo asks for. Everything else is refused
 * before the provider is touched.
 *
 * WHAT THIS DOES NOT CLOSE: the proxy still answers callers with no credential, because the
 * browser engine, the line-history tools and the two side desks call it that way. Such a caller
 * can still make the server pay for the allowed kinds, once per distinct request per cache
 * window. Closing that needs a credential on every call, which is the owner's decision.
 *
 * This module names no host and no bookmaker. The route supplies the host.
 */

export const PROXY_SPORTS = ["baseball_mlb", "americanfootball_nfl", "americanfootball_ncaaf", "mma_mixed_martial_arts"] as const;

export type ProxyKind = "sports" | "events" | "odds" | "event-odds";
export type ProxyTarget = { kind: ProxyKind; path: string };

const SPORT = `(?:${PROXY_SPORTS.join("|")})`;
const EVENT_ID = "[A-Za-z0-9]{1,64}";

const ROUTES: [ProxyKind, RegExp][] = [
  ["sports", /^\/v4\/sports\/?$/],
  ["events", new RegExp(`^/v4/sports/${SPORT}/events$`)],
  ["odds", new RegExp(`^/v4/sports/${SPORT}/odds$`)],
  ["event-odds", new RegExp(`^/v4/sports/${SPORT}/events/${EVENT_ID}/odds$`)],
];

/** the request kind a caller's URL asks for, or null when the path is not one the proxy serves */
export function proxyTargetOf(url: URL): ProxyTarget | null {
  const path = url.pathname;
  for (const [kind, re] of ROUTES) if (re.test(path)) return { kind, path };
  return null;
}

const MARKET = /^[a-z0-9_]{1,40}$/;
const REGION = /^[a-z]{2,3}$/;
const ODDS_FORMATS = new Set(["american", "decimal"]);

/** a comma list as its distinct tokens (sorted when `sort` is set, else in the caller's order), or null when any token is not well formed */
function listOf(raw: string | null, token: RegExp, sort: boolean): string[] | null {
  if (raw == null) return [];
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.some((p) => !token.test(p))) return null;
  const distinct = [...new Set(parts)];
  return sort ? distinct.sort() : distinct;
}

export type ProxyUpstream = { ok: true; pathAndQuery: string } | { ok: false; error: string };

/**
 * The upstream path and query for a caller's URL, built from recognised parts only.
 *
 * - the two free kinds carry the key and nothing else;
 * - the two priced kinds carry `regions`, `markets` (distinct, sorted, so one market set is one
 *   cache entry however the caller ordered it), `oddsFormat` when it is a known value, and the key;
 * - only the FIRST value of a repeated parameter is read, and it is the only one sent;
 * - every other parameter is dropped (dates, event filters, link and limit flags, anything else).
 */
export function proxyUpstreamOf(url: URL, target: ProxyTarget, apiKey: string): ProxyUpstream {
  const key = `apiKey=${encodeURIComponent(apiKey)}`;
  if (target.kind === "sports" || target.kind === "events") return { ok: true, pathAndQuery: `${target.path}?${key}` };

  const markets = listOf(url.searchParams.get("markets"), MARKET, true);
  if (!markets) return { ok: false, error: "bad market list" };
  if (!markets.length) return { ok: false, error: "missing markets" };
  const regions = listOf(url.searchParams.get("regions"), REGION, false);
  if (!regions) return { ok: false, error: "bad region list" };
  if (!regions.length) return { ok: false, error: "missing regions" };

  const parts = [`regions=${regions.join(",")}`, `markets=${markets.join(",")}`];
  const fmt = url.searchParams.get("oddsFormat");
  if (fmt && ODDS_FORMATS.has(fmt)) parts.push(`oddsFormat=${fmt}`);
  parts.push(key);
  return { ok: true, pathAndQuery: `${target.path}?${parts.join("&")}` };
}
