import {ticketMatches} from "@/lib/ticket-discovery";
import {footballTeamKey} from "@/lib/football/team-key";
import {combineTicket} from "@/lib/ticket-math";
import {describe,it,expect} from "vitest";
import {discoveryMatches,marketRanks,probabilityRanks,STRATEGIES,type DiscoveryFilter} from "@/lib/discovery";
import {generate,poolOf,type GenLeg,type GenSpec} from "@/lib/parlay-gen";
import {footballContext,mlbContext,pickProgress} from "@/lib/pick-progress";
import {mlbSplitUrl,MLB_SPLITS} from "@/lib/stats-splits";
import {crossToFootball,crossToMlb} from "@/lib/cross-adapters";
import {parkGrade,parkSide} from "@/lib/mlb/park-display";
import type {ParkCard,ParkMarkets} from "@/lib/mlb/ballpark";
import {crossSportLegs} from "@/lib/cross-sport";
import {rowQuoteAt} from "@/lib/mlb/market-board";
import type {PropBoardRow} from "@/engine";
import {footballQuoteCurrent,footballGenPool} from "@/lib/football/gen-pool";
import type {CfbPropRow} from "@/lib/cfb/props-types";
const filter:DiscoveryFilter={timing:["pregame","live"],markets:["anytime_td","batter_home_runs"],sports:["nfl","mlb"],strategies:STRATEGIES.map(s=>s.key),timeWindow:[0,24]};
const leg=(i:number,over:Partial<GenLeg>={}):GenLeg=>({id:`p${i}`,playerKey:`p${i}`,gameKey:`g${i}`,sport:"nfl",market:"anytime_td",team:`t${i}`,label:`Player ${i}`,sub:"Anytime TD",am:200,dec:3,prob:40+i,ev:.2,src:"market",side:"o",started:false,alt:false,book:"DK",start:`2026-09-20T${i%2?"23":"19"}:00:00Z`,leg:{},...over});
const pool=poolOf(Array.from({length:12},(_,i)=>leg(i)),{rows:12,startedDropped:0,finishedDropped:0,noParlayDropped:0});
const spec=(over:Partial<GenSpec>={}):GenSpec=>({market:"anytime_td",markets:["anytime_td"],legs:3,legMinAm:-230,legMaxAm:600,payout:null,sides:"both",onePerGame:true,onePerTeam:true,czOnly:true,pricingBook:"DK",includeStarted:true,modelOnly:false,pinned:[],preferDiversity:true,spread:false,...over});
describe("shared discovery and strategy construction",()=>{
 it("timing is a union, sports are an intersection, and clear means none",()=>{
  const p={market:"anytime_td",sport:"nfl",prob:35,ev:5,am:200};
  expect(discoveryMatches(p,filter)).toBe(true);expect(discoveryMatches({...p,started:true},filter)).toBe(true);
  expect(discoveryMatches({...p,sport:"cfb"},filter)).toBe(false);
  for(const key of ["timing","markets","sports","strategies"] as const)expect(discoveryMatches(p,{...filter,[key]:[]})).toBe(false);
 });
 it("HR probabilities are ranked within HR, not against passing props",()=>{
  const rows=[{label:"a",market:"batter_home_runs",prob:12},{label:"b",market:"batter_home_runs",prob:28},{label:"c",market:"pass_yds",prob:75}];const ranks=marketRanks(rows);
  expect(ranks.get(rows[1])).toBe(.75);expect(ranks.get(rows[2])).toBe(.5);
  expect(discoveryMatches({...rows[1],chanceRank:ranks.get(rows[1]),sport:"mlb",am:400,ev:5},{...filter,strategies:["safe"]})).toBe(true);
 });
 it("alternate ladders do not give one player extra voting weight",()=>{
  const rows=[{p:"a",v:10},{p:"a",v:10},{p:"a",v:10},{p:"b",v:20}];const ranks=probabilityRanks(rows,r=>r.p,r=>r.v);expect(ranks.get(rows[0])).toBe(.25);expect(ranks.get(rows[3])).toBe(.75);
 });
 it("allows same-game permission without forcing repeated games",()=>{
  const r=generate(pool,spec({onePerGame:false,onePerTeam:false}),77);expect(r.ok).toBe(true);if(r.ok)expect(new Set(r.ticket.legs.map(l=>l.gameKey)).size).toBe(3);
 });
 it("safe HR style does not impose a 50 percent floor",()=>{
  const p=poolOf(pool.legs.map((l,i)=>({...l,market:"batter_home_runs",sport:"mlb" as const,am:500,dec:6,prob:18+i*.8})),pool);
  const r=generate(p,spec({market:"batter_home_runs",markets:["batter_home_runs"],strategies:["safe"]}),19);expect(r.ok).toBe(true);if(r.ok)expect(r.ticket.legs.every(l=>l.prob<50)).toBe(true);
 });
 it("Edge excludes negative expected value",()=>{
  const p=poolOf(pool.legs.map((l,i)=>({...l,ev:i<5?-.2:.1})),pool);const r=generate(p,spec({strategies:["edge"]}),12);expect(r.ok).toBe(true);if(r.ok)expect(r.ticket.legs.every(l=>l.ev>0)).toBe(true);
 });
 it("longshot respects 75/1 and cannot reverse a smaller payout maximum",()=>{
  const r=generate(pool,spec({strategies:["longshot"],legs:4}),9);expect(r.ok).toBe(true);if(r.ok)expect(r.ticket.am).toBeGreaterThanOrEqual(7500);
  expect(generate(pool,spec({strategies:["longshot"],payout:{minAm:100,maxAm:1000}}),9).ok).toBe(false);
 });
 it("hedge style requires an actual later window, not one-minute separation",()=>{
  const r=generate(pool,spec({strategies:["hedge"]}),5);expect(r.ok).toBe(true);
  const p=poolOf(pool.legs.map(l=>({...l,start:"2026-09-20T19:00:00Z"})),pool);expect(generate(p,spec({strategies:["hedge"]}),5).ok).toBe(false);
 });
 it("all-live and all-pregame remain valid mixed tickets",()=>{
  for(const started of [true,false]){const p=poolOf(pool.legs.map(l=>({...l,started})),pool);expect(generate(p,spec({phase:"mixed"}),7).ok).toBe(true);}
 });
 it("keeps locked picks and selected sports through a strategy search",()=>{
  const r=generate(pool,spec({pinned:["p0"],sports:["nfl"]}),11);expect(r.ok).toBe(true);if(r.ok)expect(r.ticket.legs[0].id).toBe("p0");
  expect(generate(pool,spec({sports:["mlb"]}),11).ok).toBe(false);
 });
});
describe("official live progress",()=>{
 it("places the counting target at 75 percent and waits for final confirmation",()=>{
  const p=pickProgress(301,300,"o");expect(p.percent).toBe(75);expect(p.state).toBe("live");expect(p.label).toContain("awaiting final");expect(pickProgress(301,300,"o",true).state).toBe("won");
 });
 it("handles unders, pushes, voids and unavailable stats",()=>{
  expect(pickProgress(20,50,"u").state).toBe("live");expect(pickProgress(20,50,"u",true).state).toBe("won");expect(pickProgress(50,50,"u",true).state).toBe("push");expect(pickProgress(51,50,"u",true).state).toBe("lost");expect(pickProgress(null,50,"o").state).toBe("pending");expect(pickProgress(2,1,"o",true,true).state).toBe("void");
 });
 it("reads football stats by API keys and excludes passing TDs from anytime scorer TDs",()=>{
  const d=footballContext({header:{competitions:[{status:{type:{state:"in"}},competitors:[]}]},boxscore:{players:[{statistics:[{keys:["passingYards","passingTouchdowns"],athletes:[{athlete:{displayName:"A QB"},stats:["141","2"]}]},{keys:["rushingTouchdowns"],athletes:[{athlete:{displayName:"A QB"},stats:["0"]}]}]}]}},"now");
  expect(d.players.aqb.pass_yds).toBe(141);expect(d.players.aqb.pass_tds).toBe(2);expect(d.players.aqb.anytime_td).toBe(0);expect(d.status).toBe("live");
 });
 it("derives MLB total bases and reads baseball innings as outs",()=>{
  const d=mlbContext({gameData:{status:{abstractGameState:"Final"}},liveData:{boxscore:{teams:{home:{players:{ID1:{person:{fullName:"José Player"},stats:{batting:{hits:3,doubles:1,triples:0,homeRuns:1,runs:2,rbi:3},pitching:{inningsPitched:"5.2",strikeOuts:7}}}}}}}}},"now");
  expect(d.players.joseplayer.batter_total_bases).toBe(7);expect(d.players.joseplayer.pitcher_outs).toBe(17);expect(d.players.joseplayer.batter_hits_runs_rbis).toBe(8);expect(d.status).toBe("final");
 });
});
describe("research and cross-sport invariants",()=>{
 it("requests verified split codes for team and player tables",()=>{
  for(const s of MLB_SPLITS.filter(s=>s.key!=="all")){expect(mlbSplitUrl("team","hitting",2026,s.key)).toContain(`sitCodes=${s.key}`);expect(mlbSplitUrl("ind","pitching",2026,s.key)).toContain("/stats?stats=statSplits");}
  expect(mlbSplitUrl("team","hitting",2026,"bad")).toBeNull();
 });
 it("All handedness averages multipliers, and neutral is C",()=>{
  const m=(x:number)=>({hr:x,hits:x,tb:x,hrr:x,runs:x,k:1,outs:1,index:null}) as ParkMarkets;
  const c={L:m(1.2),R:m(1)} as ParkCard;expect(parkSide(c,"ALL").hr).toBe(1.1);expect(parkGrade(m(1))).toBe("C");expect(parkGrade(m(1.2))).toBe("S");expect(parkGrade(m(.8))).toBe("F");
 });
 it("cross-sport slips preserve the exact book price, probability and namespaced identity",()=>{
  const l={id:"mlb:123",sport:"mlb" as const,gameId:"123",label:"Player",sub:"HR",game:"A @ B",cz:450,prob:22,book:"DK",market:"batter_home_runs",player:"Player"};
  expect(crossToMlb(l).cz).toBe(450);const f=crossToFootball(l);expect(f.gameId).toBe("mlb:123");expect(f.prob).toBe(22);expect(f.market).toBe("batter_home_runs");expect(f.cross).toEqual(l);
 });
 it("missing stored boards produce no invented candidates",()=>{expect(crossSportLegs({},"draftkings",Date.now())).toEqual([]);});
});

