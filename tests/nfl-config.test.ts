import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stripComments } from "./helpers/source";
import { assertLeagueConfig, type LeagueConfig } from "@/lib/football/league";
import { CFB_LEAGUE, CFB_MODEL, CFB_PAPER, CFB_RULES } from "@/lib/cfb/rules";
import {
  NFL_ESPN_SCOREBOARD,
  NFL_EVENTS,
  NFL_KEYS,
  NFL_LEAGUE,
  NFL_LOCK,
  NFL_MODEL,
  NFL_ODDS_URL,
  NFL_PAPER,
  NFL_REDIS,
  NFL_RULES,
  NFL_TOPUP,
  NFL_TRIGGERS,
} from "@/lib/nfl/rules";

/**
 * THE LEAGUE CONFIGS (2026-09-08). Josh, verbatim: "1. Widen the CFB allocation to $250
 * 2. NFL needs to be built NOW  3. Allocation should be set to $350".
 *
 * Two objects, one contract: src/lib/football/league.ts. This file pins the money invariants
 * every league must satisfy (`assertLeagueConfig`), the two allotments Josh named, and the
 * NFL literals the desk's store / routes / cron key on — so a typo in a key or a trigger is a
 * red test here rather than an NFL ticket on a CFB ledger.
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("assertLeagueConfig — the money invariants hold for BOTH leagues", () => {
  it.each<[string, LeagueConfig]>([
    ["cfb", CFB_LEAGUE],
    ["nfl", NFL_LEAGUE],
  ])("%s passes assertLeagueConfig", (_id, cfg) => {
    expect(() => assertLeagueConfig(cfg)).not.toThrow();
  });

  it.each<[string, LeagueConfig]>([
    ["cfb", CFB_LEAGUE],
    ["nfl", NFL_LEAGUE],
  ])("%s: kellyCap × bankBase === maxStake, and tickets.max × maxStake >= daily", (_id, cfg) => {
    expect(cfg.rules.kellyCap * cfg.bankBase).toBe(cfg.rules.maxStake);
    expect(cfg.rules.tickets.max * cfg.rules.maxStake).toBeGreaterThanOrEqual(cfg.paper.daily);
    expect(cfg.idPrefix).toBe(cfg.id);
    expect(cfg.queryPrefix).toBe(cfg.id);
    expect(cfg.lockSource).toBe("server-lock");
  });

  it("throws on a mis-sized league — the guard is not decorative", () => {
    expect(() => assertLeagueConfig({ ...NFL_LEAGUE, rules: { ...NFL_RULES, maxStake: 25 } })).toThrow(/kellyCap/);
    expect(() => assertLeagueConfig({ ...NFL_LEAGUE, paper: { ...NFL_PAPER, daily: 600 } })).toThrow(/cannot deploy/);
    expect(() => assertLeagueConfig({ ...NFL_LEAGUE, idPrefix: "cfb" })).toThrow(/idPrefix/);
  });
});

describe("CFB — widened to $250 (Josh, 2026-09-08)", () => {
  it("CFB_PAPER.daily is 250, the max stake is $50, and the day may carry 3–10 tickets", () => {
    expect(CFB_PAPER.daily).toBe(250);
    expect(CFB_PAPER.fun).toBe(25);
    expect(CFB_RULES.maxStake).toBe(50);
    expect(CFB_RULES.tickets).toEqual({ min: 3, max: 10 });
    expect(CFB_RULES.kellyCap * 2500).toBe(50);
  });

  it("CFB_LEAGUE is built FROM the CFB constants — the same objects, not copies", () => {
    expect(CFB_LEAGUE.paper).toBe(CFB_PAPER);
    expect(CFB_LEAGUE.rules).toBe(CFB_RULES);
    expect(CFB_LEAGUE.model).toBe(CFB_MODEL);
    expect(CFB_LEAGUE.id).toBe("cfb");
    expect(CFB_LEAGUE.feeds.oddsSportKey).toBe("americanfootball_ncaaf");
    expect(CFB_LEAGUE.feeds.espnScoreboardQuery).toBe("groups=80&limit=400");
    expect(CFB_LEAGUE.triggers.lock).toBe("cfb-lock");
    expect(CFB_LEAGUE.keys).toEqual({ ledger: "pl_cfb_ledger", bank: "pl_cfb_bank2" });
  });

  it("INSTRUCTION 49 (2026-09-09): CFB_LEAGUE.topUp is 6 attempts per arm with NO cooldown — the refill slot calendar is the only pacing", () => {
    expect(CFB_LEAGUE.topUp).toEqual({ max: 6, retryMs: 0 });
  });
});

describe("NFL — $350 core / $25 fun, its own keys, its own feeds", () => {
  it("NFL_PAPER is $350 daily / $25 fun, since 2026-09-10", () => {
    expect(NFL_PAPER).toEqual({ since: "2026-09-10", daily: 350, fun: 25 });
    expect(NFL_LEAGUE.paper).toBe(NFL_PAPER);
  });

  it("NFL_RULES: $50 max stake, 3–10 tickets, the same Kelly discipline", () => {
    expect(NFL_RULES.maxStake).toBe(50);
    expect(NFL_RULES.minStake).toBe(5);
    expect(NFL_RULES.tickets).toEqual({ min: 3, max: 10 });
    expect(NFL_RULES.kellyCap).toBe(0.02);
    expect(NFL_RULES.kellyFrac).toBe(0.25);
    expect(NFL_LEAGUE.bankBase).toBe(2500);
    expect(NFL_RULES.tickets.max * NFL_RULES.maxStake).toBeGreaterThanOrEqual(NFL_PAPER.daily);
  });

  it("NFL_MODEL is its own object with the NFL sigma — never the CFB model", () => {
    expect(NFL_MODEL).not.toBe(CFB_MODEL);
    expect(NFL_MODEL.sigma).toBe(13.5);
    expect(NFL_MODEL.sigmaTotal).toBe(13.5);
    expect(NFL_MODEL.hfa).toBe(2.0);
    expect(CFB_MODEL.sigma).toBe(16.5);
    expect(NFL_LEAGUE.model).toBe(NFL_MODEL);
  });

  it("NFL_LOCK: one hour lead, a 25 s forward that fits the scheduler's 90 s budget beside the CFB forward", () => {
    expect(NFL_LOCK).toEqual({ leadMs: 60 * 60_000, forwardTimeoutMs: 25_000 });
    expect(NFL_LOCK.forwardTimeoutMs).toBe(25_000);
    // the two football forwards run CONCURRENTLY, so the tick's worst case is max(cfb, nfl) + the ~60 s generate
    expect(Math.max(25_000, NFL_LOCK.forwardTimeoutMs) + 60_000).toBeLessThan(90_000);
    expect(NFL_LEAGUE.lock).toBe(NFL_LOCK);
  });

  it("INSTRUCTION 49 (2026-09-09): NFL_TOPUP is { max: 6, retryMs: 0 } — a literal mirror of the CFB knob, wired as the league's topUp; the slots pace it", () => {
    expect(NFL_TOPUP).toEqual({ max: 6, retryMs: 0 });
    expect(NFL_LEAGUE.topUp).toBe(NFL_TOPUP);
    expect(NFL_LEAGUE.topUp).toEqual(CFB_LEAGUE.topUp); // equal by value, never the same object (the file's own no-shared-knob rule)
    expect(NFL_LEAGUE.topUp).not.toBe(CFB_LEAGUE.topUp);
  });

  it("device keys, cloud keys, window events and cron triggers are NFL literals", () => {
    expect(NFL_KEYS).toEqual({ ledger: "pl_nfl_ledger", bank: "pl_nfl_bank2" });
    expect(NFL_REDIS).toEqual({ ledger: "pl:nfl:ledger:v1", bank: "pl:nfl:bank:v1", oddsGap: "pl:nfl:oddsgap:v1" });
    expect(NFL_EVENTS).toEqual({ change: "pl:nfl-ledger-change", sync: "pl:nfl-ledger-sync" });
    expect(NFL_TRIGGERS).toEqual({ lock: "nfl-lock", oddsGap: "nfl-lock-odds-gap", sweep: "nfl-lock-sweep", sweepOdds: "nfl-lock-sweep-odds" });
    expect(NFL_LEAGUE.keys).toEqual(NFL_KEYS);
    expect(NFL_LEAGUE.events).toEqual(NFL_EVENTS);
    expect(NFL_LEAGUE.triggers).toEqual(NFL_TRIGGERS);
    expect(NFL_LEAGUE.redis).toEqual({ ...NFL_REDIS, propsBoard: "pl:nfl:props:v1:", propsSpend: "pl:nfl:props:spend:v1:" });
    expect(NFL_LEAGUE.routes).toEqual({ slate: "/api/nfl", ledger: "/api/nfl/ledger", lock: "/api/nfl/lock", props: "/api/nfl/props" });
    expect(NFL_LEAGUE.queryPrefix).toBe("nfl");
  });

  it("the feeds are the NFL feeds: americanfootball_nfl, no apiKey in the URL, no groups=80 on the scoreboard", () => {
    expect(NFL_ODDS_URL).toContain("americanfootball_nfl");
    expect(NFL_ODDS_URL).not.toMatch(/apiKey/i);
    expect(NFL_LEAGUE.feeds.oddsUrl).toBe(NFL_ODDS_URL);
    expect(NFL_LEAGUE.feeds.oddsSportKey).toBe("americanfootball_nfl");
    expect(NFL_LEAGUE.feeds.oddsEventBase).toBe("https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events");
    expect(NFL_ESPN_SCOREBOARD).toBe("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard");
    expect(NFL_ESPN_SCOREBOARD).not.toContain("groups=80");
    expect(NFL_LEAGUE.feeds.espnScoreboard).toBe(NFL_ESPN_SCOREBOARD);
    expect(NFL_LEAGUE.feeds.espnScoreboardQuery).toBe("limit=100");
    expect(NFL_LEAGUE.feeds.espnFpi).toContain("/sports/football/nfl/powerindex");
    expect(NFL_LEAGUE.feeds.espnByAthleteUrl("passing")).toContain("/sports/football/nfl/statistics/byathlete");
    expect(NFL_LEAGUE.feeds.espnByAthleteUrl("passing")).toContain("season=2026");
    expect(NFL_LEAGUE.feeds.espnByAthleteUrl("rushing", 2025)).toContain("season=2025");
    expect(NFL_LEAGUE.feeds.headshotUrl("3915511")).toBe("https://a.espncdn.com/i/headshots/nfl/players/full/3915511.png");
    expect(NFL_LEAGUE.aliases).toEqual({});
    expect(NFL_LEAGUE.feeds.oddsPropMarkets).toBe(CFB_LEAGUE.feeds.oddsPropMarkets);
  });

  it("no CFB literal leaks into the NFL config", () => {
    const flat = JSON.stringify(NFL_LEAGUE);
    for (const bad of ["pl_cfb", "pl:cfb", "americanfootball_ncaaf", "college-football", "/api/cfb", "cfb-lock", "groups=80"]) {
      expect(flat, `NFL_LEAGUE carries the CFB literal ${bad}`).not.toContain(bad);
    }
  });
});

describe("src/lib/nfl/rules.ts is PURE — literals only, `import type` only", () => {
  const src = stripComments(read("src/lib/nfl/rules.ts"));
  it("every import is an `import type`, and none reaches React or a store", () => {
    const imports = src.split("\n").filter((l) => /^\s*import\b/.test(l));
    expect(imports.length).toBeGreaterThan(0);
    for (const l of imports) expect(l, l).toMatch(/^\s*import type\b/);
    expect(src).not.toMatch(/["']react["']/);
    expect(src).not.toMatch(/\/store["']/);
    expect(src).not.toMatch(/from ["']@\/lib\/cfb\//);
  });
  it("exports NFL_LEAGUE and the constants the desk keys on", () => {
    for (const name of ["NFL_PAPER", "NFL_RULES", "NFL_MODEL", "NFL_LOCK", "NFL_KEYS", "NFL_REDIS", "NFL_EVENTS", "NFL_TRIGGERS", "NFL_ROUTES", "NFL_LEAGUE"]) {
      expect(src, `missing export ${name}`).toMatch(new RegExp(`export const ${name}\\b`));
    }
  });
});
