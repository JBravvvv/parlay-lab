/* MLB All-Star Game desk — a standalone special-event module, zero contact
   with the parity-locked game engine (the ASG is an exhibition: one-inning
   pitchers, rotating lineups — the season sim's assumptions don't hold).

   Honesty rules (the Derby desk's lessons, kept):
   - The market is the anchor. ML / F5 / totals get a Shin de-vig + sharp-
     weighted consensus across every posted book (Pinnacle ×3, exchanges ×2).
     F3 exists only at Caesars — its own two-sided prices de-vig fine, but the
     UI says "CZ-only" instead of pretending 15 books agreed.
   - One-sided markets (HR props: Over 0.5 only, one book) are anchored to the
     RAW book-implied probability; the model may only nudge ordering. No
     fantasy EV.
   - The sim is calibrated so P(AL win) and P(over) REPRODUCE the consensus
     fairs — it never invents a different game. What it adds is structure:
     correct-score probabilities and F3/F5 cross-checks from the same
     calibrated game.
   - Caesars NV offers NO parlays on the All-Star Game, so everything here is
     a straight bet: the card allocator sizes singles only.
   - Correct Score isn't in The Odds API for baseball — those prices paste in
     from the Caesars app (the Derby's paste flow, same reason). */

import {
  consensusProb,
  decFromAmerican,
  impliedFromAmerican,
  americanFromProb,
} from "@/engine2/devig";

/* ------------------------------------------------------------------ types */

export type AsgSide = "AL" | "NL";
export type BookTwoWay = { book: string; al: number; nl: number };
export type BookOU = { book: string; point: number; over: number; under: number };
export type HrQuote = { name: string; odds: number; book: string };

/** Everything the odds feed posts for the event, in one typed structure. */
export type AsgBook = {
  commence: string | null;
  ml: BookTwoWay[];
  mlF3: BookTwoWay[];
  mlF5: BookTwoWay[];
  total: BookOU[];
  totalF3: BookOU[];
  totalF5: BookOU[];
  hr: HrQuote[]; // batter Over 0.5 HR — one-sided where posted
};

export type AsgPlayer = {
  id: number;
  name: string;
  side: AsgSide;
  order: number | null; // 1..9 for announced starters, null for reserves
  hr: number; // real season HR (statsapi)
  pa: number; // real season PA (statsapi)
};

/* ------------------------------------------------- The Odds API event parse */

type OddsOutcome = { name: string; price: number; point?: number; description?: string };
type OddsMarket = { key: string; outcomes: OddsOutcome[] };
type OddsBookmaker = { key: string; title: string; markets: OddsMarket[] };
export type OddsEventJson = {
  commence_time?: string;
  home_team?: string;
  away_team?: string;
  bookmakers?: OddsBookmaker[];
};

const isAL = (team: string) => /^american/i.test(team.trim());

