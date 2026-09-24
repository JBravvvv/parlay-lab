import type { CfbFinals } from "@/lib/cfb/types";
import { parseFinalPlayerStats } from "@/lib/football/prop-settlement";
/** Add official final player statistics, with bounded parallel reads and no odds-credit cost. */
export async function attachNflPropFinals(finals:CfbFinals,ids=Object.keys(finals)):Promise<void>{
 const targets=[...new Set(ids)].filter(id=>/^\d+$/.test(id)&&finals[id]?.final);
 for(let i=0;i<targets.length;i+=4)await Promise.all(targets.slice(i,i+4).map(async id=>{
  try{const r=await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${id}`,{next:{revalidate:60},signal:AbortSignal.timeout(7000)});if(r.ok)finals[id].playerStats=parseFinalPlayerStats(await r.json(),id);}catch{/* Missing stats stay pending, never a guessed zero. */}
 }));
}
