import type { ParkCard, ParkMarkets } from "./ballpark";
export function parkSide(c:ParkCard,side:"R"|"L"|"ALL"):ParkMarkets{
 if(side!=="ALL")return c[side];
 const m={...c.R,index:null};for(const k of ["hr","hits","tb","hrr","runs","k","outs"] as const)m[k]=(c.R[k]+c.L[k])/2;return m;
}
/** Environmental advantage only, never a pick EV grade. Neutral is C. */
export function parkGrade(m:ParkMarkets):"S"|"A"|"B"|"C"|"D"|"F"{const x=(m.hr+m.hits+m.tb+m.hrr)/4;return x>=1.12?"S":x>=1.07?"A":x>=1.025?"B":x>=.975?"C":x>=.93?"D":"F";}
export function parkEvidence(c:ParkCard,m:ParkMarkets):string[]{
 const notes=[`Home-run environment ×${m.hr.toFixed(3)}; hits ×${m.hits.toFixed(3)}, total bases ×${m.tb.toFixed(3)}, H+R+RBI ×${m.hrr.toFixed(3)} versus a neutral park.`];
 notes.push(c.env.roofClosed?"Closed roof: outdoor wind has no modeled effect.":c.env.wind.raw?`${c.env.wind.mph} mph wind ${c.env.wind.dir}${c.env.wind.toward?` toward ${c.env.wind.toward}`:""}; wind factor ×${c.env.terms.wind.toFixed(3)}.`:"Wind has not been posted; no wind advantage is assumed.");
 notes.push(c.env.tempF!=null?`${c.env.tempF}°F; temperature factor ×${c.env.terms.temp.toFixed(3)}.`:"Temperature unavailable; no temperature advantage is assumed.");
 if(c.park)notes.push(`${c.park.elevationFt} ft elevation. Seasonal park factors and daily conditions are already incorporated in the engine; this preview does not apply them twice.`);
 notes.push("Pitch location, pitcher quality and batter matchup are separate from this environmental grade. No pitch-zone or matchup advantage is inferred here.");return notes;
}
