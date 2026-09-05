"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ptToday } from "@/components/games/logo";
import { CFB_STALE_MS, cfbQueryKey, loadCfbSlate } from "@/lib/cfb/client";
import { CFB_BANK_BASE } from "@/lib/cfb/rules";
import { CFB_CHANGE_EVENT, CFB_SYNC_EVENT, getCfbBankroll } from "@/lib/cfb/store";
import type { CfbGame, CfbRow, CfbSlate, CfbTeam } from "@/lib/cfb/types";
import { gradeRank } from "@/lib/grade";

/**
 * THE CFB DESK HOOKS (INSTRUCTION 38, 2026-09-05; moved out of CfbBoard.tsx when the Board
 * became the picks + parlays surface). Board, Games, Sharp, Builder and the sandbox share
 * one date, one bankroll and one cached slate query per (date, bankroll).
 */

/** The CFB bankroll off the device store — null until mount so SSR and the first client
    render agree (the slate query waits for it, so the first fetch carries the real figure). */
export function useCfbBankroll(): number | null {
  const [bankroll, setBankroll] = useState<number | null>(null);
  useEffect(() => {
    const read = () => setBankroll(getCfbBankroll());
    read();
    window.addEventListener(CFB_CHANGE_EVENT, read);
    window.addEventListener(CFB_SYNC_EVENT, read);
    return () => {
      window.removeEventListener(CFB_CHANGE_EVENT, read);
      window.removeEventListener(CFB_SYNC_EVENT, read);
    };
  }, []);
  return bankroll;
}

/**
 * Date + slate for the CFB desk. The date starts on today (Pacific) and, once today's slate
 * arrives empty, advances ONCE to the first later slate date the odds feed lists — Friday
 * shows Saturday's board — unless the user has already picked a date. The rail is the union
 * of today, the picked date and every slate date the feed has reported, so it never shrinks
 * while a new date loads. While any game is live the slate refetches every cache window.
 */
export function useCfbDesk() {
  const today = useMemo(ptToday, []);
  const [date, setDate] = useState(today);
  const [picked, setPicked] = useState(false);
  const bankroll = useCfbBankroll();
  const [known, setKnown] = useState<string[]>([]);

  const q = useQuery<CfbSlate>({
    queryKey: cfbQueryKey(date, bankroll ?? CFB_BANK_BASE),
    queryFn: () => loadCfbSlate(date, { bankroll: bankroll ?? undefined }),
    staleTime: CFB_STALE_MS,
    retry: 1,
    enabled: bankroll != null,
    refetchInterval: (query) => (query.state.data?.games.some((g) => g.status === "live") ? CFB_STALE_MS : false),
  });

  const slate = q.data;
  useEffect(() => {
    if (!slate) return;
    setKnown((prev) => {
      const next = new Set(prev);
      for (const d of slate.slateDates) next.add(d);
      return next.size === prev.length ? prev : [...next].sort();
    });
  }, [slate]);

  const advanced = useRef(false);
  useEffect(() => {
    if (advanced.current || picked || !slate || slate.date !== today) return;
    advanced.current = true;
    if (slate.games.length > 0) return;
    const next = slate.slateDates.find((d) => d > today);
    if (next) setDate(next);
  }, [slate, picked, today]);

  const rail = useMemo(() => [...new Set([today, date, ...known])].sort(), [today, date, known]);
  const pick = useCallback((d: string) => {
    setPicked(true);
    setDate(d);
  }, []);

  return { today, date, pick, rail, bankroll, q, slate };
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
