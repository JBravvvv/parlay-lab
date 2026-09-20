import React from 'react';
import {describe,it,expect,vi} from 'vitest';
vi.stubGlobal('React',React);
import {renderToStaticMarkup} from 'react-dom/server';
import {defenseClub,canonicalFootballPlayer} from '@/lib/football/defense';
import {parseEventProps} from '@/lib/cfb/props';
import {matchPlayerImage,type PlayerImage} from '@/lib/player-images';
import {PlayerMark} from '@/components/cfb/TeamMark';
import {CrossMark} from '@/components/props/CrossMark';
import type {CfbGame,CfbTeam} from '@/lib/cfb/types';
const home={id:'1',abbr:'ATL',name:'Atlanta Falcons',short:'Falcons',logo:'https://example.test/atl.png',color:'aa0000',rank:null} as CfbTeam;
const away={...home,id:'2',abbr:'CAR',name:'Carolina Panthers',short:'Panthers',logo:'https://example.test/car.png'};
const game={id:'g',start:'2099-01-01',status:'upcoming',home,away} as CfbGame;
describe('team defenses have one verified club identity',()=>{
 it('recognizes D/ST and Defense suffixes without mistaking player names for teams',()=>{
  for(const s of ['Atlanta Falcons D/ST','Atlanta Falcons Defense','Atlanta Falcons DEF','Atlanta Falcons Defense & Special Teams']){expect(defenseClub(s)).toBe('Atlanta Falcons');expect(canonicalFootballPlayer(s)).toBe('Atlanta Falcons D/ST');}
  expect(defenseClub('Josh Allen')).toBeNull();
 });
 it('merges book aliases into one priced row and attaches the actual matchup team',()=>{
  const rows=parseEventProps({id:'e',bookmakers:[{key:'draftkings',markets:[{key:'player_anytime_td',outcomes:[{name:'Yes',description:'Atlanta Falcons D/ST',price:400}]}]},{key:'fanduel',markets:[{key:'player_anytime_td',outcomes:[{name:'Yes',description:'Atlanta Falcons Defense',price:450}]}]}]},game,{now:0,bankroll:2500});
  expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({player:'Atlanta Falcons D/ST',teamId:'1',teamAbbr:'ATL',pos:'D/ST',headshot:null});expect(rows[0].books).toBe(2);expect(Object.keys(rows[0].quotes!)).toEqual(['draftkings','fanduel']);
 });
 it('resolves old cached defense names from the roster catalog without a fake athlete photo',()=>{
  const catalog=[{id:'10',name:'Test Player',position:'WR',team:{...home,rank:null},srcs:['https://example.test/player.png']}] as PlayerImage[];
  expect(matchPlayerImage(catalog,'Atlanta Falcons Defense')).toMatchObject({position:'D/ST',team:{id:'1'},srcs:[]});
  expect(matchPlayerImage(catalog,'Carolina Panthers D/ST')).toBeNull();
  expect(matchPlayerImage(catalog,'Atlanta Falcons D/ST',null,['2'])).toBeNull();
 });
 it('draws the defense logo alone rather than a player portrait or initials',()=>{
  const html=renderToStaticMarkup(<PlayerMark player="Atlanta Falcons D/ST" headshot={null} team={home}/>);
  expect(html).toContain(home.logo);expect(html).not.toContain('data-player-mark');expect(html).not.toContain('player-portrait');
 });
});
it('mixed-sport player picks retain their supplied photo and top-left team badge',()=>{
 const html=renderToStaticMarkup(<CrossMark leg={{sport:'nfl',id:'1',gameId:'g',label:'Test Player',player:'Test Player',sub:'Anytime TD',game:'CAR @ ATL',cz:100,prob:50,book:'DK',market:'anytime_td',imageTeam:home,headshot:'https://example.test/player.png'}}/>);
 expect(html).toContain('https://example.test/player.png');expect(html).toContain(home.logo);expect(html).toContain('data-team-badge');
});
it('mixed-sport side picks show their team logo and totals show both teams',()=>{
 const leg={sport:'nfl' as const,id:'1',gameId:'g',label:'Atlanta',sub:'ML',game:'CAR @ ATL',cz:100,prob:50,book:'DK',market:'ml'};
 expect(renderToStaticMarkup(<CrossMark leg={{...leg,imageTeam:home}}/>)).toContain(home.logo);
 const html=renderToStaticMarkup(<CrossMark leg={{...leg,market:'total',imagePair:{home,away}}}/>);
 expect(html).toContain(home.logo);expect(html).toContain(away.logo);
});
