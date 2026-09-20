import {describe,it,expect} from "vitest";
import type {PropBoardGame,PropBoardRow,BoardData} from "@/engine";
import {liveMarketBoard,marketPhaseBoard} from "@/lib/mlb/market-board";
import {browseOddsUrl} from "@/lib/mlb/browse-markets";
import {attachBookQuotes,priceMlbBoard} from "@/lib/sportsbook/mlb";
import {buildPool} from "@/components/props/mlb-gen-pool";
import {generate,type GenSpec} from "@/lib/parlay-gen";
import type {MlbLiveQuoteBoard} from "@/lib/mlb/live-quote-types";
import type {LiveNowRead} from "@/lib/liveNow";
import {SETTLE_BOOK} from "@/lib/sportsbook/books";
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
 it("keeps pregame/live separate and mixed permits both, across many seeds",()=>{
  const pre={...game,gkey:"pre",live:false,start:new Date(now+3600000).toISOString(),markets:{batter_hits:[{...row,p:"Other Hitter",lkey:"otherhitter|batter_hits|0.5"}]}};
  const live=read();const all=marketPhaseBoard([pre,game],live,"mixed",now);
  expect(marketPhaseBoard([pre,game],live,"pregame",now)).toEqual([pre]);
  const pool=buildPool(all,spec,now);
  for(let seed=0;seed<40;seed++){const result=generate(pool,spec,seed);expect(result.ok).toBe(true);if(result.ok)expect(new Set(result.ticket.legs.map(l=>l.started)).size).toBe(2);}
  const only=buildPool([pre],spec,now);expect(generate(only,spec,1)).toMatchObject({ok:false,fail:{code:"short-pool",have:1,want:2}});
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
  const captured=attachBookQuotes(data,[event],'williamhill_us');/* the row's cz is Caesars-priced */expect(captured.categories).toStrictEqual(data.categories); // the settle-book stamp (INSTRUCTION 67) rebuilds the object; nothing in it changes
  for(const market of ["batter_rbis","batter_runs_scored"]){
   const r=captured.propBoard![0].markets[market][0];expect(r.pO).toBeNull();expect(r.fO).toBeGreaterThan(0);expect(r.tm).toBe("NYY");expect(r.cz?.o).toBe(-120);
   expect(priceMlbBoard(captured,"draftkings").propBoard![0].markets[market][0].cz?.o).toBe(130);
  }
  expect(data.propBoard![0].markets.batter_rbis).toBeUndefined();
 });
});

/**
 * THE BOARD'S OWN IN-PLAY ROWS (2026-09-18, Josh, verbatim: "Why won't it generate parlays right
 * now for HRs? There are a ton of HR live props on the board and just starting… I refreshed the
 * board as well from 5:00pm last refresh to 7:03pm"). Nine of the ten games were `live:true`
 * with 81 HR rows priced at the 7:02pm refresh, and the builder saw none of them: only the
 * authenticated re-quote overlay ever produced a live leg. Now a `live:true` row's own book
 * timestamp is a live quote, under the same 30-minute gate — and a started game the board still
 * lists as `live:false` stays out, because its prices are pregame prices.
 */
