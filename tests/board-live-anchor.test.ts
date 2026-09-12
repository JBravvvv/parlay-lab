import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { stripComments } from "./helpers/source";
import type { MlbLiveQuote, MlbLiveQuoteBoard } from "@/lib/mlb/live-client";
import { MLB_LIVE_PROPS } from "@/lib/mlb/live-props-rules";

/**
 * INSTRUCTION 51 (2026-09-11) — THE BOARD, RENDERED, WITH A LIVE LINE ON IT.
 *
 * Josh's order, verbatim: "Authorize the live in-play odds pull for MLB". His complaint that
 * started it, verbatim: "It's not updating with live odds; it will show the player is top 4th w/ 3
 * H+R+RBI, but show them as an 'S' grade for over .5 H+R+RBI when their live over/under is 3.5
 * H+R+RBI".
 *
 * INSTRUCTION 50 removed the false S. This file asserts what replaces it — the three outcomes, each
 * with its own unmistakable reading on a 375px screen:
 *   A  RE-ANCHORED    a live quote at 3.5, tally 3   → live line, live price, live grade, LIVE pill,
 *                                                      no ¼-Kelly stake anywhere on the row
 *   B  SETTLED, proven a live quote at 0.5, tally 3   → INSTRUCTION 50's SETTLED cell, now citing the
 *                                                      LIVE line rather than a dead pregame one
 *   C  SETTLED, as today  no quote / too old / final  → INSTRUCTION 50, byte for byte. This is the
 *                                                      default on EVERY failure path, and Josh keeps
 *                                                      exactly the protection he already had.
 *
 * NOTE ON THE FIXTURE: every number below is a synthetic test value. The Odds API is not called to
 * build it and nothing here is or becomes product output.
 *
 * The repo has no DOM runtime (no jsdom / testing-library), so the render is renderToString and the
 * rest is comment-stripped source pins — the tests/board-settled.test.ts recipe, followed exactly.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const PAGE = "app/board/page.tsx";

const GKEY = "HOU@SEA";
const PK = 777001;
/** the STORED pregame leg — Josh's own row, locked at over 0.5 before first pitch */
const LKEY = "yordanalvarez|batter_hits_runs_rbis|0.5";

/* ---- the stubbed live world -------------------------------------------------------------- */
/** the tally the stubbed official boxscore reports */
let legVal: number | null = 3;
/** what statsapi says about the game — a quote may never outlive its game */
let gameLive = true;
let gameFinal = false;
/** the overlay the (mocked) budgeted server route returned, or null for case C */
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
    games: { [PK]: { pk: PK, state: "In Progress", live: gameLive, final: gameFinal, away: 2, home: 1, inning: "Top 4" } },
    liveCount: gameLive ? 1 : 0,
    legNow: () => ({ txt: `${legVal} H+R+RBI`, inning: "Top 4", val: legVal }),
  }),
}));
/* PARTIAL mock: the real label helpers stay real, so the clock/age strings on screen are the ones
   src/lib/mlb/live-client.ts actually produces. Only the paid fetch is replaced. */
vi.mock("@/lib/mlb/live-client", async (orig) => ({
  ...(await orig<typeof import("@/lib/mlb/live-client")>()),
  useMlbLiveQuotes: () => ({ data: overlay ?? undefined, isPending: false, isError: false }),
}));

/** one board row: the pregame lock at 0.5, graded S off a stored +12.4% EV */
const ROW = {
  label: "Yordan Alvarez (HOU)",
  sub: "H+R+RBI O 0.5",
  lkey: LKEY,
  gkey: GKEY,
  odds: -145,
  czOdds: -145,
  czEv: 12.4,
  prob: 78.2,
  implied: 59.2,
  edge: 19,
  czKellyF: 0.02,
  books: 7,
};
const board = (row: Partial<typeof ROW> = {}) => ({
  at: Date.parse("2026-09-11T16:00:00Z"),
  date: "2026-09-11",
  data: {
    overview: "",
    categories: { all: [{ ...ROW, ...row }] },
    categoriesLive: {},
    gameInfo: { [GKEY]: { pk: PK, start: "2026-09-11T19:10:00Z" } },
    games: [],
  },
});

