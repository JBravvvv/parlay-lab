import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { stripComments } from "./helpers/source";

/**
 * INSTRUCTION 50 (2026-09-11), Josh's item 2, verbatim:
 *   "It's not updating with live odds; it will show the player is top 4th w/ 3 H+R+RBI, but show
 *    them as an 'S' grade for over .5 H+R+RBI when their live over/under is 3.5 H+R+RBI"
 *
 * THE MECHANISM: the page already held both numbers on the same render — the live tally from the
 * official boxscore (the ● chip in the Pick cell) and the stored pregame EV the grade is a label
 * on — and never compared them. A leg whose tally has passed its line is DECIDED: the Over won,
 * the Under lost, at any point in any game, because all six MLB prop markets are monotone counting
 * stats. Grading such a row S is manufacturing an edge out of a settled bet.
 *
 * This file renders the real Board page server-side with a stubbed live feed and asserts the
 * suppression: no grade chip, a SETTLED tag, the row still VISIBLE, and the grade chip back the
 * instant the leg is undecided again.
 *
 * NOTE ON THE FIXTURE: every number below is a synthetic test value, not a quote from any book.
 * Nothing here is or becomes product output.
 *
 * The repo has no DOM runtime (no jsdom / testing-library), so the render is renderToString and
 * the rest is comment-stripped source pins — following tests/board-overview-toggle.test.ts.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const PAGE = "app/board/page.tsx";

/** the live tally the stubbed boxscore reports for the one board row */
let legVal: number | null = 3;
/** the row's side, in the board's own sub grammar (" O " / " U ") */
let legSub = "H+R+RBI O 0.5";
let boardData: unknown = null;

vi.mock("@/lib/useBoard", () => ({
  useBoard: () => ({ data: boardData, isPending: false, isError: false, refetch: () => {} }),
  useRegenerateBoard: () => ({ mutate: () => {}, isPending: false, isSuccess: false, isError: false, error: null }),
}));
/* the page imports useRefillDesk from @/lib/refill-client, NOT from @/lib/useBoard — mocking
   useBoard alone leaves the real mutation (and its ledger sync) wired into the render */
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
    at: Date.parse("2026-09-11T20:10:00Z"),
    games: {},
    liveCount: 1,
    legNow: () => ({ txt: `${legVal} H+R+RBI`, inning: "Top 4", val: legVal }),
  }),
}));

