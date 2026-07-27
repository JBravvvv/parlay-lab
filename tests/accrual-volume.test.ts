import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FROZEN_NOW, armedFixtureEngine } from "./helpers/fixture-env";
import { boardToPredictions, mergeDayBlob, HIST_MAX } from "@/lib/pred-serialize";

/**
 * ACCRUAL VOLUME — the two unguarded inputs to `mktN` (2026-07-27).
 *
 * `mktN` under `consMinN` (100) forces every ticket in a market to clear the de-vigged
 * consensus too, which is what a NO-PLAY day is made of. Its accrual rate therefore sets the
 * date each market can be bet again. Three inputs to that rate had no guard, and all three
 * fail in the SAME direction — a smaller `n` than reality, so a later date, silently:
 *
 *   #5  `boardToPredictions` row VOLUME — six test files exercise the path and none asserts
 *       a count. A pass logging 40 rows instead of 300 is behaviourally correct and
 *       multiplies every reopening date by 7.
 *   #6  `GRADE_DAYS = 6` with no revisit — fixed separately in /api/calibrate (stranded-date
 *       retry rotation + `summary.stranded`).
 *   #7  `MAX_RECORDS` / `MAX_BYTES` — a day blob over the cap is rejected 413 and the WHOLE
 *       day is lost.
 *
 * Volume is the awkward one to assert because the honest floor depends on the slate. So the
 * primary assertion is a RATIO — rows per priced game — which is slate-independent, with a
 * loose absolute floor beside it.
 */

const ROUTE = fs.readFileSync(path.join(__dirname, "..", "app", "api", "predictions", "route.ts"), "utf8");

describe("prediction accrual volume — the rate that sets every reopening date", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FROZEN_NOW);
  });
  afterAll(() => vi.useRealTimers());

  it("logs a plausible number of rows per priced game, not just 'some rows'", async () => {
    const eng = armedFixtureEngine();
    const d = eng.analyze(await eng.collectSlate()) as never;
    const { records, parlays, games } = boardToPredictions(d, { src: "cron", selMode: "ev_gated" });
    const nGames = Object.keys(games).length;
    expect(nGames).toBeGreaterThan(0);

    /* measured on this fixture 2026-07-27: 199 records / 15 games = 13.3 per game.
       The floor is 8 — comfortably under the real figure, and far above the 2.7/game a
       40-row pass would produce. A ratio, so a smaller slate does not trip it. */
    const perGame = records.length / nGames;
    expect(perGame, `only ${records.length} rows over ${nGames} games — accrual has collapsed`)
      .toBeGreaterThanOrEqual(8);
    expect(records.length).toBeGreaterThanOrEqual(120);
    // tickets accrue too; a board with rows but no tickets is a different failure
    expect(parlays.length).toBeGreaterThanOrEqual(20);
  }, 120_000);

  it("the day blob sits far under MAX_BYTES, and the headroom is stated not assumed", async () => {
    const eng = armedFixtureEngine();
    const d = eng.analyze(await eng.collectSlate()) as never;
    const { records, parlays, games } = boardToPredictions(d, { src: "cron", selMode: "ev_gated" });
    const { blob } = mergeDayBlob(null, "2026-07-10", records, parlays, games, FROZEN_NOW);
    const bytes = JSON.stringify(blob).length;

    const MAX_BYTES = Number(/const MAX_BYTES = ([\d_]+);/.exec(ROUTE)?.[1]?.replace(/_/g, ""));
    expect(MAX_BYTES).toBe(3_000_000);
    // measured: 232,170 bytes = 7.7% of the cap on a 15-game slate
    expect(bytes).toBeLessThan(MAX_BYTES * 0.4);
    expect(bytes).toBeGreaterThan(50_000); // ...and a suspiciously SMALL blob is also a failure
  }, 120_000);

  it("MAX_RECORDS truncation is LOUD and RECORDED — no longer silent", () => {
    const MAX_RECORDS = Number(/const MAX_RECORDS = (\d+);/.exec(ROUTE)?.[1]);
    expect(MAX_RECORDS).toBe(800); // NOT raised: frozen. Only the loss is made visible.
    expect(ROUTE).toContain("body.records.slice(0, MAX_RECORDS)");
    // 1. it logs, with the dropped count
    expect(ROUTE).toMatch(/console\.warn\(\s*`\[predictions\] TRUNCATED/);
    expect(ROUTE).toContain("const dropR = sentR - records.length");
    // 2. it lands on the day blob, so the loss survives the log's retention
    expect(ROUTE).toContain("blob.trunc = [");
    // 3. and it comes back in the response, so the caller knows too
    expect(ROUTE).toContain("truncated: { sent: sentR");
  });

  it("/api/generate NEVER slices — asserted, because the cron path is what feeds mktN", () => {
    const GEN = fs.readFileSync(path.join(__dirname, "..", "app", "api", "generate", "route.ts"), "utf8");
    /* This was stated as fact in a report before it was checked. A truncation on the CRON
       path would move every market's reopening date with nothing to show for it — the client
       path at least has a human watching a response. So: no slice, cap or take anywhere
       between boardToPredictions and mergeDayBlob. */
    const from = GEN.indexOf("boardToPredictions(data");
    const to = GEN.indexOf("redisSetJson(dayKey(date)");
    expect(from).toBeGreaterThan(0);
    expect(to).toBeGreaterThan(from);
    const span = GEN.slice(from, to);
    expect(span).not.toMatch(/\.slice\(/);
    expect(span).not.toMatch(/MAX_RECORDS|MAX_PARLAYS/);
    // the records it merges are exactly the ones the board produced
    expect(span).toMatch(/mergeDayBlob\(cur, date, records, parlays, games, now/);
  });

  it("repeated passes do not grow the blob without bound — hist is capped", () => {
    const rec = (k: string, p: number) =>
      ({ k, label: "X", sub: "o0.5", p, lu: "confirmed", gkey: "g1", lkey: "g1|batter_hits|0.5" }) as never;
    let blob = mergeDayBlob(null, "2026-07-10", [rec("a", 50)], [], {}, 1).blob;
    for (let i = 2; i <= 10; i++) blob = mergeDayBlob(blob, "2026-07-10", [rec("a", 50 + i)], [], {}, i).blob;
    // ten passes, four kept: the four cron entries cannot inflate the day blob past the cap
    expect(HIST_MAX).toBe(4);
    expect(blob.records.a.hist?.length).toBe(HIST_MAX);
  });
});
