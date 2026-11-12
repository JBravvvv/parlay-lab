import { describe, expect, it } from "vitest";
import { excludedBy, excludes, validMarketType, AZ_DEFAULT_EXCLUSIONS } from "@/lib/az/exclusions";
import { isAzBook } from "@/lib/az/books";
import { decide, familyStateOf, gateOf, kellyUnits, pickIdOf, reentryAllowed, stillWritable, type DecideInput } from "@/lib/anytime/engine";
import { ANYTIME_RULES, cadenceFor, dueForLook } from "@/lib/anytime/rules";
import { familyKeyOf, isTrigger, type FamilyState } from "@/lib/anytime/types";
import { cand, KICK, T0 } from "./helpers/anytime";

/* THE ANY-TIME ENGINE'S DECISION RULES (pure). No clock of its own, no store, no fetch. */

const input = (over: Partial<DecideInput> = {}): DecideInput => ({
  candidates: [cand()],
  now: T0,
  runId: "r1",
  trigger: "manual-api",
  families: new Map(),
  excluded: excludedBy(),
  kellyBankroll: 100,
  kellyOpenByEvent: new Map(),
  ...over,
});

describe("there is no window, count or ceiling", () => {
  it("the rules object holds no slot list, daily count, daily ceiling or freeze date", () => {
    const keys = Object.keys(ANYTIME_RULES).join(" ").toLowerCase();
    for (const banned of ["slot", "window", "daily", "perday", "maxpicks", "freeze", "since", "until", "cap"]) {
      /* closeWindowMs is the closing-line window, not a pick window */
      expect(keys.replace("closewindowms", "")).not.toContain(banned);
    }
  });

  it("takes a pick at any minute of any day when the guards pass", () => {
    /* 03:17 on a Tuesday, a Sunday night, the minute before the start margin */
    for (const now of [Date.parse("2026-11-10T10:17:00Z"), Date.parse("2026-11-15T06:59:00Z"), Date.parse(KICK) - 61_000]) {
      const d = decide(input({ now, candidates: [cand({ fetchedAt: now - 500 })] }));
      expect(d.picks).toHaveLength(1);
    }
  });

  it("takes every qualifying selection in one run: 300 events, 300 picks", () => {
    const many = Array.from({ length: 300 }, (_, i) => cand({ eventId: `ev${i}` }));
    expect(decide(input({ candidates: many })).picks).toHaveLength(300);
  });
});

describe("the start-time guard (server clock against commence_time)", () => {
  it("rejects an event that has started, or starts inside the margin", () => {
    const kick = Date.parse(KICK);
    for (const now of [kick, kick + 1, kick + 3_600_000, kick - ANYTIME_RULES.startMarginMs, kick - 1]) {
      const d = decide(input({ now, candidates: [cand({ fetchedAt: now - 500 })] }));
      expect(d.picks).toHaveLength(0);
      expect(d.rejects[0].reason).toBe("started");
    }
  });

  it("accepts one millisecond outside the margin", () => {
    const now = Date.parse(KICK) - ANYTIME_RULES.startMarginMs - 1;
    expect(decide(input({ now, candidates: [cand({ fetchedAt: now - 500 })] })).picks).toHaveLength(1);
  });

  it("rejects a start time that is not a time", () => {
    for (const commence of ["", "soon", "2026-13-45T00:00:00Z"]) expect(gateOf(cand({ commence }), T0)?.reason).toBe("bad_commence");
  });

  it("a live candidate is refused: no live model exists", () => {
    expect(gateOf(cand({ live: true }), T0)?.reason).toBe("live_unsupported");
    expect(gateOf(cand({ live: true }), Date.parse(KICK) + 60_000)?.reason).toBe("live_unsupported");
  });

  it("is checked AGAIN at write time: a pick decided before the start is not written after it", () => {
    const p = decide(input()).picks[0];
    expect(stillWritable(p, T0)).toEqual({ ok: true });
    expect(stillWritable(p, Date.parse(KICK) - 30_000)).toEqual({ ok: false, reason: "started" });
    expect(stillWritable({ ...p, commence: "x" }, T0)).toEqual({ ok: false, reason: "bad_commence" });
  });
});

