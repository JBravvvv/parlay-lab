/**
 * TAB PURITY (2026-08-05, operator report: RL props rendering under Hits, ML under RL).
 *
 * THE READING THAT PRECEDED THIS FILE (docs/session-handoff.md §0.0004): the engine's category
 * arrays are PURE on the armed fixture — 0 cross-market rows in every prop category — and both
 * render surfaces (board page, ParlaysSection) are KEY-addressed with correct labels; no index
 * math exists to shift. Neither defect (a) display-routing nor (b) data-mislabeling reproduces
 * from disk. The operator's screen remains the only witness, so this module does two jobs:
 *   1. gives the guard a single pure predicate to pin engine-level purity from here on, and
 *   2. gives the board page a DEFENSIVE filter — a row that fails purity is EXCLUDED and
 *      COUNTED, never rendered under the wrong tab. If the contamination is slate-specific
 *      (b), the page now says "N rows excluded (cross-market)" instead of showing them, which
 *      converts an invisible defect into a printed one.
 *
 * KEY CONVENTIONS, from the engine: prop rows carry lkey `player|market|line`; ML/RL rows
 * carry `ml_home`/`ml_away`/`rl_home`/`rl_away`. The `all` tab is the TOP-50 aggregate and is
 * exempt by definition.
 */

export function tabPure(cat: string, lkey: string | null | undefined): boolean {
  if (cat === "all") return true;
  const k = lkey ?? "";
  if (cat === "ml" || cat === "rl") return k.startsWith(cat + "_");
  const seg = k.split("|")[1];
  return seg === cat;
}

/** Split a tab's rows into pure and excluded — the page renders `pure` and prints `excluded.length`. */
export function splitPure<T extends { lkey?: string | null }>(cat: string, rows: T[]): { pure: T[]; excluded: T[] } {
  const pure: T[] = [];
  const excluded: T[] = [];
  for (const r of rows) (tabPure(cat, r.lkey) ? pure : excluded).push(r);
  return { pure, excluded };
}
