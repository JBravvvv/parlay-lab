import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { buildCfbBoard } from '@/lib/cfb/model';
import { buildCfbCard } from '@/lib/cfb/card';
import { assertCardMoney } from '@/lib/cfb/lock-server';
import { NFL_LEAGUE, NFL_RULES } from '@/lib/nfl/rules';
import { CFB_RULES } from '@/lib/cfb/rules';
import { isSundayPaper } from '@/lib/football/sunday-paper';
const read=(n:string)=>JSON.parse(fs.readFileSync(`tests/fixtures/nfl/${n}.json`,'utf8'));
const now=Date.parse('2026-09-13T16:00:00Z');
const board=buildCfbBoard({date:'2026-09-13',espnEvents:read('espn-scoreboard-2026-09-13').events,oddsEvents:read('odds-2026-09-13'),fpi:read('espn-fpi'),now,bankroll:2500,league:NFL_LEAGUE});
const rules={...NFL_RULES,sundayPaperSince:'2026-09-13'};
const cfg={...NFL_LEAGUE,rules};
const build=(b=board)=>buildCfbCard(b,{now,bankroll:2500,daily:350,fun:25,rules,idPrefix:'nfl'});
describe('Sunday full paper allocation',()=>{
 it('deploys exactly $350 even when no side clears the edge gate, across ten distinct games',()=>{
  const c=build(); expect(c.coreSum).toBe(350);expect(c.core).toHaveLength(10);expect(c.noPlay).toBe(false);
  expect(new Set(c.core.flatMap(t=>t.legs.map(l=>l.gkey))).size).toBe(10);
  expect(c.core.every(t=>t.stake===35&&t.forced===true&&t.paperPolicy==='sunday-full-v1'&&t.clearsEdgeGate===false)).toBe(true);
  expect(()=>assertCardMoney(cfg,c)).not.toThrow();expect(build()).toEqual(c);
 });
 it('equal-weights a thin slate and discloses concentration',()=>{
  const c=build({...board,games:board.games.slice(0,2)});expect(c.coreSum).toBe(350);expect(c.core.map(t=>t.stake)).toEqual([175,175]);
  expect(c.notes.join(' ')).toMatch(/Thin slate/);expect(()=>assertCardMoney(cfg,c)).not.toThrow();
 });
 it('never creates odds or buys games already started',()=>{
  expect(build({...board,games:[]}).coreSum).toBe(0);
  expect(build({...board,games:board.games.map(g=>({...g,start:new Date(now).toISOString()}))}).coreSum).toBe(0);
  expect(build({...board,games:board.games.map(g=>({...g,rows:g.rows.map(r=>({...r,cz:null}))}))}).coreSum).toBe(0);
 });
 it('activates only on future NFL Sundays; historical live cards and other sports keep their policy',()=>{
  expect(isSundayPaper(NFL_RULES,'2026-09-13')).toBe(false);
  expect(isSundayPaper(NFL_RULES,'2026-09-20')).toBe(true);
  expect(isSundayPaper(NFL_RULES,'2026-09-21')).toBe(false);
  expect(isSundayPaper(CFB_RULES,'2026-09-20')).toBe(false);
 });
 it('does not hide negative EV and refuses an unmarked oversize stake',()=>{
  const c=build({...board,games:board.games.slice(0,1)});expect(c.core[0].czEv).toBeLessThan(2);
  delete c.core[0].paperPolicy;expect(()=>assertCardMoney(cfg,c)).toThrow(/MONEY GUARD/);
 });
});

it('Sunday lock has Vercel backup pokes for daylight and standard-time kickoff windows',()=>{
 const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
 expect(config.crons).toEqual(expect.arrayContaining([expect.objectContaining({path:'/api/nfl/lock?poke=sunday-early',schedule:'0 16 * * 0'}),expect.objectContaining({path:'/api/nfl/lock?poke=sunday-standard',schedule:'0 17 * * 0'})]));
});
