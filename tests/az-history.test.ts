import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { memoryKv } from "@/lib/anytime/kv";
import { dollars, historyBookRows, historyDeskRows, historyNote, type HistoryData } from "@/lib/anytime/view";
import { historyLine, summarizeHistory, tagEntries, tagHistory, ticketBookOf, type HistorySource } from "@/lib/az/history";
import { ledgerStats } from "@/lib/ledger-stats";
import { handleReport, type Access } from "@/lib/server/anytime";
import { HISTORY_KEYS, historyReader, sourceOf } from "@/lib/server/anytime-history";
import type { LedgerEntry } from "@/lib/useLedger";
// @ts-expect-error — a plain .mjs tool with no type declarations
import { DEFAULT_BASE, historyLines, main, parseArgs, requestOf } from "../tools/run-picks.mjs";

/* EVERY OLD PICK TAGGED WITH ITS BOOK, AND NONE OF THEM COUNTED.
   Invented tickets only; no store, no network. The only secret here is the test phrase. */

const PHRASE = "test-phrase";
const PERSON: Access = { store: true, syncSet: true, cronSet: true, sync: true, cron: false };

type T = { id: string; stake: number; settlementBook?: string; legs?: { settlementBook?: string }[]; bucket?: string; name?: string };
const tk = (id: string, stake: number, over: Partial<T> = {}): T => ({ id, stake, bucket: "core", name: id, legs: [{}], ...over });
const day = (date: string, core: T[], grades: Record<string, { result: string; payout?: number }>, over: Record<string, unknown> = {}) => ({
  date, locked: true, daily: 150, fun: 25, core, funT: [] as T[], grading: { tickets: grades, legs: {}, done: true }, ...over,
});

/* an MLB ledger that crosses the 2026-09-17 book change */
const MLB = [
  day("2026-09-15", [tk("a1", 50), tk("a2", 50), tk("a3", 25)], { a1: { result: "won", payout: 120 }, a2: { result: "lost", payout: 0 }, a3: { result: "push", payout: 25 } }),
  day("2026-09-16", [tk("b1", 40)], { b1: { result: "lost", payout: 0 } }),
  day("2026-09-17", [tk("c1", 60), tk("c2", 30)], { c1: { result: "won", payout: 110 }, c2: { result: "pending", payout: 0 } }),
  day("2026-10-06", [tk("d1", 20, { settlementBook: "draftkings" }), tk("d2", 20, { settlementBook: "fanduel" })], { d1: { result: "lost", payout: 0 }, d2: { result: "won", payout: 39 } }),
];
const CFB = [
  { ...day("2026-09-12", [tk("f1", 100)], { f1: { result: "lost", payout: 0 } }), sport: "cfb" },
  { ...day("2026-10-10", [tk("f2", 100)], { f2: { result: "won", payout: 190.91 } }), sport: "cfb" },
];
const SOURCES: HistorySource[] = [
  { desk: "mlb", entries: MLB },
  { desk: "cfb", entries: CFB },
  { desk: "nfl", entries: [], missing: true },
  { desk: "mlb-era1", entries: [day("2026-07-20", [tk("e1", 25)], { e1: { result: "lost", payout: 0 } })] },
];

