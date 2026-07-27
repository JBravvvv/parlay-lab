import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fixtureEngine } from "./helpers/fixture-env";

/**
 * SINGLES-vs-PARLAYS COUNTERFACTUAL — ANALYSIS HARNESS, REPORT ONLY (2026-07-26).
 *
 * NOTHING IS SHIPPED AND NO PARAMETER IS TOUCHED. This file runs the REAL `shAllocate`
 * and `shCoreEligible` over a pool of one-leg tickets built from a persisted production
 * board, and prints a report. It asserts only that the harness itself ran; it deliberately
 * pins no production behaviour, because a counterfactual is not a regression.
 *
 * WHY A COUNTERFACTUAL AND NOT A MEASUREMENT
 * ------------------------------------------
 * The headline is already known and is NOT what this answers: 0 of 46 legs pass `consMinEv`
 * on their own today (best leg on the board -1.7% against a -0.50%/-0.33% per-leg bar), so a
 * singles card is empty today too. **Singles do not solve the NO-PLAY window.** The question
 * here is purely structural: once the counters rebuild (~08-06+), is singles-first better
 * than parlays-first at the same dollar exposure?
 *
 * HOW THE GATE IS "DISABLED" — by CONFIG, not by code
 * ---------------------------------------------------
 * `cfg.mktN` is set to a proven count for every market, so `small` is false and the
 * consensus branch never fires. That is not a hack: it is exactly the state the engine
 * reaches on its own once `mktN >= consMinN`, so the counterfactual is the real ~08-06
 * engine, not a modified one. `consMinN`/`consMinEv` themselves are untouched.
 *
 * WHAT IS CONSTRUCTED, AND WHAT IS NOT
 * ------------------------------------
 * `buildParlaySet` REFUSES to build a one-leg ticket — `if(!sel||sel.length<2)return null`
 * (L2640). A single is not merely unselected today; it is unconstructible. So the ticket
 * OBJECT has to be built here. Every field below is the n=1 evaluation of that function's
 * own expressions (L2641-2712), not a new rule:
 *
 *     dec = amToDec(leg.odds)            prob = leg.prob/100
 *     czDec = amToDec(leg.cz)            czEv  = prob*czDec - 1
 *     bsDec = amToDec(leg.bs)            bsEv  = prob*bsDec - 1
 *     consP = leg.imp/100                consEv = consP*bsDec - 1
 *                                        consCzEv = consP*czDec - 1
 *     simJoint = false, posCorr = negCorr = false   (all require legs.length >= 2)
 *
 * Everything after construction — `shCoreEligible`, the EV floor, `nv_tax`, `booksInd`, the
 * consensus branch, greedy selection, the leg/game dedupe, the K's rules, 1/4-Kelly sizing,
 * the caps and the rounding — is the production function, called directly.
 */

const BOARD = process.env.PL_BOARD || "";
const BANKROLL = 2500;
const DAILY = 250;

type Row = Record<string, unknown>;
const num = (v: unknown) => (v == null ? null : Number(v));
const amToDec = (a: number | null) =>
  a == null || !isFinite(a) || a === 0 ? null : a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a);
const oddsNum = (s: unknown) => {
  const n = Number(String(s).replace(/[^\d+-]/g, ""));
  return isFinite(n) && n !== 0 ? n : null;
};
const r1 = (x: number) => Math.round(x * 1000) / 10;

const TYPE_NAME: Record<string, string> = {
  ml: "ML", rl: "RL", batter_hits: "Hits", batter_total_bases: "Total Bases",
  batter_home_runs: "HR", batter_hits_runs_rbis: "H+R+RBI",
  pitcher_strikeouts: "K's", pitcher_outs: "Outs",
};

