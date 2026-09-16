"use client";
import {useMemo} from "react";
import {useQuery} from "@tanstack/react-query";
import type {PropBoardGame} from "@/engine";
import {priceMlbProp} from "@/lib/sportsbook/mlb";
import {useSportsbook} from "@/lib/sportsbook/store";
import {useSport} from "@/lib/sport";
import type {Board} from "@/lib/engine-client";

export function useBrowseProps(board:Board|undefined){
 const book=useSportsbook();const sport=useSport();
 const local=board?.data.propBoard;
 const empty=!local?.some(g=>Object.values(g.markets).some(rows=>rows.length));
 const query=useQuery<PropBoardGame[]>({queryKey:["server-props",board?.date??null],enabled:sport==="mlb"&&!!board&&empty,staleTime:60_000,
  queryFn:async()=>{const r=await fetch(`/api/board?date=${encodeURIComponent(board!.date)}`,{cache:"no-store"});if(!r.ok)throw new Error("Stored prop board unavailable");const j=await r.json();return j.board?.data?.propBoard??[];}});
 const rows=useMemo(()=>(empty?query.data??[]:local??[]).map(g=>({...g,markets:Object.fromEntries(Object.entries(g.markets).map(([k,rs])=>[k,rs.map(r=>priceMlbProp(r,book))]))})),[local,empty,query.data,book]);
 return {rows,loading:empty&&query.isFetching,fromServer:empty&&!!query.data?.length};
}
