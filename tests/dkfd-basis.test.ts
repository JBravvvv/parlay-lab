import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FROZEN_NOW, TODAY, fixtureFetchJson } from "./helpers/fixture-env";
import { createEngine, type BoardData, type Engine, type Ticket } from "@/engine";
import { pendingLegs, sightProp, type OddsEvent } from "@/lib/server/clv-core";
import { ledgerSegments } from "@/lib/ledger-segments";
import type { SyncEntry } from "@/lib/ledger-merge";

/* DK/FD selection basis (dk_fd, the new default): every selection number — the EV
   gate, weights, Kelly, FUN tiers — computes at the better of DraftKings/FanDuel
   (tie → DK). Caesars is display + settlement only. The consensus fair probability
   (the model's OPINION) stays all-books.

   The NV-blindness proof: perturb Caesars/BetMGM quotes by scaling both sides'
   DECIMAL odds by the same factor. That changes every NV price wildly while
   leaving each de-vigged pair fair mathematically unchanged — so the opinion is
   held constant and any selection difference can only come from an NV PRICE
   leaking into the selection math. */

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FROZEN_NOW);
});
afterAll(() => vi.useRealTimers());

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const NV_BOOKS = new Set(["williamhill_us", "betmgm"]);
const K = 3; // triples every NV decimal — pair ratios (and so de-vigged fairs) unchanged

const amToDec = (am: number) => (am > 0 ? 1 + am / 100 : 1 + 100 / -am);
const scaleAm = (am: number): number => {
  const dec = amToDec(am) * K; // always > 2 for K=3
  return (dec - 1) * 100; // positive american, float — the engine parses any number
};

type AnyObj = Record<string, unknown>;
function perturbBookmakers(body: unknown): unknown {
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (!x || typeof x !== "object") return;
    const o = x as AnyObj;
    if (Array.isArray(o.bookmakers)) {
      for (const bk of o.bookmakers as AnyObj[]) {
        if (!NV_BOOKS.has(String(bk.key))) continue;
        for (const mk of (bk.markets as AnyObj[]) ?? []) {
          for (const oc of (mk.outcomes as AnyObj[]) ?? []) {
            if (typeof oc.price === "number") oc.price = scaleAm(oc.price);
          }
        }
      }
    }
    for (const v of Object.values(o)) walk(v);
  };
  const clone = JSON.parse(JSON.stringify(body));
  walk(clone);
  return clone;
}

function perturbedFetch(url: string) {
  return fixtureFetchJson(url).then((r) =>
    url.includes("the-odds-api") ? { ok: r.ok, body: perturbBookmakers(r.body) } : r,
  );
}

/** DK/FD removed everywhere — no leg has a basis quote. */
function noBasisFetch(url: string) {
  return fixtureFetchJson(url).then((r) => {
    if (!url.includes("the-odds-api")) return r;
    const clone = JSON.parse(JSON.stringify(r.body));
    const walk = (x: unknown): void => {
      if (Array.isArray(x)) return x.forEach(walk);
      if (!x || typeof x !== "object") return;
      const o = x as AnyObj;
      if (Array.isArray(o.bookmakers)) {
        o.bookmakers = (o.bookmakers as AnyObj[]).filter((b) => b.key !== "draftkings" && b.key !== "fanduel");
      }
      for (const v of Object.values(o)) walk(v);
    };
    walk(clone);
    return { ok: r.ok, body: clone };
  });
}

async function boardWith(fetchJson: (u: string) => Promise<{ ok: boolean; body: unknown }>) {
  const eng = createEngine({ fetchJson, today: TODAY, storage: memoryStorage() });
  eng.get<Record<string, unknown>>("SH_CFG").selMode = "dk_fd";
  const d = eng.analyze(await eng.collectSlate()) as BoardData;
  return { eng, d };
}

/* everything selection sees: order, probabilities, and the basis layer, scoped to the
   SELECTABLE universe — rows/tickets carrying a DK/FD basis. czEv/czOdds are display
   fields (they change under perturbation by design), and rows with NO basis quote are
   card-ineligible by rule: their one-sided anchor stays best-price (legacy) and is
   explicitly outside the NV-blind guarantee — they can never take card money. */
