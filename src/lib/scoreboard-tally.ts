import type { LedgerEntry } from "@/lib/useLedger";

/**
 * THE SCOREBOARD'S WIN/LOSS TALLY (AUDIT E3-1).
 *
 * The Ledger's "Pro scoreboard" panel counted a ticket as graded only when its stored result
 * contained "win" or "loss" (or was "w" / "l"). The grader has only ever stored "won" and "lost",
 * and neither word contains "win" or "loss" — so the panel showed 0 graded tickets, 0% maturity and
 * no calibration rows, whatever the ledger held. The words are matched exactly here.
 *
 * A push, a void, an open ticket and an ungradable one are not wins or losses and are not counted:
 * this tally feeds a win rate, and those carry no win/loss information.
 */

export type Outcome = "won" | "lost";

/** the stored result word as a win or a loss; anything else is neither */
export function outcomeOf(result: unknown): Outcome | null {
  if (typeof result !== "string") return null;
  const r = result.trim().toLowerCase();
  return r === "won" || r === "lost" ? r : null;
}

/** a stored probability as 0..1; the older desks stored percent, the newer ones a fraction */
export function probOf(prob: unknown): number | null {
  if (typeof prob !== "number" || !Number.isFinite(prob) || prob < 0) return null;
  const p = prob > 1 ? prob / 100 : prob;
  return p <= 1 ? p : null;
}

export const BUCKET_EDGES = [
  { label: "<15%", lo: 0, hi: 0.15 },
  { label: "15–30%", lo: 0.15, hi: 0.3 },
  { label: "30–45%", lo: 0.3, hi: 0.45 },
  { label: "45–60%", lo: 0.45, hi: 0.6 },
  { label: "60%+", lo: 0.6, hi: 1.01 },
] as const;

export type TallyBucket = { label: string; n: number; predicted: number; actual: number };
export type Tally = { graded: number; wins: number; buckets: TallyBucket[] };

export function tallyTickets(entries: Pick<LedgerEntry, "core" | "funT" | "grading">[]): Tally {
  let graded = 0;
  let wins = 0;
  const B = BUCKET_EDGES.map((b) => ({ ...b, n: 0, p: 0, w: 0 }));
  for (const e of entries) {
    for (const t of [...(e.core ?? []), ...(e.funT ?? [])]) {
      const outcome = outcomeOf(e.grading?.tickets?.[t.id]?.result);
      if (!outcome) continue;
      graded++;
      const won = outcome === "won";
      if (won) wins++;
      const p = probOf(t.prob);
      if (p == null) continue;
      const b = B.find((x) => p >= x.lo && p < x.hi);
      if (!b) continue;
      b.n++;
      b.p += p;
      b.w += won ? 1 : 0;
    }
  }
  return {
    graded,
    wins,
    buckets: B.filter((b) => b.n > 0).map((b) => ({ label: b.label, n: b.n, predicted: b.p / b.n, actual: b.w / b.n })),
  };
}
