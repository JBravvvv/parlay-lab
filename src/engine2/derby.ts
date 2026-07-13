/* Engine v2 · Home Run Derby desk — pure functions, no fetch, no DOM.
   Unit-tested in tests/engine2-derby.test.ts.

   Data sources (both real, both live):
   - statsapi.mlb.com /v1/homeRunDerby/{eventId} — the official bracket, format
     (round types + swing counts), and live per-round HR counts during the event.
   - public/model/priors.json — the nightly Statcast build (barrel%, xISO/EV/
     hard-hit percentiles) that powers the hitter power model.

   The Odds API has NO Home Run Derby key (verified against the full sports
   list, all=true), so market prices arrive by paste from the book's app.
   Everything market-side runs through the same Shin de-vig as the Sharp Desk.

   2026 format (per MLB's announcement, mirrored by the statsapi round types):
   Round 1 = one 8-man pool, 20 swings each, top 4 HR totals advance (ties
   broken by longest HR — proxied here by raw power); semis re-seeded by R1
   totals 1v4/2v3 at 15 swings; final 15 swings; head-to-head ties go to
   3-swing swing-offs. A homer on the final scheduled swing extends the round
   until the first miss.

   Model honesty: this format is NEW in 2026 — there is no historical sample of
   swing-limited rounds to calibrate on. Win/advance probabilities lean on
   RELATIVE power (robust); absolute HR-total lines are the model's weakest
   output. That is why every market blend weights the de-vigged market 75/25
   over the model. Display-only: nothing here feeds parlays, the allocator, or
   ledger grading. */

import { devigShin, impliedFromAmerican, decFromAmerican } from "./devig";

/* ------------------------------------------------------------------ types */

export type DerbyRound = { round: number; type: string; swings: number };

export type DerbyHitter = {
  id: number;
  name: string;
  seed: number;
  order: number | null;
  team: string | null;
  age: number | null;
  /* power inputs surfaced for the UI (null when priors lack the player) */
  pa: number | null;
  barrelPct: number | null;
  hardhitPct: number | null;
  xslg: number | null;
  pctPower: number | null; // blended Statcast power percentile (0–100)
  thin: boolean; // <150 PA — flag the sample, don't hide it
  /* model parameters */
  powerFactor: number; // relative raw-power multiplier (≈0.6–1.45)
  hrPerSwing: number; // calibrated derby HR-per-swing rate
};

export type DerbyLiveLine = {
  round: number;
  hr: number;
  done: boolean;
  started: boolean;
  winner: boolean;
  longest: number | null; // feet, live topDerbyHitData
};

export type DerbyState = {
  id: number;
  name: string;
  venue: string;
  dateIso: string;
  state: string; // statsapi status.state: Preview / Live / Final ...
  currentRound: number;
  rounds: DerbyRound[];
  pairs: [number, number][]; // R1 presentation pairs (hitter ids) — H2H markets grade on these
  laterPairs: { round: number; ids: [number, number] }[]; // semis/final, fill in live
  hitters: DerbyHitter[];
  live: Record<number, DerbyLiveLine[]>; // hitter id → per-round live lines
};

export type SimHitterOut = {
  win: number; // P(wins the derby)
  reachFinal: number;
  advanceR1: number; // P(top-4 out of the pool)
  r1Avg: number;
  r1Hist: number[]; // index = HRs in round 1, value = count of sims
  evtAvg: number; // total HRs across all rounds hit (swing-offs excluded)
  evtHist: number[];
};

export type SimResult = {
  n: number;
  byId: Record<number, SimHitterOut>;
  pairs: { a: number; b: number; pA: number; pB: number; pTie: number }[];
  totalAvg: number; // event total HRs, all hitters all rounds
  totalHist: number[];
};

/* ------------------------------------------------- statsapi bracket parse */

type Json = Record<string, unknown>;
const asObj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Tolerant parse of statsapi /v1/homeRunDerby/{id}. Returns null only when
    the payload has no usable bracket at all. */
export function parseDerby(json: unknown): Omit<DerbyState, "hitters"> & {
  players: { id: number; name: string; seed: number; order: number | null; team: string | null; age: number | null }[];
} | null {
  const root = asObj(json);
  const info = asObj(root.info);
  const status = asObj(root.status);
  const roundsRaw = asArr(root.rounds);
  if (!roundsRaw.length) return null;

  const rounds: DerbyRound[] = roundsRaw.map((r) => {
    const o = asObj(r);
    return {
      round: Number(o.round) || 0,
      type: String(o.type ?? ""),
      swings: Number(o.numberOfSwings) || Number(o.numberOfPitches) || 15,
    };
  });

  const players: { id: number; name: string; seed: number; order: number | null; team: string | null; age: number | null }[] = [];
  const pairs: [number, number][] = [];
  const laterPairs: { round: number; ids: [number, number] }[] = [];
  const live: Record<number, DerbyLiveLine[]> = {};

  const teamAbbr = new Map<number, { team: string | null; age: number | null }>();
  for (const p of asArr(root.players)) {
    const o = asObj(p);
    const id = Number(o.id);
    if (!id) continue;
    teamAbbr.set(id, {
      team: (asObj(o.currentTeam).abbreviation as string) ?? null,
      age: Number(o.currentAge) || null,
    });
  }

  for (const r of roundsRaw) {
    const ro = asObj(r);
    const roundNum = Number(ro.round) || 0;
    for (const m of asArr(ro.matchups)) {
      const mo = asObj(m);
      const sides = [asObj(mo.topSeed), asObj(mo.bottomSeed)];
      const ids: number[] = [];
      for (const s of sides) {
        const pl = asObj(s.player);
        const id = Number(pl.id);
        if (!id) continue;
        ids.push(id);
        if (roundNum === 1 && !players.some((x) => x.id === id)) {
          const extra = teamAbbr.get(id) ?? { team: null, age: null };
          players.push({
            id,
            name: String(pl.fullName ?? `#${id}`),
            seed: Number(s.seed) || 0,
            order: Number(s.order) || null,
            team: extra.team,
            age: extra.age,
          });
        }
        const hit = asObj(s.topDerbyHitData);
        const dist = Number(hit.totalDistance);
        (live[id] ??= []).push({
          round: roundNum,
          hr: Number(s.numHomeRuns) || 0,
          done: Boolean(s.isComplete ?? s.complete),
          started: Boolean(s.isStarted ?? s.started),
          winner: Boolean(s.isWinner ?? s.winner),
          longest: dist > 0 ? dist : null,
        });
      }
      if (roundNum === 1 && ids.length === 2) pairs.push([ids[0], ids[1]]);
      if (roundNum > 1 && ids.length === 2) laterPairs.push({ round: roundNum, ids: [ids[0], ids[1]] });
    }
  }
  if (!players.length) return null;

  return {
    id: Number(asObj(info).id) || 0,
    name: String(info.name ?? "Home Run Derby"),
    venue: String(asObj(info.venue).name ?? ""),
    dateIso: String(info.eventDate ?? ""),
    state: String(status.state ?? "Preview"),
    currentRound: Number(status.currentRound) || 1,
    rounds,
    pairs,
    laterPairs,
    players,
    live,
  };
}

