import type {PropBoardGame,PropBoardRow} from "@/engine";
import {SETTLE_BOOK,bookName} from "@/lib/sportsbook/books";
import type {MlbLiveQuoteBoard} from "./live-quote-types";
import type {LiveNowRead} from "@/lib/liveNow";

export const HR_MARKET="batter_home_runs";

/**
 * THE HOME-RUN LINE RULE (2026-09-18, Josh, verbatim: "no HR bets shown EVER should be over 1.5
 * HR unless its a live bet in which the player already has 1 HR live OR it is a manual filter by
 * myself to just look at grades on over 1.5 HRs pre game for funsies. Every bet should be over .5
 * HR or 1+HR").
 *
 * So an HR line above 0.5 is admitted in exactly two cases: the game is LIVE and the boxscore
 * tally already covers all but the last homer the line asks for (O1.5 needs 1 in the book, O2.5
 * needs 2), or the reader has switched the pregame "Show O1.5 HR" filter on. The generator, the
 * ranked list and the Board's ALL scope never pass `altHr` — only the browse view can.
 */
export function hrLineAllowed(market:string, ln:number, opts:{live:boolean; tally?:number|null; altHr?:boolean}):boolean{
 if(market!==HR_MARKET || !(ln>0.5))return true;
 if(opts.altHr)return true;
 return opts.live && opts.tally!=null && opts.tally>=ln-0.5;
}

/** the pregame projection of the rule: every HR row above 0.5 is dropped unless `altHr` */
export function pruneHrLines(board: readonly PropBoardGame[], altHr=false): PropBoardGame[]{
 if(altHr)return [...board];
 return board.map(g=>{
  const rows=g.markets?.[HR_MARKET];
  if(!rows?.some(r=>r.ln>0.5))return g;
  return {...g,markets:{...g.markets,[HR_MARKET]:rows.filter(r=>hrLineAllowed(HR_MARKET,r.ln,{live:false}))}};
 });
}

/** the freshest book timestamp a stored row carries — the settlement book's first, else the newest */
export function rowQuoteAt(row:PropBoardRow):string|null{
 if(row.displayBook){const book=row.displayBook;const dates=[row.bookQuotes?.o?.[book]?.at,row.bookQuotes?.u?.[book]?.at].filter((s):s is string=>!!s&&Number.isFinite(Date.parse(s)));return dates.length?dates.sort((a,b)=>Date.parse(a)-Date.parse(b))[0]:null;}
 const settle=row.bookQuotes?.o?.[SETTLE_BOOK]?.at ?? row.bookQuotes?.u?.[SETTLE_BOOK]?.at;
 if(settle)return settle;
 let best:string|null=null, bestMs=-Infinity;
 for(const side of ["o","u"] as const)for(const q of Object.values(row.bookQuotes?.[side]??{})){
  const ms=q.at?Date.parse(q.at):NaN;
  if(Number.isFinite(ms)&&ms>bestMs){bestMs=ms;best=q.at!;}
 }
 return best;
}

/**
 * Live browsing is a separate projection: never mutate stored pregame rows or predictions.
 *
 * TWO SOURCES of an in-play price, in this order (2026-09-18, Josh: "There are a ton of HR live
 * props on the board and just starting… I refreshed the board as well from 5:00pm last refresh to
 * 7:03pm" — and the builder still said no live leg qualified):
 *   1. the live-props OVERLAY (`/api/mlb/live-props`, the authenticated re-quote) — wins when present;
 *   2. the board's OWN in-play rows: a game the engine marked `live:true` at the last refresh was
 *      priced while it was under way, so each row's book timestamp is a real in-play quote. Until
 *      now those rows were dropped on the floor — `marketPhaseBoard` removed the game from
 *      "upcoming" and the pool builder rejected the rows for carrying no `quoteAt`.
 * Both sources go through the SAME gates: the statsapi game must be priceable, the quote must be
 * younger than `maxAgeMs` (30 minutes), a line the boxscore has already decided is dropped, and
 * the HR line rule applies. A started game the board still lists as `live:false` (it began after
 * the refresh) gets NOTHING here — its prices are pregame prices and stay rejected.
 * The fallback row keeps no model %: `pO` is nulled, because the engine's number on it is the
 * pregame model, and only `fO` (the de-vigged fair at the quoted price) is carried.
 */