/** SYNTHETIC — shape copied from the route's frozen body, every number invented for this test */
function quote(over: Partial<MlbLiveQuote> & { ln: number }): MlbLiveQuote {
  return {
    gkey: GKEY,
    lkey: LKEY,
    czAm: -145,
    oppAm: 115,
    bsAm: -150,
    bsBk: "draftkings",
    books: 6,
    fO: 58.4,
    pLive: 0.41,
    pSrc: "sim",
    evCz: 2.7,
    /* THE OTHER SIDE'S EV (fix pass, 2026-09-11). The overlay is keyed `gkey|player|market|line` —
       the lkey carries NO side — so one quote object serves an Over row and an Under row, and every
       other field on it is the Over's. The route now emits the Under's EV beside the Over's so the
       page never has to re-sign one into the other. SYNTHETIC, like every number here. */
    evOpp: -6.1,
    at: new Date().toISOString(),
    ...over,
  };
}

/** SYNTHETIC — the overlay body, shape-identical to MlbLiveQuoteBoard, numbers invented */
function overlayWith(q: MlbLiveQuote, ageMin = 0): MlbLiveQuoteBoard {
  const at = new Date(Date.now() - ageMin * 60_000).toISOString();
  return {
    _note: "SYNTHETIC — shaped from the real /api/mlb/live-props body; every price, line and count invented for this test",
    date: "2026-09-11",
    generatedAt: at,
    events: 9,
    fetched: 7,
    capped: false,
    live: 9,
    noLive: 2,
    unmatched: 0,
    ttlSec: 1800,
    stale: false,
    budgeted: false,
    spentToday: 214,
    oddsMissing: false,
    pricedAt: { [GKEY]: at },
    emptyAt: {},
    /* keyed off the QUOTE's own lkey, not the fixture constant: the overlay key is
       `gkey|player|market|line` and the Under cases below hold a different line (fix pass). */
    rows: { [`${q.gkey}|${q.lkey}`]: { ...q, at } },
    quota: { remaining: 16_000, used: 214 },
  } as MlbLiveQuoteBoard & { _note: string };
}

async function renderBoard(opts: {
  val?: number | null;
  q?: MlbLiveQuote | null;
  ageMin?: number;
  live?: boolean;
  final?: boolean;
  /** the STORED row, when a case needs one that is not Josh's Over 0.5 (the Under cases below) */
  row?: Partial<typeof ROW>;
}): Promise<string> {
  legVal = opts.val ?? 3;
  gameLive = opts.live ?? true;
  gameFinal = opts.final ?? false;
  overlay = opts.q ? overlayWith(opts.q, opts.ageMin ?? 0) : null;
  boardData = board(opts.row);
  // vitest compiles the page's JSX with the classic runtime — the output references a global React
  (globalThis as { React?: typeof React }).React = React;
  const mod = await import("../app/board/page");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const html = renderToString(createElement(QueryClientProvider, { client: qc }, createElement(mod.default)));
  /* React SSR emits `<!-- -->` between adjacent text nodes so it can re-find the boundaries on
     hydration, which splits every interpolated sentence — "live O <!-- -->3.5<!-- --> · -145 CZR".
     Those markers are a serialization artifact, not content; stripping them lets the assertions
     below read the sentence a person actually sees. (tests/board-settled.test.ts:122-124 solved the
     same problem by asserting only on fragments — this keeps the fragments but makes them whole.) */
  return html.split("<!-- -->").join("");
}

/** the GradeChip's own title text — the only unambiguous marker that a letter grade rendered */
const S_CHIP_PREGAME = /Tier S on EV @ Caesars/;
/** ProbBar's own bar element — a live row must never draw one off a market-derived number */
const PROB_BAR = 'class="h-1 flex-1 overflow-hidden rounded-full bg-surface-3"';
const KELLY_CHIP = "¼K";

