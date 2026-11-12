import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decide } from "@/lib/anytime/engine";
import { HOUSE_RULES, gradeOf, houseRuleOf, type FinalScore } from "@/lib/anytime/grade";
import { memoryKv } from "@/lib/anytime/kv";
import { readLedger } from "@/lib/anytime/ledger";
import { runPicks, type RunDeps, type ScoreProvider } from "@/lib/anytime/run";
import type { Candidate, PickRecord } from "@/lib/anytime/types";
import { AZ_BOOKS } from "@/lib/az/books";
import { excludedBy } from "@/lib/az/exclusions";
import { ncaabCandidates, parseEspnGames, tieOdds } from "@/lib/ncaab/slate";
import { NCAAB_SCORE_MISSING_MS, gameForPick, liveNcaabFeeds, ncaabAdapter, ncaabEspnDay, ncaabOncePerRun, ncaabScores, scoreProviders, type NcaabFeeds } from "@/lib/server/anytime-ncaab";
import { ncaabSlate, type NcaabSlateFeeds } from "@/lib/server/ncaab-slate";
import { __resetOddsClientForTests } from "@/lib/server/odds-client";
import { GET } from "../app/api/ncaab/route";
import { clockAt } from "./helpers/anytime";
import { stripComments } from "./helpers/source";

/**
 * THE COLLEGE BASKETBALL DESK — the server half: the any-time adapter, the scores, the slate route.
 * No network: every feed is injected or `fetch` is a stub. Schedule rows are real (trimmed ESPN),
 * every price and every final score used for grading is invented.
 */

const fx = (f: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests/fixtures/ncaab", f), "utf8"));
const ESPN_12: unknown[] = fx("espn-scoreboard-2026-11-12.json").events;
const ESPN_11: unknown[] = fx("espn-scoreboard-2026-11-11.json").events;
const ODDS: unknown[] = fx("odds-ncaab.synthetic.json");
const NOW = Date.parse("2026-11-12T21:00:00Z");
const KEY = "test-key-never-logged";

const PSU = "401917176";
const SJSU = "401911471";
const COPPIN = "401925631";
const MASON = "401920073";

const DAYS: Record<string, unknown[]> = { "2026-11-11": ESPN_11, "2026-11-12": ESPN_12 };

function feedsOf(init: { odds?: unknown[]; days?: Record<string, unknown[]> } = {}) {
  const f = {
    oddsEvents: init.odds ?? ODDS,
    days: init.days ?? DAYS,
    clock: clockAt(NOW),
    oddsCalls: 0,
    espnCalls: [] as string[],
    oddsError: null as Error | null,
    badDays: new Set<string>(),
    async odds() {
      f.oddsCalls++;
      if (f.oddsError) throw f.oddsError;
      return { events: f.oddsEvents, fetchedAt: f.clock() };
    },
    async espnDay(date: string) {
      f.espnCalls.push(date);
      if (f.badDays.has(date)) throw new Error(`espn scoreboard 503 for ncaab ${date}`);
      return f.days[date] ?? [];
    },
  };
  return f satisfies NcaabFeeds & Record<string, unknown>;
}

const ctx = (now = NOW) => ({ now, runId: "r1", trigger: "manual-api" as const, force: true });

/** the schedule row of `id` rewritten as a finished game (ESPN's own home and away) */
function finalOf(id: string, home: number, away: number, over: { date?: string; name?: string; completed?: boolean } = {}) {
  const e = structuredClone((ESPN_12 as { id: string }[]).find((x) => x.id === id)!) as {
    id: string;
    date: string;
    competitions: { date: string; competitors: { homeAway: string; score: string }[]; status: { type: Record<string, unknown> } }[];
    status: { type: Record<string, unknown> };
  };
  const type = { name: over.name ?? "STATUS_FINAL", state: "post", completed: over.completed ?? true, shortDetail: "Final" };
  e.status.type = type;
  e.competitions[0].status.type = type;
  if (over.date) {
    e.date = over.date;
    e.competitions[0].date = over.date;
  }
  for (const c of e.competitions[0].competitors) c.score = String(c.homeAway === "home" ? home : away);
  return e;
}

const CANDS = ncaabCandidates({ games: tieOdds(parseEspnGames(ESPN_12), ODDS).games, oddsEvents: ODDS, snapshotId: "snap", fetchedAt: NOW - 1_000 }).candidates;
const candOf = (id: string, market: string, side: string) => CANDS.find((c) => c.gradeRef?.id === id && c.market === market && c.side === side)!;
/** a recorded pick on that selection (the model number is raised so the engine takes it; only the grade is under test) */
const pickOf = (c: Candidate): PickRecord =>
  decide({ candidates: [{ ...c, model: { win: 0.995, push: 0 } }], now: NOW, runId: "r1", trigger: "manual-api", families: new Map(), excluded: excludedBy(), kellyBankroll: 100, kellyOpenByEvent: new Map() }).picks[0];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  __resetOddsClientForTests();
  delete process.env.ODDS_API_KEY;
});

