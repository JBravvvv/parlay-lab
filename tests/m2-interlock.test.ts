import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * M2 IS AN INTERLOCKED PAIR — the constant correction and the `offense()` de-noise ship
 * together or not at all (2026-07-27). Same treatment as M7+M9, same enforcement pattern as
 * lid-coupling.
 *
 * Why: `of = shClamp(0.140/oo, 0.86, 1.12)` is a CONSTANT 0.860 today — `oo` (lineup TB/AB)
 * never drops below ~0.30, so 0.140/oo can never reach the 0.86 floor's escape. The 0.140
 * defect welds the door shut on its own noise: a defect masking a defect. Shipping
 * 0.140→0.400 alone un-pins the clamp and injects ≈ ±11 pp of `offense()` estimator noise
 * into `pitcher_outs` (per-player TB/AB blend noise ≈ 0.096, lineup-averaged ≈ 0.032 → ±7.6%
 * of λ at λ ≈ 16.2). The paired de-noise (lineup xSLG anchor, windowed weight ≤ ~0.1 per the
 * three-market regression) brings the residual to ≈ ±1.1 pp.
 *
 * So: while the constant is 0.140, the pin holds (the defect is INTENTIONALLY unfixed under
 * the freeze — same stance as M8's pinned test). The moment the constant changes, this test
 * demands de-noise evidence inside `offense()` itself. A future session cannot ship half.
 */

const SRC = "legacy/index.html";
const OF_RE = /of=shClamp\((\d+\.\d+)\/oo,/;
const OFFENSE_RE = /function offense\(lineup\)\{[^\n]*\}/;
const DENOISE_RE = /xslg|shShrink|SH_PRIORS/;

type Verdict = { constant: string | null; paired: boolean | null };

function check(src: string): Verdict {
  const m = src.match(OF_RE);
  if (!m) return { constant: null, paired: null };
  if (m[1] === "0.140") return { constant: m[1], paired: null }; // pinned era — pair not required yet
  const body = src.match(OFFENSE_RE);
  return { constant: m[1], paired: !!(body && DENOISE_RE.test(body[0])) };
}

describe("M2 interlock — the constant and the offense() de-noise ship together", () => {
  /* the guard is tested before it is trusted (break-it-on-purpose, permanent) */
  it("the checker itself fires on a half-shipped M2 and passes the whole pair", () => {
    const pinned = "function offense(lineup){var r=shBlend(hs,f,'ab',10);}\nof=shClamp(0.140/oo,0.86,1.12,'x');";
    const half = "function offense(lineup){var r=shBlend(hs,f,'ab',10);}\nof=shClamp(0.400/oo,0.86,1.12,'x');";
    const whole = "function offense(lineup){var r=shShrink(shBlend(hs,f,'ab',10),n,75,pr.xslg);}\nof=shClamp(0.400/oo,0.86,1.12,'x');";
    expect(check(pinned)).toEqual({ constant: "0.140", paired: null });
    expect(check(half)).toEqual({ constant: "0.400", paired: false });
    expect(check(whole)).toEqual({ constant: "0.400", paired: true });
  });

  it("the engine either keeps the pinned 0.140 or ships the WHOLE pair", () => {
    const v = check(readFileSync(SRC, "utf8"));
    expect(v.constant, `the of=shClamp(<k>/oo,…) site vanished from ${SRC} — if the opp-offense factor was restructured, rewrite this guard for the new shape`).not.toBeNull();
    if (v.constant !== "0.140") {
      expect(
        v.paired,
        `M2's constant changed to ${v.constant} but offense() shows no de-noise (no xslg/shShrink/SH_PRIORS in its body). ` +
          `Shipping the constant alone injects ≈ ±11 pp of estimator noise into pitcher_outs — ` +
          `the pair ships together (docs/freeze-exit-bundle.md, M2).`,
      ).toBe(true);
    }
  });
});
