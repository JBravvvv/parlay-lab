import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CfbSlate } from "@/lib/cfb/types";
import { stripComments } from "./helpers/source";

/**
 * NFL BOARD / PROPS / GAMES / FPI SURFACES (2026-09-08, the NFL build — Josh: "NFL needs to be
 * built NOW"): the College Football Board, props sandbox, games view and FPI panel are the SHARED
 * football surfaces — every league-specific read (tables, client, desk hook, accent, copy) comes
 * off `useLeague()` — and src/components/nfl/Nfl*.tsx are thin wrappers that mount them under
 * `<LeagueProvider desk={NFL_DESK}>`. Pins:
 *   1. every NFL wrapper imports LeagueProvider + NFL_DESK and wraps the matching Cfb component;
 *   2. CfbPicksBoard keeps its pinned CFB client import line and the CFB_SLATE_KEY_PREFIX
 *      expression (the CFB desk's own refresh contract does not move);
 *   3. no `tone="cfb"` literal survives on the shared surfaces — every tone is `tone={L.id}`, and
 *      both accent class strings are literal so Tailwind emits the NFL one;
 *   4. an NflPicksBoard render on an empty NFL slate says "No NFL games" and never "FBS" / "CFB".
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const NFL_DIR = "src/components/nfl";
const CFB_DIR = "src/components/cfb";

/** wrapper → the shared surface it mounts */
const WRAPPERS: Record<string, string> = {
  "NflPicksBoard.tsx": "CfbPicksBoard",
  "NflProps.tsx": "CfbProps",
  "NflGames.tsx": "CfbGames",
  "NflFpiPanel.tsx": "CfbFpiPanel",
};

describe("nfl-board-ui — the NFL wrappers are thin", () => {
  for (const [file, surface] of Object.entries(WRAPPERS)) {
    it(`${file} mounts <${surface}> under <LeagueProvider desk={NFL_DESK}>`, () => {
      const src = stripComments(read(path.join(NFL_DIR, file)));
      expect(src).toMatch(/^"use client";/);
      expect(src).toMatch(/import \{ LeagueProvider \} from "@\/components\/football\/LeagueContext"/);
      expect(src).toMatch(/import \{ NFL_DESK \} from "@\/lib\/nfl\/desk"/);
      expect(src).toMatch(/<LeagueProvider desk=\{NFL_DESK\}>/);
      expect(src).toMatch(new RegExp(`<${surface}[\\s/>{]`));
      for (const bad of ["pl_cfb", "pl:cfb", '"/api/cfb', "college-football", "americanfootball_ncaaf", "CFB_BANK_BASE", "CFB_PARLAYS", "CFB_PROPS", "CFB_RULES", "CFB_MODEL"]) {
        expect(src, `${file} carries ${bad}`).not.toContain(bad);
      }
    });
  }
  it("NflPicksBoard also exports the header's NflRefreshPill; NflFpiPanel forwards every prop", () => {
    const board = stripComments(read(path.join(NFL_DIR, "NflPicksBoard.tsx")));
    expect(board).toMatch(/export function NflPicksBoard\(\)/);
    expect(board).toMatch(/export function NflRefreshPill\(\)/);
    expect(board).toMatch(/<CfbRefreshPill \/>/);
    const fpi = stripComments(read(path.join(NFL_DIR, "NflFpiPanel.tsx")));
    expect(fpi).toMatch(/<CfbFpiPanel \{\.\.\.props\} \/>/);
  });
});

