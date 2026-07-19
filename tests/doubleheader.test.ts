import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FROZEN_NOW, TODAY, fixtureFetchJson } from "./helpers/fixture-env";
import { createEngine, type BoardData, type PickRow } from "@/engine";
import { boardToPredictions } from "../src/lib/pred-serialize";

/* Doubleheader regression (2026-07-18, Mangum/Mead): two same-matchup games in one
   day used to collapse into one away@home key — game 2's props overwrote game 1's,
   oddsByKey/gameInfo kept whichever came last, and a pick could show one game's
   price while grading against the other's boxscore. This drives the REAL engine
   over the fixture slate with the MIL@PIT game cloned into a two-game set (clone =
   GM 1 five hours earlier, all its prices shifted) and asserts full separation. */

const EV1 = "f308816130f3007f771929f15d62862c"; // fixture MIL @ PIT event (becomes GM 2)
const EV2 = "deadbeefdeadbeefdeadbeefdeadbeef"; // synthetic GM 1 event
const PK2 = 823357; // fixture gamePk (GM 2)
const PK1 = 99823357; // synthetic GM 1 gamePk
const EARLY = "2026-07-10T17:41:00Z"; // GM 1 first pitch (fixture game is 22:41Z)
const GK1 = "milwaukeebrewers@pittsburghpiratesgm1";
const GK2 = "milwaukeebrewers@pittsburghpiratesgm2";

const FIX = path.join(__dirname, "fixtures");
const isPit = (o: { away_team?: string; home_team?: string }) =>
  o.away_team === "Milwaukee Brewers" && o.home_team === "Pittsburgh Pirates";
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
/* shift an American price away from its current value (stays a valid quote) */
const shiftAm = (p: unknown): unknown => (typeof p === "number" ? (p > 0 ? p + 25 : p - 25) : p);
function shiftPrices(o: unknown): void {
  if (Array.isArray(o)) o.forEach(shiftPrices);
  else if (o && typeof o === "object") {
    const r = o as Record<string, unknown>;
    if ("price" in r) r.price = shiftAm(r.price);
    Object.values(r).forEach(shiftPrices);
  }
}

type Sched = { dates: { games: Record<string, unknown>[] }[] };

function dhFetchJson(url: string): Promise<{ ok: boolean; body: unknown }> {
  // GM 1's props: the real event's props fixture with every price shifted
  if (url.includes(`/events/${EV2}/odds`)) {
    const body = JSON.parse(fs.readFileSync(path.join(FIX, `fix39/props_${EV1}.json`), "utf8"));
    shiftPrices(body);
    return Promise.resolve({ ok: true, body });
  }
  return fixtureFetchJson(url).then(({ ok, body }) => {
    if (!ok) return { ok, body };
    if (url.includes("/schedule") && !url.includes("2026-07-09")) {
      const s = clone(body) as Sched;
      const games = s.dates[0].games;
      const g = games.find(
        (x) =>
          (x.teams as { away: { team: { name: string } }; home: { team: { name: string } } }).away.team.name ===
            "Milwaukee Brewers" &&
          (x.teams as { home: { team: { name: string } } }).home.team.name === "Pittsburgh Pirates",
      )!;
      const g1 = clone(g);
      g1.gamePk = PK1;
      g1.gameDate = EARLY;
      g1.gameNumber = 1;
      g1.doubleHeader = "Y";
      g.gameNumber = 2;
      g.doubleHeader = "Y";
      games.unshift(g1);
      return { ok, body: s };
    }
    if (url.includes("markets=h2h")) {
      const list = clone(body) as ({ id: string; commence_time: string } & Record<string, unknown>)[];
      const e = list.find((x) => isPit(x as never))!;
      const e1 = clone(e);
      e1.id = EV2;
      e1.commence_time = EARLY;
      shiftPrices(e1.bookmakers);
      list.push(e1);
      return { ok, body: list };
    }
    if (url.includes("/events?")) {
      const list = clone(body) as ({ id: string; commence_time: string } & Record<string, unknown>)[];
      const e = list.find((x) => isPit(x as never))!;
      const e1 = clone(e);
      e1.id = EV2;
      e1.commence_time = EARLY;
      list.push(e1);
      return { ok, body: list };
    }
    return { ok, body };
  });
}

let d: BoardData;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FROZEN_NOW);
  const eng = createEngine({ fetchJson: dhFetchJson, today: TODAY });
  d = eng.analyze(await eng.collectSlate()) as BoardData;
}, 60_000);
afterAll(() => vi.useRealTimers());

const rowsFor = (gk: string): PickRow[] => {
  const out: PickRow[] = [];
  for (const [cat, rows] of Object.entries(d.categories)) {
    if (cat === "all") continue;
    for (const r of rows) if (r.gkey === gk) out.push(r);
  }
  return out;
};

describe("doubleheader separation", () => {
  it("both games exist in gameInfo with their own pk/start; the collapsed key is gone", () => {
    expect(d.gameInfo![GK1]).toMatchObject({ pk: PK1, start: EARLY, gm: 1 });
    expect(d.gameInfo![GK2]).toMatchObject({ pk: PK2, gm: 2 });
    expect(d.gameInfo!["milwaukeebrewers@pittsburghpirates"]).toBeUndefined();
    expect(d.gameInfo![GK2].start).not.toBe(EARLY);
  });

  it("each game gets its own ML row, labeled (GM n), priced from its own books", () => {
    const ml1 = d.categories.ml.filter((r) => r.gkey === GK1);
    const ml2 = d.categories.ml.filter((r) => r.gkey === GK2);
    expect(ml1.length).toBe(1);
    expect(ml2.length).toBe(1);
    expect(String(ml1[0].game)).toContain("(GM 1)");
    expect(String(ml2[0].game)).toContain("(GM 2)");
    expect(String(ml1[0].odds)).not.toBe(String(ml2[0].odds)); // GM 1's books were shifted — prices must not bleed
  });

  it("props are kept per game — same player, both games, different Caesars prices", () => {
    const r1 = rowsFor(GK1);
    const r2 = rowsFor(GK2);
    expect(r1.length).toBeGreaterThan(5);
    expect(r2.length).toBeGreaterThan(5);
    for (const r of r1) expect(String(r.game)).toContain("(GM 1)");
    for (const r of r2) expect(String(r.game)).toContain("(GM 2)");
    // the Mangum case: one player listed in both games must carry each game's own quote
    let compared = 0;
    for (const a of r1) {
      const b = r2.find((x) => x.label === a.label && x.sub === a.sub);
      if (!b || a.cz == null || b.cz == null) continue;
      expect(JSON.stringify(a.cz)).not.toBe(JSON.stringify(b.cz));
      compared++;
    }
    expect(compared).toBeGreaterThan(0);
  });

  it("parlay legs name the game, and the prediction log keeps both games distinct", () => {
    const legs = [...d.parlays, ...d.parlaysMixed].flatMap((t) => t.legs);
    const l1 = legs.filter((l) => l.gkey === GK1);
    const l2 = legs.filter((l) => l.gkey === GK2);
    for (const l of l1) expect(String(l.game)).toContain("(GM 1)");
    for (const l of l2) expect(String(l.game)).toContain("(GM 2)");
    const { records, games } = boardToPredictions(d);
    expect(games[GK1]?.pk).toBe(PK1);
    expect(games[GK2]?.pk).toBe(PK2);
    expect(records.some((r) => r.gkey === GK1)).toBe(true);
    expect(records.some((r) => r.gkey === GK2)).toBe(true);
  });
});
