import { AZ_BOOKS, type AzBook } from "@/lib/az/books";
import { excludedBy } from "@/lib/az/exclusions";
import { amDec, azFair, type AzQuotes } from "@/lib/az/market";
import { decide } from "@/lib/anytime/engine";
import { gradeOf, type FinalScore } from "@/lib/anytime/grade";
import type { Kv } from "@/lib/anytime/kv";
import {
  K,
  acquireLease,
  loadEventStates,
  logRun,
  readBank,
  readOpen,
  readStoredExclusions,
  releaseLease,
  saveBank,
  saveEventState,
  writeClose,
  writeGrade,
  writeHeartbeat,
  writePicks,
  type BankCache,
  type EventState,
  type LedgerRow,
} from "@/lib/anytime/ledger";
import { payDec, returnOf } from "@/lib/anytime/report";
import { ANYTIME_RULES, cadenceFor, type AnytimeRules } from "@/lib/anytime/rules";
import { familyKeyOf, type Candidate, type CloseRecord, type PickRecord, type RejectReason, type Trigger } from "@/lib/anytime/types";

/**
 * THE ONE FUNCTION. Every trigger (the "Run picks now" button, the authenticated endpoint, the
 * CLI, the scheduler, an event) calls `runPicks`, and it always does the same thing:
 *
 *   1. take the run lease        a second trigger arriving while one is running is told "busy"
 *   2. grade                     settle every open pick whose game is over; mark closes final
 *   3. price                     ask each sport's adapter for every open selection at the two books
 *   4. decide                    the pure rules in engine.ts (start time, freshness, AZ list, EV, re-entry)
 *   5. write                     write-once picks; a pick another run wrote first is adopted, not doubled
 *   6. closing line              re-record both books' current quote on every open pick near its start
 *   7. heartbeat + run record    so a dead scheduler shows within one missed run
 *
 * Calling it twice in a row with nothing changed records nothing the second time. There is no
 * window, no "already ran today" flag, no daily count and no daily ceiling anywhere in it.
 *
 * It never throws for an ordinary failure: a broken feed, a spent credit budget or a store error
 * is caught, written into the run record and the heartbeat, and raised through `alert`.
 */

export type SportEvent = { sport: string; eventId: string; commence: string };

export type AdapterCtx = { now: number; runId: string; trigger: Trigger; force: boolean };

export type AdapterOut = {
  candidates: Candidate[];
  /** Every upcoming event the adapter priced (with or without a candidate). */
  events: SportEvent[];
  notes: string[];
  /** Odds snapshot the quotes came from: metadata only, never the body. */
  snapshot?: { id: string; fetchedAt: number; events: number } | null;
};

export type Adapter = { sport: string; candidates(ctx: AdapterCtx): Promise<AdapterOut> };

/**
 * Final scores for these picks, keyed by pick id. A pick with no entry is left open.
 * A provider that could read some games and not others returns what it read WITH the errors, so one
 * unreadable day never holds up the grades of every other day; the run reports the errors.
 */
export type ScoreRead = Map<string, FinalScore> | { scores: Map<string, FinalScore>; errors: string[] };
export type ScoreProvider = (picks: PickRecord[], now: number) => Promise<ScoreRead>;

/** Odds API spend for the run, as the odds client reports it. */
export type OddsSpend = { calls: number; cacheHits: number; credits: number; unmetered: number; remaining: number | null; used: number | null; budget: number | null; refused: number; errors: number; regionFallback: boolean };

export type OddsMeter = {
  /** Run `fn` under one Odds API tally, memory and budget; `spend()` reads it afterwards. */
  run<T>(runId: string, budget: number | null, fn: () => Promise<T>): Promise<T>;
  spend(): OddsSpend | null;
};

export type RunDeps = {
  kv: Kv;
  adapters: Adapter[];
  scores?: ScoreProvider;
  odds?: OddsMeter;
  clock?: () => number;
  rules?: AnytimeRules;
  /** Called once when a run fails or is partial. Must not throw; if it does it is ignored. */
  alert?: (r: RunResult) => Promise<void>;
  /** Run id source (tests pin it). */
  newRunId?: (now: number) => string;
};

