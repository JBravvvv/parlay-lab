import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fixtureEngine } from "./helpers/fixture-env";

/**
 * BLEND-WEIGHT SWEEP — ANALYSIS HARNESS, REPORT ONLY (2026-07-29, owner's item 3:
 * "λ = 0 is not zero shrinkage, and the blend weight is the parameter exit's own axis").
 *
 * The shipped leg est is final = w0·model + (1−w0)·consensus (SH_W: props .35,
 * ml/rl .15 — legacy L1738; modulated shrink-only by calW·calG ≤ 1, shWm L1743, so the
 * EFFECTIVE share is ≤ nominal — the archive does not store calW, so this sweep scales
 * the OBSERVED disagreement under the NOMINAL w0; if the effective share was smaller,
 * s=1 UNDERSTATES the raw model's true distance — stated, not hidden).
 *
 *   p_s = imp + (s / w0_market) · (p − imp)     s ∈ {0.15, 0.35, 0.50, 0.75, 1.00}
 *
 * Algebraically identical to inverting the blend and re-blending at share s. At the
 * shipped share the board reprints itself; s→1 runs the λ axis TOWARD the model.
 * One axis with one origin: λ from the shrink test maps to s = w0·(1−λ) — the two
 * sweeps meet at the shipped configuration (props s=0.35 ↔ λ=0; the eval-only gap's
 * zero crossing λ≈0.74 ↔ s≈0.09).
 *
 * IN-LOOP both rankings (gate + ranking key + Kelly read the re-blended belief);
 * E[ln], ticket count, leg count at each share; clamped-leg counts printed (p_s is
 * clamped to [0.1%, 99.9%] — amplification can leave [0,1]).
 *
 * Also printed here (owner's item 4, same data): the mean claimed per-leg gap
 * (p − imp) on each λ=0 card's legs, and the λ that would be needed for the selected
 * legs to carry a mean gap of −12.9 pp against market — HRR's measured calibration
 * gap. λ ∈ [0,1] shrinks est TOWARD market: est−imp = (1−λ)(p−imp) can never be
 * negative when p > imp, so a −12.9 mean REQUIRES λ > 1 (overshoot past the market).
 */

const BOARD = process.env.PL_BOARD || "";
const BANKROLL = 2500;
const DAILY = 250;

type Row = Record<string, unknown>;
const r1 = (x: number) => Math.round(x * 1000) / 10;

