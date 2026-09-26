import { probabilityRanks, STRATEGIES } from "./discovery";
import { mixCandidates, poolOf, type GenMemo, type GenPool, type GenSpec, type GenResult, type GenLeg } from "./parlay-gen";
type Run = <P>(pool:GenPool<P>,spec:GenSpec,seed:number,avoid?:ReadonlySet<string>,recent?:ReadonlyMap<string,number>,memo?:GenMemo)=>GenResult<P>;
/** Bounded strategy search over posted legs only. No forecast or quote is altered. */
export function strategyGenerate<P>(pool:GenPool<P>,spec:GenSpec,seed:number,avoid:ReadonlySet<string>|undefined,recent:ReadonlyMap<string,number>|undefined,run:Run):GenResult<P>{
 const model=spec.betType==="model";
 const styles=model?undefined:spec.strategies;
 if(styles?.length===0 || spec.sports?.length===0 || spec.timing?.length===0) return {ok:false,fail:{code:"no-rows"}};
 const chosen=model?"model":styles && styles.length<STRATEGIES.length ? styles[seed%styles.length] : undefined;
 const bands=new Map<string,string>();
 const eligible=mixCandidates(pool,spec);
 for(const m of new Set(eligible.map(l=>l.market))) { const peers=eligible.filter(l=>l.market===m); const ranked=probabilityRanks(peers,l=>l.playerKey,l=>l.prob); for(const l of peers) bands.set(l.id,ranked.get(l)!>=2/3?"anchor":ranked.get(l)!<=1/3?"upside":"middle"); }
 const candidates=pool.legs.filter(l=>chosen==="edge"?l.ev>0:chosen==="safe"?bands.get(l.id)!=="upside"&&l.ev>=-.05:true);
 const p=poolOf(candidates,pool);
 const clean:GenSpec={...spec,betType:undefined,strategies:undefined,preferDiversity:undefined,style:model?undefined:chosen==="safe"?"safer":chosen?"balanced":spec.style};
 if(chosen==="longshot" && spec.payout && spec.payout.maxAm<7500) return {ok:false,fail:{code:"payout-unreachable",reach:{minAm:7500,maxAm:1_000_000}}};
 /* Longshot's own band when Josh set none: +7,500 or longer. Up to 8 legs it keeps the +1,000,000 ceiling it always had,
    so every ticket up to 8 legs draws exactly as before; from 9 legs it is floor-only (2026-09-26) — the cheapest 19-20
    leg ticket on an ordinary band already sits above +1,000,000, so that ceiling made the style impossible there. The
    ceiling stays finite because the payout repair steers toward the band's geometric middle. */
 if(chosen==="longshot") clean.payout={minAm:Math.max(7500,spec.payout?.minAm??7500),maxAm:spec.payout?.maxAm??(spec.legs<=8?1_000_000:1e300)};
 /* Correlated / Stacks pairs two legs from one game — under one-leg-per-game no draw can ever fit, so name the switch */
 if(chosen==="stacks" && spec.onePerGame) return {ok:false,fail:{code:"style-shape",style:"stacks",legs:spec.legs,why:"same-game"}};
 let best:GenResult<P>|null=null,bestScore=-Infinity;
 const score=(ls:readonly GenLeg<P>[])=>{
  const games=new Map<string,number>(); for(const l of ls)games.set(l.gameKey,(games.get(l.gameKey)??0)+1);
  const teams=new Set(ls.map(l=>l.team).filter(Boolean));
  const probs=ls.map(l=>l.prob/100), avg=probs.reduce((a,b)=>a+b,0)/ls.length;
  const starts=ls.map(l=>Date.parse(l.start??"")).filter(Number.isFinite).sort((a,b)=>a-b);
  const span=starts.length===ls.length?(starts.at(-1)!-starts[0])/3600000:0;
  const repeats=ls.reduce((s,l)=>s+(recent?.get(l.playerKey)??0),0);
  let v=games.size*2+teams.size*.5-repeats*2+ls.reduce((s,l)=>s+Math.max(-1,Math.min(1,l.ev)),0);
  // Rank available estimates and price together; never manufacture a positive edge.
  if(model)v=ls.reduce((s,l)=>s+Math.log(Math.max(.000001,1+l.ev)),0)*12+avg*2+games.size*.15+teams.size*.05-repeats*.4;
  if(chosen==="safe")v+=avg*12;
  if(chosen==="balanced")v+=ls.filter(l=>bands.get(l.id)!=="upside").length;
  if(chosen==="aggressive")v+=ls.filter(l=>bands.get(l.id)==="upside"&&l.ev>=0).length*2;
  if(chosen==="stacks")v+=Array.from(games.values()).reduce((s,n)=>s+(n===2?6:n>2?-4*n:0),0);
  if(chosen==="anchor")v+=ls.filter(l=>bands.get(l.id)==="anchor").length*2;
  if(chosen==="hedge")v+=Math.min(span,12)*3;
  return v;
 };
 // every run below shares p and clean, so the seed-independent setup is done once (2026-09-26 perf pass)
 const memo:GenMemo={};
 for(let i=0;i<(model?64:32);i++){
  const r=run(p,clean,(seed+i*997)>>>0,avoid,recent,memo); if(!r.ok){best??=r;continue;}
  const ls=r.ticket.legs;
  if(chosen==="hedge" && (ls.some(l=>!l.start||!Number.isFinite(Date.parse(l.start))) || Math.max(...ls.map(l=>Date.parse(l.start!)))-Math.min(...ls.map(l=>Date.parse(l.start!)))<3*3600000))continue;
  if(chosen==="anchor"){
   const a=ls.filter(l=>bands.get(l.id)==="anchor"), k=ls.filter(l=>bands.get(l.id)!=="anchor");
   if(!a.length || !k.length || !k.some(l=>l.am>0) || k.some(l=>l.prob<Math.min(...a.map(x=>x.prob))*.5 || l.ev<-.05))continue;
  }
  if(chosen==="stacks"&&!ls.some((l,j)=>ls.some((x,k)=>j!==k&&x.gameKey===l.gameKey)))continue;
  const s=score(ls)-(avoid?.has(r.ticket.key)?1000:0); if(s>bestScore){best=r;bestScore=s;}
 }
 // best is null only when every run built a ticket and the chosen style's shape rule refused each one — say which rule
 // could never be met on this pool when that is knowable, so the sheet points at the real control
 if(best) return best;
 const starts=eligible.map(l=>Date.parse(l.start??"")).filter(Number.isFinite);
 const why=chosen==="anchor"&&!eligible.some(l=>l.am>0)?"no-plus":chosen==="hedge"&&(starts.length<2||Math.max(...starts)-Math.min(...starts)<3*3600000)?"one-window":null;
 return {ok:false,fail:{code:"style-shape",style:chosen??"",legs:spec.legs,why}};
}
