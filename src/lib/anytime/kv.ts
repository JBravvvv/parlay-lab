/**
 * The handful of store commands the any-time ledger needs, as an interface, so the ledger's rules
 * (write-once picks, leases, indexes) are tested against an in-memory store and run in production
 * against Upstash (src/lib/server/anytime-kv.ts) with the same code.
 */
export interface Kv {
  get(key: string): Promise<string | null>;
  mget(keys: string[]): Promise<(string | null)[]>;
  /** Plain overwrite. NEVER used on a pick or a grade: those go through `setNx`. */
  set(key: string, value: string): Promise<void>;
  /** Write only if the key does not exist. True when this call created it. `pxMs` = expiry. */
  setNx(key: string, value: string, pxMs?: number): Promise<boolean>;
  del(key: string): Promise<void>;
  sadd(key: string, members: string[]): Promise<void>;
  srem(key: string, members: string[]): Promise<void>;
  smembers(key: string): Promise<string[]>;
  /** Push to the head of a list and keep only the newest `keep` entries. */
  lpushTrim(key: string, value: string, keep: number): Promise<void>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
}

/** In-memory store with the same semantics (expiry included). For tests and local replays. */
export function memoryKv(clock: () => number = Date.now): Kv & { dump(): Record<string, unknown>; writes: { op: string; key: string }[] } {
  const strings = new Map<string, { v: string; exp: number | null }>();
  const sets = new Map<string, Set<string>>();
  const lists = new Map<string, string[]>();
  const writes: { op: string; key: string }[] = [];
  const live = (key: string) => {
    const e = strings.get(key);
    if (!e) return null;
    if (e.exp != null && e.exp <= clock()) {
      strings.delete(key);
      return null;
    }
    return e;
  };
  return {
    writes,
    async get(key) {
      return live(key)?.v ?? null;
    },
    async mget(keys) {
      return keys.map((k) => live(k)?.v ?? null);
    },
    async set(key, value) {
      writes.push({ op: "set", key });
      strings.set(key, { v: value, exp: null });
    },
    async setNx(key, value, pxMs) {
      if (live(key)) return false;
      writes.push({ op: "setNx", key });
      strings.set(key, { v: value, exp: pxMs != null ? clock() + pxMs : null });
      return true;
    },
    async del(key) {
      writes.push({ op: "del", key });
      strings.delete(key);
      sets.delete(key);
      lists.delete(key);
    },
    async sadd(key, members) {
      writes.push({ op: "sadd", key });
      const s = sets.get(key) ?? new Set<string>();
      for (const m of members) s.add(m);
      sets.set(key, s);
    },
    async srem(key, members) {
      writes.push({ op: "srem", key });
      const s = sets.get(key);
      if (s) for (const m of members) s.delete(m);
    },
    async smembers(key) {
      return [...(sets.get(key) ?? [])];
    },
    async lpushTrim(key, value, keep) {
      writes.push({ op: "lpush", key });
      const l = lists.get(key) ?? [];
      l.unshift(value);
      lists.set(key, l.slice(0, keep));
    },
    async lrange(key, start, stop) {
      const l = lists.get(key) ?? [];
      return l.slice(start, stop < 0 ? undefined : stop + 1);
    },
    dump() {
      const out: Record<string, unknown> = {};
      for (const [k, e] of strings) out[k] = e.v;
      for (const [k, s] of sets) out[k] = [...s].sort();
      for (const [k, l] of lists) out[k] = [...l];
      return out;
    },
  };
}
