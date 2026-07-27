import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FROZEN_NOW, armedFixtureEngine } from "./helpers/fixture-env";
import type { Engine } from "@/engine";

/**
 * H+R+RBI RANGE COMPRESSION — WHICH STAGE COLLAPSES THE SPREAD (2026-07-26)
 *
 * `tools/range_compression.py` measures H+R+RBI's model lambda spread at HALF the market's
 * (IQR ratio 0.50) — the same magnitude as `pitcher_outs` (0.51). But the cause cannot be
 * the same: H+R+RBI's `shShrink` site (L2359, k=10 at n median 26) has the BEST own-sample
 * weight in the whole engine, 0.722. So the compression is somewhere else.
 *
 * H+R+RBI's lambda is built in three stages (L2359):
 *
 *     bn   = shBlendN(st, h+r+rbi, "g", ...)      // 1. blend across 7/15/30-day windows
 *     rate = shShrink(bn.r, bn.n, 10, Lhrr)       // 2. empirical-Bayes pull to league
 *     lam  = rate * (coors ? 1.08 : 1) * power    // 3. multiplicative factor stack
 *
 * This instruments stages 1 and 2 directly (one `shShrink` call per H+R+RBI row, at a
 * market-specific line, so the pairing is exact) and recovers stage 3 from the engine's own
 * output board by inverting each row's price through its own Poisson. Reporting IQR at every
 * stage against the market's shows where the spread disappears.
 *
 * WHY THIS MATTERS BEYOND THE NUMBER: H+R+RBI is the market that already cost real money and
 * is suspended above O0.5 (`hrrAltMax`). **A model that cannot reach the tail will
 * systematically misprice alternate lines**, which is a mechanism for exactly that history.
 *
 * DENOMINATOR: armed fixture slate (real captured MLB data, 2026-07-09). Stage ratios are
 * measured WITHIN this one population, so they are internally consistent; the real-board
 * figure (0.50) is quoted only as corroboration of the endpoint, not mixed into the stages.
 */

const SNAP = path.join(__dirname, "fixtures", "hrr-compression-v1.json");

function scriptOffset(): number {
  const html = fs.readFileSync(path.join(__dirname, "..", "legacy", "index.html"), "utf8");
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const biggest = blocks.slice().sort((a, b) => b[1].length - a[1].length)[0];
  return html.slice(0, biggest.index as number).split("\n").length - 1;
}

const HRR_SHRINK_LINE = "2359"; // rate = shrinkTag(bn.r, shShrink(bn.r, bn.n, 10, Lhrr))
const POWER_LINE = "2319"; // power = shClamp((eraQ/4.20 + whip/1.30)/2, .85, 1.18)

function q(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i), hi = Math.min(lo + 1, s.length - 1);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}
const iqr = (xs: number[]) => q(xs, 0.75) - q(xs, 0.25);
const p1090 = (xs: number[]) => q(xs, 0.9) - q(xs, 0.1);

