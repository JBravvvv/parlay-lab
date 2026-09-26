import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { stripComments } from "./helpers/source";
import { GenSheet, genFailLine } from "@/components/props/GenSheet";
import { MLB_GEN_MARKETS, buildPool } from "@/components/props/mlb-gen-pool";
import { LEG_MAX, generate, poolOf, specSeed, type GenLeg, type GenResult, type GenSpec } from "@/lib/parlay-gen";
import { holdTicket, movedLegs, withBoard } from "@/lib/parlay-hold";
import { dropIndex, shiftOf, zoomFactors, HOLD_MS, SLOP_PX } from "@/components/props/useSlotDrag";
import { OddsTicker, REEL_BASE_MS, REEL_STAGGER_MS, REEL_WINDOW_MS, holdReveal, landAtMs, staggerMs } from "@/components/props/ParlayReveal";
import { amToDec } from "@/lib/ticket-math";
import type { PropBoardGame } from "@/engine";

/**
 * 2026-09-26 follow-up — Josh, verbatim:
 *   1. "After parlay generator spins and rolls out the picks, it waits to finish loading 'the board' I guess? And then
 *      it changes the picks. It shouldn't change anything after it rolls them out one by one"
 *   2. "Need to move 'x' button from right below 'lock' now that everything is smaller so you don't accidentally press
 *      'x' instead of locking player in parlay"
 *   3. "Should be able to press on pick in parlay generator and drag it to wherever on list"
 *   4. "Parlay Generator should go up as high as 20 picks"
 *
 * Real engine output over the repo's own fixture board, and a synthetic pool for the 20-leg walk — nothing priced here
 * is presented as a quote.
 */
vi.stubGlobal("React", React);
(globalThis as { React?: typeof React }).React = React;
vi.mock("@/components/motion/Reveal", () => ({ Reveal: ({ children }: { children: unknown }) => children }));
vi.mock("@/lib/mlb-visuals", async (orig) => ({
  ...(await orig<typeof import("@/lib/mlb-visuals")>()),
  useHeadshots: () => ({}),
}));

const root = path.join(__dirname, "..");
const readSrc = (p: string) => stripComments(fs.readFileSync(path.join(root, p), "utf8"));
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

const FIXTURE = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/gen-pool.json"), "utf8")) as { propBoard: PropBoardGame[] };
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
const POOL = buildPool(FIXTURE.propBoard, SPEC, 0);
const RESULT = generate(POOL, SPEC, specSeed(SPEC, "2026-07-10", 0));

const sheet = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
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

/* ------------------------------------------------------------------ 1. the ticket on screen holds */

