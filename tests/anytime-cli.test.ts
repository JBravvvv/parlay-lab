import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
// @ts-expect-error — a plain .mjs tool, no types
import { DEFAULT_BASE, UsageError, baseOf, healthLines, main, parseArgs, reportLines, requestOf, runLines } from "../tools/run-picks.mjs";

/**
 * The command-line trigger. What is held: the sync phrase leaves only in the x-pl-sync header,
 * over https (or to this machine); it is never an argument, never in a URL, never printed; the
 * run is recorded as `cli`; and the exit code tells a failed run from a refused one.
 */

const PHRASE = "test-phrase";
const ENV = { PL_SYNC: PHRASE };

type Call = { url: URL; init: RequestInit };
const world = (answer: (c: Call) => Response) => {
  const calls: Call[] = [];
  const lines: string[] = [];
  const fetchImpl = async (url: URL, init: RequestInit) => {
    calls.push({ url, init });
    return answer({ url, init });
  };
  return { calls, lines, fetchImpl, print: (s: string) => lines.push(s) };
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const PICK = {
  id: "p1", seq: 1, sport: "nfl", event: "Away @ Home", selection: "Home -2.5", book: "fanduel", price: -105, otherPrice: -110,
  modelP: 0.55, fairP: 0.512, ev: 0.074, stakeKelly: 1.63, basis: "independent",
};
const RUN = {
  ok: true, status: "ok", runId: "at-20261115-1700", trigger: "cli", engine: "anytime-1", ms: 2140, events: 14, candidates: 84, closes: 2,
  picks: [PICK], graded: [{ id: "p0", result: "won" }], rejects: { below_min_ev: 80, started: 3 }, skipped: ["cfb"],
  odds: { calls: 1, cacheHits: 1, credits: 3, remaining: 91234 }, notes: [], errors: [], bank: { kelly: 101.4, flat: 0.95, graded: 1 },
};

describe("the arguments", () => {
  it("default is one run of every sport, no force", () => {
    expect(parseArgs([])).toEqual({ mode: "run", base: null, sports: null, force: false, event: null, from: null, to: null, json: false, help: false });
  });

  it("reads each flag", () => {
    expect(parseArgs(["--sports", "nfl,cfb", "--force", "--event", "line-move", "--json", "--base", "http://localhost:3600"])).toMatchObject({
      mode: "run", sports: "nfl,cfb", force: true, event: "line-move", json: true, base: "http://localhost:3600",
    });
    expect(parseArgs(["--report", "--from", "2026-11-01", "--to", "2026-11-12"])).toMatchObject({ mode: "report", from: "2026-11-01", to: "2026-11-12" });
    expect(parseArgs(["--health"]).mode).toBe("health");
  });

  it("refuses a bare word, so the phrase can never be passed as an argument", () => {
    expect(() => parseArgs([PHRASE])).toThrow(UsageError);
    expect(() => parseArgs([PHRASE])).toThrow(/never an argument/);
    try {
      parseArgs([PHRASE]);
    } catch (e) {
      expect((e as Error).message).not.toContain(PHRASE);
    }
  });

  it("refuses unknown flags, missing values and malformed values", () => {
    expect(() => parseArgs(["--key", "x"])).toThrow(UsageError);
    expect(() => parseArgs(["--sports"])).toThrow(/needs a value/);
    expect(() => parseArgs(["--sports", "--force"])).toThrow(/needs a value/);
    expect(() => parseArgs(["--sports", "NFL"])).toThrow(/comma list/);
    expect(() => parseArgs(["--event", "Line Move"])).toThrow(/lower-case/);
    expect(() => parseArgs(["--from", "11/01/2026"])).toThrow(/YYYY-MM-DD/);
  });
});

describe("where it will send the phrase", () => {
  it("defaults to the production origin, takes PL_BASE, and an argument wins", () => {
    expect(baseOf(null, {})).toBe(DEFAULT_BASE);
    expect(baseOf(null, { PL_BASE: "https://preview.example.test" })).toBe("https://preview.example.test");
    expect(baseOf("https://other.example.test/", { PL_BASE: "https://preview.example.test" })).toBe("https://other.example.test");
  });

  it("allows plain http only to this machine", () => {
    expect(baseOf("http://localhost:3600")).toBe("http://localhost:3600");
    expect(baseOf("http://127.0.0.1:3600")).toBe("http://127.0.0.1:3600");
    expect(() => baseOf("http://parlay-lab-six.vercel.app")).toThrow(/https/);
    expect(() => baseOf("http://localhost.evil.test")).toThrow(/https/);
    expect(() => baseOf("ftp://localhost")).toThrow(/https/);
  });

  it("refuses a base carrying a user, a query or a fragment, and anything that is not a URL", () => {
    expect(() => baseOf("https://user:pw@example.test")).toThrow(/bare origin/);
    expect(() => baseOf("https://example.test/?key=1")).toThrow(/bare origin/);
    expect(() => baseOf("https://example.test/#x")).toThrow(/bare origin/);
    expect(() => baseOf("not a url")).toThrow(/not a URL/);
  });
});

describe("the one request", () => {
  it("a run is a POST to /api/anytime/run, phrase in x-pl-sync, recorded as cli", () => {
    const { url, init } = requestOf(parseArgs(["--sports", "nfl", "--force", "--event", "line-move"]), DEFAULT_BASE, PHRASE);
    expect(url.pathname).toBe("/api/anytime/run");
    expect(Object.fromEntries(url.searchParams)).toEqual({ sports: "nfl", force: "1", event: "line-move" });
    expect(init).toEqual({ method: "POST", headers: { "x-pl-sync": PHRASE, "x-pl-trigger": "cli" }, cache: "no-store" });
    expect(url.href).not.toContain(PHRASE);
  });

  it("a plain run sends no query at all", () => {
    expect(requestOf(parseArgs([]), DEFAULT_BASE, PHRASE).url.search).toBe("");
  });

  it("the report is a GET to /api/anytime with the phrase in the header", () => {
    const { url, init } = requestOf(parseArgs(["--report", "--from", "2026-11-01"]), DEFAULT_BASE, PHRASE);
    expect(url.pathname).toBe("/api/anytime");
    expect(Object.fromEntries(url.searchParams)).toEqual({ from: "2026-11-01", limit: "25" });
    expect(init).toEqual({ method: "GET", headers: { "x-pl-sync": PHRASE }, cache: "no-store" });
  });

  it("health needs no phrase and sends none", () => {
    const { url, init } = requestOf(parseArgs(["--health"]), DEFAULT_BASE, "");
    expect(url.pathname).toBe("/api/anytime/health");
    expect(init).toEqual({ method: "GET", cache: "no-store" });
    const withPhrase = requestOf(parseArgs(["--health"]), DEFAULT_BASE, PHRASE);
    expect(JSON.stringify(withPhrase)).not.toContain(PHRASE);
  });

  it("a run or a report with no phrase is refused before any request", () => {
    expect(() => requestOf(parseArgs([]), DEFAULT_BASE, "")).toThrow(/PL_SYNC is not set/);
    expect(() => requestOf(parseArgs(["--report"]), DEFAULT_BASE, "")).toThrow(/PL_SYNC is not set/);
  });
});

describe("what it prints", () => {
  it("a run: the pick with its book, both prices, model against no-vig, both stakes, and the credits", () => {
    const text = runLines(RUN).join("\n");
    expect(text).toContain("Run at-20261115-1700: ok (trigger cli, engine anytime-1, 2.1 s)");
    expect(text).toContain("Looked at 14 events, 84 priced selections. New picks: 1. Graded: 1. Closing lines stored: 2.");
    expect(text).toContain("PICK  nfl  Away @ Home  Home -2.5  at FanDuel -105 (other book -110)  model 55.0% vs no-vig 51.2%  EV +7.4%  stake 1u flat / 1.63u Kelly  independent");
    expect(text).toContain("GRADED  p0  won");
    expect(text).toContain("Not taken: below_min_ev 80, started 3.");
    expect(text).toContain("Not due a look yet (no credits spent): cfb.");
    expect(text).toContain("Odds API: 3 credits this run in 1 calls (1 served from the run's own memory); 91234 left this month.");
    expect(text).toContain("Bankrolls on 1 graded picks: flat +0.95u, quarter-Kelly 101.40u (started at 100u).");
  });

  it("absent stays n/a, never zero", () => {
    const text = runLines({ status: "ok", picks: [{ book: "draftkings", price: null, otherPrice: null }], odds: { credits: null } }).join("\n");
    expect(text).toContain("at DraftKings n/a (other book n/a)");
    expect(text).toContain("Odds API: n/a credits");
    expect(text).not.toMatch(/\b0 credits|\+0\b/);
    expect(runLines(null)[0]).toBe("Run n/a: n/a (trigger n/a, engine n/a, n/a)");
    expect(runLines({ status: "ok" }).join("\n")).toContain("Odds API: no call was made.");
  });

  it("a busy run says nothing was recorded twice; errors are shown", () => {
    expect(runLines({ status: "busy" }).join("\n")).toContain("nothing was recorded twice");
    expect(runLines({ status: "failed", errors: ["nfl: Odds API 401 for nfl"] }).join("\n")).toContain("ERROR: nfl: Odds API 401 for nfl");
    expect(runLines({ ok: false, error: "anytime unavailable" }).join("\n")).toContain("ERROR: anytime unavailable");
  });

  it("the report: three rows, DraftKings / FanDuel / Combined, profit beside ROI", () => {
    const st = (g: number, profit: number) => ({
      picks: g + 1, graded: g, won: 3, lost: 2, push: 0, flatProfit: profit, flatRoi: { mean: profit / g, lo: -0.4, hi: 0.6, n: g }, kellyProfit: 1.2, kellyRoi: 0.05,
      clv: { mean: 0.0123, lo: -0.01, hi: 0.03, n: 4 },
    });
    const lines = reportLines({ engine: "anytime-1", count: 12, report: { byBook: { draftkings: st(5, 0.5), fanduel: st(5, -1), combined: st(10, -0.5) } }, health: { state: "ok", message: "" } });
    expect(lines[0]).toBe("Any-time record (engine anytime-1): 12 picks stored.");
    expect(lines[1]).toContain("DraftKings");
    expect(lines[1]).toContain("5 graded of 6  3-2-0  flat profit +0.50u  ROI +10.0% (95% -40.0% to +60.0%)  Kelly profit +1.20u  ROI +5.0%  CLV +1.23% on 4");
    expect(lines[2]).toContain("FanDuel");
    expect(lines[2]).toContain("flat profit -1.00u  ROI -20.0%");
    expect(lines[3]).toContain("Combined");
    expect(lines[4]).toBe("Scheduler heartbeat: ok.");
    expect(reportLines({ report: {} }).slice(1, 4).every((l: string) => l.endsWith("n/a"))).toBe(true);
  });

  it("health in one line", () => {
    expect(healthLines({ state: "stale", finishedAt: "2026-11-15T17:00:00.000Z", ageMinutes: 61, lastStatus: "ok", staleAfterMinutes: 45 })).toEqual([
      "Heartbeat: stale. Last run finished 2026-11-15T17:00:00.000Z (61 min ago), status ok. Counts as stale after 45 min.",
    ]);
  });
});

describe("a whole invocation", () => {
  it("runs once, prints the run, exits 0, and the phrase appears in nothing printed", async () => {
    const w = world(() => json(RUN));
    const code = await main([], ENV, w.fetchImpl, w.print);
    expect(code).toBe(0);
    expect(w.calls).toHaveLength(1);
    expect(w.calls[0].url.href).toBe(`${DEFAULT_BASE}/api/anytime/run`);
    expect((w.calls[0].init.headers as Record<string, string>)["x-pl-sync"]).toBe(PHRASE);
    expect(w.calls[0].init.signal).toBeInstanceOf(AbortSignal);
    expect(w.lines.join("\n")).toContain("New picks: 1");
    expect(w.lines.join("\n")).not.toContain(PHRASE);
  });

  it("redacts the phrase even when the server or an error echoes it back", async () => {
    const echo = world(() => json({ status: "failed", errors: [`bad header ${PHRASE}`] }, 500));
    expect(await main(["--json"], ENV, echo.fetchImpl, echo.print)).toBe(1);
    expect(echo.lines.join("\n")).toContain("[redacted]");
    expect(echo.lines.join("\n")).not.toContain(PHRASE);

    const down = world(() => {
      throw new Error(`connect failed with ${PHRASE}`);
    });
    expect(await main([], ENV, down.fetchImpl, down.print)).toBe(3);
    expect(down.lines.join("\n")).not.toContain(PHRASE);
  });

  it("exit codes: partial and busy 0, failed 1, refused 2, unreachable 3", async () => {
    const codeOf = async (res: () => Response, argv: string[] = [], env: Record<string, string> = ENV) => {
      const w = world(res);
      return main(argv, env, w.fetchImpl, w.print);
    };
    expect(await codeOf(() => json({ status: "partial", errors: ["cfb: ESPN 500"] }))).toBe(0);
    expect(await codeOf(() => json({ status: "busy" }))).toBe(0);
    expect(await codeOf(() => json({ ok: false, status: "failed", errors: ["x"] }, 500))).toBe(1);
    expect(await codeOf(() => new Response("<html>", { status: 502 }))).toBe(1);
    expect(await codeOf(() => json({ ok: false, error: "sync phrase or cron key required" }, 401))).toBe(2);
    expect(await codeOf(() => json({ ok: false, error: "anytime unavailable", missing: ["store"] }, 503))).toBe(2);
    expect(await codeOf(() => json({ ok: false, error: "force must be 1 or 0" }, 400))).toBe(2);
    expect(await codeOf(() => json({ ok: true, state: "ok" }), ["--health"], {})).toBe(0);
    expect(await codeOf(() => json({ ok: false, state: "stale" }, 503), ["--health"], {})).toBe(1);
    expect(await codeOf(() => json({ ok: true, report: {} }), ["--report"])).toBe(0);
  });

  it("with no phrase, or a bad argument, or an http base, it makes no request at all", async () => {
    for (const [argv, env] of [
      [[], {}],
      [[], { PL_SYNC: "   " }],
      [["--nope"], ENV],
      [[PHRASE], ENV],
      [["--base", "http://example.test"], ENV],
    ] as [string[], Record<string, string>][]) {
      const w = world(() => json(RUN));
      expect(await main(argv, env, w.fetchImpl, w.print)).toBe(2);
      expect(w.calls).toHaveLength(0);
      expect(w.lines.join("\n")).not.toContain(PHRASE);
    }
  });

  it("--help prints usage and calls nothing", async () => {
    const w = world(() => json(RUN));
    expect(await main(["--help"], {}, w.fetchImpl, w.print)).toBe(0);
    expect(w.calls).toHaveLength(0);
    expect(w.lines.join("\n")).toContain("read -s PL_SYNC");
  });
});

describe("the tool file, as source", () => {
  const src = readFileSync("tools/run-picks.mjs", "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("reads the phrase from the environment only, and names no other secret", () => {
    expect(code.match(/env\.PL_SYNC/g)!.length).toBeGreaterThan(0);
    expect(code).not.toMatch(/CRON_SECRET|ODDS_API_KEY|LEDGER_SYNC_KEY|x-cron-key|apiKey/);
    expect(code).not.toMatch(/process\.argv\[[^1]/);
  });

  it("writes no file and does no raw Number() coercion", () => {
    expect(code).not.toMatch(/writeFile|appendFile|createWriteStream|node:fs/);
    expect(code).not.toMatch(/\bNumber\s*\(/);
  });

  it("puts the phrase in a header and never in a URL", () => {
    expect(code).not.toMatch(/searchParams\.set\([^)]*phrase/);
    expect(code).not.toMatch(/new URL\([^)]*phrase/);
    expect(code.match(/"x-pl-sync": phrase/g)).toHaveLength(2);
  });
});
