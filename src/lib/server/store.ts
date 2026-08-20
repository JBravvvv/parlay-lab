import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Shared server-side store helpers: Upstash Redis REST + the sync-phrase
 * auth. Used by /api/ledger (season record sync), /api/predictions
 * (calibration write-side) and /api/calibrate|calibration.
 */

export function storeEnv(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

export async function redis(cmd: unknown[]): Promise<unknown> {
  const env = storeEnv();
  if (!env) throw new Error("no store");
  const r = await fetch(env.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.token}`, "content-type": "application/json" },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`store ${r.status}`);
  const j = (await r.json()) as { result?: unknown; error?: string };
  if (j.error) throw new Error(j.error);
  return j.result;
}

export async function redisGetJson<T>(key: string): Promise<T | null> {
  const raw = (await redis(["GET", key])) as string | null;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function redisSetJson(key: string, value: unknown): Promise<void> {
  await redis(["SET", key, JSON.stringify(value)]);
}

export function syncAuthed(req: { headers: { get(k: string): string | null } }): boolean {
  const want = process.env.LEDGER_SYNC_KEY;
  const got = req.headers.get("x-pl-sync");
  if (!want || !got) return false;
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(want), h(got));
}

export function syncConfigMissing(): string[] {
  return [...(!storeEnv() ? ["store"] : []), ...(!process.env.LEDGER_SYNC_KEY ? ["key"] : [])];
}

/** Upgrade 03: external-scheduler auth — ?key=<CRON_SECRET> (cron-job.org can't send
    custom headers on the free tier). Timing-safe; absent env means the path is closed. */
export function cronKeyAuthed(req: { nextUrl: { searchParams: { get(k: string): string | null } } }): boolean {
  const want = process.env.CRON_SECRET;
  const got = req.nextUrl.searchParams.get("key");
  if (!want || !got) return false;
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(want), h(got));
}

/**
 * Phase 1a: the same secret in a HEADER instead of the query string. A query
 * string lands in Vercel's request logs and in every proxy along the way, which
 * was an acceptable trade for /api/clv (read-only) and is not for /api/generate,
 * where a leaked key spends ~120 Odds credits a call. cron-job.org supports
 * custom request headers (`extendedData.headers`), so there is no reason to put
 * this one in a URL. /api/clv keeps its existing contract untouched.
 */
export function cronHeaderAuthed(req: { headers: { get(k: string): string | null } }): boolean {
  const want = process.env.CRON_SECRET;
  if (!want) return false;
  const h = (s: string) => createHash("sha256").update(s).digest();
  const got = req.headers.get("x-cron-key");
  if (got && timingSafeEqual(h(want), h(got))) return true;
  /* VERCEL CRON (2026-08-20): two days of live watching proved the external pokes go
     dark in the evening — 08-19 and 08-20 both stranded the last block's budget with
     games still pregame. vercel.json now schedules evening pokes, and Vercel invokes
     cron paths with its own convention: `Authorization: Bearer <CRON_SECRET>` (the
     platform injects the env var's value; the secret never appears in any file).
     Same secret, same timing-safe comparison — a second spelling, not a second key. */
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ") && timingSafeEqual(h(want), h(auth.slice(7)))) return true;
  return false;
}
