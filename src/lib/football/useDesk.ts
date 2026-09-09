"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ptToday } from "@/components/games/logo";
import type { DeskClient, DeskStore } from "@/lib/football/league";
import type { CfbSlate } from "@/lib/cfb/types";

/**
 * THE FOOTBALL DESK HOOKS, PARAMETERISED (2026-09-08, the NFL build; originally INSTRUCTION 38,
 * 2026-09-05, moved out of CfbBoard.tsx when the Board became the picks + parlays surface). Board,
 * Games, Sharp, Builder and the sandbox of ONE desk share one date, one bankroll and one cached
 * slate query per (date, bankroll); the desk's client, store and bank base come in as `h`, so the
 * NFL and CFB desks run the same hook body against their own feeds and their own device record.
 *
 * src/lib/cfb/useCfbDesk.ts keeps `useCfbDesk()` / `useCfbBankroll()` as thin calls into these
 * with the CFB handles; src/lib/nfl/useNflDesk.ts does the same with the NFL handles.
 */

export type DeskHookHandles = { client: DeskClient; store: DeskStore; bankBase: number };

/** The desk's bankroll off its device store — null until mount so SSR and the first client
    render agree (the slate query waits for it, so the first fetch carries the real figure). */
export function useBankrollOf(store: DeskStore): number | null {
  const [bankroll, setBankroll] = useState<number | null>(null);
  const { CHANGE_EVENT, SYNC_EVENT, getBankroll } = store;
  useEffect(() => {
    const read = () => setBankroll(getBankroll());
    read();
    window.addEventListener(CHANGE_EVENT, read);
    window.addEventListener(SYNC_EVENT, read);
    return () => {
      window.removeEventListener(CHANGE_EVENT, read);
      window.removeEventListener(SYNC_EVENT, read);
    };
  }, [CHANGE_EVENT, SYNC_EVENT, getBankroll]);
  return bankroll;
}

/**
 * Date + slate for a desk. The date starts on today (Pacific) and, once today's slate arrives
 * empty, advances ONCE to the first later slate date the odds feed lists — Friday shows
 * Saturday's board, Tuesday shows Thursday night's — unless the user has already picked a date.
 * The rail is the union of today, the picked date and every slate date the feed has reported, so
 * it never shrinks while a new date loads. While any game is live the slate refetches every cache
 * window.
 */
export function useDeskOf(h: DeskHookHandles) {
  const { client, store, bankBase } = h;
  const today = useMemo(ptToday, []);
  const [date, setDate] = useState(today);
  const [picked, setPicked] = useState(false);
  const bankroll = useBankrollOf(store);
  const [known, setKnown] = useState<string[]>([]);

  const q = useQuery<CfbSlate>({
    queryKey: client.queryKey(date, bankroll ?? bankBase),
    queryFn: () => client.loadSlate(date, { bankroll: bankroll ?? undefined }),
    staleTime: client.STALE_MS,
    retry: 1,
    enabled: bankroll != null,
    refetchInterval: (query) => (query.state.data?.games.some((g) => g.status === "live") ? client.STALE_MS : false),
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
