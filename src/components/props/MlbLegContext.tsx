"use client";
import { PickContext } from "./PickContext";
import { gameTimeLabel } from "@/lib/game-time-window";
import { marketOf } from "@/lib/ledger-segments";
import { parseBoardLabel } from "@/lib/player-card";
export type MlbGameInfo=Record<string,{pk?:number|null;start?:string;away?:unknown;home?:unknown}>;
export function MlbLegContext({leg,info}:{leg:{gkey?:string|null;lkey?:string|null;label?:string;prop?:string},info?:MlbGameInfo}){
 const g=leg.gkey?info?.[leg.gkey]:undefined;if(!g)return null;
 const parts=(leg.lkey??"").split("|");const who=parseBoardLabel(leg.label??"");const market=marketOf(leg.lkey??"");
 const line=parts.length===3?Number(parts[2]):null;
 return <div className="text-[9px] text-muted">{typeof g.away==="string"&&typeof g.home==="string"?`${g.away} @ ${g.home}`:leg.gkey?.replace(/_/g," ")} · {gameTimeLabel(g.start)}<PickContext pick={{sport:"mlb",game:String(g.pk??""),player:who?.name,market,line:line!=null&&Number.isFinite(line)?line:null,side:/^(U|under)\b/i.test(leg.prop??"")?"u":"o",start:g.start}}/></div>;
}
