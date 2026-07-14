"use client";

/* Shared data hook for the All-Star Game desk (Board / Sharp / Builder all
   read the same assembled market). Sources:
   - The Odds API (through /api/odds, key server-side): ML, F3, F5, totals,
     batter HR props — the event id is discovered from the events list (free
     endpoint), never hardcoded.
   - statsapi feed/live: rosters with REAL season HR/PA + announced batting
     orders, game status and first-pitch time. Free, keyless, CORS-friendly.
   - localStorage: pasted Caesars boards (correct score / extra HR props) and
     the desk's Daily/Fun stakes (its own key — locking the MLB card must
     never consume ASG money). */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AsgBook,
  type AsgFairs,
  type AsgLeg,
  type AsgPlayer,
  type OddsEventJson,
  type SimOut,
  asgFairs,
  calibrateSim,
  parseAsgOdds,
  parseCaesarsBoard,
  priceAsgLegs,
} from "@/engine2/allstar";

const MARKETS =
  "h2h,totals,h2h_1st_3_innings,totals_1st_3_innings,h2h_1st_5_innings,totals_1st_5_innings,batter_home_runs";
const PASTE_KEY = "pl_asgPaste";
export const MONEY_KEY = "pl_asgMoney";

/** One paste, the whole Caesars ASG board — the router sorts the lines. */
export type AsgPaste = { board: string };
export const EMPTY_PASTE: AsgPaste = { board: "" };

export type AsgMeta = {
  eventName: string;
  venue: string | null;
  startEt: string | null;
  status: string | null;
};

export type AsgMarket = {
  loading: boolean;
  err: string | null;
  meta: AsgMeta | null;
  book: AsgBook | null;
  fairs: AsgFairs | null;
  sim: SimOut | null;
  players: AsgPlayer[];
  legs: AsgLeg[];
  paste: AsgPaste;
  savePaste: (p: AsgPaste) => void;
  refresh: () => void;
};

/* module caches — one fetch/sim feeds every tab that mounts */
let cacheBook: { book: AsgBook; at: number } | null = null;
let cachePlayers: { players: AsgPlayer[]; meta: AsgMeta; at: number } | null = null;
const simCache = new Map<string, SimOut>();
const CACHE_MS = 4 * 60_000;

const oddsUrl = (path: string) => `/api/odds?u=${encodeURIComponent(`https://api.the-odds-api.com${path}`)}`;

async function fetchBook(): Promise<AsgBook> {
  if (cacheBook && Date.now() - cacheBook.at < CACHE_MS) return cacheBook.book;
  const evR = await fetch(oddsUrl("/v4/sports/baseball_mlb/events"));
  if (!evR.ok) throw new Error(`events feed ${evR.status}`);
  const events = (await evR.json()) as { id: string; home_team: string; away_team: string }[];
  const asg = events.find(
    (e) => /american league/i.test(`${e.home_team} ${e.away_team}`) && /national league/i.test(`${e.home_team} ${e.away_team}`),
  );
  if (!asg) throw new Error("No All-Star Game in the odds feed");
  const r = await fetch(
    oddsUrl(`/v4/sports/baseball_mlb/events/${asg.id}/odds?regions=us,eu&markets=${MARKETS}&oddsFormat=american`),
  );
  if (!r.ok) throw new Error(`odds feed ${r.status}`);
  const book = parseAsgOdds((await r.json()) as OddsEventJson);
  cacheBook = { book, at: Date.now() };
  return book;
}