describe("the freshness guard", () => {
  it("rejects a snapshot older than the limit, accepts one at the limit", () => {
    expect(gateOf(cand({ fetchedAt: T0 - ANYTIME_RULES.freshnessMs - 1 }), T0)?.reason).toBe("stale_snapshot");
    expect(gateOf(cand({ fetchedAt: T0 - ANYTIME_RULES.freshnessMs }), T0)).toBeNull();
  });

  it("rejects a snapshot stamped in the future, and one with no stamp", () => {
    expect(gateOf(cand({ fetchedAt: T0 + 5_001 }), T0)?.reason).toBe("stale_snapshot");
    expect(gateOf(cand({ fetchedAt: Number.NaN }), T0)?.reason).toBe("stale_snapshot");
  });

  it("is checked again at write time", () => {
    const p = decide(input()).picks[0];
    expect(stillWritable(p, T0 + ANYTIME_RULES.freshnessMs)).toEqual({ ok: false, reason: "stale_snapshot" });
  });
});

describe("a pick needs one of the two books, at this exact line", () => {
  it("no quote at either book: no pick", () => {
    const d = decide(input({ candidates: [cand({ quotes: {} })] }));
    expect(d.picks).toHaveLength(0);
    expect(d.rejects[0].reason).toBe("no_book");
  });

  it("only one book quoting: the pick is at that book and the other price is null", () => {
    const d = decide(input({ candidates: [cand({ quotes: { draftkings: { price: -105, opp: -115 } } })] }));
    expect(d.picks[0]).toMatchObject({ book: "draftkings", otherBook: "fanduel", otherPrice: null, fairN: 1 });
  });

  it("a one-sided quote has no no-vig number to measure against: no pick", () => {
    const d = decide(input({ candidates: [cand({ quotes: { draftkings: { price: -105, opp: null } } })] }));
    expect(d.rejects[0].reason).toBe("one_sided_no_fair");
  });

  it("names the better of the two prices, DraftKings on a tie", () => {
    expect(decide(input()).picks[0]).toMatchObject({ book: "fanduel", price: -105, otherBook: "draftkings", otherPrice: -110 });
    const tie = decide(input({ candidates: [cand({ quotes: { draftkings: { price: -105, opp: -115 }, fanduel: { price: -105, opp: -115 } } })] }));
    expect(tie.picks[0].book).toBe("draftkings");
  });

  it("every pick ever decided is at DraftKings or FanDuel", () => {
    const d = decide(input({ candidates: Array.from({ length: 40 }, (_, i) => cand({ eventId: `e${i}`, quotes: i % 2 ? { draftkings: { price: -104, opp: -118 } } : { fanduel: { price: +102, opp: -124 } } })) }));
    expect(d.picks).toHaveLength(40);
    for (const p of d.picks) {
      expect(isAzBook(p.book)).toBe(true);
      expect(isAzBook(p.otherBook)).toBe(true);
    }
  });
});