describe("the book on each old ticket", () => {
  const E = (date: string, over: Record<string, unknown> = {}) => ({ date, ...over });

  it("an unstamped ticket is at the old book through 2026-09-16 and at DraftKings from 2026-09-17", () => {
    expect(ticketBookOf({ id: "x" }, E("2026-09-16"))).toEqual({ book: "williamhill_us", legacy: true, inferred: true });
    expect(ticketBookOf({ id: "x" }, E("2026-09-17"))).toEqual({ book: "draftkings", legacy: false, inferred: true });
    expect(ticketBookOf({ id: "x" }, E("2026-07-01"))).toMatchObject({ legacy: true });
  });

  it("a stamp on the ticket decides, whatever the date says", () => {
    expect(ticketBookOf({ settlementBook: "fanduel" }, E("2026-08-01"))).toEqual({ book: "fanduel", legacy: false, inferred: false });
    expect(ticketBookOf({ settlementBook: "draftkings" }, E("2026-08-01"))).toEqual({ book: "draftkings", legacy: false, inferred: false });
    expect(ticketBookOf({ settlementBook: "betmgm" }, E("2026-10-01"))).toEqual({ book: "betmgm", legacy: true, inferred: false });
    /* the wrong case is not one of the two */
    expect(ticketBookOf({ settlementBook: "DraftKings" }, E("2026-10-01"))).toMatchObject({ legacy: true });
  });

  it("the ticket's stamp beats the day's, and the day's beats the date rule", () => {
    expect(ticketBookOf({ settlementBook: "fanduel" }, E("2026-10-01", { settlementBook: "draftkings" }))).toMatchObject({ book: "fanduel" });
    expect(ticketBookOf({}, E("2026-08-01", { settlementBook: "draftkings" }))).toEqual({ book: "draftkings", legacy: false, inferred: false });
    expect(ticketBookOf({}, E("2026-10-01", { settlementBook: "williamhill_us" }))).toEqual({ book: "williamhill_us", legacy: true, inferred: false });
  });

  it("legs that all name one book tag the ticket; legs that disagree make it mixed, which is legacy", () => {
    expect(ticketBookOf({ legs: [{ settlementBook: "fanduel" }, { settlementBook: "fanduel" }] }, E("2026-08-01"))).toEqual({ book: "fanduel", legacy: false, inferred: false });
    expect(ticketBookOf({ legs: [{ settlementBook: "draftkings" }, { settlementBook: "fanduel" }] }, E("2026-10-01"))).toEqual({ book: "mixed", legacy: true, inferred: false });
    /* one stamped leg beside an unstamped one proves nothing about the ticket: fall back to the day */
    expect(ticketBookOf({ legs: [{ settlementBook: "fanduel" }, {}] }, E("2026-10-01"))).toEqual({ book: "draftkings", legacy: false, inferred: true });
  });
});

describe("the tagged tickets", () => {
  const picks = tagEntries("mlb", MLB);
  const by = (id: string) => picks.find((p) => p.id === id)!;

  it("tags every ticket and drops none", () => {
    expect(picks.map((p) => p.id)).toEqual(["a1", "a2", "a3", "b1", "c1", "c2", "d1", "d2"]);
    expect(picks.filter((p) => p.legacy).map((p) => p.id)).toEqual(["a1", "a2", "a3", "b1"]);
    expect(by("c1")).toMatchObject({ book: "draftkings", legacy: false, inferred: true, date: "2026-09-17", desk: "mlb" });
    expect(by("d2")).toMatchObject({ book: "fanduel", legacy: false, inferred: false });
  });

  it("a win returns its stored payout, a loss nothing, a push the stake; an open ticket has no profit", () => {
    expect(by("a1")).toMatchObject({ result: "won", returned: 120, profit: 70 });
    expect(by("a2")).toMatchObject({ result: "lost", returned: 0, profit: -50 });
    expect(by("a3")).toMatchObject({ result: "push", returned: 25, profit: 0 });
    expect(by("c2")).toMatchObject({ result: "open", returned: null, profit: null });
    const odd = tagEntries("mlb", [day("2026-10-01", [tk("u1", 10), tk("u2", 10)], { u1: { result: "ungradable" } })]);
    expect(odd.map((p) => [p.result, p.profit])).toEqual([["ungradable", null], ["open", null]]);
  });

  it("adds up to exactly what the Ledger page shows for the same days", () => {
    const page = ledgerStats(MLB as unknown as LedgerEntry[], "all");
    const line = historyLine("all", picks);
    const last = page.days[page.days.length - 1];
    expect(line.profit).toBe(last.cumPl);
    expect(line.staked).toBe(page.days.reduce((s, d) => s + d.staked, 0));
    expect([line.won, line.lost, line.push]).toEqual([page.days.reduce((s, d) => s + d.w, 0), page.days.reduce((s, d) => s + d.l, 0), page.days.reduce((s, d) => s + d.p, 0)]);
    /* by hand: staked 50+50+25+40+60+20+20 = 265; returned 120+0+25+0+110+0+39 = 294 */
    expect(line).toMatchObject({ picks: 8, graded: 7, open: 1, staked: 265, returned: 294, profit: 29 });
    expect(line.roi).toBeCloseTo(29 / 265, 12);
  });

  it("skips what is not a ticket instead of guessing, and never throws on a damaged ledger", () => {
    expect(tagEntries("mlb", null)).toEqual([]);
    expect(tagEntries("mlb", "gz1:AAAA")).toEqual([]);
    expect(tagEntries("mlb", [null, 7, { date: "" }, { core: [tk("z", 5)] }, { date: "2026-10-01", core: [null, { stake: 5 }, tk("ok", 5)], funT: "x" }]).map((p) => p.id)).toEqual(["ok"]);
    /* a ticket with no readable stake is listed and tagged, but adds no dollars */
    const noStake = tagEntries("mlb", [day("2026-10-01", [{ id: "s1" } as unknown as T], { s1: { result: "won", payout: 50 } })]);
    expect(noStake[0]).toMatchObject({ result: "won", returned: null, profit: null });
    expect(historyLine("x", noStake)).toMatchObject({ picks: 1, graded: 1, won: 1, unpriced: 1, staked: 0, profit: 0, roi: null });
  });

  it("changes nothing it reads", () => {
    const before = JSON.stringify(SOURCES);
    const frozen = JSON.parse(before, (_k, v) => (v && typeof v === "object" ? Object.freeze(v) : v)) as HistorySource[];
    expect(() => summarizeHistory(frozen)).not.toThrow();
    summarizeHistory(SOURCES);
    expect(JSON.stringify(SOURCES)).toBe(before);
  });
});

