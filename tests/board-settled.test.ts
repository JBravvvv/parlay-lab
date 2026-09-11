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

  /* ONE guard, hoisted to the row, so a later edit cannot restore the bug in a single cell */
  it("rowSettled is the single per-row guard, read straight off the live boxscore", () => {
    expect(src).toMatch(
      /const rowSettled = useCallback\(\s*\(r: \{ gkey\?: string \| null; lkey\?: string \| null; sub\?: string \| null \}\): LegSettledRead \| null =>\s*settledRead\(r\.lkey, r\.sub, legLive\(\{ gkey: r\.gkey, lkey: r\.lkey \}\)\?\.val\),/,
    );
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
    expect(src).toMatch(/const pickSettled = useCallback\(\s*\(p: ApiPick\) => settledRead\(p\.lkey, p\.side, legLive\(\{ gkey: p\.gkey, lkey: p\.lkey \}\)\?\.val\),/);
    const col = src.slice(src.indexOf("const pickColumns"), src.indexOf('key: "pick",', src.indexOf("const pickColumns")));
    expect(col).toMatch(/sortValue: \(p\) => \(pickSettled\(p\) \? gradeRank\(null\) :/);
    expect(col).toMatch(/<SettledGrade read=\{s0\} \/>/);
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

  it("the header counts games that are LIVE, not games whose clock has passed", () => {
    expect(src).toMatch(/const pregameLive = useMemo\(/);
    // a finished game is not "under way": the count reads useLiveNow, which knows live vs final
    expect(src).toMatch(/liveNow\.games\[g\.pk\]\?\.live/);
    expect(src).not.toMatch(/return Number\.isFinite\(st\) && st <= now && board\.at <= st;/);
    expect(src).toMatch(/under way — priced pregame/);
  });

  it("nothing here re-pulls a live price — that spend is not authorised", () => {
    const q = src.slice(src.indexOf("const picksQuery"), src.indexOf("const cohorts ="));
    expect(q).not.toMatch(/odds-api|the-odds-api|\/api\/generate|\/api\/refill/);
  });
});

/* THE SHARP TAB IS THE TAB JOSH SITS ON. Item 1 is literally "works if I refresh on 'The Sharp'
   tab", so a settled leg that keeps its EV badge, its @CZ price and its EDGE tag over there is the
   same lie as on the Board — on the surface he reads most. These are source pins: /sharp renders
   from the live store and there is no DOM here to drive it. */
describe("INSTRUCTION 50 item 2 — the Sharp tab suppresses the same numbers", () => {
  const SHARP = stripComments(read("app/sharp/page.tsx"));

  it("the page reads the same single comparison, not a second copy of the rule", () => {
    expect(SHARP).toMatch(/import \{ settledRead, type LegSettledRead \} from "@\/lib\/leg-settled";/);
    expect(SHARP).toMatch(/settledRead\(r\.lkey, r\.sub, playNow\(r\)\?\.val\)/);
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
