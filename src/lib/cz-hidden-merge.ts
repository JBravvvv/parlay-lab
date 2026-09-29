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

/** Two entries for one pick: the newer `at` wins; a tie goes to hidden, from either side. */
function newer(ea: CzPrefEntry, eb: CzPrefEntry): CzPrefEntry {
  if (eb.at > ea.at) return eb;
  if (ea.at > eb.at) return ea;
  return ea.hidden ? ea : eb;
}

export function mergeCzHidden(a: CzHiddenMap, b: CzHiddenMap): CzHiddenMap {
  const out: CzHiddenMap = {};
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const k of keys) {
    const ea = a[k];
    const eb = b[k];
    out[k] = !ea ? eb : !eb ? ea : newer(ea, eb);
  }
  return out;
}

/** The player segment a team-less Board ALL-scope row carried until 2026-09-28, with its closing "|". */
export const CZ_NULL_TEAM = " (null)|";

/**
 * THE TEAM-LESS KEY MIGRATION (2026-09-28). The Board's ALL scope printed a prop row with no team
 * as "Name (null)" (the engine sets `tm` null when the book's spelling is missing from the stats
 * pull), and that string is the player segment of the key (`${market}|${player}|${line}|${side}`,
 * book-scoped as `book:<key>:…`). The row now prints the bare name, the engine's own label, so a
 * stored key holding " (null)|" is rewritten to the bare form.
 *
 * Two keys landing on one pick collide by the merge's own rule (`newer`), and a tombstone is an
 * entry like any other: nothing hidden comes back, nothing unhidden is re-hidden, and no orphan
 * stays in the hidden count. Idempotent and commutes with mergeCzHidden, so it runs at every door
 * (the device copy, every pull, both /api/prefs verbs) and only ever changes a map once. Run it
 * BEFORE pruneCzHidden: an old tombstone must out-vote its pair before the prune can drop it.
 * Returns the same object when no key holds the suffix; otherwise keys come out sorted.
 */
export function migrateCzHidden(map: CzHiddenMap): CzHiddenMap {
  const keys = Object.keys(map);
  if (!keys.some((k) => k.includes(CZ_NULL_TEAM))) return map;
  const byKey = new Map<string, CzPrefEntry>();
  for (const k of keys) {
    const bare = k.split(CZ_NULL_TEAM).join("|");
    const had = byKey.get(bare);
    byKey.set(bare, had ? newer(had, map[k]) : map[k]);
  }
  const out: CzHiddenMap = {};
  for (const k of [...byKey.keys()].sort()) out[k] = byKey.get(k)!;
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
