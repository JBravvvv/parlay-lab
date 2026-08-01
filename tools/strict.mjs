/**
 * STRICT PARSING FOR TOOL INPUTS (2026-08-01, owner's item 3).
 *
 * THE CLASS, on its fourth instance in three days. Four tools have now returned plausible numbers
 * on real data: `burn-report`'s map-versus-array, the extractor's suffix, `board-report`'s null
 * envelope, and `price-path`'s `Number(null)`. The last one is the purest form and the reason this
 * file exists:
 *
 *     Number(null)            === 0
 *     Number.isFinite(0)      === true
 *     Number("")              === 0
 *     Number(undefined)       === NaN     (this one, and only this one, is caught by isFinite)
 *
 * So `Number.isFinite(Number(x))` — which reads like a validity check and is used as one all over
 * this repo's tools — **admits `null` and `""` as the number zero**. Every place a measured
 * quantity can legitimately be absent, that turns "we do not know" into "it is zero", and zero is
 * a number that prints, aggregates, and looks like a finding.
 *
 * `finite-prices.test.ts` already encodes this rule for ENGINE output. These helpers apply the
 * same rule to TOOL INPUT, which is where it was missing.
 *
 * USE `num` when absence is legitimate and must stay distinguishable from zero.
 * USE `req` when absence means the input is not what the tool was pointed at — it throws.
 */

/** A number, or null. NEVER coerces null/undefined/""/booleans/objects into 0. */
export function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** A number, or throw with the field named. For inputs whose absence invalidates the reading. */
export function req(v, what) {
  const n = num(v);
  if (n === null) throw new Error(`${what} is ${JSON.stringify(v)} — expected a finite number. Refusing to compute: absent is not zero.`);
  return n;
}

/**
 * A number parsed from a STRING source (HTTP headers, CLI args), or null. Distinct from `num`
 * because here the input is legitimately a string — but `null`, `""` and whitespace must still
 * not become 0. This is the exact shape that made `quota.mjs`'s absent-header guard unreachable.
 */
export function numFromText(v) {
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
