"use client";
import { useReadQueryClient } from "@/lib/use-read-query-client";
import { useLiveClock } from "@/lib/use-live-clock";
import { useQuery } from "@tanstack/react-query";
import { pickProgress,liveName,type LiveContext } from "@/lib/pick-progress";
import type { DiscoverySport } from "@/lib/discovery";
export type PickContextRef={sport:DiscoverySport;game:string;player?:string;market?:string;line?:number|null;side?:"o"|"u";start?:string|null};
export function PickContext({pick}:{pick:PickContextRef}){
 const client=useReadQueryClient();
 const now=useLiveClock();
 const valid=/^\d{5,12}$/.test(pick.game);const started=!!pick.start&&Date.parse(pick.start)<=now;
 const q=useQuery<LiveContext>({queryKey:["live-context",pick.sport,pick.game],queryFn:async()=>{const r=await fetch(`/api/live-context?sport=${pick.sport}&game=${pick.game}`);if(!r.ok)throw new Error("Live stats unavailable");return r.json();},enabled:valid&&started,staleTime:30_000,refetchInterval:q=>q.state.data?.status==="final"||q.state.data?.status==="void"?false:60_000,retry:1},client);
 if(!started||!valid)return null;
 const d=q.data;if(!d)return <span className="block text-[9px] text-faint">{q.isError?"Live feed unavailable":"Checking live stats…"}</span>;
 const stale=now-Date.parse(d.at)>120000;
 const value=pick.player&&pick.market?d.players[liveName(pick.player)]?.[pick.market]??null:null;
 const p=pickProgress(value,pick.line??(pick.market==="anytime_td"?.5:null),pick.side??"o",d.status==="final",d.status==="void");
 return <div className="pick-context mt-1 text-[9px] leading-tight"><div className="text-muted">{d.score} {d.detail} {stale?"· stale feed":""}</div>{pick.player&&<><div className="flex justify-between gap-1"><span className="num">{value??"—"}{pick.line!=null?` / ${pick.line}`:""}</span><span style={{color:p.color}}>{p.label}</span></div><div className="relative mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/10" role="meter" aria-label={`${pick.player} ${pick.market} progress`} aria-valuenow={value??0} aria-valuemin={0} aria-valuemax={Math.max(value??0,(pick.line??1)*4/3,1)}><span className="absolute inset-y-0 left-0 rounded-full transition-[width]" style={{width:`${p.percent}%`,background:p.color}}/><span className="absolute inset-y-0 left-3/4 w-px bg-white/80"/></div></>}</div>;
}
