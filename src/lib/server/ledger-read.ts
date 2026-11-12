import { redis } from "@/lib/server/store";

/**
 * READING THE STORED MLB LEDGER — an unreadable value is not an empty ledger (AUDIT D-1).
 *
 * Three places used to read `pl:ledger:v1` and treat "JSON.parse failed" or "no `ledger` array" the
 * same as "nothing stored yet":
 *   - the epoch check reset it to an empty ledger, with no archive, on any authed request;
 *   - writeLock wrote a one-day ledger over it;
 *   - the ledger route showed an empty ledger and then wrote the device's copy over it.
 * Each one replaces the whole record with whatever the caller happened to hold. Football already
 * refuses (FootballStoreUnreadable in football-lock.ts); this is the same rule for MLB, in one place.
 *
 * THE RULE: absent → null (a first write is fine). Readable → the stored object. Anything else →
 * copy the raw value aside ONCE (SET NX, so a second failure can never replace the first copy) and
 * THROW, so no caller can reach its SET. Nothing here deletes, resets or rewrites the ledger key.
 */

/** where the raw value is copied the first time it is found unreadable */
export const unreadableKeyOf = (key: string): string => `${key}:unreadable`;

export class LedgerUnreadable extends Error {
  readonly key: string;
  readonly why: string;
  constructor(key: string, why: string) {
    super(`${key} holds an unreadable value (${why}) — refusing to write, because a value nothing can parse is not an empty ledger`);
    this.name = "LedgerUnreadable";
    this.key = key;
    this.why = why;
  }
}

export type StoredLedger<T> = { ledger: T[]; at?: number; epoch?: number };

export type ParsedLedger<T> =
  | { state: "absent" }
  | { state: "ok"; stored: StoredLedger<T> }
  | { state: "unreadable"; why: string };

/** pure: what the raw stored value is. `null`, `undefined` and "" are absent; everything else must parse to an object holding a `ledger` array. */
export function parseStoredLedger<T>(raw: unknown): ParsedLedger<T> {
  if (raw == null || raw === "") return { state: "absent" };
  if (typeof raw !== "string") return { state: "unreadable", why: `a ${typeof raw}, not text` };
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch (e) {
    return { state: "unreadable", why: `not JSON: ${(e as Error).message.slice(0, 80)}` };
  }
  if (v == null || typeof v !== "object" || Array.isArray(v)) return { state: "unreadable", why: "not an object" };
  if (!Array.isArray((v as { ledger?: unknown }).ledger)) return { state: "unreadable", why: "no `ledger` array on the stored object" };
  return { state: "ok", stored: v as StoredLedger<T> };
}

export type LedgerRun = (cmd: (string | number)[]) => Promise<unknown>;

/**
 * Read a stored ledger. Returns null when nothing is stored; throws LedgerUnreadable (after copying
 * the raw value aside once) when what is stored cannot be read. `raw` rides along so a caller that
 * must archive the exact stored text has it.
 */
export async function readStoredLedger<T>(key: string, run: LedgerRun = redis): Promise<{ stored: StoredLedger<T>; raw: string } | null> {
  const raw = await run(["GET", key]);
  const p = parseStoredLedger<T>(raw);
  if (p.state === "absent") return null;
  if (p.state === "ok") return { stored: p.stored, raw: raw as string };
  try {
    await run(["SET", unreadableKeyOf(key), typeof raw === "string" ? raw : JSON.stringify(raw), "NX"]);
  } catch {
    /* the copy is best-effort; the refusal below is what protects the ledger */
  }
  throw new LedgerUnreadable(key, p.why);
}
