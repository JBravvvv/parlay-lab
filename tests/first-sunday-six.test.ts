import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {earlySunday,historicalRace,parseSixPrices,sixRace,sixScenario,touchdownElapsed,sixKey} from '@/lib/nfl/first-sunday-six';
import history from '@/lib/nfl/first-sunday-six-history.json';
import prices from '@/lib/nfl/first-sunday-six-prices.json';
import type {CfbGame} from '@/lib/cfb/types';
import type {CfbPropsBoard} from '@/lib/cfb/props-types';
const date='2026-09-20',now=Date.parse(date+'T09:00:00Z');
const game=(id:string,start=date+'T17:00:00Z')=>({id,date,start,status:'upcoming',model:{muTotal:45}} as CfbGame);
const board={date,pricedAt:{a:date+'T08:00:00Z',b:date+'T08:00:00Z'},rows:[{gameId:'a',player:'Alpha',market:'first_td',fair:.2},{gameId:'b',player:'Beta',market:'first_td',fair:.1}]} as unknown as CfbPropsBoard;
describe('First Sunday Six',()=>{
 it('ranks game time rather than real timestamps',()=>{expect(touchdownElapsed(1,'09:51')).toBeLessThan(touchdownElapsed(1,'09:08')!);expect(touchdownElapsed(2,'15:00')).toBe(900);expect(touchdownElapsed(1,'15:01')).toBeNull();});
 it('includes only Sunday early slate',()=>{expect(earlySunday(game('a'),date)).toBe(true);expect(earlySunday(game('a',date+'T20:05:00Z'),date)).toBe(false);});
 it('keeps full field and rejects duplicate or invalid imports',()=>{expect(prices.rows).toHaveLength(267);expect(new Set(prices.rows.map(r=>sixKey(r.player))).size).toBe(267);expect(parseSixPrices('Alpha|+2200\nAlpha|+3000').errors).toHaveLength(1);expect(parseSixPrices('Alpha|0').errors).toHaveLength(1);});
 it('conserves probability while withholding ties/no-TD',()=>{const p=historicalRace([40,45,55]);expect(p[0]).toBeCloseTo(p[1],12);expect(p.reduce((a,b)=>a+b,0)).toBeLessThan(1);expect(p.every(x=>x>0)).toBe(true);expect(historicalRace([])).toEqual([]);expect(historicalRace([NaN])).toEqual(historicalRace([45]));});
 it('does not redistribute omitted players or games',()=>{const all=sixRace([game('a'),game('b')],board,date,[{player:'Alpha',odds:2200},{player:'Beta',odds:3000}],now);const partial=sixRace([game('a'),game('b')],board,date,[{player:'Alpha',odds:2200}],now);expect(partial.results[0].p).toBe(all.results[0].p);expect(all.estimatedMass).toBeLessThan(.16);});
 it('withholds stale, started, historical and unmatched estimates',()=>{for(const [games,b,d,n] of [[[game('a')],board,date,now+4*3600000],[[game('a')],board,date,Date.parse(date+'T17:00:00Z')],[[game('a')],{...board,date:'2026-09-13'},'2026-09-13',now]] as const){expect(sixRace(games,b as CfbPropsBoard,d,[{player:'Alpha',odds:2200}],n).results[0].p).toBeNull();}expect(sixRace([game('a')],board,date,[{player:'Unknown',odds:2200}],now).results[0].p).toBeNull();});
 it('separates bonus assumptions from cash EV',()=>{const s=sixScenario(.02,2200,100,.5)!;expect(s.cashEv).toBeCloseTo(-5.4);expect(s.bonusFace).toBe(5000);expect(s.bonusEv).toBe(50);expect(sixScenario(.02,2200,0,.5)).toBeNull();expect(sixScenario(.02,2200,1,2)).toBeNull();});
 it('builds weekly suggestions without requiring promotion prices',()=>{
  const race=sixRace([game('a'),game('b')],board,date,[],now);
  expect(race.results.map(r=>r.player)).toEqual(['Alpha','Beta']);
  expect(race.results.every(r=>r.p!=null&&r.p>0)).toBe(true);
  expect(race.results.every(r=>r.odds===null&&r.ev===null&&r.grade===null&&r.implied===null)).toBe(true);
 });
 it('keeps unpriced candidates when a partial promotion list is imported',()=>{
  const race=sixRace([game('a'),game('b')],board,date,[{player:'Alpha',odds:2200}],now);
  expect(race.results).toHaveLength(2);
  expect(race.results[0].ev).not.toBeNull();
  expect(race.results[1].odds).toBeNull();
  expect(race.results[1].p).toBeGreaterThan(0);
 });
 it('does not use a previous week, late game, or ordinary First TD quote as a promo price',()=>{
  const b={...board,rows:board.rows.map(r=>({...r,cz:{price:500}}))} as CfbPropsBoard;
  expect(sixRace([game('a'),game('b',date+'T20:05:00Z')],b,date,[],now).results.map(r=>[r.player,r.odds])).toEqual([['Alpha',null]]);
  expect(sixRace([game('a')],{...board,date:'2026-09-13'},date,[],now).results).toHaveLength(0);
 });
 it('withholds suggestions after kickoff and stale prices even without imported prices',()=>{
  for(const n of [now+4*3600000,Date.parse(date+'T17:00:00Z')]){
   expect(sixRace([game('a')],board,date,[],n).results[0].p).toBeNull();
  }
 });
 it('can explore bonus assumptions without inventing a cash-ticket price',()=>{
  const s=sixScenario(.02,null,100,.5)!;
  expect(s.cashEv).toBeNull();expect(s.totalEv).toBeNull();expect(s.bonusFace).toBe(5000);expect(s.bonusEv).toBe(50);
 });
 it('does not require unused game totals for the pooled-clock model',()=>{
  const without={...game('a'),model:null} as unknown as CfbGame;
  expect(sixRace([without],board,date,[],now).results[0].p).toBe(sixRace([game('a')],board,date,[],now).results[0].p);
  const previous=history.clockModel.selected;
  try{history.clockModel.selected='totalBands';expect(sixRace([without],board,date,[],now).results[0].p).toBeNull();expect(historicalRace([NaN])).toEqual([0]);}finally{history.clockModel.selected=previous;}
 });
 it('reports missing and stale game coverage without redistributing their chances',()=>{
  const full=sixRace([game('a'),game('b')],board,date,[],now);
  for(const partial of [{...board,rows:board.rows.filter(r=>r.gameId==='a')},{...board,pricedAt:{...board.pricedAt,b:date+'T01:00:00Z'}}]){
   const race=sixRace([game('a'),game('b')],partial,date,[],now);
   expect(race.coveredGames).toBe(1);expect(race.early).toHaveLength(2);expect(race.results[0].p).toBe(full.results[0].p);
  }
 });
 it('audits all available seasons and rejects an inferior clock candidate',()=>{expect(history.coverage.map(r=>r.season)).toEqual(Array.from({length:11},(_,i)=>2016+i));for(const r of history.coverage){expect(r.completedGames).toBe(r.pbpGames);expect(r.firstTDs+r.noTD).toBe(r.completedGames);expect(r.unknownClock+r.unknownScorer).toBe(0);}expect(history.clockModel.selected).toBe('uniform');expect(history.clockModel.holdout.totalBands.logLoss).toBeGreaterThan(history.clockModel.holdout.uniform.logLoss);});
 it('exports every completed game and preserves touchdown-end clock',()=>{const csv=readFileSync('public/data/first-sunday-six/first-td-games.csv','utf8').trim().split('\n');expect(csv.length-1).toBe(history.games);const row=csv.find(r=>r.startsWith('2026_01_ARI_LAC,'))!;expect(row).toContain('08:49');expect(row).toContain('08:54');expect(csv.find(r=>r.startsWith('2017_04_SF_ARI,'))).toContain('4168');});
});