export function parseAsgOdds(json: OddsEventJson): AsgBook {
  const out: AsgBook = {
    commence: json.commence_time ?? null,
    ml: [], mlF3: [], mlF5: [],
    total: [], totalF3: [], totalF5: [],
    hr: [],
  };
  for (const bk of json.bookmakers ?? []) {
    for (const m of bk.markets ?? []) {
      if (m.key === "h2h" || m.key === "h2h_1st_3_innings" || m.key === "h2h_1st_5_innings") {
        const al = m.outcomes.find((o) => isAL(o.name));
        const nl = m.outcomes.find((o) => !isAL(o.name));
        if (!al || !nl) continue;
        const row = { book: bk.key, al: al.price, nl: nl.price };
        if (m.key === "h2h") out.ml.push(row);
        else if (m.key === "h2h_1st_3_innings") out.mlF3.push(row);
        else out.mlF5.push(row);
      } else if (m.key === "totals" || m.key === "totals_1st_3_innings" || m.key === "totals_1st_5_innings") {
        const over = m.outcomes.find((o) => o.name === "Over");
        const under = m.outcomes.find((o) => o.name === "Under");
        if (!over || !under || over.point == null) continue;
        const row = { book: bk.key, point: over.point, over: over.price, under: under.price };
        if (m.key === "totals") out.total.push(row);
        else if (m.key === "totals_1st_3_innings") out.totalF3.push(row);
        else out.totalF5.push(row);
      } else if (m.key === "batter_home_runs") {
        for (const o of m.outcomes) {
          if (o.name === "Over" && o.description && (o.point == null || o.point === 0.5)) {
            out.hr.push({ name: o.description, odds: o.price, book: bk.key });
          }
        }
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------ market fairs */

export type Fair2 = { pAL: number; n: number } | null;
export type FairOU = { point: number; pOver: number; n: number } | null;

const fair2 = (rows: BookTwoWay[]): Fair2 => {
  const c = consensusProb(rows.map((r) => ({ key: r.book, a: r.al, b: r.nl })));
  return c ? { pAL: c.p, n: c.n } : null;
};

/** Consensus O/U at the MODAL posted point (books hang different totals —
    only same-point prices are comparable). */
const fairOU = (rows: BookOU[]): FairOU => {
  if (!rows.length) return null;
  const byPoint = new Map<number, BookOU[]>();
  for (const r of rows) byPoint.set(r.point, [...(byPoint.get(r.point) ?? []), r]);
  const modal = [...byPoint.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const c = consensusProb(modal[1].map((r) => ({ key: r.book, a: r.over, b: r.under })));
  return c ? { point: modal[0], pOver: c.p, n: c.n } : null;
};

export type AsgFairs = {
  ml: Fair2;
  mlF3: Fair2;
  mlF5: Fair2;
  total: FairOU;
  totalF3: FairOU;
  totalF5: FairOU;
};

export const asgFairs = (b: AsgBook): AsgFairs => ({
  ml: fair2(b.ml),
  mlF3: fair2(b.mlF3),
  mlF5: fair2(b.mlF5),
  total: fairOU(b.total),
  totalF3: fairOU(b.totalF3),
  totalF5: fairOU(b.totalF5),
});

/** Caesars' own quote for a two-way / OU market, for EV display. */
export const czTwoWay = (rows: BookTwoWay[]): BookTwoWay | null =>
  rows.find((r) => r.book === "williamhill_us") ?? null;
export const czOU = (rows: BookOU[]): BookOU | null =>
  rows.find((r) => r.book === "williamhill_us") ?? null;

/* ------------------------------------------------------------- simulation */

export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Half-inning runs: zero-inflated geometric. MLB empirically scores in ~27%
   of half-innings with a mean of ~1.75 runs per scoring inning; the scale
   knob moves the scoring FREQUENCY (the tail shape g stays put). */
const TAIL_G = 0.42;
function halfInningRuns(mean: number, rng: () => number): number {
  const scoreProb = Math.min(0.55, Math.max(0.05, mean * (1 - TAIL_G)));
  if (rng() >= scoreProb) return 0;
  let k = 1;
  while (rng() < TAIL_G && k < 10) k++;
  return k;
}

export type SimOut = {
  pAL: number;
  tie9: number; // P(tied after 9 — decided by the swing-off)
  f3: { al: number; nl: number; tie: number };
  f5: { al: number; nl: number; tie: number };
  pOver: (point: number) => { over: number; under: number; push: number };
  /** P(exact 9-inning score) keyed "al-nl", ties included as the tied score */
  scoreProb: (al: number, nl: number) => number;
  scores: { al: number; nl: number; p: number }[]; // sorted desc, the full histogram
  meanTotal: number;
  n: number;
};

/** Simulate the game with per-team half-inning means (AL bats away / top,
    NL home / bottom). Bottom 9 is skipped when NL leads; a walk-off usually
    truncates the margin to 1 (a walk-off HR can beat that — modeled as a 15%
    chance the full sampled runs count). Ties after 9 go to the swing-off,
    which decides the WINNER only (the score stays the 9-inning tie). */
export function simAsg(mAL: number, mNL: number, n: number, seed = 20260714): SimOut {
  const rng = makeRng(seed);
  let alWins = 0, tie9 = 0;
  let f3al = 0, f3nl = 0, f3tie = 0;
  let f5al = 0, f5nl = 0, f5tie = 0;
  const totals: number[] = new Array(n);
  const hist = new Map<string, number>();

  for (let g = 0; g < n; g++) {
    let al = 0, nl = 0;
    for (let inn = 1; inn <= 9; inn++) {
      al += halfInningRuns(mAL, rng);
      if (inn === 9 && nl > al) break; // NL leads — no bottom 9
      let r = halfInningRuns(mNL, rng);
      if (inn === 9 && nl <= al && nl + r > al) {
        // walk-off: usually the go-ahead run ends it; sometimes it's a HR
        if (rng() >= 0.15) r = al - nl + 1;
      }
      nl += r;
      if (inn === 3) {
        if (al > nl) f3al++; else if (nl > al) f3nl++; else f3tie++;
      }
      if (inn === 5) {
        if (al > nl) f5al++; else if (nl > al) f5nl++; else f5tie++;
      }
    }
    if (al === nl) {
      tie9++;
      if (rng() < 0.5) alWins++; // swing-off ≈ coin flip
    } else if (al > nl) alWins++;
    totals[g] = al + nl;
    const k = `${al}-${nl}`;
    hist.set(k, (hist.get(k) ?? 0) + 1);
  }

  const scores = [...hist.entries()]
    .map(([k, c]) => {
      const [a, b] = k.split("-").map(Number);
      return { al: a, nl: b, p: c / n };
    })
    .sort((a, b) => b.p - a.p);

  let meanTotal = 0;
  for (const t of totals) meanTotal += t;
  meanTotal /= n;

  return {
    pAL: alWins / n,
    tie9: tie9 / n,
    f3: { al: f3al / n, nl: f3nl / n, tie: f3tie / n },
    f5: { al: f5al / n, nl: f5nl / n, tie: f5tie / n },
    pOver: (point: number) => {
      let over = 0, under = 0, push = 0;
      for (const t of totals) {
        if (t > point) over++;
        else if (t < point) under++;
        else push++;
      }
      return { over: over / n, under: under / n, push: push / n };
    },
    scoreProb: (a: number, b: number) => hist.get(`${a}-${b}`) ?? 0 ? (hist.get(`${a}-${b}`) ?? 0) / n : 0,
    scores,
    meanTotal,
    n,
  };
}

/** Calibrate (total scale, AL share) so the sim reproduces the consensus
    ML fair and the consensus total fair — the market defines the game, the
    sim only fills in its joint structure. Deterministic (seeded). */
export function calibrateSim(
  targetPAL: number,
  totalPoint: number,
  targetPOver: number,
  n = 15000,
): SimOut {
  let mTotal = totalPoint / 9; // per half-inning-pair mean, both teams
  let share = 0.5;
  let sim = simAsg(mTotal * share, mTotal * (1 - share), n);
  for (let it = 0; it < 14; it++) {
    // totals knob: P(over) too low → scale up
    const ou = sim.pOver(totalPoint);
    const overEx = ou.over / (ou.over + ou.under); // push-excluded, like grading
    mTotal *= 1 + Math.max(-0.15, Math.min(0.15, (targetPOver - overEx) * 0.9));
    // ML knob: P(AL) too low → shift share toward AL
    share += Math.max(-0.06, Math.min(0.06, (targetPAL - sim.pAL) * 0.55));
    share = Math.min(0.65, Math.max(0.35, share));
    sim = simAsg(mTotal * share, mTotal * (1 - share), n);
    const ou2 = sim.pOver(totalPoint);
    const ov2 = ou2.over / (ou2.over + ou2.under);
    if (Math.abs(sim.pAL - targetPAL) < 0.004 && Math.abs(ov2 - targetPOver) < 0.006) break;
  }
  return sim;
}

/* ---------------------------------------------------------- HR prop model */

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/[^a-z]/g, "");

export function matchPlayer(name: string, players: AsgPlayer[]): AsgPlayer | null {
  const t = norm(name);
  if (!t) return null;
  let hit = players.find((p) => norm(p.name) === t) ?? null;
  if (!hit) hit = players.find((p) => norm(p.name).startsWith(t) || t.startsWith(norm(p.name))) ?? null;
  if (!hit) {
    const last = t.slice(-Math.min(t.length, 8));
    const cands = players.filter((p) => norm(p.name).endsWith(last));
    if (cands.length === 1) hit = cands[0];
  }
  return hit;
}

/** Expected plate appearances by announced batting slot — ASG starters get
    2–3 trips, reserves enter late. An assumption (stated in the UI), applied
    to REAL season HR/PA rates; it can reorder the board, never inflate it. */
export const expPA = (order: number | null): number =>
  order == null ? 1.5 : order <= 3 ? 2.6 : order <= 6 ? 2.3 : 2.0;

export function hrModelProb(p: AsgPlayer): number | null {
  if (!(p.pa >= 100) || p.hr < 0) return null; // too small a sample to rate
  const perPA = p.hr / p.pa;
  return 1 - Math.pow(1 - perPA, expPA(p.order));
}

/* --------------------------------------------------------------- pasting */

/** Correct-score lines from the Caesars app. Accepts shapes like:
      AL 5-4 +900 | NL 3-2 +850 | American League 5-4 +900
      Any other AL win +700 | Any Other NL Win +650 | Any other +250 (tie)
    One entry per line; odds are the last +/-NNN on the line. */
export type ScoreQuote =
  | { kind: "exact"; side: AsgSide; win: number; lose: number; odds: number }
  | { kind: "other"; side: AsgSide | "tie"; odds: number };

export function parseScoreLines(text: string): { quotes: ScoreQuote[]; unmatched: string[] } {
  const quotes: ScoreQuote[] = [];
  const unmatched: string[] = [];
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    const om = line.match(/([+-]\d{3,5})(?!.*[+-]\d{3,5})/);
    if (!om) { unmatched.push(line); continue; }
    const odds = Number(om[1]);
    const sideM = line.match(/\b(AL|American(?:\s+League)?)\b/i)
      ? "AL"
      : line.match(/\b(NL|National(?:\s+League)?)\b/i)
        ? "NL"
        : null;
    if (/any\s+other/i.test(line)) {
      quotes.push({ kind: "other", side: sideM ?? "tie", odds });
      continue;
    }
    const sc = line.match(/(\d{1,2})\s*[-–:]\s*(\d{1,2})/);
    if (!sc || !sideM) { unmatched.push(line); continue; }
    const hi = Math.max(Number(sc[1]), Number(sc[2]));
    const lo = Math.min(Number(sc[1]), Number(sc[2]));
    if (hi === lo) { unmatched.push(line); continue; } // a tie needs "any other"
    quotes.push({ kind: "exact", side: sideM, win: hi, lose: lo, odds });
  }
  return { quotes, unmatched };
}

/** One paste, the whole Caesars board. Every ASG market is posted in the
    Caesars NV app; this router sorts a raw dump line-by-line: correct scores
    and "any other" buckets → the score parser, player-price lines → HR props,
    game-market lines (ML/F3/F5/totals — already live from the feed's Caesars
    mirror) are recognized and counted so nothing looks dropped, and headers
    without a price are ignored silently. */
export function parseCaesarsBoard(text: string): {
  scores: ScoreQuote[];
  hr: { name: string; odds: number }[];
  covered: number; // game-market lines the desk already prices live
  unmatched: string[];
} {
  const scoreLines: string[] = [];
  const hrLines: string[] = [];
  let covered = 0;
  const unmatched: string[] = [];
  const GAME_RE =
    /\b(over|under|total|moneyline|money line|run ?line|spread|innings?|f[35]\b|first\s+(3|5|three|five)|race to)\b/i;
  const SIDE_RE = /\b(AL|NL|American(?:\s+League)?|National(?:\s+League)?)\b/i;
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    if (!/[+-]\d{3,5}\b/.test(line)) continue; // header / section label — ignore
    if (/any\s+other/i.test(line) || (/\d{1,2}\s*[-–:]\s*\d{1,2}/.test(line) && SIDE_RE.test(line))) {
      scoreLines.push(line);
    } else if (GAME_RE.test(line) || (SIDE_RE.test(line) && !/[a-z]+\s+[a-z]+/i.test(line.replace(SIDE_RE, "").replace(/[+-]\d{3,5}/g, "").trim()))) {
      covered++; // ML / F3 / F5 / totals — the feed already carries CZ's price
    } else {
      hrLines.push(line);
    }
  }
  const sc = parseScoreLines(scoreLines.join("\n"));
  const hr = parseHrLines(hrLines.join("\n"));
  unmatched.push(...sc.unmatched, ...hr.unmatched);
  return { scores: sc.quotes, hr: hr.quotes, covered, unmatched };
}

/** HR-prop lines: "Name +600" per line. */
export function parseHrLines(text: string): { quotes: { name: string; odds: number }[]; unmatched: string[] } {
  const quotes: { name: string; odds: number }[] = [];
  const unmatched: string[] = [];
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.*?)\s*([+-]\d{3,5})\s*$/);
    if (!m || !m[1].trim()) { unmatched.push(line); continue; }
    quotes.push({ name: m[1].trim().replace(/\s+over\s+0?\.?5.*$/i, ""), odds: Number(m[2]) });
  }
  return { quotes, unmatched };
}

