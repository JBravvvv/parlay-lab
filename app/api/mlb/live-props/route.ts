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
 * NOW ON A TIMER — CORRECTED 2026-09-12. This paragraph used to read "NOT WIRED TO A CRON BY THIS
 * BUILD ... `liveSlotsPT` ships EMPTY ... Do not schedule this route before that number is real",
 * and all three clauses stopped being true in the same change: `MLB_LIVE_PROPS.tickMode` is "ticker"
 * and `liveSlotsPT` carries six Pacific times (15:00, 16:45, 17:15, 17:45, 18:15, 18:45), which the
 * existing scheduler row fires — no new cron row, `vercel.json` still untouched. Leaving the old
 * sentence standing would have told the next reader this route costs nothing unattended, which is the
 * one thing a docblock over a spending route must never say.
 *
 * THE PROBE IS STILL UNRUN, and that is the honest caveat: the 3-event credit probe in
 * `docs/credit-budget.md` has not been fired at a live game, so `measuredCreditsPerEvent` (6) is an
 * assumption and the real rate could be CFB's 31. The six times are sized for that worst case —
 * 6 x (1 + 3 x 31) = 564 against the 600 rail — and `probeEvents` keeps every pass at three events
 * until the flag flips. See `src/lib/mlb/live-props-rules.ts` for the whole arithmetic, including the
 * one case that can still overshoot (Josh's own tap on top of a worst-case day).
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
