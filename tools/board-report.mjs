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

/**
 * FAIL LOUDLY ON A SHAPE THIS TOOL CANNOT READ (2026-07-31, owner's item 1, after the first
 * run against a REAL artifact).
 *
 * THE DEFECT THIS EXISTS FOR, measured not imagined: `/api/board` returns **`{board: null,
 * reason: …, gens: […]}` with a 200** on FOUR paths — `store-not-configured` (L23),
 * `no-such-generation` (L47), `no-board-for-date` (L54), `store-unreachable` (L58). The old
 * `blob.board ?? blob` treats `null` as absent and falls through to the ERROR ENVELOPE itself;
 * `data.categories` is then undefined, `rowsOf` returns `[]`, and the tool printed a complete,
 * plausible, entirely fabricated reading of a board that does not exist — VACUOUS branch and
 * all. Verified by feeding it `{"board":null,"reason":"no-board-for-date","gens":[]}`.
 *
 * Returns the unwrapped `{board, data}` or throws with the reason.
 */
export function unwrapBoard(blob) {
  if (blob == null || typeof blob !== "object") throw new Error("not a JSON object");
  if (blob.error) throw new Error(`the route returned an error, not a board: ${JSON.stringify(blob)}`);
  /* `board` PRESENT AND NULL is the failure envelope — never fall through to the wrapper. */
  if ("board" in blob && blob.board == null) {
    throw new Error(`board is null — the route refused: reason="${blob.reason ?? "(none)"}". NO BOARD EXISTS FOR THIS DATE/GEN.`);
  }
  const board = blob.board ?? blob;
  const data = board.data ?? board;
  if (!data || typeof data !== "object" || !data.categories || typeof data.categories !== "object") {
    throw new Error("no `categories` on the board data — this is not a board. Zero rows here would read as VACUOUS, which is a different and much weaker claim.");
  }
  return { board, data };
}

/**
 * DEDUPED TICKET SET. `parlays` and `parlaysMixed` OVERLAP in production — measured on the
 * archived 2026-07-26 board: 110 + 86 = 196 emitted, **168 distinct leg-sets** (4 duplicates
 * inside `parlays`, 24 shared across the two arrays). That is M19's duplicate emission, and a
 * naive union inflates count (1), which is the M-item trigger. Both numbers are printed.
 */
export function dedupeTickets(data) {
  const all = [...(data.parlays ?? []), ...(data.parlaysMixed ?? [])];
  const byLegSet = new Map();
  for (const t of all) byLegSet.set(JSON.stringify((t.legs ?? []).map((l) => l.lkey).sort()), t);
  return { raw: all, distinct: [...byLegSet.values()], duplicates: all.length - byLegSet.size };
}

