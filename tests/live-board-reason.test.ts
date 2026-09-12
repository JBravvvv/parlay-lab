import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { stripComments } from "./helpers/source";
import { MLB_LIVE_CLIENT, mlbLiveGap, mlbLiveGapNote, type MlbLiveQuote, type MlbLiveQuoteBoard } from "@/lib/mlb/live-client";

/**
 * FIX 4 (2026-09-12) — THE BOARD SAYS WHY THERE IS NO LIVE PRICE, INSTEAD OF SHOWING NOTHING.
 *
 * `rowLive` refuses a quote for three different reasons and renders nothing for all three, so from
 * the outside they are one symptom — "it's not updating with live odds" — with no way to tell them
 * apart, and two of them are things Josh can act on in ten seconds:
 *
 *   1. NO SYNC PHRASE ON THIS PHONE — the live query disables itself, no pull is even asked for.
 *   2. NO LIVE QUOTE FOR THIS GAME — the pass never reached it (capped at 3 games until the probe
 *      is measured) or the book posts no in-play market. Nothing to do but wait for the next pass.
 *   3. THE QUOTE IS OLDER THAN quoteMaxAgeSec — Redis still holds it, the screen drops it. This is
 *      the one that looked most like a bug: a price WAS pulled and still nothing appeared.
 *
 * The sentence is built by one pure helper so the Board and The Sharp cannot tell different stories,
 * which is also what lets it be tested without a browser. NOTHING here polls: `quoteMaxAgeSec` is
 * unchanged and no `refetchInterval` was added — naming a stale price is the honest alternative to
 * quietly re-buying it.
 *
 * Every number below is synthetic. No Odds API call, no credits.
 */

const GKEY = "HOU@SEA";
const PK = 777001;
const LKEY = "yordanalvarez|batter_hits_runs_rbis|0.5";
const read = (p: string) => stripComments(fs.readFileSync(path.join(process.cwd(), p), "utf8"));

describe("FIX 4 — the counting is right before the wording matters", () => {
  const now = Date.parse("2026-09-12T23:00:00Z");
  const fresh = new Date(now - 60_000).toISOString();
  const old = new Date(now - (MLB_LIVE_CLIENT.quoteMaxAgeSec + 60) * 1000).toISOString();

  it("a game with a fresh quote is priced, one with none is noQuote, one past the cap is tooOld", () => {
    const gap = mlbLiveGap({
      liveGameKeys: ["A@B", "C@D", "E@F"],
      rows: { "A@B|x": { at: fresh }, "C@D|x": { at: old } },
      now,
    });
    expect(gap).toEqual({ live: 3, priced: 1, noQuote: 1, tooOld: 1 });
  });

  it("a game is priced on its FRESHEST row — one stale leg cannot condemn the game", () => {
    const gap = mlbLiveGap({ liveGameKeys: ["A@B"], rows: { "A@B|one": { at: old }, "A@B|two": { at: fresh } }, now });
    expect(gap).toEqual({ live: 1, priced: 1, noQuote: 0, tooOld: 0 });
  });

  it("a quote for a game that is NOT under way is counted for nothing", () => {
    const gap = mlbLiveGap({ liveGameKeys: [], rows: { "A@B|x": { at: fresh } }, now });
    expect(gap).toEqual({ live: 0, priced: 0, noQuote: 0, tooOld: 0 });
  });

  it("exactly at the cap is still live; one second past it is not", () => {
    const atCap = new Date(now - MLB_LIVE_CLIENT.quoteMaxAgeSec * 1000).toISOString();
    const pastCap = new Date(now - MLB_LIVE_CLIENT.quoteMaxAgeSec * 1000 - 1000).toISOString();
    expect(mlbLiveGap({ liveGameKeys: ["A@B"], rows: { "A@B|x": { at: atCap } }, now }).priced).toBe(1);
    expect(mlbLiveGap({ liveGameKeys: ["A@B"], rows: { "A@B|x": { at: pastCap } }, now }).tooOld).toBe(1);
  });

  it("an unparseable stamp is treated as no quote, never as a live one", () => {
    expect(mlbLiveGap({ liveGameKeys: ["A@B"], rows: { "A@B|x": { at: "soon" } }, now })).toEqual({
      live: 1, priced: 0, noQuote: 1, tooOld: 0,
    });
  });

  it("duplicate game keys are counted once", () => {
    expect(mlbLiveGap({ liveGameKeys: ["A@B", "A@B"], rows: {}, now }).live).toBe(1);
  });
});

