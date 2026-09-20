import {propLabel} from "@/lib/cfb/props";
import {americanFromProb} from "@/engine2/devig";
import type {LeagueRules} from "@/lib/football/league";
import type {CfbSlate,CfbRow,CfbGame,CfbQuote} from '@/lib/cfb/types';
import type {CfbPropRow,CfbPropQuote} from '@/lib/cfb/props-types';
import {rowProbAt,sideLabel,kellyStake} from '@/lib/cfb/model';
import {gradeFromEv} from '@/lib/grade';
import {valueAt} from './books';
/** the book a server row is already priced at — `displayBook` once repriced, else its settle quote's key; rows from before 2026-09-17 (INSTRUCTION 67) are Caesars-priced */
const pricedAt=(row:{displayBook?:string;cz:{book:string}|null}):string=>row.displayBook??row.cz?.book??'williamhill_us';
function quoteOf<Q extends {book:string}>(row:{quotes?:Record<string,Q>;cz:Q|null;dk:Q|null;fd:Q|null;best:Q|null;pin?:Q|null},book:string):Q|null{
 return row.quotes?.[book]??[row.cz,row.dk,row.fd,row.best,row.pin].find(q=>q?.book===book)??null;
}
export function priceFootballRow(row:CfbRow,game:CfbGame,book:string,bankroll=2500,rules?:LeagueRules):CfbRow {
 if(book===pricedAt(row))return row;
 const q=quoteOf<CfbQuote>(row,book);const p=q?rowProbAt(game.model,row.market,row.side,q.line):null;
 const ev=p&&q?valueAt(p.win,q.price,p.push).ev:null;
 return {...row,displayBook:book,cz:q,evCz:ev,grade:gradeFromEv(ev),kelly:q&&p&&game.status==='upcoming'&&Date.parse(game.start)>Date.now()?kellyStake(p.win,p.push,q.dec,bankroll,rules):0,playable:!!q&&game.status==='upcoming'&&Date.parse(game.start)>Date.now(),
 ...(q&&p?{line:q.line,label:sideLabel(game,row.market,row.side,q.line),fair:p.win,push:p.push,fairAm:americanFromProb(Math.min(.999999,Math.max(.000001,p.win/(1-p.push))))}:{} )};
}
export function priceFootballSlate<T extends CfbSlate|undefined|null>(slate:T,book:string,bankroll=2500,rules?:LeagueRules):T {
 if(!slate)return slate;
 return {...slate,games:slate.games.map(g=>({...g,rows:g.rows.map(r=>priceFootballRow(r,g,book,bankroll,rules))}))} as T;
}
export function priceFootballProp(row:CfbPropRow,book:string,bankroll=2500,rules?:LeagueRules):CfbPropRow {
 const q=quoteOf<CfbPropQuote>(row,book);
 // Old cache records have no line-specific probabilities: only reuse a fair at the SAME line.
 const p=q?(row.probabilities&&Object.hasOwn(row.probabilities,book)?row.probabilities[book]:q.line===row.line?row.fair:null):null;
 const firstTdClosed=row.market==='first_td'&&(row.status!=='upcoming'||Date.parse(row.kickoff)<=Date.now());
 const fair=firstTdClosed?null:p;
 const ev=q?valueAt(fair,q.price).ev:null;
 return {...row,displayBook:book,cz:q,evCz:ev,grade:gradeFromEv(ev),fair,fairAm:fair==null?null:americanFromProb(Math.min(.999999,Math.max(.000001,fair))),line:q?.line??row.line,kelly:q&&fair!=null&&row.status==='upcoming'&&Date.parse(row.kickoff)>Date.now()?kellyStake(fair!,0,q.dec,bankroll,rules):null,
 label:q?propLabel(row.player,row.market,row.side,q.line):row.label,
 playable:!!q&&fair!=null&&row.status==='upcoming'&&Date.parse(row.kickoff)>Date.now()};
}
