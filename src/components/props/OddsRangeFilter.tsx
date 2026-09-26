"use client";
import { useEffect, useState } from "react";
import { OPEN_RANGE, type OddsRange } from "@/lib/odds-range";
function PriceField({value,onChange,label}:{value:number|null;onChange:(v:number|null)=>void;label:string}) {
  const [text,setText]=useState(value==null?"":String(value));
  useEffect(()=>setText(value==null?"":String(value)),[value]);
  const valid = text.trim()==="" || Number.isFinite(Number(text)) && Math.abs(Number(text))>=100;
  return <input aria-label={label} aria-invalid={!valid} inputMode="text" placeholder="Any" value={text} onChange={e=>{const s=e.target.value;setText(s);if(!s.trim())onChange(null);else if(Number.isFinite(Number(s))&&Math.abs(Number(s))>=100)onChange(Number(s));}} onBlur={()=>{if(!valid)setText(value==null?"":String(value));}}/>;
}
export function OddsRangeFilter({value=OPEN_RANGE,onChange}:{value?:OddsRange;onChange:(v:OddsRange)=>void}) {
 return <fieldset className="pick-odds-filter"><legend>Odds per pick</legend><PriceField label="Minimum pick odds" value={value.min} onChange={min=>onChange({...value,min})}/><span>to</span><PriceField label="Maximum pick odds" value={value.max} onChange={max=>onChange({...value,max})}/>{(value.min!=null||value.max!=null)&&<button type="button" aria-label="Clear pick odds" onClick={()=>onChange(OPEN_RANGE)}>Clear</button>}</fieldset>;
}
