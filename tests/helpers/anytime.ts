import type { Candidate } from "@/lib/anytime/types";

/* Shared fixtures for the any-time engine tests. Every price here is invented for the test. */

/** "Now" in every test unless the test moves the clock: Sunday 2026-11-15 10:00 MST. */
export const T0 = Date.parse("2026-11-15T17:00:00Z");
/** Kickoff 4 h 25 min after T0. */
export const KICK = "2026-11-15T21:25:00Z";

/** Home -2.5: DraftKings -110 / -110, FanDuel -105 / -115. Model 55%: +7.4% at FanDuel. */
export function cand(over: Partial<Candidate> = {}): Candidate {
  return {
    sport: "nfl",
    eventId: "ev1",
    event: "Away @ Home",
    commence: KICK,
    market: "spread",
    marketType: "nfl:spread",
    side: "home",
    selection: "Home -2.5",
    line: -2.5,
    model: { win: 0.55, push: 0 },
    modelVersion: "t-1",
    modelKind: "independent",
    quotes: { draftkings: { price: -110, opp: -110 }, fanduel: { price: -105, opp: -115 } },
    snapshotId: "snap-1",
    fetchedAt: T0 - 1_000,
    live: false,
    gradeRef: { source: "espn", league: "nfl", id: "g1", home: "Home", away: "Away" },
    ...over,
  };
}

/** A clock a test can move. */
export function clockAt(start: number = T0) {
  let t = start;
  const fn = () => t;
  fn.set = (v: number) => {
    t = v;
  };
  fn.add = (ms: number) => {
    t += ms;
  };
  return fn;
}
