import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { stripComments } from "./helpers/source";

/**
 * INSTRUCTION 46 (2026-09-08), Josh's word, verbatim: "On 'Board' tab, The engine description
 * below 'Refresh MLB' button should be expandable/collapsible to reduce space it takes up
 * initially".
 *
 * Two layers: (1) a server render of the real Board page with a stubbed useBoard — the
 * overview must come out COLLAPSED (aria-expanded false, one truncated preview line, the
 * full text block absent) on a board that carries an overview, and absent on one that does
 * not; (2) source pins on the toggle wiring (localStorage key behind try/catch, read after
 * mount, the "Engine notes" label, the expanded branch rendering d.overview in full).
 *
 * The repo has no DOM test runtime (no jsdom / testing-library), so the click → expand path is
 * pinned at source level: the onClick flips `overviewOpen` and the open branch renders the
 * full text under aria-controls="board-overview-text".
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const PAGE = "app/board/page.tsx";
const OVERVIEW =
  "Engine v2 — consensus de-vigged probability vs the Caesars line; 10k-path sims on every pick; TOP 50 ranks on EV gated at the selection mode. " +
  "This sentence exists only to make the preview longer than one line on a 375px phone.";

let boardData: unknown = null;
vi.mock("@/lib/useBoard", () => ({
  useBoard: () => ({ data: boardData, isPending: false, isError: false, refetch: () => {} }),
  useRegenerateBoard: () => ({ mutate: () => {}, isPending: false }),
}));
vi.mock("@/lib/sport", () => ({ useSport: () => "mlb" }));
vi.mock("@/lib/useLineups", () => ({ useLineups: () => ({ data: null }) }));
vi.mock("@/lib/cz-offered", () => ({
  useCzHidden: () => ({ hidden: {}, isHidden: () => false, toggle: () => {}, reset: () => {}, count: 0 }),
}));
vi.mock("@/lib/liveNow", async (orig) => ({
  ...(await orig<typeof import("@/lib/liveNow")>()),
  useLiveNow: () => ({ byKey: {}, now: {}, at: null }),
}));

async function renderBoard(data: unknown): Promise<string> {
  boardData = data;
  // vitest compiles the page's JSX with the classic runtime (tsconfig jsx: preserve, no
  // vitest esbuild jsx override) — the transpiled output references a global `React`
  (globalThis as { React?: typeof React }).React = React;
  const mod = await import("../app/board/page");
  // the page's sub-desks (SharpDesk, SimDesk) still ask for a QueryClient — no query ever
  // fires in a server render, but the provider must be there
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(createElement(QueryClientProvider, { client: qc }, createElement(mod.default)));
}

const withOverview = {
  at: Date.parse("2026-09-08T18:00:00Z"),
  date: "2026-09-08",
  data: { overview: OVERVIEW, categories: {}, categoriesLive: {}, gameInfo: {}, games: [] },
};

describe("INSTRUCTION 46 — the engine notes start collapsed (server render, stubbed useBoard)", () => {
  it("a board with an overview renders the Engine notes toggle closed: preview line only, no full text block", async () => {
    const html = await renderBoard(withOverview);
    expect(html).toContain('data-testid="board-overview"');
    expect(html).toContain('data-open="0"');
    expect(html).toMatch(/aria-expanded="false"/);
    expect(html).not.toMatch(/aria-controls="board-overview-text"/); // 2026-09-08: no dangling aria-controls while collapsed
    expect(html).toMatch(/data-testid="board-overview"[^>]*>\s*<button[^>]*class="[^"]*min-h-\[44px\]/); // 44px tap target on phones
    expect(html).toContain("Engine notes");
    // the one-line preview carries the text, truncated by CSS
    expect(html).toMatch(/class="[^"]*\btruncate\b[^"]*"[^>]*>Engine v2 — consensus/);
    // the full-text block is not in the tree while collapsed
    expect(html).not.toContain('id="board-overview-text"');
    expect(html).toContain(">Show<");
  });
  it("a board without an overview renders no Engine notes block at all", async () => {
    const html = await renderBoard({ ...withOverview, data: { ...withOverview.data, overview: "" } });
    expect(html).not.toContain('data-testid="board-overview"');
    expect(html).not.toContain("Engine notes");
  });
});

describe("INSTRUCTION 46 — the toggle wiring (source pins)", () => {
  const src = stripComments(read(PAGE));
  it("starts collapsed, remembers the choice under pl:board:overview-open, and reads it only after mount", () => {
    expect(src).toMatch(/const OVERVIEW_OPEN_KEY = "pl:board:overview-open";/);
    expect(src).toMatch(/const \[overviewOpen, setOverviewOpen\] = useState\(false\);/);
    // read after mount, guarded — an initializer read would trip hydration
    expect(src).toMatch(/useEffect\(\(\) => \{\s*try \{\s*if \(localStorage\.getItem\(OVERVIEW_OPEN_KEY\) === "1"\) setOverviewOpen\(true\);\s*\} catch \{[^}]*\}\s*\}, \[\]\);/);
    // every write is behind try/catch
    expect(src).toMatch(/try \{ localStorage\.setItem\(OVERVIEW_OPEN_KEY, next \? "1" : "0"\); \} catch \{\}/);
  });
  it("a tap flips the state and the open branch renders the full overview under aria-controls", () => {
    expect(src).toMatch(/const toggleOverview = \(\) => \{\s*const next = !overviewOpen;\s*setOverviewOpen\(next\);/);
    expect(src).toMatch(/onClick=\{toggleOverview\}/);
    expect(src).toMatch(/aria-expanded=\{overviewOpen\}/);
    expect(src).toMatch(/\{!overviewOpen && <span className="min-w-0 flex-1 truncate text-faint">\{d\.overview\}<\/span>\}/);
    expect(src).toMatch(/\{overviewOpen && \(\s*<div id="board-overview-text"[^>]*>\s*\{d\.overview\}\s*<\/div>\s*\)\}/);
    expect(src).toMatch(/\{overviewOpen \? "Hide" : "Show"\}/);
  });
  it("the block still only renders when the board carries a non-empty overview string", () => {
    expect(src).toMatch(/\{typeof d\?\.overview === "string" && d\.overview && \(\s*<Reveal>/);
  });
});
