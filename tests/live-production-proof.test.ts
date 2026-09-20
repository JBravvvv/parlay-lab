import {it,expect} from 'vitest';
import fs from 'node:fs';
import {footballGenPool} from '@/lib/football/gen-pool';
import {priceFootballProp} from '@/lib/sportsbook/football';
import {propQuote,propLegOf} from '@/components/cfb/CfbProps';
import {generate,type GenSpec} from '@/lib/parlay-gen';
it('current live NFL DK Anytime TD produces four legs',()=>{
 const board=JSON.parse(fs.readFileSync('tests/fixtures/nfl-live-2026-09-20.json','utf8'));
 const spec:GenSpec={market:'anytime_td',markets:['anytime_td'],legs:4,legMinAm:-215,legMaxAm:5000,payout:null,sides:'o',onePerGame:true,czOnly:false,includeStarted:true,modelOnly:false,pinned:[null,null,null,null],phase:'live',betType:'model'};
 const rows=board.rows.map((r:any)=>priceFootballProp(r,'draftkings'));
 const opts={mode:'cz' as const,nowMs:Date.parse(board.generatedAt)+1000,pricedAt:board.pricedAt,teamOf:(r:any)=>r.teamAbbr,quoteOf:propQuote,legOf:propLegOf};
 const fresh=footballGenPool(rows,spec,opts);
 const stale=footballGenPool(rows,spec,{...opts,nowMs:opts.nowMs+700000});
 expect(stale.legs).toHaveLength(0);expect(fresh.legs.length).toBeGreaterThan(4);
 const result=generate(fresh,spec,42);
 expect(result.ok).toBe(true);if(result.ok){expect(result.ticket.legs).toHaveLength(4);expect(result.ticket.legs.every(r=>r.started&&r.book==='DK')).toBe(true);console.log('LIVE PROOF',JSON.stringify({pool:fresh.legs.length,players:result.ticket.legs.map(r=>r.label)}));}
});
