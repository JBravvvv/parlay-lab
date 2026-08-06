import { NextRequest, NextResponse } from "next/server";
import { BOARD_GEN_KEY, BOARD_GENS_KEY, BOARD_KEY, bestGen, decodeBoard, type GenIndexEntry } from "@/lib/server/board-store";
import { getReading } from "@/lib/server/self-reading";
import { PROGRESS_KEY } from "@/lib/server/grading-progress";
import { redis, redisGetJson, storeEnv } from "@/lib/server/store";

/**
 * Serve the board the Vercel cron built, so the app can LOAD a day's board instead
 * of paying ~120 Odds credits to rebuild one it already owns.
 *
 * NOT sync-phrase gated, deliberately. This is model output over public market data
 * — no stakes, no ledger, no P/L, nothing personal. Gating it behind the sync phrase
 * would make that phrase a prerequisite for the app to show a board at all, which is
 * a far worse failure mode than a stranger reading a slate. (/api/calibration is open
 * on the same reasoning.) If it should ever be closed, APP_PASSCODE is the lever —
 * never the sync phrase.
 *
 * Costs zero Odds credits: it reads what the cron already paid for.
 */

export const dynamic = "force-dynamic";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  if (!storeEnv()) return NextResponse.json({ board: null, reason: "store-not-configured" });
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  /* `gen` selects WHICH generation of the date to return. Default is the LATEST — that
     is what a bet needs (freshest prices) and it is the pre-existing behaviour, so no
     client changes. `best` returns the pass that priced the most still-bettable games,
     which is what ANALYSIS needs: on a Sunday the latest pass reaches ~1 game while the
     17:00 pass covers 15. Those are different questions; conflating them is how a 15-game
     board would have been overwritten by a 1-game one. A numeric `gen` is an exact
     generation `at`. `list` returns the index alone, cheaply. */
  const genParam = req.nextUrl.searchParams.get("gen");
  try {
    const index = ((await redisGetJson<GenIndexEntry[]>(BOARD_GENS_KEY(date))) ?? []).filter(
      (g) => g && isFinite(g.at),
    );
    if (genParam === "list") return NextResponse.json({ date, gens: index });

    let key = BOARD_KEY(date);
    if (genParam === "best") {
      const b = bestGen(index);
      if (b) key = BOARD_GEN_KEY(date, b.at);
    } else if (genParam && /^\d+$/.test(genParam)) {
      const want = Number(genParam);
      if (!index.some((g) => g.at === want)) {
        return NextResponse.json({ board: null, reason: "no-such-generation", gens: index });
      }
      key = BOARD_GEN_KEY(date, want);
    }

    const blob = (await redis(["GET", key])) as string | null;
    const board = decodeBoard(blob);
    /* SELF-READING (2026-08-06): the card's own reading, written by the run that locked
       it (or by the scheduler's repair), served beside the board — one URL shows the card
       AND its reading. Present on the no-board path too: a reason-record day has a
       reading and no board. */
    const reading = await getReading(date);
    /* LEARNING PROGRESS (2026-08-06): the cumulative per-market graded state — n, hit
       rate vs implied, by-population split, days-to-150 — written by the daily grade-only
       passes. Same URL as the card: Josh watches the learning accumulate here. */
    const learning = await redisGetJson(PROGRESS_KEY);
    if (!board) return NextResponse.json({ board: null, reason: "no-board-for-date", gens: index, reading, learning });
    return NextResponse.json({ board, gens: index, reading, learning });
  } catch (e) {
    // never a hard failure: the client falls back to generating, exactly as before
    return NextResponse.json({ board: null, reason: `store-unreachable: ${(e as Error).message}` });
  }
}