describe("fresh live prices only",()=>{
 const kickoff="2026-09-20T19:00:00Z",now=Date.parse("2026-09-20T19:10:00Z");const row={gameId:"401234567",kickoff,status:"live" as const};
 it("rejects missing, pregame, future and expired pulls",()=>{
  for(const at of [undefined,"2026-09-20T18:59:59Z","2026-09-20T19:11:00Z","2026-09-20T19:00:00Z"])
   expect(footballQuoteCurrent(row,at?{[row.gameId]:at}:undefined,now,300_000)).toBe(false);
  expect(footballQuoteCurrent(row,{[row.gameId]:"2026-09-20T19:09:00Z"},now,300_000)).toBe(true);
 });
 it("does not call an upcoming game live just because kickoff passed",()=>{
  expect(footballQuoteCurrent({...row,status:"upcoming"},{[row.gameId]:"2026-09-20T19:09:00Z"},now)).toBe(false);
  expect(footballQuoteCurrent({...row,status:"final"},{[row.gameId]:"2026-09-20T19:09:00Z"},now)).toBe(false);
 });
 it("cannot borrow a newer DraftKings timestamp for a stale FanDuel quote",()=>{
  const row={displayBook:"fanduel",bookQuotes:{o:{draftkings:{at:"2026-09-20T19:09:00Z"},fanduel:{at:"2026-09-20T18:00:00Z"}}}} as unknown as PropBoardRow;
  expect(rowQuoteAt(row)).toBe("2026-09-20T18:00:00Z");expect(rowQuoteAt({...row,displayBook:"betmgm"})).toBeNull();
 });
});


