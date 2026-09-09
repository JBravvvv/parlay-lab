import { NextRequest } from "next/server";
import { NFL_LEAGUE } from "@/lib/nfl/rules";
import { footballPropsGet } from "@/lib/server/football-props";

/**
 * THE NFL PLAYER-PROPS FEED (2026-09-08, Josh: "NFL needs to be built NOW") — a thin shell over
 * the shared football body (src/lib/server/football-props.ts) run on NFL_LEAGUE: the same three
 * quota rails, per-game windows and Caesars-missing rule as the CFB desk, on the NFL's own knobs
 * (NFL_PROPS: 16 / 16 events, a 1000-credit daily budget, the 31-credit CFB measurement that is
 * UNMEASURED on the NFL) and the NFL's own odds event base (`americanfootball_nfl`, six markets).
 *
 *   GET /api/nfl/props?date=YYYY-MM-DD&bankroll=N   → CfbPropsBoard (the shared board shape)
 *
 * The store keys are LITERALS here on purpose — type-checked against NFL_PROPS_REDIS so they can
 * never drift, and pinned by tests/nfl-props-route.test.ts / tests/nfl-separation.test.ts.
 */

export const dynamic = "force-dynamic";

/* pinned literals, type-checked against the shared contract */
const STORE_KEYS: { board: typeof NFL_LEAGUE.redis.propsBoard; spend: typeof NFL_LEAGUE.redis.propsSpend } = {
  board: "pl:nfl:props:v1:",
  spend: "pl:nfl:props:spend:v1:",
};

export async function GET(req: NextRequest) {
  return footballPropsGet(NFL_LEAGUE, req, { storeKeys: STORE_KEYS });
}
