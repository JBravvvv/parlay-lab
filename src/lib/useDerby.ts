"use client";

/* Shared Home Run Derby data layer — one hook feeding /derby, the Board tab,
   The Sharp tab and the Builder tab. Bracket + live counts from MLB statsapi,
   power model from the nightly priors, market prices from the shipped seed
   (public/model/derby-odds.json — transcribed from the book's full board) with
   the paste boxes overriding their sections when used. Sim draws cached
   module-wide so four surfaces don't re-run 15k tournaments each. */

import { useEffect, useMemo, useRef, useState } from "react";
import { getMoney } from "@/lib/engine-client";
import {
  parseDerby,
  buildHitters,
  simDerbyDraws,
  aggregateDraws,
  parseWinnerOdds,
  parseH2HOdds,
  parseTotalOdds,
  priceDerbyLegs,
  derbyParlays,
  matchHitter,
  parlayPool,
  type DerbyBook,
  type DerbyState,
  type DerbyDraws,
  type SimResult,
  type PricedLeg,
  type DerbyParlay,
  type PriorsBatter,
  type WinnerQuote,
  type H2HQuote,
  type TotalQuote,
  type DerbyHitter,
} from "@/engine2/derby";

const STATS = "https://statsapi.mlb.com/api/v1";
export const DERBY_SIM_N = 15000;
const LS_KEY = "pl_derbyOdds";

export type PasteState = { winner: string; h2h: string; totals: string; scope: "event" | "r1" };
export const EMPTY_PASTE: PasteState = { winner: "", h2h: "", totals: "", scope: "r1" };

/* ---- the shipped odds seed (transcribed book board) ---- */
type SeedNamed = { name: string; odds: number };
type SeedPair = { a: string; b: string; odds: number };
export type DerbySeed = {
  event?: string;
  captured_at?: string;
  source?: string;
  winner?: SeedNamed[];
  final2?: SeedNamed[];
  final4?: SeedNamed[];
  mostR1?: SeedNamed[];
  finalists?: SeedPair[];
  exacta?: { win: string; lose: string; odds: number }[];
  h2h?: { a: string; b: string; aOdds: number; bOdds: number }[];
  playerR1?: { name: string; line: number; over: number | null; under: number | null }[];
  r1Total?: { line: number; over: number | null; under: number | null };
  eventTotal?: { line: number; over: number | null; under: number | null };
  comboR1?: { a: string; b: string; line: number; over: number }[];
  allR1AtLeast?: { n: number; odds: number }[];
  firstSwing?: SeedNamed[];
  unmodeled?: {
    longestHrPlayer?: SeedNamed[];
    highestExitVelo?: SeedNamed[];
    longestHrDistance?: { line: number; over: number; under: number };
    any520Plus?: { odds: number };
    boosts?: { label: string; odds: number; base?: number; warn?: string }[];
  };
};

/* one sim per model-input signature, shared across surfaces/navigations */
let drawsCache: { key: string; draws: DerbyDraws } | null = null;

export type DerbyMarket = {
  loading: boolean;
  err: string | null;
  refresh: () => void;
  state: DerbyState | null;
  sim: SimResult | null;
  draws: DerbyDraws | null;
  paste: PasteState;
  savePaste: (p: PasteState) => void;
  parsed: {
    winner: { quotes: WinnerQuote[]; unmatched: string[] };
    h2h: { quotes: H2HQuote[]; unmatched: string[] };
    totals: { quotes: TotalQuote[]; unmatched: string[] };
  };
  legs: PricedLeg[];
  parlays: DerbyParlay[];
  bankroll: number;
  anyOdds: boolean;
  seed: DerbySeed | null;
};

/** Resolve a seed's last names against the live field. Unresolvable names are
    dropped (never guessed). */
