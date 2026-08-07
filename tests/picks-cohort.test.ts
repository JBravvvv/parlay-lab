import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { boardToPredictions, type DayBlob } from "@/lib/pred-serialize";
import { buildCohortRecord, cohortDay, PROP_MARKETS, STAMP_SHIP_DATE, TOP_N } from "@/lib/server/grading-progress";

/**
 * THE PICKS PRODUCT (2026-08-07, operator requirement: ship picks — a visible daily
 * top-50 overs list per prop market, each cohort GRADED with a running record. Not for
 * the card; for the learning surface and for Josh to follow.)
 *
 * THE SUBSTRATE, from the 08-07 audit: prediction records ARE the board tab rows —
 * boardToPredictions iterates d.categories per market in the ENGINE'S OWN RANKED ORDER
 * (the same arrays the tabs render, tab spec: ranked by r.prob, engine L2575). What was
 * missing: the rank was never STORED, so "the top 50 that day" was not a first-class
 * cohort. (cfSel carries a rank, but counterfactual-pool scope, susp rows only.)
 *
 * SHIPPED SHAPE:
 *  - mrank stamped on records at generation (append-only fact; purity-aware — an impure
 *    row consumes NO rank, mirroring splitPure's exclusion on the page);
 *  - cohortDay/buildCohortRecord: per market per day W-L vs pooled implied, running
 *    across days, source-labeled STAMPED-AT-LOCK vs RECONSTRUCTED-FROM-STORED-BOARD
 *    (historical dates: a re-sort of stored IMMUTABLE p over non-superseded rows);
 *  - /api/picks: public like /api/board — picks + record, reads only;
 *  - IMPOSSIBLE BRANCH: a settled row without a stored rank inside a stamped-era
 *    date/market prints into the record's `impossible` list, loudly, never silently.
 *
 * OBSERVED RED FIRST: missing exports; the impure-row rank plant; the no-rank-in-stamped
 * -mode impossible branch; vacuity over zero settled rows.
 */

const row = (lkey: string, prob: number, over: Record<string, unknown> = {}) => ({
  label: lkey.split("|")[0],
  sub: "o",
  gkey: "g1",
  lkey,
  prob,
  implied: 50,
  edge: 5,
  ...over,
});

describe("mrank — stamped at generation, purity-aware, engine order preserved", () => {
  it("stamps 1..n in category-array order per market; the 'all' tab never stamps", () => {
    const d = {
      categories: {
        all: [row("z|batter_hits|0.5", 99)],
        batter_hits: [row("a|batter_hits|0.5", 80), row("b|batter_hits|0.5", 70), row("c|batter_hits|0.5", 60)],
        batter_home_runs: [row("d|batter_home_runs|0.5", 30)],
      },
    };
    const { records } = boardToPredictions(d as never);
    const byL = Object.fromEntries(records.map((r) => [r.lkey, r.mrank]));
    expect(byL["a|batter_hits|0.5"]).toBe(1);
    expect(byL["b|batter_hits|0.5"]).toBe(2);
    expect(byL["c|batter_hits|0.5"]).toBe(3);
    expect(byL["d|batter_home_runs|0.5"]).toBe(1); // rank is PER MARKET
  });

  it("PLANT — an impure row (cross-market lkey) consumes NO rank, mirroring splitPure", () => {
    const d = {
      categories: {
        batter_hits: [
          row("a|batter_hits|0.5", 80),
          row("rl_home", 75, { label: "PHI RL" }), // the contamination shape, planted
          row("b|batter_hits|0.5", 70),
        ],
      },
    };
    const { records } = boardToPredictions(d as never);
    const byL = Object.fromEntries(records.map((r) => [r.lkey, r.mrank]));
    expect(byL["a|batter_hits|0.5"]).toBe(1);
    expect(byL["rl_home"]).toBeUndefined(); // no rank for the impure row
    expect(byL["b|batter_hits|0.5"]).toBe(2); // and it did not eat a slot
  });
});

const blobWith = (records: Record<string, unknown>): DayBlob =>
  ({ date: "2026-08-06", at: 1, records, parlays: {}, games: {} }) as never;

