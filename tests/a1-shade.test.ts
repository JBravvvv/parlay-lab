import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fixtureEngine } from "./helpers/fixture-env";

/**
 * A1 LEVEL-GAP SHADE TEST — ANALYSIS HARNESS, REPORT ONLY (2026-07-29, owner's item:
 * "the +60.6 level gap is A1's strongest claim and it has never been shade-tested").
 *
 * NOTHING IS SHIPPED AND NO PARAMETER IS TOUCHED. Same standard as the coreEvMin shade
 * test that withdrew the "95 bp below optimum" claim as self-graded: E[ln] under the
 * model's own probabilities rewards the model's own favorites, so any gap measured at
 * shade 0 must be re-run under per-leg overconfidence before it can be called operative.
 *
 * INSTRUMENT (all pre-existing, from tests/singles-counterfactual.test.ts):
 * - pool: pregame parlays + mixed (no live legs), czDec != null — the production card pool.
 * - prob card: production shAllocate (base = prob).
 * - EV card: shAllocate with ONE expression patched in the sandbox —
 *   `base:probMode?prob:` -> `base:probMode?__W(ev,prob,dec):` with
 *   __W = max(ev,0)/(dec-1) — the A1 candidate, identical to harness section 5e.
 * - shade: every leg's true prob is d points lower; ticket prob scaled by the
 *   naive-product ratio (keeps any sim-joint adjustment intact). d in {0, 3, 5}.
 * - growth: exact E[ln(B'/B)] over all 2^n card outcomes at the actual stakes,
 *   bankroll $2,500, daily $250, ticket independence assumed (same caveat as ever:
 *   across-ticket same-game dependence is M16, unpriced here too).
 *
 * Reproduction check: at shade 0 the two cards must reproduce the recorded
 * bump-0 pair (+187.2 EV vs +126.6 prob, freeze-exit-bundle M14 ADDENDUM) or the
 * instrument is not the recorded one and the run says so.
 */

const BOARD = process.env.PL_BOARD || "";
const BANKROLL = 2500;
const DAILY = 250;

type Row = Record<string, unknown>;

describe("A1 level-gap shade test (analysis harness, report only)", () => {
  it("re-runs the bump-0 base comparison at per-leg shades 0/-3/-5", () => {
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
    const pPool = parlays.map((pl, idx) => ({ pl, src: "p", idx }));
    // gate OPEN (~08-06 state): mktN at proven counts so the consensus branch never
    // fires — the state the recorded +187.2/+126.6 pair was measured in (bundle M14
    // ADDENDUM); mktN:null is today's NO-PLAY state and returns empty cards.
    const PROVEN = Object.fromEntries(
      ["ml", "rl", "batter_hits", "batter_total_bases", "batter_home_runs",
        "batter_hits_runs_rbis", "pitcher_strikeouts", "pitcher_outs"].map((k) => [k, 999]),
    );
    const cfgOpen = { ...baseCfg, selMode: "ev_gated", mktN: PROVEN };

    const cardOf = (a: Record<string, unknown>) =>
      ((a.picks as Row[]) ?? []).map((p) => ({ pl: (p.w as Row).pl as Row, stake: Number(p.stake) }));

    // exact E[ln] over 2^n outcomes at actual stakes (singles-counterfactual, section 3)
    const growth = (card: { pl: Row; stake: number }[]) => {
      if (!card.length) return null;
      const n = card.length;
      let e = 0;
      for (let mask = 0; mask < 1 << n; mask++) {
        let prob = 1,
          end = BANKROLL;
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

    // per-leg correlated shade, propagated through the ticket by naive-product ratio
    const shaded = (card: { pl: Row; stake: number }[], dpp: number) =>
      card.map((c) => {
        const legs = (c.pl.legs as Row[]) ?? [];
        let a = 1,
          b = 1;
        for (const l of legs) {
          const p = Number(l.prob) / 100;
          a *= p;
          b *= Math.max(0.001, p - dpp / 100);
        }
        return { ...c, pl: { ...c.pl, prob: Number(c.pl.prob) * (a > 0 ? b / a : 0) } };
      });

    // the 5e patch: ONE expression, evaluated in the sandbox scope
    const allocSrc = eng.get<string>("shAllocate.toString()");
    const TARGET = "base:probMode?prob:";
    if (!allocSrc.includes(TARGET)) {
      // eslint-disable-next-line no-console
      console.log("[FAILED to locate the base expression — reporting nothing]");
      expect(allocSrc.includes(TARGET), "base expression not found in shAllocate").toBe(true);
      return;
    }
    const patched = allocSrc.replace(TARGET, "base:probMode?__W(ev,prob,dec):");
    const allocEv = eng.get<(p: unknown[], a: number, c: unknown) => Record<string, unknown>>(
      `(${patched})`,
    );
    eng.set("__W", (e: number, _p: number, dc: number) => (dc > 1 ? Math.max(e, 0) / (dc - 1) : 0));

    const probCard = cardOf(alloc(pPool as unknown[], DAILY, cfgOpen));
    const evCard = cardOf(allocEv(pPool as unknown[], DAILY, cfgOpen));
    eng.set("__W", null);

    const show = (label: string, card: { pl: Row; stake: number }[]) => {
      // eslint-disable-next-line no-console
      console.log(`\n  ${label} — ${card.length} tickets:`);
      for (const c of card)
        // eslint-disable-next-line no-console
        console.log(
          `    $${String(c.stake).padStart(3)}  ${String(c.pl.name).slice(0, 46).padEnd(48)}` +
            ` czEv ${String(c.pl.czEv).padStart(5)}%  prob ${String(c.pl.prob).padStart(5)}%`,
        );
    };

    // eslint-disable-next-line no-console
    console.log(
      `\n${"=".repeat(78)}\nA1 LEVEL-GAP SHADE TEST — board ${
        JSON.parse(fs.readFileSync(path.resolve(BOARD), "utf8")).board.date
      }` +
        `\npool ${pPool.length} pregame czDec tickets · bankroll $${BANKROLL} · daily $${DAILY}` +
        ` · selMode ev_gated\n${"=".repeat(78)}`,
    );
    show("prob card (production base)", probCard);
    show("EV card (edge-aware base, max(ev,0)/(dec-1))", evCard);

    // eslint-disable-next-line no-console
    console.log(
      `\n  ${"shade".padEnd(10)}${"g(prob)".padStart(12)}${"g(EV)".padStart(12)}${"gap EV-prob".padStart(14)}`,
    );
    const gaps: Record<number, { gp: number | null; ge: number | null }> = {};
    for (const dpp of [0, 3, 5]) {
      const gp = growth(shaded(probCard, dpp));
      const ge = growth(shaded(evCard, dpp));
      gaps[dpp] = { gp, ge };
      const f = (x: number | null) =>
        x == null ? "—" : ((x >= 0 ? "+" : "") + (x * 10000).toFixed(1) + " bp").padStart(12);
      // eslint-disable-next-line no-console
      console.log(
        `  ${("-" + dpp + " pp").padEnd(10)}${f(gp)}${f(ge)}` +
          `${(gp != null && ge != null ? ((ge - gp >= 0 ? "+" : "") + ((ge - gp) * 10000).toFixed(1) + " bp") : "—").padStart(14)}`,
      );
    }
    expect(true).toBe(true);
  }, 300_000);
});
