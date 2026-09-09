import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { buildCfbBoard } from "@/lib/cfb/model";
import { buildCfbCard } from "@/lib/cfb/card";
import { NFL_LEAGUE, NFL_PAPER, NFL_RULES } from "@/lib/nfl/rules";
import type { CfbCard, CfbLedgerEntry, CfbSlate } from "@/lib/cfb/types";
import { stripComments } from "./helpers/source";

/**
 * THE NFL MONEY SURFACES (2026-09-08, Josh: "NFL needs to be built NOW"; "Allocation should be set
 * to $350"). The Builder / Ledger / BankPanel / SyncChip / Sharp under src/components/cfb/* are
 * the SHARED football surfaces — each reads its desk through LeagueContext — and src/components/
 * nfl/Nfl*.tsx are the thin `<LeagueProvider desk={NFL_DESK}>` wrappers. This suite renders the
 * wrappers to static markup (no jsdom in this repo) and asserts the NFL desk's own money and
 * words show up, and none of the CFB desk's do.
 *
 * THE DESK IS A STUB. `@/lib/nfl/desk` (builder C's NFL_DESK) is mocked here on purpose so this
 * suite is deterministic whether or not that module has landed: the stub is NFL_LEAGUE (the real
 * NFL config — $350 / $25 / 2026-09-10, the `nfl` id, tone and prefix) over CFB_DESK's handle
 * SHAPE, with the slate hook and the ledger hook mocked the same way tests/cfb-builder-ui.test.ts
 * mocks them. What this proves is the surfaces' contract with the context — every dollar, label,
 * test id, tone and id prefix comes from the desk object — not C's wiring, which C's own tests pin.
 *
 * vitest's esbuild transform compiles the app's .tsx with the classic JSX runtime under this
 * tsconfig (jsx: preserve), so a server render needs React on the global — stubbed once here.
 */
vi.stubGlobal("React", React);

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const NFL_DIR = "src/components/nfl";
const WRAPPERS = ["NflBuilder.tsx", "NflLedger.tsx", "NflBankPanel.tsx", "NflSharp.tsx", "NflSyncChip.tsx"];

const FIX = path.join(ROOT, "tests", "fixtures", "cfb");
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8"));
/* the real 2026-09-05 slate fixture (the football slate SHAPE is one type across both desks), read at noon UTC that day */
const NOW = Date.parse("2026-09-05T12:00:00Z");
const DATE = "2026-09-05";
function slateOf(): CfbSlate {
  const espn = readJson("espn-scoreboard-2026-09-05.json") as { events: unknown[] };
  const board = buildCfbBoard({ date: DATE, espnEvents: espn.events, oddsEvents: readJson("odds-ncaaf-2026-09-05.json"), fpi: readJson("espn-fpi.json"), now: NOW, bankroll: 2500 });
  return { ...board, finals: {}, quota: { remaining: null, used: null }, oddsMissing: false };
}
const SLATE = slateOf();
/* the card the NFL Builder computes: NFL rules, NFL allotment, `nfl-` ids */
const CARD: CfbCard = buildCfbCard(SLATE, { bankroll: 2500, daily: NFL_PAPER.daily, fun: NFL_PAPER.fun, now: NOW, rules: NFL_RULES, idPrefix: "nfl" });

/* ---------- the mocked desk hooks: today's slate, the bank at base, a lock that records its calls ---------- */
const desk = {
  today: DATE,
  date: DATE,
  rail: [DATE],
  pick: vi.fn(),
  bankroll: 2500,
  q: { isPending: false, isFetching: false, isError: false, error: null, refetch: vi.fn() },
  slate: SLATE as CfbSlate | null,
};
const ledger = {
  entries: [] as CfbLedgerEntry[],
  lock: vi.fn(),
  bankStore: { asOf: "2026-09-10", log: [] as { ts: number; kind: "deposit" | "withdrawal"; amt: number; note: string }[] },
  bankroll: 2500,
  addAdjustment: vi.fn(),
};
vi.mock("@/lib/cfb/useCfbDesk", async (orig) => ({ ...(await orig<object>()), useCfbDesk: () => desk }));
vi.mock("@/lib/cfb/store", async (orig) => ({ ...(await orig<object>()), useCfbLedger: () => ledger }));
vi.mock("@/lib/cfb/sync", async (orig) => ({ ...(await orig<object>()), syncCfbNow: vi.fn() }));
/* the NFL desk: the real NFL_LEAGUE over the (mocked) CFB handle shape — see the header */
vi.mock("@/lib/nfl/desk", async () => {
  const { CFB_DESK } = await import("@/lib/cfb/desk");
  const { NFL_LEAGUE } = await import("@/lib/nfl/rules");
  return { NFL_DESK: { ...CFB_DESK, ...NFL_LEAGUE } };
});
/* the scroll-reveal wrapper is motion; the markup under test is its children */
vi.mock("@/components/motion/Reveal", () => ({ Reveal: ({ children }: { children: unknown }) => children }));

