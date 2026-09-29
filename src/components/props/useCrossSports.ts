"use client";
import { useReadQueryClient } from "@/lib/use-read-query-client";
import { useQuery } from "@tanstack/react-query";
import { useLiveNow } from "@/lib/liveNow";
import { useHeadshots } from "@/lib/mlb-visuals";
import { useMemo } from "react";
import { useSportsbook } from "@/lib/sportsbook/store";
import { crossSportLegs, type CrossData, type CrossLeg } from "@/lib/cross-sport";
import type { GenLeg } from "@/lib/parlay-gen";
import { useMlbPositions } from "@/lib/mlb/useMlbPositions";
import { mlbLabelPosition } from "@/lib/mlb/positions";
import { shownFootballPosition, useRosterPositions } from "@/lib/football/useRosterPositions";

const NO_GAMES: never[] = [];
/* a football leg the stored board could not place (ESPN's stat tables had not listed him) — the roster lookup's row */
const unplaced = (legs: readonly GenLeg<CrossLeg>[], sport: "nfl" | "cfb") =>
  legs.filter((l) => l.sport === sport && l.leg.player && !l.position).map((l) => ({ gameId: l.leg.gameId, player: l.leg.player!, pos: l.leg.position ?? null, headshot: l.leg.headshot ?? null, teamId: teamIdOf(l) }));
/* the leg's own team — `imageTeam` is set only when the row's teamId is one of the game's two sides */
const teamIdOf = (l: GenLeg<CrossLeg>) => l.leg.imageTeam?.id ?? null;
export function useCrossSports(date:string,sports:readonly string[]){
 const client=useReadQueryClient();
 const key=[...sports].sort().join(",");const book=useSportsbook();
 const q=useQuery<{data:CrossData}>({queryKey:["discovery",date,key],queryFn:async()=>{const r=await fetch(`/api/discovery?date=${encodeURIComponent(date)}&sports=${key}`);if(!r.ok)throw new Error("Stored boards unavailable");return r.json();},enabled:!!date&&!!key,staleTime:30_000,refetchInterval:60_000},client);
 const reqs=useMemo(()=>Object.values(q.data?.data.mlb?.data.gameInfo??{}).map(g=>({pk:g.pk,date:g.start})),[q.data]);
 const live=useLiveNow(reqs);
 const raw=useMemo(()=>crossSportLegs(q.data?.data??{},book,Date.now(),live),[q.data,q.dataUpdatedAt,book,live]);
 const names=useMemo(()=>raw.filter(l=>l.sport==="mlb"&&l.leg.player).map(l=>l.leg.player!),[raw]);
 const heads=useHeadshots(names);
 /* every other sport's pick carries its position (2026-09-28): MLB's index by the printed "Name (TEAM)"; football's
    stored ESPN position, else that league's roster for the game (the same shared keyless fetch its own desk reads).
    DISPLAY ONLY: this writes `leg.position` (what the tag shows) and never the GenLeg's own `position` — the one the
    generator's position filter reads — so an index or roster answer landing late can never change a draw */
 const mlbPositions=useMlbPositions(sports.includes("mlb"));
 const nflRows=useMemo(()=>unplaced(raw,"nfl"),[raw]);const cfbRows=useMemo(()=>unplaced(raw,"cfb"),[raw]);
 const nfl=useRosterPositions("nfl",nflRows,q.data?.data.nfl?.slate?.games??NO_GAMES,nflRows.length>0);
 const cfb=useRosterPositions("cfb",cfbRows,q.data?.data.cfb?.slate?.games??NO_GAMES,cfbRows.length>0);
 const legs=useMemo(()=>raw.map(l=>{
  if(l.sport==="mlb"){const position=l.leg.position??mlbLabelPosition(mlbPositions,l.label,l.market);return {...l,leg:{...l.leg,...(l.leg.player?{headshot:heads[l.leg.player]??null}:{}),position}};}
  if((l.sport==="nfl"||l.sport==="cfb")&&l.leg.player&&!l.position){const r=(l.sport==="nfl"?nfl:cfb).positionOf({gameId:l.leg.gameId,player:l.leg.player,pos:l.leg.position??null,teamId:teamIdOf(l)});return r?{...l,leg:{...l.leg,position:shownFootballPosition(r,l.leg.position)}}:l;}
  return l;
 }),[raw,heads,mlbPositions,nfl.positionOf,cfb.positionOf]);
 return {...q,legs};
}