export function liveMarketBoard(board: readonly PropBoardGame[], overlay: MlbLiveQuoteBoard | null | undefined,
  info: Record<string,{pk?:number|null}> | undefined, state: LiveNowRead, now: number, maxAgeMs: number): PropBoardGame[] {
 const result: PropBoardGame[]=[];
 for(const game of board){
  if(!game.gkey)continue;
  const pk=info?.[game.gkey]?.pk;
  if(pk==null || !state.games[pk]?.priceable)continue;
  const markets: PropBoardGame["markets"]={};
  const seen=new Set<string>();
  for(const [market,rows] of Object.entries(game.markets))for(const row of rows){
   const q=overlay?.rows[`${game.gkey}|${row.lkey}`];
   if(q){
    const age=now-Date.parse(q.at);
    if(!Number.isFinite(age)||age<0||age>maxAgeMs)continue;
    const tally=state.legNow(pk,row.lkey)?.val;
    if(tally!=null && tally>q.ln)continue; // both sides already decided
    if(!hrLineAllowed(market,q.ln,{live:true,tally}))continue;
    const lkey=`${row.lkey.split("|")[0]}|${market}|${q.ln}`;
    if(seen.has(lkey))continue;
    seen.add(lkey);
    (markets[market]??=[]).push({...row,lkey,ln:q.ln,alt:false,quoteAt:q.at,
     o:q.czAm,u:q.oppAm,settlementBook:SETTLE_BOOK,oBook:row.displayBook??bookName(SETTLE_BOOK),uBook:row.displayBook??bookName(SETTLE_BOOK),
     bookQuotes:{
       o:Object.fromEntries(Object.entries(q.quotes??{}).flatMap(([book,v])=>v.o==null?[]:[[book,{am:v.o,line:q.ln,book,at:q.at}]])),
       u:Object.fromEntries(Object.entries(q.quotes??{}).flatMap(([book,v])=>v.u==null?[]:[[book,{am:v.u,line:q.ln,book,at:q.at}]]))},
     cz:{o:q.czAm,u:q.oppAm},pO:q.pSrc==="sim"&&q.pLive!=null?q.pLive*100:null,
     fO:q.pLive==null?null:q.pLive*100,books:q.books});
    continue;
   }
   /* source 2: the board's own in-play row */
   if(!game.live)continue;
   const at=rowQuoteAt(row);
   if(!at)continue;
   const age=now-Date.parse(at);
   if(!Number.isFinite(age)||age<0||age>maxAgeMs)continue;
   const tally=state.legNow(pk,row.lkey)?.val;
   if(tally!=null && tally>row.ln)continue;
   if(!hrLineAllowed(market,row.ln,{live:true,tally}))continue;
   const lkey=`${row.lkey.split("|")[0]}|${market}|${row.ln}`;
   if(seen.has(lkey))continue;
   seen.add(lkey);
   (markets[market]??=[]).push({...row,quoteAt:at,pO:null});
  }
  if(Object.values(markets).some(rows=>rows.length))result.push({...game,live:true,markets});
 }
 return result;
}

export function marketPhaseBoard(pregame: readonly PropBoardGame[], live: readonly PropBoardGame[], phase:"pregame"|"live"|"mixed", now:number, opts:{altHr?:boolean}={}): PropBoardGame[]{
 const upcoming=pruneHrLines(pregame.filter(g=>!g.live && !!g.start && Date.parse(g.start)>now),opts.altHr);
 return phase==="live"?[...live]:phase==="mixed"?[...upcoming,...live]:upcoming;
}
