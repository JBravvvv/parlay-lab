import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { stripComments } from "./helpers/source";
import { GEN_PANEL_ID, GenSheet, genFailLine } from "@/components/props/GenSheet";
import { MLB_GEN_MARKETS, buildPool } from "@/components/props/mlb-gen-pool";
import { availableLegBand, generate, poolCounts, specSeed, type GenSpec } from "@/lib/parlay-gen";
import { amFmt, combineTicket } from "@/lib/ticket-math";
import type { PropBoardGame } from "@/engine";

/**
 * INSTRUCTION 50 (2026-09-11), Josh's word, verbatim: "Parlay builder should have a generator that
 * I can select # of legs, prop category, min & max odds then it will generate a parlay for me
 * within those parameters; if I hit regenerate then it regenerates a new parlay; each slot is
 * clickable to keep that player(s) in any round and spin the other slots" — with the worked example
 * "4 leg, H+R+RBI, -152 -> +110".
 *
 * THE BAND IS PER LEG. His four legs (-145 / -124 / -137 / -130) multiply to +834, which is nowhere
 * near "-152 -> +110", while every one of them sits inside that range on its own. So "-152 → +110"
 * is a per-leg filter, and in this UI it lives in the two inputs' PLACEHOLDER attributes — never as
 * JSX text, which would be a price nobody posted.
 *
 * Every price rendered below comes from tests/fixtures/gen-pool.json — real engine output over the
 * repo's captured odds fixtures (6 games / 289 rows), the same board tests/parlay-gen.test.ts uses,
 * so no number in this file was made up.
 *
 * THREE MECHANICAL SHIMS are required and are not optional: this is the first render test of
 * /props, so a missing one THROWS rather than fails — (1) React on the global (vitest compiles the
 * app's .tsx with the classic runtime under this tsconfig's jsx: preserve), (2) a Reveal stub
 * (motion/react in a node render), and (3) a QueryClientProvider (the page's server-props query).
 */
vi.stubGlobal("React", React);
(globalThis as { React?: typeof React }).React = React;
vi.mock("@/components/motion/Reveal", () => ({ Reveal: ({ children }: { children: unknown }) => children }));
/* a real, supported deep link (props-model.ts:127) so the page opens on Batter Props → H+R+RBI
   and the fixture's own prop cards render under the sheet */
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("tab=batter&mkt=hrr") }));
vi.mock("@/lib/sport", () => ({ useSport: () => "mlb", setSport: () => {} }));
vi.mock("@/lib/useBoard", () => ({
  useBoard: () => ({ data: BOARD, isPending: false, isError: false, refetch: () => {} }),
  useRegenerateBoard: () => ({ mutate: () => {}, isPending: false }),
}));
vi.mock("@/lib/mlb-visuals", async (orig) => ({
  ...(await orig<typeof import("@/lib/mlb-visuals")>()),
  /* the real hook resolves ids in an effect, so on a server render it is {} anyway — stubbed so no
     test can ever reach statsapi, and so the initials path is what is asserted */
  useHeadshots: () => ({}),
}));

const root = path.join(__dirname, "..");
const readSrc = (p: string) => stripComments(fs.readFileSync(path.join(root, p), "utf8"));
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

const FIXTURE = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/gen-pool.json"), "utf8")) as {
  propBoard: PropBoardGame[];
};
const PROP_BOARD = FIXTURE.propBoard;
const BOARD = { at: Date.parse("2026-07-10T16:00:00Z"), date: "2026-07-10", data: { propBoard: PROP_BOARD, categories: {}, categoriesLive: {} } };

/* Josh's own spec, read per-leg. onePerGame is off only so this fixture's 6-game slate can fill
   four H+R+RBI slots — the relaxation is the USER's, exactly as the sheet requires it to be. */
const SPEC: GenSpec = {
  market: "batter_hits_runs_rbis",
  legs: 4,
  legMinAm: -152,
  legMaxAm: 110,
  payout: null,
  sides: "o",
  onePerGame: false,
  czOnly: false,
  includeStarted: false,
  modelOnly: false,
  pinned: [null, null, null, null],
};
const POOL = buildPool(PROP_BOARD, SPEC, 0);
const RESULT = generate(POOL, SPEC, specSeed(SPEC, "2026-07-10", 0));

