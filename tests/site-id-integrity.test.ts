import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * SITE-ID INTEGRITY (2026-07-31, owner's item 2 — "encode the rule; the three accidental
 * guards are not it").
 *
 * THE DEFECT THIS PINS: every instrumented clamp/shrink call site is keyed by its own
 * LINE NUMBER, passed as a literal string argument — `shClamp(v,lo,hi,"2258")`. The id
 * is therefore a claim about where the expression lives, and ANY edit that inserts a
 * line above it silently falsifies that claim: the code still runs, every price is
 * unchanged, and the census keyed to those ids quietly starts describing different
 * sites. Three guards (clamp-activity, shrink-activity, hrr-compression) happen to pin
 * ids for their own reasons and caught it BY ACCIDENT during the 2026-07-31 outs ship —
 * a comment correction at L1070 inserted four lines above the instrumented region
 * (L1591–L2402) and produced "clamp site L2258 disappeared from the engine". Accident is
 * not an invariant. This is the invariant.
 *
 * OBSERVED RED 2026-07-31 with a planted single-line insertion above the region.
 *
 * SCOPE: this checks the id↔line correspondence only. It does not and cannot check that
 * the EXPRESSION at that line is the same one the archived census measured — a
 * content-derived id would do that, and it cannot be introduced without moving the
 * engine string (the ids are arguments inside it), so it waits for a ship that has its
 * own reason to move lines. Spec: docs/collection-period.md, THE LINE-NUMBER FINDING.
 */

/* PL_ENGINE_PATH lets tests/guard-wiring.test.ts point this guard at a CORRUPTED TEMP COPY
   instead of corrupting legacy/index.html in place (2026-07-31, owner's item 3). Default is the
   real file, so normal behaviour is unchanged and the engine is never mutated. */
const ENGINE = process.env.PL_ENGINE_PATH || "legacy/index.html";
const ID_RE = /"(\d{3,4})"\)/g;

/** Every line-number id in the engine source, with the lines it actually occurs on. */
function siteIds(src: string): Map<number, number[]> {
  const out = new Map<number, number[]>();
  src.split("\n").forEach((line, idx) => {
    for (const m of line.matchAll(ID_RE)) {
      const id = Number(m[1]);
      out.set(id, [...(out.get(id) ?? []), idx + 1]);
    }
  });
  return out;
}

describe("instrumented site ids still name their own lines", () => {
  it("every line-number id occurs on the line it names", () => {
    const ids = siteIds(readFileSync(ENGINE, "utf8"));
    expect(ids.size, "no line-number ids found — the instrumentation moved or was removed").toBeGreaterThan(25);
    const drifted = [...ids.entries()]
      .filter(([id, lines]) => !lines.includes(id))
      .map(([id, lines]) => `id "${id}" now at line(s) ${lines.join(",")}`);
    expect(
      drifted,
      "INSTRUMENTED SITE IDS DRIFTED — an edit inserted or removed lines above the instrumented " +
        "region (L1591–L2402). No price changed, but every id-keyed reading (the clamp census, " +
        "shrink-activity, the 08-17 fixture-representativeness check) now refers to a different " +
        "line than the archived data does. Either restore the line count above the region, or " +
        "re-register the ids AND stamp a vintage boundary for every id-keyed series.",
    ).toEqual([]);
  });

  it("PLANT: a single inserted line above the region is detected", () => {
    const src = readFileSync(ENGINE, "utf8");
    const lines = src.split("\n");
    const first = Math.min(...siteIds(src).keys());
    lines.splice(first - 10, 0, "/* planted line */");
    const drifted = [...siteIds(lines.join("\n")).entries()].filter(([id, ls]) => !ls.includes(id));
    expect(drifted.length, "the checker is blind to a planted insertion above the region").toBeGreaterThan(0);
  });

  it("the instrumented region's bounds are pinned (a moved region is a different measurement)", () => {
    const ids = [...siteIds(readFileSync(ENGINE, "utf8")).keys()].sort((a, b) => a - b);
    expect(ids[0], "the region's first instrumented site moved").toBe(1591);
    expect(ids[ids.length - 1], "the region's last instrumented site moved").toBe(2402);
  });
});
