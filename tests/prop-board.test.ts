import { beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FROZEN_NOW, TODAY, fixtureEngine, fixtureFetchJson } from "./helpers/fixture-env";
import { createEngine, type BoardData, type PropBoardGame, type PropBoardRow } from "@/engine";

/**
 * FULL PROP BOARD (2026-07-24) — the Parlay Builder tab was showing only the
 * players that survived the SELECTION pipeline: top 50 per market by win
 * probability, one side per line, and only batters with 25+ AB in the last 30
 * days who were in (or projected into) a posted lineup. On the fixture slate
 * that turned 133 posted anytime-HR prices into 50 and 81 hits rows into 50.
 *
 * `data.propBoard` is the whole book instead: every player, every line, both
 * sides, uncapped — display-only, so `categories`/parlays (and the parity
 * digest) are untouched. These tests pin the coverage and the honesty rules.
 */

type Slate = {
  props: Record<
    string,
    {
      markets: Record<string, { p: string; ln: number | null; o: number | null; u: number | null; cz?: { o: number | null; u: number | null } | null }[]>;
      alt?: Record<string, Record<string, { o: number | null; u: number | null }>>;
    }
  >;
};

const FIX = path.join(__dirname, "fixtures");
const MKTS = [
  "batter_hits",
  "batter_total_bases",
  "batter_home_runs",
  "batter_hits_runs_rbis",
  "pitcher_strikeouts",
  "pitcher_outs",
];

let slate: Slate;
let d: BoardData;
let board: PropBoardGame[];

const rowsOf = (mkt: string): PropBoardRow[] => board.flatMap((g) => g.markets[mkt] ?? []);

beforeAll(async () => {
  vi.setSystemTime(FROZEN_NOW);
  const eng = fixtureEngine();
  slate = (await eng.collectSlate()) as Slate;
  d = eng.analyze(slate);
  board = (d.propBoard ?? []) as PropBoardGame[];
}, 120000);

describe("full prop board — coverage", () => {
  it("carries EVERY priced player/line the feed posts, per game", () => {
    for (const matchup of Object.keys(slate.props)) {
      const g = board.find((x) => x.game.startsWith(matchup));
      expect(g, `${matchup} missing from the prop board`).toBeTruthy();
      for (const mkt of MKTS) {
        const feed = (slate.props[matchup].markets[mkt] ?? []).filter(
          (r) => r.ln != null && (r.o != null || r.u != null || r.cz),
        );
        if (!feed.length) continue;
        const got = new Set((g!.markets[mkt] ?? []).map((r) => `${r.p}|${r.ln}`));
        for (const r of feed) expect(got.has(`${r.p}|${r.ln}`), `${mkt} ${r.p} ${r.ln} dropped`).toBe(true);
      }
    }
  });

  it("is not capped at the selection pool's 50 rows per market", () => {
    // the fixture's HR + hits markets are the ones that used to be truncated
    expect((d.categories.batter_home_runs ?? []).length).toBe(50);
    expect(rowsOf("batter_home_runs").length).toBeGreaterThan(50);
    expect((d.categories.batter_hits ?? []).length).toBe(50);
    expect(rowsOf("batter_hits").length).toBeGreaterThan(50);
  });

  it("includes players the selection model filters out (bench bats, thin samples)", () => {
    const picked = new Set(
      (d.categories.batter_home_runs ?? []).map((r) => String(r.label).replace(/\s*\([A-Z]+\)$/, "")),
    );
    const extra = rowsOf("batter_home_runs").filter((r) => !picked.has(r.p));
    expect(extra.length).toBeGreaterThan(0);
    // and they are real quotes, not placeholders
    for (const r of extra) expect(r.cz?.o != null || r.o != null).toBe(true);
  });

  it("never lists the same player/line twice inside one game+market", () => {
    for (const g of board) {
      for (const mkt of Object.keys(g.markets)) {
        const keys = g.markets[mkt].map((r) => `${r.p}|${r.ln}`);
        expect(new Set(keys).size).toBe(keys.length);
      }
    }
  });
});

