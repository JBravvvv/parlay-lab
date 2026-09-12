import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stripComments } from "./helpers/source";

/**
 * FIX 3 (2026-09-12) — THE BOARD-ONLY PASS: a server re-price that can build a LIVE pool in play
 * and cannot, by construction, touch the locked card.
 *
 * What was broken. The only way to get an in-play board was /api/generate, and every path through
 * it goes on to the money: `getLockEntry` -> `partitionBlocks` -> `effectiveBlockBudget` ->
 * `buildLockEntry` -> `writeLock` plus the BLOCKS_KEY registry. In the evening those refuse — owed
 * below zero, every game started — so Josh's Refresh fell through to a BROWSER re-price, which
 * builds a board in one tab and never stores it. The stored board, and with it `categoriesLive`,
 * stayed frozen at its pre-kick state.
 *
 * `?live=1` is the same pass with the card half switched off: it skips the conditional-skip branch
 * exactly as `topup=1` does, writes the board blob, and NEVER enters src/lib/server/blocks.ts — no
 * claim, no allocation, no append, no `buildLockEntry`, no `writeLock`. INSTRUCTION 48's append-only
 * card cannot be broken by a pass that never appends.
 *
 * THE PROOF IS STRUCTURAL, not a list of guards: every symbol that can move the day's money lives
 * inside one of three regions, and `boardOnly` cannot enter any of them. That is what the last
 * describe block measures — line range by line range, off the real route source.
 *
 * This file reads source only. It starts no server, calls no route, spends nothing.
 */

const SRC = stripComments(fs.readFileSync(path.join(process.cwd(), "app/api/generate/route.ts"), "utf8"));
const LINES = SRC.split("\n");

/** first line index (1-based) matching a pattern; fails loudly rather than silently passing */
function lineOf(re: RegExp): number {
  const i = LINES.findIndex((l) => re.test(l));
  expect(i, `no line matched ${re}`).toBeGreaterThan(-1);
  return i + 1;
}
/** every line index (1-based) whose code mentions `needle`, imports excluded */
function linesWith(needle: string): number[] {
  const out: number[] = [];
  LINES.forEach((l, i) => {
    if (l.includes(needle) && !/^\s*import /.test(l)) out.push(i + 1);
  });
  return out;
}