/* React SSR splits interpolated text into separate nodes — every assertion below is on a PHRASE,
   never on a whole rendered sentence (the tests/board-settled.test.ts:122-124 lesson). */

describe("INSTRUCTION 51 — case A: a live line re-anchors the row", () => {
  it("3 H+R+RBI against a LIVE 3.5: the live line, the live price and a real grade come back", async () => {
    const html = await renderBoard({ val: 3, q: quote({ ln: 3.5 }) });
    expect(html).toContain("Yordan Alvarez");
    // the line the book is posting NOW, and its price — this is literally Josh's sentence
    expect(html).toContain("live O 3.5");
    expect(html).toContain("-145 CZR");
    // the row is OPEN again: no SETTLED anywhere, and the suppression fell away on its own
    expect(html, "a row whose live line the tally has not cleared is not settled").not.toContain("SETTLED");
    // graded on the LIVE EV, not the pregame one
    // the grade is gradeFromEv(+2.7%) = B, computed off the LIVE EV and labelled with its basis
    expect(html).toContain("Tier B on EV at the live Caesars line");
    expect(html, "the pregame S grade may never survive a re-anchor").not.toMatch(S_CHIP_PREGAME);
  });

  it("a re-anchored row is unmistakably live: the pulsing LIVE pill and a per-game clock stamp", async () => {
    const html = await renderBoard({ val: 3, q: quote({ ln: 3.5 }) });
    expect(html).toContain('data-testid="mlb-live-pill"');
    expect(html).toContain("LIVE");
    expect(html).toContain("pulse-dot");
    expect(html).toContain('data-testid="mlb-live-price"');
    // freshness is stated, per game, off the overlay's own pricedAt
    expect(html).toContain("just now");
  });

  it("NO ¼-Kelly stake on a live line — the stake column carries the tag instead", async () => {
    const html = await renderBoard({ val: 3, q: quote({ ln: 3.5 }) });
    expect(html).toContain('data-testid="mlb-live-tag"');
    expect(html).toContain("In play — graded on EV at Caesars, no ¼-Kelly stake on a live line");
    expect(html, "a stake chip on an in-play line is an instruction to bet a phantom").not.toContain(KELLY_CHIP);
  });

  it("the EV cell prints the LIVE EV, and the row does not glow", async () => {
    const html = await renderBoard({ val: 3, q: quote({ ln: 3.5, evCz: 2.7 }) });
    expect(html).toContain('data-testid="mlb-live-ev"');
    expect(html).toContain("+2.7%");
    expect(html, "the stored pregame EV may not sit beside a live price").not.toContain("+12.4%");
    // ev-glow says "this is a MODEL edge"; a live row is graded against the market's own price
    expect(html, "the model-edge glow may not survive a re-anchor").not.toContain("ev-glow");
  });

  it("True %: the sim's remaining-game number, shown as pregame → live", async () => {
    const html = await renderBoard({ val: 3, q: quote({ ln: 3.5, pLive: 0.41, pSrc: "sim" }) });
    expect(html).toContain('data-testid="mlb-live-prob"');
    expect(html).toContain("78.2%");
    expect(html).toContain("41.0% live");
    expect(html).not.toContain(PROB_BAR);
  });
});

describe("INSTRUCTION 51 — a market-derived fair is never dressed as a model number", () => {
  it('pSrc "market" reads "market fair", muted, and NEVER as a ProbBar', async () => {
    const html = await renderBoard({ val: 3, q: quote({ ln: 3.5, pLive: 0.41, pSrc: "market" }) });
    expect(html).toContain("41.0% market fair");
    expect(html, "a bar reads as edge over the market, and a market fair has none by construction").not.toContain(PROB_BAR);
    expect(html).not.toContain("41.0% live");
  });
});

