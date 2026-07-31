import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractServed, verify } from "../tools/verify-served-engine.mjs";

/**
 * SERVED-EXTRACTOR INVARIANT (2026-07-31, owner's item 1).
 *
 * The extractor is the chain's only eye on production, and on 2026-07-31 the ad-hoc
 * version reported a FALSE MISMATCH on a correct ship: anchored on "the longest
 * single-quoted literal", it was derailed by an escaped apostrophe (`"Pitcher K\'s"`)
 * appearing earlier in the chunk, resumed 2,829 chars inside the engine, and returned a
 * SUFFIX of the true string — a plausible-looking 278,267 against the true 281,096.
 *
 * A false mismatch is the worst failure available here: it burns the 24h resolution
 * clock and invites the rollback of correct code. This pins the fix:
 *   1. the double anchor locates the literal without scanning for quotes;
 *   2. a synthetic chunk carrying the exact apostrophe hazard is extracted correctly;
 *   3. the SUFFIX SIGNATURE is asserted by name — a proper-substring result is reported
 *      as an EXTRACTION DEFECT, never as a served/repo divergence.
 *
 * OBSERVED RED 2026-07-31: the old "longest single-quoted literal" anchor, run against
 * the same synthetic chunk, returns a proper substring (assertion 2 below fails on it).
 */

const FACADE = ")(r,'";

/** The defective anchor, kept ONLY so its failure stays demonstrable. */
function longestLiteralAnchor(chunk: string): string {
  let best = "", i = 0;
  while (i < chunk.length) {
    if (chunk[i] === "'") {
      let j = i + 1;
      while (j < chunk.length) {
        if (chunk[j] === "\\") { j += 2; continue; }
        if (chunk[j] === "'") break;
        j++;
      }
      if (j < chunk.length && j - i - 1 > best.length) best = chunk.slice(i + 1, j);
      i = j + 1;
    } else i++;
  }
  return new Function("return '" + best + "'")();
}

/** A chunk carrying the exact hazard: an escaped apostrophe BEFORE the engine literal. */
function syntheticChunk(engine: string): string {
  const esc = (t: string) =>
    t.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "\\r");
  /* THE PARITY IS THE HAZARD, measured from the real chunk 2026-07-31: apostrophes at
     offsets 4045, 5373, 6205 — an ODD count before the engine literal — so the engine's
     OWN opening quote at 6210 CLOSED the last pseudo-literal and the scan resumed INSIDE
     the engine, where the next quote it saw was the engine's escaped `Pitcher K\'s`. This
     synthetic reproduces that parity exactly: THREE UNESCAPED apostrophes precede the
     facade. Unescaped matters — an apostrophe that is escaped INSIDE an already-open
     pseudo-literal is skipped by the inner loop and does not shift the parity; the
     outer scan, by contrast, is backslash-blind, which is what lets an ESCAPED
     apostrophe inside the engine open the winning (suffix) literal. */
  return (
    `/* don't */ var LABELS={mkt:"Pitcher K's O/U"};\n` +
    `var r={};(function(){ /* shim */ }\n};')(r,'${esc(engine)}');\n`
  );
}

describe("served-engine extractor", () => {
  const engine = readFileSync(process.env.PL_GEN_PATH || "src/engine/legacy-src.gen.ts", "utf8").match(
    /export const LEGACY_SRC: string =\s*([\s\S]*);\s*$/,
  )!;
  const repo = JSON.parse(engine[1].trim()) as string;

  it("extracts the engine byte-exactly from a chunk containing the apostrophe hazard", () => {
    const got = extractServed(syntheticChunk(repo));
    expect(got.length, "extracted length differs from the repo string").toBe(repo.length);
    expect(got, "extraction is not byte-exact").toBe(repo);
  });

  it("PLANT: the OLD anchor returns a proper SUBSTRING on the same chunk (the 07-31 defect)", () => {
    const old = longestLiteralAnchor(syntheticChunk(repo));
    expect(old, "the old anchor no longer reproduces the defect — re-derive this demonstration").not.toBe(repo);
    expect(repo.includes(old), "the old anchor's output should be a proper substring — the suffix signature").toBe(true);
    expect(old.length, "the old anchor should return a SHORTER string").toBeLessThan(repo.length);
  });

  it("the suffix signature is reported as an EXTRACTION DEFECT, never as a mismatch", () => {
    const suffix = repo.slice(2829);
    const r = verify(suffix, repo);
    expect(r.match).toBe(false);
    expect(r.properSubstring, "a proper substring must be flagged as such").toBe(true);
    expect(r.offset).toBe(2829);
    // and a genuine divergence is NOT mistaken for the defect
    const divergent = repo.slice(0, -1) + "X";
    const d = verify(divergent, repo);
    expect(d.match).toBe(false);
    expect(d.properSubstring, "a real divergence must not be labelled an extraction defect").toBe(false);
  });

  it("both anchors are required, and disagreement refuses to guess", () => {
    expect(() => extractServed("no anchors here")).toThrow(/ANCHOR-1 MISSING/);
    const headOnly = "\\n/* ===== config ===== */ but no facade call";
    expect(() => extractServed(headOnly)).toThrow(/ANCHOR-1 MISSING/);
    const facadeOnly = `${FACADE}not the engine');`;
    expect(() => extractServed(facadeOnly)).toThrow(/ANCHOR-2 MISSING/);
  });
});