describe("FIX 4 — each of the three states gets its own plain-English sentence", () => {
  const gap = (o: Partial<ReturnType<typeof mlbLiveGap>>) => ({ live: 1, priced: 0, noQuote: 0, tooOld: 0, ...o });

  it("no sync phrase on this phone — and it says where to fix it", () => {
    const note = mlbLiveGapNote(gap({ noQuote: 1 }), { syncReady: false, overlay: false });
    expect(note).toContain("your sync phrase isn't saved here");
    expect(note).toContain("Settings");
    expect(note).toContain("1 game under way");
  });

  it("NOT LOOKED AT YET IS NOT NO PHRASE — a null syncReady blames nothing", () => {
    /* review round, 2026-09-12: `syncReady` is a mount-effect read, so the server render and the
       first client pass have not looked at localStorage yet. Telling Josh his phrase isn't saved in
       that window — on a phone where it IS saved — sends him to Settings to re-enter something that
       is already there, which is worse than giving no reason at all. */
    const note = mlbLiveGapNote(gap({ noQuote: 1 }), { syncReady: null, overlay: false });
    expect(note).toContain("live prices haven't loaded yet");
    expect(note).not.toContain("sync phrase");
    // and the sentence agrees with the count: one game "is showing its", not "are showing their"
    expect(note).toContain("the 1 game under way is showing its pregame price");
    expect(mlbLiveGapNote(gap({ live: 2, noQuote: 2 }), { syncReady: null, overlay: false })).toContain(
      "the 2 games under way are showing their pregame price",
    );
  });

  it("no live quote for this game — and it says the row keeps its pregame price", () => {
    const note = mlbLiveGapNote(gap({ live: 3, priced: 2, noQuote: 1 }), { syncReady: true, overlay: true });
    expect(note).toContain("1 game has no live price yet");
    expect(note).toContain("keeps the pregame price");
    expect(note).toContain("2 of 3 games under way are priced live");
  });

  it("the live price is older than 30 minutes — and it says how old is too old", () => {
    const note = mlbLiveGapNote(gap({ live: 2, priced: 1, tooOld: 1 }), { syncReady: true, overlay: true });
    expect(note).toContain("1 game was last priced more than 30 minutes ago");
    expect(note).toContain("too old to call live");
    // the number comes off the constant, so changing the cap changes the words
    expect(note).toContain(`${Math.round(MLB_LIVE_CLIENT.quoteMaxAgeSec / 60)} minutes`);
  });

  it("both gaps at once, in one line, with no jargon", () => {
    const note = mlbLiveGapNote(gap({ live: 5, priced: 2, noQuote: 2, tooOld: 1 }), { syncReady: true, overlay: true });
    expect(note).toContain("2 games have no live price yet");
    expect(note).toContain("1 game was last priced more than");
    for (const jargon of ["unmatched", "cache", "401", "overlay", "Redis", "null", "undefined", "NaN"]) {
      expect(note, `"${jargon}" is not plain betting English`).not.toContain(jargon);
    }
  });

  it("says NOTHING when there is nothing to explain — no noise on a 375px screen", () => {
    expect(mlbLiveGapNote(gap({ live: 0 }), { syncReady: true, overlay: true })).toBeNull();
    expect(mlbLiveGapNote(gap({ live: 4, priced: 4 }), { syncReady: true, overlay: true })).toBeNull();
  });

  it("an overlay in hand is proof the phrase works, so it never claims a missing phrase", () => {
    const note = mlbLiveGapNote(gap({ live: 2, priced: 1, tooOld: 1 }), { syncReady: false, overlay: true });
    expect(note).not.toContain("sync phrase");
    expect(note).toContain("too old to call live");
  });

  it("quotes the server's own error rather than guessing at one", () => {
    const note = mlbLiveGapNote(gap({ noQuote: 1 }), { syncReady: true, overlay: false, error: "mlb live props 503" });
    expect(note).toContain('the server answered "mlb live props 503"');
  });
});

/* ---- the Board, rendered ------------------------------------------------------------------ */
/* The harness is tests/board-live-anchor.test.ts's, narrowed to this one question. renderToString
   runs no effects, so the phrase read (a mount effect, for hydration honesty) has not happened:
   that render IS the no-phrase state, and the overlay cases below therefore also prove the
   precedence above — with an overlay in hand the sentence never blames the phrase. */
