/** Verified against MLB /api/v1/situationCodes and teams/stats statSplits. */
export const MLB_SPLITS=[{key:"all",label:"All situations"},{key:"vl",label:"vs LHP / left-handed batters"},{key:"vr",label:"vs RHP / right-handed batters"},{key:"h",label:"At home"},{key:"a",label:"On the road"},{key:"preas",label:"Before All-Star break"},{key:"posas",label:"After All-Star break"},{key:"d",label:"Day games"},{key:"n",label:"Night games"},{key:"g",label:"Grass"},{key:"t",label:"Turf"},{key:"twn",label:"Games won"},{key:"tls",label:"Games lost"}] as const;
export function mlbSplitUrl(scope:"ind"|"team",group:string,season:number,split:string){
 if(!MLB_SPLITS.some(s=>s.key===split)||split==="all")return null;
 return `https://statsapi.mlb.com/api/v1/${scope==="team"?"teams/stats":"stats"}?stats=statSplits&group=${group}&season=${season}&sportId=1&sitCodes=${split}&playerPool=All&limit=2500`;
}