describe("the board's own in-play rows feed the live pool",()=>{
 const quiet={...state,legNow:()=>null} as unknown as LiveNowRead;
 const stored=(over:Partial<PropBoardRow>={}):PropBoardRow=>({...row,bookQuotes:{o:{[SETTLE_BOOK]:{am:-120,line:.5,book:SETTLE_BOOK,at}},u:{[SETTLE_BOOK]:{am:100,line:.5,book:SETTLE_BOOK,at}}},...over});
 const liveGame=(r:PropBoardRow,market="batter_hits"):PropBoardGame=>({...game,markets:{[market]:[r]}});
 it("a live:true row with a fresh settle-book timestamp becomes a live leg, priced at the row's own quote and with no pregame model %",()=>{
  const out=liveMarketBoard([liveGame(stored())],null,{g:{pk:1}},quiet,now,1_800_000);
  expect(out).toHaveLength(1);
  const r=out[0].markets.batter_hits[0];
  expect(r).toMatchObject({ln:.5,lkey:row.lkey,o:-120,u:100,quoteAt:at,pO:null,fO:55});
  const pool=buildPool(out,{market:"batter_hits",phase:"live",includeStarted:true},now);
  expect(pool.legs.find(l=>l.side==="o")).toMatchObject({am:-120,prob:55,src:"market",quoteAt:at,started:true});
 });
 it("the overlay wins when it has the row; the stored quote is only the fallback",()=>{
  const out=liveMarketBoard([liveGame(stored())],overlay,{g:{pk:1}},quiet,now,1_800_000);
  expect(out[0].markets.batter_hits[0]).toMatchObject({ln:1.5,o:150,u:-170});
 });
 it("a stale, future or missing timestamp is not a live quote",()=>{
  for(const t of [new Date(now-1_800_001).toISOString(),new Date(now+1).toISOString(),"broken"]){
   const r=stored({bookQuotes:{o:{[SETTLE_BOOK]:{am:-120,line:.5,book:SETTLE_BOOK,at:t}},u:{}}});
   expect(liveMarketBoard([liveGame(r)],null,{g:{pk:1}},quiet,now,1_800_000)).toEqual([]);
  }
  expect(liveMarketBoard([liveGame({...row})],null,{g:{pk:1}},quiet,now,1_800_000)).toEqual([]);
 });
 it("a game that started AFTER the refresh (live:false, start in the past) never gets its pregame prices re-badged as live",()=>{
  const g={...liveGame(stored()),live:false,start:new Date(now-600_000).toISOString()};
  expect(liveMarketBoard([g],null,{g:{pk:1}},quiet,now,1_800_000)).toEqual([]);
  expect(marketPhaseBoard([g],[],"mixed",now)).toEqual([]);
 });
 it("a line the boxscore already decided is dropped, and a game statsapi says is not priceable gets nothing",()=>{
  expect(liveMarketBoard([liveGame(stored())],null,{g:{pk:1}},{...quiet,legNow:()=>({val:1,txt:"1 H",inning:null})} as unknown as LiveNowRead,now,1_800_000)).toEqual([]);
  expect(liveMarketBoard([liveGame(stored())],null,{g:{pk:1}},{...quiet,games:{1:{priceable:false,live:true}}} as unknown as LiveNowRead,now,1_800_000)).toEqual([]);
 });
 it("mixed builds from one upcoming game plus the board's own live rows",()=>{
  const pre={...game,gkey:"pre",live:false,start:new Date(now+3600000).toISOString(),markets:{batter_hits:[{...row,p:"Other Hitter",lkey:"otherhitter|batter_hits|0.5"}]}};
  const live=liveMarketBoard([liveGame(stored())],null,{g:{pk:1}},quiet,now,1_800_000);
  const pool=buildPool(marketPhaseBoard([pre,liveGame(stored())],live,"mixed",now),spec,now);
  const result=generate(pool,spec,3);
  expect(result.ok).toBe(true);
  if(result.ok)expect(result.ticket.legs.map(l=>l.started).sort()).toEqual([false,true]);
 });
 it("a one-game live pool still respects the requested two-game capacity",()=>{
  const live=liveMarketBoard([liveGame(stored())],null,{g:{pk:1}},quiet,now,1_800_000);
  expect(generate(buildPool(live,spec,now),spec,1)).toMatchObject({ok:false,fail:{code:"short-pool",have:1,want:2}});
 });
});

it('keeps all three fresh live book prices distinct when the user switches books',()=>{
 const quotes={draftkings:{o:150,u:-170},williamhill_us:{o:180,u:-200},fanduel:{o:120,u:-140}};
 for(const book of Object.keys(quotes) as (keyof typeof quotes)[]){
  const g={...game,markets:{batter_hits:[{...row,displayBook:book}]}};
  const o={...overlay,rows:{['g|'+row.lkey]:{...overlay.rows['g|'+row.lkey],quotes}}};
  const r=liveMarketBoard([g],o,{g:{pk:1}},state,now,1_800_000)[0].markets.batter_hits[0];
  expect(r.cz).toEqual(quotes[book]);expect(r.o).toBe(quotes[book].o);expect(r.ln).toBe(1.5);expect(r.fO).toBe(40);
 }
});
