import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildCfbBoard, coverProb, evPct, kellyStake, rowProbAt, sideLabel } from "@/lib/cfb/model";
import { CFB_MODEL } from "@/lib/cfb/rules";
import { ptDateOf, kickoffLabel, espnDateParam, nextDate } from "@/lib/cfb/dates";
import { normCdf } from "@/lib/cfb/normal";
import type { CfbBoard, CfbBuildInput, CfbGame } from "@/lib/cfb/types";

/**
 * THE CFB MODEL ON THE 2026-09-05 FIXTURES (INSTRUCTION 38). Every number asserted here is
 * either (a) a structural fact of the fixture (12 games, which books post what) or (b) a
 * hand-computed value from fixture prices: the reduced-book scenarios below name the exact
 * fixture prices they use and walk the arithmetic in comments, with the final figures
 * produced independently in Python (math.erfc + bisection) — not by the module under test.
 * These are FIXTURE figures, not production measurements.
 */

const FIX = path.join(process.cwd(), "tests", "fixtures", "cfb");
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8"));
const ESPN = readJson("espn-scoreboard-2026-09-05.json") as { events: unknown[] };
const ODDS = readJson("odds-ncaaf-2026-09-05.json") as Array<Record<string, unknown>>;
const FPI = readJson("espn-fpi.json") as unknown;
const NOW = Date.parse("2026-09-05T12:00:00Z");
const DATE = "2026-09-05";

function build(over: Partial<CfbBuildInput> = {}): CfbBoard {
  return buildCfbBoard({ date: DATE, espnEvents: ESPN.events, oddsEvents: ODDS, fpi: FPI, now: NOW, bankroll: 2500, ...over });
}
const game = (b: CfbBoard, homeAbbr: string): CfbGame => {
  const g = b.games.find((x) => x.home.abbr === homeAbbr);
  if (!g) throw new Error(`no game with home ${homeAbbr}`);
  return g;
};
const row = (g: CfbGame, label: string) => {
  const r = g.rows.find((x) => x.label === label);
  if (!r) throw new Error(`no row ${label} in ${g.away.abbr}@${g.home.abbr}: ${g.rows.map((x) => x.label).join(", ")}`);
  return r;
};
/** the fixture's odds event for a home team, with only the named books (and optionally only some markets) */
function reduced(homeTeam: string, books: string[], markets?: string[]): Record<string, unknown> {
  const ev = ODDS.find((e) => e.home_team === homeTeam);
  if (!ev) throw new Error(`no odds event for ${homeTeam}`);
  const bks = (ev.bookmakers as Array<{ key: string; markets: Array<{ key: string }> }>)
    .filter((b) => books.includes(b.key))
    .map((b) => ({ ...b, markets: markets ? b.markets.filter((m) => markets.includes(m.key)) : b.markets }));
  return { ...ev, bookmakers: bks };
}

describe("dates.ts", () => {
  it("Pacific dates, ESPN param, kickoff label, next date", () => {
    expect(ptDateOf("2026-09-06T02:00Z")).toBe("2026-09-05"); // 7 PM PT Saturday
    expect(ptDateOf("2026-09-06T08:00Z")).toBe("2026-09-06"); // 1 AM PT Sunday
    expect(espnDateParam("2026-09-05")).toBe("20260905");
    expect(nextDate("2026-09-30")).toBe("2026-10-01");
    expect(nextDate("2026-12-31")).toBe("2027-01-01");
    expect(kickoffLabel("2026-09-05T16:00Z")).toBe("Sat 9:00 AM");
    expect(kickoffLabel("2026-09-06T02:30Z")).toBe("Sat 7:30 PM");
  });
});

