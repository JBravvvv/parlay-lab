import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildCfbBoard } from "@/lib/cfb/model";
import { buildCfbCard } from "@/lib/cfb/card";
import { CFB_PAPER } from "@/lib/cfb/rules";
import type { CfbCard, CfbLedgerEntry, CfbSlate } from "@/lib/cfb/types";
import { stripComments } from "./helpers/source";

/**
 * THE CFB BUILDER ON THE PHONE (INSTRUCTION 46, 2026-09-08, Josh's word, verbatim: "Builder UI on
 * phone app version is atrocious (screenshot 9/7/26 4:11pm)").
 *
 * HOW THESE RENDER. The suite runs in vitest's node environment — no jsdom is installed in this
 * repo — so the Builder is rendered to static markup with react-dom/server under mocked desk /
 * ledger hooks, and the assertions are on STRUCTURE and CLASSES (the phone-vs-md split is
 * Tailwind's `md:` / `max-md:` variants, which a DOM cannot measure either way): what a 375px
 * viewport shows is whatever carries no `md:`-only display, what it hides is `hidden md:…`. The
 * one thing a static render cannot do is click, so the LOCK is exercised as the value it became —
 * `lockOutcome` — plus a source pin that the button's onClick reaches it.
 *
 * vitest's esbuild transform compiles the app's .tsx with the classic JSX runtime under this
 * tsconfig (jsx: preserve), so a server render needs React on the global — stubbed once here.
 */
vi.stubGlobal("React", React);

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const BUILDER = "src/components/cfb/CfbBuilder.tsx";
const BANK = "src/components/cfb/CfbBankPanel.tsx";

const FIX = path.join(ROOT, "tests", "fixtures", "cfb");
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8"));
/* the real 2026-09-05 fixture, read at noon UTC that day so no game has kicked off */
const NOW = Date.parse("2026-09-05T12:00:00Z");
const DATE = "2026-09-05";
function slateOf(): CfbSlate {
  const espn = readJson("espn-scoreboard-2026-09-05.json") as { events: unknown[] };
  const board = buildCfbBoard({ date: DATE, espnEvents: espn.events, oddsEvents: readJson("odds-ncaaf-2026-09-05.json"), fpi: readJson("espn-fpi.json"), now: NOW, bankroll: 2500 });
  return { ...board, finals: {}, quota: { remaining: null, used: null }, oddsMissing: false };
}
const SLATE = slateOf();
const CARD: CfbCard = buildCfbCard(SLATE, { bankroll: 2500, daily: CFB_PAPER.daily, fun: CFB_PAPER.fun, now: NOW });

/* ---------- the mocked desk: today's slate, the CFB bank at base, a lock that records its calls ---------- */
const desk = {
  today: DATE,
  date: DATE,
  rail: [DATE],
  pick: vi.fn(),
  bankroll: 2500,
  q: { isPending: false, isFetching: false, isError: false, error: null, refetch: vi.fn() },
  slate: SLATE as CfbSlate | null,
};
vi.mock("@/components/cfb/CfbBoard", () => ({ useCfbDesk: () => desk }));
const ledger = { entries: [] as CfbLedgerEntry[], lock: vi.fn() };
vi.mock("@/lib/cfb/store", async (orig) => ({ ...(await orig<object>()), useCfbLedger: () => ledger }));
vi.mock("@/lib/cfb/sync", () => ({ syncCfbNow: vi.fn() }));
/* the scroll-reveal wrapper is motion; the markup under test is its children */
vi.mock("@/components/motion/Reveal", () => ({ Reveal: ({ children }: { children: unknown }) => children }));

async function render(): Promise<string> {
  const { CfbBuilder } = await import("@/components/cfb/CfbBuilder");
  return renderToStaticMarkup(createElement(CfbBuilder));
}

