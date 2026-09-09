"use client";

import { useBankrollOf, useDeskOf, type DeskHookHandles } from "@/lib/football/useDesk";
import {
  CFB_STALE_MS,
  CFB_PROPS_STALE_MS,
  cfbQueryKey,
  cfbPropsQueryKey,
  loadCfbSlate,
  loadCfbFinals,
  loadCfbProps,
  cfbPropsStaleMs,
  cfbCacheLabel,
  cfbPricedAtLabel,
} from "@/lib/cfb/client";
import { CFB_BANK_BASE } from "@/lib/cfb/rules";
import { CFB_STORE } from "@/lib/cfb/store";
import type { CfbGame, CfbRow, CfbTeam } from "@/lib/cfb/types";
import { gradeRank } from "@/lib/grade";

/**
 * THE CFB DESK HOOKS (INSTRUCTION 38, 2026-09-05; moved out of CfbBoard.tsx when the Board
 * became the picks + parlays surface). Board, Games, Sharp, Builder and the sandbox share
 * one date, one bankroll and one cached slate query per (date, bankroll).
 *
 * SINCE 2026-09-08 (the NFL build) the hook bodies live in src/lib/football/useDesk.ts as
 * `useDeskOf` / `useBankrollOf`; the two hooks below are the CFB bindings, built from the CFB
 * client and device store DIRECTLY (not from src/lib/cfb/desk.ts, which imports this file — the
 * CFB_DESK handle object is assembled there from these same exports).
 */

const CFB_HANDLES: DeskHookHandles = {
  client: {
    STALE_MS: CFB_STALE_MS,
    PROPS_STALE_MS: CFB_PROPS_STALE_MS,
    queryKey: cfbQueryKey,
    propsQueryKey: cfbPropsQueryKey,
    loadSlate: loadCfbSlate,
    loadFinals: loadCfbFinals,
    loadProps: loadCfbProps,
    propsStaleMs: cfbPropsStaleMs,
    cacheLabel: cfbCacheLabel,
    pricedAtLabel: cfbPricedAtLabel,
  },
  store: CFB_STORE,
  bankBase: CFB_BANK_BASE,
};

/** The CFB bankroll off the device store — null until mount so SSR and the first client
    render agree (the slate query waits for it, so the first fetch carries the real figure). */
export function useCfbBankroll(): number | null {
  return useBankrollOf(CFB_STORE);
}

/**
 * Date + slate for the CFB desk. The date starts on today (Pacific) and, once today's slate
 * arrives empty, advances ONCE to the first later slate date the odds feed lists — Friday
 * shows Saturday's board — unless the user has already picked a date. The rail is the union
 * of today, the picked date and every slate date the feed has reported, so it never shrinks
 * while a new date loads. While any game is live the slate refetches every cache window.
 */
export function useCfbDesk() {
  return useDeskOf(CFB_HANDLES);
}


/* ---------- the ranked side rows (The Sharp reads these) ---------- */

export type BoardRow = { row: CfbRow; game: CfbGame; team: CfbTeam | null };

/** Every priced side on the slate, ranked S → F (grade, then EV at Caesars, then fair). Sides
    without a Caesars quote sort last — they carry no EV and no grade. */
export function rankRows(games: CfbGame[]): BoardRow[] {
  const out: BoardRow[] = [];
  for (const game of games) {
    for (const row of game.rows) {
      out.push({ row, game, team: row.teamId == null ? null : row.teamId === game.home.id ? game.home : game.away });
    }
  }
  return out.sort((a, b) => {
    const g = gradeRank(b.row.grade) - gradeRank(a.row.grade);
    if (g !== 0) return g;
    const e = (b.row.evCz ?? -Infinity) - (a.row.evCz ?? -Infinity);
    if (e !== 0) return e;
    return b.row.fair - a.row.fair;
  });
}

/** Team search: school name, short name or abbreviation of either side (case-insensitive). */
export function gameMatches(g: CfbGame, needle: string): boolean {
  if (!needle) return true;
  const hay = [g.home.name, g.home.short, g.home.abbr, g.away.name, g.away.short, g.away.abbr].join(" ").toLowerCase();
  return hay.includes(needle);
}

/** "Sep 4" from ESPN's FPI lastUpdated ISO stamp; the raw string when it does not parse. */
export function fpiStamp(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric" }).format(new Date(t));
}
