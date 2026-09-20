import { discoveryMatches, STRATEGIES, type DiscoveryFilter } from "./discovery";
export type DiscoveryLeg={market:string;prob:number;ev:number;chanceRank?:number;am:number;start?:string|null;started?:boolean;sport?:string;game?:string};
export function ticketMatches(legs:readonly DiscoveryLeg[],f:DiscoveryFilter):boolean{
 if(!legs.length||!f.strategies.length)return false;
 if(!legs.every(l=>discoveryMatches(l,{...f,strategies:STRATEGIES.map(s=>s.key)})))return false;
 if(f.strategies.length===STRATEGIES.length)return true;
 const dec=legs.reduce((d,l)=>d*(l.am>0?1+l.am/100:1+100/-l.am),1);
 const prob=legs.reduce((p,l)=>p*l.prob/100,1);
 const counts=new Map<string,number>();for(const l of legs)if(l.game)counts.set(l.game,(counts.get(l.game)??0)+1);
 return f.strategies.some(s=>s==="longshot"?dec>=76:s==="edge"?prob*dec>1:s==="safe"?legs.every(l=>(l.chanceRank??.5)>=.5&&l.ev>=-5):s==="balanced"?legs.every(l=>(l.chanceRank??.5)>=1/3):s==="aggressive"?legs.some(l=>l.am>0):s==="stacks"?[...counts.values()].some(n=>n>1):s==="anchor"?legs.some(l=>l.am>0)&&Math.min(...legs.map(l=>l.prob))>=Math.max(...legs.map(l=>l.prob))*.5:s==="hedge"?legs.every(l=>l.start&&Number.isFinite(Date.parse(l.start)))&&new Set(legs.map(l=>l.start)).size>1:false);
}
