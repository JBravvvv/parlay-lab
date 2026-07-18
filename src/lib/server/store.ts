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