describe("what a pick stores", () => {
  it("carries every field the brief lists", () => {
    const p = decide(input({ trigger: "cron", runId: "r-abc" })).picks[0];
    expect(p).toMatchObject({
      v: 1, seq: 1, reentryOf: null, runId: "r-abc", trigger: "cron", ts: new Date(T0).toISOString(),
      sport: "nfl", eventId: "ev1", event: "Away @ Home", commence: KICK, market: "spread", marketType: "nfl:spread", side: "home", selection: "Home -2.5", line: -2.5,
      book: "fanduel", price: -105, otherBook: "draftkings", otherPrice: -110,
      modelVersion: "t-1", modelKind: "independent", snapshotId: "snap-1", fetchedAt: new Date(T0 - 1_000).toISOString(), stakeFlat: 1, engine: ANYTIME_RULES.version,
    });
    /* model probability, no-vig market probability, edge, both EVs */
    expect(p.modelP).toBeCloseTo(0.55, 4);
    expect(p.fairP).toBeGreaterThan(0.49);
    expect(p.fairP).toBeLessThan(0.52);
    expect(p.edge).toBeCloseTo(p.modelP - p.fairP, 4);
    expect(p.ev).toBeCloseTo(0.55 * (1 + 100 / 105) - 1, 4);
    expect(p.dec).toBeCloseTo(1 + 100 / 105, 4);
    expect(p.stakeKelly).toBeGreaterThan(0);
    expect(p.id).toBe(pickIdOf(familyKeyOf(cand()), 1));
  });

  it("labels the basis: a price the two books' own number likes is 'price', a model-only bet is 'model'", () => {
    /* the books disagree: DraftKings +105 / -125, FanDuel -125 / +105. Their mean no-vig is 50%,
       so +105 pays 2.5% more than the two books' own fair number: line shopping, no model needed */
    const shop = decide(input({ candidates: [cand({ model: { win: 0.5, push: 0 }, modelKind: "market-only", quotes: { draftkings: { price: +105, opp: -125 }, fanduel: { price: -125, opp: +105 } } })] }));
    expect(shop.picks).toHaveLength(1);
    expect(shop.picks[0]).toMatchObject({ book: "draftkings", price: 105, basis: "price", fairN: 2 });
    expect(shop.picks[0].fairP).toBeCloseTo(0.5, 4);
    expect(shop.picks[0].priceEv).toBeCloseTo(0.025, 4);
    const modelOnly = decide(input()).picks[0];
    expect(modelOnly.priceEv).toBeLessThan(0);
    expect(modelOnly.basis).toBe("model");
  });

  it("only a known trigger name is recordable", () => {
    for (const t of ["manual-ui", "manual-api", "cli", "cron", "event:line-move"]) expect(isTrigger(t)).toBe(true);
    for (const t of ["", "admin", "event:", "event:Line Move", "event:" + "x".repeat(41), 7, null]) expect(isTrigger(t)).toBe(false);
  });
});

describe("expected value floor and the best line in a family", () => {
  it("below the floor: no pick", () => {
    const d = decide(input({ candidates: [cand({ model: { win: 0.5, push: 0 } })] }));
    expect(d.picks).toHaveLength(0);
    expect(d.rejects[0].reason).toBe("below_ev");
  });

  it("a model probability that is not a probability: no pick", () => {
    for (const model of [{ win: 0, push: 0 }, { win: 1.2, push: 0 }, { win: Number.NaN, push: 0 }, { win: 0.7, push: 0.4 }]) {
      expect(decide(input({ candidates: [cand({ model })] })).rejects[0].reason).toBe("bad_model");
    }
  });

  it("two lines of the same side of the same market: one pick, the better bet", () => {
    const a = cand({ line: -2.5, selection: "Home -2.5", model: { win: 0.55, push: 0 }, quotes: { draftkings: { price: -110, opp: -110 } } });
    const b = cand({ line: -3, selection: "Home -3", model: { win: 0.5, push: 0.06 }, quotes: { fanduel: { price: +112, opp: -134 } } });
    const d = decide(input({ candidates: [a, b] }));
    expect(d.picks).toHaveLength(1);
    expect(d.picks[0].selection).toBe("Home -3");
    expect(d.rejects.map((r) => r.reason)).toEqual(["not_best_in_family"]);
  });

  it("the two sides of a market are different families: both can be picked", () => {
    const home = cand();
    const away = cand({ side: "away", selection: "Away +2.5", line: 2.5 });
    expect(decide(input({ candidates: [home, away] })).picks).toHaveLength(2);
  });
});