function selectionView(d: BoardData) {
  return {
    cats: Object.fromEntries(
      Object.entries(d.categories)
        // "all" is the legacy TOP-50-by-EV-at-best-price DISPLAY ranking — nothing in
        // selection reads it (parlays build from the market tabs; Sharp and Builder
        // both filter it out), and best-price EV legitimately moves with any book
        .filter(([k]) => k !== "all")
        .map(([k, rows]) => [
          k,
          rows.filter((r) => r.bs != null).map((r) => [r.label, r.sub, r.prob, r.bs, r.bsEv ?? null]),
        ]),
    ),
    parlays: d.parlays.filter((t) => t.bsDec != null).map((t) => [t.name, t.prob, t.bsDec, t.bsEv ?? null]),
  };
}

/* the no-basis rows stay board-visible either way — same labels, whatever their order */
function visibleNoBasis(d: BoardData) {
  return Object.entries(d.categories)
    .filter(([k]) => k !== "all") // TOP-50 membership is EV-at-best-price, display-only
    .flatMap(([, rows]) => rows.filter((r) => r.bs == null).map((r) => `${r.label}|${r.sub}`))
    .sort();
}

describe("dk_fd: selection is provably NV-blind", () => {
  it("wild CZ/BetMGM price perturbation (fair-preserving) leaves every pick, ranking, and card byte-identical", async () => {
    const a = await boardWith(fixtureFetchJson);
    const b = await boardWith(perturbedFetch);

    // sanity: the perturbation really moved NV prices (display fields differ)
    const czA = JSON.stringify(Object.values(a.d.categories).flat().map((r) => r.czOdds ?? null));
    const czB = JSON.stringify(Object.values(b.d.categories).flat().map((r) => r.czOdds ?? null));
    expect(czB).not.toBe(czA);

    // selection layer: byte-identical
    expect(JSON.stringify(selectionView(b.d))).toBe(JSON.stringify(selectionView(a.d)));
    // no-basis rows stay a visible class in both runs — their exact top-50 tail
    // membership is a display ranking off NV-anchored probs and may legitimately shift
    expect(visibleNoBasis(a.d).length).toBeGreaterThan(0);
    expect(visibleNoBasis(b.d).length).toBeGreaterThan(0);

    // the card itself: same tickets, same stakes, same NO-PLAY verdict, same FUN picks
    const card = (eng: Engine, d: BoardData) => {
      const cfg = eng.get<Record<string, unknown>>("SH_CFG");
      const pool = eng.get<(x: unknown) => unknown[]>("shCardPool")(d);
      const alloc = eng.get<(p: unknown[], amt: number, c: unknown) => { picks: { id: string; stake: number }[]; noPlay?: boolean }>(
        "shAllocate",
      )(pool, 100, cfg);
      const fun = eng.get<(p: unknown[], amt: number, c: unknown, ei: unknown, el: unknown) => { picks: { id: string; stake: number }[] }>(
        "shFunPick",
      )(pool, 20, cfg, {}, {});
      return JSON.stringify({
        noPlay: !!alloc.noPlay,
        picks: alloc.picks.map((p) => [p.id, p.stake]),
        fun: fun.picks.map((p) => [p.id, p.stake]),
      });
    };
    expect(card(b.eng, b.d)).toBe(card(a.eng, a.d));
  });

  it("a leg with no DK and no FD quote is card-ineligible but stays board-visible", async () => {
    const { eng, d } = await boardWith(noBasisFetch);
    // single picks stay board-visible (and manual-slip eligible) with no basis attached…
    const rows = Object.entries(d.categories)
      .filter(([k]) => k !== "all")
      .flatMap(([, v]) => v);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.bs ?? null).toBeNull();
    // …but nothing is selectable: dk_fd parlay building only prices the basis universe,
    // so with zero DK/FD coverage there is no card pool at all — never a CZ-priced fallback
    expect(d.parlays.filter((t) => t.bsDec != null)).toHaveLength(0);
    const cfg = eng.get<Record<string, unknown>>("SH_CFG");
    const pool = eng.get<(x: unknown) => unknown[]>("shCardPool")(d);
    const alloc = eng.get<(p: unknown[], amt: number, c: unknown) => { picks: unknown[]; noPlay?: boolean }>("shAllocate")(
      pool,
      100,
      cfg,
    );
    expect(alloc.picks).toHaveLength(0);
    const fun = eng.get<(p: unknown[], amt: number, c: unknown, ei: unknown, el: unknown) => { picks: unknown[] }>("shFunPick")(
      pool,
      20,
      cfg,
      {},
      {},
    );
    expect(fun.picks).toHaveLength(0);
  });

  it("basis capture: better of the DK/FD pair only, tie goes to DK", async () => {
    const { eng, d } = await boardWith(fixtureFetchJson);
    for (const rows of Object.values(d.categories)) {
      for (const r of rows) {
        if (r.bs != null) expect(["DK", "FD"]).toContain(r.bsBook);
      }
    }
    const pick = eng.get<(dk: unknown, fd: unknown) => { am: number; bk: string } | null>("shBasisPick");
    expect(pick({ am: -110, bk: "DK" }, { am: -110, bk: "FD" })!.bk).toBe("DK"); // tie → DK
    expect(pick({ am: -115, bk: "DK" }, { am: -105, bk: "FD" })!.bk).toBe("FD"); // better payout wins
    expect(pick(null, { am: 120, bk: "FD" })!.bk).toBe("FD");
    expect(pick(null, null)).toBeNull();
    // a priced ticket carries the basis product over its legs
    const withBasis = d.parlays.find((t) => t.bsDec != null);
    if (withBasis) {
      const prod = withBasis.legs.reduce(
        (acc, l) => (acc == null || l.bs == null ? null : acc * amToDec(Number(l.bs))),
        1 as number | null,
      );
      expect(withBasis.bsDec).toBeCloseTo(Math.round((prod as number) * 10000) / 10000, 4);
    }
  });

  it("grading still settles at the confirmed/CZ price — the basis never pays", () => {
    const eng = createEngine({ fetchJson: fixtureFetchJson, today: TODAY, storage: memoryStorage() });
    eng.get<Record<string, unknown>>("SH_CFG").selMode = "dk_fd";
    const g = eng.get<(t: unknown, r: Record<string, { result: string }>) => { result: string; payout: number }>(
      "shGradeTicket",
    );
    const res = {
      "A|Hits O 0.5": { result: "won" },
      "B|TB O 1.5": { result: "won" },
    };
    const ticket = {
      confirmed: null,
      czDec: 2.5,
      bsDec: 3.4, // better basis price — must NOT touch the payout
      stake: 10,
      legs: [
        { label: "A", prop: "Hits O 0.5", cz: -110 },
        { label: "B", prop: "TB O 1.5", cz: 150 },
      ],
    };
    expect(g(ticket, res).payout).toBe(25); // 10 × 2.5 at CZ
    expect(g({ ...ticket, confirmed: 300 }, res).payout).toBe(40); // NV confirm is the price of record
  });
});

