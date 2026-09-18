import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { stripComments } from "./helpers/source";
import { GenSheet } from "@/components/props/GenSheet";
import { MLB_GEN_MARKETS, buildPool } from "@/components/props/mlb-gen-pool";
import { generate, specSeed, type GenSpec } from "@/lib/parlay-gen";
import type { PropBoardGame } from "@/engine";

/**
 * 2026-09-18, Josh's word, verbatim: "Would also look better with numbers next to the picks
 * generated so its easy to see how many picks if someone is looking over your shoulder etc. and
 * ability to reorder/drag the picks so if im keeping the bottom pick i can drag it to top, hit the
 * 'lock it in' button on the pick then regenerate the ones below it".
 *
 * Two halves. (1) The sheet: every slot wears its number, every slot is draggable and has ▲/▼
 * buttons (first slot cannot go up, last cannot go down), and the pin button says "Lock in".
 * (2) The engine: a pin is a leg id and the seat it sits in — moving the pinned leg from slot 0
 * to slot 3 must give the SAME ticket (same key, same legs) with the pin in the new seat, so the
 * regenerate after a drag re-rolls only the unlocked slots, exactly as he described.
 *
 * Same fixture and shims as tests/parlay-gen-ui.test.ts (real engine output, nothing invented).
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
const PROP_BOARD = FIXTURE.propBoard;

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

describe("the sheet — numbered, draggable, lock-in slots", () => {
  it("the fixture ticket fills four slots (precondition for everything below)", () => {
    expect(RESULT.ok).toBe(true);
    if (RESULT.ok) expect(RESULT.ticket.legs).toHaveLength(4);
  });

  it("every slot wears its number 1..4 so a bystander can count the picks", () => {
    const out = sheet({ onMove: () => {} });
    expect(count(out, /class="gen-slot-no num"/g)).toBe(4);
    for (const n of [1, 2, 3, 4]) expect(out).toContain(`class="gen-slot-no num">${n}<`);
  });

  it("with onMove every slot is draggable and has ▲/▼ — slot 1 cannot go up, slot 4 cannot go down", () => {
    const out = sheet({ onMove: () => {} });
    expect(count(out, /draggable="true"/g)).toBe(4);
    for (const n of [1, 2, 3, 4]) {
      expect(out).toContain(`aria-label="Move slot ${n} up"`);
      expect(out).toContain(`aria-label="Move slot ${n} down"`);
    }
    expect(out).toMatch(/aria-label="Move slot 1 up" disabled=""/);
    expect(out).toMatch(/aria-label="Move slot 4 down" disabled=""/);
    expect(out).not.toMatch(/aria-label="Move slot 2 up" disabled=""/);
    expect(out).not.toMatch(/aria-label="Move slot 3 down" disabled=""/);
    expect(out).toContain("drag or ▲▼ to reorder · lock what you like, then regenerate");
  });

  it("without onMove nothing is draggable and no arrows render (the numbers stay)", () => {
    const out = sheet();
    expect(out).not.toMatch(/draggable="true"/);
    expect(out).not.toMatch(/aria-label="Move slot/);
    expect(count(out, /class="gen-slot-no num"/g)).toBe(4);
  });

  it('the pin button is the "lock it in" button, one per slot, unlocked by default', () => {
    const out = sheet({ onMove: () => {} });
    expect(count(out, /aria-label="Lock in slot \d: /g)).toBe(4);
    expect(out).not.toMatch(/aria-label="Unlock slot/);
    expect(out).toContain(">lock in<");
  });

  it("a locked slot says so", () => {
    if (!RESULT.ok) return;
    const pinned = [RESULT.ticket.legs[3].id, null, null, null] as GenSpec["pinned"];
    const spec = { ...SPEC, pinned };
    const out = sheet({ spec, result: generate(POOL, spec, specSeed(spec, "2026-07-10", 0)), onMove: () => {} });
    expect(out).toMatch(/aria-label="Unlock slot 1: /);
    expect(count(out, /aria-label="Lock in slot \d: /g)).toBe(3);
  });
});

describe("the engine — a pin travels with its seat", () => {
  it("the same locked leg at slot 1 vs slot 4 produces the same ticket, seated where the pin is", () => {
    expect(RESULT.ok).toBe(true);
    if (!RESULT.ok) return;
    const keep = RESULT.ticket.legs[3].id; // "if im keeping the bottom pick"
    const atTop = { ...SPEC, pinned: [keep, null, null, null] as GenSpec["pinned"] };
    const atBottom = { ...SPEC, pinned: [null, null, null, keep] as GenSpec["pinned"] };
    const top = generate(POOL, atTop, specSeed(atTop, "2026-07-10", 0));
    const bottom = generate(POOL, atBottom, specSeed(atBottom, "2026-07-10", 0));
    expect(top.ok && bottom.ok).toBe(true);
    if (!top.ok || !bottom.ok) return;
    expect(top.ticket.legs[0].id).toBe(keep);
    expect(bottom.ticket.legs[3].id).toBe(keep);
    expect(top.ticket.key).toBe(bottom.ticket.key);
    expect([...top.ticket.legs.map((l) => l.id)].sort()).toEqual([...bottom.ticket.legs.map((l) => l.id)].sort());
  });

  it("the pin is not part of the seed — moving a lock never re-rolls the unlocked slots on its own", () => {
    const a = { ...SPEC, pinned: ["x", null, null, null] as GenSpec["pinned"] };
    const b = { ...SPEC, pinned: [null, null, null, "x"] as GenSpec["pinned"] };
    expect(specSeed(a, "2026-07-10", 0)).toBe(specSeed(b, "2026-07-10", 0));
    expect(specSeed(a, "2026-07-10", 0)).toBe(specSeed(SPEC, "2026-07-10", 0));
  });
});

describe("wiring — the hook exposes reorder and both desks hand it to the sheet", () => {
  const hook = readSrc("src/components/props/useParlayGen.ts");
  const sheetSrc = readSrc("src/components/props/GenSheet.tsx");
  it("useParlayGen returns reorder(from, to) and applies the order to the recalled or generated result", () => {
    expect(hook).toMatch(/reorder: \(from: number, to: number\) => void;/);
    expect(hook).toMatch(/const reorder = \(from: number, to: number\) => \{/);
    expect(hook).toMatch(/applyOrder\(baseResult, order\)/);
    expect(hook).toMatch(/\breorder,\n/);
  });
  it("reorder moves the pin with the leg only when something is locked (no spec churn otherwise)", () => {
    expect(hook).toMatch(/if \(!pinned\.some\(Boolean\)\) return sp;/);
    expect(hook).toMatch(/const \[pin\] = pinned\.splice\(from, 1\);\s*pinned\.splice\(to, 0, pin \?\? null\);/);
  });
  it("applyOrder only re-seats the ticket it was recorded against (key match) and never drops a leg", () => {
    expect(hook).toMatch(/order\.key !== r\.ticket\.key\) return r;/);
    expect(hook).toMatch(/legs\.length !== r\.ticket\.legs\.length\) return r;/);
  });
  it("GenSheet takes onMove and mounts it on the main ticket slots; the MLB and football desks pass gen.reorder", () => {
    expect(sheetSrc).toMatch(/onMove\?: \(from: number, to: number\) => void;/);
    expect(sheetSrc).toMatch(/onMove=\{onMove\}/);
    expect(readSrc("app/props/page.tsx")).toMatch(/onMove=\{gen\.reorder\}/);
    expect(readSrc("src/components/cfb/CfbProps.tsx")).toMatch(/onMove=\{gen\.reorder\}/);
  });
  it("the ticket header stacks under the filters — no side-by-side grid, no sticky column", () => {
    expect(sheetSrc).not.toMatch(/@3xl:sticky @3xl:top-4/);
    expect(sheetSrc).not.toMatch(/grid items-start gap-4 @3xl:grid-cols-2/);
  });
  it("the slot number style exists in globals.css", () => {
    expect(fs.readFileSync(path.join(root, "app/globals.css"), "utf8")).toMatch(/\.gen-slot-no \{/);
  });
});