/* ------------------------------------------------------------ leg pricing */

export type AsgLeg = {
  key: string;
  group: "ML" | "F3" | "F5" | "TOTAL" | "HR" | "SCORE";
  label: string; // "American League", "Kyle Schwarber", "AL 5-4"
  prop: string; // market description
  odds: number; // the Caesars price (this book is where Josh bets)
  model: number | null; // sim / HR-model probability
  market: number | null; // de-vigged market fair (null when one-sided)
  blend: number; // what EV is computed on
  ev: number;
  note: string; // honesty tag: consensus width, CZ-only, book-anchored…
};

export const evAt = (p: number, odds: number): number => p * decFromAmerican(odds) - 1;
export const fairAmerican = (p: number): number | null =>
  p > 0.0005 && p < 0.9995 ? americanFromProb(p) : null;

/** Model weight when blending against a real market fair (Derby's 25/75). */
export const MODEL_W = 0.25;

export function priceAsgLegs(
  book: AsgBook,
  fairs: AsgFairs,
  sim: SimOut | null,
  players: AsgPlayer[],
  pastedScores: ScoreQuote[],
  pastedHr: { name: string; odds: number }[],
): AsgLeg[] {
  const legs: AsgLeg[] = [];

  const two = (
    group: "ML" | "F3" | "F5",
    rows: BookTwoWay[],
    fair: Fair2,
    simP: { al: number; nl: number; tie: number } | null,
    prop: string,
  ) => {
    const cz = czTwoWay(rows);
    if (!cz || !fair) return;
    // tie-push markets grade push-excluded — condition the sim the same way
    const simAL = simP ? simP.al / (simP.al + simP.nl) : null;
    for (const side of ["AL", "NL"] as const) {
      const mkt = side === "AL" ? fair.pAL : 1 - fair.pAL;
      const mdl = simAL == null ? null : side === "AL" ? simAL : 1 - simAL;
      // ML calibrates the sim, so the sim adds nothing there; F3/F5 get a
      // genuine cross-check from the calibrated game's structure
      const blend = group === "ML" || mdl == null ? mkt : MODEL_W * mdl + (1 - MODEL_W) * mkt;
      const odds = side === "AL" ? cz.al : cz.nl;
      legs.push({
        key: `${group}-${side}`,
        group,
        label: side === "AL" ? "American League" : "National League",
        prop,
        odds,
        model: mdl,
        market: mkt,
        blend,
        ev: evAt(blend, odds),
        note: fair.n === 1 ? "CZ-only market, de-vigged two-way" : `consensus of ${fair.n} books`,
      });
    }
  };

  two("ML", book.ml, fairs.ml, null, "Moneyline (swing-off decides a 9-inning tie)");
  two("F3", book.mlF3, fairs.mlF3, sim?.f3 ?? null, "First 3 innings ML (tie pushes)");
  two("F5", book.mlF5, fairs.mlF5, sim?.f5 ?? null, "First 5 innings ML (tie pushes)");

  const ou = (group: "TOTAL", rows: BookOU[], fair: FairOU, label: string) => {
    const cz = czOU(rows);
    if (!cz || !fair) return;
    if (cz.point !== fair.point) {
      // CZ hangs a different number than the consensus point — the fair isn't
      // comparable at CZ's line; surface CZ's own de-vig instead
      const own = consensusProb([{ key: "williamhill_us", a: cz.over, b: cz.under }]);
      if (!own) return;
      for (const side of ["Over", "Under"] as const) {
        const p = side === "Over" ? own.p : 1 - own.p;
        const odds = side === "Over" ? cz.over : cz.under;
        legs.push({
          key: `${group}-${side}`,
          group,
          label: `${side} ${cz.point}`,
          prop: label,
          odds,
          model: sim ? (() => { const o = sim.pOver(cz.point); const ex = o.over / (o.over + o.under); return side === "Over" ? ex : 1 - ex; })() : null,
          market: p,
          blend: p,
          ev: evAt(p, odds),
          note: `CZ ${cz.point} vs consensus ${fair.point} — own de-vig only`,
        });
      }
      return;
    }
    for (const side of ["Over", "Under"] as const) {
      const mkt = side === "Over" ? fair.pOver : 1 - fair.pOver;
      const odds = side === "Over" ? cz.over : cz.under;
      legs.push({
        key: `${group}-${side}`,
        group,
        label: `${side} ${fair.point}`,
        prop: label,
        odds,
        model: null,
        market: mkt,
        blend: mkt,
        ev: evAt(mkt, odds),
        note: `consensus of ${fair.n} books at ${fair.point}`,
      });
    }
  };
  ou("TOTAL", book.total, fairs.total, "Game total runs");

  /* HR props: one book, one side — RAW implied is the anchor (it still
     contains the vig, which keeps the EV conservative); the model, built from
     real season HR/PA × expected trips, can only nudge ordering. */
  const seenHr = new Set<string>();
  const hrRows = [
    ...book.hr,
    ...pastedHr.map((q) => ({ name: q.name, odds: q.odds, book: "paste" })),
  ];
  for (const q of hrRows) {
    const nk = norm(q.name);
    if (seenHr.has(nk)) continue;
    seenHr.add(nk);
    const pl = matchPlayer(q.name, players);
    const anchor = impliedFromAmerican(q.odds);
    const mdl = pl ? hrModelProb(pl) : null;
    const blend = mdl == null ? anchor : MODEL_W * mdl + (1 - MODEL_W) * anchor;
    legs.push({
      key: `HR-${nk}`,
      group: "HR",
      label: pl?.name ?? q.name,
      prop: "To hit a home run",
      odds: q.odds,
      model: mdl,
      market: null,
      blend,
      ev: evAt(blend, q.odds),
      note: pl
        ? `book-anchored · ${pl.hr} HR / ${pl.pa} PA this season, ${pl.order ? `bats ${pl.order}.` : "reserve"}`
        : "book-anchored · unmatched name, no model",
    });
  }

  /* Correct score: pasted Caesars board. When the paste covers the whole
     field (implied sum lands in a plausible vig band) de-vig the FIELD;
     otherwise anchor each line raw. The sim prices every exact score. */
  if (pastedScores.length && sim) {
    const imps = pastedScores.map((q) => impliedFromAmerican(q.odds));
    const S = imps.reduce((a, b) => a + b, 0);
    const fieldDevig = pastedScores.length >= 8 && S > 1.02 && S < 2.0;
    pastedScores.forEach((q, i) => {
      let mdl: number;
      let label: string;
      if (q.kind === "exact") {
        const al = q.side === "AL" ? q.win : q.lose;
        const nl = q.side === "NL" ? q.win : q.lose;
        mdl = sim.scoreProb(al, nl);
        label = `${q.side} ${q.win}-${q.lose}`;
      } else {
        const listed = new Set(
          pastedScores
            .filter((x): x is Extract<ScoreQuote, { kind: "exact" }> => x.kind === "exact")
            .map((x) => `${x.side === "AL" ? x.win : x.lose}-${x.side === "NL" ? x.win : x.lose}`),
        );
        let acc = 0;
        for (const s of sim.scores) {
          const winSide = s.al > s.nl ? "AL" : s.al < s.nl ? "NL" : "tie";
          if (winSide !== q.side) continue;
          if (listed.has(`${s.al}-${s.nl}`)) continue;
          acc += s.p;
        }
        mdl = acc;
        label = q.side === "tie" ? "Any other score" : `Any other ${q.side} win`;
      }
      const mkt = fieldDevig ? imps[i] / S : null;
      const anchor = mkt ?? impliedFromAmerican(q.odds);
      const blend = MODEL_W * mdl + (1 - MODEL_W) * anchor;
      legs.push({
        key: `SCORE-${label}`,
        group: "SCORE",
        label,
        prop: "Correct score (9 innings; swing-off doesn't change it)",
        odds: q.odds,
        model: mdl,
        market: mkt,
        blend,
        ev: evAt(blend, q.odds),
        note: fieldDevig ? `field de-vig across ${pastedScores.length} lines` : "book-anchored (partial board)",
      });
    });
  }

  return legs.sort((a, b) => b.ev - a.ev);
}