let overlay: MlbLiveQuoteBoard | null = null;
let boardData: unknown = null;

vi.mock("@/lib/useBoard", () => ({
  useBoard: () => ({ data: boardData, isPending: false, isError: false, refetch: () => {} }),
  useRegenerateBoard: () => ({ mutate: () => {}, isPending: false, isSuccess: false, isError: false, error: null }),
}));
vi.mock("@/lib/refill-client", () => ({
  refillReason: () => null,
  useRefillDesk: () => ({ mutate: () => {}, isPending: false, data: undefined, error: null }),
}));
vi.mock("@/lib/ledgerSync", () => ({ getSyncKey: () => "phrase", syncNow: async () => {} }));
vi.mock("@/lib/sport", () => ({ useSport: () => "mlb" }));
vi.mock("@/lib/useLineups", () => ({ useLineups: () => ({ data: null }) }));
vi.mock("@/lib/cz-offered", () => ({
  useCzHidden: () => ({ hidden: {}, isHidden: () => false, toggle: () => {}, reset: () => {}, count: 0 }),
}));
vi.mock("@/lib/liveNow", async (orig) => ({
  ...(await orig<typeof import("@/lib/liveNow")>()),
  useLiveNow: () => ({
    at: Date.now(),
    games: { [PK]: { pk: PK, state: "In Progress", live: true, final: false, away: 2, home: 1, inning: "Top 4" } },
    liveCount: 1,
    legNow: () => ({ txt: "3 H+R+RBI", inning: "Top 4", val: 3 }),
  }),
}));
vi.mock("@/lib/mlb/live-client", async (orig) => ({
  ...(await orig<typeof import("@/lib/mlb/live-client")>()),
  useMlbLiveQuotes: () => ({ data: overlay ?? undefined, isPending: false, isError: false }),
}));

const ROW = {
  label: "Yordan Alvarez (HOU)", sub: "H+R+RBI O 0.5", lkey: LKEY, gkey: GKEY,
  odds: -145, czOdds: -145, czEv: 12.4, prob: 78.2, implied: 59.2, edge: 19, czKellyF: 0.02, books: 7,
};
/** `atMs` is the board's own generation time: AFTER first pitch is the in-play re-price case */
const board = (atMs: number) => ({
  at: atMs,
  date: "2026-09-12",
  data: {
    overview: "", categories: { all: [ROW] }, categoriesLive: {},
    gameInfo: { [GKEY]: { pk: PK, start: "2026-09-12T19:10:00Z" } }, games: [],
  },
});
const FIRST_PITCH = Date.parse("2026-09-12T19:10:00Z");

/** SYNTHETIC overlay — shape copied from the real route body, every number invented here */
function overlayWith(rows: Record<string, MlbLiveQuote>): MlbLiveQuoteBoard {
  const at = new Date().toISOString();
  return {
    _note: "SYNTHETIC — shaped from /api/mlb/live-props; every price and count invented for this test",
    date: "2026-09-12", generatedAt: at, events: 9, fetched: 3, capped: true, live: 9, noLive: 0,
    unmatched: 0, ttlSec: 1800, stale: false, budgeted: false, spentToday: 57, oddsMissing: false,
    pricedAt: { [GKEY]: at }, emptyAt: {}, rows, quota: { remaining: 16_000, used: 57 },
  } as unknown as MlbLiveQuoteBoard;
}
function quote(ageMin: number): MlbLiveQuote {
  return {
    gkey: GKEY, lkey: LKEY, czAm: -145, oppAm: 115, bsAm: -150, bsBk: "draftkings", books: 6,
    fO: 58.4, pLive: 0.41, pSrc: "sim", evCz: 2.7, evOpp: -6.1, ln: 3.5,
    at: new Date(Date.now() - ageMin * 60_000).toISOString(),
  } as unknown as MlbLiveQuote;
}

async function renderBoard(opts: { boardAt: number; rows?: Record<string, MlbLiveQuote> | null }): Promise<string> {
  overlay = opts.rows ? overlayWith(opts.rows) : null;
  boardData = board(opts.boardAt);
  (globalThis as { React?: typeof React }).React = React;
  const mod = await import("../app/board/page");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const html = renderToString(createElement(QueryClientProvider, { client: qc }, createElement(mod.default)));
  return html.split("<!-- -->").join("");
}

