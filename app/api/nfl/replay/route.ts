import { NextRequest, NextResponse } from 'next/server';
import replay from '@/lib/nfl/week1-replay.json';
import { redis, redisGetJson, storeEnv, syncAuthed } from '@/lib/server/store';
import { NFL_LEAGUE } from '@/lib/nfl/rules';
import { espnEventsOf, finalsFromEspnOf } from '@/lib/cfb/slate-server';
import { gradeCfbEntry } from '@/lib/cfb/grade';
import type { CfbLedgerEntry } from '@/lib/cfb/types';

export const dynamic = 'force-dynamic';
const KEY = 'pl:nfl:replay:2026-09-13:v1';
type Replay = Omit<typeof replay, 'entry'> & { entry: CfbLedgerEntry };
// This isolated paper record never goes through the live ledger or bankroll merge.
export async function GET() {
  if (!storeEnv()) return NextResponse.json({error:'store unavailable'}, {status:503});
  try {
    const saved = await redisGetJson<Replay>(KEY);
    if (!saved) return NextResponse.json({entry:null});
    let gradingError = false;
    try {
      const now = Date.now();
      const espn = await espnEventsOf(NFL_LEAGUE, saved.entry.date);
      const {finals} = finalsFromEspnOf(NFL_LEAGUE, saved.entry.date, espn, now, 2500);
      saved.entry.grading = gradeCfbEntry(saved.entry, finals, now, NFL_LEAGUE);
    } catch { gradingError = true; }
    return NextResponse.json({...saved, gradingError}, {headers:{'cache-control':'no-store'}});
  } catch { return NextResponse.json({error:'replay unavailable'}, {status:503}); }
}
export async function POST(req: NextRequest) {
  if (!syncAuthed(req)) return NextResponse.json({error:'unauthorized'}, {status:401});
  if (!storeEnv()) return NextResponse.json({error:'store unavailable'}, {status:503});
  try {
    // Fixed reviewed artifact only, no caller-supplied tickets or backdated lock time.
    const fixed = {...replay, entry:{...replay.entry, lockedAt:Date.now()}};
    const written = await redis(['SET', KEY, JSON.stringify(fixed), 'NX']);
    return NextResponse.json({status:written ? 'locked' : 'already-locked', date:replay.entry.date, core:350});
  } catch { return NextResponse.json({error:'replay write failed'}, {status:503}); }
}