describe("full prop board — honesty", () => {
  it("every row carries at least one real posted price", () => {
    for (const r of MKTS.flatMap(rowsOf)) {
      expect(r.o != null || r.u != null || r.cz?.o != null || r.cz?.u != null).toBe(true);
    }
  });

  it("model % is the engine's own number for that exact line, when it priced it", () => {
    const byKey = new Map<string, number>();
    for (const mkt of MKTS) {
      for (const r of d.categories[mkt] ?? []) {
        // categories rows print the side in `sub` ("Hits O 1.5"); pO is the OVER
        const over = / O /.test(String(r.sub));
        if (r.lkey && typeof r.prob === "number") byKey.set(r.lkey, over ? r.prob : Math.round((100 - r.prob) * 10) / 10);
      }
    }
    let checked = 0;
    for (const r of MKTS.flatMap(rowsOf)) {
      const p = byKey.get(r.lkey);
      if (p == null || r.pO == null) continue;
      expect(Math.abs(r.pO - p)).toBeLessThanOrEqual(0.1);
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("unmodelled rows fall back to the de-vigged market fair, never to nothing invented", () => {
    const unmodelled = MKTS.flatMap(rowsOf).filter((r) => r.pO == null);
    expect(unmodelled.length).toBeGreaterThan(0);
    for (const r of unmodelled) {
      expect(r.fO == null || (r.fO > 0 && r.fO < 100)).toBe(true);
    }
  });

  it("keeps the Caesars quote separate from the best-price-in-the-feed quote", () => {
    const hr = rowsOf("batter_home_runs");
    const cz = hr.filter((r) => r.cz?.o != null);
    expect(cz.length).toBeGreaterThan(0);
    for (const r of cz) expect(typeof r.cz!.o).toBe("number");
    // one-sided market: the under is genuinely absent, not zero-filled
    expect(hr.every((r) => r.u == null || typeof r.u === "number")).toBe(true);
  });

  it("does not disturb the selection pool it is built beside", () => {
    // propBoard is display-only: the ranked categories still hold exactly the
    // rows the allocator sees (top 50, one side, with their EV/Kelly layers)
    for (const mkt of MKTS) {
      const cats = d.categories[mkt] ?? [];
      expect(cats.length).toBeLessThanOrEqual(50);
      for (const r of cats) expect(r).toHaveProperty("czEv");
    }
  });
});

/* ---- Caesars milestone ladders ("2+ hits") — real posted lines the consensus
   books don't mirror. They belong on a browsing board, flagged, and must never
   duplicate a standard row that already covers the same bet. ---- */
describe("full prop board — Caesars ladders", () => {
  const EV = "250b0373676b10f51ed1c59c93714245"; // NYY @ WSH — carries the ladder fixture

  it("adds ladder-only lines as ALT rows and de-dupes the ones already standard", async () => {
    const body = JSON.parse(fs.readFileSync(path.join(FIX, `fix40/props_alt_${EV}.json`), "utf8")) as {
      bookmakers: { key: string; markets: { key: string; outcomes: Record<string, unknown>[] }[] }[];
    };
    // give Caesars a ladder rung the standard market does not carry: "3+ hits"
    const cz = body.bookmakers.find((b) => b.key === "williamhill_us" && b.markets.some((m) => m.key === "batter_hits_alternate"))!;
    const ladder = cz.markets.find((m) => m.key === "batter_hits_alternate")!;
    const dupe = ladder.outcomes[0]; // "Nasim Nunez" 0.5 — already a standard row
    ladder.outcomes.push({ description: "Ben Rice", name: "Over", point: 3, price: 850 });

    const eng = createEngine({
      fetchJson: (url: string) =>
        url.includes(`/events/${EV}/odds`) ? Promise.resolve({ ok: true, body }) : fixtureFetchJson(url),
      today: TODAY,
    });
    const s2 = (await eng.collectSlate()) as Slate;
    const d2 = eng.analyze(s2);
    const g = (d2.propBoard as PropBoardGame[]).find((x) => x.game.startsWith("New York Yankees @ Washington Nationals"))!;
    const hits = g.markets["batter_hits"];

    // integer milestone normalises to the half-line it actually is (3+ → over 2.5)
    const rung = hits.find((r) => r.p === "Ben Rice" && r.ln === 2.5);
    expect(rung, "ladder-only rung missing").toBeTruthy();
    expect(rung!.alt).toBe(true);
    expect(rung!.cz?.o).toBe(850);
    expect(rung!.pO).toBe(null); // the engine never priced this line — no invented %

    // the rung that duplicates a standard row stays a single, non-ALT row
    const dupeRows = hits.filter((r) => r.p === dupe.description && r.ln === dupe.point);
    expect(dupeRows.length).toBe(1);
    expect(dupeRows[0].alt).toBeUndefined();
  }, 120000);
});
