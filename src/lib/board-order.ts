/**
 * THE BOARD RUNS ON THE SITE-WIDE SELECTION MODE (2026-08-11, Josh's ask:
 * "Whatever is selected as the Selection Mode in settings should run across
 * the entire site"). The Sharp already ranks its plays by the mode; the
 * Board's TOP 50 used the legacy all-books-EV order and only reacted to
 * dk_fd. This is the ONE ordering both now share for the actionable view:
 *
 *   dk_fd       → EV at the DK/FD selection basis (bsEv)
 *   ev_gated    → EV at Caesars (czEv) — the default; the EV *gate* itself
 *                 stays in the Builder's allocator, where stakes are
 *   caesars_ev  → EV at Caesars (czEv), the legacy ranking
 *   probability → the engine's true % (prob)
 *
 * ORDERING ONLY — nothing is filtered here. Every pick still posts (Josh's
 * 2026-08-09 rule); rows missing the mode's price sink to the bottom instead
 * of disappearing. Category tabs stay probability-ranked by design: they are
 * the high-floor parlay pool the Builder draws from, not the mode view.
 */

import type { SelectionMode } from "./engine-client";

type OrderableRow = {
  prob?: number | string | null;
  czEv?: number | string | null;
  bsEv?: number | string | null;
};

const SINK = -9999;

function keyOf(r: OrderableRow, mode: SelectionMode): number {
  const v = mode === "dk_fd" ? r.bsEv : mode === "probability" ? r.prob : r.czEv;
  const n = Number(v);
  return v == null || !Number.isFinite(n) ? SINK : n;
}

/** Stable, non-mutating: equal keys keep the engine's original order. */
export function orderByMode<T extends OrderableRow>(rows: readonly T[], mode: SelectionMode): T[] {
  return rows
    .map((r, i) => ({ r, i, k: keyOf(r, mode) }))
    .sort((a, b) => b.k - a.k || a.i - b.i)
    .map((x) => x.r);
}

/** Header copy — names the active mode so the order is never a mystery. */
export const MODE_LABEL: Record<SelectionMode, string> = {
  dk_fd: "ranked by EV @ DK/FD basis (Caesars settles)",
  ev_gated: "ranked by EV @ Caesars (EV gate lives at the card)",
  caesars_ev: "ranked by EV @ Caesars",
  probability: "ranked by win probability",
};
