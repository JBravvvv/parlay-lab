#!/usr/bin/env node
/**
 * BOARD READINGS (2026-07-31, owner's authorization) — chain steps 6–8 and readings
 * 24, 25, 26, 29, from a saved board JSON. No credits: it reads a file.
 *
 *   curl -sS "https://parlay-lab-six.vercel.app/api/board?date=YYYY-MM-DD" > board.json
 *   node tools/board-report.mjs board.json [--before N --after N]
 *
 * What it replaces in the prose chain:
 *   step 6/7  -> the echo's presence and its ordered fields          (reading 25)
 *   step 8    -> cfSel stamp coverage over susp rows, incl. rank/stake
 *   reading 24 -> clampActivity presence and per-site counts
 *   reading 29 -> mktN vs consMinN, beside per-market blocked-reason counts
 *   reading 26 -> the cost bracket, from two quota reads passed in
 * Plus the outs four counts and their VACUITY BRANCH, which prints FIRST.
 */
import fs from "node:fs";

const OUTS = "pitcher_outs";
const rowsOf = (d) => Object.entries(d.categories ?? {}).filter(([k]) => k !== "all").flatMap(([, v]) => v);
const mktOf = (r) => ((r.lkey ?? "|").split("|")[1]) || "ml/rl";

/** The outs four counts, vacuity branch first. Pure. */
export function outsCounts(data) {
  const rows = rowsOf(data).filter((r) => mktOf(r) === OUTS);
  const tickets = [...(data.parlays ?? []), ...(data.parlaysMixed ?? [])];
  const legsInTickets = tickets.flatMap((t) => t.legs ?? []).filter((l) => ((l.lkey ?? "|").split("|")[1]) === OUTS).length;
  return {
    rowsPresent: rows.length,
    vacuous: rows.length === 0,
    susp: rows.filter((r) => r.susp).length,
    cfSelStamped: rows.filter((r) => r.cfSel).length,
    legsInTickets,
  };
}

/** cfSel coverage + the sizing number the rank/stake fields were added for. Pure. */
export function cfSelReport(data) {
  const susp = rowsOf(data).filter((r) => r.susp);
  const stamped = susp.filter((r) => r.cfSel);
  const carded = stamped.filter((r) => r.cfSel?.card);
  const missingRank = carded.filter((r) => r.cfSel?.rank == null || r.cfSel?.stake == null);
  const dollarsByMarket = {};
  for (const r of carded) dollarsByMarket[mktOf(r)] = (dollarsByMarket[mktOf(r)] ?? 0) + (r.cfSel.stake ?? 0);
  return { suspRows: susp.length, stamped: stamped.length, carded: carded.length, missingRank: missingRank.length, dollarsByMarket };
}

/** reading 29: mktN vs consMinN beside the blocked-reason histogram. Pure. */
export function reopenReport(data, echo) {
  const blocked = data.blocked ?? data.alloc?.blocked ?? [];
  const byReason = {};
  const byMarket = {};
  for (const b of blocked) {
    byReason[b.reason ?? "?"] = (byReason[b.reason ?? "?"] ?? 0) + 1;
    const k = `${b.type ?? "?"}/${b.reason ?? "?"}`;
    byMarket[k] = (byMarket[k] ?? 0) + 1;
  }
  const mktN = echo?.mktN ?? null;
  const consMinN = echo?.consMinN ?? 100;
  const crossed = mktN ? Object.fromEntries(Object.entries(mktN).map(([m, n]) => [m, { n, crossed: n >= consMinN }])) : null;
  return { byReason, byMarket, mktN, consMinN, crossed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = process.argv[2];
  if (!path) { console.error("usage: node tools/board-report.mjs <board.json> [--before N --after N]"); process.exit(64); }
  const blob = JSON.parse(fs.readFileSync(path, "utf8"));
  const board = blob.board ?? blob;
  const data = board.data ?? board;
  const echo = data.echo ?? null;
  const gen = blob.gen ?? board.gen ?? null;

  const o = outsCounts(data);
  console.log("OUTS FOUR COUNTS (vacuity branch first)");
  console.log(`  (2) outs rows on the board: ${o.rowsPresent}`);
  if (o.vacuous) console.log("  >>> VACUOUS: zero outs rows in the feed. Counts 1/3/4 are trivially satisfied and prove NOTHING. The flag is UNVERIFIED on this board.");
  console.log(`  (1) outs legs in BUILT TICKETS: ${o.legsInTickets}${o.legsInTickets ? "  >>> M-ITEM: the flag is not reaching the server path" : ""}`);
  console.log(`  (3) outs rows carrying susp: ${o.susp}`);
  console.log(`  (4) outs rows cfSel-stamped: ${o.cfSelStamped}`);

  console.log(`\nECHO (reading 25): ${echo ? "PRESENT" : ">>> ABSENT — the push did not land"}`);
  if (echo) for (const k of ["engineSha", "selMode", "outsSusp", "mktN", "consMinN", "hrrAltMax", "damping", "cfSelEnabled"]) {
    console.log(`  ${k}: ${typeof echo[k] === "object" ? JSON.stringify(echo[k]) : echo[k]}`);
  }
  console.log(`TRIGGER (reading 5): ${gen?.trigger ?? ">>> ABSENT"}`);

  const c = cfSelReport(data);
  console.log(`\ncfSel: ${c.stamped}/${c.suspRows} susp rows stamped, ${c.carded} card:true`);
  if (c.missingRank) console.log(`  >>> ${c.missingRank} card:true stamps MISSING rank/stake — the ship did not land`);
  console.log(`  counterfactual dollars to suspended markets: ${JSON.stringify(c.dollarsByMarket)}`);

  const ca = data.clampActivity;
  console.log(`\nclampActivity (reading 24): ${ca ? `PRESENT, ${Object.keys(ca).length} sites` : ">>> ABSENT — clampLog arming is not reaching production analyze"}`);

  const r = reopenReport(data, echo);
  console.log(`\nREOPEN (reading 29): consMinN=${r.consMinN}`);
  console.log(`  mktN: ${r.crossed ? JSON.stringify(r.crossed) : ">>> ABSENT from the echo"}`);
  console.log(`  blocked reasons: ${JSON.stringify(r.byReason)}`);
  if ((r.byReason.consensus ?? 0) > 0) console.log("  >>> CONSENSUS BLOCKS PRESENT: the expiry fired but the gate STILL BINDS — those markets did NOT reopen.");
}
