/* Engine v2 market layer — de-vig methods + sharp-weighted consensus.
   Pure functions, no fetch, no DOM. Unit-tested in tests/engine2-devig.test.ts.

   Why not proportional? Books shade longshots (favorite-longshot bias), so
   dividing by the booksum overstates longshot win chances. The power and Shin
   methods correct that; Shin explicitly models the insider/square money share. */

export const impliedFromAmerican = (a: number): number =>
  a > 0 ? 100 / (a + 100) : Math.abs(a) / (Math.abs(a) + 100);
export const decFromAmerican = (a: number): number => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
export const americanFromProb = (p: number): number => {
  const dec = 1 / p;
  return dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
};

/** proportional (multiplicative) — the naive baseline */
export function devigProportional(imps: number[]): number[] {
  const s = imps.reduce((a, b) => a + b, 0);
  return imps.map((p) => p / s);
}

/** power method: find λ ≥ 1 with Σ p_i^λ = 1; fair q_i = p_i^λ.
    λ > 1 shrinks small probabilities harder — longshot-bias correction. */
export function devigPower(imps: number[]): number[] {
  const f = (lam: number) => imps.reduce((a, p) => a + Math.pow(p, lam), 0) - 1;
  let lo = 1, hi = 1;
  while (f(hi) > 0 && hi < 100) hi *= 2; // booksum>1 ⇒ f(1)>0; raise λ until sum<1
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  const lam = (lo + hi) / 2;
  return imps.map((p) => Math.pow(p, lam));
}

/** Shin (1992/93): insiders with true knowledge force the book to shade.
    Solve z ∈ [0,1) so the fair probs sum to 1:
    q_i = (sqrt(z² + 4(1−z)·p_i²/S) − z) / (2(1−z)), S = Σp_i. */
export function devigShin(imps: number[]): number[] {
  const S = imps.reduce((a, b) => a + b, 0);
  const q = (z: number) =>
    imps.map((p) => (Math.sqrt(z * z + (4 * (1 - z) * p * p) / S) - z) / (2 * (1 - z)));
  const g = (z: number) => q(z).reduce((a, b) => a + b, 0) - 1;
  // g(0) = S ... wait: at z=0, q_i = p_i/S? sqrt(4 p²/S)/2 = p/√S — so g(0)=√S−1 ≥ 0; g→ decreasing in z
  let lo = 0, hi = 0.999;
  if (g(lo) <= 0) return devigProportional(imps); // no overround — nothing to strip
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (g(mid) > 0) lo = mid;
    else hi = mid;
  }
  return q((lo + hi) / 2);
}

export type DevigMethod = "proportional" | "power" | "shin";
export function devig(imps: number[], method: DevigMethod): number[] {
  if (imps.some((p) => !(p > 0 && p < 1))) throw new Error("implied probs must be in (0,1)");
  if (method === "power") return devigPower(imps);
  if (method === "shin") return devigShin(imps);
  return devigProportional(imps);
}

/* ---------- sharp-weighted consensus ---------- */
/** Pinnacle is the classic sharp anchor; exchanges (Betfair/Matchbook) carry
    near-vig-free two-way flow. Everything else is retail. */
export const BOOK_WEIGHT: Record<string, number> = {
  pinnacle: 3,
  betfair_ex_eu: 2,
  matchbook: 2,
  betonlineag: 1.5, // sharp-adjacent US-facing
};
export const bookWeight = (key: string): number => BOOK_WEIGHT[key] ?? 1;

/** weighted median — robust to one book's stale/outlier number */
export function weightedMedian(values: number[], weights: number[]): number {
  const rows = values.map((v, i) => [v, weights[i]] as const).sort((a, b) => a[0] - b[0]);
  const half = rows.reduce((a, [, w]) => a + w, 0) / 2;
  let acc = 0;
  for (const [v, w] of rows) {
    acc += w;
    if (acc >= half) return v;
  }
  return rows[rows.length - 1][0];
}

/** consensus fair prob for outcome A of a two-way market across books:
    Shin-devig each book, then sharp-weighted median. */
export function consensusProb(
  books: { key: string; a: number; b: number }[],
  method: DevigMethod = "shin",
): { p: number; n: number } | null {
  const ps: number[] = [];
  const ws: number[] = [];
  for (const bk of books) {
    const ia = impliedFromAmerican(bk.a);
    const ib = impliedFromAmerican(bk.b);
    if (!(ia > 0 && ia < 1 && ib > 0 && ib < 1)) continue;
    ps.push(devig([ia, ib], method)[0]);
    ws.push(bookWeight(bk.key));
  }
  if (!ps.length) return null;
  return { p: weightedMedian(ps, ws), n: ps.length };
}