/* ONE QUOTE, TWO SIDES — the defect that was invisible by inspection (fix pass, 2026-09-11).

   The overlay is keyed `gkey|lkey` and `lkey` is `player|market|line`: THE SIDE IS NOT IN THE KEY.
   An Over row and an Under row on the same line therefore share ONE quote object, and every field
   on it — czAm, evCz, pLive — is the OVER's. Before this pass both rows rendered straight off that
   object, so an Under was shown the Over's price, the Over's EV and the Over's probability with its
   own sign kept: the most dangerous thing on the page, because every number looked plausible.
   `mlbLiveView(q, side)` is the single place the flip happens, and these cases render it. */
describe("INSTRUCTION 51 — an UNDER row is priced as an UNDER", () => {
  /** the stored leg: Alvarez UNDER 3.5 H+R+RBI, one banked — open, and re-anchorable */
  const UNDER = { sub: "H+R+RBI U 3.5", lkey: "yordanalvarez|batter_hits_runs_rbis|3.5" };

  it("the Under sees the UNDER's price and line, never the Over's", async () => {
    const html = await renderBoard({ val: 1, row: UNDER, q: quote({ ln: 3.5, lkey: UNDER.lkey, czAm: -145, oppAm: 115 }) });
    expect(html).toContain("live U 3.5");
    expect(html).toContain("+115 CZR");
    expect(html, "the Over's price on an Under row is a wrong number that reads as a right one").not.toContain("-145 CZR");
  });

  it("the Under sees the UNDER's EV and the UNDER's probability", async () => {
    const html = await renderBoard({ val: 1, row: UNDER, q: quote({ ln: 3.5, lkey: UNDER.lkey, evCz: 2.7, evOpp: -6.1, pLive: 0.41, pSrc: "sim" }) });
    // EV: the route computes the other side off the other price — the page never re-signs one EV
    expect(html).toContain('data-testid="mlb-live-ev"');
    expect(html).toContain("-6.1%");
    expect(html, "the Over's EV may never appear on an Under row").not.toContain("+2.7%");
    // True %: 1 - pLive, because the overlay's pLive is always P(over)
    expect(html).toContain("59.0% live");
    expect(html).not.toContain("41.0% live");
  });

  it("THE UNDER GATE, rendered: a lost Under stays SETTLED even though the book moved the line", async () => {
    /* stored UNDER 0.5 with 3 banked is a LOST bet. Re-anchoring it to the live 3.5 would print it
       open, graded and priced — a dead ticket back at the top of the board. */
    const html = await renderBoard({ val: 3, row: { sub: "H+R+RBI U 0.5", lkey: LKEY }, q: quote({ ln: 3.5 }) });
    expect(html).toContain("SETTLED");
    expect(html).toContain("this Under is decided lost");
    expect(html).toContain("already 3 vs a 0.5 line"); // its OWN line, not the live one
    expect(html).not.toContain("live U 3.5");
    expect(html).not.toContain('data-testid="mlb-live-pill"');
  });

  it("an OVER row is untouched by the gate — Josh's own case still re-anchors", async () => {
    const html = await renderBoard({ val: 3, q: quote({ ln: 3.5 }) });
    expect(html).toContain("live O 3.5");
    expect(html).not.toContain("SETTLED");
  });
});

/* THE MODEL-VOCABULARY GATE, rendered. `legPOf` is never supplied, so `pSrc` is "market" on 100% of
   production rows today: the "fair" IS the de-vigged live pair, an edge of zero by construction. A
   letter grade and a green EV badge on that number are the model claiming an edge over the price it
   was derived from. The figure stays — Josh asked for the live price — with its source named. */
