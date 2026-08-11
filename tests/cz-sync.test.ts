import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  CZ_MAX_KEYS,
  CZ_MAX_KEY_LEN,
  CZ_PRUNE_MS,
  mergeCzHidden,
  pruneCzHidden,
  validateCzHidden,
  type CzHiddenMap,
} from "@/lib/cz-hidden-merge";

/**
 * THE CAESARS-TOGGLE SYNC (2026-08-10, Josh's word: "yes sync the toggle across
 * my devices" — handoff §0.000005).
 *
 * The ⓘ toggle was device-local (pl_cz_hidden_v1, a bare key→true set). Syncing
 * it needs per-key TIMESTAMPS and TOMBSTONES: if unhiding deleted the key, a
 * stale `hidden` on the other device would win every merge and the pick could
 * never come back everywhere. So v2 stores {hidden, at} per key, merge is
 * last-write-wins by `at` (tie → hidden wins: hiding is always recoverable via
 * the reset line, so the reversible side is the safe side), and reset writes
 * hidden:false tombstones rather than clearing storage — a reset must SYNC.
 *
 * The wire rides the existing sync-phrase rails (x-pl-sync / syncAuthed —
 * Josh types the phrase; it is never entered for him). Display-only: nothing
 * here touches the engine, the card, or the record.
 */

const M = (o: Record<string, [boolean, number]>): CzHiddenMap =>
  Object.fromEntries(Object.entries(o).map(([k, [hidden, at]]) => [k, { hidden, at }]));

describe("mergeCzHidden — last-write-wins per key by `at`", () => {
  it("the newer write wins, from either side", () => {
    const a = M({ "tb|Judge|1.5|o": [true, 100] });
    const b = M({ "tb|Judge|1.5|o": [false, 200] });
    expect(mergeCzHidden(a, b)["tb|Judge|1.5|o"]).toEqual({ hidden: false, at: 200 });
    expect(mergeCzHidden(b, a)["tb|Judge|1.5|o"]).toEqual({ hidden: false, at: 200 });
  });
  it("an unhide TOMBSTONE beats an older hide — the resurrection case that motivates v2", () => {
    // phone hid at t=100, laptop unhid at t=500; laptop syncs last — the pick stays visible
    const phone = M({ "hits|Soto|0.5|o": [true, 100] });
    const laptop = M({ "hits|Soto|0.5|o": [false, 500] });
    expect(mergeCzHidden(phone, laptop)["hits|Soto|0.5|o"].hidden).toBe(false);
  });
  it("symmetric and idempotent — devices converge no matter who syncs first", () => {
    const a = M({ k1: [true, 10], k2: [false, 30], k3: [true, 5] });
    const b = M({ k2: [true, 20], k3: [true, 5], k4: [false, 40] });
    const ab = mergeCzHidden(a, b);
    const ba = mergeCzHidden(b, a);
    expect(ab).toEqual(ba);
    expect(JSON.stringify(ab)).toBe(JSON.stringify(ba)); // key ORDER is deterministic too
    expect(mergeCzHidden(ab, b)).toEqual(ab);
    expect(mergeCzHidden(ab, ab)).toEqual(ab);
  });
  it("equal `at` tie goes to hidden — deterministic from both sides", () => {
    const a = M({ k: [true, 100] });
    const b = M({ k: [false, 100] });
    expect(mergeCzHidden(a, b).k.hidden).toBe(true);
    expect(mergeCzHidden(b, a).k.hidden).toBe(true);
  });
  it("disjoint keys union", () => {
    const out = mergeCzHidden(M({ a: [true, 1] }), M({ b: [false, 2] }));
    expect(Object.keys(out).sort()).toEqual(["a", "b"]);
  });
});

describe("pruneCzHidden — tombstones drop after CZ_PRUNE_MS; hides never expire", () => {
  const NOW = 1_000_000_000_000;
  it("an old hidden:false tombstone drops; an equally old hide stays", () => {
    const map = M({
      oldTomb: [false, NOW - CZ_PRUNE_MS - 1],
      oldHide: [true, NOW - CZ_PRUNE_MS - 1],
      freshTomb: [false, NOW - 60_000],
    });
    const out = pruneCzHidden(map, NOW);
    expect(out.oldTomb).toBeUndefined();
    expect(out.oldHide).toEqual({ hidden: true, at: NOW - CZ_PRUNE_MS - 1 });
    expect(out.freshTomb).toBeDefined();
  });
});

