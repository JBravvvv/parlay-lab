import { ptDateOf } from "@/lib/cfb/dates";
import { isAzBook, type AzBook } from "@/lib/az/books";
import { familyStateOf, stillWritable } from "@/lib/anytime/engine";
import type { Kv } from "@/lib/anytime/kv";
import { ANYTIME_RULES, type AnytimeRules } from "@/lib/anytime/rules";
import type { CloseRecord, FamilyState, GradeRecord, PickRecord, Reject } from "@/lib/anytime/types";

/**
 * THE ANY-TIME LEDGER. Append-only by construction, not by promise:
 *
 *   pl:at:pick:<id>    one pick. Created with SET ... NX and never written again. There is no
 *                      function in this file that overwrites or deletes one.
 *   pl:at:grade:<id>   its settlement. Also created once with NX.
 *   pl:at:close:<id>   its closing line at both books. Rewritten while the event is ahead (each
 *                      later snapshot is a later "last look"), frozen once marked final.
 *   pl:at:void:<id>    "not available in Arizona" (or another void). Created once with NX.
 *
 * Everything else is an INDEX that can be rebuilt from those records: the per-day id sets, the
 * open-pick set, the per-event state the re-entry rule reads, the bankroll cache.
 *
 * A pick's id is its family and sequence number, so two runs that decide the same pick at the same
 * moment write the same key and the store keeps exactly one (the loser is told `lost_race` and
 * adopts the winner's record). That is the second lock; the run lease is the first.
 */

export const K = {
  pick: (id: string) => `pl:at:pick:${id}`,
  grade: (id: string) => `pl:at:grade:${id}`,
  close: (id: string) => `pl:at:close:${id}`,
  void: (id: string) => `pl:at:void:${id}`,
  day: (date: string) => `pl:at:day:${date}`,
  days: "pl:at:days",
  open: "pl:at:open",
  event: (sport: string, eventId: string) => `pl:at:ev:${sport}:${eventId}`,
  lease: "pl:at:lease",
  heartbeat: "pl:at:hb",
  run: (id: string) => `pl:at:run:${id}`,
  runs: "pl:at:runs",
  exclusions: "pl:at:azx",
  look: (sport: string) => `pl:at:look:${sport}`,
  bank: "pl:at:bank",
} as const;

const parse = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

/* ---------- the run lease ---------- */

export async function acquireLease(kv: Kv, runId: string, rules: AnytimeRules = ANYTIME_RULES): Promise<boolean> {
  return kv.setNx(K.lease, runId, rules.leaseMs);
}

/** Give the lease back, but only if this run still holds it (an expired lease may be someone else's). */
export async function releaseLease(kv: Kv, runId: string): Promise<void> {
  if ((await kv.get(K.lease)) === runId) await kv.del(K.lease);
}

/* ---------- per-event state (an index; rebuildable from the picks) ---------- */

export type EventState = {
  sport: string;
  eventId: string;
  commence: string;
  /** When a run last priced this event (ms). */
  lastLook: number | null;
  /** Latest pick per family. */
  families: Record<string, FamilyState>;
  /** Kelly units staked on this event's recorded picks. */
  kellyOpen: number;
  /** The reference quote per family at each book (decimal price and line), for line-move detection.
      Reset when a move is detected or a pick is recorded. */
  seen: Record<string, Partial<Record<AzBook, { dec: number; line: number | null }>>>;
};

export const emptyEventState = (sport: string, eventId: string, commence: string): EventState => ({ sport, eventId, commence, lastLook: null, families: {}, kellyOpen: 0, seen: {} });

export async function loadEventStates(kv: Kv, events: { sport: string; eventId: string; commence: string }[]): Promise<Map<string, EventState>> {
  const out = new Map<string, EventState>();
  if (!events.length) return out;
  const raws = await kv.mget(events.map((e) => K.event(e.sport, e.eventId)));
  events.forEach((e, i) => {
    const s = parse<EventState>(raws[i]);
    out.set(`${e.sport}|${e.eventId}`, s && s.families ? { ...emptyEventState(e.sport, e.eventId, e.commence), ...s, commence: e.commence } : emptyEventState(e.sport, e.eventId, e.commence));
  });
  return out;
}

export async function saveEventState(kv: Kv, s: EventState): Promise<void> {
  await kv.set(K.event(s.sport, s.eventId), JSON.stringify(s));
}

/* ---------- picks ---------- */

export type WriteOutcome = { written: PickRecord[]; rejects: Reject[]; adopted: PickRecord[] };

/**
 * Record the decided picks. Each one is re-checked against the server clock at the moment of its
 * write (start time and snapshot age), then created write-once. Nothing here can change a pick
 * that already exists.
 */
