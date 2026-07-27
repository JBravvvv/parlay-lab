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

    // ======================================================================
    // IS THE PARLAY EV ADVANTAGE REAL, OR MANUFACTURED BY A FIXED +2% FLOOR?
    // ======================================================================
    // coreEvMin is a FIXED ticket-level floor, so it is a weaker filter the more legs a
    // ticket has: three legs at +2% each compound to 1.02^3-1 = +6.1%, so a 3-legger clears
    // a +2% ticket floor on legs averaging only +0.7%. The parlay path may therefore be
    // drawing from a wider, lower-quality leg pool and reporting a higher TICKET EV by
    // construction. Three checks.
    const legCzEv = (l: Row) => {
      const d2 = amToDec(num(l.cz));
      const p = num(l.prob);
      return d2 != null && p != null ? p / 100 * d2 - 1 : null;
    };
    const dist = (xs: number[]) => {
      const s = [...xs].sort((a, b) => a - b);
      const qq = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
      return `n=${s.length}  min ${(100 * s[0]).toFixed(2)}%  p25 ${(100 * qq(0.25)).toFixed(2)}%` +
        `  median ${(100 * qq(0.5)).toFixed(2)}%  p75 ${(100 * qq(0.75)).toFixed(2)}%` +
        `  max ${(100 * s[s.length - 1]).toFixed(2)}%  mean ${(100 * s.reduce((a, b) => a + b, 0) / s.length).toFixed(2)}%`;
    };

    const cardOf = (a: Record<string, unknown>) =>
      ((a.picks as Row[]) ?? []).map((p) => ({ pl: (p.w as Row).pl as Row, stake: Number(p.stake) }));

    const singlesCard = cardOf(alloc(mkPool(playable) as unknown[], DAILY, cfgOpen));
    const parlayCard = cardOf(alloc(parlays.map((pl, idx) => ({ pl, src: "p", idx })) as unknown[], DAILY, cfgOpen));

    const sLegs = singlesCard.flatMap((c) => ((c.pl.legs as Row[]) ?? []).map(legCzEv)).filter((x): x is number => x != null);
    const pLegs = parlayCard.flatMap((c) => ((c.pl.legs as Row[]) ?? []).map(legCzEv)).filter((x): x is number => x != null);
    // eslint-disable-next-line no-console
    console.log(
      `\n1. PER-LEG czEv BEHIND EACH CARD (the like-for-like test)\n` +
        `  singles card legs : ${dist(sLegs)}\n` +
        `  parlay  card legs : ${dist(pLegs)}\n` +
        `  parlay tickets by leg count: ${JSON.stringify(
          parlayCard.reduce((o: Record<number, number>, c) => {
            const n = ((c.pl.legs as Row[]) ?? []).length;
            o[n] = (o[n] ?? 0) + 1;
            return o;
          }, {}),
        )}`,
    );

    // LEG-EQUIVALENT FLOOR: admit a parlay only if its ticket czEv clears 1.02^n - 1, i.e.
    // every leg would have had to average +2%. Applied as an UPSTREAM POOL RESTRICTION and
    // then the real allocator is run — the gate itself is untouched.
    const legEquiv = parlays.filter((p) => {
      const n = ((p.legs as Row[]) ?? []).length;
      return Number(p.czEv ?? -99) >= (Math.pow(1.02, n) - 1) * 100;
    });
    const aLE = alloc(legEquiv.map((pl, idx) => ({ pl, src: "p", idx })) as unknown[], DAILY, cfgOpen);
    const leCard = cardOf(aLE);
    // eslint-disable-next-line no-console
    console.log(
      `\n2. LEG-EQUIVALENT FLOOR (ticket floor = 1.02^n - 1, applied upstream)\n` +
        `  parlays surviving: ${legEquiv.length} of ${parlays.length}` +
        `  ->  picks ${leCard.length}  staked $${aLE.sum}` +
        `  stake-wtd EV ${aLE.ev != null ? (Number(aLE.ev) * 100).toFixed(2) + "%" : "—"}\n` +
        `  their legs        : ${leCard.length ? dist(leCard.flatMap((c) => ((c.pl.legs as Row[]) ?? []).map(legCzEv)).filter((x): x is number => x != null)) : "—"}`,
    );

    // KELLY LOG-GROWTH — the scoreboard EV-per-pick cannot be.
    // EXACT over all 2^n card outcomes (n <= 6), assuming tickets are independent. The
    // allocator already forbids a repeated leg across tickets, so the residual dependence
    // is same-game legs on different tickets — real, and it makes this an approximation.
    const growth = (card: { pl: Row; stake: number }[]) => {
      if (!card.length) return null;
      const n = card.length;
      let e = 0;
      for (let mask = 0; mask < 1 << n; mask++) {
        let prob = 1, end = BANKROLL;
        for (let i = 0; i < n; i++) {
          const p = Number(card[i].pl.prob) / 100;
          const won = (mask >> i) & 1;
          prob *= won ? p : 1 - p;
          end -= card[i].stake;
          if (won) end += card[i].stake * Number(card[i].pl.czDec);
        }
        if (prob > 0 && end > 0) e += prob * Math.log(end / BANKROLL);
        else if (prob > 0) return -Infinity;
      }
      return e;
    };
    // how much does the FIXED floor over-admit relative to the leg-equivalent one?
    const evPass = parlays.filter((p) => core(p) && Number(p.czEv ?? -99) >= 2);
    const bothPass = evPass.filter((p) =>
      Number(p.czEv ?? -99) >= (Math.pow(1.02, ((p.legs as Row[]) ?? []).length) - 1) * 100);
    // eslint-disable-next-line no-console
    console.log(
      `  of the ${evPass.length} tickets clearing the FIXED +2% floor, ${bothPass.length} also clear` +
        ` the leg-equivalent floor  ->  ${evPass.length - bothPass.length} are admitted only because` +
        ` the floor does not scale with leg count`,
    );

    const rows2 = [
      ["singles card", singlesCard],
      ["parlay card", parlayCard],
      ["parlay card, leg-equivalent floor", leCard],
    ] as const;
    // eslint-disable-next-line no-console
    console.log(`\n3. EXPECTED LOG-GROWTH at the actual 1/4-Kelly stakes, bankroll $${BANKROLL}`);
    for (const [lbl, card] of rows2) {
      const g = growth(card as { pl: Row; stake: number }[]);
      const staked = (card as { stake: number }[]).reduce((a, c) => a + c.stake, 0);
      // eslint-disable-next-line no-console
      console.log(
        `  ${lbl.padEnd(34)} picks ${String(card.length).padStart(2)}  staked $${String(staked).padStart(3)}` +
          `  E[ln(B'/B)] ${g == null ? "—" : (g >= 0 ? "+" : "") + (g * 10000).toFixed(1) + " bp"}` +
          `  P(card loses everything staked) ${(card as { pl: Row }[]).reduce((a, c) => a * (1 - Number(c.pl.prob) / 100), 1).toFixed(4)}`,
      );
    }

    /* THE CAVEAT THAT DECIDES WHETHER THE ABOVE MEANS ANYTHING.
       Every number in section 3 is computed at THE MODEL'S OWN probabilities. A parlay is
       multiplicatively more sensitive to probability error than a single: shading each leg
       by d multiplies an n-leg ticket's probability by ~(1 - d/p)^n. Given docs/
       pitcher-outs-audit.md and the H+R+RBI ledger, systematic overconfidence is the live
       hypothesis, not a remote one — so the ranking is re-run under it rather than asserted
       to be robust. The shade is applied per LEG and propagated through the ticket, keeping
       any sim-joint adjustment intact by scaling the stored prob by the naive-product ratio. */
    const shaded = (card: { pl: Row; stake: number }[], dpp: number) =>
      card.map((c) => {
        const legs = (c.pl.legs as Row[]) ?? [];
        let a = 1, b = 1;
        for (const l of legs) {
          const p = Number(l.prob) / 100;
          a *= p;
          b *= Math.max(0.001, p - dpp / 100);
        }
        return { ...c, pl: { ...c.pl, prob: Number(c.pl.prob) * (a > 0 ? b / a : 0) } };
      });
    // eslint-disable-next-line no-console
    console.log(
      `\n4. THE SAME, UNDER PER-LEG OVERCONFIDENCE (every leg's true prob is d points lower)\n` +
        `${"   shade".padEnd(12)}${rows2.map(([l]) => l.split(",")[0].padStart(22)).join("")}`,
    );
    for (const dpp of [0, 1, 2, 3, 5]) {
      const cells = rows2.map(([, card]) => {
        const g = growth(shaded(card as { pl: Row; stake: number }[], dpp));
        return (g == null ? "—" : ((g >= 0 ? "+" : "") + (g * 10000).toFixed(1) + " bp")).padStart(22);
      });
      // eslint-disable-next-line no-console
      console.log(`   -${dpp} pp`.padEnd(12) + cells.join(""));
    }

    // ======================================================================
    // 5. THE CROSSOVER IS THE DECISION VARIABLE — its own sensitivity
    // ======================================================================
    // Everything about card structure reduces to: is per-leg edge overstated by more or
    // less than the crossover? That scalar decides a 2.3x growth difference, so it is
    // reported with its sensitivity to the two assumptions it rests on: the Kelly fraction
    // and whether the error is common across legs or independent.
    const crossover = (
      cards: { pl: Row; stake: number }[][],
      shadeFn: (c: { pl: Row; stake: number }[], d: number) => { pl: Row; stake: number }[],
    ) => {
      // finest resolution that stays honest about the inputs: 0.05 pp
      for (let d = 0; d <= 12.0001; d += 0.05) {
        const g = cards.map((c) => growth(shadeFn(c, d)) ?? -Infinity);
        if (g[1] <= g[0]) return d;
      }
      return null;
    };

    /* CORRELATED (the default, and what section 4 already modelled): one common bias --
       every leg's true probability is d points lower. A model that is optimistic is
       optimistic about everything at once.
       INDEPENDENT: the SAME mean bias d, but delivered as a per-leg random draw. Because
       E[prod(p_i - e_i)] = prod(p_i - d) under independence, the ticket's EXPECTED
       probability is identical -- the two differ only in the dispersion the log sees, which
       is exactly why it has to be simulated rather than argued. */
    const shadeCorr = shaded;
    const mulberry = (seed: number) => () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const growthIndep = (card: { pl: Row; stake: number }[], dpp: number, draws = 4000) => {
      if (!card.length) return null;
      let acc = 0;
      for (let s = 0; s < draws; s++) {
        const rng = mulberry(s * 2654435761);
        const shadedCard = card.map((c) => {
          const legs = (c.pl.legs as Row[]) ?? [];
          let a = 1, b = 1;
          for (const l of legs) {
            const p = Number(l.prob) / 100;
            // mean-preserving per-leg draw: uniform on [0, 2d]
            const e = 2 * dpp * rng() / 100;
            a *= p;
            b *= Math.max(0.001, p - e);
          }
          return { ...c, pl: { ...c.pl, prob: Number(c.pl.prob) * (a > 0 ? b / a : 0) } };
        });
        const g = growth(shadedCard);
        if (g == null || !isFinite(g)) return null;
        acc += g;
      }
      return acc / draws;
    };

    const kellyFractions = [0.125, 0.25, 0.5] as const;
    const origKF = eng.get<(pl: Row) => number | null>("shKellyFrac");
    // eslint-disable-next-line no-console
    console.log(
      `\n5. CROSSOVER SENSITIVITY — the per-leg overconfidence at which singles overtake parlays\n` +
        `${"Kelly".padEnd(10)}${"singles $".padStart(11)}${"parlay $".padStart(10)}` +
        `${"g_singles".padStart(12)}${"g_parlay".padStart(11)}${"CROSSOVER".padStart(12)}${"  (correlated bias)"}`,
    );
    const kellyRows: Record<string, number | null> = {};
    for (const kf of kellyFractions) {
      // shKellyFrac is min(0.25*kelly, 0.02) — swap ONLY the fraction, keep the 2% cap
      eng.set("shKellyFrac", function (pl: Row) {
        const decK = Number(pl.czDec);
        const p = Number(pl.prob) / 100;
        if (!isFinite(decK) || decK <= 1 || !isFinite(p)) return null;
        const bK = decK - 1;
        const k = Math.max(0, (bK * p - (1 - p)) / bK);
        return Math.max(0, Math.min(kf * k, 0.02));
      });
      const sC = cardOf(alloc(mkPool(playable) as unknown[], DAILY, cfgOpen));
      const pC = cardOf(alloc(parlays.map((pl, idx) => ({ pl, src: "p", idx })) as unknown[], DAILY, cfgOpen));
      const x = crossover([sC, pC], shadeCorr);
      kellyRows[String(kf)] = x;
      // eslint-disable-next-line no-console
      console.log(
        `${("1/" + Math.round(1 / kf)).padEnd(10)}` +
          `${String(sC.reduce((a, c) => a + c.stake, 0)).padStart(11)}` +
          `${String(pC.reduce((a, c) => a + c.stake, 0)).padStart(10)}` +
          `${((growth(sC) ?? 0) * 10000).toFixed(1).padStart(12)}` +
          `${((growth(pC) ?? 0) * 10000).toFixed(1).padStart(11)}` +
          `${(x == null ? "none <=12" : x.toFixed(2) + " pp").padStart(12)}`,
      );
    }
    eng.set("shKellyFrac", origKF);

    const sC0 = cardOf(alloc(mkPool(playable) as unknown[], DAILY, cfgOpen));
    const pC0 = cardOf(alloc(parlays.map((pl, idx) => ({ pl, src: "p", idx })) as unknown[], DAILY, cfgOpen));
    let xInd: number | null = null;
    for (let dd = 0; dd <= 12.0001; dd += 0.1) {
      const gs = growthIndep(sC0, dd), gp = growthIndep(pC0, dd);
      if (gs == null || gp == null) break;
      if (gp <= gs) { xInd = dd; break; }
    }
    // eslint-disable-next-line no-console
    console.log(
      `\n  same MEAN bias delivered INDEPENDENTLY per leg (uniform [0, 2d], 4000 draws):` +
        `  crossover ${xInd == null ? "none <=12 pp" : xInd.toFixed(2) + " pp"}` +
        `\n  (E[prod(p-e)] = prod(p-d) under independence, so the ticket's expected probability` +
        `\n   is unchanged; only the dispersion the log sees differs)`,
    );

    // ======================================================================
    // 5b. IS THE 1/8-KELLY ADVANTAGE REAL, OR ONLY WHERE perParlayCap BINDS?
    // ======================================================================
    // 133.0 bp at 1/8 vs 126.6 at 1/4 was measured on ONE card of 6 parlays, where
    // perParlayCap ($62.50 = 0.25 x $250) is the binding ceiling. Card size changes which
    // constraint binds, so it is re-run across card sizes and across card TYPES, and the
    // total staked is reported alongside — spreading the same $250 wider is a different
    // claim from staking less.
    const mixedPool = [
      ...mkPool(playable).map((w) => ({ pl: w.pl as Row, src: "s", idx: 0 })),
      ...parlays.map((pl, idx) => ({ pl, src: "p", idx })),
    ];
    // eslint-disable-next-line no-console
    console.log(
      `\n5b. 1/8 vs 1/4 KELLY BY CARD TYPE AND CARD SIZE  (maxCoreTickets varied; bankroll $${BANKROLL}, daily $${DAILY})\n` +
        `${"card".padEnd(10)}${"maxTix".padStart(7)}${"picks 1/8".padStart(11)}${"staked 1/8".padStart(12)}` +
        `${"g 1/8".padStart(10)}${"picks 1/4".padStart(11)}${"staked 1/4".padStart(12)}${"g 1/4".padStart(10)}` +
        `${"delta".padStart(10)}`,
    );
    const setKelly = (kf: number) =>
      eng.set("shKellyFrac", function (pl: Row) {
        const decK = Number(pl.czDec);
        const p = Number(pl.prob) / 100;
        if (!isFinite(decK) || decK <= 1 || !isFinite(p)) return null;
        const bK = decK - 1;
        const k = Math.max(0, (bK * p - (1 - p)) / bK);
        return Math.max(0, Math.min(kf * k, 0.02));
      });
    for (const [name, pool] of [
      ["singles", mkPool(playable)],
      ["parlays", parlays.map((pl, idx) => ({ pl, src: "p", idx }))],
      ["mixed", mixedPool],
    ] as const) {
      for (const maxTix of [6, 10, 15]) {
        const cfgN = { ...cfgOpen, maxCoreTickets: maxTix, minCoreTickets: Math.min(4, maxTix) };
        const out: { g: number; n: number; s: number }[] = [];
        for (const kf of [0.125, 0.25]) {
          setKelly(kf);
          const c = cardOf(alloc(pool as unknown[], DAILY, cfgN));
          out.push({ g: (growth(c) ?? 0) * 10000, n: c.length, s: c.reduce((a, x) => a + x.stake, 0) });
        }
        // eslint-disable-next-line no-console
        console.log(
          `${name.padEnd(10)}${String(maxTix).padStart(7)}` +
            `${String(out[0].n).padStart(11)}${("$" + out[0].s).padStart(12)}${out[0].g.toFixed(1).padStart(10)}` +
            `${String(out[1].n).padStart(11)}${("$" + out[1].s).padStart(12)}${out[1].g.toFixed(1).padStart(10)}` +
            `${(out[0].g - out[1].g >= 0 ? "+" : "") + (out[0].g - out[1].g).toFixed(1)}`.padStart(10),
        );
      }
    }
    eng.set("shKellyFrac", origKF);

    /* WHICH CONCENTRATION LIMIT? 1/8 Kelly works by forcing a more even split, so the
       question is how much of the gain a DIRECT evenness constraint captures. Brackets the
       space: current (1/4-Kelly ceilings) vs perfectly even vs 1/8. Stakes are re-derived
       from the same picks, so this isolates the ALLOCATION from the selection. */
    const regrow = (card: { pl: Row; stake: number }[], stakes: number[]) =>
      growth(card.map((c, i) => ({ ...c, stake: stakes[i] })));
    // eslint-disable-next-line no-console
    console.log(`\n5c. HOW MUCH OF THE 1/8 GAIN IS PURE EVENNESS?  (same picks, stakes re-derived)`);
    for (const [name, card] of [["singles", sC0], ["parlays", pC0]] as const) {
      const n = card.length;
      if (!n) continue;
      const tot = card.reduce((a, c) => a + c.stake, 0);
      const even = Array(n).fill(Math.floor(tot / n));
      even[0] += tot - even.reduce((a: number, b: number) => a + b, 0);
      const cur = (growth(card) ?? 0) * 10000;
      const ev = (regrow(card, even) ?? 0) * 10000;
      const conc = Math.max(...card.map((c) => c.stake)) / Math.min(...card.map((c) => c.stake));
      // eslint-disable-next-line no-console
      console.log(
        `  ${name.padEnd(9)} n=${n}  stake spread ${card.map((c) => "$" + c.stake).join(" ")}` +
          `  max/min ${conc.toFixed(2)}\n` +
          `${"".padEnd(11)}current ${cur.toFixed(1)} bp   perfectly even ${ev.toFixed(1)} bp` +
          `   delta ${(ev - cur >= 0 ? "+" : "") + (ev - cur).toFixed(1)} bp`,
      );
    }

    // eslint-disable-next-line no-console
    console.log(`\n5d. WHAT DOES 1/8 ACTUALLY DO TO THE STAKES?`);
    for (const kf of [0.125, 0.25]) {
      setKelly(kf);
      const c = cardOf(alloc(parlays.map((pl, idx) => ({ pl, src: "p", idx })) as unknown[], DAILY, cfgOpen));
      // eslint-disable-next-line no-console
      console.log(
        `  1/${Math.round(1 / kf)}  ` +
          c.map((x) => `$${x.stake}(czEv ${x.pl.czEv}%)`).join("  ") +
          `   max/min ${(Math.max(...c.map((x) => x.stake)) / Math.min(...c.map((x) => x.stake))).toFixed(2)}` +
          `   g ${((growth(c) ?? 0) * 10000).toFixed(1)} bp`,
      );
    }
    eng.set("shKellyFrac", origKF);

    // ======================================================================
    // 6. THE EV FLOOR MIS-SCALED BY LEG COUNT — sized for a freeze-exit decision
    // ======================================================================
    // eslint-disable-next-line no-console
    console.log(`\n6. FIXED +2% FLOOR vs LEG-EQUIVALENT FLOOR (1.02^n - 1), by leg count`);
    // eslint-disable-next-line no-console
    console.log(
      `${"legs".padEnd(6)}${"floor".padStart(9)}${"in pool".padStart(9)}` +
        `${"pass fixed".padStart(12)}${"pass leg-eq".padStart(13)}${"over-admitted".padStart(15)}`,
    );
    const byLegs = new Map<number, Row[]>();
    for (const p of parlays.filter(core)) {
      const n = ((p.legs as Row[]) ?? []).length;
      byLegs.set(n, [...(byLegs.get(n) ?? []), p]);
    }
    for (const n of [...byLegs.keys()].sort()) {
      const v = byLegs.get(n)!;
      const fl = (Math.pow(1.02, n) - 1) * 100;
      const pf = v.filter((p) => Number(p.czEv ?? -99) >= 2).length;
      const pl2 = v.filter((p) => Number(p.czEv ?? -99) >= fl).length;
      // eslint-disable-next-line no-console
      console.log(
        `${String(n).padEnd(6)}${("+" + fl.toFixed(2) + "%").padStart(9)}${String(v.length).padStart(9)}` +
          `${String(pf).padStart(12)}${String(pl2).padStart(13)}${String(pf - pl2).padStart(15)}`,
      );
    }
    const aLE2 = alloc(legEquiv.map((pl, idx) => ({ pl, src: "p", idx })) as unknown[], DAILY, cfgOpen);
    const leCard2 = cardOf(aLE2);
    const xLE = crossover([sC0, leCard2], shadeCorr);
    // eslint-disable-next-line no-console
    console.log(
      `\n  crossover vs the FIXED-floor parlay card      ${(crossover([sC0, pC0], shadeCorr) ?? 0).toFixed(2)} pp` +
        `\n  crossover vs the LEG-EQUIVALENT parlay card  ${xLE == null ? "none <=12" : xLE.toFixed(2) + " pp"}` +
        `   <-- does fixing the floor move the decision variable?`,
    );

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
