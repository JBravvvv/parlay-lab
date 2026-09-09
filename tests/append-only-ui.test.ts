import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildCfbBoard } from "@/lib/cfb/model";
import { buildCfbCard } from "@/lib/cfb/card";
import { CFB_PAPER } from "@/lib/cfb/rules";
import type { CfbCard, CfbLedgerEntry, CfbSlate } from "@/lib/cfb/types";

/**
 * INSTRUCTION 48 (2026-09-09) — the UI half. Josh: "it can lock multiple times per day, but it can
 * never remove a pick it can only add to it". The three screens that show a locked day each say a
 * partly-filled day is still filling and that seated tickets never change:
 *
 *   - CFB Builder (src/components/cfb/CfbBuilder.tsx, LockedSummary): `cfb-locked-filling` while
 *     core < daily on a non-no-play day — rendered here with react-dom/server exactly the way
 *     tests/cfb-builder-ui.test.ts renders the Builder (same mocks, same fixture, same clock).
 *   - MLB Builder (app/builder/page.tsx): `mlb-locked-filling` while coreSum < locked.daily AND a
 *     game in locked.games still starts after `now`. The page reads a dozen live hooks the suite has
 *     never mocked, so the condition and the copy are pinned at source, the same way the CFB suite
 *     pins `lockedLine` at source.
 *   - Ledger (app/ledger/page.tsx, DayCard): the summary reads "$deployed of $(daily + fun)" — "$25
 *     of $175" for the day Josh saw — deployed summed from core + funT stakes. Pinned at source.
 */
vi.stubGlobal("React", React);

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const CFB_BUILDER = "src/components/cfb/CfbBuilder.tsx";
const MLB_BUILDER = "app/builder/page.tsx";
const LEDGER = "app/ledger/page.tsx";

const FIX = path.join(ROOT, "tests", "fixtures", "cfb");
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8"));
const NOW = Date.parse("2026-09-05T12:00:00Z");
const DATE = "2026-09-05";
function slateOf(): CfbSlate {
  const espn = readJson("espn-scoreboard-2026-09-05.json") as { events: unknown[] };
  const board = buildCfbBoard({ date: DATE, espnEvents: espn.events, oddsEvents: readJson("odds-ncaaf-2026-09-05.json"), fpi: readJson("espn-fpi.json"), now: NOW, bankroll: 2500 });
  return { ...board, finals: {}, quota: { remaining: null, used: null }, oddsMissing: false };
}
const SLATE = slateOf();
const CARD: CfbCard = buildCfbCard(SLATE, { bankroll: 2500, daily: CFB_PAPER.daily, fun: CFB_PAPER.fun, now: NOW });

const desk = {
  today: DATE,
  date: DATE,
  rail: [DATE],
  pick: vi.fn(),
  bankroll: 2500,
  q: { isPending: false, isFetching: false, isError: false, error: null, refetch: vi.fn() },
  slate: SLATE as CfbSlate | null,
};
vi.mock("@/lib/cfb/useCfbDesk", async (orig) => ({ ...(await orig<object>()), useCfbDesk: () => desk }));
const ledger = { entries: [] as CfbLedgerEntry[], lock: vi.fn() };
vi.mock("@/lib/cfb/store", async (orig) => ({ ...(await orig<object>()), useCfbLedger: () => ledger }));
vi.mock("@/lib/cfb/sync", async (orig) => ({ ...(await orig<object>()), syncCfbNow: vi.fn() }));
vi.mock("@/components/motion/Reveal", () => ({ Reveal: ({ children }: { children: unknown }) => children }));

