import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FROZEN_NOW, armedFixtureEngine } from "./helpers/fixture-env";
import type { Engine } from "@/engine";

/**
 * CLAMP DEGENERACY AUDIT — the factor-activity check applied to CLAMPS (2026-07-26).
 *
 * WHY THIS EXISTS
 * ---------------
 * `tools/factor_activity.py` catches an engine INPUT that has gone missing.
 * `tools/gate_activity.py` catches a THRESHOLD that can never be reached.
 * Neither can see a CLAMP that is pinned at a bound on every row.
 *
 * `shClamp(0.140/oo, 0.86, 1.12)` in the `pitcher_outs` branch was pinned at its LOW
 * bound on 35 of 35 real rows, because `0.140` is divided into `offense()` — which
 * returns TB/AB, league ~0.40. Reaching the 1.12 cap needs `oo <= 0.125` TB/AB, which no
 * major-league lineup can post. **The factor was not a factor; it was a flag** for
 * "lineup posted", worth a flat -14% on expected outs. See docs/pitcher-outs-audit.md.
 *
 * This is the SAME FAILURE CLASS as the seven identity-returning factors, and invisible
 * for the same reason: a pinned clamp emits a perfectly plausible number. A value-based
 * drift check reports clean, because no value moved.
 *
 * WHAT IT MEASURES
 * ----------------
 * Every `shClamp(v, lo, hi)` call, per CALL SITE, with the fraction of calls landing on
 * the low bound / the high bound / strictly in range. Call sites are recovered from the
 * stack trace: the engine is `eval`'d verbatim, so a frame's line number is a line of
 * `LEGACY_SRC`, which maps to `legacy/index.html` by the offset of the <script> block
 * `tools/extract-engine.mjs` extracts.
 *
 * DENOMINATOR — READ THIS BEFORE QUOTING A NUMBER
 * -----------------------------------------------
 * This runs on the ARMED FIXTURE SLATE (real captured MLB data, 2026-07-09), NOT on the
 * live board. It is a REGRESSION INSTRUMENT, per the same rule stated in
 * tests/armed-baseline.test.ts: its numbers answer "did the binding behaviour move",
 * never "what does production do today". Where a figure is quoted as production, it was
 * measured on a persisted production board instead (`tools/outs_audit.py`).
 *
 * The `of` site is the cross-check that the instrument works: it reads 100% low-pinned
 * here and was independently measured at 35/35 low-pinned on the real 2026-07-26 board.
 *
 * DRIFT ROLE
 * ----------
 * A clamp that STARTS or STOPS binding during the freeze is a behaviour change no
 * parameter table would show — every constant still reads the same. The snapshot below
 * is committed and compared, so the movement is what fails, not the level.
 */

const PIN_FLAG = 0.8; // flag a site pinned at either bound on >= 80% of calls
const SNAP = path.join(__dirname, "fixtures", "clamp-activity-v1.json");

/* Why each cold site is cold. Three of these are INERT BY DESIGN and one is a harness
   limitation — and the audit rediscovered both pins independently of gate_activity.py,
   which is the cross-check that the instrument sees what it claims to see. */
const COLD_WHY: Record<string, string> = {
  "1605": "shUmpKf live path — dead behind SH_CFG.umpKFrozen (PIN, category B)",
  "1696": "shPenQF live path — dead behind SH_CFG.penQFrozen (PIN, category B)",
  "1617": "shTempF — HARNESS LIMITATION: the fixture slate carries no g.weather.temp, so "
    + "the guard returns 1 early. Production-active. Unmeasured here, not inert.",
  "2175": "ML closed-form fallback — the `else` of the sim branch. Arming the sim makes "
    + "this clamp dead code; it fires only when a game has no sim.",
  "2402": "live-sim marginal — mid-game only; the fixture slate is entirely pregame.",
};

type Site = { lo: number; hi: number; mid: number; n: number; los: number; his: number; ex: number[] };

/** line offset from LEGACY_SRC line numbers to legacy/index.html line numbers */
function scriptOffset(): number {
  const html = fs.readFileSync(path.join(__dirname, "..", "legacy", "index.html"), "utf8");
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const biggest = blocks.slice().sort((a, b) => b[1].length - a[1].length)[0];
  /* LEGACY_SRC line 1 is the remainder of the <script> tag's OWN line (normally empty),
     so html_line = src_line + (lines before the tag). `split("\n").length` on the prefix
     counts the tag's line itself, hence the -1. Verified against three known sites:
     the `of` clamp at 2258, `power` at 2319, and the season `power` at 2055. */
  return html.slice(0, biggest.index as number).split("\n").length - 1;
}

function instrument(eng: Engine) {
  const sites = new Map<string, Site>();
  const orig = eng.get<(v: number, lo: number, hi: number) => number>("shClamp");
  const off = scriptOffset();
  eng.set("shClamp", function (v: number, lo: number, hi: number) {
    // frame 0 is this wrapper; the first frame inside the eval'd engine is the caller
    const st = (new Error().stack || "").split("\n");
    let line = "?";
    for (let i = 1; i < st.length; i++) {
      const m = st[i].match(/<anonymous>:(\d+):\d+\)?\s*$/);
      if (m) { line = String(Number(m[1]) + off); break; }
    }
    let s = sites.get(line);
    if (!s) { s = { lo, hi, mid: 0, n: 0, los: 0, his: 0, ex: [] }; sites.set(line, s); }
    s.n++;
    if (s.ex.length < 5 && isFinite(v)) s.ex.push(Math.round(v * 1000) / 1000);
    if (!isFinite(v)) return orig(v, lo, hi);
    if (v <= lo) s.los++;
    else if (v >= hi) s.his++;
    else s.mid++;
    return orig(v, lo, hi);
  });
  return sites;
}