describe("the full fixture board — 12 games, 0 unmatched, every market priced", () => {
  const b = build();
  it("shapes the slate", () => {
    expect(b.date).toBe(DATE);
    expect(b.games).toHaveLength(12);
    expect(b.unmatched).toBe(0);
    expect(b.games.every((g) => g.oddsEventId != null)).toBe(true);
    expect(b.fpiUpdated).toBe("2026-09-04T08:00Z");
    expect(b.generatedAt).toBe(NOW);
    // the two 9/12 00:00Z odds events are 5 PM PT on 9/11
    expect(b.slateDates).toEqual(["2026-09-05", "2026-09-11"]);
    expect(b.games.map((g) => g.date).every((d) => d === DATE)).toBe(true);
    // sorted by kickoff: the two 16:30Z games last
    expect(b.games.slice(-2).map((g) => g.home.abbr).sort()).toEqual(["OSU", "PITT"]);
  });
  it("ESPN facts land on the game: status, ranks, records, TV, venue, ESPN line, FPI join", () => {
    const iu = game(b, "IU");
    expect(iu.id).toBe("401858425");
    expect(iu.status).toBe("upcoming");
    expect(iu.detail).toBe("Sat 9:00 AM");
    expect(iu.homeScore).toBeNull(); // pre-game "0" is not a score
    expect(iu.home.rank).toBe(6);
    expect(iu.away.rank).toBeNull(); // curatedRank 99 = unranked
    expect(iu.home.record).toBe("0-0");
    expect(iu.tv).toBe("FOX");
    expect(iu.venue).toBe("Memorial Stadium (Bloomington, IN)");
    expect(iu.neutral).toBe(false);
    expect(iu.espnLine).toEqual({ spread: -40.5, total: 56.5, details: "IU -40.5" });
    expect(iu.home.fpi).toBe(23.14);
    expect(iu.home.fpiRank).toBe(6);
    expect(iu.away.fpi).toBe(-6.401);
    expect(iu.home.logo).toBe("https://a.espncdn.com/i/teamlogos/ncaa/500/84.png");
    expect(iu.home.color).toBe("970310");
    expect(game(b, "OSU").home.rank).toBe(1);
    expect(game(b, "PITT").away.short).toBe("Miami OH");
  });
  it("FCS opponents have no FPI → fpi null, fpiMargin null, the blend renormalises without it", () => {
    const syr = game(b, "SYR");
    expect(syr.away.name).toBe("New Hampshire Wildcats");
    expect(syr.away.fpi).toBeNull();
    expect(syr.model.parts.fpiMargin).toBeNull();
    expect(syr.model.parts.fpi).toBeNull();
    expect(syr.model.pHome).not.toBeNull();
    // only the ML and spread parts remain: pHome = (0.6·mkt + 0.25·spread) / 0.85
    const { mkt, spread } = syr.model.parts;
    expect(syr.model.pHome!).toBeCloseTo((0.6 * mkt! + 0.25 * spread!) / 0.85, 12);
  });
  it("every game with an ML consensus has pHome in (0,1); every game has spread + total rows", () => {
    for (const g of b.games) {
      expect(g.model.sigma).toBe(CFB_MODEL.sigma);
      expect(g.model.sigmaTotal).toBe(CFB_MODEL.sigmaTotal);
      if (g.model.parts.mkt != null) {
        expect(g.model.pHome).not.toBeNull();
        expect(g.model.pHome!).toBeGreaterThan(0);
        expect(g.model.pHome!).toBeLessThan(1);
        expect(g.rows.filter((r) => r.market === "ml")).toHaveLength(2);
      }
      expect(g.rows.filter((r) => r.market === "spread")).toHaveLength(2);
      expect(g.rows.filter((r) => r.market === "total")).toHaveLength(2);
      for (const r of g.rows) {
        expect(r.fair).toBeGreaterThan(0);
        expect(r.fair).toBeLessThan(1);
        expect(r.push).toBeGreaterThanOrEqual(0);
        expect(r.fair + r.push).toBeLessThanOrEqual(1 + 1e-12);
        expect(Number.isFinite(r.fairAm)).toBe(true);
        expect(r.key).toBe(`${g.id}|${r.market}|${r.side}|${r.line ?? ""}`);
        if (r.cz) expect(r.cz.book).toBe("williamhill_us");
        if (r.pin) expect(r.pin.book).toBe("pinnacle");
        if (r.dk) expect(r.dk.book).toBe("draftkings");
        if (r.fd) expect(r.fd.book).toBe("fanduel");
      }
    }
  });
  it("home/away spread rows mirror; over/under totals share the line; fair sums to 1 − push", () => {
    for (const g of b.games) {
      const sh = row(g, sideLabel(g, "spread", "home", g.rows.find((r) => r.market === "spread" && r.side === "home")!.line));
      const sa = g.rows.find((r) => r.market === "spread" && r.side === "away")!;
      expect(sa.line).toBe(-sh.line!);
      expect(sh.fair + sa.fair + sh.push).toBeCloseTo(1, 12);
      expect(sh.push).toBeCloseTo(sa.push, 12);
      const o = g.rows.find((r) => r.market === "total" && r.side === "over")!;
      const u = g.rows.find((r) => r.market === "total" && r.side === "under")!;
      expect(o.line).toBe(u.line);
      expect(o.fair + u.fair + o.push).toBeCloseTo(1, 12);
      const mh = g.rows.find((r) => r.market === "ml" && r.side === "home");
      const ma = g.rows.find((r) => r.market === "ml" && r.side === "away");
      if (mh && ma) {
        expect(mh.fair + ma.fair).toBeCloseTo(1, 12);
        expect(mh.mkt! + ma.mkt!).toBeCloseTo(1, 12);
        expect(mh.line).toBeNull();
      }
    }
  });
  it("Caesars prices every fixture game's spread and total → those rows carry cz and are playable", () => {
    for (const g of b.games) {
      for (const r of g.rows.filter((x) => x.market !== "ml")) {
        expect(r.cz, `${g.home.abbr} ${r.label}`).not.toBeNull();
        expect(r.cz!.dec).toBeGreaterThan(1);
        expect(r.playable).toBe(true);
        expect(r.evCz).not.toBeNull();
        expect(r.grade).not.toBeNull();
      }
    }
  });
  it('Caesars posts no moneyline on the 40-point blowouts ("OFF") — the ML rows exist from other books, unplayable, ungraded', () => {
    for (const abbr of ["ALA", "IU", "OSU", "ARMY", "SYR", "NEB"]) {
      const g = game(b, abbr);
      const ml = g.rows.filter((r) => r.market === "ml");
      expect(ml).toHaveLength(2);
      for (const r of ml) {
        expect(r.cz).toBeNull();
        expect(r.evCz).toBeNull();
        expect(r.grade).toBeNull();
        expect(r.playable).toBe(false);
        expect(r.kelly).toBe(0);
      }
      // and the spread / total are still priced
      expect(g.model.muMargin).not.toBeNull();
      expect(g.model.muTotal).not.toBeNull();
    }
    for (const abbr of ["HOU", "WVU", "BGSU", "JMU", "CONN", "PITT"]) {
      const g = game(b, abbr);
      expect(g.rows.filter((r) => r.market === "ml").every((r) => r.cz != null && r.playable)).toBe(true);
    }
  });
  it("quotes sit at the BOOK'S OWN line; `best` only among books at the consensus line", () => {
    const iu = game(b, "IU");
    const nt = row(iu, "North Texas +40.5"); // consensus line +40.5 (fixture: DK/FD 40.5, Caesars 39.5, Pinnacle 41)
    expect(nt.line).toBe(40.5);
    expect(nt.cz).toMatchObject({ book: "williamhill_us", price: -104, line: 39.5 });
    expect(nt.pin).toMatchObject({ book: "pinnacle", price: -116, line: 41 });
    expect(nt.dk).toMatchObject({ book: "draftkings", price: -110, line: 40.5 });
    expect(nt.best!.line).toBe(40.5);
    expect(nt.best!.dec).toBeGreaterThanOrEqual(nt.dk!.dec);
    const sub = nt.sub;
    expect(sub).toBe("@ Indiana · Sat 9:00 AM");
    expect(row(iu, "Indiana -40.5").sub).toBe("vs North Texas · Sat 9:00 AM");
    expect(iu.rows.find((r) => r.market === "total")!.sub).toBe("UNT @ IU · Sat 9:00 AM");
  });
  it("a book's spread quote is side-signed and the away quote mirrors the home point", () => {
    const ala = game(b, "ALA");
    expect(row(ala, "Alabama -28").cz).toMatchObject({ price: -114, line: -28 }); // fixture: Caesars ALA -28 -114
    expect(row(ala, "East Carolina +28").cz).toMatchObject({ price: -106, line: 28 }); // fixture: Caesars ECU +28 -106
    expect(row(ala, "Over 52.5").cz).toMatchObject({ price: -112, line: 52.5 });
    expect(row(ala, "Under 52.5").cz).toMatchObject({ price: -109, line: 52.5 });
    expect(ala.model.books).toEqual({ ml: 13, spread: 23, total: 21 });
  });
  it("kelly is a whole-dollar ¼-Kelly at Caesars capped at 2% of the bankroll, 0 without an edge", () => {
    for (const g of b.games) {
      for (const r of g.rows) {
        expect(Number.isInteger(r.kelly)).toBe(true);
        expect(r.kelly).toBeLessThanOrEqual(50); // 2% of 2500
        if (r.evCz == null || r.evCz <= 0 || !r.playable) expect(r.kelly).toBe(0);
      }
    }
    const b2 = build({ bankroll: 1000 });
    for (const g of b2.games) for (const r of g.rows) expect(r.kelly).toBeLessThanOrEqual(20);
  });
});

