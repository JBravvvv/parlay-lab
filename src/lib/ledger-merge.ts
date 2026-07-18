/**
 * Ledger sync — the shared merge kernel. Pure TypeScript, no browser, no
 * server imports: the client (ledgerSync.ts) and the API route both use it,
 * so both sides agree on what "the same record" means.
 *
 * The ledger is append-only by date and only LOCKED days sync. Merging is a
 * union by date; when both sides carry the same date the entries are the same
 * locked card, differing only in what accrued afterwards (grading, CLV
 * sightings, NV price confirms) — so the richer entry wins as the base and
 * the other side's accruals are overlaid onto anything the base is missing.
 * The rules are symmetric and deterministic: merge(a,b) === merge(b,a), and
 * re-merging is a no-op, which is what lets two devices converge no matter
 * who syncs first.
 */

export type SyncTicket = {
  id?: string;
  confirmed?: number | null;
  [k: string]: unknown;
};

export type SyncEntry = {
  date: string;
  locked: boolean;
  core: SyncTicket[];
  funT?: SyncTicket[];
  grading?: {
    done?: boolean;
    tickets?: Record<string, unknown>;
    legs?: Record<string, unknown>;
  } | null;
  clv?: Record<string, { am: number; at: number }>;
  [k: string]: unknown;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ENTRIES = 500;
export const MAX_BYTES = 900_000;

/** Locked-day shape check for anything arriving over the wire or from disk. */
export function validateLedger(x: unknown): { ok: true; entries: SyncEntry[] } | { ok: false; error: string } {
  if (!Array.isArray(x)) return { ok: false, error: "ledger must be an array" };
  if (x.length > MAX_ENTRIES) return { ok: false, error: `more than ${MAX_ENTRIES} days` };
  const seen = new Set<string>();
  for (const e of x) {
    if (!e || typeof e !== "object" || Array.isArray(e)) return { ok: false, error: "entry is not an object" };
    const d = (e as SyncEntry).date;
    if (typeof d !== "string" || !DATE_RE.test(d)) return { ok: false, error: "entry missing a YYYY-MM-DD date" };
    if ((e as SyncEntry).locked !== true) return { ok: false, error: `unlocked entry (${d}) — only locked days sync` };
    if (!Array.isArray((e as SyncEntry).core)) return { ok: false, error: `entry ${d} has no core tickets array` };
    if (seen.has(d)) return { ok: false, error: `duplicate date ${d}` };
    seen.add(d);
  }
  if (JSON.stringify(x).length > MAX_BYTES) return { ok: false, error: "ledger too large" };
  return { ok: true, entries: x as SyncEntry[] };
}

function clvCount(e: SyncEntry): number {
  return e.clv ? Object.keys(e.clv).length : 0;
}
function confirmedCount(e: SyncEntry): number {
  let n = 0;
  for (const t of [...e.core, ...(e.funT ?? [])]) if (t.confirmed != null) n++;
  return n;
}
function gradeScore(e: SyncEntry): number {
  if (!e.grading) return 0;
  return e.grading.done ? 2 : 1;
}

/** Richer-entry-wins ordering; final tiebreak is byte order so ties are still deterministic. */
function pickBase(a: SyncEntry, b: SyncEntry): [SyncEntry, SyncEntry] {
  const ja = JSON.stringify(a);
  const jb = JSON.stringify(b);
  if (ja === jb) return [a, b];
  const ka = [gradeScore(a), clvCount(a), confirmedCount(a), ja.length];
  const kb = [gradeScore(b), clvCount(b), confirmedCount(b), jb.length];
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return ka[i] > kb[i] ? [a, b] : [b, a];
  }
  return ja > jb ? [a, b] : [b, a];
}

/** Overlay the loser's accruals onto whatever the base is missing. */
function mergeDay(x: SyncEntry, y: SyncEntry): SyncEntry {
  const [base, other] = pickBase(x, y);
  const out: SyncEntry = JSON.parse(JSON.stringify(base));
  if (!out.grading && other.grading) out.grading = JSON.parse(JSON.stringify(other.grading));
  if (other.clv) {
    out.clv = { ...JSON.parse(JSON.stringify(other.clv)), ...(out.clv ?? {}) };
  }
  const fill = (mine: SyncTicket[], theirs: SyncTicket[] | undefined) => {
    if (!theirs) return;
    for (const t of mine) {
      if (t.confirmed != null || !t.id) continue;
      const m = theirs.find((o) => o.id === t.id);
      if (m && m.confirmed != null) t.confirmed = m.confirmed;
    }
  };
  fill(out.core, other.core);
  fill(out.funT ?? [], other.funT);
  return out;
}

/** Union by date, richer day wins, accruals overlaid. Symmetric + idempotent. */
export function mergeLedgers(a: SyncEntry[], b: SyncEntry[]): SyncEntry[] {
  const byDate = new Map<string, SyncEntry>();
  for (const e of a) if (e.locked) byDate.set(e.date, e);
  for (const e of b) {
    if (!e.locked) continue;
    const cur = byDate.get(e.date);
    byDate.set(e.date, cur ? mergeDay(cur, e) : e);
  }
  return [...byDate.values()].sort((p, q) => (p.date < q.date ? -1 : 1));
}
