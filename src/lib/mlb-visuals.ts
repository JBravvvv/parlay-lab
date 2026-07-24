"use client";

import { useEffect, useState } from "react";

/**
 * Parlay Builder sandbox — team logos + player headshots (display only).
 * Logos: ESPN CDN by team code (same source the Stats tab uses). Headshots:
 * MLB's official photo CDN by personId; ids resolve once through statsapi
 * people-search (free, keyless, CORS-open — the same feed the grader uses)
 * and cache in localStorage so a name is never looked up twice.
 */

const TEAM_AB: Record<string, string> = {
  "Arizona Diamondbacks": "ari",
  "Atlanta Braves": "atl",
  "Baltimore Orioles": "bal",
  "Boston Red Sox": "bos",
  "Chicago Cubs": "chc",
  "Chicago White Sox": "chw",
  "Cincinnati Reds": "cin",
  "Cleveland Guardians": "cle",
  "Colorado Rockies": "col",
  "Detroit Tigers": "det",
  "Houston Astros": "hou",
  "Kansas City Royals": "kc",
  "Los Angeles Angels": "laa",
  "Los Angeles Dodgers": "lad",
  "Miami Marlins": "mia",
  "Milwaukee Brewers": "mil",
  "Minnesota Twins": "min",
  "New York Mets": "nym",
  "New York Yankees": "nyy",
  Athletics: "oak",
  "Oakland Athletics": "oak",
  "Philadelphia Phillies": "phi",
  "Pittsburgh Pirates": "pit",
  "San Diego Padres": "sd",
  "San Francisco Giants": "sf",
  "Seattle Mariners": "sea",
  "St. Louis Cardinals": "stl",
  "Tampa Bay Rays": "tb",
  "Texas Rangers": "tex",
  "Toronto Blue Jays": "tor",
  "Washington Nationals": "wsh",
};

export const teamCode = (name: string): string | null => TEAM_AB[name.trim()] ?? null;
export const teamLogo = (code: string) => `https://a.espncdn.com/i/teamlogos/mlb/500/${code}.png`;
export const teamAbbr = (name: string): string => (teamCode(name) ?? name.slice(0, 3)).toUpperCase();

/** Logo for an ML/RL row whose label contains the team name somewhere. */
export function teamLogoFromLabel(label: string): string | null {
  for (const [name, code] of Object.entries(TEAM_AB)) {
    if (label.includes(name)) return teamLogo(code);
  }
  return null;
}

export type Matchup = { away: string; home: string; time: string; live: boolean };

/** "Colorado Rockies @ Milwaukee Brewers · 1:10 PM" (or the live 🔴 variant). */
export function parseMatchup(game: string): Matchup {
  const [m, ...rest] = game.split(" · ");
  const [away = "", home = ""] = m.split(" @ ");
  return { away, home, time: rest.join(" · "), live: game.includes("🔴") };
}

export const headshotUrl = (id: number) =>
  `https://img.mlbstatic.com/mlb-photos/image/upload/w_120,q_auto/v1/people/${id}/headshot/67/current`;

const HS_KEY = "pl_headshots";
/** Accent/suffix/punctuation-proof key: the odds feed says "Jose Ramirez",
    statsapi answers "José Ramírez" — both must land on the same cache slot. */
const nameKey = (n: string) =>
  n
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\.?$/g, "")
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function readCache(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(HS_KEY) ?? "{}");
    return v && typeof v === "object" ? (v as Record<string, number>) : {};
  } catch {
    return {};
  }
}

let inflight: Promise<void> | null = null;

/** Resolve player names → MLB personIds (batched, cached). Returns the cache. */
async function resolveIds(names: string[]): Promise<Record<string, number>> {
  const cache = readCache();
  const missing = [...new Set(names.map(nameKey))].filter((n) => n && !(n in cache));
  if (!missing.length) return cache;
  // one search call resolves many names; cap the batch to keep the URL sane
  for (let i = 0; i < missing.length; i += 20) {
    const batch = missing.slice(i, i + 20);
    try {
      const r = await fetch(
        `https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(batch.join(","))}&fields=people,id,fullName`,
        { cache: "force-cache" },
      );
      if (!r.ok) continue;
      const j = (await r.json()) as { people?: { id: number; fullName: string }[] };
      for (const p of j.people ?? []) cache[nameKey(p.fullName)] = p.id;
    } catch {
      /* offline — avatars just fall back to initials */
    }
  }
  try {
    localStorage.setItem(HS_KEY, JSON.stringify(cache));
  } catch {
    /* storage full */
  }
  return cache;
}

/** name → headshot URL for every resolvable name in the list. */
export function useHeadshots(names: string[]): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>({});
  const key = names.slice().sort().join("|");
  useEffect(() => {
    if (!names.length) return;
    let dead = false;
    const run = async () => {
      // serialize bursts so tab-switching doesn't fire overlapping searches
      while (inflight) await inflight.catch(() => {});
      const p = resolveIds(names).then((cache) => {
        if (dead) return;
        const out: Record<string, string> = {};
        for (const n of names) {
          const id = cache[nameKey(n)];
          if (id) out[n] = headshotUrl(id);
        }
        setMap(out);
      });
      inflight = p.then(
        () => void 0,
        () => void 0,
      );
      await inflight;
      inflight = null;
    };
    void run();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return map;
}