const settled = (lkey: string, res: "won" | "lost", mrank?: number, over: Record<string, unknown> = {}) => ({
  k: lkey,
  label: lkey.split("|")[0],
  sub: "o",
  market: lkey.split("|")[1] ?? "batter_hits",
  gkey: "g1",
  lkey,
  p: 60,
  pMkt: 55,
  res,
  ...(mrank != null ? { mrank } : {}),
  ...over,
});

describe("cohortDay — stamped preferred, reconstruction labeled, the impossible branch loud", () => {
  it("stamped mode: cohort = rows with mrank <= TOP_N; source STAMPED-AT-LOCK", () => {
    const d = cohortDay(
      blobWith({
        a: settled("a|batter_hits|0.5", "won", 1),
        b: settled("b|batter_hits|0.5", "lost", 2),
        c: settled("c|batter_hits|0.5", "won", 51), // beyond TOP_N — not in the cohort
      }),
      "2026-08-06",
    );
    const bh = d.markets["batter_hits"];
    expect(bh).toMatchObject({ n: 2, w: 1, l: 1, source: "STAMPED-AT-LOCK" });
    expect(d.impossible).toEqual([]);
  });

  it("IMPOSSIBLE BRANCH — a PURE settled row with NO rank, POST-ship date, stamped-era market: prints, never silent", () => {
    const d = cohortDay(
      blobWith({
        a: settled("a|batter_hits|0.5", "won", 1),
        b: settled("b|batter_hits|0.5", "won"), // graded, rankless, stamped era, post-ship
      }),
      "2026-08-09", // strictly after STAMP_SHIP_DATE
    );
    expect(d.impossible).toHaveLength(1);
    expect(d.impossible[0]).toMatchObject({ date: "2026-08-09", market: "batter_hits", lkey: "b|batter_hits|0.5" });
    expect(d.preStamp).toBe(0);
  });

  it("REVIEW FINDING 1a — the deploy-transition date holds both vintages legitimately: preStamp counted, NO red flag", () => {
    const d = cohortDay(
      blobWith({
        a: settled("a|batter_hits|0.5", "won", 1), // post-deploy pass, stamped
        b: settled("b|batter_hits|0.5", "won"), // pre-deploy pass, rankless — expected
      }),
      STAMP_SHIP_DATE,
    );
    expect(d.impossible).toEqual([]);
    expect(d.preStamp).toBe(1);
    const rec = buildCohortRecord([d]);
    expect(rec.flag).toBeUndefined();
    expect(rec.preStamp).toBe(1);
  });

  it("REVIEW FINDING 1b — an impure settled row is counted `impure`, never flagged, never in a cohort", () => {
    const d = cohortDay(
      blobWith({
        a: settled("a|batter_hits|0.5", "won", 1),
        x: settled("rl_home", "won", undefined, { market: "batter_hits" }), // the contamination shape, settled
      }),
      "2026-08-09",
    );
    expect(d.impure).toBe(1);
    expect(d.impossible).toEqual([]);
    expect(d.markets["batter_hits"].n).toBe(1);
  });

  it("REVIEW FINDING (implied sentinel) — pMkt 0 is a stored null, never a real implied", () => {
    const d = cohortDay(
      blobWith({
        a: settled("a|batter_hits|0.5", "won", 1, { pMkt: 0, p: 60 }), // sentinel -> falls back to p
        b: settled("b|batter_hits|0.5", "lost", 2, { pMkt: 55 }),
      }),
      "2026-08-09",
    );
    const bh = d.markets["batter_hits"];
    expect(bh.impliedN).toBe(2);
    expect(bh.impliedSum).toBe(60 + 55); // 0-sentinel replaced by p, not averaged in as 0
  });

  it("reconstructed mode: no mrank anywhere -> top-N by stored p desc, labeled RECONSTRUCTED", () => {
    const d = cohortDay(
      blobWith({
        a: settled("a|batter_hits|0.5", "won", undefined, { p: 80 }),
        b: settled("b|batter_hits|0.5", "lost", undefined, { p: 70 }),
      }),
      "2026-07-26",
    );
    expect(d.markets["batter_hits"]).toMatchObject({ n: 2, w: 1, l: 1, source: "RECONSTRUCTED-FROM-STORED-BOARD" });
    expect(d.impossible).toEqual([]);
  });

  it("REVIEW FINDING (membership) — reconstruction ranks the FULL population; settled rows beyond the membership stay out", () => {
    // 51 rows, p descending. Rank 1 is PENDING (occupies its membership slot);
    // ranks 2..51 settled. Membership = top 50 by p; the 51st settled row is OUT
    // even though it settled — a settled-only sort would have promoted it.
    const records: Record<string, unknown> = {};
    for (let i = 0; i < 51; i++) {
      const lkey = `p${String(i).padStart(2, "0")}|batter_hits|0.5`;
      records[`r${i}`] =
        i === 0
          ? { ...settled(lkey, "won", undefined, { p: 90 }), res: "pending" }
          : settled(lkey, i % 2 ? "won" : "lost", undefined, { p: 89 - i });
    }
    const d = cohortDay(blobWith(records), "2026-07-26");
    const bh = d.markets["batter_hits"];
    // membership = 50 rows (incl. the pending #1); graded cohort = its 49 settled members
    expect(bh.n).toBe(49);
    expect(bh.source).toBe("RECONSTRUCTED-FROM-STORED-BOARD");
  });

  it("superseded rows and non-prop markets stay out of every cohort", () => {
    const d = cohortDay(
      blobWith({
        a: settled("a|batter_hits|0.5", "won", 1, { superseded: true }),
        m: settled("ml_home", "won", 1, { market: "ml" }),
      }),
      "2026-08-06",
    );
    expect(Object.keys(d.markets)).toEqual([]);
  });
});