const sheet = (over: Record<string, unknown> = {}) =>
  html(
    createElement(GenSheet, {
      market: SPEC.market,
      marketLabel: "H+R+RBI",
      markets: MLB_GEN_MARKETS,
      pool: POOL,
      spec: SPEC,
      onSpec: () => {},
      result: RESULT,
      onGenerate: () => {},
      onTogglePin: () => {},
      onAdd: () => {},
      canUndo: false,
      onUndo: () => {},
      open: true,
      onOpen: () => {},
      boardAt: null,
      ...over,
    } as Parameters<typeof GenSheet>[0]),
  );

describe("the generator answers Josh's example on real board data", () => {
  it("fills exactly 4 H+R+RBI slots, every leg inside the per-leg band", () => {
    expect(RESULT.ok).toBe(true);
    if (!RESULT.ok) return;
    expect(RESULT.ticket.legs).toHaveLength(4);
    for (const l of RESULT.ticket.legs) {
      expect(l.leg.market).toBe("batter_hits_runs_rbis");
      expect(l.leg.sub).toMatch(/^H\+R\+RBI Over /); // Josh's own wording, composed by playerLeg
      expect(l.dec).toBeGreaterThanOrEqual(1.657894);
      expect(l.dec).toBeLessThanOrEqual(2.1);
    }
    expect(new Set(RESULT.ticket.legs.map((l) => l.playerKey)).size).toBe(4);
  });
});

describe("GenSheet — the open panel", () => {
  const out = sheet();
  it("is an inline panel, not a modal: it renders at all in renderToStaticMarkup", () => {
    expect(out).toContain('data-testid="props-gen"');
    expect(out).not.toMatch(/role="dialog"/);
  });
  it("the header is a 44px button carrying aria-expanded, and aria-controls only while open", () => {
    expect(out).toMatch(/<button[^>]*aria-expanded="true"/);
    expect(out).toContain(`aria-controls="${GEN_PANEL_ID}"`);
    expect(out).toContain(`id="${GEN_PANEL_ID}"`);
    expect(out).toMatch(/<button[^>]*class="[^"]*min-h-\[44px\]/);
    const shut = sheet({ open: false });
    expect(shut).toMatch(/aria-expanded="false"/);
    expect(shut).not.toContain("aria-controls"); // no dangling handle while collapsed
    expect(shut).not.toContain(`id="${GEN_PANEL_ID}"`);
  });
  it("every control is a 44px target and the pin toggles carry aria-pressed", () => {
    expect(count(out, /min-h-11/g)).toBeGreaterThan(10);
    expect(count(out, /aria-pressed/g)).toBeGreaterThan(10);
    expect(count(out, /data-gen-slot="\d"/g)).toBe(4);
    expect(out).toMatch(/data-gen-slot="0"[\s\S]{0,400}?aria-pressed="false"/);
    expect(out).toMatch(/aria-label="Keep slot 1: /);
  });
  it("each slot draws a PlayerMark — initials here, because useHeadshots is {} on the server", () => {
    expect(count(out, /data-player-mark/g)).toBe(4);
    expect(count(out, /data-team-badge/g)).toBe(4);
    expect(out).not.toContain("img.mlbstatic.com"); // no headshot resolved server-side, and none invented
  });
  it("prices render through amFmt only, and the combined price is combineTicket's", () => {
    if (!RESULT.ok) throw new Error("fixture must produce a ticket");
    for (const l of RESULT.ticket.legs) expect(out).toContain(amFmt(l.leg.cz));
    const calc = combineTicket(RESULT.ticket.legs.map((l) => l.leg))!;
    expect(out).toContain(amFmt(calc.am));
    expect(out).toContain(`${(calc.trueProb * 100).toFixed(1)}%`);
  });
  it("the diagnostic line says which control is binding", () => {
    expect(out).toContain('data-testid="gen-diagnostic"');
    expect(out).toMatch(/pool \d+ rows/);
    expect(out).toMatch(/eligible \d+/);
    expect(out).toMatch(/after band \d+/);
  });
  /* A diagnostic that says "eligible 40" while the sentence under it says the band is empty is
     worse than no diagnostic at all: Josh would be told two different stories about the same
     pool on one screen. The numbers must be poolCounts' own — the same function the failure
     sentence is derived from — not a second count computed in the component. */
  it("every number in the diagnostic is poolCounts', not a second count", () => {
    const c = poolCounts(POOL, SPEC);
    const line = out.slice(out.indexOf('data-testid="gen-diagnostic"'));
    const text = line.slice(0, line.indexOf("</div>")).replace(/<[^>]*>/g, "");
    expect(text).toContain(`pool ${POOL.rows} rows`);
    expect(text).toContain(`eligible ${c.eligible}`);
    expect(text).toContain(`after band ${c.inBand}`);
    expect(text).toContain(`${c.games} game`);
    /* and they are real, not all-zero placeholders that would pass the regexes above */
    expect(c.eligible).toBeGreaterThan(0);
    expect(c.inBand).toBeGreaterThan(0);
    expect(c.games).toBeGreaterThan(0);
  });
  it("PLANT: a diagnostic that recomputes its own eligible count is detected", () => {
    const c = poolCounts(POOL, SPEC);
    const fake = out.replace(`eligible ${c.eligible}`, `eligible ${c.eligible + 1}`);
    const line = fake.slice(fake.indexOf('data-testid="gen-diagnostic"'));
    const text = line.slice(0, line.indexOf("</div>")).replace(/<[^>]*>/g, "");
    expect(text, "the checker cannot see a drifted eligible count").not.toContain(`eligible ${c.eligible}`);
  });
  it("the footer carries the slip's own naive-product disclaimer, the sandbox framing and the suspension note", () => {
    expect(out).toContain(
      "True % is the naive product — same-game legs are correlated and this sandbox does not model that.",
    );
    expect(out).toContain("Sandbox · not tracked, never enters the ledger.");
    /* H+R+RBI and Outs are suspended from the engine's OWN auto-built tickets (SH_CFG hrrAltMax -1 /
       outsSusp true) — the sandbox spins them anyway and says so */
    expect(out).toContain("is suspended from the engine");
    expect(out).toContain("sandbox spins it anyway");
    const hits = sheet({ market: "batter_hits", marketLabel: "Hits" });
    expect(hits).not.toContain("sandbox spins it anyway");
  });
  it("Josh's -152 → +110 lives in placeholders, never as printed text", () => {
    expect(out).toContain('placeholder="-152"');
    expect(out).toContain('placeholder="+110"');
    expect(out).not.toMatch(/>\s*-152\s*</);
    expect(out).not.toMatch(/>\s*\+110\s*</);
  });
});

