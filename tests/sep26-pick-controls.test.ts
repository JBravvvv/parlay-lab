import {describe,it,expect} from "vitest";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {chooseFunRows} from "@/lib/football/fun-parlay";
import {defaultMarkets,scopedMarkets,marketsAfterSportChange,FOOTBALL_DEFAULT_MARKETS} from "@/lib/market-scope";
import {DataTable} from "@/components/ui/DataTable";
import {discoveryMatches,STRATEGIES} from "@/lib/discovery";
(globalThis as {React?:typeof React}).React=React;
const band={legs:{min:3,max:5},minDec:4,maxDec:40};
describe('September 26 pick policy',()=>{
 it('does not issue an extreme-favorite fun ticket below +300',()=>{
  const choices=Array.from({length:5},(_,i)=>({row:{gameId:String(i)},dec:1.01,prob:.995}));
  expect(chooseFunRows(choices,band)).toEqual([]);
 });
 it('finds a qualifying ticket using other sides and never repeats a game',()=>{
  const choices=Array.from({length:8},(_,i)=>[{row:{gameId:String(i),kind:'ml'},dec:1.01,prob:.995},{row:{gameId:String(i),kind:'spread'},dec:1.91,prob:.54}]).flat();
  const rows=chooseFunRows(choices,band); const dec=rows.reduce((p,r)=>p*(r.kind==='ml'?1.01:1.91),1);
  expect(rows.length).toBeGreaterThanOrEqual(3);expect(rows.length).toBeLessThanOrEqual(5);expect(new Set(rows.map(r=>r.gameId)).size).toBe(rows.length);expect(dec).toBeGreaterThanOrEqual(4);expect(dec).toBeLessThanOrEqual(40);expect(rows.some(r=>r.kind==='spread')).toBe(true);
 });
 const markets=[...FOOTBALL_DEFAULT_MARKETS,'receptions','receptions_alt','tds_over','first_td','batter_home_runs','pitcher_strikeouts','rl'].map(key=>({key}));
 it('defaults to the requested 11 football markets and scopes mixed sport menus',()=>{
  expect(defaultMarkets(markets,['cfb'])).toEqual([...FOOTBALL_DEFAULT_MARKETS]);
  expect(scopedMarkets(markets,['nfl','cfb']).some(m=>m.key.startsWith('batter_'))).toBe(false);
  expect(scopedMarkets(markets,['nfl','mlb']).some(m=>m.key==='batter_home_runs')).toBe(true);
  expect(scopedMarkets(markets,['nfl']).some(m=>m.key==='tds_over')).toBe(true);
  const selected=marketsAfterSportChange(['anytime_td'],['nfl'],['nfl','mlb'],markets);
  expect(selected).toContain('batter_home_runs');expect(selected).not.toContain('tds_over');
  expect(marketsAfterSportChange(selected,['nfl','mlb'],['nfl'],markets)).toEqual(['anytime_td','ml','total']);
 });
 it('applies odds bounds to discovery without changing prices or probability',()=>{
  const f={timing:['pregame'],markets:['anytime_td'],sports:['cfb'],strategies:STRATEGIES.map(s=>s.key),timeWindow:[0,24] as const,odds:{min:100,max:300}};
  const row={market:'anytime_td',am:250,prob:30,ev:5,sport:'cfb'};
  expect(discoveryMatches(row,f)).toBe(true);expect(discoveryMatches({...row,am:400},f)).toBe(false);
 });
 it('sorts the entire table before rendering the first ten',()=>{
  const html=renderToStaticMarkup(React.createElement(DataTable<{id:string;score:number}>,{columns:[{key:'score',header:'Score',sortValue:r=>r.score,cell:r=>r.id}],rows:Array.from({length:25},(_,i)=>({id:`pick-${i}`,score:i})),rowKey:r=>r.id,pageSize:10,defaultSort:{key:'score',dir:-1}}));
  expect((html.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0].match(/<tr/g)??[]).length).toBe(10);expect(html).toContain('pick-24');expect(html).not.toContain('>pick-0<');expect(html).toContain('Load 10 More');
 });
});
