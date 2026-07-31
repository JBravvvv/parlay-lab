#!/usr/bin/env node
/**
 * READING 15, WHOLE (2026-07-31, owner's authorization).
 *
 *   node tools/ledger-report.mjs ~/pl-ledger-2026-07-31.json
 *
 * TAKES A SAVED EXPORT AS INPUT — THE SYNC PHRASE NEVER ENTERS A SCRIPT. The owner runs
 * the curl themselves; this reads the file it produced.
 *
 * What it replaces in the prose chain: reading 15's four hand-analyses —
 *   (1) the realized-overstake query (M24): stake vs each ticket's OWN computed ceiling,
 *       recomputable without `selMode` because `prob` and `czDec` are present since
 *       2026-07-11 and kellyStakeMult=4 is frozen;
 *   (2) the $0-ceiling census — tickets the engine's own sizing said to stake nothing on;
 *   (3) the HRR 46.3/59.2 reproduction over 2026-07-17..07-22;
 *   (4) the per-field presence census by date (the schema changed mid-life: `overrode`
 *       07-19, `selMode` 07-24, the basis fields 07-19).
 */
import fs from "node:fs";

export const KELLY_STAKE_MULT = 4;
const HRR = "batter_hits_runs_rbis";

const amToDec = (a) => { const n = Number(a); if (!Number.isFinite(n) || n === 0) return null; return n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n); };
const amToProb = (a) => { const n = Number(a); if (!Number.isFinite(n) || n === 0) return null; return n > 0 ? 100 / (n + 100) : Math.abs(n) / (Math.abs(n) + 100); };

/** The engine's own shKellyFrac, verbatim in behaviour (legacy L3323-3330). Pure. */
export function kellyFrac(prob, czDec) {
  if (prob == null || czDec == null) return null;
  const p = Number(prob) / 100, d = Number(czDec);
  if (!(d > 1)) return null;
  const k = (p * d - 1) / (d - 1);          // shKelly
  return Math.max(0, Math.min(0.25 * k, 0.02));
}

/**
 * VALIDATE THE EXPORT BEFORE ANY NUMBER IS COMPUTED (2026-07-31, owner's item 1).
 *
 * This tool has NEVER seen a real export and is about to receive the ONLY copy of the bankroll
 * exit's population. Every check below is a shape assumption that previously DEGRADED SILENTLY
 * into a plausible number instead of failing. Returns `{entries, warnings}` or throws.
 *
 * The worst of them, and the reason this exists: **`e.bankroll ?? 0`**. A locked entry with no
 * `bankroll` field gives every ticket a ceiling of `4 * 0 * f = 0`, so `ratio = stake/0 =
 * Infinity` and **EVERY TICKET READS AS OVER ITS CEILING** — a 100% overstake rate, printed with
 * a dollar total, indistinguishable from a real finding. That is the single most consequential
 * misread available in this file and it needed one absent field.
 */