/* --------------------------------------------------------- power model */

export type PriorsBatter = {
  name?: string;
  pa?: number;
  barrel_pct?: number;
  hardhit_pct?: number;
  xslg?: number;
  pct?: Record<string, number>;
};

/* Derby-relevant Statcast percentile blend — raw power over hit tool:
   barrels carry the most signal for grooved-BP homers, then xISO, then
   exit velo / hard-hit. All 100 = elite. */
const PCT_W: [string, number][] = [
  ["brl_percent", 0.35],
  ["xiso", 0.3],
  ["exit_velocity", 0.2],
  ["hard_hit_percent", 0.15],
];

/* HR-per-swing mapping, CALIBRATED TO THE MARKET'S SCALE (2026-07-13, the
   posted board): player R1 lines 7.5–10.5 on 20 swings and R1/derby totals of
   73.5/117.5 imply grooved-BP HR rates around 0.36–0.48 per swing — roughly
   3× game rates and far above the first conservative guess. The absolute
   level comes from the market; the ORDERING stays pure Statcast (the model's
   real opinion). 50th pct → 0.285, 99th → 0.457. */
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function powerFromPriors(b: PriorsBatter | null | undefined): {
  pctPower: number | null;
  powerFactor: number;
  hrPerSwing: number;
} {
  const pct = b?.pct ?? null;
  let sum = 0;
  let wsum = 0;
  if (pct) {
    for (const [k, w] of PCT_W) {
      const v = pct[k];
      if (typeof v === "number" && isFinite(v)) {
        sum += v * w;
        wsum += w;
      }
    }
  }
  const pctPower = wsum > 0 ? sum / wsum : null;
  // relative raw-power multiplier (tie-break proxy); 50th pct → 1.0
  const powerFactor = pctPower == null ? 1 : 0.55 + 0.9 * (pctPower / 100);
  return {
    pctPower,
    powerFactor,
    hrPerSwing: clamp(0.11 + 0.35 * ((pctPower ?? 50) / 100), 0.18, 0.5),
  };
}

export function buildHitters(
  players: { id: number; name: string; seed: number; order: number | null; team: string | null; age: number | null }[],
  priorsBatters: Record<string, PriorsBatter> | null,
): DerbyHitter[] {
  return players
    .map((p) => {
      const b = priorsBatters?.[String(p.id)] ?? null;
      const pw = powerFromPriors(b);
      return {
        ...p,
        pa: b?.pa ?? null,
        barrelPct: b?.barrel_pct ?? null,
        hardhitPct: b?.hardhit_pct ?? null,
        xslg: b?.xslg ?? null,
        pctPower: pw.pctPower,
        thin: (b?.pa ?? 0) < 150,
        powerFactor: pw.powerFactor,
        hrPerSwing: pw.hrPerSwing,
      };
    })
    .sort((a, b) => a.seed - b.seed);
}

/* ------------------------------------------------------------ simulation */

/** mulberry32 — small seedable RNG so tests are exact. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Approximate standard normal via sum of 12 uniforms (fast, plenty for a
   per-round form wobble). */
const gauss = (rng: () => number) =>
  rng() + rng() + rng() + rng() + rng() + rng() + rng() + rng() + rng() + rng() + rng() + rng() - 6;

/** One round: n scheduled swings; a HR on the last scheduled swing extends
    the round until the first miss (the 2026 bonus rule). Also reports the
    first-swing result — the book hangs "first swing is a HR" props. */
function simRoundFS(p: number, swings: number, rng: () => number): { hr: number; first: boolean } {
  let hr = 0;
  let last = false;
  let first = false;
  for (let i = 0; i < swings; i++) {
    last = rng() < p;
    if (last) {
      hr++;
      if (i === 0) first = true;
    }
  }
  while (last) {
    last = rng() < p;
    if (last) hr++;
  }
  return { hr, first };
}

export function simRound(p: number, swings: number, rng: () => number): number {
  return simRoundFS(p, swings, rng).hr;
}

/** Head-to-head with 3-swing swing-offs until settled. */
function h2h(pA: number, pB: number, swings: number, rng: () => number, tally?: (a: number, b: number) => void): 0 | 1 {
  const a = simRound(pA, swings, rng);
  const b = simRound(pB, swings, rng);
  tally?.(a, b);
  if (a !== b) return a > b ? 0 : 1;
  for (let i = 0; i < 50; i++) {
    const sa = simRound(pA, 3, rng);
    const sb = simRound(pB, 3, rng);
    if (sa !== sb) return sa > sb ? 0 : 1;
  }
  return rng() < 0.5 ? 0 : 1;
}

/* Day-form wobble: derby output is streaky (timing, fatigue, pitcher groove).
   One lognormal draw per hitter per tournament. */
const FORM_SIGMA = 0.16;

