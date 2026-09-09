import { NextRequest, NextResponse } from "next/server";
import { ptToday } from "@/lib/server/pt-date";
import { NFL_BANK_BASE, NFL_LEAGUE } from "@/lib/nfl/rules";
import { espnEventsOf, finalsFromEspnOf, slateFromEspnOf } from "@/lib/cfb/slate-server";
import type { CfbSlate } from "@/lib/cfb/types";

/**
 * THE NFL SLATE FEED (2026-09-08, Josh: "NFL needs to be built NOW"). The NFL twin of the CFB
 * slate route: one public GET that assembles everything the NFL desk renders for one Pacific
 * date, through the SHARED football slate helper run on NFL_LEAGUE (ESPN's nfl scoreboard with
 * no `groups=80`, the nfl powerindex, the `americanfootball_nfl` game lines):
 *
 *   GET /api/nfl?date=YYYY-MM-DD&bankroll=N            → CfbSlate (board + finals + quota)
 *   GET /api/nfl?date=YYYY-MM-DD&mode=finals            → { date, finals }  (scores only, NO odds call)
 *
 * The upstream fetches (ESPN scoreboard 60s · ESPN FPI 6h · The Odds API 240s, all on the Next
 * data cache) and the slate assembly live in src/lib/cfb/slate-server.ts, shared with the props
 * feed so both price the same slate. A missing key or a failed odds call never 500s: the board is
 * scores-only with `oddsMissing: true`. This route has no fetch of its own and never sees the key.
 *
 * Date basis: `ptToday()` — the one Pacific helper.
 */

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const date = q.get("date") || ptToday();
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  const mode = q.get("mode") || "board";
  if (mode !== "board" && mode !== "finals") return NextResponse.json({ error: "bad mode" }, { status: 400 });
  const bankRaw = Number(q.get("bankroll"));
  const bankroll = Number.isFinite(bankRaw) && bankRaw > 0 ? bankRaw : NFL_BANK_BASE;
  const now = Date.now();

  let espn: unknown[];
  try {
    espn = await espnEventsOf(NFL_LEAGUE, date);
  } catch (e) {
    return NextResponse.json({ error: `espn unavailable: ${(e as Error).message}` }, { status: 502 });
  }

  if (mode === "finals") {
    try {
      return NextResponse.json(finalsFromEspnOf(NFL_LEAGUE, date, espn, now, bankroll), { headers: { "cache-control": "no-store" } });
    } catch (e) {
      return NextResponse.json({ error: `finals failed: ${(e as Error).message}` }, { status: 502 });
    }
  }

  let slate: CfbSlate;
  try {
    slate = await slateFromEspnOf(NFL_LEAGUE, date, espn, now, bankroll);
  } catch (e) {
    return NextResponse.json({ error: `board failed: ${(e as Error).message}` }, { status: 502 });
  }
  const res = NextResponse.json(slate, { headers: { "cache-control": "no-store" } });
  if (slate.quota.remaining != null) res.headers.set("x-requests-remaining", String(slate.quota.remaining));
  if (slate.quota.used != null) res.headers.set("x-requests-used", String(slate.quota.used));
  return res;
}
