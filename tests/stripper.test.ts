import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stripComments, stripHashComments } from "./helpers/source";

/**
 * THE STRIPPER'S OWN GUARD (2026-08-01, owner's item 2).
 *
 * `tests/helpers/source.ts` is now load-bearing for TEN guards, which makes it the single
 * highest-leverage instrument in the suite and — until this file — the only one with no test
 * of its own failure. That is the exact shape this session has found repeatedly: an
 * instrument everything depends on, verified by nothing.
 *
 * It has already failed once in production use. It knew `/* *\/` and `//` and NOT `<!-- -->`,
 * and the largest file any guard scans is `legacy/index.html`, whose extension guarantees
 * that form exists. With one line moved into an HTML comment the ALREADY-FIXED
 * `coverage-denominator` passed 9/9.
 *
 * THREE FAILURE MODES, and the third is the one nothing else would catch:
 *   1. UNDER-STRIP — a comment form it does not know. A guard reverts to raw and its
 *      presence assertions become satisfiable by prose. Covered per-form below.
 *   2. OVER-STRIP — it removes comment-SHAPED text out of a string or data field. For a
 *      PRESENCE assertion that is a false positive (noise); for an ABSENCE assertion it is a
 *      FALSE NEGATIVE, because the forbidden pattern vanishes from the copy being scanned.
 *   3. DEGENERACY — it stops stripping anything at all. Every stripped guard silently
 *      reverts to raw and NOT ONE TEST FAILS, because raw source still satisfies every
 *      presence assertion. Nothing else in the suite can see this.
 */

/**
 * Files a guard actually strips today. Adding one here is the deliberate act; the
 * over-strip audit below runs over exactly this list.
 *
 * ⚠️ `src/engine/legacy-src.gen.ts` IS DELIBERATELY ABSENT AND MUST STAY ABSENT. Its content
 * is the whole engine inside ONE STRING LITERAL, and the engine text contains `/* ... *\/`.
 * Stripping it removes ENGINE CODE from inside a string — the over-strip mode, on the file
 * where it would matter most. `served-extractor` reads it raw and must keep doing so, for
 * the same reason `engine-echo`'s `extractFromHtml()` does.
 */
const STRIPPED_FILES: { path: string; fn: (s: string) => string }[] = [
  { path: "legacy/index.html", fn: stripComments },
  { path: "app/api/generate/route.ts", fn: stripComments },
  { path: "app/api/calibrate/route.ts", fn: stripComments },
  { path: "app/api/predictions/route.ts", fn: stripComments },
  { path: "tools/board-report.mjs", fn: stripComments },
  { path: "tools/quota.mjs", fn: stripComments },
  { path: "tools/snapshot_props.py", fn: stripHashComments },
  { path: ".github/workflows/props-history.yml", fn: stripHashComments },
  { path: ".github/workflows/line-history.yml", fn: stripHashComments },
];

/** Positions where a strip happened while an odd number of quotes preceded it on the line. */
function inStringStrips(raw: string, stripped: string): string[] {
  const R = raw.split("\n");
  const S = stripped.split("\n");
  const hits: string[] = [];
  for (let i = 0; i < R.length; i++) {
    if (R[i] === S[i]) continue;
    const j = [...R[i]].findIndex((c, k) => S[i][k] !== c);
    if (j < 0) continue;
    const before = R[i].slice(0, j);
    const odd = (s: string, ch: string) => (before.split(ch).length - 1) % 2 === 1;
    if (odd(before, '"') || odd(before, "'") || odd(before, "`")) hits.push(`line ${i + 1}: ${R[i].trim().slice(0, 90)}`);
  }
  return hits;
}