async function render(): Promise<string> {
  const { CfbBuilder } = await import("@/components/cfb/CfbBuilder");
  return renderToStaticMarkup(createElement(CfbBuilder));
}
async function lockedEntry(over: Partial<CfbLedgerEntry> = {}): Promise<CfbLedgerEntry> {
  const { lockCfbCard } = await import("@/lib/cfb/ledger");
  return { ...lockCfbCard(CARD, SLATE, NOW + 60_000), ...over } as CfbLedgerEntry;
}
const sum = (t: { stake: number }[]) => t.reduce((s, x) => s + x.stake, 0);

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  ledger.entries = [];
  desk.slate = SLATE;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("INSTRUCTION 48 UI — the CFB Builder's locked block says a short day is still filling", () => {
  it("a server-locked day with one $25 core ticket renders cfb-locked-filling with '$25 of $<daily>' and 'never change'", async () => {
    const one = { ...CARD.core[0], stake: 25 };
    const entry = await lockedEntry({ source: "server-lock", core: [one] });
    expect(entry.daily).toBe(CFB_PAPER.daily);
    ledger.entries = [entry];
    const html = await render();
    const p = html.match(/<p data-testid="cfb-locked-filling" class="([^"]*)">([^<]*)<\/p>/);
    expect(p, "the still-filling line").not.toBeNull();
    expect(p![1]).toMatch(/\btext-gold\b/);
    expect(p![2]).toContain(`Still filling — $25 of $${entry.daily} core placed`);
    expect(p![2]).toMatch(/Locked tickets never change\./);
    /* the money cell still shows what is actually seated */
    expect(html).toContain(">$25</div>");
  });

  it("a fully deployed day (core == daily) renders no filling line", async () => {
    /* the fixture card seats $150 of the $250 CFB day, so the day's allotment is pinned to what seated */
    const base = await lockedEntry({ source: "server-lock" });
    const entry = { ...base, daily: sum(base.core) };
    expect(sum(entry.core)).toBe(entry.daily);
    ledger.entries = [entry];
    const html = await render();
    expect(html).not.toContain('data-testid="cfb-locked-filling"');
  });

  it("a NO-PLAY day ($0 core) renders no filling line — nothing is being filled", async () => {
    const entry = await lockedEntry({ core: [], funT: [], noPlay: true });
    ledger.entries = [entry];
    const html = await render();
    expect(html).not.toContain('data-testid="cfb-locked-filling"');
  });

  it("a DEVICE-locked short day renders no filling line — the server never tops up a day whose source is not its own (fix round, defect 4)", async () => {
    const one = { ...CARD.core[0], stake: 25 };
    const entry = await lockedEntry({ core: [one] });
    expect(entry.source).not.toBe("server-lock");
    ledger.entries = [entry];
    const html = await render();
    expect(html).not.toContain('data-testid="cfb-locked-filling"');
  });

  it("a server-locked short day whose games have ALL kicked off renders no filling line — decideTopUp refuses it (fix round, defect 15)", async () => {
    const one = { ...CARD.core[0], stake: 25 };
    const base = await lockedEntry({ source: "server-lock", core: [one] });
    const games = Object.fromEntries(Object.entries(base.games ?? {}).map(([k, g]) => [k, { ...g, start: new Date(NOW - 3 * 3_600_000).toISOString() }]));
    ledger.entries = [{ ...base, games }];
    const html = await render();
    expect(html).not.toContain('data-testid="cfb-locked-filling"');
  });

  it("source: the gate is server-lock + !noPlay + core < daily + a game still ahead", () => {
    const src = read(CFB_BUILDER);
    expect(src).toContain("{locked.source === L.lockSource &&");
    expect(src).toContain("sumStakes(locked.core) < locked.daily &&");
    expect(src).toMatch(/Object\.values\(locked\.games \?\? \{\}\)\.some\(\(g\) => g\?\.start && Date\.parse\(g\.start\) > Date\.now\(\)\)/);
    expect(src).toContain('data-testid="cfb-locked-filling"');
  });
});

describe("INSTRUCTION 48 UI — the MLB Builder's locked panel (pinned at source)", () => {
  const src = read(MLB_BUILDER);
  it("renders mlb-locked-filling only when coreSum < locked.daily AND a locked game still starts after now", () => {
    const at = src.indexOf('data-testid="mlb-locked-filling"');
    expect(at).toBeGreaterThan(0);
    const before = src.slice(at - 600, at);
    expect(before).toContain("const coreSum = locked.core.reduce((s, t) => s + t.stake, 0);");
    expect(before).toMatch(/const pregame = Object\.values\(locked\.games \?\? \{\}\)\.some\(\(g\) => g\?\.start && Date\.parse\(g\.start\) > now\);/);
    expect(before).toContain("return coreSum < locked.daily && pregame ? (");
  });
  it("the copy names the placed sum against the allotment and says a locked ticket never changes", () => {
    const at = src.indexOf('data-testid="mlb-locked-filling"');
    const after = src.slice(at, at + 400);
    expect(after).toContain("Still filling — {fmtMoney(coreSum)} of {fmtMoney(locked.daily)} core placed.");
    expect(after).toMatch(/a locked ticket never changes\./);
    expect(after).toContain(") : null;");
  });
  it("the panel header still says append-only, no retroactive edits", () => {
    expect(src).toContain("append-only, no retroactive edits.");
  });
});

describe("INSTRUCTION 48 UI — the ledger day row shows placed-of-allotment (pinned at source)", () => {
  const src = read(LEDGER);
  it("DayCard sums core + funT stakes into `deployed` and prints `$deployed of $(daily + fun)`", () => {
    expect(src).toContain("const tix = [...e.core, ...e.funT];");
    expect(src).toContain("const deployed = tix.reduce((s, t) => s + (Number(t.stake) || 0), 0);");
    expect(src).toContain("{tix.length} tickets · ${Math.round(deployed * 100) / 100} of ${e.daily + e.fun}");
  });
  it("the day Josh saw — one $25 core ticket on a $150 + $25 day — reads '1 tickets · $25 of $175'", () => {
    const e = { core: [{ stake: 25 }], funT: [] as { stake: number }[], daily: 150, fun: 25 };
    const tix = [...e.core, ...e.funT];
    const deployed = tix.reduce((s, t) => s + (Number(t.stake) || 0), 0);
    expect(`${tix.length} tickets · $${deployed} of $${e.daily + e.fun}`).toBe("1 tickets · $25 of $175");
  });
});
