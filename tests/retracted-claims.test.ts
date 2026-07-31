import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * A RETRACTED CLAIM MAY NOT BE ASSERTED ANYWHERE ELSE UNMARKED (2026-07-31, owner's item 3).
 *
 * THE GAP, and the owner named it before I found it. `tests/retraction-markers.test.ts` enforces
 * that a paragraph BEARING a retraction marker carries a date. It is keyed on the marker. So it
 * is structurally blind to the failure that matters here: a doc that asserts the withdrawn claim
 * **with no marker at all** is invisible to it — there is nothing for the scanner to catch.
 *
 * This is the same blindness `tests/fixture-citation.test.ts` already documented in its own
 * header — *"a guard keyed on the qualifier is blind precisely where the qualifier is absent"* —
 * and it takes the same remedy: **a registry of the CLAIMS themselves**. Each entry is a literal
 * string that only appears when that retracted claim is being asserted. Any docs line containing
 * it must carry a retraction marker within a small window, or name the claim as the subject of a
 * correction.
 *
 * FOUND ON ENCODING DAY (2026-07-31), by sweep:
 *   1. `collection-period.md` L8451 — "GitHub delivers each cron more than once in its batch
 *      windows", asserted as the EXPLANATION for more snapshots than crons, undated and
 *      unstruck, directly above that day's addendum. Withdrawn when ten declared turned out to
 *      be ten delivered, one-for-one.
 *   2. `board-open-experiment.md` L116 — "confirms the 6-per-event model used in every
 *      attribution here", where BOTH 6.0 and 5.845 are refuted by `residual >= 0` (the binding
 *      window bounds c <= 5.114). A refuted constant cited as a confirmation.
 *
 * ITS LIMIT, STATED RATHER THAN ASSUMED AWAY: it only covers claims someone has entered here.
 * A newly retracted claim is unguarded until it is registered. The registry is the written rule;
 * this file is the part a machine can hold.
 */

const DOCS = path.join(__dirname, "..", "docs");
const WINDOW = 4; // lines either side — a marker one line up still governs the assertion

/** Any ONE of these near the assertion makes it a citation-of-a-retraction rather than a claim. */
/* Case-insensitive on the core vocabulary: the handoff's own stale-flag list writes them in
   lower case ("→ **withdrawn**", "→ **both refuted**") and those are genuine markers. */
const MARKERS = [
  /retracted/i,
  /withdrawn/i,
  /refuted/i,
  /superseded/i,
  /correction/i,
  /corrected/i,
  /\bstruck\b/i,
  /no longer holds/i,
  /an earlier version/i,
  /~~/, // markdown strikethrough
];

/**
 * Claims that have been retracted, withdrawn, or refuted. The literal is chosen so it does not
 * occur except when that claim is being made.
 *
 * ADD AN ENTRY the moment a claim is retracted — in the same commit as the retraction.
 */
export const RETRACTED_CLAIMS: { claim: string; retracted: string; why: string }[] = [
  {
    claim: "delivers each cron more than once",
    retracted: "2026-07-30",
    why: "Withdrawn: the Actions run log shows TEN declared crons and TEN deliveries, one-for-one. More snapshots than crons is MIN_GAP deduping the payment, not the platform duplicating the delivery.",
  },
  {
    claim: "6-per-event model",
    retracted: "2026-07-31",
    why: "Refuted: residual >= 0 bounds a constant c at <= 5.114 from the binding window (641 spent / 123 ev / 2 lh runs). Both 6.0 and 5.845 make that window's residual negative.",
  },
  {
    claim: "weather has matched nothing",
    retracted: "2026-07-31",
    why: "Wrong: weather is hydrated live from statsapi (legacy L1218 slate, L1244 store). Only the umpire block is game-keyed off the frozen SH_CTX.games.",
  },
  {
    claim: "every archived close is whatever landed",
    retracted: "2026-07-31",
    why: "Wrong: _snapshot_kind (snapshot_props.py L152) labels `close` only when the next unstarted first pitch is within CLOSE_WINDOW_S = 95 min, on EVERY path. Measured n=7, 7/7 inside 95 min, zero postdating first pitch.",
  },
];

