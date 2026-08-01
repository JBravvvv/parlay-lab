#!/usr/bin/env node
/**
 * QUOTA READ + APPEND-ONLY BURN LOG (2026-07-31, owner's authorization).
 *
 *   node tools/quota.mjs              # read, append, print the series tail
 *   node tools/quota.mjs --series     # print the whole series without reading
 *   node tools/quota.mjs --no-append  # read and print, write nothing
 *
 * WHY IT EXISTS: every runway figure in docs/collection-period.md for three days rested
 * on a hand-run curl, and on 2026-07-30 one evening window was generalised to a day —
 * producing a burn figure wrong by ~4x and a runway wrong by ~7x. A dated append-only
 * log makes the SERIES the artifact instead of two point reads re-derived by hand, and
 * the error would have been visible the next morning as a rate that did not match.
 *
 * THE READ IS FREE: /v4/sports through the app's own proxy returns the quota headers and
 * is not counted by the Odds API (measured 2026-07-31: 1,038 before and after).
 *
 * The log is APPEND-ONLY by construction: this tool never rewrites an existing line.
 */
import fs from "node:fs";
import { num, numFromText } from "./strict.mjs";

const LOG = "data/quota-log.jsonl";
/**
 * `fresh=1` ADDED 2026-07-31 (owner's item 1). Without it this read goes through `/api/odds`'s
 * Next data cache (`next: { revalidate: 240 }`, route L43), and the route lifts the quota headers
 * off the `upstream` Response object (L51-54) — which on a cache HIT is reconstructed from the
 * cache entry, so the header carries the value captured WHEN THE ENTRY WAS WRITTEN. Two of the
 * seven "flat" reads on 2026-07-31 fell inside a 240 s window of their predecessor and were
 * therefore unable to show movement even if there had been any.
 *
 * IT STILL COSTS NOTHING: `/v4/sports` is not counted by the Odds API — measured, four
 * CONSECUTIVE FRESH reads (07-31 01:25 → 04:50 → 05:55 → 06:41, every gap far beyond 240 s) all
 * returning 1,038. `fresh=1` changes the cache, not the billing.
 *
 * THE PASSCODE COUPLING, stated because it is a live trap: once `APP_PASSCODE` is set in Vercel,
 * `/api/odds` 401s a `fresh=1` with no `x-pl-pass` and does NOT fall through to cache — this tool
 * would stop reading entirely. Same `os.environ`-style pattern as the python sweeps: sent only if
 * set, never hardcoded. (§3 step 4 is last for exactly this reason.)
 */
const URL_ = "https://parlay-lab-six.vercel.app/api/odds?u=" +
  encodeURIComponent("https://api.the-odds-api.com/v4/sports/") + "&fresh=1";

export function parseSeries(text) {
  return text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

/**
 * Deltas between consecutive reads, with the per-hour rate. Pure — no I/O.
 *
 * RESETS ARE NAMED, NOT SUBTRACTED (2026-07-31). The pool reset between 21:04Z and 22:4xZ on
 * 2026-07-31 — 553/19,447 became 19,958/42. Plain subtraction turns that into `spent = -19,405`
 * at some absurd negative rate, which would corrupt every downstream mean and, worse, would look
 * like a number. A reset is detected on EITHER witness (remaining rises, or used falls) and the
 * row is emitted as `reset: true` with `spent: null` — an interval whose burn is UNMEASURABLE,
 * because the counter it was measured against no longer exists.
 */
export function burnSeries(rows) {
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    const hours = (Date.parse(b.at) - Date.parse(a.at)) / 3_600_000;
    const reset = b.remaining > a.remaining || (b.used != null && a.used != null && b.used < a.used);
    const spent = reset ? null : a.remaining - b.remaining;
    out.push({
      from: a.at, to: b.at, hours: +hours.toFixed(2), spent,
      perHour: reset || !(hours > 0) ? null : +(spent / hours).toFixed(1),
      ...(reset ? { reset: true, note: `POOL RESET — ${a.remaining}/${a.used} -> ${b.remaining}/${b.used}. Burn across this interval is UNMEASURABLE.` } : {}),
    });
  }
  return out;
}

