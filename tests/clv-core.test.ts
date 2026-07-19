import { describe, expect, it } from "vitest";
import {
  applySights,
  impliedProb,
  marketsFor,
  matchEvent,
  pendingLegs,
  sightGameLeg,
  sightProp,
  type OddsEvent,
  type PendingLeg,
} from "../src/lib/server/clv-core";
import { cronKeyAuthed, syncAuthed } from "../src/lib/server/store";
import type { SyncEntry } from "../src/lib/ledger-merge";

/* Upgrade 03 spec test 1 — the CLV sighting kernel: pregame-only, windowed,
   deduped, immutable outside `clv`, hand-checked de-vig math, gated route. */

const NOW = Date.parse("2026-07-19T18:00:00Z");
const MIN = 60_000;

const entry = (): SyncEntry =>
  ({
    date: "2026-07-19",
    locked: true,
    core: [
      {
        id: "t1",
        legs: [
          { label: "Jake Mangum (PIT)", prop: "Hits O 0.5", gkey: "g1", lkey: "jakemangum|batter_hits|0.5", cz: -260 },
          { label: "Cleveland Guardians", prop: "ML vs PIT", gkey: "g1", lkey: "ml_home", cz: -145 },
          { label: "Started Guy (LAA)", prop: "TB O 1.5", gkey: "g2", lkey: "startedguy|batter_total_bases|1.5", cz: -110 },
        ],
      },
      {
        id: "t2", // duplicate of the Mangum leg on a second ticket — must dedupe
        legs: [{ label: "Jake Mangum (PIT)", prop: "Hits O 0.5", gkey: "g1", lkey: "jakemangum|batter_hits|0.5", cz: -260 }],
      },
    ],
    funT: [
      {
        id: "f1",
        legs: [{ label: "Later Guy (NYY)", prop: "HR O 0.5", gkey: "g3", lkey: "laterguy|batter_home_runs|0.5", cz: 450 }],
      },
    ],
    games: {
      g1: { pk: 1, start: new Date(NOW + 20 * MIN).toISOString() }, // inside the 45-min window
      g2: { pk: 2, start: new Date(NOW - 60 * MIN).toISOString() }, // already started — untouchable
      g3: { pk: 3, start: new Date(NOW + 3 * 60 * MIN).toISOString() }, // outside the window (for now)
    },
    grading: { done: true, tickets: { t1: { result: "lost", payout: 0 } }, legs: {} },
    clv: {},
  }) as never;

describe("pendingLegs — pregame-only, windowed, deduped", () => {
  it("selects only unstarted legs inside the window, one entry per leg id", () => {
    const m = pendingLegs(entry(), NOW, 45 * MIN);
    expect([...m.keys()]).toEqual(["g1"]);
    const lids = m.get("g1")!.legs.map((l) => l.lid).sort();
    expect(lids).toEqual(["Cleveland Guardians|ML vs PIT", "Jake Mangum (PIT)|Hits O 0.5"]);
  });

  it("the outside-window game enters once its first pitch is near", () => {
    const m = pendingLegs(entry(), NOW + 140 * MIN, 45 * MIN);
    expect([...m.keys()]).toEqual(["g3"]);
  });

  it("markets pulled per game are exactly the legs' markets plus the Caesars ladders", () => {
    const m = pendingLegs(entry(), NOW, 45 * MIN);
    expect(marketsFor(m.get("g1")!.legs)).toEqual(["batter_hits", "batter_hits_alternate"]);
  });
});

const bk = (key: string, mkKey: string, outcomes: { name?: string; description?: string; price: number; point?: number }[]) => ({
  key,
  markets: [{ key: mkKey, outcomes }],
});

