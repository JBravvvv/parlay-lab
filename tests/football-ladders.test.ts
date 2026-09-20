import {describe,it,expect} from 'vitest';
import {parseEventProps,propLabel} from '@/lib/cfb/props';
import {priceFootballProp} from '@/lib/sportsbook/football';
import {CFB_PROP_MARKETS} from '@/lib/cfb/props-types';
import type {CfbGame} from '@/lib/cfb/types';
import {generate,poolOf,type GenSpec,type GenLeg} from '@/lib/parlay-gen';
// Deliberately synthetic prices; never production market evidence.
const game={id:'g',start:'2099-01-01T20:00:00Z',status:'upcoming',home:{id:'1',name:'Home',abbr:'H',short:'Home'},away:{id:'2',name:'Away',abbr:'A',short:'Away'}} as CfbGame;
const books=['draftkings','williamhill_us','fanduel'];
const payload=(market:string,points:number[],prices=[120,150,180],under=false)=>({id:'e',bookmakers:books.map((book,i)=>({key:book,title:book,markets:[{key:market,outcomes:points.flatMap(point=>[{name:'Over',description:'Test Player',point,price:prices[i]+Math.round(point*10)},...(under?[{name:'Under',description:'Test Player',point,price:-180}]:[])])}]}))});
const parse=(p:unknown)=>parseEventProps(p,game,{now:0,bankroll:2500});
describe('football alternate contracts and sportsbook grading',()=>{
 it('keeps 6+ through 10+ receptions as five separately priced contracts',()=>{
  const rows=parse(payload('player_receptions_alternate',[5.5,6.5,7.5,8.5,9.5]));
  expect(rows).toHaveLength(5);expect(new Set(rows.map(r=>r.key)).size).toBe(5);
  expect(rows.map(r=>r.label)).toEqual([6,7,8,9,10].map(n=>`Test Player ${n}+ Receptions`));
  for(const row of rows){expect(Object.keys(row.quotes!)).toEqual(books);expect(row.fair).not.toBeNull();expect(row.assumedHold).toBe(true);expect(row.grade).not.toBeNull();}
  expect(rows[0].fair!).toBeGreaterThan(rows[4].fair!);
 });
 it('preserves 2+,3+,4+ pass TD contracts alongside ordinary O/U',()=>{
  expect(parse(payload('player_pass_tds_alternate',[1.5,2.5,3.5])).map(r=>r.label)).toEqual([2,3,4].map(n=>`Test Player ${n}+ Pass TDs`));
  const rows=parse(payload('player_pass_tds',[1.5],[120,150,180],true));
  expect(rows.map(r=>r.side)).toEqual(['over','under']);expect(rows.every(r=>r.assumedHold===false)).toBe(true);
 });
 it('never conflates a literal whole-number Over with an explicit X+ outcome',()=>{
  expect(parse(payload('player_receptions_alternate',[6]))[0].line).toBe(6);
  const p=payload('player_receptions_alternate',[6]);p.bookmakers.forEach(b=>{b.markets[0].outcomes[0].name='6+';});
  expect(parse(p)[0].line).toBe(5.5);expect(parse(p)[0].label).toBe('Test Player 6+ Receptions');
 });
 it('offers actual First TD and 2+ TD quotes without inventing them from Anytime TD',()=>{
  const p=payload('player_1st_td',[0]);p.bookmakers.forEach(b=>{b.markets[0].outcomes[0].name='Yes';});
  const first=parse(p)[0];expect(first.market).toBe('first_td');expect(first.line).toBeNull();expect(first.label).toBe('Test Player First TD');
  expect(parse(payload('player_tds_over',[.5,1.5,2.5])).map(r=>r.label)).toEqual(['Test Player 2+ TDs','Test Player 3+ TDs']);
  expect(parse(payload('player_anytime_td',[0])).some(r=>r.market==='first_td'||r.market==='tds_over')).toBe(false);
 });
 it('recomputes every book grade/EV/Kelly from one refreshed snapshot and supports round trips',()=>{
  const row=parse(payload('player_receptions_alternate',[5.5]))[0];const before=JSON.stringify(row);
  let current=row;
  for(const book of [...books,...books]){
   current=priceFootballProp(current,book);const q=row.quotes![book];
   expect(current.cz?.price).toBe(q.price);expect(current.fair).toBe(row.probabilities![book]);
   expect(current.evCz).toBeCloseTo(100*(current.fair!*q.dec-1));expect(current.kelly).not.toBeNull();
  }
  expect(JSON.stringify(row)).toBe(before);
  expect(new Set(books.map(b=>priceFootballProp(row,b).evCz)).size).toBe(3);
 });
 it('keeps unavailable books and insufficient consensus ungraded',()=>{
  const p=payload('player_receptions_alternate',[5.5]);p.bookmakers=p.bookmakers.slice(0,1);
  const row=parse(p)[0];expect(row.fair).toBeNull();expect(row.grade).toBeNull();expect(priceFootballProp(row,'fanduel').cz).toBeNull();
 });
 it('uses the chosen book probability even when the default book differs from the median line',()=>{
  const p=payload('player_receptions',[5.5],[120,150,180],true);
  p.bookmakers[0].markets[0].outcomes.forEach(o=>o.point=6.5);
  const raw=parse(p)[0];expect(raw.line).toBe(5.5);
  const dk=priceFootballProp(raw,'draftkings');expect(dk.line).toBe(6.5);expect(dk.fair).toBeNull();expect(dk.grade).toBeNull();
  expect(priceFootballProp(dk,'fanduel').fair).not.toBeNull();
 });
 it('renames only the O/U filter while the ladder has its own filter',()=>{
  expect(CFB_PROP_MARKETS.find(m=>m.id==='receptions')?.label).toBe('Receptions O/U');
  expect(propLabel('Test','receptions_alt','over',5.5)).toBe('Test 6+ Receptions');
 });
});
const leg=(id:string,gameKey:string):GenLeg<{}>=>({id,gameKey,playerKey:id,label:id,sub:'First TD',market:'first_td',line:null,am:300,dec:4,prob:25,src:'market',side:'o',leg:{},team:id,started:false,alt:false,book:'DK',ev:0});
const spec:GenSpec={market:'first_td',legs:2,legMinAm:-1000,legMaxAm:1000,payout:null,sides:'o',onePerGame:false,onePerTeam:false,czOnly:false,includeStarted:false,modelOnly:false,pinned:[null,null]};
it('rejects mutually exclusive first scorers even when same-game picks are allowed',()=>{
 const pool=poolOf([leg('a','g'),leg('b','g'),leg('c','h')],{rows:3,startedDropped:0,noParlayDropped:0,finishedDropped:0});
 for(let seed=0;seed<30;seed++){const result=generate(pool,spec,seed);expect(result.ok).toBe(true);if(result.ok)expect(new Set(result.ticket.legs.map(l=>l.gameKey)).size).toBe(2);}
 expect(generate(pool,{...spec,pinned:['a','b']},1)).toMatchObject({ok:false,fail:{code:'pin-conflict'}});
});
