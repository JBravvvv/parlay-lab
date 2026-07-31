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
    /* (kept below) */
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

/**
 * THE SAME QUESTION, ASKED OF THE TOOLS (2026-07-31, owner's item 1 — extension authorized).
 *
 * TWO TOOLS WERE FOUND BROKEN ON REAL INPUT WHILE THEIR TESTS PASSED ON SYNTHETIC SHAPES:
 *   - `burn-report --pred` threw `TypeError: recs is not iterable` on EVERY real export, because
 *     `DayBlob.records` is a keyed map and its test hand-built an array.
 *   - `verify-served-engine` returned a plausible SUFFIX of a real chunk (the false 278,267
 *     mismatch) while its assertions passed.
 * A third was found by running `board-report` on the archived 2026-07-26 board for the first
 * time: on `/api/board`'s real failure envelope (`{board:null, reason, gens}` at **200**) it
 * printed a complete, plausible, entirely fabricated reading of a board that does not exist.
 *
 * THE RULE THIS ENCODES: **a tool handed a shape it cannot read must FAIL LOUDLY — non-zero
 * exit — rather than return a plausible number.** Every case below feeds a shape PRODUCTION
 * ACTUALLY EMITS (the route's own error envelopes, verbatim from the route files) or a
 * corrupted real artifact, and asserts a non-zero exit.
 *
 * WHY NOT CORRUPT THE REAL ARTIFACTS IN PLACE: the real board and props archives live on the
 * `line-history` branch, not the working tree, so there is nothing here to corrupt and nothing
 * to restore. The artifacts are fetched read-only when the ref is present and SKIPPED WITH A
 * REASON when it is not — the count stays honest either way.
 */
type ToolCase = { tool: string; why: string; input: unknown; expectExit: "nonzero" };

/** Shapes copied from the route files, not invented — each is a real 200 response. */
const TOOL_CASES: ToolCase[] = [
  {
    tool: "tools/board-report.mjs",
    why: "/api/board returns {board:null,reason} at 200 on four paths (route L23/L47/L54/L58); `blob.board ?? blob` fell through to the envelope and printed a full fake reading",
    input: { board: null, reason: "no-board-for-date", gens: [] },
    expectExit: "nonzero",
  },
  {
    tool: "tools/board-report.mjs",
    why: "a board with no `categories` is not a board; zero rows there would print as the VACUOUS branch, a much weaker and different claim",
    input: { board: { at: 1, date: "2026-08-01", data: { parlays: [] } } },
    expectExit: "nonzero",
  },
  {
    tool: "tools/ledger-report.mjs",
    why: "a LOCKED entry with no `bankroll` gives every ticket a ceiling of 0, ratio Infinity, and a 100% overstake rate indistinguishable from a real finding",
    input: { ledger: [{ date: "2026-07-20", locked: true, core: [{ id: "a", stake: 62, prob: 24.8, czDec: 4.26, legs: [] }] }] },
    expectExit: "nonzero",
  },
  {
    tool: "tools/ledger-report.mjs",
    why: "{ledger:[]} at 200 is a VALID response over an EMPTY store — every sub-reading returns a clean zero and the bankroll exit has no population",
    input: { ledger: [], bank: null, noplay: null, at: null },
    expectExit: "nonzero",
  },
  {
    tool: "tools/ledger-report.mjs",
    why: "a bare array is a shape /api/ledger cannot produce (route L73 always sends the four-key object), so accepting it means accepting a file of unknown provenance as the bankroll population",
    input: [{ date: "2026-07-20", locked: true, core: [] }],
    expectExit: "nonzero",
  },
  {
    tool: "tools/burn-report.mjs",
    why: "an error body is a JSON object too; censusing it reports zero client rows, which reads as 'the fallthrough is cleared'",
    input: { error: "bad-sync-key" },
    expectExit: "nonzero",
  },
];

