"use client";

/* UFC market desk — separate from the MLB quant engine (which stays verbatim
   and parity-locked). There is NO fight model here and we never invent one:
   the true probability of each side is the de-vigged consensus across every
   US book in the feed, EV is computed at the Caesars price, and parlays are
   plain products of independent-fight legs. Edges are price gaps vs the
   market, not predictions. Records come live from ESPN. */

/* ---------- odds math ---------- */
export const amToDec = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
export const decToAm = (d: number) => (d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1)));
export const fmtAm = (a: number) => (a > 0 ? `+${a}` : `${a}`);
const implied = (a: number) => (a > 0 ? 100 / (a + 100) : Math.abs(a) / (Math.abs(a) + 100));
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/* ---------- types ---------- */
export type UfcSide = {
  name: string;
  record?: string;
  czOdds: number | null;
  /** de-vigged median probability across all posted books */
  prob: number | null;
  /** EV per $1 at the Caesars price */
  czEv: number | null;
  bestOdds: number | null;
  bestBook: string | null;
  books: number;
};
export type UfcFight = {
  id: string;
  start: string;
  weightClass?: string;
  a: UfcSide;
  b: UfcSide;
  /** rounds total from other books, reference only — not posted at Caesars in this feed */
  rounds?: { point: number; book: string } | null;
};
export type UfcTicketLeg = { fight: string; pick: string; record?: string; czOdds: number; prob: number };
export type UfcTicket = {
  name: string;
  note: string;
  legs: UfcTicketLeg[];
  prob: number;
  dec: number;
  american: number;
  ev: number;
  kellyStake: number;
};
export type UfcBoard = {
  eventName: string | null;
  fights: UfcFight[];
  tickets: UfcTicket[];
  generatedAt: number;
};

/* ---------- fetch: ESPN card (records) + Odds API (prices) ---------- */
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
/* fuzzy: "kai kamaka iii" (ESPN) should match "kai kamaka" (odds feed) */
const sameName = (x: string, y: string) => {
  const a = norm(x), b = norm(y);
  return a === b || a.startsWith(b) || b.startsWith(a);
};

type OddsEvent = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: {
    key: string;
    title: string;
    markets: { key: string; outcomes: { name: string; price: number; point?: number }[] }[];
  }[];
};

async function fetchOddsEvents(fresh: boolean): Promise<OddsEvent[]> {
  const u = encodeURIComponent(
    "https://api.the-odds-api.com/v4/sports/mma_mixed_martial_arts/odds?regions=us&markets=h2h,totals&oddsFormat=american",
  );
  const r = await fetch(`/api/odds?u=${u}${fresh ? "&fresh=1" : ""}`);
  if (!r.ok) throw new Error(`odds feed ${r.status}`);
  return r.json();
}

type EspnBout = { a: string; aRec?: string; b: string; bRec?: string; weightClass?: string };
async function fetchEspnCard(): Promise<{ eventName: string | null; bouts: EspnBout[] }> {
  try {
    const u = encodeURIComponent("https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard");
    const r = await fetch(`/api/stats?u=${u}`);
    if (!r.ok) return { eventName: null, bouts: [] };
    const d = (await r.json()) as {
      events?: {
        name?: string;
        competitions?: {
          type?: { text?: string };
          competitors?: { athlete?: { displayName?: string }; records?: { summary?: string }[] }[];
        }[];
      }[];
    };
    const bouts: EspnBout[] = [];
    let eventName: string | null = null;
    for (const ev of d.events ?? []) {
      eventName = eventName ?? ev.name ?? null;
      for (const c of ev.competitions ?? []) {
        const [x, y] = c.competitors ?? [];
        if (!x?.athlete?.displayName || !y?.athlete?.displayName) continue;
        bouts.push({
          a: x.athlete.displayName,
          aRec: x.records?.[0]?.summary,
          b: y.athlete.displayName,
          bRec: y.records?.[0]?.summary,
          weightClass: c.type?.text,
        });
      }
    }
    return { eventName, bouts };
  } catch {
    return { eventName: null, bouts: [] }; // records are garnish — odds board still works
  }
}

/* ---------- assembly ---------- */
function sideFromBooks(ev: OddsEvent, fighter: string): UfcSide {
  const probs: number[] = [];
  let czOdds: number | null = null;
  let bestOdds: number | null = null;
  let bestBook: string | null = null;
  for (const bk of ev.bookmakers) {
    const h2h = bk.markets.find((m) => m.key === "h2h");
    if (!h2h || h2h.outcomes.length < 2) continue;
    const mine = h2h.outcomes.find((o) => o.name === fighter);
    const other = h2h.outcomes.find((o) => o.name !== fighter);
    if (!mine || !other) continue;
    const pRaw = implied(mine.price);
    probs.push(pRaw / (pRaw + implied(other.price))); // de-vig this book
    if (bk.key === "williamhill_us") czOdds = mine.price;
    if (bestOdds == null || amToDec(mine.price) > amToDec(bestOdds)) {
      bestOdds = mine.price;
      bestBook = bk.title;
    }
  }
  const prob = probs.length ? median(probs) : null;
  const czEv = prob != null && czOdds != null ? prob * amToDec(czOdds) - 1 : null;
  return { name: fighter, czOdds, prob, czEv, bestOdds, bestBook, books: probs.length };
}

