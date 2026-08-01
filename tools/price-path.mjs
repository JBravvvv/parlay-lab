#!/usr/bin/env node
/**
 * PRICE PATH FROM THE PROPS ARCHIVE (2026-08-01, owner's item 2). ZERO ODDS CREDITS — it reads
 * files that were already paid for.
 *
 *   node tools/price-path.mjs <dir-of-day-files>
 *
 * THE QUESTION IT ANSWERS: if a card is locked with N minutes left before first pitch, how much
 * does the price still move afterwards? That is the only quantity in the auto-lock design that
 * can be FITTED rather than chosen (docs/auto-lock-memo.md §3.3), and the archive already holds
 * it: 18 day-files x 4-6 timestamped snapshots, the same `player|line` row appearing in each.
 *
 * WHAT IS MEASURED. For every row present in BOTH an earlier snapshot and that event's LAST
 * snapshot of the day, the absolute movement of `fair` — the cross-book proportional-devig
 * median P(over), `compact()` in tools/snapshot_props.py — in PERCENTAGE POINTS, bucketed by the
 * earlier snapshot's minutes-to-first-pitch.
 *
 * WHY `fair` AND NOT `bo`/`cz`: `fair` is already a probability, so it is comparable across
 * markets, across lines, and across rungs. American prices are not — a 10-cent move means
 * different things at -110 and at +400 — and `cz` is null on a large share of rows (the CZ-less
 * population measured at 110 legs across 64 of 110 pool tickets on 07-26).
 *
 * THE REFERENCE IS THAT EVENT'S LAST ARCHIVED SNAPSHOT, NOT THE TRUE CLOSE. The archive's close
 * capture is itself imperfect, so `--closelead` prints how far from first pitch those reference
 * snapshots actually sit. Movement measured against a reference 90 minutes out UNDERSTATES the
 * movement that a true close would show; the number is a LOWER BOUND and is labelled as one.
 */
import fs from "node:fs";
import path from "node:path";

/** minutes-to-first-pitch buckets, descending — the owner's grid. */
export const BUCKETS = [
  { label: ">180", lo: 180, hi: Infinity },
  { label: "120-180", lo: 120, hi: 180 },
  { label: "90-120", lo: 90, hi: 120 },
  { label: "60-90", lo: 60, hi: 90 },
  { label: "30-60", lo: 30, hi: 60 },
  { label: "10-30", lo: 10, hi: 30 },
  { label: "<10", lo: -Infinity, hi: 10 },
];

/** a value is a number or it is absent — never coerced (see the STRICT note below). */
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export const bucketOf = (min) => BUCKETS.find((b) => min >= b.lo && min < b.hi)?.label ?? null;

/** Pure. Every (row, earlier-snapshot) observation with its movement to that event's last snap. */
export function observations(days) {
  const obs = [];
  for (const { file, day } of days) {
    /* group snapshots by event id; an event's own last snapshot is its reference */
    const byEvent = new Map();
    for (const s of day.snapshots ?? []) {
      const t = Date.parse(s.t);
      if (!Number.isFinite(t)) continue;
      for (const e of s.events ?? []) {
        if (!byEvent.has(e.id)) byEvent.set(e.id, []);
        byEvent.get(e.id).push({ t, start: Date.parse(e.start), markets: e.markets ?? {} });
      }
    }
    for (const [eid, snaps] of byEvent) {
      if (snaps.length < 2) continue;
      snaps.sort((a, b) => a.t - b.t);
      const ref = snaps[snaps.length - 1];
      if (!Number.isFinite(ref.start)) continue;
      const refLead = (ref.start - ref.t) / 60_000;
      for (const s of snaps.slice(0, -1)) {
        const lead = (s.start - s.t) / 60_000;
        for (const [mkt, rows] of Object.entries(s.markets)) {
          const refRows = ref.markets[mkt];
          if (!refRows) continue;
          for (const [key, r] of Object.entries(rows)) {
            const rr = refRows[key];
            if (!rr) continue;
            /* STRICT. `Number(null)` is 0 and `Number.isFinite(0)` is true, so the first version
               of this line silently turned every fair-less row into a PERFECT ZERO MOVEMENT
               observation — 9,578 of them, all `batter_home_runs`, whose `fair` is null on this
               archive (only the two-sided cross-book rows get a devigged fair). It reported
               "batter_home_runs 0.00" across every bucket and dragged the pooled mean down by a
               third of the sample. Found 2026-08-01 by dumping a real row. The rule the rest of
               this repo already uses: a value is a number or it is absent — never coerced. */
            const a = num(r.fair), b = num(rr.fair);
            if (a == null || b == null) continue;
            obs.push({ file, eid, mkt, key, lead, refLead, movePP: Math.abs(b - a) * 100 });
          }
        }
      }
    }
  }
  return obs;
}

