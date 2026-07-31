import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * A FIXTURE FIGURE MAY NOT BE CITED AS A PRODUCTION MAGNITUDE (2026-07-31, owner's item 1).
 *
 * THE DEFECT, found by the owner: `tests/armed-baseline.test.ts` L32-36 says in its own header
 * "IT IS A REGRESSION INSTRUMENT, NOT A SOURCE OF PRODUCTION VALUES … Do not cite a figure from
 * this baseline as a production measurement." Two figures from exactly that fixture were then
 * carried into the frozen table's consequence list as measured magnitudes — the `umpKFrozen`
 * replay (8 of 18 rows, 16 pp) and the `penQFrozen` replay (16 of 173, 15.1 pp). The numbers are
 * fine. Their PROVENANCE was lost in transit: the block that produced them says "armed fixture",
 * and the block that cites them does not.
 *
 * WHY THE OBVIOUS ENCODING DOES NOT WORK. The natural guard — "a doc line naming a fixture must
 * carry a caveat" — cannot catch this class, because the defective citation names no fixture at
 * all. That is the whole failure mode: the qualifier is what went missing. A guard keyed on the
 * qualifier is blind precisely where the qualifier is absent.
 *
 * THE NEAREST ENFORCEABLE VERSION, and it is what this is: a REGISTRY OF THE FIGURES THEMSELVES.
 * Each entry is a literal string that only ever appears when that fixture-derived quantity is
 * being cited. Any docs line containing it must also carry a provenance token within a small
 * window. This is enforceable, it caught the two known instances when it was written, and its
 * limit is stated rather than assumed away: IT ONLY COVERS FIGURES SOMEONE HAS ENTERED HERE.
 * A new fixture figure is unguarded until it is registered, so the registry is the written rule
 * and this file is the part of it a machine can hold.
 *
 * OBSERVED RED 2026-07-31 against docs/session-handoff.md §7, which cited both replays with no
 * fixture qualifier. Green after both citations were corrected in place.
 */

const DOCS = path.join(__dirname, "..", "docs");
const WINDOW = 3; // lines either side — a caveat one line up still governs the citation

/** Provenance tokens that make a citation honest. Any ONE of these in the window is enough. */
const PROVENANCE = [
  /fixture/i,
  /fix45/i,
  /baseline-armed/i,
  /synthetic/i,
  /production measurement/i,
  /test data/i,
];

/**
 * Figures known to be fixture-derived. The literal is chosen to be unambiguous — it should not
 * occur except when that quantity is being cited.
 *
 * ADD AN ENTRY whenever a fixture produces a number that leaves its own block.
 */
export const FIXTURE_FIGURES: { figure: string; source: string; why: string }[] = [
  {
    figure: "8 of 18",
    source: "tests/fixtures/fix45 via armedFixtureEngine({pinned:false})",
    why: "the umpKFrozen replay. fix45's context sets hpUmp.g to 3/5/9/40 and supplies kFactor values by hand; production context.json has never carried a single kFactor.",
  },
  {
    figure: "16 of 173",
    source: "tests/fixtures/fix45 via armedFixtureEngine({pinned:false})",
    why: "the penQFrozen replay. fix45 alternates pen_quality.ip 9.0/40.0 to straddle the ip>=15 guard; pen_quality.json has never materialised in a commit.",
  },
  {
    figure: "15.1 pp",
    source: "tests/fixtures/fix45",
    why: "max |Δprob| from the penQFrozen replay — same fixture, same caveat.",
  },
  {
    figure: "25 of 30",
    source: "tests/clamp-activity.test.ts on one armed fixture slate",
    why: "clamp site coverage. docs/cron-jobs.md already records that every clamp and shrink number in the frozen table came from one armed fixture.",
  },
];

function docLines(): { file: string; lines: string[] }[] {
  return fs
    .readdirSync(DOCS)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ file: f, lines: fs.readFileSync(path.join(DOCS, f), "utf8").split("\n") }));
}

/** Pure: every citation of a registered figure that lacks provenance in its window. */
export function uncitedFixtureFigures(
  docs: { file: string; lines: string[] }[],
  registry = FIXTURE_FIGURES,
): { file: string; line: number; figure: string; text: string }[] {
  const out: { file: string; line: number; figure: string; text: string }[] = [];
  for (const { file, lines } of docs) {
    for (let i = 0; i < lines.length; i++) {
      for (const entry of registry) {
        /* word-boundaried: "8 of 18" must not match inside "18 of 18" */
        if (!new RegExp(`\\b${entry.figure.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lines[i])) continue;
        const window = lines.slice(Math.max(0, i - WINDOW), i + WINDOW + 1).join("\n");
        if (!PROVENANCE.some((p) => p.test(window))) {
          out.push({ file, line: i + 1, figure: entry.figure, text: lines[i].trim().slice(0, 120) });
        }
      }
    }
  }
  return out;
}

describe("the registry mechanism (both directions, on synthetics)", () => {
  const REG = [{ figure: "42 of 99", source: "s", why: "w" }];

  it("a citation WITH provenance in its window passes", () => {
    expect(uncitedFixtureFigures([{ file: "d.md", lines: ["on the armed fixture, 42 of 99 rows move"] }], REG)).toEqual([]);
    // and provenance one line above still governs
    expect(uncitedFixtureFigures([{ file: "d.md", lines: ["measured on the armed fixture:", "42 of 99 rows move"] }], REG)).toEqual([]);
  });

  it("a citation WITHOUT provenance is caught, with its file and line", () => {
    const r = uncitedFixtureFigures([{ file: "d.md", lines: ["x", "the pin moves 42 of 99 rows", "y"] }], REG);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ file: "d.md", line: 2, figure: "42 of 99" });
  });

  it("provenance further away than the window does NOT rescue it", () => {
    const far = ["armed fixture", "a", "b", "c", "d", "42 of 99 rows move"];
    expect(uncitedFixtureFigures([{ file: "d.md", lines: far }], REG)).toHaveLength(1);
  });
});

describe("every registry entry is usable", () => {
  it("each names its source and why it is fixture-derived", () => {
    for (const e of FIXTURE_FIGURES) {
      expect(e.figure.length, "a figure literal must be specific").toBeGreaterThan(4);
      expect(e.source.length, `${e.figure} needs a source`).toBeGreaterThan(10);
      expect(e.why.length, `${e.figure} needs its reason`).toBeGreaterThan(40);
    }
  });
});

describe("no doc cites a fixture figure as a production magnitude", () => {
  it("every registered figure carries its provenance wherever it appears", () => {
    const bad = uncitedFixtureFigures(docLines());
    expect(
      bad,
      `\n\nFIXTURE FIGURES CITED WITHOUT PROVENANCE:\n` +
        bad.map((b) => `  ${b.file}:${b.line}  "${b.figure}"  — ${b.text}`).join("\n") +
        `\n\nThe number may be right; its provenance is not. Add the fixture qualifier in the ` +
        `citing line (or within ${WINDOW} lines), or replace the figure with what is measurable ` +
        `in production. A fixture is not production and a projection is not a measurement.\n`,
    ).toEqual([]);
  });
});