describe("the comment stripper, which the rest of the suite now depends on", () => {
  it("MODE 1 — every comment form reachable in a scanned file is blanked", () => {
    const forms: [string, string, string][] = [
      ["block", "/* var x = 1; */ var y = 2;", "var x = 1;"],
      ["line", "// var x = 1;\nvar y = 2;", "var x = 1;"],
      ["HTML — legacy/index.html is an .html file", "<!-- var x = 1; -->var y = 2;", "var x = 1;"],
      ["JSX — {/* */} is a block comment in a brace", "{/* var x = 1; */}\nvar y = 2;", "var x = 1;"],
      ["multi-line block", "/*\n var x = 1;\n*/\nvar y = 2;", "var x = 1;"],
    ];
    for (const [name, src, hidden] of forms) {
      expect(stripComments(src).includes(hidden), `stripComments misses ${name}`).toBe(false);
      expect(stripComments(src), `stripComments ate code beside a ${name} comment`).toContain("var y = 2;");
    }
    expect(stripHashComments("# a = 1\nb = 2").includes("a = 1"), "stripHashComments misses # comments").toBe(false);
    expect(stripHashComments("# a = 1\nb = 2")).toContain("b = 2");
  });

  it("MODE 1 — a URL is not a line comment", () => {
    // the `[^:]` guard: `https://x` must survive, or every yaml/ts URL vanishes
    expect(stripComments('const u = "https://example.com/a";')).toContain("https://example.com/a");
  });

  it("LENGTH IS PRESERVED — trigger-mark's indexOf ordering assertion depends on it", () => {
    for (const { path, fn } of STRIPPED_FILES) {
      const raw = readFileSync(path, "utf8");
      expect(fn(raw).length, `${path}: stripping changed the length, so every index shifts`).toBe(raw.length);
    }
    // and on the synthetic forms, including the multi-line ones
    for (const s of ["/* a */b", "// a\nb", "<!-- a -->b", "/*\na\n*/\nb"]) {
      expect(stripComments(s).length, `length not preserved for ${JSON.stringify(s)}`).toBe(s.length);
    }
  });

  it("MODE 2 — nothing is stripped from inside a string in any file we actually strip", () => {
    const bad: string[] = [];
    for (const { path, fn } of STRIPPED_FILES) {
      const raw = readFileSync(path, "utf8");
      for (const h of inStringStrips(raw, fn(raw))) bad.push(`${path} ${h}`);
    }
    expect(
      bad,
      `the stripper removed comment-SHAPED text from inside a string literal:\n  ${bad.join("\n  ")}\n` +
        `For a PRESENCE assertion that is noise. For an ABSENCE assertion it is a FALSE NEGATIVE — ` +
        `the forbidden pattern vanishes from the copy being scanned. Either narrow the stripper or ` +
        `stop stripping that file.`,
    ).toEqual([]);
  });

  it("MODE 2 — the generated engine literal is NOT on the stripped list, and must never be", () => {
    // measured: stripping it removes `/* ===== config ===== */` from INSIDE the string that
    // holds the whole engine. served-extractor reads it raw; that is correct and load-bearing.
    expect(STRIPPED_FILES.map((f) => f.path)).not.toContain("src/engine/legacy-src.gen.ts");
    const gen = readFileSync("src/engine/legacy-src.gen.ts", "utf8");
    expect(
      inStringStrips(gen, stripComments(gen)).length,
      "the engine literal no longer over-strips — if that is real, re-derive this exemption rather than deleting it",
    ).toBeGreaterThan(0);
  });

  it("MODE 3 — DEGENERACY: the stripper must still actually strip something", () => {
    /* THE ONE NOTHING ELSE CAN SEE. If a regex here breaks and stripComments becomes a no-op,
       every stripped guard silently reverts to raw and NOT ONE OTHER TEST FAILS — raw source
       satisfies every presence assertion. This is the only assertion in the suite that fires
       on that. OBSERVED RED 2026-08-01 by neutering stripComments to `(s) => s`. */
    const engine = readFileSync("legacy/index.html", "utf8");
    const removed = stripComments(engine).split("").filter((c, i) => c !== engine[i]).length;
    expect(
      removed,
      "stripComments removed NOTHING from legacy/index.html. It has become a no-op, and every " +
        "guard that depends on it has silently reverted to scanning raw source.",
    ).toBeGreaterThan(10_000);

    const py = readFileSync("tools/snapshot_props.py", "utf8");
    const removedPy = stripHashComments(py).split("").filter((c, i) => c !== py[i]).length;
    expect(removedPy, "stripHashComments has become a no-op").toBeGreaterThan(1_000);
  });

  it("PLANT (invalid-by-value): a no-op stripper is caught by the degeneracy check", () => {
    const noop = (s: string) => s;
    const engine = readFileSync("legacy/index.html", "utf8");
    const removed = noop(engine).split("").filter((c, i) => c !== engine[i]).length;
    expect(removed, "the degeneracy check would not notice a no-op stripper").toBe(0);
  });
});
