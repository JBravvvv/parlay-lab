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

/**
 * reading 15(c): the client-row census that settles the fallthrough candidate. Pure.
 *
 * THE SHAPE IS A MAP, NOT AN ARRAY — found from disk 2026-07-31, ONE COMMAND BEFORE THE READ RAN.
 * `DayBlob.records` is `Record<string, PredRecord>` (src/lib/pred-serialize.ts L135) and
 * `/api/predictions` serves the blob unwrapped (route L39), so the first version's
 * `for (const r of recs)` threw `TypeError: recs is not iterable` on EVERY real export — while
 * its own test passed, because that test hand-built an ARRAY that production never produces.
 * Instrument defect #6's exact shape, in a tool, on the critical path. Both shapes accepted now,
 * and the map shape is the one the regression case pins (tests/chain-tools.test.ts).
 *
 * `gens` IS THE SECOND, STRONGER WITNESS and it is one-sided in a useful way: `/api/generate`
 * stamps one GenStamp per pass with its `trigger` (route L391), and the client PUT path passes
 * no gen at all (pred-serialize L291/L296) — so a date carrying `src:"client"` ROWS but NO
 * matching gens entry is the fallthrough, positively, not by inference.
 */
export function predCensus(blob) {
  const raw = blob?.records ?? blob?.rows ?? blob;
  const recs = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [];
  const bySrc = {};
  const byMode = {};
  for (const r of recs) {
    const src = r.src ?? "(none)";
    const mode = r.selMode ?? "(none)";
    bySrc[src] = (bySrc[src] ?? 0) + 1;
    byMode[`${src}/${mode}`] = (byMode[`${src}/${mode}`] ?? 0) + 1;
  }
  const gens = Array.isArray(blob?.gens) ? blob.gens : [];
  return {
    total: recs.length,
    bySrc,
    byMode,
    clientRows: bySrc.client ?? 0,
    gens: gens.map((g) => ({ at: g.at ?? null, trigger: g.trigger ?? "(none)", src: g.src ?? "(none)" })),
  };
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
    const blob = JSON.parse(fs.readFileSync(predPath, "utf8"));
    /* STOP FIRST, COUNT SECOND. An error body or a 401 is a JSON object too, and every field
       below would read as a legitimate zero if it were censused instead of caught here. */
    if (blob?.error) {
      console.error(`STOP — the endpoint returned an error, not a blob: ${JSON.stringify(blob)}`);
      console.error("Nothing is read from this file. bad-sync-key = the phrase; sync-not-configured = the env.");
      process.exit(65);
    }
    const c = predCensus(blob);
    console.log(`READING 15(c) — ${c.total} prediction records${blob?.date ? ` on ${blob.date}` : ""}`);
    if (!c.total) console.log("  (no records — an EMPTY blob and a dark date are the same bytes; see gens below)");
    for (const [k, v] of Object.entries(c.byMode).sort()) console.log(`  src/selMode ${k}: ${v}`);
    console.log(`\nGENERATIONS (server passes only — the client path stamps none): ${c.gens.length}`);
    for (const g of c.gens) console.log(`  ${g.at ? new Date(g.at).toISOString() : "(no at)"}  trigger=${g.trigger}  src=${g.src}`);
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