describe("the adapter the any-time run calls", () => {
  it("makes one odds call, reads each schedule day once, and offers only games still to tip", async () => {
    const f = feedsOf();
    const out = await ncaabAdapter(ncaabOncePerRun(f)).candidates(ctx());
    expect(f.oddsCalls).toBe(1);
    expect(f.espnCalls.sort()).toEqual(["2026-11-12", "2026-11-13"]);
    expect(out.snapshot).toEqual({ id: "ncaab-r1", fetchedAt: NOW, events: 6 });
    expect(new Set(out.candidates.map((c) => c.gradeRef!.id))).toEqual(new Set([PSU, "401916288", "401928818", SJSU, COPPIN]));
    expect(out.candidates.every((c) => c.sport === "ncaab" && c.snapshotId === "ncaab-r1" && c.fetchedAt === NOW && Date.parse(c.commence) > NOW)).toBe(true);
    expect(out.events).toHaveLength(5);
  });

  it("drops a game that has tipped and one listed beyond the horizon, and says how many it could not place", async () => {
    const out = await ncaabAdapter(feedsOf()).candidates(ctx());
    expect(out.candidates.some((c) => c.gradeRef?.id === MASON)).toBe(false);
    expect(out.notes).toEqual(["ncaab: 1 listed game(s) start beyond the 8-day horizon and were not priced", "ncaab: 1 listed game(s) could not be tied to the ESPN schedule and were not priced"]);
  });

  it("a game the schedule says has started is not offered, whatever start time the odds feed still shows", async () => {
    /* the schedule moved Penn State's tip to before now; the odds event still says 23:30Z */
    const moved = structuredClone(ESPN_12) as { id: string; date: string; competitions: { date: string }[] }[];
    const psu = moved.find((e) => e.id === PSU)!;
    psu.date = "2026-11-12T20:30Z";
    psu.competitions[0].date = "2026-11-12T20:30Z";
    const out = await ncaabAdapter(feedsOf({ days: { "2026-11-12": moved } })).candidates(ctx());
    expect(out.candidates.some((c) => c.gradeRef?.id === PSU)).toBe(false);
    expect(out.candidates.some((c) => c.gradeRef?.id === SJSU)).toBe(true);
  });

  it("with nothing still to tip it asks ESPN for nothing", async () => {
    const f = feedsOf();
    const out = await ncaabAdapter(f).candidates(ctx(Date.parse("2026-11-26T00:00:00Z")));
    expect(out).toEqual({ candidates: [], events: [], notes: [], snapshot: { id: "ncaab-r1", fetchedAt: NOW, events: 0 } });
    expect(f.espnCalls).toEqual([]);
  });

  it("an odds failure or a schedule failure throws: nothing is priced on half a picture", async () => {
    const a = feedsOf();
    a.oddsError = new Error("Odds API 500 for ncaab");
    await expect(ncaabAdapter(a).candidates(ctx())).rejects.toThrow("Odds API 500 for ncaab");
    expect(a.espnCalls).toEqual([]);
    const b = feedsOf();
    b.badDays.add("2026-11-12");
    await expect(ncaabAdapter(b).candidates(ctx())).rejects.toThrow("espn scoreboard 503");
  });

  it("a failed schedule day is forgotten, so the same run may ask again; a good one is asked for once", async () => {
    const f = feedsOf();
    const once = ncaabOncePerRun(f);
    f.badDays.add("2026-11-12");
    await expect(once.espnDay("2026-11-12")).rejects.toThrow();
    f.badDays.clear();
    expect(await once.espnDay("2026-11-12")).toBe(ESPN_12);
    expect(await once.espnDay("2026-11-12")).toBe(ESPN_12);
    expect(f.espnCalls).toEqual(["2026-11-12", "2026-11-12"]);
    await once.odds();
    await once.odds();
    expect(f.oddsCalls).toBe(2);
  });
});

