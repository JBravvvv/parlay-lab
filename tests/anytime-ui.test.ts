import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { decide } from "@/lib/anytime/engine";
import type { LedgerRow } from "@/lib/anytime/ledger";
import { clvAtOwnBook, reportOf } from "@/lib/anytime/report";
import type { Candidate, CloseRecord, GradeResult, Trigger } from "@/lib/anytime/types";
import { BOOK_ORDER, DASH, SPLITS, ago, american, bookRows, calRows, interval, pct, pickView, prob, recordRow, runLine, splitRows, statusOf, units } from "@/lib/anytime/view";
import { excludedBy } from "@/lib/az/exclusions";
import { cand, T0 } from "./helpers/anytime";

/**
 * WHAT THE /anytime PAGE SHOWS. Two things are held:
 *   1. every figure on screen equals a from-scratch recomputation of the raw ledger rows, done
 *      here by hand, and the per-pick profits listed add up to the total shown;
 *   2. the page calls the engine the same way every other trigger does (header only, never a URL),
 *      asks before a void, and always shows the three books with profit beside ROI.
 */

let seq = 0;
type Extra = { gradedAt?: string; close?: CloseRecord["books"]; voided?: boolean; trigger?: Trigger; reason?: string; detail?: string };
function row(over: Partial<Candidate>, result: GradeResult | null, extra: Extra = {}): LedgerRow {
  seq++;
  const pick = decide({ candidates: [cand({ eventId: `u${seq}`, ...over })], now: T0, runId: "r", trigger: extra.trigger ?? "manual-ui", families: new Map(), excluded: excludedBy(), kellyBankroll: 100, kellyOpenByEvent: new Map() }).picks[0];
  if (!pick) throw new Error("fixture produced no pick");
  return {
    pick,
    grade: result ? { id: pick.id, result, gradedAt: extra.gradedAt ?? "2026-11-16T02:00:00Z", source: "espn", ...(extra.reason ? { reason: extra.reason } : {}), ...(extra.detail ? { detail: extra.detail } : {}) } : null,
    close: extra.close ? { id: pick.id, at: "2026-11-15T21:20:00Z", snapshotId: "s", books: extra.close, fairP: null, fairN: 2, final: true } : null,
    void: extra.voided ? { id: pick.id, reason: "not_available_az", at: "2026-11-15T18:00:00Z", by: "ui" } : null,
  };
}
const DK_120 = { model: { win: 0.5, push: 0 }, quotes: { draftkings: { price: 120, opp: -140 }, fanduel: { price: 115, opp: -135 } } };
const DK_108 = { quotes: { draftkings: { price: -108, opp: -112 }, fanduel: { price: -110, opp: -110 } } };
const FD_150 = { model: { win: 0.45, push: 0 }, quotes: { draftkings: { price: 140, opp: -170 }, fanduel: { price: 150, opp: -180 } } };

function ledger() {
  const a = row({}, "won", { gradedAt: "2026-11-16T01:00:00Z", detail: "Home 27, Away 20", close: { fanduel: { price: -115, opp: -105, line: -2.5 }, draftkings: { price: -118, opp: -102, line: -2.5 } } });
  const b = row(DK_120, "lost", { gradedAt: "2026-11-16T02:00:00Z", trigger: "cron" });
  const c = row(DK_108, "push", { gradedAt: "2026-11-16T03:00:00Z", trigger: "cron" });
  const d = row(FD_150, "won", { gradedAt: "2026-11-16T04:00:00Z", trigger: "event:line-move" });
  const e = row({}, null, { close: { fanduel: { price: -110, opp: -110, line: -3 } } });
  const f = row({}, "won", { voided: true });
  const g = row({}, "void", { reason: "postponed" });
  return { a, b, c, d, e, f, g, rows: [a, b, c, d, e, f, g] };
}

describe("the formatters", () => {
  it("units, percentages, probabilities and American odds carry their sign, and a true minus", () => {
    expect([units(1.25), units(-0.4), units(0), units(-0.001)]).toEqual(["+1.25u", "−0.40u", "0.00u", "0.00u"]);
    expect([pct(0.074), pct(-0.2), pct(0), pct(0.0123, 2)]).toEqual(["+7.4%", "−20.0%", "0.0%", "+1.23%"]);
    expect(prob(0.512)).toBe("51.2%");
    expect([american(-105), american(120)]).toEqual(["−105", "+120"]);
    expect(interval({ mean: 0.021, lo: -0.06, hi: 0.102, n: 41 })).toBe("+2.1% (−6.0% to +10.2%, n 41)");
  });

  it("absent is the dash, never zero", () => {
    for (const f of [units, pct, prob, american]) for (const v of [null, undefined, NaN, "3", Infinity]) expect(f(v)).toBe(DASH);
    expect(interval(null)).toBe(DASH);
  });

  it("time since, in words", () => {
    const now = Date.parse("2026-11-15T17:00:00Z");
    expect(ago("2026-11-15T16:59:50Z", now)).toBe("just now");
    expect(ago("2026-11-15T16:48:00Z", now)).toBe("12 min ago");
    expect(ago("2026-11-15T14:00:00Z", now)).toBe("3 h ago");
    expect(ago("2026-11-12T17:00:00Z", now)).toBe("3 d ago");
    expect(ago(null, now)).toBe(DASH);
    expect(ago("not a date", now)).toBe(DASH);
  });
});

