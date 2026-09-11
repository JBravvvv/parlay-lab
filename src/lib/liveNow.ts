"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { currentValue, type Boxscore, type GameStatus } from "@/engine2/grade";

/**
 * Live in-game stats for legs/picks (2026-07-21): while a game is IN PROGRESS,
 * every surface can show a leg's current number ("now 1 H+R+RBI · Bot 5").
 *
 * Free MLB statsapi, client-side (same as the rest of the stats plumbing):
 * one schedule call per involved date to learn state/score/inning, then one
 * boxscore call per LIVE game only. Polls every 60s while anything is live,
 * every 5 minutes otherwise; stops entirely when every game is final.
 * Honest by construction: no boxscore appearance → no number, never a 0.
 * Each read carries both the display text and the raw tally (`val`), so callers can
 * compare the live number to a leg's line without re-deriving it (INSTRUCTION 50).
 */

export type GameNow = {
  pk: number;
  state: string;
  live: boolean;
  final: boolean;
  away: number | null;
  home: number | null;
  inning: string | null; // "Bot 5"
};

/**
 * INSTRUCTION 50 (2026-09-11, Josh's word, verbatim: "it will show the player is top 4th
 * w/ 3 H+R+RBI, but show them as an 'S' grade for over .5 H+R+RBI") — `val` is the same
 * live tally `txt` renders, kept as a NUMBER so a surface can compare it to the leg's
 * line (see `legSettled` in src/lib/leg-settled.ts) instead of printing the two side by
 * side and never relating them. Additive: every existing reader of `txt`/`inning` is
 * unchanged, and no extra network call — this rides the boxscore already polled below.
 * `val` is null for ml_/rl_ legs (a score is not a counting stat) and the whole read
 * stays null for a player with no boxscore appearance, so `val: 0` only ever means a
 * real, observed zero.
 */
export type LegNow = {
  txt: string;
  inning: string | null;
  val: number | null;
  /**
   * The game is OVER and this is its closing number, not a live one (INSTRUCTION 50 fix
   * pass). Optional so every existing constructor of a LegNow still type-checks; absent
   * means "in progress", which is what every pre-existing caller assumed.
   */
  final?: boolean;
};

type SchedGame = {
  gamePk: number;
  status?: { abstractGameState?: string; detailedState?: string };
  teams?: { away?: { score?: number }; home?: { score?: number } };
  linescore?: { currentInning?: number; currentInningOrdinal?: string; inningHalf?: string };
};

const API = "https://statsapi.mlb.com/api/v1";
const MAX_BOXES = 16;

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

function inningTxt(ls?: SchedGame["linescore"]): string | null {
  if (!ls?.currentInningOrdinal) return null;
  const half = ls.inningHalf ? `${ls.inningHalf.slice(0, 3)} ` : "";
  return `${half}${ls.currentInningOrdinal}`.trim();
}

export type LiveNowReq = { pk?: number | null; date?: string | null };

export type LiveNowRead = {
  at: number;
  games: Record<number, GameNow>;
  liveCount: number;
  /** Current number for a leg, only while its game is live. */
  legNow: (pk: number | null | undefined, lkey: string | null | undefined) => LegNow | null;
};

