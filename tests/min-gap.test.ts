import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stripPyComments } from "./helpers/source";

/**
 * MIN_GAP GUARD (2026-07-29 — the owner's SOLE authorized ship of the day).
 *
 * Measured 07-28/07-29: cron clusters landed 3-minutes-apart `pre` sweeps, each paying
 * a full ~16-event sweep (~96 credits) for duplicates carrying 3–5% changed rows at
 * mean |Δfair| ≤ 0.042 pp. `close` had a MIN_GAP; `pre` had NONE. This guard pins the
 * pre-gap into `tools/snapshot_props.py`: a `pre` reading within MIN_GAP_S of ANY paid
 * snapshot is skipped (payment deduped, delivery redundancy retained — every cron entry
 * stays; the close path keeps its own gap and is never blocked by a recent pre).
 *
 * Observed RED before the script edit (the source lacked the branch), GREEN after —
 * the flip and the edit land in the same commit, per the teeth standard.
 */

describe("MIN_GAP: pre sweeps are payment-deduped in the snapshot script", () => {
  const src = readFileSync("tools/snapshot_props.py", "utf8");

  it("the pre-gap branch exists and is dated-signed", () => {
    expect(src, "the pre-gap marker is missing — MIN_GAP not applied to pre readings")
      .toContain("MIN_GAP pre-dedupe (2026-07-29, signed)");
    // the gate must sit BEFORE the `return "pre"` and reference MIN_GAP_S
    const gateIdx = src.indexOf("MIN_GAP pre-dedupe (2026-07-29, signed)");
    const preIdx = src.indexOf('return "pre"');
    expect(gateIdx, "gate must precede the pre return").toBeLessThan(preIdx);
    /* THE SLICE IS STRIPPED, THE ANCHOR IS NOT (2026-08-01). OBSERVED DEAD: with the gate
       defeated in code — `< 0` instead of `< MIN_GAP_S`, so the pre-dedupe never fires and
       every clustered cron pays a full ~96-credit sweep again — this guard passed 2/2,
       because `MIN_GAP_S` still appears in the explanatory comment at L169 INSIDE the slice.
       The anchor is deliberately a dated comment signature and stays raw; the GATE assertion
       is about code and must not be satisfiable by the prose that describes it. */
    expect(stripPyComments(src.slice(gateIdx, preIdx)), "the gate must key on MIN_GAP_S").toContain("MIN_GAP_S");
  });

  it("PLANT (invalid-by-value): the checker sees a source without the gate", () => {
    const stripped = src.replace("MIN_GAP pre-dedupe (2026-07-29, signed)", "");
    expect(stripped.includes("MIN_GAP pre-dedupe (2026-07-29, signed)")).toBe(false);
  });
});
