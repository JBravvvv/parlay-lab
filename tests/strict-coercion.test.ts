import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { num, numFromText, req } from "../tools/strict.mjs";
import { violatesIdentity } from "../tools/quota.mjs";
import { stripComments } from "./helpers/source";

/**
 * NULL IS NOT ZERO — THE TOOL-INPUT HALF OF `finite-prices` (2026-08-01, owner's item 3).
 *
 * FOURTH INSTANCE IN THREE DAYS of a tool returning a plausible number on real data, and the
 * purest one: `price-path.mjs` read `Number(r.fair)` where `fair` is legitimately null on every
 * `batter_home_runs` row. `Number(null) === 0`, `Number.isFinite(0) === true`, so 9,578 rows
 * became PERFECT ZERO-MOVEMENT observations and the pooled mean moved 1.20 -> 1.07.
 *
 * The audit that followed found TWO MORE LIVE SITES, both in tools scheduled to run that night:
 *   - `quota.mjs`: `Number(headers.get(...))` — `get()` returns null when absent, so the guard
 *     whose message reads "quota headers absent" COULD NOT FIRE for an absent header. It would
 *     have appended `remaining: 0, used: 0` — a fabricated "pool exhausted" row — to the
 *     append-only series.
 *   - `ledger-report.mjs`: `Number.isFinite(Number(e.lockedAt))` — a null `lockedAt` passed as
 *     epoch 0 and the entry read as locked ~30 million minutes BEFORE first pitch, i.e. "not
 *     late", in the very reading added to measure late locks.
 *
 * `finite-prices.test.ts` encodes this rule for ENGINE OUTPUT. This encodes it for TOOL INPUT.
 */

describe("the helpers refuse coercion (both directions)", () => {
  it("num: every value that is not a finite number is null, NOT zero", () => {
    for (const v of [null, undefined, "", " ", "0", "abc", NaN, Infinity, -Infinity, true, false, {}, []]) {
      expect(num(v), `num(${JSON.stringify(v)}) must be null`).toBeNull();
    }
    expect(num(0)).toBe(0);
    expect(num(-1.5)).toBe(-1.5);
  });

  it("PLANT (invalid-by-value): the exact expressions that caused the four instances", () => {
    // the coercions that looked like validity checks
    expect(Number(null)).toBe(0);
    expect(Number.isFinite(Number(null))).toBe(true);
    expect(Number("")).toBe(0);
    // ...and what the helper does with the same inputs
    expect(num(null)).toBeNull();
    expect(numFromText(null)).toBeNull();
    expect(numFromText("")).toBeNull();
    expect(numFromText("  ")).toBeNull();
    expect(numFromText("19958")).toBe(19958);
  });

  it("req: names the field rather than returning a number", () => {
    expect(() => req(null, "bankroll")).toThrow(/bankroll/);
    expect(() => req(null, "bankroll")).toThrow(/absent is not zero/);
    expect(req(750, "bankroll")).toBe(750);
  });
});

/**
 * THE SWEEP, AS A RATCHET. `Number(` on a field that can legitimately be absent is the shape.
 * This does not ban the token — several uses are on values already proven finite — it pins the
 * COUNT, so a new one cannot appear silently. Lower it whenever a site is converted.
 */
