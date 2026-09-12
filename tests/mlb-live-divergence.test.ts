import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/source";
import {
  WHY_RANK,
  divergenceOf,
  selectLiveEvents,
  type MlbLiveCandidate,
  type MlbLiveGame,
  type MlbLiveOverlayRead,
  type MlbStoredRow,
} from "@/lib/mlb/live-divergence";
import { MLB_LIVE_PROPS } from "@/lib/mlb/live-props-rules";
import { MONOTONE_MARKETS } from "@/lib/leg-settled";

/**
 * INSTRUCTION 51 (2026-09-11) — THE FREE DIVERGENCE GATE, which decides WHICH live games are worth
 * paying for before a single Odds credit is spent. Pure: no network, no mocks, no clock — `now` is
 * a parameter, so every window boundary below is exercised at an exact instant.
 *
 * JOSH'S COMPLAINT IS A TEST CASE HERE, verbatim: "It's not updating with live odds; it will show
 * the player is top 4th w/ 3 H+R+RBI, but show them as an 'S' grade for over .5 H+R+RBI when their
 * live over/under is 3.5 H+R+RBI". That row is `cleared` — the proof case — and the PLANT at the
 * bottom shows it is the `cleared` branch ALONE that buys it.
 */

const CFG = MLB_LIVE_PROPS;
const NOW = Date.parse("2026-09-11T23:52:00.000Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const MIN = 60_000;

let pk = 700000;
const game = (gkey: string, over: Partial<MlbLiveGame> = {}): MlbLiveGame => ({
  gkey,
  pk: pk++,
  live: true,
  final: false,
  oddsEventId: `ev-${gkey}`,
  ...over,
});

type CandOpts = {
  rows?: MlbStoredRow[];
  tallies?: Record<string, number | null>;
  legP?: Record<string, number | null>;
  pricedAt?: string;
  emptyAt?: string;
  game?: Partial<MlbLiveGame>;
};

function cand(gkey: string, o: CandOpts = {}): MlbLiveCandidate {
  const overlay: MlbLiveOverlayRead | null =
    o.pricedAt || o.emptyAt
      ? {
          pricedAt: o.pricedAt ? { [gkey]: o.pricedAt } : {},
          emptyAt: o.emptyAt ? { [gkey]: o.emptyAt } : {},
        }
      : null;
  return {
    game: game(gkey, o.game ?? {}),
    rows: o.rows ?? [],
    tallies: o.tallies ?? {},
    legP: o.legP ?? {},
    overlay,
  };
}

const of = (c: MlbLiveCandidate, now = NOW) => divergenceOf(c.game, c.rows, c.tallies, c.legP, c.overlay, now, CFG);
const whys = (cs: MlbLiveCandidate[], now = NOW) => selectLiveEvents(cs, now, CFG).events.map((e) => `${e.game.gkey}:${e.why}`);

/* ── JOSH'S ROW ─────────────────────────────────────────────────────────────────────────────────
   Aaron Judge, over 0.5 H+R+RBI stamped pregame, 3 banked in the top of the 4th. The pregame
   probability (78.2%) and the sim's remaining-game probability (78.0%) barely differ, so drift is
   0.002 — well under driftMin, so it is NOT the drift rung that buys this game.

   AMENDED (fix pass, 2026-09-11). This fixture used to be priced two minutes ago, because the
   shipped gate let `cleared` bypass the game's own liveRevalidateSec window. That bypass was the
   defect: `clearedCount` comes off the STORED board, which only /api/generate rewrites, so a row
   past its pregame line stays past it for the rest of the game and said "buy this game" on every
   single call — turning the free gate into "buy every live game, every pass" by the middle innings.
   The window is now a floor under `cleared` (drift still beats it — see the module's own note on
   why new information and a standing fact are different things), so the fixture is priced OUTSIDE
   its window, which is when a cleared game is genuinely worth a credit. The floor itself is pinned
   by its own test below, and the inside-the-window case is asserted there. */
const JUDGE = "Aaron Judge|batter_hits_runs_rbis|0.5";
const joshsGame = (pricedAgo = CFG.liveRevalidateSec * 1000 + MIN) =>
  cand("phi@nyy", {
    rows: [{ lkey: JUDGE, prob: 78.2 }],
    tallies: { [JUDGE]: 3 },
    legP: { [JUDGE]: 0.78 },
    pricedAt: iso(pricedAgo),
  });

describe("WHY_RANK — proof first, cheapest win last", () => {
  it("is the four-outcome ladder, in order", () => {
    expect(WHY_RANK).toEqual({ cleared: 0, drifted: 1, unpriced: 2, expired: 3 });
  });
});

describe("cleared — the proof case, which is Josh's complaint", () => {
  it("a tally past the stored line is `cleared` regardless of drift", () => {
    const d = of(joshsGame());
    expect(d.why).toBe("cleared");
    expect(d.clearedCount).toBe(1);
    expect(d.drift).toBeLessThan(CFG.driftMin); // it was NOT the drift that bought this game
  });

  it("a cleared row past its window IS bought — proof is the first thing the budget pays for", () => {
    expect(whys([joshsGame()])).toEqual(["phi@nyy:cleared"]);
  });

  it("THE FLOOR: a cleared row INSIDE the game's own liveRevalidateSec window is NOT bought", () => {
    /* The fix, pinned. Priced two minutes ago, one cleared row, nothing drifted: the game is
       carried. This is the line between a gate that bounds the day at ~174 credits and one that
       re-buys every live game on every poll for the rest of the slate — including on every PWA cold
       start, which builds a fresh QueryClient and fetches immediately.

       Nothing is lost by waiting. `clearedIsProof` has already dropped any row the last pull
       re-anchored, so a row still counted `cleared` here is one the book posts no in-play market
       for, or one it prices UNDER the tally (provably settled — INSTRUCTION 50's case B). Neither
       of those changes in two minutes, and neither needs a credit to be read correctly. */
    const inside = joshsGame(2 * MIN);
    expect(of(inside).clearedCount).toBe(1); // still counted, still reported honestly
    expect(of(inside).why).toBeNull();
    expect(whys([inside])).toEqual([]);
  });

  it("the floor is the window's own boundary, to the millisecond", () => {
    expect(of(joshsGame(CFG.liveRevalidateSec * 1000)).why).toBeNull();
    expect(of(joshsGame(CFG.liveRevalidateSec * 1000 + 1)).why).toBe("cleared");
  });

  it("AT the line is undecided, not cleared — the same strict `>` settledRead uses", () => {
    const atLine = cand("bos@tor", {
      rows: [{ lkey: "Rafael Devers|batter_hits|1.5", prob: 55 }],
      tallies: { "Rafael Devers|batter_hits|1.5": 1.5 },
      legP: { "Rafael Devers|batter_hits|1.5": 0.55 },
      pricedAt: iso(2 * MIN),
    });
    expect(of(atLine).clearedCount).toBe(0);
    expect(of(atLine).why).toBeNull();
  });

  it("a tally the app has not observed is undecided, never a zero", () => {
    const noTally = cand("sd@lad", {
      rows: [{ lkey: "Mookie Betts|batter_total_bases|1.5", prob: 52 }],
      tallies: { "Mookie Betts|batter_total_bases|1.5": null },
      legP: { "Mookie Betts|batter_total_bases|1.5": 0.52 },
      pricedAt: iso(2 * MIN),
    });
    expect(of(noTally).clearedCount).toBe(0);
    expect(of(noTally).why).toBeNull();
  });
});

describe("drifted — the free sim says the true probability moved", () => {
  const drifted = (gkey: string, legP: number, prob: number, pricedAgo = 2 * MIN) =>
    cand(gkey, {
      rows: [{ lkey: "Zack Wheeler|pitcher_strikeouts|5.5", prob }],
      tallies: { "Zack Wheeler|pitcher_strikeouts|5.5": 2 },
      legP: { "Zack Wheeler|pitcher_strikeouts|5.5": legP },
      pricedAt: iso(pricedAgo),
    });

  it("sub-driftMin drift is NOT bought", () => {
    const d = of(drifted("phi@atl", 0.26, 40)); // |0.26 - 0.40| = 0.14
    expect(d.drift).toBeCloseTo(0.14, 10);
    expect(d.why).toBeNull();
  });

  it("drift at or past driftMin IS bought", () => {
    const d = of(drifted("phi@atl", 0.25, 40)); // |0.25 - 0.40| = 0.15
    expect(d.drift).toBeGreaterThanOrEqual(CFG.driftMin);
    expect(d.why).toBe("drifted");
  });

  it("drift is the LARGEST move across the game's rows, not the first", () => {
    const c = cand("sea@hou", {
      rows: [
        { lkey: "Julio Rodriguez|batter_hits|0.5", prob: 62 },
        { lkey: "Cal Raleigh|batter_home_runs|0.5", prob: 18 },
      ],
      tallies: {},
      legP: { "Julio Rodriguez|batter_hits|0.5": 0.6, "Cal Raleigh|batter_home_runs|0.5": 0.51 },
      pricedAt: iso(2 * MIN),
    });
    expect(of(c).drift).toBeCloseTo(0.33, 10); // |0.51 - 0.18|, not |0.60 - 0.62|
    expect(of(c).why).toBe("drifted");
  });

  it("a row with no pregame probability contributes no drift", () => {
    const c = cand("chc@mil", {
      rows: [{ lkey: "Ian Happ|batter_hits|0.5", prob: null }],
      tallies: {},
      legP: { "Ian Happ|batter_hits|0.5": 0.9 },
      pricedAt: iso(2 * MIN),
    });
    expect(of(c).drift).toBe(0);
    expect(of(c).why).toBeNull();
  });
});

describe("eligibility — the four gates, all free", () => {
  it("a pregame game is NEVER selected (that is /api/generate's job, and double-billing it is the bug)", () => {
    const pre = cand("mia@was", {
      rows: [{ lkey: JUDGE, prob: 78.2 }],
      tallies: { [JUDGE]: 3 },
      game: { live: false, final: false },
    });
    expect(of(pre).why).toBeNull();
    expect(selectLiveEvents([pre], NOW, CFG).events).toHaveLength(0);
  });

  it("a FINAL game is never selected, even with a cleared row", () => {
    const done = cand("nym@atl", {
      rows: [{ lkey: JUDGE, prob: 78.2 }],
      tallies: { [JUDGE]: 3 },
      game: { live: true, final: true },
    });
    expect(of(done).why).toBeNull();
  });

  it("an unmatched game (no Odds event id) is never selected — a wrong id prints another game's prices", () => {
    const c = joshsGame();
    const unmatched: MlbLiveCandidate = { ...c, game: { ...c.game, oddsEventId: null } };
    expect(of(unmatched).why).toBeNull();
  });

  it("a live game with ZERO stored MONOTONE rows is never selected — nothing to re-anchor", () => {
    const mlOnly = cand("col@ari", {
      rows: [{ lkey: "ml_home", prob: 55 }, { lkey: "rl_away", prob: 48 }],
      tallies: { ml_home: 9 },
      legP: { ml_home: 0.9 },
    });
    expect(of(mlOnly).why).toBeNull();

    // a three-segment lkey on a market that is NOT monotone is equally ignored
    const notMonotone = cand("tex@laa", {
      rows: [{ lkey: "Corey Seager|batter_walks|0.5", prob: 30 }],
      tallies: { "Corey Seager|batter_walks|0.5": 2 },
      legP: { "Corey Seager|batter_walks|0.5": 0.95 },
    });
    expect(MONOTONE_MARKETS.has("batter_walks")).toBe(false);
    expect(of(notMonotone).why).toBeNull();

    // ...and with no stored rows at all there is simply nothing to buy
    expect(of(cand("min@det")).why).toBeNull();
  });

  it("THE EMPTY-EVENT RULE holds a game for emptyHoldSec even when a row has drifted", () => {
    const rows = [{ lkey: "Zack Wheeler|pitcher_strikeouts|5.5", prob: 40 }];
    const legP = { "Zack Wheeler|pitcher_strikeouts|5.5": 0.9 }; // drift 0.50, far past driftMin
    const held = cand("sf@sd", { rows, legP, emptyAt: iso(30 * MIN) }); // 30 min into the 2 h hold
    expect(of(held).drift).toBeCloseTo(0.5, 10);
    expect(of(held).why).toBeNull();

    // the same game once the hold has run out
    const released = cand("sf@sd", { rows, legP, emptyAt: iso(CFG.emptyHoldSec * 1000 + MIN) });
    expect(of(released).why).toBe("drifted");
  });

  it("the empty hold outranks even a cleared row — an empty event has no price to give us", () => {
    const c = cand("phi@nyy", {
      rows: [{ lkey: JUDGE, prob: 78.2 }],
      tallies: { [JUDGE]: 3 },
      legP: { [JUDGE]: 0.78 },
      emptyAt: iso(30 * MIN),
    });
    expect(of(c).clearedCount).toBe(1); // the count is still reported honestly
    expect(of(c).why).toBeNull(); // ...but nothing is bought
  });
});

describe("the per-game window — carried, not fetched", () => {
  const rows = [{ lkey: "Shohei Ohtani|batter_total_bases|1.5", prob: 55 }];
  const legP = { "Shohei Ohtani|batter_total_bases|1.5": 0.54 };

  it("inside its OWN liveRevalidateSec with nothing diverged, a game is CARRIED (why null)", () => {
    const fresh = cand("sd@lad", { rows, legP, pricedAt: iso(10 * MIN) });
    expect(of(fresh).why).toBeNull();
  });

  it("past its own window it EXPIRES", () => {
    const old = cand("sd@lad", { rows, legP, pricedAt: iso(CFG.liveRevalidateSec * 1000 + MIN) });
    expect(of(old).why).toBe("expired");
  });

  it("never priced today is UNPRICED, not expired", () => {
    expect(of(cand("sd@lad", { rows, legP })).why).toBe("unpriced");
  });

  it("one game turning due does not drag the others in — each reads its OWN pricedAt", () => {
    const due = joshsGame(); // cleared, past its own window
    const other = cand("sd@lad", { rows, legP, pricedAt: iso(10 * MIN) });
    expect(whys([due, other])).toEqual(["phi@nyy:cleared"]);
  });
});

describe("ordering and the cap", () => {
  /* past its own window (fix pass, 2026-09-11): the floor now holds a cleared game inside it */
  const clearedC = () =>
    cand("phi@nyy", {
      rows: [{ lkey: JUDGE, prob: 78.2 }],
      tallies: { [JUDGE]: 3 },
      legP: { [JUDGE]: 0.78 },
      pricedAt: iso(CFG.liveRevalidateSec * 1000 + MIN),
    });
  const driftedC = (gkey: string, legP: number) =>
    cand(gkey, { rows: [{ lkey: "Zack Wheeler|pitcher_strikeouts|5.5", prob: 40 }], legP: { "Zack Wheeler|pitcher_strikeouts|5.5": legP }, pricedAt: iso(2 * MIN) });
  const unpricedC = (gkey: string) => cand(gkey, { rows: [{ lkey: "Bo Bichette|batter_hits|0.5", prob: 55 }], legP: { "Bo Bichette|batter_hits|0.5": 0.55 } });
  const expiredC = (gkey: string) =>
    cand(gkey, {
      rows: [{ lkey: "Bo Bichette|batter_hits|0.5", prob: 55 }],
      legP: { "Bo Bichette|batter_hits|0.5": 0.55 },
      pricedAt: iso(CFG.liveRevalidateSec * 1000 + MIN),
    });

  it("cleared -> drifted -> unpriced -> expired, whatever order they arrive in", () => {
    const out = whys([expiredC("bos@tor"), unpricedC("chc@mil"), driftedC("sea@hou", 0.9), clearedC()]);
    expect(out).toEqual(["phi@nyy:cleared", "sea@hou:drifted", "chc@mil:unpriced", "bos@tor:expired"]);
  });

  it("within a why, the bigger drift is bought first", () => {
    const sel = selectLiveEvents([driftedC("sml@one", 0.58), driftedC("big@one", 0.95)], NOW, CFG);
    expect(sel.events.map((e) => e.game.gkey)).toEqual(["big@one", "sml@one"]);
    expect(sel.events[0].drift).toBeGreaterThan(sel.events[1].drift);
  });

  it("liveMaxEvents clips the pool and says so", () => {
    const many = Array.from({ length: CFG.liveMaxEvents + 2 }, (_, i) => unpricedC(`a${i}@b${i}`));
    const sel = selectLiveEvents(many, NOW, CFG);
    expect(sel.events).toHaveLength(CFG.liveMaxEvents);
    expect(sel.capped).toBe(true);

    const exactly = selectLiveEvents(many.slice(0, CFG.liveMaxEvents), NOW, CFG);
    expect(exactly.events).toHaveLength(CFG.liveMaxEvents);
    expect(exactly.capped).toBe(false);
  });

  it("liveCount counts every game in play, eligible or not — the header's honest denominator", () => {
    const pre = cand("mia@was", { game: { live: false } });
    const done = cand("nym@atl", { game: { final: true } });
    const noRows = cand("min@det"); // live, but nothing stored to re-anchor
    const sel = selectLiveEvents([clearedC(), pre, done, noRows], NOW, CFG);
    expect(sel.liveCount).toBe(2); // the cleared game and the row-less one; the final and pregame are not live
    expect(sel.events).toHaveLength(1);
  });

  it("an empty slate selects nothing and claims nothing", () => {
    expect(selectLiveEvents([], NOW, CFG)).toEqual({ events: [], capped: false, liveCount: 0 });
  });
});

describe("PLANT — the cleared branch is what buys Josh's row", () => {
  /** THE PLANT: `divergenceOf` with the `cleared` branch deleted, and nothing else changed. */
  function withoutClearedBranch(c: MlbLiveCandidate, now: number): string | null {
    const mono = c.rows.filter((r) => {
      const parts = r.lkey.split("|");
      return parts.length === 3 && MONOTONE_MARKETS.has(parts[1]);
    });
    if (!c.game.live || c.game.final || !c.game.oddsEventId || mono.length === 0) return null;
    let drift = 0;
    for (const r of mono) {
      const p = c.legP[r.lkey];
      if (p != null && r.prob != null) drift = Math.max(drift, Math.abs(p - r.prob / 100));
    }
    if (drift >= CFG.driftMin) return "drifted";
    const at = c.overlay?.pricedAt?.[c.game.gkey];
    /* the `if (clearedCount > 0) return "cleared"` line is GONE here — that is the whole plant */
    if (!at) return "unpriced";
    return now - Date.parse(at) > CFG.liveRevalidateSec * 1000 ? "expired" : null;
  }

  it("with the branch removed, Josh's exact row loses its PROOF rung and is bought last instead of first", () => {
    /* AMENDED (fix pass, 2026-09-11). Before the freshness floor, Josh's row was selected ONLY by
       the cleared branch, so deleting the branch made it unselectable and the plant could assert
       null. Now the row is past its window, so something would buy it either way — and the plant
       asserts what is actually lost: the rung, and with it the rank. On a slate already at
       liveMaxEvents, or on a day the budget is tight, "bought first" and "bought last" is the
       difference between Josh seeing a live 3.5 and seeing the pregame 0.5 he complained about. */
    expect(of(joshsGame()).why).toBe("cleared");
    expect(withoutClearedBranch(joshsGame(), NOW)).toBe("expired");
    expect(WHY_RANK.expired).toBeGreaterThan(WHY_RANK.cleared);

    // and the consequence, rendered: with proof it heads the pool; demoted, it is bought last
    const other = cand("sd@lad", {
      rows: [{ lkey: "Bo Bichette|batter_hits|0.5", prob: 55 }],
      legP: { "Bo Bichette|batter_hits|0.5": 0.55 },
    });
    expect(whys([other, joshsGame()])).toEqual(["phi@nyy:cleared", "sd@lad:unpriced"]);
  });

  it("and the shipped module has exactly one cleared branch to remove", () => {
    const src = stripComments(fs.readFileSync(path.join(process.cwd(), "src", "lib", "mlb", "live-divergence.ts"), "utf8"));
    expect(src.match(/why:\s*"cleared"/g)).toHaveLength(1);
  });
});