describe("validateCzHidden — the wire gate", () => {
  it("rejects non-objects", () => {
    for (const bad of [null, [], "x", 7, true]) {
      expect(validateCzHidden(bad).ok).toBe(false);
    }
  });
  it("rejects malformed entries — missing at, non-boolean hidden, non-finite at", () => {
    expect(validateCzHidden({ k: { hidden: true } }).ok).toBe(false);
    expect(validateCzHidden({ k: { hidden: "yes", at: 1 } }).ok).toBe(false);
    expect(validateCzHidden({ k: { hidden: true, at: Infinity } }).ok).toBe(false);
    expect(validateCzHidden({ k: true }).ok).toBe(false); // the v1 shape does NOT validate — migration is client-side only
  });
  it("rejects oversize keys and oversize maps", () => {
    expect(validateCzHidden({ ["x".repeat(CZ_MAX_KEY_LEN + 1)]: { hidden: true, at: 1 } }).ok).toBe(false);
    const big: Record<string, { hidden: boolean; at: number }> = {};
    for (let i = 0; i <= CZ_MAX_KEYS; i++) big[`k${i}`] = { hidden: true, at: 1 };
    expect(validateCzHidden(big).ok).toBe(false);
  });
  it("accepts a good map and returns it intact", () => {
    const good = M({ "tb|Judge|1.5|o": [true, 123], "ml|NYY": [false, 456] });
    const v = validateCzHidden(good);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.map).toEqual(good);
  });
});

describe("wired — source scans, comment-stripped", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const read = (p: string) => strip(fs.readFileSync(path.join(process.cwd(), p), "utf8"));

  it("/api/prefs exists, fails closed on the same rails as /api/ledger, and MERGES — never replaces", () => {
    const src = read("app/api/prefs/route.ts");
    expect(src).toMatch(/syncConfigMissing/); // 503 when unconfigured
    expect(src).toMatch(/syncAuthed/); // 401 without Josh's phrase
    expect(src).toMatch(/export async function GET/);
    expect(src).toMatch(/export async function PUT/);
    expect(src).toMatch(/pl:prefs:v1/);
    expect(src).toMatch(/mergeCzHidden/); // the stored copy is merged INTO, not overwritten
    expect(src).toMatch(/pruneCzHidden/);
    expect(src).toMatch(/413/); // size guard
  });

  it("cz-offered pulls on load and pushes on toggle over the sync phrase; localStorage stays the offline copy", () => {
    const src = read("src/lib/cz-offered.ts");
    expect(src).toMatch(/\/api\/prefs/);
    expect(src).toMatch(/getSyncKey/); // the ledger-sync phrase — entered once per device, by Josh
    expect(src).toMatch(/x-pl-sync/);
    expect(src).toMatch(/pl_cz_hidden_v2/); // timestamped format under a NEW key…
    expect(src).toMatch(/pl_cz_hidden_v1/); // …with one-way migration from v1 (left in place for stale bundles)
    expect(src).toMatch(/mergeCzHidden/);
  });

  it("reset writes tombstones — it must SYNC, so it cannot just clear storage", () => {
    const src = read("src/lib/cz-offered.ts");
    expect(src).toMatch(/hidden:\s*false/); // the tombstone write
    expect(src).not.toMatch(/removeItem\(KEY\)/); // v2 is never wiped on reset
  });

  it("the board page contract is untouched — same hook, same keys", () => {
    const src = read("app/board/page.tsx");
    expect(src).toMatch(/useCzHidden\(/);
    expect(src).toMatch(/cz\.isHidden/);
  });

  it("the hidden-count line counts distinct PICKS, not hidden row occurrences (live read 2026-08-10: one hidden pick, twice in the list, read '2 picks hidden')", () => {
    const src = read("app/board/page.tsx");
    expect(src).not.toMatch(/rows\.length - visibleRows\.length/); // the occurrence arithmetic is gone
    expect(src).toMatch(/czHiddenHere = new Set\(/); // deduped by pick key
  });
});