async function fetchPlayers(): Promise<{ players: AsgPlayer[]; meta: AsgMeta }> {
  if (cachePlayers && Date.now() - cachePlayers.at < CACHE_MS * 3) return cachePlayers;
  const et = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const schedR = await fetch(
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${et}&endDate=${et}&gameType=A`,
  );
  if (!schedR.ok) throw new Error(`statsapi schedule ${schedR.status}`);
  const sched = (await schedR.json()) as {
    dates?: { games?: { gamePk: number }[] }[];
  };
  const gamePk = sched.dates?.[0]?.games?.[0]?.gamePk;
  if (!gamePk) throw new Error("No All-Star Game on today's schedule");

  const feedR = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`);
  if (!feedR.ok) throw new Error(`statsapi feed ${feedR.status}`);
  const feed = (await feedR.json()) as {
    gameData?: {
      teams?: { away?: { name?: string }; home?: { name?: string } };
      venue?: { name?: string };
      datetime?: { dateTime?: string };
      status?: { detailedState?: string };
    };
    liveData?: {
      boxscore?: {
        teams?: Record<
          "away" | "home",
          {
            team?: { name?: string };
            players?: Record<
              string,
              {
                person?: { id?: number; fullName?: string };
                battingOrder?: string;
                seasonStats?: { batting?: { homeRuns?: number; plateAppearances?: number } };
              }
            >;
          }
        >;
      };
    };
  };

  const players: AsgPlayer[] = [];
  const box = feed.liveData?.boxscore?.teams;
  for (const sideKey of ["away", "home"] as const) {
    const t = box?.[sideKey];
    const side = /american/i.test(t?.team?.name ?? "") ? "AL" : "NL";
    for (const p of Object.values(t?.players ?? {})) {
      const id = p.person?.id;
      const name = p.person?.fullName;
      const bat = p.seasonStats?.batting;
      if (!id || !name) continue;
      const orderRaw = Number(p.battingOrder ?? NaN);
      players.push({
        id,
        name,
        side,
        order: Number.isFinite(orderRaw) && orderRaw >= 100 ? Math.round(orderRaw / 100) : null,
        hr: bat?.homeRuns ?? 0,
        pa: bat?.plateAppearances ?? 0,
      });
    }
  }

  const dt = feed.gameData?.datetime?.dateTime;
  const meta: AsgMeta = {
    eventName: "MLB All-Star Game",
    venue: feed.gameData?.venue?.name ?? null,
    startEt: dt
      ? new Date(dt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZoneName: "short" })
      : null,
    status: feed.gameData?.status?.detailedState ?? null,
  };
  const out = { players, meta, at: Date.now() };
  cachePlayers = out;
  return out;
}

function calibrated(fairs: AsgFairs): SimOut | null {
  if (!fairs.ml || !fairs.total) return null;
  const key = `${fairs.ml.pAL.toFixed(3)}|${fairs.total.point}|${fairs.total.pOver.toFixed(3)}`;
  let sim = simCache.get(key);
  if (!sim) {
    sim = calibrateSim(fairs.ml.pAL, fairs.total.point, fairs.total.pOver);
    simCache.set(key, sim);
  }
  return sim;
}

export function useAllStar(): AsgMarket {
  const [book, setBook] = useState<AsgBook | null>(null);
  const [players, setPlayers] = useState<AsgPlayer[]>([]);
  const [meta, setMeta] = useState<AsgMeta | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const [paste, setPaste] = useState<AsgPaste>(EMPTY_PASTE);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PASTE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<AsgPaste> & { scores?: string; hr?: string };
        // migrate the short-lived two-box shape into the single board paste
        const board = saved.board ?? [saved.scores, saved.hr].filter(Boolean).join("\n");
        setPaste({ board: board ?? "" });
      }
    } catch {
      /* fresh device */
    }
  }, []);
  const savePaste = useCallback((p: AsgPaste) => {
    setPaste(p);
    try {
      localStorage.setItem(PASTE_KEY, JSON.stringify(p));
    } catch {
      /* storage blocked — session-only */
    }
  }, []);

  useEffect(() => {
    let dead = false;
    setLoading(true);
    setErr(null);
    Promise.all([fetchBook(), fetchPlayers()])
      .then(([b, pl]) => {
        if (dead) return;
        setBook(b);
        setPlayers(pl.players);
        setMeta(pl.meta);
      })
      .catch((e: unknown) => {
        if (!dead) setErr(e instanceof Error ? e.message : "load failed");
      })
      .finally(() => {
        if (!dead) setLoading(false);
      });
    return () => {
      dead = true;
    };
  }, [tick]);

  const refresh = useCallback(() => {
    cacheBook = null;
    cachePlayers = null;
    setTick((t) => t + 1);
  }, []);

  const fairs = book ? asgFairs(book) : null;
  const sim = fairs ? calibrated(fairs) : null;
  const parsed = parseCaesarsBoard(paste.board);
  const legs = book && fairs ? priceAsgLegs(book, fairs, sim, players, parsed.scores, parsed.hr) : [];

  // keep a stable reference across renders when inputs haven't changed
  const legsRef = useRef<AsgLeg[]>([]);
  const sig = legs.map((l) => `${l.key}:${l.odds}:${l.ev.toFixed(4)}`).join("|");
  const sigRef = useRef("");
  if (sig !== sigRef.current) {
    sigRef.current = sig;
    legsRef.current = legs;
  }

  return { loading, err, meta, book, fairs, sim, players, legs: legsRef.current, paste, savePaste, refresh };
}
