"use client";
import type {CrossLeg} from "@/lib/cross-sport";
import {PlayerMark as MlbPlayerMark} from "@/components/player/PlayerMark";
import {PlayerMark,TeamMark,PairMark} from "@/components/cfb/TeamMark";
export function CrossMark({leg}:{leg:CrossLeg}){
 return <span className="relative flex h-9 w-9 shrink-0 items-center justify-center" aria-label={`${leg.label} · ${leg.sport}`}>
 {!leg.player && !leg.imageTeam && !leg.imagePair && leg.logo ? <TeamMark team={{abbr:leg.team??leg.label,name:leg.label,logo:leg.logo,color:null,rank:null}} showAbbr={false} size="md"/> : leg.sport==="mlb"?<MlbPlayerMark player={leg.player} headshot={leg.headshot} team={leg.team} size="md"/>:
 leg.player?<PlayerMark league={leg.sport} player={leg.player} headshot={leg.headshot} team={leg.imageTeam} teamIds={leg.imageTeamIds} pos={leg.position} size="md"/>:
 leg.imagePair?<PairMark {...leg.imagePair} size="sm"/>:
 leg.imageTeam?<TeamMark team={leg.imageTeam} showAbbr={false} size="md"/>:
 <span className="text-[10px] font-bold">{leg.label.split(" ").map(s=>s[0]).slice(0,2).join("")}</span>}
 <span className="absolute -bottom-1 text-[7px] uppercase text-muted">{leg.sport}</span></span>;
}