describe("nfl-board-ui — the shared surfaces read the league off useLeague()", () => {
  const SHARED = ["CfbPicksBoard.tsx", "CfbProps.tsx", "CfbSlip.tsx", "CfbGameCard.tsx", "CfbGames.tsx", "CfbFpiPanel.tsx"];
  it("every shared surface imports useLeague", () => {
    for (const f of SHARED) {
      const src = stripComments(read(path.join(CFB_DIR, f)));
      expect(src, f).toMatch(/import \{ useLeague \} from "@\/components\/football\/LeagueContext"/);
    }
  });
  it("CfbPicksBoard keeps the CFB desk's own refresh contract (the pinned client import + key prefixes)", () => {
    const src = read(path.join(CFB_DIR, "CfbPicksBoard.tsx"));
    expect(src).toContain('import { CFB_PROPS_STALE_MS, cfbCacheLabel, cfbPricedAtLabel, cfbPropsQueryKey, cfbPropsStaleMs, cfbQueryKey, loadCfbProps } from "@/lib/cfb/client";');
    expect(src).toContain("export const CFB_SLATE_KEY_PREFIX = cfbQueryKey(null, CFB_BANK_BASE).slice(0, 2);");
    expect(src).toContain("export const CFB_PROPS_KEY_PREFIX = cfbPropsQueryKey(null, CFB_BANK_BASE).slice(0, 2);");
    /* the props query and the picks builder read the league, not the CFB constants */
    expect(src).toMatch(/queryKey: L\.client\.propsQueryKey\(date, bankroll \?\? L\.bankBase\)/);
    expect(src).toMatch(/queryFn: \(\) => L\.client\.loadProps\(date, \{ bankroll: bankroll \?\? undefined \}\)/);
    expect(src).toMatch(/const propsBoardStaleMs = \(board: CfbPropsBoard \| undefined\) => boardStaleMs\(board, L\.client\);/);
    expect(src).toMatch(/staleTime: \(q\) => propsBoardStaleMs\(q\.state\.data\)/);
    /* the search box wears both focus accents as literal classes, the NFL one through the data-league attribute */
    expect(src).toMatch(/data-league=\{L\.id\}/);
    expect(src).toMatch(/focus:border-cfb\/60 data-\[league=nfl\]:focus:border-nfl\/60/);
    expect(src).toMatch(/parlays: L\.parlays, idPrefix: L\.idPrefix, rules: L\.rules/);
    /* the refresh pill dispatches by league: the CFB prefixes on the CFB desk, the league's own key builders elsewhere */
    expect(src).toMatch(/L\.id === "cfb" \? refreshCfbBoard\(qc\) : refreshLeagueBoard\(qc, L\)/);
    expect(src).toMatch(/export function refreshLeagueBoard\(/);
  });
  it('no `tone="cfb"` literal survives — every tone is the league id, and both accent class strings are literal', () => {
    for (const f of ["CfbPicksBoard.tsx", "CfbProps.tsx", "CfbSlip.tsx", "CfbGameCard.tsx", "CfbGames.tsx"]) {
      const src = stripComments(read(path.join(CFB_DIR, f)));
      expect(src, f).not.toMatch(/tone="cfb"/);
      expect(src, f).not.toMatch(/tone="nfl"/);
      if (f !== "CfbGames.tsx") expect(src, f).toMatch(/tone=\{L\.id\}/);
      /* the props sandbox's accent is its rings / grid skin (CfbSlip carries its text accent) */
      const [nflClass, cfbClass] = f === "CfbProps.tsx" ? ["ring-nfl/40", "ring-cfb/40"] : ["text-nfl", "text-cfb"];
      expect(src, f).toContain(nflClass);
      expect(src, f).toContain(cfbClass);
    }
    const board = stripComments(read(path.join(CFB_DIR, "CfbPicksBoard.tsx")));
    expect(board).toContain('"hero-price is-nfl num mt-0.5"');
    expect(board).toContain('"hero-price is-cfb num mt-0.5"');
    const props = stripComments(read(path.join(CFB_DIR, "CfbProps.tsx")));
    expect(props).toContain('"odds-grid is-nfl"');
    expect(props).toContain('"odds-grid is-cfb"');
    expect(props).toMatch(/ring-nfl\/70/);
    const fpi = stripComments(read(path.join(CFB_DIR, "CfbFpiPanel.tsx")));
    expect(fpi).toContain('"bg-nfl"');
    expect(fpi).toContain('"bg-cfb"');
  });
  it("CfbGames polls the league's finals under its own query prefix and names the league's scoreboard", () => {
    const src = stripComments(read(path.join(CFB_DIR, "CfbGames.tsx")));
    expect(src).toMatch(/queryKey: \[L\.queryPrefix, "finals", date\]/);
    expect(src).toMatch(/queryFn: \(\) => L\.client\.loadFinals\(date\)/);
    expect(src).not.toMatch(/loadCfbFinals/);
    expect(src).not.toMatch(/college football/);
    expect(src).toMatch(/No \$\{L\.noun\} games/);
  });
  it("CfbSeason names the widened CFB rails ($250 / $25) and nothing else moved", () => {
    const src = read(path.join(CFB_DIR, "CfbSeason.tsx"));
    expect(src).toContain("never the daily $250 / $25 rails or the CFB ledger.");
    expect(src).not.toContain("$150 / $25");
  });
});

/* ---------- the render: an NflPicksBoard on an empty NFL slate ---------- */

const DATE = "2026-09-13";
const SLATE = {
  date: DATE,
  slateDates: [DATE],
  games: [],
  unmatched: 0,
  fpiUpdated: null,
  generatedAt: Date.parse("2026-09-13T12:00:00Z"),
  oddsMissing: false,
} as unknown as CfbSlate;
const desk = {
  today: DATE,
  date: DATE,
  rail: [DATE],
  pick: vi.fn(),
  bankroll: 2500,
  q: { isPending: false, isFetching: false, isError: false, error: null, refetch: vi.fn() },
  slate: SLATE as CfbSlate | null,
};
/* the NFL desk: the real NFL_LEAGUE (label / short / noun / tables) over a stub desk hook whose slate is empty */
vi.mock("@/lib/nfl/desk", async () => {
  const { CFB_DESK } = await import("@/lib/cfb/desk");
  const { NFL_LEAGUE } = await import("@/lib/nfl/rules");
  const { NFL_DESK: REAL } = await import("@/lib/nfl/desk");
  return { NFL_DESK: { ...CFB_DESK, ...NFL_LEAGUE, client: REAL.client, useDesk: () => desk, useBankroll: () => 2500 } };
});
vi.mock("@/components/motion/Reveal", () => ({ Reveal: ({ children }: { children: unknown }) => children }));

function withQuery(el: React.ReactElement): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(createElement(QueryClientProvider, { client: qc }, el));
}

describe("nfl-board-ui — NflPicksBoard renders the NFL desk's copy", () => {
  it('an empty NFL slate says "No NFL games" and never "FBS" or "CFB"', async () => {
    (globalThis as { React?: typeof React }).React = React;
    const { NflPicksBoard, NflRefreshPill } = await import("@/components/nfl/NflPicksBoard");
    const html = withQuery(createElement(NflPicksBoard));
    expect(html).toContain("No NFL games");
    expect(html).toContain("No NFL games on ");
    expect(html).not.toContain("FBS");
    expect(html).not.toContain("CFB");
    expect(html).not.toContain("College Football");
    /* the NFL tone reaches the widgets: the Segmented scope control and the stat tiles carry the nfl accent, never cfb */
    expect(html).not.toMatch(/\bis-cfb\b/);
    expect(html).not.toMatch(/\btext-cfb\b/);
    const pill = withQuery(createElement(NflRefreshPill));
    expect(pill).toContain("Refresh Board");
    expect(pill).toContain('data-testid="cfb-refresh-board"');
  });
});
