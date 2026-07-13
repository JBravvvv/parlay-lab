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

/* Base derby HR-per-swing for a league-average (50th pct) hitter, scaled
   linearly by the percentile blend. New format ⇒ no history; 0.27 puts an
   elite field's R1 mean around 7–8 HRs on 20 swings, in line with what
   swing-limited BP rates suggest. Bounds keep degenerate priors sane. */
const BASE_HR_PER_SWING = 0.27;
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
  // 50th pct → 1.0; the mapping is deliberately steep so elite raw power
  // separates inside an all-elite field.
  const powerFactor = pctPower == null ? 1 : 0.55 + 0.9 * (pctPower / 100);
  return {
    pctPower,
    powerFactor,
    hrPerSwing: clamp(BASE_HR_PER_SWING * powerFactor, 0.14, 0.46),
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
    the round until the first miss (the 2026 bonus rule). */
export function simRound(p: number, swings: number, rng: () => number): number {
  let hr = 0;
  let last = false;
  for (let i = 0; i < swings; i++) {
    last = rng() < p;
    if (last) hr++;
  }
  while (last) {
    last = rng() < p;
    if (last) hr++;
  }
  return hr;
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

export function simDerby(
  state: Pick<DerbyState, "hitters" | "rounds" | "pairs">,
  opts: { n?: number; seed?: number } = {},
): SimResult {
  const n = opts.n ?? 20000;
  const rng = makeRng(opts.seed ?? 20260713);
  const hitters = state.hitters;
  const ids = hitters.map((h) => h.id);
  const swingsR1 = state.rounds.find((r) => r.round === 1)?.swings ?? 20;
  const swingsR2 = state.rounds.find((r) => r.round === 2)?.swings ?? 15;
  const swingsR3 = state.rounds.find((r) => r.round === 3)?.swings ?? 15;

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
  const pairIdx = state.pairs.map(([a, b]) => ({
    a,
    b,
    ia: hitters.findIndex((h) => h.id === a),
    ib: hitters.findIndex((h) => h.id === b),
    wa: 0,
    wb: 0,
    t: 0,
  }));
  const totalHist = new Array(8 * 3 * HIST_MAX).fill(0);
  let totalSum = 0;

  for (let s = 0; s < n; s++) {
    // per-tournament effective rates
    const p = hitters.map((h) => clamp(h.hrPerSwing * Math.exp(FORM_SIGMA * gauss(rng)), 0.05, 0.6));
    const evt = new Array(hitters.length).fill(0);

    // ---- round 1: single pool, top 4 advance
    const r1 = hitters.map((_, i) => simRound(p[i], swingsR1, rng));
    let evtTotal = 0;
    for (let i = 0; i < hitters.length; i++) {
      const h = Math.min(r1[i], HIST_MAX);
      out[ids[i]].r1Hist[h]++;
      out[ids[i]].r1Avg += r1[i];
      evt[i] += r1[i];
      evtTotal += r1[i];
    }
    for (const pr of pairIdx) {
      if (pr.ia < 0 || pr.ib < 0) continue;
      if (r1[pr.ia] > r1[pr.ib]) pr.wa++;
      else if (r1[pr.ia] < r1[pr.ib]) pr.wb++;
      else pr.t++;
    }
    // rank with the R1 tiebreak (longest HR) proxied by relative raw power
    const order = hitters
      .map((_, i) => i)
      .sort((i, j) => r1[j] - r1[i] || (rng() < p[i] / (p[i] + p[j]) ? -1 : 1));
    const semi = order.slice(0, 4); // seeded 1..4 by R1 finish
    for (const i of semi) out[ids[i]].advanceR1++;

    // ---- semis: 1v4, 2v3
    const f1 = semi[h2h(p[semi[0]], p[semi[3]], swingsR2, rng, (a, b) => { evt[semi[0]] += a; evt[semi[3]] += b; evtTotal += a + b; }) === 0 ? 0 : 3];
    const f2 = semi[h2h(p[semi[1]], p[semi[2]], swingsR2, rng, (a, b) => { evt[semi[1]] += a; evt[semi[2]] += b; evtTotal += a + b; }) === 0 ? 1 : 2];
    out[ids[f1]].reachFinal++;
    out[ids[f2]].reachFinal++;

    // ---- final
    const champ = h2h(p[f1], p[f2], swingsR3, rng, (a, b) => { evt[f1] += a; evt[f2] += b; evtTotal += a + b; }) === 0 ? f1 : f2;
    out[ids[champ]].win++;

    for (let i = 0; i < hitters.length; i++) {
      out[ids[i]].evtAvg += evt[i];
      out[ids[i]].evtHist[Math.min(evt[i], 3 * HIST_MAX)]++;
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
