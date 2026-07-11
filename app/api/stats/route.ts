import { NextRequest, NextResponse } from "next/server";

/**
 * Read-only proxy for the free stat feeds the Stats page browses:
 * MLB Stats API (players/teams) and ESPN (NFL / NCAAF). No keys, no quota —
 * the proxy exists so the browser never depends on third-party CORS behavior,
 * and the Next data cache absorbs repeat loads.
 */
const ALLOWED_HOSTS = new Set(["statsapi.mlb.com", "site.web.api.espn.com", "site.api.espn.com"]);
const TTL_SECONDS = 180;

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("u");
  if (!raw) return NextResponse.json({ error: "missing u" }, { status: 400 });

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return NextResponse.json({ error: "bad url" }, { status: 400 });
  }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
    return NextResponse.json({ error: "host not allowed" }, { status: 403 });
  }

  const upstream = await fetch(url.toString(), {
    next: { revalidate: TTL_SECONDS },
    headers: { accept: "application/json" },
  });
  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