describe("a run end to end", () => {
  function world() {
    const f = feedsOf();
    const kv = memoryKv(f.clock);
    let n = 0;
    const feeds = ncaabOncePerRun(f);
    const deps: RunDeps = { kv, adapters: [ncaabAdapter(feeds)], scores: ncaabScores(feeds), clock: f.clock, newRunId: () => `run${++n}` };
    return { f, kv, deps };
  }

  it("records the selections whose better price beats the fair number, each at the book that pays it", async () => {
    const { kv, deps } = world();
    const r = await runPicks(deps, { trigger: "manual-ui" });
    expect(r).toMatchObject({ status: "ok", errors: [] });
    expect(r.picks.map((p) => [p.selection, p.book, p.price, p.otherBook, p.otherPrice]).sort()).toEqual([
      ["San José St ML", "fanduel", -125, "draftkings", -140],
      ["UC Riverside ML", "fanduel", 135, "draftkings", 120],
    ]);
    for (const p of r.picks) {
      expect(p).toMatchObject({ sport: "ncaab", marketType: "ncaab:ml", modelVersion: "bb-market-1", modelKind: "market-only", basis: "price", snapshotId: "ncaab-run1", trigger: "manual-ui", event: "UC Riverside @ San José St" });
      expect(AZ_BOOKS).toContain(p.book);
      expect(p.gradeRef).toMatchObject({ source: "espn", league: "ncaab", id: SJSU });
    }
    expect((await readLedger(kv)).map((x) => x.pick.id).sort()).toEqual(r.picks.map((p) => p.id).sort());
  });

  it("asked again with the same prices, it records nothing twice", async () => {
    const { kv, deps } = world();
    await runPicks(deps, { trigger: "manual-ui" });
    const again = await runPicks(deps, { trigger: "manual-api", force: true });
    expect(again.picks).toEqual([]);
    expect(await readLedger(kv)).toHaveLength(2);
  });

  it("grades its own picks from the final score once the game is over", async () => {
    const { f, kv, deps } = world();
    await runPicks(deps, { trigger: "manual-ui" });
    f.clock.add(8 * 3600_000);
    f.days = { ...DAYS, "2026-11-12": [...ESPN_12.filter((e) => (e as { id: string }).id !== SJSU), finalOf(SJSU, 70, 77)] };
    f.oddsEvents = [];
    const later = await runPicks({ ...deps, adapters: [ncaabAdapter(ncaabOncePerRun(f))], scores: ncaabScores(ncaabOncePerRun(f)) }, { trigger: "cron", force: true });
    expect(later.errors).toEqual([]);
    const rows = await readLedger(kv);
    const byName = Object.fromEntries(rows.map((x) => [x.pick.selection, x.grade?.result]));
    expect(byName).toEqual({ "UC Riverside ML": "won", "San José St ML": "lost" });
  });
});

