import { unstable_cache } from "next/cache";
import { addSleeperFallback, parseImageRoster, type ImageLeague, type ImageTeam } from "@/lib/player-images";
const paths = {mlb:"baseball/mlb",nfl:"football/nfl",cfb:"football/college-football"};
async function json(url: string) {
  const r = await fetch(url, {cache:"no-store",signal:AbortSignal.timeout(5000)});
  if (!r.ok) throw new Error("Image directory unavailable");
  return r.json();
}
/** Cache the small normalized catalog, rather than Sleeper's multi-megabyte raw directory. */
export const imageCatalog = unstable_cache(async (league: ImageLeague, ids: string) => {
  const root = `https://site.api.espn.com/apis/site/v2/sports/${paths[league]}`;
  const directory = await json(`${root}/teams?limit=1000`);
  const teams: ImageTeam[] = (directory.sports?.[0]?.leagues?.[0]?.teams ?? []).flatMap((entry: {team?:{id?:string;abbreviation?:string;displayName?:string;logos?:{href?:string}[];color?:string}}) => {
    const t=entry.team;
    return t?.id && t.abbreviation && (!ids || ids.split(",").includes(t.id)) ? [{id:t.id,abbr:t.abbreviation,name:t.displayName ?? t.abbreviation,logo:t.logos?.[0]?.href ?? null,color:t.color ?? null,rank:null}] : [];
  });
  if (!teams.length || teams.length > 32) throw new Error("No matching image roster");
  const players = [];
  for (let i=0;i<teams.length;i+=8) {
    const batch = await Promise.all(teams.slice(i,i+8).map(async team=>parseImageRoster(await json(`${root}/teams/${team.id}/roster`),team,league)));
    players.push(...batch.flat());
  }
  if (league === "nfl") {
    try { return addSleeperFallback(players, await json("https://api.sleeper.app/v1/players/nfl")); }
    catch { /* ESPN portraits remain usable if Sleeper is unavailable. */ }
  }
  return players;
},["roster-lab-player-imagery-v1"],{revalidate:3600});
