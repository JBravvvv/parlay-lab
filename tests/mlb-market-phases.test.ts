import {describe,it,expect} from "vitest";
import type {PropBoardGame,PropBoardRow,BoardData} from "@/engine";
import {liveMarketBoard,marketPhaseBoard} from "@/lib/mlb/market-board";
import {browseOddsUrl} from "@/lib/mlb/browse-markets";
import {attachBookQuotes,priceMlbBoard} from "@/lib/sportsbook/mlb";
import {buildPool} from "@/components/props/mlb-gen-pool";
import {generate,type GenSpec} from "@/lib/parlay-gen";
import type {MlbLiveQuoteBoard} from "@/lib/mlb/live-quote-types";
import type {LiveNowRead} from "@/lib/liveNow";
const now=Date.parse("2026-09-16T23:00:00Z"), at=new Date(now-60_000).toISOString();
const row:PropBoardRow={p:"Test Hitter",tm:"NYY",ln:.5,lkey:"testhitter|batter_hits|0.5",o:-120,u:100,oBook:"Caesars",uBook:"Caesars",cz:{o:-120,u:100},pO:70,fO:55,books:2};
const game:PropBoardGame={game:"NYY @ BOS",gkey:"g",start:new Date(now-3_600_000).toISOString(),live:true,markets:{batter_hits:[row]}};
const overlay={rows:{["g|"+row.lkey]:{gkey:"g",lkey:row.lkey,ln:1.5,czAm:150,oppAm:-170,pLive:.4,pSrc:"market",fO:.4,books:2,at}}} as unknown as MlbLiveQuoteBoard;
const state={games:{1:{priceable:true,live:true}},legNow:()=>({val:1})} as unknown as LiveNowRead;
const read=(o=overlay,s=state)=>liveMarketBoard([game],o,{g:{pk:1}},s,now,1_800_000);
const spec:GenSpec={market:"batter_hits",phase:"mixed",legs:2,legMinAm:-250,legMaxAm:200,payout:null,sides:"o",onePerGame:true,czOnly:false,includeStarted:true,modelOnly:false,pinned:[null,null]};
describe("actual live quote pool",()=>{
 it("uses the live line and market estimate, never the pregame model",()=>{
  const before=JSON.stringify(game);const result=read();const r=result[0].markets.batter_hits[0];
  expect(r.ln).toBe(1.5);expect(r.lkey).toBe("testhitter|batter_hits|1.5");expect(r.pO).toBeNull();expect(r.fO).toBe(40);
  const pool=buildPool(result,{market:"batter_hits",phase:"live",includeStarted:true},now);
  expect(pool.legs).toHaveLength(2);expect(pool.legs.find(l=>l.side==="o")).toMatchObject({am:150,prob:40,src:"market",quoteAt:at,started:true});
  expect(JSON.stringify(game)).toBe(before);
 });
 it("drops expired, future, malformed, paused, final and cleared quotes",()=>{
  for(const at of [new Date(now-1_800_001).toISOString(),new Date(now+1).toISOString(),"broken"]){const o=structuredClone(overlay);Object.values(o.rows)[0].at=at;expect(read(o)).toEqual([]);}
  expect(read(overlay,{...state,games:{1:{...state.games[1],priceable:false,final:true}}})).toEqual([]);
  expect(read(overlay,{...state,legNow:()=>({val:2,txt:"2 H",inning:null})})).toEqual([]);
 });
 it("never reuses a missing selected-book live price",()=>{
  const o=structuredClone(overlay);Object.assign(Object.values(o.rows)[0],{czAm:null,oppAm:null});
  expect(buildPool(read(o),{market:"batter_hits",phase:"live",includeStarted:true},now).legs).toEqual([]);
 });
 it("keeps pregame/live separate and mixed requires both, across many seeds",()=>{
  const pre={...game,gkey:"pre",live:false,start:new Date(now+3600000).toISOString(),markets:{batter_hits:[{...row,p:"Other Hitter",lkey:"otherhitter|batter_hits|0.5"}]}};
  const live=read();const all=marketPhaseBoard([pre,game],live,"mixed",now);
  expect(marketPhaseBoard([pre,game],live,"pregame",now)).toEqual([pre]);
  const pool=buildPool(all,spec,now);
  for(let seed=0;seed<40;seed++){const result=generate(pool,spec,seed);expect(result.ok).toBe(true);if(result.ok)expect(new Set(result.ticket.legs.map(l=>l.started)).size).toBe(2);}
  const only=buildPool([pre],spec,now);expect(generate(only,spec,1)).toEqual({ok:false,fail:{code:"phase-empty"}});
 });
 it("rejects old started prices even when includeStarted is true",()=>{
  expect(buildPool([game],{market:"batter_hits",phase:"live",includeStarted:true},now).legs).toEqual([]);
 });
});
describe("RBI and Runs browse quotes",()=>{
 it("widens only MLB event prop calls, without touching other sports or relative assets",()=>{
  const source="https://api.the-odds-api.com/v4/sports/baseball_mlb/events/abc/odds?markets=batter_hits&regions=us";
  expect(new URL(browseOddsUrl(source)).searchParams.get("markets")).toBe("batter_hits,batter_rbis,batter_runs_scored");
  expect(browseOddsUrl(source.replace("baseball_mlb","americanfootball_nfl"))).toBe(source.replace("baseball_mlb","americanfootball_nfl"));
  expect(browseOddsUrl("/data/context.json")).toBe("/data/context.json");
 });
 it("retains exact-line prices for both books with no fabricated model probability",()=>{
  const data={categories:{},parlays:[],parlaysMixed:[],gameInfo:{g:{home:"Boston Red Sox",away:"New York Yankees",start:game.start,pk:1}},propBoard:[game]} as unknown as BoardData;
  const books=[{key:"williamhill_us",title:"Caesars",price:-120},{key:"draftkings",title:"DraftKings",price:130}];
  const event={id:"e",home_team:"Boston Red Sox",away_team:"New York Yankees",commence_time:game.start!,bookmakers:books.map(b=>({...b,markets:["batter_rbis","batter_runs_scored"].map(key=>({key,outcomes:[{name:"Over",description:"Test Hitter",point:.5,price:b.price},{name:"Under",description:"Test Hitter",point:.5,price:-110}]}))}))};
  const captured=attachBookQuotes(data,[event]);expect(captured.categories).toBe(data.categories);
  for(const market of ["batter_rbis","batter_runs_scored"]){
   const r=captured.propBoard![0].markets[market][0];expect(r.pO).toBeNull();expect(r.fO).toBeGreaterThan(0);expect(r.tm).toBe("NYY");expect(r.cz?.o).toBe(-120);
   expect(priceMlbBoard(captured,"draftkings").propBoard![0].markets[market][0].cz?.o).toBe(130);
  }
  expect(data.propBoard![0].markets.batter_rbis).toBeUndefined();
 });
});
