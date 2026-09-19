import { NextRequest } from "next/server";
import { CFB_PROPS_REDIS } from "@/lib/cfb/props-store";
import { CFB_LEAGUE } from "@/lib/cfb/rules";
import { footballPropsGet } from "@/lib/server/football-props";

/**
 * THE CFB PLAYER-PROPS FEED (INSTRUCTION 39, 2026-09-05) — a thin shell since 2026-09-08 (the
 * NFL build): the whole body, its three quota rails, the per-game windows and the Caesars-missing
 * rule live in src/lib/server/football-props.ts and run on CFB_LEAGUE. This file keeps the route
 * config and the CFB store keys (`CFB_PROPS_REDIS`: pl:cfb:props:v1: / pl:cfb:props:spend:v1:).
 *
 *   GET /api/cfb/props?date=YYYY-MM-DD&bankroll=N   → CfbPropsBoard
 */

export const dynamic = "force-dynamic";

/* JOSH (2026-09-19): "Prop bets are not loading for CFP games that start in 6 hours 15 minutes." A cold
   Saturday pull is up to `maxEvents` event calls at CONCURRENCY 4 through the Odds API — tens of
   seconds — and this route declared no duration, so it ran on the platform default. A function killed
   mid-pull answers the phone with nothing while the credits it already spent are gone. 300 s is the
   ceiling every other spending route here declares (/api/generate, /api/refill); the pull itself, its
   rails and its windows are unchanged. */
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  return footballPropsGet(CFB_LEAGUE, req, { storeKeys: CFB_PROPS_REDIS });
}