export function validateExport(blob) {
  const warnings = [];
  if (blob == null || typeof blob !== "object") throw new Error("not a JSON object");
  if (blob.error) throw new Error(`the route returned an error, not an export: ${JSON.stringify(blob)}`);
  /* A BARE ARRAY IS NOT WHAT /api/ledger RETURNS (route L73 always sends the four-key object).
     `blob.ledger ?? blob` accepted one silently — a shape the endpoint cannot produce, so
     accepting it means accepting a file of unknown provenance as the bankroll population. */
  if (Array.isArray(blob)) throw new Error("bare array — /api/ledger returns {ledger,bank,noplay,at} (route L73). This file did not come from that endpoint.");
  if (!Array.isArray(blob.ledger)) throw new Error(`no \`ledger\` array (got ${typeof blob.ledger}) — route L73 always sends one, even empty.`);
  const entries = blob.ledger;
  if (!entries.length) throw new Error("THE LEDGER IS EMPTY. A 200 over an empty store is not an error, and every sub-reading below would return a clean zero. The bankroll exit has NO POPULATION.");
  for (const [i, e] of entries.entries()) {
    if (typeof e?.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
      throw new Error(`entry ${i} has date ${JSON.stringify(e?.date)} — the HRR join filters by STRING comparison (07-17 <= date <= 07-22), so a non-ISO date silently excludes the whole window and prints 0W/0L.`);
    }
    for (const k of ["core", "funT"]) if (e[k] != null && !Array.isArray(e[k])) throw new Error(`entry ${e.date}: \`${k}\` is ${typeof e[k]}, not an array`);
    if (e.locked && (typeof e.bankroll !== "number" || !(e.bankroll > 0))) {
      throw new Error(`LOCKED entry ${e.date} has bankroll=${JSON.stringify(e.bankroll)}. Every ceiling would be 0 and EVERY TICKET would read as overstaked at ratio Infinity. Refusing to compute.`);
    }
  }
  const dates = entries.map((e) => e.date);
  const dupes = dates.filter((d, i) => dates.indexOf(d) !== i);
  if (dupes.length) warnings.push(`DUPLICATE DATES ${[...new Set(dupes)].join(", ")} — fieldCensus keys by date and later entries OVERWRITE earlier ones, so its census would describe only the last.`);
  /* AMERICAN vs DECIMAL. amToProb(2.5) returns 97.6% and looks like a plausible implied
     probability. A leg priced in decimal would silently move the 59.2 comparison. */
  const czs = entries.flatMap((e) => [...(e.core ?? []), ...(e.funT ?? [])].flatMap((t) => (t.legs ?? []).map((l) => l.cz))).filter((c) => c != null && Number.isFinite(Number(c)));
  const suspect = czs.filter((c) => Math.abs(Number(c)) < 100 && Number(c) !== 0);
  if (suspect.length) warnings.push(`${suspect.length} of ${czs.length} \`cz\` values have |cz| < 100 (e.g. ${suspect.slice(0, 3).join(", ")}) — American odds never do. If these are DECIMAL, every implied probability in reading (3) is wrong and plausible.`);
  return { entries, warnings };
}

/** (1)+(2): overstake ratios and the $0-ceiling census. Pure. */
export function overstake(entries) {
  const rows = [];
  for (const e of entries) {
    if (!e.locked) continue;
    for (const t of [...(e.core ?? []), ...(e.funT ?? [])]) {
      const f = kellyFrac(t.prob, t.czDec);
      if (f == null) { rows.push({ date: e.date, id: t.id, stake: t.stake, ceiling: null, ratio: null, market: mkt(t) }); continue; }
      const ceiling = Math.round(KELLY_STAKE_MULT * (e.bankroll ?? 0) * f);
      rows.push({ date: e.date, id: t.id, stake: t.stake, ceiling, ratio: ceiling > 0 ? +(t.stake / ceiling).toFixed(2) : Infinity, market: mkt(t), czEv: t.czEv, selMode: e.selMode ?? null });
    }
  }
  const over = rows.filter((r) => r.ratio != null && r.ratio > 1.001);
  return {
    tickets: rows.length,
    over: over.length,
    maxRatio: over.length ? Math.max(...over.map((r) => (r.ratio === Infinity ? 1e9 : r.ratio))) : 0,
    dollarsOver: over.reduce((s, r) => s + Math.max(0, r.stake - (r.ceiling ?? 0)), 0),
    zeroCeiling: rows.filter((r) => r.ceiling === 0),
    negativeCzEv: rows.filter((r) => Number(r.czEv) < 0).length,
    byMarket: rows.reduce((m, r) => ((m[r.market] = (m[r.market] ?? 0) + 1), m), {}),
    rows,
  };
}

const mkt = (t) => { const l = (t.legs ?? [])[0]; return ((l?.lkey ?? "|").split("|")[1]) || "ml/rl"; };

/** (3): the HRR reproduction. Pure. */
export function hrrJoin(entries, from = "2026-07-17", to = "2026-07-22") {
  let won = 0, lost = 0; const imps = []; const rungs = {};
  for (const e of entries) {
    if (!e.locked || e.date < from || e.date > to) continue;
    const g = e.grading?.legs ?? {};
    for (const t of [...(e.core ?? []), ...(e.funT ?? [])]) {
      for (const l of t.legs ?? []) {
        const parts = (l.lkey ?? "|").split("|");
        if (parts[1] !== HRR) continue;
        const r = g[`${l.label}|${l.prop}`];
        if (!r || (r.result !== "won" && r.result !== "lost")) continue;
        r.result === "won" ? won++ : lost++;
        const ip = amToProb(l.cz); if (ip != null) imps.push(ip);
        const rung = parts[2] ?? "?"; rungs[rung] = rungs[rung] ?? { won: 0, lost: 0 };
        r.result === "won" ? rungs[rung].won++ : rungs[rung].lost++;
      }
    }
  }
  const hit = won + lost ? (100 * won) / (won + lost) : null;
  const implied = imps.length ? (100 * imps.reduce((a, b) => a + b, 0)) / imps.length : null;
  return { won, lost, hit, implied, rungs, n: imps.length };
}

