import history from "@/lib/nfl/first-sunday-six-history.json";
import type {CfbGame} from "@/lib/cfb/types";
import type {CfbPropsBoard} from "@/lib/cfb/props-types";
import {canonicalFootballPlayer} from "@/lib/football/defense";
import {gradeFromEv} from "@/lib/grade";
export type SixPrice={player:string;odds:number};
export const sixKey=(name:string)=>canonicalFootballPlayer(name).toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g,"").replace(/[^a-z0-9]/g,"");
export function earlySunday(g:CfbGame,date:string){
 const t=new Date(g.start);if(!Number.isFinite(+t)||g.date!==date)return false;
 const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(t);
 return p.find(x=>x.type==='weekday')?.value==='Sun'&&p.find(x=>x.type==='hour')?.value==='13'&&p.find(x=>x.type==='minute')?.value==='00';
}
/** Elapsed regulation clock, not wall-clock kickoff/scoring timestamps. No automatic settlement. */
export function touchdownElapsed(period:number,clock:string):number|null{
 const m=/^(\d{1,2}):([0-5]\d)$/.exec(clock);if(!m||period<1||period>4||!Number.isInteger(period))return null;
 const left=+m[1]*60 + +m[2];return left>900?null:(period-1)*900+900-left;
}
export function parseSixPrices(text:string):{rows:SixPrice[];errors:string[]}{
 const rows:SixPrice[]=[],errors:string[]=[];const seen=new Set<string>();
 text.split(/\r?\n/).forEach((line,i)=>{if(!line.trim())return;const m=/^(.+?)\s*(?:\||,)\s*([+-]?\d+)\s*$/.exec(line);const odds=m?Number(m[2]):NaN;
 if(!m||Math.abs(odds)<100||Math.abs(odds)>1000000||!Number.isFinite(odds)){errors.push(`Line ${i+1}: use Player | +2200`);return;}
 const player=m[1].trim(),key=sixKey(player);if(!key||seen.has(key)){errors.push(`Line ${i+1}: duplicate or missing player`);return;}seen.add(key);rows.push({player,odds});});return {rows,errors};
}
export function sixRace(games:readonly CfbGame[],board:CfbPropsBoard|undefined,date:string,prices:readonly SixPrice[],now:number){
 const early=games.filter(g=>earlySunday(g,date));
 const closed=early.some(g=>g.status!=='upcoming'||Date.parse(g.start)<=now);
 const totals=early.map(g=>g.model?.muTotal??0);
 const ready=date>history.latestCompletedDate&&early.length>0&&!closed&&totals.every(t=>Number.isFinite(t)&&t>0)&&board?.date===date;
 const gameChances=historicalRace(totals);
 const groups=new Map(early.map(g=>[g.id,(board?.rows??[]).filter(r=>r.gameId===g.id&&r.market==='first_td'&&r.fair!=null&&r.fair>0&&r.fair<1)]));
 const results=prices.map(price=>{
  const matches=early.flatMap((g,i)=>(groups.get(g.id)??[]).filter(r=>sixKey(r.player)===sixKey(price.player)).map(row=>({g,i,row})));
  const match=matches.length===1?matches[0]:null;
  const stamp=match?Date.parse(board?.pricedAt?.[match.g.id]??''):NaN;
  const fresh=Number.isFinite(stamp)&&now-stamp>=0&&now-stamp<=3*3600000;
  const share=match?match.row.fair!/Math.max(1,(groups.get(match.g.id)??[]).reduce((s,r)=>s+(r.fair??0),0)):null;
  const p=ready&&match&&fresh&&share!=null?share*gameChances[match.i]:null;
  const dec=price.odds>0?1+price.odds/100:1+100/-price.odds;
  const ev=p==null?null:p*dec-1;
  return {...price,game:match?.g,row:match?.row,p,share,implied:1/dec,dec,ev,grade:gradeFromEv(ev==null?null:ev*100),reason:closed?'Early slate started':!ready?'Early slate / totals unavailable':!match?'No unique First TD estimate':!fresh?'First TD estimate older than 3 hours':null};
 });
 return {early,closed,results,estimatedMass:results.reduce((s,r)=>s+(r.p??0),0)};
}
/** Scenario only: winners includes this entry; bonus credits are not cash. */
export function sixScenario(p:number,odds:number,winners:number,conversion:number,pool=500000,stake=10){
 if(!(p>=0&&p<=1&&Math.abs(odds)>=100&&Number.isFinite(odds)&&Number.isInteger(winners)&&winners>=1&&conversion>=0&&conversion<=1&&pool>=0&&stake>=10&&[pool,stake].every(Number.isFinite)))return null;
 const dec=odds>0?1+odds/100:1+100/-odds;
 const cashEv=stake*(p*dec-1),bonusFace=pool/winners,bonusEv=p*bonusFace*conversion;
 return {cashEv,bonusFace,bonusEv,totalEv:cashEv+bonusEv};
}

/** Empirical regulation-clock race. Equal-clock mass is withheld until promo tie terms are known. */
export function historicalRace(totals:readonly number[]):number[]{
 if(!totals.length||totals.some(t=>!Number.isFinite(t)||t<=0))return totals.map(()=>0);
 const model=history.clockModel;
 const distributions=totals.map(t=>model.selected==='uniform'?model.pooled:model.bands[t<42?'low':t>=48?'high':'mid']);
 const maps=distributions.map(d=>new Map(d.map(([t,p])=>[t,p])));
 const times=[...new Set(distributions.flatMap(d=>d.map(([t])=>t)))].sort((a,b)=>a-b);
 const survival=totals.map(()=>1),wins=totals.map(()=>0);
 for(const t of times){
  if(t>3600)continue;
  const mass=maps.map(m=>m.get(t)??0);
  mass.forEach((p,i)=>{survival[i]=Math.max(0,survival[i]-p);});
  mass.forEach((p,i)=>{wins[i]+=p*survival.reduce((s,v,j)=>s*(j===i?1:v),1);});
 }
 return wins;
}
