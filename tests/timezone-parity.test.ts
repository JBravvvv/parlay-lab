import { describe, expect, it, vi } from "vitest";
import { createEngine } from "@/engine";
import { fixtureFetchJson } from "./helpers/fixture-env";

/**
 * SERVER vs CLIENT MUST SEE THE SAME SLATE (2026-07-25)
 *
 * `obSameDay` compared commence_time to the HOST's local calendar day, and it gated
 * both the game-odds loop and the props-event filter. On a UTC host (Vercel) that
 * dropped every game starting at or after 00:00 UTC — 8pm ET / 5pm PT — while a PT
 * browser kept them. ~24% of an average slate, up to 57% in a day, west-coast shaped,
 * and invisible to the whole test suite because createEngine REPLACES obSameDay with
 * a UTC-string comparison whenever `today` is pinned. The harness was simulating the
 * bug rather than catching it.
 *
 * So this file deliberately does NOT pin `today`: it runs the production code path at
 * two timezones and asserts they agree. Time/timezone-dependent behaviour gets tested
 * at both TZs — never patched out.
 */

const FIXTURE_SLATE_DAY = Date.parse("2026-07-10T20:00:00Z"); // 1pm PDT, 8pm UTC — same
// calendar day in BOTH zones, so any disagreement is the bug and not the clock.

async function gamesSeenAt(tz: string): Promise<string[]> {
  const prev = process.env.TZ;
  process.env.TZ = tz;
  try {
    vi.setSystemTime(FIXTURE_SLATE_DAY);
    // production obSameDay: no `today` override
    const eng = createEngine({ fetchJson: fixtureFetchJson });
    const slate = (await eng.collectSlate()) as { game_odds: { game: string }[] };
    return slate.game_odds.map((g) => g.game).sort();
  } finally {
    process.env.TZ = prev;
  }
}

describe("timezone parity: the server and the browser must price the same games", () => {
  it("UTC host and PT host produce an identical game set", async () => {
    const utc = await gamesSeenAt("UTC");
    const pt = await gamesSeenAt("America/Los_Angeles");
    expect(utc.length).toBeGreaterThan(0);
    expect(utc).toEqual(pt);
  }, 120000);

  it("neither host silently drops the late slate", async () => {
    // the six 00:06Z–02:16Z fixture games are the ones the calendar-day filter ate
    const utc = await gamesSeenAt("UTC");
    for (const late of [
      "Houston Astros @ Texas Rangers",
      "Los Angeles Angels @ Minnesota Twins",
      "Atlanta Braves @ St. Louis Cardinals",
      "Toronto Blue Jays @ San Diego Padres",
      "Arizona Diamondbacks @ Los Angeles Dodgers",
      "Colorado Rockies @ San Francisco Giants",
    ]) {
      expect(utc, `${late} missing on a UTC host`).toContain(late);
    }
  }, 120000);

  it("prices the whole scheduled slate, not a calendar-day slice of it", async () => {
    const utc = await gamesSeenAt("UTC");
    expect(utc.length).toBe(15); // the fixture's full slate
  }, 120000);
});