describe("FIX 3 — the mode exists, and only Josh's own tap can ask for it", () => {
  it("is ?live=1, and is never a block fire or a top-up", () => {
    expect(SRC).toMatch(
      /const boardOnly = !blockKey && !topup && req\.nextUrl\.searchParams\.get\("live"\) === "1";/,
    );
  });

  it("skips the conditional-skip branch exactly as topup does", () => {
    expect(SRC).toMatch(/\} else if \(!force && !boardOnly\) \{/);
  });

  it("KEEPS THE 45-MINUTE LIMITER — boardOnly is NOT in the bypass list", () => {
    expect(SRC).toMatch(/if \(!force && !topup && now - lastRun < 45 \* 60_000\) \{/);
    const bypass = LINES[lineOf(/if \(!force && !topup && now - lastRun < 45 \* 60_000\) \{/) - 1];
    expect(bypass).not.toContain("boardOnly");
  });

  it("answers with boardOnly: true so the phone can tell which pass it got", () => {
    expect(SRC).toMatch(/\.\.\.\(boardOnly \? \{ boardOnly: true \} : \{\}\)/);
  });

  it("says in plain English that no card was touched", () => {
    expect(SRC).toMatch(/board-only pass — the board and its live pool were re-priced; the locked card was not touched/);
    expect(SRC).toMatch(/board-only pass — no card was locked, so there is no card reading to write/);
  });

  it("is NOT scheduled: the scheduler never forwards live=1", () => {
    const sched = stripComments(fs.readFileSync(path.join(process.cwd(), "app/api/scheduler/route.ts"), "utf8"));
    expect(sched).not.toMatch(/live=1/);
    expect(sched).not.toMatch(/boardOnly/);
  });

  it("is wired to the Board's Refresh pill, with the sync phrase, and nowhere else", () => {
    /* INSTRUCTION 52 (2026-09-12): the paid call moved off app/board/page.tsx into its own client
       module and the page now calls the hook. NOT a loosened guard — the reason it moved is the
       STRICTER one in tests/board-settled.test.ts, which requires the page to write exactly one
       `fetch(` (the free /api/picks read) so a priced read cannot be added to a page's JSX without
       going through a named, reviewable client. Both ends are still pinned: the fetch literal and
       its single call site here, and the page's hook call below. */
    const client = stripComments(fs.readFileSync(path.join(process.cwd(), "src/lib/mlb/live-board-client.ts"), "utf8"));
    expect(client).toMatch(/fetch\("\/api\/generate\?live=1", \{ headers: \{ "x-pl-sync": key \}, cache: "no-store" \}\)/);
    // only one call site, so there is no second, quieter way to spend this
    expect(client.match(/\/api\/generate\?live=1/g)?.length).toBe(1);
    /* and the page reaches it ONLY through that module — no second, page-local route to the spend */
    const board = stripComments(fs.readFileSync(path.join(process.cwd(), "app/board/page.tsx"), "utf8"));
    expect(board).not.toMatch(/\/api\/generate/);
    expect(board).toMatch(/const liveBoard = useLiveBoardReprice\(\{ onFallback: \(\) => regen\.mutate\(\) \}\);/);
    expect(board.match(/useLiveBoardReprice\(/g)?.length).toBe(1);
  });

  it("only fires in place of a refused refill, and only while a game is under way", () => {
    const board = stripComments(fs.readFileSync(path.join(process.cwd(), "app/board/page.tsx"), "utf8"));
    // the in-play branch comes first; the pregame line below it is the pre-2026-09-12 behaviour, kept
    expect(board).toMatch(/if \(pregameLive > 0 && \(refused \|\| httpFail\)\) \{\s*liveBoard\.mutate\(\);\s*return;\s*\}/);
    expect(board).toMatch(/if \(refused \|\| httpFail\) regen\.mutate\(\);/);
  });

  it("a tap inside the 45-minute limiter buys NOTHING — it does not route around our own pacing", () => {
    /* the refusal branch moved with the mutation (INSTRUCTION 52, 2026-09-12); the note Josh reads
       is still the page's, so this asserts on both halves rather than dropping either. */
    const client = stripComments(fs.readFileSync(path.join(process.cwd(), "src/lib/mlb/live-board-client.ts"), "utf8"));
    expect(client).toMatch(/if \(\/ran recently\/\.test\(e\.message\)\) return;/);
    const board = stripComments(fs.readFileSync(path.join(process.cwd(), "app/board/page.tsx"), "utf8"));
    expect(board).toMatch(/the server re-priced this board less than 45 minutes ago/);
  });

  it("a 200 carrying `skipped` is NOT reported as a re-price", () => {
    const client = stripComments(fs.readFileSync(path.join(process.cwd(), "src/lib/mlb/live-board-client.ts"), "utf8"));
    expect(client).toMatch(/if \(typeof body\.skipped === "string"\) throw new Error\(`the server skipped it: \$\{body\.skipped\}`\);/);
  });

  it("the tap invalidates the live overlay too, so new rows are not graded on the old quotes", () => {
    const client = stripComments(fs.readFileSync(path.join(process.cwd(), "src/lib/mlb/live-board-client.ts"), "utf8"));
    expect(client).toMatch(/invalidateQueries\(\{ queryKey: MLB_LIVE_QUERY_PREFIX \}\)/);
    /* all three, and only the three the refill mutation does */
    expect(client).toMatch(/invalidateQueries\(\{ queryKey: \["board"\] \}\)/);
    expect(client).toMatch(/invalidateQueries\(\{ queryKey: \["picks"\] \}\)/);
  });
});

describe("FIX 3 — it writes a board", () => {
  it("the board blob write is in the route and happens BEFORE the card region", () => {
    const write = lineOf(/await redis\(\["SET", BOARD_KEY\(date\), enc\.blob, "EX", TTL\]\)/);
    const cardGuard = lineOf(/^\s*if \(boardOnly\) \{$/);
    expect(write).toBeLessThan(cardGuard);
  });

  it("still stores the per-generation blob and the gen index, so the LIVE pool is readable", () => {
    expect(SRC).toMatch(/await redis\(\["SET", BOARD_GEN_KEY\(date, now\), enc\.blob, "EX", TTL\]\)/);
    expect(SRC).toMatch(/await redisSetJson\(BOARD_GENS_KEY\(date\), idx\)/);
  });
});

describe("FIX 3 — NO CODE PATH FROM ?live=1 TO THE STAKE OR ALLOC PATH", () => {
  /* THE THREE REGIONS boardOnly CANNOT ENTER.
       1. the ?block / ?topup branches — `boardOnly` is false whenever blockKey or topup is set;
       2. the card region, `if (boardOnly) { ... } else try { ... }`;
       3. the reading region, same shape.
     Region 1 runs from `if (blockKey) {` to the `} else if (!force && !boardOnly) {` that follows
     it; region 2 from the `if (boardOnly) {` card guard to the `let reading:` declaration after it;
     region 3 from the reading guard to the end of its catch. */
  const branchStart = lineOf(/^\s*if \(blockKey\) \{$/);
  const branchEnd = lineOf(/\} else if \(!force && !boardOnly\) \{/);
  const cardGuard = lineOf(/^\s*if \(boardOnly\) \{$/);
  const readingDecl = lineOf(/^\s*let reading: Record<string, unknown> \| null = null;$/);

  it("the regions are in the order the proof assumes", () => {
    expect(branchStart).toBeLessThan(branchEnd);
    expect(branchEnd).toBeLessThan(cardGuard);
    expect(cardGuard).toBeLessThan(readingDecl);
  });

  const inside = (l: number) => (l > branchStart && l < branchEnd) || (l > cardGuard && l < readingDecl);

  for (const sym of [
    "getLockEntry(",
    "partitionBlocks(",
    "dayConsumed(",
    "effectiveBlockBudget(",
    "buildLockEntry({",
    "writeLock(",
    "BLOCKS_KEY(",
  ]) {
    it(`every use of ${sym} is inside a region boardOnly cannot enter`, () => {
      const hits = linesWith(sym).filter((l) => l !== lineOf(/let lockedEntry: ReturnType<typeof buildLockEntry>/));
      expect(hits.length, `${sym} not found at all — the proof would be vacuous`).toBeGreaterThan(0);
      for (const l of hits) expect(inside(l), `${sym} at line ${l} is reachable from ?live=1`).toBe(true);
    });
  }

  it("the route never imports the append-only asserter, so INSTRUCTION 48 cannot be touched here", () => {
    expect(SRC).not.toMatch(/from "@\/lib\/append-only"/);
  });

  it("blocks.ts keeps its own refusals — this fix relaxes none of them", () => {
    const blocks = stripComments(fs.readFileSync(path.join(process.cwd(), "src/lib/server/blocks.ts"), "utf8"));
    expect(blocks).toMatch(/owed/); // the owed-below-zero arithmetic is still there
    expect(blocks).not.toMatch(/boardOnly/); // and knows nothing about this mode
  });
});