/** (4): per-field presence by date. Pure. */
export function fieldCensus(entries) {
  const fields = ["selMode", "overrode", "bankroll", "clv", "grading"];
  const out = {};
  for (const e of entries) {
    out[e.date] = Object.fromEntries(fields.map((f) => [f, e[f] !== undefined]));
    out[e.date].gradingV = e.grading?.v ?? null;
    out[e.date].basisFields = [...(e.core ?? [])].some((t) => t.bsOdds !== undefined);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = process.argv[2];
  if (!path) { console.error("usage: node tools/ledger-report.mjs <saved-export.json>"); process.exit(64); }
  const blob = JSON.parse(fs.readFileSync(path, "utf8"));
  let entries, warnings;
  try {
    ({ entries, warnings } = validateExport(blob));
  } catch (e) {
    console.error(`\nSTOP — ${e.message}\n`);
    console.error("Nothing below is computed. This is the only copy of the bankroll exit's population;");
    console.error("a plausible number from a shape we did not expect is worse than no number.\n");
    process.exit(65);
  }
  /* ▶ THE GATE (reading 15, owner's item 3): the COUNT prints first and DENOMINATES the mode
     split and the overstake query. Both are written against "the 38" — the owner's recollection
     with no on-disk record. Read N before either. */
  console.log(`ledger: ${entries.length} entries, ${entries.filter((e) => e.locked).length} locked`);
  console.log(`>>> GATE: N = ${entries.length}. The mode split and the overstake query are DENOMINATED IN THIS NUMBER.`);
  if (entries.length !== 38) console.log(`>>> N != 38. The owner's "38" is unverified and has no on-disk record; every "38" in the sub-readings is CORRECTED TO ${entries.length}, dated. This is a correction, not a discrepancy to reconcile.`);
  for (const w of warnings) console.log(`!!! WARNING: ${w}`);
  console.log();
  const o = overstake(entries);
  const excluded = o.rows.filter((r) => r.ratio == null).length;
  if (excluded) console.log(`(0) ${excluded} of ${o.tickets} tickets have NO computable ceiling (prob or czDec missing/invalid) — EXCLUDED from (1), not counted as compliant.`);
  console.log(`(1) OVERSTAKE — ${o.tickets} placed tickets`);
  console.log(`    above their own ceiling: ${o.over}   max ratio: ${o.maxRatio}x   dollars above ceiling: $${o.dollarsOver}`);
  console.log(`    per-market: ${JSON.stringify(o.byMarket)}`);
  console.log(`(2) $0-CEILING tickets: ${o.zeroCeiling.length}  staked on them: $${o.zeroCeiling.reduce((s, r) => s + r.stake, 0)}`);
  console.log(`    negative czEv at placement: ${o.negativeCzEv}`);
  if (o.over) {
    const inDisciplined = o.over && o.rows.filter((r) => r.ratio > 1.001 && r.selMode === "ev_gated");
    console.log(`\n>>> REALIZED OVERSTAKE IN THE LEDGER. ${o.over} tickets, $${o.dollarsOver} above ceiling.`);
    if (inDisciplined.length) console.log(`>>> AND ${inDisciplined.length} carry selMode "ev_gated" — the ceiling failed INSIDE the disciplined branch. STOP.`);
  } else console.log("\n>>> No ticket exceeded its own ceiling: M24 is PROSPECTIVE ONLY on this population.");
  const h = hrrJoin(entries);
  console.log(`\n(3) HRR 07-17..07-22: ${h.won}W/${h.lost}L  hit ${h.hit?.toFixed(1)}%  implied ${h.implied?.toFixed(1)}%  (expect 46.3 / 59.2)`);
  console.log(`    by rung: ${JSON.stringify(h.rungs)}`);
  console.log("\n(4) FIELD CENSUS BY DATE:");
  for (const [d, f] of Object.entries(fieldCensus(entries)).sort()) console.log(`    ${d}: ${JSON.stringify(f)}`);
}