describe("1 — a ticket that has been rolled out never changes by itself", () => {
  const okA: GenResult = { ok: true, ticket: { key: "A", legs: [], outsideLegBand: [], sameGame: [], sameTeam: [], marketPriced: 0 } } as unknown as GenResult;
  const okB: GenResult = { ok: true, ticket: { key: "B", legs: [], outsideLegBand: [], sameGame: [], sameTeam: [], marketPriced: 0 } } as unknown as GenResult;
  const fail: GenResult = { ok: false, fail: { code: "no-rows" } };

  it("the same request hands back the SAME ticket and never draws — whatever the pool did in between", () => {
    const first = holdTicket(null, "req-1", true, () => okA);
    expect(first.result).toBe(okA);
    const draw = vi.fn(() => okB);
    const again = holdTicket(first.held, "req-1", true, draw);
    expect(again.result).toBe(okA);
    expect(draw).not.toHaveBeenCalled();
  });
  it("a new request (a spin, a setting, an exclusion, the board date) draws a new ticket", () => {
    const first = holdTicket(null, "req-1", true, () => okA);
    expect(holdTicket(first.held, "req-2", true, () => okB).result).toBe(okB);
  });
  it("a failure is not a ticket — it still follows the pool, so the board arriving can turn it into one", () => {
    const first = holdTicket(null, "req-1", true, () => fail);
    expect(holdTicket(first.held, "req-1", true, () => okA).result).toBe(okA);
  });
  it("a ticket drawn while the board is still on its first load is provisional, and firms up once it is ready", () => {
    const early = holdTicket(null, "req-1", false, () => okA);
    expect(early.held?.firm).toBe(false);
    const full = holdTicket(early.held, "req-1", true, () => okB);
    expect(full.result).toBe(okB);
    expect(full.held?.firm).toBe(true);
    expect(holdTicket(full.held, "req-1", true, () => okA).result).toBe(okB);
  });

  it("the hook builds its request from everything Josh controls EXCEPT the pins, and a closed sheet forgets nothing", () => {
    const hook = readSrc("src/components/props/useParlayGen.ts");
    /* the rail's category is not part of the request while several categories are on the ticket (the pool is their union) */
    expect(hook).toMatch(/const requestKey = JSON\.stringify\(\[\{ \.\.\.spec, pinned: null, market: \(spec\.markets\?\.length \?\? 0\) > 1 \? null : spec\.market \}, pricingBook, roll, board, exclusionSig, spec\.minHit != null \? inputsKey : ""\]\);/);
    /* closed, or no board for a moment (the sport switch) → nothing drawn and the held ticket untouched */
    expect(hook).toMatch(/if \(!open \|\| !boardKey\) return \{ ok: false, fail: \{ code: "no-rows" \} \};\s*if \(frozen && held\.current\) return held\.current\.result;/);
    /* another sport's legs still loading keeps the ticket provisional */
    expect(hook).toMatch(/const next = holdTicket\(held\.current, requestKey, ready && !crossPending,/);
    expect(hook).toMatch(/held\.current = next\.held;/);
    /* the pool is still a dependency — a failure must be able to follow it — but it is not part of the request */
    expect(hook).toMatch(/\[open, pool, spec, pricingBook, roll, board, boardKey, requestKey, ready, frozen, crossPending\]\);/);
    expect(hook).toMatch(/spinKey: roll,/);
    expect(hook).toMatch(/const crossPending = foreignSports\.length > 0 && foreign\.isLoading;/);
  });
  it("the board's date is sticky: a moment with no board (MLB while the switch sits on football) is not a new board", () => {
    const hook = readSrc("src/components/props/useParlayGen.ts");
    expect(hook).toMatch(/const lastBoard = useRef\(boardKey\);\s*if \(boardKey\) lastBoard\.current = boardKey;\s*const board = lastBoard\.current;/);
    expect(hook).toMatch(/const filterKey = `\$\{storageKey\}:\$\{board\}:/);
    expect(hook).toMatch(/specSeed\(spec, board, roll\)/);
  });
  it("a browse tap on the rail inside the ticket's category set neither re-rolls nor drops a recalled ticket", () => {
    const hook = readSrc("src/components/props/useParlayGen.ts");
    expect(hook).toMatch(/if \(railMarket !== spec\.market && !spec\.markets\?\.includes\(railMarket\)\) leaveRecall\(\);/);
  });
  it("both desks say when their board has finished its first load", () => {
    expect(readSrc("app/props/page.tsx")).toMatch(/ready: !q\.isPending && !browseProps\.loading,\s*inputsKey: String\(hitWindow\),/);
    /* football: the slate AND the props board; and while a Live/Mixed press is refreshing quotes the ticket is frozen */
    expect(readSrc("src/components/cfb/CfbProps.tsx")).toMatch(/ready: !loading && !propsQ\.isLoading,\s*frozen: refreshingLive \|\| !!pendingLiveSpin,/);
    for (const f of ["app/props/page.tsx", "src/components/cfb/CfbProps.tsx"]) {
      expect(readSrc(f)).toMatch(/spinKey=\{gen\.spinKey\}/);
      expect(readSrc(f)).toMatch(/moved=\{gen\.moved\}/);
    }
  });

  it("a held ticket keeps its legs and prices — a leg still posted at the SAME price is drawn as the board draws it now", () => {
    if (!RESULT.ok) throw new Error("fixture must generate");
    const bare: GenResult = { ok: true, ticket: { ...RESULT.ticket, legs: RESULT.ticket.legs.map((l) => ({ ...l, hit: null })) } };
    const hit = { n: 10, hits: 7, rate: 0.7 };
    const at = (xs: GenLeg[]) => poolOf(xs, { rows: POOL.rows, startedDropped: 0, noParlayDropped: 0 });
    const withLogs = at(POOL.legs.map((l) => ({ ...l, hit })));
    const out = withBoard(bare, withLogs);
    if (!out.ok || !bare.ok) throw new Error("ticket expected");
    expect(out.ticket.legs.map((l) => l.id)).toEqual(bare.ticket.legs.map((l) => l.id));
    expect(out.ticket.legs.map((l) => l.am)).toEqual(bare.ticket.legs.map((l) => l.am));
    expect(out.ticket.legs.map((l) => l.prob)).toEqual(bare.ticket.legs.map((l) => l.prob));
    expect(out.ticket.legs.every((l) => l.hit === hit)).toBe(true);
    /* the board's own copy is shown, so a headshot or a position filled in after the spin appears too */
    for (const l of out.ticket.legs) expect(l).toBe(withLogs.byId.get(l.id));
    /* the very same board → the very same object back (no churn) */
    expect(withBoard(out, withLogs)).toBe(out);
    /* a new window re-reads the chip, and nothing else moves */
    const l20 = { n: 20, hits: 11, rate: 0.55 };
    const moved20 = withBoard(out, at(POOL.legs.map((l) => ({ ...l, hit: l20 }))));
    if (!moved20.ok) throw new Error("ticket expected");
    expect(moved20.ticket.legs.every((l) => l.hit === l20)).toBe(true);
    expect(moved20.ticket.legs.map((l) => l.am)).toEqual(bare.ticket.legs.map((l) => l.am));
    /* a leg that left the board keeps what was spun */
    expect(withBoard(out, at([]))).toBe(out);
    /* a leg whose price, book, probability, push or quote time moved keeps exactly what was spun — chip and all */
    const first = out.ticket.legs[0];
    for (const change of [{ am: first.am + 5 }, { book: "FD" }, { prob: first.prob + 1 }, { push: 0.03 }, { quoteAt: "2026-09-26T20:00:00Z" }]) {
      const shifted = withBoard(out, at(POOL.legs.map((l) => (l.id === first.id ? { ...l, ...change, hit: l20 } : { ...l, hit }))));
      if (!shifted.ok) throw new Error("ticket expected");
      expect(shifted.ticket.legs[0]).toBe(first);
    }
  });
  it("moved counts every leg whose posted price or book changed, or that left the board", () => {
    if (!RESULT.ok) throw new Error("fixture must generate");
    const legs = RESULT.ticket.legs;
    expect(movedLegs(legs, POOL)).toBe(0);
    const shifted = POOL.legs.map((l) => (l.id === legs[0].id ? { ...l, am: l.am + 5 } : l.id === legs[1].id ? { ...l, book: "FD" } : l)).filter((l) => l.id !== legs[2].id);
    expect(movedLegs(legs, poolOf(shifted, { rows: 0, startedDropped: 0, noParlayDropped: 0 }))).toBe(3);
  });
  it("Add to slip refuses a moved ticket, and the sheet says so without swapping a leg", () => {
    const hook = readSrc("src/components/props/useParlayGen.ts");
    expect(hook).toMatch(/if \(moved > 0\) \{\s*setSetupNotice\("These quotes changed or are no longer available\. Regenerate before adding to the slip\."\);return;/);
    const out = sheet({ moved: 2 });
    expect(out).toContain('data-testid="gen-moved"');
    expect(out).toContain("2 legs moved or came off the board since this spin — Regenerate for current prices.");
    expect(sheet()).not.toContain('data-testid="gen-moved"');
  });

  it("the reveal lands on the spin's own ticket: a press HOLDS the reels, spinKey moving starts the landing", () => {
    const gen = readSrc("src/components/props/GenSheet.tsx");
    expect(gen).toMatch(/setHeld\(\{ reveal: holdReveal\(-next, performance\.now\(\)\) \}\); onGenerate\(\);/);
    expect(gen).toMatch(/if \(spinKey !== spinSeen\) \{\s*setSpinSeen\(spinKey\);\s*setHeld\(null\);\s*setReveal\(startReveal\(spinKey, spec\.legs - pinnedNow\)\);\s*\} else if \(held && !loading\) \{\s*setHeld\(null\);\s*\}/);
    expect(gen).toMatch(/const holding = !!held && loading;/);
    expect(gen).toMatch(/holding \? Infinity : landAtMs\(k\+\+, spinning\)/);
    expect(gen).toMatch(/holding \? "Getting fresh prices…"/);
    /* nothing can be added, and a tap cannot skip to a ticket that has not arrived, while the reels are held */
    expect(gen).toMatch(/disabled=\{!ticket \|\| holding\}/);
    expect(gen).toMatch(/const skipReveal = \(\) => \{ if \(!holding\) setReveal\(null\); \};/);
    /* the press no longer starts a landing of its own */
    expect(gen).not.toMatch(/setReveal\(startReveal\(next,/);
  });
  it("football: a Live/Mixed spin waits for the refreshed board, and closing the sheet cancels it", () => {
    const cfb = readSrc("src/components/cfb/CfbProps.tsx");
    expect(cfb).toMatch(/if\(!gen\.open\)\{setPendingLiveSpin\(null\);return;\}/);
    expect(cfb).toMatch(/if\(propsQ\.data!==pendingLiveSpin\.board&&propsQ\.dataUpdatedAt<pendingLiveSpin\.at\)return;/);
    expect(cfb).toMatch(/\[pendingLiveSpin,date,propsQ\.data,propsQ\.dataUpdatedAt,gen\.spin,gen\.open\]\);/);
  });
  it("a held reveal never lands and the combined odds show nothing but ··· while it spins", () => {
    const h = { spin: -1, at: 0, end: Infinity };
    expect(renderToStaticMarkup(createElement(OddsTicker, { am: 612, reveal: h }))).toBe('<span aria-hidden="true">···</span>');
    const reveal = readSrc("src/components/props/ParlayReveal.tsx");
    expect(reveal).toMatch(/const p = Number\.isFinite\(landAt\) \? Math\.max\(0, t\) \/ landAt : 0;/);
    expect(holdReveal).toBeTypeOf("function");
  });
});

/* ------------------------------------------------------------------ 2. the ✕ moves away from the lock */

describe("2 — the exclude ✕ is at the far left, the lock alone at the far right", () => {
  const out = sheet({ onExcludePlayer: () => {}, onMove: () => {} });
  const cards = out.split('data-gen-slot="').slice(1);
  it("every card opens with the ✕ and ends with the lock — nothing stacked under the lock", () => {
    expect(cards).toHaveLength(4);
    for (const c of cards) {
      const x = c.indexOf('aria-label="Exclude ');
      const no = c.indexOf('class="gen-slot-no num"');
      const lock = c.indexOf('aria-label="Lock in slot ');
      expect(x).toBeGreaterThan(-1);
      expect(x).toBeLessThan(no);
      expect(lock).toBeGreaterThan(no);
      /* the lock is the card's last button: the card closes right after it, before any other button */
      const after = c.slice(lock);
      const close = after.indexOf("</button></div>");
      const next = after.indexOf("<button");
      expect(close).toBeGreaterThan(-1);
      expect(next === -1 || next > close).toBe(true);
    }
  });
  it("the lock grew to 28px, the ✕ stays the 24px ghost, and neither can start a drag", () => {
    expect(out).toMatch(/data-no-drag="true"[^>]*aria-label="Lock in slot 1: [^"]*"[^>]*class="press relative flex h-7 w-7[^"]*before:-inset-2/);
    expect(out).toMatch(/data-no-drag="true"[^>]*aria-label="Exclude [^"]+ from generated parlays"[^>]*class="[^"]*h-6 w-6/);
  });
  it("the ▲/▼ pair is keyboard-only now — present for a screen reader or a key, invisible to a thumb", () => {
    expect(count(out, /<span data-no-drag="true" class="sr-only flex shrink-0 flex-col gap-px focus-within:not-sr-only">/g)).toBe(4);
    expect(out).toContain('aria-label="Move slot 2 up"');
  });
});

/* ------------------------------------------------------------------ 3. hold and drag anywhere */

describe("3 — hold a pick and drag it anywhere on the list", () => {
  const n = 20;
  const centers = Array.from({ length: n }, (_, i) => 20 + i * 40);
  const moveTo = <T,>(xs: readonly T[], from: number, to: number) => { const a = xs.slice(); const [m] = a.splice(from, 1); a.splice(to, 0, m); return a; };

  it("dropIndex: the card lands on the slot whose centre it is dragged over, from any slot to any slot", () => {
    for (let from = 0; from < n; from++) {
      for (let to = 0; to < n; to++) {
        /* just past the target's centre in the direction of travel */
        const y = centers[to] + (to > from ? 1 : to < from ? -1 : 0);
        expect(dropIndex(from, centers, y)).toBe(to);
      }
    }
  });
  it("dropIndex: a card nudged less than half a slot stays where it was", () => {
    for (let from = 0; from < n; from++) for (const dy of [-19, -5, 0, 5, 19]) expect(dropIndex(from, centers, centers[from] + dy)).toBe(from);
  });
  it("shiftOf opens exactly the gap the card will drop into — the preview IS the result", () => {
    const ids = Array.from({ length: n }, (_, i) => i);
    for (let from = 0; from < n; from++) {
      for (let to = 0; to < n; to++) {
        /* where each card sits on screen during the drag: its resting slot plus its shift; the lifted card takes `to` */
        const seen = ids.map((i) => (i === from ? to : i + shiftOf(i, from, to)));
        const order = ids.slice().sort((a, b) => seen[a] - seen[b]);
        expect(order).toEqual(moveTo(ids, from, to));
        expect(new Set(seen).size).toBe(n);
      }
    }
  });
  it("under the phone's 0.7 content zoom the card still follows the finger 1:1, whichever way the engine reports rects", () => {
    /* standardised zoom (rects already on screen scale): a 100px translate reads as 70 rect px */
    expect(zoomFactors(0.7, 0.7)).toEqual({ zoom: 0.7, toScreen: 1 });
    /* the older WebKit model (rects in un-zoomed units): the translate reads as 100, the ancestors' zoom decides */
    expect(zoomFactors(1, 0.7)).toEqual({ zoom: 0.7, toScreen: 0.7 });
    /* no zoom at all (desktop) */
    expect(zoomFactors(1, 1)).toEqual({ zoom: 1, toScreen: 1 });
    /* a zoom-aware engine that hides its computed zoom still gets the measured one; junk readings fall back to 1 */
    expect(zoomFactors(0.7, 1)).toEqual({ zoom: 0.7, toScreen: 1 });
    expect(zoomFactors(NaN, NaN)).toEqual({ zoom: 1, toScreen: 1 });
    /* a finger moving 70 screen px moves the card 70 screen px: translate = dy / zoom, and it renders × zoom */
    for (const [k, cz] of [[0.7, 0.7], [1, 0.7], [1, 1]] as const) {
      const { zoom } = zoomFactors(k, cz);
      expect((70 / zoom) * cz).toBeCloseTo(70, 9);
    }
    const drag = readSrc("src/components/props/useSlotDrag.ts");
    expect(drag).toMatch(/el\.style\.transform = "translateY\(100px\)";\s*st\.k = \(el\.getBoundingClientRect\(\)\.top - rects\[i\]\.top\) \/ 100;\s*el\.style\.transform = "";/);
    expect(drag).toMatch(/translateY\(\$\{dy \/ st\.zoom\}px\) scale\(1\.02\)/);
    expect(drag).toMatch(/translateY\(\$\{\(s \* st\.pitch\) \/ st\.zoom\}px\)/);
    expect(drag).toMatch(/st\.centers = rects\.map\(\(r\) => \(r\.top \+ r\.height \/ 2\) \* toScreen \+ window\.scrollY\);/);
  });
  it("a thumb has to HOLD before the card lifts, and moving first is a scroll", () => {
    expect(HOLD_MS).toBeGreaterThanOrEqual(200);
    expect(HOLD_MS).toBeLessThanOrEqual(400);
    expect(SLOP_PX).toBe(8);
    const drag = readSrc("src/components/props/useSlotDrag.ts");
    expect(drag).toMatch(/if \(touch\) st\.timer = setTimeout\(lift, HOLD_MS\);/);
    expect(drag).toMatch(/if \(dist > SLOP_PX\) end\(false\);/);
    /* once lifted the page must not scroll under the card — a NON-PASSIVE listener registered BEFORE the touch begins
       (WebKit ignores preventDefault from one added mid-touch), cancelling only while a card is lifted */
    expect(drag).toMatch(/const live = !!onMove && enabled;\s*useEffect\(\(\) => \{\s*if \(!live\) return;\s*const gate = \(ev: TouchEvent\) => \{ if \(g\.current\?\.active && ev\.cancelable\) ev\.preventDefault\(\); \};\s*window\.addEventListener\("touchmove", gate, \{ passive: false \}\);/);
    expect(drag).not.toMatch(/addEventListener\("touchmove", onTouchMove/);
    /* the controls never start a drag, and the move is committed once, synchronously, through onMove */
    expect(drag).toMatch(/closest\?\.\("\[data-no-drag\]"\)/);
    expect(drag).toMatch(/flushSync\(\(\) => moveRef\.current\?\.\(from, to\)\)/);
    /* releasing a lifted card never also taps what is under the finger */
    expect(drag).toMatch(/window\.addEventListener\("click", swallow, \{ capture: true, once: true \}\);/);
    /* the frames are DOM transforms, never a React render per move */
    expect(drag).not.toMatch(/useState/);
  });
  it("every card is grabbable while the ticket rests, and the drag switches off while the reels spin", () => {
    const out = sheet({ onMove: () => {} });
    expect(count(out, /data-drag-slot=""/g)).toBe(4);
    expect(out).toContain("select-none [-webkit-touch-callout:none]");
    const gen = readSrc("src/components/props/GenSheet.tsx");
    /* off while the reels spin, on a game-market ticket and with the sheet closed; a new ticket ends any gesture */
    expect(gen).toMatch(/const drag = useSlotDrag\(onMove, open && !gameMarket && !!ticket && !rolling, ticket\?\.key \?\? null\);/);
    expect(gen).toMatch(/<div ref=\{drag\.listRef\} className="space-y-1 sm:space-y-1\.5">/);
    expect(gen).toMatch(/onGrab=\{drag\.grab\?\.\(i\)\}/);
    expect(gen).not.toMatch(/draggable=/);
  });
  it("a gesture never commits into a list that changed under it, and a tap after a drag is never swallowed", () => {
    const drag = readSrc("src/components/props/useSlotDrag.ts");
    /* a new ticket ends the gesture before paint */
    expect(drag).toMatch(/useLayoutEffect\(\(\) => \(\) => g\.current\?\.off\(\), \[listKey\]\);/);
    /* the lift is refused unless the pressed card is still the card in that seat */
    expect(drag).toMatch(/if \(!el \|\| el !== st\.card \|\| !el\.isConnected\) return end\(false\);/);
    expect(drag).toMatch(/if \(!st\.els\[i\]\?\.isConnected\) return end\(false\);/);
    /* the move commits only for a card still in this list */
    expect(drag).toMatch(/const here = !!el\?\.isConnected && !!listRef\.current\?\.contains\(el\);/);
    /* the click swallow disarms on the next press or after 400ms */
    expect(drag).toMatch(/window\.addEventListener\("pointerdown", disarm, \{ capture: true, once: true \}\);\s*setTimeout\(disarm, 400\);/);
    expect(drag).toMatch(/!prefersReducedMotion\(\)/);
  });
  it("▲/▼ from the keyboard keep focus on the pressed button so the pair stays up for the next step", () => {
    const gen = readSrc("src/components/props/GenSheet.tsx");
    expect(gen).toMatch(/const keyStep = \(btn: HTMLButtonElement, to: number\) => \{\s*onMove\?\.\(i, to\);\s*requestAnimationFrame\(\(\) => \{\s*if \(btn\.isConnected && !btn\.disabled\) btn\.focus\(\);\s*else btn\.parentElement\?\.querySelector<HTMLButtonElement>\("button:not\(:disabled\)"\)\?\.focus\(\);/);
    expect(gen).toMatch(/onClick=\{\(e\) => keyStep\(e\.currentTarget, i - 1\)\}/);
    expect(gen).toMatch(/onClick=\{\(e\) => keyStep\(e\.currentTarget, i \+ 1\)\}/);
  });
  it("the lifted card and the opening gap are styled, and reduced motion drops the slide", () => {
    const css = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");
    expect(css).toMatch(/\.desk-content \.gen-player-card\[data-lifted\] \{ position:relative; z-index:30;/);
    expect(css).toMatch(/\[data-slots-dragging\] > \.gen-player-card:not\(\[data-lifted\]\) \{ transition:transform/);
    expect(css).toMatch(/@media \(prefers-reduced-motion:reduce\) \{ \[data-slots-dragging\] > \.gen-player-card:not\(\[data-lifted\]\) \{ transition:none; \} \}/);
  });
});

/* ------------------------------------------------------------------ 4. up to 20 picks */

function bigPool() {
  const legs: GenLeg[] = [];
  let n = 0;
  for (let g = 0; g < 15; g++) {
    const start = new Date(Date.UTC(2026, 8, 26, 17 + Math.floor(g / 2), (g % 2) * 30)).toISOString();
    for (let p = 0; p < 12; p++) for (const m of ["hits", "tb", "hrr"]) for (const side of ["o", "u"] as const) {
      const am = [-250, -180, -140, -115, 100, 120, 150, 200, 260, 320][(n++ * 7) % 10];
      const prob = 100 / amToDec(am) + ((n % 9) - 4);
      legs.push({ id: `g${g}|${m}|p${p}|${side}`, am, prob, side, label: `Player ${g}-${p}`, sub: `${m} ${side} 1.5`, leg: null, dec: amToDec(am), gameKey: `g${g}`, start, playerKey: `g${g}p${p}`, team: `T${g}${p % 2}`, started: false, alt: false, book: "DK", ev: (prob / 100) * amToDec(am) - 1, market: m, line: 1.5, src: "model" } as GenLeg);
    }
  }
  return poolOf(legs, { rows: legs.length, startedDropped: 0, noParlayDropped: 0 });
}

describe("4 — the generator builds up to 20 picks", () => {
  const pool = bigPool();
  const base: GenSpec = { market: "hits", markets: ["hits", "tb", "hrr"], legs: 20, legMinAm: -250, legMaxAm: 320, payout: null, sides: "both", onePerGame: false, onePerTeam: false, czOnly: false, includeStarted: false, modelOnly: false, pinned: [] };

  it("LEG_MAX is 20, and the stepper and the picker both reach it", () => {
    expect(LEG_MAX).toBe(20);
    const out = sheet();
    expect(out).toMatch(/<select aria-label="Choose leg count"/);
    expect(count(out, /<option value="\d+"(?: selected="")?>\d+ legs<\/option>/g)).toBe(19);
    expect(out).toContain('<option value="20">20 legs</option>');
    const at20 = sheet({ spec: { ...SPEC, legs: 20, pinned: Array(20).fill(null) } });
    expect(at20).toMatch(/aria-label="Add one leg" disabled=""/);
  });
  it("a 20-leg ticket: exactly 20 legs, 20 different players, every one a leg the pool posts", () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const r = generate(pool, base, seed);
      if (!r.ok) throw new Error(JSON.stringify(r.fail));
      expect(r.ticket.legs).toHaveLength(20);
      expect(new Set(r.ticket.legs.map((l) => l.playerKey)).size).toBe(20);
      for (const l of r.ticket.legs) expect(pool.byId.get(l.id)).toBe(l);
    }
  });
  it("the strategy search (Parlay Styles and The Model) builds 20 too", () => {
    for (const extra of [{ preferDiversity: true }, { betType: "model" as const }, { strategies: ["safe", "balanced"] }]) {
      const r = generate(pool, { ...base, ...extra }, 7);
      if (!r.ok) throw new Error(JSON.stringify(r.fail));
      expect(r.ticket.legs).toHaveLength(20);
    }
  });
  it("one leg per game on a 15-game slate cannot reach 20 — it says so and names the switch, never quietly builds fewer", () => {
    const r = generate(pool, { ...base, onePerGame: true }, 1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fail.code).toBe("short-pool");
    if (r.fail.code !== "short-pool") return;
    expect(r.fail.want).toBe(20);
    expect(r.fail.relax).toBe("same-game");
  });
  it("a single style whose shape rule refuses every 20-leg draw says exactly that — never 'Only 0 legs clear these filters'", () => {
    const r = generate(pool, { ...base, strategies: ["anchor"] }, 1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fail).toEqual({ code: "style-shape", style: "anchor", legs: 20, why: null });
    const line = genFailLine(r.fail, { marketLabel: "Hits", legs: 20, loAm: -250, hiAm: 320 });
    expect(line).toBe("No 20-leg ticket on this board fits the Anchor + Kicker style's shape — try fewer legs or add another style.");
    /* several styles picked: a spin draws another of them */
    expect(genFailLine(r.fail, { marketLabel: "Hits", legs: 20, loAm: -250, hiAm: 320, styles: 3 })).toBe(
      "No 20-leg ticket on this board fits the Anchor + Kicker style's shape — try fewer legs or Regenerate to draw another of your styles.",
    );
    /* the old catch-all "Use every parlay style" button is gone — it threw away the styles Josh chose */
    expect(readSrc("src/components/props/GenSheet.tsx")).not.toMatch(/Use every parlay style/);
  });
  it("a style that can never be met names the ONE control that would fix it", () => {
    /* Same Game Stacks with one leg per game on: the relax button allows same-game legs */
    const stacks = generate(pool, { ...base, legs: 4, strategies: ["stacks"], onePerGame: true }, 1);
    expect(stacks.ok).toBe(false);
    if (stacks.ok) return;
    expect(stacks.fail).toEqual({ code: "style-shape", style: "stacks", legs: 4, why: "same-game" });
    expect(genFailLine(stacks.fail, { marketLabel: "Hits", legs: 4, loAm: -250, hiAm: 320 })).toMatch(/allow legs from the same game and it can build\.$/);
    expect(readSrc("src/components/props/GenSheet.tsx")).toMatch(/fail\?\.code === "style-shape" && fail\.why === "same-game"\s*\? \{ label: RELAX_BUTTON\["same-game"\], patch: RELAX_PATCH\["same-game"\] \}/);
    /* Anchor + Kicker with no plus-money leg in the band */
    const anchor = generate(pool, { ...base, legs: 4, legMaxAm: -115, strategies: ["anchor"] }, 1);
    expect(anchor.ok).toBe(false);
    if (anchor.ok) return;
    expect(anchor.fail).toEqual({ code: "style-shape", style: "anchor", legs: 4, why: "no-plus" });
    expect(genFailLine(anchor.fail, { marketLabel: "Hits", legs: 4, loAm: -250, hiAm: -115 })).toMatch(/raise the max odds above \+100\.$/);
    /* Time Hedge on a slate where every game starts together */
    const together = poolOf(pool.legs.map((l) => ({ ...l, start: "2026-09-26T23:05:00.000Z" })), { rows: pool.rows, startedDropped: 0, noParlayDropped: 0 });
    const hedge = generate(together, { ...base, legs: 4, strategies: ["hedge"] }, 1);
    expect(hedge.ok).toBe(false);
    if (hedge.ok) return;
    expect(hedge.fail).toEqual({ code: "style-shape", style: "hedge", legs: 4, why: "one-window" });
    expect(genFailLine(hedge.fail, { marketLabel: "Hits", legs: 4, loAm: -250, hiAm: 320 })).toMatch(/every game in this pool starts inside one window\.$/);
  });
  it("Longshot builds 20 legs (no finite ceiling past 8) and its misses name the +7500 floor", () => {
    const r = generate(pool, { ...base, strategies: ["longshot"] }, 3);
    if (!r.ok) throw new Error(JSON.stringify(r.fail));
    expect(r.ticket.legs).toHaveLength(20);
    const strat = readSrc("src/lib/parlay-strategy.ts");
    expect(strat).toMatch(/maxAm:spec\.payout\?\.maxAm\?\?\(spec\.legs<=8\?1_000_000:1e300\)/);
    const reach = { minAm: 900, maxAm: 4000 };
    expect(genFailLine({ code: "payout-unreachable", reach }, { marketLabel: "Hits", legs: 3, loAm: -250, hiAm: 320, styleBand: true })).toMatch(/^The Longshot style needs \+7500 or longer combined/);
    expect(genFailLine({ code: "payout-unreachable", reach }, { marketLabel: "Hits", legs: 3, loAm: -250, hiAm: 320 })).toMatch(/your target payout sits outside that/);
    const gen = readSrc("src/components/props/GenSheet.tsx");
    /* a style band is not Josh's target, so "Remove combined payout target" is offered only when he set one */
    expect(gen).toMatch(/fail\?\.code === "payout-unreachable" && spec\.payout != null/);
    expect(gen).toMatch(/styleBand: spec\.payout == null,/);
  });
  it("a saved setup of up to 20 legs loads back", () => {
    const setup = readSrc("src/lib/parlay-gen-setup.ts");
    expect(setup).toMatch(/s\.legs < LEG_MIN \|\| s\.legs > LEG_MAX/);
  });
  it("a 20-leg reveal still lands inside the reel window; four legs land exactly as before", () => {
    expect(staggerMs(4)).toBe(REEL_STAGGER_MS);
    expect(staggerMs(10)).toBe(REEL_STAGGER_MS);
    expect(landAtMs(3, 4)).toBe(REEL_BASE_MS + 3 * REEL_STAGGER_MS);
    expect(landAtMs(19, 20)).toBeLessThanOrEqual(REEL_BASE_MS + REEL_WINDOW_MS);
    for (let k = 1; k < 20; k++) expect(landAtMs(k, 20)).toBeGreaterThan(landAtMs(k - 1, 20));
  });
});

/* ------------------------------------------------------------------ the slip's figures at 20 legs */

describe("the slip's stat tiles hold a 20-leg payout", () => {
  it("long figures step down a size and wrap inside their tile instead of spilling out of it", () => {
    for (const f of ["src/components/props/Slip.tsx", "src/components/cfb/CfbSlip.tsx"]) {
      const src = readSrc(f);
      expect(src).toMatch(/mt-1 min-w-0 font-bold \[overflow-wrap:anywhere\] \$\{value\.length > 8 \? "text-\[10\.5px\] leading-tight" : "text-\[13px\]"\}/);
      expect(src).toMatch(/mt-1 min-w-0 text-\[8\.5px\] text-faint \[overflow-wrap:anywhere\]/);
    }
  });
});
