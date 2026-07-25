import { NextRequest, NextResponse } from "next/server";
import { BOARD_KEY, decodeBoard } from "@/lib/server/board-store";
import { redis, storeEnv } from "@/lib/server/store";

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
  try {
    const blob = (await redis(["GET", BOARD_KEY(date)])) as string | null;
    const board = decodeBoard(blob);
    if (!board) return NextResponse.json({ board: null, reason: "no-board-for-date" });
    return NextResponse.json({ board });
  } catch (e) {
    // never a hard failure: the client falls back to generating, exactly as before
    return NextResponse.json({ board: null, reason: `store-unreachable: ${(e as Error).message}` });
  }
}
