"use client";
import { useQuery } from "@tanstack/react-query";
import { useLeague } from "@/components/football/LeagueContext";
import { useFootballPropsPrices } from "@/lib/sportsbook/useFootballPrices";
import { CFB_PROP_MARKETS } from "@/lib/cfb/props-types";
import { footballQuoteCurrent } from "@/lib/football/gen-pool";
import { fmtAmerican } from "@/lib/format";
import type { CfbGame } from "@/lib/cfb/types";
export function GameSuggestedPicks({game}:{game:CfbGame}) {
 const L=useLeague();
 const q=useQuery({queryKey:L.client.propsQueryKey(game.date,L.bankBase),queryFn:()=>L.client.loadProps(game.date,{bankroll:L.bankBase}),staleTime:60_000,retry:0});
 const props=useFootballPropsPrices(q.data,L.bankBase,L.rules);
 const rows=(props?.rows??[]).filter(r=>r.gameId===game.id && r.cz && r.fair!=null && footballQuoteCurrent(r,props?.pricedAt,Date.now(),L.props.liveRevalidateSec*1000)).sort((a,b)=>(b.evCz??-Infinity)-(a.evCz??-Infinity));
 return <section className="mt-3 rounded-xl border border-indigo-300/30 p-3"><h3 className="font-bold text-indigo-200">Top picks by category</h3><div className="mt-2 max-h-72 overflow-y-auto overscroll-contain">{q.isPending ? <p>Loading posted props…</p> : q.isError ? <p>Player props unavailable. Game sides remain in the Model below.</p> : !rows.length ? <p>No current priced player props for this game.</p> : CFB_PROP_MARKETS.map(m=>{const picks=rows.filter(r=>r.market===m.id).slice(0,5);return picks.length ? <div key={m.id} className="mb-3"><h4 className="text-xs font-bold text-violet-300">{m.label}</h4>{picks.map(r=><div key={r.key} className="flex justify-between gap-2 border-b border-white/10 py-2 text-xs"><span>{r.label}</span><span className="shrink-0 text-amber-200">{fmtAmerican(r.cz!.price)} · {r.grade??"—"} · {(r.fair!*100).toFixed(1)}%</span></div>)}</div>:null;})}</div></section>;
}