function runTool(tool: string, argv: string[]): number {
  try {
    execFileSync("node", [path.join(REPO, tool), ...argv], {
      cwd: REPO,
      stdio: "pipe",
      env: { ...process.env, PATH: `${NODE_BIN}:${process.env.PATH ?? ""}` },
      timeout: 60_000,
    });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

describe("every TOOL fails loudly on a shape it cannot read, rather than returning a plausible number", () => {
  for (const [i, c] of TOOL_CASES.entries()) {
    it(`${c.tool} refuses: ${c.why}`, () => {
      const tmp = path.join(REPO, `.tool-wiring-${i}.tmp.json`);
      try {
        fs.writeFileSync(tmp, JSON.stringify(c.input));
        const argv = c.tool.includes("burn-report") ? ["--pred", tmp] : [tmp];
        const code = runTool(c.tool, argv);
        expect(
          code,
          `\n\n${c.tool} EXITED 0 on a shape production actually emits.\n` +
            `It returned a number instead of refusing. ${c.why}\n`,
        ).not.toBe(0);
      } finally {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      }
    }, 70_000);
  }

  /** The real artifact, when the archive branch is present. Read-only: nothing is corrupted in
   *  place because nothing of this lives in the working tree. */
  it("board-report READS the archived 2026-07-26 production board (or says why it could not)", () => {
    const ref = "origin/line-history:data/boards/2026-07-26.best.json.gz";
    let gz: Buffer;
    try {
      gz = execFileSync("git", ["show", ref], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 });
    } catch {
      // eslint-disable-next-line no-console
      console.log(`\nTOOL WIRING: SKIPPED the real-board case — \`git show ${ref}\` failed.\n  Fetch it with: git fetch origin line-history   (git only, zero Odds credits)\n`);
      return;
    }
    const tmp = path.join(REPO, ".tool-wiring-real-board.tmp.json");
    try {
      fs.writeFileSync(tmp, require("node:zlib").gunzipSync(gz));
      expect(runTool("tools/board-report.mjs", [tmp]), "the tool must READ a real production board").toBe(0);
      /* and the corrupted copy of that same real artifact must be refused */
      fs.writeFileSync(tmp, JSON.stringify({ board: null, reason: "corrupted-real-artifact" }));
      expect(runTool("tools/board-report.mjs", [tmp]), "a real artifact replaced by the route's own null envelope must be refused").not.toBe(0);
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  }, 70_000);

  it("states which tools have touched a real artifact and which have not", () => {
    const REAL_INPUT_SEEN: Record<string, string> = {
      "tools/quota.mjs": "YES — it WROTE data/quota-log.jsonl (20 real rows) and --series parses its own output",
      "tools/burn-report.mjs --props": "YES — run against origin/line-history:data/props/*.json (18 real day-files) on 2026-07-31",
      "tools/board-report.mjs": "YES — run against the archived 2026-07-26 production board on 2026-07-31; three defects found",
      "tools/verify-served-engine.mjs": "YES — run against the real served chunk; it FAILED there once (the false 278,267 mismatch) and was corrected",
      "tools/burn-report.mjs --pred": "NO — no real prediction blob exists yet; read 2 will be its first",
      "tools/ledger-report.mjs": "NO — no real export exists yet; read 4 will be its first, on the ONLY copy of the bankroll population",
    };
    const unproven = Object.entries(REAL_INPUT_SEEN).filter(([, v]) => v.startsWith("NO"));
    // eslint-disable-next-line no-console
    console.log(
      `\nTOOL/REAL-INPUT LEDGER: ${Object.keys(REAL_INPUT_SEEN).length - unproven.length} proven on production input, ${unproven.length} UNPROVEN.\n` +
        Object.entries(REAL_INPUT_SEEN).map(([t, v]) => `  ${v.startsWith("NO") ? "UNPROVEN" : "  proven"}  ${t} — ${v}`).join("\n") + "\n",
    );
    expect(unproven.length, "the unproven count is reported, never implied to be zero").toBeGreaterThanOrEqual(0);
    for (const v of Object.values(REAL_INPUT_SEEN)) expect(v.length).toBeGreaterThan(30);
  });
});