describe("GenSheet — one honest line per failure, never a silent relaxation", () => {
  const ctx = { marketLabel: "H+R+RBI", legs: 4, loAm: -152, hiAm: 110 };
  it("band-empty quotes the nearest price that really is posted in this pool", () => {
    const wide = generate(POOL, { ...SPEC, legMinAm: -5000, legMaxAm: -4000 }, 7);
    expect(wide.ok).toBe(false);
    if (wide.ok) return;
    expect(wide.fail.code).toBe("band-empty");
    if (wide.fail.code !== "band-empty") return;
    const near = wide.fail.nearest.aboveAm ?? wide.fail.nearest.belowAm!;
    expect(POOL.legs.some((l) => l.leg.cz === near)).toBe(true); // a real posted price, not a computed one
    const line = genFailLine(wide.fail, { ...ctx, loAm: -5000, hiAm: -4000 });
    expect(line).toContain("No H+R+RBI leg is priced between");
    expect(line).toContain(amFmt(near));
    const out = sheet({ result: wide, spec: { ...SPEC, legMinAm: -5000, legMaxAm: -4000 } });
    expect(out).toContain('data-testid="gen-fail"');
    expect(out).not.toContain('data-gen-slot="0"');
  });
  it("short-pool names the ONE relaxation that applies and never applies it itself", () => {
    const tight = generate(buildPool(PROP_BOARD, { ...SPEC, onePerGame: true }, 0), { ...SPEC, onePerGame: true }, 3);
    expect(tight.ok).toBe(false);
    if (tight.ok || tight.fail.code !== "short-pool") throw new Error("fixture must be short under one-per-game");
    expect(tight.fail.relax).toBe("same-game");
    const line = genFailLine(tight.fail, ctx);
    expect(line).toContain(`Only ${tight.fail.have} legs clears these filters and you asked for ${tight.fail.want}`);
    expect(line).toContain("two legs from one game");
  });
  it("the other four sentences say what is wrong in plain language, and 'about' for the greedy reach", () => {
    expect(genFailLine({ code: "no-rows" }, ctx)).toBe(
      "No H+R+RBI lines on this board — there is nothing here to build a parlay from.",
    );
    expect(genFailLine({ code: "payout-unreachable", reach: { minAm: 400, maxAm: 1200 } }, ctx)).toContain(
      "pays about +400 to +1200",
    );
    expect(genFailLine({ code: "payout-not-found", reach: { minAm: 400, maxAm: 1200 } }, ctx)).toContain(
      "reaches about +400 to +1200",
    );
    expect(genFailLine({ code: "pin-missing", ids: ["a"] }, ctx)).toContain("no longer posted on this board");
    expect(genFailLine({ code: "pin-conflict", ids: ["a", "b"], why: "same-player" }, ctx)).toContain(
      "can only carry him once",
    );
    expect(genFailLine({ code: "pin-conflict", ids: ["a", "b"], why: "same-game" }, ctx)).toContain(
      "two legs from one game",
    );
  });
});

