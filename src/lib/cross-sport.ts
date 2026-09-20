import { footballTeamKey } from "./football/team-key";
import { rowProbAt, sideLabel } from "./cfb/model";
import { baseMarketOf } from "./cfb/markets";
import type { DiscoverySport } from "./discovery";
import { poolOf, type GenLeg, type GenMarket } from "./parlay-gen";
import { buildPool, MLB_GEN_MARKETS } from "@/components/props/mlb-gen-pool";
import { FOOTBALL_GEN_MARKETS, footballGenPool } from "./football/gen-pool";
import { priceMlbBoard } from "./sportsbook/mlb";
import { priceFootballProp, priceFootballSlate } from "./sportsbook/football";
import { BOOKS } from "./sportsbook/books";
import type { Board } from "./engine-client";
import type { CfbPropsBoard } from "./cfb/props-types";
import type { CfbSlate } from "./cfb/types";
import { amToDec } from "./ticket-math";
import { bothSides, legId, teamTag } from "@/components/props/props-model";
import type { PickRow } from "@/engine";
import type { LiveNowRead } from "./liveNow";
import { parseBoardLabel } from "./player-card";
import { teamLogo, clubFromLabel } from "./mlb-visuals";
import { liveMarketBoard, marketPhaseBoard, pruneHrLines } from "./mlb/market-board";
import type {CfbTeam} from "./cfb/types";
export type CrossLeg={imageTeam?:CfbTeam|null;imageTeamIds?:string[];imagePair?:{away:CfbTeam;home:CfbTeam};team?:string|null;sport:DiscoverySport;id:string;gameId:string;label:string;sub:string;game:string;cz:number;prob:number;push?:number;book:string;market:string;player?:string;headshot?:string|null;logo?:string|null;position?:string|null;start?:string|null;src?:"model"|"market"};
export const ALL_MARKETS:readonly GenMarket[]=[{key:"ml",label:"ML"},{key:"spread",label:"Spread"},{key:"rl",label:"Run Line"},{key:"total",label:"Total"},{key:"ml_1h",label:"1H ML"},{key:"spread_1h",label:"1H Spread"},{key:"total_1h",label:"1H Total"},...FOOTBALL_GEN_MARKETS,...MLB_GEN_MARKETS];
export type CrossData={mlb?:Board|null;nfl?:{props?:CfbPropsBoard;slate?:CfbSlate};cfb?:{props?:CfbPropsBoard;slate?:CfbSlate}};
const tag=(book:string)=>BOOKS.find(b=>b.key===book)?.short??book;
export function crossSportLegs(data:CrossData,book:string,now:number,live?:LiveNowRead):GenLeg<CrossLeg>[] {
 const out:GenLeg<CrossLeg>[]=[];
 if(data.mlb){const d=priceMlbBoard(data.mlb.data,book);
 // Reuse posted board quotes; in-play rows also require a current official boxscore.
 const raw=d.propBoard??[];
 const inPlay=live?liveMarketBoard(raw,null,d.gameInfo,live,now,1_800_000):[];
 const board=marketPhaseBoard(pruneHrLines(raw),inPlay,"mixed",now);
 const p=buildPool(board,{market:"batter_hits",markets:MLB_GEN_MARKETS.map(m=>m.key),includeStarted:true,phase:"mixed"},now);
 for(const l of p.legs){const id=`mlb:${l.id}`;const who=parseBoardLabel(l.label);out.push({...l,context:{sport:"mlb",game:String(d.gameInfo?.[l.gameKey]?.pk??l.gameKey),player:who?.name??l.label,market:l.market,line:l.line,side:l.side,start:l.start},id,sport:"mlb",gameKey:`mlb:${l.gameKey}`,playerKey:`mlb:${l.playerKey}`,team:l.team?`mlb:${l.team}`:null,leg:{sport:"mlb",id,gameId:l.gameKey,label:l.label,sub:l.sub,game:l.gameLabel??l.leg.game,cz:l.am,prob:l.prob,book:l.book,market:l.market!,player:who?.name??l.label,team:l.team,logo:l.team?teamLogo(l.team):null,src:l.src,start:l.start}});}
 for(const market of ["ml","rl"]) for(const row of bothSides((d.categories?.[market]??[]) as PickRow[])){
 const am=typeof row.cz==="number"?row.cz:row.czOdds;const prob=Number(row.prob);const start=row.gkey?d.gameInfo?.[row.gkey]?.start:null;
 if(typeof am!=="number"||!(prob>0&&prob<=100)||!start||Date.parse(start)<=now)continue;
 const id=`mlb:${legId(row)}`,label=String(row.label??""),sub=String(row.sub??""),game=String(row.game??""),team=clubFromLabel(label);
 out.push({id,sport:"mlb",am,dec:amToDec(am),prob,ev:prob/100*amToDec(am)-1,src:"model",side:"o",label,sub,market,gameKey:`mlb:${row.gkey}`,playerKey:`mlb:side:${row.gkey}`,team:team?`mlb:${teamTag(team)}`:null,started:false,alt:false,book:tag(book),start,gameLabel:game,leg:{id,sport:"mlb",gameId:String(row.gkey),label,sub,game,cz:am,prob,book:tag(book),market,start,src:"model",team,logo:team?teamLogo(team):null}});
 }
 }
 for(const sport of ["nfl","cfb"] as const){const entry=data[sport];if(!entry)continue;
 const b=entry.props;const slate=priceFootballSlate(entry.slate,book);const games=new Map(slate?.games.map(g=>[g.id,g])??[]);
 if(b){const rows=b.rows.map(r=>priceFootballProp(r,book));const p=footballGenPool<CrossLeg>(rows,{market:"anytime_td",markets:FOOTBALL_GEN_MARKETS.map(m=>m.key),includeStarted:true,phase:"mixed"},{mode:"cz",nowMs:now,pricedAt:b.pricedAt,teamOf:r=>footballTeamKey(r,games.get(r.gameId)),quoteOf:r=>r.cz,legOf:(r,q)=>r.fair!=null&&q.line===r.line?{sport,id:`${sport}:${r.key}`,gameId:r.gameId,label:r.player,sub:r.label,game:r.sub,cz:q.price,prob:r.fair*100,book:tag(q.book),market:r.market,player:r.player,headshot:r.headshot,position:r.pos,imageTeam:(r.teamId===games.get(r.gameId)?.home.id?games.get(r.gameId)?.home:r.teamId===games.get(r.gameId)?.away.id?games.get(r.gameId)?.away:null),imageTeamIds:[games.get(r.gameId)?.home.id,games.get(r.gameId)?.away.id].filter((id):id is string=>!!id),start:r.kickoff,src:"market",logo:(r.teamId===games.get(r.gameId)?.home.id?games.get(r.gameId)?.home.logo:r.teamId===games.get(r.gameId)?.away.id?games.get(r.gameId)?.away.logo:null)??null}:null});
 for(const l of p.legs){const g=games.get(l.gameKey);if(g&&(g.status==="final"||g.status==="postponed"))continue;out.push({...l,context:{sport,game:l.gameKey,player:l.label,market:l.market,line:l.line,side:l.side,start:l.start},id:`${sport}:${l.id}`,sport,gameKey:`${sport}:${l.gameKey}`,playerKey:`${sport}:${l.playerKey}`,team:l.team?`${sport}:${l.team}`:null});}}
 for(const g of slate?.games??[]){if(g.status!=="upcoming"||Date.parse(g.start)<=now)continue;for(const r of g.rows){const q=r.cz;if(!q||r.fair==null)continue;const p=rowProbAt(g.model,r.market,r.side,q.line)??{win:r.fair,push:r.push};const prob=p.win*100,push=(p.push??0)*100;const label=baseMarketOf(r.market)==="ml"||q.line===r.line?r.label:sideLabel(g,r.market,r.side,q.line);const team=footballTeamKey(r,g);if(!(prob>0&&prob<=100))continue;const id=`${sport}:${r.key}`;out.push({id,sport,am:q.price,dec:amToDec(q.price),prob,push,ev:prob/100*amToDec(q.price)+push/100-1,src:"model",side:r.side==="under"?"u":"o",label,sub:r.market,market:r.market,gameKey:`${sport}:${g.id}`,playerKey:`${sport}:side:${g.id}`,team:team?`${sport}:${team}`:null,started:false,alt:false,book:tag(q.book),start:g.start,gameLabel:`${g.away.abbr} @ ${g.home.abbr}`,leg:{sport,id,gameId:g.id,label,sub:r.market,game:`${g.away.abbr} @ ${g.home.abbr}`,cz:q.price,prob,push,book:tag(q.book),market:r.market,start:g.start,src:"model",imageTeam:r.side==="home"?g.home:r.side==="away"?g.away:null,imagePair:baseMarketOf(r.market)==="total"?{home:g.home,away:g.away}:undefined,logo:r.side==="home"?g.home.logo:r.side==="away"?g.away.logo:null}});}}
 }
 return out;
}
export const crossPool=(legs:readonly GenLeg<CrossLeg>[])=>poolOf([...legs],{rows:legs.length,startedDropped:0,finishedDropped:0,noParlayDropped:0});
