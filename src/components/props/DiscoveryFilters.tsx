"use client";
import type { ReactNode } from "react";
import { ALL_MARKETS } from "@/lib/cross-sport";
import { MultiSelect } from "./MultiSelect";
import { GameTimeRange } from "./GameTimeRange";
import { SPORT_OPTIONS, TIMING_OPTIONS, STRATEGIES, type DiscoveryFilter } from "@/lib/discovery";
export function DiscoveryFilters({value,onChange,markets,showSports=true,parlayTypes=false,hideStyles=false,categoryRail,stacked=false,extraControls}:{value:DiscoveryFilter;onChange:(v:DiscoveryFilter)=>void;markets:readonly {key:string;label:string}[];showSports?:boolean;parlayTypes?:boolean;hideStyles?:boolean;categoryRail?:ReactNode;stacked?:boolean;extraControls?:ReactNode}) {
 return <div className={`discovery-filters space-y-1 px-2 py-1 ${stacked?"discovery-stacked":""} ${extraControls?"discovery-board-controls":""}`}><div className="filter-toolbar-title">Customize your picks <span>Open a filter to choose</span></div>{categoryRail}<div className="discovery-layout"><div className="discovery-fields flex flex-wrap gap-1">
 <MultiSelect label="Timing" options={TIMING_OPTIONS} value={value.timing} onChange={timing=>onChange({...value,timing})}/>
 <MultiSelect label="Markets" options={markets} value={value.markets} onChange={markets=>onChange({...value,markets})}/>
 {!hideStyles&&<MultiSelect label={parlayTypes?"Parlay type":"Style"} options={parlayTypes?STRATEGIES.map(s=>({...s,label:s.key==="safe"?"Safe / Safer":s.label})):STRATEGIES} value={value.strategies} onChange={strategies=>onChange({...value,strategies})}/>}
 {showSports&&<MultiSelect label="Sports" options={SPORT_OPTIONS} value={value.sports} onChange={sports=>onChange({...value,sports,markets:markets.every(m=>value.markets.includes(m.key))?ALL_MARKETS.map(m=>m.key):value.markets})}/>}
 </div><div className="discovery-secondary">{extraControls}<GameTimeRange value={value.timeWindow} onChange={timeWindow=>onChange({...value,timeWindow})}/></div></div></div>;
}
