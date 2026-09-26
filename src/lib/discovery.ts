import { inOddsRange, type OddsRange } from "./odds-range";
import { inGameTimeWindow, type GameTimeWindow } from "./game-time-window";
export type DiscoverySport = "mlb" | "nfl" | "cfb";
export const SPORT_OPTIONS = [{key:"nfl",label:"NFL"},{key:"cfb",label:"CFB"},{key:"mlb",label:"MLB"}] as const;
export const TIMING_OPTIONS = [{key:"pregame",label:"Pre-Game"},{key:"live",label:"Live"}] as const;
export const STRATEGIES = [{key:"safe",label:"Safe"},{key:"balanced",label:"Balanced"},{key:"aggressive",label:"Aggressive"},{key:"longshot",label:"Longshot"},{key:"edge",label:"Edge / +EV"},{key:"stacks",label:"Correlated / Stacks"},{key:"anchor",label:"Anchor + Kicker"},{key:"hedge",label:"Hedge-Friendly"}] as const;
export type Strategy = typeof STRATEGIES[number]["key"];
export type DiscoveryFilter = { timing: readonly string[]; markets: readonly string[]; strategies: readonly string[]; sports: readonly string[]; timeWindow: GameTimeWindow; odds?: OddsRange };
export function discoveryMatches(p: {market:string; started?:boolean; sport?:string; start?:string|null; prob:number; ev:number; am:number; chanceRank?:number}, f:DiscoveryFilter):boolean {
 if (f.odds && !inOddsRange(p.am,f.odds)) return false;
 if (!f.timing.includes(p.started?"live":"pregame") || !f.markets.includes(p.market) || (p.sport && !f.sports.includes(p.sport)) || !inGameTimeWindow(p.start,f.timeWindow)) return false;
 if (!f.strategies.length) return false;
 if(f.strategies.length===STRATEGIES.length) return true;
 // On single picks, composition styles show eligible ingredients; ticket rules run in the generator.
 return f.strategies.some(s=>s==="edge"?p.ev>0:s==="safe"?(p.chanceRank??.5)>=.5 && p.ev>=-5:s==="balanced"?(p.chanceRank??.5)>=1/3 && p.ev>=-10:s==="aggressive"?(p.chanceRank??.5)<=2/3&&p.ev>=-10:true);
}

/** Equal estimates tie; each player has one vote even when many alternate lines exist. */
export function probabilityRanks<T>(rows:readonly T[],player:(r:T)=>string,prob:(r:T)=>number):Map<T,number>{
 const counts=new Map<string,number>(); for(const r of rows)counts.set(player(r),(counts.get(player(r))??0)+1);
 const sorted=[...rows].sort((a,b)=>prob(a)-prob(b)); const out=new Map<T,number>();let total=0;
 for(let i=0;i<sorted.length;){let j=i+1;while(j<sorted.length&&Math.abs(prob(sorted[j])-prob(sorted[i]))<1e-8)j++;
 const weight=sorted.slice(i,j).reduce((s,r)=>s+1/counts.get(player(r))!,0);const rank=(total+weight/2)/counts.size;
 for(let k=i;k<j;k++)out.set(sorted[k],rank);total+=weight;i=j;}return out;
}
export function marketRanksBy<T>(rows:readonly T[],market:(r:T)=>string,player:(r:T)=>string,prob:(r:T)=>number):Map<T,number>{
 const out=new Map<T,number>();const groups=new Map<string,T[]>();for(const r of rows){const key=market(r);const a=groups.get(key)??[];a.push(r);groups.set(key,a);}for(const group of groups.values())for(const [r,rank]of probabilityRanks(group,player,prob))out.set(r,rank);return out;
}
export function marketRanks<T extends {market?:string;prob:number;label:string}>(rows:readonly T[]):Map<T,number>{return marketRanksBy(rows,r=>r.market??"",r=>r.label,r=>r.prob);}