describe("INSTRUCTION 51 — no letter grade and no EV badge on a market-derived fair", () => {
  it("the Grade cell prints the figure and names the market, and no letter", async () => {
    const html = await renderBoard({ val: 3, q: quote({ ln: 3.5, pSrc: "market", evCz: 2.7 }) });
    expect(html).toContain('data-testid="mlb-live-market-grade"');
    expect(html).toContain("+2.7% vs market");
    expect(html, "a letter grade nobody computed is worse than no grade").not.toContain("Tier B on EV at the live Caesars line");
    expect(html).not.toMatch(S_CHIP_PREGAME);
    // the row is still unmistakably live, and still carries no stake
    expect(html).toContain('data-testid="mlb-live-pill"');
    expect(html).not.toContain(KELLY_CHIP);
  });

  it("the EV cell prints the same figure, muted, and never the green/red badge", async () => {
    const html = await renderBoard({ val: 3, q: quote({ ln: 3.5, pSrc: "market", evCz: 2.7 }) });
    const ev = html.slice(html.indexOf('data-testid="mlb-live-ev"'));
    expect(ev).toContain("vs market");
    // EvBadge's own bordered chip classes (src/components/ui/EvBadge.tsx) — absent on a market fair
    expect(ev.slice(0, 400), "EvBadge dresses a zero-edge number as an edge").not.toContain("border-pos/40 bg-pos/10");
  });

  it("with a SIM fair the letter and the badge come back — the gate is the source, not the build", async () => {
    const html = await renderBoard({ val: 3, q: quote({ ln: 3.5, pSrc: "sim", evCz: 2.7 }) });
    expect(html).toContain("Tier B on EV at the live Caesars line");
    expect(html).not.toContain('data-testid="mlb-live-market-grade"');
  });
});

/* WHY THERE IS NO LIVE LINE, WHEN THERE IS NONE (fix pass, 2026-09-11). The route is behind the sync
   phrase; without one the query is disabled and the Board showed pregame numbers with no explanation
   — Josh's reported symptom, wearing no symptom at all. NOTE ON WHAT THIS RENDER CAN SEE:
   renderToString runs no effects, so the phrase read (a mount effect, to keep hydration honest) has
   not happened yet and this is exactly the no-phrase branch. The other two wordings are pinned as
   source below rather than claimed as rendered. */
describe("INSTRUCTION 51 — a missing live overlay explains itself", () => {
  it("a game under way with no overlay says why, and does not pretend the row is live", async () => {
    const html = await renderBoard({ val: 3, q: null });
    expect(html).toContain('data-testid="mlb-live-unavailable"');
    expect(html).toContain("live in-play prices need your sync phrase");
    expect(html).not.toContain('data-testid="mlb-live-footnote"');
    expect(html).not.toContain('data-testid="mlb-live-pill"');
  });

  it("with an overlay the explanation is gone and the footnote speaks instead", async () => {
    const html = await renderBoard({ val: 3, q: quote({ ln: 3.5 }) });
    expect(html).not.toContain('data-testid="mlb-live-unavailable"');
    expect(html).toContain('data-testid="mlb-live-footnote"');
  });

  it("all three reasons are distinguished, and the route's error is quoted rather than guessed", () => {
    const src = stripComments(read(PAGE));
    expect(src).toContain("live in-play prices need your sync phrase");
    expect(src).toMatch(/live in-play prices are unavailable — the server route answered/);
    expect(src).toContain("live in-play prices have not loaded yet");
    // the hook is what makes the first branch possible: the query is DISABLED without a phrase,
    // and the phrase rides the header the route authenticates on
    const client = stripComments(read("src/lib/mlb/live-client.ts"));
    expect(client).toMatch(/"x-pl-sync": key \|\| getSyncKey\(\)/);
    expect(client).toMatch(/enabled: !!date && !!key/);
  });
});

describe("INSTRUCTION 51 — case B: settled, and now provably so at the LIVE line", () => {
  it("3 H+R+RBI against a LIVE 0.5 keeps INSTRUCTION 50's SETTLED cell, citing the live line", async () => {
    const html = await renderBoard({ val: 3, q: quote({ ln: 0.5 }) });
    expect(html).toContain("SETTLED");
    expect(html).toContain("already 3 vs a 0.5 line");
    expect(html).toContain("this Over is decided won");
    // and it says WHERE that line came from — the live pull, not a pregame lock
    expect(html).toContain("— at the live line");
    expect(html).not.toContain("— priced pregame");
    expect(html).not.toMatch(S_CHIP_PREGAME);
    expect(html, "a settled row carries no stake, live quote or not").not.toContain(KELLY_CHIP);
  });
});

