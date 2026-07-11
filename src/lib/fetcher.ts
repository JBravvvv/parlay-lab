"use client";

/**
 * The engine's network layer in the browser. Odds API calls are rewritten
 * through /api/odds (server key + server cache); MLB statsapi is free/unkeyed
 * and goes direct. Resolves the legacy {ok, body} shape — never rejects.
 */

const ODDS_HOST = "api.the-odds-api.com";

export function quotaRemaining(): string | null {
  try {
    return localStorage.getItem("pl_quota");
  } catch {
    return null;
  }
}

export async function browserFetchJson(url: string): Promise<{ ok: boolean; body: unknown }> {
  try {
    let target = url;
    let viaProxy = false;
    try {
      if (new URL(url).hostname === ODDS_HOST) {
        target = `/api/odds?u=${encodeURIComponent(url)}`;
        viaProxy = true;
      }
    } catch {
      /* relative/odd URL — fetch as-is */
    }
    const r = await fetch(target);
    if (viaProxy) {
      const q = r.headers.get("x-requests-remaining");
      if (q) {
        try {
          localStorage.setItem("pl_quota", q);
          localStorage.setItem("pl_quota_at", String(Date.now()));
        } catch {
          /* storage full — quota display is best-effort */
        }
      }
    }
    const body = await r.json().catch(() => null);
    return { ok: r.ok && body != null, body: body ?? {} };
  } catch {
    return { ok: false, body: {} };
  }
}