/** Compact per-tournament outcomes — the joint-pricing substrate. Any leg or
    parlay is priced by scanning these draws, so correlations (a winner leg and
    that hitter's HR total, two sides of the same pool) are exact by
    construction instead of assumed independent. */
export type DerbyDraws = {
  n: number;
  ids: number[]; // hitter ids by column index
  rates: number[]; // hrPerSwing by column (analytic props, diagnostics)
  r1: Uint8Array; // [sim * k + col] round-1 HRs
  fs: Uint8Array; // 1 = first R1 swing was a HR
  evt: Uint16Array; // total HRs across rounds hit (swing-offs excluded)
  top4: Uint8Array; // 1 = advanced from the pool
  final2: Uint8Array; // 1 = reached the final
  champ: Uint8Array; // [sim] = winner column index
};

export function simDerbyDraws(
  state: Pick<DerbyState, "hitters" | "rounds">,
  opts: { n?: number; seed?: number } = {},
): DerbyDraws {
  const n = opts.n ?? 20000;
  const rng = makeRng(opts.seed ?? 20260713);
  const hitters = state.hitters;
  const k = hitters.length;
  const swingsR1 = state.rounds.find((r) => r.round === 1)?.swings ?? 20;
  const swingsR2 = state.rounds.find((r) => r.round === 2)?.swings ?? 15;
  const swingsR3 = state.rounds.find((r) => r.round === 3)?.swings ?? 15;

  const d: DerbyDraws = {
    n,
    ids: hitters.map((h) => h.id),
    rates: hitters.map((h) => h.hrPerSwing),
    r1: new Uint8Array(n * k),
    fs: new Uint8Array(n * k),
    evt: new Uint16Array(n * k),
    top4: new Uint8Array(n * k),
    final2: new Uint8Array(n * k),
    champ: new Uint8Array(n),
  };

  for (let s = 0; s < n; s++) {
    // per-tournament effective rates (day-form wobble)
    const p = hitters.map((h) => clamp(h.hrPerSwing * Math.exp(FORM_SIGMA * gauss(rng)), 0.05, 0.6));
    const base = s * k;
    const evt = new Array(k).fill(0);

    // ---- round 1: single pool, top 4 advance
    const r1: number[] = [];
    for (let i = 0; i < k; i++) {
      const rr = simRoundFS(p[i], swingsR1, rng);
      r1.push(rr.hr);
      if (rr.first) d.fs[base + i] = 1;
    }
    for (let i = 0; i < k; i++) {
      d.r1[base + i] = Math.min(r1[i], 255);
      evt[i] += r1[i];
    }
    // rank with the R1 tiebreak (longest HR) proxied by relative raw power
    const order = hitters
      .map((_, i) => i)
      .sort((i, j) => r1[j] - r1[i] || (rng() < p[i] / (p[i] + p[j]) ? -1 : 1));
    const semi = order.slice(0, 4); // seeded 1..4 by R1 finish
    for (const i of semi) d.top4[base + i] = 1;

    // ---- semis: 1v4, 2v3
    const f1 = semi[h2h(p[semi[0]], p[semi[3]], swingsR2, rng, (a, b) => { evt[semi[0]] += a; evt[semi[3]] += b; }) === 0 ? 0 : 3];
    const f2 = semi[h2h(p[semi[1]], p[semi[2]], swingsR2, rng, (a, b) => { evt[semi[1]] += a; evt[semi[2]] += b; }) === 0 ? 1 : 2];
    d.final2[base + f1] = 1;
    d.final2[base + f2] = 1;

    // ---- final
    const champ = h2h(p[f1], p[f2], swingsR3, rng, (a, b) => { evt[f1] += a; evt[f2] += b; }) === 0 ? f1 : f2;
    d.champ[s] = champ;

    for (let i = 0; i < k; i++) d.evt[base + i] = Math.min(evt[i], 65535);
  }
  return d;
}

export function simDerby(
  state: Pick<DerbyState, "hitters" | "rounds" | "pairs">,
  opts: { n?: number; seed?: number } = {},
): SimResult {
  return aggregateDraws(state, simDerbyDraws(state, opts));
}

/** Marginals, pair head-to-heads and histograms, all read off the draws. */
export function aggregateDraws(
  state: Pick<DerbyState, "hitters" | "pairs">,
  d: DerbyDraws,
): SimResult {
  const { n, ids } = d;
  const k = ids.length;
  const HIST_MAX = 40;
  const out: Record<number, SimHitterOut> = {};
  for (const id of ids)
    out[id] = {
      win: 0,
      reachFinal: 0,
      advanceR1: 0,
      r1Avg: 0,
      r1Hist: new Array(HIST_MAX + 1).fill(0),
      evtAvg: 0,
      evtHist: new Array(3 * HIST_MAX + 1).fill(0),
    };
  const col = new Map(ids.map((id, i) => [id, i]));
  const pairIdx = state.pairs.map(([a, b]) => ({ a, b, ia: col.get(a) ?? -1, ib: col.get(b) ?? -1, wa: 0, wb: 0, t: 0 }));
  const totalHist = new Array(8 * 3 * HIST_MAX).fill(0);
  let totalSum = 0;

  for (let s = 0; s < n; s++) {
    const base = s * k;
    let evtTotal = 0;
    for (let i = 0; i < k; i++) {
      const o = out[ids[i]];
      const r1 = d.r1[base + i];
      const evt = d.evt[base + i];
      o.r1Hist[Math.min(r1, HIST_MAX)]++;
      o.r1Avg += r1;
      o.evtHist[Math.min(evt, 3 * HIST_MAX)]++;
      o.evtAvg += evt;
      if (d.top4[base + i]) o.advanceR1++;
      if (d.final2[base + i]) o.reachFinal++;
      evtTotal += evt;
    }
    out[ids[d.champ[s]]].win++;
    for (const pr of pairIdx) {
      if (pr.ia < 0 || pr.ib < 0) continue;
      const a = d.r1[base + pr.ia];
      const b = d.r1[base + pr.ib];
      if (a > b) pr.wa++;
      else if (a < b) pr.wb++;
      else pr.t++;
    }
    totalSum += evtTotal;
    totalHist[Math.min(evtTotal, totalHist.length - 1)]++;
  }

  for (const id of ids) {
    const o = out[id];
    o.win /= n;
    o.reachFinal /= n;
    o.advanceR1 /= n;
    o.r1Avg /= n;
    o.evtAvg /= n;
  }
  return {
    n,
    byId: out,
    pairs: pairIdx.map((pr) => ({ a: pr.a, b: pr.b, pA: pr.wa / n, pB: pr.wb / n, pTie: pr.t / n })),
    totalAvg: totalSum / n,
    totalHist,
  };
}

