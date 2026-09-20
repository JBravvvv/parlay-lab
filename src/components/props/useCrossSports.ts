"use client";
import { useReadQueryClient } from "@/lib/use-read-query-client";
import { useQuery } from "@tanstack/react-query";
import { useLiveNow } from "@/lib/liveNow";
import { useHeadshots } from "@/lib/mlb-visuals";
import { useMemo } from "react";
import { useSportsbook } from "@/lib/sportsbook/store";
import { crossSportLegs, type CrossData } from "@/lib/cross-sport";
export function useCrossSports(date:string,sports:readonly string[]){
 const client=useReadQueryClient();
 const key=[...sports].sort().join(",");const book=useSportsbook();
 const q=useQuery<{data:CrossData}>({queryKey:["discovery",date,key],queryFn:async()=>{const r=await fetch(`/api/discovery?date=${encodeURIComponent(date)}&sports=${key}`);if(!r.ok)throw new Error("Stored boards unavailable");return r.json();},enabled:!!date&&!!key,staleTime:30_000,refetchInterval:60_000},client);
 const reqs=useMemo(()=>Object.values(q.data?.data.mlb?.data.gameInfo??{}).map(g=>({pk:g.pk,date:g.start})),[q.data]);
 const live=useLiveNow(reqs);
 const raw=useMemo(()=>crossSportLegs(q.data?.data??{},book,Date.now(),live),[q.data,q.dataUpdatedAt,book,live]);
 const names=useMemo(()=>raw.filter(l=>l.sport==="mlb"&&l.leg.player).map(l=>l.leg.player!),[raw]);
 const heads=useHeadshots(names);
 const legs=useMemo(()=>raw.map(l=>l.sport==="mlb"&&l.leg.player?{...l,leg:{...l.leg,headshot:heads[l.leg.player]??null}}:l),[raw,heads]);
 return {...q,legs};
}