function seedToBook(seed: DerbySeed, hitters: DerbyHitter[]): DerbyBook {
  const id = (n: string) => matchHitter(n, hitters)?.id ?? null;
  const named = (xs?: SeedNamed[]): WinnerQuote[] =>
    (xs ?? []).flatMap((q) => {
      const i = id(q.name);
      return i ? [{ id: i, odds: q.odds }] : [];
    });
  return {
    winner: named(seed.winner),
    final2: named(seed.final2),
    final4: named(seed.final4),
    mostR1: named(seed.mostR1),
    firstSwing: named(seed.firstSwing),
    finalists: (seed.finalists ?? []).flatMap((q) => {
      const a = id(q.a);
      const b = id(q.b);
      return a && b ? [{ aId: a, bId: b, odds: q.odds }] : [];
    }),
    exacta: (seed.exacta ?? []).flatMap((q) => {
      const w = id(q.win);
      const l = id(q.lose);
      return w && l ? [{ winId: w, loseId: l, odds: q.odds }] : [];
    }),
    h2h: (seed.h2h ?? []).flatMap((q) => {
      const a = id(q.a);
      const b = id(q.b);
      return a && b ? [{ aId: a, bId: b, aOdds: q.aOdds, bOdds: q.bOdds }] : [];
    }),
    totals: (seed.playerR1 ?? []).flatMap((q) => {
      const i = id(q.name);
      return i ? [{ id: i, line: q.line, overOdds: q.over, underOdds: q.under }] : [];
    }),
    totalsScope: "r1",
    r1Total: seed.r1Total,
    eventTotal: seed.eventTotal,
    comboR1: (seed.comboR1 ?? []).flatMap((q) => {
      const a = id(q.a);
      const b = id(q.b);
      return a && b ? [{ aId: a, bId: b, line: q.line, over: q.over }] : [];
    }),
    allR1AtLeast: seed.allR1AtLeast,
  };
}