export function useLiveNow(reqs: LiveNowReq[]): LiveNowRead {
  const [snap, setSnap] = useState<{ at: number; games: Record<number, GameNow>; boxes: Record<number, Boxscore> }>({
    at: 0,
    games: {},
    boxes: {},
  });
  // identity key: the set of pks + dates actually requested
  const pks = useMemo(
    () => [...new Set(reqs.map((r) => r.pk).filter((p): p is number => p != null && isFinite(p)))].sort((a, b) => a - b),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(reqs.map((r) => r.pk ?? null))],
  );
  const dates = useMemo(
    () => {
      const ds = new Set<string>();
      for (const r of reqs) {
        const d = r.date ? r.date.slice(0, 10) : null;
        ds.add(d ?? new Date().toISOString().slice(0, 10));
      }
      return [...ds].sort().slice(0, 4); // safety cap
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(reqs.map((r) => r.date ?? null))],
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* the latest snapshot, readable inside the tick without re-arming the effect */
  const snapRef = useRef(snap);
  snapRef.current = snap;

  useEffect(() => {
    if (!pks.length) return;
    let alive = true;

    const tick = async () => {
      const wanted = new Set(pks);
      const games: Record<number, GameNow> = {};
      for (const d of dates) {
        const j = await getJson<{ dates?: { games?: SchedGame[] }[] }>(
          `${API}/schedule?sportId=1&date=${d}&hydrate=linescore`,
        );
        for (const day of j?.dates ?? []) {
          for (const g of day.games ?? []) {
            if (!wanted.has(g.gamePk)) continue;
            const st = g.status?.detailedState ?? "";
            const abs = g.status?.abstractGameState ?? "";
            games[g.gamePk] = {
              pk: g.gamePk,
              state: st,
              live: abs === "Live" || /in progress|delayed/i.test(st),
              final: /final|game over|completed/i.test(st),
              away: g.teams?.away?.score ?? null,
              home: g.teams?.home?.score ?? null,
              inning: inningTxt(g.linescore),
            };
          }
        }
      }
      /* LIVE FIRST, THEN FINALS (INSTRUCTION 50 fix pass). The settled read used to evaporate
         the moment a game ended: `legNow` served only live games, so at 10pm a leg that was
         correctly marked SETTLED at 7pm got its manufactured pregame grade back. A final
         boxscore is a REAL read — the tally is simply frozen — so it keeps being served, with
         no inning. Live games are fetched first so the MAX_BOXES cap can never cost a live
         read to pay for a finished one, and the previous snapshot's boxes are carried over so
         a game that went final between two ticks keeps the number it ended on. */
      const boxes: Record<number, Boxscore> = { ...snapRef.current.boxes };
      const order = [
        ...Object.values(games).filter((g) => g.live).map((g) => g.pk),
        ...Object.values(games).filter((g) => !g.live && g.final).map((g) => g.pk),
      ].slice(0, MAX_BOXES);
      const livePks = Object.values(games).filter((g) => g.live).map((g) => g.pk).slice(0, MAX_BOXES);
      for (const pk of order) {
        /* a final game already in hand does not need re-reading — its number cannot change */
        if (!games[pk]?.live && boxes[pk]) continue;
        const bx = await getJson<Boxscore>(`${API}/game/${pk}/boxscore`);
        if (bx) boxes[pk] = bx;
      }
      if (!alive) return;
      setSnap({ at: Date.now(), games, boxes });
      const anyLive = livePks.length > 0;
      const allFinal = Object.values(games).length > 0 && Object.values(games).every((g) => g.final);
      if (allFinal) return; // nothing left to watch
      timer.current = setTimeout(tick, anyLive ? 60_000 : 300_000);
    };

    void tick();
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pks.join(","), dates.join(",")]);

  return useMemo(() => {
    const legNow = (pk: number | null | undefined, lkey: string | null | undefined): LegNow | null => {
      if (pk == null || !lkey) return null;
      const g = snap.games[pk];
      if (!g || (!g.live && !g.final)) return null;
      const status: GameStatus = { state: g.state, away: g.away, home: g.home };
      const cur = currentValue(lkey, status, snap.boxes[pk] ?? null);
      if (!cur) return null;
      /* a finished game reports no inning — `nowLabel` already tolerates a null one */
      return g.live
        ? { txt: cur.txt, inning: g.inning, val: cur.val }
        : { txt: cur.txt, inning: null, val: cur.val, final: true };
    };
    return {
      at: snap.at,
      games: snap.games,
      liveCount: Object.values(snap.games).filter((g) => g.live).length,
      legNow,
    };
  }, [snap]);
}

/** Shared inline chip so every surface renders the live number identically. */
export function nowLabel(n: LegNow): string {
  return `${n.final ? "final" : "now"} ${n.txt}${n.inning ? ` · ${n.inning}` : ""}`;
}

/* ------------------------------------------------ leg phase (INSTRUCTION 46) */

export type LegPhase = "pre" | "live" | "final";

/**
 * INSTRUCTION 46 (2026-09-08, Josh's word, verbatim: "clicking the players name in the bet
 * which should take you to that bet if it is currently available pregame or live") — is a
 * ledger leg's game still open for a bet? Decided from what the Ledger already knows:
 *   - a fully graded day, or a leg already graded won/lost/push/void → "final"
 *   - the schedule says the game is final → "final"; in progress → "live"
 *   - otherwise (not started, or the schedule has not answered yet) → "pre"
 * Additive helper; the polling hook above is untouched.
 */
export function legPhase(g: GameNow | null | undefined, legResult?: string | null, dayDone?: boolean): LegPhase {
  if (dayDone) return "final";
  if (legResult === "won" || legResult === "lost" || legResult === "push" || legResult === "void") return "final";
  if (g?.final) return "final";
  if (g?.live) return "live";
  return "pre";
}