describe("blend-weight sweep (analysis harness, report only)", () => {
  it("model share 0.15→1.00 in-loop, both rankings; plus the HRR λ-mapping", () => {
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
    expect(allocSrc.includes(TARGET)).toBe(true);
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

    const w0Of = (l: Row) => {
      const lk = String(l.lkey ?? "");
      return lk.startsWith("ml_") || lk.startsWith("rl_") ? 0.15 : 0.35;
    };
    let clamped = 0;
    const reblendPl = (pl: Row, s: number): Row => {
      const legs = (pl.legs as Row[]) ?? [];
      let a = 1,
        b = 1;
      for (const l of legs) {
        const p = Number(l.prob) / 100;
        const imp = l.imp != null ? Number(l.imp) / 100 : null;
        a *= p;
        if (imp == null) {
          b *= p;
          continue;
        }
        let ps = imp + (s / w0Of(l)) * (p - imp);
        if (ps < 0.001 || ps > 0.999) {
          clamped++;
          ps = Math.min(0.999, Math.max(0.001, ps));
        }
        b *= ps;
      }
      const prob = Number(pl.prob) * (a > 0 ? b / a : 0);
      const czDec = Number(pl.czDec);
      return {
        ...pl,
        prob: r1(prob / 100),
        czEv: isFinite(czDec) && czDec > 1 ? r1((prob / 100) * czDec - 1) : pl.czEv,
      };
    };

    // eslint-disable-next-line no-console
    console.log(
      `\n${"=".repeat(88)}\nBLEND-WEIGHT SWEEP — board ${
        JSON.parse(fs.readFileSync(path.resolve(BOARD), "utf8")).board.date
      } · pool ${parlays.length} tickets · shipped share: props 0.35 / ml-rl 0.15 (nominal;` +
        ` calW·calG shrink-only ≤ 1, unarchived)\n${"=".repeat(88)}` +
        `\n  ${"share".padEnd(8)}${"g(prob)".padStart(11)}${"g(EV)".padStart(11)}${"gap".padStart(10)}` +
        `  ${"prob card".padEnd(11)}${"EV card".padEnd(11)}${"clamped legs".padStart(13)}`,
    );
    for (const s of [0.15, 0.35, 0.5, 0.75, 1.0]) {
      clamped = 0;
      const poolS = parlays.map((pl, idx) => ({ pl: reblendPl(pl, s), src: "p", idx }));
      const pc = cardOf(alloc(poolS as unknown[], DAILY, cfgOpen));
      setW();
      const ec = cardOf(allocEv(poolS as unknown[], DAILY, cfgOpen));
      eng.set("__W", null);
      const gp = growth(pc);
      const ge = growth(ec);
      const f = (x: number | null) =>
        (x == null ? "—" : (x >= 0 ? "+" : "") + (x * 10000).toFixed(1)).padStart(11);
      const cmp = (c: { pl: Row }[]) =>
        `${c.length}t/${c.reduce((a2, x) => a2 + (((x.pl.legs as Row[]) ?? []).length), 0)}l`;
      // eslint-disable-next-line no-console
      console.log(
        `  ${String(s).padEnd(8)}${f(gp)}${f(ge)}` +
          `${(gp != null && ge != null ? ((ge - gp >= 0 ? "+" : "") + ((ge - gp) * 10000).toFixed(1)) : "—").padStart(10)}` +
          `  ${cmp(pc).padEnd(11)}${cmp(ec).padEnd(11)}${String(clamped).padStart(13)}`,
      );
    }

    // ---- item 4: the HRR −12.9 pp mapping onto the shrink axis -------------------
    const pool0 = parlays.map((pl, idx) => ({ pl, src: "p", idx }));
    const pc0 = cardOf(alloc(pool0 as unknown[], DAILY, cfgOpen));
    setW();
    const ec0 = cardOf(allocEv(pool0 as unknown[], DAILY, cfgOpen));
    eng.set("__W", null);
    const meanGap = (card: { pl: Row }[]) => {
      const gaps: number[] = [];
      for (const c of card)
        for (const l of (c.pl.legs as Row[]) ?? []) {
          if (l.imp == null) continue;
          gaps.push(Number(l.prob) - Number(l.imp));
        }
      return { mean: gaps.reduce((a, b) => a + b, 0) / gaps.length, n: gaps.length };
    };
    const gp0 = meanGap(pc0);
    const ge0 = meanGap(ec0);
    // eslint-disable-next-line no-console
    console.log(
      `\nHRR λ-MAPPING (owner's item 4): mean claimed per-leg gap (p − imp) on the λ=0 cards:` +
        `\n  prob card: ${gp0.mean.toFixed(2)} pp over ${gp0.n} legs → λ for a MEAN of −12.9 pp: ` +
        `${(1 + 12.9 / gp0.mean).toFixed(2)} (OUTSIDE [0,1])` +
        `\n  EV card:   ${ge0.mean.toFixed(2)} pp over ${ge0.n} legs → λ needed: ${(1 + 12.9 / ge0.mean).toFixed(2)} (OUTSIDE [0,1])` +
        `\n  λ ∈ [0,1] can only shrink est toward market — est−imp = (1−λ)(p−imp) ≥ 0 when p>imp;` +
        `\n  a −12.9 mean lies BEYOND the market (truth below the CONSENSUS itself).`,
    );
    expect(true).toBe(true);
  }, 300_000);
});
