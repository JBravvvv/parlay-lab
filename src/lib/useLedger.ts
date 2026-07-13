"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getEngine } from "./engine-client";

export type DayStat = {
  date: string;
  staked: number;
  ret: number;
  pending: number;
  ungradable: number;
  w: number;
  l: number;
  p: number;
  n: number;
  pl: number;
  cumPl: number;
  cumRoi: number | null;
};

export type LedgerStats = {
  days: DayStat[];
  staked: number;
  ret: number;
  pl: number;
  roi: number | null;
  dd: number;
  w: number;
  l: number;
  push: number;
  pending: number;
  ungradable: number;
  bigHit: { payout: number; name: string; date: string } | null;
};

export type Projection = {
  days: number;
  dayAmt: number;
  base: number;
  lo: number[];
  mid: number[];
  hi: number[];
  endLo: number;
  endMid: number;
  endHi: number;
} | null;

export type LedgerEntry = {
  date: string;
  locked: boolean;
  lateLock?: boolean;
  daily: number;
  fun: number;
  cardEv?: number;
  core: LedgerTicket[];
  funT: LedgerTicket[];
  grading?: { tickets: Record<string, TicketGrade>; legs: Record<string, { result: string; detail: string }>; done: boolean } | null;
  clv?: Record<string, { am: number; at: number }>;
  [k: string]: unknown;
};
export type LedgerTicket = {
  id: string;
  bucket: string;
  name: string;
  tier?: string;
  stake: number;
  czOdds?: string | number;
  czDec?: number;
  prob?: number;
  czEv?: number | null;
  confirmed?: number | null;
  legs: { label: string; prop: string; cz?: number | null }[];
};
export type TicketGrade = { result: string; payout: number; dec?: number; detail?: string };

/** Everything the Ledger/Dashboard need, recomputed when `bump` changes. */
export function useLedger() {
  const [v, setV] = useState(0);
  const refresh = useCallback(() => setV((x) => x + 1), []);
  // The engine reads localStorage, which only exists on the client — stay
  // null until mounted so the first client render matches the SSR HTML
  // (otherwise Next reports a hydration mismatch on every ledger-fed page).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const eng = mounted ? getEngine() : null;

  const api = useMemo(() => {
    if (!eng) return null;
    const stats = (scope: "all" | "core" | "fun") =>
      eng.get<(s: string) => LedgerStats>("shLedgerStats")(scope);
    return {
      entries: eng.get<() => LedgerEntry[]>("shLedger")().filter((e) => e.locked),
      stats,
      clv: eng.get<() => { tot: number; sighted: number; avg: number | null }>("shClvStats")(),
      projection: eng.get<() => Projection>("shProjection")(),
      seed: eng.get<string>("SH_LEDGER_SEED"),
      grade: () => eng.get<() => Promise<number>>("shGrade")().then((n) => (refresh(), n)),
      importText: (txt: string) => {
        eng.get<(t: string) => unknown>("shLedgerImport")(txt);
        refresh();
      },
      exportText: () => JSON.stringify(eng.get<() => LedgerEntry[]>("shLedger")(), null, 2),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eng, v]);

  return { api, refresh };
}

export function roiPct(roi: number | null): string {
  return roi == null ? "—" : `${roi >= 0 ? "+" : ""}${(roi * 100).toFixed(1)}%`;
}
