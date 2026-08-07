import { NextRequest, NextResponse } from "next/server";
import { BOARD_KEY, decodeBoard } from "@/lib/server/board-store";
import { redis, redisGetJson, storeEnv } from "@/lib/server/store";
import { PROGRESS_KEY, PROP_MARKETS, TOP_N, type Progress } from "@/lib/server/grading-progress";
import { tabPure } from "@/lib/tab-purity";
import { lineOf } from "@/lib/pred-serialize";
import { prevPtDates, ptToday } from "@/lib/server/pt-date";

/**
 * /api/picks — THE PICKS PRODUCT (2026-08-07, operator requirement: Parlay Lab ships
 * picks — a visible daily top-50 overs list per prop market, each cohort graded with a
 * running record. Not for the card; for the learning surface and for Josh to follow.)
 *
 * PUBLIC, deliberately, on /api/board's own reasoning: model output over public market
 * data — no stakes, no ledger, nothing personal. Costs zero Odds credits (reads what the
 * generation already paid for).
 *
 * SEPARATION, STATED AND ENFORCED (guard: tests/picks-cohort.test.ts source scan):
 * this route READS the stored board and the grading-progress artifact and WRITES NOTHING.
 * It never imports the allocator (shAllocate/shCardPool — lock-card.ts is the card path),
 * never touches the engine, and the fits keep reading the FULL graded population
 * (calibrate's graded/gradedAll channels) — the cohort record rides pl:grade:progress
 * only, which the grade-only mode writes without touching pl:cal:summary/weights.
 *
 * The picks are the board's own per-market category arrays — the ENGINE'S ranking, the
 * same rows the Board tabs render — filtered through tabPure (an impure row is excluded
 * here exactly as splitPure excludes it on the page) and capped at TOP_N. Markets thinner
 * than TOP_N ship whole; the real per-market N is in `ns`.
 */

export const dynamic = "force-dynamic";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Row = {
  label?: string;
  sub?: string;
  lkey?: string | null;
  gkey?: string | null;
  prob?: number | null;
  implied?: number | null;
  edge?: number | null;
  cz?: number | null;
  odds?: string | number | null;
  book?: string | null;
  susp?: boolean;
  live?: boolean;
};

export async function GET(req: NextRequest) {
  if (!storeEnv()) return NextResponse.json({ picks: null, reason: "store-not-configured" });
  const date = req.nextUrl.searchParams.get("date") ?? ptToday();
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });

  /* the record survives a board failure — a reason-record day, an expired TTL, or a
     malformed blob must still serve the cumulative cohort record (review finding, low #3) */
  let record: Progress["cohorts"] | null = null;
  try {
    record = (await redisGetJson<Progress>(PROGRESS_KEY))?.cohorts ?? null;
  } catch {
    record = null;
  }

  try {
    /* THE MORNING DARK WINDOW (2026-08-07, third operator report, §12Z.13): today has no
       board until the day's first fire (~afternoon PT), so a today-only read is empty
       every morning — which is exactly what the operator kept seeing. When the requested
       date has no board, fall back to the newest stored one inside the 3-day TTL and SAY
       SO (servedDate + staleNote) — an honestly-labeled yesterday beats a silent empty.
       An explicit ?date= request never falls back: asking for a specific day means that
       day. */
    const explicit = req.nextUrl.searchParams.get("date") != null;
    const tryDates = explicit ? [date] : prevPtDates(date, 3);
    let board: ReturnType<typeof decodeBoard> = null;
    let servedDate = date;
    for (const d of tryDates) {
      const blob = (await redis(["GET", BOARD_KEY(d)])) as string | null;
      board = decodeBoard(blob);
      if (board) {
        servedDate = d;
        break;
      }
    }
    const dataObj = ((board as { data?: Record<string, unknown> } | null)?.data ?? null) as Record<string, unknown> | null;

    if (!board || !dataObj) {
      return NextResponse.json({
        date,
        servedDate: null,
        picks: null,
        reason: board ? "board-blob-without-data" : "no-board-inside-ttl (no stored board for this date or the two before it; the record below is cumulative)",
        record,
      });
    }
    const staleNote =
      servedDate === date
        ? null
        : `showing ${servedDate}'s board — ${date} has no board yet (today's fires when enough lineups post)`;

    const cats = (dataObj.categories ?? {}) as Record<string, Row[]>;
    const picks: Record<string, unknown[]> = {};
    const ns: Record<string, number> = {};
    for (const m of PROP_MARKETS) {
      /* THE SAME POPULATION THE STORED mrank RANKS (review finding, medium #2):
         tabPure + skip live rows + skip prob-less rows — mirroring boardToPredictions'
         own skips, so the rank shown here equals the mrank the cohort grades for this
         generation. (Cross-generation drift is stated, not hidden: the graded cohort
         spans the day's merged statements; this list is the stored LATEST pass.) */
      const rows = (cats[m] ?? []).filter((r) => tabPure(m, r.lkey ?? null) && !r.live && r.prob != null);
      ns[m] = rows.length;
      picks[m] = rows.slice(0, TOP_N).map((r, i) => ({
        rank: i + 1,
        player: r.label ?? null,
        side: r.sub ?? null,
        line: lineOf(r.lkey ?? null),
        prob: r.prob ?? null,
        implied: r.implied ?? null,
        edge: r.edge ?? null,
        cz: r.cz ?? null,
        odds: r.odds ?? null,
        book: r.book ?? null,
        ...(r.susp ? { susp: true, note: "suspended market — shadow cohort, never on a ticket" } : {}),
      }));
    }

    return NextResponse.json({
      date,
      servedDate,
      ...(staleNote ? { staleNote } : {}),
      at: board.at ?? null,
      gen: dataObj.gen ?? null,
      topN: TOP_N,
      ns,
      picks,
      record,
      note:
        "informational picks, not investment advice; the card path (locked tickets) is separate and unchanged. " +
        "The graded cohort record spans the day's merged statements; this list is the latest stored pass.",
    });
  } catch (e) {
    return NextResponse.json({ picks: null, reason: `picks-read-failed: ${(e as Error).message}`, record });
  }
}