describe("INSTRUCTION 51 — case C: every failure path lands on INSTRUCTION 50, unchanged", () => {
  it("no quote at all: the board is exactly what it was before this build", async () => {
    const html = await renderBoard({ val: 3, q: null });
    expect(html).toContain("SETTLED");
    expect(html).toContain("already 3 vs a 0.5 line");
    expect(html).toContain("— priced pregame");
    expect(html).not.toContain('data-testid="mlb-live-price"');
    expect(html).not.toContain('data-testid="mlb-live-tag"');
    expect(html).not.toMatch(S_CHIP_PREGAME);
  });

  it("THE HARD RENDER-TIME DROP: a 31-minute-old quote is discarded even though the store still holds it", async () => {
    const fresh = await renderBoard({ val: 3, q: quote({ ln: 3.5 }), ageMin: 0 });
    expect(fresh).toContain("live O 3.5");
    const stale = await renderBoard({ val: 3, q: quote({ ln: 3.5 }), ageMin: 31 });
    expect(stale, "a label older than quoteMaxAgeSec may never reach the screen").not.toContain("live O 3.5");
    expect(stale).not.toContain('data-testid="mlb-live-pill"');
    // and it falls all the way back to INSTRUCTION 50's suppression, not to a bare pregame grade
    expect(stale).toContain("SETTLED");
    expect(stale).toContain("— priced pregame");
  });

  it("a quote whose game statsapi reports FINAL is dropped — a quote never outlives its game", async () => {
    const html = await renderBoard({ val: 3, q: quote({ ln: 3.5 }), live: false, final: true });
    expect(html, "a finished game may never show a live price").not.toContain("live O 3.5");
    expect(html).not.toContain('data-testid="mlb-live-pill"');
    expect(html).toContain("SETTLED");
  });

  it("29 minutes old is still inside the cap — the drop is a cap, not a blanket refusal", async () => {
    const html = await renderBoard({ val: 3, q: quote({ ln: 3.5 }), ageMin: 29 });
    expect(html).toContain("live O 3.5");
    expect(html).toContain("29m");
  });
});

describe("INSTRUCTION 51 — the header and footnote say what was bought (render)", () => {
  it("the header splits live from pregame and names the spend against its own budget", async () => {
    const html = await renderBoard({ val: 3, q: quote({ ln: 3.5 }) });
    expect(html).toContain("1 game under way");
    expect(html).toContain("1 priced live");
    expect(html).toContain("0 priced pregame");
    expect(html).toContain("214/600 live-odds credits");
  });

  it("the footnote counts real games and states the budget out loud", async () => {
    const html = await renderBoard({ val: 3, q: quote({ ln: 3.5 }) });
    expect(html).toContain('data-testid="mlb-live-footnote"');
    expect(html).toContain("live lines priced");
    expect(html).toContain("post no in-play market");
    expect(html).toContain("today&#x27;s live-odds budget is ");
    expect(html).toContain("prices are posted quotes, never invented");
  });

  it("with no overlay the header reads exactly as INSTRUCTION 50 left it", async () => {
    const html = await renderBoard({ val: 3, q: null });
    expect(html).toContain("under way — priced pregame");
    expect(html).not.toContain('data-testid="mlb-live-footnote"');
    expect(html).not.toContain("live-odds credits");
  });
});

