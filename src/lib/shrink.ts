/**
 * MARKET SHRINK (INSTRUCTION 18, 2026-09-03, Josh's word, verbatim: "change everything
 * that you think is necessary to optimize this engine/website and get it on track to
 * start making theoretical money").
 *
 * THE DIAGNOSIS (19 paper days 2026-08-15..09-02, 129 core tickets): the model said 56.0
 * wins and 46 landed. The calibration store shows the more edge the model claims the
 * worse it hits (HRR edge 5-10 bucket: predicted .634, actual .571; edge 10-20:
 * predicted .671, actual .443). Leg-level H+R+RBI overs hit 54% against 61% market-
 * implied. The model is over-confident in exactly the direction that sizes stakes up.
 *
 * THE FIX, mechanically: every leg's probability is blended toward the de-vigged
 * consensus implied probability the engine already carries on the leg (`imp`):
 *   legP' = w · leg.prob + (1 − w) · leg.imp      (imp finite and > 0; else untouched)
 * The TICKET probability is scaled by ∏legP' / ∏legP, which preserves the engine's own
 * same-game simJoint adjustment (the ratio of naive products is applied to the joint
 * number, so a sim-confirmed correlation survives the shrink intact). czEv / bsEv / ev
 * are recomputed from the shrunk probability at the ticket's own prices. The original
 * numbers ride along as probRaw / czEvRaw / bsEvRaw / evRaw so the pre-shrink record
 * stays recoverable on every ticket the ledger stores.
 *
 * PURE: the pool object is never mutated — a new pl with new legs is returned.
 */

export type ShrinkLeg = { prob?: number | null; imp?: number | null; [k: string]: unknown };
export type ShrinkPl = {
  prob?: number | null;
  czDec?: number | null;
  bsDec?: number | null;
  dec?: number | null;
  czEv?: number | null;
  bsEv?: number | null;
  ev?: number | null;
  legs: ShrinkLeg[];
  [k: string]: unknown;
};
export type ShrunkPl<T extends ShrinkPl> = T & {
  probRaw: number | null;
  czEvRaw: number | null;
  bsEvRaw: number | null;
  evRaw?: number | null;
  shrinkW: number;
};

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** EV in percent at a decimal price for a probability in percent; null when either is absent. */
export function evAt(probPct: number | null, dec: number | null): number | null {
  if (probPct == null || dec == null || !(dec > 0)) return null;
  return r1(((probPct / 100) * dec - 1) * 100);
}

export function shrinkTicket<T extends ShrinkPl>(pl: T, w: number): ShrunkPl<T> {
  const wc = Math.max(0, Math.min(1, Number(w)));
  let prodRaw = 1;
  let prodNew = 1;
  const legs = (pl.legs ?? []).map((l) => {
    const p = num(l.prob);
    const imp = num(l.imp);
    if (p == null) return { ...l };
    const p2 = imp != null && imp > 0 ? wc * p + (1 - wc) * imp : p;
    prodRaw *= p / 100;
    prodNew *= p2 / 100;
    return { ...l, prob: r2(p2), probRaw: p };
  });
  const probRaw = num(pl.prob);
  const ratio = prodRaw > 0 ? prodNew / prodRaw : 1;
  const prob = probRaw == null ? null : r2(Math.max(0, Math.min(100, probRaw * ratio)));
  const czDec = num(pl.czDec);
  const bsDec = num(pl.bsDec);
  const dec = num(pl.dec);
  const out = {
    ...pl,
    legs,
    prob,
    probRaw,
    czEv: czDec != null ? evAt(prob, czDec) : (pl.czEv ?? null),
    bsEv: bsDec != null ? evAt(prob, bsDec) : (pl.bsEv ?? null),
    czEvRaw: num(pl.czEv),
    bsEvRaw: num(pl.bsEv),
    shrinkW: wc,
    ...(dec != null ? { ev: evAt(prob, dec), evRaw: num(pl.ev) } : {}),
  };
  return out as ShrunkPl<T>;
}