/** a locked day built from the fixture card by the store's own lock helper */
async function lockedEntry(over: Partial<CfbLedgerEntry> = {}): Promise<CfbLedgerEntry> {
  const { lockCfbCard } = await import("@/lib/cfb/ledger");
  return { ...lockCfbCard(CARD, SLATE, NOW + 60_000), ...over } as CfbLedgerEntry;
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  ledger.entries = [];
  ledger.lock.mockReset();
  desk.slate = SLATE;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("cfb-builder-ui — the fixture card is a real card (so the render is a real render)", () => {
  it("2026-09-05 builds a playable core and a fun parlay at noon UTC", () => {
    expect(CARD.noPlay).toBe(false);
    expect(CARD.core.length).toBeGreaterThan(0);
    expect(CARD.notes.length).toBeGreaterThan(0);
  });
});

describe("cfb-builder-ui — the first screen on a phone", () => {
  it("renders the one-line money strip for phones (Core · Fun · Bank · Exposure) and hides the four tiles below md", async () => {
    const html = await render();
    const strip = html.match(/<div class="([^"]*)" role="group" aria-label="CFB money" data-testid="cfb-money-strip">/);
    expect(strip, "the money strip").not.toBeNull();
    expect(strip![1]).toMatch(/\bgrid-cols-4\b/);
    expect(strip![1]).toMatch(/\bmd:hidden\b/);
    for (const label of ["Core", "Fun", "Bank", "Exposure"]) expect(html).toContain(`>${label}</div>`);
    expect(html).toContain(`>$${CFB_PAPER.daily}</div>`);
    expect(html).toContain(`>$${CFB_PAPER.fun}</div>`);
    expect(html).toContain(">$2,500</div>");
    const tiles = html.match(/<div class="([^"]*)" data-testid="cfb-money-tiles">/);
    expect(tiles, "the md+ tiles").not.toBeNull();
    expect(tiles![1]).toMatch(/\bhidden\b/);
    expect(tiles![1]).toMatch(/\bmd:grid\b/);
    expect(tiles![1]).toMatch(/\bmd:grid-cols-4\b/);
  });

  it("the paper banner keeps the money on every width and folds the 'since' clause below sm", async () => {
    const html = await render();
    expect(html).toContain("🏈 CFB paper");
    expect(html).toContain(`· $${CFB_PAPER.daily} core + $${CFB_PAPER.fun} fun per slate day`);
    expect(html).toMatch(new RegExp(`<span class="hidden sm:inline"> since ${CFB_PAPER.since} · separate ledger &amp; bank</span>`));
  });

  it("the card's headline is a three-cell stat row (tickets · deployed · avg EV), not a sentence", async () => {
    const html = await render();
    const head = html.match(/<div class="([^"]*)" role="group" aria-label="Core card headline" data-testid="cfb-card-headline">/);
    expect(head).not.toBeNull();
    expect(head![1]).toMatch(/\bgrid-cols-3\b/);
    expect(html).toContain(`>${CARD.core.length}</div>`);
    expect(html).toContain(">Avg EV</div>");
    expect(html).not.toMatch(/ticket[s]? · \$\d+ of \$\d+ deployed/);
  });

  it("the Deployed cell renders the core sum large with '/ $150' as an 11px sub-line — '$150 / $150' at 18px mono (~114px) does not fit an ~89px cell at 375px", async () => {
    const html = await render();
    /* the whole figure never sits in one cell value */
    expect(html).not.toContain(`>$${CARD.coreSum} / $${CFB_PAPER.daily}</div>`);
    const cell = html.match(/<div class="([^"]*)">Deployed<\/div><div class="([^"]*)">\$(\d+)<\/div><div class="([^"]*)">\/ \$(\d+)<\/div>/);
    expect(cell, "the Deployed cell: label · big figure · sub-line").not.toBeNull();
    expect(Number(cell![3])).toBe(CARD.coreSum);
    expect(Number(cell![5])).toBe(CFB_PAPER.daily);
    expect(cell![2]).toContain("text-[18px]");
    expect(cell![2]).toContain("whitespace-nowrap");
    expect(cell![2]).not.toMatch(/\bdisplay\b/);
    expect(cell![4]).toContain("text-[11px]");
    expect(cell![4]).toContain("num");
    /* the source never joins the two figures into one string again */
    expect(stripComments(read(BUILDER))).not.toContain("${card.coreSum} / $${CFB_PAPER.daily}");
  });
});

describe("cfb-builder-ui — tickets stack on a phone, carousel at md+", () => {
  it("every ticket list is the .carousel strip with the phone stacking overrides marked important", async () => {
    const html = await render();
    const lists = [...html.matchAll(/<div class="([^"]*)" role="list" aria-label="([^"]+)">/g)];
    expect(lists.map((m) => m[2])).toEqual(expect.arrayContaining(["Core tickets"]));
    for (const m of lists) {
      expect(m[1], m[2]).toMatch(/^carousel /);
      expect(m[1], m[2]).toContain("max-md:flex-col!");
      expect(m[1], m[2]).toContain("max-md:overflow-visible!");
      expect(m[1], m[2]).toContain("max-md:snap-none!");
      /* the bleed is md+ only — a stacked slip sits inside the panel's own padding */
      expect(m[1], m[2]).not.toMatch(/(^| )-mx-5( |$)/);
      expect(m[1], m[2]).toContain("md:-mx-5");
    }
    const items = [...html.matchAll(/<div role="listitem" class="([^"]*)">/g)];
    expect(items.length).toBe(CARD.core.length + CARD.funT.length);
    for (const m of items) {
      expect(m[1]).toContain("max-md:w-full");
      expect(m[1]).not.toContain("82vw");
    }
    expect(html).not.toContain("swipe for the next ticket");
  });
  it("the source keeps the .carousel pin tests/cfb-card-ui.test.ts reads", () => {
    expect(read(BUILDER)).toMatch(/className="carousel[\s"]/);
    expect(read(BUILDER)).toMatch(/className="carousel max-md:flex-col! max-md:overflow-visible! max-md:snap-none! md:-mx-5 md:px-5"/);
  });
});