function docLines(): { file: string; lines: string[] }[] {
  return fs
    .readdirSync(DOCS)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ file: f, lines: fs.readFileSync(path.join(DOCS, f), "utf8").split("\n") }));
}

/** Pure: every assertion of a retracted claim that carries no marker in its window. */
export function unmarkedRetractions(
  docs: { file: string; lines: string[] }[],
  registry = RETRACTED_CLAIMS,
): { file: string; line: number; claim: string; text: string }[] {
  const out: { file: string; line: number; claim: string; text: string }[] = [];
  for (const { file, lines } of docs) {
    for (let i = 0; i < lines.length; i++) {
      for (const entry of registry) {
        if (!lines[i].toLowerCase().includes(entry.claim.toLowerCase())) continue;
        const window = lines.slice(Math.max(0, i - WINDOW), i + WINDOW + 1).join("\n");
        if (!MARKERS.some((m) => m.test(window))) {
          out.push({ file, line: i + 1, claim: entry.claim, text: lines[i].trim().slice(0, 110) });
        }
      }
    }
  }
  return out;
}

describe("the registry mechanism (both directions, on synthetics)", () => {
  const REG = [{ claim: "the moon is square", retracted: "2026-01-01", why: "it is not" }];

  it("an assertion WITH a marker in its window passes", () => {
    expect(unmarkedRetractions([{ file: "d.md", lines: ["RETRACTED 2026-01-01: the moon is square"] }], REG)).toEqual([]);
    expect(unmarkedRetractions([{ file: "d.md", lines: ["**CORRECTION**", "", "the moon is square, I wrote"] }], REG)).toEqual([]);
  });

  it("a bare assertion is caught, with its file and line", () => {
    const r = unmarkedRetractions([{ file: "d.md", lines: ["x", "and the moon is square, so", "y"] }], REG);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ file: "d.md", line: 2, claim: "the moon is square" });
  });

  it("a marker further away than the window does NOT rescue it", () => {
    const far = ["RETRACTED", "a", "b", "c", "d", "e", "the moon is square"];
    expect(unmarkedRetractions([{ file: "d.md", lines: far }], REG)).toHaveLength(1);
  });

  it("PLANT (invalid-by-value): the scanner cannot report clean on a bare assertion", () => {
    expect(unmarkedRetractions([{ file: "d.md", lines: ["the moon is square"] }], REG).length).toBeGreaterThan(0);
  });
});

describe("every registry entry is usable", () => {
  it("each carries its retraction date and the reason it fell", () => {
    for (const e of RETRACTED_CLAIMS) {
      expect(e.claim.length, "a claim literal must be specific enough not to collide").toBeGreaterThan(12);
      expect(e.retracted).toMatch(/^20\d{2}-\d{2}-\d{2}$/);
      expect(e.why.length, `${e.claim} needs the reason it was retracted`).toBeGreaterThan(40);
    }
  });
});

describe("no doc asserts a retracted claim without its marker", () => {
  it("every registered claim carries a retraction marker wherever it appears", () => {
    const bad = unmarkedRetractions(docLines());
    expect(
      bad,
      `\n\nRETRACTED CLAIMS ASSERTED WITHOUT THEIR MARKER:\n` +
        bad.map((b) => `  ${b.file}:${b.line}  "${b.claim}"  — ${b.text}`).join("\n") +
        `\n\nThe retraction exists somewhere; this line does not know about it. Strike the line ` +
        `with a dated marker, or add the marker to its window. A retraction that lives in one ` +
        `doc while the claim still stands in another is not a retraction — it is a contradiction ` +
        `with a date on one side.\n`,
    ).toEqual([]);
  });
});
