import { NextRequest, NextResponse } from "next/server";
import { shapeAllowed } from "@/lib/server/odds-shape";

/**
 * The only caller of The Odds API. The browser passes the engine's full URL;
 * this proxy validates the host, swaps in the server-side key, and serves from
 * the Next data cache (~4 min TTL) so page loads never spend quota — only the
 * cache-refresh interval and explicit fresh pulls do.
 *
 * ODDS_API_KEY env overrides the legacy public key (rotate at cutover).
 *
 * HARDENED 2026-08-02 (poller contingency A + B, §12Z, on the owner's word):
 *   B — the `markets × regions` product must match one of the two shapes this product uses;
 *       anything else is 403 before the upstream is touched. Bounds the cache-key attack.
 *   A — an UNAUTHENTICATED `fresh=1` no longer 401s: it degrades to the CACHED path and the
 *       response carries `x-pl-stale: true`. An unauthenticated caller can never force an
 *       upstream fetch — and the 401 that would have KILLED THE MORNING BATCH the day
 *       APP_PASSCODE was set (snapshot_props retries 3x, returns empty) is gone with it.
 */
const ALLOWED_HOST = "api.the-odds-api.com";
const TTL_SECONDS = 240;

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("u");
  if (!raw) return NextResponse.json({ error: "missing u" }, { status: 400 });

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return NextResponse.json({ error: "bad url" }, { status: 400 });
  }
  if (url.protocol !== "https:" || url.hostname !== ALLOWED_HOST) {
    return NextResponse.json({ error: "host not allowed" }, { status: 403 });
  }
  if (!shapeAllowed(url)) {
    return NextResponse.json({ error: "market shape not allowed" }, { status: 403 });
  }

  const serverKey = process.env.ODDS_API_KEY;
  if (serverKey) url.searchParams.set("apiKey", serverKey);
  if (!url.searchParams.get("apiKey")) {
    return NextResponse.json({ error: "no API key configured" }, { status: 500 });
  }

  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  const pass = process.env.APP_PASSCODE;
  /* A: auth decides FRESHNESS, never availability. Unauthenticated fresh degrades to cache. */
  const authedFresh = fresh && (!pass || req.headers.get("x-pl-pass") === pass);
  const degraded = fresh && !authedFresh;

  const upstream = await fetch(url.toString(), {
    ...(authedFresh ? { cache: "no-store" as const } : { next: { revalidate: TTL_SECONDS } }),
  });

  const body = await upstream.text();
  const res = new NextResponse(body, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
  if (degraded) res.headers.set("x-pl-stale", "true");
  const quota = upstream.headers.get("x-requests-remaining");
  const used = upstream.headers.get("x-requests-used");
  if (quota) res.headers.set("x-requests-remaining", quota);
  if (used) res.headers.set("x-requests-used", used);
  return res;
}