export async function writePicks(kv: Kv, picks: PickRecord[], clock: () => number, states: Map<string, EventState>, rules: AnytimeRules = ANYTIME_RULES): Promise<WriteOutcome> {
  const out: WriteOutcome = { written: [], rejects: [], adopted: [] };
  for (const p of picks) {
    if (!isAzBook(p.book) || !isAzBook(p.otherBook)) throw new Error(`NOT A TWO-BOOK PICK: ${p.id} at ${String(p.book)}`);
    const ok = stillWritable(p, clock(), rules);
    if (!ok.ok) {
      out.rejects.push({ family: p.family, selection: p.selection, reason: ok.reason, detail: "at write time" });
      continue;
    }
    const day = ptDateOf(p.ts);
    const created = await kv.setNx(K.pick(p.id), JSON.stringify(p));
    const stateKey = `${p.sport}|${p.eventId}`;
    const st = states.get(stateKey) ?? emptyEventState(p.sport, p.eventId, p.commence);
    states.set(stateKey, st);
    if (!created) {
      /* another run recorded this family's pick first: keep theirs, learn from it, write nothing */
      const theirs = parse<PickRecord>(await kv.get(K.pick(p.id)));
      if (theirs) {
        const held = st.families[theirs.family];
        if (!held || held.seq < theirs.seq) {
          st.families[theirs.family] = familyStateOf(theirs);
          st.kellyOpen = Math.round((st.kellyOpen + theirs.stakeKelly) * 100) / 100;
        }
        await kv.sadd(K.day(ptDateOf(theirs.ts)), [theirs.id]);
        await kv.sadd(K.days, [ptDateOf(theirs.ts)]);
        out.adopted.push(theirs);
      }
      out.rejects.push({ family: p.family, selection: p.selection, reason: "lost_race", detail: p.id });
      continue;
    }
    await kv.sadd(K.day(day), [p.id]);
    await kv.sadd(K.days, [day]);
    await kv.sadd(K.open, [p.id]);
    st.families[p.family] = familyStateOf(p);
    st.kellyOpen = Math.round((st.kellyOpen + p.stakeKelly) * 100) / 100;
    out.written.push(p);
  }
  return out;
}

export async function readPick(kv: Kv, id: string): Promise<PickRecord | null> {
  return parse<PickRecord>(await kv.get(K.pick(id)));
}

/* ---------- grades, closes, voids: their own keys, the pick is never touched ---------- */

/** Record a settlement once. False when the pick was already graded (the first grade stands). */
export async function writeGrade(kv: Kv, g: GradeRecord): Promise<boolean> {
  const created = await kv.setNx(K.grade(g.id), JSON.stringify(g));
  await kv.srem(K.open, [g.id]);
  return created;
}

/** Record the latest pre-start look as the close. A close marked final is never replaced.
    `held` is the stored close when the caller has just read it (saves the read); leave it out to read here. */
export async function writeClose(kv: Kv, c: CloseRecord, held?: CloseRecord | null): Promise<boolean> {
  if (held === undefined) held = parse<CloseRecord>(await kv.get(K.close(c.id)));
  if (held?.final) return false;
  await kv.set(K.close(c.id), JSON.stringify(c));
  return true;
}

export type VoidRecord = { id: string; reason: string; at: string; by: string; marketType?: string };

/** Mark a pick void (e.g. "not available in AZ"). Once; the pick itself is not changed. */
export async function writeVoid(kv: Kv, v: VoidRecord): Promise<boolean> {
  const created = await kv.setNx(K.void(v.id), JSON.stringify(v));
  if (created) await kv.srem(K.open, [v.id]);
  return created;
}

/* ---------- reading the ledger back ---------- */

export type LedgerRow = { pick: PickRecord; grade: GradeRecord | null; close: CloseRecord | null; void: VoidRecord | null };

const CHUNK = 150;
async function mgetAll(kv: Kv, keys: string[]): Promise<(string | null)[]> {
  const out: (string | null)[] = [];
  for (let i = 0; i < keys.length; i += CHUNK) out.push(...(await kv.mget(keys.slice(i, i + CHUNK))));
  return out;
}

export async function readRows(kv: Kv, ids: string[]): Promise<LedgerRow[]> {
  const uniq = [...new Set(ids)];
  if (!uniq.length) return [];
  const [picks, grades, closes, voids] = await Promise.all([
    mgetAll(kv, uniq.map(K.pick)),
    mgetAll(kv, uniq.map(K.grade)),
    mgetAll(kv, uniq.map(K.close)),
    mgetAll(kv, uniq.map(K.void)),
  ]);
  const rows: LedgerRow[] = [];
  uniq.forEach((_, i) => {
    const pick = parse<PickRecord>(picks[i]);
    if (!pick) return;
    rows.push({ pick, grade: parse<GradeRecord>(grades[i]), close: parse<CloseRecord>(closes[i]), void: parse<VoidRecord>(voids[i]) });
  });
  rows.sort((a, b) => (a.pick.ts < b.pick.ts ? -1 : a.pick.ts > b.pick.ts ? 1 : a.pick.id < b.pick.id ? -1 : 1));
  return rows;
}

