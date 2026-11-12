import { NextRequest, NextResponse } from "next/server";
import { ptToday } from "@/lib/server/pt-date";
import { ncaabSlate } from "@/lib/server/ncaab-slate";

/**
 * THE COLLEGE BASKETBALL SLATE (2026-11-12, Josh: "Add NCAAB to the site").
 *
 *   GET /api/ncaab?date=YYYY-MM-DD  →  NcaabSlate (src/lib/ncaab/slate.ts)
 *
 * The date's Division I games from ESPN with the two books' full-game lines: moneyline, spread
 * and total at each book, their shared no-vig number, and the better price. No player props, no
 * in-play prices, no model of its own (src/lib/ncaab/rules.ts says why).
 *
 * Open like the football slate routes, and bounded the same way: the one paid call behind it is
 * cached for four minutes and shared by every date and visitor, and is skipped when the date has
 * no game left to tip (src/lib/server/ncaab-slate.ts). Nothing is written to the store.
 *
 * Date basis: `ptToday()` — the one Pacific helper.
 */
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || ptToday();
  if (!DATE_RE.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`))) return NextResponse.json({ error: "bad date" }, { status: 400 });
  try {
    const slate = await ncaabSlate(date, Date.now());
    const res = NextResponse.json(slate, { headers: { "cache-control": "no-store" } });
    if (slate.quota?.remaining != null) res.headers.set("x-requests-remaining", String(slate.quota.remaining));
    if (slate.quota?.used != null) res.headers.set("x-requests-used", String(slate.quota.used));
    return res;
  } catch (e) {
    return NextResponse.json({ error: `schedule unavailable: ${(e as Error).message}`.slice(0, 200) }, { status: 502 });
  }
}
