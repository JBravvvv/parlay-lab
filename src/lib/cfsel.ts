import type { BoardData, Engine } from "@/engine";

/**
 * cfSel — counterfactual selection under a lifted HRR bar (2026-07-29, owner sign-off;
 * spec: docs/collection-period.md "THE SELECTED-vs-UNSELECTED MISMATCH").
 *
 * WHAT THIS ANSWERS: the HRR suspension review's shadow rows are EVERY HRR row,
 * unselected — but the suspension was measured on SELECTED legs, and selection is the
 * whole mechanism under M14. Per suspended row, cfSel records whether the row would
 * have entered the ticket pool (`pool`) and the allocated card (`card`) had
 * `hrrAltMax` been lifted — the field that is unrecoverable once boards resume.
 *
 * WHY A FULL COUNTERFACTUAL ANALYZE, NOT A RE-POOL (the spec correction, 2026-07-29):
 * `hrrAltMax` has exactly two read sites — the display tag (legacy L2514) and the C2
 * filter INSIDE `buildParlaySet` (L2652) — both of which run during `analyze`.
 * Re-running `shCardPool`+`shAllocate` over already-built tickets can never resurrect
 * an HRR leg (the tickets already exclude them), so the originally spec'd diff would
 * have stamped {pool:false, card:false} on every suspended row forever — the
 * field-written-never-populated defect class. And `buildParlaySet`/`omitCats` are
 * closures inside `shAnalyzeLocal`, unreachable via `eng.get`. The counterfactual
 * therefore re-runs `analyze` on a DEEP-COPIED slate under a REPLACED SH_CFG binding
 * (a new object; the live cfg is never mutated) — deterministic (seeded sim), zero
 * credits, CPU only.
 *
 * INVARIANTS (guard: tests/cfsel-guard.test.ts):
 * - the live `data` object and the live card are byte-identical with cfSel on/off;
 * - the SH_CFG binding is restored in `finally` before anything else runs;
 * - nothing in the live path reads cfSel's output — it feeds only the additive
 *   `cfSel` field on suspended prediction rows.
 *
 * CONVENTION: the counterfactual card is allocated at CFSEL_DAILY = $250 (the analysis
 * harness's convention, tests/singles-counterfactual.test.ts) under the live cfg —
 * `shAllocate` reads no hrrAltMax, so the restored object is the right one to pass.
 */
export const CFSEL_DAILY = 250;

export type CfSelStamp = { pool: boolean; card: boolean };

type Leg = { gkey?: string | null; lkey?: string | null };
type Ticket = { legs?: Leg[]; czDec?: number | null };
type PoolW = { pl?: Ticket };
type AllocOut = { picks?: { w?: { pl?: Ticket } }[] };

export type CfSelResult = {
  stamps: Map<string, CfSelStamp>;
  cfPoolTickets: number;
  cfCardTickets: number;
  /** HRR legs across the counterfactual ticket sets (pre-pool) — the de-vacuization proof */
  cfHrrTicketLegs: number;
  /** HRR legs that reached the Caesars-playable pool */
  cfHrrPoolLegs: number;
};

const isHrr = (l: Leg) => String(l.lkey ?? "").split("|")[1] === "batter_hits_runs_rbis";
const keyOf = (l: Leg) => `${l.gkey}|${l.lkey}`;

export function computeCfSel(eng: Engine, slate: unknown): CfSelResult {
  const saved = eng.get<Record<string, unknown>>("SH_CFG");
  // DEEP COPY — the live slate object is never touched by the counterfactual run
  const slateCf = JSON.parse(JSON.stringify(slate));
  // lifted bar as a NEW object — the live cfg object is never mutated
  eng.set("SH_CFG", { ...saved, hrrAltMax: 99 });
  let cfData: BoardData;
  try {
    cfData = eng.analyze(slateCf) as BoardData;
  } finally {
    // restore BEFORE anything else runs — nothing live ever sees the lifted object
    eng.set("SH_CFG", saved);
  }
  let cfHrrTicketLegs = 0;
  for (const set of [cfData.parlays ?? [], cfData.parlaysMixed ?? []] as Ticket[][]) {
    for (const t of set) for (const l of t.legs ?? []) if (isHrr(l)) cfHrrTicketLegs++;
  }
  const pool = eng.get<(d: unknown) => PoolW[]>("shCardPool")(cfData);
  const alloc = eng.get<(p: unknown[], amt: number, cfg: unknown, force: boolean) => AllocOut>(
    "shAllocate",
  )(pool, CFSEL_DAILY, saved, false);
  const inPool = new Set<string>();
  let cfHrrPoolLegs = 0;
  for (const w of pool)
    for (const l of w.pl?.legs ?? []) {
      inPool.add(keyOf(l));
      if (isHrr(l)) cfHrrPoolLegs++;
    }
  const inCard = new Set<string>();
  for (const p of alloc.picks ?? []) for (const l of p.w?.pl?.legs ?? []) inCard.add(keyOf(l));
  const stamps = new Map<string, CfSelStamp>();
  for (const k of inPool) stamps.set(k, { pool: true, card: inCard.has(k) });
  return {
    stamps,
    cfPoolTickets: pool.length,
    cfCardTickets: (alloc.picks ?? []).length,
    cfHrrTicketLegs,
    cfHrrPoolLegs,
  };
}
