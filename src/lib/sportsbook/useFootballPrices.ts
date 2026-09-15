'use client';
import type {LeagueRules} from '@/lib/football/league';
import {useMemo} from 'react';
import {useSportsbook} from './store';
import {priceFootballSlate,priceFootballProp} from './football';
import type {CfbSlate} from '@/lib/cfb/types';
import type {CfbPropsBoard} from '@/lib/cfb/props-types';
export function useFootballPrices<T extends CfbSlate|undefined|null>(slate:T,bankroll=2500,rules?:LeagueRules):T{const book=useSportsbook();return useMemo(()=>priceFootballSlate(slate,book,bankroll,rules),[slate,book,bankroll,rules]);}
export function useFootballPropsPrices<T extends CfbPropsBoard|undefined>(data:T,bankroll=2500,rules?:LeagueRules):T{const book=useSportsbook();return useMemo(()=>data?{...data,rows:data.rows.map(r=>priceFootballProp(r,book,bankroll,rules))} as T:data,[data,book,bankroll,rules]);}
