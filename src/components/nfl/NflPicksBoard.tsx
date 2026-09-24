"use client";

import { LeagueProvider } from "@/components/football/LeagueContext";
import { CfbBoardStamp, CfbPicksBoard, CfbRefreshPill } from "@/components/cfb/CfbPicksBoard";
import { NFL_DESK } from "@/lib/nfl/desk";

/**
 * THE NFL PICKS BOARD (2026-09-08, Josh: "NFL needs to be built NOW"): the shared football picks
 * surface (CfbPicksBoard — the College Football Board, which reads every league handle through
 * LeagueContext) mounted on the NFL desk: the NFL slate and props feeds (["nfl","slate"] /
 * ["nfl","props"]), NFL_PARLAYS (25 per category), the blue accent, "No NFL games" copy.
 * Nothing here is a second copy of the surface; app/board/page.tsx mounts this on the NFL desk.
 */
export function NflPicksBoard({parlaysOnly=false}:{parlaysOnly?:boolean}={}) {
  return (
    <LeagueProvider desk={NFL_DESK}>
      <CfbPicksBoard parlaysOnly={parlaysOnly}/>
    </LeagueProvider>
  );
}

/** the header's "Refresh Board" pill on the NFL desk — invalidates the NFL slate + props prefixes */
/** the header's "updated h:mm" on the NFL desk handles (2026-09-19) */
export function NflBoardStamp(props: { phone?: boolean }) {
  return (
    <LeagueProvider desk={NFL_DESK}>
      <CfbBoardStamp {...props} />
    </LeagueProvider>
  );
}

export function NflRefreshPill() {
  return (
    <LeagueProvider desk={NFL_DESK}>
      <CfbRefreshPill />
    </LeagueProvider>
  );
}
