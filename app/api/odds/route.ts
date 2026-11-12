import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { shapeAllowed } from "@/lib/server/odds-shape";
import { oddsFetch } from "@/lib/server/odds-client";
import { proxyTargetOf, proxyUpstreamOf } from "@/lib/server/odds-path";
import { syncAuthed } from "@/lib/server/store";

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
 *
 * AUDIT E2-2 (2026-11-12):
 *   C — the upstream request is BUILT here, never passed through. The path must be one of four
 *       request kinds on one of four sports (src/lib/server/odds-path.ts); the provider's
 *       historical endpoint and every other path is 403 before the upstream is touched. Only
 *       regions, markets and oddsFormat are read from the caller, first value only; every other
 *       parameter is dropped.
 *   D — A now holds when APP_PASSCODE is unset too. The check used to read "no passcode on the
 *       server" as "everyone is authenticated", so anyone could force an uncached pull. A fresh
 *       pull now needs the sync phrase or the passcode, compared in constant time. Without one
 *       the request still degrades to the cached path with the stale header, exactly as A says.
 */
const ALLOWED_HOST = "api.the-odds-api.com";
const TTL_SECONDS = 240;
/** the longest `u` read. An assumption: the longest URL a caller in this repo builds is under 400 characters. */
const MAX_URL = 2000;

/** the app passcode in the x-pl-pass header; false when the server has none or the request sent none */
function passAuthed(req: NextRequest): boolean {
  const want = process.env.APP_PASSCODE;
  const got = req.headers.get("x-pl-pass");
  if (!want || !got) return false;
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(want), h(got));
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("u");
  if (!raw) return NextResponse.json({ error: "missing u" }, { status: 400 });
  if (raw.length > MAX_URL) return NextResponse.json({ error: "bad url" }, { status: 400 });

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return NextResponse.json({ error: "bad url" }, { status: 400 });
  }
  if (url.protocol !== "https:" || url.hostname !== ALLOWED_HOST) {
    return NextResponse.json({ error: "host not allowed" }, { status: 403 });
  }
  const target = proxyTargetOf(url);
  if (!target) {
    return NextResponse.json({ error: "path not allowed" }, { status: 403 });
  }
  if (!shapeAllowed(url)) {
    return NextResponse.json({ error: "market shape not allowed" }, { status: 403 });
  }

  const apiKey = process.env.ODDS_API_KEY || url.searchParams.get("apiKey");
  if (!apiKey) {
    return NextResponse.json({ error: "no API key configured" }, { status: 500 });
  }
  const built = proxyUpstreamOf(url, target, apiKey);
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });

  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  /* A + D: auth decides FRESHNESS, never availability. A fresh pull with no valid credential
     degrades to the cache, whether or not the server has a passcode. */
  const authedFresh = fresh && (syncAuthed(req) || passAuthed(req));
  const degraded = fresh && !authedFresh;

  /* oddsFetch (2026-11-12): whatever region list the caller wrote, the upstream is asked for
     DraftKings + FanDuel by name and the body handed back holds only those two books */
  let upstream: Response;
  try {
    upstream = await oddsFetch(`https://${ALLOWED_HOST}${built.pathAndQuery}`, {
      ...(authedFresh ? { cache: "no-store" as const } : { next: { revalidate: TTL_SECONDS } }),
    });
  } catch {
    /* the reason is not repeated: an error from the network layer can carry the URL, and the URL carries the key */
    return NextResponse.json({ error: "upstream unreachable" }, { status: 502 });
  }

  const body = await upstream.text();
  const res = new NextResponse(body, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
  if (degraded) res.headers.set("x-pl-stale", "true");
  for (const name of ["x-requests-remaining", "x-requests-used", "x-requests-last"]) {
    const v = upstream.headers.get(name);
    if (v) res.headers.set(name, v);
  }
  return res;
}