describe("dk_fd: CLV sights both closes", () => {
  const start = new Date(FROZEN_NOW + 20 * 60_000).toISOString();
  it("a sighting carries the CZ close AND the better DK/FD close", () => {
    const entry: SyncEntry = {
      date: TODAY,
      locked: true,
      core: [
        {
          id: "c1",
          legs: [{ label: "Jose Ramirez", prop: "TB O 1.5", gkey: "cle@min", lkey: "joseramirez|batter_total_bases|1.5" }],
        },
      ],
      funT: [],
      games: { "cle@min": { start } },
    } as never;
    const legs = [...pendingLegs(entry, FROZEN_NOW, 45 * 60_000).values()].flatMap((g) => g.legs);
    const mk = (over: number, under: number) => ({
      key: "batter_total_bases",
      outcomes: [
        { description: "Jose Ramirez", name: "Over", point: 1.5, price: over },
        { description: "Jose Ramirez", name: "Under", point: 1.5, price: under },
      ],
    });
    const ev: OddsEvent = {
      id: "e1",
      away_team: "Cleveland Guardians",
      home_team: "Minnesota Twins",
      commence_time: start,
      bookmakers: [
        { key: "williamhill_us", markets: [mk(-120, 100)] },
        { key: "draftkings", markets: [mk(-112, -108)] },
        { key: "fanduel", markets: [mk(-105, -115)] },
        { key: "pinnacle", markets: [mk(-110, -110)] },
      ],
    };
    const s = sightProp(ev, legs[0], FROZEN_NOW)!;
    expect(s.am).toBe(-120); // the price that pays
    expect(s.bsAm).toBe(-105); // the price that picked (FD better than DK on the over)
    expect(s.bsBk).toBe("FD");
  });
});

