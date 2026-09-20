export type ProgressState="pending"|"live"|"won"|"lost"|"push"|"void";
export function pickProgress(value:number|null,line:number|null,side:"o"|"u",final=false,voided=false){
 if(voided)return {state:"void" as ProgressState,percent:0,color:"#94a3b8",label:"Void / postponed"};
 if(value==null||line==null||!Number.isFinite(value)||!Number.isFinite(line))return {state:"pending" as ProgressState,percent:0,color:"#94a3b8",label:"Stat unavailable"};
 const win=side==="o"?value>line:value<line;
 const state:ProgressState=final?(value===line?"push":win?"won":"lost"):"live";
 const target=side==="o"?Math.floor(line)+1:Math.max(1,line);
 const ratio=Math.max(0,Math.min(4/3,value/Math.max(1,target)));
 const colors=["#991b1b","#ef4444","#c2410c","#fb923c","#a16207","#fde047"];
 const color=state==="won"?"#22c55e":state==="lost"?"#991b1b":state==="push"?"#94a3b8":colors[Math.min(5,Math.floor(Math.min(.999,ratio)*6))];
 return {state,percent:ratio*75,color,label:state==="won"?"Won":state==="lost"?"Lost":state==="push"?"Push":side==="o"&&win?"Target reached · awaiting final":side==="u"?"Under · must hold through final":"Live progress"};
}
export type LiveContext={status:"pre"|"live"|"final"|"void";score:string|null;detail:string|null;players:Record<string,Record<string,number>>;at:string};
export const liveName=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\([^)]*\)/g,"").replace(/[^a-z0-9]/g,"");
type Obj=Record<string,unknown>;
const obj=(v:unknown):Obj=>v&&typeof v==="object"?v as Obj:{};
const arr=(v:unknown):unknown[]=>Array.isArray(v)?v:[];
const num=(v:unknown):number|null=>v!==null&&v!==undefined&&String(v).trim()!==""&&Number.isFinite(Number(v))?Number(v):null;
export function footballContext(raw:unknown,at:string):LiveContext{
 const j=obj(raw),c=obj(arr(obj(j.header).competitions)[0]),status=obj(obj(c.status).type),state=status.state;
 const teams=arr(c.competitors).map(obj),away=teams.find(t=>t.homeAway==="away"),home=teams.find(t=>t.homeAway==="home");
 const players:LiveContext["players"]={};
 for(const group of arr(obj(j.boxscore).players).map(obj))for(const table of arr(group.statistics).map(obj)){
  const keys=arr(table.keys).map(String);
  for(const p of arr(table.athletes).map(obj)){const name=String(obj(p.athlete).displayName??"");if(!name)continue;const row=players[liveName(name)]??={};
   const values=arr(p.stats);keys.forEach((k,i)=>{const n=num(values[i]);if(n!=null)row[k]=n;});
  }
 }
 const map:Record<string,string>={pass_yds:"passingYards",pass_tds:"passingTouchdowns",pass_tds_alt:"passingTouchdowns",receptions_alt:"receptions",rush_yds:"rushingYards",rec_yds:"receivingYards",receptions:"receptions"};
 for(const p of Object.values(players)){for(const [m,k]of Object.entries(map))if(p[k]!=null)p[m]=p[k];
  const td=["rushingTouchdowns","receivingTouchdowns","kickReturnTouchdowns","puntReturnTouchdowns","interceptionTouchdowns","defensiveTouchdowns"].filter(k=>p[k]!=null);
  if(td.length)p.tds_over=p.anytime_td=td.reduce((s,k)=>s+p[k],0);
 }
 const score=away&&home&&num(away.score)!=null&&num(home.score)!=null?`${String(obj(away.team).abbreviation??"Away")} ${away.score} @ ${String(obj(home.team).abbreviation??"Home")} ${home.score}`:null;
 return {status:/postpon|cancel/i.test(String(status.name))?"void":status.completed===true?"final":state==="in"?"live":"pre",score,detail:typeof status.shortDetail==="string"?status.shortDetail:null,players,at};
}
export function mlbContext(raw:unknown,at:string):LiveContext{
 const j=obj(raw),g=obj(j.gameData),live=obj(j.liveData),state=obj(g.status),box=obj(live.boxscore),ls=obj(live.linescore),players:LiveContext["players"]={};
 for(const team of Object.values(obj(box.teams)).map(obj))for(const player of Object.values(obj(team.players)).map(obj)){
  const stats=obj(player.stats),bat=obj(stats.batting),pit=obj(stats.pitching),name=String(obj(player.person).fullName??"");if(!name)continue;const row:Record<string,number>={};
  for(const [market,key]of Object.entries({batter_hits:"hits",batter_home_runs:"homeRuns",batter_total_bases:"totalBases",batter_rbis:"rbi",batter_runs_scored:"runs"})){const n=num(bat[key]);if(n!=null)row[market]=n;}
  if(row.batter_total_bases==null && [bat.hits,bat.doubles,bat.triples,bat.homeRuns].every(v=>num(v)!=null)) row.batter_total_bases=Number(bat.hits)+Number(bat.doubles)+2*Number(bat.triples)+3*Number(bat.homeRuns);
  if([bat.hits,bat.runs,bat.rbi].every(v=>num(v)!=null))row.batter_hits_runs_rbis=Number(bat.hits)+Number(bat.runs)+Number(bat.rbi);
  if(num(pit.strikeOuts)!=null)row.pitcher_strikeouts=Number(pit.strikeOuts);
  if(typeof pit.inningsPitched==="string"){const [whole,part="0"]=pit.inningsPitched.split(".");if(Number(part)<=2)row.pitcher_outs=Number(whole)*3+Number(part);}
  if(Object.keys(row).length)players[liveName(name)]=row;
 }
 const teams=obj(ls.teams),away=obj(teams.away),home=obj(teams.home),names=obj(g.teams);
 return {status:/postpon|cancel/i.test(String(state.detailedState))?"void":state.abstractGameState==="Final"?"final":state.abstractGameState==="Live"?"live":"pre",score:num(away.runs)!=null&&num(home.runs)!=null?`${obj(names.away).abbreviation??"Away"} ${away.runs} @ ${obj(names.home).abbreviation??"Home"} ${home.runs}`:null,detail:ls.currentInning?`${ls.inningHalf??""} ${ls.currentInning}`:String(state.detailedState??""),players,at};
}