describe("the record on screen equals the raw ledger, recomputed by hand", () => {
  const L = ledger();
  const rep = reportOf(L.rows, T0);
  const rows = bookRows(rep);

  it("always three rows: DraftKings, FanDuel, Combined", () => {
    expect(BOOK_ORDER).toEqual(["draftkings", "fanduel", "combined"]);
    expect(rows.map((r) => r.name)).toEqual(["DraftKings", "FanDuel", "Combined"]);
    expect(bookRows(reportOf([], T0)).map((r) => r.name)).toEqual(["DraftKings", "FanDuel", "Combined"]);
  });

  it("FanDuel: two wins at −105 and +150", () => {
    const profit = 100 / 105 + 1.5;
    expect(rows[1]).toMatchObject({ picks: 3, graded: 2, open: 1, record: "2-0", flatProfit: units(profit), flatRoi: pct(profit / 2), tone: "pos" });
    expect(rows[1].flatProfit).toBe("+2.45u");
    expect(rows[1].flatRoi).toBe("+122.6%");
  });

  it("DraftKings: a loss at +120 and a push at −108", () => {
    expect(rows[0]).toMatchObject({ picks: 2, graded: 2, open: 0, record: "0-1-1", flatProfit: "−1.00u", flatRoi: "−50.0%", tone: "neg" });
  });

  it("Combined is the two books together, and the voided picks are in neither", () => {
    const profit = 100 / 105 + 1.5 - 1;
    expect(rows[2]).toMatchObject({ picks: 5, graded: 4, open: 1, record: "2-1-1", flatProfit: units(profit), flatRoi: pct(profit / 4) });
    expect(rows[0].picks + rows[1].picks).toBe(rows[2].picks);
    expect(rep.voided).toBe(2);
  });

  it("the per-pick profits listed add up to the total shown", () => {
    const shown = L.rows.map(pickView);
    const parse = (s: string) => (s === DASH ? 0 : Number(s.replace("−", "-").replace("u", "")));
    const sum = shown.reduce((a, v) => a + parse(v.profit), 0);
    expect(Math.abs(sum - parse(rows[2].flatProfit))).toBeLessThan(0.011);
    /* and exactly, from the stored prices alone */
    expect(shown.map((v) => v.profit)).toEqual(["+0.95u", "−1.00u", "0.00u", "+1.50u", DASH, DASH, DASH]);
  });

  it("Kelly profit is the stored stakes times the same returns", () => {
    const { a, b, c, d } = L;
    const kelly = a.pick.stakeKelly * (100 / 105) - b.pick.stakeKelly + 0 * c.pick.stakeKelly + d.pick.stakeKelly * 1.5;
    expect(rows[2].kellyProfit).toBe(units(kelly));
    expect(rows[2].kellyRoi).toBe(pct(kelly / (a.pick.stakeKelly + b.pick.stakeKelly + c.pick.stakeKelly + d.pick.stakeKelly)));
  });

  it("a book with nothing graded shows dashes, not zeros", () => {
    const empty = bookRows(reportOf([row({}, null)], T0))[1];
    expect(empty).toMatchObject({ picks: 1, graded: 0, flatProfit: DASH, flatRoi: DASH, flatRoiRange: DASH, kellyProfit: DASH, kellyRoi: DASH, clv: DASH, beatClose: DASH, drawdown: DASH, tone: "muted" });
  });

  it("the splits use the same row, and every split the page offers exists on the report", () => {
    for (const s of SPLITS) expect(Array.isArray(rep[s.key])).toBe(true);
    const byTrigger = splitRows(rep.byTrigger);
    expect(byTrigger.map((r) => r.key).sort()).toEqual(["cron", "event:line-move", "manual-ui"]);
    expect(byTrigger.reduce((a, r) => a + r.picks, 0)).toBe(rows[2].picks);
    expect(splitRows(undefined)).toEqual([]);
    const cron = rep.byTrigger.find((s) => s.key === "cron")!;
    expect(byTrigger.find((r) => r.key === "cron")).toEqual(recordRow("cron", "cron", cron.stats));
  });

  it("calibration rows: only buckets that hold picks, with the gap actual minus predicted", () => {
    const cal = calRows(rep.calibration.model);
    expect(cal.reduce((a, b) => a + b.n, 0)).toBe(3); // won, lost, won: a push is not a decided pick
    for (const b of cal) expect(b.n).toBeGreaterThan(0);
    expect(calRows([{ lo: 0.5, hi: 0.55, n: 4, predicted: 0.52, actual: 0.75 }])).toEqual([{ range: "50–55%", n: 4, predicted: "52.0%", actual: "75.0%", gap: "+23.0%" }]);
    expect(calRows(undefined)).toEqual([]);
  });
});