describe("no silent duplicates: the re-entry rule", () => {
  const first = decide(input()).picks[0];
  const prior: FamilyState = familyStateOf(first);
  const fam = new Map([[first.family, prior]]);

  it("the same quote again is a duplicate, and says which pick it duplicates", () => {
    const d = decide(input({ families: fam, now: T0 + 60_000, candidates: [cand({ fetchedAt: T0 + 59_000 })] }));
    expect(d.picks).toHaveLength(0);
    expect(d.rejects[0]).toMatchObject({ reason: "duplicate", detail: first.id });
  });

  it("a price that improved by less than the threshold is still a duplicate", () => {
    /* -105 -> -103: +1.0% on the payout, under the 3% threshold; EV +0.5 points, under 2 */
    const d = decide(input({ families: fam, candidates: [cand({ quotes: { draftkings: { price: -110, opp: -110 }, fanduel: { price: -103, opp: -117 } } })] }));
    expect(d.rejects[0].reason).toBe("duplicate");
  });

  it("a price improved past the threshold is a SEPARATE entry that names the pick it follows", () => {
    /* -105 (1.952) -> +102 (2.02): +3.5% */
    const d = decide(input({ families: fam, candidates: [cand({ quotes: { draftkings: { price: -110, opp: -110 }, fanduel: { price: +102, opp: -122 } } })] }));
    expect(d.picks).toHaveLength(1);
    expect(d.picks[0]).toMatchObject({ seq: 2, reentryOf: first.id, id: pickIdOf(first.family, 2) });
    expect(d.picks[0].id).not.toBe(first.id);
  });

  it("an EV improved past the threshold is a re-entry even at a new line", () => {
    const d = decide(input({ families: fam, candidates: [cand({ line: -1.5, selection: "Home -1.5", model: { win: 0.6, push: 0 }, quotes: { draftkings: { price: -110, opp: -110 } } })] }));
    expect(d.picks[0]).toMatchObject({ seq: 2, reentryOf: first.id, line: -1.5 });
  });

  it("the thresholds are exact", () => {
    const r = ANYTIME_RULES.reentry;
    expect(reentryAllowed(prior, { dec: prior.dec * (1 + r.priceImprove), ev: prior.ev, line: prior.line })).toBe(true);
    expect(reentryAllowed(prior, { dec: prior.dec * (1 + r.priceImprove) - 0.0001, ev: prior.ev, line: prior.line })).toBe(false);
    expect(reentryAllowed(prior, { dec: prior.dec, ev: prior.ev + r.evImprove, line: prior.line })).toBe(true);
    expect(reentryAllowed(prior, { dec: prior.dec, ev: prior.ev + r.evImprove - 0.0001, line: prior.line })).toBe(false);
    /* a better payout at a DIFFERENT line is not a price improvement (a different bet) */
    expect(reentryAllowed(prior, { dec: prior.dec * 1.2, ev: prior.ev, line: -3.5 })).toBe(false);
  });

  it("the same inputs always give the same picks (idempotent decision)", () => {
    expect(decide(input())).toEqual(decide(input()));
  });
});

describe("Arizona exclusion list", () => {
  it("college props are excluded by default; college sides are not", () => {
    const ex = excludedBy();
    for (const t of ["cfb:player_prop", "cfb:player_prop:pass_yds", "cfb:prop", "ncaab:player_prop:points"]) expect(ex(t)).toBe(true);
    for (const t of ["cfb:spread", "cfb:ml", "cfb:total", "nfl:player_prop:pass_yds", "nfl:spread", "cfb:player_props"]) expect(ex(t)).toBe(false);
    expect(AZ_DEFAULT_EXCLUSIONS.every((e) => e.source && /^\d{4}-\d{2}-\d{2}$/.test(e.checked))).toBe(true);
  });

  it("an entry excludes its own type and everything under it, nothing beside it", () => {
    expect(excludes("nfl:player_prop", "nfl:player_prop:rec_yds")).toBe(true);
    expect(excludes("nfl:player_prop:rec_yds", "nfl:player_prop")).toBe(false);
    expect(excludes("nfl:player_prop", "nfl:player_prop_alt")).toBe(false);
    expect(excludes("", "nfl:spread")).toBe(false);
    expect(excludes(" NFL:Spread ", "nfl:spread")).toBe(true);
  });

  it("a market type Josh marked from the UI is excluded from then on", () => {
    const ex = excludedBy([{ marketType: "nfl:player_prop:pass_tds" }]);
    expect(ex("nfl:player_prop:pass_tds")).toBe(true);
    expect(ex("nfl:player_prop:pass_yds")).toBe(false);
  });

  it("an excluded market is never picked, whatever the model says", () => {
    const d = decide(input({ candidates: [cand({ sport: "cfb", marketType: "cfb:player_prop:pass_yds", model: { win: 0.9, push: 0 } })] }));
    expect(d.picks).toHaveLength(0);
    expect(d.rejects[0]).toMatchObject({ reason: "az_excluded", detail: "cfb:player_prop:pass_yds" });
  });

  it("only a well-formed market type can be stored", () => {
    for (const ok of ["nfl:spread", "cfb:player_prop:pass_yds", "mlb:player_prop:batter_hits"]) expect(validMarketType(ok)).toBe(true);
    for (const bad of ["nfl", "NFL:spread", "nfl:", ":spread", "nfl:spread:a:b:c", "nfl spread", 7, null, "nfl:<script>"]) expect(validMarketType(bad)).toBe(false);
  });
});

