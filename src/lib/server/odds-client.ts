import { AsyncLocalStorage } from "node:async_hooks";
import { onlyAzBookmakers } from "@/lib/az/books";
import { azOddsUrl, azOddsUrlWithRegionFallback, isOddsApiUrl } from "@/lib/az/odds-url";

/**
 * THE ONE DOOR TO THE ODDS API (2026-11-12).
 *
 * Every server-side Odds API request goes through `oddsFetch`, a drop-in for `fetch` that:
 *
 *   1. rewrites the URL to `bookmakers=draftkings,fanduel` (never a region) — src/lib/az/odds-url.ts;
 *   2. drops any bookmaker that is not one of the two from the answer (the second fence);
 *   3. reads the provider's own usage headers on every call — `x-requests-last` (what THIS call
 *      cost), `x-requests-remaining`, `x-requests-used` — and adds them to the current run's tally;
 *   4. inside a run (`withOddsRun`), never fetches the same URL twice: a second ask for the same
 *      market is answered from the run's own memory and costs nothing;
 *   5. stops spending when the run's credit budget is used up (`OddsBudgetError`);
 *   6. never lets the API key into a log, an error or a tally (`redactOddsUrl`).
 *
 * The provider's guide does not say whether `regions` may be left out when `bookmakers` is given.
 * If the provider refuses the bookmakers-only form, the client retries once with `regions=us`
 * beside the two named books (bookmakers still takes priority, same price) and remembers.
 */

export type OddsRun = {
  id: string;
  startedAt: number;
  /** Requests that reached the provider. */
  calls: number;
  /** Requests answered from this run's own memory. */
  cacheHits: number;
  /** Sum of `x-requests-last` over the calls that reached the provider. */
  credits: number;
  /** Calls that reached the provider but carried no `x-requests-last`. */
  unmetered: number;
  /** Calls answered by a framework cache older than this run (replayed headers are not counted). */
  staleCacheReplays: number;
  /** Latest `x-requests-remaining` / `x-requests-used` seen. */
  remaining: number | null;
  used: number | null;
  /** Credit ceiling for the run; null = none. */
  budget: number | null;
  /** Requests refused because the budget was spent. */
  refused: number;
  /** Non-2xx answers from the provider. */
  errors: number;
  /** Whether the `regions=us&bookmakers=` fallback form had to be used. */
  regionFallback: boolean;
  /** Redacted URLs asked this run, in order (key removed). */
  urls: string[];
  memo: Map<string, Promise<Memo>>;
};

type Memo = { status: number; statusText: string; headers: [string, string][]; body: string };

export class OddsBudgetError extends Error {
  constructor(public readonly spent: number, public readonly budget: number) {
    super(`ODDS BUDGET SPENT: ${spent} of ${budget} credits this run`);
    this.name = "OddsBudgetError";
  }
}

const runs = new AsyncLocalStorage<OddsRun>();
/** Process-wide: flips on the first time the provider refuses the bookmakers-only form. */
let needRegionParam = false;