export function useDerby(): DerbyMarket {
  const [data, setData] = useState<{ state: DerbyState } | null>(null);
  const [seed, setSeed] = useState<DerbySeed | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const eventIdRef = useRef<number | null>(null);
  const priorsRef = useRef<Record<string, PriorsBatter> | null>(null);
  const [tick, setTick] = useState(0);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [paste, setPaste] = useState<PasteState>(EMPTY_PASTE);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setPaste({ ...EMPTY_PASTE, ...(JSON.parse(raw) as Partial<PasteState>) });
    } catch {
      /* fresh device */
    }
  }, []);
  const savePaste = (p: PasteState) => {
    setPaste(p);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(p));
    } catch {
      /* storage blocked — session-only */
    }
  };

  useEffect(() => {
    let dead = false;

    async function findEventId(): Promise<number | null> {
      if (eventIdRef.current) return eventIdRef.current;
      const year = new Date().getFullYear();
      const r = await fetch(
        `${STATS}/schedule?sportId=1&startDate=${year}-07-01&endDate=${year}-07-31&scheduleTypes=events`,
      );
      if (!r.ok) throw new Error(`schedule ${r.status}`);
      const j = (await r.json()) as { dates?: { events?: { id: number; name?: string }[] }[] };
      // MLB also schedules rehearsals ("Home Run Derby Test #3") and the
      // workout day — only the real event will do
      const candidates: { id: number; name: string }[] = [];
      for (const d of j.dates ?? [])
        for (const e of d.events ?? []) {
          const n = e.name ?? "";
          if (/home run derby/i.test(n) && !/workout|batting practice|test/i.test(n)) candidates.push({ id: e.id, name: n });
        }
      const exact = candidates.find((c) => /^\d{4} MLB Home Run Derby$/i.test(c.name.trim()));
      const pick = exact ?? candidates[0] ?? null;
      if (pick) eventIdRef.current = pick.id;
      return pick?.id ?? null;
    }

    async function load() {
      try {
        if (!priorsRef.current) {
          const [pr, sd] = await Promise.all([fetch("/model/priors.json"), fetch("/model/derby-odds.json")]);
          priorsRef.current = pr.ok ? ((await pr.json()) as { batters?: Record<string, PriorsBatter> }).batters ?? {} : {};
          if (sd.ok && !dead) setSeed((await sd.json()) as DerbySeed);
        }
        const id = await findEventId();
        if (dead) return;
        if (!id) {
          setErr("no-derby");
          setLoading(false);
          return;
        }
        const r = await fetch(`${STATS}/homeRunDerby/${id}`);
        if (!r.ok) throw new Error(`derby ${r.status}`);
        const parsed = parseDerby(await r.json());
        if (dead) return;
        if (!parsed) {
          setErr("bad-payload");
          setLoading(false);
          return;
        }
        const hitters = buildHitters(parsed.players, priorsRef.current);
        setData({ state: { ...parsed, hitters } });
        setErr(null);
        setLoading(false);
      } catch (e) {
        if (!dead) {
          setErr(String(e));
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      dead = true;
    };
  }, [tick]);

  // live polling: every 20s while the event is near/in progress and not Final
  useEffect(() => {
    if (!data) return;
    const { state } = data;
    if (state.state === "Final") return;
    const evT = Date.parse(state.dateIso);
    const near = isFinite(evT) && Math.abs(Date.now() - evT) < 12 * 3600 * 1000;
    if (!near) return;
    const t = setTimeout(() => setTick((x) => x + 1), 20000);
    return () => clearTimeout(t);
  }, [data]);

  const state = data?.state ?? null;

  // sim key: model inputs only — live polls must not re-run the tournament
  const simKey = state
    ? `${state.id}|${state.rounds.map((r) => r.swings).join(",")}|${state.hitters.map((h) => `${h.id}:${h.hrPerSwing.toFixed(4)}`).join(",")}`
    : "";
  const draws = useMemo(() => {
    if (!state) return null;
    if (drawsCache?.key === simKey) return drawsCache.draws;
    const d = simDerbyDraws(state, { n: DERBY_SIM_N });
    drawsCache = { key: simKey, draws: d };
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simKey]);
  const sim = useMemo(() => (state && draws ? aggregateDraws(state, draws) : null), [state, draws]);

  const parsed = useMemo(() => {
    const hitters = state?.hitters ?? [];
    return {
      winner: parseWinnerOdds(paste.winner, hitters),
      h2h: parseH2HOdds(paste.h2h, hitters),
      totals: parseTotalOdds(paste.totals, hitters),
    };
  }, [state, paste]);

  const legs = useMemo(() => {
    if (!state || !draws) return [];
    const book: DerbyBook = seed ? seedToBook(seed, state.hitters) : {};
    // fresh paste overrides its seed section (prices move all day)
    if (parsed.winner.quotes.length) book.winner = parsed.winner.quotes;
    if (parsed.h2h.quotes.length) book.h2h = parsed.h2h.quotes;
    if (parsed.totals.quotes.length) {
      book.totals = parsed.totals.quotes;
      book.totalsScope = paste.scope === "r1" ? "r1" : "event";
    }
    return priceDerbyLegs(draws, state.hitters, book);
  }, [state, draws, seed, parsed, paste.scope]);

  const bankroll = mounted ? getMoney().bankroll : 750;

  const parlays = useMemo(() => {
    if (!draws) return [];
    // kind filter + Josh's rule: no winner legs from the market's bottom
    // quartile (the least likely champions never anchor a ticket)
    const pool = parlayPool(legs);
    if (pool.length < 2) return [];
    // wide net: the UI splits book-friendly vs correlated (SGP) groups and
    // slices each — both groups need representation regardless of EV rank
    return derbyParlays(draws, pool, { bankroll, top: 200 });
  }, [draws, legs, bankroll]);

  return {
    loading,
    err,
    refresh: () => setTick((x) => x + 1),
    state,
    sim,
    draws,
    paste,
    savePaste,
    parsed,
    legs,
    parlays,
    bankroll,
    anyOdds: legs.length > 0,
    seed,
  };
}