describe("sightProp — Caesars close + hand-computed consensus fair", () => {
  const leg: PendingLeg = { lid: "x", lkey: "jakemangum|batter_hits|0.5", prop: "Hits O 0.5", gkey: "g1", start: 0 };
  const ev: OddsEvent = {
    id: "e1",
    away_team: "Pittsburgh Pirates",
    home_team: "Cleveland Guardians",
    commence_time: "2026-07-19T18:20:00Z",
    bookmakers: [
      bk("book1", "batter_hits", [
        { description: "Jake Mangum", name: "Over", price: -150, point: 0.5 },
        { description: "Jake Mangum", name: "Under", price: 120, point: 0.5 },
      ]),
      bk("book2", "batter_hits", [
        { description: "Jake Mangum", name: "Over", price: -140, point: 0.5 },
        { description: "Jake Mangum", name: "Under", price: 110, point: 0.5 },
      ]),
      bk("williamhill_us", "batter_hits", [
        { description: "Jake Mangum", name: "Over", price: -160, point: 0.5 },
        { description: "Jake Mangum", name: "Under", price: 130, point: 0.5 },
      ]),
    ],
  };

  // hand math: implied(-150)=150/250=.600, implied(+120)=100/220=.4545 → devig .600/1.0545=.56899
  //            implied(-140)=140/240=.5833, implied(+110)=100/210=.4762 → .5506
  //            implied(-160)=160/260=.6154, implied(+130)=100/230=.4348 → .5860
  // median of [.56899, .5506, .5860] = .56899
  const HAND_FAIR = 0.6 / (0.6 + 100 / 220);

  it("over leg: Caesars price + median de-vigged fair across books", () => {
    const s = sightProp(ev, leg, 123)!;
    expect(s.am).toBe(-160);
    expect(s.at).toBe(123);
    expect(s.consensusFair).toBeCloseTo(HAND_FAIR, 10);
  });

  it("under leg mirrors the fair; wrong player or line returns null", () => {
    const uLeg = { ...leg, prop: "Hits U 0.5" };
    expect(sightProp(ev, uLeg, 0)!.consensusFair).toBeCloseTo(1 - HAND_FAIR, 10);
    expect(sightProp(ev, { ...leg, lkey: "nobody|batter_hits|0.5" }, 0)).toBeNull();
    expect(sightProp(ev, { ...leg, lkey: "jakemangum|batter_hits|1.5" }, 0)).toBeNull();
  });

  it("Caesars alternate ladder fills the price when the standard market lacks CZ; fair needs 2+ books", () => {
    const ev2: OddsEvent = {
      ...ev,
      bookmakers: [
        ev.bookmakers![0],
        bk("williamhill_us", "batter_hits_alternate", [
          { description: "Jake Mangum", name: "Over", price: -155, point: 0.5 },
        ]),
      ],
    };
    const s = sightProp(ev2, leg, 0)!;
    expect(s.am).toBe(-155);
    expect(s.consensusFair).toBeNull(); // one real book is not a consensus
  });
});

describe("sightGameLeg — ML/RL from the slate payload", () => {
  const ev: OddsEvent = {
    id: "e1",
    away_team: "Pittsburgh Pirates",
    home_team: "Cleveland Guardians",
    commence_time: "2026-07-19T18:20:00Z",
    bookmakers: [
      bk("book1", "h2h", [
        { name: "Cleveland Guardians", price: -150 },
        { name: "Pittsburgh Pirates", price: 130 },
      ]),
      bk("williamhill_us", "h2h", [
        { name: "Cleveland Guardians", price: -145 },
        { name: "Pittsburgh Pirates", price: 125 },
      ]),
      bk("book1", "spreads", [
        { name: "Cleveland Guardians", price: 120, point: -1.5 },
        { name: "Pittsburgh Pirates", price: -140, point: 1.5 },
      ]),
      bk("williamhill_us", "spreads", [
        { name: "Cleveland Guardians", price: 118, point: -1.5 },
        { name: "Pittsburgh Pirates", price: -138, point: 1.5 },
      ]),
    ],
  };

  it("ml_home: Caesars side price, fair from both books", () => {
    const s = sightGameLeg(ev, { lid: "x", lkey: "ml_home", prop: "ML vs PIT", gkey: "g1", start: 0 }, 9)!;
    expect(s.am).toBe(-145);
    const f1 = impliedProb(-150) / (impliedProb(-150) + impliedProb(130));
    const f2 = impliedProb(-145) / (impliedProb(-145) + impliedProb(125));
    expect(s.consensusFair).toBeCloseTo((f1 + f2) / 2, 10);
  });

  it("rl leg only counts books quoting the exact point", () => {
    const s = sightGameLeg(ev, { lid: "x", lkey: "rl_away", prop: "RL +1.5 vs CLE", gkey: "g1", start: 0 }, 0)!;
    expect(s.am).toBe(-138);
    const wrongPt = sightGameLeg(ev, { lid: "x", lkey: "rl_away", prop: "RL +2.5 vs CLE", gkey: "g1", start: 0 }, 0);
    expect(wrongPt).toBeNull();
  });
});