describe("no new raw coercion appears in the tools", () => {
  const TOOLS = ["quota.mjs", "burn-report.mjs", "ledger-report.mjs", "board-report.mjs", "price-path.mjs", "verify-served-engine.mjs"];
  const dir = path.join(__dirname, "..", "tools");

  it("the raw-Number() count does not rise", () => {
    const sites: string[] = [];
    for (const t of TOOLS) {
      const p = path.join(dir, t);
      if (!fs.existsSync(p)) continue;
      /* STRIP COMMENTS FIRST — and this mattered: the first version keyed on lines starting with
         `*` or `//`, which counted the very prose explaining the trap (`Number(null)` is 0 …) as
         instances of it, reporting 10 where the code has 7. A guard that cannot tell code from a
         comment about code is measuring the wrong artifact — the same lesson as instrument
         defect #6, one layer down. Newlines are preserved so line numbers stay true. */
      /* 2026-08-01: was an INLINE copy of this stripper. It is now the shared one — which also
         knows about HTML comments, a form this copy never learned. Converted here rather than
         edited in place blind: the file went red on a real plant in the same commit. */
      const src = stripComments(fs.readFileSync(p, "utf8"));
      src.split("\n").forEach((ln, i) => {
        if (/\bNumber\s*\(/.test(ln)) sites.push(`${t}:${i + 1}`);
      });
    }
    // 2026-08-01: 6 remain, all in ledger-report's amToDec/amToProb/kellyFrac, which take values
    // already null-guarded by their own callers. Converting them is the standing to-do.
    expect(
      sites.length,
      `\n\nRAW Number() SITES IN TOOLS ROSE TO ${sites.length}:\n  ${sites.join("\n  ")}\n\n` +
        `Number(null) is 0 and Number.isFinite(0) is true, so this reads like a validity check ` +
        `and is not one. Use num()/req()/numFromText() from tools/strict.mjs, or lower this ` +
        `ratchet in the same commit that proves the new site cannot receive null.\n`,
    ).toBeLessThanOrEqual(6);
  });

  it("the three tools that were fixed no longer coerce their measured inputs", () => {
    /* STRIPPED (2026-08-01). OBSERVED DEAD: with quota.mjs's `numFromText(` call MOVED INTO a
       comment — the header parse back to raw coercion, which is instrument defect #6 itself —
       this file passed 8/8. The `.not.toMatch` assertions beside it are the safe direction; the
       one PRESENCE assertion was not. */
    const q = stripComments(fs.readFileSync(path.join(dir, "quota.mjs"), "utf8"));
    expect(q, "quota must not Number() a header").not.toMatch(/Number\(\s*r\.headers\.get/);
    expect(q).toMatch(/numFromText\(/);
    const pp = fs.readFileSync(path.join(dir, "price-path.mjs"), "utf8");
    expect(pp, "price-path must not Number() a fair").not.toMatch(/Number\(\s*r\.fair/);
    const lr = fs.readFileSync(path.join(dir, "ledger-report.mjs"), "utf8");
    expect(lr, "ledger-report must not isFinite(Number(lockedAt))").not.toMatch(/Number\.isFinite\(Number\(e\.lockedAt/);
  });
});

/**
 * THE QUOTA SERIES IDENTITY (2026-08-01, owner's item 1). `remaining + used` is the plan size and
 * is constant INSIDE a period and ACROSS a reset — both sides of the 2026-08-01 boundary sum to
 * 20,000 — so it is a FABRICATION detector, not a reset detector, which is exactly the shape
 * needed: the coercion defect's output was `{remaining: 0, used: 0}`.
 *
 * AUDIT RESULT, recorded because a clean result matters as much as a finding: all 21 rows in
 * `data/quota-log.jsonl` at the time of the audit satisfy it. Zero failures, zero `remaining: 0`,
 * zero duplicate timestamps, zero non-monotone rows inside a period. The series is CLEAN and the
 * defect was PROSPECTIVE — no burn figure, runway band, or residual conclusion restates.
 */
describe("the quota series identity", () => {
  it("PLANT (invalid-by-value): the coercion defect's exact output is rejected", () => {
    expect(violatesIdentity({ remaining: 0, used: 0 })).toMatch(/fabricated/);
    expect(violatesIdentity({ remaining: null, used: null })).toMatch(/not both finite/);
    expect(violatesIdentity({ remaining: 553, used: 19000 })).toMatch(/expected 20000/);
  });

  it("holds on both sides of the real reset — so it cannot be used to DETECT one", () => {
    expect(violatesIdentity({ remaining: 553, used: 19447 })).toBeNull();
    expect(violatesIdentity({ remaining: 19958, used: 42 })).toBeNull();
  });

  it("every row already in the append-only log satisfies it", () => {
    const p = path.join(__dirname, "..", "data", "quota-log.jsonl");
    const rows = fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    expect(rows.length).toBeGreaterThan(0);
    const bad = rows.map((r, i) => ({ i: i + 1, r, why: violatesIdentity(r) })).filter((x) => x.why);
    expect(
      bad,
      `\n\nROWS FAILING remaining + used == 20000:\n` +
        bad.map((b) => `  row ${b.i} ${b.r.at}: ${b.why}`).join("\n") +
        `\n\nThe log is APPEND-ONLY: a bad row is marked in a dated addendum, never deleted, and ` +
        `every figure derived from the interval containing it restates.\n`,
    ).toEqual([]);
    const seen = new Set<string>();
    for (const r of rows) {
      expect(seen.has(r.at), `duplicate timestamp ${r.at} — print both rows before trusting either`).toBe(false);
      seen.add(r.at);
    }
  });
});
