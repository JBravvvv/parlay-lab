import type {BoardData,PickRow,PropBoardRow,Ticket,TicketLeg} from '@/engine';
import {american,DEFAULT_BOOK,bookKey,bookName,decimal,validAm,valueAt} from './books';
import {decToAm} from '@/lib/ticket-math';
export type BookQuote={am:number;line:number|null;book:string;at?:string};
export type QuoteIndex=Record<string,Record<string,BookQuote>>;
type Outcome={name:string;description?:string;point?:number;price:number};
type EventOdds={id:string;home_team:string;away_team:string;commence_time:string;bookmakers:{key:string;title:string;last_update?:string;markets:{key:string;last_update?:string;outcomes:Outcome[]}[]}[]};
const norm=(s:string)=>s.replace(/^Oakland Athletics$/,'Athletics').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const under=(s:string)=>/\bunder\b|\bU\s*\d/i.test(s);
export function quoteCapture(){
 const events=new Map<string,EventOdds>();
 return {events, capture(body:unknown){for(const e of Array.isArray(body)?body:[body]){if(!e||typeof e!=='object'||!Array.isArray(e.bookmakers)||!e.id)continue;const prior=events.get(e.id);events.set(e.id,prior?{...e,bookmakers:[...prior.bookmakers,...e.bookmakers]}:e);}},clear(){events.clear();}};
}
/** Add quote provenance outside the parity-locked engine. No selection fields change. */
export function attachBookQuotes(data:BoardData,events:Iterable<EventOdds>):BoardData {
 const index:QuoteIndex={};
 const rawEvents=[...events];
 const rows=[...Object.values(data.categories??{}).flat(),...Object.values(data.categoriesLive??{}).flat()];
 const lines=new Map<string,number|null>();
 for(const r of rows){if(r.gkey&&r.lkey){const n=String(r.sub).match(/(?:RL|Spread)\s*([+-]?\d+(?:\.\d+)?)/i);if(n)lines.set(`${r.gkey}|${r.lkey}`,Number(n[1]));const opp=r.opp as {lkey?:string;pt?:number}|undefined;if(opp?.lkey&&opp.pt!=null)lines.set(`${r.gkey}|${opp.lkey}`,opp.pt);}}
 for(const e of rawEvents){
  const matches=Object.entries(data.gameInfo??{}).filter(([,g])=>norm(g.home)===norm(e.home_team)&&norm(g.away)===norm(e.away_team)).sort((a,b)=>Math.abs(Date.parse(a[1].start)-Date.parse(e.commence_time))-Math.abs(Date.parse(b[1].start)-Date.parse(e.commence_time)));
  if(!matches.length)continue;const gkey=matches[0][0];
  for(const b of e.bookmakers)for(const m of b.markets)for(const o of m.outcomes){
   if(!validAm(o.price))continue;
   let lk:string|null=null,side='o';
   if(m.key==='h2h'||m.key==='spreads'){
    const who=norm(o.name)===norm(e.home_team)?'home':norm(o.name)===norm(e.away_team)?'away':null;if(!who)continue;
    lk=`${m.key==='h2h'?'ml':'rl'}_${who}`;
    if(m.key==='spreads'&&lines.get(`${gkey}|${lk}`)!==o.point)continue;
   }else if(o.description&&o.point!=null){const point=/_alternate$/.test(m.key)&&Number.isInteger(o.point)&&o.point>=1?o.point-.5:o.point;lk=`${norm(o.description)}|${m.key.replace(/_alternate$/,'')}|${point}`;side=/under|no/i.test(o.name)?'u':'o';}
   if(!lk)continue;const key=`${gkey}|${lk}|${side}`;
   (index[key]??={})[b.key]={am:o.price,line:o.point??null,book:b.key,at:m.last_update??b.last_update};
  }
 }
 const propBoard=data.propBoard?.map(g=>({
  ...g, markets:Object.fromEntries(Object.entries(g.markets).map(([m,rs])=>[m,
   rs.map(r=>({...r,bookQuotes:{o:index[`${g.gkey}|${r.lkey}|o`]??{},u:index[`${g.gkey}|${r.lkey}|u`]??{}}}))
  ]))
 }));
 const simMarkets=(data.simMarkets as SimMarket[]|undefined)?.map(r=>{
  const e=rawEvents.find(e=>r.game===`${e.away_team} @ ${e.home_team}`&&(!r.start||Date.parse(r.start)===Date.parse(e.commence_time)));
  const quotes:Record<string,{pt:number;o:number;u:number}>={};
  for(const b of e?.bookmakers??[])for(const m of b.markets){if(m.key!=='totals')continue;const o=m.outcomes.find(o=>o.name==='Over'),u=m.outcomes.find(o=>o.name==='Under');if(o&&u&&o.point!=null&&u.point===o.point)quotes[b.key]={pt:o.point,o:o.price,u:u.price};}
  return {...r,bookTotals:quotes};
 });
 return {...data,bookQuotes:index,propBoard,...(simMarkets?{simMarkets}:{})};
}
function knownPrice(r:PickRow,book:string,index:QuoteIndex):number|null{
 const side=under(r.sub)?'u':'o';const q=index[`${r.gkey}|${r.lkey}|${side}`]?.[book];if(q)return q.am;
 if(book===DEFAULT_BOOK)return american(r.czOdds)??american(r.cz);
 if(bookKey(r.bsBook)===book&&validAm(r.bs))return r.bs;
 if(bookKey(r.book)===book)return american(r.odds);
 return null;
}
export function priceMlbRow(r:PickRow,book:string,index:QuoteIndex={}):PickRow{
 if(book===DEFAULT_BOOK)return r;const am=knownPrice(r,book,index);const p=r.prob==null?null:r.prob/100;const v=valueAt(p,am);
 const opp=r.opp as {lkey?:string;sub?:string;prob?:number;cz?:unknown;label?:string}|undefined;
 const oppAm=opp?.lkey?index[`${r.gkey}|${opp.lkey}|o`]?.[book]?.am??null:null;
 return {...r,displayBook:book,...(opp?{opp:{...opp,cz:oppAm}}:{}),odds:am??undefined,book:bookName(book),ev:v.ev,edge:v.edge,czOdds:am,czEv:v.ev,czEdge:v.edge,cz:am as PickRow['cz'],czBadge:am!=null&&v.ev!=null&&v.ev>0,czKellyF:null,
 // The named sportsbook overrides the legacy DK/FD basis toggle on display surfaces.
 bs:am,bsOdds:am==null?null:String(am),bsBook:bookName(book),bsEv:v.ev,bsKellyF:null,bsBadge:am!=null&&v.ev!=null&&v.ev>0};
}
export function priceMlbProp(r:PropBoardRow,book:string):PropBoardRow{
 if(book===DEFAULT_BOOK)return {...r,displayBook:book,o:r.cz?.o??null,u:r.cz?.u??null,oBook:r.cz?.o!=null?'Caesars':null,uBook:r.cz?.u!=null?'Caesars':null};
 const qs=r.bookQuotes;
 const pick=(side:'o'|'u')=>qs?.[side]?.[book]?.am??(bookKey(side==='o'?r.oBook:r.uBook)===book?(side==='o'?r.o:r.u):null);
 const o=pick('o'),u=pick('u');
 return {...r,displayBook:book,cz:o==null&&u==null?null:{o,u},o,u,oBook:o==null?null:bookName(book),uBook:u==null?null:bookName(book)};
}
type SimMarket=import("@/components/mlb/SimDesk").SimMarketRow & {bookTotals?:Record<string,{pt:number;o:number;u:number}>};
const percentFraction=(v:number|null)=>v==null?null:v/100;
export function priceMlbBoard(data:BoardData,book:string):BoardData{
 if(book===DEFAULT_BOOK)return {...data,propBoard:data.propBoard?.map(g=>({...g,markets:Object.fromEntries(Object.entries(g.markets).map(([k,rs])=>[k,rs.map(r=>priceMlbProp(r,book))]))}))};const index=(data.bookQuotes??{}) as QuoteIndex;
 const cats=(cs:Record<string,PickRow[]>|undefined)=>Object.fromEntries(Object.entries(cs??{}).map(([k,rs])=>[k,rs.map(r=>priceMlbRow(r,book,index)).sort((a,b)=>(b.czEv??-Infinity)-(a.czEv??-Infinity))]));
 const rows=Object.values(data.categories).flat();
 const ticket=(t:Ticket):Ticket=>{const legs=t.legs.map(l=>{const r=rows.find(r=>r.gkey===l.gkey&&r.lkey===l.lkey&&under(r.sub)===under(l.prop));const am=r?knownPrice(r,book,index):index[`${l.gkey}|${l.lkey}|${under(l.prop)?'u':'o'}`]?.[book]?.am??null;return {...l,cz:am,bs:am,bsBook:bookName(book),book:bookName(book)};});const d=legs.length&&legs.every(l=>validAm(l.cz))?legs.reduce((n,l)=>n*decimal(l.cz!),1):null;const ev=d!=null&&t.prob!=null?100*(t.prob/100*d-1):null;return {...t,displayBook:book,legs,czDec:d,czOdds:d==null?null:decToAm(d),czEv:ev,bsDec:d,bsEv:ev,bsOdds:d==null?null:String(decToAm(d))};};
 const simMarkets=(data.simMarkets as SimMarket[]|undefined)?.map(r=>{if(!r.total)return r;const q=r.bookTotals?.[book]??null;const same=q?.pt===r.total.pt;return {...r,total:{...r.total,cz:q,evOver:same&&q?percentFraction(valueAt(r.total.final,q.o).ev):null,evUnder:same&&q?percentFraction(valueAt(1-r.total.final,q.u).ev):null}};});
 return {...data,trap:undefined,passes:[],overview:undefined,...(simMarkets?{simMarkets}:{}),categories:cats(data.categories),categoriesLive:cats(data.categoriesLive),parlays:data.parlays.map(ticket),parlaysMixed:data.parlaysMixed.map(ticket),parlaysLive:data.parlaysLive?.map(ticket),propBoard:data.propBoard?.map(g=>({...g,markets:Object.fromEntries(Object.entries(g.markets).map(([k,rs])=>[k,rs.map(r=>priceMlbProp(r,book))]))}))};
}
