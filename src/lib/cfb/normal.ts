/**
 * THE NORMAL DISTRIBUTION FOR THE CFB MARGIN MODEL (INSTRUCTION 38, 2026-09-05).
 *
 * The CFB desk prices every side through one idea: a game's final margin is normal about an
 * expected margin with a fixed σ (CFB_MODEL.sigma — 16.5 points for FBS), and a total is
 * normal about an expected total with CFB_MODEL.sigmaTotal. Turning a posted spread into a
 * win probability, an FPI gap into a cover probability, or a de-vigged cover price back into
 * an implied margin needs Φ and Φ⁻¹ to double precision — a 1e-4 approximation would leak a
 * tenth of a point of EV into every row. Pure math, no imports, unit-tested in
 * tests/cfb-normal.test.ts (normCdf(0)=0.5, normCdf(1.96)≈0.975, normInv∘normCdf = id).
 */

const SQRT_2PI = 2.5066282746310002;

/**
 * Φ(z) — Hart (1968) rational approximation as restated by West, "Better approximations to
 * cumulative normal functions" (Wilmott 2005). Absolute error below 1e-14 across the line;
 * |z| > 37 is 0 / 1 exactly in double precision.
 */
export function normCdf(z: number): number {
  if (Number.isNaN(z)) return Number.NaN;
  const x = Math.abs(z);
  let tail: number;
  if (x > 37) {
    tail = 0;
  } else {
    const e = Math.exp((-x * x) / 2);
    if (x < 7.07106781186547) {
      let num = 3.52624965998911e-2 * x + 0.700383064443688;
      num = num * x + 6.37396220353165;
      num = num * x + 33.912866078383;
      num = num * x + 112.079291497871;
      num = num * x + 221.213596169931;
      num = num * x + 220.206867912376;
      let den = 8.83883476483184e-2 * x + 1.75566716318264;
      den = den * x + 16.064177579207;
      den = den * x + 86.7807322029461;
      den = den * x + 296.564248779674;
      den = den * x + 637.333633378831;
      den = den * x + 793.826512519948;
      den = den * x + 440.413735824752;
      tail = (e * num) / den;
    } else {
      let cf = x + 0.65;
      cf = x + 4 / cf;
      cf = x + 3 / cf;
      cf = x + 2 / cf;
      cf = x + 1 / cf;
      tail = e / cf / SQRT_2PI;
    }
  }
  return z > 0 ? 1 - tail : tail;
}

/** φ(z) — the standard normal density, used by the Newton refinement below. */
export function normPdf(z: number): number {
  return Math.exp((-z * z) / 2) / SQRT_2PI;
}

/* Acklam's rational approximation to Φ⁻¹ (relative error 1.15e-9 before refinement). */
const A = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
const B = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
const C = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
const D = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
const P_LOW = 0.02425;
const P_HIGH = 1 - P_LOW;

/**
 * Φ⁻¹(p) — Acklam's algorithm followed by one Halley step against normCdf, which takes the
 * result to full double precision. p ≤ 0 → −∞, p ≥ 1 → +∞ (the caller decides what an
 * impossible probability means; nothing here invents a finite z for it).
 */
export function normInv(p: number): number {
  if (Number.isNaN(p)) return Number.NaN;
  if (p <= 0) return Number.NEGATIVE_INFINITY;
  if (p >= 1) return Number.POSITIVE_INFINITY;
  let x: number;
  if (p < P_LOW) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) / ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1);
  } else if (p <= P_HIGH) {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q) / (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) / ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1);
  }
  /* one Halley refinement: e = Φ(x) − p; u = e / φ(x); x ← x − u / (1 + x·u/2) */
  const e = normCdf(x) - p;
  const u = e / normPdf(x);
  return x - u / (1 + (x * u) / 2);
}