export type RunOpts = {
  trigger: Trigger;
  /** Price every sport now regardless of the time-to-start cadence. Manual triggers default to true. */
  force?: boolean;
  /** Only these sports (default: every adapter). */
  sports?: string[];
};

export type RunResult = {
  status: "ok" | "partial" | "failed" | "busy";
  runId: string;
  trigger: Trigger;
  engine: string;
  startedAt: string;
  finishedAt: string;
  ms: number;
  /** Picks recorded by THIS run. */
  picks: PickRecord[];
  /** Picks another run recorded first that this run decided too (not doubled). */
  adopted: string[];
  candidates: number;
  events: number;
  rejects: Partial<Record<RejectReason, number>>;
  rejectSample: { selection: string; reason: RejectReason; detail?: string }[];
  graded: { id: string; result: string }[];
  closes: number;
  snapshots: { id: string; sport: string; fetchedAt: string; events: number }[];
  odds: OddsSpend | null;
  /** Sports not priced this run because no event was due a look yet. */
  skipped: string[];
  notes: string[];
  errors: string[];
  bank: BankCache;
};

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
const r2 = (v: number) => Math.round(v * 100) / 100;
const sameLine = (a: number | null, b: number | null) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 1e-9);
const isManual = (t: Trigger) => t === "manual-ui" || t === "manual-api" || t === "cli";

export function defaultRunId(now: number): string {
  return `r${now.toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`;
}

type Look = { at: number; nextCommence: number | null };