/** P(count > line) from a sim histogram (line like 16.5 — or an integer,
    where pushes are excluded from both sides). */
export function probOver(hist: number[], line: number, nSims: number): { over: number; under: number; push: number } {
  let over = 0;
  let push = 0;
  for (let k = 0; k < hist.length; k++) {
    if (k > line) over += hist[k];
    else if (k === line) push += hist[k];
  }
  const under = nSims - over - push;
  if (nSims - push <= 0) return { over: 0, under: 0, push: 1 };
  return { over: over / (nSims - push), under: under / (nSims - push), push: push / nSims };
}

/* ------------------------------------------------------- market helpers */

export const fairAmerican = (p: number): number | null => {
  if (!(p > 0) || !(p < 1)) return null;
  return p >= 0.5 ? Math.round((-100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p);
};

/** Market weight in the model/market blend. The derby model has no history
    behind its calibration, so the market carries 75%. */
export const DERBY_MODEL_W = 0.25;
export const blendProb = (model: number, market: number | null, w = DERBY_MODEL_W): number =>
  market == null ? model : w * model + (1 - w) * market;

export const evAtAmerican = (p: number, odds: number): number => p * decFromAmerican(odds) - 1;

/** ¼-Kelly stake on a straight bet (0 when no edge). */
export function quarterKelly(p: number, odds: number, bankroll: number): number {
  const b = decFromAmerican(odds) - 1;
  const f = (p * b - (1 - p)) / b;
  return f > 0 ? (f / 4) * bankroll : 0;
}

/** Shin-devig an n-way outright field (winner market). */
export function devigField(quotes: { id: number; odds: number }[]): Map<number, number> {
  const imps = quotes.map((q) => impliedFromAmerican(q.odds));
  const fair = imps.every((p) => p > 0 && p < 1) && quotes.length >= 2 ? devigShin(imps) : imps;
  return new Map(quotes.map((q, i) => [q.id, fair[i]]));
}

/** Power-devig a field whose fair probabilities sum to S (S=2 for "reach the
    final", S=4 for "top 4", S=1 for one-winner fields): find λ ≥ 1 with
    Σ p_i^λ = S. Returns null when the field carries no overround (partial
    capture) — no vig to strip means no fair to claim. */
export function devigFieldSum(imps: number[], S: number): number[] | null {
  if (imps.some((p) => !(p > 0 && p < 1))) return null;
  const f = (lam: number) => imps.reduce((a, p) => a + Math.pow(p, lam), 0) - S;
  if (f(1) <= 0) return null; // booksum ≤ S: incomplete field, don't pretend
  let lo = 1;
  let hi = 1;
  while (f(hi) > 0 && hi < 200) hi *= 2;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  const lam = (lo + hi) / 2;
  return imps.map((p) => Math.pow(p, lam));
}

/* ----------------------------------------------------------- odds paste */

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Surname without generational suffixes — "Jazz Chisholm Jr." → "Chisholm". */
export function lastName(full: string): string {
  const parts = full.split(/\s+/).filter((w) => !/^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(w));
  return parts[parts.length - 1] ?? full;
}

/** Match a known hitter inside free text (full name or unique last name). */
export function matchHitter(text: string, hitters: DerbyHitter[]): DerbyHitter | null {
  const t = normalize(text);
  for (const h of hitters) if (t.includes(normalize(h.name))) return h;
  const hits = hitters.filter((h) => {
    const last = normalize(lastName(h.name));
    return new RegExp(`(^|[^a-z])${last}([^a-z]|$)`).test(t);
  });
  return hits.length === 1 ? hits[0] : null;
}

const ODDS_RE = /[+-]\d{3,5}\b/g;

export type WinnerQuote = { id: number; odds: number };

/** "Kyle Schwarber +330" per line (tabs/extra text tolerated). */
export function parseWinnerOdds(text: string, hitters: DerbyHitter[]): { quotes: WinnerQuote[]; unmatched: string[] } {
  const quotes: WinnerQuote[] = [];
  const unmatched: string[] = [];
  for (const lineRaw of text.split(/\n+/)) {
    const line = lineRaw.trim();
    if (!line) continue;
    const h = matchHitter(line, hitters);
    const odds = line.match(ODDS_RE);
    if (h && odds && !quotes.some((q) => q.id === h.id)) quotes.push({ id: h.id, odds: Number(odds[odds.length - 1]) });
    else unmatched.push(line);
  }
  return { quotes, unmatched };
}

export type H2HQuote = { aId: number; bId: number; aOdds: number; bOdds: number };

/** A line (or pasted pair of lines) holding two known names + two prices:
    "Schwarber -140 Caglianone +120" or "Schwarber -140\nCaglianone +120". */
export function parseH2HOdds(text: string, hitters: DerbyHitter[]): { quotes: H2HQuote[]; unmatched: string[] } {
  const quotes: H2HQuote[] = [];
  const unmatched: string[] = [];
  // scan sequentially: each odds token pairs with the name mentioned just
  // before it; consecutive (name, odds) tokens form a matchup
  const tokens: { id: number; odds: number }[] = [];
  for (const lineRaw of text.split(/\n+/)) {
    const line = lineRaw.trim();
    if (!line) continue;
    let consumed = false;
    let cursor = 0;
    for (const m of line.matchAll(ODDS_RE)) {
      const h = matchHitter(line.slice(cursor, m.index), hitters);
      if (h) {
        tokens.push({ id: h.id, odds: Number(m[0]) });
        consumed = true;
      }
      cursor = m.index! + m[0].length;
    }
    if (!consumed) unmatched.push(line);
  }
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const [a, b] = [tokens[i], tokens[i + 1]];
    if (a.id !== b.id) quotes.push({ aId: a.id, bId: b.id, aOdds: a.odds, bOdds: b.odds });
  }
  return { quotes, unmatched };
}