const stats = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((x, y) => x - y);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length);
  return { n: s.length, mean, sd, p50: q(0.5), p90: q(0.9), p99: q(0.99), max: s[s.length - 1] };
};
const f = (x, d = 2) => (x == null ? "—" : x.toFixed(d));

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) { console.error("usage: node tools/price-path.mjs <dir-of-day-files>"); process.exit(64); }
  const files = fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort();
  const days = files.map((x) => ({ file: x, day: JSON.parse(fs.readFileSync(path.join(dir, x), "utf8")) }));
  const obs = observations(days);
  if (!obs.length) { console.error("STOP — no paired observations. Every row needs the same key in two snapshots of one event."); process.exit(65); }

  const den = (o) => ({
    rows: new Set(o.map((x) => `${x.file}|${x.eid}|${x.mkt}|${x.key}`)).size,
    games: new Set(o.map((x) => `${x.file}|${x.eid}`)).size,
    days: new Set(o.map((x) => x.file)).size,
  });
  const D = den(obs);
  console.log(`PRICE PATH — |Δ fair| in percentage points, measured to each event's LAST archived snapshot`);
  console.log(`DENOMINATORS: ${obs.length} observations · ${D.rows} distinct rows · ${D.games} distinct games · ${D.days} fixture-days\n`);

  const refLeads = [...new Set(obs.map((o) => `${o.file}|${o.eid}`))].map((k) => obs.find((o) => `${o.file}|${o.eid}` === k).refLead);
  const rl = stats(refLeads);
  console.log(`REFERENCE-SNAPSHOT LEAD (minutes before first pitch): median ${f(rl.p50, 0)}  min ${f(Math.min(...refLeads), 0)}  max ${f(Math.max(...refLeads), 0)}`);
  console.log(`>>> Movement is measured TO THAT REFERENCE, not to a true close. Every figure below is a LOWER BOUND.\n`);

  console.log("BUCKET      n      rows   mean    sd     p50    p90    p99    max");
  for (const b of BUCKETS) {
    const o = obs.filter((x) => bucketOf(x.lead) === b.label);
    if (!o.length) { console.log(`${b.label.padEnd(11)} 0`); continue; }
    const s = stats(o.map((x) => x.movePP));
    console.log(`${b.label.padEnd(11)} ${String(s.n).padEnd(6)} ${String(den(o).rows).padEnd(6)} ${f(s.mean).padStart(6)} ${f(s.sd).padStart(6)} ${f(s.p50).padStart(6)} ${f(s.p90).padStart(6)} ${f(s.p99).padStart(6)} ${f(s.max).padStart(6)}`);
  }

  console.log("\nBY MARKET (mean |Δpp| per bucket; n in parens)");
  const mkts = [...new Set(obs.map((o) => o.mkt))].sort();
  console.log("market".padEnd(24) + BUCKETS.map((b) => b.label.padStart(12)).join(""));
  for (const m of mkts) {
    let line = m.padEnd(24);
    for (const b of BUCKETS) {
      const o = obs.filter((x) => x.mkt === m && bucketOf(x.lead) === b.label);
      line += (o.length ? `${f(stats(o.map((x) => x.movePP), 2).mean, 2)}(${o.length})` : "—").padStart(12);
    }
    console.log(line);
  }

  /* THE KNEE. A knee is a bucket where the mean drops by a large factor relative to the next one
     out. Reported as ratios rather than declared, so "no knee" is a readable outcome. */
  console.log("\nKNEE TEST — ratio of each bucket's mean to the NEXT-WIDER bucket's mean");
  const means = BUCKETS.map((b) => {
    const o = obs.filter((x) => bucketOf(x.lead) === b.label);
    return { label: b.label, n: o.length, mean: o.length ? stats(o.map((x) => x.movePP)).mean : null };
  });
  for (let i = 1; i < means.length; i++) {
    const a = means[i - 1], c = means[i];
    if (a.mean == null || c.mean == null || !a.mean) { console.log(`  ${a.label} -> ${c.label}: insufficient n`); continue; }
    console.log(`  ${a.label} -> ${c.label}: ${f(c.mean / a.mean)}x   (${f(a.mean)} -> ${f(c.mean)} pp, n ${a.n} -> ${c.n})`);
  }
}