describe("FIX 4 — rendered: the Board names the reason instead of rendering nothing", () => {
  it("THE CASE THAT USED TO SAY NOTHING: a board re-priced after first pitch, with no overlay", async () => {
    /* `pregameLive` is 0 here — the board is NEWER than every start — so INSTRUCTION 51's own
       paragraph is silent. This is exactly the state a board-only (?live=1) pass leaves behind. */
    const html = await renderBoard({ boardAt: FIRST_PITCH + 60 * 60_000, rows: null });
    expect(html).not.toContain('data-testid="mlb-live-unavailable"');
    expect(html).toContain('data-testid="mlb-live-reason"');
    /* THE NEUTRAL SENTENCE, NOT THE PHRASE ONE (review round, 2026-09-12). This render IS the
       not-looked-at-yet window: `useMlbLiveSyncReady` reads localStorage in a mount effect, which
       renderToString never runs, so `syncReady` is null. It used to assert the opposite — that the
       Board tells Josh his sync phrase isn't saved — which is a guess dressed as a diagnosis, and
       wrong on every phone that has one. */
    expect(html).toContain("live prices haven&#x27;t loaded yet");
    expect(html).toContain("1 game under way");
    expect(html).toContain("is showing its pregame price");
    expect(html).not.toContain("your sync phrase isn&#x27;t saved here");
  });

  it("a live game the pull never reached is named, not left blank", async () => {
    const html = await renderBoard({ boardAt: FIRST_PITCH + 60 * 60_000, rows: {} });
    expect(html).toContain('data-testid="mlb-live-reason"');
    expect(html).toContain("1 game has no live price yet");
    expect(html).not.toContain('data-testid="mlb-live-price"');
  });

  it("A PRICE THAT WENT STALE is named, with how old is too old", async () => {
    const html = await renderBoard({
      boardAt: FIRST_PITCH + 60 * 60_000,
      rows: { [`${GKEY}|${LKEY}`]: quote(MLB_LIVE_CLIENT.quoteMaxAgeSec / 60 + 15) },
    });
    expect(html).toContain('data-testid="mlb-live-reason"');
    expect(html).toContain("1 game was last priced more than 30 minutes ago");
    // and the row still shows no live price — the cap is a hard drop, not a display hint
    expect(html).not.toContain('data-testid="mlb-live-price"');
  });

  it("a fresh quote says nothing at all — the explanation appears only when one is needed", async () => {
    const html = await renderBoard({ boardAt: FIRST_PITCH + 60 * 60_000, rows: { [`${GKEY}|${LKEY}`]: quote(1) } });
    expect(html).not.toContain('data-testid="mlb-live-reason"');
    expect(html).toContain('data-testid="mlb-live-price"');
  });

  it("INSTRUCTION 51's own pregame paragraph is untouched and is never doubled up", async () => {
    const html = await renderBoard({ boardAt: FIRST_PITCH - 60 * 60_000, rows: null });
    expect(html).toContain('data-testid="mlb-live-unavailable"');
    expect(html).toContain("live in-play prices need your sync phrase");
    expect(html).not.toContain('data-testid="mlb-live-reason"');
  });
});

describe("FIX 4 — The Sharp tells the same story, and neither page starts a poll", () => {
  it("The Sharp renders the same helper's sentence, where it had no explanation at all", () => {
    const src = read("app/sharp/page.tsx");
    expect(src).toMatch(/data-testid="sharp-live-reason"/);
    expect(src).toMatch(/mlbLiveGapNote\(mlbLiveGap\(\{ liveGameKeys, rows: liveOverlay\?\.rows \?\? null \}\)/);
    expect(src).toMatch(/const liveSyncReady = useMlbLiveSyncReady\(\);/);
  });

  it("the Board renders it off the games the live poll says are under way", () => {
    const src = read("app/board/page.tsx");
    expect(src).toMatch(/data-testid="mlb-live-reason"/);
    expect(src).toMatch(/mlbLiveGap\(\{ liveGameKeys, rows: liveOverlay\?\.rows \?\? null \}\)/);
  });

  it("NO refetchInterval was added to the live hook, on either page or in the client", () => {
    for (const f of ["app/board/page.tsx", "app/sharp/page.tsx", "src/lib/mlb/live-client.ts"]) {
      expect(read(f), f).not.toMatch(/refetchInterval:(?!\s*false\b)/);
    }
  });

  it("quoteMaxAgeSec was NOT changed — the 30-minute hard drop is still 1800 seconds", () => {
    expect(MLB_LIVE_CLIENT.quoteMaxAgeSec).toBe(1800);
  });
});
