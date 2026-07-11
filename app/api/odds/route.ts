import { NextRequest, NextResponse } from "next/server";

/**
 * The only caller of The Odds API. The browser passes the engine's full URL;
 * this proxy validates the host, swaps in the server-side key, and serves from
 * the Next data cache (~4 min TTL) so page loads never spend quota — only the
 * cache-refresh interval and explicit fresh pulls do.
 *
 * ODDS_API_KEY env overrides the legacy public key (rotate at cutover).
 * fresh=1 bypasses the cache; when APP_PASSCODE is set it requires the
 * x-pl-pass header (spend-money gate).
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

  const serverKey = process.env.ODDS_API_KEY;
  if (serverKey) url.searchParams.set("apiKey", serverKey);
  if (!url.searchParams.get("apiKey")) {
    return NextResponse.json({ error: "no API key configured" }, { status: 500 });
  }

  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  const pass = process.env.APP_PASSCODE;
  if (fresh && pass && req.headers.get("x-pl-pass") !== pass) {
    return NextResponse.json({ error: "passcode required for a fresh pull" }, { status: 401 });
  }

  const upstream = await fetch(url.toString(), {
    ...(fresh ? { cache: "no-store" as const } : { next: { revalidate: TTL_SECONDS } }),
  });

  const body = await upstream.text();
  const res = new NextResponse(body, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
  const quota = upstream.headers.get("x-requests-remaining");
  const used = upstream.headers.get("x-requests-used");
  if (quota) res.headers.set("x-requests-remaining", quota);
  if (used) res.headers.set("x-requests-used", used);
  return res;
}