describe("clamp degeneracy — a clamp pinned at a bound is a constant, not a signal", () => {
  it("audits every shClamp call site and flags the degenerate ones", async () => {
    vi.setSystemTime(FROZEN_NOW);
    const eng = armedFixtureEngine();
    const sites = instrument(eng);
    const slate = await eng.collectSlate();
    eng.analyze(slate);

    const rows = [...sites.entries()]
      .map(([line, s]) => ({
        line,
        bounds: `[${s.lo}, ${s.hi}]`,
        n: s.n,
        pLo: s.los / s.n,
        pHi: s.his / s.n,
        pMid: s.mid / s.n,
        sample: s.ex,
      }))
      .sort((a, b) => Math.max(b.pLo, b.pHi) - Math.max(a.pLo, a.pHi));

    /* TWO DISTINCT PATHOLOGIES, and they need different fixes:
       OFFSET     pinned at ONE bound (L2258: 100% low) -> the neutral point is wrong.
                  The factor conveys nothing; it is a flag. This is the flagged class.
       SATURATED  pinned at BOTH bounds (L1615: 37/37, only 27% in range) -> the clamp is
                  narrower than its input, discretising a continuous signal into three
                  states. Still carries information, but far less than it appears to.
       Reported together because a single "% pinned" column would merge them. */
    const flagged = rows.filter((r) => Math.max(r.pLo, r.pHi) >= PIN_FLAG);
    const table = rows.map((r) => {
      const tot = r.pLo + r.pHi;
      const cls =
        Math.max(r.pLo, r.pHi) >= PIN_FLAG ? "   <-- OFFSET, pinned at one bound"
        : tot >= 0.6 && Math.min(r.pLo, r.pHi) > 0.05 ? "   <-- saturated (both bounds)"
        : "";
      return (
        `L${r.line.padEnd(5)} ${r.bounds.padEnd(16)} n=${String(r.n).padStart(6)}  ` +
        `low ${(100 * r.pLo).toFixed(0).padStart(3)}%  high ${(100 * r.pHi).toFixed(0).padStart(3)}%  ` +
        `in ${(100 * r.pMid).toFixed(0).padStart(3)}%  pinned ${(100 * tot).toFixed(0).padStart(3)}%${cls}`
      );
    });
    /* A site that never EXECUTES is the other half of the finding: the static call sites
       are the population, and only the ones that fired can be judged degenerate. Reported
       separately so "not measured" never reads as "in range". */
    const html = fs.readFileSync(path.join(__dirname, "..", "legacy", "index.html"), "utf8").split("\n");
    const staticLines = html
      .map((l, i) => (l.includes("shClamp(") && !l.includes("function shClamp(") ? String(i + 1) : null))
      .filter((x): x is string => x != null);
    const fired = new Set(rows.map((r) => r.line));
    const cold = staticLines.filter((l) => !fired.has(l));

    // eslint-disable-next-line no-console
    console.log(
      `\nCLAMP ACTIVITY — armed fixture slate\n` +
        `${rows.length} of ${staticLines.length} static call sites executed\n` +
        table.join("\n") +
        `\n\nNEVER EXECUTED (${cold.length}) — UNJUDGED, and that is not the same as "in range":\n` +
        cold.map((l) => `  L${l}  ${COLD_WHY[l] ?? "unclassified — investigate"}`).join("\n") +
        "\n",
    );

    expect(rows.length).toBeGreaterThan(5);
    // the instrument must actually attribute calls to distinct sites, not collapse them
    expect(new Set(rows.map((r) => r.line)).size).toBe(rows.length);
    expect(rows.every((r) => r.line !== "?")).toBe(true);

    const snap = rows.map((r) => ({
      line: r.line,
      bounds: r.bounds,
      n: r.n,
      lo: Math.round(1000 * r.pLo) / 1000,
      hi: Math.round(1000 * r.pHi) / 1000,
    }));
    if (!fs.existsSync(SNAP)) {
      fs.writeFileSync(SNAP, JSON.stringify({ flagged: flagged.map((f) => f.line), sites: snap }, null, 2) + "\n");
    }
    const want = JSON.parse(fs.readFileSync(SNAP, "utf8")) as { flagged: string[]; sites: typeof snap };

    // DRIFT: a clamp that starts or stops binding is a behaviour change with no parameter
    // movement behind it. Compared per site, so the failure names the line.
    const bySite = new Map(snap.map((s) => [s.line, s]));
    for (const w of want.sites) {
      const g = bySite.get(w.line);
      expect(g, `clamp site L${w.line} disappeared from the engine`).toBeTruthy();
      expect(
        { line: w.line, lo: g!.lo, hi: g!.hi },
        `clamp binding moved at legacy/index.html:${w.line} (${w.bounds})`,
      ).toEqual({ line: w.line, lo: w.lo, hi: w.hi });
    }
    expect(flagged.map((f) => f.line).sort()).toEqual(want.flagged.slice().sort());
  }, 300_000);
});
