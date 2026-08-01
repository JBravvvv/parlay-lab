import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MODELLED_MARKETS, NAMED_CATS } from "@/lib/engine-echo";
import { stripComments } from "./helpers/source";

/**
 * MIRRORED ENGINE CONSTANTS (2026-08-01, owner's item 2 — "a copied engine constant
 * living in a tool or a test is a drift waiting to happen, and the census only covers
 * config keys").
 *
 * THE CLASS. `DAMPING` (engine-echo L39) is the answer this repo already found: it reads
 * `0.5` out of the LIVE allocator expression at module load instead of copying it, and
 * returns null — never a default — if the expression moves. `MODELLED_MARKETS` and
 * `NAMED_CATS` generalize that to the market SET. This guard applies it to every place
 * the set or a config VALUE is still mirrored by hand.
 *
 * WHY THE CENSUS DOES NOT COVER THIS: the parameter census (44 params, v2.5) enumerates
 * CONFIG KEYS — `consMinN`, `coreEvMin`, and the rest, one row each. A mirror is a
 * different object: a second copy of a key SET, or a config VALUE re-typed inside a tool
 * that never reads SH_CFG. Neither is a parameter, so neither was ever counted.
 *
 * ── MEASURED 2026-08-01, all thirteen mirrors diffed against the live engine ──────────
 * TWELVE AGREE. ONE DIFFERS, and the difference is real but inert:
 *   `src/lib/engine-client.ts` DIR_MARKETS names five of the six modelled markets and
 *   OMITS `batter_home_runs`. Waived below with its reason — but the waiver records the
 *   second half of the finding, which is that DIR_MARKETS has ZERO CONSUMERS (grep over
 *   src+tools+tests: the export is never imported) while the engine half of the feature
 *   is LIVE: L2465 reads `SH_CFG.dirPref[mkt]` inside the `dscp5` branch (dk_fd OR
 *   ev_gated — the server default) and OVERRIDES the model's chosen side, and
 *   engine-client L117 pushes `cfg.dirPref = getDirPref()` from `localStorage.pl_dirpref`
 *   at boot. So a device key nothing can set through the UI would flip sides in the
 *   disciplined modes, and `BoardEcho` carries no `dirPref` field to say it happened.
 *   M28's shape exactly (collected, never wired) with the halves reversed.
 *
 * ── OBSERVED RED 2026-08-01, on real code, before this file was accepted ─────────────
 * `tools/board-report.mjs` L107 read `const consMinN = echo?.consMinN ?? 100;`. The
 * VALUE agreed with the engine — but the fallback fires when THE ECHO IS ABSENT, and an
 * absent echo is reading 3's stop condition ("present in the response body or the push
 * did not land"). The tool would have printed a `crossed` verdict computed from a copied
 * literal on precisely the boards where it must instead refuse. Same family as
 * `Number(null) === 0` and the `{board:null}` envelope: a default that reads as a
 * measurement. Fixed to null + an UNREADABLE marker; this guard pins it.
 */

const ENGINE = readFileSync("legacy/index.html", "utf8");

/** Parse a numeric SH_CFG literal out of the live engine — never a copied default. */
function engineNum(key: string): number | null {
  const m = ENGINE.match(new RegExp(`\\b${key}:(-?[0-9]+(?:\\.[0-9]+)?)`));
  return m ? Number(m[1]) : null;
}

/**
 * Every tracked file that mirrors the engine's market set by hand. `expects` is the
 * engine set it must cover; `waiver` records a DELIBERATE scope difference with its
 * reason — a waiver is a recorded decision, not a suppression, and it names what it drops.
 */
const MIRRORS: { file: string; waiver?: { omits: string[]; why: string } }[] = [
  { file: "tools/gate_activity.py" },
  { file: "tools/ladder_drift.py" },
  { file: "tools/range_compression.py" },
  { file: "tools/selection_effect.py" },
  { file: "tools/self_consistency.py" },
  { file: "tools/snapshot_props.py" },
  {
    file: "src/lib/engine-client.ts",
    waiver: {
      omits: ["batter_home_runs"],
      why:
        "DIR_MARKETS is the per-market over/under preference list. Anytime HR is a 0.5-only " +
        "market (engine L2241 drops every other rung), so it has no meaningful under side. " +
        "The omission is deliberate. THE EXPORT HAS ZERO CONSUMERS — see the header block; " +
        "wiring it is what makes this waiver expire.",
    },
  },
  { file: "src/lib/gate-rebuild.ts" },
  { file: "src/engine2/calibration.ts" },
  { file: "src/components/ledger/ReceiptsPanel.tsx" },
  { file: "src/components/mlb/ParlaysSection.tsx" },
  { file: "src/components/stats/CalibrationPanel.tsx" },
  { file: "src/components/stats/ClvPanel.tsx" },
];

/**
 * Config VALUES re-typed inside a tool that never reads SH_CFG. Each must equal the live
 * engine literal. `note` says what the tool computes with it — a copy that only appears
 * in a display label is a smaller problem than one that drives a count, and the note is
 * where that distinction lives.
 */
const VALUE_COPIES: { file: string; key: string; literal: RegExp; note: string }[] = [
  {
    file: "tools/gate_activity.py",
    key: "coreEvMin",
    literal: /t\["czEv"\] >= (\d+)/,
    note: "drives the `coreEvMin(+2%)` fires-count, not just its label",
  },
  {
    file: "tools/gate_activity.py",
    key: "coreMaxLegs",
    literal: /len\(t\.get\("legs"\) or \[\]\) > (\d+)/,
    note: "drives the `coreMaxLegs(3)` fires-count",
  },
  {
    file: "tools/gate_activity.py",
    key: "coreMaxDec",
    literal: /t\["czDec"\] > (\d+)/,
    note: "drives the `coreMaxDec(15)` fires-count",
  },
  {
    file: "tools/gate_activity.py",
    key: "consMinN",
    literal: /ro\.get\('need', (\d+)\)/,
    note: "display fallback inside the consMinN reopen line",
  },
];