describe("one pick on screen", () => {
  const L = ledger();

  it("names the book it was taken at, with the other book's price beside it", () => {
    const v = pickView(L.a);
    expect(v.taken).toBe("FanDuel −105");
    expect(v.other).toBe("DraftKings −110");
    expect(v.sport).toBe("NFL");
    expect(v.model).toBe("55.0%");
    expect(v.stake).toBe(`1u flat · ${L.a.pick.stakeKelly.toFixed(2)}u Kelly`);
    expect(v.marketType).toBe("nfl:spread");
    const alone = row({ quotes: { fanduel: { price: -105, opp: -115 } } }, null);
    expect(pickView(alone).other).toBe("DraftKings: not offered");
  });

  it("status and the line under it", () => {
    expect(L.rows.map(statusOf)).toEqual(["won", "lost", "push", "won", "open", "void", "void"]);
    expect(pickView(L.a).statusLine).toBe("won · Home 27, Away 20");
    expect(pickView(L.e).statusLine).toBe("open");
    expect(pickView(L.f).statusLine).toBe("void · not available in AZ");
    expect(pickView(L.g).statusLine).toBe("void · postponed past the book's window");
  });

  it("a voided pick shows no profit even though it was graded won, and cannot be voided twice", () => {
    const v = pickView(L.f);
    expect(v.profit).toBe(DASH);
    expect(v.canVoid).toBe(false);
    expect(pickView(L.g).canVoid).toBe(false);
    expect(pickView(L.a).canVoid).toBe(true);
    expect(pickView(L.e).canVoid).toBe(true);
  });

  it("closing line value is against the close at the pick's own book, or says why there is none", () => {
    /* taken at −105; FanDuel closed −115 / −105, so the close's own no-vig number is the yardstick */
    const own = clvAtOwnBook(L.a);
    expect(own.clv).not.toBeNull();
    expect(pickView(L.a).clv).toBe(`${pct(own.clv, 2)} vs FanDuel close`);
    expect(pickView(L.a).clv).toMatch(/^[+−]\d+\.\d\d% vs FanDuel close$/);
    expect(pickView(L.e).clv).toBe("line moved");
    expect(pickView(L.b).clv).toBe("close not stored yet");
  });

  it("says plainly whether the price or only the model is behind it", () => {
    const v = pickView(L.a);
    expect(["price: the two books' own number says it pays", "model only: the two-book market disagrees"]).toContain(v.basis);
    expect(v.modelKind).toMatch(/\((independent signal|market only)\)$/);
    expect(v.trigger).toBe("manual-ui");
    expect(pickView(L.d).trigger).toBe("event:line-move");
  });
});

describe("the line under the Run button", () => {
  const run = { status: "ok", picks: [{}, {}], graded: [{}], candidates: 84, odds: { credits: 3, remaining: 91000 }, errors: [] };

  it("a run that found picks", () => {
    expect(runLine(200, run)).toEqual({ tone: "pos", text: "2 new picks · 84 prices checked · 1 graded · 3 Odds credits" });
    expect(runLine(200, { ...run, picks: [{}], odds: { credits: 1 } }).text).toBe("1 new pick · 84 prices checked · 1 graded · 1 Odds credit");
  });

  it("a run that found nothing says so, and says what it cost", () => {
    expect(runLine(200, { status: "ok", picks: [], graded: [], candidates: 84, odds: null })).toEqual({ tone: "muted", text: "No new pick: nothing cleared the bar · 84 prices checked · no Odds call" });
  });

  it("busy, partial, failed, refused and unreadable each read differently", () => {
    expect(runLine(200, { status: "busy" }).text).toMatch(/Nothing was recorded twice/);
    expect(runLine(200, { ...run, status: "partial", errors: ["cfb: ESPN 500"] })).toMatchObject({ tone: "neg" });
    expect(runLine(200, { ...run, status: "partial", errors: ["cfb: ESPN 500"] }).text).toContain("partial: cfb: ESPN 500");
    expect(runLine(500, { status: "failed", errors: ["nfl: Odds API 401 for nfl"] })).toEqual({ tone: "neg", text: "Run failed: nfl: Odds API 401 for nfl" });
    expect(runLine(400, { error: "force must be 1 or 0" }).text).toBe("Run failed: force must be 1 or 0");
    expect(runLine(401, null).text).toMatch(/sync phrase/);
    expect(runLine(503, { error: "anytime unavailable" }).text).toMatch(/not configured/);
    expect(runLine(502, null).text).toBe("The server answered 502 with nothing readable.");
  });
});