describe("cfb-builder-ui — the notes fold, the lock row is sticky and bottom-safe", () => {
  it("the builder's notes render as a details titled 'Builder notes (N)', collapsed by default", async () => {
    const html = await render();
    const m = html.match(/<details class="([^"]*)" data-testid="cfb-builder-notes">/);
    expect(m, "the notes details").not.toBeNull();
    expect(m![1]).not.toMatch(/\bopen\b/);
    expect(html).not.toMatch(/<details[^>]*data-testid="cfb-builder-notes"[^>]*\bopen\b/);
    expect(html).toContain(`Builder notes (${CARD.notes.length})`);
    /* the fold's summary is a tap target: 40px minimum on a phone */
    const summary = html.match(/<summary class="([^"]*)">/);
    expect(summary, "the fold summary").not.toBeNull();
    expect(summary![1]).toContain("min-h-[40px]");
    for (const n of CARD.notes) expect(html).toContain(n.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;"));
  });

  it("the LOCK button exists, is a full-width 48px pill on phones, and sits in a sticky row offset by the shell inset", async () => {
    const html = await render();
    const row = html.match(/<div class="([^"]*)" style="([^"]*)" data-testid="cfb-lock-row">/);
    expect(row, "the lock row").not.toBeNull();
    expect(row![1]).toMatch(/\bsticky\b/);
    expect(row![1]).toMatch(/\bmd:static\b/);
    /* no tab bar measured in a static render → 0 + the 8px breathing room */
    expect(row![2]).toBe("bottom:8px");
    const btn = html.match(/<button class="([^"]*)" aria-label="Lock card">🔒 Lock card<\/button>/);
    expect(btn, "the lock button").not.toBeNull();
    expect(btn![1]).toContain("min-h-[48px]");
    expect(btn![1]).toContain("w-full");
    expect(btn![1]).toContain("md:w-auto");
    expect(html).toContain(`Locks $${CARD.coreSum} core + $${CARD.funSum} fun for Today`);
  });

  it("the button's onClick is the lock: doLock → lockOutcome → the store's lock, once, with the card and its slate", async () => {
    const src = stripComments(read(BUILDER));
    expect(src).toMatch(/onClick=\{doLock\}/);
    expect(src).toMatch(/setStatus\(lockOutcome\(lock, card, slate, today\)\)/);
    const { lockOutcome } = await import("@/components/cfb/CfbBuilder");
    const entry = await lockedEntry();
    const lock = vi.fn().mockReturnValue({ entry, refused: false });
    const line = lockOutcome(lock, CARD, SLATE, DATE);
    expect(lock).toHaveBeenCalledTimes(1);
    expect(lock).toHaveBeenCalledWith(CARD, SLATE);
    expect(line).toBe(`Card locked — $${CARD.coreSum} core + $${CARD.funSum} fun recorded to the CFB ledger. Grades post as games go final.`);
  });

  it("a refused lock keeps INSTRUCTION 45's wording — the first lock stands", async () => {
    const { lockOutcome } = await import("@/components/cfb/CfbBuilder");
    const entry = await lockedEntry();
    const line = lockOutcome(vi.fn().mockReturnValue({ entry, refused: true }), CARD, SLATE, DATE);
    expect(line).toBe("Already locked for Today — the first lock stands.");
  });

  it("the sticky row uses the shell insets hook (the tab bar's measured height), never a hardcoded pixel wall", () => {
    const src = stripComments(read(BUILDER));
    expect(src).toMatch(/import \{ useShellInsets \} from "@\/components\/props\/useShellInsets"/);
    expect(src).toMatch(/const insets = useShellInsets\(\)/);
    expect(src).toMatch(/style=\{\{ bottom: insets\.bottom \+ 8 \}\}/);
  });
});