/** The outs four counts, vacuity branch first. Pure. */
export function outsCounts(data) {
  const rows = rowsOf(data).filter((r) => mktOf(r) === OUTS);
  const { raw, distinct, duplicates } = dedupeTickets(data);
  const outsLegs = (ts) => ts.flatMap((t) => t.legs ?? []).filter((l) => ((l.lkey ?? "|").split("|")[1]) === OUTS).length;
  return {
    rowsPresent: rows.length,
    vacuous: rows.length === 0,
    susp: rows.filter((r) => r.susp).length,
    cfSelStamped: rows.filter((r) => r.cfSel).length,
    /** over DISTINCT leg-sets — the honest count */
    legsInTickets: outsLegs(distinct),
    /** over the raw union, kept so the inflation is visible rather than silently corrected */
    legsInTicketsRaw: outsLegs(raw),
    ticketsRaw: raw.length,
    ticketsDistinct: distinct.length,
    duplicateTickets: duplicates,
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
  /* 2026-08-01: was `echo?.consMinN ?? 100`. The VALUE agreed with the engine, but the
     fallback fired on an ABSENT ECHO — which is reading 3's stop condition, not a missing
     config key. The tool would have printed a `crossed` verdict computed from a copied
     literal on exactly the boards where the push did not land. Absent is not 100.
     Pinned by tests/mirrored-constants.test.ts. */
  const consMinN = typeof echo?.consMinN === "number" && Number.isFinite(echo.consMinN) ? echo.consMinN : null;
  const crossed =
    mktN && consMinN !== null
      ? Object.fromEntries(Object.entries(mktN).map(([m, n]) => [m, { n, crossed: n >= consMinN }]))
      : null;
  return { byReason, byMarket, mktN, consMinN, crossed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = process.argv[2];
  if (!path) { console.error("usage: node tools/board-report.mjs <board.json> [--before N --after N]"); process.exit(64); }
  const blob = JSON.parse(fs.readFileSync(path, "utf8"));
  let board, data;
  try {
    ({ board, data } = unwrapBoard(blob));
  } catch (e) {
    console.error(`\nSTOP — ${e.message}\n`);
    console.error("Nothing below is computed. A zero count on a non-board is not a reading, and the");
    console.error("VACUOUS branch would have printed as though the board existed. Report this body verbatim.\n");
    process.exit(65);
  }
  const echo = data.echo ?? null;

  const o = outsCounts(data);
  console.log("OUTS FOUR COUNTS (vacuity branch first)");
  console.log(`  (2) outs rows on the board: ${o.rowsPresent}`);
  if (o.vacuous) console.log("  >>> VACUOUS: zero outs rows in the feed. Counts 1/3/4 are trivially satisfied and prove NOTHING. The flag is UNVERIFIED on this board.");
  console.log(`  (1) outs legs in BUILT TICKETS: ${o.legsInTickets} over ${o.ticketsDistinct} DISTINCT leg-sets` +
    (o.duplicateTickets ? `  (raw union: ${o.legsInTicketsRaw} over ${o.ticketsRaw} emitted — ${o.duplicateTickets} DUPLICATE tickets, M19)` : ""));
  /* THE M-ITEM IS GATED ON THE FLAG BEING SHIPPED (2026-07-31). Run against the archived
     2026-07-26 board — which PREDATES outsSusp entirely — the ungated version printed
     ">>> M-ITEM: the flag is not reaching the server path" for 76 legs. That is a false alarm
     on every pre-flag board, and it is the loudest line the tool emits. */
  if (o.legsInTickets) {
    if (echo?.outsSusp === true) console.log("      >>> M-ITEM: outsSusp is TRUE on this board and outs legs still reached built tickets — the flag is not reaching the server path");
    else if (echo == null) console.log("      (no echo on this board — cannot tell a flag failure from a board that predates the flag. NOT an M-item.)");
    else console.log(`      (echo.outsSusp = ${echo.outsSusp} — the flag was not armed for this board, so these legs are expected. NOT an M-item.)`);
  }
  console.log(`  (3) outs rows carrying susp: ${o.susp}`);
  console.log(`  (4) outs rows cfSel-stamped: ${o.cfSelStamped}`);

  console.log(`\nECHO (reading 25): ${echo ? "PRESENT" : ">>> ABSENT — on a board generated AFTER the echo shipped this means the push did not land; on an older board it means the feature did not exist. Check the board's date before reading it as a failure."}`);
  if (echo) for (const k of ["engineSha", "selMode", "outsSusp", "mktN", "consMinN", "hrrAltMax", "damping", "cfSelEnabled"]) {
    console.log(`  ${k}: ${typeof echo[k] === "object" ? JSON.stringify(echo[k]) : echo[k]}`);
  }
  /* READING 5 CANNOT BE ANSWERED FROM /api/board — 2026-07-31, and this would have produced a
     FALSE "did not land" tomorrow. `/api/board` returns `{board, gens}` where `gens` is a
     GenIndexEntry[] = {at, priced, live, luPct, bytes} (board-store L51-60) — there is NO
     `trigger` field anywhere in it, and no `gen` key at all. `trigger` is stamped by
     /api/generate (route L289) into its own RESPONSE BODY and into the prediction store's
     GenStamp (pred-serialize L110-130). So it is read from the generate response at fire time,
     or from /api/predictions?date=… -> blob.gens[].trigger. Reading 5 pre-commits
     trigger === "header" OR IT DID NOT LAND; reading it here would have said ABSENT no matter
     what happened. */
  console.log(`\nTRIGGER (reading 5): NOT READABLE FROM /api/board — see below`);
  console.log(`  /api/board's gens[] is {at,priced,live,luPct,bytes} — no trigger field exists in it.`);
  console.log(`  Read it from the GENERATE RESPONSE BODY at fire time, or:`);
  console.log(`    curl -sS -H "x-pl-sync: <PHRASE>" ".../api/predictions?date=<date>" | node -e '…gens[].trigger'`);
  if (Array.isArray(blob.gens)) console.log(`  (this response carries ${blob.gens.length} generation index entries: ${JSON.stringify(blob.gens.map((g) => g.at))})`);

  const c = cfSelReport(data);
  console.log(`\ncfSel: ${c.stamped}/${c.suspRows} susp rows stamped, ${c.carded} card:true`);
  if (c.missingRank) console.log(`  >>> ${c.missingRank} card:true stamps MISSING rank/stake — the ship did not land`);
  console.log(`  counterfactual dollars to suspended markets: ${JSON.stringify(c.dollarsByMarket)}`);

  const ca = data.clampActivity;
  console.log(`\nclampActivity (reading 24): ${ca ? `PRESENT, ${Object.keys(ca).length} sites` : ">>> ABSENT — clampLog arming is not reaching production analyze"}`);

  const r = reopenReport(data, echo);
  console.log(`\nREOPEN (reading 29): consMinN=${r.consMinN ?? ">>> UNREADABLE — no echo. Reading 3 says the push did not land; the gate is NOT assumed to be 100"}`);
  console.log(`  mktN: ${r.crossed ? JSON.stringify(r.crossed) : ">>> ABSENT from the echo"}`);
  console.log(`  blocked reasons: ${JSON.stringify(r.byReason)}`);
  if ((r.byReason.consensus ?? 0) > 0) console.log("  >>> CONSENSUS BLOCKS PRESENT: the expiry fired but the gate STILL BINDS — those markets did NOT reopen.");
}
