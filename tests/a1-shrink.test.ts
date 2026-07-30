import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fixtureEngine } from "./helpers/fixture-env";

/**
 * A1 SHRINK-TO-MARKET TEST — ANALYSIS HARNESS, REPORT ONLY (2026-07-29, owner's item 3:
 * "the shade test cannot see the overconfidence that would punish EV ranking").
 *
 * THE EXPOSURE THIS SEES AND THE SHADE TEST CANNOT: EV ranking selects the tickets with
 * the largest model-vs-market disagreement, so its failure mode is that the biggest
 * edges are the most overestimated. A constant per-leg shade subtracts equally from
 * high- and low-edge legs and cannot punish selection-on-edge. Here every leg's est is
 * shrunk TOWARD ITS OWN MARKET-IMPLIED probability by λ — the correction is
 * proportional to the claimed edge, which is exactly the overconfidence shape that
 * punishes edge-selection.
 *
 *   p'(λ) = (1−λ)·p + λ·imp     λ ∈ {0, .1, .25, .5, .75, 1}
 *
 * TWO RUNS:
 *  - EVALUATION-ONLY: cards fixed (built at λ=0, both rankings) — tests GRADING.
 *  - IN-LOOP: shrunk est feeds the ticket prob, czEv (the gate), the ranking key and
 *    the Kelly sizing; the production allocator re-runs at every λ — tests SELECTION.
 *    (Ticket CONSTRUCTION is upstream and fixed — buildParlaySet is a closure inside
 *    shAnalyzeLocal; the in-loop axis here is the allocator: gate + ranking + stakes.)
 *    Composition printed at every step. E[ln] is evaluated at the same shrunk probs
 *    (selection and grading under one belief — self-consistent).
 *
 * ALSO: an IN-LOOP UNIFORM SHADE sweep (0…−5 pp), because the evaluation-only
 * tolerance (owner's item 4) is not supportable if overconfidence would also change
 * selection — the in-loop crossing is the one the engine actually owns.
 *
 * CONTEXT THE NUMBERS SIT IN: leg est is ALREADY blended 35% model / 65% consensus for
 * props (SH_W, legacy) — λ here composes on top; λ=1 ≡ pure consensus fair. At λ=1,
 * ticket EV at the CZ price equals the consensus-at-CZ EV (consCzEv) — line-shopping
 * dispersion across books, NOT model edge — so nonzero EV at λ=1 is expected and is
 * printed, not treated as a failed target.
 */

const BOARD = process.env.PL_BOARD || "";
const BANKROLL = 2500;
const DAILY = 250;

type Row = Record<string, unknown>;
const r1 = (x: number) => Math.round(x * 1000) / 10;

