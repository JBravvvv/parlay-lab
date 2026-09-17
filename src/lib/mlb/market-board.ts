import type {PropBoardGame} from "@/engine";
import {SETTLE_BOOK,bookName} from "@/lib/sportsbook/books";
import type {MlbLiveQuoteBoard} from "./live-quote-types";
import type {LiveNowRead} from "@/lib/liveNow";

/** Live browsing is a separate projection: never mutate stored pregame rows or predictions. */
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
   if(!q)continue;
   const age=now-Date.parse(q.at);
   if(!Number.isFinite(age)||age<0||age>maxAgeMs)continue;
   const tally=state.legNow(pk,row.lkey)?.val;
   if(tally!=null && tally>q.ln)continue; // both sides already decided
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
  }
  if(Object.values(markets).some(rows=>rows.length))result.push({...game,live:true,markets});
 }
 return result;
}

export function marketPhaseBoard(pregame: readonly PropBoardGame[], live: readonly PropBoardGame[], phase:"pregame"|"live"|"mixed", now:number): PropBoardGame[]{
 const upcoming=pregame.filter(g=>!g.live && !!g.start && Date.parse(g.start)>now);
 return phase==="live"?[...live]:phase==="mixed"?[...upcoming,...live]:upcoming;
}