describe("final scores for this desk's picks", () => {
  const score = async (picks: PickRecord[], f = feedsOf(), now = NOW + 8 * 3600_000) => {
    const r = await ncaabScores(f)(picks, now);
    return r instanceof Map ? { scores: r, errors: [] as string[] } : r;
  };

  it("finds the game by the schedule id the pick stored, on its own Pacific day", async () => {
    const p = pickOf(candOf(PSU, "ml", "home"));
    const f = feedsOf({ days: { "2026-11-12": [finalOf(PSU, 88, 61)] } });
    const { scores, errors } = await score([p], f);
    expect(errors).toEqual([]);
    expect(scores.get(p.id)).toEqual({ home: 88, away: 61, final: true, status: "final", start: "2026-11-12T23:30:00.000Z" });
    expect(gradeOf(p, scores.get(p.id), NOW + 8 * 3600_000, "espn")!.result).toBe("won");
  });

  it("a pick on a game the odds feed listed the other way round is graded the way round it was priced", async () => {
    /* ESPN: Coppin State is home and lost 60-75. The pick calls Bradley "home", as the odds feed did. */
    const f = feedsOf({ days: { "2026-11-12": [finalOf(COPPIN, 60, 75)] } });
    const bradley = pickOf(candOf(COPPIN, "ml", "home"));
    const coppin = pickOf(candOf(COPPIN, "ml", "away"));
    const laying = pickOf(candOf(COPPIN, "spread", "home"));
    expect([bradley.selection, coppin.selection, laying.selection]).toEqual(["Bradley ML", "Coppin St ML", "Bradley -11.5"]);
    const { scores } = await score([bradley, coppin, laying], f);
    expect(scores.get(bradley.id)).toMatchObject({ home: 75, away: 60, final: true });
    const at = NOW + 8 * 3600_000;
    expect(gradeOf(bradley, scores.get(bradley.id), at, "espn")!.result).toBe("won");
    expect(gradeOf(coppin, scores.get(coppin.id), at, "espn")!.result).toBe("lost");
    expect(gradeOf(laying, scores.get(laying.id), at, "espn")!.result).toBe("won");
  });

  it("gameForPick: the same id with other teams is not the pick's game", () => {
    const g = parseEspnGames([finalOf(COPPIN, 60, 75)])[0];
    const ref = (home?: string, away?: string) => ({ gradeRef: { source: "espn" as const, league: "ncaab", id: COPPIN, home, away } });
    expect(gameForPick(ref("Coppin State Eagles", "Bradley Braves"), g)!.home.score).toBe(60);
    expect(gameForPick(ref("Bradley Braves", "Coppin State Eagles"), g)!.home.score).toBe(75);
    expect(gameForPick(ref("Bradley Braves", "Someone Else"), g)).toBeNull();
    expect(gameForPick(ref("Someone Else", "Bradley Braves"), g)).toBeNull();
    expect(gameForPick(ref("Bradley Braves", undefined), g)).toBeNull();
    expect(gameForPick(ref(undefined, undefined), g)!.home.score).toBe(60);
    expect(gameForPick({ gradeRef: { source: "espn", league: "ncaab", id: "other" } }, g)).toBeNull();
    expect(gameForPick({ gradeRef: null }, g)).toBeNull();
  });

  it("a game still to tip or in play is reported as it stands, and nothing is graded on it", async () => {
    const p = pickOf(candOf(PSU, "ml", "home"));
    const { scores } = await score([p]);
    expect(scores.get(p.id)).toMatchObject({ final: false, status: "upcoming" });
    expect(gradeOf(p, scores.get(p.id), NOW + 3600_000, "espn")).toBeNull();
  });

  it("a moved game is looked for on the days after, and its new start is what comes back", async () => {
    const p = pickOf(candOf(PSU, "ml", "home"));
    const f = feedsOf({ days: { "2026-11-14": [finalOf(PSU, 80, 70, { date: "2026-11-14T23:30Z" })] } });
    const { scores } = await score([p], f, Date.parse("2026-11-15T08:00:00Z"));
    expect(scores.get(p.id)).toMatchObject({ home: 80, away: 70, final: true, start: "2026-11-14T23:30:00.000Z" });
  });

  it("a game the schedule has dropped is reported missing only after nine days, and never while a day is unread", async () => {
    const p = pickOf(candOf(PSU, "ml", "home"));
    const start = Date.parse(p.commence);
    const empty = () => feedsOf({ days: {} });
    expect((await score([p], empty(), start + NCAAB_SCORE_MISSING_MS - 1)).scores.has(p.id)).toBe(false);
    expect((await score([p], empty(), start + NCAAB_SCORE_MISSING_MS + 1)).scores.get(p.id)).toEqual({ home: 0, away: 0, final: false, status: "missing", start: null });
    const broken = empty();
    broken.badDays.add("2026-11-13");
    const r = await score([p], broken, start + NCAAB_SCORE_MISSING_MS + 1);
    expect(r.scores.has(p.id)).toBe(false);
    expect(r.errors.some((e) => e.includes("2026-11-13") || e.includes("2026-11-12"))).toBe(true);
  });

  it("leaves another sport's picks alone, and asks ESPN for nothing when none are its own", async () => {
    const f = feedsOf();
    const other = { ...pickOf(candOf(PSU, "ml", "home")), gradeRef: { source: "espn" as const, league: "nfl", id: PSU } };
    const { scores } = await score([other], f);
    expect(scores.size).toBe(0);
    expect(f.espnCalls).toEqual([]);
  });
});