describe("A1 shrink-to-market test (analysis harness, report only)", () => {
  it("λ-shrink eval-only + in-loop, and the in-loop uniform-shade tolerance", () => {
    if (!BOARD || !fs.existsSync(BOARD)) {
      // eslint-disable-next-line no-console
      console.log("\n[skipped] set PL_BOARD=/path/to/board.json to run this analysis\n");
      expect(true).toBe(true);
      return;
    }
    const d = JSON.parse(fs.readFileSync(path.resolve(BOARD), "utf8")).board.data as Record<
      string,
      Row[]
    >;
    const eng = fixtureEngine();
    const alloc = eng.get<(p: unknown[], a: number, c: unknown) => Record<string, unknown>>(
      "shAllocate",
    );
    const baseCfg = eng.get<Record<string, unknown>>("SH_CFG");
    const SH = eng.get<Record<string, unknown>>("SH");
    eng.set("SH", { ...SH, bankroll: BANKROLL, daily: DAILY });

    const parlays = [
      ...((d.parlays as unknown as Row[]) ?? []),
      ...((d.parlaysMixed as unknown as Row[]) ?? []).filter(
        (p) => !((p.legs as Row[]) ?? []).some((l) => l.live),
      ),
    ].filter((p) => p.czDec != null);
    const PROVEN = Object.fromEntries(
      ["ml", "rl", "batter_hits", "batter_total_bases", "batter_home_runs",
        "batter_hits_runs_rbis", "pitcher_strikeouts", "pitcher_outs"].map((k) => [k, 999]),
    );
    const cfgOpen = { ...baseCfg, selMode: "ev_gated", mktN: PROVEN };

    const allocSrc = eng.get<string>("shAllocate.toString()");
    const TARGET = "base:probMode?prob:";
    expect(allocSrc.includes(TARGET), "base expression not found").toBe(true);
    const allocEv = eng.get<(p: unknown[], a: number, c: unknown) => Record<string, unknown>>(
      `(${allocSrc.replace(TARGET, "base:probMode?__W(ev,prob,dec):")})`,
    );
    const setW = () =>
      eng.set("__W", (e: number, _p: number, dc: number) => (dc > 1 ? Math.max(e, 0) / (dc - 1) : 0));

    const cardOf = (a: Record<string, unknown>) =>
      ((a.picks as Row[]) ?? []).map((p) => ({ pl: (p.w as Row).pl as Row, stake: Number(p.stake) }));

    const growth = (card: { pl: Row; stake: number }[]) => {
      if (!card.length) return null;
      let e = 0;
      for (let mask = 0; mask < 1 << card.length; mask++) {
        let prob = 1,
          end = BANKROLL;
        for (let i = 0; i < card.length; i++) {
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

    /* shrink a TICKET: each leg p -> (1-λ)p + λ·imp; ticket prob scaled by the
       naive-product ratio (keeps any sim-joint adjustment); czEv recomputed from the
       new prob at the same czDec — the gate and the ranking see the shrunk belief. */
    const shrinkPl = (pl: Row, lam: number): Row => {
      const legs = (pl.legs as Row[]) ?? [];
      let a = 1,
        b = 1;
      let ok = true;
      for (const l of legs) {
        const p = Number(l.prob) / 100;
        const imp = l.imp != null ? Number(l.imp) / 100 : null;
        if (imp == null) ok = false;
        a *= p;
        b *= imp == null ? p : Math.max(0.001, (1 - lam) * p + lam * imp);
      }
      const prob = Number(pl.prob) * (a > 0 ? b / a : 0);
      const czDec = Number(pl.czDec);
      return {
        ...pl,
        prob: r1(prob / 100),
        czEv: isFinite(czDec) && czDec > 1 ? r1((prob / 100) * czDec - 1) : pl.czEv,
        __impOk: ok,
      };
    };
    const shadePl = (pl: Row, dpp: number): Row => {
      const legs = (pl.legs as Row[]) ?? [];
      let a = 1,
        b = 1;
      for (const l of legs) {
        const p = Number(l.prob) / 100;
        a *= p;
        b *= Math.max(0.001, p - dpp / 100);
      }
      const prob = Number(pl.prob) * (a > 0 ? b / a : 0);
      const czDec = Number(pl.czDec);
      return {
        ...pl,
        prob: r1(prob / 100),
        czEv: isFinite(czDec) && czDec > 1 ? r1((prob / 100) * czDec - 1) : pl.czEv,
      };
    };

    const comp = (card: { pl: Row }[]) => {
      const tickets = card.length;
      const legs = card.reduce((a, c) => a + (((c.pl.legs as Row[]) ?? []).length), 0);
      const gamesOf = (c: { pl: Row }) =>
        new Set(((c.pl.legs as Row[]) ?? []).map((l) => String(l.gkey)));
      let xPairs = 0;
      for (let i = 0; i < card.length; i++)
        for (let j = i + 1; j < card.length; j++) {
          const g = gamesOf(card[i]);
          for (const k of gamesOf(card[j])) if (g.has(k)) { xPairs++; break; }
        }
      return `${tickets}t/${legs}l/${xPairs}xp`;
    };
    const names = (card: { pl: Row }[]) =>
      card.map((c) => String(c.pl.name).replace(" parlay", "").replace(" · ", "·")).join(", ");

    // ---- base cards (λ=0) for the evaluation-only run --------------------------
    const pool0 = parlays.map((pl, idx) => ({ pl, src: "p", idx }));
    const probCard0 = cardOf(alloc(pool0 as unknown[], DAILY, cfgOpen));
    setW();
    const evCard0 = cardOf(allocEv(pool0 as unknown[], DAILY, cfgOpen));
    eng.set("__W", null);

    const evalShrunk = (card: { pl: Row; stake: number }[], lam: number) =>
      growth(card.map((c) => ({ ...c, pl: shrinkPl(c.pl, lam) })));

    const LAMS = [0, 0.1, 0.25, 0.5, 0.75, 1.0];
    // eslint-disable-next-line no-console
    console.log(
      `\n${"=".repeat(90)}\nA1 SHRINK-TO-MARKET — board ${
        JSON.parse(fs.readFileSync(path.resolve(BOARD), "utf8")).board.date
      } · pool ${pool0.length} tickets · legs already 35% model / 65% consensus (SH_W props)\n${"=".repeat(90)}` +
        `\n\nEVALUATION-ONLY (cards fixed at λ=0 — tests GRADING)\n` +
        `  ${"λ".padEnd(7)}${"g(prob)".padStart(11)}${"g(EV)".padStart(11)}${"gap".padStart(10)}`,
    );
    for (const lam of LAMS) {
      const gp = evalShrunk(probCard0, lam);
      const ge = evalShrunk(evCard0, lam);
      const f = (x: number | null) =>
        (x == null ? "—" : (x >= 0 ? "+" : "") + (x * 10000).toFixed(1)).padStart(11);
      // eslint-disable-next-line no-console
      console.log(
        `  ${String(lam).padEnd(7)}${f(gp)}${f(ge)}` +
          `${(gp != null && ge != null ? ((ge - gp >= 0 ? "+" : "") + ((ge - gp) * 10000).toFixed(1)) : "—").padStart(10)}`,
      );
    }

    // ---- in-loop: shrunk belief feeds gate + ranking + stakes -------------------
    // eslint-disable-next-line no-console
    console.log(
      `\nIN-LOOP (allocator re-run at every λ; gate, ranking key and Kelly all read the` +
        ` shrunk belief — tests SELECTION)\n` +
        `  ${"λ".padEnd(7)}${"g(prob)".padStart(11)}${"g(EV)".padStart(11)}${"gap".padStart(10)}` +
        `  ${"prob card".padEnd(12)}${"EV card".padEnd(12)}`,
    );
    for (const lam of LAMS) {
      const poolL = parlays.map((pl, idx) => ({ pl: shrinkPl(pl, lam), src: "p", idx }));
      const pc = cardOf(alloc(poolL as unknown[], DAILY, cfgOpen));
      setW();
      const ec = cardOf(allocEv(poolL as unknown[], DAILY, cfgOpen));
      eng.set("__W", null);
      const gp = growth(pc);
      const ge = growth(ec);
      const f = (x: number | null) =>
        (x == null ? "—" : (x >= 0 ? "+" : "") + (x * 10000).toFixed(1)).padStart(11);
      // eslint-disable-next-line no-console
      console.log(
        `  ${String(lam).padEnd(7)}${f(gp)}${f(ge)}` +
          `${(gp != null && ge != null ? ((ge - gp >= 0 ? "+" : "") + ((ge - gp) * 10000).toFixed(1)) : "—").padStart(10)}` +
          `  ${comp(pc).padEnd(12)}${comp(ec).padEnd(12)}`,
      );
      if (lam === 1.0) {
        const evs = poolL.map((w) => Number((w.pl as Row).czEv)).filter((x) => isFinite(x));
        const pos = evs.filter((x) => x > 0).length;
        // eslint-disable-next-line no-console
        console.log(
          `    λ=1 EV census (the impossible-branch print): ${pos} of ${evs.length} pool tickets carry czEv > 0` +
            ` — these are consensus-at-CZ EVs (line-shopping dispersion), NOT model edge; max ${Math.max(...evs).toFixed(1)}%`,
        );
        // eslint-disable-next-line no-console
        console.log(`    λ=1 EV card: ${names(ec)}`);
        // eslint-disable-next-line no-console
        console.log(`    λ=1 prob card: ${names(pc)}`);
      }
    }

    // ---- in-loop UNIFORM shade (the item-4 tolerance, selection included) --------
    // eslint-disable-next-line no-console
    console.log(
      `\nIN-LOOP UNIFORM SHADE (the tolerance the engine actually owns — selection responds)\n` +
        `  ${"shade".padEnd(7)}${"g(prob)".padStart(11)}${"g(EV)".padStart(11)}` +
        `  ${"prob card".padEnd(12)}${"EV card".padEnd(12)}`,
    );
    for (const dpp of [0, 1, 2, 3, 4, 5]) {
      const poolD = parlays.map((pl, idx) => ({ pl: shadePl(pl, dpp), src: "p", idx }));
      const pc = cardOf(alloc(poolD as unknown[], DAILY, cfgOpen));
      setW();
      const ec = cardOf(allocEv(poolD as unknown[], DAILY, cfgOpen));
      eng.set("__W", null);
      const gp = growth(pc);
      const ge = growth(ec);
      const f = (x: number | null) =>
        (x == null ? "—" : (x >= 0 ? "+" : "") + (x * 10000).toFixed(1)).padStart(11);
      // eslint-disable-next-line no-console
      console.log(
        `  ${("-" + dpp).padEnd(7)}${f(gp)}${f(ge)}  ${comp(pc).padEnd(12)}${comp(ec).padEnd(12)}`,
      );
    }
    expect(true).toBe(true);
  }, 300_000);
});