function poisCdf(k: number, lam: number) {
  let s = 0, t = Math.exp(-lam);
  for (let i = 0; i <= k; i++) { s += t; t *= lam / (i + 1); }
  return s;
}
function invert(line: number, p: number): number | null {
  if (!(p > 0 && p < 1)) return null;
  let lo = 1e-6, hi = 60;
  for (let i = 0; i < 90; i++) {
    const m = (lo + hi) / 2;
    if (1 - poisCdf(Math.floor(line), m) < p) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

function instrument(eng: Engine) {
  const off = scriptOffset();
  const blendOut: number[] = [];   // stage 1 output  (bn.r)
  const shrunk: number[] = [];     // stage 2 output  (rate)
  const powers: number[] = [];     // stage 3's only varying factor
  const site = (depth = 1) => {
    const st = (new Error().stack || "").split("\n");
    for (let i = depth; i < st.length; i++) {
      const m = st[i].match(/<anonymous>:(\d+):\d+\)?\s*$/);
      if (m) return String(Number(m[1]) + off);
    }
    return "?";
  };
  const origShrink = eng.get<(r: number, n: number, k: number, p: number) => number>("shShrink");
  eng.set("shShrink", function (rate: number, n: number, k: number, prior: number) {
    const out = origShrink(rate, n, k, prior);
    if (site() === HRR_SHRINK_LINE && rate != null && isFinite(rate)) {
      blendOut.push(rate);
      if (out != null && isFinite(out)) shrunk.push(out);
    }
    return out;
  });
  const origClamp = eng.get<(v: number, lo: number, hi: number) => number>("shClamp");
  eng.set("shClamp", function (v: number, lo: number, hi: number) {
    if (site() === POWER_LINE) powers.push(origClamp(v, lo, hi));
    return origClamp(v, lo, hi);
  });
  return { blendOut, shrunk, powers };
}

describe("H+R+RBI range compression — locate the stage that collapses the spread", () => {
  it("reports IQR at every stage of the lambda build", async () => {
    vi.setSystemTime(FROZEN_NOW);
    const eng = armedFixtureEngine();
    const cap = instrument(eng);
    const slate = await eng.collectSlate();
    const d = eng.analyze(slate) as unknown as Record<string, unknown>;

    // stage 3 endpoint + the market, from the engine's own board, oriented to the OVER
    const rows = ((d.categories as Record<string, Record<string, unknown>[]>)?.batter_hits_runs_rbis ?? [])
      .filter((r) => r.pModel != null && r.implied != null && r.lkey);
    const lamModel: number[] = [], lamMkt: number[] = [];
    for (const r of rows) {
      const ln = Number(String(r.lkey).split("|")[2]);
      if (!isFinite(ln)) continue;
      const und = String(r.sub ?? "").includes(" U ");
      const pm = und ? 100 - Number(r.pModel) : Number(r.pModel);
      const im = und ? 100 - Number(r.implied) : Number(r.implied);
      const a = invert(ln, pm / 100), b = invert(ln, im / 100);
      if (a != null && b != null) { lamModel.push(a); lamMkt.push(b); }
    }

    const st = [
      ["1. shBlendN out  (raw blended H+R+RBI per game)", cap.blendOut],
      ["2. shShrink out  (after EB pull, k=10)", cap.shrunk],
      ["3. lambda model  (after x coors x power)", lamModel],
      ["   lambda MARKET (the reference)", lamMkt],
    ] as const;

    // eslint-disable-next-line no-console
    console.log(
      `\nH+R+RBI LAMBDA BUILD — where does the spread go?  (armed fixture slate)\n` +
        `${"stage".padEnd(48)}${"n".padStart(5)}${"p25".padStart(8)}${"median".padStart(9)}` +
        `${"p75".padStart(8)}${"IQR".padStart(8)}${"p10-90".padStart(9)}${"IQR/mkt".padStart(9)}\n` +
        st
          .map(([lbl, xs]) =>
            xs.length < 4
              ? `${lbl.padEnd(48)}${String(xs.length).padStart(5)}   (too few to quantile)`
              : `${lbl.padEnd(48)}${String(xs.length).padStart(5)}${q(xs as number[], 0.25).toFixed(3).padStart(8)}` +
                `${q(xs as number[], 0.5).toFixed(3).padStart(9)}${q(xs as number[], 0.75).toFixed(3).padStart(8)}` +
                `${iqr(xs as number[]).toFixed(3).padStart(8)}${p1090(xs as number[]).toFixed(3).padStart(9)}` +
                `${(lamMkt.length >= 4 ? (iqr(xs as number[]) / iqr(lamMkt)).toFixed(2) : "—").padStart(9)}`,
          )
          .join("\n"),
    );

    const ratio = (a: number[], b: number[]) => (iqr(b) ? iqr(a) / iqr(b) : null);
    const s12 = ratio(cap.shrunk, cap.blendOut);
    const s23 = lamModel.length >= 4 && cap.shrunk.length >= 4 ? ratio(lamModel, cap.shrunk) : null;
    // eslint-disable-next-line no-console
    console.log(
      `\nSTAGE-BY-STAGE IQR RETENTION (1.00 = the stage preserves the spread it was handed)\n` +
        `  stage 1 -> 2  (EB pull, k=10)          ${s12 != null ? s12.toFixed(3) : "—"}\n` +
        `  stage 2 -> 3  (x coors x power)        ${s23 != null ? s23.toFixed(3) : "—"}\n` +
        `  power clamp [0.85, 1.18] seen ${cap.powers.length} times: ` +
        `p25 ${cap.powers.length >= 4 ? q(cap.powers, 0.25).toFixed(3) : "—"}` +
        `  median ${cap.powers.length >= 4 ? q(cap.powers, 0.5).toFixed(3) : "—"}` +
        `  p75 ${cap.powers.length >= 4 ? q(cap.powers, 0.75).toFixed(3) : "—"}` +
        `  IQR ${cap.powers.length >= 4 ? iqr(cap.powers).toFixed(3) : "—"}`,
    );

    expect(cap.blendOut.length).toBeGreaterThan(3);
    expect(cap.shrunk.length).toBeGreaterThan(3);

    const snap = {
      nBlend: cap.blendOut.length, nShrunk: cap.shrunk.length, nLam: lamModel.length,
      iqrBlend: +iqr(cap.blendOut).toFixed(4), iqrShrunk: +iqr(cap.shrunk).toFixed(4),
      iqrLamModel: lamModel.length >= 4 ? +iqr(lamModel).toFixed(4) : null,
      iqrLamMkt: lamMkt.length >= 4 ? +iqr(lamMkt).toFixed(4) : null,
      stage12: s12 != null ? +s12.toFixed(4) : null,
      stage23: s23 != null ? +s23.toFixed(4) : null,
    };
    if (!fs.existsSync(SNAP)) fs.writeFileSync(SNAP, JSON.stringify(snap, null, 2) + "\n");
    expect(snap).toEqual(JSON.parse(fs.readFileSync(SNAP, "utf8")));
  }, 300_000);
});
