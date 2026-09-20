"use client";
import { GradeChip } from "@/components/ui/GradeChip";
import { gradeFromEv } from "@/lib/grade";
import { useMemo,useState } from "react";
import { useCrossSports } from "./useCrossSports";
import { CrossMark } from "./CrossMark";
import { PickContext } from "./PickContext";
import { STRATEGIES, marketRanks, discoveryMatches,type DiscoveryFilter } from "@/lib/discovery";
import { crossPool } from "@/lib/cross-sport";
import { generate } from "@/lib/parlay-gen";
import { amFmt } from "@/lib/ticket-math";
import { gameTimeLabel } from "@/lib/game-time-window";
export function CrossBoardResults({date,filter}:{date:string;filter:DiscoveryFilter}){
 const q=useCrossSports(date,filter.sports);const [roll,setRoll]=useState(0);
 const legs=useMemo(()=>{const ranks=marketRanks(q.legs);return q.legs.filter(l=>discoveryMatches({...l,chanceRank:ranks.get(l),market:l.market!,ev:l.ev*100},filter)).sort((a,b)=>b.ev-a.ev);},[q.legs,filter]);
 const tickets=useMemo(()=>{const pool=crossPool(legs);const seen=new Set<string>();const out=[];for(let i=0;i<6;i++){const r=generate(pool,{market:filter.markets[0]??"ml",markets:filter.markets,legs:3,legMinAm:-10000,legMaxAm:10000,payout:null,sides:"both",onePerGame:!(filter.strategies.length<STRATEGIES.length&&filter.strategies.includes("stacks")),onePerTeam:false,czOnly:false,includeStarted:true,modelOnly:false,pinned:[],strategies:filter.strategies,preferDiversity:true,spread:false},roll*31+i+1,seen);if(r.ok&&!seen.has(r.ticket.key)){seen.add(r.ticket.key);out.push(r.ticket);}}return out;},[legs,filter,roll]);
 return <section className="space-y-2"><div className="text-[11px] text-muted">Selected sports · stored quotes · {legs.length} picks {q.isPending?"· loading…":""}</div>{q.isError&&<p className="text-neg">Stored boards unavailable.</p>}<div className="grid gap-1">{legs.slice(0,60).map(l=><div key={l.id} className="flex items-center gap-2 border-b border-white/10 py-1"><CrossMark leg={l.leg}/><div className="min-w-0 flex-1 text-[11px]"><b>{l.label}</b><div>{l.sub} · {l.gameLabel} · {gameTimeLabel(l.start)}</div>{l.context&&<PickContext pick={l.context}/>}</div><GradeChip grade={gradeFromEv(l.ev*100)} basis="EV at the selected book"/><div className="text-right text-[11px]">{amFmt(l.am)}<div>{l.prob.toFixed(1)}% {l.src==="market"?"market":"model"}</div></div></div>)}</div><div className="flex justify-between text-[12px]"><b>Generated parlays · selected sports</b><button onClick={()=>setRoll(r=>r+1)}>Regenerate ↻</button></div><div className="grid gap-2 md:grid-cols-3">{tickets.map(t=><div key={t.key} className="glass p-2 text-[11px]"><b>{amFmt(t.am)} · {(t.trueProb*100).toFixed(1)}% estimate</b>{t.sameGame.length>0&&<div className="text-gold">Shared game · correlation not modeled</div>}{t.legs.map(l=><div key={l.id}>{l.sport?.toUpperCase()} · {l.label} · {l.sub} {amFmt(l.am)}</div>)}<button className="mt-1 text-pos" onClick={()=>navigator.clipboard.writeText(t.legs.map(l=>`${l.sport?.toUpperCase()} ${l.label} ${l.sub} ${amFmt(l.am)} · ${l.book}`).join("\n"))}>Copy ticket</button></div>)}</div>{!legs.length&&!q.isPending&&<p className="text-[11px] text-muted">No stored quotes match. Select another date or broaden the filters.</p>}</section>;
}