export function redactOddsUrl(url: string): string {
  return url.replace(/([?&]apiKey=)[^&#]*/gi, "$1REDACTED");
}

export function newOddsRun(id: string, budget: number | null = null, now: number = Date.now()): OddsRun {
  return {
    id, startedAt: now, calls: 0, cacheHits: 0, credits: 0, unmetered: 0, staleCacheReplays: 0,
    remaining: null, used: null, budget, refused: 0, errors: 0, regionFallback: false, urls: [], memo: new Map(),
  };
}

/** Run `fn` with one Odds API tally, memory and budget shared by everything it calls. */
export function withOddsRun<T>(run: OddsRun, fn: () => Promise<T>): Promise<T> {
  return runs.run(run, fn);
}

export function currentOddsRun(): OddsRun | null {
  return runs.getStore() ?? null;
}

/** The storable summary of a run's spend (no URLs with keys, no bodies). */
export function oddsRunSummary(run: OddsRun) {
  return {
    id: run.id, calls: run.calls, cacheHits: run.cacheHits, credits: run.credits, unmetered: run.unmetered,
    staleCacheReplays: run.staleCacheReplays, remaining: run.remaining, used: run.used, budget: run.budget,
    refused: run.refused, errors: run.errors, regionFallback: run.regionFallback, urls: run.urls.length,
  };
}
export type OddsRunSummary = ReturnType<typeof oddsRunSummary>;

const num = (v: string | null): number | null => {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export type OddsUsage = { last: number | null; remaining: number | null; used: number | null };

export function oddsUsageOf(headers: Headers): OddsUsage {
  return { last: num(headers.get("x-requests-last")), remaining: num(headers.get("x-requests-remaining")), used: num(headers.get("x-requests-used")) };
}

/** A response replayed by a framework cache carries the ORIGINAL call's headers. Its `date` is old;
    a call that really reached the provider is stamped within seconds of now. */
function reachedProvider(headers: Headers, now: number): boolean {
  const d = headers.get("date");
  if (!d) return true;
  const t = Date.parse(d);
  return !Number.isFinite(t) || Math.abs(now - t) < 15_000;
}

function tally(run: OddsRun | null, headers: Headers, ok: boolean, now: number) {
  if (!run) return;
  if (!reachedProvider(headers, now)) {
    run.staleCacheReplays++;
    return;
  }
  const u = oddsUsageOf(headers);
  run.calls++;
  if (!ok) run.errors++;
  if (u.last != null) run.credits += u.last;
  else if (ok) run.unmetered++;
  if (u.remaining != null) run.remaining = u.remaining;
  if (u.used != null) run.used = u.used;
}

async function pull(target: string, init: RequestInit | undefined, run: OddsRun | null): Promise<Memo> {
  const ask = async (u: string) => fetch(u, init);
  let url = needRegionParam ? azOddsUrlWithRegionFallback(target) : target;
  let r = await ask(url);
  if (!r.ok && !needRegionParam && (r.status === 422 || r.status === 400)) {
    const text = await r.clone().text().catch(() => "");
    const fallback = azOddsUrlWithRegionFallback(target);
    if (/region/i.test(text) && fallback !== target) {
      tally(run, r.headers, false, Date.now());
      needRegionParam = true;
      url = fallback;
      r = await ask(url);
    }
  }
  if (run && needRegionParam) run.regionFallback = true;
  tally(run, r.headers, r.ok, Date.now());
  let body = await r.text();
  if (r.ok) {
    /* the second fence: only the two books survive, whatever the provider sent */
    try {
      body = JSON.stringify(onlyAzBookmakers(JSON.parse(body)));
    } catch {
      /* not JSON: hand it back as it came; the caller's own parse will fail loudly */
    }
  }
  const headers: [string, string][] = [];
  r.headers.forEach((v, k) => {
    /* the body was re-serialised: its old length and encoding no longer describe it */
    if (k === "content-length" || k === "content-encoding" || k === "transfer-encoding") return;
    headers.push([k, v]);
  });
  return { status: r.status, statusText: r.statusText, headers, body };
}

const respond = (m: Memo): Response => new Response(m.status === 204 || m.status === 304 ? null : m.body, { status: m.status, statusText: m.statusText, headers: m.headers });

/**
 * Drop-in for `fetch` on an Odds API URL. A URL on any other host is passed straight to `fetch`.
 * `init` is forwarded untouched (`cache: "no-store"`, `next: { revalidate }`, ...).
 */
export async function oddsFetch(url: string, init?: RequestInit): Promise<Response> {
  if (!isOddsApiUrl(url)) return fetch(url, init);
  const target = azOddsUrl(url);
  const run = currentOddsRun();
  if (!run) return respond(await pull(target, init, null));
  const key = redactOddsUrl(target);
  const held = run.memo.get(key);
  if (held) {
    run.cacheHits++;
    return respond(await held);
  }
  if (run.budget != null && run.credits >= run.budget) {
    run.refused++;
    throw new OddsBudgetError(run.credits, run.budget);
  }
  run.urls.push(key);
  const p = pull(target, init, run);
  run.memo.set(key, p);
  try {
    const m = await p;
    /* only a good answer is remembered: a failed pull may be asked again */
    if (m.status < 200 || m.status >= 300) run.memo.delete(key);
    return respond(m);
  } catch (e) {
    run.memo.delete(key);
    throw e;
  }
}

/** Test hook: forget that the provider once needed the `regions` fallback. */
export function __resetOddsClientForTests() {
  needRegionParam = false;
}
