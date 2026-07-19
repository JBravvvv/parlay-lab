import type { SyncEntry } from "./ledger-merge";
import { wilson } from "@/engine2/calibration";

/**
 * Upgrade 03 — ledger segments: the read-side that names which signal earns.
 * Pure functions over the synced ledger. P/L and ROI need months to mean
 * anything under parlay variance; CLV points and per-market leg calibration
 * mean something in weeks — so the ledger reports those, segmented, with n
 * and intervals always visible and unsighted legs never averaged in silently.
 *
 * CLV convention: probability points, close minus locked —
 *   clvPts    = 100 x (implied(closing Caesars price) - implied(locked price))
 *   fairPts   = 100 x (de-vigged consensus fair at close - implied(locked price))
 * Positive = the card beat the close. Vig cancels in clvPts (same book, same
 * side, both prices carry it); fairPts grades against the sharp consensus.
 */

export type ClvEntry = { am: number; at: number; consensusFair?: number | null; bsAm?: number | null; bsBk?: string | null };

type Leg = { label?: string; prop?: string; cz?: number | null; bs?: number | null; lkey?: string | null; gkey?: string | null };
type Ticket = { id?: string; stake?: number; supplemental?: boolean; type?: string; czDec?: number; bsDec?: number | null; legs?: Leg[] };
type Grade = { result?: string; payout?: number };

export const impliedPct = (am: number): number => (am > 0 ? 100 * (100 / (am + 100)) : 100 * (-am / (-am + 100)));

export function marketOf(lkey: string): string {
  if (lkey === "ml_home" || lkey === "ml_away") return "ml";
  if (lkey === "rl_home" || lkey === "rl_away") return "rl";
  const parts = lkey.split("|");
  return parts.length === 3 ? parts[1] : "other";
}

export type SegRow = {
  seg: string;
  legs: number; // all legs in the segment
  sighted: number; // legs with a closing sighting AND a locked price
  clvPts: number | null; // mean CLV pts over sighted legs only
  fairPts: number | null; // mean vs consensus fair, over legs where it was stored
  fairN: number;
  bsPts: number | null; // dk_fd: mean CLV vs the DK/FD basis close, over legs locked with a basis
  bsN: number;
};

export type CalRow = {
  market: string;
  n: number; // graded, non-void legs with a stated probability
  predicted: number; // mean stated prob (0-1)
  actual: number; // realized hit rate (0-1)
  ciLo: number;
  ciHi: number;
  brier: number;
};

/** One fun-bucket group (at-lock vs supplemental): its own P/L and its own CLV. */
export type FunLine = {
  tickets: number;
  staked: number;
  settled: number;
  pl: number;
  clvPts: number | null;
  sighted: number;
  legs: number;
};

export type LedgerSegments = {
  coverage: { sighted: number; legs: number };
  byMarket: SegRow[];
  byBucket: SegRow[];
  funSplit: { atLock: FunLine; supplemental: FunLine };
  /* dk_fd: running "NV tax paid" — what settling at Caesars cost vs the DK/FD basis
     price the card was selected at, over settled tickets locked with a basis.
     Positive = money given up to the NV counter. Void-repriced wins are skipped
     (a basis reprice would be a guess), and the skip count is disclosed. */
  nvTax: {
    tickets: number; // settled tickets that entered the tax line
    skipped: number; // void-repriced wins excluded rather than approximated
    tax: number;
    byMarket: { market: string; tickets: number; tax: number }[];
  };
  overrideDays: { days: number; staked: number; pl: number; clvPts: number | null; sighted: number; legs: number };
  calibration: CalRow[];
  week: { days: number; staked: number; settled: number; pl: number; clvPts: number | null; sighted: number; legs: number; overridePl: number };
};

type LegView = {
  lid: string;
  market: string;
  bucket: "core" | "fun";
  sup: boolean; // fun ticket locked supplementally (after the daily lock)
  overrode: boolean;
  date: string;
  lockedAm: number | null;
  lockedBs: number | null; // dk_fd: the DK/FD basis price the leg was selected at
  clv: ClvEntry | null;
  est: number | null; // stated blended prob, percent
  res: string | null; // won | lost | void | push | pending
};