export type TotalQuote = { id: number; line: number; overOdds: number | null; underOdds: number | null };

/** "Schwarber Over 15.5 -115" / "Schwarber o15.5 -115 u15.5 -105".
    Scope (round 1 vs whole derby) is chosen in the UI, not parsed. */
export function parseTotalOdds(text: string, hitters: DerbyHitter[]): { quotes: TotalQuote[]; unmatched: string[] } {
  const quotes: TotalQuote[] = [];
  const unmatched: string[] = [];
  const SIDE_RE = /\b(over|under|o|u)\s*(\d+(?:\.\d+)?)\s*(?:hrs?|home runs?)?\s*([+-]\d{3,5})\b/gi;
  for (const lineRaw of text.split(/\n+/)) {
    const line = lineRaw.trim();
    if (!line) continue;
    const h = matchHitter(line, hitters);
    const sides = [...line.matchAll(SIDE_RE)];
    if (!h || !sides.length) {
      unmatched.push(line);
      continue;
    }
    for (const m of sides) {
      const isOver = m[1].toLowerCase().startsWith("o");
      const ln = Number(m[2]);
      const odds = Number(m[3]);
      let q = quotes.find((x) => x.id === h.id && x.line === ln);
      if (!q) {
        q = { id: h.id, line: ln, overOdds: null, underOdds: null };
        quotes.push(q);
      }
      if (isOver) q.overOdds = odds;
      else q.underOdds = odds;
    }
  }
  return { quotes, unmatched };
}

/** Two-way Shin de-vig when both sides exist; null otherwise. */
export function fairTwoWay(aOdds: number | null, bOdds: number | null): { a: number; b: number } | null {
  if (aOdds == null || bOdds == null) return null;
  const ia = impliedFromAmerican(aOdds);
  const ib = impliedFromAmerican(bOdds);
  if (!(ia > 0 && ia < 1 && ib > 0 && ib < 1)) return null;
  const [a, b] = devigShin([ia, ib]);
  return { a, b };
}

/* ---------------------------------------------- legs & joint pricing */

export type DerbyLeg =
  | { kind: "winner"; id: number }
  | { kind: "final"; id: number } // reaches the final
  | { kind: "advance"; id: number } // top-4 out of the pool
  | { kind: "h2h"; aId: number; bId: number; pick: "a" | "b" } // any R1 pairing, graded on R1 totals
  | { kind: "total"; id: number; scope: "r1" | "event"; line: number; side: "over" | "under" }
  | { kind: "finalists"; aId: number; bId: number } // both reach the final
  | { kind: "exacta"; winId: number; loseId: number } // winId champs, loseId runner-up
  | { kind: "mostR1"; id: number } // strict R1 max; tied max = push (≈ dead-heat rules)
  | { kind: "r1Total"; line: number; side: "over" | "under" } // all 8, round 1
  | { kind: "eventTotal"; line: number; side: "over" | "under" } // all 8, all rounds
  | { kind: "comboR1"; aId: number; bId: number; line: number; side: "over" | "under" } // duo R1 sum
  | { kind: "allR1AtLeast"; n: number } // EVERY player hits ≥ n in R1
  | { kind: "firstSwing"; id: number }; // first R1 swing is a HR

/** 1 = leg wins in this sim, 0 = loses, -1 = pushes (H2H tie / exact integer line). */
function legResult(d: DerbyDraws, s: number, leg: DerbyLeg, col: Map<number, number>): 1 | 0 | -1 {
  const k = d.ids.length;
  const base = s * k;
  switch (leg.kind) {
    case "winner":
      return d.champ[s] === col.get(leg.id) ? 1 : 0;
    case "final":
      return d.final2[base + (col.get(leg.id) ?? -1)] ? 1 : 0;
    case "advance":
      return d.top4[base + (col.get(leg.id) ?? -1)] ? 1 : 0;
    case "h2h": {
      const a = d.r1[base + (col.get(leg.aId) ?? -1)];
      const b = d.r1[base + (col.get(leg.bId) ?? -1)];
      if (a === b) return -1;
      return (a > b) === (leg.pick === "a") ? 1 : 0;
    }
    case "total": {
      const v = (leg.scope === "r1" ? d.r1 : d.evt)[base + (col.get(leg.id) ?? -1)];
      if (v === leg.line) return -1;
      return (v > leg.line) === (leg.side === "over") ? 1 : 0;
    }
    case "finalists":
      return d.final2[base + (col.get(leg.aId) ?? -1)] && d.final2[base + (col.get(leg.bId) ?? -1)] ? 1 : 0;
    case "exacta":
      return d.champ[s] === col.get(leg.winId) && d.final2[base + (col.get(leg.loseId) ?? -1)] ? 1 : 0;
    case "mostR1": {
      const me = d.r1[base + (col.get(leg.id) ?? -1)];
      let max = 0;
      let ties = 0;
      for (let i = 0; i < k; i++) {
        const v = d.r1[base + i];
        if (v > max) {
          max = v;
          ties = 1;
        } else if (v === max) ties++;
      }
      if (me < max) return 0;
      return ties === 1 ? 1 : -1; // shared max → push (book: dead-heat reduction)
    }
    case "r1Total":
    case "eventTotal": {
      const arr = leg.kind === "r1Total" ? d.r1 : d.evt;
      let sum = 0;
      for (let i = 0; i < k; i++) sum += arr[base + i];
      if (sum === leg.line) return -1;
      return (sum > leg.line) === (leg.side === "over") ? 1 : 0;
    }
    case "comboR1": {
      const sum = d.r1[base + (col.get(leg.aId) ?? -1)] + d.r1[base + (col.get(leg.bId) ?? -1)];
      if (sum === leg.line) return -1;
      return (sum > leg.line) === (leg.side === "over") ? 1 : 0;
    }
    case "allR1AtLeast": {
      for (let i = 0; i < k; i++) if (d.r1[base + i] < leg.n) return 0;
      return 1;
    }
    case "firstSwing":
      return d.fs[base + (col.get(leg.id) ?? -1)] ? 1 : 0;
  }
}