describe("several score providers as one", () => {
  const s = (home: number): FinalScore => ({ home, away: 0, final: true, status: "final" });
  const p = pickOf(candOf(PSU, "ml", "home"));

  it("merges every provider's scores and keeps every provider's errors", async () => {
    const a: ScoreProvider = async () => new Map([["a", s(1)]]);
    const b: ScoreProvider = async () => ({ scores: new Map([["b", s(2)]]), errors: ["b: one day unread"] });
    const r = await scoreProviders(a, b)([p], NOW);
    expect(r instanceof Map).toBe(false);
    const got = r as { scores: Map<string, FinalScore>; errors: string[] };
    expect([...got.scores.keys()].sort()).toEqual(["a", "b"]);
    expect(got.errors).toEqual(["b: one day unread"]);
  });

  it("with no errors it answers with the plain map", async () => {
    const r = await scoreProviders(async () => new Map([["a", s(1)]]), async () => new Map([["b", s(2)]]))([p], NOW);
    expect(r instanceof Map).toBe(true);
    expect((r as Map<string, FinalScore>).size).toBe(2);
  });

  it("a provider that throws costs only its own picks", async () => {
    const boom: ScoreProvider = async () => {
      throw new Error("espn is down");
    };
    const r = (await scoreProviders(boom, async () => new Map([["b", s(2)]]))([p], NOW)) as { scores: Map<string, FinalScore>; errors: string[] };
    expect([...r.scores.keys()]).toEqual(["b"]);
    expect(r.errors).toEqual(["scores: espn is down"]);
  });

  it("every provider is handed every pick and the same clock", async () => {
    const seen: [number, number][] = [];
    const spy: ScoreProvider = async (picks, now) => (seen.push([picks.length, now]), new Map());
    await scoreProviders(spy, spy)([p, p], NOW);
    expect(seen).toEqual([
      [2, NOW],
      [2, NOW],
    ]);
  });
});

describe("how a College Basketball pick settles", () => {
  const ml = pickOf(candOf(PSU, "ml", "home"));
  const spread = { ...pickOf(candOf(PSU, "spread", "home")), line: -18 };
  const total = { ...pickOf(candOf(PSU, "total", "over")), line: 150 };
  const fin = (home: number, away: number, start?: string): FinalScore => ({ home, away, final: true, status: "final", start: start ?? ml.commence });
  const at = NOW + 8 * 3600_000;

  it("both books have a rule for this sport, marked unverified, with overtime counting", () => {
    for (const b of AZ_BOOKS) {
      expect(houseRuleOf(b, "ncaab")).toEqual({ overtimeCounts: true, mlTie: "push", voidWindow: { kind: "hours", ms: 24 * 3600_000 }, verified: false });
      expect(HOUSE_RULES[b].nfl).not.toEqual(HOUSE_RULES[b].ncaab);
    }
    expect(houseRuleOf("draftkings", "ncaaw")).toBeNull();
  });

  it("settles the moneyline, the spread and the total on the full final score", () => {
    expect(gradeOf(ml, fin(80, 79), at, "espn")!.result).toBe("won");
    expect(gradeOf(ml, fin(79, 80), at, "espn")!.result).toBe("lost");
    expect(gradeOf(spread, fin(90, 71), at, "espn")!.result).toBe("won");
    expect(gradeOf(spread, fin(89, 71), at, "espn")!.result).toBe("push");
    expect(gradeOf(spread, fin(88, 71), at, "espn")!.result).toBe("lost");
    expect(gradeOf(total, fin(80, 71), at, "espn")!.result).toBe("won");
    expect(gradeOf(total, fin(80, 70), at, "espn")!.result).toBe("push");
    expect(gradeOf(total, fin(79, 70), at, "espn")!.result).toBe("lost");
  });

  it("a game replayed more than a day late is void; inside a day it counts", () => {
    const start = Date.parse(ml.commence);
    const within = new Date(start + 24 * 3600_000).toISOString();
    const beyond = new Date(start + 24 * 3600_000 + 1).toISOString();
    expect(gradeOf(ml, fin(80, 79, within), at + 3 * 86_400_000, "espn")!.result).toBe("won");
    expect(gradeOf(ml, fin(80, 79, beyond), at + 3 * 86_400_000, "espn")).toMatchObject({ result: "void", reason: "postponed" });
  });

  it("a postponed game is void once the day has passed, and open until then", () => {
    const start = Date.parse(ml.commence);
    const off: FinalScore = { home: 0, away: 0, final: false, status: "postponed", start: null };
    expect(gradeOf(ml, off, start + 24 * 3600_000 - 1, "espn")).toBeNull();
    expect(gradeOf(ml, off, start + 24 * 3600_000 + 1, "espn")).toMatchObject({ result: "void", reason: "postponed" });
  });
});

