import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { slateScope, slateStarts } from "@/lib/server/slate";
import { LINEUP_LEAD_MS } from "@/lib/board-coverage";

/**
 * THE SCOPE STAMP (2026-08-06, operator item 3) — the board artifact must say what the DAY
 * looked like, not only what the engine priced.
 *
 * WHY: 2026-08-06 was a getaway day — first pitch 16:35Z, three games underway before the
 * scheduler's first poke ever landed (17:45:04Z). The gen block's `games`/`started` count
 * data.gameInfo — the ENGINE's population (what the odds feed returned) — so a board that
 * never saw the morning games would record nothing about them. gen.slate carries the
 * full-slate three numbers from statsapi (total / started / ready-unstarted), the same
 * population and classification the scheduler's decision body prints (scheduler-decide.ts
 * L26-31: ready, unstarted, started — the standing three-number rule). A partial population
 * can never again read as the whole INSIDE the artifact either.
 *
 * OBSERVED RED FIRST: module-not-found before src/lib/server/slate.ts existed, then the
 * started-as-ready plant below against a hand-built feed.
 */

const NOW = Date.parse("2026-08-06T17:45:00Z");
const feed = (starts: string[], detailedState = "Scheduled") => ({
  dates: [{ games: starts.map((s) => ({ gameDate: s, status: { detailedState } })) }],
});

// The real 08-06 slate shape: 11 games, 3 underway at 17:45Z, 3 ready, 5 not yet ready.
const SLATE_0806 = [
  "2026-08-06T16:35:00Z", "2026-08-06T16:40:00Z", "2026-08-06T17:10:00Z",
  "2026-08-06T18:10:00Z", "2026-08-06T18:20:00Z", "2026-08-06T20:10:00Z",
  "2026-08-06T22:05:00Z", "2026-08-06T23:10:00Z", "2026-08-06T23:15:00Z",
  "2026-08-06T23:40:00Z", "2026-08-07T01:40:00Z",
];

function mockFetch(body: unknown, ok = true) {
  return (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
}

describe("slateScope — the full-slate three numbers", () => {
  it("classifies the real 08-06 shape: total 11, started 3, ready 3 at 17:45Z", async () => {
    const s = await slateScope("2026-08-06", NOW, mockFetch(feed(SLATE_0806)));
    expect(s).toEqual({ total: 11, started: 3, ready: 3, unstarted: 8 });
  });

  it("PLANT: a started game must never count as ready — ready is a subset of unstarted", async () => {
    // One game, already underway. A classifier that tests only `start - LEAD <= now`
    // (forgetting `start > now`) reads it as ready — the §12Z.3 shape inside the stamp.
    const s = await slateScope("2026-08-06", NOW, mockFetch(feed(["2026-08-06T16:35:00Z"])));
    expect(s).toEqual({ total: 1, started: 1, ready: 0, unstarted: 0 });
    expect((s?.ready ?? 99) <= (s?.unstarted ?? 0)).toBe(true);
  });

  it("a failed feed returns NULL, never a zero that reads as an empty slate", async () => {
    expect(await slateScope("2026-08-06", NOW, mockFetch({}, false))).toBeNull();
    const throwing = (async () => { throw new Error("down"); }) as unknown as typeof fetch;
    expect(await slateScope("2026-08-06", NOW, throwing)).toBeNull();
  });

  it("postponed/cancelled games leave every population, and ready honours LINEUP_LEAD_MS", async () => {
    const s = await slateScope("2026-08-06", NOW, mockFetch({
      dates: [{ games: [
        { gameDate: "2026-08-06T23:10:00Z", status: { detailedState: "Postponed" } },
        { gameDate: new Date(NOW + LINEUP_LEAD_MS).toISOString(), status: { detailedState: "Scheduled" } },
        { gameDate: new Date(NOW + LINEUP_LEAD_MS + 60_000).toISOString(), status: { detailedState: "Scheduled" } },
      ] }],
    }));
    // exactly-at-lead is ready (<=); one minute beyond is not; the postponed game is nowhere
    expect(s).toEqual({ total: 2, started: 0, ready: 1, unstarted: 2 });
  });

  it("slateStarts keeps its scheduler semantics: [] on failure (decide() treats that as VACUOUS)", async () => {
    expect(await slateStarts("2026-08-06", mockFetch({}, false))).toEqual([]);
    expect(await slateStarts("2026-08-06", mockFetch(feed(SLATE_0806)))).toHaveLength(11);
  });
});

describe("the stamp is wired — source scan, comment-stripped", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  it("/api/generate attaches gen.slate via slateScope, and /api/scheduler imports the shared slateStarts", () => {
    const genSrc = strip(fs.readFileSync(path.join(process.cwd(), "app/api/generate/route.ts"), "utf8"));
    expect(genSrc).toMatch(/slate:\s*await\s+slateScope\(/);
    const schedSrc = strip(fs.readFileSync(path.join(process.cwd(), "app/api/scheduler/route.ts"), "utf8"));
    expect(schedSrc).toMatch(/from "@\/lib\/server\/slate"/);
    expect(schedSrc).not.toMatch(/statsapi\.mlb\.com/); // one copy of the feed URL, in slate.ts
  });
});