function legViews(entries: SyncEntry[]): LegView[] {
  const out: LegView[] = [];
  for (const e of entries) {
    if (!e.locked) continue;
    const clv = (e.clv ?? {}) as Record<string, ClvEntry>;
    const gLegs = ((e.grading as { legs?: Record<string, { result?: string }> } | null)?.legs ?? {}) as Record<
      string,
      { result?: string }
    >;
    const seen = new Set<string>();
    for (const bucket of ["core", "fun"] as const) {
      for (const t of ((bucket === "core" ? e.core : e.funT) as Ticket[]) ?? []) {
        for (const l of t.legs ?? []) {
          if (!l.label || !l.prop || !l.lkey) continue;
          const lid = `${l.label}|${l.prop}`;
          if (seen.has(lid)) continue; // a leg repeated across tickets is one price, one close
          seen.add(lid);
          out.push({
            lid,
            market: marketOf(l.lkey),
            bucket,
            sup: bucket === "fun" && t.supplemental === true,
            overrode: (e as { overrode?: boolean }).overrode === true,
            date: e.date,
            lockedAm: l.cz ?? null,
            lockedBs: l.bs ?? null,
            clv: clv[lid] ?? null,
            est: (l as { est?: unknown }).est != null ? Number((l as { est?: unknown }).est) : null,
            res: gLegs[lid]?.result ?? null,
          });
        }
      }
    }
  }
  return out;
}

function segRow(seg: string, legs: LegView[]): SegRow {
  const sightable = legs.filter((l) => l.clv != null && l.lockedAm != null);
  const clvVals = sightable.map((l) => impliedPct(l.clv!.am) - impliedPct(l.lockedAm!));
  const fairVals = sightable
    .filter((l) => l.clv!.consensusFair != null)
    .map((l) => l.clv!.consensusFair! * 100 - impliedPct(l.lockedAm!));
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  /* dk_fd: CLV against the price that PICKED the leg (basis close vs locked basis) */
  const bsVals = legs
    .filter((l) => l.clv?.bsAm != null && l.lockedBs != null)
    .map((l) => impliedPct(l.clv!.bsAm!) - impliedPct(l.lockedBs!));
  return {
    seg,
    legs: legs.length,
    sighted: sightable.length,
    clvPts: mean(clvVals),
    fairPts: mean(fairVals),
    fairN: fairVals.length,
    bsPts: mean(bsVals),
    bsN: bsVals.length,
  };
}

function ticketPl(e: SyncEntry): { staked: number; settled: number; pl: number } {
  let staked = 0;
  let settled = 0;
  let pl = 0;
  const grades = ((e.grading as { tickets?: Record<string, Grade> } | null)?.tickets ?? {}) as Record<string, Grade>;
  for (const t of [...((e.core as Ticket[]) ?? []), ...((e.funT as Ticket[]) ?? [])]) {
    const stake = Number(t.stake) || 0;
    staked += stake;
    const g = t.id ? grades[t.id] : undefined;
    if (!g || g.result === "pending" || g.result === "ungradable") continue;
    settled += stake;
    pl += (Number(g.payout) || 0) - stake;
  }
  return { staked, settled, pl };
}

