'use client';
import {useMemo} from 'react';
import {useSportsbook} from './store';
import {valueAt,bookKey} from './books';
import type {MlbLiveQuoteBoard} from '@/lib/mlb/live-quote-types';
export function priceLiveBoard(data:MlbLiveQuoteBoard|undefined,book:string){
 if(!data||book===(data.settleBook??'williamhill_us'))return data; // overlays from before 2026-09-17 (INSTRUCTION 67) carry no stamp and are Caesars-priced
 return {...data,rows:Object.fromEntries(Object.entries(data.rows).map(([key,q])=>{
  const pair=q.quotes?.[book];const o=pair?.o??(bookKey(q.bsBk)===book?q.bsAm:null);const u=pair?.u??null;
  return [key,{...q,czAm:o,oppAm:u,bsAm:o,bsBk:book,evCz:valueAt(q.pLive,o).ev,evOpp:valueAt(q.pLive==null?null:1-q.pLive,u).ev}];
 }))};
}
export function useLivePrices(data:MlbLiveQuoteBoard|undefined){const book=useSportsbook();return useMemo(()=>priceLiveBoard(data,book),[data,book]);}
