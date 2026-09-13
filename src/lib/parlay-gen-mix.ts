import type { GenLeg } from "./parlay-gen";

export type MixStyle = "safer" | "balanced";
export type MixBand = "anchor" | "middle" | "upside";
export const MIX_LABEL: Record<MixBand, string> = { anchor: "Anchor", middle: "Middle", upside: "Upside" };

/** Rank only comparable, eligible legs in this category and price range. Model
 * optimism cannot lift a leg above its quoted implied chance. Market-only rows
 * remain market estimates. This ranking never changes the displayed forecast. */
export function mixChance(l: GenLeg): number {
  const p = Number.isFinite(l.prob) ? Math.max(0, Math.min(1, l.prob / 100)) : 0;
  return l.src === "model" ? Math.min(p, 1 / l.dec) : p;
}

/** Each player contributes total weight one, regardless of alternate-line count.
 * Equal probabilities share a tier: a board of -110 peers has no invented anchors. */
export function mixBands(legs: readonly GenLeg[]): Map<string, MixBand> {
  const counts = new Map<string, number>();
  for (const l of legs) counts.set(l.playerKey, (counts.get(l.playerKey) ?? 0) + 1);
  const sorted = legs.slice().sort((a, b) => mixChance(a) - mixChance(b) || a.id.localeCompare(b.id));
  const out = new Map<string, MixBand>();
  let cumulative = 0;
  for (let i = 0; i < sorted.length;) {
    let j = i + 1;
    while (j < sorted.length && Math.abs(mixChance(sorted[j]) - mixChance(sorted[i])) < 1e-8) j++;
    const weight = sorted.slice(i, j).reduce((s, l) => s + 1 / counts.get(l.playerKey)!, 0);
    const rank = (cumulative + weight / 2) / counts.size;
    const tier: MixBand = rank >= 2 / 3 ? "anchor" : rank <= 1 / 3 ? "upside" : "middle";
    for (let k = i; k < j; k++) out.set(sorted[k].id, tier);
    cumulative += weight;
    i = j;
  }
  return out;
}

/** Seeded, stratified player rotation. Pins never enter this order, so pinning a
 * slot cannot reshuffle the others. Recent players receive less weight, never a
 * hard exclusion. Each player's alternate lines share ONE chance in each band. */
export function mixOrder<P>(
  legs: readonly GenLeg<P>[], style: MixStyle, rng: () => number,
  recent: ReadonlyMap<string, number> = new Map(),
): GenLeg<P>[] {
  const tiers = mixBands(legs);
  const groups: Record<MixBand, GenLeg<P>[]> = { anchor: [], middle: [], upside: [] };
  for (const l of legs) groups[tiers.get(l.id)!].push(l);
  const used = new Set<string>();
  const out: GenLeg<P>[] = [];
  const pattern: MixBand[] = style === "safer"
    ? ["anchor", rng() < 0.75 ? "middle" : "upside", "anchor", "upside", "middle", "anchor"]
    : (rng() < 0.5 ? ["anchor", "middle", "upside"] : ["upside", "middle", "anchor"]);
  // Exponential-race priorities give weighted sampling without replacement.
  // Build each band once: O(n log n), instead of rescanning it for every player.
  const queues = Object.fromEntries(Object.entries(groups).map(([tier, candidates]) => {
    const variants = new Map<string, number>();
    for (const l of candidates) variants.set(l.playerKey, (variants.get(l.playerKey) ?? 0) + 1);
    const queue = candidates.map((l) => ({ l, priority: -Math.log(1 - rng())
      * (1 + 3 * (recent.get(l.playerKey) ?? 0)) * variants.get(l.playerKey)! }));
    queue.sort((a, b) => a.priority - b.priority);
    return [tier, queue.map((x) => x.l)];
  })) as Record<MixBand, GenLeg<P>[]>;
  const cursors: Record<MixBand, number> = { anchor: 0, middle: 0, upside: 0 };
  const playerCount = new Set(legs.map((l) => l.playerKey)).size;
  for (let step = 0; used.size < playerCount; step++) {
    const target = pattern[step % pattern.length];
    const order: MixBand[] = [target, ...(["anchor", "middle", "upside"] as MixBand[]).filter((t) => t !== target)];
    let pick: GenLeg<P> | undefined;
    for (const tier of order) {
      const queue = queues[tier];
      while (cursors[tier] < queue.length && used.has(queue[cursors[tier]].playerKey)) cursors[tier]++;
      if (cursors[tier] < queue.length) { pick = queue[cursors[tier]++]; break; }
    }
    if (!pick) break;
    out.push(pick);
    used.add(pick.playerKey);
  }
  // Preserve alternative lines for payout repair, after every player got a turn.
  const ids = new Set(out.map((l) => l.id));
  const rest = legs.filter((l) => !ids.has(l.id)).map((l) => ({ l, key: rng() }));
  rest.sort((a, b) => a.key - b.key);
  return [...out, ...rest.map((x) => x.l)];
}