function withQuery(el: React.ReactElement): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(createElement(QueryClientProvider, { client: qc }, el));
}
async function renderBuilder(): Promise<string> {
  const { NflBuilder } = await import("@/components/nfl/NflBuilder");
  return withQuery(createElement(NflBuilder));
}

/** the strings that belong to the other desk and must not appear on an NFL render. The CFB
    allotments are checked in the contexts the surfaces print them ("$250 core + $25 fun per slate
    day", "/ $250"), never as bare dollar figures — a card's own core sum can legitimately be
    $150 (this fixture's is three $50 tickets) and is not a CFB constant. */
function expectNoCfb(html: string, what: string) {
  expect(html, `${what}: "CFB"`).not.toContain("CFB");
  expect(html, `${what}: "FBS"`).not.toContain("FBS");
  expect(html, `${what}: the CFB allotment`).not.toMatch(/\$(150|250) core \+ \$25 fun per slate day/);
  expect(html, `${what}: the CFB denominator`).not.toMatch(/\/ \$(150|250)<\/div>/);
  expect(html, `${what}: college`).not.toMatch(/College Football/);
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

describe("nfl-money-ui — the NFL card the Builder computes is an NFL card", () => {
  it("NFL_LEAGUE is the desk this suite stubs: id/prefix nfl, $350 core + $25 fun since 2026-09-10", () => {
    expect(NFL_LEAGUE.id).toBe("nfl");
    expect(NFL_LEAGUE.idPrefix).toBe("nfl");
    expect(NFL_LEAGUE.short).toBe("NFL");
    expect(NFL_LEAGUE.noun).toBe("NFL");
    expect(NFL_LEAGUE.paper).toEqual({ since: "2026-09-10", daily: 350, fun: 25 });
    expect(NFL_LEAGUE.bankBase).toBe(2500);
  });
  it("the fixture card is a real, playable card whose ticket ids carry the nfl prefix", () => {
    expect(CARD.noPlay).toBe(false);
    expect(CARD.core.length).toBeGreaterThan(0);
    for (const t of [...CARD.core, ...CARD.funT]) expect(t.id).toMatch(/^nfl-2026-09-05-(core-\d+|fun-1)$/);
    expect(CARD.coreSum).toBeLessThanOrEqual(NFL_PAPER.daily);
    for (const t of CARD.core) expect(t.stake).toBeLessThanOrEqual(NFL_RULES.maxStake);
  });
});

describe("nfl-money-ui — NflBuilder renders the NFL desk's money, never the CFB desk's", () => {
  it("the paper banner says 🏈 NFL paper · $350 core + $25 fun per slate day · since 2026-09-10", async () => {
    const html = await renderBuilder();
    expect(html).toContain("🏈 NFL paper");
    expect(html).toContain(`· $${NFL_PAPER.daily} core + $${NFL_PAPER.fun} fun per slate day`);
    expect(html).toContain("350 core + 25 fun".replace("350", "$350").replace("25 fun", "$25 fun"));
    expect(html).toMatch(new RegExp(`<span class="hidden sm:inline"> since ${NFL_PAPER.since} · separate ledger &amp; bank</span>`));
    expectNoCfb(html, "the Builder");
  });

  it("the phone money strip is the NFL group — aria-label NFL money, data-testid nfl-money-strip — and the md+ tiles are nfl-money-tiles", async () => {
    const html = await renderBuilder();
    const strip = html.match(/<div class="([^"]*)" role="group" aria-label="NFL money" data-testid="nfl-money-strip">/);
    expect(strip, "the NFL money strip").not.toBeNull();
    expect(strip![1]).toMatch(/\bgrid-cols-4\b/);
    expect(strip![1]).toMatch(/\bmd:hidden\b/);
    expect(html).toContain(`>$${NFL_PAPER.daily}</div>`);
    expect(html).toContain(`>$${NFL_PAPER.fun}</div>`);
    expect(html).toContain(">$2,500</div>");
    expect(html).toMatch(/<div class="[^"]*hidden[^"]*md:grid[^"]*" data-testid="nfl-money-tiles">/);
    expect(html).not.toContain('data-testid="cfb-money-strip"');
    expect(html).not.toContain('aria-label="CFB money"');
    /* the accent is the NFL blue on the strip's Core / Fun cells, not the CFB amber */
    expect(html).toMatch(/text-nfl[^"]*">\$350<\/div>/);
    expect(html).not.toMatch(/text-cfb[^"]*">\$350<\/div>/);
  });

  it("the Deployed cell's denominator is the $350 allotment and the bankroll tile is the NFL bankroll", async () => {
    const html = await renderBuilder();
    const cell = html.match(/<div class="([^"]*)">Deployed<\/div><div class="([^"]*)">\$(\d+)<\/div><div class="([^"]*)">\/ \$(\d+)<\/div>/);
    expect(cell, "the Deployed cell").not.toBeNull();
    expect(Number(cell![3])).toBe(CARD.coreSum);
    expect(Number(cell![5])).toBe(NFL_PAPER.daily);
    expect(html).toContain("NFL bankroll");
    expect(html).toContain(`Locks $${CARD.coreSum} core + $${CARD.funSum} fun for Today`);
  });

  it("a locked NFL day records to the NFL ledger — lockOutcome names the desk, the locked block prints it", async () => {
    const { lockOutcome } = await import("@/components/cfb/CfbBuilder");
    const { lockCfbCard } = await import("@/lib/cfb/ledger");
    const entry = lockCfbCard(CARD, SLATE, NOW + 60_000);
    const lock = vi.fn().mockReturnValue({ entry, refused: false });
    expect(lockOutcome(lock, CARD, SLATE, DATE, "NFL")).toBe(
      `Card locked — $${CARD.coreSum} core + $${CARD.funSum} fun recorded to the NFL ledger. Grades post as games go final.`,
    );
    /* the default stays the CFB desk (tests/cfb-builder-ui.test.ts pins that sentence) */
    expect(lockOutcome(lock, CARD, SLATE, DATE)).toContain("recorded to the CFB ledger");
    ledger.entries = [entry];
    const html = await renderBuilder();
    expect(html).toContain(`<p class="text-[12px] text-gold">Card locked — $${CARD.coreSum} core + $${CARD.funSum} fun recorded to the NFL ledger. Grades post as games go final.</p>`);
    expectNoCfb(html, "the locked Builder");
  });

  it("an empty NFL slate says No NFL games, and Sunday is the card", async () => {
    desk.slate = { ...SLATE, games: [] };
    const html = await renderBuilder();
    expect(html).toContain("No NFL games on Today");
    expect(html).toContain("Sunday is the card");
    expectNoCfb(html, "the empty Builder");
  });
});

describe("nfl-money-ui — NflBankPanel, NflSyncChip and NflSharp read the same desk", () => {
  it("the bank panel is the NFL bankroll on the $2,500 base and names the NFL bank", async () => {
    const { NflBankPanel } = await import("@/components/nfl/NflBankPanel");
    const html = renderToStaticMarkup(createElement(NflBankPanel));
    expect(html).toContain("NFL bankroll (managed — never hand-edited)");
    expect(html).toContain("graded NFL P/L");
    expect(html).toContain("No moves logged — the NFL bank sits at its $2,500 base.");
    expect(html).toMatch(/text-nfl[^"]*">\$2,500\.00<\/span>/);
    expectNoCfb(html, "the bank panel");
  });

  it("the sync chip is the NFL loop's — its own test id and the NFL ledger in its words", async () => {
    const { NflSyncChip } = await import("@/components/nfl/NflSyncChip");
    const html = renderToStaticMarkup(createElement(NflSyncChip, { className: "mt-1" }));
    expect(html).toContain('data-testid="nfl-sync-chip"');
    expect(html).toContain("keeps the NFL ledger the same on every device");
    expect(html).toMatch(/class="[^"]*mt-1[^"]*"/);
    expectNoCfb(html, "the sync chip");
  });

  it("the Sharp prints NFL_MODEL / NFL_RULES / NFL_PAPER from the desk — σ 13.5, HFA +2, the $350 card, tighter than college's", async () => {
    const { NflSharp } = await import("@/components/nfl/NflSharp");
    const html = withQuery(createElement(NflSharp));
    expect(html).toContain("The NFL read");
    expect(html).toContain(`σ = ${NFL_LEAGUE.model.sigma} pts`);
    expect(html).toContain(`HFA = +${NFL_LEAGUE.model.hfa}`);
    expect(html).toContain(`$${NFL_PAPER.daily} core + $${NFL_PAPER.fun} fun`);
    expect(html).toContain("tighter than college");
    expect(html).not.toContain("wider than the NFL");
    expect(html).toContain(`since ${NFL_PAPER.since}`);
    expect(html).toContain(`${SLATE.games.length} NFL games on`);
    expectNoCfb(html, "the Sharp");
  });
});

describe("nfl-money-ui — the ledger's leg links deep-link to the NFL props desk", () => {
  it("cfbLegHref on the nfl desk is /props?nfl=1&date=… and never carries cfb=1", async () => {
    const { cfbLegHref, cfbLegLink } = await import("@/components/cfb/CfbTicketCard");
    const leg = { gkey: "g1", market: "spread" as const, label: "Joe Burrow", player: "Joe Burrow", side: "home" };
    const href = cfbLegHref(leg, "2026-09-13", "nfl");
    expect(href.startsWith("/props?nfl=1&date=2026-09-13")).toBe(true);
    expect(href).not.toContain("cfb=1");
    expect(cfbLegLink({ ...leg, lkey: "l1", prop: "spread", cz: -110, teamId: null } as never, { date: "2026-09-13", today: "2026-09-13", league: "nfl" }).href).toBe(href);
  });
  it("the Ledger passes the desk's league to cfbLegLink (source pin)", () => {
    const src = stripComments(read("src/components/cfb/CfbLedger.tsx"));
    expect(src).toMatch(/cfbLegLink\(leg, \{ date: e\.date, today, verdict: g\?\.legs\?\.\[leg\.lkey\] \?\? null, league \}\)/);
    expect(src).toMatch(/league=\{L\.id\}/);
  });
});

describe("nfl-money-ui — the wrappers are thin and carry nothing of the CFB desk", () => {
  for (const f of WRAPPERS) {
    it(`${f} mounts the shared surface under <LeagueProvider desk={NFL_DESK}>`, () => {
      const src = stripComments(read(path.join(NFL_DIR, f)));
      expect(src).toMatch(/^"use client";/);
      expect(src).toMatch(/import \{ LeagueProvider \} from "@\/components\/football\/LeagueContext"/);
      expect(src).toMatch(/import \{ NFL_DESK \} from "@\/lib\/nfl\/desk"/);
      expect(src).toMatch(/<LeagueProvider desk=\{NFL_DESK\}>/);
      for (const bad of ["CFB_PAPER", "CFB_RULES", "CFB_MODEL", "CFB_BANK_BASE", "pl_cfb", "pl:cfb", "/api/cfb", "college-football", "americanfootball_ncaaf"]) {
        expect(src, `${f} carries ${bad}`).not.toContain(bad);
      }
    });
  }
  it("NflLedger exports both the ledger and its header actions; NflSyncChip forwards className", () => {
    const ledgerSrc = stripComments(read(path.join(NFL_DIR, "NflLedger.tsx")));
    expect(ledgerSrc).toMatch(/export function NflLedger\(\)/);
    expect(ledgerSrc).toMatch(/export function NflLedgerActions\(\)/);
    expect(ledgerSrc).toMatch(/<CfbLedgerActions \/>/);
    const chip = stripComments(read(path.join(NFL_DIR, "NflSyncChip.tsx")));
    expect(chip).toMatch(/<CfbSyncChip className=\{className\} \/>/);
  });
  it("the shared surfaces read the desk off useLeague() and import no CFB constant by name", () => {
    for (const f of ["CfbBuilder.tsx", "CfbLedger.tsx", "CfbBankPanel.tsx", "CfbSyncChip.tsx", "CfbSharp.tsx", "CfbTicketCard.tsx"]) {
      const src = stripComments(read(path.join("src/components/cfb", f)));
      expect(src, f).toMatch(/from "@\/components\/football\/LeagueContext"/);
      expect(src, f).not.toMatch(/from "@\/lib\/cfb\/rules"/);
      expect(src, f).not.toMatch(/import \{[^}]*\b(useCfbLedger|syncCfbNow|useCfbSyncState|loadCfbFinals|CFB_BANK_BASE|CFB_PAPER|CFB_RULES|CFB_MODEL)\b[^}]*\}/);
    }
    /* both accent class strings are literal, so Tailwind emits the NFL one */
    for (const f of ["CfbBuilder.tsx", "CfbBankPanel.tsx", "CfbSharp.tsx", "CfbTicketCard.tsx"]) {
      const src = stripComments(read(path.join("src/components/cfb", f)));
      expect(src, f).toContain("text-nfl");
      expect(src, f).toContain("text-cfb");
    }
  });
});
