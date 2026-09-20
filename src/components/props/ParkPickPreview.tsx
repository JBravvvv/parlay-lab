"use client";
import { useState } from "react";
import { useCrossSports } from "./useCrossSports";
import { RankedPicks } from "./RankedPicks";
import { ALL_MARKETS } from "@/lib/cross-sport";
import { CrossMark } from "./CrossMark";
export function ParkPickPreview({date,away,home,pk}:{date:string;away:string;home:string;pk?:number|null}){
 const [open,setOpen]=useState(false);const q=useCrossSports(date,open?["mlb"]:[]);
 const picks=q.legs.filter(l=>pk?l.context?.game===String(pk):l.gameLabel?.includes(away)&&l.gameLabel?.includes(home)).map(l=>({id:l.id,market:l.market!,label:l.label,sub:`${l.sub} · ${l.gameLabel}`,am:l.am,prob:l.prob,ev:l.ev*100,src:l.src,book:l.book,start:l.start,started:l.started,context:l.context,leg:l.leg,mark:<CrossMark leg={l.leg}/>}));
 return <details onToggle={e=>setOpen(e.currentTarget.open)} className="px-3 py-1"><summary className="cursor-pointer text-[10px] text-muted">Explore game picks</summary>{open&&<><a href="/props" className="text-[11px] text-pos">Open Parlay Builder →</a><RankedPicks picks={picks} filters={ALL_MARKETS} isSel={()=>false} onToggle={()=>{window.location.href="/props";}} loading={q.isPending} emptyBody="No current stored quotes for this matchup."/></>}</details>;
}
