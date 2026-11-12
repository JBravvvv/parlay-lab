#!/usr/bin/env node
/**
 * RUN PICKS NOW, FROM THE COMMAND LINE (any-time engine, 2026-11-12).
 *
 *   read -s PL_SYNC && export PL_SYNC        # you type the sync phrase once; nothing echoes
 *   node tools/run-picks.mjs                 # run the engine now
 *   node tools/run-picks.mjs --sports nfl    # one sport
 *   node tools/run-picks.mjs --force         # price every open event, ignoring the look cadence
 *   node tools/run-picks.mjs --report        # no run: the record so far (DraftKings / FanDuel / combined)
 *   node tools/run-picks.mjs --history       # no run: the older desks' tickets, tagged by book
 *   node tools/run-picks.mjs --health        # no run, no phrase: is the scheduler alive
 *
 * It calls the same route the app button and the scheduler call (POST /api/anytime/run) and is
 * recorded as trigger `cli`. Paper only: the route records a pick, it places nothing anywhere.
 *
 * THE SYNC PHRASE: read from the PL_SYNC environment variable, sent in the `x-pl-sync` header and
 * nowhere else. It is never an argument (arguments land in shell history), never in the URL, never
 * printed, never written to a file. Over plain http the script refuses unless the host is this
 * machine, so the phrase cannot cross a network in the clear.
 *
 * Exit codes: 0 ran (ok, partial or busy) · 1 the run failed · 2 refused before or by the server
 * (no phrase, bad phrase, bad argument, route not configured) · 3 could not reach the server.
 */
import { pathToFileURL } from "node:url";
import { num } from "./strict.mjs";

export const DEFAULT_BASE = "https://parlay-lab-six.vercel.app";
const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);
const SPORTS = /^[a-z0-9]{2,12}(,[a-z0-9]{2,12}){0,7}$/;
const EVENT = /^[a-z0-9][a-z0-9-]{0,29}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class UsageError extends Error {}