/** Every pick ever recorded (optionally only the days in [from, to], YYYY-MM-DD Pacific). */
export async function readLedger(kv: Kv, range?: { from?: string; to?: string }): Promise<LedgerRow[]> {
  const days = (await kv.smembers(K.days)).filter((d) => (!range?.from || d >= range.from) && (!range?.to || d <= range.to)).sort();
  const ids: string[] = [];
  for (const d of days) ids.push(...(await kv.smembers(K.day(d))));
  return readRows(kv, ids);
}

export async function readOpen(kv: Kv): Promise<LedgerRow[]> {
  return readRows(kv, await kv.smembers(K.open));
}

/* ---------- Arizona exclusion list ---------- */

export type Exclusion = { marketType: string; reason: string; at: string; by: string };

export async function readStoredExclusions(kv: Kv): Promise<Exclusion[]> {
  return parse<Exclusion[]>(await kv.get(K.exclusions)) ?? [];
}

/** Add a market type to the stored list (the config-driven defaults live in src/lib/az/exclusions.ts). */
export async function addExclusion(kv: Kv, e: Exclusion): Promise<Exclusion[]> {
  const list = await readStoredExclusions(kv);
  if (!list.some((x) => x.marketType === e.marketType)) list.push(e);
  await kv.set(K.exclusions, JSON.stringify(list));
  return list;
}

export async function removeExclusion(kv: Kv, marketType: string): Promise<Exclusion[]> {
  const list = (await readStoredExclusions(kv)).filter((x) => x.marketType !== marketType);
  await kv.set(K.exclusions, JSON.stringify(list));
  return list;
}

/* ---------- heartbeat and run log ---------- */

export type Heartbeat = {
  runId: string;
  trigger: string;
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  status: "ok" | "partial" | "failed";
  picks: number;
  candidates: number;
  credits: number;
  remaining: number | null;
  ms: number;
  errors: string[];
};

export async function writeHeartbeat(kv: Kv, hb: Heartbeat): Promise<void> {
  await kv.set(K.heartbeat, JSON.stringify(hb));
}

export async function readHeartbeat(kv: Kv): Promise<Heartbeat | null> {
  return parse<Heartbeat>(await kv.get(K.heartbeat));
}

export type Health = { state: "ok" | "stale" | "failed" | "never"; ageMs: number | null; last: Heartbeat | null; message: string };

/** Is the engine alive? Stale = no run has finished inside the limit; failed = the last one did not succeed. */
export function healthOf(hb: Heartbeat | null, now: number, rules: AnytimeRules = ANYTIME_RULES): Health {
  if (!hb) return { state: "never", ageMs: null, last: null, message: "The pick engine has never completed a run." };
  const age = now - Date.parse(hb.finishedAt);
  if (!(age <= rules.heartbeatStaleMs)) {
    return { state: "stale", ageMs: age, last: hb, message: `No pick run has finished for ${Math.round(age / 60_000)} minutes (limit ${Math.round(rules.heartbeatStaleMs / 60_000)}). The scheduler may be down.` };
  }
  if (!hb.ok) return { state: "failed", ageMs: age, last: hb, message: `The last pick run failed: ${hb.errors[0] ?? "no reason recorded"}` };
  return { state: "ok", ageMs: age, last: hb, message: "The pick engine is running." };
}

/** Run records expire after 45 days (the heartbeat and the picks themselves do not). */
export const RUN_LOG_TTL_MS = 45 * 86_400_000;

export async function logRun(kv: Kv, runId: string, record: unknown): Promise<void> {
  await kv.setNx(K.run(runId), JSON.stringify(record), RUN_LOG_TTL_MS);
  await kv.lpushTrim(K.runs, runId, 300);
}

export async function recentRuns<T>(kv: Kv, n = 20): Promise<T[]> {
  const ids = await kv.lrange(K.runs, 0, n - 1);
  if (!ids.length) return [];
  return (await kv.mget(ids.map(K.run))).map((r) => parse<T>(r)).filter((r): r is T => !!r);
}

/* ---------- bankroll cache (an index; the report recomputes it from the rows) ---------- */

export type BankCache = { kelly: number; flat: number; graded: number; asOf: string };

export async function readBank(kv: Kv, rules: AnytimeRules = ANYTIME_RULES): Promise<BankCache> {
  return parse<BankCache>(await kv.get(K.bank)) ?? { kelly: rules.kelly.start, flat: 0, graded: 0, asOf: "" };
}

export async function saveBank(kv: Kv, b: BankCache): Promise<void> {
  await kv.set(K.bank, JSON.stringify(b));
}