/** the n=1 case of buildParlaySet's own expressions — see the header */
function singleOf(r: Row, market: string) {
  const dec = amToDec(oddsNum(r.odds));
  const prob = num(r.prob) != null ? Number(r.prob) / 100 : null;
  const czDec = amToDec(num(r.cz));
  const bsDec = amToDec(num(r.bs));
  const consP = num(r.implied) != null ? Number(r.implied) / 100 : null;
  if (prob == null || dec == null) return null;
  const leg = {
    label: r.label, prop: r.sub, odds: String(r.odds).replace(/[^\d+-]/g, ""),
    est: String(r.prob), txt: `${r.label} · ${r.sub} (${r.odds})`,
    game: String(r.game ?? "").split(" · ")[0], prob: num(r.prob),
    lkey: r.lkey ?? null, gkey: r.gkey ?? null,
    cz: num(r.cz), bs: num(r.bs), bsBook: r.bsBook ?? null,
    imp: num(r.implied), booksInd: num(r.booksInd), live: !!r.live, lu: r.lu ?? "confirmed",
  };
  return {
    name: `${TYPE_NAME[market] ?? market} single · ${r.label}`,
    type: market, typeLabel: TYPE_NAME[market] ?? market,
    tier: dec <= 6 ? "SAFER" : dec <= 25 ? "BALANCED" : "LONGSHOT",
    legs: [leg], simJoint: false, probNaive: null,
    prob: r1(prob), stake: dec <= 3 ? 100 : dec <= 6 ? 50 : dec <= 12 ? 25 : dec <= 40 ? 10 : 5,
    czDec: czDec != null ? Math.round(czDec * 10000) / 10000 : null,
    czEv: czDec != null ? r1(prob * czDec - 1) : null,
    bsDec: bsDec != null ? Math.round(bsDec * 10000) / 10000 : null,
    bsEv: bsDec != null ? r1(prob * bsDec - 1) : null,
    consEv: consP != null && bsDec != null && bsDec > 1 ? r1(consP * bsDec - 1) : null,
    consCzEv: consP != null && czDec != null && czDec > 1 ? r1(consP * czDec - 1) : null,
    posCorr: false, negCorr: false, ev: r1(prob * dec - 1),
  };
}

