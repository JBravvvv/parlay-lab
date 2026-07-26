import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createEngine, type Engine } from "@/engine";

/**
 * booksInd — "no independent consensus ⇒ NOT ELIGIBLE", at ANY mktN (2026-07-26).
 *
 * WHY THIS TEST EXISTS AND THE BASELINES DO NOT COVER IT.
 * The rule's real case is a NON-HR ticket carrying a `booksInd === 0` leg that also
 * clears +2% EV. On the captured fixture that ticket does not exist: every `books === 0`
 * row there is `batter_home_runs`, and `coreNoHR` drops HR tickets at `shCoreEligible`,
 * which is step 1 of `shAllocate` — four steps before the gate. Measured on the fixture:
 * pool 48, of which 12 carry a `books === 0` leg, ALL 12 HR, and **zero** reach the gate.
 *
 * So `baseline43` is byte-identical (new fields are not hashed; the gate is in
 * `shAllocate`, which it never covered) and `baseline-armed-v1` is byte-identical too
 * (nothing reaches the gate). **Both nulls are limitations of the fixture, not results.**
 * This file is the evidence the rule ships on: a synthetic ticket built to actually reach
 * the gate, and its twin that differs only in `booksInd`.
 */

const stubFetch = () => Promise.resolve({ ok: false, body: {} });
function eng(): Engine {
  const e = createEngine({ fetchJson: stubFetch, today: "2026-07-26" });
  e.set("SH_V2", { sim: true });
  return e;
}
const cfgOf = (e: Engine, patch: Record<string, unknown> = {}) => ({
  ...e.get<Record<string, unknown>>("SH_CFG"),
  ...patch,
});

/**
 * A ticket engineered to survive every filter AHEAD of the gate:
 * not HR (coreNoHR), 2 legs (coreMaxLegs 3), czDec 2.5 (coreMaxDec 15),
 * czEv +8 (clears coreEvMin +2 AND coreCzEvMin 0), and Kelly-consistent —
 * prob 45% at 2.5 gives 0.45*2.5-1 = +12.5%, so the kellyStakeMult ceiling
 * cannot silently zero the stake and hand back an empty pick list.
 */
function ticket(booksInd: number | null, over: Partial<Record<string, unknown>> = {}) {
  return {
    pl: {
      name: "TB parlay · 2 legs",
      type: "batter_total_bases",
      prob: 45,
      czDec: 2.5,
      czOdds: "+150",
      czEv: 8,
      bsDec: 2.5,
      bsEv: 8,
      consCzEv: 5, // comfortably above consMinEv, so the small-sample gate cannot be
      consEv: 5, // what blocks — isolating booksInd as the only cause
      legs: [
        { label: "A Judge", prop: "TB O1.5", lkey: "a judge|batter_total_bases|1.5", gkey: "g1", cz: 120, bs: 120, imp: 42, booksInd },
        { label: "R Devers", prop: "TB O1.5", lkey: "r devers|batter_total_bases|1.5", gkey: "g2", cz: 115, bs: 115, imp: 43, booksInd: 3 },
      ],
      ...over,
    },
    src: "parlays",
    idx: 0,
  };
}

function run(e: Engine, pool: unknown[], patch: Record<string, unknown> = {}) {
  return e.get<(p: unknown, a: number, c: unknown, f: boolean) => Record<string, unknown>>("shAllocate")(
    pool,
    250,
    cfgOf(e, patch),
    false,
  );
}
const blockedReasons = (r: Record<string, unknown>) =>
  ((r.blocked as { reason: string }[] | undefined) ?? []).map((b) => b.reason);