describe("the summary", () => {
  const s = summarizeHistory(SOURCES);

  it("splits every ticket into legacy or two-book, with nothing in both and nothing left out", () => {
    expect(s.picks).toBe(11);
    expect(s.legacy.picks + s.twoBook.picks).toBe(s.picks);
    expect(s.legacy.picks).toBe(6); // a1 a2 a3 b1 (MLB), f1 (CFB 09-12), e1 (first era)
    expect(s.twoBook.picks).toBe(5); // c1 c2 d1 d2 (MLB), f2 (CFB 10-10)
    expect(s.byBook.map((b) => [b.book, b.legacy, b.picks])).toEqual([["williamhill_us", true, 6], ["draftkings", false, 4], ["fanduel", false, 1]]);
    expect(s.byBook.reduce((n, b) => n + b.picks, 0)).toBe(s.picks);
  });

  it("keeps the legacy money apart from the two-book money", () => {
    /* legacy: staked 50+50+25+40+100+25 = 290, returned 120+0+25+0+0+0 = 145 */
    expect(s.legacy).toMatchObject({ staked: 290, returned: 145, profit: -145, won: 1, lost: 4, push: 1, from: "2026-07-20", to: "2026-09-16" });
    /* two-book: staked 60+20+20+100 = 200, returned 110+0+39+190.91 = 339.91 */
    expect(s.twoBook).toMatchObject({ staked: 200, returned: 339.91, profit: 139.91, won: 3, lost: 1, open: 1, from: "2026-09-17", to: "2026-10-10" });
    expect(s.legacy.profit + s.twoBook.profit).toBeCloseTo(historyLine("all", tagHistory(SOURCES)).profit, 9);
  });

  it("reports each desk, and says which stored ledger was missing or unreadable", () => {
    expect(s.byDesk.map((d) => [d.desk, d.picks, d.legacy.picks, d.twoBook.picks])).toEqual([["mlb", 8, 4, 4], ["cfb", 2, 1, 1], ["nfl", 0, 0, 0], ["mlb-era1", 1, 1, 0]]);
    expect(s.sources).toEqual([
      { desk: "mlb", state: "read", days: 4, picks: 8 },
      { desk: "cfb", state: "read", days: 2, picks: 2 },
      { desk: "nfl", state: "missing", days: 0, picks: 0 },
      { desk: "mlb-era1", state: "read", days: 1, picks: 1 },
    ]);
    expect(summarizeHistory([{ desk: "mlb", entries: [], unreadable: true }]).sources[0].state).toBe("unreadable");
  });
});