function roundsFromBooks(ev: OddsEvent): UfcFight["rounds"] {
  for (const bk of ev.bookmakers) {
    const t = bk.markets.find((m) => m.key === "totals");
    const over = t?.outcomes.find((o) => o.name === "Over");
    if (over?.point != null) return { point: over.point, book: bk.title };
  }
  return null;
}

/* quarter-Kelly, capped at 2% of bankroll — same discipline as the MLB card */
function stake(prob: number, dec: number, bankroll: number) {
  const b = dec - 1;
  const f = (b * prob - (1 - prob)) / b;
  const q = Math.max(0, Math.min(f / 4, 0.02));
  return Math.round(q * bankroll * 100) / 100;
}

function ticket(name: string, note: string, legs: UfcTicketLeg[], bankroll: number): UfcTicket | null {
  if (!legs.length) return null;
  const prob = legs.reduce((a, l) => a * l.prob, 1);
  const dec = legs.reduce((a, l) => a * amToDec(l.czOdds), 1);
  return { name, note, legs, prob, dec, american: decToAm(dec), ev: prob * dec - 1, kellyStake: stake(prob, dec, bankroll) };
}

function buildTickets(fights: UfcFight[], bankroll: number): UfcTicket[] {
  // playable = sides Caesars actually prices, one per fight (the better-EV side)
  const sides = fights
    .map((f) => {
      const cands = [f.a, f.b].filter((s) => s.czOdds != null && s.prob != null && s.czEv != null);
      if (!cands.length) return null;
      const best = cands.sort((x, y) => (y.czEv ?? -9) - (x.czEv ?? -9))[0];
      const leg: UfcTicketLeg = {
        fight: `${f.a.name} vs ${f.b.name}`,
        pick: best.name,
        record: best.record,
        czOdds: best.czOdds!,
        prob: best.prob!,
      };
      return { leg, ev: best.czEv!, prob: best.prob!, dog: best.czOdds! > 100 };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  if (!sides.length) return [];

  const byEv = [...sides].sort((a, b) => b.ev - a.ev);
  const byProb = [...sides].sort((a, b) => b.prob - a.prob);
  const out: UfcTicket[] = [];

  const t1 = ticket(
    "VALUE DOUBLE",
    "The two best Caesars prices vs the market consensus — the closest thing to +EV on this card.",
    byEv.slice(0, 2).map((s) => s.leg),
    bankroll,
  );
  if (t1) out.push(t1);

  const t2 = ticket(
    "CHALK STACK",
    "The three most likely winners by consensus. High hit rate, thin price — entertainment chalk.",
    byProb.slice(0, 3).map((s) => s.leg),
    bankroll,
  );
  if (t2) out.push(t2);

  const bestDog = byEv.find((s) => s.dog);
  const bestFav = byProb.find((s) => s !== bestDog);
  if (bestDog && bestFav) {
    const t3 = ticket(
      "DOG + ANCHOR",
      "Best-value underdog paired with the safest favorite — one swing, one seatbelt.",
      [bestDog.leg, bestFav.leg],
      bankroll,
    );
    if (t3) out.push(t3);
  }

  const t4 = ticket(
    "CARD SWEEP",
    "Every consensus favorite on the card. Longshot by construction — FUN-money only.",
    byProb.filter((s) => s.prob > 0.5).map((s) => s.leg),
    bankroll,
  );
  if (t4 && t4.legs.length >= 4) out.push(t4);

  return out;
}

/* ---------- public entry ---------- */
export async function loadUfcBoard(opts?: { fresh?: boolean; bankroll?: number }): Promise<UfcBoard> {
  const bankroll = opts?.bankroll ?? 750;
  const [events, card] = await Promise.all([fetchOddsEvents(opts?.fresh ?? false), fetchEspnCard()]);

  // upcoming only: once a fight starts, books stream LIVE prices while others
  // freeze at the close — mixing those manufactures phantom edges (and the
  // window won't take a pre-fight bet anyway)
  const upcoming = events
    .filter((e) => e.bookmakers.length > 0 && new Date(e.commence_time).getTime() > Date.now())
    .sort((a, b) => a.commence_time.localeCompare(b.commence_time));
  if (!upcoming.length) return { eventName: card.eventName, fights: [], tickets: [], generatedAt: Date.now() };
  const first = new Date(upcoming[0].commence_time).getTime();
  const slate = upcoming.filter((e) => new Date(e.commence_time).getTime() - first < 30 * 3600_000);

  const fights: UfcFight[] = slate.map((ev) => {
    const a = sideFromBooks(ev, ev.home_team);
    const b = sideFromBooks(ev, ev.away_team);
    const bout = card.bouts.find(
      (bt) =>
        sameName(bt.a, ev.home_team) || sameName(bt.b, ev.home_team) ||
        sameName(bt.a, ev.away_team) || sameName(bt.b, ev.away_team),
    );
    if (bout) {
      a.record = sameName(bout.a, a.name) ? bout.aRec : sameName(bout.b, a.name) ? bout.bRec : undefined;
      b.record = sameName(bout.a, b.name) ? bout.aRec : sameName(bout.b, b.name) ? bout.bRec : undefined;
    }
    return { id: ev.id, start: ev.commence_time, weightClass: bout?.weightClass, a, b, rounds: roundsFromBooks(ev) };
  });

  return { eventName: card.eventName, fights, tickets: buildTickets(fights, bankroll), generatedAt: Date.now() };
}