describe("the slate behind GET /api/ncaab", () => {
  function feeds(over: Partial<{ odds: NcaabSlateFeeds["odds"]; bad: string }> = {}) {
    const calls = { odds: 0, espn: [] as string[] };
    const f: NcaabSlateFeeds = {
      async espnDay(date) {
        calls.espn.push(date);
        if (over.bad === date) throw new Error(`espn scoreboard 503 for ncaab ${date}`);
        return DAYS[date] ?? [];
      },
      odds: async () => {
        calls.odds++;
        return over.odds ? over.odds() : { events: ODDS, quota: { remaining: 90_000, used: 10_000 } };
      },
    };
    return { f, calls };
  }

  it("reads the date and the next ESPN day, makes one odds call, and returns the priced slate", async () => {
    const { f, calls } = feeds();
    const s = await ncaabSlate("2026-11-12", NOW, f);
    expect(calls).toEqual({ odds: 1, espn: ["2026-11-12", "2026-11-13"] });
    expect(s).toMatchObject({ date: "2026-11-12", priced: 5, oddsMissing: false, quota: { remaining: 90_000, used: 10_000 }, ttlSec: 240 });
  });

  it("makes no odds call at all when the date has no game left to tip", async () => {
    const y = feeds();
    const s = await ncaabSlate("2026-11-11", NOW, y.f);
    expect(y.calls.odds).toBe(0);
    expect(s).toMatchObject({ priced: 0, oddsMissing: false, quota: null });
    expect(s.games).toHaveLength(5);
    const empty = feeds();
    await ncaabSlate("2026-11-20", NOW, empty.f);
    expect(empty.calls.odds).toBe(0);
    const over = feeds();
    await ncaabSlate("2026-11-12", Date.parse("2026-11-13T07:00:00Z"), over.f);
    expect(over.calls.odds).toBe(0);
  });

  it("no key, or an odds feed that fails: the schedule comes back without prices and says so", async () => {
    const noKey = await ncaabSlate("2026-11-12", NOW, feeds({ odds: async () => null }).f);
    expect(noKey).toMatchObject({ oddsMissing: true, priced: 0, quota: null });
    expect(noKey.games).toHaveLength(10);
    const down = await ncaabSlate(
      "2026-11-12",
      NOW,
      feeds({
        odds: async () => {
          throw new Error("odds feed 500");
        },
      }).f,
    );
    expect(down).toMatchObject({ oddsMissing: true, priced: 0 });
    expect(down.games).toHaveLength(10);
  });

  it("a schedule that cannot be read is an error, not an empty day", async () => {
    await expect(ncaabSlate("2026-11-12", NOW, feeds({ bad: "2026-11-13" }).f)).rejects.toThrow("espn scoreboard 503");
  });
});