/** Joint probability that EVERY leg wins, conditioned on no leg pushing —
    the same push-excluded convention as the single-market prices. Exact
    within the model: correlations come from counting joint outcomes. */
export function evalLegs(d: DerbyDraws, legs: DerbyLeg[]): { p: number; pushRate: number } {
  const col = new Map(d.ids.map((id, i) => [id, i]));
  let win = 0;
  let push = 0;
  outer: for (let s = 0; s < d.n; s++) {
    let anyPush = false;
    for (const leg of legs) {
      const r = legResult(d, s, leg, col);
      if (r === 0) continue outer;
      if (r === -1) anyPush = true;
    }
    if (anyPush) push++;
    else win++;
  }
  const denom = d.n - push;
  return { p: denom > 0 ? win / denom : 0, pushRate: push / d.n };
}

export type PricedLeg = {
  key: string;
  leg: DerbyLeg;
  group: string; // market family, for grouped display
  label: string; // hitter (or "A & B")
  prop: string; // market description
  odds: number; // book price
  model: number;
  market: number | null; // de-vigged, when the field/both sides exist
  blend: number;
  ev: number; // at the book price, on the blend
};

/* Leg kinds safe to multiply into parlays at book odds. The exotic fields
   (exacta, finalists, most-R1, all-player specials) are already parlay-shaped
   or dead-heat-ruled — they stay out of the combo generator. */
export const PARLAYABLE_KINDS = new Set<DerbyLeg["kind"]>([
  "winner",
  "final",
  "advance",
  "h2h",
  "total",
  "comboR1",
  "firstSwing",
]);

/** WINNER legs from the bottom quartile of the market's own winner board —
    the least likely champions per the BOOK's posted prices (deliberately not
    the model's opinion). Josh's rule, 2026-07-13: these never anchor a
    parlay, and the DAILY card skips them too (FUN is the longshot bucket). */
export function longshotWinnerKeys(legs: PricedLeg[]): Set<string> {
  const winners = legs.filter((l) => l.leg.kind === "winner");
  const cut = Math.floor(winners.length / 4);
  return new Set(
    [...winners]
      .sort((a, b) => impliedFromAmerican(a.odds) - impliedFromAmerican(b.odds))
      .slice(0, cut)
      .map((l) => l.key),
  );
}

/** The parlay candidate pool: parlayable kinds minus the market's
    least-likely champions. Excluded legs stay on the edges table as singles. */
export function parlayPool(legs: PricedLeg[]): PricedLeg[] {
  const excluded = longshotWinnerKeys(legs);
  return legs.filter((l) => PARLAYABLE_KINDS.has(l.leg.kind) && !excluded.has(l.key));
}

/* ------------------------------------------------------------ card allocator */

export type DerbyCardPick = { leg: PricedLeg; stake: number };
export type DerbyCard = {
  daily: { picks: DerbyCardPick[]; sum: number; ev: number };
  fun: { picks: DerbyCardPick[]; sum: number; ev: number };
  reduced: boolean; // no positive-EV candidates — allocated as requested anyway
};

/** Round stakes to whole dollars so they sum EXACTLY to the requested total
    (the product's exact-sum discipline). Largest stake absorbs the residue. */
function exactSum(raw: number[], total: number): number[] {
  const s = raw.reduce((a, b) => a + b, 0);
  if (s <= 0 || total <= 0) return raw.map(() => 0);
  const stakes = raw.map((r) => Math.max(1, Math.round((r / s) * total)));
  let diff = total - stakes.reduce((a, b) => a + b, 0);
  const order = stakes.map((_, i) => i).sort((i, j) => stakes[j] - stakes[i]);
  for (let k = 0; diff !== 0 && k < 1000; k++) {
    const i = order[k % order.length];
    const step = diff > 0 ? 1 : -1;
    if (stakes[i] + step >= 1) {
      stakes[i] += step;
      diff -= step;
    }
  }
  return stakes;
}

/** Size a derby card the way the MLB builder does: DAILY spreads across the
    strongest playable edges with ¼-Kelly weighting (capped 2% of bankroll a
    ticket, exact-sum to the dollar, one leg never rides two tickets, at most
    two per market family, the market's least-likely champions excluded);
    FUN buys 1–3 honest longshots (+500 or longer — exotics and the excluded
    longshot winners are allowed HERE, that's what the bucket is for). */