describe("matchEvent — doubleheader-aware", () => {
  const evs = [
    { id: "a", away_team: "Pittsburgh Pirates", home_team: "Cleveland Guardians", commence_time: "2026-07-19T17:10:00Z" },
    { id: "b", away_team: "Pittsburgh Pirates", home_team: "Cleveland Guardians", commence_time: "2026-07-19T23:10:00Z" },
  ];
  it("picks the event whose first pitch is closest to the ledger's stored start", () => {
    const early = Date.parse("2026-07-19T17:10:00Z");
    const late = Date.parse("2026-07-19T23:10:00Z");
    expect(matchEvent(evs, "pittsburghpirates@clevelandguardiansgm1", early)!.id).toBe("a");
    expect(matchEvent(evs, "pittsburghpirates@clevelandguardiansgm2", late)!.id).toBe("b");
    expect(matchEvent(evs, "somebody@else", early)).toBeNull();
  });
});

describe("applySights — clv only, latest wins, grading untouchable", () => {
  it("never mutates the input and never touches anything but clv", () => {
    const e = entry();
    const before = JSON.stringify(e);
    const { entry: out, updated } = applySights(e, {
      "Jake Mangum (PIT)|Hits O 0.5": { am: -230, at: 1, consensusFair: 0.68 },
    });
    expect(JSON.stringify(e)).toBe(before); // input untouched
    expect(updated).toBe(1);
    expect((out.clv as Record<string, { am: number }>)["Jake Mangum (PIT)|Hits O 0.5"].am).toBe(-230);
    const strip = (x: SyncEntry) => JSON.stringify({ ...x, clv: undefined });
    expect(strip(out)).toBe(strip(e)); // everything except clv byte-identical
  });

  it("re-sighting overwrites (the last look before first pitch is the close)", () => {
    const first = applySights(entry(), { L: { am: -200, at: 1, consensusFair: null } }).entry;
    const second = applySights(first, { L: { am: -220, at: 2, consensusFair: 0.7 } });
    expect((second.entry.clv as Record<string, { am: number; at: number }>).L).toMatchObject({ am: -220, at: 2 });
    expect(second.updated).toBe(1);
    const noop = applySights(second.entry, { L: { am: -220, at: 2, consensusFair: 0.7 } });
    expect(noop.updated).toBe(0);
  });
});

describe("route gating (401 without key)", () => {
  const req = (key?: string) =>
    ({ nextUrl: { searchParams: { get: (k: string) => (k === "key" ? (key ?? null) : null) } } }) as never;
  it("cron key path: closed without env, timing-safe compare with it", () => {
    const saved = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    expect(cronKeyAuthed(req("anything"))).toBe(false);
    process.env.CRON_SECRET = "s3cret";
    expect(cronKeyAuthed(req("s3cret"))).toBe(true);
    expect(cronKeyAuthed(req("wrong"))).toBe(false);
    expect(cronKeyAuthed(req())).toBe(false);
    if (saved === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = saved;
  });
  it("sync phrase path unchanged", () => {
    const saved = process.env.LEDGER_SYNC_KEY;
    process.env.LEDGER_SYNC_KEY = "phrase";
    const hreq = (v: string | null) => ({ headers: { get: () => v } }) as never;
    expect(syncAuthed(hreq("phrase"))).toBe(true);
    expect(syncAuthed(hreq("nope"))).toBe(false);
    expect(syncAuthed(hreq(null))).toBe(false);
    if (saved === undefined) delete process.env.LEDGER_SYNC_KEY;
    else process.env.LEDGER_SYNC_KEY = saved;
  });
});