export function ledgerSegments(entries: SyncEntry[], now = Date.now()): LedgerSegments {
  const locked = entries.filter((e) => e.locked);
  const legs = legViews(locked);

  const markets = [...new Set(legs.map((l) => l.market))].sort();
  const byMarket = markets.map((m) => segRow(m, legs.filter((l) => l.market === m)));
  const byBucket = (["core", "fun"] as const).map((b) => segRow(b, legs.filter((l) => l.bucket === b)));

  // fun bucket split: what the daily lock chose vs what supplemental locks added,
  // each with its own P/L and its own CLV — one blended line would hide which
  // lock discipline is earning
  const funLine = (sup: boolean): FunLine => {
    let tickets = 0;
    let staked = 0;
    let settled = 0;
    let pl = 0;
    for (const e of locked) {
      const grades = ((e.grading as { tickets?: Record<string, Grade> } | null)?.tickets ?? {}) as Record<string, Grade>;
      for (const t of ((e.funT as Ticket[]) ?? []).filter((t) => (t.supplemental === true) === sup)) {
        tickets++;
        const stake = Number(t.stake) || 0;
        staked += stake;
        const g = t.id ? grades[t.id] : undefined;
        if (!g || g.result === "pending" || g.result === "ungradable") continue;
        settled += stake;
        pl += (Number(g.payout) || 0) - stake;
      }
    }
    const row = segRow(sup ? "supplemental" : "at-lock", legs.filter((l) => l.bucket === "fun" && l.sup === sup));
    return { tickets, staked, settled, pl, clvPts: row.clvPts, sighted: row.sighted, legs: row.legs };
  };
  const funSplit = { atLock: funLine(false), supplemental: funLine(true) };

  // dk_fd: NV tax paid = basis P/L − actual P/L on settled basis-locked tickets.
  // Losses cancel (−stake either way); a win pays stake×(bsDec−1) at basis vs
  // (payout−stake) at the settled price — so per won ticket: stake×bsDec − payout.
  const taxBy = new Map<string, { tickets: number; tax: number }>();
  let taxTickets = 0;
  let taxSkipped = 0;
  let taxTotal = 0;
  for (const e of locked) {
    const grades = ((e.grading as { tickets?: Record<string, Grade> } | null)?.tickets ?? {}) as Record<string, Grade>;
    for (const t of [...((e.core as Ticket[]) ?? []), ...((e.funT as Ticket[]) ?? [])]) {
      if (t.bsDec == null || !t.id) continue;
      const g = grades[t.id];
      if (!g || g.result === "pending" || g.result === "ungradable") continue;
      const stake = Number(t.stake) || 0;
      let tax = 0;
      if (g.result === "won") {
        const gDec = (g as { dec?: number }).dec;
        const repriced = gDec != null && t.czDec != null && Math.abs(gDec - t.czDec) > 1e-9;
        if (repriced) {
          taxSkipped++;
          continue;
        }
        tax = stake * t.bsDec - (Number(g.payout) || 0);
      }
      taxTickets++;
      taxTotal += tax;
      const mkt = t.type || "MIX";
      const row = taxBy.get(mkt) ?? { tickets: 0, tax: 0 };
      row.tickets++;
      row.tax += tax;
      taxBy.set(mkt, row);
    }
  }
  const nvTax = {
    tickets: taxTickets,
    skipped: taxSkipped,
    tax: taxTotal,
    byMarket: [...taxBy.entries()].map(([market, r]) => ({ market, ...r })).sort((a, b) => (a.market < b.market ? -1 : 1)),
  };

  const ovLegs = legs.filter((l) => l.overrode);
  const ovRow = segRow("override", ovLegs);
  const ovEntries = locked.filter((e) => (e as { overrode?: boolean }).overrode === true);
  const ovPl = ovEntries.reduce((a, e) => a + ticketPl(e).pl, 0);
  const ovStaked = ovEntries.reduce((a, e) => a + ticketPl(e).staked, 0);

  // per-market leg calibration: graded win/loss legs with a stated probability
  const calibration: CalRow[] = markets
    .map((m) => {
      const sel = legs.filter((l) => l.market === m && l.est != null && (l.res === "won" || l.res === "lost"));
      const n = sel.length;
      if (!n) return null;
      const won = sel.filter((l) => l.res === "won").length;
      const predicted = sel.reduce((a, l) => a + (l.est as number), 0) / n / 100;
      const ci = wilson(won, n);
      const brier =
        sel.reduce((a, l) => {
          const q = (l.est as number) / 100;
          const y = l.res === "won" ? 1 : 0;
          return a + (q - y) * (q - y);
        }, 0) / n;
      return { market: m, n, predicted, actual: won / n, ciLo: ci.lo, ciHi: ci.hi, brier };
    })
    .filter((x): x is CalRow => x != null);

  const weekCut = new Date(now - 7 * 86_400_000).toISOString().slice(0, 10);
  const weekEntries = locked.filter((e) => e.date >= weekCut);
  const weekLegs = legs.filter((l) => l.date >= weekCut);
  const weekPl = weekEntries.reduce(
    (a, e) => {
      const p = ticketPl(e);
      return { staked: a.staked + p.staked, settled: a.settled + p.settled, pl: a.pl + p.pl };
    },
    { staked: 0, settled: 0, pl: 0 },
  );
  const weekRow = segRow("week", weekLegs);
  const weekOvPl = weekEntries
    .filter((e) => (e as { overrode?: boolean }).overrode === true)
    .reduce((a, e) => a + ticketPl(e).pl, 0);

  return {
    coverage: { sighted: legs.filter((l) => l.clv != null && l.lockedAm != null).length, legs: legs.length },
    byMarket,
    byBucket,
    funSplit,
    nvTax,
    overrideDays: { days: ovEntries.length, staked: ovStaked, pl: ovPl, clvPts: ovRow.clvPts, sighted: ovRow.sighted, legs: ovRow.legs },
    calibration,
    week: {
      days: weekEntries.length,
      staked: weekPl.staked,
      settled: weekPl.settled,
      pl: weekPl.pl,
      clvPts: weekRow.clvPts,
      sighted: weekRow.sighted,
      legs: weekRow.legs,
      overridePl: weekOvPl,
    },
  };
}
