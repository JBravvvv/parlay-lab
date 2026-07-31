#!/usr/bin/env node
/**
 * BURN ATTRIBUTION (2026-07-31, owner's authorization) — the arithmetic that has been
 * reconstructed by hand every turn, versioned so the residual is a NAMED UNKNOWN rather
 * than a number I rebuild from memory.
 *
 *   node tools/burn-report.mjs --props <dir-or-file> [--ticks N] [--from ISO --to ISO]
 *   node tools/burn-report.mjs --pred  <pred.json>      # reading 15(c): src x selMode census
 *
 * Props cost is derived from the ARCHIVE ITSELF (event-fetches x CREDITS_PER_EVENT), not
 * from a cron schedule — the 2026-07-31 lesson: schedules say what was asked for, archives
 * say what was delivered.
 */
import fs from "node:fs";

export const CREDITS_PER_EVENT = 6;   // 6 markets x us region (tools/snapshot_props.py header)
export const CREDITS_PER_TICK = 6;    // 3 markets x 2 regions (tools/snapshot_odds.py header)

/** Event-fetches and credits from one day-file's snapshots. Pure. */
export function propsCost(day, from = null, to = null) {
  const snaps = (day.snapshots ?? []).filter((s) => {
    if (!from && !to) return true;
    const t = Date.parse(s.t);
    return (!from || t >= Date.parse(from)) && (!to || t <= Date.parse(to));
  });
  const events = snaps.reduce((n, s) => n + (s.events?.length ?? 0), 0);
  return { snapshots: snaps.length, events, credits: events * CREDITS_PER_EVENT };
}

/** reading 15(c): the client-row census that settles the fallthrough candidate. Pure. */
export function predCensus(blob) {
  const recs = blob.records ?? blob.rows ?? (Array.isArray(blob) ? blob : []);
  const bySrc = {};
  const byMode = {};
  for (const r of recs) {
    const src = r.src ?? "(none)";
    const mode = r.selMode ?? "(none)";
    bySrc[src] = (bySrc[src] ?? 0) + 1;
    byMode[`${src}/${mode}`] = (byMode[`${src}/${mode}`] ?? 0) + 1;
  }
  return { total: recs.length, bySrc, byMode, clientRows: bySrc.client ?? 0 };
}

/** The attribution, with the residual named rather than absorbed. Pure. */
export function attribute({ spent, props, ticks }) {
  const known = props + ticks;
  return { spent, props, ticks, known, residual: spent - known, residualPct: spent ? +(100 * (spent - known) / spent).toFixed(1) : 0 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const argOf = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const predPath = argOf("--pred");
  if (predPath) {
    const c = predCensus(JSON.parse(fs.readFileSync(predPath, "utf8")));
    console.log(`READING 15(c) — ${c.total} prediction records`);
    for (const [k, v] of Object.entries(c.byMode).sort()) console.log(`  src/selMode ${k}: ${v}`);
    console.log(c.clientRows > 0
      ? `\n>>> ${c.clientRows} CLIENT ROWS. The bestBoard fallthrough FIRED: that day was NOT dark for the prediction store, and the credits it spent are the unattributed burn.`
      : "\n>>> ZERO client rows. The fallthrough is CLEARED for this date; the residual needs another candidate.");
    process.exit(0);
  }
  const p = argOf("--props");
  if (!p) { console.error("usage: --props <dir|file> [--ticks N] [--from ISO --to ISO] | --pred <file>"); process.exit(64); }
  const files = fs.statSync(p).isDirectory()
    ? fs.readdirSync(p).filter((f) => f.endsWith(".json")).map((f) => `${p}/${f}`)
    : [p];
  let events = 0, snaps = 0;
  for (const f of files) {
    const c = propsCost(JSON.parse(fs.readFileSync(f, "utf8")), argOf("--from"), argOf("--to"));
    events += c.events; snaps += c.snapshots;
    console.log(`${f}: ${c.snapshots} snapshots, ${c.events} event-fetches, ~${c.credits} credits`);
  }
  const ticks = Number(argOf("--ticks") ?? 0);
  console.log(`\nTOTAL props ~${events * CREDITS_PER_EVENT} credits (${snaps} snapshots, ${events} event-fetches)`);
  if (ticks) console.log(`line-history ~${ticks * CREDITS_PER_TICK} credits (${ticks} delivered ticks)`);
  console.log("Residual: run with the quota delta from tools/quota.mjs --series to name the unknown.");
}
