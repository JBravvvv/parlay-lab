/**
 * Caesars-toggle sync — the shared merge kernel (2026-08-10, Josh: "sync the
 * toggle across my devices"). Pure TypeScript, no browser, no server imports:
 * the client (cz-offered.ts) and /api/prefs both use it, so both sides agree
 * on what "the same preference" means. Same doctrine as ledger-merge.ts.
 *
 * Every key carries {hidden, at}. Merge is last-write-wins per key by `at` —
 * unhiding therefore writes a TOMBSTONE (hidden:false with a fresh `at`)
 * instead of deleting, or a stale hide on another device would resurrect it
 * on every sync. Ties go to hidden: hiding is always recoverable through the
 * board's reset line, so the reversible side is the safe side. The merge is
 * symmetric, idempotent, and emits keys in sorted order, so two devices
 * converge to byte-identical maps no matter who syncs first.
 *
 * Display-only end to end: nothing in this file or its callers touches the
 * engine, the card, or the record.
 */

export type CzPrefEntry = { hidden: boolean; at: number };
export type CzHiddenMap = Record<string, CzPrefEntry>;

export const CZ_MAX_KEYS = 4000;
export const CZ_MAX_KEY_LEN = 240;
export const CZ_MAX_BYTES = 256 * 1024;
/** hidden:false tombstones older than this drop at merge points — they exist
    only to out-vote stale hides, and 45 days outlives any realistic gap
    between two of Josh's devices syncing. Hides themselves never expire. */
export const CZ_PRUNE_MS = 45 * 24 * 3600 * 1000;

export function validateCzHidden(v: unknown): { ok: true; map: CzHiddenMap } | { ok: false; error: string } {
  if (v == null || typeof v !== "object" || Array.isArray(v)) {
    return { ok: false, error: "czHidden must be an object map" };
  }
  const keys = Object.keys(v as Record<string, unknown>);
  if (keys.length > CZ_MAX_KEYS) return { ok: false, error: `czHidden over ${CZ_MAX_KEYS} keys` };
  const map: CzHiddenMap = {};
  for (const k of keys.sort()) {
    if (k.length > CZ_MAX_KEY_LEN) return { ok: false, error: "czHidden key too long" };
    const e = (v as Record<string, unknown>)[k];
    if (e == null || typeof e !== "object" || Array.isArray(e)) {
      return { ok: false, error: `czHidden["${k.slice(0, 40)}"] must be {hidden, at}` };
    }
    const { hidden, at } = e as { hidden?: unknown; at?: unknown };
    if (typeof hidden !== "boolean") return { ok: false, error: `czHidden["${k.slice(0, 40)}"].hidden must be boolean` };
    if (typeof at !== "number" || !Number.isFinite(at) || at < 0) {
      return { ok: false, error: `czHidden["${k.slice(0, 40)}"].at must be a finite timestamp` };
    }
    map[k] = { hidden, at };
  }
  return { ok: true, map };
}

export function mergeCzHidden(a: CzHiddenMap, b: CzHiddenMap): CzHiddenMap {
  const out: CzHiddenMap = {};
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const k of keys) {
    const ea = a[k];
    const eb = b[k];
    if (!ea) out[k] = eb;
    else if (!eb) out[k] = ea;
    else if (eb.at > ea.at) out[k] = eb;
    else if (ea.at > eb.at) out[k] = ea;
    else out[k] = ea.hidden ? ea : eb; // tie → hidden wins, from either side
  }
  return out;
}

export function pruneCzHidden(map: CzHiddenMap, now: number): CzHiddenMap {
  const out: CzHiddenMap = {};
  for (const [k, e] of Object.entries(map)) {
    if (!e.hidden && now - e.at > CZ_PRUNE_MS) continue;
    out[k] = e;
  }
  return out;
}