describe("the page, as source", () => {
  const src = readFileSync("app/anytime/page.tsx", "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "");

  it("runs the engine with a POST, the phrase in x-pl-sync, recorded as manual-ui", () => {
    expect(code).toMatch(/fetch\("\/api\/anytime\/run", \{ method: "POST", headers: sync\(\{ "x-pl-trigger": "manual-ui" \}\), cache: "no-store" \}\)/);
    expect(code).toMatch(/const sync = \(extra[^)]*\) => \(\{ "x-pl-sync": getSyncKey\(\), \.\.\.extra \}\);/);
  });

  it("never puts the phrase in a URL, a body or storage, and never logs", () => {
    expect(code).not.toMatch(/[?&](key|sync|phrase|token|secret)=/);
    expect(code).not.toMatch(/JSON\.stringify\([^)]*getSyncKey/);
    expect(code).not.toMatch(/localStorage|sessionStorage|console\./);
    expect(code.match(/getSyncKey\(\)/g)!.length).toBe(3); // the header builder, and two "is there a phrase" checks
  });

  it("asks before a void, says it cannot be undone, and offers the pick-only choice", () => {
    expect(code).toMatch(/onClick=\{\(\) => setAsk\(true\)\}/);
    expect(code).toMatch(/This cannot be undone/);
    expect(code).toMatch(/onClick=\{\(\) => mark\(true\)\}/);
    expect(code).toMatch(/onClick=\{\(\) => mark\(false\)\}/);
    /* the write itself is only inside mark(), behind the confirmation */
    expect(code.match(/action: "not-in-az"/g)).toHaveLength(1);
    expect(code).toMatch(/JSON\.stringify\(\{ action: "not-in-az", id: v\.id, exclude \}\)/);
  });

  it("does no arithmetic on results: the figures come from the view model", () => {
    expect(code).toMatch(/bookRows\(data\.report\)\.map/);
    expect(code).toMatch(/splitRows\(report\[key\]\)/);
    expect(code).toMatch(/rows\.map\(pickView\)/);
    expect(code).not.toMatch(/\.reduce\(/);
    expect(code).not.toMatch(/flatProfit\s*[-+*/]|kellyProfit\s*[-+*/]|\/\s*s\.graded/);
  });

  it("shows profit beside ROI for every book, and says it is paper", () => {
    expect(code).toMatch(/label="Flat profit"[^\n]*\n\s*<Figure label="Flat ROI"/);
    expect(code).toMatch(/label="Kelly profit"[^\n]*\n\s*<Figure label="Kelly ROI"/);
    expect(src).toMatch(/nothing here is placed with real money/);
    expect(src).toMatch(/not betting advice/i);
  });

  it("follows the app's navigation rule: every Link replaces, nothing pushes", () => {
    const links = code.match(/<Link\b[^>]*>/g) ?? [];
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) expect(l).toMatch(/\breplace\b/);
    expect(code).not.toMatch(/router\.push\(|backdrop-blur|backdrop-filter/);
  });

  it("reloads on open and on return to the front, with no timer", () => {
    expect(code).toMatch(/document\.addEventListener\("visibilitychange", onShow\);/);
    expect(code).toMatch(/const onShow = \(\) => document\.visibilityState === "visible" && void refresh\(\);/);
    expect(code).toMatch(/useEffect\(\(\) => \{\s*void refresh\(\);/);
    expect(code).not.toMatch(/setInterval\(|setTimeout\(/);
  });

  it("is reachable from the Ledger with a replacing link, and from the run alert", () => {
    const ledger = readFileSync("app/ledger/page.tsx", "utf8");
    expect(ledger).toMatch(/<Link\s+replace\s+href="\/anytime"/);
    expect(ledger).toMatch(/<TakenLink \/>\s*<AnytimeLink \/>/);
    expect(readFileSync("src/lib/server/anytime-football.ts", "utf8")).toMatch(/url: "\/anytime"/);
  });
});
