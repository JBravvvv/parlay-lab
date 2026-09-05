"use client";

import { useSyncExternalStore } from "react";

/**
 * THE SPORT SWITCH (INSTRUCTION 38, 2026-09-05): one app-wide selector — MLB or College
 * Football — that every desk page reads. "EVERYTHING for College Football (CFB) should be
 * SEPARATE": flipping the switch swaps the Board, Builder, Parlay Builder, Ledger, The Sharp,
 * Games and Stats to the CFB desk, which has its own model, tickets, ledger, bank and
 * allotment. The MLB desk is untouched underneath.
 *
 * Persisted per device under `pl_sport`. Read through useSyncExternalStore with an "mlb"
 * server snapshot so the first client render matches SSR (the hydration rule).
 */
export type Sport = "mlb" | "cfb";

export const SPORT_KEY = "pl_sport";
export const SPORT_EVENT = "pl:sport";

export const SPORT_META: Record<Sport, { label: string; short: string; emoji: string; eyebrow: string; feed: string }> = {
  mlb: { label: "MLB", short: "MLB", emoji: "⚾", eyebrow: "Major League Baseball", feed: "official MLB box scores" },
  cfb: { label: "College Football", short: "CFB", emoji: "🏈", eyebrow: "College Football · FBS", feed: "ESPN final scores" },
};

export const SPORTS: readonly Sport[] = ["mlb", "cfb"] as const;

export function isSport(x: unknown): x is Sport {
  return x === "mlb" || x === "cfb";
}

export function getSport(): Sport {
  try {
    const v = localStorage.getItem(SPORT_KEY);
    return isSport(v) ? v : "mlb";
  } catch {
    return "mlb";
  }
}

export function setSport(s: Sport) {
  try {
    localStorage.setItem(SPORT_KEY, s);
  } catch {
    /* private mode — the switch still applies for this page life */
  }
  cached = s;
  window.dispatchEvent(new CustomEvent(SPORT_EVENT));
}

let cached: Sport | null = null;
function snapshot(): Sport {
  if (cached == null) cached = getSport();
  return cached;
}
function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === SPORT_KEY) {
      cached = getSport();
      cb();
    }
  };
  window.addEventListener(SPORT_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(SPORT_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** The selected sport; "mlb" on the server and during hydration. */
export function useSport(): Sport {
  return useSyncExternalStore(subscribe, snapshot, () => "mlb");
}
