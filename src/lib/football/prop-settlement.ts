import { imageNameKey } from "@/lib/player-images";
export const PAPER_PROP_STATS:Readonly<Record<string,string>>={pass_yds:"passingYards",pass_tds:"passingTouchdowns",rush_yds:"rushingYards",receptions:"receptions",rec_yds:"receivingYards"};
export type FinalPlayerStats=Record<string,Record<string,number>>;
/** Only explicitly posted, numeric final stat cells count; absent athletes are never zero. */
export function parseFinalPlayerStats(data:unknown,gameId:string):FinalPlayerStats {
 type Athlete={athlete?:{displayName?:string};stats?:unknown[]};
 type Group={keys?:string[];athletes?:Athlete[]};
 type Team={team?:{id?:string};statistics?:Group[]};
 const d=data as {header?:{id?:string;competitions?:Array<{status?:{type?:{completed?:boolean}}}>};boxscore?:{players?:Team[]}};
 if(String(d?.header?.id)!==gameId || !d.header?.competitions?.[0]?.status?.type?.completed)return {};
 const out:FinalPlayerStats={};
 for(const team of d.boxscore?.players??[])for(const group of team.statistics??[])for(const athlete of group.athletes??[]){
  const name=athlete.athlete?.displayName;if(!name||!team.team?.id)continue;
  const key=`${team.team.id}|${imageNameKey(name)}`;
  for(const stat of Object.values(PAPER_PROP_STATS)){
   const i=group.keys?.indexOf(stat)??-1;const raw=i<0?null:athlete.stats?.[i];
   if((typeof raw!=="number" && typeof raw!=="string")||String(raw).trim()===""||!Number.isFinite(Number(raw)))continue;
   (out[key]??={})[stat]=Number(raw);
  }
 }
 return out;
}