describe("cfb-builder-ui — a LOCKED day renders the structured block", () => {
  it("status pill + money cells + record line, with lockedLine's sentence kept byte for byte beneath", async () => {
    const entry = await lockedEntry({
      grading: {
        done: false,
        tickets: Object.fromEntries(CARD.core.map((t, i) => [t.id, { result: i === 0 ? "won" : "pending", payout: i === 0 ? 40 : 0 }])),
        legs: {},
      } as CfbLedgerEntry["grading"],
    });
    ledger.entries = [entry];
    const html = await render();
    expect(html).toContain("Today&#x27;s card — LOCKED");
    const block = html.match(/<div class="([^"]*)" data-testid="cfb-locked-summary">/);
    expect(block, "the locked block").not.toBeNull();
    expect(html).toMatch(/<span class="[^"]*text-gold">Locked<\/span>/);
    expect(html).toContain(`>$${CARD.coreSum}</div>`);
    expect(html).toContain(`>$${CARD.funSum}</div>`);
    expect(html).toContain(">Record</div>");
    expect(html).toContain(">1–0</div>");
    /* the pinned sentence, unchanged (tests/cfb-card-ui.test.ts) */
    expect(html).toContain(`<p class="text-[12px] text-gold">Card locked — $${CARD.coreSum} core + $${CARD.funSum} fun recorded to the CFB ledger. Grades post as games go final.</p>`);
    expect(read(BUILDER)).toContain(`<p className="text-[12px] text-gold">{lockedLine(locked)}</p>`);
    const rec = html.match(/<p class="[^"]*" data-testid="cfb-locked-record">([^<]*)<\/p>/);
    expect(rec).not.toBeNull();
    expect(rec![1]).toBe(`1 won · 0 lost · ${CARD.core.length + CARD.funT.length - 1} pending — still grading`);
    /* the lock row is gone — a locked day has no LOCK to press */
    expect(html).not.toContain('data-testid="cfb-lock-row"');
    /* the locked tickets stack the same way */
    expect(html).toMatch(/role="list" aria-label="Locked core tickets"/);
  });

  it("a server-locked day says so in the pill row and keeps the sentence's clock", async () => {
    const entry = await lockedEntry({ source: "server-lock", note: "Locked on time, an hour before the first kickoff." });
    ledger.entries = [entry];
    const html = await render();
    expect(html).toMatch(/Server · \d{1,2}:\d{2} (AM|PM) PT<\/span>/);
    expect(html).toMatch(/Locked by the server at \d{1,2}:\d{2} (AM|PM) PT\./);
    expect(html).toContain("Locked on time, an hour before the first kickoff.");
  });

  it("a NO-PLAY day shows the No-play pill, $0 core, and the NO-PLAY sentence", async () => {
    const entry = await lockedEntry({ core: [], funT: [], noPlay: true });
    ledger.entries = [entry];
    const html = await render();
    expect(html).toMatch(/<span class="[^"]*text-gold">No-play<\/span>/);
    expect(html).toContain("NO-PLAY recorded — nothing staked. The day stands in the CFB ledger.");
    expect(html).toContain("recommended stake $0.");
  });
});

describe("cfb-builder-ui — the NO-PLAY card on a phone", () => {
  it("renders the NO-PLAY block and the Record NO-PLAY pill in the same sticky row", async () => {
    /* the real clock: every fixture game has kicked off, so the card is a NO-PLAY */
    vi.useRealTimers();
    const html = await render();
    expect(html).toContain(">NO-PLAY</div>");
    expect(html).toMatch(/<button class="[^"]*" aria-label="Record NO-PLAY">Record NO-PLAY<\/button>/);
    expect(html).toContain("Locks the day with $0 staked");
    expect(html).toContain('data-testid="cfb-lock-row"');
  });
});

describe("cfb-builder-ui — type floor and the Settings bank rows", () => {
  it("nothing on the Builder or the bank panel is set below 11px", () => {
    for (const f of [BUILDER, BANK]) {
      const sizes = [...stripComments(read(f)).matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].map((m) => Number(m[1]));
      expect(sizes.length, f).toBeGreaterThan(0);
      for (const px of sizes) expect(px, `${f} carries text-[${px}px]`).toBeGreaterThanOrEqual(11);
    }
  });
  it("the bank panel stacks label over controls on phones and gives the amount / note / Log it 44px targets", () => {
    const src = stripComments(read(BANK));
    expect(src).toMatch(/flex flex-col gap-2 border-b[^"]*md:flex-row md:flex-wrap md:items-center md:justify-between/);
    expect(src).toMatch(/aria-label="Amount"\s*className="num min-h-\[44px\]/);
    expect(src).toMatch(/aria-label="Note"\s*className="min-h-\[44px\] min-w-0 flex-1/);
    expect(src).toMatch(/<Pill variant="gold" className="min-h-\[44px\] w-full justify-center[^"]*" onClick=\{logIt\}>\s*Log it/);
    /* the strings the panel always had */
    for (const s of ["Enter an amount above $0.", "Logged.", "CFB bankroll (managed — never hand-edited)", "Log a deposit / withdrawal", "Adjustment log (append-only)"]) expect(src).toContain(s);
  });
});
