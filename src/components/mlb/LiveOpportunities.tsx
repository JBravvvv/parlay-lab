"use client";
import {discoveryMatches,type DiscoveryFilter} from "@/lib/discovery";
import {MlbLegContext,type MlbGameInfo} from "@/components/props/MlbLegContext";
import {useHeadshots} from "@/lib/mlb-visuals";
import Link from "next/link";
import type {PropBoardGame} from "@/engine";
import {MLB_BROWSE_MARKETS} from "@/lib/mlb/browse-markets";
import {nameKey,playerLeg,legDeepLink,deepLinkHref} from "@/components/props/props-model";
import {PlayerMark} from "@/components/player/PlayerMark";
import {amFmt} from "@/lib/ticket-math";
import {Panel} from "@/components/ui/Panel";
import {gradeFromEv} from "@/lib/grade";
import {GradeChip} from "@/components/ui/GradeChip";
import {decimal} from "@/lib/sportsbook/books";

export function LiveOpportunities({games,market,search,loading,syncReady,error,filter,info}:{filter?:DiscoveryFilter;info?:MlbGameInfo;games:PropBoardGame[];market:string;search:string;loading:boolean;syncReady:boolean;error:string|null}){
 const picks=games.flatMap(g=>Object.entries(g.markets).flatMap(([m,rows])=>market!=="all"&&market!==m?[]:rows.flatMap(r=>{
  if(search&&!nameKey(r.p).includes(nameKey(search)))return [];
  const leg=playerLeg(r,m,"o",g.game,g.gkey);
  if(leg&&filter&&!discoveryMatches({market:m,sport:"mlb",started:true,start:g.start,am:leg.cz,prob:leg.prob,ev:(leg.prob/100*decimal(leg.cz)-1)*100},filter))return [];
  return leg?[{g,r,m,leg,ev:r.pO==null?null:(r.pO/100*decimal(leg.cz)-1)*100}]:[];
 }))).sort((a,b)=>(b.ev??-Infinity)-(a.ev??-Infinity)||(b.leg.prob-a.leg.prob));
 const headshots=useHeadshots(picks.slice(0,24).map(p=>p.r.p));
 return <Panel title="In-play opportunities">
  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted"><span>{picks.length} current lines · {games.length} active games</span><Link replace href="/props?phase=live" className="rounded-lg bg-pos/15 px-3 py-3 font-semibold text-pos">Build a live parlay →</Link><Link replace href="/props?phase=mixed" className="rounded-lg border border-white/10 px-3 py-3 text-text">Mix live + pregame →</Link></div>
  {!picks.length?<p className="py-4 text-sm text-muted">{loading?"Checking live quotes…":!syncReady?"Enter your sync phrase in Settings to load in-play prices.":error?"Live prices could not load. Try Refresh MLB.":"No current in-play quotes match this view. Games may be finished, paused, or the book may have removed the market. Refresh MLB or browse pregame picks."}</p>:<div className="grid gap-2 sm:grid-cols-2">{picks.slice(0,24).map(({g,r,m,leg,ev})=>{
   const deep=legDeepLink({label:leg.label,lkey:r.lkey,gkey:g.gkey});
   return <Link replace key={leg.id} href={deep?deepLinkHref(deep)+"&phase=live":"/props?phase=live"} className="flex items-center gap-3 rounded-xl border border-live/20 bg-live/5 p-3">
    <PlayerMark player={r.p} headshot={headshots[r.p]??null} team={r.tm} size="sm"/>
    <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-text">{r.p}</div><div className="text-xs text-muted">{MLB_BROWSE_MARKETS[m as keyof typeof MLB_BROWSE_MARKETS]} Over {r.ln}</div><MlbLegContext leg={{gkey:g.gkey,lkey:r.lkey,label:leg.label,prop:leg.sub}} info={info}/><div className="mt-1 text-[10px] text-live">Live quote · {r.quoteAt?new Date(r.quoteAt).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):""}</div><div className="text-[10px] text-muted">{leg.prob?`${leg.prob.toFixed(1)}% ${leg.src==="model"?"model":"market estimate"}`:"No probability estimate"}</div></div>
    <div className="text-right"><div className="num font-bold text-pos">{amFmt(leg.cz)}</div>{ev!=null?<GradeChip grade={gradeFromEv(ev)} basis="Model EV at the live quote"/>:<span className="text-[10px] text-muted">{leg.book}</span>}</div>
   </Link>;
  })}</div>}
  <p className="mt-3 text-[10px] text-muted">Only recent posted prices in active games qualify. Market estimates are not independent model edges. Combined payouts are estimates; confirm the full ticket with your sportsbook.</p>
 </Panel>;
}