describe("hand-computed EV checks from fixture prices (reduced books so the medians are readable)", () => {
  /*
   * CHECK 1 — Alabama −28 spread, books = Caesars + Pinnacle ONLY, FPI withheld.
   * fixture prices: Caesars ALA −28 @ −114 / ECU +28 @ −106; Pinnacle ALA −28 @ −105 / ECU +28 @ −109.
   *   Caesars:  imp 114/214 = 0.532710, 106/206 = 0.514563 → p_cover = 0.5086640
   *             μ_cz = 28 + 16.5·Φ⁻¹(0.5086640) = 28.358366
   *   Pinnacle: imp 105/205 = 0.512195, 109/209 = 0.521531 → p_cover = 0.4954843
   *             μ_pin = 28 + 16.5·Φ⁻¹(0.4954843) = 27.813230
   *   weighted median over {μ_pin (w2), μ_cz (w1)}: sorted ascending μ_pin first, cumulative
   *   weight 2 ≥ half (1.5) → mktMargin = μ_pin = 27.813230; no FPI → muMargin = mktMargin.
   *   consensus line = median home point = −28 (both books).
   *   ALA −28 (integer line): win = 1 − Φ((28.5 − 27.813230)/16.5) = 0.4833998
   *                           push = Φ(0.041622) − Φ(−0.018986) = 0.0241731
   *   EV at Caesars −114 (dec 1.877193) = 100·(0.4833998·0.877193 − (1 − 0.4833998 − 0.0241731)) = −6.8392 %
   *   ECU +28 at −106 (dec 1.943396): win = 0.4924271 → EV = −1.8846 %
   */
  it("CHECK 1 · Alabama −28 / East Carolina +28 at Caesars (fixture prices, Pinnacle-weighted median)", () => {
    const b = build({ oddsEvents: [reduced("Alabama Crimson Tide", ["williamhill_us", "pinnacle"])], fpi: null });
    const ala = game(b, "ALA");
    expect(ala.model.books).toEqual({ ml: 0, spread: 2, total: 2 });
    expect(ala.model.parts.mkt).toBeNull();
    expect(ala.rows.filter((r) => r.market === "ml")).toHaveLength(0);
    expect(ala.model.parts.mktMargin!).toBeCloseTo(27.81322984983118, 9);
    expect(ala.model.muMargin!).toBeCloseTo(27.81322984983118, 9);
    expect(ala.home.fpi).toBeNull();
    const h = row(ala, "Alabama -28");
    expect(h.line).toBe(-28);
    expect(h.fair).toBeCloseTo(0.4833998447571337, 9);
    expect(h.push).toBeCloseTo(0.02417307193829865, 9);
    expect(h.mkt!).toBeCloseTo(0.4833998447571337, 9); // same margin, same line → same cover prob
    expect(h.books).toBe(2);
    expect(h.evCz!).toBeCloseTo(-6.84, 2);
    expect(h.grade).toBe("F");
    expect(h.kelly).toBe(0);
    const a = row(ala, "East Carolina +28");
    expect(a.fair).toBeCloseTo(0.49242708330456764, 9);
    expect(a.evCz!).toBeCloseTo(-1.88, 2);
    expect(a.grade).toBe("D");
    // evBest: the best price at the consensus line among the two books — ECU +28: Caesars −106 beats Pinnacle −109
    expect(a.best).toMatchObject({ book: "williamhill_us", price: -106 });
    expect(a.evBest).toBe(a.evCz);
  });

  /*
   * CHECK 2 — Alabama total, same two books.
   * fixture prices: Caesars O 52.5 −112 / U −109; Pinnacle O 52.5 −106 / U −110.
   *   Caesars:  imp 112/212 = 0.528302, 109/209 = 0.521531 → p_over = 0.5032247 → μT_cz = 52.5 + 18·Φ⁻¹ = 52.645498
   *   Pinnacle: imp 106/206 = 0.514563, 110/210 = 0.523810 → p_over = 0.4955476 → μT_pin = 52.299108
   *   weighted median → μT_pin (w2). consensus total = 52.5 (both books).
   *   Over 52.5 (half line, no push): win = 1 − Φ((52.5 − 52.299108)/18) = 0.4955476 — exactly Pinnacle's de-vigged over.
   *   EV at Caesars −112 (dec 1.892857) = 100·(0.4955476·0.892857 − 0.5044524) = −6.1999 %
   *   Under 52.5 at Caesars −109 (dec 1.917431): win = 0.5044524 → EV = −3.2747 %
   */
  it("CHECK 2 · Over / Under 52.5 at Caesars (fixture prices)", () => {
    const b = build({ oddsEvents: [reduced("Alabama Crimson Tide", ["williamhill_us", "pinnacle"])], fpi: null });
    const ala = game(b, "ALA");
    expect(ala.model.muTotal!).toBeCloseTo(52.299108434453615, 9);
    const o = row(ala, "Over 52.5");
    const u = row(ala, "Under 52.5");
    expect(o.line).toBe(52.5);
    expect(o.push).toBe(0);
    expect(o.fair).toBeCloseTo(0.4955476402493322, 9);
    expect(o.evCz!).toBeCloseTo(-6.2, 2);
    expect(u.fair).toBeCloseTo(0.5044523597506678, 9);
    expect(u.evCz!).toBeCloseTo(-3.27, 2);
    expect(u.best).toMatchObject({ book: "williamhill_us", price: -109, line: 52.5 });
  });

  /*
   * CHECK 3 — Alabama moneyline, books = DraftKings + FanDuel h2h ONLY (weights 1 and 1), FPI withheld.
   * fixture prices: DK ALA −6500 / ECU +2000; FD ALA −7000 / ECU +2000.
   *   DK: imp 6500/6600 = 0.9848485, 100/2100 = 0.0476190; S = 1.0324675 → p_dk = 0.9538784
   *   FD: imp 7000/7100 = 0.9859155, 0.0476190; S = 1.0335345 → p_fd = 0.9539260
   *   weighted median, equal weights: sorted ascending p_dk first, cumulative 1 ≥ half (1) → mkt = p_dk.
   *   No spread, no FPI → pHome = mkt = 0.9538784; muMargin = 16.5·Φ⁻¹(0.9538784) = 27.780749.
   *   Caesars posts no ML → evCz null. best home = DK −6500 (dec 1.0153846 > FD's 1.0142857):
   *   EV = 100·(0.9538784·0.0153846 − 0.0461216) = −3.1447 % — which is 100·(1/S_dk − 1), the proportional
   *   de-vig identity (a book's own EV is −overround on both sides). Away best = +2000 (DK, first at that price):
   *   EV = 100·(0.0461216·20 − 0.9538784) = −3.1447 %.
   */
  it("CHECK 3 · Alabama / East Carolina ML at the best posted price (fixture prices, no Caesars ML)", () => {
    const b = build({ oddsEvents: [reduced("Alabama Crimson Tide", ["draftkings", "fanduel"], ["h2h"])], fpi: null });
    const ala = game(b, "ALA");
    expect(ala.model.books).toEqual({ ml: 2, spread: 0, total: 0 });
    expect(ala.model.parts.mkt!).toBeCloseTo(0.9538784067085954, 9);
    expect(ala.model.pHome!).toBeCloseTo(0.9538784067085954, 9);
    expect(ala.model.muMargin!).toBeCloseTo(27.78074918233701, 6);
    expect(ala.rows).toHaveLength(2);
    const h = row(ala, "Alabama ML");
    const a = row(ala, "East Carolina ML");
    expect(h.cz).toBeNull();
    expect(h.evCz).toBeNull();
    expect(h.playable).toBe(false);
    expect(h.best).toMatchObject({ book: "draftkings", price: -6500 });
    expect(h.evBest!).toBeCloseTo(-3.14, 2);
    expect(a.best).toMatchObject({ price: 2000 });
    expect(a.evBest!).toBeCloseTo(-3.14, 2);
    expect(h.fairAm).toBe(-2068);
    expect(a.fairAm).toBe(2068);
  });

  /*
   * CHECK 4 — James Madison moneyline at Caesars, books = Caesars + Pinnacle h2h ONLY, FPI withheld.
   * fixture prices: Caesars JMU −230 / LIB +188; Pinnacle JMU −228 / LIB +192.
   *   Caesars:  imp 230/330 = 0.6969697, 100/288 = 0.3472222 → p_cz = 0.6674728
   *   Pinnacle: imp 228/328 = 0.6951220, 100/292 = 0.3424658 → p_pin = 0.6699404
   *   weighted median over {p_cz (w1), p_pin (w2)}: ascending p_cz (cum 1 < 1.5), then p_pin (cum 3) → mkt = p_pin.
   *   JMU ML at Caesars −230 (dec 1.4347826): EV = 100·(0.6699404·0.4347826 − 0.3300596) = −3.8781 %
   *   Liberty ML at Caesars +188 (dec 2.88): EV = 100·(0.3300596·1.88 − 0.6699404) = −4.9428 %
   */
  it("CHECK 4 · James Madison / Liberty ML at Caesars (fixture prices)", () => {
    const b = build({ oddsEvents: [reduced("James Madison Dukes", ["williamhill_us", "pinnacle"], ["h2h"])], fpi: null });
    const jmu = game(b, "JMU");
    expect(jmu.model.parts.mkt!).toBeCloseTo(0.6699404282724198, 9);
    const h = row(jmu, "James Madison ML");
    const a = row(jmu, "Liberty ML");
    expect(h.cz).toMatchObject({ book: "williamhill_us", price: -230, line: null });
    expect(h.evCz!).toBeCloseTo(-3.88, 2);
    expect(h.grade).toBe("F");
    expect(h.playable).toBe(true);
    expect(h.kelly).toBe(0);
    expect(a.cz).toMatchObject({ price: 188 });
    expect(a.evCz!).toBeCloseTo(-4.94, 2);
    expect(a.sub).toBe("@ James Madison · Sat 9:00 AM");
  });

  it("the EV / Kelly primitives on round numbers", () => {
    // win 0.55, no push, at −110 (dec 1.909091): EV = 100·(0.55·0.909091 − 0.45) = 5.0 %; ¼-Kelly f = 0.25·(0.55·0.909091 − 0.45)/0.909091 = 0.01375 → $34 of 2500
    expect(evPct(0.55, 0, 1 + 100 / 110)).toBeCloseTo(5, 9);
    expect(kellyStake(0.55, 0, 1 + 100 / 110, 2500)).toBe(34);
    expect(kellyStake(0.5, 0, 1 + 100 / 110, 2500)).toBe(0); // −EV → 0
    expect(kellyStake(0.9, 0, 3, 2500)).toBe(50); // f = 0.25·(0.9·2 − 0.1)/2 = 0.2125 → capped at 2% → $50
    // a push returns the stake: win .48 push .04 loss .48 at even money → EV 0
    expect(evPct(0.48, 0.04, 2)).toBeCloseTo(0, 12);
    // coverProb: half line never pushes; integer line pushes with the continuity mass
    expect(coverProb(0, 16.5, 0.5).push).toBe(0);
    expect(coverProb(0, 16.5, 0).push).toBeGreaterThan(0.02);
    expect(coverProb(3, 16.5, -3).win + coverProb(-3, 16.5, 3).win + coverProb(3, 16.5, -3).push).toBeCloseTo(1, 12);
  });
});