function marketsNamedIn(src: string, known: string[]): Set<string> {
  return new Set(known.filter((k) => new RegExp(`\\b${k}\\b`).test(src)));
}

describe("mirrored engine constants do not drift", () => {
  it("the DAMPING pattern generalizes: both market sets extract from LEGACY_SRC", () => {
    expect(
      MODELLED_MARKETS,
      "SH_MKT_LABEL no longer parses out of the engine source. NULL is correct behaviour — " +
        "it means we no longer know the modelled set, which must never be read as an empty " +
        "set. Re-point the extractor in src/lib/engine-echo.ts.",
    ).not.toBeNull();
    expect(NAMED_CATS, "SH_NAMED_CATS no longer parses out of the engine source").not.toBeNull();
    expect(MODELLED_MARKETS).toEqual([
      "batter_hits",
      "batter_total_bases",
      "batter_home_runs",
      "batter_hits_runs_rbis",
      "pitcher_strikeouts",
      "pitcher_outs",
    ]);
    expect(NAMED_CATS).toEqual(["ml", "rl", ...(MODELLED_MARKETS as string[])]);
  });

  it("every hand-mirrored market set still covers the engine's modelled set", () => {
    const six = MODELLED_MARKETS as string[];
    const known = NAMED_CATS as string[];
    const drifted: string[] = [];
    for (const { file, waiver } of MIRRORS) {
      const src = readFileSync(file, "utf8");
      const named = marketsNamedIn(src, known);
      const omitted = waiver?.omits ?? [];
      const missing = six.filter((k) => !named.has(k) && !omitted.includes(k));
      // a mirror naming a prop market the engine does not model is the other direction of drift
      const unknown = [...new Set(src.match(/\b(?:batter|pitcher)_[a-z_]+\b/g) ?? [])].filter(
        (t) => !known.includes(t),
      );
      if (missing.length) drifted.push(`${file}: MISSING ${missing.join(",")}`);
      if (unknown.length) drifted.push(`${file}: NAMES UNKNOWN-TO-ENGINE ${unknown.join(",")}`);
    }
    expect(
      drifted,
      `a hand-mirrored copy of the modelled market set no longer matches the engine:\n  ` +
        drifted.join("\n  ") +
        `\nEither update the mirror in the same commit as the engine change, or — better — ` +
        `import MODELLED_MARKETS from @/lib/engine-echo (TS/TSX only; the Python tools are ` +
        `covered by this guard because they cannot import it).`,
    ).toEqual([]);
  });

  it("every config VALUE re-typed in a tool still equals the live engine literal", () => {
    const bad: string[] = [];
    for (const { file, key, literal, note } of VALUE_COPIES) {
      const src = readFileSync(file, "utf8");
      const m = src.match(literal);
      const engineValue = engineNum(key);
      if (!m) {
        bad.push(`${file}: the ${key} copy no longer matches its extractor — re-point it`);
        continue;
      }
      if (engineValue === null) {
        bad.push(`${file}: ${key} no longer parses out of the engine`);
        continue;
      }
      if (Number(m[1]) !== engineValue) {
        bad.push(`${file}: ${key} copied as ${m[1]}, engine says ${engineValue} — ${note}`);
      }
    }
    expect(bad, `a copied config VALUE disagrees with the engine:\n  ${bad.join("\n  ")}`).toEqual([]);
  });

  it("no tool substitutes a copied config literal when the ECHO IS ABSENT", () => {
    // reading 3: an absent echo means the push did not land. A tool that fills the gap
    // with a literal reports a measurement it did not make.
    // STRIP COMMENTS FIRST. Observed 2026-08-01: the first version of this check fired on
    // `echo?.consMinN ?? 100` inside the comment recording that the fallback was REMOVED —
    // it flagged the tombstone. Instrument defect #6's lesson, hit a second time, in a
    // guard whose own header cites it. See tests/helpers/source.ts.
    const src = stripComments(readFileSync("tools/board-report.mjs", "utf8"));
    const offenders = [...src.matchAll(/echo\?\.\w+\s*\?\?\s*(-?[0-9.]+|"[^"]*")/g)].map((m) => m[0]);
    expect(
      offenders,
      `tools/board-report.mjs falls back to a literal when the echo is absent: ` +
        `${offenders.join(", ")}. An absent echo is a STOP, not a default — it is reading 3's ` +
        `failure condition. Return null and say UNREADABLE.`,
    ).toEqual([]);
  });

  it("PLANT (invalid-by-value): a mirror missing a market is caught", () => {
    const six = MODELLED_MARKETS as string[];
    const named = marketsNamedIn("batter_hits pitcher_outs", six);
    const missing = six.filter((k) => !named.has(k));
    expect(missing, "the mirror check passed a set missing four of six markets").toContain(
      "batter_home_runs",
    );
  });

  it("PLANT (invalid-by-value): a value copy that cannot match is caught", () => {
    expect(engineNum("coreMaxLegs")).not.toBeNull();
    expect(
      Number("999") === engineNum("coreMaxLegs"),
      "the value-copy check accepted a literal that cannot match the engine",
    ).toBe(false);
  });
});