describe("booksInd gate — the rule is load-bearing, not coincidental", () => {
  it("BLOCKS a ticket whose leg has booksInd === 0, with reason no_ind_consensus", () => {
    const e = eng();
    const r = run(e, [ticket(0)]);
    expect(blockedReasons(r)).toContain("no_ind_consensus");
    expect((r.picks as unknown[]).length).toBe(0);
  });

  it("PASSES the identical ticket with booksInd === 1 — so booksInd is what blocked it", () => {
    const e = eng();
    const r = run(e, [ticket(1)]);
    expect(blockedReasons(r)).not.toContain("no_ind_consensus");
    expect((r.picks as unknown[]).length).toBe(1);
    // NOT 250: a single Kelly-consistent ticket is capped by kellyStakeMult x its
    // 1/4-Kelly stake, so the allocator fills to the ceiling and reports the rest as
    // `unallocated` (the documented thin-pool path). What matters here is that a pick
    // was MADE — asserting the full 250 would be asserting a different rule's behaviour.
    expect(Number(r.sum)).toBeGreaterThan(0);
  });

  it("blocks at ANY mktN — this is the whole point, and consMinN does NOT behave this way", () => {
    const proven = { mktN: { batter_total_bases: 500 } }; // far past consMinN (100)
    // the small-sample consensus gate is switched OFF at this mktN...
    const passes = run(eng(), [ticket(1)], proven);
    expect((passes.picks as unknown[]).length).toBe(1);
    // ...and booksInd === 0 is blocked anyway
    const blocked = run(eng(), [ticket(0)], proven);
    expect(blockedReasons(blocked)).toContain("no_ind_consensus");
    expect((blocked.picks as unknown[]).length).toBe(0);
  });

  it("a proven market with a THIN-but-present read still passes — the two rules are distinct", () => {
    // booksInd 1 + a consensus read that would FAIL consMinEv, but the market is proven,
    // so the small-sample gate does not run. Only booksInd === 0 blocks unconditionally.
    const r = run(eng(), [ticket(1, { consCzEv: -9 })], { mktN: { batter_total_bases: 500 } });
    expect(blockedReasons(r)).toEqual([]);
    expect((r.picks as unknown[]).length).toBe(1);
  });

  it("the same thin read in an UNPROVEN market is still caught by consMinN, not by booksInd", () => {
    const r = run(eng(), [ticket(1, { consCzEv: -9 })], { mktN: {} });
    expect(blockedReasons(r)).toContain("consensus");
    expect(blockedReasons(r)).not.toContain("no_ind_consensus");
  });

  it("blocks on ANY leg, not just the first", () => {
    const t = ticket(3);
    (t.pl.legs as Record<string, unknown>[])[1].booksInd = 0;
    expect(blockedReasons(run(eng(), [t]))).toContain("no_ind_consensus");
  });

  it("a missing booksInd is NOT treated as zero — absent data must not silently block", () => {
    // null/undefined means "this row predates the field", which is a different statement
    // from "measured, and no independent book exists". Strict === 0 is deliberate.
    expect(blockedReasons(run(eng(), [ticket(null)]))).not.toContain("no_ind_consensus");
  });

  it("the gate is disciplined-mode only — legacy modes are untouched (parity posture)", () => {
    const r = run(eng(), [ticket(0)], { selMode: "caesars_ev" });
    expect(blockedReasons(r)).not.toContain("no_ind_consensus");
  });
});

describe("booksInd is threaded onto the row and the leg", () => {
  it("finalizeCats emits booksInd and legOf carries it", () => {
    const raw = fs.readFileSync(path.join(process.cwd(), "legacy/index.html"), "utf8");
    const s = raw.replace(/\/\*[\s\S]*?\*\//g, ""); // strip comments — never assert on my own prose
    expect(s).toMatch(/booksInd:fairs\.filter/); // slate row
    expect(s).toMatch(/booksInd:\(r\.booksInd!=null\)\?r\.booksInd:null/); // board row
    expect(s).toMatch(/booksInd:\(x\.r\.booksInd!=null\?x\.r\.booksInd:null\)/); // ticket leg
    expect(s).toMatch(/l\.booksInd===0/); // the gate reads the leg, strict
  });
});