export function derbyCard(
  legs: PricedLeg[],
  opts: { daily: number; fun: number; bankroll: number },
): DerbyCard {
  const { daily, fun, bankroll } = opts;
  const excluded = longshotWinnerKeys(legs);

  /* ---- DAILY */
  const byEv = [...legs].sort((a, b) => b.ev - a.ev);
  const pos = byEv.filter((l) => l.ev > 0 && !excluded.has(l.key));
  const reduced = pos.length === 0;
  const candidates = reduced ? byEv.filter((l) => !excluded.has(l.key)) : pos;
  const perGroup = new Map<string, number>();
  const dailyLegs: PricedLeg[] = [];
  for (const l of candidates) {
    if (dailyLegs.length >= 5) break;
    const g = perGroup.get(l.group) ?? 0;
    if (g >= 2) continue; // diversify across market families
    perGroup.set(l.group, g + 1);
    dailyLegs.push(l);
  }
  const cap = 0.02 * bankroll;
  const rawDaily = dailyLegs.map((l) => {
    const k = quarterKelly(l.blend, l.odds, bankroll);
    return Math.min(cap, k > 0 ? k : cap / 4); // reduced-action day: equal-ish split
  });
  const dailyStakes = daily > 0 && dailyLegs.length ? exactSum(rawDaily, daily) : dailyLegs.map(() => 0);
  const dailyPicks = dailyLegs.map((leg, i) => ({ leg, stake: dailyStakes[i] })).filter((p) => p.stake > 0);

  /* ---- FUN */
  const funCands = byEv.filter((l) => decFromAmerican(l.odds) >= 6 && !dailyPicks.some((p) => p.leg.key === l.key));
  const funLegs = funCands.slice(0, Math.min(3, funCands.length));
  const SPLITS: Record<number, number[]> = { 1: [1], 2: [0.6, 0.4], 3: [0.5, 0.3, 0.2] };
  const funStakes =
    fun > 0 && funLegs.length ? exactSum(SPLITS[funLegs.length].map((w) => w * fun), fun) : funLegs.map(() => 0);
  const funPicks = funLegs.map((leg, i) => ({ leg, stake: funStakes[i] })).filter((p) => p.stake > 0);

  const cardEv = (picks: DerbyCardPick[]) => {
    const s = picks.reduce((a, p) => a + p.stake, 0);
    return s > 0 ? picks.reduce((a, p) => a + p.stake * p.leg.ev, 0) / s : 0;
  };
  return {
    daily: { picks: dailyPicks, sum: dailyPicks.reduce((a, p) => a + p.stake, 0), ev: cardEv(dailyPicks) },
    fun: { picks: funPicks, sum: funPicks.reduce((a, p) => a + p.stake, 0), ev: cardEv(funPicks) },
    reduced,
  };
}

/** Everything the book hangs on the derby, in one typed structure. */
export type DerbyBook = {
  winner?: WinnerQuote[];
  final2?: WinnerQuote[]; // to reach the final (fair sums to 2)
  final4?: WinnerQuote[]; // to make the top 4 (fair sums to 4)
  mostR1?: WinnerQuote[]; // most R1 HRs (dead-heat field, sums to 1)
  finalists?: { aId: number; bId: number; odds: number }[]; // exact final pair
  exacta?: { winId: number; loseId: number; odds: number }[]; // champ + runner-up
  h2h?: H2HQuote[]; // R1 more-HRs pairings
  totals?: TotalQuote[]; // player totals at `totalsScope`
  totalsScope?: "r1" | "event";
  r1Total?: { line: number; over: number | null; under: number | null };
  eventTotal?: { line: number; over: number | null; under: number | null };
  comboR1?: { aId: number; bId: number; line: number; over: number }[]; // duo "N+" combos
  allR1AtLeast?: { n: number; odds: number }[]; // every player ≥ n in R1
  firstSwing?: WinnerQuote[]; // first swing is a HR
};

