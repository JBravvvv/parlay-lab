import React from 'react';
import {it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import fs from 'node:fs';
vi.stubGlobal("React", React);
const state=vi.hoisted(()=>({sport:'nfl'}));
vi.mock('@/lib/sport',async orig=>({...await orig<typeof import('@/lib/sport')>(),useSport:()=>state.sport}));
vi.mock('@/lib/useBoard',()=>({useBoard:()=>{throw Error('MLB board mounted on football')},useRegenerateBoard:()=>{throw Error('MLB generator mounted on football')}}));
vi.mock('@/components/football/FootballModelExplorer',()=>({FootballModelExplorer:()=> <div>Football model explorer</div>,FootballDashboard:()=> <div>Football dashboard</div>}));
vi.mock('@/components/cfb/CfbSeason',()=>({CfbSeason:()=>{throw Error('CFB season mounted on another sport')}}));
import SimulatorPage from '@/../app/simulator/page';
import SeasonPage from '@/../app/season/page';
it('NFL and CFB Simulator never mount the baseball hooks',()=>{
 for(const sport of ['nfl','cfb']) {state.sport=sport;expect(renderToStaticMarkup(<SimulatorPage/>)).toContain('Football model explorer');}
});
it('Season Lab does not show college projections under NFL or MLB',()=>{
 for(const sport of ['nfl','mlb']) {state.sport=sport;const html=renderToStaticMarkup(<SeasonPage/>);expect(html).toContain('Explore college football');expect(html).toContain('not available here');}
});
it('the MLB query and manual generator both refuse a football sport',()=>{
 const s=fs.readFileSync('src/lib/useBoard.ts','utf8');
 expect(s).toContain('enabled: mounted && sport === "mlb"');
 expect(s.match(/getSport\(\) !== "mlb"/g)).toHaveLength(2);
});
it('NFL price typography uses bright neutral text without changing the blue accent token',()=>{
 const css=fs.readFileSync('app/globals.css','utf8');
 expect(css).toContain('--color-nfl: #4f8cff');
 expect(css).toMatch(/\.text-nfl, \.hero-price\.is-nfl, \.odds-grid\.is-nfl \.odds-cell-price \{ color: #edf4ff;/);
});