const GKEY = "HOU@SEA";
const LKEY = "yordanalvarez|batter_hits_runs_rbis|0.5";
/** one board row at a 0.5 line whose stored pregame EV grades S (+6 is the S cut) */
const ROW = {
  label: "Yordan Alvarez (HOU)",
  sub: legSub,
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
const board = () => ({
  at: Date.parse("2026-09-11T16:00:00Z"),
  date: "2026-09-11",
  data: {
    overview: "",
    categories: { all: [{ ...ROW, sub: legSub }] },
    categoriesLive: {},
    gameInfo: { [GKEY]: { pk: 777001, start: "2026-09-11T19:10:00Z" } },
    games: [],
  },
});

async function renderBoard(val: number | null, sub = "H+R+RBI O 0.5"): Promise<string> {
  legVal = val;
  legSub = sub;
  boardData = board();
  // vitest compiles the page's JSX with the classic runtime — the output references a global React
  (globalThis as { React?: typeof React }).React = React;
  const mod = await import("../app/board/page");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(createElement(QueryClientProvider, { client: qc }, createElement(mod.default)));
}

/** the GradeChip's own title text — the only unambiguous marker that a letter grade rendered */
const S_CHIP = /Tier S on EV @ Caesars/;
const SETTLED_LINE = "already 3 vs a 0.5 line — this Over is decided won — the price shown is the pregame lock, not a live market";
/** EvBadge prints the stored pregame EV through fmtEv; KellyChip prints the ¼K tag */
const EV_BADGE = "+12.4%";
const KELLY_CHIP = "¼K";

describe("INSTRUCTION 50 item 2 — a decided leg shows no manufactured grade", () => {
  it("3 H+R+RBI against a 0.5 line: SETTLED, no S chip, row still on the board", async () => {
    const html = await renderBoard(3);
    // the row itself is never hidden or deleted
    expect(html).toContain("Yordan Alvarez");
    // the grade is suppressed and replaced by an honest tag
    expect(html).toContain("SETTLED");
    expect(html).toContain(SETTLED_LINE);
    expect(html, "an S grade was minted on a bet that is already decided").not.toMatch(S_CHIP);
    // and the live chip states the relation in plain language (React SSR splits text nodes,
    // so the assertion is on the phrase, not the whole interpolated sentence)
    expect(html).toContain("— priced pregame");
    expect(html).toContain("3 H+R+RBI");
  });

  /* THE WHOLE ROW, NOT ONE CELL. Suppressing only the Grade chip left the same row printing the
     pregame number four more ways — EV @ CZR, the green EDGE badge, the ¼-Kelly stake chip and
     the row's ev-glow — so one honest cell sat among four dishonest ones, and the stake chip is
     an instruction to bet money on a bet that is already decided. */
  it("a settled row prints NO EV badge, NO ¼-Kelly stake and NO ev-glow", async () => {
    const html = await renderBoard(3);
    expect(html, "the pregame EV badge survived on a decided leg").not.toContain(EV_BADGE);
    expect(html, "a stake chip on a decided leg is an instruction to bet").not.toContain(KELLY_CHIP);
    expect(html, "the green edge glow survived on a decided leg").not.toContain("ev-glow");
    // the True % bar is relabelled rather than drawn as a live probability
    expect(html).toContain("% pregame model");
    // and every one of those cells is still THERE, as an em dash — nothing is hidden
    expect(html).toContain("Yordan Alvarez");
  });

  it("undecided keeps all four: EV badge, stake chip and the glow come back", async () => {
    const html = await renderBoard(0);
    expect(html).toContain(EV_BADGE);
    expect(html).toContain(KELLY_CHIP);
    expect(html).toContain("ev-glow");
  });

  /* A cleared line settles the Over WON and the Under LOST at the same instant. Wording it from
     the line alone ("already over 0.5") reads as good news beside an under bet that just lost. */
  it("an Under leg past its line reads 'decided lost', never 'already over'", async () => {
    const html = await renderBoard(3, "H+R+RBI U 0.5");
    expect(html).toContain("SETTLED");
    expect(html).toContain("this Under is decided lost");
    expect(html).not.toContain("already over");
    expect(html).not.toMatch(S_CHIP);
  });

  it("0 H+R+RBI against the same 0.5 line: undecided, so the grade chip is back", async () => {
    const html = await renderBoard(0);
    expect(html).toContain("Yordan Alvarez");
    expect(html, "an undecided leg must keep its grade").toMatch(S_CHIP);
    expect(html).not.toContain("SETTLED");
    expect(html).not.toContain(SETTLED_LINE);
  });

  it("a tally exactly AT the line is not settled — a push is never claimed decided", async () => {
    // 0.5 lines cannot push; a 1.5-line row with a tally of 1 is the undecided case that matters,
    // and legSettled's contract (val > ln, never >=) is what this render depends on
    const html = await renderBoard(0.5);
    expect(html).not.toContain("SETTLED");
    expect(html).toMatch(S_CHIP);
  });

  it("no live number at all (player not in the boxscore) leaves the board exactly as it was", async () => {
    const html = await renderBoard(null);
    expect(html).not.toContain("SETTLED");
    expect(html).toMatch(S_CHIP);
  });
});

describe("INSTRUCTION 50 item 2 — all three grade cells sit behind the guard (source pins)", () => {
  const src = stripComments(read(PAGE));

  /* ONE guard, hoisted to the row, so a later edit cannot restore the bug in a single cell.
     INSTRUCTION 51 (2026-09-11) made it THREE-WAY without making it a second rule: the same
     settledRead is asked the same question, at the line the book is posting NOW when the paid
     in-play pull returned one, and at the stored pregame line when it did not. Case A falls out
     for free — 3 is not past a live 3.5, so settledRead returns null on its own and every money
     cell comes back graded at the live price. This stays an EXACT-SIGNATURE pin, not a loose one:
     the join is the whole mechanism and a paraphrase of it is a different mechanism. */
  it("rowSettled is the single per-row guard, asked at the LIVE line when one was bought", () => {
    /* AMENDED in the fix pass (2026-09-11) for the Under gate, and for that reason only. The swap
       is an OVER-ONLY move: a tally past the stored line settles the Over WON and the Under LOST at
       the same instant, so re-anchoring an Under to a higher live line un-decides a decided loss and
       prints a dead ticket as open, graded and priced. Josh's own row, mirrored: 3 H+R+RBI against a
       stored UNDER 0.5 is gone, and a live 3.5 does not bring it back. */
    expect(src).toMatch(
      /const rowSettled = useCallback\(\s*\(r: \{ gkey\?: string \| null; lkey\?: string \| null; sub\?: string \| null \}\): LegSettledRead \| null => \{\s*const q = rowLive\(r\);\s*const tally = legLive\(\{ gkey: r\.gkey, lkey: r\.lkey \}\)\?\.val;\s*if \(!q \|\| legSideOf\(r\.sub\) === "U"\) return settledRead\(r\.lkey, r\.sub, tally\);\s*const \[player, market\] = String\(r\.lkey \?\? ""\)\.split\("\|"\);\s*return settledRead\(`\$\{player\}\|\$\{market\}\|\$\{q\.ln\}`, r\.sub, tally\);\s*\},\s*\[legLive, rowLive\],/,
    );
    // the side is read from leg-settled's single authority — never a fourth copy of the regex
    expect(src).toMatch(/import \{ legSideOf, settledRead, type LegSettledRead \} from "@\/lib\/leg-settled";/);
    expect(src).not.toMatch(/\(\^\|\\s\)U\(nder\)\?/);
    // the join key is the ORIGINAL lkey's player and market — only the LINE segment moves, which
    // is why lineOf needs no edit and tab purity (segment 1) still holds
    expect(src).not.toMatch(/settledRead\(`\$\{q\.gkey\}/);
  });

  it("the live-board Grade column suppresses through rowSettled, in the cell AND the sort key", () => {
    const col = src.slice(src.indexOf('key: "grade",'), src.indexOf('key: "prob",'));
    expect(col).toMatch(/rowSettled\(r\)/);
    // sortValue returns gradeRank(null) = 0, so a settled row sinks instead of topping the table
    expect(col).toMatch(/\? gradeRank\(null\)/);
    expect(col).toMatch(/<SettledGrade read=\{s0\} \/>/);
  });

  it("EVERY money cell on the row is behind the same guard — EV, stake and the glow", () => {
    // EV @ CZR and EV @ basis
    expect(src).toMatch(/sortValue: \(r\) => \(rowSettled\(r\) \? -99 : Number\(r\.czEv\) \|\| 0\)/);
    expect(src).toMatch(/sortValue: \(r\) => \(rowSettled\(r\) \|\| r\.bsEv == null \? -99 : Number\(r\.bsEv\)\)/);
    // both ¼-Kelly stake columns
    expect(src).toMatch(/sortValue: \(r\) => \(rowSettled\(r\) \? -99 : Number\(r\.czKellyF\) \|\| 0\)/);
    expect(src).toMatch(/sortValue: \(r\) => \(rowSettled\(r\) \? -99 : Number\(r\.bsKellyF\) \|\| 0\)/);
    // the row's own green edge glow
    expect(src).toMatch(/rowClassName=\{\(r\) => \(r\.susp \|\| rowSettled\(r\) \?/);
    // four cells collapse to the shared em-dash placeholder
    expect(src.match(/<SettledDash \/>/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("the stamped-picks / ALL-scope Grade column suppresses through the same predicate", () => {
    /* AMENDED in the fix pass (2026-09-11). This column had NO INSTRUCTION 51 wiring at all: on a
       prop tab `pickRows` is non-null, so the stamped-picks table rendered while every live cell was
       unreachable — the pregame grade against a live line, which is Josh's complaint verbatim. It now
       performs the SAME three-way join as `rowSettled`, Under gate included. `p.side` is the sub
       string here (app/api/picks/route.ts sets `side: r.sub ?? null`). */
    expect(src).toMatch(
      /const pickSettled = useCallback\(\s*\(p: ApiPick\): LegSettledRead \| null => \{\s*const q = pickLive\(p\);\s*const tally = legLive\(\{ gkey: p\.gkey, lkey: p\.lkey \}\)\?\.val;\s*if \(!q \|\| legSideOf\(p\.side\) === "U"\) return settledRead\(p\.lkey, p\.side, tally\);\s*const \[player, market\] = String\(p\.lkey \?\? ""\)\.split\("\|"\);\s*return settledRead\(`\$\{player\}\|\$\{market\}\|\$\{q\.ln\}`, p\.side, tally\);\s*\},\s*\[legLive, pickLive\],/,
    );
    // and the stamped table reads the live overlay through the same single hook the board does
    expect(src).toMatch(/const pickLive = useCallback\(/);
    const col = src.slice(src.indexOf("const pickColumns"), src.indexOf('key: "pick",', src.indexOf("const pickColumns")));
    /* the sort key is now three-way, exactly like the cell: settled sinks to gradeRank(null), a
       re-anchored row ranks on the LIVE EV (and only when a sim fair computed it — a market fair
       gets no letter, so it ranks as ungraded), and an unpriced row keeps its pregame edge. */
    expect(col).toMatch(/return pickSettled\(p\)\s*\? gradeRank\(null\)/);
    expect(col).toMatch(/gradeRank\(v\.pSrc === "sim" \? gradeFromEv\(v\.ev\) : null\)/);
    expect(col).toMatch(/<SettledGrade read=\{s0\} \/>/);
    expect(col).toMatch(/<LiveGrade view=\{mlbLiveView\(q, legSideOf\(p\.side\)\)\} pricedAt=\{livePricedAt\(p\.gkey\)\} \/>/);
  });

  it("ApiPick carries lkey, and the ALL-scope builder copies it off the prop-board row", () => {
    expect(src).toMatch(/lkey\?: string \| null;/);
    expect(src).toMatch(/gkey: g\.gkey, start: g\.start, res: null, market: m, lkey: r\.lkey \?\? null,/);
  });

  it("PLANT: removing the settled guard from a money cell is detected", () => {
    const victim = "rowSettled(r) ? -99 : Number(r.czEv) || 0";
    expect(src).toContain(victim);
    const stripped = src.split(victim).join("Number(r.czEv) || 0");
    expect(stripped, "the checker is blind to the guard being torn out").not.toContain(victim);
  });

  it("the SETTLED cell invents no price and no line — it quotes the module's own read", () => {
    const cell = src.slice(src.indexOf("function SettledGrade"), src.indexOf("function OutTag"));
    // the sentence comes from legSettled's own `why`, which names the side and the real numbers
    expect(cell).toMatch(/\$\{read\.why\} — the price shown is the pregame lock, not a live market/);
    expect(cell).toMatch(/SETTLED/);
    // no hand-typed american price anywhere in the cell
    expect(cell).not.toMatch(/[+-]\d{3}/);
  });

  /* INSTRUCTION 51's sibling to the pin above. The SETTLED cell may print no price because it has
     none; the LIVE cells print one because the route BOUGHT one — and the distinction that matters
     is that theirs comes out of the quote object, digit for digit, and is never typed by hand. */
  it("the live cells quote the price from the quote object, and hand-type no number either", () => {
    const cells = src.slice(src.indexOf("function LivePriceLine"), src.indexOf("function LiveTag"));
    /* AMENDED in the fix pass (2026-09-11): every cell now takes a SIDED view of the quote rather
       than the quote itself. The overlay is keyed `gkey|player|market|line` — the lkey carries no
       side — so one quote object serves an Over row and an Under row, and every field on it is the
       OVER's. Reading `quote.czAm` on an Under printed the Over's price, the Over's EV and the
       Over's probability with the Under's sign kept. `mlbLiveView(q, side)` is the one place that
       flip happens, so these pins now require the view, not the raw quote. */
    expect(cells).toMatch(/fmtAmerican\(view\.am\)/); //  the price, for THIS row's side
    expect(cells).toMatch(/live \{view\.side\} \{view\.ln\}/); // the line, labelled O or U
    expect(cells).toMatch(/gradeFromEv\(view\.ev\)/); //  the grade
    expect(cells).toMatch(/view\.p \* 100/); //            the probability
    expect(cells).not.toMatch(/quote\.czAm|quote\.evCz|quote\.pLive/); // no raw, unsided read left
    // and not one hand-typed american price anywhere in any of them
    expect(cells).not.toMatch(/[+-]\d{3}/);
  });

  /* THE MODEL-VOCABULARY GATE (fix pass, 2026-09-11). `legPOf` is never supplied, so `pSrc` is
     "market" on 100% of production rows today: the "fair" is the de-vigged live pair itself, an edge
     of zero by construction. A GradeChip or an EvBadge on that number is the model asserting an edge
     over the price it was derived from — a confidently wrong S. The figure is still shown, with its
     source named, as muted text. Both money cells gate on the same single field. */
  it("GradeChip and EvBadge are unreachable on a market-derived fair", () => {
    const grade = src.slice(src.indexOf("function LiveGrade"), src.indexOf("function LiveProb"));
    expect(grade).toMatch(/view\.pSrc === "sim" \? \(\s*<GradeChip/);
    expect(grade).toMatch(/data-testid="mlb-live-market-grade"/);
    expect(grade).toMatch(/% vs market/);
    const ev = src.slice(src.indexOf("function LiveEv"), src.indexOf("function CzPrice"));
    expect(ev).toMatch(/view\.pSrc === "sim" \? \(/);
    expect(ev.slice(ev.indexOf("<EvBadge")), "EvBadge must sit inside the sim branch").toBeTruthy();
    expect(ev.indexOf('view.pSrc === "sim"')).toBeLessThan(ev.indexOf("<EvBadge"));
    // the True % cell draws no ProbBar on a market fair either — a bar reads as edge
    const prob = src.slice(src.indexOf("function LiveProb"), src.indexOf("function LiveEv"));
    expect(prob).not.toMatch(/<ProbBar/);
    expect(prob).toMatch(/market fair/);
  });

  /* And the price columns. A re-anchored row whose grade, EV, True % and stated line have all moved
     to the live number may not keep an UNLABELLED pregame american in the settlement column. */
  it("the Caesars column never prints an unlabelled pregame price on a re-anchored row", () => {
    const cz = src.slice(src.indexOf("function CzPrice"), src.indexOf("function LiveTag"));
    expect(cz).toMatch(/if \(!live\) return <OddsCell odds=\{row\.czOdds as never\} book="caesars" \/>;/);
    expect(cz).toMatch(/mlbLiveView\(live, legSideOf\(row\.sub\)\)/);
    expect(cz).toMatch(/no live price/);
    expect(cz).toMatch(/data-testid="mlb-live-cz"/);
    // and the board uses it in BOTH Caesars price columns rather than calling OddsCell directly
    expect((src.match(/<CzPrice row=\{r\} live=\{rowQuote\(r\)\} \/>/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  /* THE PRESENTATION GATE (fix pass, 2026-09-11). `rowSettled` refuses to re-anchor an Under, so on
     a settled Under every number is read at the line Josh holds — and the cells must then not print
     the live line, the live price or "at the live line" beside that verdict, or they claim the live
     line decided a bet it did not decide. `rowQuote` is that single gate; `rowSettled` keeps asking
     the RAW `rowLive`, which is what lets case B (an Over decided at the live line) cite it. */
  it("the quote a row PRESENTS is gated, and the quote it is READ at is not", () => {
    expect(src).toMatch(
      /const rowQuote = useCallback\(\s*\(r: \{ gkey\?: string \| null; lkey\?: string \| null; sub\?: string \| null \}\): MlbLiveQuote \| null => \{\s*const q = rowLive\(r\);\s*if \(!q\) return null;\s*return legSideOf\(r\.sub\) === "U" && rowSettled\(r\) \? null : q;\s*\},\s*\[rowLive, rowSettled\],/,
    );
    expect(src).toMatch(
      /const pickQuote = useCallback\(\s*\(p: ApiPick\): MlbLiveQuote \| null => \{\s*const q = pickLive\(p\);\s*if \(!q\) return null;\s*return legSideOf\(p\.side\) === "U" && pickSettled\(p\) \? null : q;\s*\},\s*\[pickLive, pickSettled\],/,
    );
    // the raw read is asked in exactly two places — the two settled reads and the two gates
    const body = src.slice(src.indexOf("const rowLive = useCallback"));
    expect((body.match(/[^k]rowLive\(r\)/g) ?? []).length, "rowLive is for the READ; every render asks rowQuote").toBe(2);
    expect((body.match(/[^k]pickLive\(p\)/g) ?? []).length).toBe(2);
  });

  /* THE BINDING PLACEMENT RULE. The pin above slices SettledGrade → OutTag and forbids a price in
     that range; a live cell dropped into the gap would be swept in and red-line a guard that is
     doing its job. The rule is asserted, not just written down. */
  it("every live component is defined BELOW OutTag, outside the SETTLED slice", () => {
    const out = src.indexOf("function OutTag");
    expect(out).toBeGreaterThan(0);
    for (const fn of ["function LiveGrade", "function LivePriceLine", "function LiveProb", "function LiveEv", "function LiveTag"]) {
      expect(src.indexOf(fn), `${fn} must be defined below OutTag`).toBeGreaterThan(out);
    }
  });

  it("the header counts games that are LIVE, not games whose clock has passed", () => {
    expect(src).toMatch(/const pregameLive = useMemo\(/);
    // a finished game is not "under way": the count reads useLiveNow, which knows live vs final
    expect(src).toMatch(/liveNow\.games\[g\.pk\]\?\.live/);
    expect(src).not.toMatch(/return Number\.isFinite\(st\) && st <= now && board\.at <= st;/);
    expect(src).toMatch(/under way — priced pregame/);
  });

  /* KEPT AND EXTENDED, NOT REPLACED (INSTRUCTION 51). Josh authorised the in-play spend, so the
     board now reads a live price — but it still may not reach the paid feed itself. This regex
     forbids exactly that, and `/api/mlb/live-props` matches none of its tokens, so it goes on
     saying the true thing about a page that does more than it used to. */
  it("the board never reaches the Odds API directly — the live pull is budgeted and server-side", () => {
    const q = src.slice(src.indexOf("const picksQuery"), src.indexOf("const cohorts ="));
    expect(q).not.toMatch(/odds-api|the-odds-api|\/api\/generate|\/api\/refill/);
  });

  /* ...and the positive half: there IS exactly one live-price read on the page, it is the hook,
     and the hook's route is the budgeted server one. NOTE ON SHAPE: the URL literal lives in
     src/lib/mlb/live-client.ts, not in the page — the page holds the call site. Asserting both
     halves proves the whole path rather than one string's presence. */
  it("the ONE live-price read on the page is the budgeted server route", () => {
    const q = src.slice(src.indexOf("const picksQuery"), src.indexOf("const cohorts ="));
    expect(q).toMatch(/const liveQuotes = useMlbLiveQuotes\(board\?\.date \?\? null\);/);
    const client = stripComments(read("src/lib/mlb/live-client.ts"));
    expect(client).toContain('MLB_LIVE_ROUTE = "/api/mlb/live-props"');
    expect(client).toMatch(/fetch\(`\$\{MLB_LIVE_ROUTE\}/);
    // the client module reaches no other host and no other route
    expect(client).not.toMatch(/odds-api|the-odds-api|statsapi|\/api\/generate|\/api\/refill/);
    // NO POLLING on a paid feed — the standing rule (src/lib/cfb/client.ts:101)
    expect(client).toMatch(/refetchInterval: false/);
    expect(client).not.toMatch(/refetchInterval: [1-9]|setInterval/);
    // and the page itself still fetches exactly one thing directly: the free /api/picks read
    // (\b keeps the board's own refetch() out of the count — it is a query invalidation, not a URL)
    /* STILL EXACTLY ONE, AFTER INSTRUCTION 52 (2026-09-12). The board-only re-price
       (/api/generate?live=1) is a PRICED call, and it was briefly written here as a second
       page-level fetch. It moved into src/lib/mlb/live-board-client.ts instead of this number
       moving: one free read on the page, every spend behind a named client. */
    expect(src.match(/\bfetch\(/g)?.length ?? 0).toBe(1);
    expect(src).toMatch(/fetch\("\/api\/picks", \{ cache: "no-store" \}\)/);
    /* and the module that now owns the spend reaches the budgeted server route and nothing else */
    const live = stripComments(read("src/lib/mlb/live-board-client.ts"));
    expect(live.match(/\bfetch\(/g)?.length ?? 0).toBe(1);
    expect(live).toMatch(/fetch\("\/api\/generate\?live=1"/);
    expect(live).not.toMatch(/odds-api|the-odds-api|statsapi|\/api\/refill/);
    expect(live).not.toMatch(/setInterval|refetchInterval/);
  });

  it("PLANT: a refetchInterval smuggled onto the paid live feed is detected", () => {
    const client = stripComments(read("src/lib/mlb/live-client.ts"));
    const planted = client.replace("refetchInterval: false", "refetchInterval: 30_000");
    expect(planted, "the checker cannot see a poll added to a paid feed").toMatch(/refetchInterval: [1-9]/);
  });
});

/* THE SHARP TAB IS THE TAB JOSH SITS ON. Item 1 is literally "works if I refresh on 'The Sharp'
   tab", so a settled leg that keeps its EV badge, its @CZ price and its EDGE tag over there is the
   same lie as on the Board — on the surface he reads most. These are source pins: /sharp renders
   from the live store and there is no DOM here to drive it. */
describe("INSTRUCTION 50 item 2 — the Sharp tab suppresses the same numbers", () => {
  const SHARP = stripComments(read("app/sharp/page.tsx"));

  it("the page reads the same single comparison, not a second copy of the rule", () => {
    // legSideOf joined the import in the fix pass — the Under gate, read off the same authority
    expect(SHARP).toMatch(/import \{ legSideOf, settledRead, type LegSettledRead \} from "@\/lib\/leg-settled";/);
    expect(SHARP).toMatch(/if \(!q \|\| legSideOf\(r\.sub\) === "U"\) return settledRead\(r\.lkey, r\.sub, playNow\(r\)\?\.val\);/);
    // no re-implementation of the monotone comparison on this page
    expect(SHARP).not.toMatch(/val > line|cur > ln/);
  });

  it("the guard is per-play and hoisted, so one read drives every cell in the row", () => {
    expect(SHARP).toMatch(/const playSettled = useCallback\(/);
    expect(SHARP).toMatch(/s: playSettled\(r\)/);
  });

  it("a settled play loses the EV badge, the price and the EDGE tag together", () => {
    const loop = SHARP.slice(SHARP.indexOf("shownPlays.map"));
    expect(loop).toMatch(/settled \?/);
    expect(loop).toContain("SETTLED");
    // the glow is an instruction to bet — it may not survive the settlement either
    expect(loop).toMatch(/i === 0 && !settled/);
  });

  it("settled plays sink, they do not vanish — Josh can still see what happened", () => {
    expect(SHARP).toMatch(/\.sort\(\(a, b\) => Number\(!!a\.s\) - Number\(!!b\.s\) \|\| a\.i - b\.i\)/);
    expect(SHARP).not.toMatch(/plays\.filter\(\(r\) => !playSettled/);
  });

  it("PLANT: dropping the suppression from the render loop is detected", () => {
    const loop = SHARP.slice(SHARP.indexOf("shownPlays.map"));
    const flat = loop.split("SETTLED").join("");
    expect(flat, "the checker cannot see the SETTLED tag disappear").not.toContain("SETTLED");
  });
});