/** argv (after the script name) → what was asked. Throws UsageError on anything it does not know. */
export function parseArgs(argv) {
  const a = { mode: "run", base: null, sports: null, force: false, event: null, from: null, to: null, json: false, help: false };
  const take = (i, flag) => {
    const v = argv[i + 1];
    if (v == null || v.startsWith("--")) throw new UsageError(`${flag} needs a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    if (f === "--help" || f === "-h") a.help = true;
    else if (f === "--report") a.mode = "report";
    else if (f === "--history") a.mode = "history";
    else if (f === "--health") a.mode = "health";
    else if (f === "--force") a.force = true;
    else if (f === "--json") a.json = true;
    else if (f === "--base") a.base = take(i++, f);
    else if (f === "--sports") a.sports = take(i++, f);
    else if (f === "--event") a.event = take(i++, f);
    else if (f === "--from") a.from = take(i++, f);
    else if (f === "--to") a.to = take(i++, f);
    else throw new UsageError(`unknown argument ${f.startsWith("--") ? f : "(a bare word; the sync phrase is never an argument)"}`);
  }
  if (a.sports != null && !SPORTS.test(a.sports)) throw new UsageError("--sports must be a comma list such as nfl,cfb");
  if (a.event != null && !EVENT.test(a.event)) throw new UsageError("--event must be a short lower-case name, e.g. line-move");
  for (const k of ["from", "to"]) if (a[k] != null && !DAY.test(a[k])) throw new UsageError(`--${k} must be YYYY-MM-DD`);
  return a;
}

/** The base URL, checked: https anywhere, http only to this machine. */
export function baseOf(arg, env = {}) {
  const raw = arg ?? env.PL_BASE ?? DEFAULT_BASE;
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new UsageError("the base URL is not a URL");
  }
  if (u.username || u.password || u.search || u.hash) throw new UsageError("the base URL must be a bare origin (no user, query or fragment)");
  if (u.protocol === "https:") return u.origin;
  if (u.protocol === "http:" && LOCAL.has(u.hostname)) return u.origin;
  throw new UsageError("the base URL must be https (plain http is allowed only for localhost)");
}

/** The one request this invocation makes. The phrase goes in the x-pl-sync header and nowhere else. */
export function requestOf(a, base, phrase) {
  if (a.mode === "health") return { url: new URL("/api/anytime/health", base), init: { method: "GET", cache: "no-store" } };
  if (!phrase) throw new UsageError("PL_SYNC is not set. Run:  read -s PL_SYNC && export PL_SYNC   then type the sync phrase.");
  if (a.mode === "history") {
    const url = new URL("/api/anytime", base);
    url.searchParams.set("limit", "0");
    url.searchParams.set("history", a.json ? "all" : "1");
    return { url, init: { method: "GET", headers: { "x-pl-sync": phrase }, cache: "no-store" } };
  }
  if (a.mode === "report") {
    const url = new URL("/api/anytime", base);
    if (a.from) url.searchParams.set("from", a.from);
    if (a.to) url.searchParams.set("to", a.to);
    url.searchParams.set("limit", "25");
    return { url, init: { method: "GET", headers: { "x-pl-sync": phrase }, cache: "no-store" } };
  }
  const url = new URL("/api/anytime/run", base);
  if (a.sports) url.searchParams.set("sports", a.sports);
  if (a.force) url.searchParams.set("force", "1");
  if (a.event) url.searchParams.set("event", a.event);
  return { url, init: { method: "POST", headers: { "x-pl-sync": phrase, "x-pl-trigger": "cli" }, cache: "no-store" } };
}

const BOOK = { draftkings: "DraftKings", fanduel: "FanDuel", combined: "Combined" };
const am = (v) => { const n = num(v); return n === null ? "n/a" : n > 0 ? `+${n}` : `${n}`; };
const pct = (v, dp = 1) => { const n = num(v); return n === null ? "n/a" : `${n >= 0 ? "+" : ""}${(n * 100).toFixed(dp)}%`; };
const units = (v) => { const n = num(v); return n === null ? "n/a" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}u`; };
const list = (v) => (Array.isArray(v) ? v : []);

/** A run's answer as plain lines. Absent stays "n/a": absent is not zero. */
export function runLines(body) {
  const b = body && typeof body === "object" ? body : {};
  const out = [];
  const picks = list(b.picks), graded = list(b.graded), errors = list(b.errors);
  out.push(`Run ${b.runId ?? "n/a"}: ${b.status ?? "n/a"} (trigger ${b.trigger ?? "n/a"}, engine ${b.engine ?? "n/a"}, ${num(b.ms) === null ? "n/a" : `${(b.ms / 1000).toFixed(1)} s`})`);
  if (b.status === "busy") out.push("Another run holds the lease; nothing was recorded twice. Try again in a minute.");
  out.push(`Looked at ${num(b.events) ?? "n/a"} events, ${num(b.candidates) ?? "n/a"} priced selections. New picks: ${picks.length}. Graded: ${graded.length}. Closing lines stored: ${num(b.closes) ?? "n/a"}.`);
  for (const p of picks) {
    out.push(`  PICK  ${p.sport ?? ""}  ${p.event ?? ""}  ${p.selection ?? ""}  at ${BOOK[p.book] ?? p.book} ${am(p.price)} (other book ${am(p.otherPrice)})  model ${pct(p.modelP).replace("+", "")} vs no-vig ${pct(p.fairP).replace("+", "")}  EV ${pct(p.ev)}  stake 1u flat / ${num(p.stakeKelly) === null ? "n/a" : `${p.stakeKelly.toFixed(2)}u`} Kelly  ${p.basis ?? ""}${num(p.seq) !== null && p.seq > 1 ? `  re-entry #${p.seq}` : ""}`);
  }
  for (const g of graded) out.push(`  GRADED  ${g.id ?? ""}  ${g.result ?? ""}`);
  const rej = b.rejects && typeof b.rejects === "object" ? Object.entries(b.rejects) : [];
  if (rej.length) out.push(`Not taken: ${rej.map(([k, v]) => `${k} ${v}`).join(", ")}.`);
  if (list(b.skipped).length) out.push(`Not due a look yet (no credits spent): ${list(b.skipped).join(", ")}.`);
  const o = b.odds && typeof b.odds === "object" ? b.odds : null;
  out.push(o ? `Odds API: ${num(o.credits) ?? "n/a"} credits this run in ${num(o.calls) ?? "n/a"} calls (${num(o.cacheHits) ?? "n/a"} served from the run's own memory); ${num(o.remaining) ?? "n/a"} left this month.` : "Odds API: no call was made.");
  const bank = b.bank && typeof b.bank === "object" ? b.bank : null;
  if (bank) out.push(`Bankrolls on ${num(bank.graded) ?? "n/a"} graded picks: flat ${units(bank.flat)}, quarter-Kelly ${num(bank.kelly) === null ? "n/a" : `${bank.kelly.toFixed(2)}u`} (started at 100u).`);
  for (const n of list(b.notes)) out.push(`Note: ${n}`);
  for (const e of errors) out.push(`ERROR: ${e}`);
  if (b.error && !errors.length) out.push(`ERROR: ${b.error}`);
  return out;
}

/** The record as plain lines: profit and ROI side by side, split by book. */
export function reportLines(body) {
  const b = body && typeof body === "object" ? body : {};
  const out = [];
  const rep = b.report && typeof b.report === "object" ? b.report : {};
  out.push(`Any-time record (engine ${b.engine ?? "n/a"}): ${num(b.count) ?? "n/a"} picks stored.`);
  for (const k of ["draftkings", "fanduel", "combined"]) {
    const s = rep.byBook?.[k];
    if (!s) { out.push(`  ${BOOK[k].padEnd(10)} n/a`); continue; }
    const roi = s.flatRoi && typeof s.flatRoi === "object" ? s.flatRoi : null;
    const clv = s.clv && typeof s.clv === "object" ? s.clv : null;
    out.push(`  ${BOOK[k].padEnd(10)} ${num(s.graded) ?? "n/a"} graded of ${num(s.picks) ?? "n/a"}  ${num(s.won) ?? "n/a"}-${num(s.lost) ?? "n/a"}-${num(s.push) ?? "n/a"}  flat profit ${units(s.flatProfit)}  ROI ${roi ? `${pct(roi.mean)} (95% ${pct(roi.lo)} to ${pct(roi.hi)})` : "n/a"}  Kelly profit ${units(s.kellyProfit)}  ROI ${pct(s.kellyRoi)}  CLV ${clv ? `${pct(clv.mean, 2)} on ${num(clv.n) ?? "n/a"}` : "n/a"}`);
  }
  const h = b.health && typeof b.health === "object" ? b.health : null;
  if (h) out.push(`Scheduler heartbeat: ${h.state ?? "n/a"}${h.message ? ` (${h.message})` : ""}.`);
  if (b.error) out.push(`ERROR: ${b.error}`);
  return out;
}

const usd = (v) => { const n = num(v); return n === null ? "n/a" : `${n < 0 ? "-" : "+"}$${Math.abs(n).toFixed(2)}`; };

/** The older desks' tickets by book. Legacy = any book other than the two; none of it is in the record. */
export function historyLines(body) {
  const b = body && typeof body === "object" ? body : {};
  const h = b.history && typeof b.history === "object" ? b.history : null;
  if (!h) return [b.error ? `ERROR: ${b.error}` : "The server sent no history."];
  if (!h.ok || !h.summary) return [`ERROR: ${h.error ?? "history unreadable"}`];
  const s = h.summary;
  const out = [`Older tickets, tagged by book (kept as stored; none of this is in the any-time record): ${num(s.picks) ?? "n/a"} tickets.`];
  const line = (name, tag, l) => {
    const staked = num(l.staked);
    const money = (num(l.graded) ?? 0) > 0 && staked !== null && staked > 0;
    out.push(`  ${String(name).padEnd(18)} ${tag.padEnd(8)} ${num(l.picks) ?? "n/a"} tickets  ${num(l.won) ?? "n/a"}-${num(l.lost) ?? "n/a"}-${num(l.push) ?? "n/a"}  staked ${money ? `$${staked.toFixed(2)}` : "n/a"}  profit ${money ? usd(l.profit) : "n/a"}  ROI ${money ? pct(l.roi) : "n/a"}  ${l.from ?? "n/a"} to ${l.to ?? "n/a"}`);
  };
  for (const k of list(s.byBook)) line(h.names?.[k.book] ?? k.book, k.legacy ? "LEGACY" : "two-book", k);
  if (s.legacy) line("All legacy", "LEGACY", s.legacy);
  if (s.twoBook) line("All DK + FD", "two-book", s.twoBook);
  for (const src of list(s.sources)) if (src.state !== "read") out.push(`  ${src.desk}: ${src.state === "unreadable" ? "UNREADABLE (not counted as empty)" : "nothing stored"}`);
  return out;
}

export function healthLines(body) {
  const b = body && typeof body === "object" ? body : {};
  return [`Heartbeat: ${b.state ?? "n/a"}. Last run finished ${b.finishedAt ?? "n/a"} (${num(b.ageMinutes) === null ? "n/a" : `${b.ageMinutes} min ago`}), status ${b.lastStatus ?? "n/a"}. Counts as stale after ${num(b.staleAfterMinutes) ?? "n/a"} min.`];
}

const HELP = `Usage: node tools/run-picks.mjs [--sports nfl,cfb] [--force] [--event NAME] [--report [--from D --to D]] [--history] [--health] [--base URL] [--json]
The sync phrase comes from the PL_SYNC environment variable:  read -s PL_SYNC && export PL_SYNC`;

/** Never lets the phrase out: every line printed goes through this. */
const hide = (text, phrase) => (phrase && phrase.length >= 4 ? String(text).split(phrase).join("[redacted]") : String(text));

export async function main(argv, env = process.env, fetchImpl = fetch, print = (s) => console.log(s)) {
  const phrase = typeof env.PL_SYNC === "string" && env.PL_SYNC.trim() ? env.PL_SYNC.trim() : "";
  const say = (s) => print(hide(s, phrase));
  let a, req;
  try {
    a = parseArgs(argv);
    if (a.help) { say(HELP); return 0; }
    req = requestOf(a, baseOf(a.base, env), phrase);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    say(e.message);
    say(HELP);
    return 2;
  }
  let res, body = null;
  try {
    res = await fetchImpl(req.url, { ...req.init, signal: AbortSignal.timeout(150_000) });
    try { body = await res.json(); } catch { body = null; }
  } catch (e) {
    say(`Could not reach ${req.url.origin}: ${e?.message ?? e}`);
    return 3;
  }
  if (a.json) say(JSON.stringify(body, null, 2));
  else if (body == null) say(`HTTP ${res.status} with no JSON body.`);
  else for (const ln of a.mode === "run" ? runLines(body) : a.mode === "report" ? reportLines(body) : a.mode === "history" ? historyLines(body) : healthLines(body)) say(ln);
  if (a.mode === "health") return res.status === 200 ? 0 : 1;
  if (res.status === 401) { say("The server refused the sync phrase."); return 2; }
  if (res.status === 400 || res.status === 503) return 2;
  if (a.mode === "run") return body?.status === "failed" || res.status >= 500 ? 1 : 0;
  return res.status === 200 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => { console.error(`run-picks: ${e?.message ?? e}`); process.exitCode = 3; });
}
