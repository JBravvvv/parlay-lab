import type { Kv } from "@/lib/anytime/kv";
import { redis } from "@/lib/server/store";

/**
 * The any-time ledger's store, over the app's one Upstash REST client (src/lib/server/store.ts).
 * Same eleven commands as the in-memory store the ledger is tested against, nothing more: there is
 * no command here that can rewrite a pick, because the ledger never asks for one.
 *
 * `run` is injectable so the command shapes are tested without a store.
 */
export type RedisRun = (cmd: unknown[]) => Promise<unknown>;

const text = (v: unknown): string | null => (v == null ? null : typeof v === "string" ? v : String(v));
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(text).filter((x): x is string => x != null) : []);

export function upstashKv(run: RedisRun = redis): Kv {
  return {
    async get(key) {
      return text(await run(["GET", key]));
    },
    async mget(keys) {
      if (!keys.length) return [];
      const out = await run(["MGET", ...keys]);
      const arr = Array.isArray(out) ? out : [];
      /* one answer per key, in order: a short reply is a missing value, never a shifted one */
      return keys.map((_, i) => text(arr[i]));
    },
    async set(key, value) {
      await run(["SET", key, value]);
    },
    async setNx(key, value, pxMs) {
      const cmd: unknown[] = ["SET", key, value, "NX"];
      if (pxMs != null) cmd.push("PX", Math.max(1, Math.round(pxMs)));
      return (await run(cmd)) === "OK";
    },
    async del(key) {
      await run(["DEL", key]);
    },
    async sadd(key, members) {
      if (members.length) await run(["SADD", key, ...members]);
    },
    async srem(key, members) {
      if (members.length) await run(["SREM", key, ...members]);
    },
    async smembers(key) {
      return list(await run(["SMEMBERS", key]));
    },
    async lpushTrim(key, value, keep) {
      await run(["LPUSH", key, value]);
      await run(["LTRIM", key, 0, Math.max(0, keep - 1)]);
    },
    async lrange(key, start, stop) {
      return list(await run(["LRANGE", key, start, stop]));
    },
  };
}
