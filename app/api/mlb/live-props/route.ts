import { NextRequest, NextResponse } from "next/server";
import { cronHeaderAuthed, syncAuthed } from "@/lib/server/store";
import { mlbLivePropsGet } from "@/lib/server/mlb-live-quote";

/**
 * THE MLB LIVE IN-PLAY ODDS PULL (INSTRUCTION 51, 2026-09-11).
 * Josh's order, verbatim: "Authorize the live in-play odds pull for MLB".
 *
 *   GET /api/mlb/live-props?date=YYYY-MM-DD[&manual=1]
 *       header x-cron-key: <CRON_SECRET>   (scheduler; Vercel's `Authorization: Bearer` also works)
 *       or     x-pl-sync:  <phrase>        (Josh's own Refresh pill, the /api/refill contract)
 *   -> MlbLiveQuoteBoard
 *
 * A thin shell, exactly as `app/api/cfb/props/route.ts` is: the body, its credit rails, the free
 * divergence gate and the ladder all live in `src/lib/server/mlb-live-quote.ts`. This file owns two
 * things only — the route config, and the LITERAL store prefixes, so the store-separation scans can
 * read this desk's keys off the route that spends on them and no other desk's prefix can appear
 * here.
 *
 * THIS ROUTE SPENDS ODDS CREDITS, so it is AUTHENTICATED, never public. `cronHeaderAuthed` covers
 * the scheduler and `syncAuthed` covers Josh's own pill — the same pair `/api/refill` uses
 * (`app/api/refill/route.ts:38`). Anything else is 401 before a single byte is fetched.
 *
 * IT IS STILL A GET, unlike `/api/refill`'s POST, because the phone POLLS it: a browser and a
 * scheduler both read a board here, and the rails inside the body (no store, nothing in play, the
 * 429 cooldown, the 600-credit day, `probeEvents`, `liveRevalidateSec`) are what decide whether a
 * given call costs anything at all. The overwhelming majority of calls cost ZERO.
 *
 * `maxDuration = 60`: up to `liveMaxEvents` (12) per-event calls run four at a time, so the worst
 * case is three sequential rounds of upstream latency plus the free statsapi reads. 60s is headroom,
 * not an expectation.
 *
 * NOT WIRED TO A CRON BY THIS BUILD. `MLB_LIVE_PROPS.liveSlotsPT` ships EMPTY and `vercel.json` is
 * untouched, so nothing calls this on a timer until someone deliberately opts in. Until the
 * 3-event credit probe in `docs/credit-budget.md` is actually run against a live game, the real
 * per-event cost is UNMEASURED and `measuredCreditsPerEvent` is an assumption — see the report for
 * WI-5. Do not schedule this route before that number is real.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** THIS DESK'S KEYS, written out here and nowhere else. Mirrors `MLB_LIVE_REDIS`. */
const STORE_KEYS = {
  board: "pl:mlb:liveprops:v1:",
  spend: "pl:mlb:liveprops:spend:v1:",
  cooldown: "pl:mlb:liveprops:429:",
} as const;

export async function GET(req: NextRequest) {
  if (!cronHeaderAuthed(req) && !syncAuthed(req)) {
    return NextResponse.json({ error: "not authorized" }, { status: 401 });
  }
  return mlbLivePropsGet(req, { storeKeys: STORE_KEYS });
}
