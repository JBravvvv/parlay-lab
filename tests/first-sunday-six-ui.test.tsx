import React from 'react';
import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {FirstSundaySix} from '@/components/nfl/FirstSundaySix';
import {sixRace} from '@/lib/nfl/first-sunday-six';
import type {CfbGame} from '@/lib/cfb/types';
import type {CfbPropsBoard} from '@/lib/cfb/props-types';
import fixture from './fixtures/first-sunday-six-oct4.json';
vi.stubGlobal('React',React);
vi.mock('@/components/cfb/TeamMark',()=>({PlayerMark:()=>null}));
const games=fixture.games as unknown as CfbGame[];
const board=fixture.board as unknown as CfbPropsBoard;
const now=Date.parse(fixture.capturedAt);
describe('First Sunday Six weekly suggestions',()=>{
 it('ranks the Oct 4 early slate with zero promotion prices',()=>{
  const race=sixRace(games,board,fixture.date,[],now);
  expect(race.early).toHaveLength(8);
  expect(race.results.filter(r=>r.p!=null)).toHaveLength(229);
  expect(race.results.some(r=>r.player==='No Touchdown')).toBe(false);
  expect(race.estimatedMass).toBeLessThan(1);
  expect(race.results.every(r=>r.odds===null&&r.grade===null)).toBe(true);
 });
 it('renders the weekly shortlist and player table without the Sep 20 snapshot',()=>{
  const html=renderToStaticMarkup(<FirstSundaySix date={fixture.date} games={games} board={board} now={now}/>);
  expect(html).toContain('Weekly token suggestions');
  expect(html).toContain('This week’s token shortlist');
  expect(html).toContain('Promo price not loaded');
  expect(html).not.toContain('No matching entries');
  const top=sixRace(games,board,fixture.date,[],now).results.sort((a,b)=>(b.p??0)-(a.p??0)).slice(0,3);
  for(const r of top)expect(html).toContain(r.player.replaceAll("'",'&#x27;'));
 });
 it('closes suggestions at the first eligible kickoff, not the London game',()=>{
  const open=renderToStaticMarkup(<FirstSundaySix date={fixture.date} games={games} board={board} now={now}/>);
  expect(open).toContain('Weekly token suggestions');
  const closed=renderToStaticMarkup(<FirstSundaySix date={fixture.date} games={games} board={board} now={Date.parse('2026-10-04T17:00:00Z')}/>);
  expect(closed).not.toContain('Weekly token suggestions');
  expect(closed).toContain('Early slate has started');
 });
});
