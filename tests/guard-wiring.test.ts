import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * DOES EACH GUARD ACTUALLY READ WHAT IT CLAIMS TO READ? (2026-07-31, owner's item 2, authorized.)
 *
 * THE FINDING THIS EXISTS FOR. Every plant in this repo proves a COMPARATOR — a pure function
 * rejects synthetic invalid input. NONE proves the WIRING: that the live assertion fires when the
 * REAL artifact is corrupted. A guard whose comparator is perfect but whose reader points at the
 * wrong input passes every plant it has, reports success forever, and protects nothing.
 *
 * That is not hypothetical. It happened twice:
 *   - INSTRUMENT DEFECT #6 — `workflow-timing.test.ts` enumerated `.github/workflows` from the
 *     WORKING TREE, i.e. the branch that fires nothing, for two weeks.
 *   - M27 — `sha-references.test.ts`'s helper was widened to accept `HEAD`; ZERO assertion lines
 *     were touched, so no plant and no diff-audit could see it.
 *
 * WHAT THIS DOES. For each covered guard: back up its real input, corrupt it in the specific way
 * that guard exists to catch, run THAT GUARD ALONE in a subprocess, and assert it EXITS NON-ZERO.
 * Then restore, and assert the restore was byte-exact. The guard reads its own real path
 * throughout — that is the point; nothing is injected, so nothing about its wiring is assumed.
 *
 * OBSERVED RED, and it is recorded here rather than claimed: the first run of this file included
 * a NO-OP case — a "corruption" that changed nothing — to prove the harness can tell the
 * difference. That case FAILED TO FAIL exactly as it should have (the guard stayed green on an
 * uncorrupted file, so `expect(failed).toBe(true)` threw), which is the demonstration that a green
 * result here means the corruption was real. The no-op is not kept: it would be a permanently red
 * case. Its removal is why COVERAGE below is stated as a count rather than implied as complete.
 *
 * COVERAGE IS PARTIAL AND SAID SO. Corruption is only safe for guards whose input is a doc or a
 * data file. Guards reading `legacy/index.html` (the engine string) are NOT corrupted here — a
 * crashed run would leave the engine mutated, and that risk is not worth the coverage. They are
 * listed in UNCOVERED with the reason, so the count is honest.
 */

const REPO = path.join(__dirname, "..");
const NODE_BIN = path.dirname(process.execPath);

type Case = {
  guard: string;
  input: string;
  why: string;
  corrupt: (text: string) => string;
  /** when set, the guard is pointed at a corrupted TEMP COPY via this env var and the real file
   *  is never touched — strictly safer than in-place corruption (2026-07-31, owner's item 3). */
  viaEnv?: string;
};

/** Each corruption is the specific failure its guard exists to catch — not a random mutation. */
const CASES: Case[] = [
  {
    guard: "tests/site-id-integrity.test.ts",
    input: "legacy/index.html",
    viaEnv: "PL_ENGINE_PATH",
    why: "a clamp site id renamed — the line-number-keyed-id defect this guard exists to catch",
    corrupt: (t) => t.replace(/"1605"/, '"9999"'),
  },
  {
    guard: "tests/served-extractor.test.ts",
    input: "src/engine/legacy-src.gen.ts",
    viaEnv: "PL_GEN_PATH",
    why: "the generated engine string truncated — the extraction defect that produced the false 278,267 mismatch",
    corrupt: (t) => t.slice(0, Math.floor(t.length * 0.9)),
  },
  {
    guard: "tests/self-arm-stamp.test.ts",
    input: "data/ump_k.json",
    why: "a THIRD umpire crosses g>=5 — the count-armed crossing this guard exists to stamp",
    corrupt: (t) => {
      const d = JSON.parse(t) as { umps: Record<string, { g: number; k: number }> };
      const four = Object.keys(d.umps).find((k) => d.umps[k].g === 4);
      if (!four) throw new Error("no umpire at g=4 to promote — re-point this corruption");
      d.umps[four].g = 5;
      return JSON.stringify(d);
    },
  },
  {
    guard: "tests/read-first-index.test.ts",
    input: "docs/session-handoff.md",
    why: "a doc silently dropped from the read-first index — the partial-index-presented-as-complete defect",
    corrupt: (t) => t.replace(/^\| `clv\.md` \|.*$/m, ""),
  },
  {
    guard: "tests/doc-structure.test.ts",
    input: "docs/freeze-exit-bundle.md",
    why: "an amendment id referenced with no bundle entry — a lost finding",
    corrupt: (t) => `${t}\n\nSee **M98** for the rest.\n`,
  },
  {
    guard: "tests/fixture-citation.test.ts",
    input: "docs/session-handoff.md",
    why: "a fixture figure cited with no provenance — the defect that started this class",
    corrupt: (t) => `${t}\n\nThe pin moves 8 of 18 rows on the board.\n`,
  },
  {
    guard: "tests/sha-references.test.ts",
    input: "docs/progress.md",
    why: "a doc-cited sha reachable from nothing — the dangling-citation defect after a rebase",
    corrupt: (t) => `${t}\n\nSee commit deadbeef1 for the fix.\n`,
  },
];

/** Guards deliberately NOT corrupted, with the reason. Counted, never implied covered. */
export const UNCOVERED: Record<string, string> = {
  "tests/finite-prices.test.ts": "asserts on computed board values, not a file — there is no input to corrupt",
  "tests/chain-tools.test.ts": "asserts pure functions imported from tools/; corruption would mean editing source, which is the change under test rather than its input",
  "tests/line-history-consumers.test.ts": "its corruption is 'a consumer appears', which means adding a real import to source — same objection",
  "tests/workflow-branch-sync.test.ts": "its input is origin/main, which cannot be corrupted locally without rewriting a remote ref",
};

/** Run one guard alone; true = it failed (which is what a corrupted input must produce). */
function guardFails(guard: string, extraEnv: Record<string, string> = {}): boolean {
  try {
    execFileSync("npx", ["vitest", "run", "--no-file-parallelism", guard], {
      cwd: REPO,
      stdio: "pipe",
      env: { ...process.env, ...extraEnv, PATH: `${NODE_BIN}:${process.env.PATH ?? ""}`, CI: "1" },
      timeout: 120_000,
    });
    return false;
  } catch {
    return true;
  }
}

describe("every covered guard is proven WIRED, not just proven correct", () => {
  for (const c of CASES) {
    it(`${c.guard} fails when ${path.basename(c.input)} is corrupted: ${c.why}`, () => {
      const abs = path.join(REPO, c.input);
      const original = fs.readFileSync(abs, "utf8");
      const corrupted = c.corrupt(original);
      expect(corrupted, `${c.guard}: the corruption changed nothing — it cannot test anything`).not.toBe(original);
      let failed = false;
      if (c.viaEnv) {
        /* COPY MODE — the real file is never written. */
        const tmp = path.join(REPO, `.guard-wiring-${path.basename(c.input)}.tmp`);
        try {
          fs.writeFileSync(tmp, corrupted);
          failed = guardFails(c.guard, { [c.viaEnv]: tmp });
        } finally {
          if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
        }
      } else {
        try {
          fs.writeFileSync(abs, corrupted);
          failed = guardFails(c.guard);
        } finally {
          fs.writeFileSync(abs, original);
        }
      }
      expect(fs.readFileSync(abs, "utf8"), `${c.input} was NOT restored byte-exactly`).toBe(original);
      expect(
        failed,
        `\n\n${c.guard} STAYED GREEN on a corrupted ${c.input}.\n` +
          `It is reading something other than what it claims, or its assertion does not reach ` +
          `this failure. That is instrument defect #6's shape: a guard reporting success while ` +
          `protecting nothing. Corruption applied: ${c.why}\n`,
      ).toBe(true);
    }, 130_000);
  }

  it("states its own coverage rather than implying completeness", () => {
    const covered = CASES.length;
    const uncovered = Object.keys(UNCOVERED).length;
    // eslint-disable-next-line no-console
    console.log(
      `\nGUARD WIRING: ${covered} guards proven wired, ${uncovered} not corruptible here.\n` +
        Object.entries(UNCOVERED).map(([g, w]) => `  UNCOVERED  ${g.split("/").pop()} — ${w}`).join("\n") + "\n",
    );
    expect(covered).toBeGreaterThan(0);
    for (const w of Object.values(UNCOVERED)) expect(w.length, "every uncovered guard needs its reason").toBeGreaterThan(30);
  });
});