describe("/props renders the sheet, collapsed, above the cards (the first render test of this page)", () => {
  it("the page mounts and the generator is in the tree, shut, with no dangling aria-controls", async () => {
    const mod = await import("../app/props/page");
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const out = renderToString(createElement(QueryClientProvider, { client: qc }, createElement(mod.default)));
    expect(count(out, /data-testid="props-gen"/g)).toBe(1);
    expect(out).toContain("Parlay generator");
    expect(out).toMatch(/aria-expanded="false"/);
    expect(out).not.toContain(`aria-controls="${GEN_PANEL_ID}"`);
    expect(out).not.toContain(`id="${GEN_PANEL_ID}"`);
    // it sits between the market nav and the cards
    /* the rail is above it, the game cards are below it */
    expect(out).toContain('role="tablist"');
    expect(out.indexOf('role="tablist"')).toBeLessThan(out.indexOf('data-testid="props-gen"'));
    expect(out.indexOf("How to read this")).toBeGreaterThan(-1);
    expect(out.indexOf('data-testid="props-gen"')).toBeLessThan(out.indexOf("How to read this"));
    /* and the real board rows are there — this is the fixture's own H+R+RBI market */
    expect(out).toContain("Bryce Harper");
  });
});

describe("source pins — the honesty guard extended to the newest price surface", () => {
  const gen = readSrc("src/components/props/GenSheet.tsx");
  const mark = readSrc("src/components/player/PlayerMark.tsx");
  const page = readSrc("app/props/page.tsx");
  const hook = readSrc("src/components/props/useParlayGen.ts");
  const parlays = readSrc("src/components/mlb/ParlaysSection.tsx");

  it("no hand-typed american price in JSX text in either new file", () => {
    /* tests/props-ui.test.ts:28 joins only six files, so the two files added by INSTRUCTION 50
       would otherwise render prices with nothing guarding them. */
    expect([gen, mark].join("\n")).not.toMatch(/>\s*[+-]\d{3}\s*</);
    expect(gen).toMatch(/amFmt\(l\.am\)/);
    expect(gen).toMatch(/amFmt\(calc\.am\)/);
  });
  it("the sheet is a dumb view — no fetch, no hook of its own, no ledger or credit path", () => {
    for (const bad of [/fetch\(/, /useHeadshots/, /\/api\//, /localStorage/, /Math\.random/]) {
      expect(gen, `GenSheet must not contain ${bad}`).not.toMatch(bad);
    }
    expect(gen).not.toMatch(/backdrop-filter|backdrop-blur/);
    expect(mark).not.toMatch(/backdrop-filter|backdrop-blur/);
  });
  it("the market-fair legs stay labelled: the italic mkt tag, never dressed as an edge", () => {
    expect(gen).toMatch(/l\.src === "market"/);
    expect(gen).toMatch(/italic/);
  });
  /* INSTRUCTION 52 (2026-09-12): the generator's STATE moved into one hook both desks call
     (src/components/props/useParlayGen.ts). These pins moved with it — re-typing any of them
     inside CfbProps would be the fork this instruction exists to avoid. */
  it("the hook reads the open flag AFTER mount, behind try/catch — never in a useState initializer", () => {
    expect(page).toMatch(/const GEN_OPEN_KEY = "pl:props:gen-open";/);
    expect(hook).toMatch(/const \[open, setOpenState\] = useState\(false\);/);
    expect(hook).toMatch(/if \(localStorage\.getItem\(storageKey\) === "1"\) setOpenState\(true\);/);
    expect(hook).toMatch(/localStorage\.setItem\(storageKey, next \? "1" : "0"\);/);
    expect(hook).not.toMatch(/useState\([^)]*localStorage/);
    // nowMs defaults to 0 so a server render marks NO game started
    expect(hook).toMatch(/const \[nowMs, setNowMs\] = useState\(0\);/);
    expect(hook).toMatch(/useEffect\(\(\) => setNowMs\(Date\.now\(\)\), \[\]\);/);
  });
  it("ONE useHeadshots call on the page, and its map is what the sheet draws with", () => {
    expect(count(page, /useHeadshots\(/g)).toBe(1);
    expect(page).toMatch(/headshot=\{headshots\[name\] \?\? null\}/);
    expect(page).toMatch(/buildPool\(propBoard, sp, at\)/);
    expect(hook).toMatch(/generate\(pool, spec, specSeed\(/);
  });
  it("Add to slip reuses the existing slip math and keeps an Undo; nothing is spent or written", () => {
    expect(hook).toMatch(/prevLegs\.current = legs\.slice\(\);/);
    /* ADD, NOT REPLACE (INSTRUCTION 52 fix pass). `setLegs(result.ticket.legs.map(...))` threw the
       slip away — harmless-looking on MLB, destructive on football, where one slip carries the
       Sides rail's legs too. The fold is the desk's own and it must keep what is there. */
    expect(hook).toMatch(/setLegs\(addLegs\(legs, result\.ticket\.legs\.map\(\(l\) => l\.leg\)\)\);/);
    expect(hook).not.toMatch(/setLegs\(result\.ticket\.legs\.map/);
    expect(page).toMatch(/addLegs: \(prev, add\) => \[\.\.\.prev\.filter/);
    expect(page).toMatch(/combineTicket\(legs\)/);
    expect(page).not.toMatch(/\/api\/refill|\/api\/generate/);
  });
  it("the generator's category control IS the market rail's setter — one state, no divergence", () => {
    expect(page).toMatch(/setTab\(t\);\s*setMktKey\(hit\.key\);/);
    expect(hook).toMatch(
      /sp\.market === railMarket \? sp : \{ \.\.\.sp, market: railMarket, pinned: blankPins\(sp\.legs\) \}/,
    );
  });
  it("the hook is a pure reader too — no fetch, no api path, no ledger, no credit", () => {
    for (const bad of [/fetch\(/, /\/api\//, /Math\.random/, /ledger/, /the-odds-api/]) {
      expect(hook, `useParlayGen must not contain ${bad}`).not.toMatch(bad);
    }
  });
  it("ParlaysSection: one memoized name list over all three sets, and the pins it must not lose", () => {
    expect(parlays).toMatch(/<PlayerMark/);
    expect(parlays).toMatch(/useMemo\(\(\) => \{[\s\S]*?\}, \[parlays, mixed, live\]\)/);
    expect(count(parlays, /useHeadshots\(/g)).toBe(1);
    expect(parlays).toMatch(/SCRATCHED LEG/);
    expect(parlays).toMatch(/legOut\?:/);
    expect(parlays).toMatch(/setSelMode\(getSelectionMode\(\)\)/);
    expect(parlays).toMatch(/orderByMode\(/);
    expect(parlays).toMatch(/MODE_LABEL\[selMode\]/);
  });
});


describe("generator recovery from an empty odds band", () => {
  it("keeps Generate enabled and offers real available prices without changing the spec", () => {
    const spec = { ...SPEC, legMinAm: -5000, legMaxAm: -4000 };
    const result = generate(POOL, spec, 7);
    const out = sheet({ spec, result });
    const button = out.match(/<button[^>]*>Generate parlay<\/button>/)?.[0];
    expect(button).toBeDefined();
    expect(button).not.toContain("disabled");
    const band = availableLegBand(POOL, spec)!;
    expect(out).toContain(`Use available odds ${amFmt(band.legMinAm)} to ${amFmt(band.legMaxAm)}`);
    expect(generate(POOL, { ...spec, ...band }, 7).ok).toBe(true);
    expect(spec.legMinAm).toBe(-5000);
  });
  it("available odds respect side, book and probability-source filters", () => {
    const spec = { ...SPEC, sides: "u" as const, czOnly: true, modelOnly: true };
    const eligible = POOL.legs.filter((l) => l.side === "u" && l.book === "CZ" && l.src === "model").sort((a, b) => a.dec - b.dec);
    expect(eligible.length).toBeGreaterThan(0);
    expect(availableLegBand(POOL, spec)).toEqual({ legMinAm: eligible[0].am, legMaxAm: eligible[eligible.length - 1].am });
  });
  it("allows another seed after a bounded payout search misses", () => {
    const out = sheet({ result: { ok: false, fail: { code: "payout-not-found", reach: { minAm: 400, maxAm: 1200 } } } });
    expect(out.match(/<button[^>]*>Generate parlay<\/button>/)?.[0]).not.toContain("disabled");
  });
});
