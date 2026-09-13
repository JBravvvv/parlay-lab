import {it,expect,vi} from 'vitest';
import {FROZEN_NOW,armedFixtureEngine} from './helpers/fixture-env';
import {buildLockEntry} from '@/lib/server/lock-card';
import {buildCfbCard} from '@/lib/cfb/card';
import {buildCfbBoard} from '@/lib/cfb/model';
import {CFB_RULES} from '@/lib/cfb/rules';
import {NFL_LEAGUE} from '@/lib/nfl/rules';
import fs from 'node:fs';
it('MLB probability paper action uses two-leg slots and exact allocation, retaining locked tickets',async()=>{
 vi.setSystemTime(FROZEN_NOW);
 const eng=armedFixtureEngine();const data=eng.analyze(await eng.collectSlate()) as unknown as Record<string,unknown>;
 const entry=buildLockEntry({eng:eng as never,data,date:'2026-09-14',now:Date.parse('2026-07-10T03:30:00Z'),trigger:'test'});
 expect(entry.allocSum).toBe(150);
 expect(entry.core).toHaveLength(3);
 expect(entry.paperPolicy).toBe('probability-action-v1');expect(entry.selMode).toBe('probability');
 expect(entry.core.every(t=>t.stake===50&&t.forced===true&&(t.legs as unknown[]).length===2)).toBe(true);
 const carried=buildLockEntry({eng:eng as never,data,date:'2026-09-14',now:Date.parse('2026-07-10T03:30:00Z'),trigger:'test',carry:entry,dailyOverride:0});
 expect(carried.core).toEqual(entry.core);expect(carried.allocSum).toBe(150);
 expect((entry.alt?.core??[]).every(t=>t.paperPolicy!=='probability-action-v1')).toBe(true);
},300000);
it('CFB full core policy fills a negative-edge slate on every slate date from the effective date',()=>{
 const read=(n:string)=>JSON.parse(fs.readFileSync(`tests/fixtures/nfl/${n}.json`,'utf8'));
 const now=Date.parse('2026-09-13T16:00:00Z');
 const board=buildCfbBoard({date:'2026-09-13',espnEvents:read('espn-scoreboard-2026-09-13').events,oddsEvents:read('odds-2026-09-13'),fpi:read('espn-fpi'),now,bankroll:2500,league:NFL_LEAGUE});
 const card=buildCfbCard({...board,date:'2026-09-19'},{now,bankroll:2500,daily:250,fun:25,rules:CFB_RULES});
 expect(card.coreSum).toBe(250);expect(card.core.every(t=>t.paperPolicy==='full-core-v1')).toBe(true);
});
