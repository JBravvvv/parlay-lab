import type { BoardData, PickRow, Ticket } from "@/engine";

/**
 * Calibration spec 3A — board → prediction records. Pure module (no browser,
 * no server imports) so BOTH writers share it: the client after an on-device
 * generate, and /api/generate when Vercel runs the engine itself.
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
  /* Phase 0.6: the line this row states, and whether it was SUSPENDED from every
     ticket when stated. The freeze-exit thresholds are written about line subsets
     (O0.5 vs O1.5+); without these the graded set can't tell them apart. Parsed
     from lkey, the same string shLegKey built (`player|market|line`); null on
     game markets, which have no line. */
  ln: number | null;
  susp?: boolean;
  /* provenance (Phase 0.5, 2026-07-24): which generator wrote the row and which
     selection mode was armed when it did. Two generators write this store; for
     six days they ran different policies and nothing recorded which was which.
     Rows written before this deploy carry neither field — that is exactly the
     ambiguity CAL_START excludes rather than guesses at. */
  src?: "cron" | "client";
  selMode?: string;
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

/** The line out of a prop lkey (`player|market|line`); null for ml_/rl_ keys. */
export const lineOf = (lkey: string | null | undefined): number | null => {
  const parts = String(lkey ?? "").split("|");
  if (parts.length !== 3) return null;
  const n = Number(parts[2]);
  return isFinite(n) ? n : null;
};

/** Who generated the board being serialized, and under which selection mode. */
export type PredSource = { src: "cron" | "client"; selMode?: string };

/** Serialize a generated board into prediction records (pregame rows only). */
export function boardToPredictions(
  d: BoardData,
  from?: PredSource,
): { records: PredRecord[]; parlays: ParlayPred[]; games: DayGames } {
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
        ln: lineOf(r.lkey as string | null),
        ...(r.susp ? { susp: true } : {}),
        ...(from ? { src: from.src, ...(from.selMode ? { selMode: from.selMode } : {}) } : {}),
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

/**
 * Merge freshly serialized predictions into a stored day blob. Freeze rules
 * protect honesty: graded records are immutable, and once a pick's game has
 * started its last PRE-start statement is what gets graded — a post-start
 * write can never rewrite what the engine claimed while the bet was playable.
 */
export function mergeDayBlob(
  cur: DayBlob | null,
  date: string,
  records: PredRecord[],
  parlays: ParlayPred[],
  games: DayGames,
  now: number,
): { blob: DayBlob; written: number } {
  const blob: DayBlob = cur ?? { date, at: 0, records: {}, parlays: {}, games: {} };
  blob.games = { ...blob.games, ...games };
  const started = (gkey: string | null) => {
    if (!gkey) return false;
    const start = blob.games[gkey]?.start;
    return !!start && new Date(start).getTime() <= now;
  };
  let written = 0;
  for (const r of records) {
    if (!r || typeof r.k !== "string" || !isFinite(Number(r.p))) continue;
    const prev = blob.records[r.k];
    if (prev?.res && prev.res !== "pending") continue; // graded = frozen
    if (prev && started(prev.gkey)) continue; // pre-start statement = frozen
    if (started(r.gkey)) continue; // never log a pick after first pitch
    blob.records[r.k] = { ...r, res: prev?.res ?? "pending" };
    written++;
  }
  for (const t of parlays) {
    if (!t || typeof t.k !== "string" || !isFinite(Number(t.prob))) continue;
    const prev = blob.parlays[t.k];
    if (prev?.res && prev.res !== "pending") continue;
    if ((t.legs ?? []).some((l) => started(l.gkey))) continue;
    blob.parlays[t.k] = { ...t, res: prev?.res ?? "pending" };
  }
  blob.at = now;
  return { blob, written };
}