describe("singles-vs-parlays counterfactual (analysis harness, report only)", () => {
  it("runs the production allocator over one-leg tickets and reports", () => {
    if (!BOARD || !fs.existsSync(BOARD)) {
      // eslint-disable-next-line no-console
      console.log("\n[skipped] set PL_BOARD=/path/to/board.json to run this analysis\n");
      expect(true).toBe(true);
      return;
    }
    const d = JSON.parse(fs.readFileSync(path.resolve(BOARD), "utf8")).board.data as Record<string, Row[]>;
    const eng = fixtureEngine();
    const alloc = eng.get<(p: unknown[], a: number, c: unknown) => Record<string, unknown>>("shAllocate");
    const baseCfg = eng.get<Record<string, unknown>>("SH_CFG");
    // the allocator reads SH.bankroll for the Kelly ceiling
    const SH = eng.get<Record<string, unknown>>("SH");
    eng.set("SH", { ...SH, bankroll: BANKROLL, daily: DAILY });

    // ---- populations -------------------------------------------------------
    const cats = d.categories as unknown as Record<string, Row[]>;
    const boardRows: { r: Row; m: string }[] = [];
    const seen = new Set<string>();
    for (const [m, rows] of Object.entries(cats)) {
      if (m === "all") continue;
      for (const r of rows) {
        const k = `${r.gkey}|${r.lkey}`;
        if (r.live || seen.has(k)) continue;
        seen.add(k);
        boardRows.push({ r, m });
      }
    }
    const parlays = [
      ...((d.parlays as unknown as Row[]) ?? []),
      ...((d.parlaysMixed as unknown as Row[]) ?? []).filter(
        (p) => !((p.legs as Row[]) ?? []).some((l) => l.live),
      ),
    ].filter((p) => p.czDec != null);
    const core = (p: Row) =>
      !(p.type === "batter_home_runs" ||
        ((p.legs as Row[]) ?? []).some((l) => String(l.lkey ?? "").includes("|batter_home_runs|")) ||
        ((p.legs as Row[]) ?? []).length > 3 ||
        (p.czDec != null && Number(p.czDec) > 15));
    const evTix = parlays.filter((p) => core(p) && Number(p.czEv ?? -99) >= 2);
    const selKeys = new Set<string>();
    for (const p of evTix) for (const l of (p.legs as Row[]) ?? []) selKeys.add(`${l.gkey}|${l.lkey}`);

    const mkPool = (rows: { r: Row; m: string }[]) =>
      rows
        .map(({ r, m }, i) => {
          const pl = singleOf(r, m);
          return pl ? { pl, src: "p", idx: i } : null;
        })
        .filter((x): x is { pl: ReturnType<typeof singleOf>; src: string; idx: number } => x != null);

    const PROVEN = Object.fromEntries(Object.keys(TYPE_NAME).map((k) => [k, 999]));
    const cfgOpen = { ...baseCfg, selMode: "ev_gated", mktN: PROVEN };
    const cfgGated = { ...baseCfg, selMode: "ev_gated", mktN: null };

    const noParlay = boardRows.filter(({ r }) => r.noParlay).length;
    const playable = boardRows.filter(({ r }) => !r.noParlay);
    const selRows = playable.filter(({ r }) => selKeys.has(`${r.gkey}|${r.lkey}`));

    const run = (rows: typeof boardRows, cfg: unknown, label: string) => {
      const pool = mkPool(rows);
      const a = alloc(pool as unknown[], DAILY, cfg);
      const blocked = (a.blocked as Row[]) ?? [];
      const byReason: Record<string, number> = {};
      for (const b of blocked) byReason[String(b.reason)] = (byReason[String(b.reason)] ?? 0) + 1;
      const picks = (a.picks as Row[]) ?? [];
      // eslint-disable-next-line no-console
      console.log(
        `\n${label}\n  pool ${pool.length} one-leg tickets` +
          `  ->  picks ${picks.length}  staked $${a.sum}` +
          `  unallocated ${a.unallocated === undefined ? "(field absent — NO-PLAY exit)" : "$" + a.unallocated}` +
          // shAllocate stores ev as a FRACTION (selEv/100 at L2997), so x100 to print percent
          `  stake-wtd EV ${a.ev != null ? (Number(a.ev) * 100).toFixed(2) + "%" : "—"}` +
          `\n  blocked: ${JSON.stringify(byReason)}`,
      );
      for (const p of picks) {
        const pl = (p.w as Row).pl as Row;
        // eslint-disable-next-line no-console
        console.log(
          `    $${String(p.stake).padStart(3)}  ${String(pl.name).slice(0, 44).padEnd(46)}` +
            ` czEv ${String(pl.czEv).padStart(5)}%  hit ${String(pl.prob).padStart(5)}%` +
            `  consCzEv ${String(pl.consCzEv).padStart(6)}%`,
        );
      }
      return { a, pool, byReason };
    };

    // eslint-disable-next-line no-console
    console.log(
      `\n${"=".repeat(78)}\nSINGLES COUNTERFACTUAL — board ${JSON.parse(fs.readFileSync(path.resolve(BOARD), "utf8")).board.date}` +
        `\nbankroll $${BANKROLL}  daily $${DAILY}  selMode ev_gated  perParlayCap ${baseCfg.perParlayCap}` +
        `  dailyBankrollCap ${baseCfg.dailyBankrollCap}  kellyStakeMult ${baseCfg.kellyStakeMult}` +
        `\nboard rows ${boardRows.length} (${noParlay} noParlay excluded -> ${playable.length} playable)` +
        `\nthe 18 EV-passing parlays carry ${selKeys.size} distinct legs\n${"=".repeat(78)}`,
    );

    run(selRows, cfgOpen, "A1. THE 37 SELECTED LEGS AS SINGLES — consensus gate OPEN (~08-06 state)");
    run(selRows, cfgGated, "A2. THE SAME 37 — gate ENABLED, evaluated PER LEG (isolates compounding)");
    run(playable, cfgOpen, "D. FULL BOARD SINGLES-FIRST — gate OPEN");
    run(playable, cfgGated, "D2. FULL BOARD SINGLES-FIRST — gate ENABLED");

    // ---- the parlay side, same allocator, same dollars ----------------------
    const pPool = parlays.map((pl, idx) => ({ pl, src: "p", idx }));
    for (const [lbl, cfg] of [["gate OPEN", cfgOpen], ["gate ENABLED (today)", cfgGated]] as const) {
      const a = alloc(pPool as unknown[], DAILY, cfg);
      const byReason: Record<string, number> = {};
      for (const b of ((a.blocked as Row[]) ?? [])) byReason[String(b.reason)] = (byReason[String(b.reason)] ?? 0) + 1;
      // eslint-disable-next-line no-console
      console.log(
        `\nPARLAYS-FIRST (production path), ${lbl}\n  pool ${pPool.length}  ->  picks ${((a.picks as Row[]) ?? []).length}` +
          `  staked $${a.sum}` +
          `  unallocated ${a.unallocated === undefined ? "(field absent — NO-PLAY exit)" : "$" + a.unallocated}` +
          `  stake-wtd EV ${a.ev != null ? (Number(a.ev) * 100).toFixed(2) + "%" : "—"}` +
          `\n  blocked: ${JSON.stringify(byReason)}`,
      );
    }

    // ---- the per-leg consensus bar, stated directly -------------------------
    // `consCzEv` is null when the leg has no Caesars quote. Number(null) === 0, which would
    // silently count every unquoted leg as sitting exactly ON the bar — filter BEFORE casting.
    const poolAll = mkPool(playable);
    const noCz = poolAll.filter((w) => w.pl!.consCzEv == null).length;
    const cc = poolAll
      .filter((w) => w.pl!.consCzEv != null)
      .map((w) => Number(w.pl!.consCzEv))
      .sort((a, b) => a - b);
    const cq = (p: number) => cc[Math.min(cc.length - 1, Math.floor(p * cc.length))];
    // eslint-disable-next-line no-console
    console.log(
      `\nPER-LEG consCzEv over ${cc.length} playable board rows with a Caesars quote` +
        ` (${noCz} rows have none and cannot be a single at all)   bar = consMinEv ${baseCfg.consMinEv}%` +
        `\n  min ${cq(0).toFixed(2)}  p25 ${cq(0.25).toFixed(2)}  median ${cq(0.5).toFixed(2)}` +
        `  p75 ${cq(0.75).toFixed(2)}  max ${cc[cc.length - 1].toFixed(2)}` +
        `\n  rows clearing ${baseCfg.consMinEv}% as a SINGLE: ${cc.filter((x) => x >= Number(baseCfg.consMinEv)).length} of ${cc.length}`,
    );

    // ---- C. correlation selection — real board, no counterfactual -----------
    // EVERY ticket the engine emitted, not just the core pool: correlation is a property of
    // the ticket, and restricting to czDec != null would answer a different question.
    const allTix = [
      ...((d.parlays as unknown as Row[]) ?? []),
      ...((d.parlaysMixed as unknown as Row[]) ?? []),
      ...((d.parlaysLive as unknown as Row[]) ?? []),
    ];
    const sameGame = allTix.filter((p) => {
      const c: Record<string, number> = {};
      for (const l of (p.legs as Row[]) ?? []) c[String(l.gkey)] = (c[String(l.gkey)] ?? 0) + 1;
      return Math.max(0, ...Object.values(c)) >= 2;
    }).length;
    const groups = allTix.filter((p) => p.simJoint);
    // eslint-disable-next-line no-console
    console.log(
      `\n  of ${allTix.length} tickets emitted, ${sameGame} contain a same-game group (>=2 legs, one gkey)`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `\nC. CORRELATION SELECTION — real board, no counterfactual\n` +
        `  tickets with a sim-priced same-game group: ${groups.length} of ${allTix.length}` +
        `  (simJoint=true means at least one same-game group was repriced from joint paths)` +
        `\n  NOTE: prob/probNaive are stored rounded to 0.1pp, so a ratio of exactly 1.000 means` +
        `\n  "no effect survived rounding", not necessarily "no effect". Four HR tickets round to` +
        `\n  0.0% and yield no ratio at all.`,
    );
    if (groups.length) {
      const ratios = groups
        .map((p) => ({ n: p.name, r: Number(p.prob) / Number(p.probNaive), prob: p.prob, nv: p.probNaive,
                       pos: p.posCorr, neg: p.negCorr }))
        .filter((x) => isFinite(x.r) && x.r > 0)
        .sort((a, b) => a.r - b.r); // ASCENDING, or every quantile label below is inverted
      const q = (p: number) => ratios[Math.min(ratios.length - 1, Math.floor(p * ratios.length))]?.r;
      // eslint-disable-next-line no-console
      console.log(
        `  jointAll / naive-product over ${ratios.length} tickets:` +
          `  min ${q(0)?.toFixed(3)}  p25 ${q(0.25)?.toFixed(3)}  median ${q(0.5)?.toFixed(3)}` +
          `  p75 ${q(0.75)?.toFixed(3)}  max ${ratios[ratios.length - 1]?.r.toFixed(3)}\n` +
          `  > 1.10: ${ratios.filter((x) => x.r > 1.1).length}` +
          `   > 1.25: ${ratios.filter((x) => x.r > 1.25).length}` +
          `   > 1.50: ${ratios.filter((x) => x.r > 1.5).length}` +
          `   BELOW 1.00: ${ratios.filter((x) => x.r < 1).length}`,
      );
      for (const x of ratios.filter((y) => y.r < 1))
        // eslint-disable-next-line no-console
        console.log(`    BELOW 1: ${x.r.toFixed(3)}  ${String(x.n).slice(0, 50)}  joint ${x.prob}% vs naive ${x.nv}%`);
    }
    expect(true).toBe(true);
  }, 300_000);
});
