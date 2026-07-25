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
  /* Phase 1 idempotency (2026-07-25). A second generation pass restates the same
     day: same leg, different probability, because 9am prices a projected lineup and
     1pm prices a confirmed one. The store measures the ENGINE, not the bets, so the
     most informed statement of the day stands — but the one it replaced is kept for
     audit, because comparing projected-lineup against confirmed-lineup calibration is
     the entire evidence base for whether the second pass earns its odds credits. */
  at?: number; // when this statement was written
  hist?: { p: number; lu: "confirmed" | "projected"; src?: "cron" | "client"; at: number }[];
  /* the SAME line restated on the other side by a later pass (a confirmed lineup can
     move ml_home → ml_away). Two contradictory forecasts of one outcome must never
     both be graded, so this one is kept, marked, and excluded from training. */
  superseded?: true;
  /* a later pass covered this player+market but not THIS line — the book moved on.
     Nothing contradicts it, so it is kept AND still trains; the mark is for audit.
     Deleting it would be the same class of error as backfilling one. */
  stale?: true;
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

/**
 * Two keys above the record key, for generation-scoped replacement.
 *
 * `k` = `gkey|lkey|sub` is finer than it looks: `sub` carries the SIDE and the line,
 * and for game markets the side is inside `lkey` itself (`ml_home` vs `ml_away`). So
 * a later pass that changes its mind writes a DIFFERENT key and the old statement
 * survives beside it — which is how two contradictory forecasts of one outcome would
 * both reach the grader. These keys are what let a pass supersede its predecessor.
 *
 * - `lineKeyOf` — one betting line, side-agnostic. Same line, other side ⇒ same key.
 *   Game markets have the side in the lkey, so it is stripped (`ml_home` → `ml`);
 *   prop lkeys are already side-agnostic (`player|market|line`).
 * - `groupKeyOf` — one player+market (or one game market), line-agnostic. This is the
 *   unit a generation speaks about: if a pass says anything here, it has re-read this
 *   player's night. NB game markets carry no player, which is exactly why the group
 *   key must be built off the lkey rather than a player field.
 */
const SIDED = /^(ml|rl)_(home|away)$/;

export function lineKeyOf(gkey: string | null | undefined, lkey: string | null | undefined): string {
  const lk = String(lkey ?? "");
  const base = SIDED.test(lk) ? lk.split("_")[0] : lk;
  return `${gkey ?? "?"}|${base}`;
}

export function groupKeyOf(gkey: string | null | undefined, lkey: string | null | undefined): string {
  const lk = String(lkey ?? "");
  if (SIDED.test(lk)) return `${gkey ?? "?"}|${lk.split("_")[0]}`;
  const parts = lk.split("|");
  // player|market|line → drop the line; anything else keys on itself
  return parts.length === 3 ? `${gkey ?? "?"}|${parts[0]}|${parts[1]}` : `${gkey ?? "?"}|${lk}`;
}

/** How many superseded statements a record keeps for audit. */
export const HIST_MAX = 4;

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
  /* ---- generation-scoped replacement (Phase 1) ----
     A pass that speaks about a player+market has re-read that player's night, so its
     statement supersedes the previous pass's for the same LINE — including when the
     side flipped, which writes a different record key and would otherwise leave two
     contradictory forecasts of one outcome in the grader. Lines the pass did NOT
     restate are left alone and keep training: nothing contradicts them.
     Frozen rows (graded, or their game already started) are never touched. */
  const incoming = records.filter(
    (r) => r && typeof r.k === "string" && isFinite(Number(r.p)) && !started(r.gkey),
  );
  const frozen = (r: PredRecord) => (!!r.res && r.res !== "pending") || started(r.gkey);
  const inKeys = new Set(incoming.map((r) => r.k));
  const inLines = new Set(incoming.map((r) => lineKeyOf(r.gkey, r.lkey)));
  const inGroups = new Set(incoming.map((r) => groupKeyOf(r.gkey, r.lkey)));
  for (const prev of Object.values(blob.records)) {
    if (inKeys.has(prev.k) || frozen(prev)) continue;
    if (inLines.has(lineKeyOf(prev.gkey, prev.lkey))) {
      prev.superseded = true; // same line, restated (usually the other side)
      delete prev.stale;
    } else if (inGroups.has(groupKeyOf(prev.gkey, prev.lkey))) {
      prev.stale = true; // the pass covered this player+market, but not this line
    }
  }

  let written = 0;
  for (const r of incoming) {
    const prev = blob.records[r.k];
    if (prev?.res && prev.res !== "pending") continue; // graded = frozen
    if (prev && started(prev.gkey)) continue; // pre-start statement = frozen
    // keep what this statement replaced, so projected-vs-confirmed stays measurable
    const hist = prev
      ? [...(prev.hist ?? []), { p: prev.p, lu: prev.lu, src: prev.src, at: prev.at ?? 0 }].slice(-HIST_MAX)
      : null;
    blob.records[r.k] = { ...r, res: prev?.res ?? "pending", at: now, ...(hist?.length ? { hist } : {}) };
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

/* ---- the ONLY door from the prediction store into the calibration channel ----

   Everything the nightly fit trains on comes through here. Three exclusions, and
   they are stated as code rather than left implicit:

   1. Only settled statements (won/lost). Voids, pushes and pendings carry no
      information about whether a probability was right.
   2. `superseded` rows never train. They are the earlier pass's forecast of a line
      a later pass restated on the other side — kept for audit, but grading both
      would weight one outcome against two contradictory claims.
   3. `hist` NEVER trains. Superseded probabilities live inside the surviving record
      and are deliberately unreachable from this function: the fit reads the row, not
      the row's history. A future fit that wants the projected-vs-confirmed comparison
      must ask for it explicitly rather than pick it up by accident. */

export type GradedFromBlob = {
  market: string;
  p: number;
  edge: number | null;
  lu: "confirmed" | "projected";
  res: "won" | "lost";
  pMkt: number | null;
  ln: number | null;
  susp?: true;
};

export function gradedFromBlob(blob: DayBlob | null): GradedFromBlob[] {
  if (!blob) return [];
  const out: GradedFromBlob[] = [];
  for (const r of Object.values(blob.records ?? {})) {
    if (r.res !== "won" && r.res !== "lost") continue;
    if (r.superseded) continue;
    out.push({
      market: r.market,
      p: r.p,
      edge: r.edge,
      lu: r.lu,
      res: r.res,
      pMkt: r.pMkt ?? null,
      ln: r.ln ?? lineOf(r.lkey),
      ...(r.susp ? { susp: true as const } : {}),
    });
  }
  return out;
}
