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

export async function GET(req: NextRequest) {
  return footballPropsGet(CFB_LEAGUE, req, { storeKeys: CFB_PROPS_REDIS });
}