describe("GET /api/ncaab over a stubbed network", () => {
  function stub(over: { espnStatus?: number; oddsStatus?: number } = {}) {
    const urls: string[] = [];
    const inits: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: unknown) => {
        const url = String(input);
        urls.push(url);
        inits.push(init);
        if (url.includes("site.api.espn.com")) {
          const d = /dates=(\d{4})(\d{2})(\d{2})/.exec(url)!;
          return new Response(JSON.stringify({ events: DAYS[`${d[1]}-${d[2]}-${d[3]}`] ?? [] }), { status: over.espnStatus ?? 200 });
        }
        return new Response(JSON.stringify(ODDS), { status: over.oddsStatus ?? 200, headers: { "x-requests-remaining": "90000", "x-requests-used": "10000", "x-requests-last": "3" } });
      }),
    );
    return { urls, inits };
  }
  const get = (qs = "?date=2026-11-12") => GET(new NextRequest(`http://localhost/api/ncaab${qs}`));
  const at = (iso: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
  };

  it("answers the priced slate, asks the provider for the two books by name, and never repeats the key", async () => {
    at("2026-11-12T21:00:00Z");
    process.env.ODDS_API_KEY = KEY;
    const { urls, inits } = stub();
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-requests-remaining")).toBe("90000");
    expect(res.headers.get("x-requests-used")).toBe("10000");
    const text = await res.text();
    expect(text).not.toContain(KEY);
    const body = JSON.parse(text);
    expect(body).toMatchObject({ sport: "ncaab", date: "2026-11-12", priced: 5, oddsMissing: false });
    expect(JSON.stringify(body)).not.toContain("otherbook");

    const odds = urls.filter((u) => u.includes("the-odds-api.com"));
    expect(odds).toHaveLength(1);
    const u = new URL(odds[0]);
    expect(u.pathname).toBe("/v4/sports/basketball_ncaab/odds");
    expect(u.searchParams.get("bookmakers")).toBe("draftkings,fanduel");
    expect(u.searchParams.has("regions")).toBe(false);
    expect(u.searchParams.get("markets")).toBe("h2h,spreads,totals");
    expect(inits[urls.indexOf(odds[0])]).toEqual({ next: { revalidate: 240 } });
    const espn = urls.filter((x) => x.includes("site.api.espn.com"));
    expect(espn.map((x) => /dates=(\d+)/.exec(x)![1]).sort()).toEqual(["20261112", "20261113"]);
    expect(espn.every((x) => x.includes("/basketball/mens-college-basketball/scoreboard?groups=50&limit=400&dates="))).toBe(true);
  });

  it("defaults to today's Pacific date", async () => {
    at("2026-11-13T05:30:00Z"); // 9:30 PM Pacific on the 12th
    process.env.ODDS_API_KEY = KEY;
    stub();
    const body = await (await get("")).json();
    expect(body.date).toBe("2026-11-12");
  });

  it("with no key it spends nothing and still shows the schedule", async () => {
    at("2026-11-12T21:00:00Z");
    const { urls } = stub();
    const res = await get();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ oddsMissing: true, priced: 0 });
    expect(body.games).toHaveLength(10);
    expect(urls.some((u) => u.includes("the-odds-api.com"))).toBe(false);
    expect(res.headers.get("x-requests-remaining")).toBeNull();
  });

  it("a day with nothing left to tip costs nothing", async () => {
    at("2026-11-12T21:00:00Z");
    process.env.ODDS_API_KEY = KEY;
    const { urls } = stub();
    const body = await (await get("?date=2026-11-11")).json();
    expect(body.games).toHaveLength(5);
    expect(urls.some((u) => u.includes("the-odds-api.com"))).toBe(false);
  });

  it("a provider error is a schedule without prices, not a failure", async () => {
    at("2026-11-12T21:00:00Z");
    process.env.ODDS_API_KEY = KEY;
    stub({ oddsStatus: 500 });
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ oddsMissing: true, priced: 0 });
  });

  it("refuses a date that is not one", async () => {
    stub();
    for (const qs of ["?date=tomorrow", "?date=2026-13-45", "?date=20261112", "?date=2026-11-12%27"]) {
      const res = await get(qs);
      expect(res.status, qs).toBe(400);
      expect(await res.json()).toEqual({ error: "bad date" });
    }
  });

  it("answers 502 when the schedule cannot be read, and the error carries no key", async () => {
    at("2026-11-12T21:00:00Z");
    process.env.ODDS_API_KEY = KEY;
    stub({ espnStatus: 503 });
    const res = await get();
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(JSON.parse(text).error).toMatch(/^schedule unavailable: espn scoreboard 503/);
    expect(text).not.toContain(KEY);
  });

  it("the live feeds: a pick run's odds call is never cached, and needs the key", async () => {
    at("2026-11-12T21:00:00Z");
    const none = stub();
    await expect(liveNcaabFeeds().odds()).rejects.toThrow("ODDS_API_KEY not set");
    expect(none.urls).toEqual([]);
    process.env.ODDS_API_KEY = KEY;
    const { urls, inits } = stub();
    const pull = await liveNcaabFeeds().odds();
    expect(pull.fetchedAt).toBe(Date.parse("2026-11-12T21:00:00Z"));
    expect((pull.events as { bookmakers: { key: string }[] }[]).every((e) => e.bookmakers.every((b) => (AZ_BOOKS as readonly string[]).includes(b.key)))).toBe(true);
    expect(inits[0]).toEqual({ cache: "no-store" });
    expect(new URL(urls[0]).searchParams.get("bookmakers")).toBe("draftkings,fanduel");
    await ncaabEspnDay("2026-11-12");
    expect(inits[1]).toEqual({ next: { revalidate: 60 } });
    stub({ oddsStatus: 429 });
    await expect(liveNcaabFeeds().odds()).rejects.toThrow("Odds API 429 for ncaab");
    stub({ espnStatus: 500 });
    await expect(ncaabEspnDay("2026-11-12")).rejects.toThrow("espn scoreboard 500 for ncaab 2026-11-12");
  });
});