async function inChunks<T>(items: T[], size: number, fn: (x: T) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

/** The reference quote the line-move trigger compares against. */
const refOf = (q: AzQuotes, line: number | null) => {
  const out: Partial<Record<AzBook, { dec: number; line: number | null }>> = {};
  for (const b of AZ_BOOKS) if (q[b]) out[b] = { dec: Math.round(amDec(q[b]!.price) * 1e4) / 1e4, line };
  return out;
};

/** Did either book move this family since the reference quote: a new line, or the price by >= `lineMove`? */
export function movedSince(ref: Partial<Record<AzBook, { dec: number; line: number | null }>> | undefined, now: Partial<Record<AzBook, { dec: number; line: number | null }>>, rules: AnytimeRules = ANYTIME_RULES): boolean {
  if (!ref) return false;
  for (const b of AZ_BOOKS) {
    const a = ref[b];
    const c = now[b];
    if (!a || !c) continue;
    if (!sameLine(a.line, c.line)) return true;
    if (Math.abs(c.dec - a.dec) / a.dec >= rules.lineMove - 1e-12) return true;
  }
  return false;
}

export async function runPicks(deps: RunDeps, opts: RunOpts): Promise<RunResult> {
  const rules = deps.rules ?? ANYTIME_RULES;
  const clock = deps.clock ?? Date.now;
  const kv = deps.kv;
  const started = clock();
  const runId = (deps.newRunId ?? defaultRunId)(started);
  const force = opts.force ?? isManual(opts.trigger);
  const res: RunResult = {
    status: "ok", runId, trigger: opts.trigger, engine: rules.version, startedAt: new Date(started).toISOString(), finishedAt: "", ms: 0,
    picks: [], adopted: [], candidates: 0, events: 0, rejects: {}, rejectSample: [], graded: [], closes: 0, snapshots: [], odds: null,
    skipped: [], notes: [], errors: [], bank: { kelly: rules.kelly.start, flat: 0, graded: 0, asOf: "" },
  };
  const finish = () => {
    const end = clock();
    res.finishedAt = new Date(end).toISOString();
    res.ms = end - started;
    return res;
  };

  let leased = false;
  try {
    leased = await acquireLease(kv, runId, rules);
  } catch (e) {
    /* the store is down: nothing can be recorded, and nothing may be */
    res.status = "failed";
    res.errors.push(`store: ${msg(e)}`);
    finish();
    await raise(deps, res);
    return res;
  }
  if (!leased) {
    res.status = "busy";
    res.notes.push("Another run holds the lease; nothing was done.");
    return finish();
  }

  try {
    const body = async () => {
      /* ---- 2. grade what is over ---- */
      let open: LedgerRow[] = [];
      try {
        open = await readOpen(kv);
        res.bank = await readBank(kv, rules);
        await gradePass(deps, rules, open, res, clock);
      } catch (e) {
        res.errors.push(`grade: ${msg(e)}`);
      }

      /* ---- 3. price ---- */
      const all: Candidate[] = [];
      const events: SportEvent[] = [];
      const wanted = deps.adapters.filter((a) => !opts.sports || opts.sports.includes(a.sport));
      for (const a of wanted) {
        const now = clock();
        let look: Look | null = null;
        try {
          const raw = await kv.get(K.look(a.sport));
          look = raw ? (JSON.parse(raw) as Look) : null;
        } catch {
          look = null;
        }
        if (!force && look && Number.isFinite(look.at)) {
          const toStart = look.nextCommence != null && look.nextCommence > now ? look.nextCommence - now : Number.POSITIVE_INFINITY;
          if (now - look.at < cadenceFor(toStart, rules)) {
            res.skipped.push(a.sport);
            continue;
          }
        }
        try {
          const out = await a.candidates({ now, runId, trigger: opts.trigger, force });
          all.push(...out.candidates);
          events.push(...out.events);
          res.notes.push(...out.notes);
          if (out.snapshot) res.snapshots.push({ id: out.snapshot.id, sport: a.sport, fetchedAt: new Date(out.snapshot.fetchedAt).toISOString(), events: out.snapshot.events });
          const ahead = out.events.map((e) => Date.parse(e.commence)).filter((t) => Number.isFinite(t) && t > now);
          await kv.set(K.look(a.sport), JSON.stringify({ at: now, nextCommence: ahead.length ? Math.min(...ahead) : null } satisfies Look));
        } catch (e) {
          res.errors.push(`${a.sport}: ${msg(e)}`);
        }
      }
      res.candidates = all.length;
      res.events = events.length;

      /* ---- 4. decide ---- */
      const eventList = dedupeEvents([...events, ...all.map((c) => ({ sport: c.sport, eventId: c.eventId, commence: c.commence }))]);
      const states = await loadEventStates(kv, eventList);
      const before = new Map([...states].map(([k, s]) => [k, JSON.stringify(s)]));
      const families = new Map<string, EventState["families"][string]>();
      const kellyOpen = new Map<string, number>();
      for (const [k, s] of states) {
        kellyOpen.set(k, s.kellyOpen);
        for (const [f, st] of Object.entries(s.families)) families.set(f, st);
      }
      const stored = await readStoredExclusions(kv);
      const now = clock();
      const d = decide({ candidates: all, now, runId, trigger: opts.trigger, families, excluded: excludedBy(stored), kellyBankroll: res.bank.kelly, kellyOpenByEvent: kellyOpen, rules });

      /* ---- line movement: a scheduled look that finds a moved family is an event trigger ---- */
      const nowRef = new Map<string, Partial<Record<AzBook, { dec: number; line: number | null }>>>();
      const bestC = new Map<string, Candidate>();
      for (const c of all) {
        const f = familyKeyOf(c);
        const held = bestC.get(f);
        /* the family's reference is its most-quoted line (both books), first seen wins a tie */
        if (!held || Object.keys(c.quotes).length > Object.keys(held.quotes).length) bestC.set(f, c);
      }
      for (const [f, c] of bestC) nowRef.set(f, refOf(c.quotes, c.line));
      const moved = new Set<string>();
      for (const [f, c] of bestC) {
        const st = states.get(`${c.sport}|${c.eventId}`);
        if (!st) continue;
        const ref = st.seen[f];
        if (!ref) st.seen[f] = nowRef.get(f)!;
        else if (movedSince(ref, nowRef.get(f)!, rules)) {
          moved.add(f);
          st.seen[f] = nowRef.get(f)!;
        }
      }
      const picks = d.picks.map((p) => (opts.trigger === "cron" && moved.has(p.family) ? { ...p, trigger: "event:line-move" as Trigger } : p));

      /* ---- 5. write ---- */
      const w = await writePicks(kv, picks, clock, states, rules);
      res.picks = w.written;
      res.adopted = w.adopted.map((p) => p.id);
      for (const p of w.written) {
        const st = states.get(`${p.sport}|${p.eventId}`);
        if (st && nowRef.has(p.family)) st.seen[p.family] = nowRef.get(p.family)!;
      }
      for (const r of [...d.rejects, ...w.rejects]) {
        res.rejects[r.reason] = (res.rejects[r.reason] ?? 0) + 1;
        if (res.rejectSample.length < 40 && r.reason !== "below_ev" && r.reason !== "not_best_in_family") res.rejectSample.push({ selection: r.selection, reason: r.reason, ...(r.detail ? { detail: r.detail } : {}) });
      }
      const lookAt = clock();
      const changed: EventState[] = [];
      for (const [k, s] of states) {
        const was = before.get(k);
        if (JSON.stringify(s) !== was) changed.push({ ...s, lastLook: lookAt });
      }
      await inChunks(changed, 8, (s) => saveEventState(kv, s));

      /* ---- 6. closing line at both books ---- */
      try {
        res.closes = await closePass(kv, [...open.filter((r) => !r.grade && !r.void), ...w.written.map((pick) => ({ pick, grade: null, close: null, void: null }))], all, res.snapshots, clock, rules);
      } catch (e) {
        res.errors.push(`close: ${msg(e)}`);
      }
    };

    if (deps.odds) {
      try {
        await deps.odds.run(runId, rules.creditBudgetPerRun, body);
      } finally {
        res.odds = deps.odds.spend();
      }
    } else await body();
  } catch (e) {
    res.errors.push(`run: ${msg(e)}`);
  } finally {
    const wanted = deps.adapters.filter((a) => !opts.sports || opts.sports.includes(a.sport)).length;
    const priced = wanted - res.skipped.length;
    const adapterErrors = res.errors.filter((e) => !/^(grade|close|run|store):/.test(e)).length;
    res.status = !res.errors.length ? "ok" : res.errors.some((e) => e.startsWith("run:")) || (priced > 0 && adapterErrors >= priced) ? "failed" : "partial";
    finish();
    try {
      await writeHeartbeat(kv, {
        runId, trigger: opts.trigger, startedAt: res.startedAt, finishedAt: res.finishedAt, ok: res.status === "ok", status: res.status as "ok" | "partial" | "failed",
        picks: res.picks.length, candidates: res.candidates, credits: res.odds?.credits ?? 0, remaining: res.odds?.remaining ?? null, ms: res.ms, errors: res.errors.slice(0, 5),
      });
      await logRun(kv, runId, { ...res, picks: res.picks.map((p) => p.id) });
    } catch (e) {
      res.errors.push(`heartbeat: ${msg(e)}`);
      res.status = "failed";
    }
    try {
      await releaseLease(kv, runId);
    } catch {
      /* the lease expires on its own */
    }
    if (res.status !== "ok") await raise(deps, res);
  }
  return res;
}

async function raise(deps: RunDeps, res: RunResult): Promise<void> {
  if (!deps.alert) return;
  try {
    await deps.alert(res);
  } catch {
    /* an alert that cannot be sent must not hide the failure it reports; the run record has it */
  }
}

function dedupeEvents(list: SportEvent[]): SportEvent[] {
  const seen = new Map<string, SportEvent>();
  for (const e of list) if (!seen.has(`${e.sport}|${e.eventId}`)) seen.set(`${e.sport}|${e.eventId}`, e);
  return [...seen.values()];
}

/** Settle every open pick whose event has started and whose final score is in. Updates the bank cache. */
async function gradePass(deps: RunDeps, rules: AnytimeRules, open: LedgerRow[], res: RunResult, clock: () => number): Promise<void> {
  const kv = deps.kv;
  const now = clock();
  const started = open.filter((r) => !r.grade && !r.void && Date.parse(r.pick.commence) <= now);
  if (!started.length) return;
  /* the event has started: whatever close is on file is the close */
  await inChunks(started.filter((r) => r.close && !r.close.final), 8, (r) => writeClose(kv, { ...r.close!, final: true }, r.close));
  if (!deps.scores) return;
  const read = await deps.scores(started.map((r) => r.pick), now);
  const scores = read instanceof Map ? read : read.scores;
  if (!(read instanceof Map)) for (const e of read.errors) res.errors.push(`grade: scores: ${e}`.slice(0, 300));
  let bank = res.bank;
  let touched = false;
  for (const r of started) {
    const g = gradeOf(r.pick, scores.get(r.pick.id), clock(), r.pick.gradeRef?.source ?? "unknown");
    if (!g) continue;
    const created = await writeGrade(kv, g);
    if (!created) continue;
    res.graded.push({ id: g.id, result: g.result });
    if (g.result !== "void") {
      const ret = returnOf(g.result, payDec(r.pick));
      bank = { kelly: r2(bank.kelly + r.pick.stakeKelly * ret), flat: Math.round((bank.flat + ret) * 1e4) / 1e4, graded: bank.graded + 1, asOf: g.gradedAt };
      touched = true;
    }
  }
  if (touched) {
    await saveBank(kv, bank);
    res.bank = bank;
  }
}

/**
 * Record both books' current quote as the closing line on every open pick whose event was priced
 * this run. The pick's own line is used when a book still quotes it; when a book has moved off
 * that line its current line is recorded WITH that line, so the report can tell a moved line from
 * a moved price. Written when the pick has no close yet, or the event starts inside the close
 * window and the quote changed.
 */
async function closePass(kv: Kv, open: LedgerRow[], all: Candidate[], snapshots: RunResult["snapshots"], clock: () => number, rules: AnytimeRules): Promise<number> {
  if (!open.length || !all.length) return 0;
  const byFamily = new Map<string, Candidate[]>();
  for (const c of all) {
    const f = familyKeyOf(c);
    byFamily.set(f, [...(byFamily.get(f) ?? []), c]);
  }
  const now = clock();
  const writes: { c: CloseRecord; held: CloseRecord | null }[] = [];
  for (const r of open) {
    const p = r.pick;
    const start = Date.parse(p.commence);
    if (!(start > now)) continue;
    const fam = byFamily.get(p.family);
    if (!fam?.length) continue;
    if (r.close && !(start - now <= rules.closeWindowMs)) continue;
    const same = fam.find((c) => sameLine(c.line, p.line));
    const books: CloseRecord["books"] = {};
    for (const b of AZ_BOOKS) {
      const q = same?.quotes[b];
      if (q) {
        books[b] = { price: q.price, opp: q.opp ?? null, line: p.line };
        continue;
      }
      const moved = fam.find((c) => c.quotes[b]);
      if (moved) books[b] = { price: moved.quotes[b]!.price, opp: moved.quotes[b]!.opp ?? null, line: moved.line };
    }
    if (!Object.keys(books).length) continue;
    const fair = same ? azFair(same.quotes) : null;
    const snap = (same ?? fam[0]).snapshotId;
    const at = snapshots.find((s) => s.id === snap)?.fetchedAt ?? new Date((same ?? fam[0]).fetchedAt).toISOString();
    const c: CloseRecord = { id: p.id, at, snapshotId: snap, books, fairP: fair ? Math.round(fair.p * 1e4) / 1e4 : null, fairN: fair ? fair.n : 0, final: false };
    if (r.close && JSON.stringify(r.close.books) === JSON.stringify(books)) continue;
    writes.push({ c, held: r.close });
  }
  let n = 0;
  await inChunks(writes, 8, async (x) => {
    if (await writeClose(kv, x.c, x.held)) n++;
  });
  return n;
}