describe("side markets in mixed tickets",()=>{
 it("resolves props and sides to the same team, leaving totals unassigned",()=>{
  const g={home:{id:"1",abbr:"KC"},away:{id:"2",abbr:"BUF"}};
  expect(footballTeamKey({teamId:"1",team:"Kansas City"},g)).toBe(footballTeamKey({side:"home"},g));
  expect(footballTeamKey({side:"away"},g)).toBe("BUF");
  expect(footballTeamKey({side:"over"},g)).toBeNull();
  const p=poolOf([leg(0,{team:"KC"}),leg(1,{team:"KC"})],pool);
  expect(generate(p,spec({legs:2,onePerGame:false}),1).ok).toBe(false);
 });
 it("includes push refunds in independent EV without inflating full-win probability",()=>{
  const c=combineTicket([{cz:100,prob:40,push:20},{cz:100,prob:50}])!;
  expect(c.trueProb).toBeCloseTo(.2);expect(c.ev).toBeCloseTo(0);expect(c.dec).toBe(4);
  const l={id:"nfl:side",sport:"nfl" as const,gameId:"1",label:"KC",sub:"Spread",game:"BUF @ KC",cz:100,prob:40,push:20,book:"DK",market:"spread"};
  expect(crossToFootball(l).push).toBe(20);expect(crossToMlb(l).push).toBe(20);
 });
});

 it("Board Safe / Safer filters by market-relative probability and value, with styles combined as a union",()=>{
 const strong={market:"anytime_td",sport:"nfl",prob:40,ev:4,am:200,chanceRank:.8};
 const weak={...strong,prob:20,chanceRank:.2};
 expect(ticketMatches([strong,strong],{...filter,strategies:["safe"]})).toBe(true);
 expect(ticketMatches([strong,weak],{...filter,strategies:["safe"]})).toBe(false);
 expect(ticketMatches([{...strong,ev:-15}],{...filter,strategies:["safe"]})).toBe(false);
 expect(ticketMatches([strong,weak],{...filter,strategies:["safe","aggressive"]})).toBe(true);
 expect(ticketMatches([strong],{...filter,strategies:[]})).toBe(false);
 });
