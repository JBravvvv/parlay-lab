import { describe, expect, it, vi } from "vitest";

/**
 * THE FOOTBALL BOARD'S TWO CATEGORY SELECTS NAME THE LIST THEY SHOW (2026-09-28, review of the September 28 bug pass).
 *
 * 1. Pick category. A Customize change that left several markets (SPREAD, then Total checked) or one fewer than the
 *    default board (1H ML unchecked) set the select to "Sides & Props" over a list of only those markets — and that radio,
 *    already checked, fired nothing when tapped, so the select could not bring the default board back. It now reads
 *    "Custom markets · N" and "Sides & Props" is an unchecked radio that restores the default board.
 * 2. Generated Parlays. LIVE, MIXED and COMBOS carry the default market set, so the keep rule for a picked set (markets
 *    exactly [that set]) never held for them: an odds, game-time, parlay-type or timing tweak dropped the list back to
 *    All sets. The set now survives every change that leaves Markets alone.
 *
 * How (2) is driven with no DOM (node env): a store-backed useState keeps the section's own five state slots across
 * renderToStaticMarkup passes (discovery, picked, filter, phoneShown, desktop); the Customize controls' props are captured
 * and their real onChange closures called; each render reads what the next one shows.
 */

const store = vi.hoisted(() => ({ slots: [] as unknown[], idx: 0, persistN: 5 }));
type MsProps = { label: string; value: readonly string[]; onChange: (v: string[]) => void; options: readonly { key: string; label: string }[] };
const cap = vi.hoisted(() => ({
  ms: {} as Record<string, MsProps>,
  odds: null as null | { onChange: (v: { min: number | null; max: number | null }) => void },
  time: null as null | { onChange: (v: readonly [number, number]) => void },
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  function useState<T>(init: T | (() => T)) {
    const i = store.idx++;
    const initial = () => (typeof init === "function" ? (init as () => T)() : init);
    if (i >= store.persistN) return [initial(), () => {}] as const;
    if (!(i in store.slots)) store.slots[i] = initial();
    const set = (u: unknown) => {
      store.slots[i] = typeof u === "function" ? (u as (p: unknown) => unknown)(store.slots[i]) : u;
    };
    return [store.slots[i] as T, set] as const;
  }
  const mod = { ...actual, useState };
  return { ...mod, default: mod };
});
vi.mock("@/components/props/MultiSelect", async () => {
  const { createElement: h } = await vi.importActual<typeof import("react")>("react");
  return {
    MultiSelect: (p: MsProps) => {
      cap.ms[p.label] = p;
      return h("div", { "data-ms": p.label, "data-value": p.value.join(",") });
    },
  };
});
vi.mock("@/components/props/OddsRangeFilter", () => ({ OddsRangeFilter: (p: never) => ((cap.odds = p), null) }));
vi.mock("@/components/props/GameTimeRange", () => ({ GameTimeRange: (p: never) => ((cap.time = p), null) }));
vi.mock("@/components/props/CrossBoardResults", () => ({ CrossBoardResults: () => null }));
vi.mock("@/components/motion/Reveal", () => ({ Reveal: ({ children }: { children: unknown }) => children }));

import * as ActualReact from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CfbParlaysSection } from "@/components/cfb/CfbPicksBoard";
import { CFB_PARLAY_CATEGORIES, type CfbParlay, type CfbParlayCategory, type CfbPicks } from "@/lib/cfb/props-types";
import { ALL_MARKETS } from "@/lib/cross-sport";
import { boardCategoryValue, defaultMarkets, isDefaultMarkets } from "@/lib/market-scope";

(globalThis as { React?: unknown }).React = ActualReact;

describe("the football Board's Pick category reads Custom markets over a market set that is neither one category nor the default board (review: it read Sides & Props over a spread + total list, and that radio could not be tapped)", () => {
  const nfl = defaultMarkets(ALL_MARKETS, ["nfl"]);
  it("the default board in any order is Sides & Props; one market fewer, one more, several, or none is Custom markets", () => {
    expect(nfl).toHaveLength(11);
    expect(boardCategoryValue("all", nfl, ALL_MARKETS, ["nfl"])).toBe("all");
    expect(boardCategoryValue("all", [...nfl].reverse(), ALL_MARKETS, ["nfl"])).toBe("all");
    /* THE CASES: SPREAD then Total checked; 1H ML unchecked from the default board; Receptions checked on top; Clear */
    expect(boardCategoryValue("all", ["spread", "total"], ALL_MARKETS, ["nfl"])).toBe("custom");
    expect(boardCategoryValue("all", nfl.filter((k) => k !== "ml_1h"), ALL_MARKETS, ["nfl"])).toBe("custom");
    expect(boardCategoryValue("all", [...nfl, "receptions"], ALL_MARKETS, ["nfl"])).toBe("custom");
    expect(boardCategoryValue("all", [], ALL_MARKETS, ["nfl"])).toBe("custom");
  });
  it("a picked category is its own name; the default board follows the sports the filter reads, as the Sides & Props tap restores it", () => {
    expect(boardCategoryValue("spread", ["spread"], ALL_MARKETS, ["nfl"])).toBe("spread");
    expect(boardCategoryValue("receptions", ["receptions"], ALL_MARKETS, ["cfb"])).toBe("receptions");
    const withMlb = defaultMarkets(ALL_MARKETS, ["cfb", "mlb"]);
    expect(withMlb.length).toBeGreaterThan(11);
    expect(isDefaultMarkets(withMlb, ALL_MARKETS, ["cfb", "mlb"])).toBe(true);
    expect(boardCategoryValue("all", withMlb, ALL_MARKETS, ["cfb", "mlb"])).toBe("all");
    expect(boardCategoryValue("all", defaultMarkets(ALL_MARKETS, ["cfb"]), ALL_MARKETS, ["cfb", "mlb"])).toBe("custom");
  });
});

