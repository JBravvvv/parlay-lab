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

const LOG = "data/quota-log.jsonl";
const URL_ = "https://parlay-lab-six.vercel.app/api/odds?u=" +
  encodeURIComponent("https://api.the-odds-api.com/v4/sports/");

export function parseSeries(text) {
  return text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

/** Deltas between consecutive reads, with the per-hour rate. Pure — no I/O. */
export function burnSeries(rows) {
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    const hours = (Date.parse(b.at) - Date.parse(a.at)) / 3_600_000;
    const spent = a.remaining - b.remaining;
    out.push({ from: a.at, to: b.at, hours: +hours.toFixed(2), spent, perHour: hours > 0 ? +(spent / hours).toFixed(1) : null });
  }
  return out;
}

export async function readQuota(fetchImpl = fetch) {
  const r = await fetchImpl(URL_);
  const remaining = Number(r.headers.get("x-requests-remaining"));
  const used = Number(r.headers.get("x-requests-used"));
  if (!Number.isFinite(remaining) || !Number.isFinite(used)) {
    throw new Error("quota headers absent — the proxy stopped passing them through (route L51-55)");
  }
  return { at: new Date().toISOString(), remaining, used };
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