describe("INSTRUCTION 51 — the guard itself (source pins)", () => {
  const src = stripComments(read(PAGE));

  it("rowLive refuses on all three grounds: no quote, game not live, quote too old", () => {
    const fn = src.slice(src.indexOf("const rowLive = useCallback"), src.indexOf("const livePricedAt"));
    expect(fn).toMatch(/if \(!q\) return null;/);
    expect(fn).toMatch(/if \(pk == null \|\| !liveNow\.games\[pk\]\?\.live\) return null;/);
    expect(fn).toContain("if (Date.now() - Date.parse(q.at) > MLB_LIVE_CLIENT.quoteMaxAgeSec * 1000) return null;");
  });

  it("BOTH ¼-Kelly columns carry the live tag — the basis column too, which no render here reaches", () => {
    // dk_fd basis mode is a localStorage read after mount, so renderToString only ever exercises
    // the Caesars column; the basis column's guard is pinned in source instead of left unasserted
    expect(src.match(/<LiveTag \/>/g)?.length ?? 0).toBe(2);
    const bs = src.slice(src.indexOf('sortValue: (r) => (rowSettled(r) ? -99 : Number(r.bsKellyF) || 0)'), src.indexOf('key: "best",'));
    expect(bs).toMatch(/<LiveTag \/>/);
  });

  it("the live pull's two enforced numbers ARE the spec's own — the client mirror cannot drift", async () => {
    // live-client.ts is "use client" and so must NOT import live-props-rules.ts: that module reads
    // REFILL_SLOTS_PT out of src/lib/server/*, which has no business in a browser bundle. It mirrors
    // the two integers instead — and a mirror is only safe if something fails when it drifts. Read
    // through importActual, not the mocked module, so a future mock cannot satisfy this pin.
    const { MLB_LIVE_CLIENT } = await vi.importActual<typeof import("@/lib/mlb/live-client")>(
      "@/lib/mlb/live-client",
    );
    expect(MLB_LIVE_CLIENT.quoteMaxAgeSec).toBe(MLB_LIVE_PROPS.quoteMaxAgeSec);
    expect(MLB_LIVE_CLIENT.dailyBudget).toBe(MLB_LIVE_PROPS.dailyBudget);
    // field-for-field, so a key added to the mirror that MLB_LIVE_PROPS does not author is drift too
    for (const [k, v] of Object.entries(MLB_LIVE_CLIENT)) {
      expect(MLB_LIVE_PROPS, `MLB_LIVE_CLIENT.${k} mirrors nothing in MLB_LIVE_PROPS`).toHaveProperty(k, v);
    }
    // and the spec's own values, so editing BOTH objects in step still trips a pin. s §8: this pull
    // is ADDITIVE — 600 new credits, no existing budget lowered.
    expect(MLB_LIVE_CLIENT.quoteMaxAgeSec).toBe(1800);
    expect(MLB_LIVE_CLIENT.dailyBudget).toBe(600);
    // the source still carries the render-time-drop comment that explains why 1800 is a hard cap
    const client = stripComments(read("src/lib/mlb/live-client.ts"));
    expect(client).toMatch(/quoteMaxAgeSec: 1800/);
    expect(client).toMatch(/dailyBudget: 600/);
  });

  it("PLANT: tearing the quoteMaxAgeSec drop out of rowLive is detected", () => {
    const victim = "if (Date.now() - Date.parse(q.at) > MLB_LIVE_CLIENT.quoteMaxAgeSec * 1000) return null;";
    expect(src).toContain(victim);
    const stripped = src.split(victim).join("");
    expect(stripped, "the checker is blind to the render-time drop being removed").not.toContain(victim);
    expect(stripped).not.toMatch(/quoteMaxAgeSec \* 1000\) return null/);
  });

  it("PLANT: re-attaching a ¼-Kelly stake to a live row is detected", () => {
    const victim = "<LiveTag />";
    expect(src).toContain(victim);
    const stripped = src.split(victim).join("<KellyChip stake={Number(r.czKellyF) * bankroll} />");
    expect(stripped, "the checker cannot see a stake chip reappear on an in-play line").not.toContain(victim);
  });

  it("every fixture in this file is marked SYNTHETIC — the Odds API is not called to build one", () => {
    const ov = overlayWith(quote({ ln: 3.5 })) as MlbLiveQuoteBoard & { _note?: string };
    expect(String(ov._note)).toMatch(/SYNTHETIC/);
    expect(Object.keys(ov)[0]).toBe("_note");
  });
});
