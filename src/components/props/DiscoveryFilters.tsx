"use client";
import { ALL_MARKETS } from "@/lib/cross-sport";
import { MultiSelect } from "./MultiSelect";
import { GameTimeRange } from "./GameTimeRange";
import { SPORT_OPTIONS, TIMING_OPTIONS, STRATEGIES, type DiscoveryFilter } from "@/lib/discovery";
export function DiscoveryFilters({value,onChange,markets,showSports=true,parlayTypes=false}:{value:DiscoveryFilter;onChange:(v:DiscoveryFilter)=>void;markets:readonly {key:string;label:string}[];showSports?:boolean;parlayTypes?:boolean}) {
 return <div className="discovery-filters space-y-1 px-2 py-1"><div className="flex flex-wrap gap-1">
 <MultiSelect label="Timing" options={TIMING_OPTIONS} value={value.timing} onChange={timing=>onChange({...value,timing})}/>
 <MultiSelect label="Markets" options={markets} value={value.markets} onChange={markets=>onChange({...value,markets})}/>
 <MultiSelect label={parlayTypes?"Parlay type":"Style"} options={parlayTypes?STRATEGIES.map(s=>({...s,label:s.key==="safe"?"Safe / Safer":s.label})):STRATEGIES} value={value.strategies} onChange={strategies=>onChange({...value,strategies})}/>
 {showSports&&<MultiSelect label="Sports" options={SPORT_OPTIONS} value={value.sports} onChange={sports=>onChange({...value,sports,markets:markets.every(m=>value.markets.includes(m.key))?ALL_MARKETS.map(m=>m.key):value.markets})}/>}
 </div><GameTimeRange value={value.timeWindow} onChange={timeWindow=>onChange({...value,timeWindow})}/></div>;
}