describe("buildCohortRecord — the running record, source split, vacuity", () => {
  it("accumulates W-L and implied across days and splits by source", () => {
    const days = [
      cohortDay(blobWith({ a: settled("a|batter_hits|0.5", "won", undefined, { p: 80 }) }), "2026-07-26"),
      cohortDay(blobWith({ b: settled("b|batter_hits|0.5", "lost", 1) }), "2026-08-06"),
    ];
    const rec = buildCohortRecord(days);
    const bh = rec.markets["batter_hits"];
    expect(bh).toMatchObject({ days: 2, n: 2, w: 1, l: 1 });
    expect(bh.hitRate).toBeCloseTo(0.5, 10);
    expect(bh.bySource).toEqual({ stamped: 1, reconstructed: 1 });
    expect(rec.impossible).toEqual([]);
  });

  it("VACUITY — a record over zero settled cohort rows declares itself", () => {
    const rec = buildCohortRecord([]);
    expect(rec.vacuous).toMatch(/VACUOUS/);
  });

  it("PROP_MARKETS is exactly the six; TOP_N is 50", () => {
    expect([...PROP_MARKETS].sort()).toEqual([
      "batter_hits",
      "batter_hits_runs_rbis",
      "batter_home_runs",
      "batter_total_bases",
      "pitcher_outs",
      "pitcher_strikeouts",
    ]);
    expect(TOP_N).toBe(50);
  });
});

describe("wired — source scans, comment-stripped", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const read = (p: string) => strip(fs.readFileSync(path.join(process.cwd(), p), "utf8"));

  it("/api/picks exists, public like /api/board (no auth gate), reads the stored board + the record", () => {
    const src = read("app/api/picks/route.ts");
    expect(src).toMatch(/BOARD_KEY|decodeBoard/);
    expect(src).toMatch(/PROGRESS_KEY|cohorts/);
    expect(src).not.toMatch(/cronHeaderAuthed|syncAuthed|x-pl-sync/); // reads model output over public data
  });
  it("calibrate attaches cohorts to the progress artifact; the board page shows the record", () => {
    expect(read("app/api/calibrate/route.ts")).toMatch(/cohorts/);
    expect(read("app/board/page.tsx")).toMatch(/cohorts/);
  });
  it("separation: the picks route never imports the allocator or engine, and never writes", () => {
    const src = read("app/api/picks/route.ts");
    expect(src).not.toMatch(/shAllocate|shCardPool|createEngine/);
    expect(src).not.toMatch(/redisSetJson|\["SET"/);
  });
});
