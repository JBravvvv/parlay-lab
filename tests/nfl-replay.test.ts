import {beforeEach,describe,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
import replay from '@/lib/nfl/week1-replay.json';
const mock=vi.hoisted(()=>({authed:false,stored:null as unknown,redis:vi.fn(),read:vi.fn()}));
vi.mock('@/lib/server/store',()=>({syncAuthed:()=>mock.authed,storeEnv:()=>({}),redis:mock.redis,redisGetJson:mock.read}));
vi.mock('@/lib/cfb/slate-server',()=>({espnEventsOf:async()=>[],finalsFromEspnOf:()=>({finals:{}})}));
import {GET,POST} from '@/../app/api/nfl/replay/route';
beforeEach(()=>{mock.authed=false;mock.redis.mockReset();mock.read.mockReset().mockResolvedValue(null)});
describe('isolated Week 1 replay',()=>{
 it('is a full, diverse card with actual reconstruction time and pregame provenance',()=>{
  expect(replay.entry.core.reduce((s,t)=>s+t.stake,0)).toBe(350);
  expect(new Set(replay.entry.core.flatMap(t=>t.legs.map(l=>l.gkey))).size).toBe(10);
  expect(replay.entry.lockedAt).toBeGreaterThan(Date.parse(replay.asOf));
  expect(Date.parse(replay.oddsTimestamp)).toBeLessThan(Date.parse(replay.asOf));
  expect(replay.entry.funT).toEqual([]);expect(replay.oddsSha256).toMatch(/^[a-f0-9]{64}$/);
 });
 it('requires owner authorization and never reads or writes the live ledger',async()=>{
  expect((await POST(new NextRequest('https://test/api/nfl/replay',{method:'POST'}))).status).toBe(401);
  expect(mock.redis).not.toHaveBeenCalled();
 });
 it('accepts only the bundled card, writes once with NX, and keeps lock time honest',async()=>{
  mock.authed=true;mock.redis.mockResolvedValue('OK');
  const res=await POST(new NextRequest('https://test/api/nfl/replay',{method:'POST',body:JSON.stringify({core:[{stake:9000}]})}));
  expect((await res.json()).status).toBe('locked');const cmd=mock.redis.mock.calls[0][0];
  expect(cmd[1]).toBe('pl:nfl:replay:2026-09-13:v1');expect(cmd[3]).toBe('NX');
  const saved=JSON.parse(cmd[2]);expect(saved.entry.core).toEqual(replay.entry.core);expect(saved.entry.lockedAt).toBeGreaterThanOrEqual(replay.entry.lockedAt);
  mock.redis.mockResolvedValue(null);expect((await (await POST(new NextRequest('https://test/api/nfl/replay',{method:'POST'}))).json()).status).toBe('already-locked');
 });
 it('GET never writes and reports an absent replay explicitly',async()=>{
  expect(await (await GET()).json()).toEqual({entry:null});expect(mock.redis).not.toHaveBeenCalled();
 });
});