describe("dk_fd: receipts — CLV vs basis close and the NV tax line", () => {
  it("basis CLV averages over basis-locked legs; NV tax reconciles basis P/L vs actual P/L by market", () => {
    const e: SyncEntry = {
      date: "2026-07-18",
      locked: true,
      core: [
        {
          // won at CZ 2.5, picked at basis 2.8 → tax = 10×2.8 − 25 = $3 left at the counter
          id: "w1", type: "batter_hits", stake: 10, czDec: 2.5, bsDec: 2.8,
          legs: [{ label: "A", prop: "Hits O 0.5", lkey: "a|batter_hits|0.5", cz: 150, bs: 180 }],
        },
        {
          // lost — basis and actual both lose the stake, no tax either way
          id: "l1", type: "MIX", stake: 8, czDec: 3.0, bsDec: 3.3,
          legs: [{ label: "B", prop: "TB O 1.5", lkey: "b|batter_total_bases|1.5", cz: 200, bs: 230 }],
        },
        {
          // void-repriced win (g.dec ≠ czDec): excluded, disclosed — a basis reprice would be a guess
          id: "v1", type: "MIX", stake: 5, czDec: 4.0, bsDec: 4.4,
          legs: [{ label: "C", prop: "Ks O 4.5", lkey: "c|pitcher_strikeouts|4.5", cz: 300, bs: 340 }],
        },
      ],
      funT: [],
      grading: {
        done: true,
        tickets: {
          w1: { result: "won", payout: 25, dec: 2.5 },
          l1: { result: "lost", payout: 0 },
          v1: { result: "won", payout: 10, dec: 2.0 },
        },
        legs: {},
      },
      clv: {
        // CZ close 140 vs locked 150; basis close 160 vs locked basis 180
        "A|Hits O 0.5": { am: 140, at: 1, bsAm: 160, bsBk: "DK" },
      },
    } as never;
    const s = ledgerSegments([e]);
    expect(s.nvTax.tickets).toBe(2); // w1 + l1
    expect(s.nvTax.skipped).toBe(1); // v1
    expect(s.nvTax.tax).toBeCloseTo(3, 9); // only the clean win pays tax
    const hits = s.nvTax.byMarket.find((m) => m.market === "batter_hits")!;
    expect(hits.tax).toBeCloseTo(3, 9);
    expect(s.nvTax.byMarket.find((m) => m.market === "MIX")!.tax).toBeCloseTo(0, 9);

    // CLV vs the basis close: implied(160) − implied(180) — judged at the price that picked it
    const impliedPct = (am: number) => (am > 0 ? 100 * (100 / (am + 100)) : 100 * (-am / (-am + 100)));
    const hitsRow = s.byMarket.find((r) => r.seg === "batter_hits")!;
    expect(hitsRow.bsN).toBe(1);
    expect(hitsRow.bsPts).toBeCloseTo(impliedPct(160) - impliedPct(180), 9);
    // and CZ CLV still grades vs the CZ close, independently
    expect(hitsRow.clvPts).toBeCloseTo(impliedPct(140) - impliedPct(150), 9);
  });
});