describe("skeleton rules", () => {
  it("keeps only events whose PACIFIC date is the requested date; drops malformed events", () => {
    const late = JSON.parse(JSON.stringify(ESPN.events[0])) as Record<string, unknown>;
    late.id = "late";
    late.date = "2026-09-06T02:00Z"; // 7 PM PT Saturday → stays
    const sunday = JSON.parse(JSON.stringify(ESPN.events[0])) as Record<string, unknown>;
    sunday.id = "sunday";
    sunday.date = "2026-09-06T08:00Z"; // 1 AM PT Sunday → dropped for 9/5
    const b = build({ espnEvents: [...ESPN.events, late, sunday, null, {}, { id: "x" }] });
    expect(b.games).toHaveLength(13);
    expect(b.games.find((g) => g.id === "late")).toBeDefined();
    expect(b.games.find((g) => g.id === "sunday")).toBeUndefined();
    // the duplicate matchup gets no odds event twice
    expect(b.games.find((g) => g.id === "late")!.oddsEventId).toBeNull();
    expect(b.unmatched).toBe(1);
    expect(b.games.find((g) => g.id === "late")!.rows).toHaveLength(0);
  });
  it("status mapping and scores: final / live / postponed", () => {
    const ev = JSON.parse(JSON.stringify(ESPN.events[0])) as { status: { type: Record<string, unknown>; period: number; displayClock: string }; competitions: Array<{ competitors: Array<{ score: string }> }> };
    ev.status.type = { name: "STATUS_FINAL", state: "post", completed: true, shortDetail: "Final" };
    ev.competitions[0].competitors[0].score = "52";
    ev.competitions[0].competitors[1].score = "7";
    let g = build({ espnEvents: [ev], oddsEvents: [] }).games[0];
    expect(g.status).toBe("final");
    expect(g.detail).toBe("Final");
    expect(g.homeScore).toBe(52);
    expect(g.awayScore).toBe(7);
    expect(g.rows.every((r) => !r.playable)).toBe(true);
    ev.status.type = { name: "STATUS_IN_PROGRESS", state: "in", completed: false, shortDetail: "4:12 - 3rd" };
    ev.status.period = 3;
    ev.status.displayClock = "4:12";
    g = build({ espnEvents: [ev], oddsEvents: [] }).games[0];
    expect(g.status).toBe("live");
    expect(g.period).toBe(3);
    expect(g.clock).toBe("4:12");
    ev.status.type = { name: "STATUS_POSTPONED", state: "post", completed: false, shortDetail: "Postponed" };
    g = build({ espnEvents: [ev], oddsEvents: [] }).games[0];
    expect(g.status).toBe("postponed");
    expect(g.homeScore).toBeNull();
  });
  it("a kicked-off game is never playable even with Caesars posted", () => {
    // the fixture's last kickoffs are 16:30Z (OSU, PITT); 17:00Z is past every one of them
    const b = build({ now: Date.parse("2026-09-05T17:00:00Z") });
    for (const g of b.games) for (const r of g.rows) expect(r.playable).toBe(false);
    expect(b.slateDates).toEqual(["2026-09-05", "2026-09-11"]);
  });
  it("no odds at all → 12 unmatched games, empty rows, no market parts; the blend runs on FPI alone where FPI exists", () => {
    const b = build({ oddsEvents: [] });
    expect(b.unmatched).toBe(12);
    for (const g of b.games) {
      expect(g.rows).toHaveLength(0);
      expect(g.oddsEventId).toBeNull();
      expect(g.model.parts.mkt).toBeNull();
      expect(g.model.parts.spread).toBeNull();
      expect(g.model.parts.mktMargin).toBeNull();
      expect(g.model.muTotal).toBeNull();
      expect(g.model.books).toEqual({ ml: 0, spread: 0, total: 0 });
    }
    // spec: pHome = Σ w·p over the AVAILABLE parts — with only FPI, pHome = Φ(fpiMargin/σ) and muMargin = fpiMargin
    const iu = game(b, "IU");
    expect(iu.home.fpi).toBe(23.14);
    expect(iu.model.parts.fpiMargin!).toBeCloseTo(23.14 - -6.401 + CFB_MODEL.hfa, 9); // fixture FPI 23.14 / −6.401 + the home edge
    expect(iu.model.pHome!).toBeCloseTo(normCdf(iu.model.parts.fpiMargin! / CFB_MODEL.sigma), 12);
    expect(iu.model.muMargin).toBe(iu.model.parts.fpiMargin);
    // an FCS visitor has no FPI → no part at all → null
    const syr = game(b, "SYR");
    expect(syr.model.pHome).toBeNull();
    expect(syr.model.muMargin).toBeNull();
    expect(b.slateDates).toEqual(["2026-09-05"]);
  });
  it("one book at a line is below minBooks → that market has no consensus", () => {
    const b = build({ oddsEvents: [reduced("Alabama Crimson Tide", ["williamhill_us"])], fpi: null });
    const ala = game(b, "ALA");
    expect(ala.model.books).toEqual({ ml: 0, spread: 1, total: 1 });
    expect(ala.model.parts.mktMargin).toBeNull();
    expect(ala.model.muTotal).toBeNull();
    expect(ala.model.pHome).toBeNull();
    expect(ala.rows).toHaveLength(0);
  });
  it("rowProbAt re-evaluates the model at any line (the EV-at-Caesars'-own-line rule)", () => {
    const b = build();
    const iu = game(b, "IU");
    const nt = row(iu, "North Texas +40.5");
    const atCz = rowProbAt(iu.model, "spread", "away", 39.5)!;
    expect(atCz.win).toBeLessThan(nt.fair); // a point less of cushion → a smaller cover probability
    expect(nt.evCz!).toBeCloseTo(evPct(atCz.win, atCz.push, nt.cz!.dec), 2);
    expect(rowProbAt(iu.model, "ml", "away", null)!.win).toBeCloseTo(1 - iu.model.pHome!, 12);
    expect(rowProbAt({ ...iu.model, muTotal: null }, "total", "over", 56)).toBeNull();
  });
});
