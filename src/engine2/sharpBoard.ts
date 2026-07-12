"use client";

/* Engine v2 sharp desk — game-level fair prices from the Shin-devigged,
   Pinnacle-weighted consensus across us+eu books, judged at the Caesars line.
   This is the v2 market layer running live on real prices; no model involved. */

import { consensusProb, decFromAmerican, americanFromProb } from "@/engine2/devig";

const UPSTREAM =
  "https://api.the-odds-api.com/v4/sports/baseball_mlb/odds?regions=us,eu&markets=h2h,totals,spreads&oddsFormat=american";

type Outcome = { name: string; price: number; point?: number };
type OddsEvent = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: { key: string; markets: { key: string; outcomes: Outcome[] }[] }[];
};

export type SharpSide = {
  name: string;
  fairP: number | null;
  fairAm: number | null;
  cz: number | null;
  czEv: number | null; // per $1 at CZ vs sharp fair
};
export type SharpTotal = {
  point: number | null;
  overFairP: number | null;
  czOver: number | null;
  czUnder: number | null;
  czPoint: number | null;
  overEv: number | null;
  underEv: number | null;
};
export type SharpGame = {
  id: string;
  start: string;
  away: SharpSide;
  home: SharpSide;
  total: SharpTotal;
  books: number;
  hasSharp: boolean; // pinnacle or an exchange present
};

const SHARPS = new Set(["pinnacle", "betfair_ex_eu", "matchbook"]);

function ev(p: number | null, am: number | null): number | null {
  if (p == null || am == null) return null;
  return p * decFromAmerican(am) - 1;
}

function mlConsensus(ev_: OddsEvent) {
  const books: { key: string; a: number; b: number }[] = [];
  let czAway: number | null = null;
  let czHome: number | null = null;
  for (const bk of ev_.bookmakers) {
    const m = bk.markets.find((x) => x.key === "h2h");
    const away = m?.outcomes.find((o) => o.name === ev_.away_team);
    const home = m?.outcomes.find((o) => o.name === ev_.home_team);
    if (!away || !home) continue;
    books.push({ key: bk.key, a: away.price, b: home.price });
    if (bk.key === "williamhill_us") {
      czAway = away.price;
      czHome = home.price;
    }
  }
  return { c: consensusProb(books, "shin"), czAway, czHome, n: books.length };
}

function totalConsensus(ev_: OddsEvent) {
  // consensus over the MOST COMMON total point among books (apples to apples)
  const byPoint = new Map<number, { key: string; a: number; b: number }[]>();
  let cz: { point: number; over: number; under: number } | null = null;
  for (const bk of ev_.bookmakers) {
    const m = bk.markets.find((x) => x.key === "totals");
    const over = m?.outcomes.find((o) => o.name === "Over");
    const under = m?.outcomes.find((o) => o.name === "Under");
    if (!over || !under || over.point == null) continue;
    const arr = byPoint.get(over.point) ?? [];
    arr.push({ key: bk.key, a: over.price, b: under.price });
    byPoint.set(over.point, arr);
    if (bk.key === "williamhill_us") cz = { point: over.point, over: over.price, under: under.price };
  }
  let best: { point: number; books: { key: string; a: number; b: number }[] } | null = null;
  for (const [point, books] of byPoint) {
    if (!best || books.length > best.books.length) best = { point, books };
  }
  if (!best) return { point: null, c: null, cz };
  return { point: best.point, c: consensusProb(best.books, "shin"), cz };
}

export async function loadSharpBoard(): Promise<{ games: SharpGame[]; at: number }> {
  const r = await fetch(`/api/odds?u=${encodeURIComponent(UPSTREAM)}`);
  if (!r.ok) throw new Error(`odds ${r.status}`);
  const events: OddsEvent[] = await r.json();
  const upcoming = events
    .filter((e) => new Date(e.commence_time).getTime() > Date.now())
    .sort((a, b) => a.commence_time.localeCompare(b.commence_time));

  const games: SharpGame[] = upcoming.map((e) => {
    const ml = mlConsensus(e);
    const tot = totalConsensus(e);
    const pAway = ml.c?.p ?? null;
    const pHome = pAway != null ? 1 - pAway : null;
    const overP = tot.c?.p ?? null;
    // CZ total EV only comparable when CZ hangs the consensus point
    const samePoint = tot.cz != null && tot.point != null && tot.cz.point === tot.point;
    return {
      id: e.id,
      start: e.commence_time,
      away: {
        name: e.away_team,
        fairP: pAway,
        fairAm: pAway != null ? americanFromProb(pAway) : null,
        cz: ml.czAway,
        czEv: ev(pAway, ml.czAway),
      },
      home: {
        name: e.home_team,
        fairP: pHome,
        fairAm: pHome != null ? americanFromProb(pHome) : null,
        cz: ml.czHome,
        czEv: ev(pHome, ml.czHome),
      },
      total: {
        point: tot.point,
        overFairP: overP,
        czPoint: tot.cz?.point ?? null,
        czOver: tot.cz?.over ?? null,
        czUnder: tot.cz?.under ?? null,
        overEv: samePoint ? ev(overP, tot.cz!.over) : null,
        underEv: samePoint && overP != null ? ev(1 - overP, tot.cz!.under) : null,
      },
      books: ml.n,
      hasSharp: e.bookmakers.some((b) => SHARPS.has(b.key)),
    };
  });
  return { games, at: Date.now() };
}
