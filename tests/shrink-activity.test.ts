import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FROZEN_NOW, armedFixtureEngine } from "./helpers/fixture-env";
import type { Engine } from "@/engine";

/**
 * SHRINKAGE-WEIGHT AUDIT — the fourth drift check (2026-07-26).
 *
 * WHY THIS EXISTS
 * ---------------
 * `pitcher_outs` defect 3: `shShrink(ipg, nOut, 4, Lipg)` with `nOut ≈ 4` starts puts
 * **exactly 0.5** weight on the pitcher's own workload. Every starter is priced half
 * himself, half league average, and the estimator collapses into 4.67–6.17 IP when the
 * market wants 6.2–6.5 for deep starters. See docs/pitcher-outs-audit.md §8.
 *
 * `k` was never justified anywhere in the repo. It is the sixth entry in the
 * undocumented-constant class after `simN`/`simNHR`, the `1.06` one-sided haircut,
 * `regions=us` for props, the ump `g >= 5` guard, and `GAP_BUCKET_MIN_N`.
 *
 * WHAT IT MEASURES
 * ----------------
 * Per `shShrink` call site: the `k`, the distribution of `n` actually seen, and the
 * resulting own-sample weight `n/(n+k)`. A site whose typical own-sample weight is below
 * ~0.6 is shrinking harder than half-way and is flagged.
 *
 * `shShrink` returns the raw rate unchanged when `prior == null` — those calls are counted
 * separately as INERT rather than folded into the weight distribution, because an inert
 * call has no weight at all and averaging it in would understate the shrinkage.
 *
 * DENOMINATOR: the armed FIXTURE slate (real captured MLB data, 2026-07-09). A regression
 * instrument, per tests/armed-baseline.test.ts — it answers "did the shrinkage move", not
 * "what is production's n today". The `pitcher_outs` site's k=4/n≈4 was independently
 * confirmed on the real 2026-07-26 board via the `case` strings (tools/outs_audit.py).
 */

const WEIGHT_FLAG = 0.6;
const SNAP = path.join(__dirname, "fixtures", "shrink-activity-v1.json");

type Site = { k: number; ns: number[]; inert: number; n: number };

function scriptOffset(): number {
  const html = fs.readFileSync(path.join(__dirname, "..", "legacy", "index.html"), "utf8");
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const biggest = blocks.slice().sort((a, b) => b[1].length - a[1].length)[0];
  return html.slice(0, biggest.index as number).split("\n").length - 1;
}

function med(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

function instrument(eng: Engine) {
  const sites = new Map<string, Site>();
  const orig = eng.get<(r: number, n: number, k: number, p: number) => number>("shShrink");
  const off = scriptOffset();
  eng.set("shShrink", function (rate: number, n: number, k: number, prior: number) {
    const st = (new Error().stack || "").split("\n");
    let line = "?";
    for (let i = 1; i < st.length; i++) {
      const m = st[i].match(/<anonymous>:(\d+):\d+\)?\s*$/);
      if (m) { line = String(Number(m[1]) + off); break; }
    }
    let s = sites.get(line);
    if (!s) { s = { k, ns: [], inert: 0, n: 0 }; sites.set(line, s); }
    s.n++;
    // shShrink returns `rate` untouched when prior == null or n is not finite/positive
    if (prior == null || !isFinite(n) || n <= 0) s.inert++;
    else s.ns.push(n);
    return orig(rate, n, k, prior);
  });
  return sites;
}

describe("shrinkage weights — k must be justified against the n actually available", () => {
  it("audits every shShrink call site and flags over-shrinking ones", async () => {
    vi.setSystemTime(FROZEN_NOW);
    const eng = armedFixtureEngine();
    const sites = instrument(eng);
    const slate = await eng.collectSlate();
    eng.analyze(slate);

    const rows = [...sites.entries()]
      .map(([line, s]) => {
        const nMed = s.ns.length ? med(s.ns) : null;
        return {
          line, k: s.k, calls: s.n, live: s.ns.length, inert: s.inert,
          nMed, nMin: s.ns.length ? Math.min(...s.ns) : null,
          nMax: s.ns.length ? Math.max(...s.ns) : null,
          w: nMed != null ? nMed / (nMed + s.k) : null,
        };
      })
      .sort((a, b) => (a.w ?? 9) - (b.w ?? 9));

    const html = fs.readFileSync(path.join(__dirname, "..", "legacy", "index.html"), "utf8").split("\n");
    const staticLines = html
      .map((l, i) => (l.includes("shShrink(") && !l.includes("function shShrink(") ? String(i + 1) : null))
      .filter((x): x is string => x != null);
    const fired = new Set(rows.map((r) => r.line));

    // eslint-disable-next-line no-console
    console.log(
      `\nSHRINKAGE ACTIVITY — armed fixture slate, ${rows.length} of ${staticLines.length} static sites executed\n` +
        rows
          .map(
            (r) =>
              `L${r.line.padEnd(5)} k=${String(r.k).padStart(4)}  calls ${String(r.calls).padStart(5)}` +
              `  inert ${String(r.inert).padStart(5)}` +
              `  n med ${String(r.nMed ?? "—").padStart(5)} [${r.nMin ?? "—"}, ${r.nMax ?? "—"}]` +
              `  own-sample weight ${r.w != null ? r.w.toFixed(3) : "  —  "}` +
              (r.w != null && r.w < WEIGHT_FLAG ? "   <-- OVER-SHRUNK" : ""),
          )
          .join("\n") +
        `\n\nnever executed: ${staticLines.filter((l) => !fired.has(l)).map((l) => "L" + l).join(", ") || "none"}\n`,
    );

    expect(rows.length).toBeGreaterThan(3);
    expect(rows.every((r) => r.line !== "?")).toBe(true);

    const snap = rows.map((r) => ({ line: r.line, k: r.k, nMed: r.nMed, w: r.w == null ? null : Math.round(1000 * r.w) / 1000 }));
    if (!fs.existsSync(SNAP)) fs.writeFileSync(SNAP, JSON.stringify(snap, null, 2) + "\n");
    const want = JSON.parse(fs.readFileSync(SNAP, "utf8")) as typeof snap;
    const by = new Map(snap.map((s) => [s.line, s]));
    for (const w of want) {
      const g = by.get(w.line);
      expect(g, `shShrink site L${w.line} disappeared`).toBeTruthy();
      // k is a FROZEN parameter: it moving is a drift finding, not a test to update casually
      expect({ line: w.line, k: g!.k }, `shShrink k changed at legacy/index.html:${w.line}`)
        .toEqual({ line: w.line, k: w.k });
      expect({ line: w.line, w: g!.w }, `own-sample weight moved at legacy/index.html:${w.line}`)
        .toEqual({ line: w.line, w: w.w });
    }
  }, 300_000);
});
