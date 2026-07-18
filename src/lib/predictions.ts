"use client";

import type { BoardData, PickRow, Ticket } from "@/engine";
import { getSyncKey } from "./ledgerSync";

/**
 * Calibration spec 3A (write-side): every board generation logs EVERY priced
 * pick — the full board, played or not, offered at Caesars or not — plus every
 * suggested parlay, to /api/predictions. The cron grades them later.
 *
 * Fail-silent by contract: if anything here throws or the store is missing,
 * board generation proceeds exactly as it does today.
 */

export type PredRecord = {
  k: string; // `${gkey}|${lkey}|${sub}` — one row per pick per day
  label: string;
  sub: string;
  market: string;
  gkey: string | null;
  lkey: string | null;
  p: number; // engine true % (blended)
  pModel: number | null; // model-only %
  pMkt: number; // consensus de-vigged %
  w: number | null; // blend weight actually used
  edge: number | null; // stated edge %
  ev: number | null; // EV % at best price
  odds: number | null; // best price (american)
  book: string | null;
  cz: number | null; // Caesars price if offered
  czEv: number | null;
  lu: "confirmed" | "projected";
  tags: string[];
  // grading fields (cron-owned)
  res?: "won" | "lost" | "push" | "void" | "pending" | "ungradable";
  detail?: string;
  luRes?: boolean; // projected player actually in the confirmed lineup
  boAct?: number | null; // actual batting order (1-9)
  gradedAt?: number;
};

export type ParlayPred = {
  k: string;
  name: string;
  type: string;
  prob: number; // joint % the engine used
  czDec: number | null;
  czOdds: string | null;
  legs: { label: string; prop: string; lkey: string | null; gkey: string | null; prob: number | null }[];
  res?: "won" | "lost" | "push" | "void" | "pending" | "ungradable";
  gradedAt?: number;
};

export type DayGames = Record<string, { pk: number | null; start: string | null }>;

/** One stored day of predictions (the /api/predictions blob shape). */
export type DayBlob = {
  date: string;
  at: number;
  records: Record<string, PredRecord>;
  parlays: Record<string, ParlayPred>;
  games: DayGames;
};

const oddsNum = (v: unknown): number | null => {
  const n = Number(String(v ?? "").replace(/[^\d+-]/g, ""));
  return isFinite(n) && n !== 0 ? n : null;
};

/** Serialize a generated board into prediction records (pregame rows only). */
export function boardToPredictions(d: BoardData): { records: PredRecord[]; parlays: ParlayPred[]; games: DayGames } {
  const records: PredRecord[] = [];
  const seen = new Set<string>();
  for (const [market, rows] of Object.entries(d.categories ?? {})) {
    if (market === "all") continue; // TOP 50 duplicates the category rows
    for (const r of rows as PickRow[]) {
      if (r.live) continue; // calibration measures pregame statements only
      const k = `${r.gkey ?? "?"}|${r.lkey ?? "?"}|${r.sub}`;
      if (seen.has(k) || r.prob == null) continue;
      seen.add(k);
      records.push({
        k,
        label: r.label,
        sub: r.sub,
        market,
        gkey: (r.gkey as string) ?? null,
        lkey: (r.lkey as string) ?? null,
        p: Number(r.prob),
        pModel: r.pModel != null ? Number(r.pModel) : null,
        pMkt: Number(r.implied ?? 0),
        w: r.wBlend != null ? Number(r.wBlend) : null,
        edge: r.edge != null ? Number(r.edge) : null,
        ev: r.ev != null ? Number(r.ev) : null,
        odds: oddsNum(r.odds),
        book: (r.book as string) ?? null,
        cz: r.cz != null ? Number(r.cz) : null,
        czEv: r.czEv != null ? Number(r.czEv) : null,
        lu: r.lu === "projected" ? "projected" : "confirmed",
        tags: Array.isArray(r.tags) ? (r.tags as string[]).slice(0, 8) : [],
      });
    }
  }
  const parlays: ParlayPred[] = [];
  const pseen = new Set<string>();
  for (const set of [d.parlays ?? [], d.parlaysMixed ?? []]) {
    for (const t of set as Ticket[]) {
      if ((t.legs ?? []).some((l) => (l as { live?: boolean }).live)) continue;
      const k = `${t.type ?? "T"}|${(t.legs ?? [])
        .map((l) => `${l.label}|${l.prop}`)
        .sort()
        .join("+")}`;
      if (pseen.has(k) || t.prob == null) continue;
      pseen.add(k);
      parlays.push({
        k,
        name: String(t.name ?? ""),
        type: String(t.type ?? "MIX"),
        prob: Number(t.prob),
        czDec: t.czDec != null ? Number(t.czDec) : null,
        czOdds: t.czOdds != null ? String(t.czOdds) : null,
        legs: (t.legs ?? []).map((l) => ({
          label: l.label,
          prop: l.prop,
          lkey: (l.lkey as string) ?? null,
          gkey: (l.gkey as string) ?? null,
          prob: l.prob != null ? Number(l.prob) : l.est != null ? Number(l.est) : null,
        })),
      });
    }
  }
  const games: DayGames = {};
  for (const [gk, gi] of Object.entries(d.gameInfo ?? {})) {
    games[gk] = { pk: gi.pk ?? null, start: gi.start ?? null };
  }
  return { records, parlays, games };
}

/** Fire-and-forget push after a board generates. Never throws. */
export async function logBoardPredictions(date: string, d: BoardData): Promise<void> {
  try {
    const key = getSyncKey();
    if (!key) return; // no sync phrase on this device — nothing to write with
    const payload = boardToPredictions(d);
    if (!payload.records.length) return;
    await fetch("/api/predictions", {
      method: "PUT",
      headers: { "x-pl-sync": key, "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ date, ...payload }),
    });
  } catch {
    /* fail-silent by spec — the board is never blocked by calibration */
  }
}