const leg = (market: string, cz: number, gameId: string, live = false) => ({
  kind: "side" as const, rowKey: `${gameId}|${market}|home|${cz}`, gameId, label: `${market} ${gameId}`, sub: "", cz,
  dec: cz > 0 ? 1 + cz / 100 : 1 + 100 / -cz, prob: 0.5, push: 0, market, player: null, teamId: null, live,
});
const ticket = (id: string, category: CfbParlayCategory, legs: ReturnType<typeof leg>[], view: CfbParlay["view"] = "parlays"): CfbParlay => ({
  id, view, tier: "SAFER", category, type: "SIDES", name: id, legs,
  dec: legs.reduce((d, l) => d * l.dec, 1), am: 300, prob: 0.25, ev: 1, gated: true, liveLegs: legs.filter((l) => l.live).length,
}) as unknown as CfbParlay;
const sets = Object.fromEntries(CFB_PARLAY_CATEGORIES.map((k) => [k, [] as CfbParlay[]])) as Record<CfbParlayCategory, CfbParlay[]>;
sets.ml = [ticket("ML-1", "ml", [leg("ml", -150, "g1"), leg("ml", 120, "g2")])];
sets.spread = [ticket("SP-1", "spread", [leg("spread", -110, "g1"), leg("spread", -110, "g3")])];
sets.live = [ticket("LIVE-1", "live", [leg("ml", -120, "g4", true), leg("spread", -110, "g5", true)], "live")];
sets.mixed = [ticket("MIX-1", "mixed", [leg("ml", -130, "g4", true), leg("spread", -110, "g1")], "mixed")];
sets.combo = [ticket("COMBO-1", "combo", [leg("ml", -140, "g2"), leg("spread", -105, "g3")])];
const picks = { date: "2026-09-28", generatedAt: "", parlays: [], mixed: sets.mixed, live: sets.live, sets, liveRows: 0, categories: {} } as unknown as CfbPicks;

function render(): { ids: string[]; parlayCat: string } {
  store.idx = 0;
  cap.ms = {};
  const html = renderToStaticMarkup(ActualReact.createElement(CfbParlaysSection, { picks, games: new Map(), propsPending: false, liveGames: 2 }));
  /* the section's list: each CfbParlayCard's name line */
  const ids = [...html.matchAll(/truncate text-\[13px\] font-bold text-text">([^<]+)</g)].map((m) => m[1]);
  return { ids, parlayCat: cap.ms["Parlay category"].value.join(",") };
}
const reset = () => { store.slots = []; };
const discovery = () => store.slots[0] as { markets: readonly string[] };
const pick = (k: string) => { reset(); render(); cap.ms["Parlay category"].onChange([k]); return render(); };

describe("Generated Parlays keeps LIVE, MIXED and COMBOS through a Customize change that leaves Markets alone (review: an odds tweak dropped them back to All sets)", () => {
  for (const k of ["live", "mixed", "combo"] as const) {
    const id = { live: "LIVE-1", mixed: "MIX-1", combo: "COMBO-1" }[k];
    it(`${k.toUpperCase()}: odds, game-time, parlay-type and timing tweaks keep the set (and an odds tweak its list)`, () => {
      const r0 = pick(k);
      expect(r0.parlayCat).toBe(k);
      expect(r0.ids).toEqual([id]);
      /* a set with no market of its own carries the default board, as All sets does */
      expect(discovery().markets).toEqual(defaultMarkets(ALL_MARKETS, ["cfb"]));
      const tweaks: [string, () => void][] = [
        ["odds", () => cap.odds!.onChange({ min: null, max: 400 })],
        ["game time", () => cap.time!.onChange([9, 20])],
        ["parlay type", () => cap.ms["Parlay type"].onChange(["safe"])],
        ["timing", () => cap.ms["Timing"].onChange(["pregame", "live"])],
      ];
      for (const [name, tweak] of tweaks) {
        pick(k);
        const before = discovery().markets;
        tweak();
        /* every other control spreads the value, so the markets array is the same one */
        expect(discovery().markets, name).toBe(before);
        const r = render();
        expect(r.parlayCat, name).toBe(k);
        /* the section's test games map is empty, so a game-time window has no start to keep; the odds tweak keeps it */
        if (name === "odds") expect(r.ids, name).toEqual([id]);
      }
    });
    it(`${k.toUpperCase()}: a Markets change still drops the set, and the label and list then both read All sets`, () => {
      pick(k);
      const m = cap.ms["Markets"];
      m.onChange(m.value.filter((v) => v !== "ml_1h"));
      const r = render();
      expect(r.parlayCat).toBe("all");
      expect(new Set(r.ids)).toEqual(new Set(["ML-1", "SP-1", "LIVE-1", "MIX-1", "COMBO-1"]));
    });
  }
  it("a one-market set keeps the rule it had: an odds tweak or its own market keeps it, any other market set drops it, and a Sports change drops it", () => {
    let r = pick("ml");
    expect(discovery().markets).toEqual(["ml"]);
    cap.odds!.onChange({ min: null, max: 400 });
    r = render();
    expect([r.parlayCat, r.ids]).toEqual(["ml", ["ML-1"]]);
    cap.ms["Markets"].onChange(["ml"]);
    expect(render().parlayCat).toBe("ml");
    cap.ms["Markets"].onChange(["ml", "spread"]);
    expect(render().parlayCat).toBe("all");
    pick("live");
    cap.ms["Sports"].onChange(["cfb", "mlb"]);
    expect(render().parlayCat).toBe("all");
  });
});