/** Price every book market against the draws. */
export function priceDerbyLegs(d: DerbyDraws, hitters: DerbyHitter[], book: DerbyBook): PricedLeg[] {
  const nm = new Map(hitters.map((h) => [h.id, h.name]));
  const short = (id: number) => lastName(nm.get(id) ?? `#${id}`);
  const legs: PricedLeg[] = [];
  const add = (key: string, leg: DerbyLeg, group: string, label: string, prop: string, odds: number, market: number | null) => {
    const model = evalLegs(d, [leg]).p;
    // One-sided markets (no opposite price to de-vig) still get anchored —
    // to the RAW book-implied probability, vig included. Without this the
    // model runs unopposed exactly where its assumptions are shakiest
    // (first-swing cold starts, exotic combos) and prints fantasy EV.
    const anchor = market ?? impliedFromAmerican(odds);
    const blend = blendProb(model, anchor);
    legs.push({ key, leg, group, label, prop, odds, model, market, blend, ev: evAtAmerican(blend, odds) });
  };

  /* n-way fields: winner (S=1), reach final (S=2), top 4 (S=4), most R1 (S=1) */
  const fields: [WinnerQuote[] | undefined, number, string, string, (id: number) => DerbyLeg, string][] = [
    [book.winner, 1, "w", "Winner", (id) => ({ kind: "winner", id }), "wins the Derby"],
    [book.final2, 2, "f2", "Reach the final", (id) => ({ kind: "final", id }), "reaches the final"],
    [book.final4, 4, "f4", "Make the top 4", (id) => ({ kind: "advance", id }), "makes the top 4"],
    [book.mostR1, 1, "m1", "Most R1 HRs", (id) => ({ kind: "mostR1", id }), "most R1 HRs (ties push)"],
  ];
  for (const [quotes, S, tag, group, mk, prop] of fields) {
    if (!quotes?.length) continue;
    const fair = quotes.length >= 4 ? devigFieldSum(quotes.map((q) => impliedFromAmerican(q.odds)), S) : null;
    quotes.forEach((q, i) => add(`${tag}:${q.id}`, mk(q.id), group, nm.get(q.id) ?? `#${q.id}`, prop, q.odds, fair?.[i] ?? null));
  }

  /* exact final pair — one-winner field over the captured pairs */
  if (book.finalists?.length) {
    const fair = devigFieldSum(book.finalists.map((q) => impliedFromAmerican(q.odds)), 1);
    book.finalists.forEach((q, i) =>
      add(`fp:${q.aId}-${q.bId}`, { kind: "finalists", aId: q.aId, bId: q.bId }, "Finalists", `${short(q.aId)} & ${short(q.bId)}`, "both reach the final", q.odds, fair?.[i] ?? null),
    );
  }

  /* exacta — champ + runner-up, one-winner field */
  if (book.exacta?.length) {
    const fair = devigFieldSum(book.exacta.map((q) => impliedFromAmerican(q.odds)), 1);
    book.exacta.forEach((q, i) =>
      add(`x:${q.winId}>${q.loseId}`, { kind: "exacta", winId: q.winId, loseId: q.loseId }, "Exacta", short(q.winId), `beats ${short(q.loseId)} in the final`, q.odds, fair?.[i] ?? null),
    );
  }

  for (const q of book.h2h ?? []) {
    const mkt = fairTwoWay(q.aOdds, q.bOdds);
    add(`h:${q.aId}>${q.bId}`, { kind: "h2h", aId: q.aId, bId: q.bId, pick: "a" }, "R1 head-to-head", nm.get(q.aId) ?? "", `more R1 HRs than ${short(q.bId)}`, q.aOdds, mkt?.a ?? null);
    add(`h:${q.bId}>${q.aId}`, { kind: "h2h", aId: q.aId, bId: q.bId, pick: "b" }, "R1 head-to-head", nm.get(q.bId) ?? "", `more R1 HRs than ${short(q.aId)}`, q.bOdds, mkt?.b ?? null);
  }

  const scope = book.totalsScope ?? "r1";
  const scopeTag = scope === "r1" ? "R1" : "Derby";
  for (const q of book.totals ?? []) {
    const mkt = fairTwoWay(q.overOdds, q.underOdds);
    if (q.overOdds != null)
      add(`t:${q.id}:${q.line}:o`, { kind: "total", id: q.id, scope, line: q.line, side: "over" }, "Player HR totals", nm.get(q.id) ?? "", `Over ${q.line} HRs (${scopeTag})`, q.overOdds, mkt?.a ?? null);
    if (q.underOdds != null)
      add(`t:${q.id}:${q.line}:u`, { kind: "total", id: q.id, scope, line: q.line, side: "under" }, "Player HR totals", nm.get(q.id) ?? "", `Under ${q.line} HRs (${scopeTag})`, q.underOdds, mkt?.b ?? null);
  }

  const evTotals: [DerbyBook["r1Total"], "r1Total" | "eventTotal", string][] = [
    [book.r1Total, "r1Total", "Total R1 HRs (all 8)"],
    [book.eventTotal, "eventTotal", "Total derby HRs (all 8)"],
  ];
  for (const [q, kind, label] of evTotals) {
    if (!q) continue;
    const mkt = fairTwoWay(q.over, q.under);
    if (q.over != null) add(`${kind}:o`, { kind, line: q.line, side: "over" }, "Derby totals", label, `Over ${q.line}`, q.over, mkt?.a ?? null);
    if (q.under != null) add(`${kind}:u`, { kind, line: q.line, side: "under" }, "Derby totals", label, `Under ${q.line}`, q.under, mkt?.b ?? null);
  }

  for (const q of book.comboR1 ?? [])
    add(
      `c:${q.aId}+${q.bId}:${q.line}`,
      { kind: "comboR1", aId: q.aId, bId: q.bId, line: q.line, side: "over" },
      "R1 duos",
      `${short(q.aId)} & ${short(q.bId)}`,
      `combine for ${Math.ceil(q.line)}+ R1 HRs`,
      q.over,
      null, // one-sided — no de-vig
    );

  for (const q of book.allR1AtLeast ?? [])
    add(`all:${q.n}`, { kind: "allR1AtLeast", n: q.n }, "Field specials", "Every player", `records ${q.n}+ R1 HRs`, q.odds, null);

  for (const q of book.firstSwing ?? [])
    add(`fsw:${q.id}`, { kind: "firstSwing", id: q.id }, "First swing", nm.get(q.id) ?? `#${q.id}`, "first swing is a HR", q.odds, null);

  return legs.sort((a, b) => b.ev - a.ev);
}

export type DerbyParlay = {
  legs: PricedLeg[];
  dec: number; // combined pasted price
  pJoint: number; // blended joint (sim correlation × blended marginals)
  pModel: number; // pure sim joint
  corr: number; // jointModel / Π marginal models
  ev: number;
  kelly: number; // ¼-Kelly capped at 2% of bankroll, in dollars
};

/** Joint-price one combination off the draws. Correlation factor = sim joint
    ÷ product of sim marginals, applied to the product of blended marginals —
    market anchoring survives, correlation is the model's. Returns null for
    impossible combos (two winners, over+under of the same line). */
export function priceDerbyCombo(d: DerbyDraws, legs: PricedLeg[], bankroll: number): DerbyParlay | null {
  const { p: pModel } = evalLegs(d, legs.map((l) => l.leg));
  if (pModel <= 0) return null;
  let prodModel = 1;
  let prodBlend = 1;
  let dec = 1;
  for (const l of legs) {
    prodModel *= l.model;
    prodBlend *= l.blend;
    dec *= decFromAmerican(l.odds);
  }
  if (prodModel <= 0) return null;
  const corr = clamp(pModel / prodModel, 0.2, 5);
  const pJoint = Math.min(0.99, prodBlend * corr);
  const ev = pJoint * dec - 1;
  const b = dec - 1;
  const kellyF = b > 0 ? (pJoint * b - (1 - pJoint)) / b : 0;
  const kelly = kellyF > 0 ? Math.round(Math.min(0.02, kellyF / 4) * bankroll) : 0;
  return { legs, dec, pJoint, pModel, corr, ev, kelly };
}

/** 2–3 leg combinations of the pasted markets, joint-priced, best EV first. */
export function derbyParlays(
  d: DerbyDraws,
  priced: PricedLeg[],
  opts: { bankroll?: number; top?: number; maxCandidates?: number } = {},
): DerbyParlay[] {
  const bankroll = opts.bankroll ?? 750;
  const top = opts.top ?? 12;
  const cands = [...priced].sort((a, b) => b.ev - a.ev).slice(0, opts.maxCandidates ?? 14);
  const out: DerbyParlay[] = [];
  const price = (legs: PricedLeg[]) => {
    const p = priceDerbyCombo(d, legs, bankroll);
    if (p) out.push(p);
  };

  for (let i = 0; i < cands.length; i++)
    for (let j = i + 1; j < cands.length; j++) {
      price([cands[i], cands[j]]);
      for (let m = j + 1; m < cands.length; m++) price([cands[i], cands[j], cands[m]]);
    }

  return out.sort((a, b) => b.ev - a.ev).slice(0, top);
}