describe("reading the stored ledgers", () => {
  it("tells absent from unreadable: an unreadable blob is a fault, never an empty ledger", () => {
    expect(sourceOf("mlb", null)).toEqual({ desk: "mlb", entries: [], missing: true });
    expect(sourceOf("mlb", "")).toEqual({ desk: "mlb", entries: [], missing: true });
    expect(sourceOf("mlb", "{not json")).toEqual({ desk: "mlb", entries: [], unreadable: true });
    expect(sourceOf("mlb", JSON.stringify({ epoch: 2 }))).toEqual({ desk: "mlb", entries: [], unreadable: true });
    expect(sourceOf("mlb", JSON.stringify({ ledger: MLB, epoch: 2, at: 1 })).entries).toHaveLength(4);
    expect(sourceOf("cfb", JSON.stringify(CFB)).entries).toHaveLength(2);
    expect(sourceOf("mlb", { ledger: MLB }).entries).toHaveLength(4);
  });

  it("asks the store for the four ledgers, once each, and for nothing else", async () => {
    const asked: string[] = [];
    const read = historyReader(async (key) => {
      asked.push(key);
      return key === "pl:ledger:v1" ? JSON.stringify({ ledger: MLB }) : key === "pl:cfb:ledger:v1" ? "{broken" : null;
    });
    const sources = await read();
    expect(asked.sort()).toEqual(["pl:cfb:ledger:v1", "pl:ledger:archive:e1", "pl:ledger:v1", "pl:nfl:ledger:v1"]);
    expect(Object.values(HISTORY_KEYS).sort()).toEqual(asked);
    expect(sources.map((s) => [s.desk, !!s.missing, !!s.unreadable, (s.entries as unknown[]).length])).toEqual([["mlb", false, false, 4], ["cfb", false, true, 0], ["nfl", true, false, 0], ["mlb-era1", true, false, 0]]);
  });

  it("is read-only as source: one GET and no write command of any kind", () => {
    const code = readFileSync("src/lib/server/anytime-history.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code.match(/redis\(\[/g)).toHaveLength(1);
    expect(code).toMatch(/redis\(\["GET", key\]\)/);
    expect(code).not.toMatch(/"(SET|DEL|SETNX|MSET|EXPIRE|RENAME|LPUSH|SADD|SREM|INCR|INCRBY|UNLINK)"/i);
    expect(code).not.toMatch(/redisSetJson|fetch\(/);
    const pure = readFileSync("src/lib/az/history.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(pure).not.toMatch(/redis|fetch\(|localStorage|\bimport\b[^\n]*server/);
  });
});

describe("GET /api/anytime?history=", () => {
  const reader = (sources = SOURCES) => {
    const r = Object.assign(async () => { r.calls++; return sources; }, { calls: 0 });
    return r;
  };

  it("adds the tagged history beside the report, marked not counted", async () => {
    const read = reader();
    const r = await handleReport(PERSON, { history: "1" }, memoryKv(), 0, undefined, read);
    expect(r.status).toBe(200);
    const h = r.body.history as HistoryData & { counted: boolean; picks?: unknown };
    expect(h).toMatchObject({ ok: true, counted: false });
    expect(h.summary!.picks).toBe(11);
    expect(h.names).toEqual({ williamhill_us: "Caesars", draftkings: "DraftKings", fanduel: "FanDuel" });
    expect(h.picks).toBeUndefined();
    expect(read.calls).toBe(1);
  });

  it("lists every tagged ticket only when asked for all", async () => {
    const r = await handleReport(PERSON, { history: "all" }, memoryKv(), 0, undefined, reader());
    const picks = (r.body.history as { picks: { id: string; book: string; legacy: boolean }[] }).picks;
    expect(picks).toHaveLength(11);
    expect(picks.every((p) => typeof p.book === "string" && typeof p.legacy === "boolean")).toBe(true);
  });

  it("never lets an old ticket into the record: the report is identical with and without history", async () => {
    const kv = memoryKv();
    const plain = await handleReport(PERSON, {}, kv, 0, undefined, reader());
    const withH = await handleReport(PERSON, { history: "all" }, kv, 0, undefined, reader());
    expect(plain.body.history).toBeUndefined();
    expect(withH.body.report).toEqual(plain.body.report);
    expect(withH.body.count).toBe(0);
    expect((withH.body.report as { byBook: { combined: { picks: number } } }).byBook.combined.picks).toBe(0);
    expect(Object.keys((withH.body.report as { byBook: object }).byBook).sort()).toEqual(["combined", "draftkings", "fanduel"]);
  });

  it("does not read the older ledgers unless asked, or for a caller without the phrase", async () => {
    const read = reader();
    await handleReport(PERSON, {}, memoryKv(), 0, undefined, read);
    await handleReport(PERSON, { history: "" }, memoryKv(), 0, undefined, read);
    expect(read.calls).toBe(0);
    expect(await handleReport({ ...PERSON, sync: false }, { history: "1" }, memoryKv(), 0, undefined, read)).toEqual({ status: 401, body: { error: "bad-sync-key" } });
    expect(read.calls).toBe(0);
  });

  it("refuses an unknown history value", async () => {
    const read = reader();
    for (const bad of ["2", "yes", "true", "ALL"]) expect(await handleReport(PERSON, { history: bad }, memoryKv(), 0, undefined, read)).toEqual({ status: 400, body: { error: "history must be 1 or all" } });
    expect(read.calls).toBe(0);
  });

  it("a failed history read is reported and does not sink the report", async () => {
    const r = await handleReport(PERSON, { history: "1" }, memoryKv(), 0, undefined, async () => { throw new Error("store 403"); });
    expect(r.status).toBe(200);
    expect(r.body.history).toEqual({ ok: false, error: "history unreadable: store 403" });
    expect(r.body.report).toBeTruthy();
    const none = await handleReport(PERSON, { history: "1" }, memoryKv(), 0);
    expect(none.body.history).toEqual({ ok: false, error: "history reader not wired" });
  });

  it("the route passes the live reader and the history flag", () => {
    const route = readFileSync("app/api/anytime/route.ts", "utf8");
    expect(route).toMatch(/history: q\.get\("history"\)/);
    expect(route).toMatch(/handleReport\(accessOf\(req\), ask, upstashKv\(\), Date\.now\(\), undefined, historyReader\(\)\)/);
  });
});

describe("what the page shows", () => {
  const h: HistoryData = { ok: true, summary: summarizeHistory(SOURCES), names: { williamhill_us: "Caesars", draftkings: "DraftKings", fanduel: "FanDuel" } };

  it("formats dollars with a sign, and the dash for nothing", () => {
    expect(dollars(12.5)).toBe("+$12.50");
    expect(dollars(-376.91)).toBe("−$376.91");
    expect(dollars(0)).toBe("$0.00");
    expect(dollars(null)).toBe("—");
    expect(dollars(NaN)).toBe("—");
  });

  it("one row per book, legacy first and labelled not counted", () => {
    const rows = historyBookRows(h);
    expect(rows.map((r) => [r.name, r.legacy, r.tag])).toEqual([
      ["Caesars", true, "legacy · not counted"],
      ["DraftKings", false, "older desks · listed, not added in"],
      ["FanDuel", false, "older desks · listed, not added in"],
    ]);
    expect(rows[0]).toMatchObject({ picks: 6, record: "1-4-1", staked: "$290.00", profit: "−$145.00", roi: "−50.0%", dates: "2026-07-20 to 2026-09-16", how: "book from the ticket's date", tone: "neg" });
    expect(rows[2]).toMatchObject({ picks: 1, record: "1-0", profit: "+$19.00", dates: "2026-10-06", how: "book stamped on every ticket", tone: "pos" });
    expect(rows[1].how).toBe("book from the ticket's date on 3 of 4");
  });

  it("desk rows split each desk into its legacy and two-book parts, skipping empty ones", () => {
    expect(historyDeskRows(h).map((r) => [r.key, r.picks])).toEqual([["mlb:legacy", 4], ["mlb:two-book", 4], ["cfb:legacy", 1], ["cfb:two-book", 1], ["mlb-era1:legacy", 1]]);
  });

  it("the note counts both parts and shouts about an unreadable ledger", () => {
    expect(historyNote(h)).toEqual({ tone: "muted", text: "11 older tickets: 6 legacy (another book), 5 at DraftKings or FanDuel. Nothing stored for: NFL." });
    const bad = historyNote({ ok: true, summary: summarizeHistory([{ desk: "mlb", entries: [], unreadable: true }]) });
    expect(bad.tone).toBe("neg");
    expect(bad.text).toMatch(/UNREADABLE, not counted as empty: MLB\./);
    expect(historyNote({ ok: false, error: "history unreadable: store 403" })).toEqual({ tone: "neg", text: "Couldn't read the older ledgers: history unreadable: store 403." });
    expect(historyNote(null).text).toBe("Not loaded.");
    expect(historyBookRows(null)).toEqual([]);
  });

  it("the page loads history only from its button, with the phrase in the header", () => {
    const code = readFileSync("app/anytime/page.tsx", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).toMatch(/fetch\("\/api\/anytime\?limit=0&history=1", \{ headers: sync\(\), cache: "no-store" \}\)/);
    expect(code.match(/loadHistory\(\)/g)).toHaveLength(1);
    expect(code).toMatch(/onClick=\{\(\) => void loadHistory\(\)\}/);
    expect(code.match(/history=/g)).toHaveLength(1);
    expect(code).toMatch(/historyBookRows\(state\.history\)/);
    expect(code).toMatch(/not counted above/);
    /* the record cards still come from the report alone */
    expect(code).toMatch(/bookRows\(data\.report\)\.map/);
  });
});

describe("the command line", () => {
  const body = { ok: true, history: { ok: true, counted: false, summary: summarizeHistory(SOURCES), names: { williamhill_us: "Caesars", draftkings: "DraftKings", fanduel: "FanDuel" } } };

  it("--history asks for the summary; with --json, for every tagged ticket", () => {
    const a = requestOf(parseArgs(["--history"]), DEFAULT_BASE, PHRASE);
    expect(a.url.pathname + a.url.search).toBe("/api/anytime?limit=0&history=1");
    expect(a.init).toEqual({ method: "GET", headers: { "x-pl-sync": PHRASE }, cache: "no-store" });
    expect(a.url.href).not.toContain(PHRASE);
    expect(requestOf(parseArgs(["--history", "--json"]), DEFAULT_BASE, PHRASE).url.search).toBe("?limit=0&history=all");
    expect(() => requestOf(parseArgs(["--history"]), DEFAULT_BASE, "")).toThrow(/PL_SYNC is not set/);
  });

  it("prints each book with LEGACY or two-book, dollars beside ROI", () => {
    const lines: string[] = historyLines(body);
    expect(lines[0]).toMatch(/none of this is in the any-time record\): 11 tickets\./);
    expect(lines[1]).toMatch(/^  Caesars\s+LEGACY\s+6 tickets  1-4-1  staked \$290\.00  profit -\$145\.00  ROI -50\.0%  2026-07-20 to 2026-09-16$/);
    expect(lines[2]).toMatch(/^  DraftKings\s+two-book\s+4 tickets/);
    expect(lines.find((l) => l.includes("All legacy"))).toMatch(/LEGACY\s+6 tickets/);
    expect(lines.find((l) => l.includes("All DK + FD"))).toMatch(/profit \+\$139\.91/);
    expect(lines[lines.length - 1]).toBe("  nfl: nothing stored");
    expect(historyLines({ history: { ok: false, error: "history unreadable: store 403" } })).toEqual(["ERROR: history unreadable: store 403"]);
    expect(historyLines({})).toEqual(["The server sent no history."]);
  });

  it("a whole --history invocation makes one GET and never prints the phrase", async () => {
    const calls: { url: URL; init: RequestInit }[] = [];
    const lines: string[] = [];
    const fetchImpl = async (url: URL, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    };
    expect(await main(["--history"], { PL_SYNC: PHRASE }, fetchImpl, (s: string) => lines.push(s))).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe("GET");
    expect(lines.join("\n")).not.toContain(PHRASE);
    expect(lines.length).toBeGreaterThan(4);
  });
});