/* --------------------------------------------------------- card allocator */
/* Straight bets ONLY — Caesars NV does not offer All-Star Game parlays.
   Ported from the Derby card: exact-sum ¼-Kelly daily card + FUN longshots. */

export type AsgCardPick = { leg: AsgLeg; stake: number };
export type AsgCard = {
  daily: { picks: AsgCardPick[]; sum: number; ev: number };
  fun: { picks: AsgCardPick[]; sum: number; ev: number };
  reduced: boolean;
};

export function quarterKelly(p: number, odds: number, bankroll: number): number {
  const b = decFromAmerican(odds) - 1;
  const f = (b * p - (1 - p)) / b;
  return Math.max(0, (f / 4) * bankroll);
}

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

export function asgCard(
  legs: AsgLeg[],
  opts: { daily: number; fun: number; bankroll: number },
): AsgCard {
  const { daily, fun, bankroll } = opts;

  /* DAILY: strongest playable edges, ≤2 per market family, 2% cap, exact-sum.
     HR props and correct scores are book-anchored longshots — they live in
     FUN, not the daily card. */
  const byEv = [...legs].sort((a, b) => b.ev - a.ev);
  const dailyPool = byEv.filter((l) => l.group !== "HR" && l.group !== "SCORE");
  const pos = dailyPool.filter((l) => l.ev > 0);
  const reduced = pos.length === 0;
  const candidates = reduced ? dailyPool : pos;
  const perGroup = new Map<string, number>();
  const dailyLegs: AsgLeg[] = [];
  for (const l of candidates) {
    if (dailyLegs.length >= 4) break;
    const g = perGroup.get(l.group) ?? 0;
    if (g >= 2) continue;
    // never both sides of the same two-way market
    if (dailyLegs.some((x) => x.group === l.group && x.group !== "HR" && x.group !== "SCORE" && x.key !== l.key && x.key.split("-")[0] === l.key.split("-")[0])) continue;
    perGroup.set(l.group, g + 1);
    dailyLegs.push(l);
  }
  const cap = 0.02 * bankroll;
  const rawDaily = dailyLegs.map((l) => {
    const k = quarterKelly(l.blend, l.odds, bankroll);
    return Math.min(cap, k > 0 ? k : cap / 4);
  });
  const dailyStakes = daily > 0 && dailyLegs.length ? exactSum(rawDaily, daily) : dailyLegs.map(() => 0);
  const dailyPicks = dailyLegs.map((leg, i) => ({ leg, stake: dailyStakes[i] })).filter((p) => p.stake > 0);

  /* FUN: 1–3 straight longshots at +500 or longer — HR props and correct
     scores are exactly this bucket. */
  const funCands = byEv.filter(
    (l) => decFromAmerican(l.odds) >= 6 && !dailyPicks.some((p) => p.leg.key === l.key),
  );
  const funLegs = funCands.slice(0, Math.min(3, funCands.length));
  const SPLITS: Record<number, number[]> = { 1: [1], 2: [0.6, 0.4], 3: [0.5, 0.3, 0.2] };
  const funStakes =
    fun > 0 && funLegs.length ? exactSum(SPLITS[funLegs.length].map((w) => w * fun), fun) : funLegs.map(() => 0);
  const funPicks = funLegs.map((leg, i) => ({ leg, stake: funStakes[i] })).filter((p) => p.stake > 0);

  const cardEv = (picks: AsgCardPick[]) => {
    const s = picks.reduce((a, p) => a + p.stake, 0);
    return s > 0 ? picks.reduce((a, p) => a + p.stake * p.leg.ev, 0) / s : 0;
  };
  return {
    daily: { picks: dailyPicks, sum: dailyPicks.reduce((a, p) => a + p.stake, 0), ev: cardEv(dailyPicks) },
    fun: { picks: funPicks, sum: funPicks.reduce((a, p) => a + p.stake, 0), ev: cardEv(funPicks) },
    reduced,
  };
}