describe("the Kelly bankroll sizes stakes; it never stops a pick", () => {
  const K = ANYTIME_RULES.kelly;

  it("quarter Kelly, capped at the per-pick share", () => {
    expect(kellyUnits(0.04, 100, 0)).toBeCloseTo(1, 6); // 0.25 x 4% x 100
    expect(kellyUnits(0.5, 100, 0)).toBeCloseTo(K.maxPct * 100, 6);
    expect(kellyUnits(0, 100, 0)).toBe(0);
    expect(kellyUnits(0.04, 0, 0)).toBe(0);
  });

  it("an event's picks together never pass the event share; the pick is trimmed, then zero", () => {
    expect(kellyUnits(0.5, 100, 4)).toBeCloseTo(1, 6); // 5 units of room, 4 used
    expect(kellyUnits(0.5, 100, 5)).toBe(0);
    expect(kellyUnits(0.5, 100, 9)).toBe(0);
  });

  it("a pick trimmed to zero Kelly is still recorded at its flat unit", () => {
    const d = decide(input({ kellyOpenByEvent: new Map([["nfl|ev1", 50]]) }));
    expect(d.picks).toHaveLength(1);
    expect(d.picks[0]).toMatchObject({ stakeKelly: 0, stakeFlat: 1 });
  });

  it("the best bet on an event gets the room first", () => {
    const strong = cand({ market: "ml", side: "home", line: null, selection: "Home ML", model: { win: 0.75, push: 0 } });
    const weak = cand({ market: "total", side: "over", line: 44.5, selection: "Over 44.5", model: { win: 0.54, push: 0 } });
    const d = decide(input({ candidates: [weak, strong], kellyOpenByEvent: new Map([["nfl|ev1", 3.5]]) }));
    expect(d.picks.map((p) => p.selection)).toEqual(["Home ML", "Over 44.5"]);
    expect(d.picks[0].stakeKelly).toBeCloseTo(1.5, 6);
    expect(d.picks[1].stakeKelly).toBe(0);
  });
});

describe("polling by time to start", () => {
  it("looks more often as the start approaches", () => {
    const m = 60_000;
    expect(cadenceFor(30 * m)).toBe(5 * m);
    expect(cadenceFor(2 * 60 * m)).toBe(15 * m);
    expect(cadenceFor(10 * 60 * m)).toBe(60 * m);
    expect(cadenceFor(40 * 60 * m)).toBe(180 * m);
    expect(cadenceFor(6 * 24 * 60 * m)).toBe(720 * m);
    const steps = [30, 120, 600, 2400, 9000].map((x) => cadenceFor(x * m));
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
  });

  it("an event is due on first sight, then only after its interval; never once it has started", () => {
    const kick = T0 + 2 * 3600_000;
    expect(dueForLook(T0, kick, null)).toBe(true);
    expect(dueForLook(T0, kick, T0 - 14 * 60_000)).toBe(false);
    expect(dueForLook(T0, kick, T0 - 15 * 60_000)).toBe(true);
    expect(dueForLook(kick, kick, null)).toBe(false);
  });
});
