'use client';
import Link from 'next/link';
import {useLeague} from './LeagueContext';
import {PageHeader} from '@/components/ui/PageHeader';
import {Panel} from '@/components/ui/Panel';
import {Pill,FilterPill} from '@/components/ui/Pill';
import {CfbSyncChip} from '@/components/cfb/CfbSyncChip';
import {ProbBar} from '@/components/ui/ProbBar';

export function FootballModelExplorer() {
 const L=useLeague(); const {date,pick,rail,q,slate}=L.useDesk();
 const games=slate?.games.filter(g=>g.status==='upcoming')??[];
 return <>
  <PageHeader title="Simulator" eyebrow={L.label} sub={`${L.short} pregame model explorer · consensus lines + ESPN ratings. Football uses a margin model; the baseball Monte Carlo simulator is separate.`} action={<Pill variant="primary" onClick={()=>void q.refetch()} disabled={q.isFetching}>{q.isFetching?'Refreshing…':`Refresh ${L.short} model`}</Pill>} />
  <div className="mb-4 flex flex-wrap gap-2">{rail.map(d=><FilterPill key={d} selected={d===date} onClick={()=>pick(d)}>{d}</FilterPill>)}</div>
  {q.isError&&<Panel>Could not load the {L.short} model. Please retry.</Panel>}
  {!q.isError&&!games.length&&<Panel>{q.isPending?'Loading games…':`No upcoming ${L.short} games on this date. Started games are excluded from this pregame model.`}</Panel>}
  <div className="grid gap-4 md:grid-cols-2">{games.map(g=><Panel key={g.id} title={`${g.away.abbr} @ ${g.home.abbr}`}>
   <p className="mb-3 text-sm">{g.away.name} at {g.home.name}</p>
   <p className="text-xs text-muted">{g.home.short} win probability</p>
   <div className="my-2 text-2xl font-bold">{g.model.pHome==null?'—':`${(g.model.pHome*100).toFixed(1)}%`}</div>
   {g.model.pHome!=null&&<ProbBar p={g.model.pHome}/>}
   <div className="mt-4 flex gap-5 text-xs"><span>Home margin <strong>{g.model.muMargin?.toFixed(1)??'—'}</strong></span><span>Total points <strong>{g.model.muTotal?.toFixed(1)??'—'}</strong></span></div>
   <p className="mt-3 text-xs text-muted">Pregame estimates, not a live score forecast.</p>
  </Panel>)}</div>
 </>;
}
export function FootballDashboard() {
 const L=useLeague(); const {entries,stats,bankroll}=L.store.useLedger(); const s=stats.core;
 return <>
  <PageHeader title="Your paper season" eyebrow={`${L.short} desk · season to date`} sub={`${L.short} core and fun records stay separate.`}/>
  <CfbSyncChip />
  <div className="mt-4 grid gap-4 sm:grid-cols-3">
   <Panel title="Paper bankroll"><strong className="text-3xl">${bankroll.toFixed(2)}</strong></Panel>
   <Panel title="Core P/L"><strong className="text-3xl">${s.pl.toFixed(2)}</strong><p className="mt-2 text-xs text-muted">{s.w} wins · {s.l} losses · {entries.length} recorded dates</p></Panel>
   <Panel title="Core budget"><strong className="text-3xl">${L.paper.daily}</strong><p className="mt-2 text-xs text-muted">${L.paper.fun} separate fun budget</p></Panel>
  </div>
  <div className="my-5 flex flex-wrap gap-3">{[['/board','Open board'],['/builder','Core card'],['/props','Parlay generator'],['/ledger','Results']].map(([href,label])=><Link replace key={href} href={href} className="rounded-xl border border-line-2 px-4 py-3 text-sm font-semibold">{label}</Link>)}</div>
 </>;
}
