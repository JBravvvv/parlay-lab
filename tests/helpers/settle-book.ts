/**
 * INSTRUCTION 67 (2026-09-17): the settle book moved from Caesars (`williamhill_us`) to
 * DraftKings (`draftkings`). Every odds fixture under tests/fixtures was captured or synthesised
 * and hand-checked with Caesars as the settle book, so the tests that price through the real
 * constants load it with the two books' keys and titles EXCHANGED: the settle book still carries
 * the prices every hand-computed number was worked from, and the consensus set (the same prices,
 * the same book count) is unchanged. No price is invented and no price is dropped.
 */
const SWAP: Record<string, { key: string; title: string }> = {
  williamhill_us: { key: "draftkings", title: "DraftKings" },
  draftkings: { key: "williamhill_us", title: "Caesars" },
};
export function swapSettleBook<T>(v: T): T {
  if (Array.isArray(v)) return v.map((x) => swapSettleBook(x)) as unknown as T;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(o)) out[k] = swapSettleBook(x);
    const to = typeof o.key === "string" ? SWAP[o.key] : undefined;
    if (to && "title" in o) { out.key = to.key; out.title = to.title; }
    return out as T;
  }
  return v;
}
