import { AZ_BOOKS } from "@/lib/az/books";
import { AZ_DEFAULT_EXCLUSIONS, excludes, validMarketType } from "@/lib/az/exclusions";
import { summarizeHistory, tagHistory } from "@/lib/az/history";
import type { Kv } from "@/lib/anytime/kv";
import {
  addExclusion,
  healthOf,
  readHeartbeat,
  readLedger,
  readPick,
  readStoredExclusions,
  recentRuns,
  removeExclusion,
  saveBank,
  writeVoid,
} from "@/lib/anytime/ledger";
import { bankOf, reportOf } from "@/lib/anytime/report";
import { ANYTIME_RULES, type AnytimeRules } from "@/lib/anytime/rules";
import { runPicks, type RunDeps, type RunOpts, type RunResult } from "@/lib/anytime/run";
import type { Trigger } from "@/lib/anytime/types";
import { CFB_LEAGUE } from "@/lib/cfb/rules";
import { NFL_LEAGUE } from "@/lib/nfl/rules";
import { bookName } from "@/lib/sportsbook/books";
import { footballAdapter, footballScores, liveFootballFeeds, oddsMeter, oncePerRun, pickAlert, runAlert } from "@/lib/server/anytime-football";
import { liveNcaabFeeds, ncaabAdapter, ncaabOncePerRun, ncaabScores, scoreProviders } from "@/lib/server/anytime-ncaab";
import type { HistoryReader } from "@/lib/server/anytime-history";
import { upstashKv } from "@/lib/server/anytime-kv";
import { sendToAll } from "@/lib/server/push";
import { cronHeaderAuthed, storeEnv, syncAuthed } from "@/lib/server/store";

/**
 * THE ANY-TIME ENGINE'S SERVER EDGE (2026-11-12).
 *
 * Every trigger, the UI button, the command line, the scheduler, an event hook, ends in the same
 * call: `runPicks(anytimeDeps(), { trigger })`. This file holds what sits between an HTTP request
 * and that call, written as plain functions over plain values so each rule is tested without Next:
 *
 *   who may ask        accessOf + the gates in each handler. Fails CLOSED: no store or no secret
 *                      configured is a 503, never an open door.
 *   what they asked    triggerOf: the caller's secret decides the trigger, never a free-text field.
 *   what goes back     always JSON, never a rethrow, and never a secret (scrub).
 *
 * The routes in app/api/anytime/ are thin wrappers over these.
 */

export type Reply = { status: number; body: Record<string, unknown> };

/** What the request proved, and what the deployment has configured. Names only, never values. */
export type Access = {
  store: boolean;
  /** LEDGER_SYNC_KEY is set. */
  syncSet: boolean;
  /** CRON_SECRET is set. */
  cronSet: boolean;
  /** The request carried the sync phrase (header x-pl-sync). */
  sync: boolean;
  /** The request carried the cron secret (header x-cron-key, or Authorization: Bearer). */
  cron: boolean;
};

export function accessOf(req: { headers: { get(k: string): string | null } }): Access {
  return {
    store: !!storeEnv(),
    syncSet: !!process.env.LEDGER_SYNC_KEY,
    cronSet: !!process.env.CRON_SECRET,
    sync: syncAuthed(req),
    cron: cronHeaderAuthed(req),
  };
}

/* ---------- nothing secret ever leaves ---------- */

