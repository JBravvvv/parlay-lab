'use client';
import {useEffect, useState} from 'react';
import {CfbTicketCard, cfbGradingOf, cfbTicketsOf} from '@/components/cfb/CfbTicketCard';
import type {CfbLedgerEntry} from '@/lib/cfb/types';

type Replay = {entry:CfbLedgerEntry|null; oddsTimestamp?:string; gradingError?:boolean};
export function NflPaperExperiment({entries}:{entries:CfbLedgerEntry[]}) {
  const [replay,setReplay]=useState<Replay|null>(null);
  const [error,setError]=useState(false);
  useEffect(()=>{
    let active=true;
    const load=()=>fetch('/api/nfl/replay').then(r=>{if(!r.ok) throw Error();return r.json()}).then(j=>{if(active){setReplay(j);setError(false)}}).catch(()=>{if(active)setError(true)});
    void load(); const timer=setInterval(load,60_000);
    return ()=>{active=false;clearInterval(timer)};
  },[]);
  const tickets=entries.flatMap(e=>cfbTicketsOf(e,'core').filter(t=>t.paperPolicy==='sunday-full-v1').map(t=>({t,g:cfbGradingOf(e)?.tickets?.[t.id]})));
  const settled=tickets.filter(({g})=>g?.result==='won'||g?.result==='lost'||g?.result==='push');
  const stake=settled.reduce((s,{t})=>s+t.stake,0);
  const pl=settled.reduce((s,{t,g})=>s+(g?.payout??0)-t.stake,0);
  const resolved=tickets.filter(({g})=>g?.result==='won'||g?.result==='lost');
  const brier=resolved.length ? resolved.reduce((s,{t,g})=>s+(t.prob/100-(g?.result==='won'?1:0))**2,0)/resolved.length : null;
  const e=replay?.entry; const g=e?cfbGradingOf(e):null;
  return <section className="rounded-2xl border border-nfl/40 bg-nfl/5 p-4 space-y-3">
    <h2 className="font-bold text-sm">Sunday paper experiment · $350 core</h2>
    <p className="text-xs text-muted">From September 20: full allocation across up to 10 distinct games, ranked by estimated EV. Negative-EV selections are allowed. Game sides and totals only; player props remain in the sandbox. Thin slates use larger equal stakes.</p>
    <p className="text-xs text-muted">Prospective record: {tickets.length} tickets · {settled.length} settled · ${stake} settled stake · ${pl.toFixed(2)} P/L · Brier {brier===null?'pending':brier.toFixed(3)}. Lower Brier means better probability accuracy. This records evidence; it does not automatically retrain NFL probabilities.</p>
    {error&&<p className="text-xs text-gold">Week 1 replay is temporarily unavailable. Reconnecting automatically.</p>}
    {e&&<details className="rounded-xl border border-line-2 p-3">
      <summary className="cursor-pointer font-bold text-sm">Week 1 replay · $350 core · 10 × $35</summary>
      <p className="my-3 text-xs text-muted">{e.note} Historical quote snapshot: {replay.oddsTimestamp}. Recorded {new Date(e.lockedAt).toLocaleString()}.</p>
      {replay.gradingError&&<p className="text-xs text-gold">Scores unavailable; results are pending.</p>}
      <div className="grid gap-3 md:grid-cols-2">{cfbTicketsOf(e,'core').map(t=><CfbTicketCard key={t.id} t={t} grade={g?.tickets?.[t.id]} tag="Retrospective" />)}</div>
    </details>}
  </section>;
}