/**
 * THE PERIOD IDENTITY: `remaining + used` is the plan size, constant inside a billing period AND
 * across a reset (both sides of 2026-08-01 sum to 20,000). So it is NOT a reset detector — it is a
 * FABRICATION detector, and it catches exactly the failure mode the old header coercion could
 * produce: `Number(null)` twice gives `{remaining: 0, used: 0}`, which sums to 0 and fails here.
 *
 * Audited 2026-08-01 over all 21 rows then in the log: 21/21 satisfy it, so the series is CLEAN and
 * the defect was prospective. Asserted at WRITE time from now on — a row that fails is never
 * appended, because the log is append-only and a bad row could only ever be addended, not removed.
 */
export const PLAN_SIZE = 20_000;
export function violatesIdentity(row, planSize = PLAN_SIZE) {
  const s = num(row?.remaining), u = num(row?.used);
  if (s === null || u === null) return `remaining/used not both finite numbers: ${JSON.stringify(row)}`;
  if (s + u !== planSize) return `remaining + used = ${s + u}, expected ${planSize} — this row is fabricated or the plan size changed (which is itself a finding, not a rounding error)`;
  return null;
}

export async function readQuota(fetchImpl = fetch) {
  const pass = process.env.APP_PASSCODE;
  const r = await fetchImpl(URL_, pass ? { headers: { "x-pl-pass": pass } } : undefined);
  if (r.status === 401) {
    throw new Error("401 on a fresh=1 read — APP_PASSCODE is set in Vercel but not in this shell. Export it here, or the quota instrument is blind (route L36-40).");
  }
  /* THIS GUARD WAS UNREACHABLE FOR THE CASE IT NAMES (found 2026-08-01, owner's item 3).
     `headers.get()` returns **null** when a header is absent, `Number(null)` is **0**, and
     `Number.isFinite(0)` is **true** — so an absent quota header sailed past the check and was
     logged as `remaining: 0, used: 0`: a fabricated "pool exhausted" reading, appended to the
     append-only series, from a proxy that had simply stopped forwarding the pair. `numFromText`
     rejects null and "" instead of coercing them. */
  const remaining = numFromText(r.headers.get("x-requests-remaining"));
  const used = numFromText(r.headers.get("x-requests-used"));
  if (remaining === null || used === null) {
    throw new Error(
      `quota headers absent or unparseable — the proxy stopped passing them through (route L51-55). ` +
        `remaining=${JSON.stringify(r.headers.get("x-requests-remaining"))} used=${JSON.stringify(r.headers.get("x-requests-used"))}. ` +
        `NOTHING IS APPENDED: an absent header is not a quota of zero.`,
    );
  }
  const row = { at: new Date().toISOString(), remaining, used };
  const bad = violatesIdentity(row);
  if (bad) throw new Error(`quota identity violated — NOTHING IS APPENDED. ${bad}`);
  return row;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const existing = fs.existsSync(LOG) ? parseSeries(fs.readFileSync(LOG, "utf8")) : [];
  if (args.includes("--series")) {
    for (const d of burnSeries(existing)) console.log(`${d.from} -> ${d.to}  ${d.hours}h  spent ${d.spent}  ${d.perHour}/h`);
    process.exit(0);
  }
  const row = await readQuota();
  console.log(`READ ${row.at}  remaining ${row.remaining}  used ${row.used}`);
  if (!args.includes("--no-append")) {
    fs.appendFileSync(LOG, JSON.stringify(row) + "\n");
    const series = burnSeries([...existing, row]).slice(-5);
    for (const d of series) console.log(`  ${d.from.slice(5, 16)} -> ${d.to.slice(5, 16)}  ${d.hours}h  spent ${d.spent}  ${d.perHour}/h`);
  }
}