const SECRET_ENVS = ["ODDS_API_KEY", "CRON_SECRET", "LEDGER_SYNC_KEY", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN", "VAPID_PRIVATE_KEY", "ANTHROPIC_API_KEY", "APP_PASSCODE"] as const;

/** Remove every configured secret value, and any `apiKey=` query value, from a reply. */
export function scrub<T>(value: T, env: Record<string, string | undefined> = process.env): T {
  let s = JSON.stringify(value);
  if (s === undefined) return value;
  for (const name of SECRET_ENVS) {
    const v = env[name];
    if (!v || v.length < 4) continue;
    /* the value as it appears inside a JSON string, and URL-encoded */
    for (const form of new Set([JSON.stringify(v).slice(1, -1), encodeURIComponent(v)])) s = s.split(form).join("[redacted]");
  }
  s = s.replace(/(api_?key=)[^&\s"\\]+/gi, "$1[redacted]");
  return JSON.parse(s) as T;
}

const reply = (status: number, body: Record<string, unknown>): Reply => ({ status, body: scrub(body) });
const text = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

/* ---------- the trigger ---------- */

export type RunAsk = {
  /** Header x-pl-trigger: how a sync-phrase caller names itself. */
  hint?: string | null;
  /** ?event=<name>: what woke the engine, when something did (line-move, lineup, injury). */
  event?: string | null;
  /** ?sports=nfl,cfb */
  sports?: string | null;
  /** ?force=1 | 0 */
  force?: string | null;
};

const MANUAL: readonly Trigger[] = ["manual-ui", "manual-api", "cli"];
const EVENT_NAME = /^[a-z0-9][a-z0-9-]{0,29}$/;
const SPORT_NAME = /^[a-z0-9]{2,12}$/;

/**
 * The trigger a caller is recorded under. The SECRET decides the family: the sync phrase is a
 * person (UI, API, command line), the cron secret is a machine. A caller cannot name itself into
 * the other family, so "by trigger source" in the report means what it says.
 */
export function triggerOf(access: Pick<Access, "sync" | "cron">, ask: RunAsk): { trigger: Trigger } | { error: string } {
  if (ask.event != null && ask.event !== "") {
    if (!EVENT_NAME.test(ask.event)) return { error: "event must be a short lower-case name, e.g. line-move" };
    return { trigger: `event:${ask.event}` };
  }
  if (access.sync) {
    const hint = (ask.hint ?? "").trim();
    if (!hint) return { trigger: "manual-api" };
    if (!(MANUAL as readonly string[]).includes(hint)) return { error: "x-pl-trigger must be manual-ui, manual-api or cli" };
    return { trigger: hint as Trigger };
  }
  return { trigger: "cron" };
}

function sportsOf(raw: string | null | undefined): { sports?: string[] } | { error: string } {
  if (raw == null || raw === "") return {};
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (!list.length || list.length > 8 || list.some((s) => !SPORT_NAME.test(s))) return { error: "sports must be a comma list such as nfl,cfb" };
  return { sports: [...new Set(list)] };
}

function forceOf(raw: string | null | undefined): { force?: boolean } | { error: string } {
  if (raw == null || raw === "") return {};
  if (raw === "1" || raw === "true") return { force: true };
  if (raw === "0" || raw === "false") return { force: false };
  return { error: "force must be 1 or 0" };
}

/* ---------- POST /api/anytime/run ---------- */

export type Runner = (opts: RunOpts) => Promise<RunResult>;

/**
 * Run the engine now. 503 when the deployment cannot run it safely (no store, or no secret at all
 * to check a caller against), 401 without a valid secret, 400 on a malformed ask. A run that
 * FAILED answers 500 so a scheduler's own failure notice fires; ok, partial and busy answer 200.
 * It never throws: a spending route that dies as an HTML 500 hides what it spent.
 */
export async function handleRun(access: Access, ask: RunAsk, run: Runner): Promise<Reply> {
  const missing = [...(!access.store ? ["store"] : []), ...(!access.syncSet && !access.cronSet ? ["secret"] : [])];
  if (missing.length) return reply(503, { ok: false, error: "anytime unavailable", missing });
  if (!access.sync && !access.cron) return reply(401, { ok: false, error: "sync phrase or cron key required" });

  const t = triggerOf(access, ask);
  if ("error" in t) return reply(400, { ok: false, error: t.error });
  const s = sportsOf(ask.sports);
  if ("error" in s) return reply(400, { ok: false, error: s.error });
  const f = forceOf(ask.force);
  if ("error" in f) return reply(400, { ok: false, error: f.error });

  try {
    const res = await run({ trigger: t.trigger, ...s, ...f });
    return reply(res.status === "failed" ? 500 : 200, { ok: res.status !== "failed", ...res });
  } catch (e) {
    return reply(500, { ok: false, status: "failed", trigger: t.trigger, error: `run: ${text(e)}` });
  }
}

/* ---------- GET /api/anytime (the report) ---------- */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export type ReportAsk = { from?: string | null; to?: string | null; limit?: string | null; history?: string | null };

/** Sync-phrase gate, the same two answers /api/ledger gives. */
function syncGate(access: Access): Reply | null {
  const missing = [...(!access.store ? ["store"] : []), ...(!access.syncSet ? ["key"] : [])];
  if (missing.length) return reply(503, { error: "sync-not-configured", missing });
  if (!access.sync) return reply(401, { error: "bad-sync-key" });
  return null;
}

type RunLine = Omit<RunResult, "picks"> & { picks: string[] };

/**
 * Everything the page shows, computed from the raw ledger in this one call: the three-way report
 * (DraftKings, FanDuel, combined), the two bankrolls, the newest rows, the heartbeat, the Arizona
 * exclusion list and the last runs. The page adds nothing up itself, so a number on screen is a
 * number in this reply.
 */
export async function handleReport(access: Access, ask: ReportAsk, kv: Kv, now: number, rules: AnytimeRules = ANYTIME_RULES, history?: HistoryReader): Promise<Reply> {
  const denied = syncGate(access);
  if (denied) return denied;
  const wantHistory = ask.history == null || ask.history === "" ? null : ask.history;
  if (wantHistory != null && wantHistory !== "1" && wantHistory !== "all") return reply(400, { error: "history must be 1 or all" });
  for (const d of [ask.from, ask.to]) if (d != null && d !== "" && !DAY.test(d)) return reply(400, { error: "from and to must be YYYY-MM-DD" });
  const n = ask.limit == null || ask.limit === "" ? 200 : Math.trunc(parseFloat(ask.limit));
  if (!(n >= 0 && n <= 2000)) return reply(400, { error: "limit must be 0 to 2000" });

  try {
    const [rows, hb, stored, runs] = await Promise.all([
      readLedger(kv, { from: ask.from || undefined, to: ask.to || undefined }),
      readHeartbeat(kv),
      readStoredExclusions(kv),
      recentRuns<RunLine>(kv, 12),
    ]);
    return reply(200, {
      ...(wantHistory ? { history: await historyOf(history, wantHistory === "all") } : {}),
      ok: true,
      engine: rules.version,
      books: AZ_BOOKS,
      count: rows.length,
      report: reportOf(rows, now, rules),
      /* newest first; the report above is over ALL rows in the range, not just these */
      rows: n ? rows.slice(-n).reverse() : [],
      health: healthOf(hb, now, rules),
      exclusions: { defaults: AZ_DEFAULT_EXCLUSIONS, stored },
      runs: runs.map((r) => ({
        runId: r.runId, trigger: r.trigger, status: r.status, startedAt: r.startedAt, ms: r.ms,
        picks: r.picks.length, candidates: r.candidates, events: r.events, graded: r.graded.length,
        credits: r.odds?.credits ?? 0, remaining: r.odds?.remaining ?? null,
        rejects: r.rejects, skipped: r.skipped, notes: r.notes, errors: r.errors,
      })),
      rules: {
        minEv: rules.minEv, freshnessMs: rules.freshnessMs, startMarginMs: rules.startMarginMs, reentry: rules.reentry,
        kelly: rules.kelly, creditBudgetPerRun: rules.creditBudgetPerRun, heartbeatStaleMs: rules.heartbeatStaleMs,
      },
    });
  } catch (e) {
    return reply(502, { error: `store unreachable: ${text(e)}` });
  }
}

/**
 * The older desks' tickets, each tagged with its book (`?history=1`; `?history=all` adds every
 * tagged ticket). Read-only, and kept OUT of `report` above: these numbers sit beside the two-book
 * record, never inside it. A failed read is reported here and does not sink the report.
 */
async function historyOf(read: HistoryReader | undefined, all: boolean): Promise<Record<string, unknown>> {
  if (!read) return { ok: false, error: "history reader not wired" };
  try {
    const sources = await read();
    const picks = tagHistory(sources);
    const summary = summarizeHistory(sources, picks);
    /* display names for whatever books the stored tickets carry; the keys stay as stored */
    const names = Object.fromEntries(summary.byBook.map((b) => [b.book, b.book === "mixed" ? "More than one book" : bookName(b.book)]));
    return { ok: true, counted: false, summary, names, ...(all ? { picks } : {}) };
  } catch (e) {
    return { ok: false, error: `history unreadable: ${text(e)}` };
  }
}

/* ---------- POST /api/anytime (Arizona availability) ---------- */

export type ActionBody = { action?: unknown; id?: unknown; exclude?: unknown; marketType?: unknown };

/**
 * "Not available in AZ", and its undo for the market.
 *
 *   { action: "not-in-az", id, exclude?: true }   the pick is marked void (it leaves every result;
 *       the pick itself is not changed and the mark is written once), and, unless exclude is
 *       false, its market type joins the stored exclusion list so the engine stops picking it.
 *   { action: "allow-market", marketType }        takes a market type back OFF the stored list.
 *       A built-in rule (college props) is not on the stored list and cannot be lifted from here.
 *
 * The bankroll cache is rebuilt from the raw rows after a void, so the next run sizes Kelly stakes
 * on a bankroll that no longer counts the voided pick.
 */
export async function handleAction(access: Access, body: ActionBody | null, kv: Kv, now: number, rules: AnytimeRules = ANYTIME_RULES): Promise<Reply> {
  const denied = syncGate(access);
  if (denied) return denied;
  if (!body || typeof body !== "object") return reply(400, { error: "JSON body required" });
  const at = new Date(now).toISOString();

  try {
    if (body.action === "not-in-az") {
      if (typeof body.id !== "string" || !/^[A-Za-z0-9:_.|-]{4,200}$/.test(body.id)) return reply(400, { error: "id required" });
      if (body.exclude != null && typeof body.exclude !== "boolean") return reply(400, { error: "exclude must be true or false" });
      const pick = await readPick(kv, body.id);
      if (!pick) return reply(404, { error: "no such pick" });
      const voided = await writeVoid(kv, { id: pick.id, reason: "not_available_az", at, by: "ui", marketType: pick.marketType });
      let excluded: string | null = null;
      if (body.exclude !== false && validMarketType(pick.marketType)) {
        await addExclusion(kv, { marketType: pick.marketType, reason: "Marked not available in AZ from the app", at, by: "ui" });
        excluded = pick.marketType;
      }
      const bank = bankOf(await readLedger(kv), rules);
      await saveBank(kv, { ...bank, asOf: at });
      return reply(200, { ok: true, id: pick.id, voided, alreadyVoid: !voided, excluded, bank, exclusions: { defaults: AZ_DEFAULT_EXCLUSIONS, stored: await readStoredExclusions(kv) } });
    }

    if (body.action === "allow-market") {
      if (!validMarketType(body.marketType)) return reply(400, { error: "marketType required, e.g. nfl:spread" });
      const marketType = body.marketType;
      const builtIn = AZ_DEFAULT_EXCLUSIONS.find((x) => excludes(x.marketType, marketType));
      if (builtIn) return reply(409, { error: `${builtIn.marketType} is a built-in Arizona rule and cannot be lifted here`, source: builtIn.source });
      const before = await readStoredExclusions(kv);
      const stored = await removeExclusion(kv, marketType);
      return reply(200, { ok: true, removed: before.length !== stored.length, exclusions: { defaults: AZ_DEFAULT_EXCLUSIONS, stored } });
    }

    return reply(400, { error: "action must be not-in-az or allow-market" });
  } catch (e) {
    return reply(502, { error: `store unreachable: ${text(e)}` });
  }
}

/* ---------- GET /api/anytime/health (public) ---------- */

/**
 * Is the engine alive? PUBLIC and read-only: the state and how long ago, nothing about picks,
 * prices, credits or errors. Anything other than "ok" answers 503, so a plain uptime monitor
 * pointed at this URL notices a dead scheduler within one missed run, with no secret to hold.
 */
export async function handleHealth(storeReady: boolean, kv: Kv, now: number, rules: AnytimeRules = ANYTIME_RULES): Promise<Reply> {
  const limit = Math.round(rules.heartbeatStaleMs / 60_000);
  if (!storeReady) return reply(503, { ok: false, state: "unconfigured", staleAfterMinutes: limit });
  try {
    const h = healthOf(await readHeartbeat(kv), now, rules);
    return reply(h.state === "ok" ? 200 : 503, {
      ok: h.state === "ok",
      state: h.state,
      ageMinutes: h.ageMs == null ? null : Math.round(h.ageMs / 60_000),
      finishedAt: h.last?.finishedAt ?? null,
      lastStatus: h.last?.status ?? null,
      staleAfterMinutes: limit,
    });
  } catch {
    return reply(503, { ok: false, state: "unreachable", staleAfterMinutes: limit });
  }
}

/* ---------- the live wiring ---------- */

/**
 * The engine's live dependencies: the Upstash ledger, NFL and CFB game lines from the two books,
 * ESPN finals, the Odds API meter and the push alert. Built fresh per request, so one run's
 * schedule cache is never another run's.
 */
export function anytimeDeps(): RunDeps {
  const feeds = oncePerRun(liveFootballFeeds());
  const hoops = ncaabOncePerRun(liveNcaabFeeds());
  return {
    kv: upstashKv(),
    adapters: [footballAdapter(NFL_LEAGUE, feeds), footballAdapter(CFB_LEAGUE, feeds), ncaabAdapter(hoops)],
    scores: scoreProviders(footballScores([NFL_LEAGUE, CFB_LEAGUE], feeds), ncaabScores(hoops)),
    odds: oddsMeter(),
    alert: runAlert((p) => sendToAll(p)),
    notify: pickAlert((p) => sendToAll(p)),
  };
}

/** The one call every trigger makes. */
export const runAnytime: Runner = (opts) => runPicks(anytimeDeps(), opts);
