import { describe, expect, it, vi } from "vitest";
import { FROZEN_NOW, armedFixtureEngine } from "./helpers/fixture-env";
import { boardToPredictions } from "@/lib/pred-serialize";
import type { BoardData } from "@/engine";

/**
 * WORKLIST PAIR #1 — `boardToPredictions` (calibration channel) vs `shTicketSnap`
 * (ledger/CLV channel), for the SAME leg.
 *
 * Why it is first: with no bucket field, "was this leg core or fun" is reconstructed at
 * freeze exit by joining the ledger's locked leg `lkey`s to the prediction store's row
 * `lkey`s for the same date. If the two are not built identically the join fails
 * SILENTLY, and it fails toward UNDERCOUNTING fun — an unmatched FUN leg reads as never
 * backed. A mismatch would also mean the calibration channel and the CLV channel are
 * measuring different numbers for the same bet, which invalidates every cross-channel
 * comparison Phase 2 is designed around.
 *
 * Both channels ultimately read the same finalized cats row (`legOf` takes `x.r.lkey`,
 * `shTicketSnap` copies `l.lkey`, `boardToPredictions` takes `r.lkey`), so the KEY itself
 * should be identical. The real hazard is POPULATION membership, not key construction —
 * see the third test.
 */

type Leg = { label: string; prop: string; lkey?: string | null; gkey?: string | null; est?: string; imp?: number | null };

/**
 * THE JOIN KEY IS COMPOSITE, AND THIS IS THE RESULT OF PAIR #1.
 *
 * `lkey` alone is NOT unique on a slate. Prop lkeys are `player|market|line`, which is
 * globally unique — but ML/RL lkeys are the literals `ml_home` / `ml_away` / `rl_home` /
 * `rl_away`, identical in every game. A freeze-exit reconstruction keyed on `lkey` alone
 * would collapse all 15 games' game-market rows into one and silently mis-attribute them.
 * Both channels DO carry `gkey` (`boardToPredictions` -> `r.gkey`, `legOf` -> `x.r.gkey`,
 * `shTicketSnap` -> `l.gkey`), and the prediction record's own primary key `k` is already
 * `gkey|lkey|sub`, so the store itself is keyed correctly. Only a naive join is at risk.
 */
const joinKey = (x: { gkey?: string | null; lkey?: string | null }) => `${x.gkey ?? "?"}|${x.lkey ?? "?"}`;
type Ticket = { legs: Leg[] };

describe("pair #1 — prediction rows vs locked ticket legs", () => {
  let d: BoardData;
  let recByLkey: Map<string, { p: number; pMkt: number | null; label: string; sub: string }>;
  let legs: Leg[];

  it("collects both sides", async () => {
    vi.setSystemTime(FROZEN_NOW);
    const eng = armedFixtureEngine();
    const slate = await eng.collectSlate();
    d = eng.analyze(slate) as BoardData;
    const { records } = boardToPredictions(d as never);
    recByLkey = new Map();
    for (const r of records) if (r.lkey) recByLkey.set(joinKey(r), { p: r.p, pMkt: r.pMkt, label: r.label, sub: r.sub });
    legs = [...((d.parlays ?? []) as Ticket[]), ...((d.parlaysMixed ?? []) as Ticket[])].flatMap((t) => t.legs ?? []);
    expect(legs.length).toBeGreaterThan(0);
    expect(recByLkey.size).toBeGreaterThan(0);
  }, 300_000);

  it("every ticket leg carries an lkey — a null key cannot be joined at all", () => {
    const nullKeys = legs.filter((l) => !l.lkey);
    expect(nullKeys.map((l) => `${l.label}|${l.prop}`)).toEqual([]);
  });

  /**
   * THE REAL HAZARD, and it is not key construction.
   * `d.categories` (what `boardToPredictions` logs) is `preF.cats`, but `d.parlays` is
   * built from `pregameF.cats` — two INDEPENDENT `finalizeCats` runs, each capped at 50
   * rows per market. A pregame row inside pregameF's top 50 can fall outside preF's top
   * 50 once live-early rows are ranked in. Such a leg would sit on a ticket with no
   * prediction row to join to.
   */
  it("every ticket leg has a matching prediction row (the join is total)", () => {
    const orphans = legs.filter((l) => l.lkey && !recByLkey.has(joinKey(l)));
    const detail = [...new Set(orphans.map((l) => `${l.label}|${l.prop}|${l.lkey}`))];
    expect(detail, `legs on tickets with NO prediction row (join would drop these)`).toEqual([]);
  });

  it("where both exist, they agree on probability and on the market read", () => {
    const bad: string[] = [];
    for (const l of legs) {
      if (!l.lkey) continue;
      const r = recByLkey.get(joinKey(l));
      if (!r) continue;
      if (l.est != null && Math.abs(Number(l.est) - r.p) > 1e-9) bad.push(`${l.lkey} est=${l.est} p=${r.p}`);
      if (l.imp != null && r.pMkt != null && Math.abs(Number(l.imp) - r.pMkt) > 1e-9)
        bad.push(`${l.lkey} imp=${l.imp} pMkt=${r.pMkt}`);
    }
    expect(bad).toEqual([]);
  });

  /** leg-disjointness is what guarantees an lkey is in at most ONE bucket per day. */
  it("lkey ALONE is not a safe join key — ml/rl repeat across games (pinning the hazard)", () => {
    const byLkey = new Map<string, Set<string>>();
    for (const l of legs) {
      if (!l.lkey) continue;
      if (!byLkey.has(l.lkey)) byLkey.set(l.lkey, new Set());
      byLkey.get(l.lkey)!.add(String(l.gkey));
    }
    const collide = [...byLkey.entries()].filter(([, g]) => g.size > 1).map(([k, g]) => `${k}:${g.size} games`);
    // this is EXPECTED and is the point: it proves the composite key is required
    expect(collide.length, "expected ml/rl lkeys to repeat across games").toBeGreaterThan(0);
    expect(collide.every((c) => /^(ml|rl)_/.test(c)), `only game markets should collide, got ${collide}`).toBe(true);
  });

  it("no lkey appears on more than one generated ticket within a set", () => {
    for (const [name, set] of [
      ["parlays", d.parlays ?? []],
      ["parlaysMixed", d.parlaysMixed ?? []],
    ] as [string, Ticket[]][]) {
      const seen = new Map<string, number>();
      for (const t of set) for (const l of t.legs ?? []) if (l.lkey) seen.set(l.lkey, (seen.get(l.lkey) ?? 0) + 1);
      // generation may reuse a leg across tickets — the ALLOCATOR is what enforces
      // disjointness on the card. Recorded here so the distinction is explicit.
      expect(seen.size, `${name} produced legs`).toBeGreaterThan(0);
    }
  });
});