describe("as source", () => {
  const read = (p: string) => stripComments(fs.readFileSync(path.join(process.cwd(), p), "utf8"));

  it("the any-time engine runs this desk beside the football ones, and grades all three", () => {
    const src = read("src/lib/server/anytime.ts");
    expect(src).toMatch(/adapters: \[footballAdapter\(NFL_LEAGUE, feeds\), footballAdapter\(CFB_LEAGUE, feeds\), ncaabAdapter\(hoops\)\],/);
    expect(src).toMatch(/scores: scoreProviders\(footballScores\(\[NFL_LEAGUE, CFB_LEAGUE\], feeds\), ncaabScores\(hoops\)\),/);
    expect(src).toMatch(/const hoops = ncaabOncePerRun\(liveNcaabFeeds\(\)\);/);
  });

  it("every Odds API request on this desk goes through the one odds client, and the route writes nothing", () => {
    for (const p of ["src/lib/server/anytime-ncaab.ts", "src/lib/server/ncaab-slate.ts"]) {
      const src = read(p);
      expect(src, p).toMatch(/oddsFetch\(`\$\{NCAAB_ODDS_URL\}&apiKey=\$\{encodeURIComponent\(key\)\}`/);
      expect(src, p).not.toMatch(/the-odds-api\.com/);
      expect(src, p).not.toMatch(/console\./);
    }
    const route = read("app/api/ncaab/route.ts");
    expect(route).toMatch(/import \{ ptToday \} from "@\/lib\/server\/pt-date";/);
    expect(route).not.toMatch(/redis\(|@\/lib\/server\/store|ODDS_API_KEY|console\./);
    expect(route).not.toMatch(/export async function (POST|PUT|DELETE|PATCH)/);
  });

  it("the page asks on open and on a tap, never on a timer", () => {
    for (const p of ["src/components/ncaab/NcaabDesk.tsx", "src/lib/ncaab/client.ts"]) {
      const src = read(p);
      expect(src, p).not.toMatch(/refetchInterval|setInterval\(|setTimeout\(/);
      expect(src, p).not.toMatch(/router\.push\(/);
    }
    const desk = read("src/components/ncaab/NcaabDesk.tsx");
    expect((desk.match(/<Link /g) ?? []).length).toBe((desk.match(/<Link replace /g) ?? []).length);
    expect(desk).not.toMatch(/\.reduce\(|Math\./);
  });
});
