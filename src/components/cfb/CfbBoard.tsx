"use client";

import { CfbPicksBoard } from "./CfbPicksBoard";

/**
 * THE CFB BOARD (INSTRUCTION 38, 2026-09-05) — since 2026-09-05 the Board is the picks +
 * parlays surface (`CfbPicksBoard`; Josh: "The games list doesn't need to be on the 'Board'
 * when it's already on the 'Games' tab"). The games list lives on Games (`CfbGames`).
 *
 * The desk hooks that used to live here moved to `src/lib/cfb/useCfbDesk.ts` and are
 * re-exported below so CfbGames, CfbSharp, CfbBuilder and the Stats page keep their imports.
 */
export { fpiStamp, gameMatches, rankRows, useCfbBankroll, useCfbDesk, type BoardRow } from "@/lib/cfb/useCfbDesk";

/** kept as an alias of the picks board for any caller still mounting `<CfbBoard />` */
export function CfbBoard() {
  return <CfbPicksBoard />;
}
